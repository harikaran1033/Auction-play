import type { RoomView } from "@cricket/shared";
export type AuctionCue =
  | { type: "tick"; seconds: number }
  | { type: "call"; call: "once" | "twice" }
  | {
      type: "result";
      result: "sold" | "unsold";
      playerId: string;
      winnerId?: string;
    };
export class AuctionCues {
  private seen = new Set<string>();
  private lotId?: string;
  private deadline?: number;
  private secondsPlayed = new Set<number>();
  private ready = false;
  prime(room: RoomView, now: number) {
    this.ready = true;
    for (const lot of room.lots) if (lot.resolved) this.seen.add(lot.id);
    if (room.lot?.resolved) this.seen.add(room.lot.id);
    this.lotId = room.lot?.id;
    const second = room.lot
      ? Math.max(0, Math.ceil((room.lot.endsAt - now) / 1000))
      : undefined;
    this.deadline = room.lot?.endsAt;
    this.secondsPlayed.clear();
    if (second !== undefined)
      for (let value = 10; value >= second; value--)
        this.secondsPlayed.add(value);
  }
  update(room: RoomView, now: number, audible = true): AuctionCue[] {
    if (!this.ready || !audible) {
      this.prime(room, now);
      return [];
    }
    const lot = room.lot;
    if (!lot) return [];
    const cues: AuctionCue[] = [];
    if (lot.resolved && lot.result && !this.seen.has(lot.id)) {
      this.seen.add(lot.id);
      cues.push({
        type: "result",
        result: lot.result,
        playerId: lot.playerId,
        winnerId: lot.highest,
      });
    }
    if (this.lotId !== lot.id || this.deadline !== lot.endsAt) {
      this.lotId = lot.id;
      this.deadline = lot.endsAt;
      this.secondsPlayed.clear();
    }
    const second = Math.max(0, Math.ceil((lot.endsAt - now) / 1000));
    if (
      room.status === "running" &&
      !lot.resolved &&
      second > 0 &&
      second <= 10 &&
      !this.secondsPlayed.has(second)
    ) {
      this.secondsPlayed.add(second);
      cues.push({ type: "tick", seconds: second });
      if (second === 5) cues.push({ type: "call", call: "once" });
      if (second === 2) cues.push({ type: "call", call: "twice" });
    }
    return cues;
  }
}
