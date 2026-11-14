"""Decide which investigation a passage of a shared paper is about.

PSI often lists the same paper under several investigations (Saffire-I/II/III,
FLEX/FLEX-2/CFI, SLICE/ACME CLD). The model extracts findings and conditions
from the paper once per investigation, so without this step every one of them
would inherit results that belong to only one.

The paper text usually says which experiment a passage refers to
("The sample material for Saffire-I and III is ...", "Saffire-II has a sample
card ..."). For each finding or condition we locate it in the paper and take
the nearest preceding mention of a linked investigation; if there is none
nearby, the investigations the paper names anywhere. If the paper names none
of them, the passage cannot be attributed and is kept everywhere.
"""

from __future__ import annotations

import re

ROMAN = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6}
# Numerals are case-sensitive so that "Saffire in" is not read as "Saffire I".
NUMERAL = r"(?-i:VI|IV|V|III|II|I|\d)(?![A-Za-z0-9])"
SEP = r"\s*(?:,\s*(?:and\s+|or\s+)?|and\s+|or\s+|&\s*|-|–)\s*-?\s*"
WINDOW = 2000  # characters before a passage searched for the nearest mention
WORD = re.compile(r"[a-z0-9]{3,}")


def series(acronym: str) -> tuple[str, int | None]:
    """'SAFFIRE-II' -> ('SAFFIRE', 2); 'ACME CLD Flame' -> ('CLD', None); 'FLEX' -> ('FLEX', None)."""
    core = re.sub(r"^ACME\s+", "", acronym.strip(), flags=re.IGNORECASE)
    core = re.sub(r"\s+Flames?$", "", core, flags=re.IGNORECASE)
    m = re.match(r"^(.*?)[\s-]+(VI|IV|V|III|II|I|\d)$", core)
    if m:
        n = m.group(2)
        return m.group(1), int(n) if n.isdigit() else ROMAN[n]
    return core, None


def _numbers(listing: str) -> set[int]:
    tokens = re.findall(r"VI|IV|V|III|II|I|\d", listing)
    seps = re.split(r"VI|IV|V|III|II|I|\d", listing)[1:-1]
    values = [int(t) if t.isdigit() else ROMAN[t] for t in tokens]
    out = set(values)
    for i, sep in enumerate(seps):
        # "I-III" is a range; "I, -II" and "I and III" are lists.
        if sep.strip() in {"-", "–"} and values[i + 1] > values[i] + 1:
            out |= set(range(values[i], values[i + 1]))
    return out


def mentions(text: str, candidates: list[tuple[str, str]]) -> list[tuple[int, set[str]]]:
    """(position, accessions) for every place the text names a candidate investigation."""
    by_family: dict[str, list[tuple[str, int | None]]] = {}
    for acc, acronym in candidates:
        family, index = series(acronym)
        if len(family) >= 3:
            by_family.setdefault(family.lower(), []).append((acc, index))
    found = []
    for family, members in by_family.items():
        pattern = (rf"(?<![\w-]){re.escape(family)}"
                   rf"(?:[\s-]*(?P<n>{NUMERAL}(?:{SEP}{NUMERAL})*))?(?![\w])")
        for m in re.finditer(pattern, text, re.IGNORECASE):
            if m.group("n"):
                nums = _numbers(m.group("n"))
                accs = {acc for acc, idx in members if (idx or 1) in nums}
            elif any(idx is None for _, idx in members):
                accs = {acc for acc, idx in members if idx is None}  # "FLEX" alone is FLEX, not FLEX-2
            else:
                accs = {acc for acc, _ in members}  # "Saffire" alone is the whole series
            if accs:
                found.append((m.start(), accs))
    return sorted(found, key=lambda x: x[0])


def locate(text: str, passage: str) -> int | None:
    """Approximate position in `text` of `passage`: the window sharing the most words with it."""
    words = set(WORD.findall(passage.lower()))
    if not words:
        return None
    low = text.lower()
    best, best_pos = 0, None
    for start in range(0, max(len(low) - 1, 1), 150):
        hits = len(words & set(WORD.findall(low[start:start + 400])))
        if hits > best:
            best, best_pos = hits, start
    if best_pos is None or best < max(2, len(words) // 2):
        return None
    # Median position of the passage's words inside the window: roughly its middle.
    hits = sorted(m.start() for m in WORD.finditer(low, best_pos, best_pos + 400) if m.group() in words)
    return hits[len(hits) // 2]


def assign(text: str, passage: str, candidates: list[tuple[str, str]]) -> set[str] | None:
    """Accessions the passage is about, or None if the paper does not say."""
    found = mentions(text, candidates)
    if not found:
        return None
    pos = locate(text, passage)
    if pos is not None:
        before = [accs for p, accs in found if pos - WINDOW <= p <= pos]
        if before:
            return before[-1]
    return set().union(*(accs for _, accs in found))
