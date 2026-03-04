# Falah — فلاح

> 63 essential Islamic duas from the Quran and Sunnah, with tasbeeh counter, prayer times, Qibla compass, bookmarks, daily routines, memorization tools, audio recitation, and full scholarly authentication.

**Live app:** [mohhp.github.io/Essential-duas](https://mohhp.github.io/Essential-duas/)

---

## Project Status

### ✅ Completed Features

| Feature | Notes |
|---|---|
| **63 Authenticated Duas** | Full Arabic text, English transliteration & translation, Hadith source with grade (Sahih / Quranic / Jayyid), virtue commentary |
| **Categories** | Morning & Evening Adhkar, Protection & Healing, Meals, Travel, Home/Masjid, Sleep, Forgiveness, Gratitude, Ramadan & Fasting, Evil Eye & Envy |
| **Search** | Real-time search that filters cards and hides empty category sections |
| **Bookmarks** | Favourite duas saved to localStorage; accessible from the Bookmarks panel |
| **Tasbeeh Counter** | Digital counter with preset dhikr phrases (SubhanAllah, Alhamdulillah, Allahu Akbar, etc.), haptic feedback, and configurable targets |
| **Prayer Times** | GPS-based times using the [Adhan](https://github.com/batoulapps/adhan-js) library; countdown to next prayer; prayer notification toggle |
| **Qibla Compass** | Device-orientation compass showing Kaaba direction |
| **Daily Routine** | Morning (Sabah) and Evening (Masa) adhkar panels with progress tracking |
| **Dua of the Day** | Deterministic daily dua shown in the Routine panel |
| **Streak Tracker** | Consecutive-day streak for daily routine completion |
| **Spaced Repetition (SR)** | SM-2-style memorization system; "due" count badge on the Memorize button; review badges on cards |
| **Audio Recitation** | Web Speech API (SpeechSynthesis) for Arabic pronunciation; Arabic voice auto-selected |
| **Multi-language** | English ↔ Pashto toggle; Arabic text always displayed |
| **Dark / Light Theme** | Full CSS variable theming; persisted to localStorage |
| **Adjustable Arabic Font Size** | Font-scale control in toolbar |
| **Share as Image** | html2canvas card-to-PNG sharing via Web Share API |
| **Offline PWA** | Service worker (cache-first, v22) + Web App Manifest; installable on Android/iOS/desktop |
| **Privacy First** | No account, no ads, no tracking; all data stored locally |
| **Google Play Store listing** | `STORE_LISTING.md` ready; screenshots captured |

---

### 🛠️ Known Issues / Recent Fixes

- **PWA manifest paths** — Fixed start_url / scope to relative `./` for GitHub Pages deployment (v22 cache bump).
- **Pashto parser bug** — Stray multiline string fragment in `pashto.js` caused a JS parse error; corrected.
- **Pashto translations** — Comprehensive review pass: corrected spelling (بی→بې, چی→چې), honorifics (ﷺ, رضي الله عنه), and natural grammar across all 63 duas.
- **Search empty-section hiding** — `filterDuas()` now hides section headers when no matching cards exist.

---

### 🔮 Potential Next Steps

- [ ] Push to Google Play Store (TWA / Bubblewrap packaging)
- [ ] Push to Apple App Store (WKWebView wrapper)
- [ ] Prayer notification implementation (Web Push / local notifications)
- [ ] Additional language translations (Urdu, Arabic UI, etc.)
- [ ] Offline audio files for recitation (replace SpeechSynthesis with pre-recorded audio)
- [ ] Wider screenshot for Play Store wide form-factor

---

## Tech Stack

| Layer | Technology |
|---|---|
| App shell | Vanilla HTML / CSS / JS (single-file `index.html`) |
| Arabic fonts | Noto Naskh Arabic, Amiri (Google Fonts) |
| UI fonts | Cinzel, Playfair Display (Google Fonts) |
| Prayer times | [Adhan 4.4.3](https://github.com/batoulapps/adhan-js) (CDN) |
| Image export | [html2canvas 1.4.1](https://html2canvas.hertzen.com/) (CDN) |
| Pashto translations | `pashto.js` (companion script) |
| Service worker | `sw.js` (cache-first, versioned) |
| Manifest | `manifest.json` (PWA) |

---

## File Structure

```
Essential-duas/
├── index.html          # Main app (HTML + CSS + JS, self-contained)
├── pashto.js           # Pashto translation data and language-toggle logic
├── sw.js               # Service worker (offline caching)
├── manifest.json       # Web App Manifest (PWA install metadata)
├── offline.html        # Offline fallback page
├── privacy.html        # Privacy policy page
├── favicon.svg         # SVG favicon
├── icon-*.png          # PWA icons (48 → 512 px)
├── *.png               # Store screenshots
├── feature-graphic.html # Play Store feature graphic source
├── STORE_LISTING.md    # Google Play Store copy
└── .well-known/        # assetlinks.json for TWA verification
```

---

## Author

Built by **Engineer Mohammad Falah (فلاح)**.  
May Allah accept our duas and grant us all Jannah. Ameen. 🤲
