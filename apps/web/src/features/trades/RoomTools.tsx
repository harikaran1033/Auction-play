import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { SlidersHorizontal, X, ArrowRightLeft, Volume2 } from "lucide-react";
import type { Dataset, TradeState } from "@cricket/shared";
import { Button } from "../../components/ui/button";
import { useAuth } from "../../lib/api";
import { useTrades } from "./useTrades";
import { TradeCenter } from "./TradeCenter";
import { AudioSettings } from "../audio/AudioSettings";
import { enableAudio } from "../../lib/auctionAudio";
export function RoomTools({
  roomId,
  dataset,
  squad = false,
}: {
  roomId: string;
  dataset: Dataset;
  squad?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState(squad ? "trades" : "audio");
  const query = useTrades(roomId),
    client = useQueryClient(),
    userId = useAuth((state) => state.user?.id);
  const me = query.data?.room.members.find(
      (member) => member.userId === userId,
    ),
    count =
      query.data?.offers.filter(
        (offer) => offer.status === "pending" && offer.toMemberId === me?.id,
      ).length ?? 0;
  const update = (state: TradeState) =>
    client.setQueryData(["trades", roomId, userId], state);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className="room-tools-trigger"
          aria-label={squad ? "Trade players" : "Auction audio and trades"}
          onClick={() => {
            enableAudio();
            if (count) setTab("trades");
          }}
        >
          <SlidersHorizontal size={16} />
          <span>{squad ? "Trade players" : "Audio & trades"}</span>
          {count > 0 && <b>{count}</b>}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="room-tools-overlay" />
        <Dialog.Content className="room-tools-dialog">
          <div className="room-tools-heading">
            <div>
              <Dialog.Title>Make the room yours.</Dialog.Title>
              <Dialog.Description>
                Personal audio and agreed player trades.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button aria-label="Close audio and trades">
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>
          <div className="segmented room-tools-tabs">
            <button
              className={tab === "audio" ? "active" : ""}
              aria-pressed={tab === "audio"}
              onClick={() => setTab("audio")}
            >
              <Volume2 size={16} />
              Audio
            </button>
            <button
              className={tab === "trades" ? "active" : ""}
              aria-pressed={tab === "trades"}
              onClick={() => setTab("trades")}
            >
              <ArrowRightLeft size={16} />
              Trades{count > 0 && <span>{count}</span>}
            </button>
          </div>
          <div className="room-tools-body">
            {tab === "audio" ? (
              <AudioSettings />
            ) : query.data ? (
              <TradeCenter
                state={query.data}
                dataset={dataset}
                onUpdated={update}
              />
            ) : query.error ? (
              <p role="alert" className="form-error">
                {query.error instanceof Error
                  ? query.error.message
                  : "Trade offers could not be loaded."}
              </p>
            ) : (
              <p role="status">Loading trade desk…</p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
