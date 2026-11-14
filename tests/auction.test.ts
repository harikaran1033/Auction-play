import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Room,
  type Dataset,
  type Command,
  settingsSchema,
  isForeign,
  ineligible,
} from "@cricket/shared";
import {
  applyCommand,
  resolveLot,
  tickRoom,
} from "../apps/server/src/auction/engine.js";
import { makeRoom, joinRoom } from "../apps/server/src/rooms.js";
import { FileRepository } from "../apps/server/src/storage.js";
const owner = { id: randomUUID(), name: "Host" };
const guest = { id: randomUUID(), name: "Guest" };
const other = { id: randomUUID(), name: "Third" };
const dataset: Dataset = {
  id: "test",
  league: "Test",
  name: "Test fixture",
  source: "unit test",
  fixture: true,
  domesticNations: ["England", "Wales"],
  unit: "credits",
  scale: 100,
  teams: [
    { id: "a", name: "A", shortName: "A", color: "#123456" },
    { id: "b", name: "B", shortName: "B", color: "#abcdef" },
    { id: "c", name: "C", shortName: "C", color: "#ffffff" },
  ],
  players: [
    {
      id: "p1",
      name: "One",
      nation: "England",
      role: "batter",
      basePrice: 100,
      stats: {},
    },
    {
      id: "p2",
      name: "Two",
      nation: "India",
      role: "bowler",
      basePrice: 200,
      stats: {},
    },
  ],
};
let room: Room;
const now = 1000000;
function command(
  type: Command["type"],
  user = owner,
  payload: Command["payload"] = {},
  extra: Partial<Command> = {},
) {
  const c = {
    requestId: randomUUID(),
    roomId: room.id,
    lotId: room.lot?.id,
    expectedVersion: room.version,
    type,
    payload,
    ...extra,
  };
  applyCommand(room, dataset, user, user.id, c, now);
  return c;
}
function start() {
  room.members.forEach((m) => (m.ready = true));
  command("start");
}
beforeEach(() => {
  room = makeRoom(
    owner,
    dataset,
    settingsSchema.parse({
      name: "Test room",
      auctionOrder: "source",
      datasetId: "test",
      teamId: "a",
      budget: 1000,
      maxTeams: 2,
      squadSize: 2,
      overseasCap: 1,
      reserveBudget: false,
    }),
  );
  joinRoom(room, guest, dataset, "b", "");
  room.members.forEach((m) => {
    m.connected = true;
    m.sessionId = m.userId;
  });
});
describe("authoritative auction rules", () => {
  it("starts only when everyone is ready", () => {
    expect(() => command("start")).toThrow("ready");
    start();
    expect(room.status).toBe("running");
  });
  it("calculates opening and subsequent bids on the server", () => {
    start();
    command("bid");
    expect(room.lot!.bid).toBe(100);
    command("bid", guest);
    expect(room.lot!.bid).toBe(110);
  });
  it("prevents self outbidding", () => {
    start();
    command("bid");
    expect(() => command("bid")).toThrow("highest bid");
  });
  it("rejects bids exactly at and after deadline", () => {
    start();
    const c: Command = {
      requestId: randomUUID(),
      roomId: room.id,
      lotId: room.lot!.id,
      expectedVersion: room.version,
      type: "bid",
      payload: {},
    };
    expect(() =>
      applyCommand(room, dataset, owner, owner.id, c, room.lot!.endsAt),
    ).toThrow("closed");
    expect(() =>
      applyCommand(room, dataset, owner, owner.id, c, room.lot!.endsAt + 1),
    ).toThrow("closed");
  });
  it("rejects a stale lot even with the latest version", () => {
    start();
    expect(() => command("bid", owner, {}, { lotId: randomUUID() })).toThrow(
      "no longer",
    );
  });
  it("rejects stale room versions", () => {
    start();
    expect(() => command("bid", owner, {}, { expectedVersion: 0 })).toThrow(
      "changed",
    );
  });
  it("deduplicates accepted requests without charging twice", () => {
    start();
    const c = command("bid");
    const version = room.version;
    expect(applyCommand(room, dataset, owner, owner.id, c, now)).toBe(false);
    expect(room.bids).toHaveLength(1);
    expect(room.version).toBe(version);
  });
  it("resolves and deducts the winning bid exactly once", () => {
    start();
    command("bid");
    command("pass", guest);
    expect(room.status).toBe("reveal");
    expect(room.members[0].budget).toBe(900);
    expect(room.members[0].purchases).toHaveLength(1);
    expect(() => resolveLot(room, now)).toThrow("resolved");
    expect(room.members[0].budget).toBe(900);
  });
  it("makes pass irreversible and lot specific", () => {
    start();
    command("pass");
    expect(() => command("bid")).toThrow("final");
    expect(() => command("pass")).toThrow("final");
  });
  it("marks no-bid lots unsold when every eligible team passes", () => {
    start();
    command("pass");
    command("pass", guest);
    expect(room.lot!.result).toBe("unsold");
    expect(room.unsold).toEqual(["p1"]);
  });
  it("does not treat a disconnection as a pass", () => {
    start();
    command("bid");
    room.members[1].connected = false;
    tickRoom(room, dataset, now + 1);
    expect(room.status).toBe("running");
  });
  it("enforces budget, squad and overseas limits", () => {
    start();
    const m = room.members[0];
    m.budget = 99;
    expect(() => command("bid")).toThrow("budget");
    m.budget = 1000;
    m.purchases = [{ lotId: "x", playerId: "p2", amount: 100 }];
    expect(ineligible(room, m, dataset.players[1], dataset)).toBe(
      "Overseas cap reached",
    );
    m.purchases.push({ lotId: "y", playerId: "p1", amount: 100 });
    expect(() => command("bid")).toThrow("full");
  });
  it("reserves integer budget for remaining squad slots", () => {
    start();
    room.settings.reserveBudget = true;
    room.members[0].budget = 150;
    expect(() => command("bid")).toThrow("Reserve");
  });
  it("supports multiple domestic nations and international pools", () => {
    expect(isForeign({ ...dataset.players[0], nation: "Wales" }, dataset)).toBe(
      false,
    );
    expect(
      isForeign(dataset.players[1], { ...dataset, domesticNations: [] }),
    ).toBe(false);
  });
  it("recovers expired lots once from serialized state", () => {
    start();
    command("bid");
    room = JSON.parse(JSON.stringify(room));
    tickRoom(room, dataset, room.lot!.endsAt + 1);
    expect(room.members[0].purchases).toHaveLength(1);
    tickRoom(room, dataset, room.lot!.endsAt + 2);
    expect(room.members[0].purchases).toHaveLength(1);
  });
  it("gives rerun lots new IDs", () => {
    start();
    command("pass");
    command("pass", guest);
    const old = room.lot!.id;
    tickRoom(room, dataset, now + 3000);
    command("pass");
    command("pass", guest);
    tickRoom(room, dataset, now + 3000);
    expect(room.status).toBe("unsold_decision");
    command("rerun");
    expect(room.lot!.playerId).toBe("p1");
    expect(room.lot!.id).not.toBe(old);
  });
  it("preserves kicked owners purchases and blocks rejoin", () => {
    start();
    command("bid", guest);
    command("pass");
    expect(room.members[1].purchases).toHaveLength(1);
    command("kick", owner, { memberId: room.members[1].id });
    expect(room.members[1].purchases).toHaveLength(1);
    expect(() => joinRoom(room, guest, dataset, "b", "")).toThrow("removed");
  });
  it("transfers the host after persisted grace expiry", () => {
    room.members[0].connected = false;
    room.members[0].disconnectedAt = now;
    tickRoom(room, dataset, now + 120001);
    expect(room.hostId).toBe(guest.id);
  });
  it("keeps the accepted highest bid when its owner leaves", () => {
    start();
    command("bid", guest);
    command("leave", guest);
    resolveLot(room, now);
    expect(room.members[1].purchases).toHaveLength(1);
  });
  it("rejects inactive sessions", () => {
    start();
    const c: Command = {
      requestId: randomUUID(),
      roomId: room.id,
      expectedVersion: room.version,
      lotId: room.lot!.id,
      type: "bid",
      payload: {},
    };
    expect(() =>
      applyCommand(room, dataset, owner, "wrong-session", c, now),
    ).toThrow("another session");
  });
  it("validates captain, vice captain and purchased XI", () => {
    room.status = "completed";
    room.members[0].purchases = [
      { lotId: "x", playerId: "p1", amount: 100 },
      { lotId: "y", playerId: "p2", amount: 100 },
    ];
    expect(() =>
      command("lineup", owner, {
        players: ["p1", "p2"],
        captain: "p1",
        viceCaptain: "p1",
      }),
    ).toThrow("different");
    command("lineup", owner, {
      players: ["p1", "p2"],
      captain: "p1",
      viceCaptain: "p2",
    });
    expect(room.members[0].lineup).toHaveLength(2);
  });
});
describe("serialized persistence", () => {
  it("admits only one simultaneous team claim", async () => {
    room.members = room.members.slice(0, 1);
    const dir = await mkdtemp(join(tmpdir(), "cricket-"));
    const repo = await new FileRepository(join(dir, "rooms.json")).init();
    await repo.create(room);
    const outcomes = await Promise.allSettled([
      repo.mutate(room.id, (r) => joinRoom(r, guest, dataset, "b", "")),
      repo.mutate(room.id, (r) => joinRoom(r, other, dataset, "b", "")),
    ]);
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await repo.get(room.id))!.members).toHaveLength(2);
  });
  it("does not oversubscribe capacity on different simultaneous teams", async () => {
    room.members = room.members.slice(0, 1);
    const dir = await mkdtemp(join(tmpdir(), "cricket-"));
    const repo = await new FileRepository(join(dir, "rooms.json")).init();
    await repo.create(room);
    const outcomes = await Promise.allSettled([
      repo.mutate(room.id, (r) => joinRoom(r, guest, dataset, "b", "")),
      repo.mutate(room.id, (r) => joinRoom(r, other, dataset, "c", "")),
    ]);
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });
  it("serializes simultaneous bids and rejects the stale command", async () => {
    start();
    const dir = await mkdtemp(join(tmpdir(), "cricket-"));
    const repo = await new FileRepository(join(dir, "rooms.json")).init();
    await repo.create(room);
    const c: Command = {
      requestId: randomUUID(),
      roomId: room.id,
      lotId: room.lot!.id,
      expectedVersion: room.version,
      type: "bid",
      payload: {},
    };
    const outcomes = await Promise.allSettled([
      repo.mutate(room.id, (r) => {
        applyCommand(r, dataset, owner, owner.id, c, now);
      }),
      repo.mutate(room.id, (r) => {
        applyCommand(
          r,
          dataset,
          guest,
          guest.id,
          { ...c, requestId: randomUUID() },
          now,
        );
      }),
    ]);
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const recovered = await new FileRepository(join(dir, "rooms.json")).init();
    expect((await recovered.get(room.id))!.bids).toHaveLength(1);
  });
  it("rolls back failed mutations instead of leaking memory state", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cricket-"));
    const repo = await new FileRepository(join(dir, "rooms.json")).init();
    await repo.create(room);
    await expect(
      repo.mutate(room.id, (r) => {
        r.version = 999;
        throw new Error("failure");
      }),
    ).rejects.toThrow("failure");
    expect((await repo.get(room.id))!.version).toBe(room.version);
  });
});
