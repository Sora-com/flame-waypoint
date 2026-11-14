import unittest

from pipeline.fetch import psi_tables as pt

FLEX_HEADER = ["FLEX Test #", "FLEX Identifier", "Test Date", "Fuel", "Ambient pressure; mmHg",
               "O initial ambient composition; mole fraction", "N initial ambient composition; mole fraction",
               "CO initial ambient composition; mole fraction", "He initial ambient composition; mole fraction",
               "Droplet initial diameter; mm", "Test end"]


class ColumnTest(unittest.TestCase):
    def test_flex_columns_with_lost_subscripts(self):
        cols = pt.map_columns(FLEX_HEADER)
        self.assertEqual(cols["test_id"], 0)
        self.assertEqual(cols["pressure"], 4)
        self.assertEqual(cols["oxygen"], 5)
        self.assertEqual(cols["co2"], 7)
        self.assertEqual(cols["outcome"], 10)
        self.assertEqual(pt.unit_of(FLEX_HEADER[4]), "mmHg")

    def test_psi117_style_columns(self):
        cols = pt.map_columns(["Fuel", "do (mm)", "P (atm)", "XO2", "XN2", "Data File"])
        self.assertEqual((cols["pressure"], cols["oxygen"], cols["droplet_diameter"]), (2, 3, 1))


