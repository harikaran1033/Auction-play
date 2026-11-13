import { describe, expect, it } from "vitest";
import { contrast, teamTheme } from "../apps/web/src/lib/teamTheme";
import { loadCatalog } from "../apps/server/src/data/catalog.js";
describe("franchise theme contrast", () => {
  it("validates input colours and rejects CSS injection", () => {
    for (const color of [
      "red",
      "#123",
      "#zzzzzz",
      "url(unsafe)",
      "#ffffff;display:none",
    ]) {
      expect(teamTheme({ color }).primary).toBe("#b39aff");
    }
  });
  it("keeps text readable across every imported franchise colour", async () => {
    for (const team of (await loadCatalog()).datasets.flatMap(
      (dataset) => dataset.teams,
    )) {
      const theme = teamTheme(team);
      expect(
        contrast(theme.primary, theme.onPrimary),
        team.name,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(theme.accent, "#171020"),
        team.name,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
