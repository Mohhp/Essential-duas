#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function arg(name, fallback = '') {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return fallback;
  return process.argv[i + 1];
}

const metaPath = path.resolve(arg('--meta', 'audio/pashto_audit/soundcloud_playlist_full.json'));
const rawDir = path.resolve(arg('--raw', 'audio/quran-pashto-soundcloud-raw'));
const outDir = path.resolve(arg('--out-dir', 'audio/quran-pashto-soundcloud-normalized'));
const outMapping = path.resolve(arg('--out-mapping', 'audio/pashto_audit/pashto_soundcloud_mapping_114.json'));
const archiveFallbackPath = path.resolve('audio/pashto_audit/pashto_archive_mapping_114.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function findSurahNo(title) {
  const m = String(title || '').trim().match(/^(\d{1,3})\b/);
  return m ? Number(m[1]) : null;
}

function toPublicPath(absPath) {
  const rel = path.relative(path.resolve('.'), absPath).split(path.sep).join('/');
  return `/${rel}`;
}

function copyIfExists(src, dst) {
  if (!fs.existsSync(src)) return false;
  fs.copyFileSync(src, dst);
  return true;
}

function normalizedOutFilePath(surah) {
  return path.join(outDir, `${String(surah).padStart(3, '0')}.mp3`);
}

function main() {
  const playlist = readJson(metaPath);
  const archiveFallback = fs.existsSync(archiveFallbackPath) ? readJson(archiveFallbackPath) : [];

  fs.mkdirSync(outDir, { recursive: true });

  const bySurah = new Map();
  const soundcloudSurahs = new Set();
  for (const entry of playlist.entries || []) {
    const surah = findSurahNo(entry.title || '');
    if (!surah || surah < 1 || surah > 114) continue;
    soundcloudSurahs.add(surah);

    const rawPrefix = String(entry.playlist_index || '').padStart(3, '0');
    const candidates = fs.readdirSync(rawDir)
      .filter((name) => name.startsWith(`${rawPrefix}-`) && name.toLowerCase().endsWith('.mp3'));

    const srcFile = candidates.length ? path.join(rawDir, candidates[0]) : null;
    const outFile = normalizedOutFilePath(surah);
    if (srcFile) copyIfExists(srcFile, outFile);

    bySurah.set(surah, {
      surah,
      source: 'soundcloud',
      title: entry.title || '',
      track_url: entry.webpage_url || entry.url || '',
      pashto_audio_url: fs.existsSync(outFile) ? toPublicPath(outFile) : '',
      downloaded: fs.existsSync(outFile)
    });
  }

  // If we already have normalized local audio for any surah (including tracks found outside
  // the original playlist), prefer that local file as the primary URL.
  for (let surah = 1; surah <= 114; surah += 1) {
    const outFile = normalizedOutFilePath(surah);
    if (!fs.existsSync(outFile)) continue;
    if (!bySurah.has(surah)) {
      bySurah.set(surah, {
        surah,
        source: 'soundcloud-extra-local',
        title: `Surah ${surah}`,
        track_url: '',
        pashto_audio_url: toPublicPath(outFile),
        downloaded: true
      });
      continue;
    }

    const existing = bySurah.get(surah);
    existing.pashto_audio_url = toPublicPath(outFile);
    existing.downloaded = true;
    if (!existing.source || existing.source === 'archive-fallback' || existing.source === 'soundcloud-fallback') {
      existing.source = 'soundcloud-local';
    }
  }

  for (const row of archiveFallback) {
    const surah = Number(row.surah);
    if (bySurah.has(surah) && bySurah.get(surah).downloaded) continue;
    if (!bySurah.has(surah)) {
      bySurah.set(surah, {
        surah,
        source: 'archive-fallback',
        title: row.name_en || `Surah ${surah}`,
        track_url: row.pashto_audio_url,
        pashto_audio_url: row.pashto_audio_url,
        downloaded: false
      });
    } else {
      const existing = bySurah.get(surah);
      if (!existing.downloaded && !existing.pashto_audio_url) {
        existing.source = 'soundcloud-fallback';
        existing.fallback_audio_url = row.pashto_audio_url;
        existing.pashto_audio_url = row.pashto_audio_url;
      }
    }
  }

  const rows = Array.from(bySurah.values()).sort((a, b) => a.surah - b.surah);
  const payload = {
    source: {
      primary: 'soundcloud',
      playlist: 'https://soundcloud.com/mirwais-rahimi-737968388/sets/quran-with-pashto-translation',
      generated_at: new Date().toISOString(),
      note: 'If a SoundCloud surah is missing or not downloaded, archive fallback is used.'
    },
    coverage: {
      total: rows.length,
      downloaded_count: rows.filter((r) => r.downloaded).length,
      missing_from_soundcloud: Array.from({ length: 114 }, (_, i) => i + 1).filter((s) => !soundcloudSurahs.has(s))
    },
    rows
  };

  fs.mkdirSync(path.dirname(outMapping), { recursive: true });
  fs.writeFileSync(outMapping, JSON.stringify(payload, null, 2), 'utf8');

  console.log(`Saved mapping: ${outMapping}`);
  console.log(`Rows: ${rows.length}`);
  console.log(`Downloaded: ${payload.coverage.downloaded_count}`);
  console.log(`Missing from SoundCloud: ${payload.coverage.missing_from_soundcloud.length}`);
}

main();
