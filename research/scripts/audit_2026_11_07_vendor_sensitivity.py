"""Check Nov7 market-score robustness to two documented alternate price sources.

Does not revise or overwrite historical forecasts, settlements or source inputs.
Reuters WTI prices form only a conditional alternate: the precise futures
contract pair is NOT independently authenticated from those news articles.
Execute at repository root:
    python research/scripts/audit_2026_11_07_vendor_sensitivity.py
"""
from __future__ import annotations

import json
from math import isclose, sqrt
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parents[2]

def load(rel):
    return json.loads((ROOT / rel).read_text(encoding="utf-8"))

def pct(a, b):
    if a <= 0 or b <= 0:
        raise ValueError("percentage returns require positive levels")
    return 100.0 * (b / a - 1)

def audit():
    source = load("research/inputs/2026-11-07-vendor-sensitivity.json")
    ver = load("research/weekly/2026-11-07-verification.json")
    frozen = load("research/weekly/2026-10-31-forecast.json")
    old = ver["rows"]["C"]
    alt = {}
    individual = {}
    for name, quote in source["cases"].items():
        if name not in old or name not in frozen["market_forecasts"]:
            raise AssertionError("not a frozen C target: " + name)
        if quote["alternative_evidence_status"].startswith("Published Reuters") and name != "wti":
            raise AssertionError("unexpected source pairing")
        old_ret = pct(quote["old_reference"], quote["old_end"])
        alt_ret = pct(quote["alternative_reference"], quote["alternative_end"])
        if not isclose(old_ret, old[name]["observed_change"], abs_tol=1e-5):
            raise AssertionError("old source quote mismatch: " + name)
        alt[name] = alt_ret
        individual[name] = {
            "old_return_pct": old_ret,
            "alternative_return_pct": alt_ret,
            "difference_percentage_points": alt_ret - old_ret,
            "sign_changed": (old_ret > 0) != (alt_ret > 0),
            "provisional": name == "wti",
            "arms": {},
        }
        for arm, fc in frozen["market_forecasts"][name]["arms"].items():
            intervals = {}
            for coverage in (50, 80, 90):
                lo, hi = fc["interval_" + str(coverage)]
                alpha = 1 - coverage / 100.0
                old_covered = lo <= old_ret <= hi
                alt_covered = lo <= alt_ret <= hi
                score = (hi-lo) + 2 / alpha * max(0, lo-alt_ret) + 2 / alpha * max(0, alt_ret-hi)
                intervals[str(coverage)] = {"old_covered":old_covered, "alt_covered":alt_covered,
                                             "alternate_interval_score":score}
            individual[name]["arms"][arm] = {
                "original_absolute_error": abs(old_ret-fc["point_change"]),
                "alternate_absolute_error": abs(alt_ret-fc["point_change"]),
                "brier_invariant": (old_ret > 0) == (alt_ret > 0),
                "intervals": intervals,
            }
    aggregate = {}
    for arm in ("llm", "statistical", "hybrid"):
        pairs = [
            (row["observed_change"]-row["arms"][arm]["point_change"],
             alt.get(name,row["observed_change"])-row["arms"][arm]["point_change"])
            for name, row in old.items()
            if row["unit"] == "percent_return"
        ]
        original = [p[0] for p in pairs]
        alternate = [p[1] for p in pairs]
        mae = lambda xs: mean(abs(x) for x in xs)
        rmse = lambda xs: sqrt(mean(x*x for x in xs))
        aggregate[arm] = {"n":len(pairs),
            "old_mae_percent_points":mae(original),
            "alternative_mae_percent_points":mae(alternate),
            "delta_mae_percent_points":mae(alternate)-mae(original),
            "old_rmse_percent_points":rmse(original),
            "alternative_rmse_percent_points":rmse(alternate)}
        if len(pairs)!=9:
            raise AssertionError("all nine original price-return targets required")
    if not isclose(individual["wti"]["alternative_return_pct"], -12.764118325, abs_tol=1e-6):
        raise AssertionError("WTI alternative return mismatch")
    if not isclose(individual["usdjpy"]["alternative_return_pct"], 0.584015743, abs_tol=1e-6):
        raise AssertionError("JPY alternative return mismatch")
    if any(x["sign_changed"] for x in individual.values()):
        raise AssertionError("unexpected direction flip, requires review")
    return {"record_type":"FinanceSim_source_sensitivity_replay", "source_input":"research/inputs/2026-11-07-vendor-sensitivity.json",
       "conditional_experiment":True, "quotes":individual, "market_C_nine_percent_return_error_sensitivity":aggregate,
       "notes":"No model rerun, no fit, no amended historical scores. Alternative WTI contract identity unproven; USDJPY two daily vendors differ by cutoff. Score changes cannot be used as realized forecast skill."}

if __name__ == "__main__":
    print(json.dumps(audit(), ensure_ascii=False, indent=2, sort_keys=True))
