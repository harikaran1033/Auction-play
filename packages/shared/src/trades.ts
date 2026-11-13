import { z } from "zod";
import type { RoomView } from "./index";
export const tradeProposalSchema = z
  .object({
    requestId: z.string().uuid(),
    toMemberId: z.string().uuid(),
    offeredPlayerIds: z.array(z.string().min(1).max(128)).max(5).default([]),
    requestedPlayerIds: z.array(z.string().min(1).max(128)).max(5).default([]),
    offeredCash: z.number().int().min(0).max(10000000).default(0),
    requestedCash: z.number().int().min(0).max(10000000).default(0),
    sessionId: z.string().optional(),
  })
  .refine(
    (value) => !(value.offeredCash && value.requestedCash),
    "Put cash on only one side of the offer.",
  )
  .refine(
    (value) =>
      value.offeredPlayerIds.length + value.requestedPlayerIds.length > 0,
    "Include at least one player.",
  )
  .refine(
    (value) =>
      (value.offeredPlayerIds.length > 0 || value.offeredCash > 0) &&
      (value.requestedPlayerIds.length > 0 || value.requestedCash > 0),
    "Both teams must receive players or credits.",
  );
export type TradeProposal = z.infer<typeof tradeProposalSchema>;
export type TradeStatus =
  "pending" | "accepted" | "rejected" | "cancelled" | "invalidated" | "expired";
export interface TradeOffer {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  offeredPlayerIds: string[];
  requestedPlayerIds: string[];
  offeredCash: number;
  requestedCash: number;
  status: TradeStatus;
  createdAt: number;
  expiresAt: number;
  resolvedAt?: number;
  reason?: string;
}
export interface TradeState {
  room: RoomView;
  offers: TradeOffer[];
}
export interface TradeServerEvents {
  changed: () => void;
  accessEnded: (reason: string) => void;
}
export const tradeResponseSchema = z.object({
  action: z.enum(["accept", "reject", "cancel"]),
  sessionId: z.string().optional(),
});
