"""Deterministic checks and unit conversion for LLM extractions.

Each test condition must be backed by evidence fragments that appear verbatim
in the source text, and every number the model reports must appear in those
fragments. Anything that fails is dropped and reported in `warnings`, so the
reviewer sees exactly what the model got wrong.
"""

from __future__ import annotations

import re

TO_KPA = {"kpa": 1, "pa": 0.001, "mpa": 1000, "atm": 101.325, "bar": 100, "mbar": 0.1,
          "psi": 6.894757, "psia": 6.894757, "torr": 0.1333224, "mmhg": 0.1333224}
TO_CM_S = {"cm/s": 1, "mm/s": 0.1, "m/s": 100}


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip().lower()


NUM = r"\d+(?:\.\d+)?"
# "14 to 21%", "1-55 cm/s", "0.7 and 3.0 atm": every number in the run shares the unit.
RUN = rf"{NUM}(?:\s*(?:-|–|—|−|to|and|,|or)\s*{NUM})*"
UNITS = {
    "oxygen": r"%|percent|mole\s+fraction|vol\s*%",
    "pressure": r"psia?|atm|kpa|mpa|pa|bar|mbar|torr|mmhg",
    "flow_speed": r"cm/s|cm\s*s-1|mm/s|m/s|cm/sec|mm/sec|m/sec",
}


def _numbers_in(text: str) -> set[float]:
    return {float(n) for n in re.findall(NUM, text.replace(",", ""))}


OTHER_GASES = (r"ethylene|ethane|methane|propane|propylene|butane|hydrogen|h2|ch4|c2h4|fuel|"
               r"nitrogen|n2|helium|he|co2|carbon dioxide|argon|ar|xenon|sf6|dme")


def numbers_with_unit(kind: str, text: str) -> set[float]:
    """Numbers in `text` that carry a unit of the given kind."""
    found = set()
    for m in re.finditer(rf"({RUN})\s*(?:{UNITS[kind]})(?![a-z])", text, re.IGNORECASE):
        # "4% ethylene" is a fuel concentration, not oxygen.
        if kind == "oxygen" and re.match(rf"\s*(?:by volume\s+)?(?:{OTHER_GASES})\b",
                                         text[m.end():], re.IGNORECASE):
            continue
        found |= {float(n) for n in re.findall(NUM, m.group(1))}
    if kind == "oxygen":
        # "oxygen mole fraction of 0.21", "O2 concentration 0.15 to 0.4": unitless fractions.
        for m in re.finditer(rf"(?:oxygen|o2|o 2)\b[^.;]{{0,40}}?({RUN})", text, re.IGNORECASE):
            found |= {float(n) for n in re.findall(NUM, m.group(1)) if float(n) <= 1}
    return found


def _unit_key(unit: str | None) -> str:
    return re.sub(r"[\s.]", "", (unit or "").lower()).replace("cm/sec", "cm/s").replace("m/sec", "m/s")


def verify_evidence(evidence: list[str] | str | None, source: str) -> tuple[list[str], list[str]]:
    """Keep only evidence fragments found verbatim in the source."""
    if isinstance(evidence, str):
        evidence = [evidence]
    src = _norm(source)
    good, warnings = [], []
    for quote in evidence or []:
        # Models sometimes elide words with "..."; every piece must still be verbatim.
        pieces = [p for p in re.split(r"\s*(?:\.\.\.|…)\s*", _norm(quote)) if p]
        if pieces and all(p in src for p in pieces):
            good.append(quote.strip())
        elif quote.strip():
            warnings.append(f"evidence not found in source: {quote.strip()[:80]!r}")
    return good, warnings


def check_range(name: str, rng: dict | None, evidence: list[str]) -> tuple[dict | None, list[str]]:
    """Validate one {min, max, unit} range against verified evidence fragments."""
    if not rng or (rng.get("min") is None and rng.get("max") is None):
        return None, []
    lo, hi = rng.get("min"), rng.get("max")
    text = " ".join(evidence).replace(",", "")
    # A value counts only if it carries a unit of the right kind ("2.2 cm" is not a flow speed).
    found = numbers_with_unit(name, text) if name in UNITS else _numbers_in(text)
    lo_ok = lo is not None and float(lo) in found
    hi_ok = hi is not None and float(hi) in found
    if not lo_ok and not hi_ok:
        return None, [f"{name}: {lo}-{hi} {rng.get('unit')} not in evidence, dropped"]
    warnings = []
    if lo is not None and not lo_ok:
        warnings.append(f"{name}: min {lo} not in evidence, removed")
        lo = None
    if hi is not None and not hi_ok:
        warnings.append(f"{name}: max {hi} not in evidence, removed")
        hi = None
    if lo is not None and hi is not None and lo > hi:
        lo, hi = hi, lo
        warnings.append(f"{name}: min > max, swapped")
    return {"min": lo, "max": hi, "unit": rng.get("unit")}, warnings


