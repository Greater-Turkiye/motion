"""First P- and S-wave arrival times from an earthquake to Türkiye's 81 province centres.

    python tools/scene/arrivals.py --lon 36.65 --lat 39.44 --depth 5 [--model iasp91] > arrivals.json

Uses TauP (ObsPy's obspy.taup) with a 1-D Earth model, IASP91 by default (Kennett & Engdahl 1991),
and the source depth and the epicentral distance of each centre. The first arrival of each wave type
is taken over its crustal and mantle phases (Pg/Pn/P and Sg/Sn/S), as TauP finds them. These are
model estimates for a spherically symmetric Earth, not observations: Anatolia's real crust shifts them
by seconds, and the screen says "tahmini varış, IASP91 modeli". An arrival is not a felt shaking; this
script says nothing about intensity.

Prints JSON: {"model", "depth_km", "epicentre", "provinces": [{"name", "at", "km", "p_s", "s_s"}, ...]}
sorted by S arrival.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from obspy.taup import TauPyModel

ROOT = Path(__file__).resolve().parents[2]
P_PHASES = ["p", "P", "Pg", "Pn"]  # IASP91 has no Conrad discontinuity, so no Pb/Sb
S_PHASES = ["s", "S", "Sg", "Sn"]


def distance_km(a, b):
    l1, p1, l2, p2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin((l2 - l1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def first(model, depth, deg, phases):
    arr = model.get_travel_times(source_depth_in_km=depth, distance_in_degree=deg, phase_list=phases)
    return round(min(a.time for a in arr), 1) if arr else None


def arrivals(lon, lat, depth, model_name="iasp91"):
    model = TauPyModel(model=model_name)
    provinces = json.loads((ROOT / "assets/data/tr-provinces.json").read_text(encoding="utf-8"))["provinces"]
    out = []
    for name, plon, plat in provinces:
        km = distance_km((lon, lat), (plon, plat))
        deg = km / 111.195
        out.append({"name": name, "at": [plon, plat], "km": round(km), "p_s": first(model, depth, deg, P_PHASES),
                    "s_s": first(model, depth, deg, S_PHASES)})
    out.sort(key=lambda r: (r["s_s"] is None, r["s_s"] or 0))
    # the wave fronts on the map: arrival time against distance, so the renderer draws each front where the
    # model puts it at each moment, never a ring growing at a constant speed
    far = max(r["km"] for r in out) + 100
    curve = []
    for km in range(0, int(far) + 1, 20):
        deg = max(km, 1) / 111.195
        curve.append([km, first(model, depth, deg, P_PHASES), first(model, depth, deg, S_PHASES)])
    return {"model": model_name.upper(), "depth_km": depth, "epicentre": [lon, lat], "provinces": out, "curve": curve}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--lon", type=float, required=True)
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--depth", type=float, required=True)
    ap.add_argument("--model", default="iasp91")
    a = ap.parse_args()
    import sys
    sys.stdout.reconfigure(encoding="utf-8")  # province names are Turkish; Windows consoles default to cp1254
    print(json.dumps(arrivals(a.lon, a.lat, max(a.depth, 0.5), a.model), ensure_ascii=False, indent=1))
