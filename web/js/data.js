// Datos del dashboard. Fuente: investigacion/notas_psi.md (revisión manual de PSI, NTRS y artículos).
// Cuando el pipeline genere el JSON definitivo, sustituir este objeto manteniendo los nombres de campo.
//
// Convenciones
//   o2:    { min, max, vals? }  % en volumen. null = no indicado en las fuentes revisadas.
//   psi:   { min, max }         presión absoluta.
//   flujo: { min, max }         cm/s.
//   inferido: true → condiciones supuestas (aire de cabina ISS: 21 % O₂, 14,7 psi), no leídas de la fuente.
//   g: gravedad del ensayo (0 = µg, 1 = tierra). emulaG: el experimento emula gravedad parcial.

window.FIRE_DATA = {
  experimentos: [
    {
      id: "bre", nombre: "ACME BRE", largo: "Burning Rate Emulator",
      grupo: "ACME", plataforma: "ISS · CIR", periodo: null, g: 0,
      fase: "gas", pilares: ["prevencion"], relevancia: 3,
      combustible: "C₂H₄ y CH₄ diluidos en N₂ (emulan sólidos y líquidos)",
      o2: { min: 21, max: 40, vals: [21, 26.5, 34, 40] }, psi: null, flujo: null,
      diluyentes: ["N₂"], sensores: [],
      hallazgo: "A 21 % O₂ todas las llamas se autoextinguen en < 40 s; estables a 26,5, 34 y 40 % O₂. Mapa de inflamabilidad calor de gasificación vs. calor de combustión.",
      resultados: [["Autoextinción a 21 % O₂", "< 40 s"], ["ΔH_c emulado", "15–47,2 kJ/g"]],
      fuentes: [["NASA · BRE", "https://science.nasa.gov/biological-physical/investigations/bre/"], ["Dehghani 2022 (UMD)", null], ["Wright 2021 (UMD)", null]]
    },
    {
      id: "efield", nombre: "ACME E-FIELD", largo: "E-FIELD Flames",
      grupo: "ACME", plataforma: "ISS · CIR", periodo: "2018", g: 0, emulaG: true,
      fase: "gas", pilares: ["fundamental"], relevancia: 2,
      combustible: "gas", o2: null, psi: null, flujo: null,
      diluyentes: [], sensores: [],
      hallazgo: "Campo eléctrico de hasta 10 kV; el viento iónico modifica forma, hollín y estabilidad. Citado en el reto como vía para emular gravedad parcial.",
      resultados: [["Campo", "≤ 10 kV"]],
      fuentes: [["NASA · E-FIELD Flames", "https://science.nasa.gov/biological-physical/investigations/e-field-flames/"]]
    },
    {
      id: "sflames", nombre: "ACME S-Flames", largo: "Spherical Diffusion Flames",
      grupo: "ACME", plataforma: "ISS · CIR", periodo: null, g: 0,
      fase: "gas", pilares: ["fundamental"], relevancia: 1,
      combustible: "C₂H₄, quemador esférico poroso 6,4 mm", o2: null, psi: null, flujo: null,
      diluyentes: [], sensores: [],
      hallazgo: "Llamas esféricas de 28–336 s; las grandes se extinguen por radiación (pérdida ≈ calor liberado). Validación de modelos de extinción y hollín.",
      resultados: [["Duración de llama", "28–336 s"], ["Volumen de cámara", "83 L"]],
      fuentes: [["NASA · s-Flame", "https://science.nasa.gov/biological-physical/investigations/s-flame/"], ["NTRS 20210022542", "https://ntrs.nasa.gov/citations/20210022542"]]
    },
    {
      id: "bass", nombre: "BASS", largo: "Burning and Suppression of Solids",
      grupo: "Conducto SPICE", plataforma: "ISS · MSG", periodo: null, g: 0,
      fase: "solido", pilares: ["prevencion", "supresion"], relevancia: 3,
      combustible: "sólidos (y gas)", o2: { min: 21, max: 21 }, psi: { min: 14.7, max: 14.7 }, inferido: true, flujo: null,
      diluyentes: [], sensores: [],
      hallazgo: "Primera campaña con el conducto de flujo de SPICE: crecimiento y extinción en sólidos en función del flujo.",
      resultados: [],
      fuentes: [["Lista PSI", "https://www.nasa.gov/physical-sciences-informatics-psi/psi-investigations-by-research-area/"]]
    },
    {
      id: "bass2", nombre: "BASS-II", largo: "Burning and Suppression of Solids II",
      grupo: "Conducto SPICE", plataforma: "ISS · MSG", periodo: null, g: 0,
      fase: "solido", pilares: ["prevencion", "supresion"], relevancia: 3,
      combustible: "sólidos planos, esféricos y cilíndricos; varios espesores",
      o2: null, psi: null, flujo: { min: 0, max: 55 },
      diluyentes: ["N₂"], sensores: ["CSA-CP (O₂, CO)", "CDM (CO₂)", "cámara fija", "vídeo"],
      hallazgo: "Muy sensible al flujo en 0–5 cm/s. Primera dilución con N₂ del volumen de la MSG en la ISS. Chorro de N₂ para supresión.",
      resultados: [["HRR", "casi siempre < 100 W"], ["Equivalencia global", "≈ 1,3"], ["Conducto", "7,6 × 7,6 cm"]],
      nota: "O₂ reducido por dilución con N₂; valores no publicados en las fuentes revisadas.",
      fuentes: [["NTRS 20160000593", "https://ntrs.nasa.gov/citations/20160000593"], ["NTRS 20150019858", "https://ntrs.nasa.gov/citations/20150019858"], ["NTRS 20210011385", "https://ntrs.nasa.gov/citations/20210011385"]]
    },
    {
      id: "cfi", nombre: "CFI / CFI-G", largo: "Cool Flames Investigation",
      grupo: "MDCA", plataforma: "ISS · CIR", periodo: null, g: 0,
      fase: "liquido", pilares: ["fundamental"], relevancia: 2,
      combustible: "gotas de n-heptano, n-octano, n-decano",
      o2: { min: 14, max: 25, extra: 85 }, psi: null, flujo: { min: 0, max: 0 },
      diluyentes: ["varios"], sensores: [],
      hallazgo: "Combustión fría casi estacionaria tras la extinción radiativa; el diluyente cambia mucho la llama fría. CFI-G (ACME): llama inside-out hasta 85 % O₂, el máximo de PSI. Riesgo de reignición.",
      resultados: [["O₂ máximo (CFI-G)", "85 %"]],
      fuentes: [["NTRS 20140006750", "https://ntrs.nasa.gov/citations/20140006750"], ["NTRS 20190002838", "https://ntrs.nasa.gov/citations/20190002838"]]
    },
    {
      id: "flex", nombre: "FLEX", largo: "Flame Extinguishment Experiment",
      grupo: "MDCA", plataforma: "ISS · CIR", periodo: "2009–2011", g: 0,
      fase: "liquido", pilares: ["supresion"], relevancia: 3,
      combustible: "gotas de n-heptano y metanol, 1,5–5 mm",
      o2: { min: 10, max: 40 }, psi: { min: 10.3, max: 44.1 }, flujo: { min: 0, max: 0 },
      diluyentes: ["N₂", "CO₂", "He"], sensores: [],
      hallazgo: "LOI medido con N₂, CO₂ y He. Primera observación de llamas frías en gotas grandes de heptano tras extinción radiativa.",
      resultados: [["LOI metanol (N₂)", "0,12"], ["LOI heptano (N₂)", "0,15"], ["LOI con CO₂", "≈ 0,14 / 0,17"], ["LOI con He", "≈ 0,14 / 0,15"], ["Presión", "0,7–3,0 atm"]],
      fuentes: [["Microgravity Sci. Technol. 2014", "https://doi.org/10.1007/s12217-014-9372-2"]]
    },
    {
      id: "flex2", nombre: "FLEX-2", largo: "Flame Extinguishment Experiment 2",
      grupo: "MDCA", plataforma: "ISS · CIR", periodo: null, g: 0,
      fase: "liquido", pilares: ["fundamental"], relevancia: 2,
      combustible: "gotas (mezclas)", o2: null, psi: null, flujo: null,
      diluyentes: [], sensores: [], pendiente: true,
      hallazgo: "Pendiente de extracción.", resultados: [],
      fuentes: [["Lista PSI", "https://www.nasa.gov/physical-sciences-informatics-psi/psi-investigations-by-research-area/"]]
    },
    {
      id: "spice", nombre: "SPICE", largo: "Smoke Point In Co-flow Experiment",
      grupo: "Conducto SPICE", plataforma: "ISS · MSG", periodo: null, g: 0,
      fase: "gas", pilares: ["fundamental", "deteccion"], relevancia: 2,
      combustible: "hidrocarburos gaseosos en coflujo",
      o2: { min: 21, max: 21 }, psi: { min: 14.7, max: 14.7 }, inferido: true, flujo: { min: 5.4, max: 65 },
      diluyentes: [], sensores: [],
      hallazgo: "Smoke point: L ∝ d^-0,91 · u^0,41. Tendencia a hollín CH₄ < C₂H₆ < C₂H₄ < C₃H₈ < C₃H₆.",
      resultados: [["Quemadores", "0,41 / 0,76 / 1,6 mm"], ["Correlación", "L ∝ d^-0,91 u^0,41"]],
      fuentes: [["Dotson et al. 2011, Fire Safety J.", null], ["DeBold 2012 (UMD)", null]]
    },
    {
      id: "slice", nombre: "SLICE", largo: "Structure & Liftoff In Combustion Experiment",
      grupo: "Conducto SPICE", plataforma: "ISS · MSG", periodo: "2011–2012", g: 0,
      fase: "gas", pilares: ["fundamental"], relevancia: 1,
      combustible: "CH₄ diluido en N₂ (X_CH₄ 0,4–1,0)",
      o2: { min: 21, max: 21 }, psi: { min: 14.7, max: 14.7 }, inferido: true, flujo: null,
      diluyentes: ["N₂"], sensores: [],
      hallazgo: "En µg las llamas despegadas son estables (en 1 g oscilan por flotabilidad). Validación de modelos.",
      resultados: [["X_CH₄", "0,4–1,0"]],
      fuentes: [["Cao et al. 2014, PROCI", null], ["NTRS 20160012298", "https://ntrs.nasa.gov/citations/20160012298"]]
    },
    {
      id: "same", nombre: "SAME", largo: "Smoke Aerosol Measurement Experiment",
      grupo: "Detección", plataforma: "ISS · MSG", periodo: "2007–2008", g: 0,
      fase: "humo", pilares: ["deteccion"], relevancia: 3,
      combustible: "pirólisis sin llama: celulosa, Kapton, silicona, PTFE, Pyrell",
      o2: { min: 21, max: 21 }, psi: { min: 14.7, max: 14.7 }, inferido: true, flujo: null,
      diluyentes: [], sensores: ["instrumentos de aerosol"],
      hallazgo: "El detector fotoeléctrico de la ISS a menudo no detectó el humo de PTFE y Kapton. Gran parte del humo < 500 nm.",
      resultados: [["Partículas", "mayoría < 500 nm"], ["Detector ISS vs PTFE/Kapton", "detección fallida frecuente"]],
      fuentes: [["SAE 2009-01-2468", "https://www.sae.org/publications/technical-papers/content/2009-01-2468/"]]
    },
    {
      id: "samer", nombre: "SAME-R", largo: "SAME Reflight",
      grupo: "Detección", plataforma: "ISS · MSG", periodo: "2010", g: 0,
      fase: "humo", pilares: ["deteccion"], relevancia: 3,
      combustible: "pirólisis sin llama: PTFE, Kapton, algodón, silicona, Pyrell",
      o2: { min: 21, max: 21 }, psi: { min: 14.7, max: 14.7 }, inferido: true, flujo: { min: 0, max: 8 },
      diluyentes: [], sensores: ["aerosol", "rejillas TEM", "detector dos momentos (prototipo)"],
      hallazgo: "Partículas mayoritariamente 200–400 nm (preliminar). En µg domina el mezclado: detección más lenta.",
      resultados: [["Partículas", "200–400 nm"], ["Envejecimiento", "11–1800 s"]],
      fuentes: [["NTRS 20150010172", "https://ntrs.nasa.gov/citations/20150010172"]]
    },
    {
      id: "daft", nombre: "DAFT", largo: "Dust and Aerosol measurement Feasibility Test",
      grupo: "Detección", plataforma: "ISS · cabina", periodo: "2006", g: 0,
      fase: "polvo", pilares: ["deteccion"], relevancia: 1,
      combustible: "Arizona Road Dust (sin combustión)",
      o2: { min: 21, max: 21 }, psi: { min: 14.7, max: 14.7 }, inferido: true, flujo: null,
      diluyentes: [], sensores: ["P-Trak (≥ 20 nm)"],
      hallazgo: "Un contador de partículas comercial funciona en µg. Precursor de SAME.",
      resultados: [],
      fuentes: [["NTRS 20050215648", "https://ntrs.nasa.gov/citations/20050215648"]]
    },
    {
      id: "daft2", nombre: "DAFT-2", largo: "DAFT 2",
      grupo: "Detección", plataforma: "ISS · cabina", periodo: null, g: 0,
      fase: "polvo", pilares: ["deteccion"], relevancia: 1,
      combustible: "polvo (sin combustión)",
      o2: { min: 21, max: 21 }, psi: { min: 14.7, max: 14.7 }, inferido: true, flujo: null,
      diluyentes: [], sensores: ["P-Trak"], pendiente: true,
      hallazgo: "Sin datos cuantitativos públicos en las fuentes revisadas.", resultados: [],
      fuentes: [["Lista PSI", "https://www.nasa.gov/physical-sciences-informatics-psi/psi-investigations-by-research-area/"]]
    },
    {
      id: "saffire1", nombre: "Saffire-I", largo: "Spacecraft Fire Safety Demonstration I",
      grupo: "Saffire", plataforma: "Cygnus", periodo: "2016", g: 0,
      fase: "solido", pilares: ["prevencion"], relevancia: 3,
      combustible: "SIBAL (75 % algodón / 25 % fibra de vidrio), 0,4 × 0,95 m",
      o2: null, psi: null, flujo: { min: 20, max: 20 },
      diluyentes: [], sensores: [],
      hallazgo: "Primer incendio a gran escala en vuelo. Tamaño, forma y velocidad de propagación estables muy pronto.",
      resultados: [["Muestra", "0,4 × 0,95 m"]],
      fuentes: [["NTRS 20160010292", "https://ntrs.nasa.gov/citations/20160010292"]]
    },
    {
      id: "saffire2", nombre: "Saffire-II", largo: "Spacecraft Fire Safety Demonstration II",
      grupo: "Saffire", plataforma: "Cygnus", periodo: "2016", g: 0,
      fase: "solido", pilares: ["prevencion"], relevancia: 3,
      combustible: "9 muestras: SIBAL, Nomex, acrílico de ventana",
      o2: null, psi: null, flujo: null,
      diluyentes: [], sensores: [],
      hallazgo: "Límites de inflamabilidad por O₂ de materiales de nave.",
      resultados: [["Muestras", "9"]],
      fuentes: [["NTRS 20170002628", "https://ntrs.nasa.gov/citations/20170002628"]]
    },
    {
      id: "saffire3", nombre: "Saffire-III", largo: "Spacecraft Fire Safety Demonstration III",
      grupo: "Saffire", plataforma: "Cygnus", periodo: "2017", g: 0,
      fase: "solido", pilares: ["prevencion"], relevancia: 3,
      combustible: "SIBAL", o2: null, psi: null, flujo: { min: 30, max: 30 },
      diluyentes: [], sensores: [],
      hallazgo: "Réplica de Saffire-I a mayor flujo para comparar propagación.",
      resultados: [],
      fuentes: [["NTRS 20170002628", "https://ntrs.nasa.gov/citations/20170002628"]]
    },
    {
      id: "coolflame", nombre: "Cool Flame Transitions", largo: "Counterflow, ensayo en tierra",
      grupo: "Tierra", plataforma: "Tierra", periodo: null, g: 1,
      fase: "gas", pilares: ["fundamental"], relevancia: 1,
      combustible: "gas, contraflujo", o2: null, psi: null, flujo: null,
      diluyentes: [], sensores: [], pendiente: true,
      hallazgo: "Pendiente de extracción.", resultados: [],
      fuentes: [["Lista PSI", "https://www.nasa.gov/physical-sciences-informatics-psi/psi-investigations-by-research-area/"]]
    },
    {
      id: "samemodel", nombre: "SAME modelado", largo: "Smoke generation modeling, tierra",
      grupo: "Tierra", plataforma: "Tierra", periodo: null, g: 1,
      fase: "humo", pilares: ["deteccion"], relevancia: 1,
      combustible: "modelado", o2: null, psi: null, flujo: null,
      diluyentes: [], sensores: [], pendiente: true,
      hallazgo: "Pendiente de extracción.", resultados: [],
      fuentes: [["Lista PSI", "https://www.nasa.gov/physical-sciences-informatics-psi/psi-investigations-by-research-area/"]]
    }
  ],

  // Escenarios de diseño. Luna/rover: requisito ≥ 30 % O₂, ≤ 10,2 psi; punto representativo = atmósfera de exploración NASA (34 %, 8,2 psi).
  escenarios: {
    iss:   { nombre: "ISS", o2: 21, psi: 14.7, g: 0, nota: "Aire de cabina a nivel del mar." },
    luna:  { nombre: "Base lunar", o2: 34, psi: 8.2, g: 0.16, nota: "Requisito ≥ 30 % O₂ / ≤ 10,2 psi. Punto: atmósfera de exploración." },
    rover: { nombre: "Rover presurizado", o2: 34, psi: 8.2, g: 0.16, nota: "Misma atmósfera que la base, volumen libre muy pequeño." },
    marte: { nombre: "Marte", o2: 34, psi: 8.2, g: 0.38, nota: "Atmósfera no definida; se asume la de exploración." }
  },
  zonaLunar: { o2min: 30, psimax: 10.2 },

  // Glosario técnico. Categorías: instalacion, combustion, material, instrumento, dashboard.
  glosario: [
    ["ACME", "instalacion", "Advanced Combustion via Microgravity Experiments: serie de seis experimentos de llamas gaseosas en el CIR (BRE, E-FIELD, S-Flames, CFI-G…). Hardware retirado en 2022."],
    ["CIR", "instalacion", "Combustion Integrated Rack: rack de la ISS con cámara de combustión sellada, control de la atmósfera y diagnóstico óptico."],
    ["MDCA", "instalacion", "Multi-user Droplet Combustion Apparatus: inserto del CIR para combustión de gotas aisladas (FLEX, FLEX-2, CFI)."],
    ["MSG", "instalacion", "Microgravity Science Glovebox: volumen de trabajo estanco con guantes. Aloja el conducto de flujo de SPICE, BASS y SLICE."],
    ["Cygnus", "instalacion", "Nave de carga. Saffire se ejecutó tras desacoplarla de la ISS, sin riesgo para la tripulación."],
    ["PSI", "instalacion", "Physical Science Informatics: repositorio público de la NASA con los datos de ciencias físicas obtenidos en la ISS."],
    ["LUCI / FM2", "instalacion", "Ensayos previstos de combustión en gravedad parcial. Aún sin datos en PSI."],
    ["µg", "combustion", "Microgravedad (~10⁻⁶ g). Sin convección natural: el O₂ llega por difusión o flujo forzado."],
    ["LOI", "combustion", "Limiting Oxygen Index: fracción mínima de O₂ que mantiene la combustión de un material en unas condiciones dadas."],
    ["HRR", "combustion", "Heat Release Rate: potencia térmica liberada por el fuego (W)."],
    ["φ", "combustion", "Relación de equivalencia: combustible/oxidante respecto a la estequiométrica. φ > 1, mezcla rica."],
    ["Llama fría", "combustion", "Oxidación a baja temperatura casi sin emisión visible. Puede persistir tras extinguirse la llama caliente (riesgo de reignición)."],
    ["Extinción radiativa", "combustion", "Extinción cuando las pérdidas por radiación igualan al calor liberado. Típica de llamas grandes en µg."],
    ["Smoke point", "combustion", "Longitud de llama a partir de la cual se emite hollín por la punta. Mide la tendencia a formar hollín."],
    ["Coflujo", "combustion", "Oxidante que fluye en paralelo al chorro de combustible."],
    ["Liftoff", "combustion", "Llama despegada: se estabiliza a cierta distancia del quemador."],
    ["Viento iónico", "combustion", "Flujo inducido por los iones de la llama dentro de un campo eléctrico (E-FIELD)."],
    ["Pirólisis", "combustion", "Descomposición térmica sin llama. Genera humo y gases (SAME, SAME-R)."],
    ["Fracción molar", "combustion", "X_O₂ = 0,21 equivale a 21 % en volumen. Las fuentes usan ambas notaciones."],
    ["Atmósfera de exploración", "combustion", "34 % O₂ a 8,2 psi: atmósfera propuesta por la NASA para hábitats con EVA frecuentes."],
    ["SIBAL", "material", "Tejido de 75 % algodón y 25 % fibra de vidrio. Muestra de referencia en Saffire."],
    ["PTFE", "material", "Politetrafluoroetileno (teflón). Su humo escapaba al detector de la ISS en SAME."],
    ["Kapton", "material", "Película de poliimida usada en aislamientos eléctricos."],
    ["Nomex", "material", "Aramida resistente al fuego usada en textiles de nave."],
    ["Pyrell", "material", "Espuma de poliuretano ignífuga usada en embalajes de la ISS."],
    ["CSA-CP", "instrumento", "Compound Specific Analyzer–Combustion Products: analizador portátil de la ISS (O₂, CO y otros gases ácidos)."],
    ["CDM", "instrumento", "Carbon Dioxide Monitor: medidor de CO₂."],
    ["P-Trak", "instrumento", "Contador de partículas ultrafinas por condensación (desde 20 nm)."],
    ["TEM", "instrumento", "Microscopía electrónica de transmisión. Las rejillas capturan partículas de humo para analizarlas en tierra."],
    ["Puntuación", "dashboard", "Suma ponderada de cuatro componentes (condiciones, pilar, relevancia, gravedad), normalizada a 0–100. Pesos editables en Ranking."],
    ["d", "dashboard", "Distancia normalizada al escenario: √((ΔO₂/15)² + (Δp/6)²). Solo si la presión es conocida."],
    ["≈ Inferido", "dashboard", "Condición no publicada en la fuente; se asume aire de cabina ISS (21 % O₂, 14,7 psi)."],
    ["Completitud", "dashboard", "Fracción de 9 campos clave con dato (inferido = 0,5)."],
    ["DoD", "dashboard", "Profundidad de descarga admitida. Se refleja en el margen de la calculadora de energía."],
    ["Wh/kg", "dashboard", "Energía específica de la celda. Ion-litio actual: 150–250 Wh/kg a nivel de celda."]
  ],

  // Medidas del equipo: pruebas_llm/resultados/resultados.csv (13 nov 2026, Apple Silicon).
  // seg = mediana por extracción; acierto = campos correctos / campos evaluados (12 casos × 13 campos).
  modelos: [
    { id: "ministral", nombre: "Ministral 3B", seg: 7.7, tps: 46.9, mem: 4.1, ok: 129, n: 156 },
    { id: "mistral", nombre: "Mistral 7B", seg: 15.3, tps: 27.4, mem: 6.6, ok: 117, n: 156 },
    { id: "nemo", nombre: "Mistral Nemo 12B", seg: 18.8, tps: 17.5, mem: 9.5, ok: 128, n: 156 }
  ]
};
