import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const bundledSupabaseCa = fileURLToPath(
  new URL("../certs/supabase-ca.crt", import.meta.url),
);

// Older local/Render URLs reference a certificate outside the repository.
// A public CA can travel with the application; database credentials cannot.
export function databaseConnectionString(value: string | undefined) {
  if (!value) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  const configured = url.searchParams.get("sslrootcert");
  if (
    !configured ||
    existsSync(configured) ||
    configured.replaceAll("\\", "/").split("/").pop() !== "supabase-ca.crt"
  )
    return value;
  if (!existsSync(bundledSupabaseCa))
    throw new Error(
      "The bundled Supabase CA certificate is missing from the deployment.",
    );
  url.searchParams.set("sslrootcert", bundledSupabaseCa);
  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}
