import { Pool } from "pg";
import { databaseConnectionString } from "../apps/server/src/database.js";
import { loadCatalog } from "../apps/server/src/data/catalog.js";
import { seedCatalog } from "../apps/server/src/data/seedCatalog.js";
if (!process.env.DATABASE_URL)
  throw new Error(
    "Set DATABASE_URL before seeding. Use the Supabase Postgres connection string.",
  );
const pool = new Pool({
  connectionString: databaseConnectionString(process.env.DATABASE_URL),
});
try {
  const { datasets, issues } = await loadCatalog();
  if (issues.some((i) => i.severity === "error"))
    throw new Error("Fix import errors before seeding");
  await seedCatalog(pool, datasets);
  for (const d of datasets)
    console.log(`${d.id}: ${d.players.length} players upserted`);
  console.log("Seed complete; stable IDs prevent duplicate rows.");
} finally {
  await pool.end();
}
