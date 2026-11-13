# Implementation progress

## PostgreSQL lobby recovery fix

Fixed startup recovery failing with `saved_lineups_membership_id_fkey` when an expired lobby seat is removed. Repository mutations now remove dependent lineups for memberships absent from the updated snapshot before deleting those memberships, inside the existing transaction. Bid/purchase foreign keys remain restrictive, and current members' lineups remain intact. No migration or database reset is required.

The rollback-only real Postgres check now covers lobby leave, kick, disconnect expiry, seat rejoining and cleanup rollback after a failed mutation, in addition to auction/trade persistence. The check passed against the configured database with all synthetic data rolled back. Type checks, lint, 102 unit tests and server build passed. Backend health returned Supabase/Postgres mode and the frontend responded on the normal local ports.

## AuctionPlay branding

Renamed the displayed product to AuctionPlay, including the sidebar wordmark, footer, browser title, PWA install/update labels, native app display names, server startup logs and root npm project. Added a play-button/gavel mark with Night Club and Ember Arena variants, editable wordmark SVGs, favicon, PWA PNGs and Android/iOS launcher icons. Native identifiers, database schema and saved account/room keys remain compatible.

Verified TypeScript, lint, production builds and Chromium checks of the production title, wordmark, manifest, logo loading, theme-specific favicon/wordmark colours and mobile navigation without overflow. Updated built web assets were copied into both native projects. Native binaries were not compiled in this branding pass.

Current phase: local implementation and acceptance verification complete; external-service and native-device verification pending.

## Personal themes - 13 November 2026

Added Ember Arena (black, red and yellow) alongside the original Night Club purple palette. Settings contains accessible preview radios; page and auction headers have a quick palette switch. The selection applies immediately, persists on the device, updates the browser theme colour and synchronizes across tabs without changing another player's choice. Legacy/feature surfaces use palette variables with their original values as fallbacks, covering navigation, forms, live auctions, stats, saved squads and voice/audio/trade dialogs. Inline franchise colours remain independent.

The theme browser acceptance passed, including keyboard selection, reload, cross-tab changes, authenticated routes, two different player themes, live auction switching without changing purchases or bids, dialogs and mobile overflow checks. Screenshots were inspected at desktop and 360px/390px. Type checks, lint, 102 unit tests and production/PWA builds passed; the existing main-bundle size warning remains.

## Auction audio and agreed player trades - 13 November 2026

Added personal countdown ticks, going-once/twice speech, distinct sold/unsold gavel effects and confirmed player/franchise announcements. The room's Audio & trades dialog and Settings expose immediate saved toggles, volume, available device voices and a playback test. Rejoining does not replay past sales; hidden or disconnected sessions remain silent. Audio service failures are isolated from auction updates.

Added cash-for-player, player swaps and combined offers during auctions and from completed saved squads. Recipient acceptance commits both rosters, both purses and the offer result atomically. Current ownership, limits, reserve and standing bids are rechecked. Private offers have incoming badges, cancellation/rejection, expiry and history; overlapping offers are invalidated when a player moves. The trade observer updates saved squads without replacing an auction session. Outgoing lineup/captain choices are cleared, and original auction values remain visible.

Verification: TypeScript, lint, all 102 unit tests and production/PWA builds passed. All four isolated auction browser tests passed, including the new two-browser audio/trade flow: rejected offers, live swap-plus-cash, independent persisted audio settings, post-completion trading and saved-lineup updates. Both WebRTC voice browser regressions also passed. Responsive trade layouts were inspected at 390px and desktop, with no overflow at 360px. The configured Postgres rollback-only check passed, including normalized purchase ownership and budget transfer. The existing main-bundle size warning remains. Physical speakers, OS speech voices and Android/iOS audio remain device checks; browser speech assertions use a substitute speech service. See [usage and rules](AUDIO-TRADES.md).

## Working room voice — 13 November 2026

Added built-in WebRTC group audio when LiveKit credentials are absent. An authenticated, room-scoped signalling namespace is bound to the current auction socket session; room permissions and auction command contracts remain intact. Hosts can enable/disable voice in existing running rooms, disconnect individual speakers, and retain the existing optional LiveKit provider. New rooms offer voice by default without automatically joining or enabling a microphone.

The shared voice controller survives lobby/auction and panel transitions. It supports muted join, explicit microphone permission, mute, incoming-audio deafen, device selection, actual speaking levels, playback recovery, cleanup and muted automatic reconnect. Voice termination releases tracks and peer audio elements without disconnecting auction ownership.

Verification: all 74 unit tests passed, including 11 voice permission/configuration cases. Two browser voice tests passed using generated microphone MediaStreams over real WebRTC: bidirectional audio, all six paths in a three-owner call, denied-permission feedback, mute/deafen, auction transition and bidding, socket reconnect, host removal/disable and track cleanup. All three auction/rejoin/browser UI regressions also passed. Type checks, lint and production build passed. The normal app remained available on ports 3001/5173 with the WebRTC provider, and isolated test servers were stopped. The Windows headless native microphone API returned NotSupportedError; physical microphones, mobile and external LiveKit/TURN services remain unverified. Configuration and usage are in `VOICE.md`.

