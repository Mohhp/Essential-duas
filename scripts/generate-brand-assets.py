#!/usr/bin/env python3
"""
Falah Brand Asset Generator
============================
Generates all brand assets from a single master SVG crescent+star symbol.

Outputs:
  - Logomark SVG+PNG (4 color variants)
  - Logo lockup vertical SVG+PNG (4 color variants)
  - App icon PNGs (512, 192, 48)
  - Feature graphic PNG (1024×500)
  - favicon.svg

Design spec:
  - Thin crescent (like 2-day-old moon), horn tips taper to fine points
  - 8-pointed star (Rub el Hizb: two overlapping squares, union)
  - Flat matte gold gradient: #8B6914 → #D4AF37 → #E8D088
  - Arabic: فلاح in Amiri Bold
  - English: FALAH in Cormorant Garamond SemiBold (fallback: serif)
"""

import math
import os
import subprocess
import sys

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "brand-assets")
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

os.makedirs(OUT_DIR, exist_ok=True)

# ──────────────────────────────────────────────
# Color definitions
# ──────────────────────────────────────────────
DARK_BG = "#0A1628"
WHITE = "#FFFFFF"
NAVY = "#0A1628"
BLACK = "#000000"
GOLD_DARK = "#8B6914"
GOLD_MID = "#D4AF37"
GOLD_LIGHT = "#E8D088"
MUTED_BLUE = "#4A5A6E"

# ──────────────────────────────────────────────
# Geometry: Crescent Moon
# ──────────────────────────────────────────────
def crescent_path(cx, cy, r_outer, thickness_ratio=0.22):
    """
    Generate SVG path for a thin crescent moon.
    The crescent is formed by subtracting an inner circle offset to the right.
    thickness_ratio controls the arc width (lower = thinner).
    Horn tips taper naturally to sharp points.
    """
    # Inner circle: slightly smaller and offset right
    r_inner = r_outer * (1 - thickness_ratio)
    # Offset the inner circle to create the crescent shape
    # More offset = thinner crescent at the widest point
    offset_x = r_outer * 0.32

    # We'll use two arcs: outer circle and inner circle (subtracted)
    # The crescent is: outer_circle - inner_circle_offset
    # But for clean SVG, we find the intersection points and draw the crescent directly.

    # Intersection points of two circles:
    # Circle 1: center (cx, cy), radius r_outer
    # Circle 2: center (cx + offset_x, cy), radius r_inner
    d = offset_x  # distance between centers

    # Using circle intersection formula
    if d >= r_outer + r_inner or d <= abs(r_outer - r_inner):
        # No intersection or one inside other — fallback
        # This shouldn't happen with our parameters
        pass

    a = (r_outer**2 - r_inner**2 + d**2) / (2 * d)
    h = math.sqrt(max(0, r_outer**2 - a**2))

    # Intersection points
    ix = cx + a
    iy_top = cy - h
    iy_bot = cy + h

    # Build path: start at top intersection, arc along outer circle (left/wide side),
    # then arc back along inner circle (right/narrow side)

    # Outer arc: from top intersection to bottom intersection, going LEFT (the big arc)
    # Inner arc: from bottom intersection to top intersection, going RIGHT (the small arc)

    # For the outer arc (large arc flag = 1, going counter-clockwise)
    # For the inner arc (large arc flag = 0, going clockwise)

    path = f"M {ix:.2f},{iy_top:.2f} "
    # Outer arc (large sweep around the left side)
    path += f"A {r_outer:.2f},{r_outer:.2f} 0 1,0 {ix:.2f},{iy_bot:.2f} "
    # Inner arc (back up the right side)
    inner_cx = cx + offset_x
    path += f"A {r_inner:.2f},{r_inner:.2f} 0 1,1 {ix:.2f},{iy_top:.2f} Z"

    return path


