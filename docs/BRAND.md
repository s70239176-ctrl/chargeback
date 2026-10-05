# Chargeback brand

## The mark: "the window"

An open ring with a bead standing in its gap.

- **The ring** is the validator panel's circle of review.
- **The gap** is the challenge window, the only time anyone can act.
- **The bead** is the money, held at the opening until a ruling or the clock moves it.

It reads as a **C** at a glance, and as a node on the Recovery Radar. It deliberately has no
arrow (that would say "reload", not "veto") and no overlapping circles (a payments-network
cliche). Built from geometry, so it is exact at every size: ring radius 17, stroke 6.6, gap 66
degrees centred on the right, bead radius 5.9 sitting on the ring path, on a 64 unit grid.

## Files

| File | Use |
|---|---|
| `frontend/app/icon.svg` | Favicon. Next serves it automatically. Full-bleed tile, 14 unit corner |
| `frontend/app/favicon.ico` | 16, 32 and 48 px for legacy agents |
| `frontend/app/apple-icon.png` | 180 px touch icon, square (the OS rounds it) |
| `frontend/public/brand/mark.svg` | Symbol alone, for use on a dark surface |
| `frontend/public/brand/mark-tile.svg` | Symbol in its tile with a hairline border |
| `frontend/public/brand/logo-dark.svg` | Horizontal lockup for dark backgrounds |
| `frontend/public/brand/logo-light.svg` | Horizontal lockup for light backgrounds (inverted tile) |
| `frontend/public/brand/icon-512.png` | Avatar / social / app store |
| `frontend/components/ui/Logo.tsx` | The mark as a React component, themed by the design tokens |

The wordmark in the lockups is **outlined to paths** from Geist SemiBold, tracked +0.16 em, so it
renders identically with no font installed. Regenerate everything with `python scripts/brand.py`.

## Colour

| | | |
|---|---|---|
| Ring | `#F5F7FA` | on dark; on the light lockup the tile is `#07090D` and the ring stays `#F5F7FA` |
| Bead | `#65E6A5` | the only colour in the mark; green means money recovered |
| Tile | `#0C1016` (in app), `#07090D` (favicon) | |

## Rules

- **Clear space:** at least the bead's diameter (about 12 units, or 18% of the tile) on every side.
- **Minimum size:** 16 px for the tile. Below that, use the favicon as is; do not add detail.
- **Do not** recolour the bead, rotate the mark, close the gap, add an arrow, add a drop shadow or
  glow, put the symbol on a busy photograph, or set the wordmark in another typeface.
- **Wordmark** is always uppercase. Never lowercase it or tighten the tracking.
