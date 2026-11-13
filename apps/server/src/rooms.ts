import { randomUUID, randomBytes } from "node:crypto";
import {
  type Dataset,
  type Room,
  type User,
  type Member,
  type Settings,
  type OwnedRoomSummary,
  ensure,
  roomPath,
} from "@cricket/shared";
import { checkPassword, hashPassword } from "./auth.js";

export function newMember(user: User, teamId: string, budget: number): Member {
  return {
    id: randomUUID(),
    userId: user.id,
    name: user.name,
    teamId,
    ready: false,
    connected: false,
    joinedAt: Date.now(),
    disconnectedAt: Date.now(),
    budget,
    purchases: [],
    lineup: [],
  };
}
export function makeRoom(
  user: User,
  dataset: Dataset,
  settings: Settings,
): Room {
  ensure(
    settings.maxTeams <= dataset.teams.length,
    "CAPACITY",
    "Maximum teams exceeds available dataset teams",
  );
  ensure(
    dataset.teams.some((t) => t.id === settings.teamId),
    "INVALID_TEAM",
    "Select an available league team",
  );
  const { password, ...safeSettings } = settings;
  return {
    id: randomUUID(),
    code: randomBytes(6).toString("hex").slice(0, 8).toUpperCase(),
    hostId: user.id,
    settings: safeSettings,
    passwordHash: password ? hashPassword(password) : undefined,
    version: 1,
    status: "lobby",
    members: [newMember(user, settings.teamId, settings.budget)],
    blocks: [],
    queue: [],
    unsold: [],
    lots: [],
    bids: [],
    receipts: {},
    chat: [],
    createdAt: Date.now(),
    round: 0,
  };
}
export function checkJoin(room: Room, user: User, password: string) {
  ensure(room.status !== "cancelled", "ROOM_CLOSED", "This room was cancelled");
  ensure(
    !room.blocks.includes(user.id),
    "BLOCKED",
    "The host has removed you from this room",
  );
  const existing = room.members.find((m) => m.userId === user.id && !m.blocked);
  if (existing) return existing;
  ensure(
    room.status === "lobby",
    "ALREADY_STARTED",
    "New owners cannot join after the auction starts",
  );
  ensure(
    !room.passwordHash || checkPassword(password, room.passwordHash),
    "PASSWORD",
    "Incorrect room password",
  );
  ensure(
    room.members.length < room.settings.maxTeams,
    "ROOM_FULL",
    "This room is full",
  );
}
export function joinRoom(
  room: Room,
  user: User,
  dataset: Dataset,
  teamId: string,
  password: string,
) {
  const existing = checkJoin(room, user, password);
  if (existing) {
    existing.left = false;
    return;
  }
  ensure(
    dataset.teams.some((t) => t.id === teamId),
    "INVALID_TEAM",
    "Unknown team",
  );
  ensure(
    !room.members.some((m) => m.teamId === teamId && !m.blocked),
    "TEAM_TAKEN",
    "Another owner has already selected that team",
  );
  room.members.push(newMember(user, teamId, room.settings.budget));
  room.members.forEach((m) => (m.ready = false));
  room.version++;
}

export function ownedRooms(rooms: Room[], userId: string): OwnedRoomSummary[] {
  return rooms
    .filter(
      (room) =>
        room.status !== "cancelled" &&
        !room.blocks.includes(userId) &&
        room.members.some((m) => m.userId === userId && !m.blocked),
    )
    .sort(
      (a, b) =>
        Number(a.status === "completed") - Number(b.status === "completed") ||
        b.createdAt - a.createdAt,
    )
    .slice(0, 20)
    .map((room) => {
      const member = room.members.find(
        (m) => m.userId === userId && !m.blocked,
      )!;
      return {
        id: room.id,
        name: room.settings.name,
        datasetId: room.settings.datasetId,
        status: room.status,
        teamId: member.teamId,
        budget: member.budget,
        purchaseCount: member.purchases.length,
        createdAt: room.createdAt,
        path: roomPath(room),
      };
    });
}
