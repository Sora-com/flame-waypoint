// Loads data/site.json (built by pipeline/build/site_data.py), maps every PSI
// investigation to the shape the dashboard renders and then starts js/app.js.
//
// Experiment shape (one per investigation)
//   o2, psi, flow: { min, max, vals? } over all extracted points except design envelopes; psi converted from kPa.
//   pts:           [{ o2, psi, origin, label, source }] points with a single O₂ and a single pressure value.
//   findings:      [[text, source label, url]] from papers (LLM extraction).
//   relevance:     evidence level 1–3: table tests and paper findings each add one.
(function () {
  "use strict";
  const KPA_PER_PSI = 6.894757;
  const D = window.FIRE_DATA;
  const VERSION = document.currentScript.src.split("?")[1] || "";

  const range = vals => vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : null;
  const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
  const year = s => (s && s.match(/\d{4}/) || [])[0];

  function platformOf(inv) {
    const p = inv.platform || "";
    if (/Space Station/i.test(p)) return /Cygnus/i.test(inv.hardware || "") ? "ISS · Cygnus" : "ISS";
    if (/Cygnus/i.test(p)) return "Cygnus";
    return "Ground";
  }
  function groupOf(inv) {
    const h = `${inv.acronym} ${inv.hardware || ""}`;
    if (/ACME/.test(h)) return "ACME";
    if (/MDCA|Droplet/i.test(h)) return "MDCA";
    if (/Saffire|Cygnus/i.test(h)) return "Saffire";
    if (/Glovebox|MSG/.test(h)) return "MSG";
    if (/Soot Diagnostic|P-Trak/i.test(h)) return "Detection";
    return inv.project_type === "Ground Investigation" ? "Ground" : "Other";
  }
  function phaseOf(inv) {
    if (inv.test_type === "smoke_pyrolysis") return "smoke";
    if (inv.test_type === "aerosol_dust") return "dust";
    return inv.fuel_phases[0] || "gas";
  }
  function shortName(inv) {
    if (inv.acronym && inv.acronym !== inv.accession) return inv.acronym;
    const words = (inv.title || inv.accession).split(/\s+/);
    return words.slice(0, 4).join(" ") + (words.length > 4 ? "…" : "");
  }
  function periodOf(inv) {
    const [a, b] = inv.period.map(year);
    return a && b ? (a === b ? a : `${a}–${b}`) : a ? `${a}–` : null;
  }

  // A point is plotted only when O₂ and pressure are single values: the midpoint of a
  // range (e.g. "10–40 % O₂ at 0.5–3 atm") was never tested as such.
  const exact = r => r && r[0] != null && (r[1] == null || Math.abs(r[1] - r[0]) < 1e-6);

  function toExperiment(inv) {
    // Design envelopes describe what the hardware allows, not what was tested.
    const P = inv.points.filter(p => p.kind !== "design_envelope");
    const ends = (k, f = v => v) => P.flatMap(p => p[k] ? p[k].filter(v => v != null).map(f) : []);
    const o2 = range(ends("o2_range"));
    if (o2) {
      const vals = [...new Set(P.filter(p => exact(p.o2_range)).map(p => round(p.o2_range[0])))].sort((a, b) => a - b);
      if (vals.length <= 12) o2.vals = vals;
    }
    const psi = range(ends("p_range", v => round(v / KPA_PER_PSI, 2)));
    const flow = range(ends("flow_range"));
    const seen = new Set();
    const pts = P.filter(p => exact(p.o2_range) && exact(p.p_range))
      .map(p => ({ o2: p.o2_range[0], psi: p.p_range[0] / KPA_PER_PSI, origin: p.origin, context: p.context, label: p.label, source: p.source }))
      .filter(p => { const k = `${round(p.o2)}|${round(p.psi)}|${p.origin}`; return !seen.has(k) && seen.add(k); });
    const srcById = Object.fromEntries(inv.sources.map(s => [s.id, s]));
    const findings = inv.paper_findings.map(f => {
      const s = srcById[f.source] || {};
      return [f.text, s.year ? `${f.source} (${s.year})` : f.source, s.url || null];
    });
    const tests = inv.table_tests || 0;
    return {
      id: inv.accession.toLowerCase(),
      accession: inv.accession,
      name: shortName(inv),
      longName: inv.title || inv.accession,
      group: groupOf(inv),
      platform: platformOf(inv),
      period: periodOf(inv),
      g: platformOf(inv) === "Ground" ? 1 : 0,
      phase: phaseOf(inv),
      pillars: inv.safety_pillars.length ? inv.safety_pillars : ["fundamental"],
      relevance: 1 + (tests > 0) + (findings.length > 0),
      fuel: inv.fuels.join(", ") || null,
      o2, psi, flow, pts, tests, findings,
      objectives: inv.objectives,
      finding: (findings[0] || [])[0] || inv.key_findings[0] || null,
      keyFindings: inv.key_findings,
      sources: inv.sources.map(s => [s.title || s.id, s.url || null]),
      sourceUrl: inv.source_url,
      review: inv.review_status,
      model: inv.model,
      pending: inv.review_status === "not_extracted",
      completeness: inv.completeness
    };
  }

  function start() {
    const s = document.createElement("script");
    s.src = "js/app.js" + (VERSION ? "?" + VERSION : "");
    document.body.appendChild(s);
  }
  function fail(err) {
    console.error(err);
    document.querySelector(".views").innerHTML =
      `<div class="panel empty"><b>Could not load data/site.json.</b><br>` +
      `Build it with <code>python -m pipeline.build.site_data --include-tables</code> and serve <code>web/</code> over HTTP ` +
      `(for example <code>python -m http.server -d web</code>).</div>`;
  }

  fetch("data/site.json", { cache: "no-cache" })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(site => {
      D.experiments = site.investigations.map(toExperiment);
      D.scenarios = Object.fromEntries(site.scenarios.map(s => [s.id,
        { name: s.name, short: s.short, o2: s.oxygen_pct, psi: s.pressure_psi, g: s.gravity_g, note: s.note }]));
      D.lunarZone = { o2min: site.moon_zone.oxygen_pct_min, psimax: site.moon_zone.pressure_psi_max };
      D.site = { generatedAt: site.generated_at, includesTables: site.includes_psi_tables, ask: site.ask || null };
      start();
    })
    .catch(fail);
})();
