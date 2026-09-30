"""Candidate sounds for the listening room: Creative Commons 0 recordings from Freesound.

    python tools/data/harvest_sfx.py            # writes out/sfx/candidates.json, previews in the cache

Only sounds under CC0 are considered (the search is filtered by licence, and each sound's own page is
read to confirm it). For each category the best-rated and the most-downloaded results are taken; the
high-quality MP3 preview is downloaded into the cache outside the repository. Nothing here goes into a
video until the owner has listened and chosen: see tools/audio/room.mjs.
"""
from __future__ import annotations

import html
import json
import os
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = Path(os.environ.get("LOCALAPPDATA") or Path.home() / ".cache") / "gt-cache" / "sfx"
OUT = ROOT / "out" / "sfx"
CC0 = 'license:"Creative Commons 0"'

CATEGORIES = {
    "whoosh": ["cinematic whoosh", "transition whoosh", "swoosh"],
    "riser": ["cinematic riser", "tension riser"],
    "hit": ["cinematic hit soft", "boom hit trailer", "sub drop"],
    "tick": ["ui click", "interface tick", "data blip"],
    "pop": ["pop ui", "bubble pop soft"],
    "typewriter": ["typewriter keys", "typewriter"],
    "drone": ["dark ambient drone", "cinematic drone", "atmosphere tension"],
    "music": ["cinematic music loop", "documentary music", "ambient music loop"],
}


def get(url: str) -> str:
    req = urllib.request.Request(url, headers={"Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")


def search(q: str, sort: str) -> list[dict]:
    url = "https://freesound.org/search/?" + urllib.parse.urlencode({"q": q, "f": CC0, "s": sort})
    page = get(url)
    out = []
    for m in re.finditer(r'href="/people/([^/"]+)/sounds/(\d+)/"\s+title="([^"]*)"', page):
        user, sid, title = m.group(1), m.group(2), html.unescape(m.group(3))
        pm = re.search(r'previews/(\d+)/' + sid + r'_(\d+)-lq\.mp3', page)
        if not pm:
            continue
        out.append({"id": int(sid), "user": user, "title": title,
                    "preview": f"https://cdn.freesound.org/previews/{pm.group(1)}/{sid}_{pm.group(2)}-hq.mp3",
                    "page": f"https://freesound.org/people/{user}/sounds/{sid}/"})
    return out


def details(s: dict) -> dict:
    page = get(s["page"])
    lic = re.search(r'href="(https?://creativecommons\.org/[^"]+)"', page)
    dur = re.search(r'<dt[^>]*>\s*Duration\s*</dt>\s*<dd[^>]*>\s*([^<]+)', page)
    dl = re.search(r'(\d[\d,]*)\s+downloads', page)
    s["licence"] = lic.group(1) if lic else None
    s["duration"] = dur.group(1).strip() if dur else None
    s["downloads"] = int(dl.group(1).replace(",", "")) if dl else None
    return s


def main() -> int:
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    result = {}
    for cat, queries in CATEGORIES.items():
        seen, picks = set(), []
        for q in queries:
            for sort in ("Rating (highest first)", "Downloads (most first)"):
                for s in search(q, sort)[:5]:
                    if s["id"] in seen:
                        continue
                    seen.add(s["id"])
                    picks.append(s)
                time.sleep(0.5)
        keep = []
        for s in picks[:10]:
            try:
                details(s)
            except Exception as e:  # a page that will not load is a sound we do not use
                print("skip", s["id"], e)
                continue
            if not s["licence"] or "publicdomain/zero" not in s["licence"]:
                print("not CC0, skip", s["id"], s["licence"])
                continue
            f = CACHE / f"{s['id']}.mp3"
            if not f.exists():
                urllib.request.urlretrieve(s["preview"], f)
            s["file"] = str(f)
            keep.append(s)
            time.sleep(0.3)
        result[cat] = keep
        print(f"{cat}: {len(keep)}", flush=True)
        # written after every category, so a slow run still leaves what it found
        (OUT / "candidates.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
