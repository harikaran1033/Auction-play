import type { Player, Dataset } from "@cricket/shared";
export interface StatItem {
  key: string;
  label: string;
  value: string;
  numeric?: number;
}
const labels: Record<string, string> = {
  M: "Matches",
  I: "Innings",
  R: "Runs",
  W: "Wickets",
  Avg: "Average",
  SR: "Strike rate",
  Econ: "Economy",
  "50": "Fifties",
  "100": "Hundreds",
  "4s": "Fours",
  "6s": "Sixes",
  "4W": "Four-wicket hauls",
  "5W": "Five-wicket hauls",
};
const order = [
  "M",
  "I",
  "R",
  "W",
  "Avg",
  "SR",
  "Econ",
  "50",
  "100",
  "4s",
  "6s",
  "4W",
  "5W",
];
export function statItems(
  player: Player,
  category: "Batting" | "Bowling" | "Wicketkeeping",
): StatItem[] {
  const entry = Object.entries(player.stats).find(
    ([key]) => key.toLowerCase() === category.toLowerCase(),
  )?.[1];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
  return Object.entries(entry)
    .filter(
      ([, value]) =>
        (typeof value === "number" && Number.isFinite(value)) ||
        (typeof value === "string" && value.trim() !== "" && value !== "-"),
    )
    .sort(
      ([a], [b]) =>
        (order.includes(a) ? order.indexOf(a) : 99) -
        (order.includes(b) ? order.indexOf(b) : 99),
    )
    .map(([key, value]) => ({
      key,
      label: labels[key] ?? key.replace(/_/g, " "),
      value:
        typeof value === "number"
          ? value.toLocaleString("en-US", { maximumFractionDigits: 2 })
          : String(value),
      numeric: typeof value === "number" ? value : undefined,
    }));
}
export function playerHighlights(player: Player): StatItem[] {
  const batting = statItems(player, "Batting"),
    bowling = statItems(player, "Bowling");
  const find = (items: StatItem[], key: string, label = labels[key]) =>
    ({
      ...items.find((item) => item.key === key),
      key,
      label,
      value: items.find((item) => item.key === key)?.value ?? "—",
    }) as StatItem;
  if (player.role === "bowler")
    return [
      find(bowling, "M"),
      find(bowling, "W"),
      find(bowling, "Econ"),
      find(bowling, "Avg", "Bowling average"),
    ];
  if (player.role === "all-rounder")
    return [
      find(batting, "R"),
      find(batting, "SR"),
      find(bowling, "W"),
      find(bowling, "Econ"),
    ];
  const keeper = statItems(player, "Wicketkeeping");
  const dismissals = keeper.find((item) =>
    ["D", "Dismissals"].includes(item.key),
  );
  return [
    find(batting, "I"),
    find(batting, "R"),
    find(batting, "SR"),
    player.role === "wicket-keeper" && dismissals
      ? { ...dismissals, label: "Dismissals" }
      : find(batting, "Avg", "Batting average"),
  ];
}
export function datasetContext(dataset: Pick<Dataset, "id" | "name">) {
  const formats: Record<string, string> = {
    ipl: "T20",
    bbl: "T20",
    cpl: "T20",
    mlc: "T20",
    sa20: "T20",
    hundred: "The Hundred · 100 balls",
    odi: "ODI · 50 overs",
    test: "Test cricket",
    fixture: "Development fixture",
  };
  return {
    format: formats[dataset.id] ?? "Format not specified",
    season: /season unspecified/i.test(dataset.name)
      ? "Season not specified"
      : dataset.name,
  };
}
export function boundaryBreakdown(player: Player) {
  const stats = statItems(player, "Batting");
  const runs = stats.find((x) => x.key === "R")?.numeric,
    fours = stats.find((x) => x.key === "4s")?.numeric,
    sixes = stats.find((x) => x.key === "6s")?.numeric;
  if (
    runs === undefined ||
    runs <= 0 ||
    fours === undefined ||
    sixes === undefined ||
    fours < 0 ||
    sixes < 0 ||
    fours * 4 + sixes * 6 > runs
  )
    return undefined;
  return {
    runs,
    fourRuns: fours * 4,
    sixRuns: sixes * 6,
    otherRuns: runs - fours * 4 - sixes * 6,
  };
}
