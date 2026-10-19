import unittest
from financesim.scenarios import ScenarioError, simulate_scenarios


class ScenarioTests(unittest.TestCase):
    def setUp(self):
        self.base = {
            "stock": {"point_change": 0.0, "std": 0, "unit": "pct"},
            "bond": {"point_change": 0.0, "std": 0, "unit": "bp"}
        }

    def test_deterministic_event(self):
        out = simulate_scenarios(self.base, [
            {"id": "policy", "probability": 1.0,
             "impacts": {"stock": -2.0, "bond": 5.0}}
        ], simulations=200, seed=4)
        self.assertAlmostEqual(out["predictions"]["stock"]["point_change"], -2.0)
        self.assertEqual(out["predictions"]["stock"]["prob_positive"], 0.0)
        self.assertAlmostEqual(out["predictions"]["bond"]["point_change"], 5.0)

    def test_zero_probability(self):
        out = simulate_scenarios(self.base, [
            {"id": "policy", "probability": 0.0, "impacts": {"stock": -2.0}}
        ], simulations=100)
        self.assertEqual(out["predictions"]["stock"]["point_change"], 0)

    def test_reproducible(self):
        events = [{"id": "event1", "probability": 0.4, "impacts": {"stock": -1.0}}]
        x = simulate_scenarios(self.base, events, simulations=500, seed=21)
        y = simulate_scenarios(self.base, events, simulations=500, seed=21)
        self.assertEqual(x, y)

    def test_malformed_rejected(self):
        with self.assertRaises(ScenarioError):
            simulate_scenarios(self.base, [{"id": "bad", "probability": 1.3,
                                            "impacts": {"stock": 1}}])
        with self.assertRaises(ScenarioError):
            simulate_scenarios(self.base, [{"id": "bad", "probability": 0.5,
                                            "impacts": {"unknown": 1}}])
        with self.assertRaises(ScenarioError):
            simulate_scenarios(self.base, [], simulations=0)


if __name__ == "__main__":
    unittest.main()
