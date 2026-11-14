import re
import unittest

from pipeline.ask import assistant
from pipeline.ask.knowledge import Knowledge


class CitationsTest(unittest.TestCase):
    def test_unknown_ids_are_dropped(self):
        text, used = assistant.clean_citations(
            "FLEX tested methanol [PSI-69]. Saffire burned cotton [PSI-999]. LOI is 12 % [ntrs:1, PSI-69].",
            {"PSI-69", "ntrs:1"})
        self.assertEqual(text, "FLEX tested methanol [PSI-69]. Saffire burned cotton. LOI is 12 % [ntrs:1, PSI-69].")
        self.assertEqual(used, ["PSI-69", "ntrs:1"])

    def test_glossary_is_a_valid_source(self):
        _, used = assistant.clean_citations("A cool flame is low-temperature oxidation [glossary].", {"glossary"})
        self.assertEqual(used, ["glossary"])

    def test_made_up_expansions_are_removed(self):
        ctx = "pmma polymethyl methacrylate sibal fabric of 75 % cotton"
        self.assertEqual(assistant.drop_unsupported_expansions(
            "SIBAL (Silicone Impregnated Balsa) and PMMA (polymethyl methacrylate)", ctx),
            "SIBAL and PMMA (polymethyl methacrylate)")


class KnowledgeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.kb = Knowledge()

    def test_facts_list_every_investigation(self):
        facts = self.kb.facts()
        for inv in self.kb.investigations:
            self.assertIn(f"[{inv['accession']}]", facts)
        self.assertIn("MOON BASE ATMOSPHERE", facts)

    def test_search_prefers_the_named_investigation(self):
        top = self.kb.search("What did FLEX find about methanol?", 3)
        self.assertTrue(all(p["about"] == "PSI-69" for p in top))

    def _line(self, prefix):
        return next(l for l in self.kb.facts().splitlines() if l.startswith(prefix))

    def test_test_record_ranking_matches_the_data(self):
        # Independent of which investigations exist: the order must follow table_tests.
        listed = re.findall(r"\[(PSI-\d+)\][^;]*? (\d+)(?:;|\.$)", self._line("Most PSI test records:"))
        counts = [int(n) for _, n in listed]
        self.assertEqual(counts, sorted(counts, reverse=True))
        top = max(self.kb.investigations, key=lambda i: i["table_tests"])
        self.assertEqual(counts[0], top["table_tests"])

    def test_completeness_ranking_matches_site_data(self):
        best = max(i["completeness"]["share"] for i in self.kb.investigations)
        leaders = {i["accession"] for i in self.kb.investigations if i["completeness"]["share"] == best}
        first_group = self._line("Data completeness").split("): ", 1)[1].split(" | ")[0]
        self.assertTrue(first_group.startswith(f"{round(best * 100)} %"))
        self.assertEqual(set(re.findall(r"\[(PSI-\d+)\]", first_group)), leaders)

    def test_new_investigations_enter_the_rankings(self):
        site = Knowledge().site
        new = {**site["investigations"][0], "accession": "PSI-999", "acronym": "NEWEXP",
               "table_tests": 10_000, "completeness": {"share": 1.0, "fields": {}}}
        kb = Knowledge({**site, "investigations": site["investigations"] + [new]})
        self.assertTrue(re.search(r"Most PSI test records: \[PSI-999\] NEWEXP 10000", kb.facts()))
        self.assertIn("[PSI-999] NEWEXP", kb.facts().split("Data completeness")[1].split(" | ")[0])

    def test_verify_flags_claims_absent_from_cited_source(self):
        flags = assistant.verify(self.kb, "- [PSI-10] ACME/Flame Design also observed cool flames [PSI-10].")
        self.assertEqual(flags[0]["not_in_sources"], ["cool"])

    def test_verify_accepts_supported_claims_and_negatives(self):
        self.assertEqual(assistant.verify(self.kb, "The limiting oxygen index for methanol is around 12% to 13% "
                                                   "oxygen by volume [ntrs:20130014061]."), [])
        self.assertEqual(assistant.verify(self.kb, "No ignition temperature data was reported [PSI-100]."), [])

    def test_every_passage_has_a_citable_source(self):
        for p in self.kb.passages:
            self.assertRegex(p["source"], r"^(PSI-\d+|ntrs:\d+|glossary)$")


class SharedScenariosTest(unittest.TestCase):
    def test_dashboard_and_assistant_use_the_same_scenarios(self):
        from pipeline.build.site_data import MOON_ZONE, SCENARIOS
        kb = Knowledge()
        self.assertEqual(kb.site["scenarios"], SCENARIOS)
        self.assertEqual(kb.site["moon_zone"], MOON_ZONE)
        facts = kb.facts()
        self.assertIn(f">= {MOON_ZONE['oxygen_pct_min']:g} % O2 at <= {MOON_ZONE['pressure_psi_max']} psi", facts)
        for scn in SCENARIOS:
            self.assertIn(scn["name"], facts.split("SCENARIOS")[1])


if __name__ == "__main__":
    unittest.main()
