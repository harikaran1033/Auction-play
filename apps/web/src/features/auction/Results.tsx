import { useState, useRef } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import {
  isForeign,
  money,
  type Dataset,
  type RoomView,
  type Member,
  type Player,
} from "@cricket/shared";
import { PageTitle, TeamBadge } from "../../components/common";
import { Button } from "../../components/ui/button";
import { PlayerStatsDialog } from "../players/PlayerStatsDialog";
export function Results({
  room,
  dataset,
  me,
}: {
  room: RoomView;
  dataset: Dataset;
  me: Member;
}) {
  const [selected, setSelected] = useState(me.id);
  const [inspectedPlayer, setInspectedPlayer] = useState<Player>();
  const statsSource = useRef<HTMLElement | null>(null);
  const member = room.members.find((m) => m.id === selected) ?? me;
  return (
    <>
      <PageTitle
        eyebrow="THE HAMMER HAS FALLEN"
        title="That’s your squad. Own it."
        description="Every signing, every smart bid. Your auction is in the books."
        action={
          <Button asChild>
            <Link to={`/squads/${room.id}`}>
              Set my playing XI <ArrowRight size={17} />
            </Link>
          </Button>
        }
      />
      <div className="results-grid">
        <div className="panel results-teams">
          <h2>The franchises</h2>
          {room.members.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelected(m.id)}
              className={m.id === selected ? "selected" : ""}
            >
              <TeamBadge team={dataset.teams.find((t) => t.id === m.teamId)} />
              <span>
                <strong>
                  {dataset.teams.find((t) => t.id === m.teamId)?.name}
                </strong>
                <small>
                  {m.name} · {m.purchases.length} signings
                </small>
                <span className="spend-bar">
                  <i
                    style={{
                      width: `${Math.max(0, Math.min(100, (100 * (room.settings.budget - m.budget)) / room.settings.budget))}%`,
                    }}
                  />
                </span>
              </span>
              <b title="Remaining purse">{money(m.budget, dataset)}</b>
            </button>
          ))}
        </div>
        <section className="panel results-squad">
          <h2>{dataset.teams.find((t) => t.id === member.teamId)?.name}</h2>
          <p>
            {member.purchases.length} signings · {money(member.budget, dataset)}{" "}
            remaining ·{" "}
            {
              member.purchases.filter((p) => {
                const x = dataset.players.find((x) => x.id === p.playerId);
                return x && isForeign(x, dataset);
              }).length
            }{" "}
            overseas
          </p>
          <div className="role-counts">
            {["batter", "bowler", "all-rounder", "wicket-keeper"].map(
              (role) => (
                <span key={role}>
                  {role}:{" "}
                  <b>
                    {
                      member.purchases.filter(
                        (p) =>
                          dataset.players.find((x) => x.id === p.playerId)
                            ?.role === role,
                      ).length
                    }
                  </b>
                </span>
              ),
            )}
          </div>
          {member.purchases.map((p) => (
            <button
              type="button"
              className="directory-row directory-player"
              key={p.lotId}
              onClick={(e) => {
                statsSource.current = e.currentTarget;
                setInspectedPlayer(
                  dataset.players.find((x) => x.id === p.playerId),
                );
              }}
            >
              <span className="player-initials">
                {dataset.players
                  .find((x) => x.id === p.playerId)
                  ?.name.slice(0, 2)}
              </span>
              <span>
                <strong>
                  {dataset.players.find((x) => x.id === p.playerId)?.name}
                </strong>
                <small>
                  {dataset.players.find((x) => x.id === p.playerId)?.role}{p.tradeId ? " · Acquired via trade" : ""}
                </small>
              </span>
              <b>{money(p.amount, dataset)}</b>
            </button>
          ))}
          {!member.purchases.length && (
            <p className="muted">No players purchased.</p>
          )}
        </section>
      </div>
      <section className="panel unsold-list">
        <h3>Unsold players · {room.unsold.length}</h3>
        <p>
          {room.unsold
            .map((id) => dataset.players.find((p) => p.id === id)?.name)
            .join(" · ") || "Every offered player found a home."}
        </p>
      </section>
      <PlayerStatsDialog
        player={inspectedPlayer}
        dataset={dataset}
        onClose={() => setInspectedPlayer(undefined)}
        returnFocusTo={statsSource.current}
      />
    </>
  );
}
