import unittest

from pipeline.extract import attribution as A

SAFFIRE = [("PSI-98", "SAFFIRE-I"), ("PSI-99", "SAFFIRE-II"), ("PSI-100", "SAFFIRE-III")]
FLEX = [("PSI-39", "CFI"), ("PSI-68", "FLEX-2"), ("PSI-69", "FLEX")]


class SeriesTest(unittest.TestCase):
    def test_series(self):
        self.assertEqual(A.series("SAFFIRE-II"), ("SAFFIRE", 2))
        self.assertEqual(A.series("FLEX-2"), ("FLEX", 2))
        self.assertEqual(A.series("FLEX"), ("FLEX", None))
        self.assertEqual(A.series("CFI"), ("CFI", None))
        self.assertEqual(A.series("ACME CLD Flame"), ("CLD", None))


class MentionsTest(unittest.TestCase):
    def accs(self, text, cands=SAFFIRE):
        return [sorted(a) for _, a in A.mentions(text, cands)]

    def test_lists_and_ranges(self):
        self.assertEqual(self.accs("Experiments (Saffire-I, -II, and -III) were"), [["PSI-100", "PSI-98", "PSI-99"]])
        self.assertEqual(self.accs("The sample for Saffire-I and III is"), [["PSI-100", "PSI-98"]])
        self.assertEqual(self.accs("Dates for SaffireI-III"), [["PSI-100", "PSI-98", "PSI-99"]])
        self.assertEqual(self.accs("Saffire-II has a sample card"), [["PSI-99"]])

    def test_series_name_alone_means_all(self):
        self.assertEqual(self.accs("the Saffire in Cygnus"), [["PSI-100", "PSI-98", "PSI-99"]])

    def test_base_name_is_its_own_investigation(self):
        self.assertEqual(self.accs("results from FLEX and FLEX-2", FLEX), [["PSI-69"], ["PSI-68"]])
        self.assertEqual(self.accs("a flexible tube", FLEX), [])


class AssignTest(unittest.TestCase):
    TEXT = ("Saffire-I, -II and -III fly on Cygnus. " + "filler words here. " * 40 +
            "The sample material for Saffire-I and III is SIBAL cloth, which burns like cotton but keeps "
            "its structure. " + "more filler text. " * 40 +
            "Saffire-II has a sample card with nine samples whose maximum oxygen concentration is near 21 percent.")

    def test_nearest_preceding_mention(self):
        self.assertEqual(A.assign(self.TEXT, "SIBAL cloth burns like cotton but keeps its structure", SAFFIRE),
                         {"PSI-98", "PSI-100"})
        self.assertEqual(A.assign(self.TEXT, "nine samples maximum oxygen concentration near 21 percent", SAFFIRE),
                         {"PSI-99"})

    def test_paper_level_fallback(self):
        text = "Cool flames were first seen in FLEX. " + "x " * 2000 + "Large droplets burned with cool flames."
        self.assertEqual(A.assign(text, "Large droplets burned with cool flames", FLEX), {"PSI-69"})

    def test_unattributable(self):
        self.assertIsNone(A.assign("No experiment is named here.", "named here", FLEX))


if __name__ == "__main__":
    unittest.main()
