# Pashto Quran Audio Source Audit

Primary source audited:
- Internet Archive item: `Al-Quran-with-Pashto-Pushto-Translation-Audio-MP3-CD`
- Base URL: `https://archive.org/download/Al-Quran-with-Pashto-Pushto-Translation-Audio-MP3-CD/`

## 1) Filename Pattern + Count

Confirmed:
- Total MP3 surah files: `114`
- Pattern: `NNN - <English Name> - <Arabic Name>.mp3`
- Numeric prefix is zero-padded 3 digits (`001`..`114`)

Exact filenames:
- See `archive_filenames_114.txt`

## 2) Spot-check (Surahs 1, 2, 36, 114)

File: `spotcheck_surah_1_2_36_114.txt`

Observed consistency:
- Audio codec: `mp3`
- Sample rate: `24000`
- Channels: `1`
- Embedded cover stream detected as `mjpeg` (non-blocking)

Durations:
- Surah 1: `93.240s`
- Surah 2: `14205.120s`
- Surah 36: `1802.256s`
- Surah 114: `77.880s`

## 3) Mapping JSON Deliverables

Generated with requested fields:
- `surah`
- `name_en`
- `name_ps`
- `pashto_audio_url`
- `format`
- `duration_seconds` (null placeholder)

Files:
- Full 114 mapping: `pashto_archive_mapping_114.json`
- Juz 30 mapping (78-114): `pashto_archive_mapping_juz30.json`

Counts:
- Full: `114`
- Juz 30: `37`

## 3.1) Mirror Implementation (Juz 30)

Completed mirror:
- Source files downloaded from Archive and normalized to: `078.mp3` ... `114.mp3`
- Folder (original mirror): `../quran-pashto-juz30/`
- Folder (final normalized mirror): `../quran-pashto-juz30-normalized/`

Mapping update:
- `pashto_archive_mapping_juz30.json` now points to:
	- `https://mohhp.github.io/Essential-duas/audio/quran-pashto-juz30-normalized/NNN.mp3`

## 4) Range/Latency/Reliability

Latency samples:
- Pre-redirect (`302`): `latency_pre_redirect.tsv`
- Follow-redirect (`206`, with one redirect): `latency_follow_redirect.tsv`

Sample follow-redirect results (surahs 001,002,036,078,090,114):
- TTFB approx `1.18s - 1.25s`
- Status: `206`
- Redirects: `1`

Header checks (followed redirect):
- `content-type: audio/mpeg`
- `accept-ranges: bytes`
- `access-control-allow-origin: *`

Recommendation:
- For pilot or low-to-medium traffic: direct Archive streaming is viable.
- For production reliability/SLA and latency control: mirror/cache hot files (at least Juz 30) on your own storage/CDN.

Current measurement status:
- Archive measured: yes (`~1.2s` TTFB after redirect)
- Self-hosted GitHub Pages URL currently returns `404` until deployment is live.
- Local self-host baseline (`http.server`) is much lower (sub-`2ms` TTFB), but this is not a real CDN metric.

## 5) Backup Source Feasibility (Islamhouse)

Quick scrape of `https://islamhouse.com/ps/` did not expose direct static MP3 links suitable for deterministic backend mapping.

Assessment:
- Islamhouse is better treated as a discovery/reference source, not primary direct-audio backend for per-surah URL mapping.

## 6) Pashto TTS Feasibility (Quick Note)

Not recommended for Quran translation recitation as primary source quality path.

Reason:
- Typical Pashto TTS quality/prosody is weaker than human recitation+translation recordings and can reduce listener trust/comprehension.

Suggested use:
- Optional accessibility fallback only, not default.

## 7) Licensing/Redistribution Note

Metadata fields checked in source item:
- `licenseurl: None`
- `rights: None`
- `creator: None`
- `uploader: info@thechoice.one`

Uploader/translator identification from source metadata/description:
- Uploader: `info@thechoice.one`
- Reciter: `Mishary Rashid Al-Afasy`
- Translator attribution shown: `Professor Shafeeq ur Rahman`

Discovery search action:
- Query used: `"Professor Shafeeq ur Rahman" Pashto Quran translation license`
- Findings surfaced: Archive item and `thechoice.one` source page for the same audio set.
- No explicit public redistribution license discovered in these surfaced sources.

Current status (documented):
- Mirror is approved for integration and public app use under the permission already secured by the project owner.
- Recommended ops follow-up: keep a copy of the permission record (email/chat/letter) in project governance docs.
