"""Coverage and verification table: what we know about each investigation, and from where.

For every PSI investigation it reports, per source (PSI metadata text, NTRS
papers, PSI test-matrix files), how many test conditions we have with oxygen,
pressure and flow; the resulting ranges; whether any test is close to the Moon
base atmosphere; and whether LLM-extracted ranges agree with the test tables.

Outputs data/coverage.csv and data/coverage.md (also printed).

Usage:
    python -m pipeline.report.coverage
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

from pipeline.build.site_data import KPA_PER_PSI, MOON_ZONE

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"

# Moon base / exploration atmosphere from the challenge: >= 30 % O2 at <= 10.2 psi.
# A small pressure margin keeps the 10.3-10.5 psi FLEX tests visible.
MOON_O2_MIN = MOON_ZONE["oxygen_pct_min"]
MOON_P_MAX_KPA = (MOON_ZONE["pressure_psi_max"] + 0.3) * KPA_PER_PSI


def load(path: Path, default=None):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def span(points: list[dict], key: str) -> tuple[float, float] | None:
    vals = [v for p in points if p.get(key) for v in (p[key]["min"], p[key]["max"]) if v is not None]
    return (min(vals), max(vals)) if vals else None


def fmt(r: tuple[float, float] | None, digits: int = 0) -> str:
    if not r:
        return "—"
    lo, hi = (round(v, digits) if digits else round(v) for v in r)
    return f"{lo}" if lo == hi else f"{lo}–{hi}"


def near_moon(points: list[dict]) -> int:
    n = 0
    for p in points:
        if p.get("kind") == "design_envelope":   # planned ranges are not tests
            continue
        ox, pr = p.get("oxygen_pct"), p.get("pressure_kpa")
        if ox and pr and (ox["max"] or 0) >= MOON_O2_MIN and pr["min"] is not None and pr["min"] <= MOON_P_MAX_KPA:
            n += 1
    return n


def agreement(llm: list[dict], table: list[dict], key: str) -> str:
    """Do LLM-extracted ranges fall inside the range measured in the test table?"""
    a, b = span(llm, key), span(table, key)
    if not a or not b:
        return ""
    tol = 0.02 * max(abs(b[1]), 1)
    return "ok" if a[0] >= b[0] - tol and a[1] <= b[1] + tol else f"MISMATCH llm {fmt(a, 1)} vs table {fmt(b, 1)}"


def next_step(row: dict) -> str:
    if row["table_tests"] == 0 and row["table_envelopes"]:
        return "only design ranges: find per-test table"
    if row["table_tests"] == 0 and row["psi_type"] == "flight":
        return "download PSI test matrix"
    if row["table_tests"] and not (row["table_o2"] or row["table_p"] or row["table_flow"]):
        return "table has no conditions: find As Run Test Matrix"
    if not row["llm_conditions"] and not row["table_tests"]:
        return "no data: find papers or PSI files"
    if row["llm_warnings"]:
        return "review LLM warnings"
    return ""


def build() -> list[dict]:
    index = load(DATA / "psi" / "index.json", {"investigations": []})
    links = load(DATA / "ntrs" / "links.json", {"investigations": {}})["investigations"]
    rows = []
    for inv in index["investigations"]:
        acc = inv["accession"]
        rec = load(DATA / "psi" / "investigations" / f"{acc}.json", {})
        ext = load(DATA / "extracted" / f"{acc}.json", {})
        tab = load(DATA / "tables" / f"{acc}.json", {})
        conds = (ext.get("fields") or {}).get("conditions", [])
        tests = tab.get("tests", [])
        papers = links.get(acc, [])
        with_text = sum(1 for p in papers if (DATA / "raw" / "ntrs" / f"{p['ntrs_id']}.txt").exists())
        all_points = conds + tests
        row = {
            "accession": acc,
            "acronym": inv.get("acronym") or (inv.get("title") or "")[:40],
            "psi_type": "ground" if (rec.get("project_type") or "").lower().startswith("ground") else "flight",
            "ntrs_matched": len(papers),
            "ntrs_fulltext": with_text,
            "llm_conditions": len(conds),
            "llm_from_psi": sum(1 for c in conds if c["source"].startswith("psi:")),
            "llm_from_ntrs": sum(1 for c in conds if c["source"].startswith("ntrs:")),
            "llm_o2": sum(1 for c in conds if c.get("oxygen_pct")),
            "llm_p": sum(1 for c in conds if c.get("pressure_kpa")),
            "llm_flow": sum(1 for c in conds if c.get("flow_cm_s")),
            "llm_warnings": len(ext.get("warnings", [])),
            "table_tests": sum(1 for t in tests if t.get("kind", "test") == "test"),
            "table_envelopes": sum(1 for t in tests if t.get("kind") == "design_envelope"),
            "table_o2": sum(1 for t in tests if t.get("oxygen_pct")),
            "table_p": sum(1 for t in tests if t.get("pressure_kpa")),
            "table_flow": sum(1 for t in tests if t.get("flow_cm_s")),
            "table_issues": sum(1 for t in tests if t.get("issues")),
            "o2_pct": fmt(span(all_points, "oxygen_pct"), 1),
            "pressure_kpa": fmt(span(all_points, "pressure_kpa")),
            "flow_cm_s": fmt(span(all_points, "flow_cm_s")),
            "near_moon_base": near_moon(all_points),
            "check_o2": agreement(conds, tests, "oxygen_pct"),
            "check_p": agreement(conds, tests, "pressure_kpa"),
            "review_status": ext.get("review_status", "not extracted"),
        }
        row["next_step"] = next_step(row)
        rows.append(row)
    return rows


MD_COLUMNS = [("accession", "PSI"), ("acronym", "Investigation"), ("psi_type", "Type"),
              ("ntrs_fulltext", "NTRS texts"), ("llm_conditions", "LLM cond."),
              ("table_tests", "Table tests"), ("table_envelopes", "Design ranges"), ("o2_pct", "O2 %"), ("pressure_kpa", "p kPa"),
              ("flow_cm_s", "Flow cm/s"), ("near_moon_base", "Moon-like"),
              ("check_o2", "O2 check"), ("check_p", "p check"), ("next_step", "Next step")]


def to_markdown(rows: list[dict]) -> str:
    lines = ["| " + " | ".join(h for _, h in MD_COLUMNS) + " |",
             "|" + "---|" * len(MD_COLUMNS)]
    for r in rows:
        lines.append("| " + " | ".join(str(r[k]) if r[k] not in ("", 0) else "·" for k, _ in MD_COLUMNS) + " |")
    with_o2 = sum(1 for r in rows if r["llm_o2"] or r["table_o2"])
    lines += ["", f"Investigations with any oxygen value: {with_o2}/{len(rows)}. "
              f"Test points: {sum(r['table_tests'] for r in rows)} from PSI tables, "
              f"{sum(r['llm_conditions'] for r in rows)} LLM conditions (model_only)."]
    return "\n".join(lines) + "\n"


def main(argv=None) -> int:
    rows = build()
    if not rows:
        print("No PSI index found. Run: python3 -m pipeline.fetch.psi", file=sys.stderr)
        return 1
    with open(DATA / "coverage.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    md = to_markdown(rows)
    (DATA / "coverage.md").write_text(md, encoding="utf-8")
    print(md)
    return 0


if __name__ == "__main__":
    sys.exit(main())
