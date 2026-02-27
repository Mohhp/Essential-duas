# Play Store + TWA Fix Checklist

## 1) Fix full-screen launch (top browser bar issue)

Your app is hosted at `https://mohhp.github.io/Essential-duas/` (project pages), but TWA verification requires:

- `https://<origin>/.well-known/assetlinks.json`

For your current origin (`mohhp.github.io`), this means:

- `https://mohhp.github.io/.well-known/assetlinks.json`

If this URL is not reachable, Android falls back to Custom Tab (shows URL bar and top controls).

### Required actions

1. Host the web app on an origin you control at root level:
   - Option A: user/org page root (`https://mohhp.github.io/`)
   - Option B: custom domain (recommended)
2. Publish `.well-known/assetlinks.json` at the **origin root**.
3. Put your real Play App Signing SHA-256 in `sha256_cert_fingerprints`.
4. Ensure TWA `launchUrl` uses the same verified origin.

## 2) Fix Play Console "no longer supports X devices" warning

This warning is usually caused by manifest/device targeting differences in the uploaded Android bundle.

### Keep compatibility broad

In Android app module config:

- Keep `minSdkVersion` same as previous release (or lower if possible).
- Do not set restrictive `uses-feature` unless needed.
- For optional hardware features, set `android:required="false"`.
- Include both common ABIs in native builds (`arm64-v8a`, `armeabi-v7a`) if native libs exist.
- Avoid excluding tablets/phones in Play device catalog.

### Typical safe defaults for TWA apps

- `minSdkVersion 21`
- `targetSdkVersion` current required by Play
- No required camera/mic/bluetooth/NFC features unless essential

## 3) Files to check in Android project (bundle source)

- `app/src/main/AndroidManifest.xml`
- `app/build.gradle` (or `build.gradle.kts`)
- project `build.gradle` / `gradle.properties`

## 3.1) Package name must match existing Play app

If Play Console says your app needs package name `io.github.mohhp.essentialduas`, use that exact package ID in your Android build.

- Do not change package ID when publishing updates to the same Play app.
- A different package ID is treated as a new app listing.

## 4) Verify before re-upload

1. In Play Console release page, open "Changes to your supported devices".
2. Confirm unsupported count is zero (or acceptable).
3. Install internal/closed test on a notched device and verify no browser top bar.
