# Auction audio and player trades

Open **Audio & trades** in a room. Audio settings are also available in Settings; completed squads have a **Trade players** button.

## Personal auction sound

Enable auction audio, then use **Test auction audio** to allow browser playback. Choose countdown ticks, sold/unsold gavel effects, spoken auctioneer, volume and an available English device voice independently. Preferences save on this browser/device; they do not mute other owners or the voice chat. Audio defaults off unless the older sound preference was already enabled.

The final ten seconds tick, with “Going once” at five and “Going twice” at two. An accepted bid resets the countdown. Sold and unsold calls use confirmed server results and include the player and winning franchise. Reloading, reconnecting or returning from a hidden tab does not replay historic announcements. The master switch immediately stops auction effects and speech.

Speech uses the device's English speech service, preferring an Indian English voice when available. This is synthesized speech, not a recorded professional auctioneer. Voice quality and availability vary by browser/OS; gavel and tick effects use Web Audio independently. Physical speakers, Android and iOS speech output still need device testing. No microphone permission or paid speech provider is needed for these effects.

## Agreed trades

Trading opens once the auction starts and remains available from saved squads after completion, including after leaving the completed room. Select another franchise, choose up to five players per side, and optionally put credits on one side. Supported offers include buying a player for credits, selling a player, a player swap, or players plus credits. Both sides must receive something.

Sending an offer expresses the sender's agreement. Only the receiving owner can accept or reject it; the sender can cancel while pending. Nothing is reserved or moved until acceptance. Offers expire after 24 hours. Only the two owners can read their offers; other room members still see the resulting squads and purses. Incoming offer badges and trade history are included.

Acceptance rechecks current ownership, both budgets, squad and overseas limits. During an auction it also protects a standing highest bid's credits, squad slot and overseas slot, plus any enabled minimum budget reserve. A live trade requires the owner's active connected auction session. Rejected, cancelled, expired or failed offers transfer nothing. If another accepted trade moves a listed player, overlapping pending offers are invalidated. Other pending offers remain subject to fresh budget checks.

Both squads, both purses and the trade result commit together under the room's existing repository lock/transaction. Retrying a proposal or acceptance does not repeat payment. Original auction values and lot IDs remain the purchase history; trade payments appear in the current purse and private trade history. A traded player is removed from the departing team's playing XI and captain/vice-captain selection. Add incoming players and choose a replacement captain in Squads.

Trade history lives in the existing persisted room aggregate; normalized purchase ownership updates in the same PostgreSQL transaction. No extra schema migration or environment variable is required. Limits are ten pending outgoing offers per owner and 500 offers per room. Credits remain the application's virtual auction currency.

## Verification

`npm.cmd test` covers atomic swaps, cash purchases, permissions, ownership changes, budget and bid commitments, squad/overseas/reserve limits, expiry, retries and competing acceptances. It also covers countdown policy and restored-result suppression.

`npm.cmd run test:rejoin` includes two authenticated browsers exercising audio preferences, countdown calls, sold/unsold, reload suppression, rejected and accepted offers, mobile layout, completion and post-auction trading with live saved-lineup updates. It instruments real Web Audio oscillators and captures speech utterances through a substitute speech service; it does not certify physical audio output or OS speech voices.

`npm.cmd run check:postgres` verifies trade custody in both the room snapshot and normalized purchase ledger against the configured database using synthetic data inside a rolled-back transaction.
