"""Find the NTRS papers behind each PSI investigation and download their full text.

PSI metadata rarely states test conditions (O2, pressure, flow), but the papers
it lists usually do. For every publication title of every PSI investigation we
search the NASA Technical Reports Server (public JSON API) and accept a result
only if its title is a near-exact match. NTRS serves a plain-text version of
each PDF, so no PDF parsing is needed.

Outputs:
    data/ntrs/links.json           investigation -> matched NTRS papers (committed)
    data/ntrs/papers/<id>.json     paper metadata (committed)
    data/raw/ntrs/<id>.txt         full text (not committed; re-download with this script)

Usage:
    python -m pipeline.fetch.ntrs                   # all investigations
    python -m pipeline.fetch.ntrs --only PSI-25 PSI-20
    python -m pipeline.fetch.ntrs --no-text         # metadata only
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path

API = "https://ntrs.nasa.gov/api/citations/search"
BASE = "https://ntrs.nasa.gov"
USER_AGENT = "flame-waypoint/0.1 (NASA Space Apps 2026)"
MIN_SIMILARITY = 0.9
PAUSE_S = 0.5  # be polite to the public API

ROOT = Path(__file__).resolve().parents[2]
PSI = ROOT / "data" / "psi" / "investigations"
OUT = ROOT / "data" / "ntrs"
RAW = ROOT / "data" / "raw" / "ntrs"


# --------------------------------------------------------------------------
# Pure helpers (tested offline)
# --------------------------------------------------------------------------
def norm_title(title: str) -> str:
    title = re.sub(r"<[^>]+>", " ", title or "")          # NTRS titles may contain <sub> tags
    return re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, norm_title(a), norm_title(b)).ratio()


def best_match(title: str, results: list[dict]) -> tuple[dict | None, float]:
    scored = [(similarity(title, r.get("title", "")), r) for r in results]
    if not scored:
        return None, 0.0
    score, result = max(scored, key=lambda s: s[0])
    return (result, score) if score >= MIN_SIMILARITY else (None, score)


def paper_record(r: dict) -> dict:
    downloads = r.get("downloads") or []
    links = downloads[0].get("links", {}) if downloads else {}
    year = (r.get("distributionDate") or r.get("created") or "")[:4] or None
    authors = [a.get("meta", {}).get("author", {}).get("name")
               for a in r.get("authorAffiliations") or []]
    return {
        "ntrs_id": str(r["id"]),
        "title": re.sub(r"<[^>]+>", "", r.get("title") or "").strip(),
        "year": year,
        "authors": [a for a in authors if a],
        "type": r.get("stiType"),
        "abstract": r.get("abstract"),
        "url": f"{BASE}/citations/{r['id']}",
        "pdf_url": BASE + links["pdf"] if links.get("pdf") else None,
        "fulltext_url": BASE + links["fulltext"] if links.get("fulltext") else None,
        "copyright": (r.get("copyright") or {}).get("determination"),
    }


# --------------------------------------------------------------------------
# Network
# --------------------------------------------------------------------------
def _get(url: str, timeout: float = 60) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def search(title: str) -> list[dict]:
    query = urllib.parse.urlencode({"q": f'"{title}"', "page.size": 5})
    return json.loads(_get(f"{API}?{query}"))["results"]


# --------------------------------------------------------------------------
def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", nargs="+", metavar="ACCESSION")
    ap.add_argument("--no-text", action="store_true", help="Skip full-text downloads")
    args = ap.parse_args(argv)

    records = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(PSI.glob("PSI-*.json"))]
    if args.only:
        records = [r for r in records if r["accession"] in args.only]
    if not records:
        print("No PSI records found. Run: python3 -m pipeline.fetch.psi", file=sys.stderr)
        return 1

    (OUT / "papers").mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    links_path = OUT / "links.json"
    links = json.loads(links_path.read_text(encoding="utf-8")) if links_path.exists() else {}
    links = links.get("investigations", {})

    searched = matched = texts = 0
    for rec in records:
        acc = rec["accession"]
        found = []
        for title in rec["publications"]:
            searched += 1
            try:
                results = search(title)
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
                print(f"  {acc}: search failed for {title[:60]!r}: {e}", file=sys.stderr)
                continue
            finally:
                time.sleep(PAUSE_S)
            hit, score = best_match(title, results)
            if not hit:
                continue
            paper = paper_record(hit)
            matched += 1
            found.append({"ntrs_id": paper["ntrs_id"], "psi_title": title, "similarity": round(score, 3)})
            (OUT / "papers" / f"{paper['ntrs_id']}.json").write_text(
                json.dumps(paper, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

            txt = RAW / f"{paper['ntrs_id']}.txt"
            if not args.no_text and paper["fulltext_url"] and not txt.exists():
                try:
                    txt.write_bytes(_get(paper["fulltext_url"], timeout=120))
                    texts += 1
                except (urllib.error.URLError, TimeoutError) as e:
                    print(f"  {acc}: full text failed for {paper['ntrs_id']}: {e}", file=sys.stderr)
                time.sleep(PAUSE_S)
        # De-duplicate (the same paper can be listed twice).
        links[acc] = list({f["ntrs_id"]: f for f in found}.values())
        print(f"{acc:<8} {(rec.get('acronym') or '-')[:20]:<20} "
              f"{len(links[acc]):>2} / {len(rec['publications']):>2} publications on NTRS")

    links_path.write_text(json.dumps({
        "source": API, "min_similarity": MIN_SIMILARITY,
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "investigations": dict(sorted(links.items(), key=lambda kv: int(kv[0].split("-")[1]))),
    }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nSearched {searched} titles, matched {matched}, downloaded {texts} full texts.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
