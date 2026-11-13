import { useEffect } from "react";
import type { Dataset } from "@cricket/shared";
import { useRoom } from "../auction/transport";
import { AuctionCues } from "./cues";
import {
  enableAudio,
  stopAuctionAudio,
  playTimerTick,
  announceCountdown,
  announceResult,
  useAuctionAudio,
} from "../../lib/auctionAudio";
export function useAuctionSounds(
  roomId: string | undefined,
  dataset: Dataset | undefined,
) {
  useEffect(() => {
    if (!roomId || !dataset) return;
    const tracker = new AuctionCues();
    let session: string | undefined;
    enableAudio();
    const process = () => {
      const state = useRoom.getState(),
        room = state.room;
      if (!room || room.id !== roomId) return;
      const now = Date.now() + state.offset,
        active =
          state.connected &&
          !!state.sessionId &&
          document.visibilityState === "visible";
      if (!active || session !== state.sessionId) {
        tracker.prime(room, now);
        session = state.sessionId;
        if (!active) stopAuctionAudio();
        return;
      }
      for (const cue of tracker.update(room, now)) {
        try {
          if (cue.type === "tick") playTimerTick(cue.seconds);
          else if (cue.type === "call") announceCountdown(cue.call);
          else if (state.suppressCelebrationLot !== room.lot?.id) {
            const player = dataset.players.find(
                (player) => player.id === cue.playerId,
              ),
              winner = room.members.find(
                (member) => member.id === cue.winnerId,
              );
            announceResult(
              cue.result,
              player?.name ?? "This player",
              dataset.teams.find((team) => team.id === winner?.teamId)
                ?.shortName,
            );
          }
        } catch {
          useAuctionAudio.setState({
            error: "Audio playback is unavailable in this browser.",
          });
        }
      }
    };
    process();
    const timer = setInterval(process, 150),
      unsubscribe = useRoom.subscribe(process);
    document.addEventListener("visibilitychange", process);
    return () => {
      clearInterval(timer);
      unsubscribe();
      document.removeEventListener("visibilitychange", process);
      stopAuctionAudio();
    };
  }, [roomId, dataset]);
}
