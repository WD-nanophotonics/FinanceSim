#!/usr/bin/env python3
"""Generate FinanceSim's inaugural 2026-10-24 weekly three-arm forecast.

RESEARCH EXPERIMENT. Model-conditional intervals are not validated. The only
market training data are six sessions available by 2026-10-23 close. The JSON
input snapshot and this code must remain committed, not silently rewritten.
Run from repo root: python research/scripts/generate_2026_10_24.py
Prints exactly the sealed record to stdout (JSON). Does not publish by itself.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path
from math import sqrt
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from financesim import forecast, simulate_scenarios, seal, verify

SOURCE = ROOT / "research/inputs/2026-10-24-1200-snapshot.json"
SNAPSHOT = json.loads(SOURCE.read_text(encoding="utf-8"))
CUT = "2026-10-24T12:00:00+09:00"
SEED = 20261024
N_SIM = 15000

# Explicit LLM priors, authored prior to output inspection. No numerical
# model output is passed into the pure-LLM priors.
LLM = {
 "sp500":(-0.60,0.42),
 "nasdaq100":(-0.90,0.40),
 "stoxx600":(-0.50,0.44),
 "nikkei225":(-1.00,0.40),
 "kospi":(-1.30,0.41),
 "csi300":(0.10,0.51),
 "gold_spot":(-0.40,0.45),
 "wti_dec2026":(1.50,0.57),
 "usdjpy":(-0.40,0.46),
 "us10y_par":(3.00,0.55),
}
# Weekly minimum innovation scales are subjective, explicitly declared.
WEEKLY_FLOOR = {
 "sp500":1.50, "nasdaq100":2.50, "stoxx600":1.60,
 "nikkei225":2.80, "kospi":4.50, "csi300":2.60,
 "gold_spot":3.00, "wti_dec2026":6.00, "usdjpy":1.40,
 "us10y_par":12.00,
}
# Hybrid offset is a prior mean change in return percentage points / yield bp;
# later event shocks apply to those baselines, without ex-post adjustment.
HYBRID_BASE = {
 "sp500":0.15, "nasdaq100":0.15, "stoxx600":0.05,
 "nikkei225":0.00, "kospi":0.10, "csi300":0.10,
 "gold_spot":-0.10, "wti_dec2026":0.50,
 "usdjpy":-0.10, "us10y_par":0.00,
}
EVENTS = [
 {"id":"energy_supply_escalation","probability":0.28,
  "impacts":{"sp500":-0.8,"nasdaq100":-1.0,"stoxx600":-0.7,
             "nikkei225":-1.1,"kospi":-0.8,"csi300":-0.3,
             "gold_spot":0.3,"wti_dec2026":5.0,"usdjpy":0.4,"us10y_par":6.0}},
 {"id":"hawkish_fomc_communication","probability":0.28,
  "impacts":{"sp500":-1.0,"nasdaq100":-1.7,"stoxx600":-0.6,
             "nikkei225":-0.4,"kospi":-0.9,"csi300":-0.5,
             "gold_spot":-1.0,"wti_dec2026":-0.8,"usdjpy":0.5,"us10y_par":10.0}},
 {"id":"ai_earnings_upside","probability":0.45,
  "impacts":{"sp500":0.7,"nasdaq100":1.3,"stoxx600":0.3,
             "nikkei225":0.7,"kospi":1.0,"csi300":0.15,
             "gold_spot":-0.1,"usdjpy":0.1,"us10y_par":2.0}},
 {"id":"middle_east_deescalation","probability":0.22,
  "impacts":{"sp500":0.7,"nasdaq100":0.6,"stoxx600":0.6,
             "nikkei225":0.5,"kospi":0.7,"csi300":0.3,
             "gold_spot":-0.3,"wti_dec2026":-6.0,
             "usdjpy":-0.1,"us10y_par":-4.0}},
 {"id":"china_demand_resilience","probability":0.35,
  "impacts":{"csi300":0.8,"nikkei225":0.1,"kospi":0.2,
             "wti_dec2026":0.6}},
 {"id":"france_political_stress","probability":0.20,
  "impacts":{"stoxx600":-0.8,"gold_spot":0.2,"usdjpy":-0.1,
             "us10y_par":-2.0}},
]

def r(x):
    return round(float(x), 4)

def arm(point, prob, bounds, model_id, rationale, extra=None):
    a = {"point_change":r(point), "prob_positive":r(prob),
         "interval_change_80":[r(bounds[0]),r(bounds[1])],
         "rationale":rationale, "model_id":model_id}
    if extra:
        a.update(extra)
    return a

def market_target(name, source, pure, stat, hybrid):
    tz = {
        "nikkei225":"2026-10-30T15:00:00+09:00",
        "kospi":"2026-10-30T15:30:00+09:00",
        "csi300":"2026-10-30T15:00:00+08:00",
        "stoxx600":"2026-10-30T17:30:00+01:00",
        "us10y_par":"2026-10-30T17:30:00-04:00",
        "usdjpy":"2026-10-30T17:00:00-04:00",
        "gold_spot":"2026-10-30T23:59:00+00:00",
        "wti_dec2026":"2026-10-30T15:30:00-04:00",
    }
    when = tz.get(name,"2026-10-30T16:00:00-04:00")
    unit = "basis_points" if name=="us10y_par" else "percent_return"
    if name=="us10y_par":
        definition = "US Treasury daily 10Y par yield Oct30 minus Oct23, multiplied by 100 to basis points (official published two-decimal yields)."
    elif name=="wti_dec2026":
        definition = "December 2026 NYMEX WTI contract official Friday Oct30 settlement versus Friday Oct23 settlement; 100*(end/start-1). No contract roll."
    else:
        definition = ("Oct30 vendor daily close versus Oct23 vendor daily close, 100*(end/start-1). "
                      "Use the same specific index/market instrument and daily close vendor, without dividends or currency conversion.")
    return {"target_id":name+"_wk_20261030","unit":unit,"target_at":when,
            "definition":definition,"baseline_value":source,
            "confidence":"low","arms":{"llm":pure,"statistical":stat,"hybrid":hybrid}}

def main():
    stat = {}
    baselines = {}
    for name, entry in SNAPSHOT["market_levels"].items():
        values = entry["values"]
        # This uses the committed FinanceSim v0.1 statistical engine itself.
        out = forecast({name:values},indicators=[name],method="naive",
                       horizon=5,lookback=6,interval=0.8,
                       frequency="daily",as_of="2026-10-23")
        s = out["predictions"][name]
        scale = 100.0 if name=="us10y_par" else 100.0/values[-1]
        lo = (s["interval"][0]-values[-1])*scale
        hi = (s["interval"][1]-values[-1])*scale
        model_std = s["forecast_std"]*scale
        stat[name] = arm(0,0.5,[lo,hi],"naive-level-5day-gdiff-v0.1",
                         "Six as-of daily closes; no-change point, iid level-difference Gaussian 5-session uncertainty.",
                         {"weekly_std_raw":r(model_std),"sample_daily_differences":5})
        baselines[name] = {"point_change":HYBRID_BASE[name],
                           "std":max(abs(model_std),WEEKLY_FLOOR[name]),
                           "unit":"basis_points" if name=="us10y_par" else "percent_return"}
    # December 2026 WTI fixed delivery lacks comparable 6-session price series;
    # we explicitly abstain from claiming an empirical volatility fit.
    wti="wti_dec2026"
    stat[wti]=arm(0,0.5,[-1.281551565545*WEEKLY_FLOOR[wti],1.281551565545*WEEKLY_FLOOR[wti]],
                  "no-change-assumed-scale-6pct",
                  "Uninformed zero-return baseline; 6pct weekly sigma is subjective, not fitted. Front-month data roll across expiration.")
    baselines[wti]={"point_change":HYBRID_BASE[wti],
                    "std":WEEKLY_FLOOR[wti],"unit":"percent_return"}
    scenario_out=simulate_scenarios(baselines,EVENTS,simulations=N_SIM,seed=SEED,interval=0.8)
    predictions=[]
    for name in list(SNAPSHOT["market_levels"])+[wti]:
        quote = (SNAPSHOT["additional_quotes"]["wti_dec2026_future"]["2026-10-23"]
                 if name==wti else SNAPSHOT["market_levels"][name]["values"][-1])
        mu,p=LLM[name]
        width=max(WEEKLY_FLOOR[name],baselines[name]["std"])*1.281551565545
        pure=arm(mu,p,[mu-width,mu+width],"llm-manual-20261024",
                 "Unfitted pre-declared subjective direction based on oil/inflation, AI earnings and central-bank event risks.")
        s=scenario_out["predictions"][name]
        hybrid=arm(s["point_change"],s["prob_positive"],s["interval_change"],
                   "independent-event-monte-carlo-v1",
                   "Conditional to six explicit subjective event probabilities, cross-asset impact assumptions and weekly noise.",
                   {"expected_event_contributions":s["expected_event_contributions"]})
        predictions.append(market_target(name,quote,pure,stat[name],hybrid))

    # Macro: first-vintage Oct29 U.S. initial claims in thousands, minus the
    # first-vintage Oct22 value of 194k (NOT the future revised figure).
    weekly=SNAPSHOT["macro_known"]["claims_k"]["values"]
    forecast_claims=forecast({"claims":weekly},method="drift",horizon=1,
                            lookback=len(weekly),interval=0.8,
                            frequency="weekly",as_of="2026-10-22")["predictions"]["claims"]
    delta=forecast_claims["point"]-weekly[-1]
    stat_claim=arm(delta,forecast_claims["change_probability_positive"],
                   [x-weekly[-1] for x in forecast_claims["interval"]],
                   "claims-10wk-level-drift-v0.1",
                   "Ten archived initial claims release values; one-step level drift, iid Gaussian changes; only 9 differences.")
    predictions.append({
       "target_id":"us_initial_claims_first_release_20261029",
       "unit":"thousands_persons_change",
       "target_at":"2026-10-29T08:30:00-04:00",
       "baseline_value":194.0,
       "definition":"Oct29 initial claims advance release for week ending Oct24 minus Oct22 FIRST-VINTAGE initial claims for week ending Oct17 (194k); in thousands. DO NOT substitute a revision to Oct22 value.",
       "confidence":"low","arms":{
         "llm":arm(-1.0,0.45,[-10.0,9.0],"llm-manual-20261024",
                 "Low layoffs persist but latest 194k may mean revert; low confidence."),
         "statistical":stat_claim,
         "hybrid":arm(0.5*delta-0.5,0.47,
                      [forecast_claims["interval"][0]-weekly[-1]-1.0,forecast_claims["interval"][1]-weekly[-1]+1.0],
                      "blend-claims-drift-llm-20261024",
                      "Half numerical drift, half -1k subjective near-term claims judgment; widened model interval.")
       }})
    # Weekly Economic Index advance, relative to the previously published 3.33.
    predictions.append({
       "target_id":"us_wei_first_release_20261029",
       "unit":"index_points_change",
       "target_at":"2026-10-29T12:00:00-05:00",
       "baseline_value":3.33,
       "definition":"Oct29 Dallas Fed WEI first-published value for reference week ending Oct24 minus the 3.33 Oct22 first-published value for reference week ending Oct17. Do not use retrospectively revised Oct17 as base.",
       "confidence":"low","arms":{
        "llm":arm(0.05,0.55,[-0.7,0.8],"llm-manual-20261024","Weekly resilience in claims suggests steady activity, but WEI other inputs not observed."),
        "statistical":arm(0,0.5,[-0.6,0.6],"wei-no-change-assumed-range","No suitable release-vintage training history; explicitly assumed neutral no-change level."),
        "hybrid":arm(0.08,0.56,[-0.6,0.75],"wei-claims-context-manual","Modest positive claims-informed adjustment; uncalibrated.")
       }})
    # New releases, level is reported separately, scored as change relative
    # to the earlier published baseline. Do not compute growth rate as
    # difference from trailing series prices.
    predictions.append({
       "target_id":"us_q3_gdp_advance_20261029",
       "unit":"percentage_points_change",
       "target_at":"2026-10-29T08:30:00-04:00",
       "baseline_value":2.2,
       "definition":"Q3 2026 real US GDP advance estimate of annualized quarterly growth rate (%) minus the previously reported Q2 2026 2.2% annualized growth rate; GDP release is first vintage.",
       "confidence":"low","arms":{
        "llm":arm(0.8,0.72,[-0.8,2.4],"llm-manual-20261024",
                 "Q3 spending investment resilience, offset by energy costs and risks to real demand."),
        "statistical":arm(1.0,0.75,[-0.5,2.5],"external-nowcast-20261009",
                 "Uses preexisting Oct9 median GDP Q3 nowcast 3.2% annualized minus Q2 2.2%; not an internally fitted model."),
        "hybrid":arm(1.05,0.75,[-0.45,2.55],"blend-llm-nowcast-20261024",
                 "Published nowcast 3.2%, qualitative upward investment effects; not trained or calibrated.")
       }})
    predictions.append({
       "target_id":"us_sep_core_pce_yoy_first_release_20261029",
       "unit":"percentage_points_change",
       "target_at":"2026-10-29T08:30:00-04:00",
       "baseline_value":3.0,
       "definition":"Sep2026 core PCE year-on-year percent first released Oct29 minus Aug2026 first-published core PCE 3.0% yoy. Do not use revised Aug value.",
       "confidence":"low","arms":{
        "llm":arm(0.12,0.62,[-0.2,0.45],"llm-manual-20261024",
                  "Underlying services inflation uncertain; high gasoline mainly impacts headline."),
        "statistical":arm(0.1,0.60,[-0.2,0.4],"preexisting-tdcorepce-20261015",
                           "Published TD Securities forecast: core PCE 3.1% y/y vs prior Aug 3.0%; no in-house fitting."),
        "hybrid":arm(0.10,0.61,[-0.15,0.4],"td-nowcast-plus-llm-20261024",
                       "Takes 3.1% TD pre-release nowcast and CPI/PPI reading qualitatively; uncalibrated.")
       }})
    # For Bernoulli events, point_change is the probability on [0,1], and
    # prob_positive repeats it to preserve shared scoring protocol.
    events={
      "fomc_hold_oct28":("2026-10-28T14:00:00-04:00",
            "Federal Reserve October28 2026 statement keeps BOTH target-range endpoints unchanged from Oct23 [3.75%,4.00%].",
            [0.90,0.5,0.88],"Fed commonly expected to pause until December, oil inflation risk raises hawkish-language chance."),
      "ecb_hold_oct29":("2026-10-29T14:15:00+01:00",
            "ECB October29 2026 decision leaves deposit-facility policy interest rate unchanged relative to Oct23.",
            [0.86,0.5,0.84],"ECB widely expected to leave rate steady amid inflation and France political risks."),
      "boj_hold_oct30":("2026-10-30T15:00:00+09:00",
            "Bank of Japan Oct30 2026 meeting decision leaves uncollateralized overnight call rate target unchanged relative to Oct23.",
            [0.69,0.5,0.68],"BOJ faces FX/energy inflation; decision uncertain; unchanged modest favorite.")
    }
    for target,(when,definition,odds,reason) in events.items():
        arms={}
        for name,p in zip(("llm","statistical","hybrid"),odds):
            interv=[1,1] if p>=0.8 else [0,1]
            arms[name]=arm(p,p,interv,
                ("base-uniform-binary" if name=="statistical" else name+"-manual-20261024"),
                ("Fixed uninformative 50/50 prior; no calibrated decision model." if name=="statistical" else reason))
        predictions.append({"target_id":target,"unit":"binary_unchanged_0or1",
                            "target_at":when,"baseline_value":None,
                            "definition":definition,"confidence":"low-to-medium",
                            "arms":arms})

    # Each cited observation was publicly released by Friday Oct23.
    # Historical series dynamic pages generally omit an exact publication
    # clock, so include source URLs and access-window as metadata, rather
    # than inventing published-at timestamps.
    payload={
       "week_start":"2026-10-24",
       "forecast_cutoff":CUT,
       "origin_last_trade_date":"2026-10-23",
       "target_last_trade_date":"2026-10-30",
       "model_code_base_commit":"edc2c5709b76b460a7c9faa29506a04720fefeac",
       "snapshot_path":str(SOURCE.relative_to(ROOT)),
       "generator_path":"research/scripts/generate_2026_10_24.py",
       "information_limitations":{
           "data_captured":"2026-10-24 around 12:00-12:10 JST, after 12:00 information cutoff; only Friday Oct23 or earlier observations included.",
           "publication_times":"Sources with no stated publication hour are recorded by observation date, not fabricated clock.",
           "market_volatility_fit":"Six daily closes; 5 single-day changes; normal iid level-difference model unreliable in volatile regime.",
           "scenario_probabilities":"Manual, not historically calibrated; events assumed independent, thus scenario interaction ignored.",
           "claim_vintages":"Except latest 194k, historical historical releases from secondary calendar not independently verified as original vintages.",
           "confidence":"All forecast probabilities subjective or model conditional; not yet calibrated on rolling real forecasts.",
       },
       "sources":{"market":{name:d["url"] for name,d in SNAPSHOT["market_levels"].items()},
                  "wti":"https://www.reuters.com/business/energy/oil-little-changed-supply-concern-lingers-amid-houthi-attacks-saudi-arabia-2026-10-23/",
                  "claims":SNAPSHOT["macro_known"]["claims_k"]["source"],
                  "wei":SNAPSHOT["macro_known"]["wei_latest"]["source"],
                  "gdp_nowcast":SNAPSHOT["macro_known"]["gdp_source"],
                  "core_pce":SNAPSHOT["macro_known"]["pce_source"],
                  "core_pce_nowcast":SNAPSHOT["macro_known"]["pce_forecast_source"],
                  "fed_calendar":"https://www.chicagofed.org/utilities/about-us/federal-reserve-calendars",
                  "ecb_calendar":"https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html",
                  "bea_calendar":"https://www.bea.gov/news/schedule/"},
       "numerical_run":{
           "statistical_engine":"financesim.forecast(method=naive, horizon=5, lookback=6) for 9 market levels; claims drift 10 observations, horizon=1",
           "hybrid_engine":"financesim.simulate_scenarios with declared conditional Gaussian stds and six Bernoulli independent events",
           "scenario_events":EVENTS, "scenario_weekly_stds":{n:baselines[n]["std"] for n in baselines},
           "hybrid_prior_means":HYBRID_BASE, "seed":SEED,"draws":N_SIM
       },
       "previous_week_validation":{
           "forecast_path":None,"n_eligible":0,
           "reason":"No 2026-10-17 weekly sealed forecast exists in repository as of this run. Oct21 daily exploratory experiment explicitly was not registered as a weekly forecast.",
           "scores":{"llm":None,"statistical":None,"hybrid":None},
           "brier":None,"mae":None,"rmse":None,"coverage80":None,"interval_score":None,"skill_vs_baseline":None
       },
       "predictions":predictions
    }
    record=seal("weekly_forecast",payload,as_of=CUT,evidence=[])
    assert verify(record)
    print(json.dumps(record,ensure_ascii=False,sort_keys=True,indent=2))

if __name__=="__main__":
    main()
