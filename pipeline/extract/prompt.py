"""Extraction schemas and instructions for the LLM.

Lessons from the pre-hackathon model tests:
- English instructions and English field names (Spanish ones made models
  translate terms and mix up fields).
- The model never converts units: it copies value + unit, Python converts.
- Models write 0 for missing values, so every number must come with verbatim
  evidence quotes that Python checks against the source text.

Test conditions are a list: one investigation (or paper) usually tests several
oxygen / pressure / flow combinations, and each one is a point on the map.
"""

PROMPT_VERSION = "3"

RANGE = {
    "type": "object",
    "properties": {
        "min": {"type": ["number", "null"]},
        "max": {"type": ["number", "null"]},
        "unit": {"type": ["string", "null"]},
    },
    "required": ["min", "max", "unit"],
}
STRINGS = {"type": "array", "items": {"type": "string"}}

CONDITION = {
    "type": "object",
    "properties": {
        "label": {"type": "string"},
        "context": {"type": "string",
                    "enum": ["flight", "ground", "drop_tower", "aircraft", "simulation", "unknown"]},
        "fuel": {"type": ["string", "null"]},
        "oxygen": RANGE,
        "pressure": RANGE,
        "flow_speed": RANGE,
        "evidence": STRINGS,
    },
    "required": ["label", "context", "fuel", "oxygen", "pressure", "flow_speed", "evidence"],
}
CONDITIONS = {"type": "array", "items": CONDITION}

INVESTIGATION_SCHEMA = {
    "type": "object",
    "properties": {
        "test_type": {"type": "string",
                      "enum": ["combustion", "smoke_pyrolysis", "aerosol_dust", "modeling", "unknown"]},
        "fuels": STRINGS,
        "fuel_phases": {"type": "array", "items": {"type": "string", "enum": ["solid", "liquid", "gas"]}},
        "sample_geometry": STRINGS,
        "sample_size": {"type": ["string", "null"]},
        "conditions": CONDITIONS,
        "diluents": STRINGS,
        "suppressants": STRINGS,
        "variables_studied": STRINGS,
        "sensors": STRINGS,
        "safety_pillars": {"type": "array",
                           "items": {"type": "string", "enum": ["prevention", "detection", "suppression"]}},
        "key_findings": STRINGS,
        "earth_applications": {"type": ["string", "null"]},
    },
}
INVESTIGATION_SCHEMA["required"] = list(INVESTIGATION_SCHEMA["properties"])

PAPER_SCHEMA = {
    "type": "object",
    "properties": {"fuels": STRINGS, "conditions": CONDITIONS, "key_findings": STRINGS},
    "required": ["fuels", "conditions", "key_findings"],
}

CONDITION_RULES = """- conditions: one entry per distinct test atmosphere / flow combination stated in the document.
  - label: short description, e.g. "PMMA rod, low-oxygen blowoff tests" or "Moon base atmosphere".
  - context: where these tests were run: "flight" (ISS, spacecraft, Cygnus, sounding rocket), "ground" (normal-gravity laboratory), "drop_tower", "aircraft" (parabolic flights), "simulation" (numerical/CFD model), or "unknown" if not stated.
  - fuel: the fuel burned in that condition, if stated.
  - oxygen: oxygen concentration. Copy numbers and unit exactly as written ("%" or "mole fraction"). Only oxygen values, never flow speeds or other numbers.
  - pressure and flow_speed: range (min, max) and unit EXACTLY as written. Single value -> min = max. "up to X" -> min null, max X.
  - Do NOT convert units or compute anything. Missing -> min, max and unit null. Never use 0 for a value that is not given.
  - evidence: the exact sentence fragments from the document that contain those numbers, copied verbatim (no paraphrasing, no "...").
  - If the document states no numeric conditions, return an empty list."""

INVESTIGATION_INSTRUCTIONS = f"""You extract structured data about NASA microgravity combustion investigations.
Read the document and return ONLY a JSON object with the given schema.

Rules:
- Use only information stated in the document. Do not invent or assume.
- If a value is missing use null, an empty list [] or "unknown".
- Copy terms in English with the shortest wording used in the document (e.g. "PMMA", "heptane", "thermocouple", "flow speed").
- test_type: "combustion" if something is burned; "smoke_pyrolysis" if materials are heated to make smoke without flames; "aerosol_dust" for particle/dust measurements without fire; "modeling" for purely computational work.
- fuels: specific fuel or material names (e.g. "PMMA", "cotton-fiberglass fabric", "n-heptane"), never just "solid".
- fuel_phases: physical state of the fuels, which you SHOULD infer: fabrics, plastics, paper, solid samples -> "solid"; droplets or liquid fuels -> "liquid"; gaseous fuels -> "gas".
{CONDITION_RULES}
- diluents: inert gases mixed with oxygen in the atmosphere (e.g. nitrogen, helium, CO2).
- suppressants: agents used to extinguish flames (e.g. nitrogen jet, CO2, water mist).
- variables_studied: parameters varied between tests.
- sensors: physical instruments only (e.g. "thermocouple", "color video camera", "CSA-CP"), not measured quantities.
- safety_pillars: prevention (flammability, ignition, materials), detection (smoke, fire sensors), suppression (extinction, suppressants).
- key_findings: up to 3 short sentences with the main results stated in the document; keep numbers and units.
- earth_applications: one sentence only if the document mentions Earth benefits; otherwise null.
"""

PAPER_INSTRUCTIONS = f"""You extract test conditions from excerpts of a NASA microgravity combustion paper.
Return ONLY a JSON object with the given schema. Use only information stated in the excerpts.
- fuels: specific fuel or material names burned or heated in the tests.
{CONDITION_RULES}
- key_findings: up to 3 short sentences with quantitative results stated in the excerpts; keep numbers and units.
"""


def build_document(rec: dict) -> str:
    """Text the model sees, assembled from the PSI metadata record."""
    parts = [f"Investigation: {rec.get('acronym') or ''} - {rec.get('title') or ''}".strip()]
    if (rec.get("hardware") or {}).get("name"):
        parts.append(f"Hardware: {rec['hardware']['name']}")
    if rec.get("keywords"):
        parts.append("Keywords: " + ", ".join(rec["keywords"]))
    for label, key in [("Objectives", "objectives"), ("Hypothesis", "hypothesis"),
                       ("Approach", "approach"), ("Earth benefits", "earth_benefits")]:
        if rec.get(key):
            parts.append(f"{label}:\n{rec[key]}")
    return "\n\n".join(parts)
