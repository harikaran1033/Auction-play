# Google sign-in

The login/registration screen includes **Continue with Google** whenever the frontend has Supabase configured. Enabling the provider in Supabase makes it available to Auth; the frontend separately calls `signInWithOAuth` and restores the returned session.

The app uses PKCE with automatic callback detection at `/auth/callback`. Google sign-in returns to the protected route or room invitation that originally required authentication. Return paths are restricted to this app and cannot redirect to external origins or loop back through Auth. Cancellation and failed callbacks offer another sign-in attempt. The SDK persists/refreshes the session, and existing backend token verification and socket authentication apply to Google accounts as well.

## Dashboard settings

Google was confirmed enabled using this project's read-only Supabase Auth settings endpoint. Verify these additional dashboard values when testing with your own Google account:

1. In Supabase **Authentication → URL Configuration**, set the local Site URL to the origin you actually open, normally `http://127.0.0.1:5173`. Add `http://127.0.0.1:5173/**` and, if used, `http://localhost:5173/**` as local development redirect allowlist entries. The app sends `/auth/callback` with a `next` query parameter. Configure the corresponding HTTPS callback URL for a deployed site and restrict the allowlist to that site. [Supabase redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).
2. In Google's OAuth client configuration, use the callback URL shown in Supabase's Google provider settings: `https://<project-ref>.supabase.co/auth/v1/callback`. Google returns to Supabase first; Supabase returns to the app. Keep Google's client secret in Supabase's provider settings. [Google provider setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).

Use the same browser and origin throughout the PKCE flow, since the verifier is stored for that app origin. The callback route is public so the SDK can finish authentication before entering protected pages. The frontend remains a client-only React app; Supabase detects the code and exchanges it automatically, so there is no second manual exchange racing the SDK. [PKCE callback handling](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

Migration `002_google_profile_names.sql` preserves Google full names and avatars for newly created profiles. Existing profiles are not overwritten. The frontend/backend also recognize Google's `full_name`, `name`, `avatar_url` and `picture` metadata.

## Verification and limits

Unit tests cover safe return paths, invitation preservation and provider error parsing. Browser tests intercept the provider handoff and token exchange to verify PKCE, the Google button, callback completion, route restoration, persistent session restoration, and cancellation/retry without signing into a real account. `npm run test:e2e` selects the applicable Auth tests: the local-account auction flow skips when real Supabase Auth is configured, and Google-specific tests skip without it. The mobile/player-directory test runs in either mode.

Actual Google consent, account selection, redirect allowlisting and final access-token validation with a real Google account require an interactive sign-in and have not been completed by automated tests. This implementation targets browser/PWA sign-in. Native Android/iOS Google login needs a supported system-browser/deep-link or native ID-token integration; Google may reject embedded WebView OAuth. That native flow is not implemented or verified by this change.