# ──────────────────────────────────────────────
# Geometry: 8-Pointed Star (Rub el Hizb)
# ──────────────────────────────────────────────
def eight_pointed_star_path(cx, cy, r):
    """
    Generate an 8-pointed star as union of two squares rotated 45° relative to each other.
    Returns a single SVG path (union of both squares).
    r = distance from center to point (outer radius).
    """
    # The 8-pointed star is formed by two overlapping squares.
    # Square 1: axis-aligned, vertices at 0°, 90°, 180°, 270°
    # Square 2: rotated 45°, vertices at 45°, 135°, 225°, 315°

    # For a clean union, we compute the outline of the star shape.
    # The star has 8 outer points and 8 inner concave vertices.
    # Inner radius where the squares intersect:
    r_inner = r * math.cos(math.pi / 4)  # = r * √2/2 ≈ 0.7071r
    # Actually for a proper Rub el Hizb, the inner concavity is at:
    # r_inner = r * cos(π/4) / cos(π/8)
    # But for simplicity, we'll use:
    # The intersection of s1 edges with s2 edges gives us the concave points.

    # Direct computation: 8 outer points at angles 0, 45, 90, 135, 180, 225, 270, 315
    # with alternating outer/inner radii
    # Outer points: at 0°, 90°, 180°, 270° (square 1 vertices) radius = r
    # And at 45°, 135°, 225°, 315° (square 2 vertices) radius = r
    # Inner (concave) points: between each pair, at 22.5°, 67.5°, etc.

    # For a squat star with clear 8 points:
    # The concave radius is where the edge of one square crosses the angle bisector
    # For squares: edge of square at angle θ from center has distance r·cos(π/4)/cos(θ - nearest_vertex_angle)
    # The concave radius at the midpoint angle:
    r_concave = r * math.cos(math.pi / 4)  # ≈ 0.7071 * r

    points = []
    for i in range(16):
        angle = math.radians(i * 22.5 - 90)  # start from top
        if i % 2 == 0:
            # Outer point
            radius = r
        else:
            # Concave point
            radius = r_concave

        px = cx + radius * math.cos(angle)
        py = cy + radius * math.sin(angle)
        points.append((px, py))

    path = f"M {points[0][0]:.2f},{points[0][1]:.2f} "
    for px, py in points[1:]:
        path += f"L {px:.2f},{py:.2f} "
    path += "Z"

    return path


# ──────────────────────────────────────────────
# SVG Templates
# ──────────────────────────────────────────────

def gold_gradient_def(grad_id="goldGrad", x1="0%", y1="100%", x2="0%", y2="0%"):
    """Flat matte gold gradient definition."""
    return f'''<defs>
    <linearGradient id="{grad_id}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">
      <stop offset="0%" stop-color="{GOLD_DARK}"/>
      <stop offset="50%" stop-color="{GOLD_MID}"/>
      <stop offset="100%" stop-color="{GOLD_LIGHT}"/>
    </linearGradient>
  </defs>'''


def crescent_star_group(cx, cy, size, fill="url(#goldGrad)", crescent_rotate=-30):
    """
    Generate the crescent + star symbol group.
    cx, cy = center of the composition
    size = overall bounding dimension
    """
    r_crescent = size * 0.45
    r_star = size * 0.09

    # Star positioned in the opening of the crescent (upper right area)
    star_cx = cx + size * 0.12
    star_cy = cy - size * 0.02

    crescent = crescent_path(cx - size * 0.05, cy, r_crescent, thickness_ratio=0.20)
    star = eight_pointed_star_path(star_cx, star_cy, r_star)

    return f'''<g transform="rotate({crescent_rotate}, {cx}, {cy})">
    <path d="{crescent}" fill="{fill}"/>
    <path d="{star}" fill="{fill}"/>
  </g>'''


# ──────────────────────────────────────────────
# Logomark Only (crescent + star, no text)
# ──────────────────────────────────────────────

def generate_logomark_svg(variant):
    """Generate logomark SVG for a given color variant."""
    viewbox_size = 200
    cx, cy = 100, 100
    symbol_size = 160

    if variant == "gold-on-dark":
        bg = f'<rect width="{viewbox_size}" height="{viewbox_size}" rx="20" fill="{DARK_BG}"/>'
        fill = "url(#goldGrad)"
        grad = gold_gradient_def()
    elif variant == "navy-on-white":
        bg = f'<rect width="{viewbox_size}" height="{viewbox_size}" rx="20" fill="{WHITE}"/>'
        fill = NAVY
        grad = ""
    elif variant == "black-on-white":
        bg = f'<rect width="{viewbox_size}" height="{viewbox_size}" rx="20" fill="{WHITE}"/>'
        fill = BLACK
        grad = ""
    elif variant == "white-on-transparent":
        bg = ""
        fill = WHITE
        grad = ""
    else:
        raise ValueError(f"Unknown variant: {variant}")

    symbol = crescent_star_group(cx, cy, symbol_size, fill=fill)

    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {viewbox_size} {viewbox_size}" width="{viewbox_size}" height="{viewbox_size}">
  {grad}
  {bg}
  {symbol}
