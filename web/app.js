// Flame Waypoint: static front end. Reads data/site.json built by pipeline/build/site_data.py.
"use strict";

const $ = (sel) => document.querySelector(sel);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (v, d = 1) => (v == null ? "—" : Number(v).toFixed(d).replace(/\.0+$/, ""));
const range = (r, d = 1) => (!r ? "—" : r[0] === r[1] || r[0] == null || r[1] == null ? fmt(r[0] ?? r[1], d) : `${fmt(r[0], d)}–${fmt(r[1], d)}`);

const state = { site: null, scenario: "moon", search: "", pillar: "", phase: "", selected: null };

// Map scales: pressure on a log axis, oxygen linear. The spacesuit (100 % O2) is off-scale.
const MAP = { w: 760, h: 440, m: { l: 52, r: 16, t: 16, b: 44 }, pMin: 20, pMax: 600, oMin: 0, oMax: 45 };
const xOf = (p) => MAP.m.l + (Math.log(p / MAP.pMin) / Math.log(MAP.pMax / MAP.pMin)) * (MAP.w - MAP.m.l - MAP.m.r);
const yOf = (o) => MAP.h - MAP.m.b - ((o - MAP.oMin) / (MAP.oMax - MAP.oMin)) * (MAP.h - MAP.m.t - MAP.m.b);

// Distance in condition space: 5 O2 percentage points ~ a 25 % change in pressure.
function distance(pt, sc) {
  return Math.hypot((pt.o2 - sc.oxygen_pct) / 5, Math.log(pt.p / sc.pressure_kpa) / Math.log(1.25));
}

const scenario = () => state.site.scenarios.find((s) => s.id === state.scenario);
const mappable = (pt) => pt.o2 != null && pt.p != null && pt.kind !== "design_envelope";

function spans(inv) {
  const vals = (key) => inv.points.flatMap((p) => (p[key] ? p[key].filter((v) => v != null) : []));
  const r = (a) => (a.length ? [Math.min(...a), Math.max(...a)] : null);
  return { o2: r(vals("o2_range")), p: r(vals("p_range")) };
}

function ranked() {
  const sc = scenario();
  return state.site.investigations
    .map((inv) => {
      const pts = inv.points.filter(mappable);
      if (!pts.length) return { inv, d: Infinity };
      const best = pts.reduce((a, b) => (distance(b, sc) < distance(a, sc) ? b : a));
      return { inv, d: distance(best, sc), best, n: pts.length };
    })
    .sort((a, b) => a.d - b.d);
}

function matches(inv) {
  const q = state.search.trim().toLowerCase();
  const hay = [inv.acronym, inv.title, inv.accession, ...(inv.fuels || [])].join(" ").toLowerCase();
  return (!q || hay.includes(q)) &&
    (!state.pillar || (inv.safety_pillars || []).includes(state.pillar)) &&
    (!state.phase || (inv.fuel_phases || []).includes(state.phase));
}

