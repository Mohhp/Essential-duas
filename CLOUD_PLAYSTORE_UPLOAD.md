# Cloud build + Play upload (no local Android setup)

## 1) Add GitHub repository secrets

In GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**

Create these secrets:

- `KEYSTORE_BASE64` = base64 content of your `signing.keystore`
- `KEYSTORE_PASSWORD` = keystore password
- `KEY_PASSWORD` = key password
- `KEY_ALIAS` = key alias (example: `my-key-alias`)

### How to generate `KEYSTORE_BASE64` on Mac

```bash
base64 -i "/Users/mohammadpela/Downloads/Essential Duas - Google Play package/signing.keystore" | pbcopy
```

Then paste clipboard into `KEYSTORE_BASE64` secret.

## 2) Run cloud build

1. Open **Actions** tab in GitHub.
2. Open workflow: **Build Android AAB**.
3. Click **Run workflow**.
4. Enter:
   - `version_code`: must be higher than current Play (example `5`)
   - `version_name`: example `1.0.5`
5. Wait for workflow to complete.

## 3) Download the `.aab`

From workflow run page, download artifact:

- `essential-duas-aab-v<version_code>`

## 4) Upload to Play Console

1. Play Console → your app → Testing (Internal/Closed) or Production.
2. Create new release.
3. Upload downloaded `.aab`.
4. Save and review.
5. Confirm package is `io.github.mohhp.essentialduas` and versionCode is new.
