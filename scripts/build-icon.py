#!/usr/bin/env python3
"""Regenerate media/icon.png (128x128, packaged) and assets/icon-256.png (repo only) from assets/icon-source.jpg.

The source is a JPG of a violet rounded square on a white background. We crop to
the square's bounding box and apply an anti-aliased rounded-corner alpha mask so
everything outside the square is transparent.

Usage: python3 scripts/build-icon.py   (requires Pillow + numpy)
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "icon-source.jpg"
# Corner radius as a fraction of the square's side (measured from the source: ~190px / 930px).
RADIUS_FRAC = 0.204
# Pull the mask in slightly so no white JPG fringe survives at the edge.
INSET_FRAC = 0.004
SS = 4  # supersampling factor for the mask


def main() -> None:
    img = Image.open(SRC).convert("RGB")
    a = np.asarray(img).astype(int)
    non_white = a.min(axis=2) < 200
    ys, xs = np.where(non_white)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    side = max(x1 - x0, y1 - y0) + 1
    sq = img.crop((x0, y0, x0 + side, y0 + side))

    for size, dest in ((128, ROOT / "media" / "icon.png"), (256, ROOT / "assets" / "icon-256.png")):
        big = size * SS
        mask = Image.new("L", (big, big), 0)
        inset = INSET_FRAC * big
        ImageDraw.Draw(mask).rounded_rectangle(
            (inset, inset, big - 1 - inset, big - 1 - inset),
            radius=RADIUS_FRAC * big,
            fill=255,
        )
        mask = mask.resize((size, size), Image.LANCZOS)
        out = sq.resize((size, size), Image.LANCZOS).convert("RGBA")
        out.putalpha(mask)
        out.save(dest, optimize=True)
        print("wrote", dest, out.size)


if __name__ == "__main__":
    main()
