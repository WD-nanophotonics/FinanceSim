"""Synthetic fixtures only: numerical invariants, leakage and live admission."""
import copy
from datetime import date, timedelta
import json
from math import exp
from pathlib import Path
import tempfile
import unittest

from financesim.tail_risk import (EXPERIMENTS, IDS, LEGACY, TailRiskError, admission,
    cumulative, digest, distribution_score, generate, launch_lock, legacy_sidecar,
    prepare, score, sealed, verify, write_new)

ROOT = Path(__file__).resolve().parents[1]
NOW = "2026-11-28T02:50:00+00:00"


def fixture():
    p = json.loads((ROOT/"research/parallel/policies/tail-risk-v1.json").read_text())
    p.update(warmup_changes=10, residual_window=80, min_blocks=10, draws=400)
    rows, d, i = [], date(2026, 6, 1), 0
    values = [100.0, 200.0, 4.0]
    while d <= date(2026, 11, 27):
        if d.weekday() < 5:
            # Strong observed cross-equity co-movement and asymmetric shocks.
            x = -2.2 if i % 17 == 0 else (0.5 if i % 3 == 0 else 0.1)
            values = [values[0]*exp(x/100), values[1]*exp(1.5*x/100), values[2]+(0.015 if i % 2 else -0.02)]
            rows.append({"date": d.isoformat(), "observed_at": d.isoformat()+"T22:00:00+00:00",
                         "sessions": dict.fromkeys(IDS, True), "values": dict(zip(IDS, values))})
            i += 1
        d += timedelta(days=1)
    sources = {k: {"source_url": "https://example.org/"+k, "instrument": k, "vendor": "synthetic",
                   "unit": "percent_yield" if k == "us10y" else "index",
                   "quote_type": "official_par_yield" if k == "us10y" else "close",
                   "close_rule": "synthetic 22:00 UTC"} for k in IDS}
    s = {"dataset_kind": "synthetic", "information_cutoff": "2026-11-28T12:00:00+09:00",
         "acquired_at": "2026-11-28T02:00:00+00:00", "code_commit": "a"*40,
         "sources": sources, "history": rows, "target_start_at": "2026-11-30T00:00:00+00:00",
         "target_calendar": [{"date": "2026-12-0"+str(i), "sessions": dict.fromkeys(IDS, True),
                              "source_url": "https://example.org/calendar"} for i in range(1, 5)],
         "targets": {k: {"observed_at": "2026-12-04T22:00:00+00:00"} for k in IDS},
         "normalization_scales": {"sp500": 2, "nasdaq100": 3, "us10y": 20},
         "llm_overlay": {"authored_at": "2026-11-28T01:00:00+00:00", "rationale": "synthetic no overlay",
                         "probabilities": {"none": 1, "growth_risk_off": 0, "inflation_risk_off": 0, "rebound": 0}}}
    s["target_calendar"].insert(0, {"date": "2026-11-30", "sessions": dict.fromkeys(IDS, True), "source_url": "https://example.org/calendar"})
    old = {"information_cutoff": s["information_cutoff"], "market_forecasts": {
        k: {"reference_level": values[j], "source": sources[k]["source_url"], "target_date": "2026-12-04",
            "unit": "basis_points" if k == "us10y" else "percent_return",
            "arms": {a: {"point_change": 0, "prob_positive": .5,
                          "interval_50": [-1, 1], "interval_80": [-3, 3], "interval_90": [-4, 4]} for a in LEGACY}} for j, k in enumerate(IDS)}}
    s["legacy_original"] = old
    s["legacy_forecast"] = legacy_sidecar(old, s)
    return s, p


def outcome(record, changes=None):
    changes = changes or {"sp500": -8, "nasdaq100": -10, "us10y": -23}
    return {k: {"status": "verified", "value": record["reference"][k]+changes[k]/100 if k == "us10y" else record["reference"][k]*(1+changes[k]/100),
                "observed_at": record["targets"][k]["observed_at"], "available_at": "2026-12-05T01:00:00+00:00",
                "source_identity": record["sources"][k]} for k in IDS}


def receipt(record, at="2026-11-28T02:55:00+00:00"):
    return sealed({"forecast_sha256": record["sha256"], "remote_content_verified": True,
                   "commit": "b"*40, "commit_url": "https://github.com/WD-nanophotonics/FinanceSim/commit/"+"b"*40,
                   "committed_at": at})


