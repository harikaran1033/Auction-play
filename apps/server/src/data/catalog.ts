import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { z } from "zod";
import { type Dataset, type Role, type Player } from "@cricket/shared";
import { playerIdentity, renamedTeams } from "./identities.js";

export const root = fileURLToPath(new URL("../../../../", import.meta.url));
const id = (s: string) =>
  createHash("sha256")
    .update(s.toLowerCase().trim())
    .digest("hex")
    .slice(0, 24);
const configs: Record<
  string,
  { id: string; league: string; domestic: string[]; fixture?: boolean }
> = {
  "iplPlayers.js": {
    id: "ipl",
    league: "Indian Premier League",
    domestic: ["India"],
  },
  "hundredPlayers.js": {
    id: "hundred",
    league: "The Hundred",
    domestic: ["England", "Wales"],
  },
  "SA20.js": { id: "sa20", league: "SA20", domestic: ["South Africa"] },
  "BBL.js": { id: "bbl", league: "Big Bash League", domestic: ["Australia"] },
  "CPL.js": {
    id: "cpl",
    league: "Caribbean Premier League",
    domestic: ["West Indies"],
  },
  "MLC.js": {
    id: "mlc",
    league: "Major League Cricket",
    domestic: ["United States"],
  },
  "ODI.js": { id: "odi", league: "ODI internationals", domestic: [] },
  "Test.js": { id: "test", league: "Test internationals", domestic: [] },
  "testPlayers.js": {
    id: "fixture",
    league: "Development fixture",
    domestic: ["England", "Wales"],
    fixture: true,
  },
};
const rawSchema = z
  .object({
    NAME: z.string().trim().min(1),
    NATION: z.string().trim().min(1),
    ROLE: z.string(),
    TEAM: z.string().optional(),
    BASE_PRICE: z.number().finite().positive().optional(),
    PLAYER_STYLE: z.string().optional(),
    BOWLING_STYLE: z.string().optional(),
    IMAGE_URL: z.string().url().optional(),
    STATS: z.record(z.unknown()).optional(),
  })
  .passthrough();
const nationAliases: Record<string, string> = {
  "new zeland": "New Zealand",
  "new zealand": "New Zealand",
  usa: "United States",
  us: "United States",
  "united states of america": "United States",
  wi: "West Indies",
  india: "India",
  england: "England",
  wales: "Wales",
  english: "England",
  "south african": "South Africa",
};
const teamAliases: Record<string, string> = {
  GT: "Gujarat Titans",
  CSK: "Chennai Super Kings",
  DC: "Delhi Capitals",
  RCB: "Royal Challengers Bengaluru",
  SRH: "Sunrisers Hyderabad",
  LSG: "Lucknow Super Giants",
  MI: "Mumbai Indians",
  PBKS: "Punjab Kings",
  RR: "Rajasthan Royals",
  KKR: "Kolkata Knight Riders",
};
const colors = [
  "#f1bb53",
  "#58a9dd",
  "#a794df",
  "#74c5b2",
  "#f08270",
  "#73adf0",
  "#d5ca79",
  "#b7bfc8",
  "#80b58c",
  "#cba283",
];
export interface ImportIssue {
  file: string;
  row: number;
  severity: "error" | "warning";
  message: string;
}
export const normalizeNation = (name: string) =>
  nationAliases[name.toLowerCase().trim()] ?? name.trim();
