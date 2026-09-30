#!/usr/bin/env python3
"""Fetch every state's current coat of arms and flag, and the main alliances' emblems and flags,
from Wikimedia Commons via Wikidata, keeping only files whose licence lets us use them.

    python tools/data/fetch_emblems.py            # rebuild the manifest from Wikidata and Commons
    python tools/data/fetch_emblems.py --sync     # download the files the manifest names, checking hashes

The files (~75 MB) are not in git: the manifest pins each one by URL and SHA-256, and --sync, which
the render pipeline runs first, downloads them and refuses any whose hash has changed.

Sources: Wikidata P94 (coat of arms), P41 (flag), P154 (logo) - only statements without an end date,
so the arms a state uses today, not a historical one. Each file's licence is read from Commons'
own metadata; a file is kept only when that licence is public domain, CC0, CC BY or CC BY-SA, and
the author and licence go into assets/emblems/manifest.json so a video can credit them. Files
under any other licence are listed as skipped, never downloaded.

Use rule (PLAN.md section 6, ADR 0026): an emblem appears only in news context, over its subject on
the map, never beside our mark and never implying endorsement.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "emblems"
UA = "GreaterTurkiye-motion/0.1 (+https://github.com/Greater-Turkiye/motion)"
FREE = re.compile(r"^(public domain|pd\b|cc0|cc[ -]by(-sa)?([ -]\d(\.\d)?)?|attribution$)", re.I)
# Variants the scenes ask for by name, beside what Wikidata lists. The eagle without the shield is the
# form the reference videos use; Commons carries it as a separate public-domain file.
EXTRA = {("RUS", "arms-eagle"): "Coat of Arms of the Russian Federation 2.svg"}
ORGS = {  # key: Wikidata item
    "nato": "Q7184", "eu": "Q458", "un": "Q1065", "csto": "Q318693", "ots": "Q596850",
    "arab-league": "Q7172", "african-union": "Q7159", "cis": "Q7779", "oic": "Q47543",
}


def get(url: str, params: dict | None = None) -> bytes:
    if params:
        url += "?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception:  # noqa: BLE001 - retried, then raised
            if attempt == 3:
                raise
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("unreachable")


def sparql(q: str) -> list[dict]:
    return json.loads(get("https://query.wikidata.org/sparql", {"query": q, "format": "json"}))["results"]["bindings"]


def current(prop: str) -> dict[str, str]:
    rows = sparql(f"""SELECT ?iso ?file ?rank WHERE {{ ?item wdt:P31 wd:Q3624078; wdt:P298 ?iso.
      FILTER NOT EXISTS {{ ?item wdt:P31 wd:Q3024240 }}
      ?item p:{prop} ?st. ?st ps:{prop} ?file; wikibase:rank ?rank. FILTER(?rank != wikibase:DeprecatedRank)
      FILTER NOT EXISTS {{ ?st pq:P582 ?end }} }}""")
    # a preferred statement wins; otherwise the first by name, one file per state
    rows.sort(key=lambda r: (not r["rank"]["value"].endswith("PreferredRank"), r["file"]["value"]))
    out: dict[str, str] = {}
    for r in rows:
        out.setdefault(r["iso"]["value"], urllib.parse.unquote(r["file"]["value"].rsplit("/", 1)[-1]))
    return out


def org_files() -> dict[str, dict[str, str]]:
    out = {}
    for key, qid in ORGS.items():
        e = next(iter(json.loads(get(f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json"))["entities"].values()))
        pick: dict[str, str] = {}
        for kind, prop in (("emblem", "P154"), ("flag", "P41"), ("arms", "P94")):
            for s in e["claims"].get(prop, []):
                if "P582" in s.get("qualifiers", {}) or s.get("rank") == "deprecated":
                    continue
                v = s.get("mainsnak", {}).get("datavalue", {}).get("value")
                if v:
                    pick.setdefault(kind, v)
        out[key] = pick
    return out


def licences(titles: list[str]) -> dict[str, dict]:
    info: dict[str, dict] = {}
    strip = lambda v: re.sub(r"<[^>]+>", "", (v or {}).get("value", "")).strip()
    for i in range(0, len(titles), 40):
        chunk = titles[i:i + 40]
        d = json.loads(get("https://commons.wikimedia.org/w/api.php", {
            "action": "query", "format": "json", "prop": "imageinfo", "iiprop": "url|extmetadata|size",
            "titles": "|".join("File:" + t for t in chunk)}))
        norm = {n["to"]: n["from"] for n in d["query"].get("normalized", [])}
        for p in d["query"]["pages"].values():
            if "imageinfo" not in p:
                continue
            ii = p["imageinfo"][0]
            m = ii.get("extmetadata", {})
            title = norm.get(p["title"], p["title"]).removeprefix("File:").replace("_", " ")
            info[title] = {"url": ii["url"], "bytes": ii.get("size"), "licence": strip(m.get("LicenseShortName")),
                           "author": strip(m.get("Artist"))[:200], "page": ii.get("descriptionurl") or ""}
        time.sleep(1)
    return info


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def sync() -> int:
    doc = json.loads((OUT / "manifest.json").read_text(encoding="utf-8"))
    bad = 0
    for key, kinds in doc["items"].items():
        for kind, it in kinds.items():
            dest = OUT / it["file"]
            if not dest.exists() or hashlib.sha256(dest.read_bytes()).hexdigest() != it["sha256"]:
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(get(it["url"]))
                time.sleep(0.2)
            if hashlib.sha256(dest.read_bytes()).hexdigest() != it["sha256"]:
                print(f"hash changed upstream: {key} {kind} {it['url']}", file=sys.stderr)
                dest.unlink()
                bad += 1
    print(f"emblems in place; {bad} changed upstream and removed")
    return 1 if bad else 0


def main() -> int:
    if "--sync" in sys.argv:
        return sync()
    arms, flags, orgs = current("P94"), current("P41"), org_files()
    wanted: list[tuple[str, str, str]] = [(iso, "arms", f) for iso, f in arms.items()]
    wanted += [(iso, "flag", f) for iso, f in flags.items()]
    wanted += [(key, kind, f) for key, kinds in orgs.items() for kind, f in kinds.items()]
    wanted += [(key, kind, f) for (key, kind), f in EXTRA.items()]
    lic = licences(sorted({f.replace("_", " ") for _, _, f in wanted}))
    manifest: dict[str, dict] = {}
    skipped: list[dict] = []
    for key, kind, f in sorted(wanted):
        meta = lic.get(f.replace("_", " "))
        if not meta:
            skipped.append({"key": key, "kind": kind, "file": f, "why": "no metadata"})
            continue
        if not FREE.match(meta["licence"] or ""):
            skipped.append({"key": key, "kind": kind, "file": f, "why": meta["licence"] or "unknown licence"})
            continue
        ext = Path(f).suffix.lower()
        rel = f"orgs/{slug(key)}-{kind}{ext}" if key in ORGS else f"{kind}/{key.lower()}{ext}"
        dest = OUT / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.exists():
            dest.write_bytes(get(meta["url"]))
            time.sleep(0.2)
        manifest.setdefault(key, {})[kind] = {"file": rel, "source": meta["page"], "url": meta["url"], "licence": meta["licence"],
                                              "author": meta["author"], "sha256": hashlib.sha256(dest.read_bytes()).hexdigest()}
    doc = {"about": "State arms and flags, alliance emblems and flags, from Wikimedia Commons via Wikidata. "
                    "Kept only under public domain, CC0, CC BY or CC BY-SA. News context only (ADR 0026).",
           "items": manifest, "skipped": skipped}
    (OUT / "manifest.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    kept = sum(len(v) for v in manifest.values())
    print(f"{kept} files kept for {len(manifest)} states and organisations; {len(skipped)} skipped")
    for s in skipped:
        print("  skipped", s["key"], s["kind"], s["file"], "-", s["why"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
