import { z } from "zod";
export * from "./voice";
export * from "./trades";
import type { TradeOffer } from "./trades";

export const roleSchema = z.enum([
  "batter",
  "bowler",
  "all-rounder",
  "wicket-keeper",
]);
export type Role = z.infer<typeof roleSchema>;
export interface Player {
  id: string;
  name: string;
  nation: string;
  role: Role;
  battingStyle?: string;
  bowlingStyle?: string;
  imageUrl?: string;
  basePrice: number;
  sourceTeam?: string;
  stats: Record<string, unknown>;
}
export interface Team {
  id: string;
  name: string;
  shortName: string;
  color: string;
}
export interface Dataset {
  id: string;
  league: string;
  name: string;
  source: string;
  fixture: boolean;
  domesticNations: string[];
  unit: string;
  scale: number;
  teams: Team[];
  players: Player[];
}
export const settingsSchema = z
  .object({
    name: z.string().trim().min(3).max(60),
    datasetId: z.string().min(1),
    teamId: z.string().min(1),
    visibility: z.enum(["public", "private"]).default("public"),
    password: z.string().max(128).default(""),
    maxTeams: z.coerce.number().int().min(2).max(10).default(6),
    budget: z.coerce.number().int().min(100).max(1000000).default(10000),
    squadSize: z.coerce.number().int().min(1).max(25).default(15),
    overseasCap: z.coerce.number().int().min(0).max(25).default(8),
    timerSeconds: z.coerce.number().int().min(5).max(120).default(20),
    increment: z.coerce.number().int().min(1).max(10000).default(10),
    reserveBudget: z.boolean().default(true),
    voice: z.boolean().default(false),
  })
  .refine((x) => x.overseasCap <= x.squadSize, {
    path: ["overseasCap"],
    message: "Overseas cap cannot exceed squad size",
  });
export type Settings = z.infer<typeof settingsSchema>;
export interface User {
  id: string;
  name: string;
  avatar?: string;
}
export interface Purchase {
  lotId: string;
  playerId: string;
  amount: number;
  tradeId?: string;
}
export interface Member {
  id: string;
  userId: string;
  name: string;
  teamId: string;
  ready: boolean;
  connected: boolean;
  joinedAt: number;
  disconnectedAt?: number;
  graceExpired?: boolean;
  sessionId?: string;
  blocked?: boolean;
  left?: boolean;
  budget: number;
  purchases: Purchase[];
  lineup: string[];
  captain?: string;
  viceCaptain?: string;
}
export type Status =
  | "lobby"
  | "running"
  | "reveal"
  | "paused"
  | "unsold_decision"
  | "completed"
  | "cancelled";
export interface Lot {
  id: string;
  playerId: string;
  endsAt: number;
  bid: number;
  highest?: string;
  passed: string[];
  resolved: boolean;
  result?: "sold" | "unsold";
  revealEndsAt?: number;
}
export interface ChatMessage {
  id: string;
  requestId: string;
  userId: string;
  name: string;
  text: string;
  at: number;
}
export interface Bid {
  id: string;
  lotId: string;
  memberId: string;
  amount: number;
  at: number;
}
export interface Room {
  trades?: TradeOffer[];
  id: string;
  code: string;
  hostId: string;
  settings: Omit<Settings, "password">;
  passwordHash?: string;
  version: number;
  status: Status;
  members: Member[];
  blocks: string[];
  queue: string[];
  unsold: string[];
  lots: Lot[];
  lot?: Lot;
  bids: Bid[];
  receipts: Record<string, { userId: string; at: number }>;
  chat: ChatMessage[];
  createdAt: number;
  round: number;
}
export type RoomView = Omit<Room, "passwordHash" | "receipts" | "trades"> & {
  serverTime: number;
};
export const commandSchema = z.object({
  requestId: z.string().uuid(),
  roomId: z.string().uuid(),
  lotId: z.string().optional(),
  expectedVersion: z.number().int().nonnegative(),
  type: z.enum([
    "ready",
    "start",
    "bid",
    "pass",
    "leave",
    "kick",
    "transfer",
    "team",
    "settings",
    "cancel",
    "pause",
    "resume",
    "rerun",
    "finish",
    "lineup",
    "chat",
  ]),
  payload: z.record(z.unknown()).default({}),
});
export type Command = z.infer<typeof commandSchema>;
export interface Problem {
  code: string;
  message: string;
}
export type Ack<T> = { ok: true; data: T } | { ok: false; error: Problem };
export interface ServerEvents {
  snapshot: (room: RoomView) => void;
  revoked: (reason: string) => void;
  takeover: () => void;
}
export interface ClientEvents {
  watch: (
    input: { roomId: string },
    ack: (result: Ack<RoomView>) => void,
  ) => void;
  command: (input: Command, ack: (result: Ack<RoomView>) => void) => void;
}
export class RuleError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "RuleError";
  }
}
export function ensure(
  condition: unknown,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new RuleError(code, message);
}
export function money(
  value: number,
  dataset?: Pick<Dataset, "scale" | "unit">,
) {
  return `${(value / (dataset?.scale ?? 100)).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${dataset?.unit ?? "cr"}`;
}
export function isForeign(player: Player, dataset: Dataset) {
  return (
    dataset.domesticNations.length > 0 &&
    !dataset.domesticNations.includes(player.nation)
  );
}
export function nextBid(room: Pick<Room, "lot" | "settings">, player: Player) {
  return room.lot?.highest
    ? room.lot.bid + room.settings.increment
    : player.basePrice;
}
export function ineligible(
  room: Pick<Room, "lot" | "settings">,
  member: Member,
  player: Player,
  dataset: Dataset,
  amount = nextBid(room, player),
): string | undefined {
  if (member.blocked || member.left) return "Team is inactive";
  if (member.purchases.length >= room.settings.squadSize)
    return "Squad is full";
  if (amount > member.budget) return "Insufficient budget";
  if (
    isForeign(player, dataset) &&
    member.purchases.filter((p) => {
      const item = dataset.players.find((x) => x.id === p.playerId);
      return item && isForeign(item, dataset);
    }).length >= room.settings.overseasCap
  )
    return "Overseas cap reached";
  const slots = room.settings.squadSize - member.purchases.length - 1;
  const minimum = Math.min(...dataset.players.map((p) => p.basePrice));
  if (room.settings.reserveBudget && member.budget - amount < slots * minimum)
    return "Reserve budget for remaining squad slots";
  return undefined;
}
export function memberFor(room: Room, userId: string) {
  const m = room.members.find((m) => m.userId === userId && !m.blocked);
  ensure(
    m && !room.blocks.includes(userId),
    "FORBIDDEN",
    "Room membership required",
  );
  return m;
}
export function publicRoom(room: Room): RoomView {
  const {
    passwordHash: _passwordHash,
    receipts: _receipts,
    trades: _trades,
    ...view
  } = structuredClone(room);
  view.members.forEach((m) => delete m.sessionId);
  return { ...view, serverTime: Date.now() };
}

export interface OwnedRoomSummary {
  id: string;
  name: string;
  datasetId: string;
  status: Status;
  teamId: string;
  budget: number;
  purchaseCount: number;
  createdAt: number;
  path: string;
}

export function roomPath(room: Pick<Room, "id" | "status">) {
  const screen =
    room.status === "lobby"
      ? "lobby"
      : room.status === "completed"
        ? "results"
        : "auction";
  return `/rooms/${room.id}/${screen}`;
}
