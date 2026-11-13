# Room voice chat

Voice works through built-in browser WebRTC when LiveKit is not configured. It uses an authenticated `/voice` Socket.IO namespace for signalling; media travels over WebRTC. Existing LiveKit settings remain supported and take priority when all three LiveKit variables are present.

## Using voice

1. Open a room and press **Voice** in the auction header. In the lobby, open the owners/chat panel if on a phone.
2. If voice is disabled, the current host can press **Enable voice chat**, including during an auction. New rooms enable voice by default, but nobody joins automatically.
3. Press **Join voice** to listen. Microphones start muted and permission is requested only on **Unmute**.
4. Use **Mute**, **Listen/Deafened**, **Leave voice**, the microphone selector, or **Enable audio** if the browser blocks playback. Participants and speaking indicators reflect room membership and actual audio levels.

Voice stays joined when the lobby becomes the auction and when switching chat/team panels. Lost auction connections stop microphone tracks; automatic rejoining starts muted. Leaving the room, signing out, session takeover, host voice disconnection, disabling voice, room cancellation and auction completion close the relevant audio connections. Host voice controls live in the owner menu.

## Local and hosted operation

No new service or credentials are required for localhost testing. The normal startup remains `npm.cmd run dev`. Both the frontend and backend must be running.

Phones and hosted browsers need HTTPS for microphone access; plain HTTP to a computer's LAN address generally cannot capture a microphone. See [the browser microphone API documentation](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

The built-in provider uses a public STUN server by default. Direct connections can work across networks, but restrictive firewalls/NATs require a TURN relay. Configure the backend with a JSON ICE server array, for example:

```dotenv
VOICE_ICE_SERVERS='[{"urls":"stun:stun.l.google.com:19302"},{"urls":["turn:YOUR_TURN_HOST:3478","turns:YOUR_TURN_HOST:5349"],"username":"YOUR_USERNAME","credential":"YOUR_CREDENTIAL"}]'
```

Use your own relay/provider credentials and limits. ICE credentials are supplied only to authorized active room members; production relay services should issue short-lived credentials. Do not copy credentials into the frontend environment. `VOICE_ICE_SERVERS=[]` restricts tests to local host candidates. The built-in provider makes one peer connection per pair of voice participants and is intended for small rooms.

For a managed media server or larger rooms, set the existing backend variables:

```dotenv
LIVEKIT_URL=wss://YOUR_PROJECT.livekit.cloud
LIVEKIT_API_KEY=YOUR_API_KEY
LIVEKIT_API_SECRET=YOUR_API_SECRET
```

The backend issues short-lived microphone-only room tokens. LiveKit provisioning, TURN connectivity, physical microphones/speakers and mobile background behaviour require their actual services/devices; localhost tests do not establish them.

## Permissions and testing

The voice provider checks active membership, enabled room voice, an open auction and the current auction socket session. Signalling is room-scoped, audio-only, bounded and rate-limited. A separate namespace keeps voice join/leave independent of auction ownership and bidding.

Run `npm.cmd run test:voice` for the browser acceptance tests, and `npm.cmd test` for membership and ICE configuration checks plus auction regressions. The browser harness runs isolated development Auth with Supabase/Postgres and LiveKit disabled. A readiness check prevents tests from running against a hosted-auth server. It generates microphone MediaStreams with Web Audio and measures audio received through real WebRTC connections. No real microphone is recorded by those automated checks.

Verified locally: two-way audio; three-owner group audio across all six directions; muted join; denied-permission feedback; mute and deafen; preserved voice across auction start and bids; muted rejoin after a real auction-socket disconnect; unauthorized/stale-session rejection; host removal and disable; and microphone/audio-element cleanup. Workspace type checks, lint, production build and all 74 unit tests pass.

The native microphone-capture API returned `NotSupportedError` in the Windows headless test environment, so the browser tests use generated MediaStreams instead of a physical input driver. Physical microphones, Bluetooth/device switching, mobile permissions/backgrounding, LiveKit Cloud and cross-network TURN routing remain unverified device/service checks.
