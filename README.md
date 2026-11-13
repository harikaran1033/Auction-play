# AuctionPlay

A working local multiplayer cricket auction built around the player datasets in `data/`. React/Vite/TypeScript frontend, Express/Socket.IO backend, shared Zod contracts and rules, Supabase/Postgres integration, built-in WebRTC room voice with optional LiveKit, PWA and generated Capacitor Android/iOS projects.

## Run locally on Windows

Use Node 22.x, version 22.12 or newer (this checkout was verified with Node 22.17). The root `.node-version` selects the Node 22 release line on compatible hosts. Run from this directory:

```powershell
npm.cmd ci
npm.cmd run data:import
npm.cmd run dev
```

The dev command starts the backend first and waits for its health check before launching Vite. Look for `AuctionPlay ready` in the server output. Recovery uses batched database writes, so room history does not add a separate network request for every old lot.

Open **http://127.0.0.1:5173**. Register two accounts in separate browser profiles/incognito windows. Create a room, copy its invite, select different teams, ready both owners, and start. Public rooms appear under Discover rooms. The backend uses port 3001.

To return to an auction after closing its tab, sign in with the same account and open **Home ? My rooms ? Rejoin auction** (also available on Discover rooms). Existing members can reuse the original invite code without selecting their occupied team or re-entering the room password. Budgets and purchases come from the persisted room snapshot. Paused auctions can be resumed by the current host. Completed rooms link to results.

No credentials are required for local development. Local accounts, password hashes, signing key, rooms, purchases and lineups persist under ignored `.runtime/`. This adapter is explicitly for development, runs on one instance, and is refused in production. Do not deploy local accounts or JSON persistence to Render's ephemeral filesystem.

On this machine, PowerShell blocks `npm.ps1`; use `npm.cmd`. If npm encounters the Windows certificate-store issue seen during setup, use `$env:NODE_OPTIONS='--use-system-ca'` before `npm.cmd ci`. Keep TLS verification enabled.

## Your league data

| Dataset | Unique players | Available teams |
| --- | ---: | ---: |
| IPL | 237 | 10 |
| The Hundred | 96 | 6 |
| SA20 | 101 | 6 |
| BBL | 90 | 8 |
| CPL | 93 | 6 |
| MLC | 104 | 6 |
| ODI | 132 | 9 |
| Test | 155 | 10 |
| Development fixture | 5 | 5 |

Eight main datasets contain **1,008 unique player entries**, plus five fixture entries. SA20 contains 11 duplicate records. The importer retains the first player entry, reports each duplicate, normalizes nation/role/team aliases, and leaves every source file unchanged. Run `npm.cmd run data:import` for the report in `.runtime/import-report.json`.

Uploaded files do not identify seasons, price currencies or verified roster completeness. The app labels the season as unspecified and uses **auction credits**. `BASE_PRICE: 1.5` becomes the integer `150`; budgets and increments use the same hundredth-credit unit. The default budget `10000` displays as `100 credits`. No floating-point crore arithmetic is used. Fixture missing prices explicitly default to one credit; real records with missing prices fail validation. The Hundred offers its six supplied source teams; absent franchises are not invented.

See [data import](docs/DATA.md) for adapters, aliases, international eligibility and repeatable database seeds.

## Configure Supabase and voice

The Auth screen supports **Continue with Google** as well as email/password when Supabase is configured. See [Google sign-in setup and callback URLs](docs/AUTH.md).

Copy `apps/server/.env.example` to `apps/server/.env` and `apps/web/.env.example` to `apps/web/.env`. Leave blank values for local development.

For real Supabase accounts and persistence, configure email/password Auth and the following variables, then run the migration and seed commands below. [The SQL migration](supabase/migrations/001_cricket_room.sql) defines the schema and security policies.

