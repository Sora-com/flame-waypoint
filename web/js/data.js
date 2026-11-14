// Static dashboard content: glossary and model benchmark.
// Investigations, design scenarios and the Moon base requirement are not defined here: js/site.js loads
// them from data/site.json (built by pipeline/build/site_data.py, shared with the assistant).

window.FIRE_DATA = {
  experiments: [],

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
    ["Score", "dashboard", "Weighted sum of four components (conditions, pillar, evidence, gravity), normalized to 0–100. Weights editable in Ranking."],
    ["d", "dashboard", "Normalized distance from the scenario to the closest tested point: √((ΔO₂/15)² + (Δp/6)²). Only when a test reports both O₂ and pressure."],
    ["Completeness", "dashboard", "Fraction of 8 key fields with data in site.json."],
    ["Evidence", "dashboard", "Evidence level 1–3: starts at 1, +1 if PSI test tables were parsed, +1 if findings were extracted from papers."],
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
