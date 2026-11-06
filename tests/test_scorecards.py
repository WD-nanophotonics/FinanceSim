import unittest
from financesim.scorecards import macro_scorecard, SettlementError

def frozen():
    base = {"point_change": 1, "prob_positive": 0.6,
            "interval_50": [-2, 2], "interval_90": [-5, 5]}
    return {"forecast_cutoff": "2026-10-31T12:00:00+09:00",
            "macro_forecasts": {
                "test1": {"unit": "index_points", "baseline_level": 10,
                          "arms": {x:dict(base) for x in ("llm","statistical","hybrid")}},
                "pending": {"unit": "thousands_persons", "baseline_level": 20,
                            "arms": {x:dict(base) for x in ("llm","statistical","hybrid")}},
            }}

OUTCOME = {"test1": {"value": 12, "release_version": "first",
                    "released_at": "2026-11-03T10:00:00-05:00",
                    "source_url": "https://example.org/original"}}
NOW = "2026-11-06T20:00:00+09:00"

class MacroSettlementTests(unittest.TestCase):
    def test_scorecard_and_missing(self):
        z = macro_scorecard(frozen(), OUTCOME, evaluation_as_of=NOW)
        self.assertEqual(z["pending"], ["pending"])
        self.assertEqual(z["by_arm"]["llm"]["n"], 1)
        self.assertAlmostEqual(z["by_arm"]["llm"]["rows"][0]["brier"], 0.16)
        self.assertEqual(z["by_arm"]["llm"]["per_unit"]["index_points"]["mae"], 1)

    def test_first_vintage_only(self):
        with self.assertRaises(SettlementError):
            macro_scorecard(frozen(), {"test1": {**OUTCOME["test1"], "release_version": "revised"}},
                            evaluation_as_of=NOW)

    def test_future_release_refused(self):
        with self.assertRaises(SettlementError):
            macro_scorecard(frozen(), {"test1": {**OUTCOME["test1"],
                "released_at": "2026-11-07T10:00:00-05:00"}}, evaluation_as_of=NOW)

    def test_unknown_target_refused(self):
        with self.assertRaises(SettlementError):
            macro_scorecard(frozen(), {"another": OUTCOME["test1"]}, evaluation_as_of=NOW)

    def test_empty_results(self):
        x=macro_scorecard(frozen(), {}, evaluation_as_of=NOW)
        self.assertIsNone(x["by_arm"]["llm"]["mean_brier"])
        self.assertEqual(len(x["pending"]), 2)

if __name__ == "__main__":
    unittest.main()
