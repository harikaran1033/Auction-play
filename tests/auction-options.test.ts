import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  bidIncrement,
  money,
  nextBid,
  buildAuctionSets,
  settingsSchema,
  isForeign,
  type Dataset,
  type Player,
} from "@cricket/shared";
import { loadCatalog } from "../apps/server/src/data/catalog.js";
import { playerIdentity } from "../apps/server/src/data/identities.js";
import {
  makeRoom,
  joinRoom,
  ownedRooms,
  removeOwnedRoom,
} from "../apps/server/src/rooms.js";
import { applyCommand } from "../apps/server/src/auction/engine.js";

const owner = { id: randomUUID(), name: "Owner" },
  guest = { id: randomUUID(), name: "Guest" };
const settings = () =>
  settingsSchema.parse({
    name: "Season test room",
    datasetId: "ipl",
    teamId: "a",
    maxTeams: 2,
    squadSize: 2,
    overseasCap: 2,
    reserveBudget: false,
    bidMode: "tiered",
    currency: "inr",
  });
const player = (
  id: string,
  role: Player["role"],
  nation = "India",
  bowlingStyle?: string,
): Player => ({
  id,
  name: id,
  role,
  nation,
  bowlingStyle,
  basePrice: 30,
  stats: {},
});
const dataset: Dataset = {
  id: "ipl",
  name: "Test",
  league: "Test",
  source: "test",
  fixture: true,
  unit: "credits",
  scale: 100,
  domesticNations: ["India"],
  teams: [
    { id: "a", name: "A", shortName: "A", color: "#ffffff" },
    { id: "b", name: "B", shortName: "B", color: "#000000" },
  ],
  players: [
    player("batter", "batter"),
    player("pace", "bowler", "India", "Right arm fast"),
    player("spin", "bowler", "Australia", "Leg break"),
    player("keeper", "wicket-keeper"),
    player("allrounder", "all-rounder"),
  ],
};
function room() {
  const r = makeRoom(owner, dataset, settings());
  joinRoom(r, guest, dataset, "b", "");
  r.members.forEach((m) => {
    m.connected = true;
    m.ready = true;
    m.sessionId = m.userId;
  });
  return r;
}
function random(seed: number) {
  return (max: number) => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return Math.floor((seed / 4294967296) * max);
  };
}

describe("auction sets and money", () => {
  it.each([
    [0, 50],
    [999, 50],
    [1000, 100],
    [1999, 100],
    [2000, 200],
    [2999, 200],
    [3000, 250],
    [4999, 250],
    [5000, 300],
    [9999, 300],
  ])("uses the correct increment at %i", (bid, step) =>
    expect(bidIncrement(settings(), bid)).toBe(step),
  );
  it("preserves fixed increments and the base opening price", () => {
    const s = { ...settings(), bidMode: "fixed" as const, increment: 17 };
    expect(bidIncrement(s, 5000)).toBe(17);
    expect(nextBid({ settings: s }, dataset.players[0])).toBe(30);
  });
  it("formats integer amounts as lakhs, crores, or credits", () => {
    expect(money(50, undefined, "inr")).toBe("₹50 L");
    expect(money(1250, undefined, "inr")).toBe("₹12.5 Cr");
    expect(money(50)).toContain("0.5");
  });
  it("separates domestic/overseas roles and pace/spin without losing players", () => {
    const { sets, queue } = buildAuctionSets(
      dataset,
      dataset.players,
      random(4),
    );
    expect(new Set(queue).size).toBe(dataset.players.length);
    expect(queue.slice().sort()).toEqual(
      dataset.players.map((p) => p.id).sort(),
    );
    expect(sets.map((s) => s.label).join(" ")).toMatch(/Overseas spin bowlers/);
    expect(sets.map((s) => s.label).join(" ")).toMatch(/Domestic fast bowlers/);
    expect(
      buildAuctionSets(dataset, dataset.players, random(9)).queue,
    ).not.toEqual(queue);
  });
  it("limits sets to six and shuffles inside sets", () => {
    const players = Array.from({ length: 20 }, (_, i) =>
      player(`p${i}`, "batter"),
    );
    const a = buildAuctionSets(dataset, players, random(1)),
      b = buildAuctionSets(dataset, players, random(2));
    expect(a.sets.every((s) => s.playerIds.length <= 6)).toBe(true);
    expect(a.queue).not.toEqual(b.queue);
    expect(new Set(a.queue).size).toBe(20);
  });
  it("persists one randomized queue across serialization and rejoin", () => {
    const r = room();
    applyCommand(
      r,
      dataset,
      owner,
      owner.id,
      {
        type: "start",
        roomId: r.id,
        requestId: randomUUID(),
        expectedVersion: r.version,
        payload: {},
      },
      Date.now(),
    );
    const queue = [...r.queue];
    const saved = JSON.parse(JSON.stringify(r));
    joinRoom(saved, owner, dataset, "a", "");
    expect(saved.queue).toEqual(queue);
    expect(saved.auctionSets).toEqual(r.auctionSets);
    expect(r.lot?.setLabel).toBeTruthy();
  });
  it("uses league eligibility for domestic slots", () =>
    expect(
      isForeign(
        {
          ...dataset.players[0],
          nation: "South Africa",
          eligibilityNation: "India",
        },
        dataset,
      ),
    ).toBe(false));
});

