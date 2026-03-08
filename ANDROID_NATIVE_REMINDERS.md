# Android Native Prayer Reminders

This repository now contains a native Android app under `android/` for reliable prayer reminders when the app is backgrounded or fully closed.

## What changed

- The Android app hosts the existing web UI inside a native `WebView`.
- Reminder settings from the web UI are mirrored into Android `SharedPreferences` through `window.AndroidPrayerBridge`.
- Exact prayer alarms are scheduled with `AlarmManager.setExactAndAllowWhileIdle(...)`.
- Reminders are re-scheduled automatically after:
  - device reboot
  - app update / package replace
  - manual time change
  - timezone change
- On Android, prayer reminders no longer depend on browser timers, service worker wakeups, or the web `Notification` API.

## Native flow

1. The existing prayer reminder UI in `app.js` updates local state.
2. On Android, `app.js` calls `AndroidPrayerBridge.syncReminderState(...)` instead of relying on browser timers.
3. Native code stores the reminder settings and selected location.
4. Native code calculates the next prayer times using `com.batoulapps.adhan:adhan:1.2.1`.
5. Native code schedules one exact alarm per enabled prayer.
6. `PrayerAlarmReceiver` shows the notification and immediately schedules the next round.

## Important files

- `android/app/src/main/java/io/github/mohhp/essentialduas/MainActivity.kt`
- `android/app/src/main/java/io/github/mohhp/essentialduas/ReminderBridge.kt`
- `android/app/src/main/java/io/github/mohhp/essentialduas/reminders/PrayerAlarmScheduler.kt`
- `android/app/src/main/java/io/github/mohhp/essentialduas/reminders/PrayerAlarmReceiver.kt`
- `android/app/src/main/java/io/github/mohhp/essentialduas/reminders/ReminderRescheduleReceiver.kt`
- `android/app/src/main/java/io/github/mohhp/essentialduas/reminders/ReminderRepository.kt`
- `android/app/src/main/java/io/github/mohhp/essentialduas/reminders/PrayerTimeCalculator.kt`
- `app.js`

## Build notes

Local build requirements:

- Java 17
- Android SDK with platform 35 and build tools 35.0.0
- `android/local.properties` with `sdk.dir=...`

Android asset packaging notes:

- The Android app syncs only the web assets it needs into the APK.
- Large generated Pashto Quran audio archives are not bundled into the Android app.
- When the app runs inside the Android `WebView` asset host, Pashto Quran audio falls back to the hosted production base URL at `https://mohhp.github.io/Essential-duas`.

Optional signing inputs for release builds:

- `KEYSTORE_FILE`
- `KEYSTORE_PASSWORD`
- `KEY_ALIAS`
- `KEY_PASSWORD`

The GitHub Actions workflow at `.github/workflows/build-android-aab.yml` now builds the native Android app directly with Gradle.

## Current scope

- Prayer reminder scheduling is native on Android.
- The daily dua reminder path is still not migrated to native Android scheduling.
- Reminder sound selection is persisted from the web UI, but native notifications currently use the platform audible channel or a silent channel rather than mapping every web sound asset individually.