import { describe, expect, it } from "vitest";
import { Client } from "pg";
import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  databaseConnectionString,
  bundledSupabaseCa,
} from "../apps/server/src/database";

const base = "postgresql://owner:p%40ss@db.example.invalid:5432/postgres";
describe("portable database CA configuration", () => {
  it.each([
    "/etc/secrets/supabase-ca.crt",
    "C:/missing-auctionplay-test/.runtime/supabase-ca.crt",
    "C:\\missing-auctionplay-test\\.runtime\\supabase-ca.crt",
  ])("resolves a missing legacy certificate path: %s", (path) => {
    const input = new URL(base);
    input.searchParams.set("sslrootcert", path);
    input.searchParams.set("sslmode", "verify-full");
    input.searchParams.set("application_name", "AuctionPlay");
    const result = new URL(databaseConnectionString(input.toString())!);
    expect(result.searchParams.get("sslrootcert")).toBe(bundledSupabaseCa);
    expect(result.searchParams.get("sslmode")).toBe("verify-full");
    expect(result.username).toBe(input.username);
    expect(result.password).toBe(input.password);
    expect(result.host).toBe(input.host);
    expect(result.pathname).toBe(input.pathname);
    expect(result.searchParams.get("application_name")).toBe("AuctionPlay");
    const client = new Client({ connectionString: result.toString() });
    expect(client.ssl).toHaveProperty(
      "ca",
      readFileSync(bundledSupabaseCa, "utf8"),
    );
    expect(client.ssl).not.toHaveProperty("rejectUnauthorized", false);
    expect(client.ssl).not.toHaveProperty("checkServerIdentity");
  });
  it("preserves an available explicitly configured certificate", () => {
    const url = new URL(base);
    url.searchParams.set("sslrootcert", bundledSupabaseCa);
    url.searchParams.set("sslmode", "verify-full");
    expect(databaseConnectionString(url.toString())).toBe(url.toString());
  });
  it("does not substitute an unrelated custom CA or add SSL options to unconfigured connections", () => {
    const custom =
      base + "?sslrootcert=/missing/custom-ca.pem&sslmode=verify-full";
    expect(databaseConnectionString(custom)).toBe(custom);
    expect(databaseConnectionString(base)).toBe(base);
    expect(databaseConnectionString(undefined)).toBeUndefined();
  });
  it("enforces hostname verification when selecting the bundled CA", () => {
    const url =
      base + "?sslrootcert=/missing/supabase-ca.crt&sslmode=no-verify";
    expect(
      new URL(databaseConnectionString(url)!).searchParams.get("sslmode"),
    ).toBe("verify-full");
  });
  it("bundles only a public CA certificate", () => {
    const pem = readFileSync(bundledSupabaseCa, "utf8");
    expect(pem).not.toContain("PRIVATE KEY");
    expect(new X509Certificate(pem).ca).toBe(true);
  });
  it("does not include credentials in malformed-URL errors", () => {
    expect(() => databaseConnectionString("private-value")).toThrow(
      "DATABASE_URL must be a valid PostgreSQL connection URL.",
    );
  });
});
