import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser-rejoin",
  timeout: 180000,
  workers: 1,
  outputDir: ".runtime/rejoin-results",
  use: {
    actionTimeout: 15000,
    navigationTimeout: 20000,
    baseURL: "http://127.0.0.1:5175",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      'npx concurrently -k "npx tsx apps/server/src/index.ts" "node scripts/wait-for-server.mjs && npm run dev -w @cricket/web -- --port 5175 --strictPort"',
    stdout: "pipe",
    url: "http://127.0.0.1:5175",
    reuseExistingServer: false,
    timeout: 90000,
    env: {
      SUPABASE_URL: "",
      SUPABASE_ANON_KEY: "",
      DATABASE_URL: "",
      LOCAL_ROOM_FILE: `.runtime/rejoin-rooms-${process.pid}.json`,
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_ANON_KEY: "",
      VITE_API_URL: "",
      PORT: "3002",
      HOST: "127.0.0.1",
      CORS_ORIGINS: "http://127.0.0.1:5175",
      CRICKET_SERVER_ORIGIN: "http://127.0.0.1:3002",
      NODE_ENV: "development",
    },
  },
});
