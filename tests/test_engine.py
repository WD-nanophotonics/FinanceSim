import math
import unittest
from financesim import ForecastError, backtest, forecast


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.series = {"index": [100.0 + i * 0.4 + (i % 7)*0.2 for i in range(100)],
                       "yield": [3.0 + i*0.001 for i in range(100)]}

    def test_single_unified_api_multi_target(self):
        out = forecast(self.series, indicators=["index", "yield"], method="drift", horizon=5, lookback=26)
        self.assertEqual(set(out["predictions"]), {"index", "yield"})
        self.assertEqual(out["horizon"], 5)
        self.assertLess(out["predictions"]["index"]["interval"][0], out["predictions"]["index"]["interval"][1])

    def test_no_peeking_from_future(self):
        first = forecast({"x": self.series["index"][:70]}, lookback=20)
        second = forecast({"x": self.series["index"][:70]}, lookback=20)
        self.assertEqual(first, second)
        self.assertNotEqual(first, forecast({"x": self.series["index"]}, lookback=20))

    def test_naive_and_constant_series(self):
        out = forecast({"x": [2.0]*30}, lookback=10)["predictions"]["x"]
        self.assertEqual(out["point"], 2)
        self.assertEqual(out["interval"], [2, 2])
        self.assertEqual(out["change_probability_positive"], 0.5)

    def test_simulation_reproducible(self):
        a = forecast(self.series, seed=42, simulations=100, lookback=20)
        b = forecast(self.series, seed=42, simulations=100, lookback=20)
        self.assertEqual(a,b)

    def test_strict_validation(self):
        for values in ([1,2,float('nan')]*10, [1,2,float('inf')]*10, []):
            with self.assertRaises(ForecastError):
                forecast({"x": values}, lookback=3)
        for kwargs in ({"horizon": 0},{"lookback": 2},{"method": "magic"},{"interval": 1.0}, {"simulations": -1}):
            with self.assertRaises(ForecastError):
                forecast(self.series, **kwargs)
        with self.assertRaises(ForecastError):
            forecast(self.series, indicators=["absent"])

    def test_backtest_out_of_sample_and_metrics(self):
        bt = backtest(self.series, indicators=["index"], method="naive", horizon=5, lookback=26)
        m = bt["metrics"]["index"]
        self.assertGreater(m["n"], 5)
        self.assertTrue(math.isfinite(m["mae"]))
        self.assertTrue(all(x["target_index"] == x["origin_index"]+5 for x in m["rows"]))
        self.assertTrue(all(0 <= x["brier"] <= 1 for x in m["rows"]))

    def test_backtest_rejects_too_short(self):
        with self.assertRaises(ForecastError):
            backtest({"x":[1.0]*28}, lookback=26, horizon=5)


if __name__ == "__main__":
    unittest.main()
