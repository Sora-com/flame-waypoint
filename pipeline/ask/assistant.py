"""Answer a natural-language question with the local LLM, citing sources.

The model sees the computed facts and the retrieved passages, nothing else,
and must cite them as [PSI-69] or [ntrs:20130014061]. Citations to ids that
were not in its context are removed, statements with words or numbers absent
from their cited sources are flagged as unverified, and the answer reports how long it took
and how many tokens it used, so its energy cost can be budgeted.
"""

from __future__ import annotations

import json
import re
import time
import urllib.request

from pipeline.ask.knowledge import Knowledge

OLLAMA = "http://localhost:11434"
DEFAULT_MODEL = "mistral-nemo"
ID = r"(?:PSI-\d+|ntrs:\d+|glossary)"
CITE = re.compile(rf"\[({ID}(?:\s*[,;]\s*{ID})*)\]")

INSTRUCTIONS = """You answer questions about NASA microgravity combustion experiments for fire safety in spacecraft and Moon bases.
Use ONLY the FACTS and PASSAGES below. Do not use outside knowledge.
- Cite every statement with the source id in square brackets, e.g. [PSI-69], [ntrs:20130014061] or [glossary].
- Copy numbers exactly as written, with their units. Do not compute new numbers.
- Do not define terms, expand acronyms or describe materials unless a passage does it.
- Only say an experiment observed or studied something if a fact or passage about that experiment says so.
- If the question is ambiguous (for example "most complete", "most important", "best"), start by stating which criterion from the data you use, and mention that other criteria could give a different answer.
- If the data answers only part of the question, give that part. If it answers nothing, say so in one sentence.
- Answer in at most 6 short sentences or bullet points. Plain text, no headings."""

REMINDER = ("Before answering: if the question can be read in more than one way, say which criterion from the FACTS "
            "you use and that another criterion could change the answer. If several investigations tie, name all "
            "of them. Cite sources in square brackets, e.g. [PSI-69].")


