import { useEffect, useState } from "react";
import type { Player } from "@cricket/shared";
export function PlayerPortrait({
  player,
  className = "player-portrait",
}: {
  player: Player;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [player.imageUrl]);
  return (
    <div className={className} data-portrait-loaded={loaded}>
      <span aria-hidden="true">
        {player.name
          .split(" ")
          .slice(0, 2)
          .map((s) => s[0])
          .join("")}
      </span>
      {player.imageUrl && !failed && (
        <img
          src={player.imageUrl}
          alt={player.name}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          loading="eager"
        />
      )}
    </div>
  );
}
