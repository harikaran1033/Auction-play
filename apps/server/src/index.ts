import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import pino from "pino";
import { z } from "zod";
import {
  type User,
  type Room,
  type ClientEvents,
  type ServerEvents,
  RuleError,
  ensure,
  commandSchema,
  settingsSchema,
  memberFor,
  publicRoom,
  roomPath,
  tradeProposalSchema,
  tradeResponseSchema,
  type TradeState,
} from "@cricket/shared";
import { authMode, authenticate, initAuth, localAuth } from "./auth.js";
import { createRepository, PgRepository } from "./storage.js";
import { seedCatalog } from "./data/seedCatalog.js";
import { writeCatalog } from "./data/catalog.js";
import {
  checkJoin,
  joinRoom,
  makeRoom,
  ownedRooms,
  removeOwnedRoom,
} from "./rooms.js";
import { applyCommand, tickRoom } from "./auction/engine.js";
import { updateLineup } from "./auction/lineup.js";
import { proposeTrade, respondTrade } from "./auction/trades.js";
import { attachTradeNotifications } from "./tradeNotifications.js";
import { attachVoice, assertVoiceMember, voiceIceServers } from "./voice.js";

const log = pino({ level: process.env.LOG_LEVEL ?? "info" });
log.info("Loading AuctionPlay");
const catalog = await writeCatalog();
const repository = await createRepository();
if (repository instanceof PgRepository)
  await seedCatalog(repository.pool, catalog.datasets);
await initAuth();
const dataset = (id: string) => {
  const d = catalog.datasets.find((d) => d.id === id);
  ensure(d, "DATASET", "Dataset not found");
  return d;
};
const origins = (
  process.env.CORS_ORIGINS ??
  "http://127.0.0.1:5173,http://localhost:5173,http://localhost,capacitor://localhost"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: origins }));
app.use(express.json({ limit: "32kb" }));
app.use("/api", rateLimit({ windowMs: 60000, limit: 120 }));
const authLimiter = rateLimit({ windowMs: 60000, limit: 12 });
const admissionLimiter = rateLimit({ windowMs: 60000, limit: 40 });
const http = createServer(app);
const io = new Server<ClientEvents, ServerEvents>(http, {
  cors: { origin: origins },
  maxHttpBufferSize: 32768,
  allowRequest: (req, callback) =>
    callback(null, !req.headers.origin || origins.includes(req.headers.origin)),
});
const user = async (req: express.Request) =>
  authenticate(req.headers.authorization?.replace(/^Bearer /, ""));
const findRoom = async (id: string) => {
  const room = await repository.get(id);
  ensure(room, "NOT_FOUND", "Room not found");
  return room;
};
const problem = (e: unknown) =>
  e instanceof RuleError
    ? { code: e.code, message: e.message }
    : e instanceof z.ZodError
      ? {
          code: "VALIDATION",
          message: e.issues
            .map((x) => `${x.path.join(".")}: ${x.message}`)
            .join("; "),
        }
      : {
          code: "SERVER_ERROR",
          message: "The server could not save this action. Please retry.",
        };
function emitRoom(room: Room) {
  tradeNotifications.prune(room);
  io.to(room.id).emit("snapshot", publicRoom(room));
}
const tradeNotifications = attachTradeNotifications(io, {
  findRoom,
  authenticate,
});
function tradeState(room: Room, userId: string): TradeState {
  const member = memberFor(room, userId);
  ensure(
    room.status !== "cancelled" &&
      (room.status === "completed" || !member.left),
    "FORBIDDEN",
    "Rejoin this room to view trades.",
  );
  return {
    room: publicRoom(room),
    offers: (room.trades ?? [])
      .filter(
        (offer) =>
          offer.fromMemberId === member.id || offer.toMemberId === member.id,
      )
      .map((offer) =>
        offer.status === "pending" && offer.expiresAt <= Date.now()
          ? { ...offer, status: "expired" }
          : offer,
      ),
  };
}
app.get("/api/rooms/:id/trades", async (req, res) => {
  const owner = await user(req);
  res.json(
    tradeState(
      await findRoom(z.string().uuid().parse(req.params.id)),
      owner.id,
    ),
  );
});
const tradeLimiter = rateLimit({ windowMs: 60000, limit: 40 });
app.post("/api/rooms/:id/trades", tradeLimiter, async (req, res) => {
  const owner = await user(req),
    input = tradeProposalSchema.parse(req.body);
  const room = await repository.mutate(
    z.string().uuid().parse(req.params.id),
    (room) => {
      proposeTrade(room, dataset(room.settings.datasetId), owner.id, input);
    },
  );
  emitRoom(room);
  tradeNotifications.changed(room);
  res.json(tradeState(room, owner.id));
});
app.post(
  "/api/rooms/:id/trades/:tradeId/respond",
  tradeLimiter,
  async (req, res) => {
    const owner = await user(req),
      input = tradeResponseSchema.parse(req.body),
      offerId = z.string().uuid().parse(req.params.tradeId);
    const room = await repository.mutate(
      z.string().uuid().parse(req.params.id),
      (room) => {
        respondTrade(
          room,
          dataset(room.settings.datasetId),
          owner.id,
          offerId,
          input.action,
          input.sessionId,
        );
      },
    );
    emitRoom(room);
    tradeNotifications.changed(room);
    res.json(tradeState(room, owner.id));
  },
);
const livekit =
  process.env.LIVEKIT_URL &&
  process.env.LIVEKIT_API_KEY &&
  process.env.LIVEKIT_API_SECRET
    ? new RoomServiceClient(
        process.env.LIVEKIT_URL.replace("wss:", "https:"),
        process.env.LIVEKIT_API_KEY,
        process.env.LIVEKIT_API_SECRET,
      )
    : undefined;
