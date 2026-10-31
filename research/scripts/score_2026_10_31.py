"""Recompute Oct24 -> Oct30 skill with Oct31 append-only correction.

This replays published forecast probabilities against independently recorded
settlement levels, without changing the original model output. The corrected
settlement archive is still PROVISIONAL where vendors differ. Its observed
prices must be separately audited against source close conventions.
"""
from __future__ import annotations
import json
from math import isclose
from pathlib import Path
from statistics import mean
import sys


def load(path: str):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def brier(p, outcome):
    return (p - float(outcome)) ** 2


def interval_score(lo, hi, y, coverage):
    alpha = 1.0 - coverage
    return (hi-lo) + 2.0/alpha * max(0.0, lo-y) + 2.0/alpha * max(0.0, y-hi)


def replay(root: Path):
    pre = load(str(root / "research/weekly/2026-10-24-forecast.json"))
    sup = load(str(root / "research/weekly/2026-10-24-1252-risk-and-interval-supplement-canonical.json"))
    ver = load(str(root / "research/weekly/2026-10-31-verification-correction01.json"))
    if pre["sha256"] != ver["original_archive_sha256"]:
        raise AssertionError("original forecast identity mismatch")
    if sup["sha256"] != ver["supplement_archive_sha256"]:
        raise AssertionError("supplement identity mismatch")
    by_id = {z["target_id"]: z for z in pre["payload"]["predictions"]}
    rows = ver["scores"]
    if len(rows) != len(by_id):
        raise AssertionError("target count mismatch")
    group_arms = {g:{a:[] for a in ("llm","statistical","hybrid")} for g in ("A","C")}
    for row in rows:
        target=row["target_id"]
        pred=by_id[target]
        y=row["actual_change"]
        old= row["observed"]
        if "start" in old and "end" in old:
            val=(old["end"] - old["start"]) * 100 if row["unit"] == "basis_points" else (old["end"]/old["start"]-1)*100
            if not isclose(y, val, abs_tol=1e-5):
                raise AssertionError(f"{target}: incorrect observed return")
        for arm in ("llm","statistical","hybrid"):
            p = pred["arms"][arm]
            recorded=row["scores"][arm]
            if not isclose(recorded["point_change"], p["point_change"], abs_tol=1e-8):
                raise AssertionError("prediction was changed")
            b=brier(p["prob_positive"], y>0)
            if not isclose(b, recorded["brier"], abs_tol=1e-5):
                raise AssertionError(f"{target}: Brier mismatch")
            for lev, interval in [(.8, p["interval_change_80"]),
                 (.5, sup["payload"]["A_C_original_target_interval_50_and_90"][target][arm]["interval_50"]),
                 (.9, sup["payload"]["A_C_original_target_interval_50_and_90"][target][arm]["interval_90"])]:
                suffix=str(round(lev*100))
                if (interval[0]<=y<=interval[1]) != recorded["covered"+suffix]:
                    raise AssertionError(f"{target}: interval coverage mismatch {suffix}")
                score=interval_score(*interval, y, lev)
                if not isclose(score, recorded["score"+suffix], abs_tol=1e-4):
                    raise AssertionError(f"{target}: interval score mismatch {suffix}")
            group_arms[row["group"]][arm].append(recorded)
    results={}
    for group,arms in group_arms.items():
        results[group]={}
        for arm,scores in arms.items():
            results[group][arm]={
                "n":len(scores),
                "mean_brier":mean(x["brier"] for x in scores),
                "coverage_80":mean(x["covered80"] for x in scores),
                "coverage_50":mean(x["covered50"] for x in scores),
                "coverage_90":mean(x["covered90"] for x in scores)}
    market = {x["target_id"]:x["actual_change"] for x in rows}
    sp = market["sp500_wk_20261030"]
    wt = market["wti_dec2026_wk_20261030"]
    y10 = market["us10y_par_wk_20261030"]
    six = ("sp500_wk_20261030","nasdaq100_wk_20261030","stoxx600_wk_20261030",
           "nikkei225_wk_20261030","kospi_wk_20261030","csi300_wk_20261030")
    events = {
      "risk_sp500_abs_weekly_move": (abs(sp), int(abs(sp)>2)),
      "risk_wti_abs_weekly_move": (abs(wt), int(abs(wt)>5)),
      "risk_us10y_abs_weekly_move":(abs(y10),int(abs(y10)>15)),
      "risk_global_equity_down_count":(sum(market[t]<=-1.5 for t in six),int(sum(market[t]<=-1.5 for t in six)>=3)),
      "risk_equity_oil_joint_tail":(int(sp<=-2 and wt>=5),int(sp<=-2 and wt>=5))
    }
    for row in ver["risk_scores"]:
        actual, event=events[row["target_id"]]
        if not isclose(actual,row["actual"],abs_tol=1e-5) or event != row["event"]:
            raise AssertionError("risk outcome mismatch")
        if not isclose(brier(row["p"],event),row["brier"],abs_tol=1e-7):
            raise AssertionError("risk probability mismatch")
    results["B"]={
      "n":len(ver["risk_scores"]),
      "mean_brier":mean(row["brier"] for row in ver["risk_scores"]),
      "baseline_mean_brier":mean(row["baseline_brier"] for row in ver["risk_scores"])}
    return results


if __name__=="__main__":
    data = replay(Path(sys.argv[1]) if len(sys.argv)>1 else Path("."))
    print(json.dumps(data,ensure_ascii=False,indent=2))