| Server only | Frontend, safe public values |
| --- | --- |
| `DATABASE_URL` (privileged Postgres connection) | `VITE_API_URL` (HTTPS backend origin) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `CORS_ORIGINS` | |
| Optional `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | |

Use Supabase's Postgres/session-pooler connection string and its documented SSL settings. This machine uses `sslmode=verify-full` with a public CA file under `.runtime`. The backend bundles that public CA in `apps/server/certs/supabase-ca.crt`: if a configured `supabase-ca.crt` path is missing after deployment, it uses the bundled file with full certificate and hostname verification. Render Secret Files are not required for this certificate. Existing available certificate paths and unrelated custom CAs remain as configured. Keep credentials in `.env`, never in `VITE_*`. The server verifies access tokens with Supabase; the browser restores and refreshes sessions. Configure both frontend and backend to use the same Auth project. Production fails closed without Auth and Postgres configuration.

Run `npm.cmd run check:supabase` to check Auth and catalog tables without displaying credentials. Apply tracked migrations and seed the catalog:

```powershell
# Set DATABASE_URL in apps/server/.env without committing it.
npm.cmd run db:migrate
npm.cmd run db:seed
```

`db:seed` loads `apps/server/.env`; existing shell variables take precedence. `db:migrate` records checksums and skips previously applied migrations; each run is transactional. If tables were created manually, inspect the existing schema before adopting the tracked runner. Upserts use stable IDs. It is safe to repeat against the same datasets. The backend transaction locks the room row, commits snapshots and normalized ledgers together, and only then broadcasts success. Browser roles have no direct room-table access.

Room voice works without LiveKit credentials through built-in WebRTC. The host can enable it in an existing lobby or running auction; choose Join voice, then Unmute. It includes group calls, mute/deafen, device selection, host controls and muted reconnect. New rooms offer voice by default without automatically joining or capturing a microphone. See [voice setup](docs/VOICE.md) for HTTPS, TURN relay and optional LiveKit configuration. Real microphones, Android/iOS permissions and cross-network routing remain device/service checks; see [mobile setup](docs/MOBILE.md).

## Personal themes

Choose **Settings → Display & motion → Ember Arena** for the black, red and yellow theme, or **Night Club** for the original purple theme. The palette button in the page or auction header switches instantly. Your choice saves on this device and syncs across its tabs; other players keep their own theme. Themes cover navigation, forms, rooms, auctions, squads, stats and audio/trade dialogs while franchise colours remain identifiable.

## Auction sound and player trading

Open **Audio & trades** in your room to enable countdown ticks, sold/unsold gavel effects, a spoken auctioneer and volume controls. Each owner controls their own device's sound; preferences persist. Use **Test auction audio** to unlock browser playback. Spoken voices depend on the device.

In **Trades**, offer credits, players, or both for another team's players. The receiving owner accepts or rejects; acceptance updates both squads and purses together. Trading also works from **Squads → Trade players** after completion. Ownership, budgets, squad limits and standing bids are checked again on acceptance. See [audio and trading](docs/AUDIO-TRADES.md) for rules and testing.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

The browser test uses two isolated authenticated contexts and real HTTP/socket operations. It covers create/join/team selection, ready/start, bid/pass/sale, page refresh/rejoin, completion and saved squads after leaving. A mobile check verifies the 390px layout and player search. See [progress and actual results](docs/PROGRESS.md).

## Android, iPhone and hosting

Generated projects are in `apps/web/android` and `apps/web/ios`. Build the web app, then run `npm.cmd run cap:sync -w @cricket/web`. Android needs Android Studio, its SDK and a compatible JDK; use `android/gradlew.bat assembleDebug` or Android Studio. iOS requires a Mac, Xcode, CocoaPods for this Capacitor 7 project, an Apple signing team and a device provisioning profile. No signed APK or iOS binary is claimed. [Full mobile instructions](docs/MOBILE.md).

The PWA is the initial iPhone delivery option: serve over HTTPS, open in Safari, Share → Add to Home Screen. App shell assets are cached; auctions still require an online backend.

No service has been deployed and no paid resources were created. [Deployment instructions and verified tier caveats](docs/DEPLOYMENT.md) cover Cloudflare Pages, Render, Supabase and LiveKit. [Architecture](docs/ARCHITECTURE.md) documents state, restart recovery, security, constraints and the single-instance model.
