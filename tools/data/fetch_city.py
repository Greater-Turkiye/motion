"""A city block for the v2 engine's 3D descent: OpenStreetMap buildings (with their heights), main roads
and water in a bounding box, from the Overpass API, in local metres around the box's middle.

    python tools/data/fetch_city.py istanbul-levent 28.985 41.065 29.06 41.115

Writes assets/data/v2/<id>.json: {about, centre: [lon, lat], buildings: [[h, [x, y, x, y, ...]], ...],
roads: [[w, [x, y, ...]], ...], water: [[x, y, ...], ...]}. Heights: `height` in metres when tagged,
else `building:levels` x 3.2 m, else 9 m (three floors). OpenStreetMap data, ODbL: every video that draws
it says "© OpenStreetMap katkıda bulunanlar".
"""
import json
import math
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OVERPASS = "https://overpass-api.de/api/interpreter"
UA = "GreaterTurkiyeMotion/1.0 (+https://github.com/Greater-Turkiye/motion)"
ROAD_WIDTH = {"motorway": 22, "trunk": 18, "primary": 14, "secondary": 11, "tertiary": 8}


def metres(v: str | None) -> float | None:
    if not v:
        return None
    try:
        return float(v.replace(",", ".").replace("m", "").strip())
    except ValueError:
        return None


def main() -> int:
    cid, w, s, e, n = sys.argv[1], *map(float, sys.argv[2:6])
    q = f"""[out:json][timeout:120];
(
  way["building"]({s},{w},{n},{e});
  way["building:part"]({s},{w},{n},{e});
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"]({s},{w},{n},{e});
  way["natural"="water"]({s},{w},{n},{e});
  relation["natural"="water"]({s},{w},{n},{e});
  way["natural"="coastline"]({s - 0.05},{w - 0.05},{n + 0.05},{e + 0.05});
);
out geom;"""
    req = urllib.request.Request(OVERPASS, data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": UA})
    data = json.loads(urllib.request.urlopen(req, timeout=180).read())
    lon0, lat0 = (w + e) / 2, (s + n) / 2
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110540

    def area(c):
        n = len(c) // 2
        return abs(sum(c[2 * i] * c[(2 * i + 3) % (2 * n)] - c[(2 * i + 2) % (2 * n)] * c[2 * i + 1] for i in range(n))) / 2

    def xy(g):
        out = []
        for p in g:
            out += [round((p["lon"] - lon0) * kx, 1), round((p["lat"] - lat0) * ky, 1)]
        return out

    buildings, roads, water, coast, doubtful = [], [], [], [], []
    for el in data["elements"]:
        t = el.get("tags", {})
        g = el.get("geometry")
        if el["type"] == "way" and g:
            if ("building" in t or "building:part" in t) and len(g) >= 4:
                h = metres(t.get("height"))
                if h is None and metres(t.get("building:levels")) is not None:
                    h = metres(t["building:levels"]) * 3.2
                # a tower's height on the outline of its whole complex (ÖzdilekPark: 275 m over 19,800 m²)
                # stood as a wall across the frame; the towers themselves come as building:part ways
                if h and h > 100 and area(xy(g)) > 10000:
                    doubtful.append(f"{t.get('name', el['id'])} {h:.0f} m over {area(xy(g)):.0f} m2")
                    h = None
                row = [round(h or 9.0, 1), xy(g[:-1] if g[0] == g[-1] else g)]
                # the name of a tall building, for its label (Istanbul Sapphire, Metrocity, ...)
                if (h or 0) >= 100 and t.get("name"):
                    row.append(t["name"])
                buildings.append(row)
            elif "highway" in t:
                roads.append([ROAD_WIDTH[t["highway"]], xy(g)])
            elif t.get("natural") == "water":
                water.append(xy(g))
            elif t.get("natural") == "coastline":
                coast.append(xy(g))
    doc = {"about": f"OpenStreetMap ({len(buildings)} buildings) via the Overpass API, ODbL; "
                    f"box {w},{s},{e},{n}; local metres around the middle",
           "centre": [lon0, lat0], "box": [w, s, e, n], "buildings": buildings, "roads": roads, "water": water, "coast": coast}
    out = ROOT / "assets/data/v2" / f"{cid}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    tagged = sum(1 for b in buildings if b[0] != 9.0)
    for d in doubtful:
        print("height dropped, the outline of a complex:", d)
    print(f"{out.relative_to(ROOT)}: {len(buildings)} buildings ({tagged} with a height), {len(roads)} roads, "
          f"{len(water)} water, {len(coast)} coastline ways, {out.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
