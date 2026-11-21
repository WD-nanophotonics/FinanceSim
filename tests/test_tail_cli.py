import base64
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from financesim.tail_experiment import ROOT, import_panel, main, remote_receipt
from financesim.tail_risk import TailRiskError, cumulative, generate, launch_lock, score, sealed
from test_tail_risk import NOW, fixture, outcome, receipt


class ParallelCliTests(unittest.TestCase):
    def test_preflight_and_malformed_request_exit(self):
        self.assertEqual(main(["preflight"]), 0)
        self.assertEqual(main(["score", "missing.json", "missing-actual.json", "-o", "unused.json"]), 2)

    def test_panel_import_preserves_raw_hash_and_refuses_missing_open(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            s, _ = fixture()
            calendar = [{k: v for k, v in r.items() if k != "values"} for r in s["history"]]
            (root/"calendar.json").write_text(json.dumps(calendar))
            spec = {k: v for k, v in s.items() if k not in ("history", "legacy_original", "legacy_forecast")}
            spec["history_calendar_file"] = "calendar.json"
            spec["series_files"] = {}
            for k in s["sources"]:
                path = root/(k+".csv")
                path.write_text("date,value\n"+"\n".join(f"{r['date']},{r['values'][k]}" for r in s["history"]))
                spec["series_files"][k] = {"path": path.name, "date_column": "date", "value_column": "value"}
            (root/"bundle.json").write_text(json.dumps(spec))
            got = import_panel(root/"bundle.json")
            self.assertEqual(got["history"], s["history"])
            self.assertEqual(len(got["raw_sha256"]), 4)
            spec["normalization_scales"] = dict.fromkeys(s["sources"], None)
            (root/"bundle.json").write_text(json.dumps(spec))
            derived = import_panel(root/"bundle.json")
            self.assertTrue(all(v > 0 for v in derived["normalization_scales"].values()))
            self.assertEqual(derived["normalization_scales"], import_panel(root/"bundle.json")["normalization_scales"])
            (root/"sp500.csv").write_text("date,value\n")
            with self.assertRaisesRegex(TailRiskError, "missing"):
                import_panel(root/"bundle.json")

    def test_remote_receipt_checks_bytes_and_added_history_without_network(self):
        s, p = fixture()
        f = generate(s, p, now=NOW, demo=True)
        path = ROOT/"research/parallel/forecasts/synthetic-test.json"
        encoded = (json.dumps(f)+"\n").encode()
        commit = "b"*40
        relative = "research/parallel/forecasts/synthetic-test.json"
        def run(command, **kwargs):
            query = command[-1]
            if "commits?path=" in query:
                return json.dumps([{"sha": commit, "commit": {"committer": {"date": "2026-11-28T02:55:00Z"}}}]).encode()
            if "contents/" in query:
                return json.dumps({"encoding": "base64", "content": base64.b64encode(encoded).decode()}).encode()
            if query.endswith(s["code_commit"]):
                return json.dumps({"commit": {"committer": {"date": "2026-11-21T00:00:00Z"}}}).encode()
            return json.dumps({"files": [{"filename": relative, "status": "added"}]}).encode()
        with patch("financesim.tail_experiment.read", return_value=f), patch.object(Path, "read_bytes", return_value=encoded):
            r = remote_receipt(path, "WD-nanophotonics/FinanceSim", runner=run)
            self.assertTrue(r["remote_content_verified"])
            def mismatched(command, **kwargs):
                if "contents/" in command[-1]:
                    return json.dumps({"encoding": "base64", "content": "e30="}).encode()
                return run(command, **kwargs)
            with self.assertRaisesRegex(TailRiskError, "bytes"):
                remote_receipt(path, "WD-nanophotonics/FinanceSim", runner=mismatched)

    def test_26_week_checkpoint_runs_paired_block_bootstrap(self):
        # Synthetic score/admission fixtures; no simulated record is a live result.
        from datetime import datetime, timedelta
        s, p = fixture()
        f = generate(s, p, now=NOW, demo=True)
        f.pop("sha256")
        f.update(dataset_kind="real", demo=False)
        first = sealed(f)
        lock = launch_lock(first)
        cohorts = []
        for i in range(26):
            r = copy.deepcopy(f)
            for key in ("information_cutoff", "generated_at", "target_start_at"):
                r[key] = (datetime.fromisoformat(r[key])+timedelta(weeks=i)).isoformat()
            for t in r["targets"].values():
                t["observed_at"] = (datetime.fromisoformat(t["observed_at"])+timedelta(weeks=i)).isoformat()
            if i:
                r["launch_lock_sha256"] = lock["sha256"]
            r = sealed(r)
            # Keep the first lock tied to the identical generated first record.
            if i == 0:
                self.assertEqual(r, first)
            actual = outcome(r)
            for o in actual.values():
                o["available_at"] = (datetime.fromisoformat(o["observed_at"])+timedelta(hours=3)).isoformat()
            end = (datetime.fromisoformat(actual["sp500"]["available_at"])+timedelta(hours=2)).isoformat()
            verification = score(r, actual, evaluation_as_of=end)
            committed = (datetime.fromisoformat(r["generated_at"])+timedelta(minutes=5)).isoformat()
            cohorts.append({"forecast": r, "verification": verification, "receipt": receipt(r, committed)})
        result = cumulative(cohorts, lock, bootstrap_draws=100)
        self.assertEqual(result["admitted_weeks"], 26)
        self.assertTrue(result["checkpoint"])
        self.assertIsNotNone(result["comparisons"]["joint_fhs"]["ewma_gaussian"]["moving_block_bootstrap_95_interval"])
        self.assertEqual(result["risk_calibration"]["joint_fhs"]["sp500_down_5"]["n"], 26)
        self.assertFalse(result["promote"])

    def test_production_window_and_20000_draws_synthetic_only(self):
        from datetime import date, timedelta
        from math import exp
        s, _ = fixture()
        p = json.loads((ROOT/"research/parallel/policies/tail-risk-v1.json").read_text())
        d, i, values, rows = date(2020, 1, 1), 0, [100.0, 200.0, 4.0], []
        while d <= date(2026, 11, 27):
            if d.weekday() < 5:
                x = -.8 if i % 11 == 0 else .1
                values = [values[0]*exp(x/100), values[1]*exp(1.5*x/100), values[2]+(.01 if i % 2 else -.01)]
                rows.append({"date": d.isoformat(), "observed_at": d.isoformat()+"T22:00:00Z",
                             "sessions": dict.fromkeys(s["sources"], True), "values": dict(zip(s["sources"], values))})
                i += 1
            d += timedelta(days=1)
        s["history"] = rows
        for j, k in enumerate(s["sources"]):
            s["legacy_original"]["market_forecasts"][k]["reference_level"] = values[j]
        from financesim.tail_risk import legacy_sidecar
        s["legacy_forecast"] = legacy_sidecar(s["legacy_original"], s)
        f = generate(s, p, now=NOW, demo=True)
        self.assertEqual(f["policy"]["draws"], 20000)
        self.assertGreater(f["fit"]["eligible_blocks"], 20)
        self.assertTrue(f["demo"])


if __name__ == "__main__":
    unittest.main()
