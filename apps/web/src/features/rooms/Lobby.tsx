import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  Check,
  Crown,
  Flag,
  Lock,
  Play,
  ShieldCheck,
  Users,
  WifiOff,
  MessageSquare,
  X,
} from "lucide-react";
import {
  money,
  type RoomView,
  type Dataset,
  type Member,
  type Command,
} from "@cricket/shared";
import { TeamBadge } from "../../components/common";
import { Button } from "../../components/ui/button";
import { teamStyle } from "../../lib/teamTheme";
import { FranchiseCard, type FranchiseState } from "./FranchiseCard";
import { RoomMember } from "./RoomMember";
import { Chat } from "../chat/Chat";
import { Voice } from "../voice/Voice";
import { useMobilePanels } from "../auction/useMobilePanels";
type Act = (
  type: Command["type"],
  payload?: Command["payload"],
) => Promise<void>;
export function Lobby({
  room,
  dataset,
  me,
  host,
  locked,
  connected,
  pendingCommand,
  act,
}: {
  room: RoomView;
  dataset: Dataset;
  me: Member;
  host: boolean;
  locked: boolean;
  connected: boolean;
  pendingCommand?: Command["type"];
  act: Act;
}) {
  const [preview, setPreview] = useState(me.teamId);
  const [tab, setTab] = useState("Owners");
  const [unread, setUnread] = useState(0);
  const { isMobile, panel, setPanel, contextRef } = useMobilePanels();
  useEffect(() => setPreview(me.teamId), [me.teamId]);
  const team =
    dataset.teams.find((team) => team.id === preview) ?? dataset.teams[0];
  const owner = room.members.find((member) => member.teamId === team.id);
  const mine = owner?.id === me.id;
  const pending = pendingCommand === "team";
  const readyCount = room.members.filter(
    (member) => member.ready && member.connected,
  ).length;
  return (
    <div className="franchise-lobby">
      {isMobile && panel && (
        <button
          className="mobile-panel-overlay"
          aria-label="Close lobby panel"
          onClick={() => setPanel(undefined)}
        />
      )}
      <aside className="panel franchise-list-panel">
        <div className="franchise-list-heading">
          <span className="eyebrow">CHOOSE YOUR SIDE</span>
          <h2>
            The franchises<span>.</span>
          </h2>
          <p>Your colours. Your auction.</p>
        </div>
        <div className="franchise-list" aria-label="Franchises">
          {dataset.teams.map((team) => {
            const member = room.members.find(
              (member) => member.teamId === team.id,
            );
            const state: FranchiseState =
              pending && preview === team.id
                ? "pending"
                : member?.id === me.id
                  ? "selected"
                  : member
                    ? member.connected
                      ? "taken"
                      : "disconnected"
                    : "available";
            return (
              <FranchiseCard
                key={team.id}
                team={team}
                state={state}
                owner={member?.name}
                preview={preview === team.id}
                disabled={locked}
                onClick={() => setPreview(team.id)}
              />
            );
          })}
        </div>
        <p className="franchise-list-note">
          <ShieldCheck size={14} />
          Team changes reset readiness.
        </p>
      </aside>
      <div className="lobby-mobile-panels">
        <button
          onClick={() => {
            setTab("Owners");
            setPanel("context");
          }}
        >
          <Users size={17} />
          Owners {room.members.length}/{room.settings.maxTeams}
          <small>{readyCount} ready</small>
        </button>
        <button
          onClick={() => {
            setTab("Chat");
            setPanel("context");
          }}
        >
          <MessageSquare size={17} />
          Room chat{unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}
        </button>
      </div>
      <section className="franchise-lobby-center">
        <div className="panel franchise-stage" style={teamStyle(team)}>
          <div className="franchise-stage-watermark" aria-hidden="true">
            <TeamBadge team={team} />
          </div>
          <div className="franchise-stage-top">
            <span>
              <Flag size={14} />
              FRANCHISE DRAFT
            </span>
            <span>
              {String(dataset.teams.indexOf(team) + 1).padStart(2, "0")} /{" "}
              {dataset.teams.length}
            </span>
          </div>
          <motion.div
            key={team.id}
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.18 }}
            className="franchise-stage-identity"
          >
            <TeamBadge team={team} size="crest" />
            <span
              className={`franchise-ownership ${owner && !mine ? "taken" : ""}`}
            >
              {pending ? (
                "Pending selection · waiting for server"
              ) : mine ? (
                <>
                  <Check size={14} />
                  Selected by you
                </>
              ) : owner ? (
                <>
                  {owner.connected ? <Lock size={14} /> : <WifiOff size={14} />}
                  {owner.connected
                    ? `Taken by ${owner.name}`
                    : `${owner.name} · disconnected owner`}
                </>
              ) : (
                "Available to claim"
              )}
            </span>
            <h2>{team.name}</h2>
            <p>
              {mine
                ? `${me.name}, this is your franchise. Build a squad that owns the night.`
                : owner
                  ? "This franchise is reserved. Choose an available side to continue."
                  : "Pick your colours. Take your seat. Make every bid count."}
            </p>
          </motion.div>
          <div className="franchise-stage-rules">
            <span>
              Starting purse
              <strong>{money(room.settings.budget, dataset)}</strong>
            </span>
            <span>
              Squad slots<strong>{room.settings.squadSize}</strong>
            </span>
            <span>
              Overseas
              <strong>
                {dataset.domesticNations.length
                  ? room.settings.overseasCap
                  : "Open pool"}
              </strong>
            </span>
          </div>
          <div className="franchise-stage-actions">
            {!mine ? (
              <Button
                disabled={locked || !!owner}
                onClick={() => void act("team", { teamId: team.id })}
              >
                {pending
                  ? "Pending selection…"
                  : owner
                    ? "Franchise unavailable"
                    : "Select team"}
                <Flag size={17} />
              </Button>
            ) : (
              <Button
                disabled={locked}
                variant={me.ready ? "secondary" : "default"}
                onClick={() => void act("ready")}
              >
                <Check size={18} />
                {me.ready ? "Ready — click to undo" : "I’m ready"}
              </Button>
            )}
            {host && (
              <Button
                className="start-auction-button"
                disabled={
                  locked ||
                  room.members.length < 2 ||
                  readyCount !== room.members.length
                }
                onClick={() => void act("start")}
              >
                <Play size={18} />
                Start auction
              </Button>
            )}
          </div>
          <p className="lobby-ready-note">
            {room.members.length < 2
              ? "Invite at least one other owner to start."
              : `${readyCount}/${room.members.length} owners ready. ${host ? "Start when everyone is ready and connected." : "The host starts the auction when everyone is ready."}`}
          </p>
        </div>
        {host && (
          <details className="panel lobby-host-settings">
            <summary>
              <Crown size={16} />
              Host settings
            </summary>
            <div className="lobby-host-fields">
              <label>
                Bid timer
                <select
                  value={room.settings.timerSeconds}
                  disabled={locked}
                  onChange={(e) =>
                    void act("settings", {
                      timerSeconds: Number(e.target.value),
                    })
                  }
                >
                  {[5, 10, 20, 30, 45, 60, 90, 120].map((seconds) => (
                    <option key={seconds} value={seconds}>
                      {seconds} seconds
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Voice
                <select
                  value={String(room.settings.voice)}
                  disabled={locked}
                  onChange={(e) =>
                    void act("settings", { voice: e.target.value === "true" })
                  }
                >
                  <option value="false">Disabled</option>
                  <option value="true">Enabled</option>
                </select>
              </label>
              <Button
                variant="destructive"
                disabled={locked}
                onClick={() => {
                  if (confirm("Cancel this waiting room for every owner?"))
                    void act("cancel");
                }}
              >
                Cancel waiting room
              </Button>
            </div>
          </details>
        )}
      </section>
      <aside
        ref={contextRef}
        className={`panel lobby-context ${isMobile && panel === "context" ? "sheet-open" : ""}`}
        role={isMobile && panel ? "dialog" : undefined}
        aria-modal={isMobile && panel ? true : undefined}
        aria-label="Lobby room panels"
        tabIndex={-1}
      >
        <div className="mobile-sheet-heading">
          <h2>{tab === "Chat" ? "Room chat" : "The owners"}</h2>
          <button
            aria-label="Close lobby room panels"
            onClick={() => setPanel(undefined)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="lobby-context-title">
          <Users size={16} />
          <strong>THE LINEUP</strong>
          <span>
            {room.members.length}/{room.settings.maxTeams}
          </span>
        </div>
        <div className="segmented">
          <button
            className={tab === "Owners" ? "active" : ""}
            aria-pressed={tab === "Owners"}
            onClick={() => setTab("Owners")}
          >
            Owners
          </button>
          <button
            className={tab === "Chat" ? "active" : ""}
            aria-pressed={tab === "Chat"}
            onClick={() => setTab("Chat")}
          >
            Chat
          </button>
        </div>
        <div className="lobby-owner-list" hidden={tab !== "Owners"}>
          {room.members.map((member) => (
            <RoomMember
              key={member.id}
              member={member}
              dataset={dataset}
              isMe={member.id === me.id}
              isHost={room.hostId === member.userId}
              canManage={host && member.id !== me.id}
              locked={locked}
              act={act}
            />
          ))}
          {Array.from(
            {
              length: Math.max(0, room.settings.maxTeams - room.members.length),
            },
            (_, i) => (
              <div className="lobby-open-seat" key={i}>
                <Users size={17} />
                <span>
                  Waiting for an owner
                  <small>Share the room code to invite</small>
                </span>
              </div>
            ),
          )}
        </div>
        <div className="lobby-chat-pane" hidden={tab !== "Chat"}>
          <Chat
            room={room}
            disabled={locked}
            active={tab === "Chat" && (!isMobile || panel === "context")}
            onUnreadChange={setUnread}
          />
        </div>
        <Voice
          roomId={room.id}
          enabled={room.settings.voice}
          closed={!connected}
        />
        <div className="lobby-rules-note">
          <strong>Room rules</strong>
          <span>
            {room.settings.timerSeconds}s bid clock ·{" "}
            {money(room.settings.increment, dataset)} step
          </span>
          <span>
            {room.settings.reserveBudget
              ? "Minimum squad budget reserved"
              : "No minimum budget reservation"}
          </span>
        </div>
      </aside>
    </div>
  );
}
