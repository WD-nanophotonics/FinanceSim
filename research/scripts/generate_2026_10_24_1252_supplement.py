#!/usr/bin/env python3
"""Append-only risk/distribution supplement to the already-frozen Oct24 forecast.

The official three-arm forecast was committed at 12:06:57 JST with an as-of
cutoff of 12:00 JST. This later research supplement is NOT a replacement,
and MUST NOT be treated as a noon-pre-registered forecast for scoring.
Inputs are only the previously-frozen 2026-10-23 market snapshot and the
previously-declared six events and their priors. No outcomes are available.
"""
from __future__ import annotations

from datetime import datetime
import json
from math import sqrt
from pathlib import Path
from random import Random
import runpy
import sys
from statistics import NormalDist, mean

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from financesim import forecast, seal, verify

ORIGINAL = ROOT / "research/weekly/2026-10-24-forecast.json"
GENERATOR = ROOT / "research/scripts/generate_2026_10_24.py"
CUT = "2026-10-24T12:52:12+09:00"
SOURCE_CUT = "2026-10-24T12:00:00+09:00"
SEED = 20261024
N = 15000
Z = NormalDist()
g = runpy.run_path(str(GENERATOR))
snap = g["SNAPSHOT"]
old = json.loads(ORIGINAL.read_text(encoding="utf-8"))
TARGET_KEYS = list(snap["market_levels"]) + ["wti_dec2026"]


def quantile(x, p):
    x = sorted(x)
    k = (len(x) - 1) * p
    lo = int(k)
    hi = min(len(x) - 1, lo + 1)
    return x[lo] + (k-lo) * (x[hi]-x[lo])


def rnd(x):
    return round(float(x), 4)


def discrete_quantile(p1, q):
    return 0 if q <= 1-p1 else 1


def central_gaussian_from_80(point, interval80, central):
    """Normal approximation to already-frozen 80% interval; never refit."""
    std = (interval80[1] - interval80[0])/(2*Z.inv_cdf(.9))
    width = Z.inv_cdf((1+central)/2)*std
    return [rnd(point-width), rnd(point+width)]


def original_distribution_extensions(hybrid_draws):
    by_id = {}
    for obj in old["payload"]["predictions"]:
        target_id = obj["target_id"]
        if obj["unit"] == "binary_unchanged_0or1":
            out = {}
            for name, arm in obj["arms"].items():
                prob = arm["prob_positive"]
                out[name] = {
                    "point_original": arm["point_change"], "prob_positive_original": prob,
                    "interval_50": [discrete_quantile(prob, .25), discrete_quantile(prob, .75)],
                    "interval_90": [discrete_quantile(prob, .05), discrete_quantile(prob, .95)],
                    "method": "exact discrete Bernoulli quantiles"
                }
        else:
            out = {}
            for name, arm in obj["arms"].items():
                point = arm["point_change"]
                interval80 = arm["interval_change_80"]
                if name == "hybrid" and target_id.endswith("_wk_20261030"):
                    key = target_id.removesuffix("_wk_20261030")
                    arr = hybrid_draws[key]
                    b50 = [rnd(quantile(arr,.25)), rnd(quantile(arr,.75))]
                    b90 = [rnd(quantile(arr,.05)), rnd(quantile(arr,.95))]
                    method = "same seeded mixture Monte Carlo as original, quantiles 25/75 and 5/95"
                else:
                    b50 = central_gaussian_from_80(point, interval80, .5)
                    b90 = central_gaussian_from_80(point, interval80, .9)
                    method = "unverified Gaussian approximation derived from frozen 80pct width"
                out[name] = {
                    "point_original": point, "prob_positive_original": arm["prob_positive"],
                    "interval_50": b50, "interval_90": b90, "method": method,
                }
        by_id[target_id] = out
    return by_id


