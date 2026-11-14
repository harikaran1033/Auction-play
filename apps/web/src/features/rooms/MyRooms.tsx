import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "react-router";
import { ArrowRight, RotateCcw, Trash2, X } from "lucide-react";
import type { OwnedRoomSummary } from "@cricket/shared";
import { api, useAuth } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { TeamBadge, type LeagueSummary } from "../../components/common";

const statusLabels: Record<OwnedRoomSummary["status"], string> = {
  lobby: "In the lobby",
  running: "Auction in progress",
  reveal: "Auction in progress",
  paused: "Auction paused",
  unsold_decision: "Awaiting host decision",
  completed: "Completed",
  cancelled: "Cancelled",
};
export function MyRooms({ showEmpty = false }: { showEmpty?: boolean }) {
  const [selected, setSelected] = useState<OwnedRoomSummary>();
  const [endForEveryone, setEndForEveryone] = useState(false);
  const [removing, setRemoving] = useState(false),
    [removeError, setRemoveError] = useState("");
  const userId = useAuth((s) => s.user?.id);
  const { data, error, isPending, refetch, isFetching } = useQuery({
    queryKey: ["my-rooms", userId],
    queryFn: () => api<OwnedRoomSummary[]>("/me/rooms"),
    enabled: !!userId,
    staleTime: 0,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const leagues = useQuery({
    queryKey: ["leagues"],
    queryFn: () => api<LeagueSummary[]>("/leagues"),
    enabled: !!userId,
  });
  if (!userId || (!showEmpty && !error && !isPending && !data?.length))
    return null;
  return (
    <section className="panel my-rooms" aria-label="My rooms">
      <div className="my-rooms-heading">
        <div>
          <span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span>
          <h2>My rooms</h2>
          <p>
            Your auctions stay linked to your account, including private rooms.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void refetch();
          }}
          disabled={isFetching}
          aria-label="Refresh my rooms"
        >
          <RotateCcw size={15} />
        </Button>
      </div>
      {isPending ? (
        <p className="muted" role="status">
          Finding your rooms…
        </p>
      ) : error ? (
        <div className="my-rooms-empty">
          <p role="alert">
            Couldn’t load your rooms. Check your connection and try again.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void refetch();
            }}
          >
            Try again
          </Button>
        </div>
      ) : !data?.length ? (
        <p className="muted">
          Rooms you create or join will appear here. To find a previous auction,
          sign in with the same account you used to join it.
        </p>
      ) : (
        <div className="my-rooms-list">
          {data.map((room) => {
            const league = leagues.data?.find((d) => d.id === room.datasetId);
            const team = league?.teams.find((t) => t.id === room.teamId);
            return (
              <article className="my-room-row" key={room.id}>
                <TeamBadge team={team} />
                <div className="my-room-description">
                  <span className="my-room-status">
                    <span className="status-dot" />
                    {statusLabels[room.status]}
                  </span>
                  <h3>{room.name}</h3>
                  <p>
                    {team?.name ??
                      league?.league ??
                      room.datasetId.toUpperCase()}{" "}
                    · {room.purchaseCount} signings
                  </p>
                </div>
                <Button
                  asChild
                  variant={
                    room.status === "completed" ? "secondary" : "default"
                  }
                  size="sm"
                >
                  <Link to={room.path}>
                    {room.status === "completed"
                      ? "View results"
                      : room.status === "lobby"
                        ? "Return to lobby"
                        : "Rejoin auction"}
                    <ArrowRight size={15} />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete room: ${room.name}`}
                  onClick={() => {
                    setSelected(room);
                    setEndForEveryone(false);
                    setRemoveError("");
                  }}
                >
                  <Trash2 size={17} />
                </Button>
              </article>
            );
          })}
        </div>
      )}
      <Dialog.Root
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !removing) setSelected(undefined);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="room-tools-overlay" />
          <Dialog.Content className="room-tools-dialog room-delete-dialog">
            <div className="room-tools-heading">
              <div>
                <Dialog.Title>Remove this room?</Dialog.Title>
                <Dialog.Description>{selected?.name}</Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button aria-label="Close delete room" disabled={removing}>
                  <X size={20} />
                </button>
              </Dialog.Close>
            </div>
            <div className="room-tools-body">
              <p>
                This removes the room from your My rooms list and leaves the
                auction. Your saved squad stays available after completion.
                Other owners can continue playing.
              </p>
              {selected?.isHost && selected.status !== "completed" && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={endForEveryone}
                    onChange={(e) => setEndForEveryone(e.target.checked)}
                  />
                  Also end this auction for everyone
                </label>
              )}
              {endForEveryone && (
                <p className="form-error">
                  All owners will be disconnected and this auction will be
                  closed.
                </p>
              )}
              {removeError && (
                <p role="alert" className="form-error">
                  {removeError}
                </p>
              )}
              <div className="squad-actions">
                <Button
                  variant="destructive"
                  disabled={removing}
                  onClick={async () => {
                    if (!selected) return;
                    setRemoving(true);
                    setRemoveError("");
                    try {
                      await api(`/me/rooms/${selected.id}`, {
                        method: "DELETE",
                        body: JSON.stringify({ endForEveryone }),
                      });
                      await refetch();
                      setSelected(undefined);
                    } catch (error) {
                      setRemoveError(
                        error instanceof Error
                          ? error.message
                          : "Could not remove the room.",
                      );
                    } finally {
                      setRemoving(false);
                    }
                  }}
                >
                  {removing
                    ? "Removing…"
                    : endForEveryone
                      ? "End auction and delete"
                      : "Delete from My rooms"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={removing}
                  onClick={() => setSelected(undefined)}
                >
                  Keep room
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
