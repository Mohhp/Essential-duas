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

YT_DLP="${YT_DLP_BIN:-$HOME/.local/bin/yt-dlp}"
YT_DLP_COMMON_ARGS=(
  --retries "${YT_DLP_RETRIES:-20}"
  --fragment-retries "${YT_DLP_FRAGMENT_RETRIES:-50}"
  --retry-sleep "${YT_DLP_RETRY_SLEEP:-5}"
  --socket-timeout "${YT_DLP_SOCKET_TIMEOUT:-30}"
)

if [[ "${YT_DLP_NO_PART:-0}" == "1" ]]; then
  YT_DLP_COMMON_ARGS+=(--no-part)
fi
if [[ ! -x "$YT_DLP" ]]; then
  echo "yt-dlp not found at $YT_DLP"
  echo "Install it with: python3 -m pip install --user yt-dlp"
  exit 1
fi

mkdir -p "$RAW_DIR" "$NORM_DIR" "$AUDIT_DIR"

echo "[1/4] Fetching playlist metadata"
"$YT_DLP" --skip-download -J "$PLAYLIST_URL" > "$META_JSON"

echo "[2/4] Downloading SoundCloud playlist tracks (this may take a long time)"
"$YT_DLP" \
  "${YT_DLP_COMMON_ARGS[@]}" \
  --extract-audio \
  --audio-format mp3 \
  --audio-quality 0 \
  --no-overwrites \
  --output "$RAW_DIR/%(playlist_index)03d-%(title).120B.%(ext)s" \
  "$PLAYLIST_URL"

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
fi

echo "[4/5] Normalizing files by surah number"
node "$ROOT_DIR/scripts/sync-soundcloud-pashto-mapping.js" \
  --meta "$META_JSON" \
  --raw "$RAW_DIR" \
  --out-dir "$NORM_DIR" \
  --out-mapping "$MAPPING_JSON"

echo "[5/5] Done"
echo "Normalized audio dir: $NORM_DIR"
echo "Mapping file: $MAPPING_JSON"
