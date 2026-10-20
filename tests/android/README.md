# Android notification regression tests

These tests execute native code from the actual **release preview APK**, not a JavaScript scheduler mock. They use Android's built-in Instrumentation API and need no JUnit downloads. They never belong in the shipped APK.

Run only on a **disposable/read-only emulator** with a freshly installed `jp.jphacks.ok2605.preview` APK. Do not run on a user's phone or an emulator containing data you need. The fixture initializer refuses to replace an existing database and unit setup requires empty medication tables.

1. Install the new release APK on the disposable emulator.
2. Set `ANDROID_HOME`, `JAVA_HOME` (Java 17), and use Node 24.
3. Create an empty directory using `mktemp -d`, then run `node tests/android/build-test-apk.cjs /absolute/temp/directory`. It generates the fixture using the application's real schema initializer and signs a separate instrumentation APK using local `credentials.json`; credentials are not printed.
4. Install that `test.apk`. Grant `android.permission.POST_NOTIFICATIONS` and the `SCHEDULE_EXACT_ALARM` app-op to the **test emulator app**.
5. Run `adb -s emulator-5554 shell am instrument -w -e mode unit jp.jphacks.reminders.tests/jp.jphacks.reminders.tests.NotificationAlarmTest`.
6. Run the same command with `-e mode arm`, then `adb -s emulator-5554 shell am kill jp.jphacks.ok2605.preview`. Confirm the process is absent using `pidof`. Do **not** use force-stop, which intentionally blocks OS alarms.
7. Wait for the 15-second alarm and cold process startup (longer on a slow emulator), then inspect `adb -s emulator-5554 shell dumpsys notification --noredact` for the `nomupay:charged:` notification and its result text **before** running another instrumentation. Starting instrumentation force-stops the target and may clear its notification tray.
8. Run with `-e mode verify`. This asserts the payment and delivery receipt were created while the UI/JS process was not running, the taken medicine was excluded, the canceled alarm did not charge, and reopening did not repost. `unit` also verifies the notification text and tap intent using the real OS notification manager.

The fixtures use an already elapsed valid dose deadline with a near-future OS alarm to exercise delayed/closed-app delivery without altering the emulator clock or waiting through the real five-minute minimum grace period. Also perform a real-device end-to-end check: register a future dose with five-minute grace, close the app, wait through the deadline, and tap the resulting notification. Test NFC cancellation separately on hardware.
