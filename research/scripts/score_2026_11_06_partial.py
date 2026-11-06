"""Replay Nov6 pre-close, partial group A settlements; never edits forecasts."""
from __future__ import annotations
import json
from pathlib import Path
from financesim.scorecards import macro_scorecard

def main():
    root = Path(__file__).resolve().parents[2]
    forecast = json.loads((root / "research/weekly/2026-10-31-forecast.json").read_text())
    first = json.loads((root / "research/inputs/2026-11-06-preclose-first-releases.json").read_text())
    z = macro_scorecard(forecast, first["actuals"], evaluation_as_of=first["retrieved_at"])
    assert z["settled"] == 6
    assert set(z["pending"]) == {"nonfarm_payroll_nov06", "unemployment_rate_nov06"}
    compact = {"settled":z["settled"], "pending":z["pending"],
               "by_arm":{k:{"n":v["n"],"mean_brier":v["mean_brier"],
                            "coverage_50":v["coverage_50"],
                            "coverage_90":v["coverage_90"],
                            "skill":v["brier_skill_vs_statistical"],
                            "per_unit":v["per_unit"]}
                        for k,v in z["by_arm"].items()}}
    print(json.dumps(compact,indent=2,ensure_ascii=False))
if __name__ == "__main__":
    main()