class RowTest(unittest.TestCase):
    def test_flex_rows(self):
        rows = [FLEX_HEADER,
                ["19", "196F001", "8/26/2009", "Heptane", "539.1", "0.34", "0.66", "0", "0", "3.39", "Disruption"],
                ["24", "196F003", "10/24/09", "Heptane", "542.8", "0.34", "0.66", "0", "0", "–", "Disruption"],
                ["114", "x", "", "Methanol", "0", "0.2", "0.8", "0", "0", "", "Extinction"],
                ["10", "256F002", "", "Methanol", "2319.7", "0.21", "0.09", "0.7", "0", "3.86", "Extinction"]]
        tests, _, _ = pt.parse_rows(rows, "flex.csv")
        moon, dash, zero, co2 = tests
        self.assertEqual(moon["oxygen_pct"], {"min": 34.0, "max": 34.0})
        self.assertAlmostEqual(moon["pressure_kpa"]["min"], 71.874, places=2)  # ~10.4 psi
        self.assertEqual(moon["issues"], [])
        self.assertEqual(dash["issues"], [])                 # "–" means no data, not an error
        self.assertIsNone(zero["pressure_kpa"])
        self.assertIn("not physical", zero["issues"][0])
        self.assertEqual(co2["diluents"], {"N2": 0.09, "CO2": 0.7})
        self.assertEqual(moon["source"], "flex.csv#row2")

    def test_multiple_header_blocks_and_ranges(self):
        rows = [["Fuel", "do (mm)", "P (atm)", "XO2", "XN2", "Data File"],
                ["n-heptane", "0.5", "1", "0.21", "0.79", "A"],
                ["Fuel", "do (mm)", "P (atm)", "XO2", "XN2", "XHe"],
                ["n-dodecane", "4", "0.5 - 3.0", "0.21", "0.5", "0.29"]]
        tests, _, _ = pt.parse_rows(rows, "readme.xlsx")
        self.assertEqual(len(tests), 2)
        self.assertAlmostEqual(tests[1]["pressure_kpa"]["max"], 303.975, places=2)
        self.assertEqual(tests[1]["diluents"], {"N2": 0.5, "HE": 0.29})

    def test_bre_lists_and_percent_typos(self):
        rows = [["Year", "Month", "Date", "Burner Size (mm)", "Fuel Bottle", "Oxygen Conc (percent)", "Flames Ignited"],
                ["2019", "Feb", "8", "25", "100% C2H4", "21; 26.5; 40", "10"],
                ["2019", "March", "7", "25", "50% C2H4", "3400%", "6"]]
        tests, _, _ = pt.parse_rows(rows, "bre.csv")
        self.assertEqual([t["oxygen_pct"]["min"] for t in tests], [21, 26.5, 40, 34])
        self.assertEqual([t["test_id"] for t in tests[:3]], ["2.1", "2.2", "2.3"])
        self.assertEqual(tests[0]["fuel"], "100% C2H4")
        self.assertIn("read as 34 %", tests[3]["issues"][0])

    def test_bass2_columns(self):
        header = ["Actual Date", "GMT 2014-", "Test no.", "Sample no.", "Material", "Flow restrictor",
                  "Fan display", "Air display", "calibrated  initial O2 % by vol ",
                  "calibrated final O2 % by vol", "Initial CO2 % by vol"]
        cols = pt.map_columns(header)
        self.assertEqual((cols["test_id"], cols["oxygen"], cols["flow"]), (2, 8, 7))
        self.assertNotIn("co2", cols)  # combustion product, not a diluent
        tests, _, _ = pt.parse_rows([header, ["41689", "50", "B3", "148", "100 micron film", "2", "47",
                                              "5, 3,2,1", "22.2", "21.8", "0.43"]], "bass2.xlsx")
        t = tests[0]
        self.assertEqual(t["test_id"], "B3")
        self.assertEqual(t["oxygen_pct"], {"min": 22.2, "max": 22.2})
        self.assertEqual((t["flow_cm_s"]["min"], t["flow_cm_s"]["max"]), (1, 5))
        self.assertIn("unit assumed cm/s", t["issues"][0])

    def test_unit_in_cell_and_design_envelope(self):
        saffire = [["Sample Number ", "Material", "Air Flow ", "Direction"],
                   ["S1", "SIBAL Fabric", "30 cm/s", "Concurrent "]]
        t = pt.parse_rows(saffire, "s3.csv")[0][0]
        self.assertEqual((t["test_id"], t["flow_cm_s"]["min"], t["issues"]), ("S1", 30, []))
        flex2 = [["Sample (Fuel Type)", "Oxygen Mole Fraction", "Ambient Pressure (atm)", "Flow Velocity (cm/s)"],
                 ["Heptane (pure)", "0.17; 0.21;0.25; 0.3", "0.5; 1.0; 1.5; 2.0; or 3.0 ", "0.1 - 5"]]
        t = pt.parse_rows(flex2, "f2.csv")[0][0]
        self.assertEqual(t["kind"], "design_envelope")
        self.assertEqual(t["oxygen_pct"], {"min": 17.0, "max": 30.0})
        self.assertEqual(t["fuel"], "Heptane (pure)")

    def test_acme_normal_and_inverse_flames(self):
        normal = [["Flame Type", "Day", "Fuel", "Test", "Xfuel", "XO2 (init)", "XO2 (final)", "pinit (atm)"],
                  ["Normal", "0", "C2H4", "19115A1", "1", "0.207128374", "0.2062", "1.01184402"]]
        t = pt.parse_rows(normal, "n.csv")[0][0]
        self.assertEqual((t["test_id"], t["fuel"], t["oxygen_pct"]["min"]), ("19115A1", "C2H4", 20.71))
        self.assertAlmostEqual(t["pressure_kpa"]["min"], 102.52, places=1)
        inverse = [["Flame Type", "Day", "Test", "XO2", "XC2H4 initial", "pinit (atm)"],
                   ["Inverse", "1", "21328A1", "0.37082819", "0.2715", "0.99823482"]]
        t = pt.parse_rows(inverse, "i.csv")[0][0]
        self.assertIsNone(t["oxygen_pct"])
        self.assertIn("inverse flame", t["issues"][0])

    def test_atmosphere_text_and_cfi(self):
        sflame = [["Test Type", "Test Day*", "Atmosphere*", "Fuel Bottle", "Flames Ignited*"],
                  ["First round", "19254", "~21% O2 with N2", "50% C2H4 with N2", "13"]]
        t = pt.parse_rows(sflame, "s.csv")[0][0]
        self.assertEqual(t["oxygen_pct"], {"min": 21.0, "max": 21.0})
        cfi = [["Flex Number", "Test Date", "Pressure", "Oxygen", "Nitrogen", "Helium", "Fuel "],
               ["1206", "9-Mar-17", "1 atm", "0.21", "0.79", "0", "C12H26"]]
        t = pt.parse_rows(cfi, "c.csv")[0][0]
        self.assertEqual((t["test_id"], t["fuel"], t["diluents"]), ("1206", "C12H26", {"N2": 0.79}))
        self.assertAlmostEqual(t["pressure_kpa"]["min"], 101.325)

    def test_log_without_conditions(self):
        rows = [["Date", "GMT", "As Run Test #", "Test #", "Sample #", "Fuel Sample Material"],
                ["3/30/2012", "90", "1", "1", "4", "SIBAL 2 cm"]]
        tests, _, _ = pt.parse_rows(rows, "bass.csv")
        self.assertEqual(tests[0]["fuel"], "SIBAL 2 cm")
        self.assertIsNone(tests[0]["oxygen_pct"])


if __name__ == "__main__":
    unittest.main()