describe("season catalogue", () => {
  it("imports six dated seasons without duplicate active identities", async () => {
    const { datasets } = await loadCatalog();
    const seasons = datasets.filter((d) => d.season);
    expect(seasons).toHaveLength(6);
    for (const d of seasons) {
      expect(
        new Set(d.players.map((p) => playerIdentity(p.name, ""))).size,
      ).toBe(d.players.length);
      const active = d.players.filter((p) => p.currentSeason);
      expect(active.length).toBe(d.currentPlayerCount);
      expect(new Set(active.map((p) => playerIdentity(p.name, ""))).size).toBe(
        active.length,
      );
      expect(
        active.every(
          (p) => p.sourceTeam && d.teams.some((t) => t.name === p.sourceTeam),
        ),
      ).toBe(true);
      expect(
        d.players
          .filter((p) => p.priceSource === "game-default")
          .every(
            (p) => p.basePrice === 30 && Object.keys(p.stats).length === 0,
          ),
      ).toBe(true);
    }
  });
  it("only queues the current season when requested", () => {
    const d = {
      ...dataset,
      season: "2026",
      players: dataset.players.map((p, i) => ({ ...p, currentSeason: i < 2 })),
    };
    const r = room();
    r.settings.playerPool = "current";
    applyCommand(
      r,
      d,
      owner,
      owner.id,
      {
        type: "start",
        roomId: r.id,
        requestId: randomUUID(),
        expectedVersion: r.version,
        payload: {},
      },
      Date.now(),
    );
    expect([r.lot!.playerId, ...r.queue].sort()).toEqual(
      d.players
        .slice(0, 2)
        .map((p) => p.id)
        .sort(),
    );
  });
});

describe("removing owned rooms", () => {
  it("archives only the requesting owner and keeps purchases/purse", () => {
    const r = room();
    r.status = "running";
    const before = structuredClone(r.members[1]);
    removeOwnedRoom(r, guest.id);
    expect(ownedRooms([r], guest.id)).toEqual([]);
    expect(ownedRooms([r], owner.id)).toHaveLength(1);
    expect(r.members[1].budget).toBe(before.budget);
    expect(r.members[1].purchases).toEqual(before.purchases);
    expect(r.members[1].sessionId).toBeUndefined();
    expect(r.status).toBe("running");
  });
  it("transfers the host and preserves completed saved squads", () => {
    const r = room();
    r.status = "running";
    removeOwnedRoom(r, owner.id);
    expect(r.hostId).toBe(guest.id);
    r.status = "completed";
    removeOwnedRoom(r, guest.id);
    expect(r.status).toBe("completed");
    expect(r.members).toHaveLength(2);
  });
  it("restricts closing everyone's auction to the host", () => {
    const r = room();
    expect(() => removeOwnedRoom(r, guest.id, true)).toThrow("Only the host");
    expect(() => removeOwnedRoom(r, randomUUID())).toThrow("membership");
    removeOwnedRoom(r, owner.id, true);
    expect(r.status).toBe("cancelled");
  });
  it("releases a lobby seat and restores an explicitly rejoined archived room", () => {
    const r = room();
    removeOwnedRoom(r, guest.id);
    expect(r.members).toHaveLength(1);
    joinRoom(r, guest, dataset, "b", "");
    r.status = "running";
    removeOwnedRoom(r, guest.id);
    joinRoom(r, guest, dataset, "b", "");
    expect(ownedRooms([r], guest.id)).toHaveLength(1);
  });
});
