"""Build the single JSON file the web app reads (web/data/site.json).

Joins, per investigation: PSI metadata, LLM extraction (fields + conditions
with evidence), and, if present locally, parsed PSI test tables.

PSI test tables (parsed from files downloaded from PSI) are included with
--include-tables, which the GitHub Pages build uses. Every table point keeps
its source file and row.

Usage:
    python -m pipeline.build.site_data --include-tables   # site build (GitHub Pages)
    python -m pipeline.build.site_data                    # metadata + LLM points only
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
OUT = ROOT / "web" / "data" / "site.json"

# Reference atmospheres shown on the map and used for ranking.
SCENARIOS = [
    {"id": "moon", "name": "Moon base (challenge)", "oxygen_pct": 30.0, "pressure_kpa": 70.3,
     "note": ">= 30 % O2 at <= 10.2 psi (challenge statement)"},
    {"id": "exploration", "name": "Exploration atmosphere", "oxygen_pct": 34.0, "pressure_kpa": 56.5,
     "note": "34 % O2 at 8.2 psia (NASA exploration atmosphere studied in ACME BRE)"},
    {"id": "iss", "name": "ISS cabin", "oxygen_pct": 21.0, "pressure_kpa": 101.3,
     "note": "Sea-level air: 21 % O2 at 14.7 psi"},
    {"id": "suit", "name": "Spacesuit", "oxygen_pct": 100.0, "pressure_kpa": 29.6,
     "note": "100 % O2 at 4.3 psi (off the chart scale)"},
]


def load(path: Path, default=None):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def point(o2: dict | None, p: dict | None, flow: dict | None, **meta) -> dict:
    mid = lambda r: None if not r or r.get("min") is None and r.get("max") is None else \
        ((r["min"] if r["min"] is not None else r["max"]) + (r["max"] if r["max"] is not None else r["min"])) / 2
    return {"o2": mid(o2), "p": mid(p), "flow": mid(flow),
            "o2_range": [o2["min"], o2["max"]] if o2 else None,
            "p_range": [p["min"], p["max"]] if p else None,
            "flow_range": [flow["min"], flow["max"]] if flow else None, **meta}


def build(include_tables: bool) -> dict:
    index = load(DATA / "psi" / "index.json", {"investigations": []})
    investigations = []
    for item in index["investigations"]:
        acc = item["accession"]
        rec = load(DATA / "psi" / "investigations" / f"{acc}.json", {})
        ext = load(DATA / "extracted" / f"{acc}.json", {})
        fields = ext.get("fields", {})
        conditions = fields.get("conditions", [])
        points = [point(c.get("oxygen_pct"), c.get("pressure_kpa"), c.get("flow_cm_s"),
                        origin="llm", context=c.get("context", "unknown"), fuel=c.get("fuel"),
                        label=c.get("label"), source=c.get("source"))
                  for c in conditions]
        table = load(DATA / "tables" / f"{acc}.json") if include_tables else None
        if table:
            points += [point(t.get("oxygen_pct"), t.get("pressure_kpa"), t.get("flow_cm_s"),
                             origin="table", context="flight", fuel=t.get("fuel"),
                             label=f"Test {t.get('test_id')}", source=t.get("source"),
                             kind=t.get("kind", "test"), outcome=t.get("outcome"))
                       for t in table["tests"]]
        investigations.append({
            "accession": acc,
            "acronym": rec.get("acronym") or acc,
            "title": rec.get("title"),
            "project_type": rec.get("project_type"),
            "platform": rec.get("flight_platform"),
            "hardware": (rec.get("hardware") or {}).get("name"),
            "period": [rec.get("start_date"), rec.get("end_date")],
            "objectives": rec.get("objectives"),
            "earth_benefits": rec.get("earth_benefits"),
            "source_url": rec.get("source_url"),
            "test_type": fields.get("test_type"),
            "fuels": fields.get("fuels", []),
            "fuel_phases": fields.get("fuel_phases", []),
            "safety_pillars": fields.get("safety_pillars", []),
            "key_findings": fields.get("key_findings", []),
            "paper_findings": fields.get("paper_findings", []),
            "sources": ext.get("sources", [{"id": f"psi:{acc}", "title": rec.get("title"),
                                            "url": rec.get("source_url")}]),
            "conditions": conditions,
            "review_status": ext.get("review_status", "not_extracted"),
            "model": (ext.get("extraction") or {}).get("model"),
            "table_tests": sum(1 for p in points if p["origin"] == "table" and p.get("kind") == "test"),
            "points": points,
        })
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "includes_psi_tables": include_tables,
        "scenarios": SCENARIOS,
        "investigations": investigations,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--include-tables", action="store_true", help="Include parsed PSI test tables")
    args = ap.parse_args(argv)
    site = build(args.include_tables)
    if not site["investigations"]:
        print("No PSI index found. Run: python3 -m pipeline.fetch.psi", file=sys.stderr)
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(site, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n = sum(len(i["points"]) for i in site["investigations"])
    print(f"Wrote {OUT} ({OUT.stat().st_size // 1024} KB): {len(site['investigations'])} investigations, "
          f"{n} points, PSI tables {'included' if args.include_tables else 'excluded'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
