import unittest

from pipeline.fetch import ntrs


class MatchTest(unittest.TestCase):
    def test_exact_title_with_markup_matches(self):
        results = [{"title": "Unrelated paper about rockets"},
                   {"title": "Effect of CO<sub>2</sub> on Flame Spread"}]
        hit, score = ntrs.best_match("Effect of CO2 on flame spread", results)
        self.assertEqual(hit["title"], "Effect of CO<sub>2</sub> on Flame Spread")
        self.assertGreaterEqual(score, ntrs.MIN_SIMILARITY)

    def test_similar_but_different_title_is_rejected(self):
        results = [{"title": "Flame spread over thin fuels in normal gravity"}]
        hit, _ = ntrs.best_match("Flame spread over thick fuels in microgravity", results)
        self.assertIsNone(hit)

    def test_no_results(self):
        self.assertEqual(ntrs.best_match("anything", []), (None, 0.0))


class PaperRecordTest(unittest.TestCase):
    def test_fields(self):
        raw = {"id": 20160000593, "title": "Results from the BASS-II Experiment",
               "distributionDate": "2016-01-04T00:00:00.0000000+00:00",
               "authorAffiliations": [{"meta": {"author": {"name": "Ferkul, Paul"}}}],
               "downloads": [{"links": {"pdf": "/api/x.pdf", "fulltext": "/api/x.txt"}}],
               "copyright": {"determination": "PUBLIC_USE_PERMITTED"}}
        p = ntrs.paper_record(raw)
        self.assertEqual(p["ntrs_id"], "20160000593")
        self.assertEqual(p["year"], "2016")
        self.assertEqual(p["authors"], ["Ferkul, Paul"])
        self.assertEqual(p["url"], "https://ntrs.nasa.gov/citations/20160000593")
        self.assertTrue(p["fulltext_url"].endswith("/api/x.txt"))

    def test_no_downloads(self):
        p = ntrs.paper_record({"id": 1, "title": "x"})
        self.assertIsNone(p["pdf_url"])
        self.assertIsNone(p["fulltext_url"])


if __name__ == "__main__":
    unittest.main()