## Sports interface redesign — 13 November 2026

Implemented the latest sports-game direction, superseding the earlier broadcast palette: near-black/purple surfaces, self-hosted heavy italic display type, validated franchise themes, large typographic team badges, angular franchise stages, and readable functional controls. No official crests or player photographs were invented.

The lobby now has a scrollable franchise list, server-confirmed ownership and readiness, a large preview stage, owners/chat panels, host member menus, refreshed availability after rejected claims, and mobile cards/sheets with fixed actions. The live auction has its own layout, four real role-specific stats, accessible player details with a pinned live price/countdown, clear bidding states, stable stage colours, franchise-specific leader feedback and confirmed sale summaries. Home, Rooms, Squads, settings and authentication share the visual identity.

Local verification: workspace type checks and lint passed; all 63 unit tests passed, including contrast across every imported team colour. The three isolated browser tests passed, covering full auction completion, saved lineups, team changes, taken/disconnected owners, reduced motion, tab closure/rejoining, stats focus, retained chat drafts, crowded chat, missing images/stats, long names, disabled/reconnecting bidding and a shortened composer viewport. Lobby and auction screenshots were checked at 1440×900, 1280×720, 390×844 and 360×800. Production build/PWA generation passed with the existing main-chunk size warning. See `UI.md` for implementation and fixture details; physical Android/iOS keyboards, safe areas, native WebViews and microphone behaviour remain device checks.

## Completed locally

- npm-workspaces monorepo with React/Vite/TypeScript, Express/Socket.IO, shared Zod rules, lockfile and environment templates.
- Actual uploaded-JS adapter, deterministic IDs, aliases, integer money, role normalization, configurable domestic nations, repeatable SQL seed and row-level validation reports.
- Eight datasets: 1,008 unique main player entries; five separate fixture entries; 11 SA20 duplicate warnings; original files preserved.
- Responsive navy/teal frontend, home, player directory, Auth, public discovery, create/join, lobby, live auction, results, squads, lineup and preferences routes.
- Verified identity, local development Auth, Supabase Auth integration, protected routes and access-token checks.
- Private/password rooms, atomic team/capacity claims, readiness, host start/transfer/kick/cancel/settings and persistent blocks.
- Authoritative bid/pass engine with integer budgets, overseas/squad/reservation rules, version/lot checks, receipts, scheduler, exactly-once resolution, reveal deadlines, pause/resume, unsold reruns and automatic completion.
- Two-minute disconnect grace, persisted ownership, restored snapshots, latest-session takeover and host succession.
- Purchases/results, spending/role summaries, saved squads and lineup ownership validation.
- Persistent bounded room chat, history endpoint, plain text, rate limits and unread/latest controls.
- Optional LiveKit audio integration: membership tokens, muted join, mic permission feedback, device selection, speaker indicators, leave and host removal. Text/bidding stay independent of voice availability.
- Motion entry/stamps, reduced motion, optional synthesized hammer sound, fallbacks, offline/reconnecting/error states.
- Supabase migration with normalized catalog/ledgers, constraints, room-row locking and browser RLS denial of critical writes.
- PWA manifest, icons, offline app shell; generated Capacitor Android/iOS projects and microphone declarations.
- Setup/data/architecture/testing/mobile/deployment documentation.

## Commands and actual results

Verified on Node 22.17 / npm 11.6 on Windows:

- `npm.cmd run data:import`: passed; 11 duplicate warnings, no invalid-row errors.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed after the final refinements.
- `npm.cmd test`: 30/30 passed in the final run (25 auction/persistence tests and five importer tests).
- `npm.cmd run build`: passed; production assets, service worker and manifest generated. Voice loads on demand. Rebuilding with Supabase configured also passed; enabling its browser SDK produces a main-bundle size warning (717KB minified, 211KB gzip), which remains an optimization opportunity.
- `npm.cmd run test:e2e`: 2/2 passed in 40.1 seconds in the final run. Actual two-browser multiplayer create/join/ready/start/bid/pass/sale/refresh/complete/saved-squad flow, private-room denial to an outsider, sanitized snapshots, saved lineup surviving a refresh, plus mobile overflow/player search.
- `npx.cmd cap add android` and `npx.cmd cap add ios`: generated both projects.
- `npm.cmd run cap:sync -w @cricket/web`: passed; final web assets copied to Android and iOS. CocoaPods installation and xcodebuild were explicitly skipped on Windows.

Installation required Windows' trusted CA store and an explicit optional Windows Lightning CSS native dependency. TLS verification was not disabled. Vite/esbuild/browser checks needed execution outside the restricted filesystem sandbox; no public deployment or paid resources were created.

## External setup and remaining limits

