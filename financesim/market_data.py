"""Strict as-of market quote validation for externally acquired price observations.

Prevents an opening quote being accidentally used as a Friday settlement,
or mixing futures contracts and vendors when calculating weekly changes.
This module DOES NOT fetch data or authenticate external claims.
"""
from __future__ import annotations

from datetime import datetime
from math import isfinite
from typing import Any, Mapping


class MarketDataError(ValueError):
    """Invalid or non-comparable quote provenance."""


_QUOTE_TYPES = {"official_close", "settlement", "fixing"}


def _timestamp(value: Any, label: str) -> datetime:
    if not isinstance(value, str):
        raise MarketDataError(f"{label} requires an ISO 8601 timestamp")
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as e:
        raise MarketDataError(f"{label} must be ISO 8601") from e
    if dt.tzinfo is None or dt.utcoffset() is None:
        raise MarketDataError(f"{label} requires explicit timezone")
    return dt


def _name(record: Mapping[str, Any], key: str) -> str:
    val = record.get(key)
    if not isinstance(val, str) or not val.strip():
        raise MarketDataError(f"{key} must be a nonempty string")
    return val.strip()


def validate_quote(quote: Mapping[str, Any], *, as_of: str) -> dict[str, Any]:
    """Validate a quote was AVAILABLE by the specified information cutoff."""
    if not isinstance(quote, dict):
        raise MarketDataError("quote must be an object")
    cutoff = _timestamp(as_of, "as_of")
    instrument = _name(quote, "instrument")
    vendor = _name(quote, "vendor")
    kind = _name(quote, "quote_type")
    unit = _name(quote, "unit")
    source = _name(quote, "source_url")
    if kind not in _QUOTE_TYPES:
        raise MarketDataError("only official_close, settlement, or fixing may be scored")
    if not source.startswith(("https://", "http://")):
        raise MarketDataError("source_url must be an HTTP(S) URL")
    v = quote.get("value")
    if isinstance(v, bool):
        raise MarketDataError("value cannot be boolean")
    try:
        value = float(v)
    except (ValueError, TypeError, OverflowError) as e:
        raise MarketDataError("value must be numerical") from e
    if not isfinite(value):
        raise MarketDataError("value must be finite")
    if quote.get("value_is_positive_price", True) and value <= 0:
        raise MarketDataError("price must be positive")
    observed = _timestamp(quote.get("observed_at"), "observed_at")
    available = _timestamp(quote.get("available_at"), "available_at")
    if available < observed:
        raise MarketDataError("quote cannot be available before observed time")
    if available > cutoff:
        raise MarketDataError("quote not available by as_of cutoff")
    contract = quote.get("contract", "")
    if not isinstance(contract, str):
        raise MarketDataError("contract must be a string")
    return {"instrument": instrument, "contract": contract, "vendor": vendor,
            "quote_type": kind, "unit": unit, "value": value,
            "observed_at": observed.isoformat(), "available_at": available.isoformat(),
            "source_url": source}


def weekly_price_change(
    previous: Mapping[str, Any], current: Mapping[str, Any], *,
    forecast_cutoff: str, evaluation_as_of: str,
    expected_quote_type: str | None = None,
) -> dict[str, Any]:
    """Score strictly matched quotations; never use a post-forecast previous quote.

    Returns percent change only for positive price levels (not bond yields).
    """
    cutoff = _timestamp(forecast_cutoff, "forecast_cutoff")
    now = _timestamp(evaluation_as_of, "evaluation_as_of")
    if now <= cutoff:
        raise MarketDataError("evaluation must occur after forecast cutoff")
    a = validate_quote(previous, as_of=forecast_cutoff)
    b = validate_quote(current, as_of=evaluation_as_of)
    for key in ("instrument", "contract", "vendor", "quote_type", "unit"):
        if a[key] != b[key]:
            raise MarketDataError(f"cannot compare different {key}: {a[key]} vs {b[key]}")
    if expected_quote_type and a["quote_type"] != expected_quote_type:
        raise MarketDataError("quote_type does not match frozen measurement rule")
    if _timestamp(b["observed_at"], "observed_at") <= cutoff:
        raise MarketDataError("current quote must be observed after forecast cutoff")
    if _timestamp(b["observed_at"], "observed_at") <= _timestamp(a["observed_at"], "observed_at"):
        raise MarketDataError("current quote must be later than reference quote")
    if a["value"] <= 0 or b["value"] <= 0:
        raise MarketDataError("percent return requires positive quoted values")
    return {
        "instrument": a["instrument"], "contract": a["contract"],
        "vendor": a["vendor"], "quote_type": a["quote_type"],
        "reference_value": a["value"], "current_value": b["value"],
        "pct_change": 100.0 * (b["value"] / a["value"] - 1.0),
        "forecast_cutoff": cutoff.isoformat(),
        "reference_source": a["source_url"], "current_source": b["source_url"],
    }