const iceServers = voiceIceServers();
const browserVoice = attachVoice(io, { findRoom, authenticate });
async function removeVoice(roomId: string, userId?: string) {
  browserVoice.remove(roomId, userId);
  if (!livekit) return;
  try {
    if (userId) await livekit.removeParticipant(roomId, userId);
    else await livekit.deleteRoom(roomId);
  } catch (e) {
    log.warn({ err: e }, "Voice cleanup failed");
  }
}
app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    authMode,
    storage: process.env.DATABASE_URL ? "postgres" : "local-development",
    voice: true,
    voiceProvider: livekit ? "livekit" : "webrtc",
    serverTime: Date.now(),
  }),
);
app.get("/api/leagues", (_req, res) =>
  res.json(
    catalog.datasets.map(({ players, ...d }) => ({
      ...d,
      playerCount: players.length,
    })),
  ),
);
app.get("/api/leagues/:id", (req, res) => res.json(dataset(req.params.id)));
app.post("/api/auth", authLimiter, async (req, res) => {
  const input = z
    .object({
      email: z.string().email(),
      password: z.string().min(1).max(128),
      name: z.string().trim().min(1).max(40).optional(),
      register: z.boolean().optional(),
    })
    .parse(req.body);
  res.json(await localAuth(input));
});
app.get("/api/me", async (req, res) => res.json(await user(req)));
app.get("/api/me/rooms", async (req, res) => {
  const owner = await user(req);
  res.json(ownedRooms(await repository.all(), owner.id));
});
app.delete("/api/me/rooms/:id", admissionLimiter, async (req, res) => {
  const owner = await user(req);
  const input = z
    .object({ endForEveryone: z.boolean().default(false) })
    .parse(req.body ?? {});
  const room = await repository.mutate(
    z.string().uuid().parse(req.params.id),
    (room) => {
      removeOwnedRoom(room, owner.id, input.endForEveryone);
    },
  );
  for (const socket of io.sockets.sockets.values()) {
    if (
      socket.rooms.has(room.id) &&
      (input.endForEveryone || socket.data.user?.id === owner.id)
    ) {
      socket.emit(
        "revoked",
        input.endForEveryone
          ? "The host ended this auction."
          : "You removed this auction from My rooms.",
      );
      await socket.leave(room.id);
    }
  }
  await removeVoice(room.id, input.endForEveryone ? undefined : owner.id);
  emitRoom(room);
  tradeNotifications.changed(room);
  res.json({ ok: true });
});
app.get("/api/rooms", async (req, res) => {
  const query = String(req.query.search ?? "").toLowerCase();
  const league = String(req.query.league ?? "");
  const page = Math.max(1, Number(req.query.page) || 1);
  const rooms = (await repository.all()).filter(
    (r) =>
      r.settings.visibility === "public" &&
      r.status === "lobby" &&
      r.settings.name.toLowerCase().includes(query) &&
      (!league || r.settings.datasetId === league),
  );
  res.json({
    total: rooms.length,
    page,
    rooms: rooms.slice((page - 1) * 12, page * 12).map((r) => ({
      id: r.id,
      code: r.code,
      name: r.settings.name,
      datasetId: r.settings.datasetId,
      members: r.members.length,
      maxTeams: r.settings.maxTeams,
      budget: r.settings.budget,
      squadSize: r.settings.squadSize,
      currency: r.settings.currency ?? "credits",
      passwordRequired: !!r.passwordHash,
    })),
  });
});
app.post("/api/rooms", authLimiter, async (req, res) => {
  const owner = await user(req);
  const settings = settingsSchema.parse(req.body);
  let room = makeRoom(owner, dataset(settings.datasetId), settings);
  for (let attempt = 0; attempt < 5; attempt++) {
    if ((await repository.all()).some((r) => r.code === room.code)) {
      room = makeRoom(owner, dataset(settings.datasetId), settings);
      continue;
    }
    await repository.create(room);
    res.status(201).json(publicRoom(room));
    return;
  }
  throw new RuleError(
    "CODE_COLLISION",
    "Could not allocate an invite. Try again.",
  );
});
app.get("/api/rooms/:id", async (req, res) => {
  const owner = await user(req);
  const room = await findRoom(req.params.id);
  memberFor(room, owner.id);
  res.json(publicRoom(room));
});
app.post("/api/invites/resolve", admissionLimiter, async (req, res) => {
  const owner = await user(req);
  const input = z
    .object({
      code: z.string().trim().min(1).max(20),
      password: z.string().max(128).default(""),
    })
    .parse(req.body);
  const room = (await repository.all()).find(
    (r) => r.code === input.code.toUpperCase(),
  );
  ensure(room, "NOT_FOUND", "Invitation code not found");
  const existing = checkJoin(room, owner, input.password);
  res.json({
    id: room.id,
    name: room.settings.name,
    settings: room.settings,
    takenTeams: room.members.filter((m) => !m.blocked).map((m) => m.teamId),
    rejoinPath: existing ? roomPath(room) : undefined,
  });
});
app.post("/api/rooms/:id/join", admissionLimiter, async (req, res) => {
  const owner = await user(req);
  const input = z
    .object({ teamId: z.string(), password: z.string().max(128).default("") })
    .parse(req.body);
  const room = await repository.mutate(String(req.params.id), (r) =>
    joinRoom(
      r,
      owner,
      dataset(r.settings.datasetId),
      input.teamId,
      input.password,
    ),
  );
  emitRoom(room);
  res.json(publicRoom(room));
});
app.get("/api/rooms/:id/chat", async (req, res) => {
  const owner = await user(req);
  const room = await findRoom(req.params.id);
  memberFor(room, owner.id);
  const before = Number(req.query.before) || Infinity;
  const messages = room.chat.filter((m) => m.at < before).slice(-50);
  res.json({
    messages,
    hasMore: room.chat.some((m) => m.at < (messages[0]?.at ?? 0)),
  });
});
app.get("/api/squads", async (req, res) => {
  const owner = await user(req);
  res.json(
    (await repository.all())
      .filter((r) => r.status === "completed")
      .flatMap((r) =>
        r.members
          .filter((m) => m.userId === owner.id)
          .map((m) => ({
            roomId: r.id,
            roomName: r.settings.name,
            datasetId: r.settings.datasetId,
            currency: r.settings.currency ?? "credits",
            member: m,
          })),
      ),
  );
});
app.get("/api/squads/:id", async (req, res) => {
  const owner = await user(req);
  const room = await findRoom(String(req.params.id));
  ensure(
    room.status === "completed",
    "INVALID_STATE",
    "Complete the auction to manage your squad",
  );
  const member = structuredClone(
    room.members.find((m) => m.userId === owner.id),
  );
  ensure(member, "FORBIDDEN", "You do not own a squad in this room");
  delete member.sessionId;
  res.json({
    member,
    datasetId: room.settings.datasetId,
    currency: room.settings.currency ?? "credits",
    roomName: room.settings.name,
  });
});
app.put("/api/squads/:id/lineup", async (req, res) => {
  const owner = await user(req);
  const input = z
    .object({
      players: z.array(z.string()).max(11),
      captain: z.string(),
      viceCaptain: z.string().default(""),
    })
    .parse(req.body);
  const room = await repository.mutate(String(req.params.id), (r) => {
    ensure(
      r.status === "completed",
      "INVALID_STATE",
      "Complete the auction before saving a lineup",
    );
    const member = r.members.find((m) => m.userId === owner.id);
    ensure(member, "FORBIDDEN", "You do not own this squad");
    updateLineup(member, input);
    r.version++;
  });
  emitRoom(room);
  res.json({ ok: true });
});
app.post("/api/rooms/:id/voice", async (req, res) => {
  const owner = await user(req);
  const room = await findRoom(req.params.id);
  assertVoiceMember(room, owner.id, req.body.sessionId);
  if (!livekit) {
    res.json({ mode: "webrtc", iceServers });
    return;
  }
  const token = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    { identity: owner.id, name: owner.name, ttl: "5m" },
  );
  token.addGrant({
    roomJoin: true,
    room: room.id,
    canPublish: true,
    canPublishSources: [2],
    canSubscribe: true,
  });
  res.json({
    mode: "livekit",
    url: process.env.LIVEKIT_URL,
    token: await token.toJwt(),
  });
});
app.patch("/api/rooms/:id/voice", async (req, res) => {
  const owner = await user(req);
  const input = z
    .object({ enabled: z.boolean(), sessionId: z.string().min(1) })
    .parse(req.body);
  const room = await repository.mutate(req.params.id, (room) => {
    const member = memberFor(room, owner.id);
    ensure(
      room.hostId === owner.id,
      "HOST_REQUIRED",
      "Only the host can enable room voice.",
    );
    ensure(
      member.sessionId === input.sessionId &&
        member.connected &&
        !member.left &&
        !["completed", "cancelled"].includes(room.status),
      "FORBIDDEN",
      "Active host session required.",
    );
    room.settings.voice = input.enabled;
    room.version++;
  });
  if (!input.enabled) await removeVoice(room.id);
  emitRoom(room);
  res.json({ ok: true });
});
app.post("/api/rooms/:id/voice/remove", async (req, res) => {
  const owner = await user(req);
  const room = await findRoom(req.params.id);
  ensure(
    room.hostId === owner.id,
    "HOST_REQUIRED",
    "Only the host can moderate voice",
  );
  const moderator = memberFor(room, owner.id);
  ensure(
    moderator.connected &&
      !moderator.left &&
      req.body.sessionId === moderator.sessionId,
    "SESSION_REPLACED",
    "Use the active host tab to moderate voice.",
  );
  const target = memberFor(room, String(req.body.userId));
  ensure(
    target.userId !== owner.id,
    "INVALID_MEMBER",
    "Use leave voice to disconnect yourself",
  );
  await removeVoice(room.id, target.userId);
  res.json({ ok: true });
});

