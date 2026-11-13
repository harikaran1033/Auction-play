import { useState, useRef } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Plus,
  ArrowUpRight,
  Check,
  Search,
  X,
  Users,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import type { Dataset, Player } from "@cricket/shared";
import { money } from "@cricket/shared";
import { api } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { MyRooms } from "../rooms/MyRooms";
import { PlayerStatsDialog } from "../players/PlayerStatsDialog";
import {
  ErrorState,
  Loading,
  TeamBadge,
  type LeagueSummary,
} from "../../components/common";
const leagueArt: Record<string, { tag: string; label: string; color: string }> =
  {
    ipl: { tag: "INDIA", label: "IPL", color: "#e9b45c" },
    hundred: { tag: "ENGLAND & WALES", label: "100", color: "#83bbd7" },
    sa20: { tag: "SOUTH AFRICA", label: "SA20", color: "#93c2a0" },
    bbl: { tag: "AUSTRALIA", label: "BBL", color: "#a49bd1" },
    cpl: { tag: "CARIBBEAN", label: "CPL", color: "#e4a477" },
    mlc: { tag: "UNITED STATES", label: "MLC", color: "#8baedf" },
    odi: { tag: "INTERNATIONAL", label: "ODI", color: "#8ac7c1" },
    test: { tag: "INTERNATIONAL", label: "TEST", color: "#c0c8b0" },
  };
export function Home() {
  const {
    data: leagues,
    error,
    isPending,
    refetch,
  } = useQuery({
    queryKey: ["leagues"],
    queryFn: () => api<LeagueSummary[]>("/leagues"),
  });
  const [category, setCategory] = useState("Leagues");
  const [selected, setSelected] = useState<string>();
  const real = leagues?.filter((d) => !d.fixture) ?? [];
  const playerCount = real.reduce(
    (count, dataset) => count + dataset.playerCount,
    0,
  );
  const filtered = real.filter(
    (d) =>
      category === "All datasets" ||
      (category === "Internationals"
        ? ["odi", "test"].includes(d.id)
        : !["odi", "test"].includes(d.id)),
  );
  return (
    <div className="home">
      <div className="welcome">
        <div>
          <div className="eyebrow">
            <span className="status-dot" /> YOUR NEXT AUCTION STARTS HERE
          </div>
          <h1>
            Welcome to the clubhouse<span className="accent">.</span>
          </h1>
          <p>Create a room, join your friends, or resume your auction.</p>
        </div>
        <span className="edition">
          THE AUCTION EDITION <span>01 / CR</span>
        </span>
      </div>
      <section className="hero home-actions-panel">
        <div className="hero-copy">
          <span className="eyebrow">SET THE STAGE</span>
          <h2>
            Your franchise.
            <br />
            Your rules.
          </h2>
          <p>
            Choose a league, invite your friends, and make your next great
            signing.
          </p>
          <div className="hero-actions">
            <Button asChild>
              <Link to="/rooms/create">
                <Plus size={17} />
                Create room
                <ArrowUpRight size={16} />
              </Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link to="/join">
                Join with code
                <ArrowRight size={16} />
              </Link>
            </Button>
          </div>
        </div>
        <div className="home-pool-summary">
          <div className="home-franchise-marks" aria-hidden="true">
            {real
              .find((league) => league.id === "ipl")
              ?.teams.slice(0, 3)
              .map((team) => (
                <TeamBadge key={team.id} team={team} />
              ))}
          </div>
          <div>
            <strong>{real.length}</strong>
            <span>Leagues & formats</span>
          </div>
          <div>
            <strong>{playerCount.toLocaleString()}</strong>
            <span>Player entries</span>
          </div>
        </div>
      </section>
      <MyRooms />
      <section className="league-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">PICK YOUR PLAYING FIELD</div>
            <h2>Choose your competition.</h2>
            <p>
              Explore the player pool. Find your league. Set your own rules.
            </p>
          </div>
          <div className="segmented">
            {["Leagues", "Internationals", "All datasets"].map((c) => (
              <button
                key={c}
                className={c === category ? "active" : ""}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        {isPending ? (
          <Loading message="Loading your league data…" />
        ) : error ? (
          <ErrorState
            error={error}
            retry={() => {
              void refetch();
            }}
          />
        ) : (
          <div className="league-grid">
            {filtered.map((league, index) => {
              const art = leagueArt[league.id];
              return (
                <article
                  key={league.id}
                  className="league-card"
                  style={
                    {
                      "--league-color": art?.color ?? "#70dfb4",
                    } as React.CSSProperties
                  }
                >
                  <div className="league-art">
                    <span className="league-country">{art?.tag}</span>
                    <span className="league-emblem">{art?.label}</span>
                    <span className="league-sequence">
                      LEAGUE / {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="league-stripe" />
                  </div>
                  <div className="league-body">
                    <div className="league-title">
                      <h3>{league.league}</h3>
                      <ArrowUpRight size={18} />
                    </div>
                    <div className="league-metadata">
                      <span>
                        <Users size={13} />
                        {league.teams.length} teams
                      </span>
                      <span>{league.playerCount} players</span>
                    </div>
                    <div className="league-card-footer">
                      <span>
                        <span className="status-dot" /> DATA READY
                      </span>
                      <button onClick={() => setSelected(league.id)}>
                        Explore players <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      <div className="data-note">
        <Check size={14} /> Using your uploaded player files. Seasons are
        unspecified; prices are auction credits, not verified contract values.
      </div>
      <Dialog.Root
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>Player directory</Dialog.Title>
            <Dialog.Description>
              Explore the supplied dataset before creating a room.
            </Dialog.Description>
            <Dialog.Close className="dialog-close" aria-label="Close">
              <X size={20} />
            </Dialog.Close>
            {selected && <Directory id={selected} />}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
function Directory({ id }: { id: string }) {
  const { data, error } = useQuery({
    queryKey: ["dataset", id],
    queryFn: () => api<Dataset>(`/leagues/${id}`),
  });
  const [search, setSearch] = useState("");
  const [inspectedPlayer, setInspectedPlayer] = useState<Player>();
  const statsSource = useRef<HTMLElement | null>(null);
  if (error) return <ErrorState error={error} />;
  if (!data) return <Loading />;
  return (
    <>
      <div className="search-field">
        <Search size={17} />
        <input
          placeholder="Search players, roles, nations…"
          aria-label="Search players"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <p className="muted">
        {data.league} · {data.players.length} players · {data.teams.length}{" "}
        source teams
      </p>
      <div className="directory">
        {data.players
          .filter((p) =>
            `${p.name} ${p.nation} ${p.role}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((p) => (
            <button
              type="button"
              className="directory-row directory-player"
              key={p.id}
              onClick={(event) => {
                statsSource.current = event.currentTarget;
                setInspectedPlayer(p);
              }}
              aria-label={`View stats for ${p.name}`}
            >
              <span className="player-initials">
                {p.name
                  .split(" ")
                  .slice(0, 2)
                  .map((s) => s[0])
                  .join("")}
              </span>
              <span>
                <strong>{p.name}</strong>
                <small>
                  {p.nation} · {p.role}
                </small>
              </span>
              <b>{money(p.basePrice, data)}</b>
            </button>
          ))}
      </div>
      <Button asChild>
        <Link to={`/rooms/create?league=${id}`}>
          Create {data.league} room <ArrowRight size={16} />
        </Link>
      </Button>
      <PlayerStatsDialog
        player={inspectedPlayer}
        dataset={data}
        onClose={() => setInspectedPlayer(undefined)}
        returnFocusTo={statsSource.current}
      />
    </>
  );
}