class ParallelRiskTests(unittest.TestCase):
    def setUp(self):
        self.s, self.p = fixture()

    def generate(self):
        return generate(self.s, self.p, now=NOW, demo=True)

    def test_deterministic_no_mutation_and_ablation(self):
        before = copy.deepcopy(self.s)
        a, b = self.generate(), self.generate()
        self.assertEqual(a, b)
        self.assertEqual(self.s, before)
        self.assertEqual(a["experiments"]["joint_fhs"], a["experiments"]["joint_fhs_llm"])
        self.assertEqual(a["legacy_original"], before["legacy_original"])
        self.assertTrue(verify(a))

    def test_tail_and_joint_probabilities_come_from_same_draws(self):
        a = self.generate()
        for v in EXPERIMENTS:
            e = a["experiments"][v]["events"]
            self.assertLessEqual(e["equities_joint_down_5"], min(e["sp500_down_5"], e["nasdaq100_down_5"]))
        # The fixture's shared log shock implies one standardized equity innovation.
        fit = prepare(self.s, self.p, now=NOW, demo=True)
        for block in fit["blocks"]:
            for x in block:
                self.assertAlmostEqual(x[0], x[1], places=10)

    def test_ewma_independent_numerical_recurrence(self):
        fit = prepare(self.s, self.p, now=NOW, demo=True)
        from math import log
        levels = [r["values"]["sp500"] for r in self.s["history"]]
        x = [100*log(b/a) for a, b in zip(levels, levels[1:])]
        variance = sum(t*t for t in x[:10])/10
        for t in x[10:]:
            variance = .97*variance+.03*t*t
        self.assertAlmostEqual(fit["variances"][0], variance)

    def test_synthetic_cannot_be_live_or_admitted(self):
        with self.assertRaises(TailRiskError):
            generate(self.s, self.p, now=NOW)
        f = self.generate()
        with self.assertRaises(TailRiskError):
            launch_lock(f)

    def test_future_acquisition_observation_and_expired_target(self):
        for field, value in (("acquired_at", "2026-11-28T03:00:01+00:00"),
                              ("target_start_at", "2026-11-28T01:00:00+00:00")):
            s = copy.deepcopy(self.s)
            s[field] = value
            with self.assertRaises(TailRiskError):
                generate(s, self.p, now=NOW, demo=True)
        self.s["history"][-1]["observed_at"] = "2026-11-29T00:00:00+00:00"
        with self.assertRaises(TailRiskError):
            self.generate()

    def test_missing_open_quote_and_missing_weekday_rejected(self):
        self.s["history"][-1]["values"]["sp500"] = None
        with self.assertRaises(TailRiskError):
            self.generate()
        self.s, self.p = fixture()
        del self.s["history"][-5]
        with self.assertRaises(TailRiskError):
            self.generate()

    def test_calendar_not_inferred_from_null_or_future_holiday(self):
        self.s["target_calendar"][1]["sessions"]["us10y"] = False
        self.assertGreater(self.generate()["fit"]["eligible_blocks"], 0)
        self.s, self.p = fixture()
        self.s["target_calendar"][-1]["sessions"]["sp500"] = False
        with self.assertRaisesRegex(TailRiskError, "last open"):
            self.generate()

    def test_explicit_friday_holiday_uses_actual_thursday_target(self):
        self.s["target_calendar"][-1]["sessions"]["sp500"] = False
        self.s["targets"]["sp500"]["observed_at"] = "2026-12-03T22:00:00+00:00"
        self.s["legacy_original"]["market_forecasts"]["sp500"]["target_date"] = "2026-12-03"
        self.s["legacy_forecast"] = legacy_sidecar(self.s["legacy_original"], self.s)
        f = self.generate()
        self.assertEqual(f["targets"]["sp500"]["observed_at"][:10], "2026-12-03")
        self.assertGreater(f["fit"]["eligible_blocks"], 0)

    def test_reference_holiday_keeps_actual_last_open_date(self):
        self.s["history"][-1]["sessions"]["us10y"] = False
        self.s["history"][-1]["values"]["us10y"] = None
        self.s["legacy_original"]["market_forecasts"]["us10y"]["reference_level"] = self.s["history"][-2]["values"]["us10y"]
        self.s["legacy_forecast"] = legacy_sidecar(self.s["legacy_original"], self.s)
        f = self.generate()
        self.assertEqual(f["reference_dates"]["us10y"], "2026-11-26")
        self.assertEqual(f["reference_dates"]["sp500"], "2026-11-27")

    def test_closed_historical_day_is_explicit_and_has_no_imputed_quote(self):
        r = self.s["history"][-10]
        r["sessions"]["us10y"] = False
        r["values"]["us10y"] = None
        self.assertTrue(self.generate()["fit"]["eligible_blocks"] > 0)
        r["values"]["us10y"] = 4
        with self.assertRaisesRegex(TailRiskError, "closed"):
            self.generate()

    def test_legacy_changes_and_measurement_mismatch_refused(self):
        self.s["legacy_forecast"]["market_forecasts"]["sp500"]["arms"]["llm"]["point_change"] = 5
        with self.assertRaisesRegex(TailRiskError, "preserve"):
            self.generate()
        self.s, self.p = fixture()
        self.s["legacy_original"]["market_forecasts"]["sp500"]["reference_level"] = 10000
        self.s["legacy_forecast"] = legacy_sidecar(self.s["legacy_original"], self.s)
        with self.assertRaisesRegex(TailRiskError, "reference"):
            self.generate()

    def test_overlay_bound_and_no_adjustment_future_timestamp(self):
        self.s["llm_overlay"]["probabilities"].update(none=.7, rebound=.3)
        with self.assertRaisesRegex(TailRiskError, "bound"):
            self.generate()
        self.s, self.p = fixture()
        self.s["llm_overlay"]["authored_at"] = "2026-11-28T03:01:00+00:00"
        with self.assertRaises(TailRiskError):
            self.generate()

    def test_interval_score_penalizes_extreme_width_and_miss(self):
        f = {"point_change": 0, "median_change": 0, "prob_positive": .5,
             "intervals": {"50": [-1, 1], "80": [-2, 2], "90": [-3, 3]}}
        s = distribution_score(f, 0)
        # Weighted scores: (.25*2+.1*4+.05*6)/.4 = 3.
        self.assertAlmostEqual(s["weighted_interval_score"], 3)
        self.assertAlmostEqual(s["wis_with_median"], 1.2/3.5)
        self.assertAlmostEqual(s["tail_pinball"], .15)
        broad = copy.deepcopy(f)
        broad["intervals"] = {"50": [-10, 10], "80": [-20, 20], "90": [-30, 30]}
        self.assertGreater(distribution_score(broad, 0)["weighted_interval_score"], s["weighted_interval_score"])
        self.assertGreater(distribution_score(f, -8)["weighted_interval_score"], s["weighted_interval_score"])
        del f["median_change"]
        self.assertIsNone(distribution_score(f, 0)["wis_with_median"])

    def test_yield_units_and_pending_events(self):
        f = self.generate()
        o = outcome(f)
        result = score(f, o, evaluation_as_of="2026-12-05T12:00:00+09:00")
        self.assertAlmostEqual(result["actual_changes"]["us10y"], -23)
        self.assertAlmostEqual(result["actual_changes"]["sp500"], -8)
        self.assertTrue(result["risk"]["joint_fhs"]["equities_joint_down_5"]["actual"])
        del o["nasdaq100"]
        result = score(f, o, evaluation_as_of="2026-12-05T12:00:00+09:00")
        self.assertEqual(result["pending"], ["nasdaq100"])
        self.assertNotIn("equities_joint_down_5", result["risk"]["joint_fhs"])

    def test_mismatched_source_and_unavailable_settlement(self):
        f = self.generate()
        o = outcome(f)
        o["us10y"]["source_identity"] = dict(o["us10y"]["source_identity"], vendor="other")
        with self.assertRaises(TailRiskError):
            score(f, o, evaluation_as_of="2026-12-05T12:00:00+09:00")
        with self.assertRaises(TailRiskError):
            score(f, outcome(f), evaluation_as_of="2026-12-04T00:00:00+00:00")

    def test_exclusive_output_and_tamper_detection(self):
        f = self.generate()
        with tempfile.TemporaryDirectory() as d:
            path = Path(d)/"forecast.json"
            write_new(path, f)
            with self.assertRaises(FileExistsError):
                write_new(path, f)
        f["experiments"]["joint_fhs"]["events"]["us10y_up_25"] = 1
        with self.assertRaises(TailRiskError):
            verify(f)

    def test_publication_and_launch_lock_admission(self):
        # Explicit synthetic metadata exercise, NOT a real live claim.
        f = self.generate()
        f.pop("sha256")
        f.update(dataset_kind="real", demo=False)
        f = sealed(f)
        lock = launch_lock(f)
        self.assertTrue(admission(f, receipt(f), lock)["on_time"])
        self.assertFalse(admission(f, receipt(f, "2026-11-28T03:10:00+00:00"), lock)["on_time"])
        with self.assertRaises(TailRiskError):
            admission(f, receipt(f, "2026-11-30T15:00:00+00:00"), lock)
        altered = copy.deepcopy(lock)
        altered.pop("sha256")
        altered["normalization_scales"]["us10y"] = 1
        with self.assertRaises(TailRiskError):
            admission(f, receipt(f), sealed(altered))
        altered = copy.deepcopy(f)
        altered.pop("sha256")
        altered["policy"]["wis_improvement"] = 0
        with self.assertRaisesRegex(TailRiskError, "embedded"):
            admission(sealed(altered), receipt(sealed(altered)), lock)

    def test_cumulative_replay_duplicate_and_late_exclusion(self):
        f = self.generate()
        f.pop("sha256")
        f.update(dataset_kind="real", demo=False)
        f = sealed(f)
        lock = launch_lock(f)
        s = score(f, outcome(f), evaluation_as_of="2026-12-05T12:00:00+09:00")
        c = {"forecast": f, "verification": s, "receipt": receipt(f)}
        report = cumulative([c], lock, bootstrap_draws=100)
        self.assertEqual(report["admitted_weeks"], 1)
        self.assertFalse(any(report["eligible_for_review"].values()))
        self.assertFalse(report["promote"])
        with self.assertRaisesRegex(TailRiskError, "duplicate"):
            cumulative([c, c], lock)
        c["receipt"] = receipt(f, "2026-11-28T03:10:00+00:00")
        self.assertEqual(cumulative([c], lock)["admitted_weeks"], 0)


if __name__ == "__main__":
    unittest.main()
