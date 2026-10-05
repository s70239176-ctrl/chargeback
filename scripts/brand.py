"""
Builds the Chargeback brand assets from geometry. Nothing here is drawn by hand in an editor, so
the mark can be regenerated exactly:

    python scripts/brand.py

THE MARK  ("the window")
  An open ring with a bead standing in its gap. The ring is the validator panel's circle of
  review; the gap is the challenge window, the only time anyone can act; the green bead is the
  money, held at the opening until a ruling or the clock moves it. It also reads as a "C", and as
  a node on the Recovery Radar. It deliberately avoids arrows (a refresh icon would say "reload",
  not "veto") and overlapping circles (that is a payments-network cliche).

Outputs (frontend/public/brand and frontend/app):
  mark.svg, mark-tile.svg      the symbol, bare and in its tile
  logo-dark.svg, logo-light.svg  horizontal lockups with the wordmark outlined to paths
  app/icon.svg                 favicon (tile, full bleed)
  app/apple-icon.png           180px touch icon
  public/brand/icon-512.png    app / social avatar
  app/favicon.ico              16, 32, 48 for legacy agents
"""
import math
import os
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FRONT = os.path.join(ROOT, "frontend")
OUT = os.path.join(FRONT, "public", "brand")
FONT = os.path.join(FRONT, "node_modules", "geist", "dist", "fonts", "geist-sans", "Geist-SemiBold.ttf")

# Brand colours (the same tokens as frontend/styles/tokens.css)
INK = "#07090D"
TILE = "#0C1016"
TEXT = "#F5F7FA"
POSITIVE = "#65E6A5"
POSITIVE_ON_LIGHT = "#12A15F"  # the green darkened to hold contrast on white


def f(n):
    return f"{n:.2f}".rstrip("0").rstrip(".")


def mark_inner(ring=TEXT, bead=POSITIVE, cx=32.0, cy=32.0, r=17.0, stroke=6.6, half_gap=33.0, bead_r=5.9):
    """The symbol: a C-shaped ring open on the right, and a bead sitting on the ring path in the gap."""
    a0 = math.radians(half_gap)  # lower terminal (y down, so +angle is below the axis)
    a1 = math.radians(360 - half_gap)  # upper terminal
    x0, y0 = cx + r * math.cos(a0), cy + r * math.sin(a0)
    x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
    # sweep the long way round, clockwise from the lower terminal to the upper one
    arc = f"M{f(x0)} {f(y0)}A{f(r)} {f(r)} 0 1 1 {f(x1)} {f(y1)}"
    return (
        f'<path d="{arc}" fill="none" stroke="{ring}" stroke-width="{f(stroke)}" stroke-linecap="butt"/>'
        f'<circle cx="{f(cx + r)}" cy="{f(cy)}" r="{f(bead_r)}" fill="{bead}"/>'
    )


def svg(viewbox, body, title):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" role="img" aria-label="{title}">'
        f"<title>{title}</title>{body}</svg>\n"
    )


def tile(inner, fill=TILE, rx=15, border=None):
    stroke = f' stroke="{border}" stroke-width="1"' if border else ""
    return f'<rect width="64" height="64" rx="{rx}" fill="{fill}"{stroke}/>{inner}'


def wordmark(text="CHARGEBACK", size=1000, tracking=0.16):
    """Outline the word to SVG path data. Returns (path_d, width, cap_height) in font units scaled to size."""
    font = TTFont(FONT)
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    cap = font["OS/2"].sCapHeight
    scale = size / upm
    x = 0.0
    parts = []
    for ch in text:
        name = cmap[ord(ch)]
        pen = SVGPathPen(gs, ntos=lambda v: f(v))
        # flip y (font units are y-up) and scale
        tp = TransformPen(pen, (scale, 0, 0, -scale, x, 0))
        gs[name].draw(tp)
        parts.append(pen.getCommands())
        x += gs[name].width * scale + tracking * size
    width = x - tracking * size
    return "".join(parts), width, cap * scale


def lockup(text_fill, tile_fill, ring, dot, border, label):
    d, w, cap = wordmark(size=1000)
    mark_h = 64
    target_cap = 17.0  # cap height beside a 64-unit mark
    s = target_cap / cap
    text_w = w * s
    gap = 22
    height = mark_h
    ty = (height + target_cap) / 2  # baseline so caps are optically centred on the mark
    body = (
        tile(mark_inner(ring, dot), tile_fill, border=border)
        + f'<g transform="translate({64 + gap} {f(ty)}) scale({f(s)})"><path d="{d}" fill="{text_fill}"/></g>'
    )
    return svg(f"0 0 {f(64 + gap + text_w)} {height}", body, label)


def main():
    os.makedirs(OUT, exist_ok=True)
    app = os.path.join(FRONT, "app")

    files = {
        os.path.join(OUT, "mark.svg"): svg("0 0 64 64", mark_inner(), "Chargeback mark"),
        os.path.join(OUT, "mark-tile.svg"): svg("0 0 64 64", tile(mark_inner(), border="rgba(255,255,255,0.13)"), "Chargeback"),
        os.path.join(OUT, "logo-dark.svg"): lockup(TEXT, TILE, TEXT, POSITIVE, "rgba(255,255,255,0.13)", "Chargeback"),
        os.path.join(OUT, "logo-light.svg"): lockup(INK, INK, TEXT, POSITIVE, None, "Chargeback"),
        os.path.join(app, "icon.svg"): svg("0 0 64 64", tile(mark_inner(), fill=INK, rx=14), "Chargeback"),
    }
    for path, content in files.items():
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(content)
        print("wrote", os.path.relpath(path, ROOT))

    # Rasters through sharp (already a Next dependency), so no extra tooling is needed.
    node = r"""
const sharp = require('sharp'); const fs = require('fs');
const [, , svgPath, outPath, size] = process.argv;
sharp(fs.readFileSync(svgPath), { density: 600 }).resize(+size, +size).png().toFile(outPath).then(() => console.log('wrote', outPath));
"""
    helper = os.path.join(FRONT, "_raster.cjs")
    with open(helper, "w") as fh:
        fh.write(node)
    try:
        import subprocess

        icon_svg = os.path.join(app, "icon.svg")
        # Touch icon: full-bleed square (iOS rounds it itself), so use a square tile.
        square = os.path.join(OUT, "_square.svg")
        with open(square, "w", encoding="utf-8") as fh:
            fh.write(svg("0 0 64 64", tile(mark_inner(), fill=INK, rx=0), "Chargeback"))
        jobs = [
            (square, os.path.join(app, "apple-icon.png"), 180),
            (icon_svg, os.path.join(OUT, "icon-512.png"), 512),
        ]
        sizes = [16, 32, 48]
        for s_ in sizes:
            jobs.append((icon_svg, os.path.join(OUT, f"_ico{s_}.png"), s_))
        for src, dst, size in jobs:
            subprocess.run(["node", helper, src, dst, str(size)], cwd=FRONT, check=True)
        os.remove(square)
    finally:
        os.remove(helper)

    from PIL import Image

    imgs = [Image.open(os.path.join(OUT, f"_ico{s_}.png")).convert("RGBA") for s_ in (16, 32, 48)]
    imgs[-1].save(os.path.join(app, "favicon.ico"), format="ICO", sizes=[(16, 16), (32, 32), (48, 48)], append_images=imgs[:-1])
    print("wrote", os.path.relpath(os.path.join(app, "favicon.ico"), ROOT))
    for s_ in (16, 32, 48):
        os.remove(os.path.join(OUT, f"_ico{s_}.png"))


if __name__ == "__main__":
    sys.exit(main())
