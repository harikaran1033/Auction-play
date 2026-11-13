import { Pool } from "pg";
import { databaseConnectionString } from "../apps/server/src/database.js";
import { loadCatalog } from "../apps/server/src/data/catalog.js";
if (!process.env.DATABASE_URL)
  throw new Error(
    "Set DATABASE_URL before seeding. Use the Supabase Postgres connection string.",
  );
const pool = new Pool({
  connectionString: databaseConnectionString(process.env.DATABASE_URL),
});
const db = await pool.connect();
try {
  const { datasets, issues } = await loadCatalog();
  if (issues.some((i) => i.severity === "error"))
    throw new Error("Fix import errors before seeding");
  await db.query("begin");
  for (const d of datasets) {
    await db.query(
      "insert into leagues(id,name) values($1,$2) on conflict(id) do update set name=$2",
      [d.id, d.league],
    );
    await db.query(
      "insert into datasets(id,league_id,name,domestic_nations,unit,scale,fixture,source) values($1,$1,$2,$3,$4,$5,$6,$7) on conflict(id) do update set name=$2,domestic_nations=$3,unit=$4,scale=$5,fixture=$6,source=$7",
      [d.id, d.name, d.domesticNations, d.unit, d.scale, d.fixture, d.source],
    );
    for (const t of d.teams)
      await db.query(
        "insert into league_teams(id,dataset_id,name,short_name,color) values($1,$2,$3,$4,$5) on conflict(id) do update set name=$3,short_name=$4,color=$5",
        [t.id, d.id, t.name, t.shortName, t.color],
      );
    for (const p of d.players) {
      await db.query(
        "insert into players(id,name,nation) values($1,$2,$3) on conflict(id) do update set name=$2,nation=$3",
        [p.id, p.name, p.nation],
      );
      await db.query(
        "insert into dataset_players(dataset_id,player_id,role,base_price,source_team_id,batting_style,bowling_style,image_url,stats) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(dataset_id,player_id) do update set role=$3,base_price=$4,source_team_id=$5,batting_style=$6,bowling_style=$7,image_url=$8,stats=$9",
        [
          d.id,
          p.id,
          p.role,
          p.basePrice,
          d.teams.find((t) => t.name === p.sourceTeam)?.id ?? null,
          p.battingStyle ?? null,
          p.bowlingStyle ?? null,
          p.imageUrl ?? null,
          p.stats,
        ],
      );
    }
    console.log(`${d.id}: ${d.players.length} players upserted`);
  }
  await db.query("commit");
  console.log("Seed complete; stable IDs prevent duplicate rows.");
} catch (e) {
  await db.query("rollback");
  throw e;
} finally {
  db.release();
  await pool.end();
}
