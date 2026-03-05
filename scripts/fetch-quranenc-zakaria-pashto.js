#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://quranenc.com/api/v1/translation/sura/pashto_zakaria';
const OUT_FILE = path.resolve(__dirname, '..', 'audio', 'pashto_audit', 'quranenc_pashto_zakaria_114.json');

async function fetchSurah(surah) {
  const res = await fetch(`${API_BASE}/${surah}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for surah ${surah}`);
  const json = await res.json();
  if (!json || !Array.isArray(json.result)) {
    throw new Error(`Unexpected payload for surah ${surah}`);
  }

  const ayahs = json.result
    .map((row) => ({
      ayah: Number(row.aya),
      text: String(row.translation || '').trim(),
      footnotes: String(row.footnotes || '').trim()
    }))
    .sort((a, b) => a.ayah - b.ayah);

  return {
    surah: Number(surah),
    ayahs
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  const surahs = [];
  for (let s = 1; s <= 114; s += 1) {
    process.stdout.write(`Fetching surah ${s}/114...\n`);
    surahs.push(await fetchSurah(s));
  }

  const out = {
    source: {
      provider: 'quranenc',
      translation_key: 'pashto_zakaria',
      api_base: API_BASE,
      fetched_at: startedAt
    },
    surahs
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');

  const totalAyahs = surahs.reduce((acc, s) => acc + s.ayahs.length, 0);
  process.stdout.write(`Saved ${surahs.length} surahs / ${totalAyahs} ayahs to ${OUT_FILE}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