def ollama(model: str, prompt: str, num_ctx: int = 8192, timeout: float = 600) -> dict:
    body = {"model": model, "prompt": prompt, "stream": False, "keep_alive": "15m",
            "options": {"temperature": 0, "num_ctx": num_ctx, "num_predict": 400}}
    req = urllib.request.Request(f"{OLLAMA}/api/generate", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def available(model: str = DEFAULT_MODEL) -> bool:
    try:
        with urllib.request.urlopen(f"{OLLAMA}/api/tags", timeout=2) as r:
            names = {m["name"].split(":")[0] for m in json.load(r)["models"]}
        return model.split(":")[0] in names
    except OSError:
        return False


def build_prompt(kb: Knowledge, question: str, passages: list[dict]) -> str:
    ctx = "\n".join(f"[{p['source']}] {p['text']}" for p in passages)
    # The reminder sits next to the question: placed only among the instructions, the model often ignores it.
    return (f"{INSTRUCTIONS}\n\nFACTS:\n{kb.facts()}\n\nPASSAGES:\n{ctx}\n\nQUESTION: {question}\n"
            f"{REMINDER}\nANSWER:")


def clean_citations(answer: str, allowed: set[str]) -> tuple[str, list[str]]:
    """Drop citations to ids the model was not given; return the ids it used, in order."""
    used = []

    def keep(m):
        ids = [i.strip() for i in re.split(r"[,;]", m.group(1))]
        ok = [i for i in ids if i in allowed]
        used.extend(i for i in ok if i not in used)
        return f"[{', '.join(ok)}]" if ok else ""

    return re.sub(r"\s+([.,;])", r"\1", CITE.sub(keep, answer)).strip(), used


def drop_unsupported_expansions(answer: str, context: str) -> str:
    """Remove 'SIBAL (made-up expansion)' when the parenthetical is not in the model's context."""
    ctx = re.sub(r"\W+", " ", context.lower())

    def check(m):
        inner = re.sub(r"\W+", " ", m.group(2).lower()).strip()
        return m.group(0) if inner in ctx else m.group(1)

    return re.sub(r"\b([A-Z][A-Za-z0-9-]{2,})\s*\(([A-Za-z][^()\d]{5,})\)", check, answer)


# Words that carry no claim of their own (verbs of reporting, connectors, generic nouns).
GENERIC = set("""experiment experiments investigation investigations observe observed observes study studied studies
studying find found finding findings test tests tested testing data result results also during use used using include
included including includes conduct conducted provide provided following several various report reported according
based criterion criteria could another answer change closest close typical similar most more less than which were was
have has had been being with within from into over under their there these those such other both each many some only
not none no yes exact exactly about around approximately up down whose where when while this that they them its it
explicitly stated provided facts passages mentioned listed shown given known show shows showed before after due
fuel fuels flame flames combustion fire fires material materials speed speeds sample samples space spacecraft
microgravity gravity condition conditions value values experiment's complete""".split())
# Statements that only say something is missing are not claims to verify.
NEGATIVE = re.compile(r"\b(no|not|none|nothing)\b.{0,60}\b(data|reported|found|stated|information|available)\b", re.I)
NUMBER = re.compile(r"\d+(?:\.\d+)?")


def _stem(word: str) -> str:
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y"
    return word[:-1] if len(word) > 4 and word.endswith("s") and not word.endswith("ss") else word


def _words(text: str) -> set[str]:
    return {_stem(w) for w in re.findall(r"[a-z][a-z0-9-]{2,}", text.lower())}


def _numbers(text: str) -> set[str]:
    return {str(float(n)) for n in NUMBER.findall(text.replace(",", ""))}


def support_text(kb: Knowledge, ids: list[str], facts: str) -> str:
    """Everything the cited sources say: their facts lines and passages."""
    parts = []
    for i in ids:
        if i == "glossary":
            parts += [p["text"] for p in kb.passages if p["source"] == "glossary"]
        elif i.startswith("PSI-"):
            parts += [line for line in facts.splitlines() if f"[{i}]" in line]
            parts += [p["text"] for p in kb.passages if p["about"] == i]
        else:
            parts += [p["text"] for p in kb.passages if p["source"] == i]
    return "\n".join(parts)


def verify(kb: Knowledge, answer: str) -> list[dict]:
    """Flag cited statements with words or numbers that none of their cited sources contain."""
    facts = kb.facts()
    flags = []
    for line in answer.splitlines():
        for sentence in re.split(r"(?<=[.!?])\s+(?=[A-Z\[-])", line):
            ids = [i.strip() for m in CITE.finditer(sentence) for i in re.split(r"[,;]", m.group(1))]
            names = {inv["accession"] for inv in kb.investigations
                     if re.search(rf"(?<![\w-]){re.escape(inv['acronym'])}(?![\w-])", sentence, re.IGNORECASE)}
            ids = list(dict.fromkeys(ids + sorted(names)))
            if not ids:
                continue
            support = support_text(kb, ids, facts)
            claim = CITE.sub(" ", sentence)
            if NEGATIVE.search(claim):
                continue
            # Verb forms (burned, measured, ranging) are paraphrase; nouns and numbers carry the claim.
            words = {w for w in _words(claim) - GENERIC if not re.search(r"(ed|ing|ize|ise)$", w)}
            words -= _words(" ".join(kb.sources.get(i, {}).get("title") or "" for i in ids))
            missing = sorted(w for w in words if w not in _words(support))
            missing += sorted(n for n in _numbers(claim) - _numbers(support))
            if missing:
                flags.append({"sentence": sentence.strip(), "not_in_sources": missing})
    return flags


def ask(kb: Knowledge, question: str, model: str = DEFAULT_MODEL, k: int = 8) -> dict:
    passages = kb.search(question, k)
    t0 = time.time()
    prompt = build_prompt(kb, question, passages)
    resp = ollama(model, prompt)
    seconds = time.time() - t0
    allowed = {inv["accession"] for inv in kb.investigations} | {p["source"] for p in passages}
    answer, used = clean_citations(drop_unsupported_expansions(resp.get("response", ""), prompt), allowed)
    return {
        "question": question,
        "answer": answer,
        "citations": [{"id": i, **kb.sources.get(i, {"title": "Dashboard glossary" if i == "glossary" else i,
                                                     "url": None})} for i in used],
        "passages": [{"source": p["source"], "text": p["text"]} for p in passages],
        "model": model,
        "seconds": round(seconds, 2),
        "prompt_tokens": resp.get("prompt_eval_count"),
        "output_tokens": resp.get("eval_count"),
        "load_seconds": round((resp.get("load_duration") or 0) / 1e9, 2),
        "unverified": verify(kb, answer),
    }
