# Audio Coverage

## Pashto Quran Audio Status (2026-03-05)

- Local surah coverage: **114/114**
- Primary mapping file: `audio/pashto_audit/pashto_soundcloud_mapping_114.json`
- SoundCloud playlist raw files: **102** (`audio/quran-pashto-soundcloud-raw`)
- Supplemental direct-track files used for gaps: **12** (`audio/quran-pashto-soundcloud-normalized`)
- Per-track failure log: `audio/pashto_audit/soundcloud_per_track_failures_20260305.tsv` (0 failures in latest run)

### Size Snapshot

- Normalized Pashto Quran audio: `2,255,501,240` bytes (about `2.2G`)
- Raw playlist Pashto Quran audio: `2,217,145,868` bytes (about `2.2G`)
- Combined raw + normalized on disk: `4,472,647,108` bytes (about `4.47G`)
- Note: combined size includes duplication because normalized files are copied/renamed deliverables.

### Recommended Sync Command

Use the resilient per-track mode to avoid playlist-level stalls on single tracks:

```bash
npm run sync:pashto-soundcloud:per-track
```

This mode is designed to continue per surah even if one track has transient SoundCloud fragment errors.

## Summary

- Total coverage: **50/63 duas (79%)**
- Quran API audio: **21**
- Hosted audio files: **29**

## Duas With Audio (50)

| ID | Dua Title | Source Type | Audio Source |
|---:|---|---|---|
| 1 | Surah Al-Fatiha — The Mother of the Quran Qur'an | quran API | 1:1-7 |
| 2 | Ayat al-Kursi — The Greatest Verse Qur'an | quran API | 2:255 |
| 3 | Dua of Yunus عليه السلام — Never Rejected Qur'an | quran API | 21:87 |
| 4 | Mercy for Parents Qur'an | quran API | 17:24 |
| 5 | Last Two Verses of Al-Baqarah Qur'an | quran API | 2:285-286 |
| 6 | The Three Quls — The Nightly Shield Qur'an | quran API | 112:1-4, 113:1-5, 114:1-6 |
| 7 | Rabbana Atina — The Prophet's ﷺ Most Frequent Dua Qur'an | quran API | 2:201 |
| 8 | Do Not Let Our Hearts Deviate Qur'an | quran API | 3:8 |
| 9 | Dua of Adam & Hawa عليهما السلام Qur'an | quran API | 7:23 |
| 10 | Increase Me in Knowledge Qur'an | quran API | 20:114 |
| 11 | Refuge in Allah's Perfect Words Sahih | hosted | audio/duas/dua-11.mp3 |
| 12 | In the Name of Allah — Nothing Can Harm Sahih | hosted | audio/duas/dua-12.mp3 |
| 13 | The Four Refuges — Commanded in Every Prayer Sahih | hosted | audio/duas/dua-13.mp3 |
| 14 | Contentment with Allah as Lord Sahih | hosted | audio/duas/dua-14.mp3 |
| 15 | Entering the Restroom Sahih | hosted | audio/duas/dua-15.mp3 |
| 16 | Sayyid al-Istighfar — Master of Forgiveness Sahih | hosted | audio/duas/dua-16.mp3 |
| 17 | Comprehensive Forgiveness Sahih | hosted | audio/duas/dua-17.mp3 |
| 21 | Salat al-Istikhara — The Guidance Prayer Sahih | hosted | audio/duas/dua-21.mp3 |
| 23 | Asking for 'Afiyah — Permanent Wellbeing Sahih | hosted | audio/duas/dua-23.mp3 |
| 24 | The Anxiety & Distress Dua Sahih | hosted | audio/duas/dua-24.mp3 |
| 25 | Refuge from Eight Afflictions Sahih | hosted | audio/duas/dua-25.mp3 |
| 26 | In Times of Great Distress Sahih | hosted | audio/duas/dua-26.mp3 |
| 27 | Lā Sahla — Nothing Is Easy Except What You Make Easy Sahih | hosted | audio/duas/dua-27.mp3 |
| 29 | Dua of Musa عليه السلام — Expand My Chest Qur'an | quran API | 20:25-28 |
| 30 | Dua of Ibrahim عليه السلام — Establish Prayer Qur'an | quran API | 14:40 |
| 31 | Dua of Sulaiman عليه السلام — Inspire Gratitude Qur'an | quran API | 27:19 |
| 32 | Dua of Ayyub عليه السلام — In Affliction Qur'an | quran API | 21:83 |
| 33 | Dua of Zakariyya عليه السلام — Righteous Offspring Qur'an | quran API | 3:38 |
| 34 | Morning & Evening Remembrance Sahih | hosted | audio/duas/dua-34.mp3 |
| 35 | Ḥasbiyallāh — Placing Trust in Allah Qur'an | quran API | 9:129 |
| 36 | The Tahlīl of Paradise — 100x Daily Sahih | hosted | audio/duas/dua-36.mp3 |
| 37 | Freedom from Debt & Self-Sufficiency Sahih | hosted | audio/duas/dua-37.mp3 |
| 38 | Beneficial Knowledge, Good Provision & Accepted Deeds Sahih | hosted | audio/duas/dua-38.mp3 |
| 39 | Before Eating Sahih | hosted | audio/duas/dua-39.mp3 |
| 40 | Forgiveness for Self, Parents & All Believers Qur'an | quran API | 14:41 |
| 41 | Ism Allāh al-Aʿẓam — The Greatest Name of Allah Sahih | hosted | audio/duas/dua-41.mp3 |
| 42 | The Ultimate Ism al-Aʿẓam — With Sūrah al-Ikhlāṣ Sahih | hosted | audio/duas/dua-42.mp3 |
| 46 | The Ibrahīmic Ṣalawāt — The Key That Makes Dua Ascend Sahih | hosted | audio/duas/dua-46.mp3 |
| 47 | The Night Dua of ʿAlī & Fāṭimah رضي الله عنهما Sahih | hosted | audio/duas/dua-47.mp3 |
| 49 | Before Sleeping — Full Prophetic Version Sahih | hosted | audio/duas/dua-49.mp3 |
| 50 | Dua for Travel Sahih | quran API | 43:13-14 |
| 51 | Entering the Masjid Sahih | hosted | audio/duas/dua-51.mp3 |
| 52 | For Those Who Have Been Extravagant in Sin Qur'an | quran API | 3:147 |
| 56 | Dua for Sighting the New Moon Hasan | hosted | audio/duas/dua-56.mp3 |
| 57 | Dua for Breaking the Fast (Iftar) Hasan | hosted | audio/duas/dua-57.mp3 |
| 58 | Dua When Invited While Fasting Sahih | hosted | audio/duas/dua-58.mp3 |
| 59 | The Dua of the Fasting Person Hasan | hosted | audio/duas/dua-59.mp3 |
| 60 | Protection for Children — The Prophet's Own Dua Sahih | hosted | audio/duas/dua-60.mp3 |
| 62 | Surah Al-Falaq — Shield Against Envy Qur'an | quran API | 113:1-5 |
| 63 | Mā Shā' Allāh — Preventing the Evil Eye Qur'an | quran API | 18:39 |

