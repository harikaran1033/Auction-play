import { describe, it, expect } from "vitest";
import type { Player } from "@cricket/shared";
import {
  statItems,
  playerHighlights,
  boundaryBreakdown,
  datasetContext,
} from "../apps/web/src/features/players/stats";
import { creditsToUnits } from "../apps/web/src/lib/moneyInput";
const base: Player = {
  id: "p",
  name: "Player",
  nation: "India",
  role: "batter",
  basePrice: 100,
  stats: {},
};
describe("player statistics presentation", () => {
  it("preserves zero values and gives uploaded abbreviations readable labels", () => {
    const stats = statItems(
      { ...base, stats: { Batting: { M: 16, R: 455, SR: 153.2, "100": 0 } } },
      "Batting",
    );
    expect(stats.find((x) => x.key === "100")?.value).toBe("0");
    expect(stats.find((x) => x.key === "SR")).toMatchObject({
      label: "Strike rate",
      value: "153.2",
    });
    expect(stats.map((x) => x.key)).toEqual(["M", "R", "SR", "100"]);
  });
  it("does not fabricate missing groups, metrics or malformed data", () => {
    expect(statItems(base, "Bowling")).toEqual([]);
    expect(statItems({ ...base, stats: { Batting: null } }, "Batting")).toEqual(
      [],
    );
    expect(
      statItems(
        { ...base, stats: { Batting: { R: NaN, Avg: null, SR: "", M: 0 } } },
        "Batting",
      ),
    ).toEqual([{ key: "M", label: "Matches", value: "0", numeric: 0 }]);
  });
  it("selects batting, bowling and all-rounder summaries from their actual disciplines", () => {
    const stats = {
      Batting: { M: 20, R: 400, SR: 150 },
      Bowling: { W: 25, Avg: 22, Econ: 7.5 },
    };
    expect(playerHighlights({ ...base, stats }).map((x) => x.key)).toEqual([
      "I",
      "R",
      "SR",
      "Avg",
    ]);
    expect(
      playerHighlights({ ...base, role: "bowler", stats }).map((x) => x.key),
    ).toEqual(["M", "W", "Econ", "Avg"]);
    expect(
      playerHighlights({ ...base, role: "all-rounder", stats }).map(
        (x) => x.key,
      ),
    ).toEqual(["R", "SR", "W", "Econ"]);
  });
  it("keeps four summary positions and marks missing data explicitly", () => {
    const highlights = playerHighlights(base);
    expect(highlights).toHaveLength(4);
    expect(highlights.every((stat) => stat.value === "—")).toBe(true);
    expect(
      playerHighlights({
        ...base,
        role: "wicket-keeper",
        stats: {
          Batting: { I: 12, R: 300, SR: 140, Avg: 30 },
          Wicketkeeping: { D: 8 },
        },
      }).at(-1),
    ).toMatchObject({ label: "Dismissals", value: "8" });
  });
  it("distinguishes formats and keeps unspecified seasons honest", () => {
    expect(
      datasetContext({ id: "hundred", name: "Hundred · season unspecified" }),
    ).toEqual({
      format: "The Hundred · 100 balls",
      season: "Season not specified",
    });
    expect(datasetContext({ id: "ipl", name: "IPL 2025" })).toEqual({
      format: "T20",
      season: "IPL 2025",
    });
    expect(
      datasetContext({
        id: "ipl",
        name: "2026 roster + original pool",
        season: "2026",
      }).season,
    ).toBe("2026 roster · statistics season not verified");
  });
  it("derives boundary runs only when the uploaded figures support the chart", () => {
    expect(
      boundaryBreakdown({
        ...base,
        stats: { Batting: { R: 100, "4s": 10, "6s": 5 } },
      }),
    ).toEqual({ runs: 100, fourRuns: 40, sixRuns: 30, otherRuns: 30 });
    expect(
      boundaryBreakdown({
        ...base,
        stats: { Batting: { R: 10, "4s": 10, "6s": 5 } },
      }),
    ).toBeUndefined();
    expect(
      boundaryBreakdown({ ...base, stats: { Batting: { R: 100 } } }),
    ).toBeUndefined();
  });
});
describe("credit inputs", () => {
  it("accepts readable credit values while keeping server money in integer units", () => {
    expect(creditsToUnits("100")).toBe(10000);
    expect(creditsToUnits("0.10")).toBe(10);
    expect(creditsToUnits("1.01")).toBe(101);
    expect(creditsToUnits("1.")).toBe(100);
  });
  it.each([
    "",
    "-1",
    "1.001",
    "1e3",
    "NaN",
    "Infinity",
    "99999999999999999999",
  ])("rejects invalid precision or input: %s", (value) => {
    expect(creditsToUnits(value)).toBeUndefined();
  });
});
