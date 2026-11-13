import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import {
  type Dataset,
  type Room,
  settingsSchema,
  tradeProposalSchema,
  publicRoom,
} from "@cricket/shared";
import { makeRoom, joinRoom } from "../apps/server/src/rooms.js";
import {
  proposeTrade,
  respondTrade,
} from "../apps/server/src/auction/trades.js";
import { FileRepository } from "../apps/server/src/storage.js";
const users = ["Owner", "Guest", "Third"].map((name) => ({
  id: randomUUID(),
  name,
}));
const dataset: Dataset = {
  id: "fixture",
  name: "Trade test fixture",
  league: "Fixture",
  source: "test",
  fixture: true,
  domesticNations: ["India"],
  scale: 100,
  unit: "credits",
  teams: ["a", "b", "c"].map((id) => ({
    id,
    name: id,
    shortName: id,
    color: "#abcdef",
  })),
  players: ["a", "b", "c", "d"].map((id) => ({
    id,
    name: id,
    nation: id === "c" ? "Australia" : "India",
    role: "batter",
    basePrice: 100,
    stats: {},
  })),
};
function fixture(): Room {
  const room = makeRoom(
    users[0],
    dataset,
    settingsSchema.parse({
      name: "Trade test room",
      datasetId: "fixture",
      teamId: "a",
      budget: 1000,
      squadSize: 3,
      maxTeams: 3,
      overseasCap: 2,
      reserveBudget: false,
    }),
  );
  for (let i = 1; i < users.length; i++)
    joinRoom(room, users[i], dataset, dataset.teams[i].id, "");
  room.status = "completed";
  room.members.forEach((member, i) => {
    member.connected = true;
    member.sessionId = users[i].id;
    if (i < 2) {
      member.purchases = [
        { lotId: randomUUID(), playerId: i === 0 ? "a" : "b", amount: 100 },
      ];
      member.budget = 900;
      member.lineup = [member.purchases[0].playerId];
      member.captain = member.lineup[0];
    }
  });
  return room;
}
function proposal(room: Room, fields: Record<string, unknown> = {}) {
  return tradeProposalSchema.parse({
    requestId: randomUUID(),
    toMemberId: room.members[1].id,
    offeredPlayerIds: ["a"],
    requestedPlayerIds: ["b"],
    sessionId: users[0].id,
    ...fields,
  });
}
function pending(room: Room, fields: Record<string, unknown> = {}) {
  return proposeTrade(room, dataset, users[0].id, proposal(room, fields), 1000);
}
function accept(room: Room, id: string) {
  return respondTrade(
    room,
    dataset,
    users[1].id,
    id,
    "accept",
    users[1].id,
    2000,
  );
}
function balances(room: Room) {
  return room.members.map((member) => member.budget);
}
describe("agreed player trades", () => {
  it("does not move or reserve players or money when an offer is sent", () => {
    const room = fixture(),
      before = structuredClone(room.members);
    const offer = pending(room, { offeredCash: 50 });
    expect(room.members).toEqual(before);
    expect(offer.status).toBe("pending");
    expect(publicRoom(room)).not.toHaveProperty("trades");
  });
  it("atomically exchanges players and cash and clears invalid XI/captain choices", () => {
    const room = fixture(),
      originalLot = room.members[0].purchases[0].lotId,
      offer = pending(room, { offeredCash: 50 });
    accept(room, offer.id);
    expect(balances(room)).toEqual([850, 950, 1000]);
    expect(
      room.members.map((member) =>
        member.purchases.map((purchase) => purchase.playerId),
      ),
    ).toEqual([["b"], ["a"], []]);
    expect(room.members[1].purchases[0]).toMatchObject({
      lotId: originalLot,
      amount: 100,
      tradeId: offer.id,
    });
    expect(room.members[0].lineup).toEqual([]);
    expect(room.members[0].captain).toBeUndefined();
    expect(room.members[1].captain).toBeUndefined();
    expect(offer.status).toBe("accepted");
  });
  it("supports money-for-player offers after owners leave a completed auction", () => {
    const room = fixture();
    room.members.forEach((member) => {
      member.left = true;
      member.connected = false;
      delete member.sessionId;
    });
    const input = proposal(room, {
      toMemberId: room.members[0].id,
      offeredPlayerIds: [],
      requestedPlayerIds: ["a"],
      offeredCash: 150,
      sessionId: undefined,
    });
    const offer = proposeTrade(room, dataset, users[2].id, input, 1000);
    respondTrade(
      room,
      dataset,
      users[0].id,
      offer.id,
      "accept",
      undefined,
      2000,
    );
    expect(balances(room)).toEqual([1050, 900, 850]);
    expect(room.members[2].purchases[0].playerId).toBe("a");
  });
  it.each(["reject", "cancel"] as const)(
    "%s leaves rosters and cash unchanged",
    (action) => {
      const room = fixture(),
        offer = pending(room),
        before = structuredClone(room.members);
      respondTrade(
        room,
        dataset,
        users[action === "cancel" ? 0 : 1].id,
        offer.id,
        action,
        undefined,
        2000,
      );
      expect(room.members).toEqual(before);
      expect(offer.status).toBe(action === "cancel" ? "cancelled" : "rejected");
    },
  );
  it("only lets the recipient accept/reject and the sender cancel", () => {
    const room = fixture(),
      offer = pending(room);
    expect(() =>
      respondTrade(room, dataset, users[0].id, offer.id, "accept"),
    ).toThrow("receiving owner");
    expect(() =>
      respondTrade(room, dataset, users[1].id, offer.id, "cancel"),
    ).toThrow("sender");
    expect(() =>
      respondTrade(room, dataset, users[2].id, offer.id, "reject"),
    ).toThrow("receiving owner");
  });
  it("rejects outsiders, blocked owners, self trades, duplicate players and changed ownership", () => {
    let room = fixture();
    expect(() =>
      proposeTrade(room, dataset, "outsider", proposal(room)),
    ).toThrow("membership");
    room.members[1].blocked = true;
    expect(() => pending(room)).toThrow("no longer available");
    room = fixture();
    expect(() => pending(room, { toMemberId: room.members[0].id })).toThrow(
      "another franchise",
    );
    expect(() => pending(room, { offeredPlayerIds: ["a", "a"] })).toThrow(
      "only once",
    );
    expect(() => pending(room, { offeredPlayerIds: ["c"] })).toThrow(
      "ownership changed",
    );
  });
  it("requires the current connected auction session for live trades", () => {
    const room = fixture();
    room.status = "running";
    expect(() => pending(room, { sessionId: "old" })).toThrow("Rejoin");
    const offer = pending(room);
    expect(() =>
      respondTrade(room, dataset, users[1].id, offer.id, "accept", "old", 2000),
    ).toThrow("Rejoin");
  });
  it("is idempotent for retried proposal and acceptance, without a second cash transfer", () => {
    const room = fixture(),
      input = proposal(room, { offeredCash: 50 });
    const offer = proposeTrade(room, dataset, users[0].id, input, 1000);
    expect(proposeTrade(room, dataset, users[0].id, input, 1100).id).toBe(
      offer.id,
    );
    expect(room.trades).toHaveLength(1);
    accept(room, offer.id);
    accept(room, offer.id);
    expect(balances(room)).toEqual([850, 950, 1000]);
    expect(() =>
      proposeTrade(room, dataset, users[0].id, { ...input, offeredCash: 60 }),
    ).toThrow("already been used");
  });
  it("invalidates overlapping pending offers when player custody changes", () => {
    const room = fixture(),
      first = pending(room),
      second = pending(room);
    accept(room, first.id);
    expect(second.status).toBe("invalidated");
    expect(() => accept(room, second.id)).toThrow("no longer pending");
  });
  it("revalidates money at acceptance and rolls back all proposed roster changes", () => {
    const room = fixture(),
      offer = pending(room, { offeredCash: 800 });
    room.members[0].budget = 100;
    const before = structuredClone(room);
    expect(() => accept(room, offer.id)).toThrow("enough credits");
    expect(room).toEqual(before);
  });
  it("protects cash committed to a highest bid", () => {
    const room = fixture();
    room.status = "running";
    const offer = pending(room, { offeredCash: 100 });
    room.lot = {
      id: randomUUID(),
      playerId: "c",
      highest: room.members[0].id,
      bid: 850,
      endsAt: 9000,
      resolved: false,
      passed: [],
    };
    expect(() => accept(room, offer.id)).toThrow("highest bid");
  });
  it("protects the squad slot reserved for an unresolved highest bid", () => {
    const room = fixture();
    room.status = "running";
    room.settings.squadSize = 2;
    const offer = pending(room, { offeredPlayerIds: [], offeredCash: 100 });
    room.lot = {
      id: randomUUID(),
      playerId: "c",
      highest: room.members[0].id,
      bid: 100,
      endsAt: 9000,
      resolved: false,
      passed: [],
    };
    expect(() => accept(room, offer.id)).toThrow("squad would exceed");
  });
  it("checks overseas caps after an exchange, including a standing bid", () => {
    const room = fixture();
    room.settings.overseasCap = 0;
    expect(() => pending(room, { requestedPlayerIds: ["c"] })).toThrow(
      "ownership",
    );
    room.members[1].purchases[0].playerId = "c";
    expect(() => pending(room, { requestedPlayerIds: ["c"] })).toThrow(
      "overseas limit",
    );
  });
  it("retains the reserve budget while an auction is running", () => {
    const room = fixture();
    room.status = "running";
    room.settings.reserveBudget = true;
    const offer = pending(room, { offeredCash: 600 });
    room.members[0].budget = 700;
    expect(() => accept(room, offer.id)).toThrow("minimum budget");
  });
  it("expires offers and prevents replaying cancelled offers", () => {
    const room = fixture(),
      offer = pending(room);
    expect(() =>
      respondTrade(
        room,
        dataset,
        users[1].id,
        offer.id,
        "accept",
        undefined,
        offer.expiresAt + 1,
      ),
    ).toThrow("expired");
    respondTrade(
      room,
      dataset,
      users[0].id,
      offer.id,
      "cancel",
      undefined,
      2000,
    );
    expect(() => accept(room, offer.id)).toThrow("no longer pending");
  });
  it("serializes competing acceptances through the actual repository", async () => {
    const room = fixture(),
      first = pending(room, { offeredCash: 50 }),
      second = pending(room, { offeredCash: 60 }),
      path = `.runtime/trade-race-${randomUUID()}.json`,
      repository = await new FileRepository(path).init();
    try {
      await repository.create(room);
      const results = await Promise.allSettled(
        [first, second].map((offer) =>
          repository.mutate(room.id, (room) => {
            accept(room, offer.id);
          }),
        ),
      );
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const saved = (await repository.get(room.id))!;
      expect(balances(saved)).toEqual([850, 950, 1000]);
      expect(saved.members.flatMap((member) => member.purchases)).toHaveLength(
        2,
      );
      expect(
        saved.trades?.filter((offer) => offer.status === "accepted"),
      ).toHaveLength(1);
    } finally {
      await unlink(path).catch(() => undefined);
    }
  });
  it("rejects malformed, fractional and empty terms", () => {
    const room = fixture();
    for (const fields of [
      { offeredCash: -1 },
      { offeredCash: 0.5 },
      { offeredCash: 1, requestedCash: 1 },
      { offeredPlayerIds: [], requestedPlayerIds: [], offeredCash: 10 },
    ])
      expect(() => proposal(room, fields)).toThrow();
  });
});
