import { describe, it, expect } from "vitest";
import { AuctionCues } from "../apps/web/src/features/audio/cues";
import { parseAudioOptions } from "../apps/web/src/lib/auctionAudio";
import type { RoomView } from "@cricket/shared";
function snapshot(): RoomView {
  return {
    id: "room",
    status: "running",
    lots: [],
    lot: {
      id: "lot",
      playerId: "player",
      endsAt: 20000,
      bid: 100,
      passed: [],
      resolved: false,
    },
  } as unknown as RoomView;
}
describe("auction sound event policy", () => {
  it("ticks only the final ten seconds, once per countdown value", () => {
    const room = snapshot(),
      cues = new AuctionCues();
    cues.prime(room, 0);
    expect(cues.update(room, 9000)).toEqual([]);
    expect(cues.update(room, 10000)).toEqual([{ type: "tick", seconds: 10 }]);
    expect(cues.update(room, 10100)).toEqual([]);
    expect(cues.update(room, 11000)).toEqual([{ type: "tick", seconds: 9 }]);
  });
  it("calls going once and twice at five and two seconds", () => {
    const room = snapshot(),
      cues = new AuctionCues();
    cues.prime(room, 0);
    expect(cues.update(room, 15000)).toContainEqual({
      type: "call",
      call: "once",
    });
    expect(cues.update(room, 18000)).toContainEqual({
      type: "call",
      call: "twice",
    });
    expect(cues.update(room, 20000)).toEqual([]);
  });
  it("never announces sold merely because the local clock reaches zero", () => {
    const room = snapshot(),
      cues = new AuctionCues();
    cues.prime(room, 0);
    expect(cues.update(room, 21000)).toEqual([]);
  });
  it("announces only server-confirmed sold/unsold results and never repeats a snapshot", () => {
    for (const result of ["sold", "unsold"] as const) {
      const room = snapshot(),
        cues = new AuctionCues();
      cues.prime(room, 0);
      room.status = "reveal";
      room.lot!.resolved = true;
      room.lot!.result = result;
      expect(cues.update(room, 1000)).toEqual([
        { type: "result", result, playerId: "player", winnerId: undefined },
      ]);
      expect(cues.update(room, 1100)).toEqual([]);
    }
  });
  it("does not replay a persisted sale on reload or reconnect", () => {
    const room = snapshot();
    room.status = "reveal";
    room.lot!.resolved = true;
    room.lot!.result = "sold";
    const cues = new AuctionCues();
    expect(cues.update(room, 20000)).toEqual([]);
    cues.prime(room, 20000);
    expect(cues.update(room, 21000)).toEqual([]);
  });
  it("does not tick while paused or catch up background calls when returning", () => {
    const room = snapshot(),
      cues = new AuctionCues();
    cues.prime(room, 0);
    room.status = "paused";
    expect(cues.update(room, 15000)).toEqual([]);
    room.status = "running";
    expect(cues.update(room, 18000, false)).toEqual([]);
    expect(cues.update(room, 18100)).toEqual([]);
  });
  it("follows an accepted bid's new deadline", () => {
    const room = snapshot(),
      cues = new AuctionCues();
    cues.prime(room, 0);
    cues.update(room, 18000);
    room.lot!.endsAt = 40000;
    expect(cues.update(room, 19000)).toEqual([]);
    expect(cues.update(room, 35000)).toContainEqual({
      type: "call",
      call: "once",
    });
  });
  it("does not catch up skipped seconds", () => {
    const room = snapshot(),
      cues = new AuctionCues();
    cues.prime(room, 0);
    expect(cues.update(room, 19000)).toEqual([{ type: "tick", seconds: 1 }]);
  });
  it("does not repeat countdown calls when the server clock offset fluctuates", () => {
    const room = snapshot(),
      cues = new AuctionCues();
    cues.prime(room, 0);
    expect(cues.update(room, 15000)).toContainEqual({
      type: "call",
      call: "once",
    });
    cues.update(room, 14900);
    expect(cues.update(room, 15100)).toEqual([]);
  });
  it("validates saved preferences, preserves legacy opt-in and clamps volume", () => {
    expect(parseAudioOptions(null).enabled).toBe(false);
    expect(parseAudioOptions(null, true).enabled).toBe(true);
    expect(parseAudioOptions({ volume: 500 }).volume).toBe(1);
    expect(parseAudioOptions({ volume: NaN }).volume).toBe(0.6);
    expect(parseAudioOptions({ timer: false }).timer).toBe(false);
  });
});
