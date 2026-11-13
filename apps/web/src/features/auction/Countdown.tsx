import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
export function useLiveSeconds(endsAt: number, offset = 0) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [endsAt]);
  return Math.max(0, Math.ceil((endsAt - now - offset) / 1000));
}
export function AuctionCountdown({
  endsAt,
  offset,
  duration,
  paused,
  resolved,
  onExpired,
}: {
  endsAt: number;
  offset: number;
  duration: number;
  paused: boolean;
  resolved: boolean;
  onExpired: () => void;
}) {
  const remaining = useLiveSeconds(endsAt, offset);
  useEffect(() => {
    if (remaining === 0 && !paused && !resolved) onExpired();
  }, [remaining, paused, resolved, onExpired, endsAt]);
  return (
    <div
      className={`timer ${remaining <= 5 && !paused && !resolved ? "urgent" : ""}`}
      role="timer"
      aria-label="Bid countdown"
    >
      <Clock3 size={16} />
      <b>{paused ? "Paused" : resolved ? "Closed" : `${remaining}s`}</b>
      <div>
        <span
          style={{ width: `${Math.min(100, (remaining / duration) * 100)}%` }}
        />
      </div>
      <span className="timer-caption">
        {paused
          ? "On hold"
          : resolved
            ? "Resolving"
            : remaining <= 5
              ? "Closing soon"
              : "Time left"}
      </span>
    </div>
  );
}
