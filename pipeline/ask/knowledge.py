"""What the assistant knows: computed facts plus retrievable passages.

Numbers come from the data, not from the model: `facts()` computes per
investigation ranges and the Moon base gap in Python, and the model only has
to read and phrase them. Free-text questions are answered from passages
(paper findings, PSI objectives, extracted conditions with their evidence)
retrieved with BM25. Every fact and passage carries a source id the model
must cite.
"""

from __future__ import annotations

import math
import re
from collections import Counter

from pipeline.build.site_data import ROOT, build

KPA_PER_PSI = 6.894757
MOON = {"o2_min": 30.0, "psi_max": 10.2}  # challenge statement: >= 30 % O2 at <= 10.2 psi
WORD = re.compile(r"[a-z0-9]+(?:[-.][a-z0-9]+)*")
GLOSSARY = ROOT / "web" / "js" / "data.js"  # the dashboard glossary: ["term", "category", "definition"]
STOP = set("the a an of and or in on at to for with by from is are was were be been what which who how "
           "did do does that this these those it its as than then there their any all about into".split())


def tokens(text: str) -> list[str]:
    return [w for w in WORD.findall((text or "").lower()) if w not in STOP]


def _fmt(lo, hi, digits=1):
    if lo is None:
        return "not reported"
    f = lambda v: f"{v:.{digits}f}".rstrip("0").rstrip(".")
    return f(lo) if abs(hi - lo) < 1e-9 else f"{f(lo)}–{f(hi)}"


def _exact(r):
    return r and r[0] is not None and (r[1] is None or abs(r[1] - r[0]) < 1e-6)


