#!/usr/bin/env python3
"""
generate-screenshots.py — Play Store screenshot framer for Falah app
----------------------------------------------------------------------
Usage:
  python3 generate-screenshots.py

Reads raw app screenshots from screenshots/raw/ (PNG, any resolution),
adds a branded gradient background + headline text, optional phone bezel,
and outputs 1080×1920 PNGs to screenshots/store/.

SETUP:
  pip install Pillow
  mkdir -p screenshots/raw screenshots/store

INPUT FILES (place in screenshots/raw/):
  01_home_prayer.png     – Home tab: prayer countdown card
  02_home_tiles.png      – Home tab: quick tiles + hadith
  03_duas_grid.png       – Duas tab: category grid
  04_dua_detail.png      – Duas tab: expanded dua card
  05_quran_list.png      – Quran tab: Juz 30 surah list
  06_quran_player.png    – Quran tab: audio player playing
  07_40hadith.png        – More tab: 40 Hadith detail
  08_favourites.png      – More tab: favourites list

OUTPUT: screenshots/store/01_home_prayer.png … 08_favourites.png
"""

import os
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

# ──────────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────────

OUT_W, OUT_H = 1080, 1920
RAW_DIR  = Path("screenshots/raw")
OUT_DIR  = Path("screenshots/store")

# Brand palette
BG_TOP    = (10,  22,  40)    # --bg-primary deepened
BG_BOT    = (4,   9,  18)    # near-black
GOLD      = (201, 168, 76)    # --accent-gold
GOLD_DIM  = (120, 100, 45)
WHITE     = (255, 255, 255)
BLUE_MID  = (18,  40,  72)

# Screenshot metadata: filename → (headline, sub-headline)
SCREENS = {
    "01_home_prayer.png":  ("Your Daily Prayer Companion",  "Never miss a prayer — live countdown to the next salah"),
    "02_home_tiles.png":   ("Everything in One Place",       "Quran · Duas · Tasbeeh · Qibla — one tap away"),
    "03_duas_grid.png":    ("63+ Essential Duas",            "Organised across 12 thematic sections"),
    "04_dua_detail.png":   ("Arabic · Meaning · Transliteration", "Read, understand, and memorise with ease"),
    "05_quran_list.png":   ("Full Quran Juz 30",             "Read every surah of the last juz"),
    "06_quran_player.png": ("Pashto Audio Recitation",       "Listen along with Sheikh Zakaria — offline"),
    "07_40hadith.png":     ("40 Hadith of Imam an-Nawawi",   "The essential collection every Muslim should know"),
    "08_favourites.png":   ("Save Your Favourites",          "Bookmark duas for instant access"),
}

ICON_PATH = Path("icon-192.png")   # used as a small brand mark on each screen

# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

def load_font(size: int, bold: bool = False):
    """Load a system sans-serif font with graceful fallback."""
    candidates_bold = [
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    candidates_regular = [
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    paths = candidates_bold if bold else candidates_regular
    for p in paths:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def gradient_bg(w: int, h: int) -> Image.Image:
    """Create a midnight-blue vertical gradient canvas."""
    img = Image.new("RGB", (w, h))
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / h
        r = int(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t)
        g = int(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t)
        b = int(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t)
        draw.line([(0, y), (w, y)], fill=(r, g, b))
    return img


def draw_gold_line(draw: ImageDraw.Draw, y: int, w: int, opacity: int = 80):
    """Draw a 1px horizontal gold divider."""
    draw.line([(60, y), (w - 60, y)], fill=(*GOLD, opacity), width=1)


def wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width: int, draw: ImageDraw.Draw) -> list[str]:
    """Word-wrap text to fit max_width pixels."""
    words = text.split()
    lines, line = [], ""
    for word in words:
        test = (line + " " + word).strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] > max_width and line:
            lines.append(line)
            line = word
        else:
            line = test
    if line:
        lines.append(line)
    return lines


def place_screenshot(canvas: Image.Image, raw: Image.Image,
                     area_top: int, area_bot: int,
                     bezel: bool = True) -> None:
    """
    Scale raw screenshot to fit the available area (centred).
    If bezel=True, add a simple rounded dark phone frame.
    """
    area_h = area_bot - area_top
    area_w = canvas.width
    padding = 40

    # Scale raw to fit
    scale = min((area_w - padding * 2) / raw.width,
                (area_h - padding * 2) / raw.height)
    new_w = int(raw.width  * scale)
    new_h = int(raw.height * scale)
    raw_resized = raw.resize((new_w, new_h), Image.LANCZOS)

    off_x = (area_w - new_w) // 2
    off_y = area_top + (area_h - new_h) // 2

    if bezel:
        # Draw a thin rounded-rect "phone bezel"
        bpad = 12
        brd = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        brd_draw = ImageDraw.Draw(brd)
        brd_draw.rounded_rectangle(
            [off_x - bpad, off_y - bpad, off_x + new_w + bpad, off_y + new_h + bpad],
            radius=32,
            fill=(30, 30, 30, 255),
            outline=(60, 60, 60, 255),
            width=2
        )
        canvas.paste(brd.convert("RGB"), (0, 0))

    canvas.paste(raw_resized, (off_x, off_y))


