import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Check, X, Send } from "lucide-react";
import {
  money,
  type Dataset,
  type Member,
  type TradeState,
  type TradeOffer,
} from "@cricket/shared";
import { useAuth, api } from "../../lib/api";
import { creditsToUnits } from "../../lib/moneyInput";
import { useRoom } from "../auction/transport";
import { PlayerPortrait } from "../players/PlayerPortrait";
import { TeamBadge } from "../../components/common";
import { Button } from "../../components/ui/button";
function Side({
  title,
  ids,
  cash,
  dataset,
}: {
  title: string;
  ids: string[];
  cash: number;
  dataset: Dataset;
}) {
  return (
    <div className="trade-summary-side">
      <strong>{title}</strong>
      {ids.map((id) => (
        <span key={id}>
          {dataset.players.find((player) => player.id === id)?.name ?? id}
        </span>
      ))}
      {cash > 0 && <b>{money(cash, dataset)}</b>}
      {!ids.length && !cash && <span>No items</span>}
    </div>
  );
}
export function TradeCenter({
  state,
  dataset,
  onUpdated,
}: {
  state: TradeState;
  dataset: Dataset;
  onUpdated: (state: TradeState) => void;
}) {
  const userId = useAuth((state) => state.user?.id),
    client = useQueryClient();
  const { room, offers } = state,
    me = room.members.find((member) => member.userId === userId)!;
  const peers = room.members.filter(
    (member) =>
      member.userId !== userId &&
      !member.blocked &&
      !room.blocks.includes(member.userId) &&
      (room.status === "completed" || !member.left),
  );
  const [targetId, setTargetId] = useState(""),
    [give, setGive] = useState<string[]>([]),
    [receive, setReceive] = useState<string[]>([]),
    [giveCash, setGiveCash] = useState("0"),
    [receiveCash, setReceiveCash] = useState("0");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const lastRequest = useRef<{ key: string; id: string } | undefined>(
    undefined,
  );
  const target = peers.find((member) => member.id === targetId) ?? peers[0];
  const live = room.status !== "completed",
    unavailable = ["lobby", "cancelled"].includes(room.status);
  const connected = useRoom(
    (state) => state.connected && state.room?.id === room.id,
  );
  const ready = !live || connected;
  useEffect(() => {
    setGive((ids) =>
      ids.filter((id) =>
        me?.purchases.some((purchase) => purchase.playerId === id),
      ),
    );
    setReceive((ids) =>
      ids.filter((id) =>
        target?.purchases.some((purchase) => purchase.playerId === id),
      ),
    );
  }, [me?.purchases, target?.purchases]);
  if (!me) return <p>Sign in to your team to view trades.</p>;
  async function request(path: string, body: unknown) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await api<TradeState>(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      onUpdated(next);
      void client.invalidateQueries({ queryKey: ["squad", room.id] });
      void client.invalidateQueries({ queryKey: ["squads"] });
      return next;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The trade could not be saved.",
      );
      void client.invalidateQueries({ queryKey: ["trades", room.id] });
    } finally {
      setBusy(false);
    }
  }
  async function propose(event: React.FormEvent) {
    event.preventDefault();
    if (!target) return;
    const offeredCash = creditsToUnits(giveCash),
      requestedCash = creditsToUnits(receiveCash);
    if (offeredCash === undefined || requestedCash === undefined) {
      setError("Enter credits with at most two decimal places.");
      return;
    }
    const fields = {
        toMemberId: target.id,
        offeredPlayerIds: [...give].sort(),
        requestedPlayerIds: [...receive].sort(),
        offeredCash,
        requestedCash,
      },
      key = JSON.stringify(fields);
    if (lastRequest.current?.key !== key)
      lastRequest.current = { key, id: crypto.randomUUID() };
    const next = await request(`/rooms/${room.id}/trades`, {
      ...fields,
      requestId: lastRequest.current.id,
      sessionId: useRoom.getState().sessionId,
    });
    if (next) {
      lastRequest.current = undefined;
      setGive([]);
      setReceive([]);
      setGiveCash("0");
      setReceiveCash("0");
      setMessage(
        "Offer sent. Players and credits move only when the other owner accepts.",
      );
    }
  }
  async function respond(
    offer: TradeOffer,
    action: "accept" | "reject" | "cancel",
  ) {
    const next = await request(`/rooms/${room.id}/trades/${offer.id}/respond`, {
      action,
      sessionId: useRoom.getState().sessionId,
    });
    if (next)
      setMessage(
        action === "accept"
          ? "Trade completed. Both squads and purses are updated."
          : action === "reject"
            ? "Offer rejected. Nothing changed hands."
            : "Offer cancelled. Nothing changed hands.",
      );
  }
  function players(
    member: Member,
    selected: string[],
    update: (ids: string[]) => void,
    label: string,
  ) {
    return (
      <div className="trade-player-list" role="group" aria-label={label}>
        {member.purchases.map((purchase) => {
          const player = dataset.players.find(
            (player) => player.id === purchase.playerId,
          );
          if (!player) return null;
          return (
            <label
              className={`trade-player ${selected.includes(player.id) ? "selected" : ""}`}
              key={player.id}
            >
              <input
                type="checkbox"
                aria-label={`${label}: ${player.name}`}
                checked={selected.includes(player.id)}
                disabled={
                  busy ||
                  (!selected.includes(player.id) && selected.length >= 5)
                }
                onChange={(event) =>
                  update(
                    event.target.checked
                      ? [...selected, player.id]
                      : selected.filter((id) => id !== player.id),
                  )
                }
              />
              <PlayerPortrait player={player} className="trade-portrait" />
              <span>
                <strong>{player.name}</strong>
                <small>{player.role.replaceAll("-", " ")}</small>
              </span>
            </label>
          );
        })}
        {!member.purchases.length && (
          <p className="muted">No players signed yet.</p>
        )}
      </div>
    );
  }
  const pending = offers
      .filter((offer) => offer.status === "pending")
      .sort((a, b) => b.createdAt - a.createdAt),
    history = offers
      .filter((offer) => offer.status !== "pending")
      .sort(
        (a, b) => (b.resolvedAt ?? b.createdAt) - (a.resolvedAt ?? a.createdAt),
      );
  function offerCard(offer: TradeOffer) {
    const from = room.members.find(
        (member) => member.id === offer.fromMemberId,
      ),
      to = room.members.find((member) => member.id === offer.toMemberId),
      incoming = offer.toMemberId === me.id;
    return (
      <article
        className={`trade-offer ${offer.status}`}
        key={offer.id}
        aria-label={`Trade from ${from?.name} to ${to?.name}`}
      >
        <div className="trade-offer-heading">
          <span>
            <ArrowRightLeft size={15} />
            {from?.name} <span aria-hidden="true">→</span> {to?.name}
          </span>
          <strong>{offer.status}</strong>
        </div>
        <div className="trade-exchange">
          <Side
            title={`${from?.name} gives`}
            ids={offer.offeredPlayerIds}
            cash={offer.offeredCash}
            dataset={dataset}
          />
          <ArrowRightLeft size={19} />
          <Side
            title={`${to?.name} gives`}
            ids={offer.requestedPlayerIds}
            cash={offer.requestedCash}
            dataset={dataset}
          />
        </div>
        {offer.reason && <p className="muted">{offer.reason}</p>}
        {offer.status === "pending" ? (
          <>
            <p className="trade-offer-note">
              Expires {new Date(offer.expiresAt).toLocaleString()}. Acceptance
              rechecks both squads and available credits.
            </p>
            <div className="trade-offer-actions">
              {incoming ? (
                <>
                  <Button
                    disabled={busy || !ready}
                    onClick={() => void respond(offer, "accept")}
                  >
                    <Check size={16} />
                    Accept trade
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy || !ready}
                    onClick={() => void respond(offer, "reject")}
                  >
                    <X size={16} />
                    Reject
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  disabled={busy || !ready}
                  onClick={() => void respond(offer, "cancel")}
                >
                  Cancel offer
                </Button>
              )}
            </div>
          </>
        ) : (
          <small className="muted">
            {offer.status === "accepted"
              ? "Completed · squads and credits transferred"
              : "No players or credits transferred"}
          </small>
        )}
      </article>
    );
  }
  return (
    <div className="trade-center">
      <div className="trade-intro">
        <h3>Build a deal. Get both owners' agreement.</h3>
        <p>
          Swap players, offer credits, or combine both. Pending offers do not
          move or reserve anything.
        </p>
      </div>
      <div className="trade-my-budget">
        <TeamBadge
          team={dataset.teams.find((team) => team.id === me.teamId)}
          size="tiny"
        />
        <span>
          Your purse<strong>{money(me.budget, dataset)}</strong>
        </span>
        <span>
          Squad
          <strong>
            {me.purchases.length}/{room.settings.squadSize}
          </strong>
        </span>
      </div>
      {!ready && (
        <p role="status" className="notice">
          Reconnect to the auction before sending or accepting live trades.
        </p>
      )}
      {unavailable ? (
        <p className="notice">Trading opens once the auction starts.</p>
      ) : !target ? (
        <p className="notice">
          Another franchise must join before you can trade.
        </p>
      ) : (
        <form className="trade-form" onSubmit={(event) => void propose(event)}>
          <label>
            Trade with
            <select
              aria-label="Trade with"
              value={target.id}
              disabled={busy}
              onChange={(event) => {
                setTargetId(event.target.value);
                setReceive([]);
                lastRequest.current = undefined;
              }}
            >
              {peers.map((member) => (
                <option key={member.id} value={member.id}>
                  {
                    dataset.teams.find((team) => team.id === member.teamId)
                      ?.name
                  }{" "}
                  · {member.name}
                </option>
              ))}
            </select>
          </label>
          <div className="trade-columns">
            <fieldset disabled={busy || !ready}>
              <legend>You offer</legend>
              {players(me, give, setGive, "Offer player")}
              <label>
                {dataset.unit === "inr"
                  ? "Amount you offer (₹ Cr)"
                  : "Credits you offer"}
                <input
                  inputMode="decimal"
                  value={giveCash}
                  onChange={(event) => setGiveCash(event.target.value)}
                />
              </label>
            </fieldset>
            <fieldset disabled={busy || !ready}>
              <legend>You request</legend>
              {players(target, receive, setReceive, "Request player")}
              <label>
                {dataset.unit === "inr"
                  ? "Amount you request (₹ Cr)"
                  : "Credits you request"}
                <input
                  inputMode="decimal"
                  value={receiveCash}
                  onChange={(event) => setReceiveCash(event.target.value)}
                />
              </label>
              <small>Other team's purse: {money(target.budget, dataset)}</small>
            </fieldset>
          </div>
          <p className="muted">
            Choose up to five players per side. Put credits on one side only.
            Squad and overseas limits still apply.
          </p>
          <Button type="submit" disabled={busy || !ready}>
            <Send size={16} />
            {busy ? "Saving…" : "Send trade offer"}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <section className="trade-pending">
        <h3>
          Pending offers <span>{pending.length}</span>
        </h3>
        {pending.length ? (
          pending.map(offerCard)
        ) : (
          <p className="muted">
            No pending offers. Only you and the other owner can view your
            offers.
          </p>
        )}
      </section>
      {history.length > 0 && (
        <details className="trade-history">
          <summary>Trade history · {history.length}</summary>
          {history.map(offerCard)}
        </details>
      )}
    </div>
  );
}
