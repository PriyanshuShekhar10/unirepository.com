#!/usr/bin/env python3
"""Bake an OpenStreetMap static map for the GCU hub (tile stitch, cached locally)."""

from __future__ import annotations

import math
from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen

import argparse

from PIL import Image, ImageDraw

LAT = 33.5125
LON = -112.13
ZOOM = 14
OUT_W = 760
OUT_H = 320
TILE = 256
USER_AGENT = "UniRepository/0.1 (encyclopedia; contact@unirepository.com)"
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/media/grand-canyon-university/map.png"


def deg2num(lat: float, lon: float, zoom: int) -> tuple[float, float]:
    lat_rad = math.radians(lat)
    n = 2.0**zoom
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n
    return x, y


def fetch_tile(z: int, x: int, y: int) -> Image.Image:
    n = 2**z
    x = x % n
    url = f"https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=30) as res:
        return Image.open(BytesIO(res.read())).convert("RGB")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lat", type=float, default=LAT)
    parser.add_argument("--lon", type=float, default=LON)
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()
    lat, lon = args.lat, args.lon
    out_path: Path = args.out
    cx, cy = deg2num(lat, lon, ZOOM)
    px = cx * TILE
    py = cy * TILE
    left = int(px - OUT_W / 2)
    top = int(py - OUT_H / 2)
    x0 = left // TILE
    y0 = top // TILE
    x1 = (left + OUT_W) // TILE
    y1 = (top + OUT_H) // TILE

    mosaic = Image.new("RGB", ((x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE), "#e7e7e8")
    for ty in range(y0, y1 + 1):
        for tx in range(x0, x1 + 1):
            tile = fetch_tile(ZOOM, tx, ty)
            mosaic.paste(tile, ((tx - x0) * TILE, (ty - y0) * TILE))

    crop = mosaic.crop(
        (
            left - x0 * TILE,
            top - y0 * TILE,
            left - x0 * TILE + OUT_W,
            top - y0 * TILE + OUT_H,
        )
    )

    draw = ImageDraw.Draw(crop)
    mx, my = OUT_W // 2, OUT_H // 2
    r = 8
    draw.ellipse((mx - r, my - r, mx + r, my + r), fill="#c0392b", outline="#24262a")
    draw.ellipse((mx - 3, my - 3, mx + 3, my + 3), fill="#e7e7e8")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    crop.save(out_path, "PNG", optimize=True)
    try:
        rel = out_path.relative_to(ROOT)
    except ValueError:
        rel = out_path
    print(f"Wrote {rel} ({out_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
