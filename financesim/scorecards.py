"""First-release macro/event settlement against immutable three-arm forecasts.

Inputs are source-audited observations; no network fetch occurs here.
Different physical units are never merged for point errors or interval scores.
"""
from __future__ import annotations
from datetime import datetime
from math import isfinite, sqrt
from statistics import mean
from typing import Any, Mapping


class SettlementError(ValueError):
    pass


def _time(raw: Any) -> datetime:
    if not isinstance(raw, str):
        raise SettlementError("timestamp must be an ISO 8601 string")
    try:
        t = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as e:
        raise SettlementError("invalid timestamp") from e
    if t.utcoffset() is None:
        raise SettlementError("timestamps must include timezone")
    return t


def _number(v: Any) -> float:
    if isinstance(v, bool):
        raise SettlementError("boolean is not a valid numeric observation")
    try:
        f = float(v)
    except (TypeError, ValueError, OverflowError) as e:
        raise SettlementError("invalid observation") from e
    if not isfinite(f):
        raise SettlementError("observations must be finite")
    return f


def macro_scorecard(frozen: Mapping[str, Any], truths: Mapping[str, Any],
                    *, evaluation_as_of: str) -> dict[str, Any]:
    """Score released and audited targets; explicitly mark pending targets.

    truths[target_id] = {value, released_at, source_url, release_version:'first'}
    A revision, future publication, or unverified source is not scoreable.
    """
    if not isinstance(frozen, dict) or not isinstance(truths, dict):
        raise SettlementError("forecast and truths must be objects")
    cutoff = _time(frozen["forecast_cutoff"])
    now = _time(evaluation_as_of)
    if now <= cutoff:
        raise SettlementError("evaluation must postdate forecast")
    targets = frozen.get("macro_forecasts")
    if not isinstance(targets, dict) or not targets:
        raise SettlementError("macro_forecasts missing")
    if set(truths) - set(targets):
        raise SettlementError("outcome contains an unknown target")
    arms = ("llm", "statistical", "hybrid")
    scores = {a: [] for a in arms}
    missing = []
    for tid, target in targets.items():
        if tid not in truths:
            missing.append(tid)
            continue
        obs = truths[tid]
        if not isinstance(obs, dict) or obs.get("release_version") != "first":
            raise SettlementError("must use first-release observation")
        url = obs.get("source_url")
        if not isinstance(url, str) or not url.startswith(("https://", "http://")):
            raise SettlementError("source_url required")
        published = _time(obs.get("released_at"))
        if published <= cutoff or published > now:
            raise SettlementError("release outside admissible evaluation window")
        v = _number(obs.get("value"))
        is_binary = target["unit"] == "binary_0or1"
        if is_binary:
            if v not in (0.0, 1.0):
                raise SettlementError("binary target must equal 0 or 1")
            y = v
        else:
            y = v - _number(target["baseline_level"])
        prior = target["arms"]
        if set(prior) != set(arms):
            raise SettlementError("unequal forecast arms")
        for arm in arms:
            a = prior[arm]
            p = _number(a["prob_positive"])
            if not 0 <= p <= 1:
                raise SettlementError("invalid probability")
            direction = 1.0 if y > 0 else 0.0
            point = _number(a["point_change"])
            intervals = {}
            for coverage in (50, 90):
                lo, hi = map(_number, a[f"interval_{coverage}"])
                if lo > hi:
                    raise SettlementError("invalid interval")
                alpha = 1.0 - coverage / 100.0
                intervals[str(coverage)] = {
                    "covered": lo <= y <= hi,
                    "score": (hi - lo) + 2.0 / alpha * max(0.0, lo-y)
                             + 2.0 / alpha * max(0.0, y-hi),
                }
            scores[arm].append({
                "target_id": tid, "unit": target["unit"],
                "observed_level": v, "observed_change": y,
                "prediction": point, "actual_minus_pred": y-point,
                "absolute_error": abs(y-point),
                "brier": (p-direction)**2,
                "intervals": intervals,
                "released_at": obs["released_at"],
                "source_url": url,
            })
    by_arm = {}
    for arm, rows in scores.items():
        groups: dict[str, list[dict]] = {}
        for row in rows:
            groups.setdefault(row["unit"], []).append(row)
        by_arm[arm] = {
            "n": len(rows),
            "mean_brier": mean(x["brier"] for x in rows) if rows else None,
            "coverage_50": mean(x["intervals"]["50"]["covered"] for x in rows) if rows else None,
            "coverage_90": mean(x["intervals"]["90"]["covered"] for x in rows) if rows else None,
            "per_unit": {
                unit: {"n": len(xs),
                       "mae": mean(x["absolute_error"] for x in xs),
                       "rmse": sqrt(mean(x["actual_minus_pred"]**2 for x in xs)),
                       "mean_interval_score_50": mean(x["intervals"]["50"]["score"] for x in xs),
                       "mean_interval_score_90": mean(x["intervals"]["90"]["score"] for x in xs)}
                for unit, xs in groups.items()
            },
            "rows": rows,
        }
    benchmark = by_arm["statistical"]["mean_brier"]
    for arm in arms:
        score = by_arm[arm]["mean_brier"]
        by_arm[arm]["brier_skill_vs_statistical"] = (
            1.0 - score / benchmark if score is not None and benchmark is not None and benchmark > 0 else None
        )
    return {"forecast_cutoff": frozen["forecast_cutoff"],
            "evaluation_as_of": evaluation_as_of,
            "settled": len(scores["llm"]), "total": len(targets),
            "pending": missing, "by_arm": by_arm,
            "warning": "Preliminary macro score only; verify baseline source vintages and the original immutable forecast. Point and interval errors are aggregated per unit."}
