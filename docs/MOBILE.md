# PWA and native projects

The generated Android and iOS projects use Capacitor 7 and app ID `app.cricketroom.mobile`. Config is in `apps/web/capacitor.config.ts`. The web application is packaged locally; API calls and Socket.IO connect to the HTTPS origin in `VITE_API_URL`. Do not point a native build at `127.0.0.1`: that is the phone itself. Configure the backend CORS list for the exact frontend/native origins, such as `http://localhost` on Android and `capacitor://localhost` on iOS. Keep HTTPS enabled.

## PWA first

`npm.cmd run build` generates a manifest, 192px/512px PNG icons and an app-shell service worker. Serve `apps/web/dist` over HTTPS (localhost is permitted for development). On iPhone, open in Safari and use Share → Add to Home Screen. Cached pages can open offline; Auth/data/auctions require a live backend and show connection feedback. Android Chrome can install the PWA where platform eligibility permits. Actual installation and microphone behavior on physical devices remain to be checked.

## Android

Install Android Studio and its supported SDK and use JDK 21 for Capacitor 7. The generated Gradle wrapper and app project are included.

```powershell
npm.cmd run build
npm.cmd run cap:sync -w @cricket/web
cd apps/web/android
.\gradlew.bat assembleDebug
```

The debug APK is produced under `app/build/outputs/apk/debug/`. Android Studio can open `apps/web/android` and run on emulator/device. Release distribution requires a private signing keystore and release build configuration; keep signing secrets outside source control. `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` declarations are included. Runtime permissions, audio device changes and WebView behavior still need device testing. No APK has been built in this workspace because Android SDK/adb are unavailable; Java 22 is installed, while the documented Capacitor 7 toolchain uses JDK 21.

## iOS

The Xcode project is generated under `apps/web/ios/App`. `NSMicrophoneUsageDescription` is included. On a Mac, install compatible Xcode (Capacitor 7 requires Xcode 16 or newer), command-line tools and CocoaPods; use the project's pinned Capacitor 7 requirements rather than instructions for Capacitor 8's SPM default.

```sh
npm ci
npm run build
npm run cap:sync -w @cricket/web
cd apps/web
npx cap open ios
```

Select a signing team, choose a unique bundle identifier if needed and configure provisioning for the device. Development device signing and TestFlight/App Store distribution have different Apple account/certificate requirements; paid distribution is not enabled by this project. Configure microphone permission descriptions before signing. No iOS binary was built or tested on Windows. Use the HTTPS PWA first for no-store iPhone delivery.

## Real-device voice test before release

Test Android Chrome, iOS Safari, installed PWA and both native WebViews with two devices: explicit Join voice while muted; allow/deny microphone; explicit unmute; speaker/microphone changes; leave voice; host moderation/kick; logout; auction completion; Wi-Fi/mobile switching; app foregrounding; duplicate session takeover; missing credentials/quota/network errors. Confirm the mic indicator disappears and tracks stop on every exit, and that bidding/text still function if voice fails. Browser autoplay may require the explicit voice join gesture. Background audio is not implemented or promised.
