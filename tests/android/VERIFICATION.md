# Verification status — 2026-10-20

## Current deferred-settlement implementation

The current source uses the standard Expo notification receiver for all four
scheduled patterns. No native deadline handler, SQLite access or settlement runs
when the OS delivers a deadline. The optional Android module only checks/opens
exact-alarm settings. Android and iOS settle missed occurrences when the app is
active, with persistent payment and notification deduplication.

Root README.md is intentionally unchanged from origin/main. The older Android
test README and the v9 results below describe the previous implementation, not
the current source. The test Java code has been updated for deferred settlement:

- `unit`: standard receiver, deadline reservation/display/cancellation, no payments.
- `arm`: reserve `nomupay:regression:closed` and cancel a second reservation.
- Before running `verify`, inspect the notification tray/dumpsys while the app is
  closed for the text `次回起動時にテスト決済を処理します`. It must not claim completion.
- `verify`: no closed-app payment or attempt was created. The cancelled alarm is absent.
- Then launch the app normally to check foreground catch-up; use the JS/SQLite
  regression tests for payment deduplication and on-time NFC/QR exemptions.

The existing v9 APK does NOT contain this implementation. The locally built v10
APK below does. Android/iOS device validation is still required. Do not report
the historical native results below as current-source verification.

Current checks:

- Node/SQLite regression suite: 112/112 passed (including deferred settlement,
  NFC/QR cancellation, iOS permission decisions, delivered-reminder cleanup and
  local APK workspace/signing safety).
- TypeScript typecheck and Expo lint: passed. Generated build copies are excluded.
- Expo production JS/Hermes export: Android and iOS passed. This is not an APK/IPA.
- Updated instrumentation Java: compiled against Android API 36 with Java 17.
- Actual closed-app OS delivery and iOS system prompt: not device-tested yet.

## Current local v10 APK

- Command: `npm run apk:build`. No cloud account or remote build is used.
- Output: `dist/nomupay-android.apk`, also saved as `dist/nomupay-android-v10.apk`.
- SHA-256: `5b116776ef9fab9186001792d2cab433eee4ad27c3d15f2159f18530420ebc19`.
- Package: `jp.jphacks.ok2605.preview`, versionCode 10, min SDK 24, target SDK 36.
- Signature verified with Android apksigner. Certificate SHA-256 matches v9:
  `59218baeb6ccd23cf365785a8c167b7b9aabc45d7eb257b5e492f5c6f92b3a59`.
- APK manifest contains the standard Expo notification receiver, not the retired
  custom receiver. APK DEX contains the optional alarm-settings module but no
  native deadline-settlement classes.
- Gradle release build succeeded using one worker, existing local caches and the
  previous native workspace. The root android/ios directories were not modified.
- The v9 versioned APK and the private signing credentials were preserved.
- Root README.md remains byte-identical to origin/main. No commit/push/merge.

## Historical v9 build (superseded)

Preview APK: `dist/nomupay-notifications-v9.apk` (`jp.jphacks.ok2605.preview`, versionCode 9).

SHA-256: `6d8b60c6845a7163be8b27ecc54c71895f0087c34093b8e27ed5fd81b6ed87ee`.

- TypeScript typecheck: passed.
- Expo lint: passed.
- Node regression suite: 96/96 passed.
- Android 15 emulator, actual latest release APK: `unit` passed 15 assertions, including payment persistence, on-time NFC exclusion, edited schedule exclusion, boundary/future handling, grouped notification text, tap intent and persistent receipts.
- Closed-process alarm delivery: **not finally verified**. An earlier test woke the correct receiver but did not record the expected settlement. The latest revision adds synchronous reservation persistence and canonicalizes the SDK 57 notification action. Reinstall and `unit` succeeded; the subsequent `arm`/closed-delivery run was interrupted by an unresponsive emulator/ADB connection. Do not count this as a passing end-to-end test.
- Physical Android/NFC device: not connected; the real future-dose/five-minute-grace scenario in README.md remains required.

The APK is signed with the same preview distribution certificate as v8 and is intended as an in-place update, preserving medication/history data. Actual charges never occur in this local test implementation. No commit, push or merge was performed.