def to_oxygen_pct(rng: dict | None, evidence: list[str]) -> tuple[dict | None, list[str]]:
    if rng is None:
        return None, []
    unit = _unit_key(rng["unit"])
    lo, hi = rng["min"], rng["max"]
    top = max(v for v in (lo, hi) if v is not None)
    text = " ".join(evidence)
    if "fraction" in unit or (top <= 1 and "%" not in unit and "%" not in text):
        lo, hi = (None if v is None else v * 100 for v in (lo, hi))
    if any(v is not None and not 0 < v <= 100 for v in (lo, hi)):
        return None, [f"oxygen: {lo}-{hi} % out of range, dropped"]
    r = lambda v: None if v is None else round(v, 2)
    return {"min": r(lo), "max": r(hi)}, []


def to_si(name: str, rng: dict | None, table: dict) -> tuple[dict | None, list[str]]:
    if rng is None:
        return None, []
    factor = table.get(_unit_key(rng["unit"]))
    if factor is None:
        return None, [f"{name}: unknown unit {rng['unit']!r}, dropped"]
    conv = lambda v: None if v is None else round(v * factor, 3)
    return {"min": conv(rng["min"]), "max": conv(rng["max"]),
            "original": f"{rng['min']}-{rng['max']} {rng['unit']}"}, []


FIELDS = ("oxygen", "pressure", "flow_speed")
CONTEXTS = {"flight", "ground", "drop_tower", "aircraft", "simulation", "unknown"}
CLAUSE_SPLIT = re.compile(r"(?<=[;:])\s+|(?<=\.)\s+(?=[A-Z(])|\n+")


def _claimed(cond: dict) -> dict[str, set[float]]:
    return {k: {float(v) for v in ((cond.get(k) or {}).get("min"), (cond.get(k) or {}).get("max"))
                if v is not None} for k in FIELDS}


def _supports(text: str, claimed: dict[str, set[float]]) -> bool:
    text = text.replace(",", "")
    return all(vals <= numbers_with_unit(k, text) for k, vals in claimed.items() if vals)


def repair_evidence(cond: dict, source: str) -> str | None:
    """Find the shortest clause (or pair of adjacent clauses) in the source that
    contains every value the model claimed, each with a unit of the right kind."""
    claimed = _claimed(cond)
    if not any(claimed.values()):
        return None
    clauses = [c.strip() for c in CLAUSE_SPLIT.split(source) if c.strip()]
    windows = clauses + [f"{a} {b}" for a, b in zip(clauses, clauses[1:])]
    hits = [w for w in windows if _supports(w, claimed)]
    return min(hits, key=len) if hits else None


def clean_condition(cond: dict, source: str) -> tuple[dict | None, list[str]]:
    """Check one condition. Returns None if no verified value survives."""
    label = (cond.get("label") or "").strip() or "unlabeled"
    evidence, warnings = verify_evidence(cond.get("evidence"), source)
    if not _supports(" ".join(evidence), _claimed(cond)):
        repaired = repair_evidence(cond, source)
        if repaired and verify_evidence([repaired], source)[0]:
            # The source text supports the values; only the model's quote was wrong.
            warnings = ["evidence repaired from source text"]
            evidence = [repaired]
    context = cond.get("context") if cond.get("context") in CONTEXTS else "unknown"
    out = {"label": label, "context": context, "fuel": (cond.get("fuel") or "").strip() or None}

    oxy, w = check_range("oxygen", cond.get("oxygen"), evidence)
    warnings += w
    out["oxygen_pct"], w = to_oxygen_pct(oxy, evidence)
    warnings += w

    for key, table, out_key in [("pressure", TO_KPA, "pressure_kpa"), ("flow_speed", TO_CM_S, "flow_cm_s")]:
        rng, w = check_range(key, cond.get(key), evidence)
        warnings += w
        out[out_key], w = to_si(key, rng, table)
        warnings += w

    warnings = [f"[{label}] {w}" for w in warnings]
    if not any(out[k] for k in ("oxygen_pct", "pressure_kpa", "flow_cm_s")):
        return None, warnings
    out["evidence"] = evidence
    return out, warnings


def clean(extraction: dict, source: str, source_id: str) -> tuple[dict, list[str]]:
    """Return the checked extraction (SI units, conditions tagged with their source)."""
    out = {k: v for k, v in extraction.items() if k != "conditions"}
    warnings: list[str] = []
    conditions = []
    for cond in extraction.get("conditions") or []:
        checked, w = clean_condition(cond, source)
        warnings += w
        if checked:
            conditions.append({**checked, "source": source_id})
    out["conditions"] = conditions
    for key, value in out.items():
        if isinstance(value, list) and key != "conditions":
            out[key] = list(dict.fromkeys(v.strip() for v in value if isinstance(v, str) and v.strip()))
    return out, [f"{source_id}: {w}" for w in warnings]
