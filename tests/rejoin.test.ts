import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { type Dataset, settingsSchema, roomPath } from "@cricket/shared";
import {
  makeRoom,
  joinRoom,
  checkJoin,
  ownedRooms,
} from "../apps/server/src/rooms.js";
const owner = { id: randomUUID(), name: "Owner" },
  guest = { id: randomUUID(), name: "Guest" },
  outsider = { id: randomUUID(), name: "Outsider" };
const dataset: Dataset = {
  id: "fixture",
  league: "Fixture",
  name: "Fixture",
  source: "test",
  fixture: true,
  domesticNations: ["India"],
  unit: "credits",
  scale: 100,
  players: [
    {
      id: "player",
      name: "Player",
      role: "batter",
      nation: "India",
      basePrice: 100,
      stats: {},
    },
  ],
  teams: [
    { id: "a", name: "A", shortName: "A", color: "#123456" },
    { id: "b", name: "B", shortName: "B", color: "#abcdef" },
  ],
};
function fixture() {
  const room = makeRoom(
    owner,
    dataset,
    settingsSchema.parse({
      name: "Private auction",
      datasetId: "fixture",
      teamId: "a",
      visibility: "private",
      password: "room-password",
      maxTeams: 2,
      squadSize: 2,
      overseasCap: 1,
      budget: 1000,
    }),
  );
  joinRoom(room, guest, dataset, "b", "room-password");
  room.status = "running";
  return room;
}
describe("finding and rejoining owned auctions", () => {
  it("returns the existing team in a full running private room without a password or new claim", () => {
    const room = fixture();
    const member = room.members[0];
    member.purchases = [
      { lotId: randomUUID(), playerId: "player", amount: 100 },
    ];
    member.budget = 900;
    member.connected = false;
    member.left = true;
    const purchases = structuredClone(member.purchases);
    expect(checkJoin(room, owner, "")?.id).toBe(member.id);
    joinRoom(room, owner, dataset, "", "");
    expect(room.members).toHaveLength(2);
    expect(member.teamId).toBe("a");
    expect(member.budget).toBe(900);
    expect(member.purchases).toEqual(purchases);
    expect(member.left).toBe(false);
  });
  it("keeps running private rooms visible only to their own members", () => {
    const room = fixture();
    const list = ownedRooms([room], owner.id);
    expect(list).toHaveLength(1);
    expect(list[0].path).toBe(`/rooms/${room.id}/auction`);
    expect(ownedRooms([room], outsider.id)).toEqual([]);
    expect(JSON.stringify(list)).not.toContain("passwordHash");
    expect(JSON.stringify(list)).not.toContain("sessionId");
  });
  it("continues to reject new owners joining an auction that has started", () => {
    expect(() => checkJoin(fixture(), outsider, "room-password")).toThrow(
      "after the auction starts",
    );
  });
  it("excludes kicked and cancelled memberships, including a stale membership retained alongside a block", () => {
    const room = fixture();
    room.blocks.push(owner.id);
    expect(ownedRooms([room], owner.id)).toEqual([]);
    expect(() => checkJoin(room, owner, "")).toThrow("removed");
    room.blocks = [];
    room.members[0].blocked = true;
    expect(ownedRooms([room], owner.id)).toEqual([]);
    room.members[0].blocked = false;
    room.status = "cancelled";
    expect(ownedRooms([room], owner.id)).toEqual([]);
    expect(() => checkJoin(room, owner, "")).toThrow("cancelled");
  });
  it("routes lobby, paused/unsold and completed rooms to their persisted screens", () => {
    const room = fixture();
    room.status = "lobby";
    expect(roomPath(room)).toMatch(/\/lobby$/);
    room.status = "paused";
    expect(roomPath(room)).toMatch(/\/auction$/);
    room.status = "unsold_decision";
    expect(roomPath(room)).toMatch(/\/auction$/);
    room.status = "completed";
    expect(ownedRooms([room], owner.id)[0].path).toMatch(/\/results$/);
  });
  it("prioritizes ongoing auctions over newer completed results", () => {
    const room = fixture();
    room.createdAt = 1;
    const completed = Array.from({ length: 25 }, () => ({
      ...structuredClone(room),
      id: randomUUID(),
      status: "completed" as const,
      createdAt: 100,
    }));
    const list = ownedRooms([...completed, room], owner.id);
    expect(list).toHaveLength(20);
    expect(list[0].id).toBe(room.id);
  });
});
