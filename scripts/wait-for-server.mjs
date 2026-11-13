const origin = process.env.CRICKET_SERVER_ORIGIN ?? "http://127.0.0.1:3001";
const started = Date.now();
console.log("Waiting for the auction backend to finish startup…");
let ready = false;
while (Date.now() - started < 60000) {
  try {
    const response = await fetch(new URL("/api/health", origin), {
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok && (await response.json()).ok) {
      ready = true;
      break;
    }
  } catch {
    /* Startup or recovery is still in progress. */
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
}
if (!ready) {
  console.error(
    "Backend did not become ready within 60 seconds. Check the [server] output and run npm run check:supabase.",
  );
  process.exitCode = 1;
} else console.log("Auction backend is ready. Starting the website.");
