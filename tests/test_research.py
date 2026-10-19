import copy
import unittest
from financesim.research import ResearchError, seal, verify, score_weekly

CUTOFF = "2026-10-24T12:00:00+09:00"
EVIDENCE = [{"id": "official-source-1", "url": "https://example.org/data",
             "claim": "A numeric release was published",
             "published_at": "2026-10-23T09:00:00+09:00",
             "accessed_at": "2026-10-24T11:00:00+09:00",
             "feature": {"name": "unemployment_change", "value": 2.5, "unit": "thousands"}}]


def predictions():
    arm = {"point_change": 1.0, "prob_positive": 0.6,
           "interval_change_80": [-3.0, 5.0], "rationale": "example",
           "model_id": "baseline-v0"}
    return {"predictions": [{
        "target_id": "sample-index-week-1", "unit": "pct",
        "definition": "Friday close to next Friday close, simple percent return",
        "target_at": "2026-10-30T17:00:00+09:00",
        "arms": {kind: dict(arm) for kind in ("llm", "statistical", "hybrid")}
    }]}


class ResearchTests(unittest.TestCase):
    def test_roundtrip_and_tamper(self):
        r = seal("weekly_forecast", predictions(), as_of=CUTOFF, evidence=EVIDENCE)
        self.assertTrue(verify(r))
        tampered = copy.deepcopy(r)
        tampered["payload"]["predictions"][0]["arms"]["llm"]["point_change"] = 100
        with self.assertRaises(ResearchError):
            verify(tampered)

    def test_evidence_future_information_refused(self):
        future = copy.deepcopy(EVIDENCE)
        future[0]["published_at"] = "2026-10-25T09:00:00+09:00"
        future[0]["accessed_at"] = "2026-10-25T10:00:00+09:00"
        with self.assertRaises(ResearchError):
            seal("observation", {"summary": "bad"}, as_of=CUTOFF, evidence=future)

    def test_missing_arm_refused(self):
        p = predictions()
        del p["predictions"][0]["arms"]["llm"]
        with self.assertRaises(ResearchError):
            seal("weekly_forecast", p, as_of=CUTOFF)

    def test_expired_target_refused(self):
        p = predictions()
        p["predictions"][0]["target_at"] = "2026-10-20T17:00:00+09:00"
        with self.assertRaises(ResearchError):
            seal("weekly_forecast", p, as_of=CUTOFF)

    def test_scoring_uniform_and_missing(self):
        r = seal("weekly_forecast", predictions(), as_of=CUTOFF)
        res = score_weekly(r, {"sample-index-week-1": -1.0})
        self.assertAlmostEqual(res["by_arm"]["llm"]["mean_brier"], 0.36)
        self.assertEqual(res["by_arm"]["hybrid"]["n"], 1)
        self.assertEqual(res["by_arm"]["statistical"]["rows"][0]["absolute_error"], 2.0)
        no_result = score_weekly(r, {})
        self.assertEqual(no_result["missing_targets"], ["sample-index-week-1"])
        self.assertIsNone(no_result["by_arm"]["llm"]["mean_brier"])

    def test_experiment_cutoff(self):
        payload = {"hypothesis_id": "h1", "code_commit": "abcdef", "result": "no improvement",
                   "baseline": "naive", "dataset_cutoff": "2026-10-25T00:00:00+09:00"}
        with self.assertRaises(ResearchError):
            seal("experiment", payload, as_of=CUTOFF)

    def test_timezones_mandatory(self):
        with self.assertRaises(ResearchError):
            seal("observation", {"summary": "x"}, as_of="2026-10-24T12:00:00")


if __name__ == "__main__":
    unittest.main()
