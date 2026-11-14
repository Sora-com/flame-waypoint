import unittest

from pipeline.extract import excerpt

PAPER = """Microgravity Flammability of PMMA Rods
Abstract: Experiments were conducted aboard the ISS. The rods were ig-
nited at the tip.
Tests were performed at oxygen concentrations of 17 to 21%
in nitrogen. The duct flow was varied between 1 and 40 cm/s. Results
are discussed below. The camera recorded the flame.
Nothing numeric here at all. Another plain sentence follows.
References
1. Olson, S. et al., 34% oxygen at 10.2 psia, Combust. Flame (2012).
"""


class ExcerptTest(unittest.TestCase):
    def test_clean_text_dehyphenates_and_drops_references(self):
        text = excerpt.clean_text(PAPER)
        self.assertIn("ignited at the tip", text)
        self.assertNotIn("10.2 psia", text)

    def test_select_keeps_condition_sentences_with_context(self):
        out = excerpt.select(PAPER)
        self.assertIn("oxygen concentrations of 17 to 21% in nitrogen", out)
        self.assertIn("between 1 and 40 cm/s", out)
        self.assertIn("ignited at the tip", out)        # context before
        self.assertNotIn("Nothing numeric", out)

    def test_select_respects_max_chars(self):
        self.assertLessEqual(len(excerpt.select(PAPER * 50, max_chars=300)), 300)

    def test_no_conditions(self):
        self.assertEqual(excerpt.select("Just words. More words."), "")


if __name__ == "__main__":
    unittest.main()