export function normalizeRole(role: string): Role {
  const r = role.toLowerCase().replace(/[ _]/g, "-");
  if (r.includes("all-rounder") || r.includes("allrounder"))
    return "all-rounder";
  if (r.includes("wk") || r.includes("keeper")) return "wicket-keeper";
  if (r === "batter" || r === "batsman") return "batter";
  if (r === "bowler") return "bowler";
  throw new Error(`Unknown role: ${role}`);
}
export function normalizeRows(
  rows: unknown[],
  config: { id: string; fixture?: boolean },
  file: string,
) {
  const issues: ImportIssue[] = [];
  const players: Player[] = [];
  const seen = new Set<string>();
  rows.forEach((raw, i) => {
    try {
      const r = rawSchema.parse(raw);
      const nation = normalizeNation(r.NATION);
      const key = id(`${r.NAME.normalize("NFKC")}|${nation}`);
      const identity = playerIdentity(r.NAME, nation);
      if (seen.has(identity)) {
        issues.push({
          file,
          row: i + 1,
          severity: "warning",
          message: `Duplicate player ${r.NAME}; retained first record`,
        });
        return;
      }
      if (r.BASE_PRICE === undefined && !config.fixture)
        throw new Error("Missing BASE_PRICE");
      const price = r.BASE_PRICE ?? 1;
      const decimal = String(price);
      const [whole, fraction = ""] = decimal.split(".");
      if (fraction.length > 2)
        throw new Error("BASE_PRICE must have at most two decimal places");
      const basePrice = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
      if (!Number.isSafeInteger(basePrice) || basePrice <= 0)
        throw new Error("Invalid price");
      let sourceTeam = r.TEAM;
      if (!sourceTeam || ["N/A", "NA", "-"].includes(sourceTeam))
        sourceTeam = undefined;
      else if (config.id === "ipl")
        sourceTeam = teamAliases[sourceTeam] ?? sourceTeam;
      players.push({
        id: key,
        name: r.NAME.trim(),
        nation,
        role: normalizeRole(r.ROLE),
        basePrice,
        sourceTeam,
        battingStyle: r.PLAYER_STYLE,
        bowlingStyle: r.BOWLING_STYLE,
        imageUrl: r.IMAGE_URL,
        stats: r.STATS ?? {},
      });
      seen.add(identity);
    } catch (e) {
      issues.push({
        file,
        row: i + 1,
        severity: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  });
  return { players, issues };
}
export async function loadCatalog() {
  const datasets: Dataset[] = [];
  const issues: ImportIssue[] = [];
  const snapshot = z
    .object({
      asOf: z.string(),
      leagues: z.record(
        z.object({
          season: z.string(),
          sources: z.array(z.string().url()),
          note: z.string(),
          players: z.array(
            z.object({
              name: z.string().min(1),
              nation: z.string().min(1),
              role: z.string().min(1),
              team: z.string().min(1),
              battingStyle: z.string().optional(),
              bowlingStyle: z.string().optional(),
              imageUrl: z.string().optional(),
            }),
          ),
        }),
      ),
    })
    .parse(
      JSON.parse(
        await readFile(`${root}/data/rosters/current-season.json`, "utf8"),
      ),
    );
  for (const file of (await readdir(`${root}/data`)).sort()) {
    const config = configs[file];
    if (!config) continue;
    // Only trusted repository-owned JS modules are loaded. Never evaluate browser uploads.
    const source = await readFile(`${root}/data/${file}`, "utf8");
    const module = await import(
      `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
    );
    if (!Array.isArray(module.default))
      throw new Error(`${file}: expected default-exported array`);
    const result = normalizeRows(module.default, config, file);
    issues.push(...result.issues);
    const season = snapshot.leagues[config.id];
    const teamNames = renamedTeams[config.id] ?? {};
    for (const player of result.players) {
      if (player.sourceTeam)
        player.sourceTeam = teamNames[player.sourceTeam] ?? player.sourceTeam;
    }
    if (season) {
      const identities = new Map(
        result.players.map((p) => [playerIdentity(p.name, p.nation), p]),
      );
      for (const row of season.players) {
        const nation = normalizeNation(row.nation);
        const identity = playerIdentity(row.name, nation);
        const sameName = result.players.filter(
          (p) => playerIdentity(p.name, "") === playerIdentity(row.name, ""),
        );
        let player =
          identities.get(identity) ??
          (sameName.length === 1 ? sameName[0] : undefined);
        if (!player) {
          player = {
            id: id(`${row.name.normalize("NFKC")}|${nation}`),
            name: row.name,
            nation,
            role: normalizeRole(row.role),
            basePrice: 30,
            priceSource: "game-default",
            stats: {},
          };
          result.players.push(player);
          identities.set(identity, player);
        }
        player.currentSeason = true;
        player.eligibilityNation = nation;
        player.role = normalizeRole(row.role);
        player.sourceTeam = teamNames[row.team] ?? row.team;
        player.bowlingStyle = row.bowlingStyle || player.bowlingStyle;
        player.battingStyle = row.battingStyle || player.battingStyle;
        player.imageUrl = row.imageUrl || player.imageUrl;
        // Existing IDs and imported statistics/base prices stay stable for saved auctions.
      }
    }
    const names = [
      ...new Set(
        result.players.map((p) => p.sourceTeam).filter((v): v is string => !!v),
      ),
    ];
    datasets.push({
      id: config.id,
      league: config.league,
      name: season
        ? `${season.season} roster + original pool`
        : "Uploaded dataset · season unspecified",
      season: season?.season,
      rosterAsOf: season ? snapshot.asOf : undefined,
      rosterNote: season?.note,
      currentPlayerCount: season
        ? result.players.filter((p) => p.currentSeason).length
        : undefined,
      source: file,
      fixture: !!config.fixture,
      domesticNations: config.domestic,
      unit: "credits",
      scale: 100,
      players: result.players,
      teams: names.map((name, i) => ({
        id: id(
          `${config.id}|${Object.keys(teamNames).find((old) => teamNames[old] === name) ?? name}`,
        ),
        name,
        shortName:
          name.length <= 4
            ? name
            : name
                .split(/[ '&]+/)
                .filter(Boolean)
                .map((w) => w[0])
                .join("")
                .slice(0, 4)
                .toUpperCase(),
        color: colors[i % colors.length],
      })),
    });
  }
  return { datasets, issues };
}
export async function writeCatalog() {
  const catalog = await loadCatalog();
  await mkdir(`${root}/.runtime`, { recursive: true });
  await writeFile(
    `${root}/.runtime/import-report.json`,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        datasets: catalog.datasets.map((d) => ({
          id: d.id,
          players: d.players.length,
          teams: d.teams.length,
          fixture: d.fixture,
        })),
        issues: catalog.issues,
      },
      null,
      2,
    ),
  );
  return catalog;
}
