#!/usr/bin/env python3
"""Build the relief texture the globe shader lights: a tangent-space normal map of the Earth.

    python tools/data/build_relief.py            # downloads ETOPO1 once into the cache, writes assets/data/relief.png

Source: NOAA ETOPO1 (public domain), 1 arc-minute global relief of land and ocean floor, read at a
4 arc-minute stride from NOAA's ERDDAP (upwell.pfeg.noaa.gov/erddap/griddap/etopo180). The grid
is cached outside the repository ($LOCALAPPDATA/gt-cache or ~/.cache/gt-cache).

Output: a 4096x2048 RGB PNG, equirectangular, row 0 at the south pole to match the country-id
texture. R and G hold the east and north components of the surface normal (0.5 = flat), B holds
land elevation (0 at sea level, 255 at 5 km and above). Normals are computed on land only, with
a vertical exaggeration chosen for a globe seen from orbit; the sea is flat so the shader keeps
it clean. The shader lights R/G with a light it can move per scene.

Same inputs, same bytes: the PNG is written with fixed settings, so a rebuild is identical.
"""
from __future__ import annotations

import os
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.io import netcdf_file

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "data" / "relief.png"
CACHE = Path(os.environ.get("LOCALAPPDATA") or Path.home() / ".cache") / "gt-cache"
URL = ("https://upwell.pfeg.noaa.gov/erddap/griddap/etopo180.nc"
       "?altitude%5B(-90):4:(90)%5D%5B(-180):4:(180)%5D")
W, H = 4096, 2048
EXAGGERATION = 38.0      # a globe seen from orbit needs a lot, or the Alps are flat
EARTH_KM = 6371.0


def grid() -> np.ndarray:
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / "etopo1-s4.nc"
    if not f.exists():
        req = urllib.request.Request(URL, headers={"User-Agent": "GreaterTurkiye-motion/0.1"})
        with urllib.request.urlopen(req, timeout=900) as r:
            f.write_bytes(r.read())
    with netcdf_file(f, "r", mmap=False) as nc:
        z = np.array(nc.variables["altitude"][:], dtype=np.float32)  # rows from -90 upwards
        lat = np.array(nc.variables["latitude"][:])
    if lat[0] > lat[-1]:
        z = z[::-1]
    return z


def main() -> int:
    z = grid()
    # resample to the texture size (bilinear through PIL on a float image)
    img = Image.fromarray(z, mode="F").resize((W, H), Image.BILINEAR)
    e = np.asarray(img, dtype=np.float32)
    land = np.clip(e, 0, None)
    # metres per texel: east shrinks with latitude, north does not
    lat = (np.arange(H) + 0.5) / H * 180.0 - 90.0
    dx = (2 * np.pi * EARTH_KM * 1000 / W) * np.cos(np.radians(lat))[:, None]
    dy = np.pi * EARTH_KM * 1000 / H
    gx = (np.roll(land, -1, axis=1) - np.roll(land, 1, axis=1)) / (2 * np.maximum(dx, 50.0))
    gy = np.zeros_like(land)
    gy[1:-1] = (land[2:] - land[:-2]) / (2 * dy)
    nx, ny, nz = -gx * EXAGGERATION, -gy * EXAGGERATION, np.ones_like(land)
    n = np.sqrt(nx * nx + ny * ny + nz * nz)
    nx, ny = nx / n, ny / n
    r = np.round((nx * 0.5 + 0.5) * 255).astype(np.uint8)
    g = np.round((ny * 0.5 + 0.5) * 255).astype(np.uint8)
    b = np.round(np.clip(land / 5000.0, 0, 1) * 255).astype(np.uint8)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.dstack([r, g, b]), mode="RGB").save(OUT, optimize=False, compress_level=9)
    print(f"{OUT.relative_to(ROOT)}: {W}x{H}, {OUT.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
