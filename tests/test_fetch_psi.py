import json
import tempfile
import unittest
from pathlib import Path

from pipeline.fetch import psi

RAW = {
    "Accession": "PSI-25",
    "Acronym": "BASS-II",
    "Title": "Burning and Suppression of Solids - II",
    "Objectives": "  Study flame spread.  ",
    "Hypothesis": "",
    "Keywords": "Flame Spread     extinction limits     MSG",
    "Publication Title": "Paper A     Paper B",
    "Related Investigations": "PSI-26",
    "Experiment Hardware": {"Name": "Microgravity Science Glovebox (MSG)", "Link": "https://x"},
    "Person": {"First Name": "Paul", "Last Name": "Ferkul"},
    "Public Release Date": 1555286400.0,
}


class NormalizeTest(unittest.TestCase):
    def test_fields(self):
        rec = psi.normalize(RAW)
        self.assertEqual(rec["accession"], "PSI-25")
        self.assertEqual(rec["objectives"], "Study flame spread.")
        self.assertIsNone(rec["hypothesis"])
        self.assertEqual(rec["keywords"], ["Flame Spread", "extinction limits", "MSG"])
        self.assertEqual(rec["publications"], ["Paper A", "Paper B"])
        self.assertEqual(rec["hardware"]["name"], "Microgravity Science Glovebox (MSG)")
        self.assertEqual(rec["public_release_date"], "2019-04-15")
        self.assertTrue(rec["source_url"].endswith("/PSI-25"))

    def test_missing_optional_fields(self):
        rec = psi.normalize({"Accession": "PSI-1"})
        self.assertEqual(rec["keywords"], [])
        self.assertIsNone(rec["hardware"]["name"])
        self.assertIsNone(rec["public_release_date"])


class IncrementalTest(unittest.TestCase):
    def test_new_changed_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            a = psi.normalize(RAW)
            b = psi.normalize({**RAW, "Accession": "PSI-26", "Acronym": "BASS"})

            first = psi.diff([a, b], out)
            self.assertEqual(sorted(first["new"]), ["PSI-25", "PSI-26"])
            psi.save([a, b], first, out, "Combustion Science")

            b2 = psi.normalize({**RAW, "Accession": "PSI-26", "Acronym": "BASS (updated)"})
            c = psi.normalize({**RAW, "Accession": "PSI-200", "Acronym": "LUCI"})
            second = psi.diff([a, b2, c], out)
            self.assertEqual(second, {"new": ["PSI-200"], "changed": ["PSI-26"],
                                      "unchanged": ["PSI-25"]})
            psi.save([a, b2, c], second, out, "Combustion Science")

            index = json.loads((out / "index.json").read_text())
            self.assertEqual([i["accession"] for i in index["investigations"]],
                             ["PSI-25", "PSI-26", "PSI-200"])


if __name__ == "__main__":
    unittest.main()