- Supabase URL, publishable key and corrected database password are configured. The project URL is normalized to its API root. Migration 001 was applied transactionally and a repeat run safely skipped it. Seed committed nine datasets: 1,008 main player entries plus five labeled fixture entries. All 14 application tables have RLS enabled; anonymous catalog reads and rejection of anonymous room writes were verified against the actual database. Auth and catalog API checks pass; the backend starts with Supabase Auth and PostgreSQL storage. Database TLS is active with CA and hostname verification (verify-full), using the downloaded Supabase public CA in ignored .runtime/supabase-ca.crt. The local Node runtime uses Windows trusted CAs for Auth HTTPS. Full two-user hosted Auth/auction acceptance remains unverified. LiveKit credentials and cloud/microphone verification remain pending.
- Android SDK and adb were not found; Java 22 is installed, while the documented Capacitor 7 setup uses JDK 21. No APK was built. iOS project generated/synced on Windows; no CocoaPods/Mac/Xcode/signing or iOS binary/device verification.
- Real Android/iOS/PWA voice, network switching, physical-device background/foreground behavior and installation need manual testing. Background audio is not implemented.
- One backend instance only; shared coordination and Socket.IO adapter required before horizontal scaling. Free-tier sleep/quotas are documented; no unlimited uptime claims.
- Seasons/currencies/roster completeness are unspecified in uploads. Credits and source teams are used explicitly. No invented franchises or official season claim.
- No scoring, custom increment ladder, profile-avatar upload or password-recovery screen. Trading is implemented; see AUDIO-TRADES.md. Fixed bid increment is configurable. Lobby setting edits expose timer and voice; creation exposes the full room configuration.
- Local file/development Auth is for development only. Production is gated on real Auth and Postgres. Browser acceptance currently validates this local path, not external-service correctness.

## Google sign-in update ? 13 November 2026

- Confirmed Google is enabled in the configured Supabase project via its Auth settings endpoint. Added Continue with Google on login/registration, PKCE, a public /auth/callback route, safe invitation/route return, callback errors and session restoration.
- Updated frontend/backend Google name/avatar handling. Applied tracked migration 002_google_profile_names.sql; verified the profile trigger with a synthetic transaction that was rolled back. No lasting test account or email was created.
- Validation: workspace type checking passed; lint passed; all 41 unit tests passed. Current Supabase-configured browser run: three passed (mobile catalog plus two OAuth tests), one skipped (the development-account auction flow, which requires development Auth). OAuth endpoints are mocked in browser tests; real Google account consent/redirect allowlisting is not automatically verified.
- Production build passed with the existing main-bundle size warning. Setup and native-WebView limitations are documented in docs/AUTH.md.

## Google button layout refinement

Aligned the Google sign-in button with the email fields and primary sign-in button, centered its icon/label, and added a spaced email divider with separator lines. Verified in Chromium at desktop 1280px and mobile 390px: button/input widths and left edges match, separator lines render, and there is no horizontal overflow. Frontend type checking, lint and production build passed.

## Auction rediscovery and rejoin

Added an authenticated /api/me/rooms listing and My rooms sections on Home and Discover rooms. Listings include the owner's running/private/paused rooms and completed results, prioritize ongoing auctions, and exclude nonmembers, blocked users and cancelled rooms. Invite resolution sends existing owners directly to the persisted screen, bypassing team selection even when the room is full or running. No membership, team, budget or purchase is recreated by the return link.

Verification: workspace type checking, lint and production build passed; all 47 unit tests passed. The isolated test:rejoin browser flow passed in 31.9 seconds (15.3 seconds for the test): two development accounts, full password-protected private auction, a purchase, actual auction-tab closure, return from Home in a new tab, unchanged team/budget/purchases, invite-code rejoin without a password/team claim, Discover rooms listing, and unauthenticated listing denial. The mobile Home check had no horizontal overflow. The isolated processes used ports 3002/5175 with real Supabase/Postgres settings disabled; the live Supabase auction was not modified by the test.

## Backend readiness and PostgreSQL recovery

Diagnosed ECONNREFUSED while Vite was already serving: backend recovery rewrote every historic lot, bid, chat message and purchase in separate remote queries before binding port 3001. Replaced ledger loops with typed JSONB batch upserts within the existing locked transaction; preserved commit-before-broadcast and constraints. Added a 15-second connection timeout, 30-second statement timeout and recovery-stage logs. npm run dev now starts Vite only after scripts/wait-for-server.mjs confirms backend health (bounded to 60 seconds).

Verification: workspace type checks and lint passed, all 47 unit tests passed, and npm run check:postgres passed against rollback-only synthetic data in the actual configured Postgres database. That check verifies batched membership/lot/bid/purchase/chat writes, idempotent ledger replay, deferred foreign keys, and rollback of an invalid budget. No synthetic users/rooms persisted. Both local ports 3001 and 5173 returned HTTP 200, and the startup readiness helper passed.