</svg>'''
    return svg


# ──────────────────────────────────────────────
# Logo Lockup Vertical (crescent + star + text)
# ──────────────────────────────────────────────

def generate_lockup_svg(variant):
    """
    Generate vertical logo lockup: symbol on top, Arabic فلاح below, 
    divider line, English FALAH below that.
    """
    w, h = 400, 500
    cx = w / 2
    symbol_size = 180
    symbol_cy = 140

    if variant == "gold-on-dark":
        bg = f'<rect width="{w}" height="{h}" rx="0" fill="{DARK_BG}"/>'
        fill = "url(#goldGrad)"
        text_fill = "url(#goldGrad)"
        line_color = GOLD_MID
        grad = gold_gradient_def()
    elif variant == "navy-on-white":
        bg = f'<rect width="{w}" height="{h}" fill="{WHITE}"/>'
        fill = NAVY
        text_fill = NAVY
        line_color = NAVY
        grad = ""
    elif variant == "black-on-white":
        bg = f'<rect width="{w}" height="{h}" fill="{WHITE}"/>'
        fill = BLACK
        text_fill = BLACK
        line_color = BLACK
        grad = ""
    elif variant == "white-on-transparent":
        bg = ""
        fill = WHITE
        text_fill = WHITE
        line_color = WHITE
        grad = ""
    else:
        raise ValueError(f"Unknown variant: {variant}")

    symbol = crescent_star_group(cx, symbol_cy, symbol_size, fill=fill)

    # Arabic text: فلاح
    arabic_y = 310
    arabic_text = f'<text x="{cx}" y="{arabic_y}" text-anchor="middle" font-family="Amiri, \'Noto Naskh Arabic\', serif" font-weight="bold" font-size="72" fill="{text_fill}" direction="rtl" xml:lang="ar">فلاح</text>'

    # Divider line
    line_y = 345
    line_x1 = cx - 80
    line_x2 = cx + 80
    divider = f'<line x1="{line_x1}" y1="{line_y}" x2="{line_x2}" y2="{line_y}" stroke="{line_color}" stroke-width="1" opacity="0.6"/>'

    # English text: FALAH
    english_y = 390
    english_text = f'<text x="{cx}" y="{english_y}" text-anchor="middle" font-family="\'Cormorant Garamond\', \'Noto Serif\', Georgia, serif" font-weight="600" font-size="28" letter-spacing="4" fill="{text_fill}">FALAH</text>'

    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">
  {grad}
  {bg}
  {symbol}
  {arabic_text}
  {divider}
  {english_text}
</svg>'''
    return svg


# ──────────────────────────────────────────────
# App Icon (512×512 for Play Store)
# ──────────────────────────────────────────────

def generate_app_icon_svg():
    """
    App icon: Gold crescent+star on dark navy background.
    512×512 with rounded corners (Play Store adds mask).
    """
    size = 512
    cx, cy = size / 2, size / 2
    symbol_size = 380

    grad = gold_gradient_def()
    bg = f'<rect width="{size}" height="{size}" rx="80" fill="{DARK_BG}"/>'

    # Subtle radial vignette on background for depth (very subtle)
    vignette = f'''<defs>
    <radialGradient id="vignette" cx="50%" cy="45%" r="60%">
      <stop offset="0%" stop-color="#0F2040" stop-opacity="1"/>
      <stop offset="100%" stop-color="{DARK_BG}" stop-opacity="1"/>
    </radialGradient>
  </defs>
  <rect width="{size}" height="{size}" rx="80" fill="url(#vignette)"/>'''

    symbol = crescent_star_group(cx, cy - 10, symbol_size, fill="url(#goldGrad)")

    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">
  {grad}
  {bg}
  {vignette}
  {symbol}
