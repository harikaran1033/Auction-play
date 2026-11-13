import { useEffect, useState, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity,
  ArrowLeft,
  ChartNoAxesCombined,
  Clock3,
  Globe,
  Shield,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import { money, isForeign, type Dataset, type Player } from "@cricket/shared";
import { Button } from "../../components/ui/button";
import {
  statItems,
  playerHighlights,
  boundaryBreakdown,
  datasetContext,
} from "./stats";
import { useLiveSeconds } from "../auction/Countdown";
import { PlayerPortrait } from "./PlayerPortrait";

interface LiveContext {
  endsAt: number;
  offset: number;
  amount: number;
  name: string;
  paused: boolean;
  closed: boolean;
}
function LiveAuctionBar({
  live,
  dataset,
}: {
  live: LiveContext;
  dataset: Dataset;
}) {
  const seconds = useLiveSeconds(live.endsAt, live.offset);
  return (
    <div className="detail-live-note">
      <div>
        <small title={live.name}>Live lot · {live.name}</small>
        <strong>{money(live.amount, dataset)}</strong>
      </div>
      <span>
        <Clock3 size={15} />
        <b>
          {live.paused
            ? "Paused"
            : live.closed || seconds === 0
              ? "Resolving"
              : `${seconds}s`}
        </b>
      </span>
    </div>
  );
}

export function PlayerStatsDialog({
  player,
  dataset,
  onClose,
  returnFocusTo,
  live,
}: {
  player?: Player;
  dataset: Dataset;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
  live?: LiveContext;
}) {
  const [tab, setTab] = useState("Overview");
  useEffect(() => setTab("Overview"), [player?.id]);
  const adapted = useMemo(
    () =>
      player
        ? {
            batting: statItems(player, "Batting"),
            bowling: statItems(player, "Bowling"),
            boundaries: boundaryBreakdown(player),
            highlights: playerHighlights(player),
          }
        : undefined,
    [player],
  );
  if (!player) return null;
  const { batting, bowling, boundaries, highlights } = adapted!;
  const scope = datasetContext(dataset);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="player-detail-backdrop" />
        <Dialog.Content
          className="player-detail-panel"
          onCloseAutoFocus={(event) => {
            if (returnFocusTo?.isConnected) {
              event.preventDefault();
              returnFocusTo.focus();
            }
          }}
        >
          <div className="player-detail-sticky">
            <div className="player-detail-top">
              <span className="eyebrow">
                <ChartNoAxesCombined size={15} />
                PLAYER INTELLIGENCE
              </span>
              <Dialog.Close asChild>
                <button
                  className="detail-close"
                  aria-label="Close player stats"
                >
                  <X size={19} />
                </button>
              </Dialog.Close>
            </div>
            {live && <LiveAuctionBar live={live} dataset={dataset} />}
          </div>
          <div className="player-detail-heading">
            <PlayerPortrait player={player} className="detail-avatar" />
            <div>
              <span className="player-nation">
                <Globe size={13} />
                {player.nation}
              </span>
              <Dialog.Title>{player.name}</Dialog.Title>
              <div className="detail-tags">
                <span>{player.role.replaceAll("-", " ")}</span>
                <span
                  className={isForeign(player, dataset) ? "foreign-tag" : ""}
                >
                  <Shield size={12} />
                  {!dataset.domesticNations.length
                    ? "Open pool"
                    : isForeign(player, dataset)
                      ? "Overseas"
                      : "Domestic"}
                </span>
              </div>
            </div>
          </div>
          <Dialog.Description className="player-detail-description">
            {dataset.league} · {scope.format} · {scope.season}
          </Dialog.Description>
          <div className="detail-price">
            <span>
              Base price<strong>{money(player.basePrice, dataset)}</strong>
            </span>
            <span>
              Source team<strong>{player.sourceTeam ?? "Not specified"}</strong>
            </span>
          </div>
          <div className="detail-tabs" aria-label="Statistic category">
            {["Overview", "Batting", "Bowling"].map((t) => (
              <button
                key={t}
                aria-pressed={tab === t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t === "Overview" ? (
                  <Activity size={14} />
                ) : t === "Batting" ? (
                  <TrendingUp size={14} />
                ) : (
                  <Target size={14} />
                )}{" "}
                {t}
              </button>
            ))}
          </div>
          <div className="detail-content">
            {tab === "Overview" ? (
              <>
                <div className="detail-section-title">
                  <h3>At a glance</h3>
                  <span>DATASET SNAPSHOT</span>
                </div>
                {highlights.length > 0 ? (
                  <div className="detail-highlights">
                    {highlights.map((item) => (
                      <div key={`${item.key}-${item.label}`}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="detail-empty">
                    No statistical summary was supplied for this player.
                  </p>
                )}
                <div className="detail-section-title">
                  <h3>Player profile</h3>
                </div>
                <dl className="detail-profile">
                  <div>
                    <dt>Playing style</dt>
                    <dd>{player.battingStyle ?? "Not supplied"}</dd>
                  </div>
                  {player.bowlingStyle && (
                    <div>
                      <dt>Bowling style</dt>
                      <dd>{player.bowlingStyle}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Role</dt>
                    <dd>{player.role.replaceAll("-", " ")}</dd>
                  </div>
                  <div>
                    <dt>Nation</dt>
                    <dd>{player.nation}</dd>
                  </div>
                </dl>
                <div className="detail-coverage">
                  <span>
                    <i className={batting.length ? "available" : ""} />
                    {batting.length
                      ? "Batting stats available"
                      : "Batting stats not supplied"}
                  </span>
                  <span>
                    <i className={bowling.length ? "available" : ""} />
                    {bowling.length
                      ? "Bowling stats available"
                      : "Bowling stats not supplied"}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="detail-section-title">
                  <h3>{tab} performance</h3>
                  <span>
                    {tab === "Batting" ? batting.length : bowling.length}{" "}
                    METRICS
                  </span>
                </div>
                {(tab === "Batting" ? batting : bowling).length ? (
                  <div className="detail-metrics">
                    {(tab === "Batting" ? batting : bowling).map((item) => (
                      <div key={item.key}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="detail-empty">
                    <ChartNoAxesCombined size={30} />
                    <h3>No {tab.toLowerCase()} stats available</h3>
                    <p>
                      This dataset doesn’t include {tab.toLowerCase()} figures
                      for {player.name}.
                    </p>
                  </div>
                )}
                {tab === "Batting" && boundaries && (
                  <div className="boundary-section">
                    <h3>Where the runs came from</h3>
                    <div
                      className="boundary-bar"
                      role="img"
                      aria-label={`${boundaries.fourRuns} runs from fours, ${boundaries.sixRuns} from sixes, ${boundaries.otherRuns} other runs`}
                    >
                      <span
                        style={{
                          width: `${(boundaries.fourRuns / boundaries.runs) * 100}%`,
                        }}
                      />
                      <span
                        style={{
                          width: `${(boundaries.sixRuns / boundaries.runs) * 100}%`,
                        }}
                      />
                      <span
                        style={{
                          width: `${(boundaries.otherRuns / boundaries.runs) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="boundary-key">
                      <span>
                        Fours <b>{boundaries.fourRuns}</b>
                      </span>
                      <span>
                        Sixes <b>{boundaries.sixRuns}</b>
                      </span>
                      <span>
                        Other runs <b>{boundaries.otherRuns}</b>
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="detail-footer">
            <small>
              From the uploaded {dataset.league} dataset. Season not specified;
              figures are not live.
            </small>
            <Dialog.Close asChild>
              <Button variant="secondary">
                <ArrowLeft size={16} />
                {live ? "Back to auction" : "Back to players"}
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
