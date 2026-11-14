# Season rosters and auction options

Snapshot verified on 14 November 2026. These are men's player pools. Temporary/injury replacements named in the source are included, so a season pool can exceed a team's simultaneous squad limit. BBL 16 is a list of published contracts, not a claim that every preseason place has been filled.

| League | Season | Sources |
|---|---|---|
| IPL | 2026 | [Official team squads](https://www.iplt20.com/teams) and their public `/api/bff/cms/teams/{slug}?tab=squad` feed, default season verified as 2026 |
| The Hundred | 2026 | [Official complete men's squads, including replacements](https://www.thehundred.com/news/4466668/who-will-play-in-the-hundred-in-2026-) |
| SA20 | 2027 / season 5 | [Official current team pages](https://www.sa20.co.za/teams), player profiles supplied by the pages' public Incrowd CMS feeds |
| BBL | 2026/27 / BBL 16 | [Cricket Australia's contracted player lists](https://www.cricket.com.au/news/4440305/every-squad-updated-lists-big-bash-2026-27-bbl16-ins-and-outs-player-movement-strikers-heat-hurricanes-renegades-stars-scorchers-sixers-thunder) |
| MLC | 2026 | [Official teams](https://www.majorleaguecricket.com/teams), public competition 1436 team/player feeds linked in the snapshot |
| CPL | 2026 | [Official local draft](https://cplt20.com/news/17367), supplemented by [Wisden's 6 August overseas availability list](https://www.wisden.com/series/caribbean-premier-league-men-2026/cricket-news/full-list-of-overseas-players-for-each-team-at-cpl-2026). Later unverified replacement announcements are not inferred. |

Roles and bowling styles for additions are supplemented by the official [Cricket Australia player directory](https://www.cricket.com.au/players) and public player profiles. Additional role references: [Anderson Mahase, ICC](https://www.icc-cricket.com/rankings/87595/anderson-mahase), [Isai Thorne, CWI](https://www.windiescricket.com/news/young-fast-bowler-isai-thorne-focused-on-red-ball-improvement/), [Kelvin Pitman, CWI](https://www.windiescricket.com/players/kelvin-pitman-18151/), [Abdul-Raheem Toppin, CWI](https://www.windiescricket.com/players/abdul-raheem-toppin-20578/), and [Damion Joachim](https://cplinsider.com/players/damion-joachim/).

The snapshot adds missing players without replacing the uploaded files. Normalized spelling/nickname aliases match existing records before adding an identity. Different cricketers named Tom Rogers remain separate (batter and bowler). League eligibility can differ from a player's original nationality: this is stored separately and used consistently for overseas caps and auction sets. Renamed teams keep their original IDs; The Hundred now includes eight men's teams and CPL includes Jamaica Kingsmen as its seventh team.

Existing prices are game values, not verified current contracts. Added players start at 0.30 virtual credits or ₹0.30 Cr (₹30 lakh), with no fabricated statistics. Rupee mode changes the display of the virtual purse; it does not apply exchange rates. ODI/Test retain the supplied international pools and are not presented as current-season franchise squads.

New rooms default to the season pool when available, randomized role sets, rupee display, and the amount-based bid ladder. API clients retain credits/fixed-step/full-pool defaults unless specified. Existing saved rooms retain their settings and queued players.

Sets separate domestic/overseas batters, keepers, all-rounders, pace bowlers and spin bowlers. Unspecified bowling styles receive their own bowler category. Each set contains up to six players; both category order and players are shuffled on the server with `crypto.randomInt`. The queue and set labels are persisted, so reconnecting or restarting does not reshuffle an active auction. Unsold reruns build fresh sets from unsold players only.

The bid increment depends on the accepted highest bid: below 10 Cr +0.5 Cr; 10–20 +1; 20–30 +2; 30–50 +2.5; 50 and above +3. Opening bids retain the player's base price. All calculations use integer hundredths, including validation and trade reserves.

`npm run data:import` validates the snapshot and writes `.runtime/import-report.json`. PostgreSQL startup registers the catalogue in five batched upserts inside a transaction, preserving historical rows and saved squads. No manual production seed or migration is needed for these JSON settings/catalogue additions. Future roster refreshes should update the snapshot and its sources, run import/tests, and restart/redeploy the backend. Price/identity changes require a versioned dataset rather than overwriting historical auction data.

My rooms has a personal delete action: it archives the owner's room link and leaves the auction while retaining purchases and purse history. The host transfers to a connected owner where possible. A separate explicit host checkbox cancels the auction for everyone. Completed saved squads remain accessible in My squads, including Copy squad.
