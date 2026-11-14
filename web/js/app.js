(function () {
  "use strict";
  const D = window.FIRE_DATA;
  const EX = D.experiments;
  const byId = Object.fromEntries(EX.map(e => [e.id, e]));
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const nf = (n, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const nfa = n => nf(n, Number.isInteger(n) ? 0 : 1);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const PHASE = { solid: "Solid", liquid: "Liquid", gas: "Gas", smoke: "Smoke", dust: "Dust" };
  const PILLAR = { prevention: "Prevention", detection: "Detection", suppression: "Suppression", fundamental: "Fundamental" };
  const VIEWS = { overview: "Overview", investigations: "Investigations", scenario: "Scenario ranking", coverage: "O₂ · pressure coverage", compare: "Compare", energy: "Onboard energy and mass", models: "Model benchmark", quality: "Completeness and sources", glossary: "Glossary", ask: "Ask the data" };

  /* ───────── Persistent state (local convenience only) ───────── */
  const store = {
    get() { try { return JSON.parse(localStorage.getItem("ff-dash-v3") || "{}"); } catch { return {}; } },
    set(v) { try { localStorage.setItem("ff-dash-v3", JSON.stringify(v)); } catch {} }
  };
  const saved = store.get();
  const S = {
    scn: saved.scn || "moon",
    o2: saved.o2 ?? D.scenarios.moon.o2, psi: saved.psi ?? D.scenarios.moon.psi, g: saved.g ?? D.scenarios.moon.g,
    pil: new Set(saved.pil || ["prevention", "detection", "suppression"]),
    phases: new Set(saved.phases || Object.keys(PHASE)),
    w: saved.w || { c: 4, p: 3, r: 2, g: 1 },
    cmp: new Set((saved.cmp || ["psi-20", "psi-69", "psi-25"]).filter(id => byId[id])),
    collapsed: !!saved.collapsed
  };
  const persist = () => store.set({ scn: S.scn, o2: S.o2, psi: S.psi, g: S.g, pil: [...S.pil], phases: [...S.phases], w: S.w, cmp: [...S.cmp], collapsed: S.collapsed });

  /* ───────── Formatting ───────── */
  function fmtRange(r, unit = "") {
    if (!r) return null;
    return (r.min === r.max ? nfa(r.min) : `${nfa(r.min)}–${nfa(r.max)}`) + unit;
  }
  const fmtO2 = e => !e.o2 ? null : (e.o2.vals ? e.o2.vals.map(nfa).join(" · ") : fmtRange(e.o2)) + (e.o2.extra ? ` (→ ${e.o2.extra})` : "");
  const cell = (v, inf) => v == null ? `<span class="na">—</span>` : inf ? `<span class="inf" title="Inferred: ISS cabin air">≈ ${v}</span>` : v;

  /* ───────── Glossary: terms with tooltip ───────── */
  const GL = Object.fromEntries(D.glossary.map(([t, , d]) => [t, d]));
  const abbrTerms = D.glossary.map(g => g[0]).filter(t => /^[A-Zµφ][A-Z0-9-]*$/.test(t) || ["SIBAL", "PTFE", "Kapton", "Nomex", "Pyrell", "P-Trak", "Cygnus", "µg"].includes(t));
  const abbrRe = new RegExp(`(^|[^\\wÀ-ÿ-])(${abbrTerms.sort((a, b) => b.length - a.length).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=$|[^\\wÀ-ÿ-])`, "g");
  const gl = txt => txt == null ? txt : String(txt).replace(abbrRe, (m, pre, t) => `${pre}<abbr title="${esc(GL[t])}">${t}</abbr>`);
  const pill = p => `<span class="pill pil-${p}">${PILLAR[p]}</span>`;

  /* ───────── Completeness ───────── */
  // Computed once in pipeline/build/site_data.py (also used by the assistant); here only labelled.
  const FIELD_LABELS = { o2: "O₂", pressure: "Pressure", flow: "Flow", fuel: "Fuel", period: "Period", test_table: "Test table", paper_findings: "Paper findings", linked_source: "Linked source" };
  const FIELDS = Object.keys(EX[0]?.completeness?.fields || FIELD_LABELS).map(k => [FIELD_LABELS[k] || k, k]);
  EX.forEach(e => {
    e._st = FIELDS.map(([, k]) => e.completeness.fields[k] ? "f" : "");
    e._compl = e.completeness.share;
  });
  const complBar = e => `<span class="compl"><i style="width:${Math.round(e._compl * 100)}%"></i></span>${Math.round(e._compl * 100)}`;
  const relDots = n => `<span class="rel" title="Evidence ${n}/3">${[1, 2, 3].map(i => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span>`;

  /* ───────── Scenario scoring ───────── */
  const distTo = (v, r) => v < r.min ? r.min - v : v > r.max ? v - r.max : 0;
  // Distance to the closest tested point with both O₂ and pressure; O₂ range only otherwise.
  function condDist(e) {
    let best = null;
    for (const p of e.pts) {
      const dO = Math.abs(S.o2 - p.o2), dP = Math.abs(S.psi - p.psi), d = Math.hypot(dO / 15, dP / 6);
      if (!best || d < best.d) best = { dO, dP, d };
    }
    if (best) return best;
    return e.o2 ? { dO: distTo(S.o2, e.o2), dP: null, d: null } : null;
  }
  const inZone = e => e.pts.some(p => p.o2 >= D.lunarZone.o2min && p.psi <= D.lunarZone.psimax);
  function score(e) {
    const cd = condDist(e);
    let c, cWhy;
    if (!cd) { c = 0; cWhy = "no O₂/p"; }
    else if (cd.dP == null) { c = 0.6 * Math.exp(-cd.dO / 15); cWhy = `ΔO₂ ${nfa(cd.dO)} pt · p n/a`; }
    else { c = Math.exp(-cd.d); cWhy = `ΔO₂ ${nfa(cd.dO)} pt · Δp ${nf(cd.dP, 1)} psi`; }
    const match = e.pillars.filter(x => S.pil.has(x));
    const p = match.length / e.pillars.length;
    const r = e.relevance / 3;
    const partial = S.g > 0.05 && S.g < 0.9;
    const gr = e.emulatesG ? (partial ? 1 : 0.6) : 1 - Math.abs(S.g - e.g);
    const W = S.w, sw = (W.c + W.p + W.r + W.g) || 1;
    const parts = { c: W.c * c / sw, p: W.p * p / sw, r: W.r * r / sw, g: W.g * gr / sw };
    const why = [cWhy, match.length ? `pillar ${match.map(x => PILLAR[x].toLowerCase()).join("/")}` : "pillar not prioritized", e.emulatesG && partial ? "emulates partial g" : null].filter(Boolean).join(" · ");
    return { total: parts.c + parts.p + parts.r + parts.g, parts, why, out: !S.phases.has(e.phase) };
  }
  const ranked = () => EX.map(e => ({ e, s: score(e) })).sort((a, b) => (a.s.out - b.s.out) || b.s.total - a.s.total);
  const stackbar = s => `<div class="stackbar">${["c", "p", "r", "g"].map(k => `<i class="${k}" style="width:${(s.parts[k] * 100).toFixed(1)}%"></i>`).join("")}</div>`;

  /* ───────── O₂ / pressure chart ───────── */
  const PALETTE = ["#6cb6ff", "#f2c37a", "#5fd4a8", "#ff8f7e", "#b39dff", "#8fe3dc", "#e58fd1", "#c9d36a"];
  function gapChart(host, opt = {}) {
    const Z = D.lunarZone;
    const cloud = EX.filter(e => e.pts.length).sort((a, b) => b.pts.length - a.pts.length);
    const strip = EX.filter(e => e.o2 && !e.pts.length);
    const pRaw = Math.max(S.psi, ...cloud.flatMap(e => e.pts.map(p => p.psi)));
    const pStep = pRaw > 56 ? 16 : 8, pMax = Math.max(48, Math.ceil(pRaw / pStep) * pStep);
    const oMax = Math.max(50, Math.ceil(Math.max(S.o2, ...EX.filter(e => e.o2).map(e => e.o2.max)) / 10) * 10);
    const rowH = 16, W = 720, ph = opt.mini ? 290 : 350;
    const m = { l: 44, r: 12, t: 12, b: 60 + strip.length * rowH };
    const pw = W - m.l - m.r, H = m.t + ph + m.b;
    const X = o => m.l + (o / oMax) * pw, Y = p => m.t + ph - (p / pMax) * ph;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tested conditions: oxygen versus pressure">`;
    s += `<g class="grid">`;
    for (let o = 0; o <= oMax; o += 10) s += `<line x1="${X(o)}" x2="${X(o)}" y1="${m.t}" y2="${m.t + ph}"/>`;
    for (let p = 0; p <= pMax; p += pStep) s += `<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(p)}" y2="${Y(p)}"/>`;
    s += `</g>`;
    for (let o = 0; o <= oMax; o += 10) s += `<text class="ax" x="${X(o)}" y="${m.t + ph + 14}" text-anchor="middle">${o}</text>`;
    for (let p = 0; p <= pMax; p += pStep) s += `<text class="ax" x="${m.l - 8}" y="${Y(p) + 3}" text-anchor="end">${p}</text>`;
    s += `<text class="ttl" x="${m.l + pw}" y="${m.t + ph + 30}" text-anchor="end">O₂ (% vol)</text>`;
    s += `<text class="ttl" transform="translate(12 ${m.t}) rotate(-90)" text-anchor="end">p (psi)</text>`;
    s += `<line class="ref" x1="${m.l}" x2="${m.l + pw}" y1="${Y(14.7)}" y2="${Y(14.7)}"/><text class="ax halo" x="${m.l + pw - 4}" y="${Y(14.7) - 5}" text-anchor="end">1 atm</text>`;
    s += `<rect class="zone" x="${X(Z.o2min)}" y="${Y(Z.psimax)}" width="${X(oMax) - X(Z.o2min)}" height="${Y(0) - Y(Z.psimax)}"/>`;
    s += `<text class="zlab halo" x="${X(oMax) - 6}" y="${Y(0) - 8}" text-anchor="end">Moon / rover · ≥ ${Z.o2min} % · ≤ ${nf(Z.psimax, 1)} psi</text>`;

    // Tested points: filled = PSI test table, ring = extracted from a paper.
    const color = {};
    cloud.forEach((e, i) => color[e.id] = PALETTE[i % PALETTE.length]);
    cloud.forEach(e => {
      const pts = e.pts.filter(p => opt.showLlm !== false || p.origin !== "llm");
      if (!pts.length) return;
      const c = color[e.id];
      s += `<g class="mk" data-id="${e.id}"><title>${esc(e.name)}: ${e.pts.length} points · O₂ ${fmtRange(e.o2)} % · p ${fmtRange(e.psi)} psi</title>` +
        pts.map(p => `<circle class="pt${p.origin === "llm" ? " llm" : ""}" cx="${X(p.o2).toFixed(1)}" cy="${Y(p.psi).toFixed(1)}" r="${p.origin === "llm" ? 4.5 : 3.2}" style="${p.origin === "llm" ? `stroke:${c}` : `fill:${c}`}"/>`).join("") + `</g>`;
    });
    // Bottom strip: O₂ known, pressure not reported together with it
    const sy0 = m.t + ph + 44;
    if (strip.length) {
      s += `<rect class="strip" x="${m.l}" y="${sy0 - 4}" width="${pw}" height="${strip.length * rowH + 12}" rx="4"/>`;
      s += `<text class="ax" x="${m.l}" y="${sy0 - 10}">O₂ without pressure</text>`;
    }
    strip.forEach((e, i) => {
      const y = sy0 + 6 + i * rowH;
      let g = `<g class="mk" data-id="${e.id}"><title>${esc(e.name)}: ${fmtO2(e)} % O₂, pressure not reported with it</title>`;
      g += `<line x1="${X(e.o2.min)}" x2="${X(e.o2.max)}" y1="${y}" y2="${y}"/>`;
      (e.o2.vals || []).forEach(v => g += `<circle cx="${X(v)}" cy="${y}" r="3.5"/>`);
      g += `<text class="lbl" x="${X(e.o2.max) + 8}" y="${y + 3}">${esc(e.name)}</text></g>`;
      s += g;
    });
    if (opt.showScn !== false) {
      s += `<g class="scn"><line x1="${X(S.o2)}" x2="${X(S.o2)}" y1="${m.t}" y2="${m.t + ph}"/><line x1="${m.l}" x2="${m.l + pw}" y1="${Y(S.psi)}" y2="${Y(S.psi)}"/><circle cx="${X(S.o2)}" cy="${Y(S.psi)}" r="4.5"/></g>`;
      s += `<text class="lbl halo" x="${X(S.o2) + 8}" y="${Y(S.psi) - 8}">scenario</text>`;
    }
    const legend = cloud.map(e => `<button data-open="${e.id}"><i style="background:${color[e.id]}"></i>${esc(e.name)} <span class="muted">${e.pts.length}</span></button>`).join("") +
      `<span class="muted"><i class="ring"></i>from paper</span>`;
    host.innerHTML = s + `</svg><div class="chart-legend">${legend}</div>`;
  }
  document.addEventListener("click", e => {
    const mk = e.target.closest(".chart .mk");
    if (mk) openDrawer(mk.dataset.id);
  });

  /* ───────── Sidebar and scenario ───────── */
  const app = $("#app");
  app.classList.toggle("collapsed", S.collapsed);
  $("#collapse").addEventListener("click", () => { S.collapsed = !S.collapsed; app.classList.toggle("collapsed", S.collapsed); persist(); });
  $("#menu").addEventListener("click", () => { app.classList.add("nav-open"); $("#scrim").hidden = false; });
  $("#scrim").addEventListener("click", closeNav);
  function closeNav() { app.classList.remove("nav-open"); $("#scrim").hidden = true; }

  function setScenario(key) {
    S.scn = key;
    if (key !== "custom") Object.assign(S, { o2: D.scenarios[key].o2, psi: D.scenarios[key].psi, g: D.scenarios[key].g });
    syncScenario();
  }
  function syncScenario() {
    $("#scnSelect").value = S.scn;
    $("#sO2").textContent = nfa(S.o2) + " %";
    $("#sP").textContent = nf(S.psi, 1);
    $("#sG").textContent = nf(S.g, 2);
    $("#pO2").value = S.o2; $("#pP").value = S.psi; $("#pG").value = S.g;
    $("#vO2").textContent = nfa(S.o2) + " %";
    $("#vP").textContent = nf(S.psi, 1) + " psi";
    $("#vG").textContent = nf(S.g, 2) + " g";
    $$("#scnSeg button").forEach(b => b.classList.toggle("on", b.dataset.v === S.scn));
    $("#scnNote").textContent = S.scn === "custom" ? "Custom scenario." : D.scenarios[S.scn].note;
    $$("input[type=range]").forEach(paintRange);
    persist();
    renderScenarioDependent();
  }
  $("#scnSelect").addEventListener("change", e => setScenario(e.target.value));
  $$("#scnSeg button").forEach(b => b.addEventListener("click", () => setScenario(b.dataset.v)));
  [["pO2", "o2"], ["pP", "psi"], ["pG", "g"]].forEach(([id, k]) => $("#" + id).addEventListener("input", e => { S[k] = +e.target.value; S.scn = "custom"; syncScenario(); }));
  function toggleTags(sel, set) {
    $$(sel + " button").forEach(b => {
      b.classList.toggle("on", set.has(b.dataset.v));
      b.addEventListener("click", () => { set.has(b.dataset.v) ? set.delete(b.dataset.v) : set.add(b.dataset.v); b.classList.toggle("on"); persist(); renderScenarioDependent(); });
    });
  }
  toggleTags("#pPillar", S.pil);
  toggleTags("#pPhase", S.phases);
  [["wC", "c"], ["wP", "p"], ["wR", "r"], ["wG", "g"]].forEach(([id, k]) => {
    const el = $("#" + id); el.value = S.w[k];
    const out = () => $("#v" + id).textContent = S.w[k];
    out();
    el.addEventListener("input", () => { S.w[k] = +el.value; out(); persist(); renderScenarioDependent(); });
  });

  function paintRange(el) { el.style.setProperty("--p", (el.value - el.min) / (el.max - el.min) * 100 + "%"); }
  document.addEventListener("input", e => { if (e.target.type === "range") paintRange(e.target); });

  function renderScenarioDependent() {
    renderRanking(); renderTop5(); renderCoverage();
    gapChart($("#miniGap"), { mini: true });
    if (current) openDrawer(current, true);
    if (view === "compare") renderCompare();
  }

  /* ───────── Router ───────── */
  let view = "overview";
  function go(v) { if (location.hash !== "#/" + v) location.hash = "#/" + v; else route(); }
  function route() {
    const v = (location.hash.match(/^#\/(\w+)/) || [])[1];
    view = VIEWS[v] ? v : "overview";
    $$(".view").forEach(s => s.classList.toggle("on", s.dataset.view === view));
    $$(".side-nav a").forEach(a => a.classList.toggle("active", a.dataset.view === view));
    $("#crumb").textContent = VIEWS[view];
    document.title = VIEWS[view] + " · Flame in Freefall";
    if (view === "compare") renderCompare();
    if (view === "energy") renderEnergy();
    closeNav();
    window.scrollTo(0, 0);
  }
  addEventListener("hashchange", route);

  /* ───────── Overview ───────── */
  function renderOverview() {
    const flight = EX.filter(e => e.platform !== "Ground").length;
    const both = EX.filter(e => e.pts.length).length;
    const nPts = EX.reduce((a, e) => a + e.pts.length, 0);
    const zone = EX.filter(inZone).length;
    const tests = EX.reduce((a, e) => a + e.tests, 0);
    const compl = EX.reduce((a, e) => a + e._compl, 0) / EX.length;
    const unreviewed = EX.filter(e => e.review === "model_only").length;
    $("#kpis").innerHTML = [
      ["Investigations", EX.length, "", `${flight} in flight · ${EX.length - flight} on ground`],
      ["O₂ and p measured", both, ` / ${EX.length}`, `${nf(nPts)} distinct test points`],
      ["In lunar zone", zone, "", "≥ 30 % O₂ and ≤ 10.2 psi", true],
      ["Test records", nf(tests), "", `from ${EX.filter(e => e.tests).length} PSI test tables`],
      ["Mean completeness", Math.round(compl * 100), " %", `${unreviewed} LLM extractions not yet reviewed`]
    ].map(([k, v, u, d, al]) => `<div class="kpi${al ? " alert" : ""}"><p class="kk">${k}</p><p class="v">${v}<small>${u}</small></p><p class="d">${d}</p></div>`).join("");

    const barsOf = (host, groups, kind) => {
      const max = Math.max(...groups.map(g => g[2]));
      $(host).innerHTML = groups.map(([key, label, n]) =>
        `<button class="bar-row" data-k="${kind}" data-v="${esc(key)}"><span class="t">${label}</span><span class="b"><i style="width:${n / max * 100}%;${kind === "pillar" ? `background:var(--pil-${key})` : ""}"></i></span><span class="n">${n}</span></button>`).join("");
    };
    barsOf("#byPillar", Object.entries(PILLAR).map(([k, l]) => [k, l, EX.filter(e => e.pillars.includes(k)).length]), "pillar");
    barsOf("#byPhase", Object.entries(PHASE).map(([k, l]) => [k, l, EX.filter(e => e.phase === k).length]), "phase");
    const plats = [...new Set(EX.map(e => e.platform))];
    barsOf("#byPlat", plats.map(p => [p, p, EX.filter(e => e.platform === p).length]).sort((a, b) => b[2] - a[2]), "plat");

    const rows = EX.flatMap(e => e.findings.slice(0, 2).map(f => [e, ...f]));
    $("#keyResults").innerHTML = `<thead><tr><th>Investigation</th><th>Finding</th><th>Source</th></tr></thead><tbody>` +
      rows.map(([e, t, l, u]) => `<tr><td><a class="row-link" href="#" data-open="${e.id}">${esc(e.name)}</a></td><td>${gl(esc(t))}</td><td class="mono small">${srcLink(l, u)}</td></tr>`).join("") + `</tbody>`;
  }
  document.addEventListener("click", e => {
    const b = e.target.closest(".bar-row");
    if (!b) return;
    resetTable();
    if (b.dataset.k === "plat") { T.q = b.dataset.v; $("#tsearch").value = b.dataset.v; }
    else setSeg(b.dataset.k === "phase" ? "#fPhase" : "#fPillar", b.dataset.v);
    go("investigations"); renderTable();
  });
  function renderTop5() {
    $("#topScn").textContent = S.scn === "custom" ? "custom" : D.scenarios[S.scn].name;
    $("#top5").innerHTML = ranked().slice(0, 5).map(({ e, s }, i) =>
      `<li data-open="${e.id}"><span class="r">${String(i + 1).padStart(2, "0")}</span><span><b>${e.name}</b><small>${s.why}</small></span>${stackbar(s)}<span class="s">${Math.round(s.total * 100)}</span></li>`).join("");
  }

  /* ───────── Investigations table ───────── */
  const T = { phase: "", pillar: "", cond: false, q: "", sort: "relevance", dir: -1 };
  function setSeg(sel, v) {
    $$(sel + " button").forEach(b => b.classList.toggle("on", b.dataset.v === v));
    if (sel === "#fPhase") T.phase = v; else T.pillar = v;
  }
  function resetTable() { T.q = ""; T.cond = false; $("#tsearch").value = ""; $("#fCond").checked = false; setSeg("#fPhase", ""); setSeg("#fPillar", ""); }
  $$("#fPhase button").forEach(b => b.addEventListener("click", () => { setSeg("#fPhase", b.dataset.v); renderTable(); }));
  $$("#fPillar button").forEach(b => b.addEventListener("click", () => { setSeg("#fPillar", b.dataset.v); renderTable(); }));
  $("#fCond").addEventListener("change", e => { T.cond = e.target.checked; renderTable(); });
  $("#tsearch").addEventListener("input", e => { T.q = e.target.value; renderTable(); });
  $$("#invTable th[data-sort]").forEach(th => th.addEventListener("click", () => {
    const k = th.dataset.sort;
    T.dir = T.sort === k ? -T.dir : (["name", "platform", "phase"].includes(k) ? 1 : -1);
    T.sort = k; renderTable();
  }));
  const hay = e => [e.accession, e.name, e.longName, e.platform, e.group, e.fuel, e.finding, PHASE[e.phase], ...e.pillars.map(p => PILLAR[p])].join(" ").toLowerCase();
  const srcLink = (l, u) => u ? `<a href="${u}" target="_blank" rel="noopener">${esc(l)} ↗</a>` : esc(l);
  const sortKey = (e, k) => ({
    name: e.name, platform: e.platform, phase: e.phase, period: e.period || "",
    o2: e.o2 ? e.o2.max : -1, psi: e.psi ? e.psi.max : -1, flow: e.flow ? e.flow.max : -1,
    compl: e._compl, relevance: e.relevance + e._compl / 10
  })[k];
  function filtered() {
    const q = T.q.trim().toLowerCase();
    return EX.filter(e => (!T.phase || e.phase === T.phase) && (!T.pillar || e.pillars.includes(T.pillar)) && (!T.cond || e.o2) && (!q || hay(e).includes(q)))
      .sort((a, b) => { const x = sortKey(a, T.sort), y = sortKey(b, T.sort); return (x > y ? 1 : x < y ? -1 : 0) * T.dir; });
  }
  function renderTable() {
    const rows = filtered();
    $$("#invTable th[data-sort]").forEach(th => {
      th.classList.remove("asc", "desc");
      if (th.dataset.sort === T.sort) th.classList.add(T.dir > 0 ? "asc" : "desc");
    });
    $("#rowCount").textContent = `${rows.length} of ${EX.length}`;
    $("#invTable tbody").innerHTML = rows.map(e => `
      <tr data-open="${e.id}" class="${S.cmp.has(e.id) ? "sel" : ""}">
        <td class="c-chk"><input type="checkbox" data-cmp="${e.id}" ${S.cmp.has(e.id) ? "checked" : ""} aria-label="Compare ${e.name}"></td>
        <td class="name"><b>${esc(e.name)}${e.pending ? ` <span class="pill pend">pending</span>` : ""}</b><small>${e.accession} · ${esc(e.longName)}</small></td>
        <td>${gl(e.platform)}</td>
        <td>${PHASE[e.phase]}</td>
        <td>${e.pillars.map(pill).join("")}</td>
        <td class="num">${cell(fmtO2(e))}</td>
        <td class="num">${cell(fmtRange(e.psi))}</td>
        <td class="num">${cell(fmtRange(e.flow))}</td>
        <td class="mono">${cell(e.period)}</td>
        <td class="num">${complBar(e)}</td>
        <td class="num">${relDots(e.relevance)}</td>
      </tr>`).join("") || `<tr><td colspan="11" class="empty">No results with these filters.</td></tr>`;
  }
  $("#invTable").addEventListener("change", e => { const id = e.target.dataset.cmp; if (id) toggleCmp(id); });
  $("#exportCsv").addEventListener("click", () => {
    const head = ["accession", "name", "platform", "phase", "pillars", "o2_min", "o2_max", "psi_min", "psi_max", "flow_min_cm_s", "flow_max_cm_s", "test_records", "points_o2_p", "period", "evidence", "completeness", "sources"];
    const q = v => v == null ? "" : /[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v;
    const lines = filtered().map(e => [e.accession, e.name, e.platform, e.phase, e.pillars.join("|"), e.o2?.min, e.o2?.max, e.psi?.min, e.psi?.max, e.flow?.min, e.flow?.max, e.tests, e.pts.length, e.period, e.relevance, e._compl.toFixed(2), e.sources.map(f => f[1] || f[0]).join(" | ")].map(q).join(","));
    const blob = new Blob([head.join(",") + "\n" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "flame-in-freefall-investigations.csv" });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("CSV exported");
  });

  /* ───────── Ranking ───────── */
  function renderRanking() {
    $("#ranking").innerHTML = ranked().map(({ e, s }) => `
      <li data-open="${e.id}" class="${s.out ? "out" : ""}">
        <span class="nm"><b>${e.name}</b><small>${PHASE[e.phase]} · ${e.platform}</small></span>
        <span class="stackwrap">${stackbar(s)}<p class="why">${s.why}</p></span>
        <span class="s">${Math.round(s.total * 100)}</span>
      </li>`).join("");
  }

  /* ───────── Coverage ───────── */
  function renderCoverage() {
    gapChart($("#bigGap"), { showLlm: $("#showLlm").checked, showScn: $("#showScn").checked });
    const rows = EX.filter(e => e.o2).map(e => ({ e, c: condDist(e) }))
      .sort((a, b) => (a.c.d ?? 99 + a.c.dO) - (b.c.d ?? 99 + b.c.dO));
    $("#nearest").innerHTML = `<thead><tr><th>Investigation</th><th class="num">ΔO₂</th><th class="num">Δp</th><th class="num">d</th></tr></thead><tbody>` +
      rows.map(({ e, c }) => `<tr><td><a class="row-link" href="#" data-open="${e.id}">${esc(e.name)}</a></td><td class="num">${nfa(c.dO)}</td><td class="num">${c.dP == null ? `<span class="na">n/a</span>` : nf(c.dP, 1)}</td><td class="num">${c.d == null ? `<span class="na">—</span>` : nf(c.d, 2)}</td></tr>`).join("") + `</tbody>`;
    const Z = D.lunarZone, zone = EX.filter(inZone);
    const rich = EX.flatMap(e => e.pts.filter(p => p.o2 >= Z.o2min).map(p => ({ e, p }))).sort((a, b) => a.p.psi - b.p.psi)[0];
    const noP = EX.filter(e => e.o2 && e.o2.max >= Z.o2min && !e.pts.some(p => p.o2 >= Z.o2min));
    $("#gapCallout").innerHTML = `<b>${zone.length} investigation${zone.length === 1 ? "" : "s"}</b> with a test in the lunar zone${zone.length ? ` (${zone.map(e => esc(e.name)).join(", ")})` : ""}. ` +
      (rich ? `Lowest pressure tested at ≥ ${Z.o2min} % O₂: ${nf(rich.p.psi, 1)} psi (${esc(rich.e.name)}, ${nfa(rich.p.o2)} % O₂) vs. ≤ ${nf(Z.psimax, 1)} psi required. ` : `No test at ≥ ${Z.o2min} % O₂ reports pressure. `) +
      (noP.length ? `${noP.map(e => esc(e.name)).join(", ")} reach${noP.length === 1 ? "es" : ""} ≥ ${Z.o2min} % O₂ without pressure in the parsed data: candidates to confirm in PSI. ` : "") +
      `${EX.filter(e => !e.o2).length} investigations with no O₂ data.`;
  }
  $("#showLlm").addEventListener("change", renderCoverage);
  $("#showScn").addEventListener("change", renderCoverage);

  /* ───────── Compare ───────── */
  function toggleCmp(id) {
    S.cmp.has(id) ? S.cmp.delete(id) : S.cmp.add(id);
    persist(); updateCmpBadge();
    if (view === "investigations") renderTable();
    if (view === "compare") renderCompare();
    if (current === id) openDrawer(id, true);
  }
  function updateCmpBadge() { const b = $("#cmpCount"); b.textContent = S.cmp.size; b.hidden = !S.cmp.size; }
  function renderCompare() {
    const list = [...S.cmp].map(id => byId[id]).filter(Boolean);
    $("#cmpAdd").innerHTML = `<option value="">+ Add investigation…</option>` + EX.filter(e => !S.cmp.has(e.id)).map(e => `<option value="${e.id}">${esc(e.name)} · ${e.accession}</option>`).join("");
    if (!list.length) { $("#cmpWrap").innerHTML = `<div class="empty">Tick investigations in the table or add them from the selector.</div>`; return; }
    const rows = [
      ["Scenario score", e => `<span class="mono">${Math.round(score(e).total * 100)}</span>`],
      ["Accession", e => e.accession], ["Platform", e => e.platform], ["Group", e => e.group], ["Period", e => e.period],
      ["Phase", e => PHASE[e.phase]], ["Pillars", e => e.pillars.map(pill).join("")],
      ["Fuel", e => e.fuel && esc(e.fuel)],
      ["O₂ (%)", e => fmtO2(e)],
      ["Pressure (psi)", e => fmtRange(e.psi)],
      ["Flow (cm/s)", e => fmtRange(e.flow)],
      ["Test records", e => e.tests || null], ["Points with O₂ and p", e => e.pts.length || null],
      ["Paper findings", e => e.findings.length ? e.findings.map(([t]) => esc(t)).join("<br><br>") : null],
      ["Completeness", e => complBar(e)], ["Evidence", e => relDots(e.relevance)]
    ];
    const diff = $("#cmpDiff").checked;
    const body = rows.map(([k, fn]) => {
      const vals = list.map(e => fn(e) ?? null);
      if (diff && list.length > 1 && vals.every(v => v === vals[0])) return "";
      return `<tr><td>${k}</td>${vals.map(v => `<td>${v == null || v === "" ? `<span class="na">—</span>` : v}</td>`).join("")}</tr>`;
    }).join("");
    $("#cmpWrap").innerHTML = `<table class="tbl cmp"><thead><tr><th></th>${list.map(e => `<th>${e.name}<button class="x" data-rm="${e.id}" aria-label="Remove ${e.name}">×</button></th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
  }
  $("#cmpAdd").addEventListener("change", e => { if (e.target.value) toggleCmp(e.target.value); });
  $("#cmpDiff").addEventListener("change", renderCompare);
  $("#cmpClear").addEventListener("click", () => { S.cmp.clear(); persist(); updateCmpBadge(); renderCompare(); });
  $("#cmpWrap").addEventListener("click", e => { const b = e.target.closest("[data-rm]"); if (b) toggleCmp(b.dataset.rm); });

  /* ───────── Energy ───────── */
  let model = D.models[1];
  $("#eModel").innerHTML = D.models.map(m => `<button data-v="${m.id}" title="${nf(m.sec, 1)} s per document">${m.name.replace("Mistral ", "")}</button>`).join("");
  $$("#eModel button").forEach(b => b.addEventListener("click", () => { model = D.models.find(m => m.id === b.dataset.v); renderEnergy(); }));
  // Assistant answers: time measured by pipeline.ask.demo on the team machine (fallback if not published).
  const ASK = D.site && D.site.ask ? { sec: D.site.ask.median_seconds, model: D.site.ask.model, measured: true } : { sec: 9, model: "mistral-nemo", measured: false };
  ["eActive", "eIdle", "eAsk", "eQueries", "eNight", "eDens", "eMargin", "eSleep"].forEach(id => $("#" + id).addEventListener("input", renderEnergy));
  const val = id => +$("#" + id).value;
  const fmtWh = wh => wh >= 1000 ? nf(wh / 1000, 2) + " kWh" : wh >= 10 ? nf(wh, 0) + " Wh" : nf(wh, 2) + " Wh";
  // q: assistant questions per day; documents extracted per day come from their own slider.
  function energy(sleep, q = val("eAsk")) {
    const perAsk = val("eActive") * ASK.sec / 3600, perDoc = val("eActive") * model.sec / 3600;
    const docs = val("eQueries");
    const busy = Math.min(24, (q * ASK.sec + docs * model.sec) / 3600);
    const dayAsk = perAsk * q, dayDoc = perDoc * docs;
    const dayQ = dayAsk + dayDoc, dayI = (sleep ? 1 : val("eIdle")) * (24 - busy);
    const night = (dayQ + dayI) * val("eNight");
    return { perAsk, perDoc, dayAsk, dayDoc, dayQ, dayI, day: dayQ + dayI, night, busy, kg: night / val("eDens") * (1 + val("eMargin") / 100) };
  }
  const kgFmt = k => nf(k, k < 10 ? 1 : 0);
  function renderEnergy() {
    $$("#eModel button").forEach(b => b.classList.toggle("on", b.dataset.v === model.id));
    $("#oActive").textContent = val("eActive") + " W";
    $("#oIdle").textContent = val("eIdle") + " W";
    $("#oQueries").textContent = val("eQueries");
    $("#oAsk").textContent = val("eAsk");
    $("#oNight").textContent = nfa(val("eNight")) + " d";
    $("#oDens").textContent = val("eDens") + " Wh/kg";
    $("#oMargin").textContent = "+" + val("eMargin") + " %";
    const sleep = $("#eSleep").checked;
    $("#eIdle").disabled = sleep;
    const r = energy(sleep), alt = energy(!sleep);
    $("#eKpis").innerHTML = [
      ["Battery mass", kgFmt(r.kg), " kg", `${sleep ? "without" : "with"} sleep: ${kgFmt(alt.kg)} kg`],
      ["Energy / day", fmtWh(r.day), "", `${nf(r.busy, 2)} h of active compute`],
      ["Energy / period", fmtWh(r.night), "", `${nfa(val("eNight"))} days without sun`],
      ["Energy / question", fmtWh(r.perAsk), "", `${ASK.model} · ${nf(ASK.sec, 1)} s ${ASK.measured ? "measured" : "est."}`]
    ].map(([k, v, u, d], i) => `<div class="kpi${i === 0 ? " alert" : ""}"><p class="kk">${k}</p><p class="v">${v}<small>${u}</small></p><p class="d">${d}</p></div>`).join("");
    const share = r.day ? r.dayQ / r.day : 0;
    $("#barQ").style.width = share * 100 + "%";
    $("#barI").style.width = (1 - share) * 100 + "%";
    $("#eNote").innerHTML = `<span style="color:var(--acc-2)">■</span> Inference ${fmtWh(r.dayQ)} (${Math.round(share * 100)} %: questions ${fmtWh(r.dayAsk)}, extraction ${fmtWh(r.dayDoc)}) · <span style="color:var(--c-pil)">■</span> Idle ${fmtWh(r.dayI)} (${Math.round((1 - share) * 100)} %). ` +
      (share < 0.3 ? "Idle dominates: the savings are in the duty cycle, not the model size." : "Inference dominates: the model's time per answer is the main lever.") +
      ` Extraction: ${model.name}, ${nf(model.sec, 1)} s per document (benchmark).`;
    $$('[data-view="energy"] input[type=range]').forEach(paintRange);
    energyChart();
  }
  function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(x || 1))); const f = x / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; }
  function energyChart() {
    const W = 640, H = 230, m = { l: 40, r: 14, t: 14, b: 30 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b, QMAX = 2000;
    const a = [], b = [];
    for (let q = 0; q <= QMAX; q += 50) { a.push([q, energy(false, q).kg]); b.push([q, energy(true, q).kg]); }
    const ymax = Math.max(...a.map(p => p[1]), ...b.map(p => p[1])) * 1.1 || 1;
    const step = niceStep(ymax / 4);
    const X = q => m.l + q / QMAX * pw, Y = k => m.t + ph - k / ymax * ph;
    const path = pts => pts.map(([q, k], i) => (i ? "L" : "M") + X(q).toFixed(1) + " " + Y(k).toFixed(1)).join("");
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Battery mass by assistant questions per day"><g class="grid">`;
    for (let k = 0; k <= ymax; k += step) s += `<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(k)}" y2="${Y(k)}"/>`;
    s += `</g>`;
    for (let k = 0; k <= ymax; k += step) s += `<text class="ax" x="${m.l - 6}" y="${Y(k) + 3}" text-anchor="end">${nfa(+k.toFixed(1))}</text>`;
    for (let q = 0; q <= QMAX; q += 500) s += `<text class="ax" x="${X(q)}" y="${H - 14}" text-anchor="middle">${q}</text>`;
    s += `<text class="ttl" x="${m.l + pw}" y="${H - 1}" text-anchor="end">questions / day</text><text class="ttl" x="${m.l - 6}" y="${m.t - 4}" text-anchor="end">kg</text>`;
    s += `<path class="l1" d="${path(a)}"/><path class="l2" d="${path(b)}"/>`;
    const q = val("eAsk"), cur = energy($("#eSleep").checked).kg;
    s += `<circle class="now" cx="${X(Math.min(q, QMAX))}" cy="${Y(cur)}" r="5"/></svg>`;
    $("#eChart").innerHTML = s;
  }

  /* ───────── Benchmark ───────── */
  function renderModels() {
    const best = Math.max(...D.models.map(m => m.ok / m.n));
    $("#modelTable").innerHTML = `<thead><tr><th>Model</th><th class="num">s / doc</th><th class="num">tok/s</th><th class="num">Memory</th><th class="num">Correct</th><th>Accuracy</th><th class="num">Wh / doc @ 30 W</th></tr></thead><tbody>` +
      D.models.map(m => {
        const acc = m.ok / m.n;
        return `<tr><td><b>${m.name}</b></td><td class="num">${nf(m.sec, 1)}</td><td class="num">${nf(m.tps, 1)}</td><td class="num">${nf(m.mem, 1)} GB</td><td class="num">${m.ok}/${m.n}</td><td><span class="compl" style="width:120px"><i style="width:${acc * 100}%;${acc === best ? "" : "opacity:.55"}"></i></span><span class="mono">${nf(acc * 100, 1)} %</span></td><td class="num">${nf(30 * m.sec / 3600, 3)}</td></tr>`;
      }).join("") + `</tbody>`;
  }

  /* ───────── Completeness and sources ───────── */
  function renderQuality() {
    const sorted = [...EX].sort((a, b) => b._compl - a._compl);
    $("#matrix").innerHTML = `<thead><tr><th></th>${FIELDS.map(f => `<th>${f[0]}</th>`).join("")}<th></th></tr></thead><tbody>` +
      sorted.map(e => `<tr><th data-open="${e.id}">${e.name}</th>${e._st.map((s, i) => `<td class="${s}" title="${e.name} · ${FIELDS[i][0]}: ${s === "f" ? "data" : s === "i" ? "inferred" : "missing"}"></td>`).join("")}<td class="pc">${Math.round(e._compl * 100)} %</td></tr>`).join("") + `</tbody>`;
    $("#srcTable").innerHTML = `<thead><tr><th>Investigation</th><th>Source</th></tr></thead><tbody>` +
      EX.flatMap(e => e.sources.map(([l, u]) => `<tr><td><a class="row-link" href="#" data-open="${e.id}">${e.name}</a></td><td>${u ? `<a href="${u}" target="_blank" rel="noopener">${l} ↗</a>` : `<span class="muted">${l} (no link)</span>`}</td></tr>`)).join("") + `</tbody>`;
  }

  /* ───────── Detail drawer ───────── */
  let current = null;
  function openDrawer(id, keep) {
    const e = byId[id]; if (!e) return;
    current = id;
    const s = score(e);
    $("#dGroup").innerHTML = gl(`${e.group} · ${e.platform}${e.period ? " · " + e.period : ""}`);
    $("#dTitle").textContent = `${e.name} · ${e.accession}`;
    $("#dSub").textContent = e.longName;
    $("#dBody").innerHTML = `
      <div class="drawer-actions">
        <button class="btn" data-cmp-toggle="${e.id}">${S.cmp.has(e.id) ? "Remove from compare" : "Add to compare"}</button>
        ${e.o2 ? `<a class="btn ghost" href="#/coverage">View in coverage</a>` : ""}
        ${e.sourceUrl ? `<a class="btn ghost" href="${e.sourceUrl}" target="_blank" rel="noopener">PSI ${e.accession} ↗</a>` : ""}
      </div>
      ${e.finding ? `<div><h4>Finding</h4><p>${gl(esc(e.finding))}</p></div>` : ""}
      <div><h4>Conditions</h4><dl class="kv">
        <dt>Phase</dt><dd>${PHASE[e.phase]}</dd>
        <dt>Fuel</dt><dd>${e.fuel ? gl(esc(e.fuel)) : cell(null)}</dd>
        <dt>O₂ (%)</dt><dd class="mono">${cell(fmtO2(e))}</dd>
        <dt>Pressure (psi)</dt><dd class="mono">${cell(fmtRange(e.psi))}</dd>
        <dt>Flow (cm/s)</dt><dd class="mono">${cell(fmtRange(e.flow))}</dd>
        <dt>Test records</dt><dd class="mono">${e.tests || cell(null)}</dd>
        <dt>Points O₂ + p</dt><dd class="mono">${e.pts.length || cell(null)}</dd>
        <dt>Pillars</dt><dd>${e.pillars.map(pill).join("")}</dd>
      </dl><p class="foot-note" style="margin-top:8px">Ranges cover every extracted point (PSI test tables and papers). ${e.review === "model_only" ? `LLM extraction${e.model ? ` (${esc(e.model)})` : ""}, not yet human-reviewed.` : ""}</p></div>
      ${e.findings.length ? `<div><h4>Findings from papers</h4><ul>${e.findings.map(([t, l, u]) => `<li>${gl(esc(t))} <span class="muted small">· ${srcLink(l, u)}</span></li>`).join("")}</ul></div>` : ""}
      ${e.objectives ? `<details><summary>PSI objectives</summary><p class="pre">${esc(e.objectives)}</p></details>` : ""}
      <div><h4>Active scenario · ${Math.round(s.total * 100)} / 100</h4>${stackbar(s)}<p class="foot-note" style="margin-top:6px">${s.why}</p></div>
      <div><h4>Completeness · ${Math.round(e._compl * 100)} %</h4><p class="foot-note">Missing: ${FIELDS.filter((f, i) => !e._st[i]).map(f => f[0]).join(", ") || "nothing"}</p></div>
      <div><h4>Sources</h4><ul>${e.sources.map(([l, u]) => `<li>${srcLink(l, u)}</li>`).join("")}</ul></div>`;
    if (!keep) { $("#drawer").hidden = false; $("#dClose").focus(); }
  }
  function closeDrawer() { $("#drawer").hidden = true; current = null; }
  $("#dClose").addEventListener("click", closeDrawer);
  $("#dBody").addEventListener("click", e => {
    const b = e.target.closest("[data-cmp-toggle]");
    if (b) toggleCmp(b.dataset.cmpToggle);
    if (e.target.closest("a[href^='#/']")) closeDrawer();
  });
  document.addEventListener("click", e => {
    if (e.target.closest("input, .x, [data-cmp-toggle]")) return;
    const o = e.target.closest("[data-open]");
    if (o) { e.preventDefault(); openDrawer(o.dataset.open); }
  });

  /* ───────── Global search ───────── */
  const gs = $("#gsearch"), gr = $("#gresults");
  let hits = [], hi = 0;
  function searchAll(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    const views = Object.entries(VIEWS).filter(([, l]) => l.toLowerCase().includes(q)).map(([k, l]) => ({ type: "view", k, label: l, meta: "view" }));
    const exps = EX.filter(e => hay(e).includes(q)).map(e => ({ type: "exp", k: e.id, label: e.name, meta: e.platform }));
    const terms = D.glossary.filter(([t, , d]) => t.toLowerCase().includes(q) || (q.length > 3 && d.toLowerCase().includes(q))).map(([t]) => ({ type: "term", k: t, label: t, meta: "glossary" }));
    return [...views, ...exps, ...terms].slice(0, 12);
  }
  function drawHits() {
    gr.hidden = !hits.length;
    gr.innerHTML = hits.map((h, i) => `<li class="${i === hi ? "hi" : ""}" data-i="${i}" role="option"><span>${esc(h.label)}</span><span>${h.meta}</span></li>`).join("");
  }
  function pick(h) {
    if (!h) return;
    if (h.type === "view") go(h.k);
    else if (h.type === "term") { G.q = h.k; $("#glSearch").value = h.k; setGlCat(""); go("glossary"); renderGlossary(); }
    else openDrawer(h.k);
    gs.value = ""; hits = []; drawHits(); gs.blur();
  }
  gs.addEventListener("input", () => { hits = searchAll(gs.value); hi = 0; drawHits(); });
  gs.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { hi = Math.min(hi + 1, hits.length - 1); drawHits(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { hi = Math.max(hi - 1, 0); drawHits(); e.preventDefault(); }
    else if (e.key === "Enter") pick(hits[hi]);
    else if (e.key === "Escape") { gs.value = ""; hits = []; drawHits(); gs.blur(); }
  });
  gr.addEventListener("mousedown", e => { const li = e.target.closest("li"); if (li) { e.preventDefault(); pick(hits[+li.dataset.i]); } });
  gs.addEventListener("blur", () => setTimeout(() => { gr.hidden = true; }, 100));

  /* ───────── Keyboard shortcuts ───────── */
  const order = Object.keys(VIEWS);
  document.addEventListener("keydown", e => {
    const a = document.activeElement;
    const typing = (a.tagName === "INPUT" && !["checkbox", "range"].includes(a.type)) || a.tagName === "SELECT" || a.tagName === "TEXTAREA";
    if (e.key === "Escape" && !$("#drawer").hidden) return closeDrawer();
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "/") { e.preventDefault(); gs.focus(); }
    else if (e.key === "[") $("#collapse").click();
    else if (/^[1-9]$/.test(e.key)) go(order[+e.key - 1]);
    else if (e.key === "0") go("ask");
  });

  /* ───────── Glossary ───────── */
  const CAT = { facility: "Facility", combustion: "Combustion", material: "Material", instrument: "Instrument", dashboard: "Dashboard" };
  const G = { cat: "", q: "" };
  function setGlCat(v) { G.cat = v; $$("#glCat button").forEach(b => b.classList.toggle("on", b.dataset.v === v)); }
  function renderGlossary() {
    const q = G.q.trim().toLowerCase();
    const items = D.glossary.filter(([t, c, d]) => (!G.cat || c === G.cat) && (!q || (t + " " + d).toLowerCase().includes(q)))
      .sort((a, b) => a[0].localeCompare(b[0], "en"));
    $("#glCount").textContent = `${items.length} of ${D.glossary.length}`;
    $("#glList").innerHTML = items.map(([t, c, d]) => {
      const used = c === "dashboard" || t.length < 3 ? [] : EX.filter(e => hay(e).includes(t.toLowerCase()) || e.platform.includes(t)).slice(0, 6);
      return `<div class="gl-item"><dt><span class="gl-t">${t}</span><span class="cat cat-${c}">${CAT[c]}</span></dt><dd>${d}${used.length ? `<span class="gl-used">${used.map(e => `<a href="#" data-open="${e.id}">${e.name}</a>`).join("")}</span>` : ""}</dd></div>`;
    }).join("") || `<div class="empty">No matching terms.</div>`;
  }
  $$("#glCat button").forEach(b => b.addEventListener("click", () => { setGlCat(b.dataset.v); renderGlossary(); }));
  $("#glSearch").addEventListener("input", e => { G.q = e.target.value; renderGlossary(); });
  renderGlossary();

  /* ───────── Ask the data ───────── */
  // Live when served by pipeline.ask.server (local Ollama); otherwise pre-computed answers from site.json.
  const README = "https://github.com/Sora-com/flame-waypoint#ask-the-data-locally";
  const DEMO = D.site && D.site.ask ? D.site.ask : null;
  const A = { live: false, model: null, busy: false };
  function citeLink(id, r) {
    const acc = /^PSI-\d+$/.test(id) && byId[id.toLowerCase()];
    if (acc) return `<a href="#" class="cite" data-open="${acc.id}">[${id}]</a>`;
    const c = (r.citations || []).find(x => x.id === id);
    return c && c.url ? `<a class="cite" href="${c.url}" target="_blank" rel="noopener">[${esc(id)}]</a>` : `<span class="cite">[${esc(id)}]</span>`;
  }
  const fmtAnswer = r => esc(r.answer)
    .replace(/\[([^\]]+)\]/g, (m, ids) => ids.split(/\s*[,;]\s*/).map(id => citeLink(id, r)).join(" "))
    .replace(/\n/g, "<br>");
  function renderAnswer(r, note) {
    const out = $("#askOut");
    out.hidden = false;
    out.className = "panel ask-out";
    const wh = val("eActive") * r.seconds / 3600;
    const flags = r.unverified || [];
    out.innerHTML = `<p class="ask-q">${esc(r.question)}</p><p class="ask-a">${fmtAnswer(r)}</p>
      ${flags.length ? `<div class="ask-warn"><b>Not found in the cited sources</b> (automatic check, treat as unverified):<ul>${flags.map(f => `<li>“${esc(f.sentence)}” <span class="mono">${f.not_in_sources.map(esc).join(", ")}</span></li>`).join("")}</ul></div>` : ""}
      <p class="ask-meta">${note} · ${esc(r.model)} · ${nf(r.seconds, 1)} s · ${r.prompt_tokens} tokens in / ${r.output_tokens} out · ≈ ${fmtWh(wh)} at ${val("eActive")} W (est., see <a href="#/energy">energy budget</a>)</p>
      ${r.citations.length ? `<ul class="ask-src">${r.citations.map(c => `<li>${c.url ? `<a href="${c.url}" target="_blank" rel="noopener">${esc(c.id)} ↗</a>` : esc(c.id)} · ${esc(c.title || "")}</li>`).join("")}</ul>` : ""}
      <details><summary>Context given to the model: computed facts + ${r.passages.length} retrieved passages</summary><ul>${r.passages.map(p => `<li><span class="mono">[${esc(p.source)}]</span> ${esc(p.text)}</li>`).join("")}</ul></details>`;
  }
  function renderAskMode() {
    const mode = $("#askMode"), input = $("#askInput");
    if (A.live) {
      mode.className = "ask-mode live"; mode.textContent = `live · ${A.model} on this computer`;
      input.disabled = $("#askBtn").disabled = false;
      input.placeholder = "Ask about the experiments, e.g. Which experiments used more than 21 % O₂?";
      $("#askHelp").innerHTML = "Answered by the local model using only this dashboard's data; every statement cites its source and nothing leaves this computer. Suggested questions:";
    } else {
      mode.className = "ask-mode demo"; mode.textContent = "pre-computed answers";
      input.disabled = $("#askBtn").disabled = true;
      input.placeholder = "Your own questions need the local assistant (see below)";
      $("#askHelp").innerHTML = DEMO
        ? `These answers were generated in advance by the same local assistant (${esc(DEMO.model)} on ${esc(DEMO.machine)}). To ask your own questions, run it on your computer: it needs Ollama and a one-time model download of about 7 GB (<a href="${README}" target="_blank" rel="noopener">instructions</a>).`
        : `The local assistant is not running. <a href="${README}" target="_blank" rel="noopener">How to run it</a>.`;
    }
    const qs = DEMO ? DEMO.answers.map(a => a.question) : [];
    $("#askChips").innerHTML = qs.map((q, i) => `<button type="button" data-q="${i}">${esc(q)}</button>`).join("");
  }
  async function askLive(question) {
    if (A.busy) return;
    A.busy = true; $("#askBtn").disabled = true;
    const out = $("#askOut"); out.hidden = false; out.className = "panel ask-out";
    out.innerHTML = `<p class="ask-q">${esc(question)}</p><p class="ask-a muted">Thinking on the local model (usually 5–15 s)…</p>`;
    try {
      const res = await fetch("api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error || res.status);
      renderAnswer(r, "live");
    } catch (err) {
      out.innerHTML = `<p class="ask-q">${esc(question)}</p><p class="ask-a">Could not get an answer: ${esc(err.message)}</p>`;
    } finally { A.busy = false; $("#askBtn").disabled = !A.live; }
  }
  $("#askForm").addEventListener("submit", e => { e.preventDefault(); const q = $("#askInput").value.trim(); if (q && A.live) askLive(q); });
  $("#askChips").addEventListener("click", e => {
    const b = e.target.closest("[data-q]"); if (!b) return;
    const a = DEMO.answers[+b.dataset.q];
    $$("#askChips button").forEach(x => x.classList.toggle("on", x === b));
    if (A.live) { $("#askInput").value = a.question; askLive(a.question); }
    else renderAnswer(a, `pre-computed ${DEMO.generated_at.slice(0, 10)}`);
  });
  fetch("api/health", { cache: "no-store" })
    .then(r => r.ok ? r.json() : null)
    .then(h => { A.live = !!(h && h.ok); A.model = h && h.model; })
    .catch(() => {})
    .finally(renderAskMode);

  /* ───────── Toast ───────── */
  let tt;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 1800); }

  /* ───────── Init ───────── */
  $("#psiCount").textContent = `PSI · ${EX.length} inv.`;
  if (D.site) $("#psiCount").title = `site.json built ${D.site.generatedAt}`;
  renderOverview();
  renderTable();
  renderModels();
  renderQuality();
  updateCmpBadge();
  syncScenario();
  renderEnergy();
  route();
})();
