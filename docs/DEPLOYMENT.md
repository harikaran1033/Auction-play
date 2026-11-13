# Hosting setup (not deployed)

No hosting resources or subscriptions were created. The documented target is one Node backend instance, a static frontend, Supabase and optional LiveKit. Set up real Auth/Postgres and run the migration/seed before any deployment. Keep development JSON accounts off ephemeral hosting. Production must set `NODE_ENV=production`; the application refuses missing Supabase Auth or Postgres config.

## Frontend: Cloudflare Pages

Use repository root as the build root, `npm ci && npm run build` as the build command, and `apps/web/dist` as output. Set `VITE_API_URL` to the HTTPS backend, along with the public Supabase URL/anon key. `_redirects` supplies the SPA fallback. Do not add server secrets to build-time public variables. The frontend build and PWA cache do not include player datasets; those are served by the backend.

Cloudflare documents 500 builds/deploys per month on its Free plan and other limits; verify account-specific constraints before use. [Pages limits](https://developers.cloudflare.com/pages/platform/limits/).

## Backend: Render

Use Node 22.12+ with build command `npm ci` (the server runs TypeScript with tsx) and start command `npm start`. Set `HOST=0.0.0.0`, `NODE_ENV=production`, `DATABASE_URL`, Supabase URL/anon key, exact `CORS_ORIGINS` and optional LiveKit secrets. Port comes from Render's `PORT`. Use one instance. `/api/health` is the health endpoint and exposes no secrets.

Render Free spins down after 15 minutes without inbound traffic and has shared monthly instance-hour and other service constraints. Its filesystem is ephemeral. Sleeping/restarting interrupts active auctions/voice; persisted deadlines are recovered when the backend wakes. Free hosting is appropriate for small development tests, not guaranteed auction uptime. The client uses connecting/retry screens and authoritative reconnect snapshots. [Render Free documentation](https://render.com/docs/free), [FAQ](https://render.com/docs/faq).

## Supabase

Enable email/password Auth, configure site/redirect URLs and email confirmation, apply `supabase/migrations/001_cricket_room.sql`, seed with `DATABASE_URL`, and use a least-privilege server Postgres role where appropriate. The anon key is public; it never permits critical room writes because RLS has no client room policies. Direct database credentials remain server-side. The implementation uses Supabase's verified user endpoint for token checks.

The current official Free pricing lists a 500MB database and can pause low-activity projects. Email delivery, auth rate limits, storage and egress have separate limits. Review current account limits before inviting a group. [Supabase pricing](https://supabase.com/pricing), [Free project explanation](https://supabase.com/kb/faqs/platform/free-postgres-for-side-projects).

## LiveKit (optional)

Without LiveKit credentials the app uses built-in WebRTC room audio. HTTPS is required for hosted microphone access, and restrictive networks need a TURN relay supplied through `VOICE_ICE_SERVERS`. See [VOICE.md](VOICE.md) for configuration and verification limits. Built-in peer-to-peer voice is intended for small rooms; the managed provider below remains an option for larger calls.

Use a free development project only within its dashboard quotas. Set server-only URL/API key/secret. The token endpoint checks active membership, enabled voice and room status; it issues five-minute audio-scoped tokens. Join starts muted. Auction completion deletes the LiveKit room; leaving/kicking removes the participant. Test LiveKit token/revocation behavior with your actual cloud/self-hosted setup before public release. Keep voice disabled if no quota is available. Text/auction must continue to work independently.

LiveKit's current pricing offers a free Build option but free allowances vary by resource and project; consult its pricing and dashboard rather than assuming unlimited voice. No paid subscription or automatic upgrade was configured. [LiveKit pricing](https://livekit.com/pricing), [connection guidance](https://docs.livekit.io/home/client/connect/).

Documentation/dependency checks were made against official sources during implementation (13 November 2026, Asia/Kolkata). The lockfile resolves Vite 7, React 19, Tailwind 4's official Vite integration, Socket.IO 4 and Capacitor 7. LiveKit client is pinned to 2.11.3 to avoid the newer transitive Node >=22.22 requirement on this Node 22.17 machine. Windows Lightning CSS is an explicit optional dependency because npm omitted its transitive native package during setup. TLS verification stayed enabled; the system CA store resolved the local certificate issue. [Vite requirements](https://vite.dev/guide/), [Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite), [Socket.IO options](https://socket.io/docs/v4/server-options), [Capacitor installation](https://capacitorjs.com/docs/getting-started).

## Verified local Supabase configuration

The current local connection uses `sslmode=verify-full` and `sslrootcert` referencing `.runtime/supabase-ca.crt`. The public CA was downloaded over HTTPS from Supabase's certificate distribution bucket and successfully verified against the actual database certificate/hostname. `pg_stat_ssl` confirmed encryption. The absolute CA path is local to this checkout; copy the public certificate to the deployment environment and update the path there. Windows local Node HTTPS uses `NODE_OPTIONS=--use-system-ca`; certificate verification remains enabled. The project API URL must be its origin, without `/rest/v1/`. [Supabase SSL verification guidance](https://supabase.com/docs/guides/platform/ssl-enforcement).
