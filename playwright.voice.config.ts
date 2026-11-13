import { defineConfig } from "@playwright/test";
import isolated from "./playwright.rejoin.config";
export default defineConfig({
  ...isolated,
  testDir: "tests/browser-voice",
  outputDir: ".runtime/voice-results",
  use: {
    ...isolated.use,
    permissions: ["microphone"],
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
  webServer: {
    ...(isolated.webServer as object),
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
    command:
      'npx concurrently -k "npm run dev -w @cricket/server" "node scripts/wait-for-server.mjs && npm run dev -w @cricket/web -- --port 5175 --strictPort"',
    env: {
      ...(isolated.webServer as { env: Record<string, string> }).env,
      LIVEKIT_URL: "",
      LIVEKIT_API_KEY: "",
      LIVEKIT_API_SECRET: "",
      VOICE_ICE_SERVERS: "[]",
    },
  },
});
