import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ArrowRight, RotateCcw } from "lucide-react";
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
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
