import { z } from "zod";
import type { Namespace, Server } from "socket.io";
import {
  ensure,
  memberFor,
  type Room,
  type User,
  type ClientEvents,
  type ServerEvents,
  type VoiceClientEvents,
  type VoiceServerEvents,
  type VoicePeer,
  type VoiceIceServer,
} from "@cricket/shared";

export function assertVoiceMember(
  room: Room,
  userId: string,
  sessionId: unknown,
) {
  const member = memberFor(room, userId);
  ensure(
    room.settings.voice,
    "VOICE_DISABLED",
    "The host has disabled voice for this room.",
  );
  ensure(
    !["completed", "cancelled"].includes(room.status) &&
      member.connected &&
      !member.left &&
      !member.blocked,
    "FORBIDDEN",
    "Active room membership required for voice.",
  );
  ensure(
    typeof sessionId === "string" && sessionId === member.sessionId,
    "SESSION_REPLACED",
    "Rejoin the auction in this tab before joining voice.",
  );
  return member;
}
export function voiceIceServers(
  raw = process.env.VOICE_ICE_SERVERS,
): VoiceIceServer[] {
  if (!raw?.trim()) return [{ urls: "stun:stun.l.google.com:19302" }];
  return z
    .array(
      z.object({
        urls: z.union([
          z.string().regex(/^turns?:|^stuns?:/),
          z.array(z.string().regex(/^turns?:|^stuns?:/)).min(1),
        ]),
        username: z.string().optional(),
        credential: z.string().optional(),
      }),
    )
    .max(8)
    .parse(JSON.parse(raw));
}
const signalSchema = z.object({
  to: z.string().min(1).max(128),
  signal: z.union([
    z.object({
      description: z.object({
        type: z.enum(["offer", "answer"]),
        sdp: z
          .string()
          .max(24000)
          .refine(
            (value) => !/(?:^|\r?\n)m=(?:video|application)\s/.test(value),
            "Audio only",
          ),
      }),
    }),
    z.object({
      candidate: z.object({
        candidate: z.string().max(4096),
        sdpMid: z.string().max(128).nullable().optional(),
        sdpMLineIndex: z.number().int().min(0).max(100).nullable().optional(),
        usernameFragment: z.string().max(256).nullable().optional(),
      }),
    }),
  ]),
});
export function attachVoice(
  io: Server<ClientEvents, ServerEvents>,
  dependencies: {
    findRoom: (id: string) => Promise<Room>;
    authenticate: (token: string) => Promise<User>;
  },
) {
  const namespace = io.of("/voice") as unknown as Namespace<
    VoiceClientEvents,
    VoiceServerEvents
  >;
  const members = new Map<
    string,
    VoicePeer & { roomId: string; sessionId: string }
  >();
  const roster = (roomId: string) =>
    [...members.values()]
      .filter((peer) => peer.roomId === roomId)
      .map(({ id, userId, name, muted }) => ({ id, userId, name, muted }));
  const publish = (roomId: string) =>
    namespace.to(roomId).emit("voice:roster", roster(roomId));
  const activeSession = (sessionId: string, roomId: string, userId: string) => {
    const socket = io.sockets.sockets.get(sessionId);
    return (
      !!socket?.connected &&
      socket.rooms.has(roomId) &&
      socket.data.user?.id === userId
    );
  };
  namespace.use(async (socket, next) => {
    try {
      const input = z
        .object({
          token: z.string().min(1),
          roomId: z.string().min(1).max(128),
          sessionId: z.string().min(1).max(128),
        })
        .parse(socket.handshake.auth);
      const user = await dependencies.authenticate(input.token);
      const room = await dependencies.findRoom(input.roomId);
      assertVoiceMember(room, user.id, input.sessionId);
      ensure(
        activeSession(input.sessionId, room.id, user.id),
        "FORBIDDEN",
        "Connect to the auction before joining voice.",
      );
      socket.data.voice = { user, roomId: room.id, sessionId: input.sessionId };
      next();
    } catch (error) {
      next(
        new Error(
          error instanceof Error ? error.message : "Voice access denied.",
        ),
      );
    }
  });
  const remove = (
    roomId: string,
    userId?: string,
    reason = "Voice was disconnected by the host.",
    retry = false,
  ) => {
    for (const [id, peer] of members) {
      if (peer.roomId !== roomId || (userId && peer.userId !== userId))
        continue;
      members.delete(id);
      const socket = namespace.sockets.get(id);
      socket?.emit("voice:ended", { reason, retry });
      socket?.disconnect(true);
    }
    publish(roomId);
  };
  namespace.on("connection", (socket) => {
    const { user, roomId, sessionId } = socket.data.voice as {
      user: User;
      roomId: string;
      sessionId: string;
    };
    if (!activeSession(sessionId, roomId, user.id)) {
      socket.disconnect(true);
      return;
    }
    remove(roomId, user.id, "Voice moved to your newer connection.");
    members.set(socket.id, {
      id: socket.id,
      userId: user.id,
      name: user.name,
      muted: true,
      roomId,
      sessionId,
    });
    void socket.join(roomId);
    publish(roomId);
    let count = 0,
      start = Date.now();
    const allowed = () => {
      if (Date.now() - start > 10000) {
        count = 0;
        start = Date.now();
      }
      return (
        members.has(socket.id) &&
        ++count <= 240 &&
        activeSession(sessionId, roomId, user.id)
      );
    };
    socket.on("voice:sync", (ack) => {
      if (allowed() && typeof ack === "function") ack(roster(roomId));
    });
    socket.on("voice:signal", (input) => {
      if (!allowed()) return;
      const parsed = signalSchema.safeParse(input);
      if (!parsed.success) return;
      const target = members.get(parsed.data.to);
      if (
        !target ||
        target.id === socket.id ||
        target.roomId !== roomId ||
        !activeSession(target.sessionId, roomId, target.userId)
      )
        return;
      namespace
        .to(target.id)
        .emit("voice:signal", { from: socket.id, signal: parsed.data.signal });
    });
    socket.on("voice:mute", (muted) => {
      if (!allowed() || typeof muted !== "boolean") return;
      const peer = members.get(socket.id);
      if (peer) {
        peer.muted = muted;
        publish(roomId);
      }
    });
    socket.on("disconnect", () => {
      members.delete(socket.id);
      publish(roomId);
    });
  });
  return {
    remove,
    removeSession(sessionId: string) {
      for (const peer of [...members.values()])
        if (peer.sessionId === sessionId)
          remove(
            peer.roomId,
            peer.userId,
            "Auction connection lost. Reconnect to rejoin voice.",
            true,
          );
    },
  };
}
