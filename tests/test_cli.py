"""Test the one JSON-command dispatch for all research modes."""
import copy
import unittest
from financesim.__main__ import execute
from financesim.research import verify


class CliTests(unittest.TestCase):
    def test_scenario_json_input(self):
        req = {"action": "scenarios", "baseline": {"equity": {"point_change": 1, "std": 0, "unit": "pct"}},
               "events": [{"id": "shock", "probability": 1, "impacts": {"equity": -2}}],
               "parameters": {"simulations": 50, "seed": 7}}
        result = execute(req)
        self.assertAlmostEqual(result["predictions"]["equity"]["point_change"], -1)

    def test_record_json_seal_verify(self):
        req = {
            "action": "seal", "kind": "daily_review", "as_of": "2026-10-19T18:00:00+09:00",
            "payload": {"summary": "synthetic test record", "synthetic_fixture": True}, "evidence": []}
        record = execute(req)
        self.assertTrue(verify(record))
        self.assertTrue(execute({"action": "verify", "record": record})["valid"])

    def test_bad_action(self):
        with self.assertRaises(ValueError):
            execute({"action": "unknown"})

    def test_numeric_backtest_still_available(self):
        series = {"test": [float(i) for i in range(100)]}
        result = execute({"action": "backtest", "data": series, "parameters":
                          {"horizon": 5, "lookback": 20}})
        self.assertIn("test", result["metrics"])


if __name__ == "__main__":
    unittest.main()