io.use(async (socket, next) => {
  try {
    socket.data.user = await authenticate(socket.handshake.auth.token);
    next();
  } catch {
    next(new Error("Session expired. Sign in again."));
  }
});
io.on("connection", (socket) => {
  const owner = socket.data.user as User;
  let watched: string | undefined;
  let commandCount = 0;
  let windowStart = Date.now();
  socket.on("watch", async (input, ack) => {
    try {
      await authenticate(socket.handshake.auth.token);
      ensure(
        typeof input?.roomId === "string",
        "VALIDATION",
        "Room ID required",
      );
      const room = await repository.mutate(input.roomId, (r) => {
        const m = memberFor(r, owner.id);
        ensure(r.status !== "cancelled", "ROOM_CLOSED", "Room was cancelled");
        m.sessionId = socket.id;
        m.connected = true;
        m.graceExpired = false;
        m.left = false;
        m.archived = false;
        delete m.disconnectedAt;
        const previousHost = r.members.find((x) => x.userId === r.hostId);
        if (
          previousHost &&
          !previousHost.connected &&
          previousHost.graceExpired
        ) {
          const successor = r.members
            .filter((x) => x.connected && !x.blocked && !x.left)
            .sort((a, b) => a.joinedAt - b.joinedAt)[0];
          if (successor) r.hostId = successor.userId;
        }
        r.version++;
      });
      if (watched && watched !== room.id) await socket.leave(watched);
      watched = room.id;
      for (const [, other] of io.sockets.sockets)
        if (
          other.id !== socket.id &&
          other.data.user?.id === owner.id &&
          other.rooms.has(room.id)
        ) {
          other.emit("takeover");
          await other.leave(room.id);
          await removeVoice(room.id, owner.id);
        }
      await socket.join(room.id);
      emitRoom(room);
      ack({ ok: true, data: publicRoom(room) });
    } catch (e) {
      ack({ ok: false, error: problem(e) });
    }
  });
  socket.on("command", async (input, ack) => {
    try {
      if (Date.now() - windowStart > 10000) {
        windowStart = Date.now();
        commandCount = 0;
      }
      ensure(
        ++commandCount <= 30,
        "RATE_LIMIT",
        "Too many actions. Wait a moment.",
      );
      const verified = await authenticate(socket.handshake.auth.token);
      ensure(verified.id === owner.id, "UNAUTHENTICATED", "Session changed");
      const command = commandSchema.parse(input);
      const previous = await findRoom(command.roomId);
      const room = await repository.mutate(command.roomId, (r) => {
        applyCommand(
          r,
          dataset(r.settings.datasetId),
          owner,
          socket.id,
          command,
        );
      });
      for (const old of previous.members) {
        const current = room.members.find((m) => m.id === old.id);
        if (!current || current.blocked || current.left) {
          for (const [, other] of io.sockets.sockets)
            if (
              other.data.user?.id === old.userId &&
              other.rooms.has(room.id)
            ) {
              other.emit(
                "revoked",
                current?.blocked
                  ? "The host removed you from this room."
                  : "You left this room.",
              );
              await other.leave(room.id);
            }
          await removeVoice(room.id, old.userId);
        }
      }
      if (
        ["completed", "cancelled"].includes(room.status) ||
        !room.settings.voice
      )
        await removeVoice(room.id);
      emitRoom(room);
      ack({ ok: true, data: publicRoom(room) });
    } catch (e) {
      log.debug({ err: e }, "Command rejected");
      ack({ ok: false, error: problem(e) });
      if (input?.roomId) {
        const room = await repository.get(input.roomId);
        if (
          room &&
          room.members.some((m) => m.userId === owner.id && !m.blocked) &&
          !room.blocks.includes(owner.id)
        )
          socket.emit("snapshot", publicRoom(room));
      }
    }
  });
  socket.on("disconnect", async () => {
    browserVoice.removeSession(socket.id);
    if (!watched) return;
    try {
      const room = await repository.mutate(watched, (r) => {
        const m = r.members.find(
          (m) => m.userId === owner.id && m.sessionId === socket.id,
        );
        if (m) {
          m.connected = false;
          m.graceExpired = false;
          m.ready = false;
          m.disconnectedAt = Date.now();
          delete m.sessionId;
          r.version++;
        }
      });
      emitRoom(room);
    } catch (e) {
      log.warn({ err: e }, "Disconnect persistence failed");
    }
  });
});
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const error = problem(err);
    if (error.code === "SERVER_ERROR")
      log.error({ err }, "HTTP operation failed");
    res
      .status(
        error.code === "UNAUTHENTICATED"
          ? 401
          : error.code === "FORBIDDEN" || error.code === "BLOCKED"
            ? 403
            : error.code === "NOT_FOUND"
              ? 404
              : 400,
      )
      .json({ error });
  },
);
// Recovery policy: accepted highest bids remain binding. Expired lots resolve once under the persisted lock.
const recoveryRooms = await repository.all();
log.info(
  {
    rooms: recoveryRooms.filter(
      (r) => !["completed", "cancelled"].includes(r.status),
    ).length,
  },
  "Recovering saved auctions",
);
for (const room of recoveryRooms) {
  if (["completed", "cancelled"].includes(room.status)) continue;
  await repository.mutate(room.id, (r) => {
    for (const m of r.members) {
      if (m.connected) {
        m.connected = false;
        m.ready = false;
        m.disconnectedAt = Date.now();
      }
      delete m.sessionId;
    }
    tickRoom(r, dataset(r.settings.datasetId), Date.now());
    r.version++;
  });
}
let ticking = false;
const timer = setInterval(async () => {
  if (ticking) return;
  ticking = true;
  try {
    for (const before of await repository.all()) {
      if (["completed", "cancelled"].includes(before.status)) continue;
      const now = Date.now();
      const due =
        (before.status === "running" &&
          before.lot &&
          before.lot.endsAt <= now) ||
        (before.status === "reveal" &&
          before.lot?.revealEndsAt &&
          before.lot.revealEndsAt <= now) ||
        before.members.some(
          (m) =>
            !m.connected &&
            !m.graceExpired &&
            m.disconnectedAt &&
            now - m.disconnectedAt >= 120000,
        );
      if (!due) continue;
      const room = await repository.mutate(before.id, (r) => {
        tickRoom(r, dataset(r.settings.datasetId), Date.now());
      });
      emitRoom(room);
      if (room.status === "completed") await removeVoice(room.id);
    }
  } catch (e) {
    log.error({ err: e }, "Scheduler failed; persisted state retained");
  } finally {
    ticking = false;
  }
}, 250);
const port = Number(process.env.PORT ?? 3001);
http.listen(port, process.env.HOST ?? "127.0.0.1", () =>
  log.info(
    {
      port,
      authMode,
      players: catalog.datasets.reduce((n, d) => n + d.players.length, 0),
    },
    "AuctionPlay ready",
  ),
);
process.on("SIGTERM", () => {
  clearInterval(timer);
  io.close();
  http.close(() => process.exit(0));
});