def make_draws():
    baselines={}
    for name, info in snap["market_levels"].items():
        vs=info["values"]
        raw=forecast({name:vs}, indicators=[name], method="naive",
                     horizon=5, lookback=6, interval=.8,
                     frequency="daily", as_of="2026-10-23")["predictions"][name]
        scale = 100.0 if name=="us10y_par" else 100.0/vs[-1]
        sigma = max(raw["forecast_std"] * scale, g["WEEKLY_FLOOR"][name])
        baselines[name] = (g["HYBRID_BASE"][name],sigma)
    baselines["wti_dec2026"] = (g["HYBRID_BASE"]["wti_dec2026"],
                               g["WEEKLY_FLOOR"]["wti_dec2026"])
    rng = Random(SEED)
    draws = {name: [] for name in TARGET_KEYS}
    for i in range(N):
        common = {name:0.0 for name in TARGET_KEYS}
        for event in g["EVENTS"]:
            if rng.random() < event["probability"]:
                for name, impact in event["impacts"].items():
                    common[name]+=impact
        for name in TARGET_KEYS:
            mu,sigma=baselines[name]
            draws[name].append(mu+common[name]+rng.gauss(0,sigma))
    return draws, baselines


def risk_targets(draws, baselines):
    def summary(metric_id, unit, arr, *, exceed=None, event=None, description="", base=None):
        interval50=[rnd(quantile(arr,.25)),rnd(quantile(arr,.75))]
        interval90=[rnd(quantile(arr,.05)),rnd(quantile(arr,.95))]
        return {"target_id":metric_id, "settle_on":"2026-10-30",
                "definition":description, "unit":unit,
                "point":rnd(mean(arr)), "interval_50":interval50,"interval_90":interval90,
                "event_threshold":exceed,
                "event_probability":rnd(mean(event)) if event is not None else None,
                "baseline_event_probability":rnd(base) if base is not None else None,
                "confidence":"low_unverified", "models":"predeclared six-event Gaussian Monte Carlo, 15000 draws",
                "evaluation":"Use exact frozen Oct23-to-Oct30 source/maturity market closes; not before Oct30"}
    sp=draws["sp500"]
    wt=draws["wti_dec2026"]
    y10=draws["us10y_par"]
    normal=NormalDist()
    def abs_prob(scale,threshold):
        return 2*(1-normal.cdf(threshold/scale))
    equity_names=["sp500","nasdaq100","stoxx600","nikkei225","kospi","csi300"]
    counts=[sum(draws[name][i]<=-1.5 for name in equity_names) for i in range(N)]
    # Independent zero-mean Gaussian benchmark for ≥3 equity markets in the six-index basket.
    # No correlation, no event-driven common shocks; weak baseline, explicitly acknowledged.
    ps=[normal.cdf(-1.5/baselines[name][1]) for name in equity_names]
    probs=[1.0]+[0.0]*6
    for p in ps:
        nxt=[0.0]*7
        for k in range(7):
            nxt[k]+=probs[k]*(1-p)
            if k<6: nxt[k+1]+=probs[k]*p
        probs=nxt
    p_count_base=sum(probs[3:])
    risk=[
        summary("risk_sp500_abs_weekly_move","percent", [abs(x) for x in sp],
                exceed="abs(return)>2.0%",event=[float(abs(x)>2.0) for x in sp],
                base=abs_prob(baselines["sp500"][1],2.0),
                description="Absolute simple S&P500 Oct30 / Oct23 percent return; event if greater than 2.0%"),
        summary("risk_wti_abs_weekly_move","percent",[abs(x) for x in wt],
                exceed="abs(return)>5.0%",event=[float(abs(x)>5.0) for x in wt],
                base=abs_prob(baselines["wti_dec2026"][1],5.0),
                description="Absolute Dec26 WTI percent return from Oct23 to Oct30 same contract settlements"),
        summary("risk_us10y_abs_weekly_move","basis_points",[abs(x) for x in y10],
                exceed="abs(change)>15bp",event=[float(abs(x)>15) for x in y10],
                base=abs_prob(baselines["us10y_par"][1],15.0),
                description="Absolute US Treasury 10Y par-yield Oct30 minus Oct23 change in basis points"),
        summary("risk_global_equity_down_count","count_0to6",counts,
                exceed="at least 3 of six equity indexes return below -1.5%",
                event=[float(x>=3) for x in counts],base=p_count_base,
                description="Number of S&P500, NASDAQ100, STOXX600, Nikkei225, KOSPI, CSI300 with Oct23-to-Oct30 returns <= -1.5%"),
        summary("risk_equity_oil_joint_tail","binary",[float(sp[i]<=-2.0 and wt[i]>=5.0) for i in range(N)],
                exceed="SP500<=-2% AND WTI>=+5%",event=[float(sp[i]<=-2.0 and wt[i]>=5.0) for i in range(N)],
                base=normal.cdf(-2.0/baselines["sp500"][1])*(1-normal.cdf(5.0/baselines["wti_dec2026"][1])),
                description="Binary joint stress state at Oct30 closes: S&P500 return <=-2% AND December WTI return >=+5%; shared event shocks preserve assumed correlation")
    ]
    return risk


