# QA Checklist (Manual Release Template)

Use this checklist before every release. Mark each item as complete when verified.

## Release Info

- [ ] Version / tag:
- [ ] Build date:
- [ ] Tester name:
- [ ] Device(s) + OS:
- [ ] Browser(s):
- [ ] Notes / known limitations:

---

## 1) Navigation & Back Stack

### Floating Back FAB
- [ ] Open a dua category and scroll down; back FAB appears.
- [ ] Tap back FAB; returns to home/category grid.
- [ ] Open Quran reader and scroll; back FAB appears.

### Swipe Back (left edge)
- [ ] Start swipe within left ~30px edge.
- [ ] Swipe right (~80px+); app navigates back one in-app state.
- [ ] Swipe indicator appears during gesture and disappears after release.

### System/Browser Back Behavior
- [ ] From Quran reader, back returns to Quran tab/list (not exit).
- [ ] From Quran tab/list, back returns to home.
- [ ] From category view, back returns to home.
- [ ] From prayer/routine/tasbeeh/etc. panel, back closes panel to home.
- [ ] On home, back exits app/browser history (no in-app intercept).

### Required Back Chains
- [ ] Home → Category View → Dua Detail → back → Category View → back → Home.
- [ ] Home → Quran Tab → Surah Reader → back → Quran Tab → back → Home.
- [ ] Home → Prayer Panel → back → Home.

### Scroll-to-Top FAB
- [ ] In home scroll context, top FAB appears when scrollTop > 300.
- [ ] In category view scroll context, top FAB appears when scrollTop > 300.
- [ ] In Quran reader scroll context, top FAB appears when scrollTop > 300.
- [ ] FAB hides again when near top (<100).
- [ ] Tap top FAB; smooth scroll to top works.

---

## 2) Quran Reader

### Surah Loading & Reader State
- [ ] Open Al-Fatiha; ayahs load correctly.
- [ ] Open Al-Baqarah; incremental/lazy rendering works.
- [ ] Open At-Tawbah; Bismillah line is hidden as expected.

### Sticky Header & Spacing
- [ ] Header stays sticky while scrolling.
- [ ] First ayah is not hidden behind header.
- [ ] No overlap between sticky header/translation controls and ayah content.
- [ ] Verify with short, medium, long surah names.
- [ ] Verify in reading mode (nav hidden).
- [ ] Verify in English + Pashto.
- [ ] Verify in dark + light themes.

### Reader Controls & Modes
- [ ] Translation mode toggles (AR+PS+EN, AR+PS, AR+EN, AR only) work.
- [ ] Reading mode toggles on/off correctly and maintains readable spacing.
- [ ] Continue reading and recent surah sections update correctly.
- [ ] Top reading progress indicator updates while scrolling.

---

## 3) Audio Player (Quran)

### Tap Responsiveness
- [ ] Play on ayah card responds immediately.
- [ ] Play/Pause control tap target is at least 48x48.
- [ ] Prev / Next / Stop controls tap reliably.

### Playback UX
- [ ] Loading spinner appears while buffering.
- [ ] Pause stops immediately.
- [ ] Stop resets progress and clears current ayah highlight.
- [ ] Rapid play/pause taps do not break control state.
- [ ] Mini player label updates to current Surah/Ayah.

### Reciter / Speed / Play-All
- [ ] Reciter switching works and persists.
- [ ] Speed selection updates playback rate.
- [ ] Play-all advances ayahs and stops at end correctly.

---

## 4) Prayer Reminders

### Reminder Settings UI
- [ ] Prayer reminder panel opens and settings render.
- [ ] Master reminders toggle works.
- [ ] Per-prayer toggles (Fajr/Dhuhr/Asr/Maghrib/Isha) work.
- [ ] Reminder offset (At time / 5 / 10 / 15 min) saves and reloads.

