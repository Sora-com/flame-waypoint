"""Pre-compute answers for the public dashboard, which has no LLM behind it.

Runs a fixed set of questions through the same local assistant the server
uses and writes data/ask/demo.json, which pipeline.build.site_data publishes.
Each answer keeps its measured time and token counts, used to budget the
assistant's energy in the dashboard.

Usage:
    python -m pipeline.ask.demo                      # mistral-nemo
    python -m pipeline.ask.demo --model ministral-3:3b
"""

from __future__ import annotations

import argparse
import json
import platform
import statistics
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from pipeline.ask import assistant
from pipeline.ask.knowledge import Knowledge

OUT = Path(__file__).resolve().parents[2] / "data" / "ask" / "demo.json"

QUESTIONS = [
    "Has any experiment tested the Moon base atmosphere (30 % oxygen or more at 10.2 psi or less)?",
    "What is the lowest pressure tested at 30 % oxygen or more, and in which experiment?",
    "Which experiments burned solid materials, and at what flow speeds?",
    "What did FLEX find about the limiting oxygen index of methanol droplets?",
    "Which experiments are relevant to smoke detection, and what particle sizes did they measure?",
    "Which materials were burned in Saffire-II and what was learned?",
    "Which experiments used oxygen concentrations above 21 %?",
    "How does reduced pressure affect flame spread according to the data?",
    "Which fuels were burned as droplets in FLEX, FLEX-2 and CFI?",
    "What is a cool flame and which experiments observed one?",
    "What results exist on fire suppression or extinguishment?",
    "Which investigations have no oxygen or pressure data?",
    "What was the ignition temperature of Nomex in Saffire-III?",
]


def machine() -> str:
    try:
        chip = subprocess.run(["sysctl", "-n", "machdep.cpu.brand_string"], capture_output=True, text=True).stdout.strip()
        mem = int(subprocess.run(["sysctl", "-n", "hw.memsize"], capture_output=True, text=True).stdout) / 2**30
        return f"{chip}, {mem:.0f} GB"
    except (OSError, ValueError):
        return platform.machine()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default=assistant.DEFAULT_MODEL)
    args = ap.parse_args(argv)
    if not assistant.available(args.model):
        print(f"Ollama or model '{args.model}' not available: ollama pull {args.model}", file=sys.stderr)
        return 1
    kb = Knowledge()
    assistant.ollama(args.model, "ok")  # load the model so the first timing is not a cold start
    answers = []
    for q in QUESTIONS:
        r = assistant.ask(kb, q, args.model)
        answers.append(r)
        print(f"{r['seconds']:6.1f}s  {r['prompt_tokens']:>5} in  {r['output_tokens']:>4} out  {q}", flush=True)
    secs = [a["seconds"] for a in answers]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model": args.model,
        "machine": machine(),
        "median_seconds": round(statistics.median(secs), 2),
        "median_prompt_tokens": statistics.median(a["prompt_tokens"] for a in answers),
        "median_output_tokens": statistics.median(a["output_tokens"] for a in answers),
        "answers": answers,
    }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nWrote {OUT}: {len(answers)} answers, median {statistics.median(secs):.1f} s per answer")
    return 0


if __name__ == "__main__":
    sys.exit(main())
