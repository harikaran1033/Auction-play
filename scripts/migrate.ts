import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Pool } from "pg";

if (!process.env.DATABASE_URL)
  throw new Error("Set DATABASE_URL in apps/server/.env");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15000,
});
let connection;
try {
  connection = await pool.connect();
  await connection.query("begin");
  await connection.query(
    "select pg_advisory_xact_lock(hashtext('cricket-room-migrations'))",
  );
  await connection.query("create schema if not exists cricket_room_private");
  await connection.query(
    "create table if not exists cricket_room_private.migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())",
  );
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const name of (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(new URL(name, directory), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const { rows } = await connection.query(
      "select checksum from cricket_room_private.migrations where name=$1",
      [name],
    );
    if (rows.length) {
      if (rows[0].checksum !== checksum)
        throw new Error(
          `Applied migration ${name} has changed; use a new migration`,
        );
      console.log(`${name}: already applied`);
      continue;
    }
    // The SQL files also support the dashboard SQL editor. The runner owns their transaction.
    const body = sql.replace(/^\s*(?:begin|commit);\s*$/gim, "");
    await connection.query(body);
    await connection.query(
      "insert into cricket_room_private.migrations(name,checksum) values($1,$2)",
      [name, checksum],
    );
    console.log(`${name}: applied`);
  }
  await connection.query("notify pgrst, 'reload schema'");
  await connection.query("commit");
  console.log("Database migrations committed.");
} catch (error) {
  if (connection) await connection.query("rollback");
  // Do not print connection strings or raw driver errors that could include credentials.
  const code = (error as { code?: string }).code;
  console.error(
    `Migration failed${code ? ` (${code})` : ""}; no partial schema changes committed.`,
  );
  if (code === "42P07")
    console.error(
      "An untracked table already exists. Inspect the existing schema before continuing.",
    );
  process.exitCode = 1;
} finally {
  connection?.release();
  await pool.end();
}
