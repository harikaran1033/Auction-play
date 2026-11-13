# AuctionPlay interface

AuctionPlay uses a play-button/gavel mark and an AuctionPlay wordmark. Editable vector assets are `public/icon.svg`, `icon-ember.svg`, `auctionplay-logo.svg` and `auctionplay-logo-ember.svg`. Matching PNGs supply PWA and native launcher icons. Browser titles, installed-app names, update messages, native display names and the footer share the AuctionPlay name. Existing app identifiers and persisted storage keys remain stable for compatibility.

The current direction is a sports game: near-black and deep-purple surfaces, heavy italic Barlow Condensed display type, readable Manrope controls, and restrained franchise colour. It supersedes the earlier clubhouse/broadcast appearance.

The original palette is **Night Club**. **Ember Arena** adds black surfaces, red highlights and yellow actions across the full interface. `lib/appearance.ts` owns the device preference, cross-tab updates and browser theme colour. `ThemePicker` provides keyboard-accessible preview cards and a header toggle. `themes.css` loads last: palette variables replace fixed interface colours while original fallback values preserve Night Club. Use existing theme/surface/accent variables for new styles and keep franchise colours in `teamTheme.ts` independent. Mobile room headers put controls below the room title to keep both readable.

## Components and data

- `features/rooms/Lobby.tsx` provides a scrollable franchise list, a team stage, confirmed ownership, readiness, host settings and a persistent owners/chat panel. Mobile uses horizontal franchise cards, fixed Ready/Start actions and an owners/chat sheet.
- `FranchiseCard`, `RoomMember` and the shared `TeamBadge` supply consistent ownership and member controls. Selection previews are distinct from the server-confirmed team. A rejected team change refreshes availability without discarding confirmed ownership. Host moderation sits in member menus in the lobby.
- `lib/teamTheme.ts` validates six-digit colours and derives a contrasting foreground and a readable accent. Unit tests cover every team in the imported datasets. Decorative stage badges cannot intercept pointer events.
- `Auction.tsx` keeps the stage colour stable while bids change. The owner's franchise panel retains its theme; the leading bidder badge uses that franchise's accent. Bids, budgets, resolution and purchases remain server-authoritative.
- `features/players/stats.ts` adapts the uploaded Batting/Bowling groups. Four role-specific highlights retain missing values as `—`. Dataset format and unspecified seasons are labelled; Hundred and T20 are distinct. No ratings, recent-form data or comparison benchmarks are generated.
- Clicking a player, signing, queue entry or player-directory row opens the accessible stats drawer. The live price and countdown remain pinned inside auction details. Escape restores focus. Countdown updates are isolated from stats adaptation and the rest of the auction.
- Chat panels remain mounted, retaining unsent text through tab changes and auction lots. Unread counts use message IDs, including when the bounded message list no longer grows. Mobile sheets trap focus and close with Escape.
- `lib/useVisualViewport.ts` adjusts sheet height and bottom offset when the visual viewport changes. The viewport meta tag requests content resizing for supported Android software keyboards. Physical keyboard behaviour still needs device verification.

## Assets and styling

The repository contains no official franchise crest files or player photo collection. Team badges are typographic placeholders derived from the real team names, not invented official logos. Supplied player `imageUrl` values render at their original aspect ratio; missing or failed images use initials.

Fonts are self-hosted in `apps/web/public/fonts` with their OFL licences. The latest visual tokens and sports composition live in `game.css`, following the existing base styles and responsive auction structures. Shared controls preserve visible focus, text/icon status, reduced-motion preferences and 44px mobile targets.

## Verification

`npm.cmd run test:rejoin` runs a separate local server with Supabase and Postgres disabled for its processes. Real local authentication, room commands, sockets, bidding, purchases, auction completion, rejoining and saved lineups are exercised. Browser tests serve the actual imported IPL catalog deterministically; the engine continues using its own imported catalog. Long names, absent stats, failed images and a crowded chat use explicit local presentation fixtures and do not alter Supabase data.

Screenshots are written under `.runtime/ui-*.png`, including lobby and auction at 1440×900, 1280×720, 390×844 and 360×800, stats, mobile chat, Home, Rooms, Squads, Settings, results and a saved lineup. Automated checks cover overflow, disabled bids, paused/reconnecting presentation, taken/disconnected franchise owners, focus restoration, chat drafts, reduced motion and a shortened chat viewport.

These desktop-browser viewport checks do not establish physical Android/iOS keyboard, safe-area, microphone, backgrounding or native WebView behaviour. Those checks remain in `MOBILE.md`.
