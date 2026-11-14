import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  loadCatalog,
  normalizeRows,
  normalizeRole,
  normalizeNation,
  root,
} from "../apps/server/src/data/catalog.js";
describe("actual uploaded datasets", () => {
  it("retains every original identity, team ID, base price and statistic", async () => {
    const { datasets } = await loadCatalog();
    const hash = (text: string) =>
      createHash("sha256")
        .update(text.toLowerCase().trim())
        .digest("hex")
        .slice(0, 24);
    for (const d of datasets) {
      const source = await readFile(`${root}/data/${d.source}`, "utf8");
      const rows = (
        await import(
          `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
        )
      ).default;
      for (const row of rows) {
        const oldId = hash(
          `${row.NAME.normalize("NFKC")}|${normalizeNation(row.NATION)}`,
        );
        expect(
          d.players.some((p) => p.id === oldId),
          `${d.id}: ${row.NAME}`,
        ).toBe(true);
      }
      const original = normalizeRows(
        rows,
        { id: d.id, fixture: d.fixture },
        d.source,
      ).players;
      for (const p of original) {
        const current = d.players.find((x) => x.id === p.id)!;
        expect(current.basePrice).toBe(p.basePrice);
        expect(current.stats).toEqual(p.stats);
        if (p.sourceTeam)
          expect(
            d.teams.some((t) => t.id === hash(`${d.id}|${p.sourceTeam}`)),
            `${d.id}: ${p.sourceTeam}`,
          ).toBe(true);
      }
    }
  });
  it("imports eight datasets and the separate fixture without validation errors", async () => {
    const { datasets, issues } = await loadCatalog();
    expect(datasets.filter((d) => !d.fixture)).toHaveLength(8);
    expect(datasets.find((d) => d.id === "ipl")!.teams).toHaveLength(10);
    expect(datasets.find((d) => d.id === "hundred")!.teams).toHaveLength(8);
    expect(datasets.find((d) => d.id === "cpl")!.teams).toHaveLength(7);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(
      datasets.every((d) =>
        d.players.every(
          (p) => Number.isSafeInteger(p.basePrice) && p.basePrice > 0,
        ),
      ),
    ).toBe(true);
  });
  it("normalizes real aliases", () => {
    expect(normalizeNation("New zeland")).toBe("New Zealand");
    expect(normalizeNation("USA")).toBe("United States");
    expect(normalizeRole("Bowling All-Rounder")).toBe("all-rounder");
    expect(normalizeRole("WK-Batter")).toBe("wicket-keeper");
  });
  it("has repeatable IDs across imports and shared player identities", async () => {
    const a = await loadCatalog();
    const b = await loadCatalog();
    expect(a).toEqual(b);
    const identities = a.datasets
      .flatMap((d) => d.players)
      .filter((p) => p.name.toLowerCase() === "steve smith");
    expect(new Set(identities.map((p) => p.id)).size).toBe(1);
  });
  it("reports invalid records without fabricating missing data", () => {
    const { players, issues } = normalizeRows(
      [
        { NAME: "Bad record", ROLE: "Batter", NATION: "India" },
        {
          NAME: "Too precise",
          ROLE: "Batter",
          NATION: "India",
          BASE_PRICE: 0.001,
        },
      ],
      { id: "ipl" },
      "sample.js",
    );
    expect(players).toHaveLength(0);
    expect(issues).toHaveLength(2);
  });
  it("deduplicates aliases and converts decimal prices without float math", () => {
    const { players, issues } = normalizeRows(
      [
        {
          NAME: "A",
          ROLE: "Batter",
          NATION: "India",
          BASE_PRICE: 1.1,
          TEAM: "GT",
        },
        {
          NAME: "a",
          ROLE: "Batter",
          NATION: "India",
          BASE_PRICE: 2,
          TEAM: "Gujarat Titans",
        },
      ],
      { id: "ipl" },
      "sample.js",
    );
    expect(players).toHaveLength(1);
    expect(players[0].basePrice).toBe(110);
    expect(players[0].sourceTeam).toBe("Gujarat Titans");
    expect(issues[0].severity).toBe("warning");
  });
});
