import { readFileSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";
import { Pool } from "pg";

const path = new URL("../apps/server/.env", import.meta.url);
if (!existsSync(path)) throw new Error("Missing apps/server/.env");
const env = { ...parseEnv(readFileSync(path, "utf8")), ...process.env };
const key = env.SUPABASE_ANON_KEY;
const url = env.SUPABASE_URL;
if (!url || !key)
  throw new Error("Set SUPABASE_URL and SUPABASE_ANON_KEY in apps/server/.env");
if (new URL(url).pathname !== "/")
  throw new Error(
    "SUPABASE_URL must be the project root URL, without /rest/v1 or another API path",
  );
console.log(
  `Postgres connection string: ${env.DATABASE_URL ? "configured" : "missing"}`,
);
let failed = false;
if (env.DATABASE_URL) {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 15000,
  });
  try {
    await pool.query("select 1");
    console.log("PostgreSQL: connected");
  } catch (error) {
    failed = true;
    const code =
      typeof error.code === "string" && /^[A-Za-z0-9_]+$/.test(error.code)
        ? error.code
        : "CONNECTION_ERROR";
    console.log(
      `PostgreSQL: failed (${code})${code === "28P01" ? "; database password authentication was rejected" : ""}`,
    );
  } finally {
    await pool.end();
  }
}
for (const [name, endpoint] of [
  ["Authentication", "/auth/v1/settings"],
  ["League schema", "/rest/v1/leagues?select=id&limit=1"],
  ["Dataset schema", "/rest/v1/datasets?select=id&limit=1"],
]) {
  try {
    const response = await fetch(new URL(endpoint, url), {
      headers: { apikey: key },
      signal: AbortSignal.timeout(20000),
    });
    const body = await response.json();
    if (response.ok) {
      console.log(
        `${name}: connected${Array.isArray(body) ? `; ${body.length ? "data present" : "no records returned"}` : ""}`,
      );
    } else {
      failed = true;
      const code =
        typeof body.code === "string" && /^[A-Za-z0-9_]+$/.test(body.code)
          ? body.code
          : `HTTP ${response.status}`;
      console.log(
        `${name}: failed (${code})${code === "PGRST205" ? "; apply the SQL migration, then seed" : ""}`,
      );
    }
  } catch {
    failed = true;
    console.log(
      `${name}: network or TLS connection failed; no credentials logged`,
    );
  }
}
if (failed) process.exitCode = 1;
