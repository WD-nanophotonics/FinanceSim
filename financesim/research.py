"""Evidence, hypotheses, experimental runs, and pre-registered forecast records.

Research records are content-hashed and must be committed to Git to obtain an
independent historical timestamp. A hash alone does not prevent replacement.
Standard-library-only, with no live-data retrieval or hidden model assumptions.
"""
from __future__ import annotations
from datetime import datetime
from hashlib import sha256
import json
from math import isfinite
from statistics import mean
from typing import Any, Mapping

SCHEMA_VERSION = "0.2.0"
KINDS = {"daily_review", "observation", "hypothesis", "experiment", "revision", "weekly_forecast", "weekly_verification"}
ARMS = ("llm", "statistical", "hybrid")


class ResearchError(ValueError):
    """Invalid research artifact, missing provenance, or time leakage."""


def _datetime(value: str) -> datetime:
    if not isinstance(value, str):
        raise ResearchError("timestamp must be an ISO 8601 string with timezone")
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ResearchError(f"invalid ISO 8601 timestamp: {value}") from exc
    if result.tzinfo is None or result.utcoffset() is None:
        raise ResearchError("timezone-aware timestamp required")
    return result


def _finite(value: Any, label: str) -> float:
    if isinstance(value, bool):
        raise ResearchError(f"{label} must be numerical")
    try:
        v = float(value)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ResearchError(f"{label} must be numerical") from exc
    if not isfinite(v):
        raise ResearchError(f"{label} must be finite")
    return v


