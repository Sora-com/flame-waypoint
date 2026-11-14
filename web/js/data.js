// Dashboard data. Source: investigacion/notas_psi.md (manual review of PSI, NTRS and papers).
// When the pipeline produces the final JSON, replace this object keeping the field names.
//
// Conventions
//   o2:    { min, max, vals? }  % by volume. null = not stated in the reviewed sources.
//   psi:   { min, max }         absolute pressure.
//   flow:  { min, max }         cm/s.
//   inferred: true → assumed conditions (ISS cabin air: 21 % O₂, 14.7 psi), not read from the source.
//   g: test gravity (0 = µg, 1 = Earth). emulatesG: the experiment emulates partial gravity.

window.FIRE_DATA = {
  experiments: [
    {
      id: "bre", name: "ACME BRE", longName: "Burning Rate Emulator",
      group: "ACME", platform: "ISS · CIR", period: null, g: 0,
      phase: "gas", pillars: ["prevention"], relevance: 3,
      fuel: "C₂H₄ and CH₄ diluted in N₂ (emulating solids and liquids)",
      o2: { min: 21, max: 40, vals: [21, 26.5, 34, 40] }, psi: null, flow: null,
      diluents: ["N₂"], sensors: [],
      finding: "At 21 % O₂ all flames self-extinguish in < 40 s; stable at 26.5, 34 and 40 % O₂. Flammability map of heat of gasification vs. heat of combustion.",
      results: [["Self-extinction at 21 % O₂", "< 40 s"], ["Emulated ΔH_c", "15–47.2 kJ/g"]],
      sources: [["NASA · BRE", "https://science.nasa.gov/biological-physical/investigations/bre/"], ["Dehghani 2022 (UMD)", null], ["Wright 2021 (UMD)", null]]
    },
    {
      id: "efield", name: "ACME E-FIELD", longName: "E-FIELD Flames",
      group: "ACME", platform: "ISS · CIR", period: "2018", g: 0, emulatesG: true,
      phase: "gas", pillars: ["fundamental"], relevance: 2,
      fuel: "gas", o2: null, psi: null, flow: null,
      diluents: [], sensors: [],
      finding: "Electric field up to 10 kV; the ionic wind changes flame shape, soot and stability. Cited in the challenge as a way to emulate partial gravity.",
      results: [["Field", "≤ 10 kV"]],
      sources: [["NASA · E-FIELD Flames", "https://science.nasa.gov/biological-physical/investigations/e-field-flames/"]]
    },
    {
      id: "sflames", name: "ACME S-Flames", longName: "Spherical Diffusion Flames",
      group: "ACME", platform: "ISS · CIR", period: null, g: 0,
      phase: "gas", pillars: ["fundamental"], relevance: 1,
      fuel: "C₂H₄, 6.4 mm porous spherical burner", o2: null, psi: null, flow: null,
      diluents: [], sensors: [],
      finding: "Spherical flames lasting 28–336 s; large ones extinguish by radiation (loss ≈ heat released). Validation of extinction and soot models.",
      results: [["Flame duration", "28–336 s"], ["Chamber volume", "83 L"]],
      sources: [["NASA · s-Flame", "https://science.nasa.gov/biological-physical/investigations/s-flame/"], ["NTRS 20210022542", "https://ntrs.nasa.gov/citations/20210022542"]]
    },
    {
      id: "bass", name: "BASS", longName: "Burning and Suppression of Solids",
      group: "SPICE duct", platform: "ISS · MSG", period: null, g: 0,
      phase: "solid", pillars: ["prevention", "suppression"], relevance: 3,
      fuel: "solids (and gas)", o2: { min: 21, max: 21 }, psi: { min: 14.7, max: 14.7 }, inferred: true, flow: null,
      diluents: [], sensors: [],
      finding: "First campaign using the SPICE flow duct: flame growth and extinction over solids as a function of flow.",
      results: [],
      sources: [["PSI list", "https://www.nasa.gov/physical-sciences-informatics-psi/psi-investigations-by-research-area/"]]
    },
    {
      id: "bass2", name: "BASS-II", longName: "Burning and Suppression of Solids II",
      group: "SPICE duct", platform: "ISS · MSG", period: null, g: 0,
      phase: "solid", pillars: ["prevention", "suppression"], relevance: 3,
      fuel: "flat, spherical and cylindrical solids; several thicknesses",
      o2: null, psi: null, flow: { min: 0, max: 55 },
      diluents: ["N₂"], sensors: ["CSA-CP (O₂, CO)", "CDM (CO₂)", "fixed camera", "video"],
      finding: "Very sensitive to flow in the 0–5 cm/s range. First N₂ dilution of the MSG volume on the ISS. N₂ jet for suppression.",
      results: [["HRR", "almost always < 100 W"], ["Global equivalence ratio", "≈ 1.3"], ["Duct", "7.6 × 7.6 cm"]],
      note: "O₂ reduced by N₂ dilution; values not published in the reviewed sources.",
      sources: [["NTRS 20160000593", "https://ntrs.nasa.gov/citations/20160000593"], ["NTRS 20150019858", "https://ntrs.nasa.gov/citations/20150019858"], ["NTRS 20210011385", "https://ntrs.nasa.gov/citations/20210011385"]]
    },
    {
      id: "cfi", name: "CFI / CFI-G", longName: "Cool Flames Investigation",
      group: "MDCA", platform: "ISS · CIR", period: null, g: 0,
      phase: "liquid", pillars: ["fundamental"], relevance: 2,
      fuel: "n-heptane, n-octane, n-decane droplets",
      o2: { min: 14, max: 25, extra: 85 }, psi: null, flow: { min: 0, max: 0 },
      diluents: ["various"], sensors: [],
      finding: "Quasi-steady cool-flame burning after radiative extinction; the diluent strongly changes the cool flame. CFI-G (ACME): inside-out flame up to 85 % O₂, the highest in PSI. Re-ignition risk.",
      results: [["Max O₂ (CFI-G)", "85 %"]],
      sources: [["NTRS 20140006750", "https://ntrs.nasa.gov/citations/20140006750"], ["NTRS 20190002838", "https://ntrs.nasa.gov/citations/20190002838"]]
    },
    {
      id: "flex", name: "FLEX", longName: "Flame Extinguishment Experiment",
      group: "MDCA", platform: "ISS · CIR", period: "2009–2011", g: 0,
      phase: "liquid", pillars: ["suppression"], relevance: 3,
      fuel: "n-heptane and methanol droplets, 1.5–5 mm",
      o2: { min: 10, max: 40 }, psi: { min: 10.3, max: 44.1 }, flow: { min: 0, max: 0 },
      diluents: ["N₂", "CO₂", "He"], sensors: [],
      finding: "LOI measured with N₂, CO₂ and He. First observation of cool flames in large heptane droplets after radiative extinction.",
      results: [["Methanol LOI (N₂)", "0.12"], ["Heptane LOI (N₂)", "0.15"], ["LOI with CO₂", "≈ 0.14 / 0.17"], ["LOI with He", "≈ 0.14 / 0.15"], ["Pressure", "0.7–3.0 atm"]],
      sources: [["Microgravity Sci. Technol. 2014", "https://doi.org/10.1007/s12217-014-9372-2"]]
    },
    {
      id: "flex2", name: "FLEX-2", longName: "Flame Extinguishment Experiment 2",
      group: "MDCA", platform: "ISS · CIR", period: null, g: 0,
      phase: "liquid", pillars: ["fundamental"], relevance: 2,
      fuel: "droplets (mixtures)", o2: null, psi: null, flow: null,
      diluents: [], sensors: [], pending: true,
      finding: "Extraction pending.", results: [],
      sources: [["PSI list", "https://www.nasa.gov/physical-sciences-informatics-psi/psi-investigations-by-research-area/"]]
    },
    {
      id: "spice", name: "SPICE", longName: "Smoke Point In Co-flow Experiment",
      group: "SPICE duct", platform: "ISS · MSG", period: null, g: 0,
      phase: "gas", pillars: ["fundamental", "detection"], relevance: 2,
      fuel: "gaseous hydrocarbons in co-flow",
      o2: { min: 21, max: 21 }, psi: { min: 14.7, max: 14.7 }, inferred: true, flow: { min: 5.4, max: 65 },
      diluents: [], sensors: [],
      finding: "Smoke point: L ∝ d^-0.91 · u^0.41. Sooting tendency CH₄ < C₂H₆ < C₂H₄ < C₃H₈ < C₃H₆.",
      results: [["Burners", "0.41 / 0.76 / 1.6 mm"], ["Correlation", "L ∝ d^-0.91 u^0.41"]],
      sources: [["Dotson et al. 2011, Fire Safety J.", null], ["DeBold 2012 (UMD)", null]]
    },
    {
      id: "slice", name: "SLICE", longName: "Structure & Liftoff In Combustion Experiment",
      group: "SPICE duct", platform: "ISS · MSG", period: "2011–2012", g: 0,
      phase: "gas", pillars: ["fundamental"], relevance: 1,
      fuel: "CH₄ diluted in N₂ (X_CH₄ 0.4–1.0)",
      o2: { min: 21, max: 21 }, psi: { min: 14.7, max: 14.7 }, inferred: true, flow: null,
      diluents: ["N₂"], sensors: [],
      finding: "In µg lifted flames are stable (in 1 g they oscillate due to buoyancy). Model validation.",
      results: [["X_CH₄", "0.4–1.0"]],
      sources: [["Cao et al. 2014, PROCI", null], ["NTRS 20160012298", "https://ntrs.nasa.gov/citations/20160012298"]]
    },
    {
      id: "same", name: "SAME", longName: "Smoke Aerosol Measurement Experiment",
      group: "Detection", platform: "ISS · MSG", period: "2007–2008", g: 0,
      phase: "smoke", pillars: ["detection"], relevance: 3,
      fuel: "flameless pyrolysis: cellulose, Kapton, silicone, PTFE, Pyrell",
      o2: { min: 21, max: 21 }, psi: { min: 14.7, max: 14.7 }, inferred: true, flow: null,
      diluents: [], sensors: ["aerosol instruments"],
      finding: "The ISS photoelectric detector often failed to detect PTFE and Kapton smoke. Much of the smoke is < 500 nm.",
      results: [["Particles", "mostly < 500 nm"], ["ISS detector vs PTFE/Kapton", "frequent missed detection"]],
      sources: [["SAE 2009-01-2468", "https://www.sae.org/publications/technical-papers/content/2009-01-2468/"]]
    },
    {
      id: "samer", name: "SAME-R", longName: "SAME Reflight",
      group: "Detection", platform: "ISS · MSG", period: "2010", g: 0,
      phase: "smoke", pillars: ["detection"], relevance: 3,
      fuel: "flameless pyrolysis: PTFE, Kapton, cotton, silicone, Pyrell",
      o2: { min: 21, max: 21 }, psi: { min: 14.7, max: 14.7 }, inferred: true, flow: { min: 0, max: 8 },
      diluents: [], sensors: ["aerosol", "TEM grids", "two-moment detector (prototype)"],
      finding: "Particles mostly 200–400 nm (preliminary). In µg mixing dominates: detection is slower.",
      results: [["Particles", "200–400 nm"], ["Aging", "11–1800 s"]],
      sources: [["NTRS 20150010172", "https://ntrs.nasa.gov/citations/20150010172"]]
    },
    {
      id: "daft", name: "DAFT", longName: "Dust and Aerosol measurement Feasibility Test",
      group: "Detection", platform: "ISS · cabin", period: "2006", g: 0,
      phase: "dust", pillars: ["detection"], relevance: 1,
      fuel: "Arizona Road Dust (no combustion)",
      o2: { min: 21, max: 21 }, psi: { min: 14.7, max: 14.7 }, inferred: true, flow: null,
      diluents: [], sensors: ["P-Trak (≥ 20 nm)"],
      finding: "A commercial particle counter works in µg. Precursor to SAME.",
      results: [],
      sources: [["NTRS 20050215648", "https://ntrs.nasa.gov/citations/20050215648"]]
    },
    {
      id: "daft2", name: "DAFT-2", longName: "DAFT 2",
      group: "Detection", platform: "ISS · cabin", period: null, g: 0,
      phase: "dust", pillars: ["detection"], relevance: 1,
      fuel: "dust (no combustion)",
      o2: { min: 21, max: 21 }, psi: { min: 14.7, max: 14.7 }, inferred: true, flow: null,
      diluents: [], sensors: ["P-Trak"], pending: true,
      finding: "No public quantitative data in the reviewed sources.", results: [],
      sources: [["PSI list", "https://www.nasa.gov/physical-sciences-informatics-psi/psi-investigations-by-research-area/"]]
    },
    {
      id: "saffire1", name: "Saffire-I", longName: "Spacecraft Fire Safety Demonstration I",
      group: "Saffire", platform: "Cygnus", period: "2016", g: 0,
      phase: "solid", pillars: ["prevention"], relevance: 3,
      fuel: "SIBAL (75 % cotton / 25 % fiberglass), 0.4 × 0.95 m",
      o2: null, psi: null, flow: { min: 20, max: 20 },
      diluents: [], sensors: [],
      finding: "First large-scale fire in flight. Flame size, shape and spread rate became steady very early.",
      results: [["Sample", "0.4 × 0.95 m"]],
      sources: [["NTRS 20160010292", "https://ntrs.nasa.gov/citations/20160010292"]]
    },
    {
      id: "saffire2", name: "Saffire-II", longName: "Spacecraft Fire Safety Demonstration II",
      group: "Saffire", platform: "Cygnus", period: "2016", g: 0,
      phase: "solid", pillars: ["prevention"], relevance: 3,
      fuel: "9 samples: SIBAL, Nomex, window acrylic",
      o2: null, psi: null, flow: null,
      diluents: [], sensors: [],
      finding: "O₂ flammability limits of spacecraft materials.",
      results: [["Samples", "9"]],
      sources: [["NTRS 20170002628", "https://ntrs.nasa.gov/citations/20170002628"]]
    },
    {
      id: "saffire3", name: "Saffire-III", longName: "Spacecraft Fire Safety Demonstration III",
      group: "Saffire", platform: "Cygnus", period: "2017", g: 0,
      phase: "solid", pillars: ["prevention"], relevance: 3,
      fuel: "SIBAL", o2: null, psi: null, flow: { min: 30, max: 30 },
      diluents: [], sensors: [],
      finding: "Repeat of Saffire-I at higher flow to compare flame spread.",
      results: [],
      sources: [["NTRS 20170002628", "https://ntrs.nasa.gov/citations/20170002628"]]
    },
    {
      id: "coolflame", name: "Cool Flame Transitions", longName: "Counterflow, ground test",
      group: "Ground", platform: "Ground", period: null, g: 1,
      phase: "gas", pillars: ["fundamental"], relevance: 1,
      fuel: "gas, counterflow", o2: null, psi: null, flow: null,
      diluents: [], sensors: [], pending: true,
      finding: "Extraction pending.", results: [],
      sources: [["PSI list", "https://www.nasa.gov/physical-sciences-informatics-psi/psi-investigations-by-research-area/"]]
    },
    {
      id: "samemodel", name: "SAME modeling", longName: "Smoke generation modeling, ground",
      group: "Ground", platform: "Ground", period: null, g: 1,
      phase: "smoke", pillars: ["detection"], relevance: 1,
      fuel: "modeling", o2: null, psi: null, flow: null,
      diluents: [], sensors: [], pending: true,
      finding: "Extraction pending.", results: [],
      sources: [["PSI list", "https://www.nasa.gov/physical-sciences-informatics-psi/psi-investigations-by-research-area/"]]
    }
  ],

  // Design scenarios. Moon/rover: requirement ≥ 30 % O₂, ≤ 10.2 psi; representative point = NASA exploration atmosphere (34 %, 8.2 psi).
  scenarios: {
    iss:   { name: "ISS", o2: 21, psi: 14.7, g: 0, note: "Sea-level cabin air." },
    moon:  { name: "Moon base", o2: 34, psi: 8.2, g: 0.16, note: "Requirement ≥ 30 % O₂ / ≤ 10.2 psi. Point: exploration atmosphere." },
    rover: { name: "Pressurized rover", o2: 34, psi: 8.2, g: 0.16, note: "Same atmosphere as the base, very small free volume." },
    mars:  { name: "Mars", o2: 34, psi: 8.2, g: 0.38, note: "Atmosphere not defined; exploration atmosphere assumed." }
  },
  lunarZone: { o2min: 30, psimax: 10.2 },

  // Technical glossary. Categories: facility, combustion, material, instrument, dashboard.
  glossary: [
    ["ACME", "facility", "Advanced Combustion via Microgravity Experiments: a series of six gaseous-flame experiments in the CIR (BRE, E-FIELD, S-Flames, CFI-G…). Hardware retired in 2022."],
    ["CIR", "facility", "Combustion Integrated Rack: ISS rack with a sealed combustion chamber, atmosphere control and optical diagnostics."],
    ["MDCA", "facility", "Multi-user Droplet Combustion Apparatus: CIR insert for isolated droplet combustion (FLEX, FLEX-2, CFI)."],
    ["MSG", "facility", "Microgravity Science Glovebox: sealed work volume with gloves. Hosts the SPICE flow duct, BASS and SLICE."],
    ["Cygnus", "facility", "Cargo spacecraft. Saffire ran after it undocked from the ISS, with no risk to the crew."],
    ["PSI", "facility", "Physical Science Informatics: NASA's public repository of physical science data obtained on the ISS."],
    ["LUCI / FM2", "facility", "Planned partial-gravity combustion tests. No data in PSI yet."],
    ["µg", "combustion", "Microgravity (~10⁻⁶ g). No natural convection: O₂ arrives by diffusion or forced flow."],
    ["LOI", "combustion", "Limiting Oxygen Index: minimum O₂ fraction that sustains combustion of a material under given conditions."],
    ["HRR", "combustion", "Heat Release Rate: thermal power released by the fire (W)."],
    ["φ", "combustion", "Equivalence ratio: fuel/oxidizer relative to stoichiometric. φ > 1 means a rich mixture."],
    ["Cool flame", "combustion", "Low-temperature oxidation with almost no visible emission. It can persist after the hot flame goes out (re-ignition risk)."],
    ["Radiative extinction", "combustion", "Extinction when radiative losses equal the heat released. Typical of large flames in µg."],
    ["Smoke point", "combustion", "Flame length above which soot is emitted from the tip. Measures sooting tendency."],
    ["Co-flow", "combustion", "Oxidizer flowing parallel to the fuel jet."],
    ["Liftoff", "combustion", "Lifted flame: it stabilizes at some distance from the burner."],
    ["Ionic wind", "combustion", "Flow induced by flame ions inside an electric field (E-FIELD)."],
    ["Pyrolysis", "combustion", "Thermal decomposition without flame. Produces smoke and gases (SAME, SAME-R)."],
    ["Mole fraction", "combustion", "X_O₂ = 0.21 equals 21 % by volume. Sources use both notations."],
    ["Exploration atmosphere", "combustion", "34 % O₂ at 8.2 psi: atmosphere proposed by NASA for habitats with frequent EVAs."],
    ["SIBAL", "material", "Fabric of 75 % cotton and 25 % fiberglass. Reference sample in Saffire."],
    ["PTFE", "material", "Polytetrafluoroethylene (Teflon). Its smoke escaped the ISS detector in SAME."],
    ["Kapton", "material", "Polyimide film used in electrical insulation."],
    ["Nomex", "material", "Fire-resistant aramid used in spacecraft textiles."],
    ["Pyrell", "material", "Flame-retardant polyurethane foam used in ISS packaging."],
    ["CSA-CP", "instrument", "Compound Specific Analyzer–Combustion Products: ISS portable analyzer (O₂, CO and other acid gases)."],
    ["CDM", "instrument", "Carbon Dioxide Monitor: CO₂ meter."],
    ["P-Trak", "instrument", "Condensation-based ultrafine particle counter (from 20 nm)."],
    ["TEM", "instrument", "Transmission electron microscopy. Grids capture smoke particles for analysis on the ground."],
    ["Score", "dashboard", "Weighted sum of four components (conditions, pillar, relevance, gravity), normalized to 0–100. Weights editable in Ranking."],
    ["d", "dashboard", "Normalized distance to the scenario: √((ΔO₂/15)² + (Δp/6)²). Only when pressure is known."],
    ["≈ Inferred", "dashboard", "Condition not published in the source; ISS cabin air assumed (21 % O₂, 14.7 psi)."],
    ["Completeness", "dashboard", "Fraction of 9 key fields with data (inferred = 0.5)."],
    ["DoD", "dashboard", "Allowed depth of discharge. Reflected in the energy calculator's margin."],
    ["Wh/kg", "dashboard", "Cell specific energy. Current lithium-ion: 150–250 Wh/kg at cell level."]
  ],

  // Team measurements: pruebas_llm/resultados/resultados.csv (Nov 13 2026, Apple Silicon).
  // sec = median per extraction; ok = correct fields / evaluated fields (12 cases × 13 fields).
  models: [
    { id: "ministral", name: "Ministral 3B", sec: 7.7, tps: 46.9, mem: 4.1, ok: 129, n: 156 },
    { id: "mistral", name: "Mistral 7B", sec: 15.3, tps: 27.4, mem: 6.6, ok: 117, n: 156 },
    { id: "nemo", name: "Mistral Nemo 12B", sec: 18.8, tps: 17.5, mem: 9.5, ok: 128, n: 156 }
  ]
};