# ──────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────

def process_screen(filename: str, raw_path: Path, out_path: Path,
                   headline: str, subline: str) -> None:
    print(f"  Processing {filename} → {out_path.name}")

    canvas = gradient_bg(OUT_W, OUT_H)
    draw = ImageDraw.Draw(canvas)

    # ── Brand icon (top-left corner) ───────────────────────────
    if ICON_PATH.exists():
        icon = Image.open(ICON_PATH).convert("RGBA")
        icon = icon.resize((72, 72), Image.LANCZOS)
        canvas.paste(icon, (54, 64), icon)

    # ── App name (top-right) ───────────────────────────────────
    name_font = load_font(36, bold=True)
    draw.text((OUT_W - 64, 64 + 18), "Falah", font=name_font, fill=GOLD, anchor="rm")

    # ── Top gold divider ───────────────────────────────────────
    draw_gold_line(draw, 160, OUT_W, opacity=60)

    # ── Headline ───────────────────────────────────────────────
    h_font = load_font(68, bold=True)
    h_lines = wrap_text(headline, h_font, OUT_W - 120, draw)
    h_y = 190
    for line in h_lines:
        bbox = draw.textbbox((0, 0), line, font=h_font)
        lw = bbox[2] - bbox[0]
        draw.text(((OUT_W - lw) // 2, h_y), line, font=h_font, fill=WHITE)
        h_y += bbox[3] - bbox[1] + 8

    # ── Sub-headline ───────────────────────────────────────────
    s_font = load_font(34)
    s_lines = wrap_text(subline, s_font, OUT_W - 160, draw)
    s_y = h_y + 16
    for line in s_lines:
        bbox = draw.textbbox((0, 0), line, font=s_font)
        lw = bbox[2] - bbox[0]
        draw.text(((OUT_W - lw) // 2, s_y), line, font=s_font, fill=(*GOLD_DIM, 255))
        s_y += bbox[3] - bbox[1] + 6

    # ── Gold divider below headlines ───────────────────────────
    divider_y = s_y + 24
    draw_gold_line(draw, divider_y, OUT_W, opacity=50)

    # ── Screenshot area ────────────────────────────────────────
    screen_top = divider_y + 20
    screen_bot = OUT_H - 120

    raw = Image.open(raw_path).convert("RGB")
    place_screenshot(canvas, raw, screen_top, screen_bot, bezel=True)

    # ── Bottom attribution ─────────────────────────────────────
    draw_gold_line(draw, OUT_H - 110, OUT_W, opacity=40)
    attr_font = load_font(26)
    attr = "حيّ على الفلاح  ·  by Mohammad Falah  ·  Free & Offline"
    bbox = draw.textbbox((0, 0), attr, font=attr_font)
    draw.text(((OUT_W - (bbox[2] - bbox[0])) // 2, OUT_H - 80),
              attr, font=attr_font, fill=(*GOLD, 120))

    canvas.save(out_path, "PNG", optimize=True)
    print(f"    ✓ Saved ({out_path.stat().st_size // 1024}KB)")


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if not RAW_DIR.exists():
        print(f"ERROR: Raw screenshots directory '{RAW_DIR}' not found.")
        print("Create it and add your app screenshots (see SCREENSHOTS_GUIDE.md).")
        sys.exit(1)

    found = list(SCREENS.keys())
    missing = [f for f in found if not (RAW_DIR / f).exists()]

    if missing:
        print(f"No input screenshots found in {RAW_DIR}/")
        print("Expected files:")
        for name, (h, s) in SCREENS.items():
            status = "✓" if (RAW_DIR / name).exists() else "✗ MISSING"
            print(f"  {status}  {name}  →  \"{h}\"")
        print(f"\nPlace your raw app screenshots in {RAW_DIR}/ and re-run.")
        print("(Any PNG resolution works — the script scales them automatically.)")
        sys.exit(0)

    print(f"Generating {OUT_W}×{OUT_H} Play Store screenshots → {OUT_DIR}/")
    count = 0
    for filename, (headline, subline) in SCREENS.items():
        raw_path = RAW_DIR / filename
        if not raw_path.exists():
            print(f"  Skipping {filename} (not found in {RAW_DIR}/)")
            continue
        out_path = OUT_DIR / filename
        process_screen(filename, raw_path, out_path, headline, subline)
        count += 1

    print(f"\nDone — {count} screenshot(s) written to {OUT_DIR}/")
    print("Upload the PNG files from screenshots/store/ to the Play Console.")


if __name__ == "__main__":
    main()
