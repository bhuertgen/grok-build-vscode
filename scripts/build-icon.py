#!/usr/bin/env python3
"""Regenerate raster icons from media/logo.svg.

media/logo.svg is the source of truth: a violet rounded square, a white ">_"
prompt, and a custom stylized G set in from the top-right corner. Running
this script rewrites:

- media/icon.png          128x128 RGBA (packaged store icon)
- assets/icon-256.png     256x256 RGBA (repo only)
- assets/icon-source.jpg  1024x1024 RGB on white (derived preview, not an input)

media/activitybar.svg is the monochrome activity-bar mark. It uses the same G
paths with currentColor and is maintained by hand.

Requires: Pillow and CairoSVG (libcairo).
Usage: python3 scripts/build-icon.py
"""
import io
from pathlib import Path

import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SVG = ROOT / "media" / "logo.svg"
SOURCE_SIZE = 1024


def render(size: int) -> Image.Image:
    png = cairosvg.svg2png(url=str(SVG), output_width=size, output_height=size)
    return Image.open(io.BytesIO(png)).convert("RGBA")


def main() -> None:
    for size, dest in (
        (128, ROOT / "media" / "icon.png"),
        (256, ROOT / "assets" / "icon-256.png"),
    ):
        image = render(size)
        image.save(dest, optimize=True)
        print("wrote", dest, image.size, image.mode)

    master = render(SOURCE_SIZE)
    flat = Image.new("RGB", master.size, (255, 255, 255))
    flat.paste(master, mask=master.getchannel("A"))
    dest = ROOT / "assets" / "icon-source.jpg"
    flat.save(dest, quality=95, subsampling=0, optimize=True)
    print("wrote", dest, flat.size, flat.mode)


if __name__ == "__main__":
    main()
