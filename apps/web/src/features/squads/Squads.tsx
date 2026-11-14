import { useState, useEffect } from "react";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Trophy, Save } from "lucide-react";
import { type Dataset, type Member, money } from "@cricket/shared";
import { api, useAuth } from "../../lib/api";
import {
  PageTitle,
  Loading,
  ErrorState,
  TeamBadge,
} from "../../components/common";
import { Button } from "../../components/ui/button";
import { PlayerPortrait } from "../players/PlayerPortrait";
import { teamStyle } from "../../lib/teamTheme";
import { RoomTools } from "../trades/RoomTools";
import { CopySquadButton } from "../../components/CopySquadButton";
export function Squads() {
  const userId = useAuth((s) => s.user?.id);
  const { data, error, isPending } = useQuery({
    queryKey: ["squads", userId],
    queryFn: () => api<any[]>("/squads"),
    refetchInterval: 10000,
  });
  return (
    <>
      <PageTitle
        eyebrow="THE SQUADS YOU BUILT"
        title="Your franchise collection."
        description="Auction nights end. Good squads stay with you."
      />
      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} />
      ) : !data?.length ? (
        <div className="panel empty-state">
          <Trophy size={36} />
          <h2>Your trophy cabinet starts here.</h2>
          <p>Complete an auction to save your first squad.</p>
          <Button asChild>
            <Link to="/rooms">
              Find an auction <ArrowRight size={17} />
            </Link>
          </Button>
        </div>
      ) : (
        <div className="rooms-grid">
          {data.map((s) => (
            <article className="panel room-card" key={s.roomId}>
              <span className="eyebrow">
                {s.datasetId.toUpperCase()} / COMPLETED
              </span>
              <h2>{s.roomName}</h2>
              <p>
                {s.member.purchases.length} signings ·{" "}
                {money(s.member.budget, undefined, s.currency)} remaining
              </p>
              <Button asChild variant="secondary">
                <Link to={`/squads/${s.roomId}`}>
                  Manage squad <ArrowRight size={16} />
                </Link>
              </Button>
              <CopySquadButton
                member={s.member}
                roomName={s.roomName}
                datasetId={s.datasetId}
                currency={s.currency}
              />
            </article>
          ))}
        </div>
      )}
    </>
  );
}
export function SquadDetail() {
  const { squadId } = useParams();
  const userId = useAuth((s) => s.user?.id);
  const { data, error } = useQuery({
    queryKey: ["squad", squadId, userId],
    queryFn: () =>
      api<{
        member: Member;
        datasetId: string;
        roomName: string;
        currency?: "credits" | "inr";
      }>(`/squads/${squadId}`),
  });
  const { data: dataset, error: datasetError } = useQuery({
    queryKey: ["dataset", data?.datasetId],
    enabled: !!data,
    queryFn: () => api<Dataset>(`/leagues/${data!.datasetId}`),
  });
  if (error || datasetError)
    return <ErrorState error={error ?? datasetError} />;
  if (!data || !dataset) return <Loading />;
  return (
    <Lineup
      key={data.member.id}
      member={data.member}
      dataset={{
        ...dataset,
        unit: data.currency === "inr" ? "inr" : dataset.unit,
      }}
      roomId={squadId!}
    />
  );
}
function Lineup({
  member,
  dataset,
  roomId,
}: {
  member: Member;
  dataset: Dataset;
  roomId: string;
}) {
  const [selected, setSelected] = useState(member.lineup);
  const [captain, setCaptain] = useState(member.captain ?? "");
  const [vice, setVice] = useState(member.viceCaptain ?? "");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const ownership = member.purchases
    .map((purchase) => purchase.playerId)
    .sort()
    .join("|");
  useEffect(() => {
    const owned = new Set(
      member.purchases.map((purchase) => purchase.playerId),
    );
    setSelected((ids) => ids.filter((id) => owned.has(id)));
    setCaptain((id) => (owned.has(id) ? id : ""));
    setVice((id) => (owned.has(id) ? id : ""));
  }, [ownership]);
  async function save() {
    setBusy(true);
    try {
      await api(`/squads/${roomId}/lineup`, {
        method: "PUT",
        body: JSON.stringify({ players: selected, captain, viceCaptain: vice }),
      });
      setMessage("Playing XI saved.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div
        className="squad-franchise-heading"
        style={teamStyle(
          dataset.teams.find((team) => team.id === member.teamId),
        )}
      >
        <TeamBadge
          team={dataset.teams.find((team) => team.id === member.teamId)}
        />
        <PageTitle
          eyebrow="BACK YOUR BEST ELEVEN"
          title={
            dataset.teams.find((t) => t.id === member.teamId)?.name ??
            "Your squad"
          }
          description="Choose your playing XI, captain and vice-captain. Your auction purchases stay saved."
          action={
            <div className="squad-actions">
              <CopySquadButton
                member={member}
                dataset={dataset}
                roomName={dataset.league}
              />
              <RoomTools roomId={roomId} dataset={dataset} squad />
              <Button disabled={busy} onClick={save}>
                <Save size={17} />
                Save lineup
              </Button>
            </div>
          }
        />
      </div>
      <div className="panel saved-squad-summary">
        <span>
          Available purse<strong>{money(member.budget, dataset)}</strong>
        </span>
        <span>
          Squad signed<strong>{member.purchases.length} players</strong>
        </span>
        <span>
          Auction value
          <strong>
            {money(
              member.purchases.reduce((total, p) => total + p.amount, 0),
              dataset,
            )}
          </strong>
        </span>
      </div>
      <div className="squad-toolbar">
        <input
          aria-label="Search squad"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find a player…"
        />
        <select
          aria-label="Filter roles"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="all">All roles</option>
          {["batter", "bowler", "all-rounder", "wicket-keeper"].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <span>
          {selected.length} / {Math.min(11, member.purchases.length)} selected
        </span>
      </div>
      <section className="panel lineup-panel">
        {member.purchases.some((purchase) => purchase.tradeId) && (
          <p className="muted text-sm">
            Player values below are original auction prices. Trade payments are
            reflected in your purse and trade history.
          </p>
        )}
        <TeamBadge team={dataset.teams.find((t) => t.id === member.teamId)} />
        {["batter", "wicket-keeper", "all-rounder", "bowler"]
          .filter((r) => role === "all" || r === role)
          .map((r) => (
            <div key={r}>
              <h3 className="eyebrow">{r.toUpperCase()}</h3>
              {member.purchases
                .filter((p) => {
                  const x = dataset.players.find((x) => x.id === p.playerId);
                  return (
                    x?.role === r &&
                    x.name.toLowerCase().includes(search.toLowerCase())
                  );
                })
                .map((p) => {
                  const player = dataset.players.find(
                    (x) => x.id === p.playerId,
                  )!;
                  return (
                    <label
                      className="directory-row lineup-row"
                      key={p.playerId}
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(p.playerId)}
                        onChange={(e) => {
                          setSelected((ids) =>
                            e.target.checked
                              ? [...ids, p.playerId]
                              : ids.filter((id) => id !== p.playerId),
                          );
                          if (!e.target.checked) {
                            if (captain === p.playerId) setCaptain("");
                            if (vice === p.playerId) setVice("");
                          }
                        }}
                      />
                      <PlayerPortrait
                        player={player}
                        className="lineup-portrait"
                      />
                      <span>
                        <strong>{player.name}</strong>
                        <small>
                          {player.nation}
                          {p.tradeId ? " · Acquired via trade" : ""}
                        </small>
                      </span>
                      <b>{money(p.amount, dataset)}</b>
                    </label>
                  );
                })}
            </div>
          ))}
        <div className="form-grid">
          <label>
            Captain
            <select
              value={captain}
              onChange={(e) => setCaptain(e.target.value)}
            >
              <option value="">Choose captain</option>
              {selected.map((id) => (
                <option value={id} key={id}>
                  {dataset.players.find((p) => p.id === id)?.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Vice-captain
            <select value={vice} onChange={(e) => setVice(e.target.value)}>
              <option value="">Choose vice-captain</option>
              {selected
                .filter((id) => id !== captain)
                .map((id) => (
                  <option value={id} key={id}>
                    {dataset.players.find((p) => p.id === id)?.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
      </section>
    </>
  );
}