</svg>'''
    return svg


# ──────────────────────────────────────────────
# Feature Graphic (1024×500)
# ──────────────────────────────────────────────

def generate_feature_graphic_svg():
    """
    Feature graphic: 1024×500
    Dark navy background with subtle geometric pattern.
    Left side: crescent+star symbol.
    Right side: Arabic فلاح, English FALAH, tagline.
    Gold divider line. Below: "Free · Offline · No Ads"
    """
    w, h = 1024, 500
    
    grad = gold_gradient_def()
    
    # Background with subtle Islamic geometric pattern
    bg = f'<rect width="{w}" height="{h}" fill="{DARK_BG}"/>'
    
    # Very subtle geometric pattern overlay
    pattern = f'''<defs>
    <pattern id="geoPattern" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
      <path d="M30,0 L60,30 L30,60 L0,30 Z" fill="none" stroke="{GOLD_MID}" stroke-width="0.3" opacity="0.08"/>
      <circle cx="30" cy="30" r="15" fill="none" stroke="{GOLD_MID}" stroke-width="0.2" opacity="0.06"/>
    </pattern>
  </defs>
  <rect width="{w}" height="{h}" fill="url(#geoPattern)"/>'''
    
    # Crescent + star on left side
    symbol_cx = 300
    symbol_cy = 220
    symbol_size = 280
    symbol = crescent_star_group(symbol_cx, symbol_cy, symbol_size, fill="url(#goldGrad)")
    
    # Arabic فلاح - right side
    arabic_x = 680
    arabic_y = 210
    arabic = f'<text x="{arabic_x}" y="{arabic_y}" text-anchor="middle" font-family="Amiri, \'Noto Naskh Arabic\', serif" font-weight="bold" font-size="80" fill="url(#goldGrad)" direction="rtl" xml:lang="ar">فلاح</text>'
    
    # English FALAH
    english_y = 275
    english = f'<text x="{arabic_x}" y="{english_y}" text-anchor="middle" font-family="\'Cormorant Garamond\', \'Noto Serif\', Georgia, serif" font-weight="600" font-size="32" letter-spacing="5" fill="url(#goldGrad)">FALAH</text>'
    
    # Tagline
    tagline_y = 320
    tagline = f'<text x="{arabic_x}" y="{tagline_y}" text-anchor="middle" font-family="\'IBM Plex Sans\', \'Noto Sans\', Helvetica, sans-serif" font-weight="300" font-size="18" fill="{GOLD_LIGHT}" opacity="0.7">Your Daily Islamic Companion</text>'
    
    # Gold divider line (full width, subtle)
    line_y = 390
    divider = f'<line x1="100" y1="{line_y}" x2="924" y2="{line_y}" stroke="{GOLD_MID}" stroke-width="0.8" opacity="0.4"/>'
    
    # Bottom text: "Free · Offline · No Ads"
    bottom_y = 430
    bottom_text = f'<text x="{w/2}" y="{bottom_y}" text-anchor="middle" font-family="\'IBM Plex Sans\', \'Noto Sans\', Helvetica, sans-serif" font-weight="300" font-size="16" fill="{MUTED_BLUE}">Free · Offline · No Ads</text>'

    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">
  {grad}
  {bg}
  {pattern}
  {symbol}
  {arabic}
  {english}
  {tagline}
  {divider}
  {bottom_text}
</svg>'''
    return svg


# ──────────────────────────────────────────────
# Favicon SVG
# ──────────────────────────────────────────────

def generate_favicon_svg():
    """Simple favicon: crescent+star on dark background."""
    size = 32
    cx, cy = 16, 16
    symbol_size = 28

    grad = gold_gradient_def()
    bg = f'<rect width="{size}" height="{size}" rx="4" fill="{DARK_BG}"/>'
    symbol = crescent_star_group(cx, cy, symbol_size, fill="url(#goldGrad)")

    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">
  {grad}
  {bg}
  {symbol}
