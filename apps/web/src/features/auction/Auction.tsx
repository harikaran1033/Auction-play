import { PlayerPortrait } from "../players/PlayerPortrait";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Crown,
  Gavel,
  Globe,
  Pause,
  Play,
  Radio,
  Wallet,
  X,
  ChartNoAxesCombined,
  ArrowUpRight,
  Users,
  MessageSquare,
  List,
} from "lucide-react";
import {
  ineligible,
  isForeign,
  money,
  nextBid,
  type Command,
  type Dataset,
  type RoomView,
  type Member,
  type Player,
} from "@cricket/shared";
import { useRoom } from "./transport";
import { TeamBadge, Loading } from "../../components/common";
import { Button } from "../../components/ui/button";
import { Chat } from "../chat/Chat";
import { Voice } from "../voice/Voice";
import { api } from "../../lib/api";
import { PlayerStatsDialog } from "../players/PlayerStatsDialog";
import { playerHighlights, datasetContext } from "../players/stats";
import { AuctionCountdown } from "./Countdown";
import { useMobilePanels } from "./useMobilePanels";
import { teamStyle } from "../../lib/teamTheme";
import { RoomMemberMenu } from "../rooms/RoomMember";
import { CopySquadButton } from "../../components/CopySquadButton";
type Act = (
  type: Command["type"],
  payload?: Command["payload"],
) => Promise<void>;
export function Auction({
  room,
  dataset,
  me,
  host,
  locked,
  act,
  pendingCommand,
  voiceRequest = 0,
  onVoiceStatus,
}: {
  room: RoomView;
  dataset: Dataset;
  me: Member;
  host: boolean;
  locked: boolean;
  act: Act;
  pendingCommand?: Command["type"];
  voiceRequest?: number;
  onVoiceStatus?: (state: { joined: boolean; muted: boolean }) => void;
}) {
  const [tab, setTab] = useState("Teams");
  const [chatUnread, setChatUnread] = useState(0);
  const { isMobile, panel, setPanel, squadRef, contextRef } = useMobilePanels();
  const initialPurchases = useRef(new Set(me.purchases.map((p) => p.lotId)));
  const [inspectedPlayer, setInspectedPlayer] = useState<Player>();
  const statsSource = useRef<HTMLElement | null>(null);
  const inspect = (player: Player, source: HTMLElement) => {
    statsSource.current = source;
    setInspectedPlayer(player);
  };
  const [, setExpiredTick] = useState(0);
  const expire = useCallback(() => setExpiredTick((n) => n + 1), []);
  const offset = useRoom((s) => s.offset);
  const lot = room.lot;
  const connected = useRoom((s) => s.connected);
  const suppressCelebrationLot = useRoom((s) => s.suppressCelebrationLot);
  const player = dataset.players.find((p) => p.id === lot?.playerId);
  const expired = !!lot && Date.now() + offset >= lot.endsAt;
  const highlights = useMemo(
    () => (player ? playerHighlights(player) : []),
    [player],
  );
  const scope = useMemo(() => datasetContext(dataset), [dataset]);
  useEffect(() => {
    me.purchases.forEach((p) => initialPurchases.current.add(p.lotId));
  }, [me.purchases]);
  useEffect(() => {
    if (!voiceRequest) return;
    setTab("Chat");
    if (isMobile) setPanel("context");
    requestAnimationFrame(() =>
      contextRef.current?.querySelector<HTMLElement>(".voice button")?.focus(),
    );
  }, [voiceRequest]);
  const next = dataset.players.find((p) => p.id === room.queue[0]);
  const nextSet = room.auctionSets?.find(
    (set) => next && set.playerIds.includes(next.id),
  );
  useEffect(() => {
    if (next?.imageUrl) {
      const image = new Image();
      image.src = next.imageUrl;
    }
  }, [next?.id]);
  const currentTeam = dataset.teams.find((t) => t.id === me.teamId);
  const highest = room.members.find((m) => m.id === lot?.highest);
  const canBid = player ? ineligible(room, me, player, dataset) : undefined;
  const isPassed = lot?.passed.includes(me.id);
  const isHighest = lot?.highest === me.id;
  const foreign = me.purchases.filter((p) => {
    const player = dataset.players.find((x) => x.id === p.playerId);
    return player && isForeign(player, dataset);
  }).length;
  return (
    <>
      <div className="auction-overview">
        <div>
          <span className="status-dot" />
          <strong>
            {room.status === "paused"
              ? "Auction paused"
              : room.status === "unsold_decision"
                ? "Round complete"
                : "Auction room"}
          </strong>
          <span>
            {room.members.filter((m) => m.connected).length}/
            {room.members.length} owners connected
          </span>
        </div>
        <span>
          Round {room.round} <i /> {room.lots.length} lots resolved <i />{" "}
          {room.queue.length} in queue
        </span>
      </div>
      {isMobile && panel && (
        <button
          className="mobile-panel-overlay"
          aria-label="Close room panel"
          onClick={() => setPanel(undefined)}
        />
      )}
      <div
        className={`auction-grid ${isMobile && panel ? "mobile-panel-open" : ""}`}
      >
        <aside
          ref={squadRef}
          className={`panel my-team ${isMobile && panel === "squad" ? "sheet-open" : ""}`}
          role={isMobile && panel === "squad" ? "dialog" : undefined}
          aria-modal={isMobile && panel === "squad" ? true : undefined}
          aria-label="My squad"
          style={teamStyle(currentTeam)}
          tabIndex={-1}
        >
          <div className="mobile-sheet-heading">
            <h2>My squad</h2>
            <button
              aria-label="Close squad"
              onClick={() => setPanel(undefined)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="section-label">
            YOUR FRANCHISE <span>OWNER</span>
          </div>
          <TeamBadge team={currentTeam} size="large" />
          <h2>{currentTeam?.name}</h2>
          <p>{me.name}</p>
          <CopySquadButton
            member={me}
            dataset={dataset}
            roomName={room.settings.name}
          />
          <div className="budget-display">
            <span>
              <Wallet size={14} />
              AVAILABLE PURSE
            </span>
            <motion.strong
              key={me.budget}
              initial={{ opacity: 0.4, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {money(me.budget, dataset)}
            </motion.strong>
            <small>
              of {money(room.settings.budget, dataset)} starting budget
            </small>
            <div
              className="purse-track"
              role="progressbar"
              aria-label="Budget remaining"
              aria-valuemin={0}
              aria-valuemax={room.settings.budget}
              aria-valuenow={me.budget}
            >
              <span
                style={{
                  width: `${Math.max(0, Math.min(100, (me.budget / room.settings.budget) * 100))}%`,
                }}
              />
            </div>
          </div>
          <div className="squad-numbers">
            <div>
              <b>
                {me.purchases.length}
                <small>/{room.settings.squadSize}</small>
              </b>
              <span>Squad</span>
            </div>
            <div>
              <b>
                {foreign}
                <small>/{room.settings.overseasCap}</small>
              </b>
              <span>Overseas</span>
            </div>
          </div>
          <div className="section-label">
            MY SIGNINGS <span>{me.purchases.length}</span>
          </div>
          <div className="my-signings">
            {!me.purchases.length && (
              <p className="muted">Your next great signing is waiting.</p>
            )}
            {me.purchases.map((p) => (
              <motion.button
                type="button"
                className="signing-player"
                onClick={(e) => {
                  const selected = dataset.players.find(
                    (x) => x.id === p.playerId,
                  );
                  if (selected) inspect(selected, e.currentTarget);
                }}
                initial={
                  initialPurchases.current.has(p.lotId)
                    ? false
                    : { opacity: 0, x: -8 }
                }
                animate={{ opacity: 1, x: 0 }}
                key={p.lotId}
              >
                <span>
                  {dataset.players.find((x) => x.id === p.playerId)?.name}
                </span>
                <b>{money(p.amount, dataset)}</b>
              </motion.button>
            ))}
          </div>
        </aside>
        <section className="auction-center" inert={isMobile && !!panel}>
          <div className={`panel lot-panel ${isHighest ? "is-leading" : ""}`}>
            {room.status === "unsold_decision" ? (
              <div className="decision">
                <Gavel size={40} />
                <span className="eyebrow">THAT’S THE ROUND</span>
                <h2>{room.unsold.length} players remain unsold.</h2>
                <p>
                  {host
                    ? "Give them another chance, or call it an auction."
                    : "Waiting for the host to rerun unsold players or finish."}
                </p>
                {host && (
                  <div className="flex gap-2">
                    <Button
                      disabled={locked}
                      onClick={() => {
                        void act("rerun");
                      }}
                    >
                      Rerun unsold
                    </Button>
                    <Button
                      disabled={locked}
                      variant="secondary"
                      onClick={() => {
                        void act("finish");
                      }}
                    >
                      Finish auction
                    </Button>
                  </div>
                )}
              </div>
            ) : player && lot ? (
              <>
                <div className="lot-content">
                  <div className="lot-top">
                    <span className="live-pill">
                      <Radio size={12} />
                      {room.status === "paused"
                        ? "PAUSED"
                        : lot.resolved
                          ? "HAMMER DOWN"
                          : "ON THE BLOCK"}
                    </span>
                    <span>
                      ROUND {room.round}{" "}
                      <span className="muted">
                        / LOT {room.lots.length + (lot.resolved ? 0 : 1)}
                      </span>
                    </span>
                  </div>
                  {lot.setLabel && (
                    <div className="auction-set-banner">
                      <List size={14} />
                      <strong>{lot.setLabel}</strong>
                      <span>
                        {room.settings.bidMode === "tiered"
                          ? "Amount-based bids"
                          : "Fixed bid step"}
                      </span>
                    </div>
                  )}
                  <AnimatePresence mode="wait">
                    <motion.button
                      type="button"
                      key={lot.id}
                      className="player-stage player-card-trigger"
                      aria-label={`View stats for ${player.name}`}
                      onClick={(e) => inspect(player, e.currentTarget)}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -15 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                    >
                      <PlayerPortrait player={player} />
                      <span className="player-nation">
                        <Globe size={13} />
                        {player.nation}{" "}
                        {dataset.domesticNations.length
                          ? isForeign(player, dataset)
                            ? "· OVERSEAS"
                            : "· DOMESTIC"
                          : "· OPEN POOL"}
                      </span>
                      <h2>{player.name}</h2>
                      <div className="role-chip">
                        {player.role.replace("-", " ").toUpperCase()}
                      </div>
                      <p className="muted player-style">
                        {[player.battingStyle, player.bowlingStyle]
                          .filter(Boolean)
                          .join(" · ") || "Style not supplied"}
                      </p>
                      <span className="player-dataset-context">
                        {scope.format} · {scope.season}
                      </span>
                      <span className="player-stats-hint">
                        <ChartNoAxesCombined size={15} />
                        View player intelligence
                        <ArrowUpRight size={14} />
                      </span>
                    </motion.button>
                  </AnimatePresence>
                  {highlights.length > 0 && (
                    <div className="player-quick-stats">
                      {highlights.map((stat) => (
                        <div key={stat.key}>
                          <strong>{stat.value}</strong>
                          <span>{stat.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="auction-bid-console">
                  <div className="bid-display">
                    <span className="stage-base-price">
                      Base price {money(player.basePrice, dataset)}
                    </span>
                    <span>{lot.highest ? "CURRENT BID" : "OPENING PRICE"}</span>
                    <motion.strong
                      key={lot.bid}
                      initial={{ opacity: 0.5 }}
                      animate={{ opacity: 1 }}
                    >
                      {money(lot.highest ? lot.bid : player.basePrice, dataset)}
                    </motion.strong>
                    {highest ? (
                      <div
                        className="highest-bidder"
                        style={teamStyle(
                          dataset.teams.find(
                            (team) => team.id === highest.teamId,
                          ),
                        )}
                      >
                        <TeamBadge
                          team={dataset.teams.find(
                            (t) => t.id === highest.teamId,
                          )}
                          size="tiny"
                        />
                        <span>{highest.name} holds the bid</span>
                        {isHighest && <b>YOU</b>}
                      </div>
                    ) : (
                      <small className="muted">
                        Be the first to raise the paddle.
                      </small>
                    )}
                  </div>
                  <AuctionCountdown
                    endsAt={lot.endsAt}
                    offset={offset}
                    duration={room.settings.timerSeconds}
                    paused={room.status === "paused"}
                    resolved={lot.resolved}
                    onExpired={expire}
                  />
                  {lot.resolved && (
                    <motion.div
                      className={`sold-stamp ${lot.result}`}
                      initial={
                        suppressCelebrationLot === lot.id
                          ? false
                          : { scale: 1.4, rotate: -12, opacity: 0 }
                      }
                      animate={{ scale: 1, rotate: -7, opacity: 1 }}
                    >
                      {lot.result?.toUpperCase()}
                      {lot.result === "sold" && highest && (
                        <small>
                          {
                            dataset.teams.find(
                              (team) => team.id === highest.teamId,
                            )?.shortName
                          }{" "}
                          · {money(lot.bid, dataset)}
                        </small>
                      )}
                    </motion.div>
                  )}
                  <div className="bid-controls">
                    <Button
                      disabled={
                        locked ||
                        room.status !== "running" ||
                        expired ||
                        !!canBid ||
                        isPassed ||
                        isHighest
                      }
                      onClick={() => {
                        void act("bid");
                      }}
                    >
                      <Gavel size={19} />
                      {!connected
                        ? "Reconnecting…"
                        : room.status === "paused"
                          ? "Auction paused"
                          : lot.resolved || expired
                            ? "Resolving…"
                            : pendingCommand === "bid"
                              ? "Submitting bid…"
                              : isHighest
                                ? "You hold the bid"
                                : isPassed
                                  ? "Passed this lot"
                                  : (canBid ??
                                    `Bid ${money(nextBid(room, player), dataset)}`)}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={
                        locked ||
                        room.status !== "running" ||
                        expired ||
                        isPassed ||
                        isHighest
                      }
                      onClick={() => {
                        void act("pass");
                      }}
                    >
                      {pendingCommand === "pass"
                        ? "Passing…"
                        : isPassed
                          ? "Passed"
                          : "Pass"}
                    </Button>
                  </div>
                  <small className="bid-note">
                    {room.status === "paused"
                      ? "Auction paused. Accepted bids remain binding."
                      : (canBid ??
                        (isPassed
                          ? "Pass is final for this lot."
                          : "Bids reset the clock. Passing is final for this player."))}
                  </small>
                </div>
              </>
            ) : (
              <Loading />
            )}
          </div>
          <div className="mobile-auction-summary">
            <TeamBadge team={currentTeam} size="tiny" />
            <span>
              Purse<strong>{money(me.budget, dataset)}</strong>
            </span>
            <span>
              Squad
              <strong>
                {me.purchases.length}/{room.settings.squadSize}
              </strong>
            </span>
            <span>
              Overseas
              <strong>
                {dataset.domesticNations.length
                  ? `${foreign}/${room.settings.overseasCap}`
                  : "Open pool"}
              </strong>
            </span>
          </div>

          {host && (
            <div className="host-auction-controls">
              <span>
                <Crown size={14} />
                HOST CONTROLS
              </span>
              {room.status === "running" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={locked}
                  onClick={() => {
                    void act("pause");
                  }}
                >
                  <Pause size={14} />
                  Pause
                </Button>
              ) : room.status === "paused" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={locked}
                  onClick={() => {
                    void act("resume");
                  }}
                >
                  <Play size={14} />
                  Resume
                </Button>
              ) : null}
            </div>
          )}
          <div className="queue-preview">
            <span className="eyebrow">UP NEXT</span>
            {next ? (
              <button
                className="queue-player"
                onClick={(e) => inspect(next, e.currentTarget)}
              >
                {next.name}
                <ArrowUpRight size={13} />
              </button>
            ) : (
              <strong>End of this round</strong>
            )}
            <span className="muted">
              {nextSet ? `${nextSet.label} · ` : ""}
              {room.queue.length} in queue · {room.unsold.length} unsold
            </span>
          </div>
        </section>
        <aside
          ref={contextRef}
          className={`panel auction-side ${isMobile && panel === "context" ? "sheet-open" : ""}`}
          role={isMobile && panel === "context" ? "dialog" : undefined}
          aria-modal={isMobile && panel === "context" ? true : undefined}
          aria-label="Room panels"
          tabIndex={-1}
        >
          <div className="mobile-sheet-heading">
            <h2>
              {tab === "Chat"
                ? "Room chat"
                : tab === "Activity"
                  ? "Live activity"
                  : "Teams"}
            </h2>
            <button
              aria-label="Close room panels"
              onClick={() => setPanel(undefined)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="segmented right-tabs">
            {["Teams", "Activity", "Chat"].map((t) => (
              <button
                key={t}
                className={t === tab ? "active" : ""}
                aria-pressed={t === tab}
                onClick={() => setTab(t)}
              >
                {t}
                {t === "Chat" && chatUnread > 0 && (
                  <span className="unread-count">
                    {chatUnread > 99 ? "99+" : chatUnread}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="context-pane" hidden={tab !== "Chat"}>
            <Chat
              room={room}
              disabled={locked}
              active={tab === "Chat" && (!isMobile || panel === "context")}
              onUnreadChange={setChatUnread}
            />
          </div>
          <div className="context-pane" hidden={tab !== "Teams"}>
            <div className="teams-list">
              {room.members.map((m) => (
                <div key={m.id}>
                  <TeamBadge
                    team={dataset.teams.find((t) => t.id === m.teamId)}
                    size="tiny"
                  />
                  <span>
                    <strong>{m.name}</strong>
                    <small>
                      {m.purchases.length}/{room.settings.squadSize} players ·{" "}
                      {m.connected ? "Online" : "Away"}
                    </small>
                  </span>
                  <b>{money(m.budget, dataset)}</b>
                  {host && m.id !== me.id && !m.blocked && (
                    <RoomMemberMenu memberName={m.name}>
                      <button
                        aria-label={`Make ${m.name} host`}
                        disabled={locked || !m.connected}
                        onClick={() => {
                          void act("transfer", { memberId: m.id });
                        }}
                      >
                        <Crown size={14} />
                        Make host
                      </button>
                      <button
                        aria-label={`Remove ${m.name}`}
                        disabled={locked}
                        onClick={() => {
                          void act("kick", { memberId: m.id });
                        }}
                      >
                        <X size={14} />
                        Remove owner
                      </button>
                      {room.settings.voice && (
                        <button
                          aria-label={`Disconnect ${m.name} from voice`}
                          disabled={locked}
                          onClick={() => {
                            void api(`/rooms/${room.id}/voice/remove`, {
                              method: "POST",
                              body: JSON.stringify({
                                userId: m.userId,
                                sessionId: useRoom.getState().sessionId,
                              }),
                            }).catch((e) => window.alert((e as Error).message));
                          }}
                        >
                          Mute voice
                        </button>
                      )}
                    </RoomMemberMenu>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="context-pane" hidden={tab !== "Activity"}>
            <div className="activity-list">
              {room.bids
                .slice(-40)
                .reverse()
                .map((b) => (
                  <div key={b.id}>
                    <Gavel size={14} />
                    <p>
                      <strong>
                        {room.members.find((m) => m.id === b.memberId)?.name}
                      </strong>{" "}
                      bid {money(b.amount, dataset)}
                      <small>
                        {dataset.players.find(
                          (p) =>
                            p.id ===
                            room.lots.find((l) => l.id === b.lotId)?.playerId,
                        )?.name ?? player?.name}
                      </small>
                    </p>
                  </div>
                ))}
              {!room.bids.length && (
                <p className="muted">The first paddle is yet to rise.</p>
              )}
            </div>
          </div>

          <Voice
            roomId={room.id}
            enabled={room.settings.voice}
            closed={!connected}
            onStatusChange={onVoiceStatus}
          />
        </aside>
      </div>
      <nav className="mobile-auction-nav" aria-label="Auction panels">
        <button
          onClick={(e) => {
            if (player) inspect(player, e.currentTarget);
          }}
        >
          <ChartNoAxesCombined size={18} />
          Stats
        </button>
        <button onClick={() => setPanel("squad")}>
          <List size={18} />
          Squad
        </button>
        <button
          onClick={() => {
            setTab("Teams");
            setPanel("context");
          }}
        >
          <Users size={18} />
          Teams
        </button>
        <button
          onClick={() => {
            setTab("Chat");
            setPanel("context");
          }}
        >
          <MessageSquare size={18} />
          Chat{chatUnread > 0 && <b>{chatUnread > 99 ? "99+" : chatUnread}</b>}
        </button>
      </nav>
      <PlayerStatsDialog
        player={inspectedPlayer}
        dataset={dataset}
        onClose={() => setInspectedPlayer(undefined)}
        returnFocusTo={statsSource.current}
        live={{
          endsAt: lot?.endsAt ?? 0,
          offset,
          amount: lot?.highest ? lot.bid : (player?.basePrice ?? 0),
          name: player?.name ?? "Current lot",
          paused: room.status === "paused",
          closed: !!lot?.resolved || room.status === "unsold_decision",
        }}
      />
    </>
  );
}
