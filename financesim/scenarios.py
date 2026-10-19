"""Simple independent-event world-scenario Monte Carlo layer.

Quantified daily research can modify *assumed* event probabilities and their
conditional impacts on asset/macroeconomic changes. This model is exploratory,
not statistically identified or guaranteed to improve forecasting.
"""
from __future__ import annotations
from math import isfinite
from random import Random
from statistics import mean
from typing import Any, Mapping, Sequence


class ScenarioError(ValueError):
    pass


def _num(value: Any, field: str) -> float:
    if isinstance(value, bool):
        raise ScenarioError(field + " must be finite number")
    try:
        x = float(value)
    except (ValueError, TypeError, OverflowError) as e:
        raise ScenarioError(field + " must be finite number") from e
    if not isfinite(x):
        raise ScenarioError(field + " must be finite")
    return x


def _quantile(sorted_values: list[float], prob: float) -> float:
    index = (len(sorted_values) - 1) * prob
    lo = int(index)
    hi = min(lo + 1, len(sorted_values) - 1)
    return sorted_values[lo] + (index - lo) * (sorted_values[hi] - sorted_values[lo])


def simulate_scenarios(
    baseline: Mapping[str, Mapping[str, Any]],
    events: Sequence[Mapping[str, Any]], *,
    simulations: int = 10000, seed: int = 0, interval: float = 0.8
) -> dict[str, Any]:
    """Project common scenario shocks onto multiple targets.

    baseline per target: {point_change, std, unit}
    events: [{id, probability, impacts: {target_id: delta_change}}]
    Every simulation draws one realization per event, shared across targets
    (thus producing event-driven cross-asset dependence). Different events are
    assumed independent, and noise is independent between assets.
    """
    if not isinstance(simulations, int) or isinstance(simulations, bool) or simulations < 1:
        raise ScenarioError("simulations must be a positive integer")
    if not isinstance(seed, int) or isinstance(seed, bool) or not (0 < interval < 1):
        raise ScenarioError("invalid seed or interval")
    if not isinstance(baseline, dict) or not baseline:
        raise ScenarioError("baseline must be nonempty object")
    targets = {}
    for name, info in baseline.items():
        if not isinstance(name, str) or not name or not isinstance(info, dict):
            raise ScenarioError("invalid target entry")
        point = _num(info.get("point_change"), name + ".point_change")
        std = _num(info.get("std"), name + ".std")
        unit = info.get("unit")
        if std < 0 or not isinstance(unit, str) or not unit:
            raise ScenarioError("invalid target std or unit")
        targets[name] = {"point_change": point, "std": std, "unit": unit}
    if not isinstance(events, (list,tuple)):
        raise ScenarioError("events must be a list")
    checked_events = []
    ids = set()
    for item in events:
        if not isinstance(item, dict):
            raise ScenarioError("invalid event")
        ident, impacts = item.get("id"), item.get("impacts")
        prob = _num(item.get("probability"), "probability")
        if not isinstance(ident, str) or not ident or ident in ids or not 0 <= prob <= 1:
            raise ScenarioError("invalid event id or probability")
        ids.add(ident)
        if not isinstance(impacts, dict) or not impacts or any(k not in targets for k in impacts):
            raise ScenarioError("impacts must reference known targets")
        checked_events.append({"id": ident, "probability": prob,
                               "impacts": {name: _num(value, "impact") for name,value in impacts.items()}})
    rng = Random(seed)
    draws = {key: [] for key in targets}
    for _ in range(simulations):
        scenario_change = {key: 0.0 for key in targets}
        for event in checked_events:
            if rng.random() < event["probability"]:
                for key, impact in event["impacts"].items():
                    scenario_change[key] += impact
        for key, info in targets.items():
            draws[key].append(info["point_change"] + scenario_change[key] +
                              rng.gauss(0.0, info["std"]))
    result = {}
    for key, values in draws.items():
        values.sort()
        result[key] = {
            "point_change": mean(values),
            "prob_positive": sum(x > 0 for x in values)/simulations,
            "interval_change": [_quantile(values, (1-interval)/2),
                                _quantile(values, (1+interval)/2)],
            "interval_level": interval, "unit": targets[key]["unit"],
            "expected_event_contributions": {
                event["id"]: event["probability"] * event["impacts"].get(key, 0.0)
                for event in checked_events
            }
        }
    return {"method": "independent-event-monte-carlo-v1", "simulations": simulations,
            "seed": seed, "assumptions": "Independent events and Gaussian idiosyncratic noise; probabilities and impacts are inputs, not learned from data.",
            "predictions": result}