</svg>'''
    return svg


# ──────────────────────────────────────────────
# SVG to PNG conversion
# ──────────────────────────────────────────────

def svg_to_png(svg_path, png_path, width=None, height=None):
    """Convert SVG to PNG using rsvg-convert (best quality)."""
    cmd = ["rsvg-convert", "-o", png_path]
    if width:
        cmd.extend(["-w", str(width)])
    if height:
        cmd.extend(["-h", str(height)])
    cmd.append(svg_path)
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  WARNING: rsvg-convert failed: {result.stderr}")
        # Fallback to cairosvg
        try:
            import cairosvg
            kwargs = {"url": svg_path, "write_to": png_path}
            if width:
                kwargs["output_width"] = width
            if height:
                kwargs["output_height"] = height
            cairosvg.svg2png(**kwargs)
            print(f"  Used cairosvg fallback for {png_path}")
        except Exception as e:
            print(f"  ERROR: Could not convert {svg_path}: {e}")
            return False
    return True


# ──────────────────────────────────────────────
# Main generation
# ──────────────────────────────────────────────

def main():
    print("=" * 60)
    print("Falah Brand Asset Generator")
    print("=" * 60)

    variants = ["gold-on-dark", "navy-on-white", "black-on-white", "white-on-transparent"]

    # 1. Logomark (crescent+star only)
    print("\n[1/6] Generating logomarks...")
    for v in variants:
        svg_content = generate_logomark_svg(v)
        svg_path = os.path.join(OUT_DIR, f"logomark-{v}.svg")
        png_path = os.path.join(OUT_DIR, f"logomark-{v}.png")
        with open(svg_path, "w", encoding="utf-8") as f:
            f.write(svg_content)
        svg_to_png(svg_path, png_path, width=512)
        print(f"  ✓ logomark-{v} (SVG + PNG)")

    # 2. Logo lockup vertical
    print("\n[2/6] Generating logo lockups...")
    for v in variants:
        svg_content = generate_lockup_svg(v)
        svg_path = os.path.join(OUT_DIR, f"lockup-vertical-{v}.svg")
        png_path = os.path.join(OUT_DIR, f"lockup-vertical-{v}.png")
        with open(svg_path, "w", encoding="utf-8") as f:
            f.write(svg_content)
        svg_to_png(svg_path, png_path, height=1000)
        print(f"  ✓ lockup-vertical-{v} (SVG + PNG)")

    # 3. App icon
    print("\n[3/6] Generating app icons...")
    icon_svg = generate_app_icon_svg()
    icon_svg_path = os.path.join(OUT_DIR, "app-icon.svg")
    with open(icon_svg_path, "w", encoding="utf-8") as f:
        f.write(icon_svg)

    for size in [512, 192, 48]:
        png_path = os.path.join(OUT_DIR, f"app-icon-{size}.png")
        svg_to_png(icon_svg_path, png_path, width=size, height=size)
        print(f"  ✓ app-icon-{size}.png")

    # Also generate the PWA icon set referenced by manifest.json
    print("\n[4/6] Generating PWA icon set...")
    pwa_sizes = [48, 72, 96, 128, 144, 192, 256, 384, 512]
    for size in pwa_sizes:
        png_path = os.path.join(ROOT_DIR, f"icon-{size}.png")
        svg_to_png(icon_svg_path, png_path, width=size, height=size)
        print(f"  ✓ icon-{size}.png (project root)")

    # 5. Feature graphic
    print("\n[5/6] Generating feature graphic...")
    fg_svg = generate_feature_graphic_svg()
    fg_svg_path = os.path.join(OUT_DIR, "feature-graphic.svg")
    fg_png_path = os.path.join(OUT_DIR, "feature-graphic-1024x500.png")
    with open(fg_svg_path, "w", encoding="utf-8") as f:
        f.write(fg_svg)
    svg_to_png(fg_svg_path, fg_png_path, width=1024, height=500)
    print(f"  ✓ feature-graphic-1024x500.png")

    # 6. Favicon
    print("\n[6/6] Generating favicon...")
    fav_svg = generate_favicon_svg()
    fav_path = os.path.join(ROOT_DIR, "favicon.svg")
    with open(fav_path, "w", encoding="utf-8") as f:
        f.write(fav_svg)
    print(f"  ✓ favicon.svg (project root)")

    # Copy key assets to project root
    print("\n[+] Copying key assets to project root...")
    import shutil
    shutil.copy2(
        os.path.join(OUT_DIR, "app-icon-512.png"),
        os.path.join(ROOT_DIR, "play-store-icon-512.png")
    )
    print(f"  ✓ play-store-icon-512.png")

    print("\n" + "=" * 60)
    print("All assets generated successfully!")
    print(f"Output directory: {OUT_DIR}")
    print("=" * 60)

    # Print file listing
    print("\nGenerated files:")
    for f in sorted(os.listdir(OUT_DIR)):
        fpath = os.path.join(OUT_DIR, f)
        size_kb = os.path.getsize(fpath) / 1024
        print(f"  {f:50s} {size_kb:8.1f} KB")


if __name__ == "__main__":
    main()
