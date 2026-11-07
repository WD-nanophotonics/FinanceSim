"""Replay Nov7 settlement against the untouched Oct31 frozen forecast.
This checks arithmetic consistency of archived outcomes and per-unit scores;
external source accuracy is a separate manual provenance audit.
"""
from __future__ import annotations
import json
from math import isclose, sqrt
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parents[2]
def load(path):
    return json.loads((ROOT/path).read_text(encoding="utf8"))

def equal(x,y,label):
    if not isclose(float(x),float(y),rel_tol=0,abs_tol=1.1e-5):
        raise AssertionError(f"{label}: {x} != {y}")

def main():
    f=load("research/weekly/2026-10-31-forecast.json")
    v=load("research/weekly/2026-11-07-verification.json")
    raw=load("research/inputs/2026-11-07-settlement-sources.json")
    assert len(v["rows"]["A"])==8 and len(v["rows"]["B"])==5 and len(v["rows"]["C"])==10
    assert set(v["rows"]["A"])==set(f["macro_forecasts"])
    assert set(v["rows"]["B"])==set(f["risk_forecasts"])
    assert set(v["rows"]["C"])==set(f["market_forecasts"])
    for k, r in v["rows"]["A"].items():
        t=f["macro_forecasts"][k]; obs=raw["macro"][k]
        assert r["observed_level"]==obs["value"]
        y=obs["value"] if t["unit"]=="binary_0or1" else obs["value"]-t["baseline_level"]
        equal(y,r["observed_change"],k+": A")
    for k,r in v["rows"]["C"].items():
        obs=raw["sources"][k]
        y=(obs["end"]-obs["start"])*100 if k=="us10y" else (obs["end"]/obs["start"]-1)*100
        equal(y,r["observed_change"],k+": C")
    c=v["rows"]["C"]
    returns={k:r["observed_change"] for k,r in c.items()}
    actual={
        "sp_abs":abs(returns["sp500"]),
        "wti_abs":abs(returns["wti"]),
        "yield_abs":abs(returns["us10y"]),
        "breadth":sum(returns[k]<=-1.5 for k in
                      ("sp500","nasdaq100","stoxx600","nikkei225","kospi","csi300")),
        "joint":int(returns["sp500"]<=-2 and returns["wti"]>=5),
    }
    for k,r in v["rows"]["B"].items():
        equal(r["observed_value"],actual[k],k+": B")
    for g,targets in (("A",f["macro_forecasts"]),
                      ("B",f["risk_forecasts"]),("C",f["market_forecasts"])):
        for k,r in v["rows"][g].items():
            for arm in ("llm","statistical","hybrid"):
                given=r["arms"][arm]; pred=targets[k]["arms"][arm]
                y=r["observed_value"] if g=="B" else r["observed_change"]
                p=pred["event_probability"] if g=="B" else pred["prob_positive"]
                hit=(int(y) if k=="joint" else int(y>=targets[k]["threshold"]) if
                     k=="breadth" and g=="B" else int(y>targets[k]["threshold"]) if
                     g=="B" else int(y>0))
                equal(given["brier"],(p-hit)**2,k+": Brier")
                equal(given["point_error_actual_minus_pred"],y-pred["point_change"],k+": error")
                for coverage in (50,80,90):
                    lo,hi=pred[f"interval_{coverage}"]
                    alpha=1-coverage/100
                    interval_score=hi-lo+2/alpha*(max(0,lo-y)+max(0,y-hi))
                    equal(given["intervals"][str(coverage)]["interval_score"],
                          interval_score,k+": interval")
                    assert given["intervals"][str(coverage)]["covered"]==(lo<=y<=hi)
        for arm in ("llm","statistical","hybrid"):
            rows=[r["arms"][arm] for r in v["rows"][g].values()]
            equal(v["summary"][g][arm]["brier"],mean(r["brier"] for r in rows),g+": mean")
            equal(v["summary"][g][arm]["coverage_80"],
                mean(r["intervals"]["80"]["covered"] for r in rows),g+": coverage")
    print("Nov7 23-target settlement replay passed (quotes source-provisional where flagged).")

if __name__=="__main__":
    main()
