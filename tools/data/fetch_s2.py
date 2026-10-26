"""Sentinel-2 cloudless 2016 imagery (EOX, CC BY 4.0) for a box, stitched from the WMTS tiles and cut to the
box, for the v2 engine's ground.

    python tools/data/fetch_s2.py istanbul-levent 28.985 41.065 29.06 41.115 15
    python tools/data/fetch_s2.py istanbul-wide 28.6 40.85 29.45 41.3 12

Writes assets/data/v2/<id>-s2.jpg and <id>-s2.json ({box}). Credit on screen and in LICENSES.md:
"Sentinel-2 cloudless 2016 - s2maps.eu, EOX IT Services GmbH (Copernicus Sentinel verisi 2016'dan)".
Only the 2016 layer is CC BY 4.0; the later years are CC BY-NC-SA and are never used.
"""
import io
import json
import math
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
URL = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg"
UA = "GreaterTurkiyeMotion/1.0 (+https://github.com/Greater-Turkiye/motion)"


def tile_xy(lon: float, lat: float, z: int) -> tuple[float, float]:
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def main() -> int:
    cid, w, s, e, n, z = sys.argv[1], *map(float, sys.argv[2:6]), int(sys.argv[6])
    x0, y0 = tile_xy(w, n, z)
    x1, y1 = tile_xy(e, s, z)
    tx0, ty0, tx1, ty1 = int(x0), int(y0), int(x1), int(y1)
    img = Image.new("RGB", ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256))
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            req = urllib.request.Request(URL.format(z=z, x=tx, y=ty), headers={"User-Agent": UA})
            tile = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=60).read())).convert("RGB")
            img.paste(tile, ((tx - tx0) * 256, (ty - ty0) * 256))
            time.sleep(0.05)
    crop = img.crop((round((x0 - tx0) * 256), round((y0 - ty0) * 256), round((x1 - tx0) * 256), round((y1 - ty0) * 256)))
    out = ROOT / "assets/data/v2" / f"{cid}-s2.jpg"
    out.parent.mkdir(parents=True, exist_ok=True)
    crop.save(out, quality=88)
    (out.with_suffix(".json")).write_text(json.dumps({"box": [w, s, e, n], "zoom": z, "size": crop.size,
        "source": "Sentinel-2 cloudless 2016, s2maps.eu by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016), CC BY 4.0"}) + "\n", encoding="utf-8")
    print(f"{out.relative_to(ROOT)}: {crop.size[0]}x{crop.size[1]} px, {out.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
