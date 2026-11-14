(function () {
  "use strict";
  const D = window.FIRE_DATA;
  const EX = D.experimentos;
  const byId = Object.fromEntries(EX.map(e => [e.id, e]));
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const nf = (n, d = 0) => n.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });
  const nfa = n => nf(n, Number.isInteger(n) ? 0 : 1);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const FASE = { solido: "Sólido", liquido: "Líquido", gas: "Gas", humo: "Humo", polvo: "Polvo" };
  const PILAR = { prevencion: "Prevención", deteccion: "Detección", supresion: "Supresión", fundamental: "Fundamental" };
  const VIEWS = { resumen: "Resumen", investigaciones: "Investigaciones", escenario: "Ranking por escenario", cobertura: "Cobertura O₂ · presión", comparar: "Comparar", energia: "Energía y masa a bordo", modelos: "Benchmark de modelos", calidad: "Completitud y fuentes", glosario: "Glosario" };

  /* ───────── Estado persistente (solo comodidad local) ───────── */
  const store = {
    get() { try { return JSON.parse(localStorage.getItem("ff-dash") || "{}"); } catch { return {}; } },
    set(v) { try { localStorage.setItem("ff-dash", JSON.stringify(v)); } catch {} }
  };
  const saved = store.get();
  const S = {
    scn: saved.scn || "luna",
    o2: saved.o2 ?? D.escenarios.luna.o2, psi: saved.psi ?? D.escenarios.luna.psi, g: saved.g ?? D.escenarios.luna.g,
    pil: new Set(saved.pil || ["prevencion", "deteccion", "supresion"]),
    fases: new Set(saved.fases || Object.keys(FASE)),
    w: saved.w || { c: 4, p: 3, r: 2, g: 1 },
    cmp: new Set(saved.cmp || ["bre", "flex", "bass2"]),
    collapsed: !!saved.collapsed
  };
  const persist = () => store.set({ scn: S.scn, o2: S.o2, psi: S.psi, g: S.g, pil: [...S.pil], fases: [...S.fases], w: S.w, cmp: [...S.cmp], collapsed: S.collapsed });

  /* ───────── Formato ───────── */
  function fmtRange(r, unit = "") {
    if (!r) return null;
    return (r.min === r.max ? nfa(r.min) : `${nfa(r.min)}–${nfa(r.max)}`) + unit;
  }
  const fmtO2 = e => !e.o2 ? null : (e.o2.vals ? e.o2.vals.map(nfa).join(" · ") : fmtRange(e.o2)) + (e.o2.extra ? ` (→ ${e.o2.extra})` : "");
  const cell = (v, inf) => v == null ? `<span class="na">—</span>` : inf ? `<span class="inf" title="Inferido: aire de cabina ISS">≈ ${v}</span>` : v;

  /* ───────── Glosario: términos con tooltip ───────── */
  const GL = Object.fromEntries(D.glosario.map(([t, , d]) => [t, d]));
  const abbrTerms = D.glosario.map(g => g[0]).filter(t => /^[A-Zµφ][A-Z0-9-]*$/.test(t) || ["SIBAL", "PTFE", "Kapton", "Nomex", "Pyrell", "P-Trak", "Cygnus", "µg"].includes(t));
  const abbrRe = new RegExp(`(^|[^\\wÀ-ÿ-])(${abbrTerms.sort((a, b) => b.length - a.length).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=$|[^\\wÀ-ÿ-])`, "g");
  const gl = txt => txt == null ? txt : String(txt).replace(abbrRe, (m, pre, t) => `${pre}<abbr title="${esc(GL[t])}">${t}</abbr>`);
  const pill = p => `<span class="pill pil-${p}">${PILAR[p]}</span>`;

  /* ───────── Completitud ───────── */
  const FIELDS = [
    ["O₂", e => e.o2 ? (e.inferido ? "i" : "f") : ""],
    ["Presión", e => e.psi ? (e.inferido ? "i" : "f") : ""],
    ["Flujo", e => e.flujo ? "f" : ""],
    ["Combustible", e => e.combustible && e.combustible.length > 6 ? "f" : ""],
    ["Diluyente", e => e.diluyentes.length ? "f" : ""],
    ["Sensores", e => e.sensores.length ? "f" : ""],
    ["Periodo", e => e.periodo ? "f" : ""],
    ["Result. numéricos", e => e.resultados.length ? "f" : ""],
    ["Fuente enlazada", e => e.fuentes.some(f => f[1]) ? "f" : ""]
  ];
  EX.forEach(e => {
    e._st = FIELDS.map(([, fn]) => fn(e));
    e._compl = e._st.reduce((a, s) => a + (s === "f" ? 1 : s === "i" ? 0.5 : 0), 0) / FIELDS.length;
  });
  const complBar = e => `<span class="compl"><i style="width:${Math.round(e._compl * 100)}%"></i></span>${Math.round(e._compl * 100)}`;
  const relDots = n => `<span class="rel" title="Relevancia ${n}/3">${[1, 2, 3].map(i => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span>`;

  /* ───────── Puntuación por escenario ───────── */
  const distTo = (v, r) => v < r.min ? r.min - v : v > r.max ? v - r.max : 0;
  function condDist(e) {
    if (!e.o2) return null;
    let dO = distTo(S.o2, e.o2);
    if (e.o2.extra != null) dO = Math.min(dO, Math.abs(S.o2 - e.o2.extra));
    const dP = e.psi ? distTo(S.psi, e.psi) : null;
    return { dO, dP, d: dP == null ? null : Math.hypot(dO / 15, dP / 6) };
  }
  function score(e) {
    const cd = condDist(e);
    let c, cWhy;
    if (!cd) { c = 0; cWhy = "sin O₂/p"; }
    else if (cd.dP == null) { c = 0.6 * Math.exp(-cd.dO / 15); cWhy = `ΔO₂ ${nfa(cd.dO)} pt · p n/d`; }
    else { c = Math.exp(-cd.d) * (e.inferido ? 0.8 : 1); cWhy = `ΔO₂ ${nfa(cd.dO)} pt · Δp ${nf(cd.dP, 1)} psi${e.inferido ? " (inferido)" : ""}`; }
    const match = e.pilares.filter(x => S.pil.has(x));
    const p = match.length / e.pilares.length;
    const r = e.relevancia / 3;
    const partial = S.g > 0.05 && S.g < 0.9;
    const gr = e.emulaG ? (partial ? 1 : 0.6) : 1 - Math.abs(S.g - e.g);
    const W = S.w, sw = (W.c + W.p + W.r + W.g) || 1;
    const parts = { c: W.c * c / sw, p: W.p * p / sw, r: W.r * r / sw, g: W.g * gr / sw };
    const why = [cWhy, match.length ? `pilar ${match.map(x => PILAR[x].toLowerCase()).join("/")}` : "pilar fuera de prioridad", e.emulaG && partial ? "emula g parcial" : null].filter(Boolean).join(" · ");
    return { total: parts.c + parts.p + parts.r + parts.g, parts, why, out: !S.fases.has(e.fase) };
  }
  const ranked = () => EX.map(e => ({ e, s: score(e) })).sort((a, b) => (a.s.out - b.s.out) || b.s.total - a.s.total);
  const stackbar = s => `<div class="stackbar">${["c", "p", "r", "g"].map(k => `<i class="${k}" style="width:${(s.parts[k] * 100).toFixed(1)}%"></i>`).join("")}</div>`;

  /* ───────── Gráfica O₂ / presión ───────── */
  function gapChart(host, opt = {}) {
    const W = 720, H = opt.mini ? 400 : 470;
    const m = { l: 44, r: 12, t: 12, b: opt.mini ? 96 : 110 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const X = o => m.l + (o / 90) * pw, Y = p => m.t + ph - (p / 48) * ph;
    const Z = D.zonaLunar;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Condiciones probadas: oxígeno frente a presión">`;
    s += `<g class="grid">`;
    for (let o = 0; o <= 90; o += 10) s += `<line x1="${X(o)}" x2="${X(o)}" y1="${m.t}" y2="${m.t + ph}"/>`;
    for (let p = 0; p <= 48; p += 8) s += `<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(p)}" y2="${Y(p)}"/>`;
    s += `</g>`;
    for (let o = 0; o <= 90; o += 10) s += `<text class="ax" x="${X(o)}" y="${m.t + ph + 14}" text-anchor="middle">${o}</text>`;
    for (let p = 0; p <= 48; p += 8) s += `<text class="ax" x="${m.l - 8}" y="${Y(p) + 3}" text-anchor="end">${p}</text>`;
    s += `<text class="ttl" x="${m.l + pw}" y="${m.t + ph + 30}" text-anchor="end">O₂ (% vol)</text>`;
    s += `<text class="ttl" transform="translate(12 ${m.t}) rotate(-90)" text-anchor="end">p (psi)</text>`;
    s += `<line class="ref" x1="${m.l}" x2="${m.l + pw}" y1="${Y(14.7)}" y2="${Y(14.7)}"/><text class="ax halo" x="${m.l + pw - 4}" y="${Y(14.7) - 5}" text-anchor="end">1 atm</text>`;
    s += `<rect class="zone" x="${X(Z.o2min)}" y="${Y(Z.psimax)}" width="${X(90) - X(Z.o2min)}" height="${Y(0) - Y(Z.psimax)}"/>`;
    s += `<text class="zlab halo" x="${X(90) - 6}" y="${Y(0) - 8}" text-anchor="end">Luna / rover · ≥ ${Z.o2min} % · ≤ ${nf(Z.psimax, 1)} psi</text>`;

    const marks = [];
    const cabin = EX.filter(e => e.inferido && e.o2 && e.psi);
    EX.filter(e => e.o2 && e.psi && !e.inferido).forEach(e => {
      const pt = e.o2.min === e.o2.max && e.psi.min === e.psi.max;
      marks.push(pt
        ? `<g class="mk" data-id="${e.id}"><title>${e.nombre}</title><circle cx="${X(e.o2.min)}" cy="${Y(e.psi.min)}" r="6"/><text class="lbl halo" x="${X(e.o2.min) + 10}" y="${Y(e.psi.min) + 3}">${e.nombre}</text></g>`
        : `<g class="mk" data-id="${e.id}"><title>${e.nombre}: ${fmtO2(e)} % O₂, ${fmtRange(e.psi)} psi</title><rect x="${X(e.o2.min)}" y="${Y(e.psi.max)}" width="${X(e.o2.max) - X(e.o2.min)}" height="${Y(e.psi.min) - Y(e.psi.max)}" rx="2"/><text class="lbl halo" x="${X(e.o2.min) + 6}" y="${Y(e.psi.max) + 14}">${e.nombre}</text></g>`);
    });
    if (opt.showInf !== false && cabin.length) {
      marks.push(`<g class="mk inf" data-id="__cabin"><title>Aire de cabina ISS (inferido): ${cabin.map(e => e.nombre).join(", ")}</title><circle cx="${X(21)}" cy="${Y(14.7)}" r="8"/><text class="lbl halo" x="${X(21) + 12}" y="${Y(14.7) + 14}">≈ cabina ISS · ${cabin.length}</text></g>`);
    }
    // Franja inferior: O₂ conocido, presión no indicada
    const strip = EX.filter(e => e.o2 && !e.psi);
    const sy0 = m.t + ph + 44, rowH = 16;
    s += `<rect class="strip" x="${m.l}" y="${sy0 - 4}" width="${pw}" height="${strip.length * rowH + 12}" rx="4"/>`;
    s += `<text class="ax" x="${m.l}" y="${sy0 - 10}">p no indicada</text>`;
    strip.forEach((e, i) => {
      const y = sy0 + 6 + i * rowH;
      let g = `<g class="mk" data-id="${e.id}"><title>${e.nombre}: ${fmtO2(e)} % O₂, presión no indicada</title>`;
      g += `<line x1="${X(e.o2.min)}" x2="${X(e.o2.max)}" y1="${y}" y2="${y}"/>`;
      (e.o2.vals || []).forEach(v => g += `<circle cx="${X(v)}" cy="${y}" r="3.5"/>`);
      if (e.o2.extra) g += `<circle cx="${X(e.o2.extra)}" cy="${y}" r="3.5"/><text class="lbl" x="${X(e.o2.extra) - 8}" y="${y + 3}" text-anchor="end">${e.o2.extra} %</text>`;
      g += `<text class="lbl" x="${X(e.o2.max) + 8}" y="${y + 3}">${e.nombre}</text></g>`;
      marks.push(g);
    });
    s += marks.join("");
    if (opt.showScn !== false) {
      s += `<g class="scn"><line x1="${X(S.o2)}" x2="${X(S.o2)}" y1="${m.t}" y2="${m.t + ph}"/><line x1="${m.l}" x2="${m.l + pw}" y1="${Y(S.psi)}" y2="${Y(S.psi)}"/><circle cx="${X(S.o2)}" cy="${Y(S.psi)}" r="4.5"/></g>`;
      s += `<text class="lbl halo" x="${X(S.o2) + 8}" y="${Y(S.psi) - 8}">escenario</text>`;
    }
    host.innerHTML = s + `</svg>`;
  }
  document.addEventListener("click", e => {
    const mk = e.target.closest(".chart .mk");
    if (!mk) return;
    if (mk.dataset.id === "__cabin") { resetTable(); T.q = "ISS"; $("#tsearch").value = "ISS"; go("investigaciones"); renderTable(); }
    else openDrawer(mk.dataset.id);
  });

  /* ───────── Barra lateral y escenario ───────── */
  const app = $("#app");
  app.classList.toggle("collapsed", S.collapsed);
  $("#collapse").addEventListener("click", () => { S.collapsed = !S.collapsed; app.classList.toggle("collapsed", S.collapsed); persist(); });
  $("#menu").addEventListener("click", () => { app.classList.add("nav-open"); $("#scrim").hidden = false; });
  $("#scrim").addEventListener("click", closeNav);
  function closeNav() { app.classList.remove("nav-open"); $("#scrim").hidden = true; }

  function setScenario(key) {
    S.scn = key;
    if (key !== "custom") Object.assign(S, { o2: D.escenarios[key].o2, psi: D.escenarios[key].psi, g: D.escenarios[key].g });
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
    $("#scnNote").textContent = S.scn === "custom" ? "Escenario personalizado." : D.escenarios[S.scn].nota;
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
  toggleTags("#pPil", S.pil);
  toggleTags("#pFase", S.fases);
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
    if (view === "comparar") renderCompare();
  }

  /* ───────── Router ───────── */
  let view = "resumen";
  function go(v) { if (location.hash !== "#/" + v) location.hash = "#/" + v; else route(); }
  function route() {
    const v = (location.hash.match(/^#\/(\w+)/) || [])[1];
    view = VIEWS[v] ? v : "resumen";
    $$(".view").forEach(s => s.classList.toggle("on", s.dataset.view === view));
    $$(".side-nav a").forEach(a => a.classList.toggle("active", a.dataset.view === view));
    $("#crumb").textContent = VIEWS[view];
    document.title = VIEWS[view] + " · Flame in Freefall";
    if (view === "comparar") renderCompare();
    if (view === "energia") renderEnergy();
    closeNav();
    window.scrollTo(0, 0);
  }
  addEventListener("hashchange", route);

  /* ───────── Resumen ───────── */
  function renderOverview() {
    const flight = EX.filter(e => e.plataforma !== "Tierra").length;
    const both = EX.filter(e => e.o2 && e.psi && !e.inferido).length;
    const inf = EX.filter(e => e.inferido).length;
    const inZone = EX.filter(e => e.o2 && e.psi && !e.inferido && e.o2.max >= D.zonaLunar.o2min && e.psi.min <= D.zonaLunar.psimax).length;
    const high = EX.filter(e => e.relevancia === 3).length;
    const compl = EX.reduce((a, e) => a + e._compl, 0) / EX.length;
    const pend = EX.filter(e => e.pendiente).length;
    $("#kpis").innerHTML = [
      ["Investigaciones", EX.length, "", `${flight} en vuelo · ${EX.length - flight} en tierra`],
      ["O₂ y p publicados", both, ` / ${EX.length}`, `+ ${inf} inferidas (cabina ISS)`],
      ["En zona lunar", inZone, "", "≥ 30 % O₂ y ≤ 10,2 psi", true],
      ["Relevancia alta", high, "", "prevención · detección · supresión"],
      ["Completitud media", Math.round(compl * 100), " %", `${pend} fichas pendientes`]
    ].map(([k, v, u, d, al]) => `<div class="kpi${al ? " alert" : ""}"><p class="kk">${k}</p><p class="v">${v}<small>${u}</small></p><p class="d">${d}</p></div>`).join("");

    const barsOf = (host, groups, kind) => {
      const max = Math.max(...groups.map(g => g[2]));
      $(host).innerHTML = groups.map(([key, label, n]) =>
        `<button class="bar-row" data-k="${kind}" data-v="${esc(key)}"><span class="t">${label}</span><span class="b"><i style="width:${n / max * 100}%;${kind === "pilar" ? `background:var(--pil-${key})` : ""}"></i></span><span class="n">${n}</span></button>`).join("");
    };
    barsOf("#byPilar", Object.entries(PILAR).map(([k, l]) => [k, l, EX.filter(e => e.pilares.includes(k)).length]), "pilar");
    barsOf("#byFase", Object.entries(FASE).map(([k, l]) => [k, l, EX.filter(e => e.fase === k).length]), "fase");
    const plats = [...new Set(EX.map(e => e.plataforma))];
    barsOf("#byPlat", plats.map(p => [p, p, EX.filter(e => e.plataforma === p).length]).sort((a, b) => b[2] - a[2]), "plat");

    const rows = EX.filter(e => e.relevancia >= 2).flatMap(e => e.resultados.map(r => [e, ...r]));
    $("#keyResults").innerHTML = `<thead><tr><th>Investigación</th><th>Magnitud</th><th>Valor</th></tr></thead><tbody>` +
      rows.map(([e, k, v]) => `<tr><td><a class="row-link" href="#" data-open="${e.id}">${e.nombre}</a></td><td>${gl(k)}</td><td class="mono">${v}</td></tr>`).join("") + `</tbody>`;
  }
  document.addEventListener("click", e => {
    const b = e.target.closest(".bar-row");
    if (!b) return;
    resetTable();
    if (b.dataset.k === "plat") { T.q = b.dataset.v; $("#tsearch").value = b.dataset.v; }
    else setSeg(b.dataset.k === "fase" ? "#fFase" : "#fPilar", b.dataset.v);
    go("investigaciones"); renderTable();
  });
  function renderTop5() {
    $("#topScn").textContent = S.scn === "custom" ? "personalizado" : D.escenarios[S.scn].nombre;
    $("#top5").innerHTML = ranked().slice(0, 5).map(({ e, s }, i) =>
      `<li data-open="${e.id}"><span class="r">${String(i + 1).padStart(2, "0")}</span><span><b>${e.nombre}</b><small>${s.why}</small></span>${stackbar(s)}<span class="s">${Math.round(s.total * 100)}</span></li>`).join("");
  }

  /* ───────── Tabla de investigaciones ───────── */
  const T = { fase: "", pilar: "", cond: false, q: "", sort: "relevancia", dir: -1 };
  function setSeg(sel, v) {
    $$(sel + " button").forEach(b => b.classList.toggle("on", b.dataset.v === v));
    if (sel === "#fFase") T.fase = v; else T.pilar = v;
  }
  function resetTable() { T.q = ""; T.cond = false; $("#tsearch").value = ""; $("#fCond").checked = false; setSeg("#fFase", ""); setSeg("#fPilar", ""); }
  $$("#fFase button").forEach(b => b.addEventListener("click", () => { setSeg("#fFase", b.dataset.v); renderTable(); }));
  $$("#fPilar button").forEach(b => b.addEventListener("click", () => { setSeg("#fPilar", b.dataset.v); renderTable(); }));
  $("#fCond").addEventListener("change", e => { T.cond = e.target.checked; renderTable(); });
  $("#tsearch").addEventListener("input", e => { T.q = e.target.value; renderTable(); });
  $$("#invTable th[data-sort]").forEach(th => th.addEventListener("click", () => {
    const k = th.dataset.sort;
    T.dir = T.sort === k ? -T.dir : (["nombre", "plataforma", "fase"].includes(k) ? 1 : -1);
    T.sort = k; renderTable();
  }));
  const hay = e => [e.nombre, e.largo, e.plataforma, e.grupo, e.combustible, e.hallazgo, FASE[e.fase], ...e.sensores, ...e.diluyentes, ...e.pilares.map(p => PILAR[p])].join(" ").toLowerCase();
  const sortKey = (e, k) => ({
    nombre: e.nombre, plataforma: e.plataforma, fase: e.fase, periodo: e.periodo || "",
    o2: e.o2 ? e.o2.max : -1, psi: e.psi ? e.psi.max : -1, flujo: e.flujo ? e.flujo.max : -1,
    compl: e._compl, relevancia: e.relevancia + e._compl / 10
  })[k];
  function filtered() {
    const q = T.q.trim().toLowerCase();
    return EX.filter(e => (!T.fase || e.fase === T.fase) && (!T.pilar || e.pilares.includes(T.pilar)) && (!T.cond || e.o2) && (!q || hay(e).includes(q)))
      .sort((a, b) => { const x = sortKey(a, T.sort), y = sortKey(b, T.sort); return (x > y ? 1 : x < y ? -1 : 0) * T.dir; });
  }
  function renderTable() {
    const rows = filtered();
    $$("#invTable th[data-sort]").forEach(th => {
      th.classList.remove("asc", "desc");
      if (th.dataset.sort === T.sort) th.classList.add(T.dir > 0 ? "asc" : "desc");
    });
    $("#rowCount").textContent = `${rows.length} de ${EX.length}`;
    $("#invTable tbody").innerHTML = rows.map(e => `
      <tr data-open="${e.id}" class="${S.cmp.has(e.id) ? "sel" : ""}">
        <td class="c-chk"><input type="checkbox" data-cmp="${e.id}" ${S.cmp.has(e.id) ? "checked" : ""} aria-label="Comparar ${e.nombre}"></td>
        <td class="name"><b>${e.nombre}${e.pendiente ? ` <span class="pill pend">pendiente</span>` : ""}</b><small>${e.largo}</small></td>
        <td>${gl(e.plataforma)}</td>
        <td>${FASE[e.fase]}</td>
        <td>${e.pilares.map(pill).join("")}</td>
        <td class="num">${cell(fmtO2(e), e.inferido)}</td>
        <td class="num">${cell(fmtRange(e.psi), e.inferido)}</td>
        <td class="num">${cell(fmtRange(e.flujo))}</td>
        <td class="mono">${cell(e.periodo)}</td>
        <td class="num">${complBar(e)}</td>
        <td class="num">${relDots(e.relevancia)}</td>
      </tr>`).join("") || `<tr><td colspan="11" class="empty">Sin resultados con estos filtros.</td></tr>`;
  }
  $("#invTable").addEventListener("change", e => { const id = e.target.dataset.cmp; if (id) toggleCmp(id); });
  $("#exportCsv").addEventListener("click", () => {
    const head = ["id", "nombre", "plataforma", "fase", "pilares", "o2_min", "o2_max", "psi_min", "psi_max", "condiciones_inferidas", "flujo_min_cm_s", "flujo_max_cm_s", "periodo", "relevancia", "completitud", "fuentes"];
    const q = v => v == null ? "" : /[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v;
    const lines = filtered().map(e => [e.id, e.nombre, e.plataforma, e.fase, e.pilares.join("|"), e.o2?.min, e.o2?.max, e.psi?.min, e.psi?.max, !!e.inferido, e.flujo?.min, e.flujo?.max, e.periodo, e.relevancia, e._compl.toFixed(2), e.fuentes.map(f => f[1] || f[0]).join(" | ")].map(q).join(","));
    const blob = new Blob([head.join(",") + "\n" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "flame-in-freefall-investigaciones.csv" });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("CSV exportado");
  });

  /* ───────── Ranking ───────── */
  function renderRanking() {
    $("#ranking").innerHTML = ranked().map(({ e, s }) => `
      <li data-open="${e.id}" class="${s.out ? "out" : ""}">
        <span class="nm"><b>${e.nombre}</b><small>${FASE[e.fase]} · ${e.plataforma}</small></span>
        <span class="stackwrap">${stackbar(s)}<p class="why">${s.why}</p></span>
        <span class="s">${Math.round(s.total * 100)}</span>
      </li>`).join("");
  }

  /* ───────── Cobertura ───────── */
  function renderCoverage() {
    gapChart($("#bigGap"), { showInf: $("#showInf").checked, showScn: $("#showScn").checked });
    const rows = EX.filter(e => e.o2).map(e => ({ e, c: condDist(e) }))
      .sort((a, b) => (a.c.d ?? 99 + a.c.dO) - (b.c.d ?? 99 + b.c.dO));
    $("#nearest").innerHTML = `<thead><tr><th>Investigación</th><th class="num">ΔO₂</th><th class="num">Δp</th><th class="num">d</th></tr></thead><tbody>` +
      rows.map(({ e, c }) => `<tr><td><a class="row-link" href="#" data-open="${e.id}">${e.nombre}</a>${e.inferido ? ` <span class="muted small">≈</span>` : ""}</td><td class="num">${nfa(c.dO)}</td><td class="num">${c.dP == null ? `<span class="na">n/d</span>` : nf(c.dP, 1)}</td><td class="num">${c.d == null ? `<span class="na">—</span>` : nf(c.d, 2)}</td></tr>`).join("") + `</tbody>`;
    const flex = byId.flex;
    $("#gapCallout").innerHTML = `<b>0 investigaciones</b> con presión publicada caen en la zona lunar. La más próxima es FLEX (p mín. ${nf(flex.psi.min, 1)} psi frente a ${nf(D.zonaLunar.psimax, 1)}). BRE cubre 34–40 % O₂ sin presión publicada: candidata a confirmar en PSI. ${EX.filter(e => !e.o2).length} investigaciones sin O₂ ni p.`;
  }
  $("#showInf").addEventListener("change", renderCoverage);
  $("#showScn").addEventListener("change", renderCoverage);

  /* ───────── Comparar ───────── */
  function toggleCmp(id) {
    S.cmp.has(id) ? S.cmp.delete(id) : S.cmp.add(id);
    persist(); updateCmpBadge();
    if (view === "investigaciones") renderTable();
    if (view === "comparar") renderCompare();
    if (current === id) openDrawer(id, true);
  }
  function updateCmpBadge() { const b = $("#cmpCount"); b.textContent = S.cmp.size; b.hidden = !S.cmp.size; }
  function renderCompare() {
    const list = [...S.cmp].map(id => byId[id]).filter(Boolean);
    $("#cmpAdd").innerHTML = `<option value="">+ Añadir investigación…</option>` + EX.filter(e => !S.cmp.has(e.id)).map(e => `<option value="${e.id}">${e.nombre}</option>`).join("");
    if (!list.length) { $("#cmpWrap").innerHTML = `<div class="empty">Marca investigaciones en la tabla o añádelas desde el selector.</div>`; return; }
    const rows = [
      ["Puntuación escenario", e => `<span class="mono">${Math.round(score(e).total * 100)}</span>`],
      ["Plataforma", e => e.plataforma], ["Grupo", e => e.grupo], ["Periodo", e => e.periodo],
      ["Fase", e => FASE[e.fase]], ["Pilares", e => e.pilares.map(pill).join("")],
      ["Combustible", e => e.combustible],
      ["O₂ (%)", e => fmtO2(e) && (e.inferido ? "≈ " : "") + fmtO2(e)],
      ["Presión (psi)", e => fmtRange(e.psi) && (e.inferido ? "≈ " : "") + fmtRange(e.psi)],
      ["Flujo (cm/s)", e => fmtRange(e.flujo)], ["Diluyentes", e => e.diluyentes.join(", ") || null], ["Sensores", e => e.sensores.join(", ") || null],
      ["Resultados", e => e.resultados.length ? e.resultados.map(([k, v]) => `${k}: <span class="mono">${v}</span>`).join("<br>") : null],
      ["Hallazgo", e => e.hallazgo], ["Completitud", e => complBar(e)], ["Relevancia", e => relDots(e.relevancia)]
    ];
    const diff = $("#cmpDiff").checked;
    const body = rows.map(([k, fn]) => {
      const vals = list.map(e => fn(e) ?? null);
      if (diff && list.length > 1 && vals.every(v => v === vals[0])) return "";
      return `<tr><td>${k}</td>${vals.map(v => `<td>${v == null || v === "" ? `<span class="na">—</span>` : v}</td>`).join("")}</tr>`;
    }).join("");
    $("#cmpWrap").innerHTML = `<table class="tbl cmp"><thead><tr><th></th>${list.map(e => `<th>${e.nombre}<button class="x" data-rm="${e.id}" aria-label="Quitar ${e.nombre}">×</button></th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
  }
  $("#cmpAdd").addEventListener("change", e => { if (e.target.value) toggleCmp(e.target.value); });
  $("#cmpDiff").addEventListener("change", renderCompare);
  $("#cmpClear").addEventListener("click", () => { S.cmp.clear(); persist(); updateCmpBadge(); renderCompare(); });
  $("#cmpWrap").addEventListener("click", e => { const b = e.target.closest("[data-rm]"); if (b) toggleCmp(b.dataset.rm); });

  /* ───────── Energía ───────── */
  let model = D.modelos[1];
  $("#eModel").innerHTML = D.modelos.map(m => `<button data-v="${m.id}" title="${nf(m.seg, 1)} s por consulta">${m.nombre.replace("Mistral ", "")}</button>`).join("");
  $$("#eModel button").forEach(b => b.addEventListener("click", () => { model = D.modelos.find(m => m.id === b.dataset.v); renderEnergy(); }));
  ["eActive", "eIdle", "eQueries", "eNight", "eDens", "eMargin", "eSleep"].forEach(id => $("#" + id).addEventListener("input", renderEnergy));
  const val = id => +$("#" + id).value;
  const fmtWh = wh => wh >= 1000 ? nf(wh / 1000, 2) + " kWh" : wh >= 10 ? nf(wh, 0) + " Wh" : nf(wh, 2) + " Wh";
  function energy(sleep, q = val("eQueries")) {
    const perQ = val("eActive") * model.seg / 3600;
    const busy = Math.min(24, q * model.seg / 3600);
    const dayQ = perQ * q, dayI = (sleep ? 1 : val("eIdle")) * (24 - busy);
    const night = (dayQ + dayI) * val("eNight");
    return { perQ, dayQ, dayI, day: dayQ + dayI, night, busy, kg: night / val("eDens") * (1 + val("eMargin") / 100) };
  }
  const kgFmt = k => nf(k, k < 10 ? 1 : 0);
  function renderEnergy() {
    $$("#eModel button").forEach(b => b.classList.toggle("on", b.dataset.v === model.id));
    $("#oActive").textContent = val("eActive") + " W";
    $("#oIdle").textContent = val("eIdle") + " W";
    $("#oQueries").textContent = val("eQueries");
    $("#oNight").textContent = nfa(val("eNight")) + " d";
    $("#oDens").textContent = val("eDens") + " Wh/kg";
    $("#oMargin").textContent = "+" + val("eMargin") + " %";
    const sleep = $("#eSleep").checked;
    $("#eIdle").disabled = sleep;
    const r = energy(sleep), alt = energy(!sleep);
    $("#eKpis").innerHTML = [
      ["Masa de batería", kgFmt(r.kg), " kg", `${sleep ? "sin" : "con"} suspensión: ${kgFmt(alt.kg)} kg`],
      ["Energía / día", fmtWh(r.day), "", `${nf(r.busy, 2)} h de cómputo activo`],
      ["Energía / periodo", fmtWh(r.night), "", `${nfa(val("eNight"))} días sin sol`],
      ["Energía / consulta", fmtWh(r.perQ), "", `${model.nombre} · ${nf(model.seg, 1)} s`]
    ].map(([k, v, u, d], i) => `<div class="kpi${i === 0 ? " alert" : ""}"><p class="kk">${k}</p><p class="v">${v}<small>${u}</small></p><p class="d">${d}</p></div>`).join("");
    const share = r.day ? r.dayQ / r.day : 0;
    $("#barQ").style.width = share * 100 + "%";
    $("#barI").style.width = (1 - share) * 100 + "%";
    $("#eNote").innerHTML = `<span style="color:var(--acc-2)">■</span> Inferencia ${fmtWh(r.dayQ)} (${Math.round(share * 100)} %) · <span style="color:var(--c-pil)">■</span> Reposo ${fmtWh(r.dayI)} (${Math.round((1 - share) * 100)} %). ` +
      (share < 0.3 ? "Domina el reposo: el ahorro está en el ciclo de trabajo, no en el tamaño del modelo." : "Domina la inferencia: el tiempo por consulta del modelo es la palanca principal.");
    $$("#energia input[type=range]").forEach(paintRange);
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
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Masa de batería según consultas al día"><g class="grid">`;
    for (let k = 0; k <= ymax; k += step) s += `<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(k)}" y2="${Y(k)}"/>`;
    s += `</g>`;
    for (let k = 0; k <= ymax; k += step) s += `<text class="ax" x="${m.l - 6}" y="${Y(k) + 3}" text-anchor="end">${nfa(+k.toFixed(1))}</text>`;
    for (let q = 0; q <= QMAX; q += 500) s += `<text class="ax" x="${X(q)}" y="${H - 14}" text-anchor="middle">${q}</text>`;
    s += `<text class="ttl" x="${m.l + pw}" y="${H - 1}" text-anchor="end">consultas / día</text><text class="ttl" x="${m.l - 6}" y="${m.t - 4}" text-anchor="end">kg</text>`;
    s += `<path class="l1" d="${path(a)}"/><path class="l2" d="${path(b)}"/>`;
    const q = val("eQueries"), cur = energy($("#eSleep").checked).kg;
    s += `<circle class="now" cx="${X(Math.min(q, QMAX))}" cy="${Y(cur)}" r="5"/></svg>`;
    $("#eChart").innerHTML = s;
  }

  /* ───────── Benchmark ───────── */
  function renderModels() {
    const best = Math.max(...D.modelos.map(m => m.ok / m.n));
    $("#modelTable").innerHTML = `<thead><tr><th>Modelo</th><th class="num">s / doc</th><th class="num">tok/s</th><th class="num">Memoria</th><th class="num">Aciertos</th><th>Precisión</th><th class="num">Wh / doc @ 30 W</th></tr></thead><tbody>` +
      D.modelos.map(m => {
        const acc = m.ok / m.n;
        return `<tr><td><b>${m.nombre}</b></td><td class="num">${nf(m.seg, 1)}</td><td class="num">${nf(m.tps, 1)}</td><td class="num">${nf(m.mem, 1)} GB</td><td class="num">${m.ok}/${m.n}</td><td><span class="compl" style="width:120px"><i style="width:${acc * 100}%;${acc === best ? "" : "opacity:.55"}"></i></span><span class="mono">${nf(acc * 100, 1)} %</span></td><td class="num">${nf(30 * m.seg / 3600, 3)}</td></tr>`;
      }).join("") + `</tbody>`;
  }

  /* ───────── Completitud y fuentes ───────── */
  function renderQuality() {
    const sorted = [...EX].sort((a, b) => b._compl - a._compl);
    $("#matrix").innerHTML = `<thead><tr><th></th>${FIELDS.map(f => `<th>${f[0]}</th>`).join("")}<th></th></tr></thead><tbody>` +
      sorted.map(e => `<tr><th data-open="${e.id}">${e.nombre}</th>${e._st.map((s, i) => `<td class="${s}" title="${e.nombre} · ${FIELDS[i][0]}: ${s === "f" ? "dato" : s === "i" ? "inferido" : "falta"}"></td>`).join("")}<td class="pc">${Math.round(e._compl * 100)} %</td></tr>`).join("") + `</tbody>`;
    $("#srcTable").innerHTML = `<thead><tr><th>Investigación</th><th>Fuente</th></tr></thead><tbody>` +
      EX.flatMap(e => e.fuentes.map(([l, u]) => `<tr><td><a class="row-link" href="#" data-open="${e.id}">${e.nombre}</a></td><td>${u ? `<a href="${u}" target="_blank" rel="noopener">${l} ↗</a>` : `<span class="muted">${l} (sin enlace)</span>`}</td></tr>`)).join("") + `</tbody>`;
  }

  /* ───────── Panel de detalle ───────── */
  let current = null;
  function openDrawer(id, keep) {
    const e = byId[id]; if (!e) return;
    current = id;
    const s = score(e);
    $("#dGroup").innerHTML = gl(`${e.grupo} · ${e.plataforma}${e.periodo ? " · " + e.periodo : ""}`);
    $("#dTitle").textContent = e.nombre;
    $("#dSub").textContent = e.largo;
    $("#dBody").innerHTML = `
      <div class="drawer-actions">
        <button class="btn" data-cmp-toggle="${e.id}">${S.cmp.has(e.id) ? "Quitar de comparar" : "Añadir a comparar"}</button>
        ${e.o2 ? `<a class="btn ghost" href="#/cobertura">Ver en cobertura</a>` : ""}
      </div>
      <div><h4>Hallazgo</h4><p>${gl(e.hallazgo)}</p></div>
      <div><h4>Condiciones</h4><dl class="kv">
        <dt>Fase</dt><dd>${FASE[e.fase]}</dd>
        <dt>Combustible</dt><dd>${gl(e.combustible)}</dd>
        <dt>O₂ (%)</dt><dd class="mono">${cell(fmtO2(e), e.inferido)}</dd>
        <dt>Presión (psi)</dt><dd class="mono">${cell(fmtRange(e.psi), e.inferido)}</dd>
        <dt>Flujo (cm/s)</dt><dd class="mono">${cell(fmtRange(e.flujo))}</dd>
        <dt>Diluyentes</dt><dd>${e.diluyentes.join(", ") || cell(null)}</dd>
        <dt>Sensores</dt><dd>${gl(e.sensores.join(", ")) || cell(null)}</dd>
        <dt>Pilares</dt><dd>${e.pilares.map(pill).join("")}</dd>
      </dl>${e.nota ? `<p class="foot-note" style="margin-top:8px">${e.nota}</p>` : ""}${e.inferido ? `<p class="foot-note" style="margin-top:8px">≈ O₂ y presión inferidos (aire de cabina ISS).</p>` : ""}</div>
      ${e.resultados.length ? `<div><h4>Resultados</h4><dl class="kv">${e.resultados.map(([k, v]) => `<dt>${k}</dt><dd class="mono">${v}</dd>`).join("")}</dl></div>` : ""}
      <div><h4>Escenario activo · ${Math.round(s.total * 100)} / 100</h4>${stackbar(s)}<p class="foot-note" style="margin-top:6px">${s.why}</p></div>
      <div><h4>Completitud · ${Math.round(e._compl * 100)} %</h4><p class="foot-note">Falta: ${FIELDS.filter((f, i) => !e._st[i]).map(f => f[0]).join(", ") || "nada"}</p></div>
      <div><h4>Fuentes</h4><ul>${e.fuentes.map(([l, u]) => `<li>${u ? `<a href="${u}" target="_blank" rel="noopener">${l} ↗</a>` : l}</li>`).join("")}</ul></div>`;
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

  /* ───────── Búsqueda global ───────── */
  const gs = $("#gsearch"), gr = $("#gresults");
  let hits = [], hi = 0;
  function searchAll(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    const views = Object.entries(VIEWS).filter(([, l]) => l.toLowerCase().includes(q)).map(([k, l]) => ({ type: "view", k, label: l, meta: "vista" }));
    const exps = EX.filter(e => hay(e).includes(q)).map(e => ({ type: "exp", k: e.id, label: e.nombre, meta: e.plataforma }));
    const terms = D.glosario.filter(([t, , d]) => t.toLowerCase().includes(q) || (q.length > 3 && d.toLowerCase().includes(q))).map(([t]) => ({ type: "term", k: t, label: t, meta: "glosario" }));
    return [...views, ...exps, ...terms].slice(0, 12);
  }
  function drawHits() {
    gr.hidden = !hits.length;
    gr.innerHTML = hits.map((h, i) => `<li class="${i === hi ? "hi" : ""}" data-i="${i}" role="option"><span>${esc(h.label)}</span><span>${h.meta}</span></li>`).join("");
  }
  function pick(h) {
    if (!h) return;
    if (h.type === "view") go(h.k);
    else if (h.type === "term") { G.q = h.k; $("#glSearch").value = h.k; setGlCat(""); go("glosario"); renderGlossary(); }
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

  /* ───────── Atajos de teclado ───────── */
  const order = Object.keys(VIEWS);
  document.addEventListener("keydown", e => {
    const a = document.activeElement;
    const typing = (a.tagName === "INPUT" && !["checkbox", "range"].includes(a.type)) || a.tagName === "SELECT" || a.tagName === "TEXTAREA";
    if (e.key === "Escape" && !$("#drawer").hidden) return closeDrawer();
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "/") { e.preventDefault(); gs.focus(); }
    else if (e.key === "[") $("#collapse").click();
    else if (/^[1-9]$/.test(e.key)) go(order[+e.key - 1]);
  });

  /* ───────── Glosario ───────── */
  const CAT = { instalacion: "Instalación", combustion: "Combustión", material: "Material", instrumento: "Instrumento", dashboard: "Dashboard" };
  const G = { cat: "", q: "" };
  function setGlCat(v) { G.cat = v; $$("#glCat button").forEach(b => b.classList.toggle("on", b.dataset.v === v)); }
  function renderGlossary() {
    const q = G.q.trim().toLowerCase();
    const items = D.glosario.filter(([t, c, d]) => (!G.cat || c === G.cat) && (!q || (t + " " + d).toLowerCase().includes(q)))
      .sort((a, b) => a[0].localeCompare(b[0], "es"));
    $("#glCount").textContent = `${items.length} de ${D.glosario.length}`;
    $("#glList").innerHTML = items.map(([t, c, d]) => {
      const used = c === "dashboard" || t.length < 3 ? [] : EX.filter(e => hay(e).includes(t.toLowerCase()) || e.plataforma.includes(t)).slice(0, 6);
      return `<div class="gl-item"><dt><span class="gl-t">${t}</span><span class="cat cat-${c}">${CAT[c]}</span></dt><dd>${d}${used.length ? `<span class="gl-used">${used.map(e => `<a href="#" data-open="${e.id}">${e.nombre}</a>`).join("")}</span>` : ""}</dd></div>`;
    }).join("") || `<div class="empty">Ningún término coincide.</div>`;
  }
  $$("#glCat button").forEach(b => b.addEventListener("click", () => { setGlCat(b.dataset.v); renderGlossary(); }));
  $("#glSearch").addEventListener("input", e => { G.q = e.target.value; renderGlossary(); });
  renderGlossary();

  /* ───────── Toast ───────── */
  let tt;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 1800); }

  /* ───────── Inicio ───────── */
  renderOverview();
  renderTable();
  renderModels();
  renderQuality();
  updateCmpBadge();
  syncScenario();
  renderEnergy();
  route();
})();
