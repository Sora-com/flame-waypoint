"""Build the single JSON file the web app reads (web/data/site.json).

Joins, per investigation: PSI metadata, LLM extraction (fields + conditions
with evidence), and, if present locally, parsed PSI test tables.

Pre-computed assistant answers (data/ask/demo.json, from pipeline.ask.demo)
are included as "ask", so the public dashboard can show them without an LLM.

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
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
OUT = ROOT / "web" / "data" / "site.json"

KPA_PER_PSI = 6.894757

# Design scenarios and the Moon base requirement, shared by the dashboard, the assistant and the
# coverage report (single source). Pressures are absolute. Moon, rover and Mars use NASA's exploration
# atmosphere (34 % O2 at 8.2 psia) as the representative point inside the challenge requirement.
MOON_ZONE = {"oxygen_pct_min": 30.0, "pressure_psi_max": 10.2}  # challenge statement
SCENARIOS = [
    {"id": "iss", "name": "ISS", "short": "ISS", "oxygen_pct": 21.0, "pressure_psi": 14.7, "gravity_g": 0.0,
     "note": "Sea-level cabin air: 21 % O₂ at 14.7 psi."},
    {"id": "moon", "name": "Moon base", "short": "Moon", "oxygen_pct": 34.0, "pressure_psi": 8.2, "gravity_g": 0.16,
     "note": "Requirement ≥ 30 % O₂ at ≤ 10.2 psi (challenge statement). Point: NASA exploration atmosphere."},
    {"id": "rover", "name": "Pressurized rover", "short": "Rover", "oxygen_pct": 34.0, "pressure_psi": 8.2,
     "gravity_g": 0.16, "note": "Same atmosphere as the Moon base, very small free volume."},
    {"id": "mars", "name": "Mars", "short": "Mars", "oxygen_pct": 34.0, "pressure_psi": 8.2, "gravity_g": 0.38,
     "note": "Habitat atmosphere not defined; exploration atmosphere assumed."},
]
for _s in SCENARIOS:
    _s["pressure_kpa"] = round(_s["pressure_psi"] * KPA_PER_PSI, 1)


def load(path: Path, default=None):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def point(o2: dict | None, p: dict | None, flow: dict | None, **meta) -> dict:
    mid = lambda r: None if not r or r.get("min") is None and r.get("max") is None else \
        ((r["min"] if r["min"] is not None else r["max"]) + (r["max"] if r["max"] is not None else r["min"])) / 2
    return {"o2": mid(o2), "p": mid(p), "flow": mid(flow),
            "o2_range": [o2["min"], o2["max"]] if o2 else None,
            "p_range": [p["min"], p["max"]] if p else None,
            "flow_range": [flow["min"], flow["max"]] if flow else None, **meta}


# Data completeness, shared by the dashboard (Completeness view) and the assistant.
COMPLETENESS_FIELDS = ["o2", "pressure", "flow", "fuel", "period", "test_table", "paper_findings", "linked_source"]


def completeness(points: list[dict], fuels: list, period: list, paper_findings: list, sources: list) -> dict:
    """Which of the key fields have data. Design envelopes are not tested conditions and do not count."""
    tested = [p for p in points if p.get("kind") != "design_envelope"]
    has = lambda k: any(p.get(k) and any(v is not None for v in p[k]) for p in tested)
    fields = {
        "o2": has("o2_range"),
        "pressure": has("p_range"),
        "flow": has("flow_range"),
        "fuel": bool(fuels),
        "period": bool(period[0] and re.search(r"\d{4}", period[0])),
        "test_table": any(p["origin"] == "table" and p.get("kind") == "test" for p in points),
        "paper_findings": bool(paper_findings),
        "linked_source": any(s.get("url") for s in sources),
    }
    return {"share": round(sum(fields.values()) / len(fields), 4), "fields": fields}


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
        sources = ext.get("sources", [{"id": f"psi:{acc}", "title": rec.get("title"),
                                       "url": rec.get("source_url")}])
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
            "sources": sources,
            "conditions": conditions,
            "review_status": ext.get("review_status", "not_extracted"),
            "model": (ext.get("extraction") or {}).get("model"),
            "table_tests": sum(1 for p in points if p["origin"] == "table" and p.get("kind") == "test"),
            "completeness": completeness(points, fields.get("fuels", []),
                                         [rec.get("start_date"), rec.get("end_date")],
                                         fields.get("paper_findings", []), sources),
            "points": points,
        })
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "includes_psi_tables": include_tables,
        "scenarios": SCENARIOS,
        "moon_zone": MOON_ZONE,
        "investigations": investigations,
        "ask": load(DATA / "ask" / "demo.json"),
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
