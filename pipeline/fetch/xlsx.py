"""Minimal .xlsx reader (standard library only): returns each sheet as rows of strings."""

from __future__ import annotations

import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def _col_index(ref: str) -> int:
    letters = re.match(r"[A-Z]+", ref).group()
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n - 1


def read_xlsx(path: Path) -> dict[str, list[list[str]]]:
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        shared = []
        if "xl/sharedStrings.xml" in names:
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(f"{NS}si"):
                shared.append("".join(t.text or "" for t in si.iter(f"{NS}t")))
        rels = {}
        if "xl/_rels/workbook.xml.rels" in names:
            for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels")):
                rels[r.get("Id")] = "xl/" + r.get("Target").lstrip("/").removeprefix("xl/")
        sheets = {}
        for i, s in enumerate(ET.fromstring(z.read("xl/workbook.xml")).iter(f"{NS}sheet"), start=1):
            target = rels.get(s.get(f"{REL_NS}id"), f"xl/worksheets/sheet{i}.xml")
            rows = []
            for row in ET.fromstring(z.read(target)).iter(f"{NS}row"):
                cells: dict[int, str] = {}
                for c in row.iter(f"{NS}c"):
                    v, t = c.find(f"{NS}v"), c.get("t")
                    if t == "s" and v is not None:
                        val = shared[int(v.text)]
                    elif t == "inlineStr":
                        val = "".join(x.text or "" for x in c.iter(f"{NS}t"))
                    else:
                        val = v.text if v is not None else ""
                    cells[_col_index(c.get("r"))] = val or ""
                if cells:
                    rows.append([cells.get(j, "") for j in range(max(cells) + 1)])
            sheets[s.get("name")] = rows
        return sheets
