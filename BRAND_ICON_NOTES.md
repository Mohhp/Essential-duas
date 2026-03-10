# Brand Asset Notes — Falah

## Master Symbol

The **master crescent + 8-pointed star** is defined in `scripts/generate-brand-assets.py` and rendered identically across all assets. All variants are generated from the same SVG source geometry.

### Design Spec

- **Crescent**: Thin arc (~20% thickness ratio), horn tips taper to fine sharp points (like 2-day-old moon)
- **Star**: 8-pointed (Rub el Hizb construction), solid fill, no internal lines
- **Gold treatment**: Flat matte gradient — `#8B6914` (dark burnished) → `#D4AF37` (rich gold) → `#E8D088` (warm champagne). No 3D, no shadow, no grain.
- **Background**: Deep navy `#0A1628`
- **Arabic**: فلاح in Amiri Bold
- **English**: FALAH in Cormorant Garamond SemiBold (letter-spacing: +4px)

## Color Variants

| Variant | Symbol/Text | Background |
|---------|-------------|------------|
| Gold on dark | Gold gradient | `#0A1628` navy |
| Navy on white | `#0A1628` solid | `#FFFFFF` |
| Black on white | `#000000` solid | `#FFFFFF` |
| White on transparent | `#FFFFFF` solid | Transparent |

## Output Files (in `brand-assets/`)

### Logomark (crescent+star only)
- `logomark-{variant}.svg` + `.png` (4 variants)

### Logo Lockup Vertical (symbol + Arabic + divider + English)
- `lockup-vertical-{variant}.svg` + `.png` (4 variants)

### App Icons
- `app-icon-512.png` — Play Store upload
- `app-icon-192.png` — Android adaptive icon
- `app-icon-48.png` — Home screen verification
- `app-icon.svg` — Source SVG

### Feature Graphic
- `feature-graphic-1024x500.png` — Play Store
- `feature-graphic.svg` — Source SVG

### PWA Icons (project root)
- `icon-{48,72,96,128,144,192,256,384,512}.png`
- `favicon.svg`
- `play-store-icon-512.png`

## Regenerating Assets

```bash
python3 scripts/generate-brand-assets.py
```

This regenerates everything from the master geometry. Edit the Python script to adjust proportions, colors, or layout.