def _nonempty(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ResearchError(f"{label} must be nonempty string")
    return value


def _validate_evidence(evidence: Any, cutoff: datetime) -> None:
    if not isinstance(evidence, list):
        raise ResearchError("evidence must be a list")
    seen = set()
    for item in evidence:
        if not isinstance(item, dict):
            raise ResearchError("each evidence item must be an object")
        ident = _nonempty(item.get("id"), "evidence.id")
        if ident in seen:
            raise ResearchError("duplicate evidence id")
        seen.add(ident)
        url = _nonempty(item.get("url"), "evidence.url")
        if not url.startswith(("https://", "http://")):
            raise ResearchError("evidence.url must be a URL")
        _nonempty(item.get("claim"), "evidence.claim")
        published = _datetime(item.get("published_at"))
        accessed = _datetime(item.get("accessed_at"))
        if not (published <= accessed <= cutoff):
            raise ResearchError("evidence published/accessed after cutoff or invalid ordering")
        if "feature" in item:
            feature = item["feature"]
            if not isinstance(feature, dict):
                raise ResearchError("feature must be an object")
            _nonempty(feature.get("name"), "feature.name")
            _finite(feature.get("value"), "feature.value")
            _nonempty(feature.get("unit"), "feature.unit")


def _validate_targets(payload: Mapping[str, Any], cutoff: datetime) -> None:
    predictions = payload.get("predictions")
    if not isinstance(predictions, list) or not predictions:
        raise ResearchError("weekly_forecast requires nonempty predictions list")
    target_ids = set()
    for pred in predictions:
        if not isinstance(pred, dict):
            raise ResearchError("predictions entries must be objects")
        target = _nonempty(pred.get("target_id"), "target_id")
        if target in target_ids:
            raise ResearchError("duplicate target_id")
        target_ids.add(target)
        _nonempty(pred.get("unit"), "unit")
        _nonempty(pred.get("definition"), "definition")
        _datetime(pred.get("target_at"))
        if _datetime(pred["target_at"]) <= cutoff:
            raise ResearchError("target must resolve after forecast cutoff")
        arms = pred.get("arms")
        if not isinstance(arms, dict) or set(arms) != set(ARMS):
            raise ResearchError("every target requires llm/statistical/hybrid arms")
        for arm, values in arms.items():
            if not isinstance(values, dict):
                raise ResearchError(f"{arm}: invalid forecast")
            point = _finite(values.get("point_change"), arm + ".point_change")
            prob = _finite(values.get("prob_positive"), arm + ".prob_positive")
            interval = values.get("interval_change_80")
            if not 0 <= prob <= 1:
                raise ResearchError("prob_positive must be in [0,1]")
            if not isinstance(interval, list) or len(interval) != 2:
                raise ResearchError("interval_change_80 requires two endpoints")
            low = _finite(interval[0], "interval.low")
            high = _finite(interval[1], "interval.high")
            if low > high:
                raise ResearchError("interval endpoints not sorted")
            _nonempty(values.get("rationale"), arm + ".rationale")
            _nonempty(values.get("model_id"), arm + ".model_id")


def seal(kind: str, payload: Mapping[str, Any], *, as_of: str, evidence: list[dict] | None = None) -> dict[str, Any]:
    """Validate and content-hash an artifact available at an as-of cutoff.

    The caller MUST use immutable/new Git file paths. To prove a real-world
    publication time, retain the external git commit URL.
    """
    if kind not in KINDS:
        raise ResearchError(f"unknown kind: {kind}")
    if not isinstance(payload, dict) or not payload:
        raise ResearchError("payload must be nonempty object")
    cutoff = _datetime(as_of)
    sources = [] if evidence is None else evidence
    _validate_evidence(sources, cutoff)
    if kind == "weekly_forecast":
        _validate_targets(payload, cutoff)
    if kind == "experiment":
        for field in ("hypothesis_id", "code_commit", "result", "baseline", "dataset_cutoff"):
            if field not in payload:
                raise ResearchError(f"experiment must record {field}")
        if _datetime(payload["dataset_cutoff"]) > cutoff:
            raise ResearchError("experiment trained on future data")
    if kind == "revision":
        for field in ("previous_belief", "new_belief", "reason", "evidence_ids"):
            if field not in payload:
                raise ResearchError(f"revision must record {field}")
    record = {"schema_version": SCHEMA_VERSION, "kind": kind, "as_of": as_of,
              "payload": payload, "evidence": sources}
    encoded = json.dumps(record, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    record["sha256"] = sha256(encoded.encode("utf-8")).hexdigest()
    return record


def verify(record: Mapping[str, Any]) -> bool:
    if not isinstance(record, dict) or not isinstance(record.get("sha256"), str):
        raise ResearchError("missing hash")
    expected_hash = record["sha256"]
    data = {k: v for k, v in record.items() if k != "sha256"}
    encoded = json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    if sha256(encoded.encode("utf-8")).hexdigest() != expected_hash:
        raise ResearchError("research record has been modified")
    if record.get("schema_version") != SCHEMA_VERSION:
        raise ResearchError("unrecognized schema version")
    seal(record["kind"], record["payload"], as_of=record["as_of"], evidence=record["evidence"])
    return True


def score_weekly(forecast_record: Mapping[str, Any], actual_changes: Mapping[str, float]) -> dict[str, Any]:
    """Evaluate *all three* arms against the same observed changes.

    Actual changes must follow the forecast target's definition and unit.
    Missing targets are reported explicitly and not silently counted.
    """
    verify(forecast_record)
    if forecast_record.get("kind") != "weekly_forecast":
        raise ResearchError("forecast record required")
    scores: dict[str, list[dict[str, Any]]] = {arm: [] for arm in ARMS}
    missing: list[str] = []
    for item in forecast_record["payload"]["predictions"]:
        target = item["target_id"]
        if target not in actual_changes:
            missing.append(target)
            continue
        y = _finite(actual_changes[target], target)
        for arm in ARMS:
            val = item["arms"][arm]
            low, high = val["interval_change_80"]
            point = val["point_change"]
            p = val["prob_positive"]
            alpha = 0.2
            interval_score = (high-low) + 2/alpha*max(0,low-y) + 2/alpha*max(0,y-high)
            scores[arm].append({
                "target_id": target, "unit": item["unit"], "actual_change": y,
                "point_error": point-y, "absolute_error": abs(point-y),
                "brier": (p-float(y>0))**2,
                "covered_80": low<=y<=high, "interval_score": interval_score
            })
    summary = {
        arm: {"n": len(rows), "mean_brier": mean(x["brier"] for x in rows) if rows else None,
              "coverage_80": mean(x["covered_80"] for x in rows) if rows else None,
              "rows": rows}
        for arm, rows in scores.items()
    }
    return {"forecast_sha256": forecast_record["sha256"], "missing_targets": missing,
            "by_arm": summary,
            "note": "Point errors and interval scores have different units: aggregate per target, not across unrelated units."}