## Duas Without Audio (13)

- **ID 18** — Dua for Laylatul Qadr — Night of Decree Sahih: no reliable source found
- **ID 19** — O Turner of Hearts — Keep Us Firm Sahih: no reliable source found
- **ID 20** — Taqwa & Purification of the Soul Sahih: no reliable source found
- **ID 22** — Perfect My Character Sahih: no reliable source found
- **ID 28** — Jibril's Healing Dua Sahih: no reliable source found
- **ID 43** — The Praise That Fills the Heavens Sahih: no reliable source found
- **ID 44** — The Dua of Tawḥīd — Ibn Taymiyyah's Sujūd Dua Sahih: no reliable source found
- **ID 45** — The Mother of All Duas — Every Decree Becomes Good Sahih: no reliable source found
- **ID 48** — Protection from the Four Evils Sahih: no reliable source found
- **ID 53** — The Dua of al-Khaḍir عليه السلام Jayyid: no reliable source found
- **ID 54** — The Dua of Ṭā'if — Greatest Expression of Tawakkul Sīrah: no reliable source found
- **ID 55** — The Master Key Dua — Encompasses Every Dua ﷺ Ever Made Hasan: no reliable source found
- **ID 61** — Ruqyah for the Evil Eye — Jibreel's Healing Sahih: no reliable source found

## Future Note

These 13 duas can be added later when reliable HTTPS audio sources are found and verified against exact Arabic text.
