"""Small deterministic forecasting engine, independent of data vendors.

Provide only data available at forecast origin. No external news/data fetching.
"""
from __future__ import annotations
from datetime import date
from math import isfinite, sqrt
from statistics import NormalDist, mean, pstdev
from typing import Any, Mapping, Sequence

VERSION = "0.1.0"
_NORMAL = NormalDist()


class ForecastError(ValueError):
    """Invalid, insufficient, or time-leaking input."""


def _clean(values: Sequence[float]) -> list[float]:
    if isinstance(values, (str, bytes)):
        raise ForecastError("values must be a numerical sequence")
    try:
        result = [float(x) for x in values]
    except (TypeError, ValueError, OverflowError) as e:
        raise ForecastError("values must be finite numbers") from e
    if not result or not all(isfinite(x) for x in result):
        raise ForecastError("values must be nonempty finite numbers")
    return result


def _predict_once(values: list[float], method: str, horizon: int, lookback: int,
                  decay: float) -> tuple[float, float, float]:
    w = values[-lookback:]
    latest = w[-1]
    diffs = [b - a for a, b in zip(w, w[1:])]
    noise = pstdev(diffs) if len(diffs) >= 2 else 0.0
    if method == "naive":
        point = latest
    elif method == "drift":
        point = latest + horizon * mean(diffs)
    elif method == "ewma":
        level = w[0]
        for item in w[1:]:
            level = decay * item + (1 - decay) * level
        point = level
    else:
        raise ForecastError(f"unknown method: {method}")
    return point, noise, latest


def forecast(data: Mapping[str, Sequence[float]], *, indicators: Sequence[str] | None = None,
             method: str = "naive", horizon: int = 5, lookback: int = 26,
             decay: float = 0.3, interval: float = 0.8,
             frequency: str = "daily", as_of: str | None = None,
             seed: int = 0, simulations: int = 0) -> dict[str, Any]:
    """One API for many level-valued economic/financial series.

    Horizon is measured in observations. Inputs must already be as-of aligned.
    Interval and simulation assume independent Gaussian innovations.
    """
    if not isinstance(horizon, int) or isinstance(horizon, bool) or horizon < 1:
        raise ForecastError("horizon must be a positive integer")
    if not isinstance(lookback, int) or isinstance(lookback, bool) or lookback < 3:
        raise ForecastError("lookback must be an integer >= 3")
    if not 0 < decay <= 1 or not 0 < interval < 1:
        raise ForecastError("decay and interval must be in (0,1)")
    if method not in {"naive", "drift", "ewma"}:
        raise ForecastError(f"unknown method: {method}")
    if frequency not in {"daily", "weekly", "monthly"}:
        raise ForecastError("frequency must be daily, weekly or monthly")
    if as_of is not None:
        try:
            date.fromisoformat(as_of)
        except (TypeError, ValueError) as e:
            raise ForecastError("as_of must be ISO date YYYY-MM-DD") from e
    if not isinstance(simulations, int) or isinstance(simulations, bool) or simulations < 0:
        raise ForecastError("simulations must be a nonnegative integer")
    if not isinstance(seed, int) or isinstance(seed, bool):
        raise ForecastError("seed must be an integer")
    keys = list(data.keys()) if indicators is None else list(indicators)
    if not keys:
        raise ForecastError("no indicators selected")
    if len(keys) != len(set(keys)):
        raise ForecastError("duplicate indicators")
    result: dict[str, Any] = {}
    from random import Random
    rng = Random(seed)
    for key in keys:
        if key not in data:
            raise ForecastError(f"missing indicator: {key}")
        w = _clean(data[key])
        if len(w) < max(3, lookback):
            raise ForecastError(f"{key}: need at least {max(3, lookback)} observations")
        point, innovation_sd, previous = _predict_once(w, method, horizon, lookback, decay)
        sd = innovation_sd * sqrt(horizon)
        z = _NORMAL.inv_cdf((1 + interval) / 2)
        low, high = point - z * sd, point + z * sd
        p_up = _NORMAL.cdf((point - previous) / sd) if sd > 0 else (
            1.0 if point > previous else 0.0 if point < previous else 0.5)
        entry: dict[str, Any] = {
            "last_value": previous, "point": point,
            "change": point - previous, "change_probability_positive": p_up,
            "interval": [low, high], "interval_level": interval,
            "forecast_std": sd, "observations": len(w),
        }
        if simulations:
            draws = sorted(rng.gauss(point, sd) for _ in range(simulations))
            entry["simulation"] = {
                "n": simulations, "mean": mean(draws),
                "quantiles": [
                    draws[min(simulations - 1, int((1 - interval) / 2 * simulations))],
                    draws[min(simulations - 1, int((1 + interval) / 2 * simulations))]
                ],
            }
        result[key] = entry
    return {"engine_version": VERSION, "method": method, "horizon": horizon,
            "frequency": frequency, "as_of": as_of, "parameters": {
                "lookback": lookback, "decay": decay, "interval": interval,
                "seed": seed, "simulations": simulations}, "predictions": result}


def backtest(data: Mapping[str, Sequence[float]], *, indicators: Sequence[str] | None = None,
             method: str = "naive", horizon: int = 5, lookback: int = 26,
             decay: float = 0.3, interval: float = 0.8,
             stride: int | None = None) -> dict[str, Any]:
    """Walk-forward origin validation without using future observations."""
    if not isinstance(horizon, int) or isinstance(horizon, bool) or horizon < 1:
        raise ForecastError("invalid horizon")
    if not isinstance(lookback, int) or isinstance(lookback, bool) or lookback < 3:
        raise ForecastError("invalid lookback")
    if stride is None:
        stride = horizon
    if not isinstance(stride, int) or isinstance(stride, bool) or stride < 1:
        raise ForecastError("stride must be positive")
    keys = list(data) if indicators is None else list(indicators)
    if not keys:
        raise ForecastError("no indicators selected")
    scores: dict[str, Any] = {}
    for key in keys:
        if key not in data:
            raise ForecastError(f"missing indicator: {key}")
        values = _clean(data[key])
        if len(values) < lookback + horizon:
            raise ForecastError(f"{key}: insufficient history for walk-forward")
        rows = []
        for origin in range(lookback - 1, len(values) - horizon, stride):
            f = forecast({key: values[:origin + 1]}, indicators=[key], method=method,
                         horizon=horizon, lookback=lookback, decay=decay,
                         interval=interval)["predictions"][key]
            actual = values[origin + horizon]
            low, high = f["interval"]
            alpha = 1 - interval
            interval_score = (high - low) + 2 / alpha * max(0, low - actual) + 2 / alpha * max(0, actual - high)
            rows.append({
                "origin_index": origin, "target_index": origin + horizon,
                "prediction": f["point"], "actual": actual,
                "error": f["point"] - actual,
                "brier": (f["change_probability_positive"] - float(actual > values[origin])) ** 2,
                "covered": low <= actual <= high,
                "interval_score": interval_score,
            })
        errors = [row["error"] for row in rows]
        scores[key] = {
            "n": len(rows), "mae": mean(abs(x) for x in errors),
            "rmse": sqrt(mean(x * x for x in errors)),
            "brier": mean(row["brier"] for row in rows),
            "coverage": mean(row["covered"] for row in rows),
            "mean_interval_score": mean(row["interval_score"] for row in rows),
            "rows": rows,
        }
    return {"engine_version": VERSION, "method": method, "horizon": horizon,
            "lookback": lookback, "stride": stride, "metrics": scores}
