import { writeCatalog } from "../apps/server/src/data/catalog.js";
const { datasets, issues } = await writeCatalog();
console.table(
  datasets.map((d) => ({
    dataset: d.id,
    players: d.players.length,
    teams: d.teams.length,
    fixture: d.fixture,
  })),
);
for (const issue of issues)
  console.log(
    `${issue.severity.toUpperCase()} ${issue.file}:${issue.row}: ${issue.message}`,
  );
console.log(
  "Report: .runtime/import-report.json. Sources preserved. Repeated imports use stable IDs.",
);
if (issues.some((i) => i.severity === "error")) process.exitCode = 1;
