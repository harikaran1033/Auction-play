import type { Server, Namespace } from "socket.io";
import {
  ensure,
  memberFor,
  type Room,
  type User,
  type ClientEvents,
  type ServerEvents,
  type TradeServerEvents,
} from "@cricket/shared";
export function attachTradeNotifications(
  io: Server<ClientEvents, ServerEvents>,
  dependencies: {
    authenticate: (token: string) => Promise<User>;
    findRoom: (id: string) => Promise<Room>;
  },
) {
  const namespace = io.of("/trades") as unknown as Namespace<
    Record<string, never>,
    TradeServerEvents
  >;
  namespace.use(async (socket, next) => {
    try {
      const { token, roomId } = socket.handshake.auth;
      ensure(
        typeof token === "string" &&
          typeof roomId === "string" &&
          roomId.length <= 128,
        "FORBIDDEN",
        "Room membership required.",
      );
      const user = await dependencies.authenticate(token),
        room = await dependencies.findRoom(roomId);
      const member = memberFor(room, user.id);
      ensure(
        room.status !== "cancelled" &&
          (room.status === "completed" || !member.left),
        "FORBIDDEN",
        "Rejoin this room to view trades.",
      );
      socket.data.userId = user.id;
      socket.data.roomId = room.id;
      next();
    } catch (error) {
      next(
        new Error(
          error instanceof Error
            ? error.message
            : "Trade updates are unavailable.",
        ),
      );
    }
  });
  namespace.on("connection", (socket) => {
    void socket.join(socket.data.roomId);
  });
  return {
    changed(room: Room) {
      namespace.to(room.id).emit("changed");
    },
    prune(room: Room) {
      for (const socket of namespace.sockets.values())
        if (socket.data.roomId === room.id) {
          const member = room.members.find(
            (member) => member.userId === socket.data.userId,
          );
          if (
            !member ||
            member.blocked ||
            room.blocks.includes(member.userId) ||
            room.status === "cancelled" ||
            (room.status !== "completed" && member.left)
          ) {
            socket.emit(
              "accessEnded",
              "You no longer have access to this room's trades.",
            );
            socket.disconnect(true);
          }
        }
    },
  };
}
