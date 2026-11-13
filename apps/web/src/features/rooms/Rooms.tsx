import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  Plus,
  Search,
  Users,
  KeyRound,
  Lock,
  Copy,
  Check,
} from "lucide-react";
import {
  settingsSchema,
  money,
  type Settings,
  type RoomView,
} from "@cricket/shared";
import { api } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { MyRooms } from "./MyRooms";
import { FranchiseCard } from "./FranchiseCard";
import { creditsToUnits } from "../../lib/moneyInput";
import {
  PageTitle,
  Loading,
  ErrorState,
  TeamBadge,
  type LeagueSummary,
} from "../../components/common";
export function Rooms() {
  const [search, setSearch] = useState("");
  const [league, setLeague] = useState("");
  const [page, setPage] = useState(1);
  const leagues = useQuery({
    queryKey: ["leagues"],
    queryFn: () => api<LeagueSummary[]>("/leagues"),
  });
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["rooms", search, league, page],
    queryFn: () =>
      api(
        `/rooms?search=${encodeURIComponent(search)}&league=${league}&page=${page}`,
      ),
    refetchInterval: 10000,
  });
  return (
    <>
      <PageTitle
        eyebrow="THERE’S A SEAT WITH YOUR NAME ON IT"
        title="Find your next rivalry."
        description="Join a waiting room, or make a little competition of your own."
        action={
          <Button asChild>
            <Link to="/rooms/create">
              <Plus size={17} />
              Create room
            </Link>
          </Button>
        }
      />
      <MyRooms showEmpty />
      <div className="room-toolbar">
        <div className="search-field">
          <Search size={18} />
          <input
            aria-label="Search rooms"
            placeholder="Search for a room…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          aria-label="Filter league"
          value={league}
          onChange={(e) => {
            setLeague(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All leagues</option>
          {leagues.data
            ?.filter((d) => !d.fixture)
            .map((d) => (
              <option value={d.id} key={d.id}>
                {d.league}
              </option>
            ))}
        </select>
        <Button asChild variant="secondary">
          <Link to="/join">
            <KeyRound size={16} />
            Join with code
          </Link>
        </Button>
      </div>
      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorState
          error={error}
          retry={() => {
            void refetch();
          }}
        />
      ) : data?.rooms.length ? (
        <>
          <div className="rooms-grid">
            {data.rooms.map((r: any) => (
              <article className="panel room-card" key={r.id}>
                <div className="room-card-top">
                  <span className="live-pill">WAITING FOR PLAYERS</span>
                  {r.passwordRequired && <Lock size={16} />}
                </div>
                <h2>{r.name}</h2>
                <p>{leagues.data?.find((d) => d.id === r.datasetId)?.league}</p>
                <div className="room-stats">
                  <span>
                    <Users size={15} />
                    {r.members} / {r.maxTeams} owners
                  </span>
                  <span>{money(r.budget)} budget</span>
                  <span>{r.squadSize} players / squad</span>
                </div>
                <Button asChild variant="secondary">
                  <Link to={`/join?code=${r.code}`}>
                    Take a seat <ArrowRight size={16} />
                  </Link>
                </Button>
              </article>
            ))}
          </div>
          <div className="pagination">
            <Button
              variant="ghost"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span>Page {page}</span>
            <Button
              variant="ghost"
              disabled={page * 12 >= data.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </>
      ) : (
        <div className="panel empty-state">
          <Users size={34} />
          <h2>The clubhouse is quiet.</h2>
          <p>Create the first room and invite your friends.</p>
          <Button asChild>
            <Link to="/rooms/create">
              Start an auction <ArrowRight size={17} />
            </Link>
          </Button>
        </div>
      )}
    </>
  );
}
export function CreateRoom() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [budgetInput, setBudgetInput] = useState("100");
  const [incrementInput, setIncrementInput] = useState("0.10");
  const leagues = useQuery({
    queryKey: ["leagues"],
    queryFn: () => api<LeagueSummary[]>("/leagues"),
  });
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Settings>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: "The Friday Night Auction",
      datasetId: params.get("league") ?? "ipl",
      teamId: "",
      visibility: "private",
      password: "",
      maxTeams: 6,
      budget: 10000,
      squadSize: 15,
      overseasCap: 8,
      timerSeconds: 20,
      increment: 10,
      reserveBudget: true,
      voice: true,
    },
  });
  const values = watch();
  const league = leagues.data?.find((d) => d.id === values.datasetId);
  const submit = handleSubmit(async (values) => {
    setError("");
    try {
      const room = await api<RoomView>("/rooms", {
        method: "POST",
        body: JSON.stringify(values),
      });
      navigate(`/rooms/${room.id}/lobby`);
    } catch (e) {
      setError((e as Error).message);
    }
  });
  if (leagues.isPending) return <Loading />;
  if (leagues.error) return <ErrorState error={leagues.error} />;
  return (
    <>
      <PageTitle
        eyebrow="YOUR ROOM. YOUR RULES."
        title="Set the stage."
        description="Choose your league, claim your colours, and get the crew together."
      />
      <form className="create-layout" onSubmit={submit}>
        <div>
          <section className="panel form-section">
            <div className="step-heading">
              <span>01</span>
              <div>
                <h2>Choose your competition</h2>
                <p>Player pools and teams come from your uploaded datasets.</p>
              </div>
            </div>
            <div className="league-options">
              {leagues.data
                ?.filter((d) => !d.fixture)
                .map((d) => (
                  <button
                    type="button"
                    key={d.id}
                    className={`league-option ${values.datasetId === d.id ? "selected" : ""}`}
                    onClick={() => {
                      setValue("datasetId", d.id);
                      setValue("teamId", "");
                      setValue("maxTeams", Math.min(6, d.teams.length));
                    }}
                  >
                    <strong>{d.id.toUpperCase()}</strong>
                    <small>
                      {d.playerCount} players · {d.teams.length} teams
                    </small>
                    {values.datasetId === d.id && <Check size={15} />}
                  </button>
                ))}
            </div>
          </section>
          <section className="panel form-section">
            <div className="step-heading">
              <span>02</span>
              <div>
                <h2>Claim your colours</h2>
                <p>Every franchise gets one owner. Make this one yours.</p>
              </div>
            </div>
            <div className="team-options">
              {league?.teams.map((team) => (
                <FranchiseCard
                  key={team.id}
                  team={team}
                  state={values.teamId === team.id ? "preview" : "available"}
                  preview={values.teamId === team.id}
                  onClick={() =>
                    setValue("teamId", team.id, { shouldValidate: true })
                  }
                />
              ))}
            </div>
            {errors.teamId && (
              <p className="error-text">Choose a team to continue.</p>
            )}
          </section>
          <section className="panel form-section">
            <div className="step-heading">
              <span>03</span>
              <div>
                <h2>Make it your auction</h2>
                <p>Settings freeze when the first player takes the stage.</p>
              </div>
            </div>
            <div className="form-grid">
              <label className="span-2">
                Room name
                <input {...register("name")} />
              </label>
              <label>
                Visibility
                <select {...register("visibility")}>
                  <option value="private">Private · invite only</option>
                  <option value="public">Public · discoverable</option>
                </select>
              </label>
              <label>
                Room password (optional)
                <input
                  type="password"
                  autoComplete="new-password"
                  {...register("password")}
                />
              </label>
              <label>
                Maximum owners
                <input
                  type="number"
                  min="2"
                  max={league?.teams.length ?? 10}
                  {...register("maxTeams", { valueAsNumber: true })}
                />
              </label>
              <label>
                Starting purse (credits)
                <input
                  inputMode="decimal"
                  value={budgetInput}
                  onChange={(e) => {
                    setBudgetInput(e.target.value);
                    setValue("budget", creditsToUnits(e.target.value) ?? 0);
                  }}
                  placeholder="100"
                />
              </label>
              <label>
                Players per squad
                <input
                  type="number"
                  min="1"
                  max="25"
                  {...register("squadSize", { valueAsNumber: true })}
                />
              </label>
              <label>
                Overseas player cap
                <input
                  type="number"
                  min="0"
                  max="25"
                  {...register("overseasCap", { valueAsNumber: true })}
                />
              </label>
              <label>
                Bid timer (seconds)
                <input
                  type="number"
                  min="5"
                  max="120"
                  {...register("timerSeconds", { valueAsNumber: true })}
                />
              </label>
              <label>
                Bid step (credits)
                <input
                  inputMode="decimal"
                  value={incrementInput}
                  onChange={(e) => {
                    setIncrementInput(e.target.value);
                    setValue("increment", creditsToUnits(e.target.value) ?? 0);
                  }}
                  placeholder="0.10"
                />
              </label>
            </div>
            <label className="checkbox-label">
              <input type="checkbox" {...register("reserveBudget")} />
              Reserve minimum budget for remaining squad slots
            </label>
            <label className="checkbox-label">
              <input type="checkbox" {...register("voice")} />
              Enable optional voice chat
            </label>
            <small className="muted">
              {league?.domesticNations.length
                ? `Domestic nations: ${league.domesticNations.join(", ")}. All other nations count as overseas.`
                : "International pool: overseas limits do not apply."}
            </small>
            {Object.entries(errors)
              .filter(([key]) => key !== "teamId")
              .map(([key, value]) => (
                <p className="error-text" key={key}>
                  {key === "budget"
                    ? "Starting purse: enter 1–10,000 credits, with up to two decimals."
                    : key === "increment"
                      ? "Bid step: enter 0.01–100 credits, with up to two decimals."
                      : `${key}: ${String(value?.message)}`}
                </p>
              ))}
          </section>
        </div>
        <aside className="panel create-summary">
          <span className="eyebrow">YOUR AUCTION, AT A GLANCE</span>
          <TeamBadge
            team={league?.teams.find((t) => t.id === values.teamId)}
            size="large"
          />
          <h2>
            {league?.teams.find((t) => t.id === values.teamId)?.name ??
              "Choose your franchise"}
          </h2>
          <p>{league?.league}</p>
          <dl>
            <div>
              <dt>Starting purse</dt>
              <dd>{money(values.budget, league)}</dd>
            </div>
            <div>
              <dt>Squad size</dt>
              <dd>{values.squadSize} players</dd>
            </div>
            <div>
              <dt>Auction clock</dt>
              <dd>{values.timerSeconds}s / bid</dd>
            </div>
            <div>
              <dt>Room access</dt>
              <dd>{values.visibility}</dd>
            </div>
          </dl>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating…" : "Create my room"}
            <ArrowRight size={17} />
          </Button>
          <small>
            Once created, share your invite code. You’ll take the first seat as
            host.
          </small>
        </aside>
      </form>
    </>
  );
}
export function JoinRoom() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState<any>();
  const [teamId, setTeamId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const leagues = useQuery({
    queryKey: ["leagues"],
    queryFn: () => api<LeagueSummary[]>("/leagues"),
  });
  const league = leagues.data?.find((d) => d.id === invite?.settings.datasetId);
  async function resolve(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await api("/invites/resolve", {
        method: "POST",
        body: JSON.stringify({ code, password }),
      });
      if (data.rejoinPath) {
        navigate(data.rejoinPath);
        return;
      }
      setInvite(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function join() {
    setBusy(true);
    setError("");
    try {
      const room = await api<RoomView>(`/rooms/${invite.id}/join`, {
        method: "POST",
        body: JSON.stringify({ teamId, password }),
      });
      navigate(`/rooms/${room.id}/lobby`);
    } catch (e) {
      setError((e as Error).message);
      try {
        const latest = await api("/invites/resolve", {
          method: "POST",
          body: JSON.stringify({ code, password }),
        });
        if (latest.rejoinPath) {
          navigate(latest.rejoinPath);
          return;
        }
        setInvite(latest);
        if (latest.takenTeams.includes(teamId)) setTeamId("");
      } catch {
        /* Preserve the selection error if refreshing availability fails. */
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="THE INVITATION IS YOURS"
        title="Meet you in the room."
        description="Enter an invitation code, then claim an available franchise."
      />
      <div className="panel join-panel">
        {!invite ? (
          <form onSubmit={resolve}>
            <KeyRound className="accent" size={30} />
            <h2>A seat at the auction table.</h2>
            <label>
              Room code
              <input
                autoFocus
                className="code-input"
                value={code}
                maxLength={20}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="A1B2C3D4"
                required
              />
            </label>
            <label>
              Password (if required)
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <Button disabled={busy || !code}>
              {busy ? "Finding your room…" : "Find room"}
              <ArrowRight size={17} />
            </Button>
          </form>
        ) : (
          <>
            <span className="live-pill">INVITATION FOUND</span>
            <h2>{invite.name}</h2>
            <p>
              {league?.league} · {money(invite.settings.budget)} budget
            </p>
            <div className="team-options">
              {league?.teams.map((t) => (
                <FranchiseCard
                  key={t.id}
                  team={t}
                  state={
                    invite.takenTeams.includes(t.id)
                      ? "taken"
                      : busy && teamId === t.id
                        ? "pending"
                        : teamId === t.id
                          ? "preview"
                          : "available"
                  }
                  preview={teamId === t.id}
                  disabled={busy || invite.takenTeams.includes(t.id)}
                  onClick={() => setTeamId(t.id)}
                />
              ))}
            </div>
            <Button onClick={join} disabled={busy || !teamId}>
              {busy ? "Reserving your team…" : "Join the room"}
              <ArrowRight size={17} />
            </Button>
            <Button variant="ghost" onClick={() => setInvite(undefined)}>
              Use another invitation
            </Button>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(
            `${location.origin}/join?code=${code}`,
          );
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}{" "}
      {copied ? "Invite copied" : code}
    </Button>
  );
}
