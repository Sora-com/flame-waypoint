"""Extract structured fields from PSI metadata and NTRS papers with a local LLM.

For each investigation:
  1. the PSI metadata record -> descriptive fields + any stated conditions;
  2. each linked NTRS paper (condition-bearing excerpts only) -> more conditions.
Conditions keep the source they came from, so every number can be cited.

Reads  data/psi/investigations/*.json, data/ntrs/links.json, data/raw/ntrs/*.txt
Writes data/extracted/<accession>.json (review_status = "model_only")

Incremental: skipped when the PSI hash, linked papers, model and prompt version
are unchanged.

Usage:
    python -m pipeline.extract.run                      # all, mistral-nemo
    python -m pipeline.extract.run --only PSI-25 PSI-20
    python -m pipeline.extract.run --model ministral-3:3b --force
    python -m pipeline.extract.run --no-papers          # PSI metadata only
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from pipeline.extract import checks, excerpt, prompt

ROOT = Path(__file__).resolve().parents[2]
PSI = ROOT / "data" / "psi" / "investigations"
NTRS = ROOT / "data" / "ntrs"
NTRS_TEXT = ROOT / "data" / "raw" / "ntrs"
OUT = ROOT / "data" / "extracted"
OLLAMA = "http://localhost:11434"


def ollama_generate(model: str, instructions: str, schema: dict, text: str,
                    num_ctx: int = 8192, timeout: float = 900) -> dict:
    body = {
        "model": model,
        "prompt": f"{instructions}\nDOCUMENT:\n{text}",
        "format": schema,
        "stream": False,
        "keep_alive": "10m",
        # num_predict caps runaway generations (seen with mistral 7B in tests).
        "options": {"temperature": 0, "num_ctx": num_ctx, "num_predict": 2000},
    }
    req = urllib.request.Request(f"{OLLAMA}/api/generate", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def call(model: str, instructions: str, schema: dict, text: str, source_id: str):
    """One LLM call + checks. Returns (fields, warnings, run_info)."""
    t0 = time.time()
    resp = ollama_generate(model, instructions, schema, text)
    info = {"source": source_id, "seconds": round(time.time() - t0, 1),
            "prompt_tokens": resp.get("prompt_eval_count"), "output_tokens": resp.get("eval_count")}
    try:
        raw = json.loads(resp["response"])
    except json.JSONDecodeError:
        return {}, [f"{source_id}: model returned invalid JSON"], {**info, "raw": None}
    fields, warnings = checks.clean(raw, text, source_id)
    if resp.get("done_reason") == "length":
        warnings.append(f"{source_id}: generation hit the token limit")
    return fields, warnings, {**info, "raw": raw}


def gravity(rec: dict) -> str:
    kind = (rec.get("project_type") or "").lower()
    if kind.startswith("ground"):
        return "normal (ground)"
    if kind.startswith("reduced"):
        return "reduced"
    return "microgravity"


def linked_papers(accession: str) -> list[dict]:
    path = NTRS / "links.json"
    if not path.exists():
        return []
    links = json.loads(path.read_text(encoding="utf-8"))["investigations"].get(accession, [])
    papers = []
    for link in links:
        meta = NTRS / "papers" / f"{link['ntrs_id']}.json"
        text = NTRS_TEXT / f"{link['ntrs_id']}.txt"
        if meta.exists() and text.exists():
            papers.append({**json.loads(meta.read_text(encoding="utf-8")), "text_path": text})
    return papers


def fingerprint(rec: dict, papers: list[dict], model: str) -> dict:
    return {"model": model, "prompt_version": prompt.PROMPT_VERSION,
            "source_hash": rec.get("content_hash"),
            "papers": sorted(p["ntrs_id"] for p in papers)}


def is_current(path: Path, fp: dict) -> bool:
    if not path.exists():
        return False
    meta = json.loads(path.read_text(encoding="utf-8")).get("extraction", {})
    return all(meta.get(k) == v for k, v in fp.items())


def paper_text(paper: dict) -> str:
    return excerpt.select(paper["text_path"].read_text(encoding="utf-8", errors="replace"))


def extract_one(rec: dict, papers: list[dict], model: str, stored_runs: list[dict] | None = None) -> dict:
    """Run the LLM on every source, or re-apply the checks to `stored_runs` (no LLM)."""
    acc = rec["accession"]
    stored = {r["source"]: r for r in stored_runs or []}

    def run_source(instructions, schema, text, sid):
        if stored_runs is None:
            return call(model, instructions, schema, text, sid)
        info = stored.get(sid, {})
        if info.get("raw") is None:
            return {}, [f"{sid}: no stored model output"], info
        fields, warnings = checks.clean(info["raw"], text, sid)
        return fields, warnings, info

    fields, warnings, info = run_source(prompt.INVESTIGATION_INSTRUCTIONS, prompt.INVESTIGATION_SCHEMA,
                                        prompt.build_document(rec), f"psi:{acc}")
    runs = [info]
    sources = [{"id": f"psi:{acc}", "title": rec.get("title"), "url": rec.get("source_url")}]
    conditions = list(fields.get("conditions", []))
    fuels = list(fields.get("fuels", []))
    paper_findings = []

    for paper in papers:
        sid = f"ntrs:{paper['ntrs_id']}"
        text = paper_text(paper)
        sources.append({"id": sid, "title": paper["title"], "url": paper["url"], "year": paper.get("year")})
        if not text:
            runs.append({"source": sid, "skipped": "no condition-bearing sentences"})
            continue
        pf, pw, pinfo = run_source(prompt.PAPER_INSTRUCTIONS, prompt.PAPER_SCHEMA, text, sid)
        runs.append({**pinfo, "excerpt_chars": len(text)})
        warnings += pw
        conditions += pf.get("conditions", [])
        fuels += pf.get("fuels", [])
        paper_findings += [{"text": f, "source": sid} for f in pf.get("key_findings", [])]

    fields["conditions"] = conditions
    fields["fuels"] = list(dict.fromkeys(fuels))
    fields["paper_findings"] = paper_findings
    return {
        "accession": acc,
        "acronym": rec.get("acronym"),
        "title": rec.get("title"),
        "source_url": rec.get("source_url"),
        "origin": "psi",
        "gravity": gravity(rec),
        "hardware": (rec.get("hardware") or {}).get("name"),
        "platform": rec.get("flight_platform"),
        "period": [rec.get("start_date"), rec.get("end_date")],
        "sources": sources,
        "fields": fields,
        "warnings": warnings,
        "review_status": "model_only",
        "extraction": {**fingerprint(rec, papers, model),
                       "extracted_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                       "seconds": round(sum(r.get("seconds", 0) for r in runs), 1),
                       "runs": runs},
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default="mistral-nemo")
    ap.add_argument("--only", nargs="+", metavar="ACCESSION")
    ap.add_argument("--force", action="store_true", help="Re-extract even if up to date")
    ap.add_argument("--no-papers", action="store_true", help="Use PSI metadata only")
    ap.add_argument("--recheck", action="store_true",
                    help="Re-apply the Python checks to stored model outputs (no LLM calls)")
    args = ap.parse_args(argv)

    records = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(PSI.glob("PSI-*.json"))]
    if args.only:
        records = [r for r in records if r["accession"] in args.only]
    if not records:
        print("No PSI records found. Run: python3 -m pipeline.fetch.psi", file=sys.stderr)
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    done = skipped = 0
    for rec in records:
        papers = [] if args.no_papers else linked_papers(rec["accession"])
        path = OUT / f"{rec['accession']}.json"
        stored_runs = None
        if args.recheck:
            if not path.exists():
                skipped += 1
                continue
            old = json.loads(path.read_text(encoding="utf-8"))["extraction"]
            stored_runs, model = old["runs"], old["model"]
            done_ids = {r["source"] for r in stored_runs}
            papers = [p for p in papers if f"ntrs:{p['ntrs_id']}" in done_ids]
        elif not args.force and is_current(path, fingerprint(rec, papers, args.model)):
            skipped += 1
            continue
        try:
            result = extract_one(rec, papers, model if args.recheck else args.model, stored_runs)
            if args.recheck:
                result["extraction"]["extracted_at"] = old["extracted_at"]
                result["extraction"]["rechecked_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        except urllib.error.URLError as e:
            print(f"Ollama not reachable at {OLLAMA}: {e}", file=sys.stderr)
            return 1
        path.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        done += 1
        conds = result["fields"]["conditions"]
        has = lambda k: sum(1 for c in conds if c.get(k))
        print(f"{rec['accession']:<8} {(rec.get('acronym') or '-')[:20]:<20} "
              f"{result['extraction']['seconds']:6.1f}s  papers={len(papers):<2} conditions={len(conds):<3} "
              f"(O2 {has('oxygen_pct')}, p {has('pressure_kpa')}, flow {has('flow_cm_s')})  "
              f"warnings={len(result['warnings'])}", flush=True)
    print(f"\nExtracted {done}, up to date {skipped}, model {args.model}. Output: {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