// ---------------------------------------------------------------- KPIs
function renderKpis() {
  const invs = state.site.investigations;
  const pts = invs.flatMap((i) => i.points);
  const sc = scenario();
  const near = pts.filter((p) => mappable(p) && distance(p, sc) <= 1).length;
  const items = [
    [invs.length, "PSI combustion investigations"],
    [invs.filter((i) => i.points.some((p) => p.o2 != null)).length, "with verified oxygen data"],
    [pts.filter(mappable).length, "test conditions on the map"],
    [near, `conditions close to “${sc.name}”`],
  ];
  $("#kpis").innerHTML = items.map(([v, l]) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("");
}

// ---------------------------------------------------------------- Map
function renderMap() {
  const { w, h, m } = MAP;
  const sc = scenario();
  const pTicks = [20, 30, 50, 70, 100, 200, 300, 500];
  const oTicks = [0, 10, 20, 30, 40];
  let svg = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">`;
  // Moon-base zone from the challenge: >= 30 % O2 at <= 10.2 psi (70.3 kPa).
  svg += `<rect class="zone" x="${xOf(MAP.pMin)}" y="${yOf(MAP.oMax)}" width="${xOf(70.3) - xOf(MAP.pMin)}" height="${yOf(30) - yOf(MAP.oMax)}"><title>Moon base zone: ≥30 % O2 at ≤10.2 psi</title></rect>`;
  svg += `<g class="axis">`;
  for (const p of pTicks) svg += `<line class="grid-line" x1="${xOf(p)}" x2="${xOf(p)}" y1="${m.t}" y2="${h - m.b}"/><text x="${xOf(p)}" y="${h - m.b + 16}" text-anchor="middle">${p}</text>`;
  for (const o of oTicks) svg += `<line class="grid-line" x1="${m.l}" x2="${w - m.r}" y1="${yOf(o)}" y2="${yOf(o)}"/><text x="${m.l - 8}" y="${yOf(o) + 4}" text-anchor="end">${o}</text>`;
  svg += `</g><text class="axis-title" x="${(w + m.l) / 2}" y="${h - 6}" text-anchor="middle">Pressure (kPa, log scale)</text>`;
  svg += `<text class="axis-title" transform="translate(14 ${(h - m.b) / 2}) rotate(-90)" text-anchor="middle">Oxygen (% by volume)</text>`;

  const sel = state.selected;
  state.site.investigations.forEach((inv, i) => {
    inv.points.forEach((pt, j) => {
      if (!mappable(pt) || pt.p < MAP.pMin || pt.p > MAP.pMax || pt.o2 > MAP.oMax) return;
      const cls = ["pt", pt.origin === "table" ? "table" : "llm"];
      if (pt.context === "ground" || pt.context === "simulation") cls.push("ground");
      if (sel && sel !== inv.accession) cls.push("dim");
      if (sel === inv.accession) cls.push("hi");
      svg += `<circle class="${cls.join(" ")}" cx="${xOf(pt.p).toFixed(1)}" cy="${yOf(pt.o2).toFixed(1)}" r="${pt.origin === "table" ? 3.5 : 5}" data-i="${i}" data-j="${j}"/>`;
    });
  });
  for (const s of state.site.scenarios) {
    if (s.oxygen_pct > MAP.oMax) continue;
    svg += `<g class="ref${s.id === sc.id ? " active" : ""}"><circle cx="${xOf(s.pressure_kpa)}" cy="${yOf(s.oxygen_pct)}" r="7"><title>${esc(s.name)}: ${esc(s.note)}</title></circle>` +
      `<text x="${xOf(s.pressure_kpa) + 10}" y="${yOf(s.oxygen_pct) - 8}">${esc(s.name)}</text></g>`;
  }
  $("#map").innerHTML = svg + "</svg>";

  $("#legend").innerHTML = [
    ["var(--table)", "PSI test tables (measured)"],
    ["var(--llm)", "Extracted from papers (model only)"],
    ["var(--ground)", "Ground test or simulation"],
    ["var(--accent)", "Reference atmospheres · shaded: Moon base zone"],
  ].map(([c, t]) => `<li><i style="background:${c}"></i>${esc(t)}</li>`).join("") +
    (state.site.includes_psi_tables ? "" : `<li>PSI test tables not included in this public build</li>`);
}

function pointLabel(inv, pt) {
  const parts = [`<b>${esc(inv.acronym)}</b> · ${esc(pt.label || "")}`,
    `O₂ ${range(pt.o2_range)} % · ${range(pt.p_range, 0)} kPa${pt.flow_range ? ` · ${range(pt.flow_range)} cm/s` : ""}`];
  if (pt.fuel) parts.push(`Fuel: ${esc(pt.fuel)}`);
  parts.push(`${pt.origin === "table" ? "PSI test table" : "Paper / PSI text, model only"} · ${esc(pt.context)}`);
  return parts.join("<br>");
}

// ---------------------------------------------------------------- Ranking
function renderRanking() {
  const sc = scenario();
  $("#rank-hint").textContent = `Nearest tested condition to ${sc.name} (${sc.oxygen_pct} % O₂, ${sc.pressure_kpa} kPa). ${sc.note}.`;
  const rows = ranked();
  const withData = rows.filter((r) => isFinite(r.d)).slice(0, 8);
  const missing = rows.filter((r) => !isFinite(r.d)).length;
  $("#ranking").innerHTML = withData.map((r) =>
    `<li><button data-acc="${esc(r.inv.accession)}"><span class="name">${esc(r.inv.acronym)}</span>` +
    `<span class="why">Closest: ${range(r.best.o2_range)} % O₂ at ${range(r.best.p_range, 0)} kPa · ${r.n} condition${r.n > 1 ? "s" : ""} · ${esc(r.best.origin === "table" ? "measured" : "model only")}</span></button></li>`
  ).join("") + `<li class="none">${missing} investigations have no verified oxygen + pressure pair yet.</li>`;
}

// ---------------------------------------------------------------- Table
function renderTable() {
  const rows = state.site.investigations.filter(matches);
  $("#table tbody").innerHTML = rows.map((inv) => {
    const s = spans(inv);
    const status = inv.review_status === "reviewed" ? `<span class="tag reviewed">reviewed</span>` : `<span class="tag model">model only</span>`;
    return `<tr tabindex="0" data-acc="${esc(inv.accession)}">` +
      `<td><b>${esc(inv.acronym)}</b><br><span class="meta">${esc(inv.accession)}</span></td>` +
      `<td>${esc((inv.project_type || "").replace(" Investigation", ""))}</td>` +
      `<td>${(inv.fuels || []).slice(0, 3).map((f) => `<span class="tag">${esc(f)}</span>`).join("")}</td>` +
      `<td>${(inv.safety_pillars || []).map((p) => `<span class="tag">${esc(p)}</span>`).join("")}</td>` +
      `<td class="num">${range(s.o2)}</td><td class="num">${range(s.p, 0)}</td>` +
      `<td class="num">${inv.points.length}</td><td>${status}</td></tr>`;
  }).join("");
}

// ---------------------------------------------------------------- Detail drawer
function sourceLink(id, inv) {
  const src = (inv.sources || []).find((s) => s.id === id);
  if (!src || !src.url) return esc(id);
  return `<a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.title || id)}</a>`;
}

function renderDetail(inv) {
  const conds = inv.conditions || [];
  const tablePts = inv.points.filter((p) => p.origin === "table");
  $("#detail").innerHTML = `
    <p class="meta">${esc(inv.accession)} · ${esc(inv.project_type || "")} · ${esc(inv.platform || "")}</p>
    <h2>${esc(inv.acronym)}</h2>
    <p>${esc(inv.title)}</p>
    <p class="meta">${esc(inv.hardware || "")} ${inv.period && inv.period[0] ? `· ${esc(inv.period[0])} – ${esc(inv.period[1] || "")}` : ""}</p>
    <p><a href="${esc(inv.source_url)}" target="_blank" rel="noopener">Open in NASA PSI ↗</a></p>
    <p>${(inv.safety_pillars || []).map((p) => `<span class="tag">${esc(p)}</span>`).join("")}
       ${(inv.fuel_phases || []).map((p) => `<span class="tag">${esc(p)}</span>`).join("")}
       <span class="tag model">${esc(inv.review_status.replace("_", " "))}</span></p>
    ${inv.objectives ? `<details><summary>Objectives (PSI)</summary><p>${esc(inv.objectives)}</p></details>` : ""}
    ${(inv.key_findings || []).length ? `<h3>Key findings</h3><ul>${inv.key_findings.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
    <h3>Test conditions with evidence (${conds.length})</h3>
    ${conds.length ? conds.map((c) => `
      <div class="cond">
        <div><b>${esc(c.label)}</b> <span class="tag ctx-${esc(c.context || "unknown")}">${esc(c.context || "unknown")}</span></div>
        <div class="vals">${c.oxygen_pct ? `O₂ ${range([c.oxygen_pct.min, c.oxygen_pct.max])} %` : ""}
          ${c.pressure_kpa ? ` · ${range([c.pressure_kpa.min, c.pressure_kpa.max], 0)} kPa` : ""}
          ${c.flow_cm_s ? ` · ${range([c.flow_cm_s.min, c.flow_cm_s.max])} cm/s` : ""}
          ${c.fuel ? ` · ${esc(c.fuel)}` : ""}</div>
        ${(c.evidence || []).map((e) => `<blockquote>“${esc(e)}”</blockquote>`).join("")}
        <div class="meta">Source: ${sourceLink(c.source, inv)}</div>
      </div>`).join("") : `<p class="meta">No verified conditions in the PSI text or available papers.</p>`}
    ${tablePts.length ? `<h3>PSI test table</h3><p class="meta">${tablePts.length} rows parsed directly from the PSI test matrix (no AI involved).</p>` : ""}
    <h3>Sources</h3>
    <ul>${(inv.sources || []).map((s) => `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.id)}</a>` : esc(s.title || s.id)} ${s.year ? `(${esc(s.year)})` : ""}</li>`).join("")}</ul>`;
}

function select(acc) {
  state.selected = acc;
  const inv = state.site.investigations.find((i) => i.accession === acc);
  if (!inv) return closeDrawer();
  renderDetail(inv);
  $("#drawer").hidden = false;
  $("#close").focus();
  renderMap();
}

function closeDrawer() {
  $("#drawer").hidden = true;
  state.selected = null;
  renderMap();
}

// ---------------------------------------------------------------- Wiring
function renderAll() {
  renderKpis();
  renderMap();
  renderRanking();
  renderTable();
}

function wire() {
  const scSel = $("#scenario");
  scSel.innerHTML = state.site.scenarios.filter((s) => s.oxygen_pct <= MAP.oMax)
    .map((s) => `<option value="${esc(s.id)}">${esc(s.name)} · ${s.oxygen_pct} % O₂, ${s.pressure_kpa} kPa</option>`).join("");
  scSel.value = state.scenario;
  scSel.addEventListener("change", () => { state.scenario = scSel.value; renderAll(); });
  $("#search").addEventListener("input", (e) => { state.search = e.target.value; renderTable(); });
  $("#pillar").addEventListener("change", (e) => { state.pillar = e.target.value; renderTable(); });
  $("#phase").addEventListener("change", (e) => { state.phase = e.target.value; renderTable(); });

  document.addEventListener("click", (e) => {
    const target = e.target.closest("[data-acc]");
    if (target) return select(target.dataset.acc);
    const pt = e.target.closest("circle.pt");
    if (pt) return select(state.site.investigations[pt.dataset.i].accession);
  });
  $("#table").addEventListener("keydown", (e) => {
    const row = e.target.closest("tr[data-acc]");
    if (row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(row.dataset.acc); }
  });
  $("#close").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#drawer").hidden) closeDrawer(); });

  const tip = $("#tooltip");
  $("#map").addEventListener("mousemove", (e) => {
    const c = e.target.closest("circle.pt");
    if (!c) { tip.hidden = true; return; }
    const inv = state.site.investigations[c.dataset.i];
    tip.innerHTML = pointLabel(inv, inv.points[c.dataset.j]);
    tip.hidden = false;
    tip.style.left = `${Math.min(e.clientX + 14, window.innerWidth - 290)}px`;
    tip.style.top = `${e.clientY + 14}px`;
  });
  $("#map").addEventListener("mouseleave", () => { tip.hidden = true; });

  const when = new Date(state.site.generated_at).toUTCString();
  $("#provenance").textContent = `Data built ${when}. ${state.site.includes_psi_tables
    ? "Includes PSI test tables." : "PSI test tables (account-only files) are not included in this public build."}`;
}

fetch("data/site.json")
  .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
  .then((site) => { state.site = site; wire(); renderAll(); })
  .catch((err) => {
    $("main").innerHTML = `<section class="card"><h2>Could not load data</h2><p class="hint">${esc(err.message)}. ` +
      `Build it with <code>python3 -m pipeline.build.site_data</code> and serve the <code>web/</code> folder.</p></section>`;
  });
