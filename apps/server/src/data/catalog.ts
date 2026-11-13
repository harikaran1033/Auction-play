import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { z } from "zod";
import { type Dataset, type Role, type Player } from "@cricket/shared";

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
      if (seen.has(key)) {
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
        imageUrl: r.IMAGE_URL,
        stats: r.STATS ?? {},
      });
      seen.add(key);
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
    const names = [
      ...new Set(
        result.players.map((p) => p.sourceTeam).filter((v): v is string => !!v),
      ),
    ];
    datasets.push({
      id: config.id,
      league: config.league,
      name: "Uploaded dataset · season unspecified",
      source: file,
      fixture: !!config.fixture,
      domesticNations: config.domestic,
      unit: "credits",
      scale: 100,
      players: result.players,
      teams: names.map((name, i) => ({
        id: id(`${config.id}|${name}`),
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
