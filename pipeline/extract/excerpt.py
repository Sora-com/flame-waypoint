"""Select the parts of a paper that state test conditions.

Full papers are 6-8k tokens; only a few sentences give oxygen, pressure or
flow values. We keep those sentences (plus one sentence of context on each
side) so the model reads less and its evidence quotes are easy to verify.
"""

from __future__ import annotations

import re

NUMBER = r"\d+(?:\.\d+)?"
CONDITION = re.compile(
    rf"(?:{NUMBER}\s*%|{NUMBER}\s*(?:psia?|atm|kpa|bar|torr|cm/s|mm/s|m/s)\b|"
    rf"(?:oxygen|o2|o 2)\b[^.]{{0,60}}{NUMBER}|{NUMBER}[^.]{{0,30}}(?:oxygen|o2)\b|"
    rf"mole fraction[^.]{{0,40}}{NUMBER}|{NUMBER}[^.]{{0,20}}mole fraction)",
    re.IGNORECASE)
REFERENCES = re.compile(r"\n\s*(?:references|bibliography|acknowledg(?:e)?ments?)\s*\n", re.IGNORECASE)
SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[A-Z(])")


def clean_text(raw: str) -> str:
    """Join hard-wrapped PDF lines and drop the reference list."""
    m = REFERENCES.search(raw)
    if m and m.start() > len(raw) * 0.3:  # ignore a stray heading near the top
        raw = raw[:m.start()]
    raw = re.sub(r"-\n(?=[a-z])", "", raw)            # de-hyphenate
    raw = re.sub(r"[ \t]*\n[ \t]*", " ", raw)
    return re.sub(r"\s{2,}", " ", raw).strip()


def sentences(text: str) -> list[str]:
    return [s.strip() for s in SENTENCE_END.split(text) if s.strip()]


def select(raw: str, max_chars: int = 6000, context: int = 1) -> str:
    """Return condition-bearing sentences, grouped into paragraphs, up to max_chars."""
    sents = sentences(clean_text(raw))
    hits = [i for i, s in enumerate(sents) if CONDITION.search(s)]
    keep: list[tuple[int, int]] = []
    for i in hits:
        lo, hi = max(0, i - context), min(len(sents), i + context + 1)
        if keep and lo <= keep[-1][1]:
            keep[-1] = (keep[-1][0], max(keep[-1][1], hi))
        else:
            keep.append((lo, hi))
    blocks, total = [], 0
    for lo, hi in keep:
        block = " ".join(sents[lo:hi])
        if total + len(block) > max_chars:
            break
        blocks.append(block)
        total += len(block) + 2
    return "\n\n".join(blocks)
