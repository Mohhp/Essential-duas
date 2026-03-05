#!/usr/bin/env bash
set -euo pipefail

PLAYLIST_URL="https://soundcloud.com/mirwais-rahimi-737968388/sets/quran-with-pashto-translation"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RAW_DIR="$ROOT_DIR/audio/quran-pashto-soundcloud-raw"
NORM_DIR="$ROOT_DIR/audio/quran-pashto-soundcloud-normalized"
AUDIT_DIR="$ROOT_DIR/audio/pashto_audit"
META_JSON="$AUDIT_DIR/soundcloud_playlist_full.json"
MAPPING_JSON="$AUDIT_DIR/pashto_soundcloud_mapping_114.json"
EXTRA_URLS_FILE="$AUDIT_DIR/soundcloud_missing_surah_urls_20260305.tsv"
FAIL_LOG="$AUDIT_DIR/soundcloud_per_track_failures_20260305.tsv"

YT_DLP="${YT_DLP_BIN:-$HOME/.local/bin/yt-dlp}"
YT_DLP_COMMON_ARGS=(
  --retries "${YT_DLP_RETRIES:-20}"
  --fragment-retries "${YT_DLP_FRAGMENT_RETRIES:-50}"
  --retry-sleep "${YT_DLP_RETRY_SLEEP:-5}"
  --socket-timeout "${YT_DLP_SOCKET_TIMEOUT:-30}"
)

if [[ "${YT_DLP_NO_PART:-1}" == "1" ]]; then
  YT_DLP_COMMON_ARGS+=(--no-part)
fi

if [[ ! -x "$YT_DLP" ]]; then
  echo "yt-dlp not found at $YT_DLP"
  echo "Install it with: python3 -m pip install --user yt-dlp"
  exit 1
fi

mkdir -p "$RAW_DIR" "$NORM_DIR" "$AUDIT_DIR"
: > "$FAIL_LOG"

echo "[1/5] Fetching playlist metadata"
"$YT_DLP" --skip-download -J "$PLAYLIST_URL" > "$META_JSON"

echo "[2/5] Downloading SoundCloud tracks one-by-one (resilient mode)"
node -e '
const fs = require("fs");
const p = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
for (const e of (p.entries || [])) {
  const idx = String(e.playlist_index || "").padStart(3, "0");
  const title = String(e.title || "").replace(/[\t\n]/g, " ").trim();
  const url = e.webpage_url || e.url || "";
  if (idx && url) console.log([idx, title, url].join("\t"));
}
' "$META_JSON" |
while IFS=$'\t' read -r idx title url; do
  if ls "$RAW_DIR/${idx}-"*.mp3 >/dev/null 2>&1; then
    echo "skip $idx"
    continue
  fi

  echo "download $idx $title"
  if ! "$YT_DLP" \
    "${YT_DLP_COMMON_ARGS[@]}" \
    --extract-audio \
    --audio-format mp3 \
    --audio-quality 0 \
    --no-overwrites \
    --output "$RAW_DIR/${idx}-%(title).120B.%(ext)s" \
    "$url"; then
    echo -e "$idx\t$title\t$url" >> "$FAIL_LOG"
    echo "failed $idx"
  fi
done

if [[ -f "$EXTRA_URLS_FILE" ]]; then
  echo "[3/5] Downloading supplemental missing-surah SoundCloud links"
  while IFS=$'\t' read -r surah url; do
    [[ -z "${surah:-}" || -z "${url:-}" ]] && continue
    pad="$(printf '%03d' "$surah")"
    "$YT_DLP" \
      "${YT_DLP_COMMON_ARGS[@]}" \
      --extract-audio \
      --audio-format mp3 \
      --audio-quality 0 \
      --no-overwrites \
      --output "$NORM_DIR/$pad.%(ext)s" \
      "$url" || true
  done < "$EXTRA_URLS_FILE"
else
  echo "[3/5] Supplemental URL file not found; skipping"
fi

echo "[4/5] Normalizing files by surah number"
node "$ROOT_DIR/scripts/sync-soundcloud-pashto-mapping.js" \
  --meta "$META_JSON" \
  --raw "$RAW_DIR" \
  --out-dir "$NORM_DIR" \
  --out-mapping "$MAPPING_JSON"

echo "[5/5] Done"
echo "Raw mp3 count: $(find "$RAW_DIR" -maxdepth 1 -type f -name '*.mp3' | wc -l)"
echo "Normalized mp3 count: $(find "$NORM_DIR" -maxdepth 1 -type f -name '*.mp3' | wc -l)"
echo "Failures logged: $(wc -l < "$FAIL_LOG")"
echo "Failure log: $FAIL_LOG"
echo "Mapping file: $MAPPING_JSON"