### Sound Selection
- [ ] All reminder sound cards display.
- [ ] Sound preview button exists for playable options.
- [ ] Selecting a sound persists after reload.
- [ ] "Same sound for all prayers" toggle works.
- [ ] Per-prayer sound selectors appear when same-sound is disabled.
- [ ] Per-prayer selections persist.

### Preview & Test Behavior
- [ ] Preview tap gives visual feedback.
- [ ] Preview plays selected file.
- [ ] Test Reminder uses current selected sound path.

---

## 5) Compass / Qibla

- [ ] Qibla section renders in prayer panel.
- [ ] Bearing text updates after location load.
- [ ] Compass permission flow works on supported devices.
- [ ] Needle rotates and alignment status updates.
- [ ] Fallback behavior is sensible if sensor unavailable.

---

## 6) Tasbeeh

- [ ] Tasbeeh panel opens/closes correctly.
- [ ] Counter increments reliably per tap.
- [ ] Target switching works (33/100/open count).
- [ ] Reset works and persisted totals behave correctly.
- [ ] Sound toggle for tasbeeh click works.
- [ ] Milestone/target completion feedback appears.

---

## 7) Memorization (Flashcards)

- [ ] Memorization panel opens from eligible entry points.
- [ ] Flashcard front/back flip works.
- [ ] Next/Prev navigation works.
- [ ] Progress indicator updates correctly.
- [ ] Difficulty rating buttons work and persist where applicable.
- [ ] Closing and reopening session restores expected state.

---

## 8) Search & Filtering

- [ ] Global search filters duas by text/keywords.
- [ ] Clear button resets search results.
- [ ] Category filtering shows expected cards.
- [ ] Section headers hide when all child cards are filtered out.
- [ ] No-results state appears when expected.

---

## 9) Bookmarks

- [ ] Bookmark toggle (☆/★) works on cards.
- [ ] Bookmarks panel opens and lists saved items.
- [ ] Tapping bookmark list item navigates to correct dua.
- [ ] Removing bookmark updates UI and storage.
- [ ] Quran ayah bookmarks save/open/remove correctly.

---

## 10) Offline Mode / Caching

- [ ] App shell loads offline after first visit.
- [ ] Quran downloaded surah opens offline.
- [ ] Cached Quran audio can play offline (if downloaded).
- [ ] Reminder sound assets are available offline.
- [ ] Service worker update prompt appears after new deploy.

---

## 11) Language Switching

- [ ] Toggle EN ↔ Pashto updates core UI labels.
- [ ] Quran labels, tabs, and reader metadata localize correctly.
- [ ] Prayer/reminder labels localize correctly.
- [ ] Number localization behaves as expected.
- [ ] Language preference persists after reload.

---

## 12) Theme Switching

- [ ] Toggle dark/light updates major surfaces.
- [ ] Quran panel/readers are readable in both themes.
- [ ] Sticky header and controls remain visually distinct in both themes.
- [ ] Reminder cards/controls remain readable in both themes.
- [ ] Theme preference persists after reload.

---

## 13) Accessibility

### Keyboard & Focus
- [ ] Interactive elements are reachable via keyboard.
- [ ] Enter/Space activates card headers and key buttons.
- [ ] Focus is visible and logical in panels.
- [ ] Escape closes open overlays/panels where designed.

### Semantics & ARIA
- [ ] Buttons and toggles have labels/aria-labels.
- [ ] Toast/alerts use polite live region behavior.
- [ ] Dialog/panel close controls have accessible names.

### Touch & Readability
- [ ] Critical touch targets are 48x48 minimum.
- [ ] Text contrast is acceptable in dark/light modes.
- [ ] Motion/animations do not block interaction.

---

## 14) Regression Smoke (Quick Sign-off)

- [ ] Navigation chains pass.
- [ ] Quran sticky header + spacing pass.
- [ ] Quran audio controls pass.
- [ ] Reminder preview/test/persistence pass.
- [ ] Offline checks pass.
- [ ] EN/PS + dark/light sanity pass.

## Final Sign-off
- [ ] All blockers resolved.
- [ ] Release approved for deployment.
