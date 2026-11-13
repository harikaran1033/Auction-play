import { Check, Lock, LoaderCircle, WifiOff, ArrowUpRight } from "lucide-react";
import type { Team } from "@cricket/shared";
import { TeamBadge } from "../../components/common";
import { teamStyle } from "../../lib/teamTheme";
export type FranchiseState =
  "available" | "selected" | "taken" | "pending" | "disconnected" | "preview";
export function FranchiseCard({
  team,
  state,
  owner,
  preview,
  disabled,
  onClick,
}: {
  team: Team;
  state: FranchiseState;
  owner?: string;
  preview?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const label =
    state === "selected"
      ? "Selected by you"
      : state === "taken"
        ? `Taken${owner ? ` · ${owner}` : ""}`
        : state === "pending"
          ? "Pending selection"
          : state === "disconnected"
            ? `Owner disconnected${owner ? ` · ${owner}` : ""}`
            : state === "preview"
              ? "Your choice · confirm below"
              : "Available";
  const Icon =
    state === "selected"
      ? Check
      : state === "taken"
        ? Lock
        : state === "pending"
          ? LoaderCircle
          : state === "disconnected"
            ? WifiOff
            : ArrowUpRight;
  return (
    <button
      type="button"
      className={`franchise-card ${state} ${preview ? "is-preview" : ""}`}
      style={teamStyle(team)}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={preview ?? state === "selected"}
    >
      <TeamBadge team={team} />
      <span>
        <strong>{team.name}</strong>
        <small>{label}</small>
      </span>
      <Icon size={17} className={state === "pending" ? "spin" : ""} />
    </button>
  );
}
