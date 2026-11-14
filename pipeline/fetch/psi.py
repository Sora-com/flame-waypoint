"""Fetch investigation metadata from the NASA PSI Data Repository.

PSI's web app (https://psi.nasa.gov/physci/repo/) is backed by an undocumented
JSON search endpoint. Investigation metadata (objectives, hypothesis, approach,
hardware, publications...) is public; the data files themselves require a PSI
account and are handled separately.

The fetch is incremental: each investigation is stored as one JSON file with a
content hash, and every run reports which investigations are new, changed or
unchanged. This is the same mechanism used to ingest investigations added to
PSI later (e.g. partial-gravity data from LUCI or FM2).

Usage:
    python -m pipeline.fetch.psi                       # Combustion Science
    python -m pipeline.fetch.psi --area "Fluid Physics"
    python -m pipeline.fetch.psi --dry-run             # report changes only
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = "https://psi.nasa.gov/geode-py/ws/repo/search"
# Page route in the PSI web app: data/:type/:id (type = Elasticsearch index).
PAGE = "https://psi.nasa.gov/physci/repo/data/investigation/{accession}"
USER_AGENT = "flame-waypoint/0.1 (NASA Space Apps 2026)"
PAGE_SIZE = 100

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / "data" / "psi"

# PSI separates list items inside a string with runs of 5 spaces.
LIST_SEP = "     "
LIST_FIELDS = {"Keywords": "keywords", "Publication Title": "publications",
               "Related Investigations": "related_investigations"}
TEXT_FIELDS = {"Title": "title", "Acronym": "acronym", "Objectives": "objectives",
               "Hypothesis": "hypothesis", "Approach": "approach",
               "Research Impacts/Earth Benefits": "earth_benefits",
               "Research Area": "research_area", "SubResearch Area": "subresearch_area",
               "Project Type": "project_type", "Flight Platform": "flight_platform",
               "Investigation Start Date": "start_date", "Investigation End Date": "end_date",
               "Sponsoring Agency": "sponsoring_agency", "Monitoring Center": "monitoring_center"}


# --------------------------------------------------------------------------
# Network
# --------------------------------------------------------------------------
def search(area: str, timeout: float = 30) -> list[dict]:
    """Return the raw `_source` of every investigation in a research area."""
    sources, start = [], 0
    while True:
        query = urllib.parse.urlencode({"ffield": "Research Area", "fvalue": area,
                                        "from": start, "size": PAGE_SIZE})
        req = urllib.request.Request(f"{API}?{query}", headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            hits = json.load(r)["hits"]
        batch = [h["_source"] for h in hits["hits"] if h.get("_index") == "investigation"]
        sources += batch
        start += PAGE_SIZE
        if not hits["hits"] or start >= hits["total"]:
            return sources


# --------------------------------------------------------------------------
# Normalisation (pure functions, tested offline)
# --------------------------------------------------------------------------
def split_list(value) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in str(value).split(LIST_SEP) if part.strip()]


def normalize(src: dict) -> dict:
    """Map a raw PSI record to our stable, English snake_case schema."""
    accession = src["Accession"]
    rec = {"accession": accession, "source_url": PAGE.format(accession=accession)}
    for raw, key in TEXT_FIELDS.items():
        value = (src.get(raw) or "").strip()
        rec[key] = value or None
    for raw, key in LIST_FIELDS.items():
        rec[key] = split_list(src.get(raw))
    hw = src.get("Experiment Hardware") or {}
    rec["hardware"] = {"name": hw.get("Name") or None, "link": hw.get("Link") or None}
    person = src.get("Person") or {}
    rec["principal_investigators"] = " ".join(
        p for p in (person.get("First Name"), person.get("Last Name")) if p) or None
    released = src.get("Public Release Date")
    rec["public_release_date"] = (
        datetime.fromtimestamp(released, tz=timezone.utc).date().isoformat() if released else None)
    return rec


def content_hash(record: dict) -> str:
    blob = json.dumps(record, sort_keys=True, ensure_ascii=False).encode()
    return hashlib.sha256(blob).hexdigest()[:16]


def diff(records: list[dict], out: Path) -> dict[str, list[str]]:
    """Compare fetched records with what is already stored in `out`."""
    changes = {"new": [], "changed": [], "unchanged": []}
    for rec in records:
        path = out / "investigations" / f"{rec['accession']}.json"
        if not path.exists():
            changes["new"].append(rec["accession"])
            continue
        old = json.loads(path.read_text(encoding="utf-8"))
        same = old.get("content_hash") == content_hash(rec)
        changes["unchanged" if same else "changed"].append(rec["accession"])
    return changes


def save(records: list[dict], changes: dict, out: Path, area: str) -> None:
    folder = out / "investigations"
    folder.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for rec in records:
        if rec["accession"] in changes["unchanged"]:
            continue
        stored = {**rec, "content_hash": content_hash(rec), "fetched_at": now}
        (folder / f"{rec['accession']}.json").write_text(
            json.dumps(stored, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    index = {
        "source": API, "research_area": area, "updated_at": now, "count": len(records),
        "investigations": sorted(
            ({"accession": r["accession"], "acronym": r["acronym"], "title": r["title"],
              "project_type": r["project_type"], "content_hash": content_hash(r)}
             for r in records), key=lambda r: int(r["accession"].split("-")[1])),
    }
    (out / "index.json").write_text(json.dumps(index, indent=2, ensure_ascii=False) + "\n",
                                    encoding="utf-8")


# --------------------------------------------------------------------------
def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--area", default="Combustion Science", help="PSI research area")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="Output folder")
    ap.add_argument("--dry-run", action="store_true", help="Report changes without writing")
    args = ap.parse_args(argv)

    try:
        records = [normalize(s) for s in search(args.area)]
    except OSError as e:
        print(f"Could not reach PSI: {e}", file=sys.stderr)
        return 1
    if not records:
        print(f"No investigations found for research area {args.area!r}", file=sys.stderr)
        return 1

    changes = diff(records, args.out)
    print(f"{len(records)} investigations in {args.area!r}: "
          f"{len(changes['new'])} new, {len(changes['changed'])} changed, "
          f"{len(changes['unchanged'])} unchanged")
    for kind in ("new", "changed"):
        if changes[kind]:
            print(f"  {kind}: {', '.join(changes[kind])}")
    if not args.dry_run:
        save(records, changes, args.out, args.area)
        print(f"Saved to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
