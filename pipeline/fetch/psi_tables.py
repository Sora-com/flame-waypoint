"""Parse PSI test-matrix files (CSV / XLSX) into one record per test. No LLM.

PSI investigation folders (account required) often include an "Experimental
table" or "As Run Test Matrix" with the conditions of every test. These are the
most reliable source for the condition map: values are read directly, units are
converted in Python, and every point cites the file and test number.

Column names differ between investigations, so columns are recognised by
keywords; anything not recognised is kept under `extra`. Rows with unreadable
values are kept with an `issues` list instead of being silently dropped.

Input : data/raw/psi_files/PSI-<n>_*.{csv,xlsx}   (downloaded by hand from PSI)
Output: data/tables/PSI-<n>.json

Usage:
    python -m pipeline.fetch.psi_tables
    python -m pipeline.fetch.psi_tables --only PSI-69
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from pipeline.extract.checks import TO_CM_S, TO_KPA
from pipeline.fetch.xlsx import read_xlsx

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "psi_files"
OUT = ROOT / "data" / "tables"
TABLE_HINTS = re.compile(r"experimental table|test matrix|list of data|readme", re.IGNORECASE)

# (field, header regex). First match wins; order matters.
# PSI exports lose subscripts: "O initial ambient composition" is O2, "CO ..." is CO2.
COLUMNS = [
    ("test_id", r"^(?:as run )?test ?(?:#|no\.?|number)$|^(?:\w+ )?test #$|^sample (?:number|no\.?|#)$"
                r"|^flex number$|^test$"),
    ("identifier", r"identifier|data file|^test id"),
    # ACME "Test Day" is YYDDD (year + day of year); it wins over a bare "Date" (day of month).
    ("date", r"^(?:test )?date$|^test day$"),
    # ACME "Fuel MFC" is a flow controller and "Fuel Conc." the dilution: neither names the fuel.
    ("fuel", r"^fuel(?! mfc| conc)|material|fuel type|^sample type$"),
    ("pressure", r"pressure|^p\b|^pinit\b"),
    # BASS-II has "calibrated initial O2 % by vol" then "... final O2 ...": the first (initial) wins.
    # ACME s-Flame: "Atmosphere" = "~21% O2 with N2".
    ("oxygen", r"^o\b|\bo2\b|^xo2\b|oxygen|^atmosphere"),
    ("n2", r"^n2?\b.*(?:composition|fraction)|^xn2$|^nitrogen$"),
    ("co2", r"^co2?\b.*(?:composition|fraction)|^xco2$"),
    ("he", r"^he\b.*(?:composition|fraction)|^xhe$|^helium$"),
    # "Flow restrictor" is a hardware setting, not a speed. BASS-II "Air display" is the air speed.
    ("flow", r"^(?!.*restrict).*(?:air flow|flow velocity|flow speed|air display|air rate|velocity)"),
    ("droplet_diameter", r"^do\b|droplet initial diameter|initial diameter"),
    ("outcome", r"test end|outcome|result"),
]
ASSUMED_UNITS = {"air display": "cm/s"}  # BASS-II flight notes give these values in cm/s
LIST_OR_RANGE = re.compile(r";|\bor\b|\d\s*-\s*\d")
NUM = re.compile(r"-?\d+(?:\.\d+)?")


def unit_of(header: str) -> str | None:
    m = re.search(r";\s*(.+)$|\(([^)]+)\)", header)
    return (m.group(1) or m.group(2)).strip() if m else None


def map_columns(header: list[str]) -> dict[str, int]:
    mapping: dict[str, int] = {}
    for idx, name in enumerate(header):
        key = re.sub(r"\s+", " ", name.strip().lower())
        for field, pattern in COLUMNS:
            if field not in mapping and re.search(pattern, key):
                mapping[field] = idx
                break
    return mapping


def parse_range(value: str) -> tuple[float | None, float | None, bool]:
    """'0.5 - 3.0' -> (0.5, 3.0); '~4.5' -> (4.5, 4.5); returns ok=False if unreadable."""
    value = (value or "").strip()
    # PSI uses a lone dash (cp1252 0x96 = "–") for "no data".
    if not value or value.lower() in {"–", "—", "-", "n/a", "na", "none", "nan"}:
        return None, None, True
    # Commas separate values ("5, 3,2,1" in BASS-II), they are not thousands separators here.
    nums = [float(n) for n in NUM.findall(value)]
    if not nums or "�" in value:
        return None, None, False
    return min(nums), max(nums), True


def to_unit(lo, hi, unit: str | None, table: dict) -> dict | None:
    if lo is None:
        return None
    key = re.sub(r"[\s.]", "", (unit or "").lower())
    factor = table.get(key)
    if factor is None:
        return {"min": lo, "max": hi, "unit": unit, "converted": False}
    return {"min": round(lo * factor, 3), "max": round(hi * factor, 3), "converted": True}


def is_header(row: list[str]) -> bool:
    cells = [c for c in row if c.strip()]
    if len(cells) < 2 or any(NUM.fullmatch(c.strip()) for c in cells):
        return False
    n = len(map_columns(row))
    # Short headers (SLICE: "Test Date, Fuel Type") count only if every cell is recognised.
    return n >= 2 and (len(cells) >= 3 or n == len(cells))


MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}


def normalize_date(cell: str, row: list[str], header: list[str]) -> tuple[str | None, str | None]:
    """Return (ISO date or the original text, trailing note). Unknown formats are kept as is."""
    cell = (cell or "").strip()
    if not cell:
        return None, None
    names = [h.strip().lower() for h in header]
    m = re.fullmatch(r"(\d{2})(\d{3})", cell)                      # ACME YYDDD
    if m and 1 <= int(m.group(2)) <= 366:
        d = datetime(2000 + int(m.group(1)), 1, 1) + timedelta(days=int(m.group(2)) - 1)
        return d.date().isoformat(), None
    m = re.match(r"(\d{4})-([A-Za-z]{3})-(\d{1,2})\b\s*(.*)", cell)  # SLICE "2012-FEB-13 notes"
    if m and m.group(2).lower() in MONTHS:
        iso = f"{m.group(1)}-{MONTHS[m.group(2).lower()]:02d}-{int(m.group(3)):02d}"
        return iso, m.group(4).strip() or None
    if re.fullmatch(r"\d{1,2}", cell) and "year" in names and "month" in names:
        # Separate Year / Month / Date columns (ACME BRE, E-FIELD): "Date" is the day of month.
        year = row[names.index("year")].strip() if names.index("year") < len(row) else ""
        month = row[names.index("month")].strip().lower() if names.index("month") < len(row) else ""
        mon = int(month) if month.isdigit() else MONTHS.get(month[:3])
        if year.isdigit() and mon:
            return f"{year}-{mon:02d}-{int(cell):02d}", None
    return cell, None


def fix_autofill(tests: list[dict]) -> None:
    """ACME CLD lists '40% CH4', '40% CH5', ... '40% CH14' on consecutive rows: a spreadsheet
    autofill slip (also s-Flame 'with N2' -> 'with N3'). A fuel equal to the previous row's with
    the subscript of its last formula + 1 is the same fuel. Only formula subscripts count (digit
    right after an element symbol), so real numbering such as 'sample 1', 'sample 2' is kept."""
    formula_end = re.compile(r"(.*?[A-Z][a-z]?)(\d+)")
    prev_raw = prev_fixed = None
    for rec in tests:
        raw = rec["fuel"]
        m, p = formula_end.fullmatch(raw or ""), formula_end.fullmatch(prev_raw or "")
        if m and p and m.group(1) == p.group(1) and int(m.group(2)) == int(p.group(2)) + 1:
            rec["fuel"] = prev_fixed
            rec["issues"].append(f"fuel {raw!r} read as {prev_fixed!r} (spreadsheet autofill)")
        prev_raw, prev_fixed = raw, rec["fuel"]


def parse_rows(rows: list[list[str]], source_file: str) -> tuple[list[dict], list[str], list[str]]:
    """Turn raw rows into test records. Handles several header rows in one sheet."""
    tests, mapped, unmapped = [], set(), set()
    header, cols = None, {}
    for line_no, row in enumerate(rows, start=1):
        if not any(c.strip() for c in row):
            continue
        if is_header(row):
            header, cols = row, map_columns(row)
            mapped |= {header[i] for i in cols.values()}
            unmapped |= {h for i, h in enumerate(header) if h.strip() and i not in cols.values()}
            continue
        if header is None:
            continue
        if tests and _is_continuation(row, cols):
            # E-FIELD: a row holding only a second "Fuel Conc" or a note belongs to the test above.
            prev = tests[-1]
            for i, h in enumerate(header):
                if i < len(row) and h.strip() and row[i].strip():
                    key = h.strip()
                    prev["extra"][key] = "; ".join(filter(None, [prev["extra"].get(key), row[i].strip()]))
            continue
        # Lists/ranges in two or more condition columns (FLEX-2: "0.17; 0.21; 0.25" x
        # "0.5; 1.0; ... or 3.0") describe a design envelope, not individual tests.
        cond_cells = [row[cols[f]] for f in ("oxygen", "pressure") if f in cols and cols[f] < len(row)]
        kind = "design_envelope" if sum(bool(LIST_OR_RANGE.search(c)) for c in cond_cells) >= 2 else "test"
        if kind == "design_envelope":
            for rec in _parse_row(row, header, cols, line_no, source_file):
                rec["kind"] = kind
                tests.append(rec)
            continue
        # "21; 26.5; 40" (ACME BRE) lists several discrete conditions: one record per value.
        ox_idx = cols.get("oxygen")
        ox_cell = row[ox_idx] if ox_idx is not None and ox_idx < len(row) else ""
        if ";" in ox_cell:
            for k, value in enumerate(v.strip() for v in ox_cell.split(";") if v.strip()):
                sub = list(row)
                sub[ox_idx] = value
                for rec in _parse_row(sub, header, cols, line_no, source_file):
                    rec["test_id"] = f"{rec['test_id']}.{k + 1}"
                    tests.append(rec)
            continue
        tests += _parse_row(row, header, cols, line_no, source_file)
    fix_autofill(tests)
    return tests, sorted(mapped), sorted(unmapped)


def _is_continuation(row: list[str], cols: dict[str, int]) -> bool:
    """No test identity (id, identifier, date, fuel) and no conditions: not a test of its own."""
    keys = ("test_id", "identifier", "date", "fuel", "oxygen", "pressure", "flow")
    return not any(cols[f] < len(row) and row[cols[f]].strip() for f in keys if f in cols)


def _fix_percent(value: str, issues: list[str]) -> str:
    """'3400%' in ACME BRE means 34 %: a spreadsheet formatting slip (34 shown as 3400%)."""
    m = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*%\s*", value or "")
    if m and float(m.group(1)) > 100 and float(m.group(1)) / 100 <= 100:
        fixed = f"{float(m.group(1)) / 100:g}"
        issues.append(f"oxygen {value.strip()!r} read as {fixed} %")
        return fixed
    return value


def _parse_row(row, header, cols, line_no, source_file) -> list[dict]:
    get = lambda f: row[cols[f]].strip() if f in cols and cols[f] < len(row) else ""
    issues = []
    if "oxygen" in cols and cols["oxygen"] < len(row):
        row = list(row)
        row[cols["oxygen"]] = _fix_percent(row[cols["oxygen"]], issues)
    date, date_note = normalize_date(get("date"), row, header)
    rec = {"row": line_no, "kind": "test",
           "test_id": get("test_id") or get("identifier") or str(line_no),
           "identifier": get("identifier") or None, "date": date,
           "fuel": get("fuel") or None, "outcome": get("outcome") or None}

    ox_cell = get("oxygen")
    if "%" in ox_cell and re.search(r"[a-z]", ox_cell, re.IGNORECASE):
        # "~21% O2 with N2": only numbers followed by % are oxygen values.
        ox_cell = "; ".join(re.findall(r"(\d+(?:\.\d+)?)\s*%", ox_cell))
    lo, hi, ok = parse_range(ox_cell)
    if "flame type" in [h.strip().lower() for h in header]:
        ftype = row[[h.strip().lower() for h in header].index("flame type")].strip().lower()
        if ftype == "inverse" and lo is not None:
            # Inverse flames: oxygen issues from the burner into a fuel ambient,
            # so XO2 is not the ambient atmosphere and must not go on the map.
            issues.append(f"inverse flame: XO2 {ox_cell} is the burner oxidizer, not the ambient; excluded")
            lo = hi = None
    if not ok:
        issues.append(f"unreadable oxygen {get('oxygen')!r}")
    if lo is not None:
        pct = lo <= 1 and hi <= 1 or "fraction" in (header[cols['oxygen']].lower())
        lo, hi = (lo * 100, hi * 100) if pct else (lo, hi)
        if not 0 < lo <= hi <= 100:
            issues.append(f"oxygen out of range: {lo}-{hi} %")
            lo = hi = None
    rec["oxygen_pct"] = {"min": round(lo, 2), "max": round(hi, 2)} if lo is not None else None

    for field, table, key in [("pressure", TO_KPA, "pressure_kpa"), ("flow", TO_CM_S, "flow_cm_s")]:
        cell = get(field)
        if "(" in cell:
            # BASS-II notes mix speeds with fan/pot settings in parentheses, inconsistently.
            issues.append(f"{field}: ambiguous cell {cell!r}, values in parentheses ignored - review")
            cell = re.sub(r"\([^)]*\)?", " ", cell)
        lo, hi, ok = parse_range(cell)
        if not ok:
            issues.append(f"unreadable {field} {get(field)!r}")
        unit = unit_of(header[cols[field]]) if field in cols else None
        if field in cols and lo is not None and unit is None:
            name = re.sub(r"\s+", " ", header[cols[field]].strip().lower())
            m = re.search(r"(cm/s|mm/s|m/s|atm|psia?|kpa|mmhg)", get(field), re.IGNORECASE)
            if m:                                   # unit written in the cell: "30 cm/s"
                unit = m.group(1)
            elif name in ASSUMED_UNITS:
                unit = ASSUMED_UNITS[name]
                issues.append(f"{field}: unit assumed {unit} for column {header[cols[field]].strip()!r}")
        rec[key] = to_unit(lo, hi, unit, table)
        if rec[key] and not rec[key]["converted"]:
            issues.append(f"{field}: unknown unit {unit!r}")
        if field == "flow" and rec[key] and rec[key]["min"] is not None and rec[key]["min"] < 0:
            # SPICE logs small negative air rates with the fan off: sensor offset around zero.
            issues.append(f"negative flow {get(field)!r} read as 0 (sensor offset)")
            rec[key]["min"] = 0.0
            rec[key]["max"] = max(rec[key]["max"], 0.0)
        if field == "pressure" and lo is not None and lo <= 0:
            issues.append(f"pressure {get(field)!r} {unit} is not physical, dropped")
            rec[key] = None

    diluents = {}
    for gas in ("n2", "co2", "he"):
        lo, hi, ok = parse_range(get(gas))
        if lo:  # 0 means absent
            diluents[gas.upper()] = round(hi if hi <= 1 else hi / 100, 3)
        elif not ok and get(gas).lower() != "balance":
            issues.append(f"unreadable {gas} {get(gas)!r}")
    rec["diluents"] = diluents
    ox = rec["oxygen_pct"]
    if ox and diluents and ox["min"] == ox["max"]:
        total = ox["max"] / 100 + sum(diluents.values())
        if abs(total - 1) > 0.02:
            issues.append(f"composition sums to {total:.3f}, not 1")
    rec["extra"] = {h.strip(): row[i].strip() for i, h in enumerate(header)
                    if i < len(row) and h.strip() and i not in cols.values() and row[i].strip()}
    if date_note:
        rec["extra"]["date note"] = date_note
    if any("�" in c for c in row):
        issues.append("row contains unreadable characters")
    rec["issues"] = issues
    rec["source"] = f"{source_file}#row{line_no}"
    return [rec]


def read_file(path: Path) -> list[tuple[str, list[list[str]]]]:
    if path.suffix.lower() == ".xlsx":
        return list(read_xlsx(path).items())
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1252", errors="replace")
    return [("csv", list(csv.reader(io.StringIO(text))))]


def summarize(tests: list[dict]) -> dict:
    def span(key):
        vals = [v for t in tests if t.get(key) for v in (t[key]["min"], t[key]["max"]) if v is not None]
        return [min(vals), max(vals)] if vals else None
    return {
        "tests": sum(1 for t in tests if t.get("kind") == "test"),
        "design_envelopes": sum(1 for t in tests if t.get("kind") == "design_envelope"),
        "with_oxygen": sum(1 for t in tests if t["oxygen_pct"]),
        "with_pressure": sum(1 for t in tests if t["pressure_kpa"]),
        "with_flow": sum(1 for t in tests if t["flow_cm_s"]),
        "with_issues": sum(1 for t in tests if t["issues"]),
        "oxygen_pct_range": span("oxygen_pct"),
        "pressure_kpa_range": span("pressure_kpa"),
        "flow_cm_s_range": span("flow_cm_s"),
        "fuels": sorted({t["fuel"] for t in tests if t["fuel"]}, key=lambda f: (f.lower(), f)),
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", nargs="+", metavar="ACCESSION")
    args = ap.parse_args(argv)

    files = sorted(p for p in RAW.glob("PSI-*") if p.suffix.lower() in (".csv", ".xlsx")
                   and TABLE_HINTS.search(p.name))
    by_acc: dict[str, list[Path]] = {}
    for p in files:
        acc = re.match(r"(PSI-\d+)", p.name).group(1)
        if not args.only or acc in args.only:
            by_acc.setdefault(acc, []).append(p)
    if not by_acc:
        print(f"No PSI table files in {RAW}", file=sys.stderr)
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    for acc, paths in sorted(by_acc.items(), key=lambda kv: int(kv[0].split("-")[1])):
        all_tests, files_info = [], []
        for path in paths:
            for sheet, rows in read_file(path):
                tests, mapped, unmapped = parse_rows(rows, path.name)
                all_tests += tests
                files_info.append({"file": path.name, "sheet": sheet, "tests": len(tests),
                                   "mapped_columns": mapped, "unmapped_columns": unmapped})
        result = {"accession": acc, "origin": "psi_files",
                  "parsed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                  "files": files_info, "summary": summarize(all_tests), "tests": all_tests}
        (OUT / f"{acc}.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n",
                                         encoding="utf-8")
        s = result["summary"]
        print(f"{acc:<8} tests={s['tests']:<4} O2={s['with_oxygen']:<4} p={s['with_pressure']:<4} "
              f"flow={s['with_flow']:<4} issues={s['with_issues']:<4} O2%={s['oxygen_pct_range']} "
              f"kPa={s['pressure_kpa_range']}")
        for f in files_info:
            if f["unmapped_columns"]:
                print(f"         unmapped in {f['file']}: {', '.join(f['unmapped_columns'])[:150]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