def main():
    assert old["sha256"] == "d00be1a5231e557dbe7e90f189fa6489651ff05af5638ef1f21d96cec02adf75"
    draws,baselines=make_draws()
    # Verify numerical replay recovers the frozen hybrid 80% mixture quantiles.
    for obj in old["payload"]["predictions"]:
        k=obj["target_id"].removesuffix("_wk_20261030")
        if k in draws and obj["target_id"].endswith("_wk_20261030"):
            actual=[rnd(quantile(draws[k],.1)),rnd(quantile(draws[k],.9))]
            orig=obj["arms"]["hybrid"]["interval_change_80"]
            if any(abs(a-b)>.0002 for a,b in zip(actual,orig)):
                raise ValueError("replay differs for "+k)
    supplement={
        "title":"Post-noon same-day additive risk and 50/90 interval analysis",
        "status":"late_supplement_NOT_retroactive_noon_forecast",
        "original_frozen_path":"research/weekly/2026-10-24-forecast.json",
        "original_sha256":old["sha256"],
        "original_publication_commit":"44b1752d3e6f285a20167dc080c042cf73a30243",
        "earlier_information_cutoff":SOURCE_CUT,
        "supplement_run_earliest":"2026-10-24T12:52:12+09:00",
        "information_input":"Exactly the previously frozen as-of 2026-10-23 market levels, six subjective events and model priors. No new market outcomes.",
        "simulations":N,"seed":SEED,
        "classification":{
            "A_macroeconomic_and_planned_events":[x["target_id"] for x in old["payload"]["predictions"] if not x["target_id"].endswith("_wk_20261030")],
            "B_market_risk_state":[x["target_id"] for x in risk_targets(draws,baselines)],
            "C_financial_asset_prices":[x["target_id"] for x in old["payload"]["predictions"] if x["target_id"].endswith("_wk_20261030")],
        },
        "B_market_risk_state":risk_targets(draws,baselines),
        "A_C_original_target_interval_50_and_90":original_distribution_extensions(draws),
        "scoring_guidance":"Original 17 targets keep original frozen values and 80% intervals. The separate supplementary 50/90 and risk calculations must be credited only from the supplement's actual Git commit time and not falsely dated as 12:00. For B risk targets compare same-date market-source closes; baseline skill only computable after settlement.",
        "limitations":["Hybrid market 50/90 intervals exactly replay original Monte Carlo draws, while non-hybrid and macro intervals use Gaussian interpolation from earlier 80% width; the quantile approximation need not agree with independently set direction probabilities.",
                       "Event probabilities and impacts subjective, six historical close observations, Gaussian innovations and independence assumptions unvalidated.",
                       "B metrics reuse C simulated asset changes, and are not independent forecast evidence. Six equities are cross-correlated only via the six scenario events, with otherwise independent residuals.",
                       "Market close definitions in original include a stale 15:00 JST Nikkei target time; resolve using actual 15:30 TSE official close on Oct30 without changing the frozen numeric forecast.",
                       "The daily-report publication time is later than 12:00; don't confuse this with the pre-registered original forecast."]
    }
    record=seal("daily_review",supplement,as_of=CUT,evidence=[])
    assert verify(record)
    print(json.dumps(record,ensure_ascii=False,indent=2,sort_keys=True))


if __name__=="__main__":
    main()
