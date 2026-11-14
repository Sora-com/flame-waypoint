import unittest

from pipeline.extract import checks

SOURCE = ("Tests were run at oxygen concentrations from 0.17 to 0.40 mole fraction "
          "and pressures of 0.7 to 3.0 atm. The flow speed in the duct ranged from "
          "0 to 55 cm/s. A second set used 34% oxygen at 10.2 psia. "
          "BASS-II used airflow speeds up to 40 cm/s.")


def rng(lo, hi, unit):
    return {"min": lo, "max": hi, "unit": unit}


def cond(label, evidence, oxygen=None, pressure=None, flow=None, fuel=None):
    none = rng(None, None, None)
    return {"label": label, "fuel": fuel, "evidence": evidence,
            "oxygen": oxygen or none, "pressure": pressure or none, "flow_speed": flow or none}


class EvidenceTest(unittest.TestCase):
    def test_verbatim_and_elided(self):
        good, w = checks.verify_evidence(
            ["34% oxygen at 10.2 psia", "Tests were run ... pressures of 0.7 to 3.0 atm",
             "invented sentence"], SOURCE)
        self.assertEqual(len(good), 2)
        self.assertIn("evidence not found", w[0])

    def test_string_evidence_accepted(self):
        good, _ = checks.verify_evidence("34% oxygen at 10.2 psia", SOURCE)
        self.assertEqual(good, ["34% oxygen at 10.2 psia"])


class RangeTest(unittest.TestCase):
    def test_flow_speed_copied_into_oxygen_is_dropped(self):
        out, w = checks.check_range("oxygen", rng(21, 21, "%"), ["ranged from 0 to 55 cm/s"])
        self.assertIsNone(out)

    def test_number_without_matching_unit_is_rejected(self):
        ev = ["a 2.2 cm wide fabric sample burned at flow speeds of 5 to 10 cm/s"]
        out, w = checks.check_range("flow_speed", rng(2.2, 10, "cm/s"), ev)
        self.assertEqual((out["min"], out["max"]), (None, 10))
        out, _ = checks.check_range("flow_speed", rng(5, 10, "cm/s"), ev)
        self.assertEqual((out["min"], out["max"]), (5, 10))

    def test_unit_tagged_runs(self):
        self.assertEqual(checks.numbers_with_unit("oxygen", "oxygen from 14 to 21% in nitrogen"), {14, 21})
        self.assertEqual(checks.numbers_with_unit("oxygen", "oxygen mole fraction of 0.21"), {0.21})
        self.assertEqual(checks.numbers_with_unit("pressure", "0.5, 1 and 3 atm"), {0.5, 1, 3})
        self.assertEqual(checks.numbers_with_unit("flow_speed", "a 2.2 cm sample"), set())

    def test_one_sided_range_keeps_stated_bound(self):
        out, w = checks.check_range("flow_speed", rng(0, 40, "cm/s"), ["airflow speeds up to 40 cm/s"])
        self.assertEqual((out["min"], out["max"]), (None, 40))
        self.assertIn("min 0 not in evidence", w[0])

    def test_missing(self):
        self.assertEqual(checks.check_range("x", rng(None, None, None), []), (None, []))


class ConditionTest(unittest.TestCase):
    def test_moon_base_condition(self):
        c = cond("Moon base atmosphere", ["34% oxygen at 10.2 psia"],
                 oxygen=rng(34, 34, "%"), pressure=rng(10.2, 10.2, "psia"))
        out, w = checks.clean_condition(c, SOURCE)
        self.assertEqual(out["oxygen_pct"], {"min": 34, "max": 34})
        self.assertAlmostEqual(out["pressure_kpa"]["min"], 70.327, places=2)
        self.assertEqual(w, [])

    def test_mole_fraction_and_atm(self):
        c = cond("range", ["from 0.17 to 0.40 mole fraction", "pressures of 0.7 to 3.0 atm"],
                 oxygen=rng(0.17, 0.40, "mole fraction"), pressure=rng(0.7, 3.0, "atm"))
        out, _ = checks.clean_condition(c, SOURCE)
        self.assertEqual(out["oxygen_pct"], {"min": 17.0, "max": 40.0})
        self.assertAlmostEqual(out["pressure_kpa"]["max"], 303.975, places=2)

    def test_wrong_quote_is_repaired_from_source(self):
        src = ("Consider O2/N2 ambients with various pressures. NASA-considered atmospheres "
               "will be examined: 14.7 psia, 21 % oxygen: 10.2 psia, 26.5 %; and 8.2 psia, 34 % oxygen.")
        c = cond("exploration", ["Consider O2/N2 ambients with various pressures."],
                 oxygen=rng(34, 34, "%"), pressure=rng(8.2, 8.2, "psia"))
        out, w = checks.clean_condition(c, src)
        self.assertEqual(out["oxygen_pct"], {"min": 34, "max": 34})
        self.assertEqual(out["evidence"], ["and 8.2 psia, 34 % oxygen."])
        self.assertIn("evidence repaired", w[0])

    def test_other_gas_percentage_is_not_oxygen(self):
        self.assertEqual(checks.numbers_with_unit("oxygen", "oxygen issuing into 4% ethylene"), set())
        self.assertEqual(checks.numbers_with_unit("oxygen", "21% oxygen and 79% nitrogen"), {21})

    def test_unicode_minus_range(self):
        self.assertEqual(checks.numbers_with_unit("pressure", "test pressure (0.5 − 1.5 atm)"), {0.5, 1.5})

    def test_condition_without_verified_values_is_dropped(self):
        c = cond("fake", ["invented sentence"], oxygen=rng(30, 30, "%"))
        out, w = checks.clean_condition(c, SOURCE)
        self.assertIsNone(out)
        self.assertTrue(any("evidence not found" in x for x in w))

    def test_unknown_unit(self):
        out, w = checks.to_si("pressure", rng(1, 2, "furlongs"), checks.TO_KPA)
        self.assertIsNone(out)


class CleanTest(unittest.TestCase):
    def test_two_conditions_tagged_with_source(self):
        raw = {"fuels": ["PMMA", " PMMA ", ""],
               "conditions": [
                   cond("air", ["34% oxygen at 10.2 psia"], oxygen=rng(34, 34, "%")),
                   cond("flow", ["airflow speeds up to 40 cm/s"], flow=rng(None, 40, "cm/s")),
                   cond("bad", ["nothing"], oxygen=rng(50, 50, "%"))]}
        out, w = checks.clean(raw, SOURCE, "ntrs:123")
        self.assertEqual(out["fuels"], ["PMMA"])
        self.assertEqual([c["label"] for c in out["conditions"]], ["air", "flow"])
        self.assertTrue(all(c["source"] == "ntrs:123" for c in out["conditions"]))
        self.assertTrue(all(x.startswith("ntrs:123:") for x in w))


if __name__ == "__main__":
    unittest.main()