class Knowledge:
    def __init__(self, site: dict | None = None):
        self.site = site or build(include_tables=True)
        self.investigations = self.site["investigations"]
        self.sources = {}  # id -> {title, url}
        for inv in self.investigations:
            self.sources[inv["accession"]] = {"title": f"{inv['acronym']}: {inv['title']}",
                                              "url": inv["source_url"]}
            for s in inv["sources"]:
                if s["id"].startswith("ntrs:"):
                    self.sources[s["id"]] = {"title": s.get("title"), "url": s.get("url")}
        self.passages = self._passages()
        self._index()

    # ───────── Facts computed in Python ─────────
    def facts(self) -> str:
        lines = ["INVESTIGATIONS (computed from PSI test tables and extracted papers; pressures absolute):"]
        rich = []  # tested points with O2 >= 30 % and a pressure
        max_o2, no_o2, no_p = [], [], []
        for inv in self.investigations:
            pts = [p for p in inv["points"] if p.get("kind") != "design_envelope"]
            rng = lambda k: [v for p in pts if p.get(k) for v in p[k] if v is not None]
            o2, kpa, flow = rng("o2_range"), rng("p_range"), rng("flow_range")
            for p in pts:
                if _exact(p.get("o2_range")) and _exact(p.get("p_range")) and p["o2_range"][0] >= MOON["o2_min"]:
                    rich.append((p["p_range"][0] / KPA_PER_PSI, p["o2_range"][0], inv, p))
            psi = [v / KPA_PER_PSI for v in kpa]
            tag = f"[{inv['accession']}] {inv['acronym']}"
            if o2:
                max_o2.append((max(o2), tag))
            else:
                no_o2.append(tag)
            if not psi:
                no_p.append(tag)
            lines.append(
                f"[{inv['accession']}] {inv['acronym']} | {inv['platform'] or 'ground study'} | "
                f"hardware: {(inv['hardware'] or 'not reported')[:80]} | "
                f"fuels: {', '.join(inv['fuels'][:8]) or 'not reported'} | "
                f"O2 %: {_fmt(min(o2), max(o2)) if o2 else 'not reported'} | "
                f"pressure psi: {_fmt(min(psi), max(psi)) if psi else 'not reported'} | "
                f"flow cm/s: {_fmt(min(flow), max(flow)) if flow else 'not reported'} | "
                f"PSI test records: {inv['table_tests']} | safety pillars: {', '.join(inv['safety_pillars']) or '-'}")
        lines.append("")
        above = sorted(((v, t) for v, t in max_o2 if v > 21.5), reverse=True)
        lines.append("Investigations that tested above 21 % O2 (maximum O2 tested): "
                     + ("; ".join(f"{t} up to {v:g} %" for v, t in above) or "none") + ".")
        lines.append(f"Investigations with no O2 value in the data ({len(no_o2)}): {'; '.join(no_o2) or 'none'}.")
        lines.append(f"Investigations with no pressure value in the data ({len(no_p)}): {'; '.join(no_p) or 'none'}.")
        lines.append("")
        lines.append(f"MOON BASE ATMOSPHERE: >= {MOON['o2_min']:g} % O2 at <= {MOON['psi_max']} psi.")
        inside = [r for r in rich if r[0] <= MOON["psi_max"]]
        if inside:
            names = sorted({f"[{r[2]['accession']}] {r[2]['acronym']}" for r in inside})
            lines.append(f"Tests inside that zone: {len(inside)}, in {', '.join(names)}.")
        else:
            lines.append("Tests inside that zone: none in the data.")
        if rich:
            psi, o2, inv, p = min(rich, key=lambda r: r[0])
            lines.append(f"Lowest pressure tested at >= {MOON['o2_min']:g} % O2: {psi:.1f} psi at {o2:g} % O2, "
                         f"[{inv['accession']}] {inv['acronym']} ({p.get('label')}, {p.get('source')}).")
        lines += ["", *self.rankings(), "", *self.scenarios()]
        return "\n".join(lines)

    # ───────── Rankings: maxima and minima are computed here, never by the model ─────────
    @staticmethod
    def _tag(inv) -> str:
        return f"[{inv['accession']}] {inv['acronym']}"

    @staticmethod
    def _tested(inv) -> list[dict]:
        return [p for p in inv["points"] if p.get("kind") != "design_envelope"]

    @staticmethod
    def completeness(inv) -> tuple[float, list[str]]:
        """The dashboard's completeness, computed once in site_data; returns (share, missing fields)."""
        c = inv["completeness"]
        return c["share"], [k.replace("_", " ").replace("o2", "O2") for k, v in c["fields"].items() if not v]

    def rankings(self) -> list[str]:
        out = ["RANKINGS (computed; use these for 'most', 'least', 'highest', 'lowest', 'most complete' questions):"]
        by_tests = sorted(self.investigations, key=lambda i: -i["table_tests"])
        out.append("Most PSI test records: " + "; ".join(
            f"{self._tag(i)} {i['table_tests']}" for i in by_tests[:6] if i["table_tests"]) + ".")
        groups: dict[int, list[str]] = {}
        for inv in self.investigations:
            share, missing = self.completeness(inv)
            groups.setdefault(round(share * 100), []).append(
                self._tag(inv) + (f" (missing {', '.join(missing)})" if missing else ""))
        ranked = sorted(groups.items(), reverse=True)
        out.append("Data completeness (dashboard metric: share of 8 fields with data: O2, pressure, flow, fuel, "
                   "period, test table, paper findings, linked source): "
                   + " | ".join(f"{pct} %: {'; '.join(names)}" for pct, names in ranked[:3])
                   + f" | lowest, {ranked[-1][0]} %: {'; '.join(ranked[-1][1])}.")
        # No "lowest pressure at any O2" ranking: the model confused it with the >= 30 % O2 figure above.
        return out

    def scenarios(self) -> list[str]:
        """Closest tested conditions to each dashboard scenario, with the dashboard's distance d."""
        out = ["SCENARIOS (closest tests with both O2 and pressure; d = sqrt((dO2/15)^2 + (dp_psi/6)^2), 0 = exact match):"]
        for scn in self.site.get("scenarios", []):
            s_o2, s_psi = scn["oxygen_pct"], scn["pressure_kpa"] / KPA_PER_PSI
            best = []
            for inv in self.investigations:
                d = [(math.hypot((o2 - s_o2) / 15, (psi - s_psi) / 6), o2, psi)
                     for p in self._tested(inv) if _exact(p.get("o2_range")) and _exact(p.get("p_range"))
                     for o2, psi in [(p["o2_range"][0], p["p_range"][0] / KPA_PER_PSI)]]
                if d:
                    best.append((*min(d), inv))
            best.sort(key=lambda x: x[0])
            out.append(f"{scn['name']} ({s_o2:g} % O2 at {s_psi:.1f} psi): "
                       + ("; ".join(f"{self._tag(i)} closest test {o2:g} % O2 at {psi:.1f} psi (d={d:.2f})"
                                    for d, o2, psi, i in best[:5]) or "no test with both values") + ".")
        out.append("Investigations without both O2 and pressure cannot be placed by distance; judge them by "
                   "platform, materials and findings instead.")
        return out

    # ───────── Retrievable passages ─────────
    def _passages(self) -> list[dict]:
        out = []
        if GLOSSARY.exists():
            for term, cat, definition in re.findall(r'\["([^"]+)", "(\w+)", "([^"]+)"\]',
                                                    GLOSSARY.read_text(encoding="utf-8")):
                if cat != "dashboard":
                    out.append({"source": "glossary", "about": None, "text": f"Glossary, {term}: {definition}"})
        for inv in self.investigations:
            acc, name = inv["accession"], inv["acronym"]
            head = f"{name} ({acc})"
            period = " to ".join(d for d in inv["period"] if d) or "not reported"
            out.append({"source": acc, "about": acc, "text":
                        f"{head}: {inv['title']}. {inv['project_type'] or ''} on {inv['platform'] or 'ground'}; "
                        f"hardware: {inv['hardware'] or 'not reported'}; period {period}; "
                        f"test type: {(inv['test_type'] or 'unknown').replace('_', ' ')}."})
            titles = {s["id"]: s.get("title") for s in inv["sources"]}
            for f in inv["paper_findings"]:
                out.append({"source": f["source"], "about": acc,
                            "text": f"{head}, finding of the paper \"{titles.get(f['source'])}\": {f['text']}"})
            for k in inv["key_findings"]:
                out.append({"source": acc, "about": acc, "text": f"{head}, PSI summary: {k}"})
            if inv.get("objectives"):
                for part in re.split(r"\n+", inv["objectives"]):
                    if len(part) > 40:
                        out.append({"source": acc, "about": acc, "text": f"{head}, PSI objectives: {part[:700]}"})
            if inv.get("earth_benefits"):
                out.append({"source": acc, "about": acc, "text": f"{head}, Earth benefits: {inv['earth_benefits'][:500]}"})
            for c in inv["conditions"]:
                ev = " ".join(c.get("evidence") or [])[:500]
                if ev:
                    out.append({"source": (c.get("source") or acc).removeprefix("psi:"), "about": acc,
                                "text": f"{head}, test condition ({c.get('context')}): {c.get('label')}. Evidence: {ev}"})
            fuels = Counter(p.get("fuel") for p in inv["points"] if p["origin"] == "table" and p.get("fuel"))
            if fuels:
                listed = "; ".join(f"{f} ({n} tests)" for f, n in fuels.most_common(12))
                out.append({"source": acc, "about": acc, "text": f"{head}, PSI test table fuels/samples: {listed}"})
        return out

    def _index(self):
        self.docs = [tokens(p["text"]) for p in self.passages]
        self.df = Counter(w for d in self.docs for w in set(d))
        self.avg = sum(map(len, self.docs)) / max(len(self.docs), 1)

    def search(self, question: str, k: int = 8) -> list[dict]:
        q = tokens(question)
        n = len(self.docs)
        # Questions naming an investigation get its passages ranked first.
        named = {inv["accession"] for inv in self.investigations
                 if re.search(rf"(?<![\w-]){re.escape(inv['acronym'].lower())}(?![\w-])", question.lower())
                 or inv["accession"].lower() in question.lower()}
        scored = []
        for i, d in enumerate(self.docs):
            tf = Counter(d)
            s = sum(math.log(1 + (n - self.df[w] + 0.5) / (self.df[w] + 0.5)) *
                    tf[w] * 2.2 / (tf[w] + 1.2 * (0.25 + 0.75 * len(d) / self.avg)) for w in q if w in tf)
            if self.passages[i]["about"] in named:
                s += 5
            if s > 0:
                scored.append((s, i))
        return [self.passages[i] for _, i in sorted(scored, reverse=True)[:k]]
