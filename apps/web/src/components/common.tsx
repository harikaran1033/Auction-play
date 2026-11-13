import { Link } from "react-router";
import { ArrowRight, AlertCircle, LoaderCircle } from "lucide-react";
import type { Dataset, Team } from "@cricket/shared";
import { Button } from "./ui/button";
import { teamStyle } from "../lib/teamTheme";
export type LeagueSummary = Omit<Dataset, "players"> & { playerCount: number };
export function TeamBadge({ team, size = "" }: { team?: Team; size?: string }) {
  return (
    <span className={`team-badge ${size}`} style={teamStyle(team)}>
      {team?.shortName ?? "CR"}
    </span>
  );
}
export function Loading({
  message = "Getting the room ready…",
}: {
  message?: string;
}) {
  return (
    <div className="state">
      <LoaderCircle className="spin" size={28} />
      <h2>{message}</h2>
      <p>
        The server may need a moment to wake up. Your team and purchases stay
        saved.
      </p>
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div className="state">
      <AlertCircle size={28} />
      <h2>We couldn’t connect</h2>
      <p>{error instanceof Error ? error.message : String(error)}</p>
      {retry && <Button onClick={retry}>Try again</Button>}
      <Button asChild variant="ghost">
        <Link to="/rooms">
          Back to rooms <ArrowRight size={16} />
        </Link>
      </Button>
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
