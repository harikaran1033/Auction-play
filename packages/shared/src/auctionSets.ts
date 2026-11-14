import type { Dataset, Player } from "./index";

export interface AuctionSet {
  id: string;
  label: string;
  playerIds: string[];
}
export function playerSpecialism(player: Player) {
  if (player.role !== "bowler") return player.role;
  const style =
    `${player.bowlingStyle ?? ""} ${player.battingStyle ?? ""}`.toLowerCase();
  if (
    /spin|off[ -]?break|leg[ -]?break|orthodox|chinaman|slow.left.arm/.test(
      style,
    )
  )
    return "spin-bowler";
  if (/fast|medium|pace/.test(style)) return "pace-bowler";
  return "bowler";
}
export function shuffle<T>(
  items: readonly T[],
  randomIndex: (max: number) => number,
): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function buildAuctionSets(
  dataset: Dataset,
  players: Player[],
  randomIndex: (max: number) => number,
) {
  const labels: Record<string, string> = {
    batter: "Batters",
    "wicket-keeper": "Wicket-keepers",
    "all-rounder": "All-rounders",
    "pace-bowler": "Fast bowlers",
    "spin-bowler": "Spin bowlers",
    bowler: "Bowlers · style unspecified",
  };
  const groups = new Map<string, { label: string; players: Player[] }>();
  for (const player of players) {
    const specialism = playerSpecialism(player);
    const foreign =
      dataset.domesticNations.length > 0 &&
      !dataset.domesticNations.includes(
        player.eligibilityNation ?? player.nation,
      );
    const prefix = dataset.domesticNations.length
      ? foreign
        ? "Overseas"
        : "Domestic"
      : "International";
    const key = `${prefix}-${specialism}`;
    if (!groups.has(key))
      groups.set(key, {
        label: `${prefix} ${labels[specialism].toLowerCase()}`,
        players: [],
      });
    groups.get(key)!.players.push(player);
  }
  for (const group of groups.values())
    group.players = shuffle(group.players, randomIndex);
  const sets: AuctionSet[] = [];
  let previous = "";
  while ([...groups.values()].some((group) => group.players.length)) {
    const keys = shuffle(
      [...groups.keys()].filter((key) => groups.get(key)!.players.length),
      randomIndex,
    );
    if (keys.length > 1 && keys[0] === previous) keys.push(keys.shift()!);
    for (const key of keys) {
      const group = groups.get(key)!;
      const number =
        sets.filter((set) => set.id.startsWith(`${key}:`)).length + 1;
      sets.push({
        id: `${key}:${number}`,
        label: `${group.label} · set ${number}`,
        playerIds: group.players.splice(0, 6).map((player) => player.id),
      });
      previous = key;
    }
  }
  return { sets, queue: sets.flatMap((set) => set.playerIds) };
}
