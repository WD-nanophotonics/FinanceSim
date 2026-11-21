"""Additive, standard-library parallel risk experiment. No live data or legacy writes.

All randomness, calendars, sources and update rules are explicit. A content hash
is NOT a publication timestamp; admission requires a separate GitHub receipt.
"""
from __future__ import annotations

import copy
from datetime import date, datetime, timedelta, timezone
from hashlib import sha256
import json
from math import exp, isfinite, log, sqrt
from pathlib import Path
import random
from statistics import mean

IDS = ("sp500", "nasdaq100", "us10y")
EXPERIMENTS = ("ewma_gaussian", "joint_fhs", "joint_fhs_llm")
LEGACY = ("llm", "statistical", "hybrid")
JST = timezone(timedelta(hours=9))


class TailRiskError(ValueError):
    pass


def timestamp(raw):
    try:
        t = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except (AttributeError, TypeError, ValueError) as exc:
        raise TailRiskError("timezone-aware ISO timestamp required") from exc
    if t.utcoffset() is None:
        raise TailRiskError("timezone-aware ISO timestamp required")
    return t


def number(raw):
    if isinstance(raw, bool) or not isinstance(raw, (float, int)) or not isfinite(raw):
        raise TailRiskError("finite JSON number required")
    return float(raw)


def digest(obj):
    return sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False,
                             separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def sealed(obj):
    result = copy.deepcopy(obj)
    result["sha256"] = digest(result)
    return result


def verify(obj):
    if not isinstance(obj, dict) or obj.get("sha256") != digest(
            {k: v for k, v in obj.items() if k != "sha256"}):
        raise TailRiskError("missing or invalid artifact hash")
    return True


def write_new(path, obj):
    """Exclusive create, including for corrections; never replace a record."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("x", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2, allow_nan=False)
        f.write("\n")


def _url(raw):
    if not isinstance(raw, str) or not raw.startswith("https://"):
        raise TailRiskError("HTTPS provenance URL required")
    return raw


def _sha(raw):
    if not isinstance(raw, str) or len(raw) != 40 or any(c not in "0123456789abcdef" for c in raw):
        raise TailRiskError("full lowercase Git commit SHA required")
    return raw


def validate_policy(p):
    if p.get("schema") != "parallel-tail-risk-v1" or tuple(p.get("assets", [])) != IDS:
        raise TailRiskError("unsupported experiment policy")
    if not 0 < number(p["decay"]) < 1:
        raise TailRiskError("decay must be between zero and one")
    for key in ("warmup_changes", "residual_window", "min_blocks", "draws", "seed"):
        if type(p.get(key)) is not int or p[key] < 1:
            raise TailRiskError(f"positive integer {key} required")
    if p["warmup_changes"] < 2 or p["draws"] < 100:
        raise TailRiskError("insufficient warmup or simulation draws")
    if p.get("intervals") != [50, 80, 90] or p.get("block_length") != 5:
        raise TailRiskError("v1 requires five weekday blocks and 50/80/90 intervals")
    if p.get("checkpoints") != [8, 13, 26]:
        raise TailRiskError("locked checkpoints required")
    for key in ("wis_improvement", "max_asset_wis_regression", "max_center_mae_regression"):
        if not 0 <= number(p[key]) < 1:
            raise TailRiskError("invalid acceptance threshold")
    if not 0 < number(p["max_scenario_probability"]) <= 1:
        raise TailRiskError("invalid scenario probability cap")
    if set(p.get("scenario_dictionary", {})) != {"none", "growth_risk_off", "inflation_risk_off", "rebound"}:
        raise TailRiskError("v1 requires the locked four-state scenario dictionary")
    for state, impacts in p["scenario_dictionary"].items():
        if set(impacts) != set(IDS):
            raise TailRiskError("scenario must specify exactly the core three assets")
        for value in impacts.values():
            number(value)
        if state == "none" and any(impacts.values()):
            raise TailRiskError("none scenario must have zero impacts")


def _weekdays(a, b):
    result = []
    while a <= b:
        if a.weekday() < 5:
            result.append(a.isoformat())
        a += timedelta(days=1)
    return result


def _mask(row):
    sessions = row.get("sessions", {})
    if set(sessions) != set(IDS) or any(type(v) is not bool for v in sessions.values()):
        raise TailRiskError("each asset needs an explicit session flag; never infer holidays from missing data")
    return tuple(sessions[k] for k in IDS)


def prepare(snapshot, policy, *, now=None, demo=False):
    """Validate a complete US weekday panel and compute strictly lagged EWMA residuals.

    Prices use log returns *100, yields use differences *100 bp. Closed sessions
    have null input, zero change and no variance update; missing open quotes fail.
    Historical blocks must contain every future open session. Future closed
    sessions are masked out explicitly, never interpreted as missing quotes.
    """
    validate_policy(policy)
    now = datetime.now(timezone.utc) if now is None else timestamp(now)
    cutoff = timestamp(snapshot["information_cutoff"])
    origin = cutoff.astimezone(JST).date()
    if origin.weekday() != 5 or cutoff.astimezone(JST).strftime("%H:%M:%S") != "12:00:00":
        raise TailRiskError("scheduled cutoff must be Saturday 12:00 JST")
    if origin < date.fromisoformat(policy["first_origin"]):
        raise TailRiskError("experiment cannot start before registered first origin")
    if snapshot.get("dataset_kind") != "real" and not demo:
        raise TailRiskError("synthetic input may only run as an inadmissible demo")
    if timestamp(snapshot["acquired_at"]) > min(cutoff, now):
        raise TailRiskError("snapshot acquired after information cutoff or execution")
    _sha(snapshot["code_commit"])
    sources = snapshot.get("sources", {})
    if set(sources) != set(IDS):
        raise TailRiskError("all three locked sources required")
    for k, s in sources.items():
        _url(s["source_url"])
        expected = "percent_yield" if k == "us10y" else "index"
        if s.get("unit") != expected or s.get("quote_type") != ("official_par_yield" if k == "us10y" else "close"):
            raise TailRiskError("wrong instrument unit or closing convention")
        if not all(isinstance(s.get(f), str) and s[f].strip() for f in ("instrument", "vendor", "close_rule")):
            raise TailRiskError("instrument, vendor and close_rule required")
    history = snapshot.get("history", [])
    if len(history) < policy["warmup_changes"] + policy["residual_window"] + 1:
        raise TailRiskError("insufficient audited history: warmup plus full residual window required")
    if [r["date"] for r in history] != _weekdays(date.fromisoformat(history[0]["date"]), origin-timedelta(days=1)):
        raise TailRiskError("history must cover every weekday through reference Friday exactly once")
    last = None
    changes, masks = [], []
    acquired = timestamp(snapshot["acquired_at"])
    for row in history:
        mask = _mask(row)
        if set(row.get("values", {})) != set(IDS):
            raise TailRiskError("three values/nulls required")
        observed = timestamp(row["observed_at"])
        if observed.date().isoformat() != row["date"] or observed > acquired:
            raise TailRiskError("invalid observed date or unavailable observation")
        values = []
        for j, k in enumerate(IDS):
            v = row["values"][k]
            if not mask[j]:
                if v is not None or last is None:
                    raise TailRiskError("closed sessions require null, with an earlier observed level")
                values.append(last[j])
            else:
                v = number(v)
                if k != "us10y" and v <= 0:
                    raise TailRiskError("index level must be positive")
                values.append(v)
        if last is not None:
            changes.append([100*(values[j]-last[j]) if k == "us10y" else 100*log(values[j]/last[j]) for j, k in enumerate(IDS)])
            masks.append(mask)
        last = values
    reference_dates = {k: next(r["date"] for r in reversed(history) if r["sessions"][k]) for k in IDS}
    if any(date.fromisoformat(d) < origin-timedelta(days=5) for d in reference_dates.values()):
        raise TailRiskError("reference must be the last audited open session of the preceding week")
    calendar = snapshot.get("target_calendar", [])
    monday = origin+timedelta(days=2)
    if [r["date"] for r in calendar] != _weekdays(monday, monday+timedelta(days=4)):
        raise TailRiskError("target calendar must be next Monday-Friday including closed days")
    future_masks = [_mask(r) for r in calendar]
    targets = snapshot.get("targets", {})
    if set(targets) != set(IDS):
        raise TailRiskError("three exact target closing timestamps required")
    for j, k in enumerate(IDS):
        sessions = [r["date"] for r in calendar if r["sessions"][k]]
        if not sessions:
            raise TailRiskError("target week has no open session")
        end = timestamp(targets[k]["observed_at"])
        if end.date().isoformat() != sessions[-1] or end <= now:
            raise TailRiskError("target must be the exact last open session, after execution")
    start = timestamp(snapshot["target_start_at"])
    if start != datetime.combine(monday, datetime.min.time(), timezone.utc) or not cutoff < start or now >= start:
        raise TailRiskError("target start must be next Monday 00:00 UTC, after cutoff and execution")
    for r in calendar:
        _url(r["source_url"])
    w, decay = policy["warmup_changes"], policy["decay"]
    variances = []
    for j in range(3):
        initial = [x[j]**2 for x, m in zip(changes[:w], masks[:w]) if m[j]]
        if len(initial) < 2 or mean(initial) <= 0:
            raise TailRiskError("zero/insufficient initial variance")
        variances.append(mean(initial))
    residuals, residual_masks = [], []
    for x, mask in zip(changes[w:], masks[w:]):
        residuals.append([x[j]/sqrt(variances[j]) if mask[j] else 0 for j in range(3)])
        residual_masks.append(mask)
        for j in range(3):
            if mask[j]:
                variances[j] = decay*variances[j]+(1-decay)*x[j]**2
    residuals, residual_masks = residuals[-policy["residual_window"]:], residual_masks[-policy["residual_window"]:]
    # Remove estimated historical drift, while preserving closed-day zeros.
    centers = [mean(r[j] for r, m in zip(residuals, residual_masks) if m[j]) for j in range(3)]
    residuals = [[r[j]-centers[j] if m[j] else 0 for j in range(3)] for r, m in zip(residuals, residual_masks)]
    blocks = [residuals[i:i+5] for i in range(len(residuals)-4)
              if all(not future_masks[d][j] or residual_masks[i+d][j] for d in range(5) for j in range(3))]
    if len(blocks) < policy["min_blocks"]:
        raise TailRiskError("insufficient joint blocks matching the target holiday calendar")
    scales = snapshot.get("normalization_scales", {})
    if set(scales) != set(IDS) or any(number(x) <= 0 for x in scales.values()):
        raise TailRiskError("positive launch-locked normalization scales required")
    return {"variances": variances, "blocks": blocks, "masks": future_masks,
            "reference": dict(zip(IDS, last)), "reference_dates": reference_dates, "now": now, "cutoff": cutoff}


def _quantile(xs, p):
    a = sorted(xs)
    t = (len(a)-1)*p
    i = int(t)
    return a[i]+(t-i)*(a[min(i+1, len(a)-1)]-a[i])


def summarize(draws):
    return {"point_change": mean(draws), "median_change": _quantile(draws, .5),
            "prob_positive": mean(x > 0 for x in draws),
            "intervals": {str(c): [_quantile(draws, (1-c/100)/2), _quantile(draws, (1+c/100)/2)] for c in (50, 80, 90)}}


def events(v):
    return {"sp500_down_5": v["sp500"] <= -5, "nasdaq100_down_5": v["nasdaq100"] <= -5,
            "us10y_up_25": v["us10y"] >= 25, "us10y_down_25": v["us10y"] <= -25,
            "equities_joint_down_5": v["sp500"] <= -5 and v["nasdaq100"] <= -5}


def _overlay(snapshot, policy, cutoff):
    overlay = snapshot.get("llm_overlay")
    if not isinstance(overlay, dict) or timestamp(overlay["authored_at"]) > min(cutoff, timestamp(snapshot["acquired_at"])):
        raise TailRiskError("independent timestamped LLM overlay required")
    if not isinstance(overlay.get("rationale"), str) or not overlay["rationale"].strip():
        raise TailRiskError("LLM rationale required (including explicit no adjustment)")
    probabilities = overlay.get("probabilities", {})
    if set(probabilities) != set(policy["scenario_dictionary"]):
        raise TailRiskError("use the registered mutually exclusive scenario dictionary")
    if any(not 0 <= number(x) <= policy["max_scenario_probability"] for k, x in probabilities.items() if k != "none"):
        raise TailRiskError("scenario weight exceeds registered bound")
    if any(number(x) < 0 for x in probabilities.values()) or abs(sum(probabilities.values())-1) > 1e-9:
        raise TailRiskError("categorical scenario probabilities must sum to one")
    return overlay


def legacy_sidecar(original, snapshot):
    """Adapt a COPY of the existing generator JSON, without changing that file."""
    cutoff = original.get("information_cutoff", original.get("forecast_cutoff"))
    if cutoff != snapshot["information_cutoff"]:
        raise TailRiskError("legacy origin differs from experiment")
    markets = {}
    for k in IDS:
        old = original["market_forecasts"][k]
        if old.get("unit") != ("basis_points" if k == "us10y" else "percent_return"):
            raise TailRiskError("legacy target unit differs from parallel experiment")
        if "target_at" in old and timestamp(old["target_at"]) != timestamp(snapshot["targets"][k]["observed_at"]):
            raise TailRiskError("legacy target closing timestamp differs")
        actual_reference_date = next(r["date"] for r in reversed(snapshot["history"]) if r["sessions"][k])
        if "reference_date" in old and old["reference_date"] != actual_reference_date:
            raise TailRiskError("legacy reference session differs")
        if old.get("source", old.get("source_url")) != snapshot["sources"][k]["source_url"]:
            raise TailRiskError("legacy source URL mismatch; reconcile before sealing")
        values = {}
        for arm in LEGACY:
            a = old["arms"][arm]
            values[arm] = {"point_change": a["point_change"], "prob_positive": a["prob_positive"],
                           "intervals": {str(c): a[f"interval_{c}"] for c in (50, 80, 90)}}
        markets[k] = {"reference_level": old.get("reference_level", old.get("baseline_level")),
                      "reference_date": actual_reference_date, "target_date": old["target_date"], "target_at": snapshot["targets"][k]["observed_at"],
                      "source_identity": snapshot["sources"][k], "arms": values}
    return {"information_cutoff": cutoff, "original_record_sha256": digest(original), "market_forecasts": markets}


def generate(snapshot, policy, *, now=None, demo=False):
    fit = prepare(snapshot, policy, now=now, demo=demo)
    overlay = _overlay(snapshot, policy, fit["cutoff"])
    legacy = snapshot.get("legacy_forecast")
    if legacy != legacy_sidecar(snapshot["legacy_original"], snapshot):
        raise TailRiskError("legacy sidecar must exactly preserve original points/probabilities/intervals")
    if not isinstance(legacy, dict) or legacy.get("information_cutoff") != snapshot["information_cutoff"]:
        raise TailRiskError("same-origin immutable legacy sidecar required")
    for k in IDS:
        target = legacy.get("market_forecasts", {}).get(k, {})
        if target.get("reference_level") != fit["reference"][k] or target.get("target_date") != timestamp(snapshot["targets"][k]["observed_at"]).date().isoformat():
            raise TailRiskError("legacy and experiments must have identical reference/target")
        if target.get("source_identity") != snapshot["sources"][k] or target.get("target_at") != snapshot["targets"][k]["observed_at"]:
            raise TailRiskError("legacy must use identical source, instrument and closing time")
        if set(target.get("arms", {})) != set(LEGACY):
            raise TailRiskError("all existing three arms must remain present")
        for v in target["arms"].values():
            validate_distribution(v)
    data = {version: {k: [] for k in IDS} for version in EXPERIMENTS}
    event_draws = {version: {k: [] for k in events(dict.fromkeys(IDS, 0))} for version in EXPERIMENTS}
    rng_g, rng_b, rng_s = (random.Random(policy["seed"]+n) for n in range(3))
    names = list(policy["scenario_dictionary"])
    weights = [overlay["probabilities"][k] for k in names]
    for _ in range(policy["draws"]):
        block = rng_b.choice(fit["blocks"])
        scenario = rng_s.choices(names, weights=weights, k=1)[0]
        vectors = {}
        for version in EXPERIMENTS[:2]:
            variances, sums = fit["variances"][:], [0.0]*3
            for day, mask in enumerate(fit["masks"]):
                for j in range(3):
                    if mask[j]:
                        z = rng_g.gauss(0, 1) if version == "ewma_gaussian" else block[day][j]
                        x = sqrt(variances[j])*z
                        sums[j] += x
                        variances[j] = policy["decay"]*variances[j]+(1-policy["decay"])*x*x
            vectors[version] = {k: sums[j] if k == "us10y" else 100*(exp(sums[j]/100)-1) for j, k in enumerate(IDS)}
        # Reuse the exact FHS path; the ablation differs only by the overlay.
        vectors["joint_fhs_llm"] = {k: vectors["joint_fhs"][k]+policy["scenario_dictionary"][scenario][k] for k in IDS}
        if any(vectors["joint_fhs_llm"][k] <= -100 for k in IDS[:2]):
            raise TailRiskError("overlay generated impossible simple return; no clipping permitted")
        for version, vector in vectors.items():
            for k in IDS:
                data[version][k].append(vector[k])
            for k, value in events(vector).items():
                event_draws[version][k].append(value)
    completed = datetime.now(timezone.utc) if now is None else fit["now"]
    if completed >= timestamp(snapshot["target_start_at"]):
        raise TailRiskError("simulation completed after observation window started")
    record = {"schema": "parallel-tail-risk-v1", "record_type": "parallel_forecast",
              "dataset_kind": snapshot["dataset_kind"], "demo": demo,
              "information_cutoff": snapshot["information_cutoff"], "execution_started_at": fit["now"].isoformat(),
              "generated_at": completed.isoformat(),
              "target_start_at": snapshot["target_start_at"], "target_calendar": snapshot["target_calendar"],
              "targets": snapshot["targets"], "sources": snapshot["sources"], "reference": fit["reference"], "reference_dates": fit["reference_dates"],
              "snapshot_sha256": digest(snapshot), "policy_sha256": digest(policy), "policy": policy,
              "input_provenance": {"acquired_at": snapshot["acquired_at"], "raw_sha256": snapshot.get("raw_sha256", {}),
                                   "history_start": snapshot["history"][0]["date"], "history_end": snapshot["history"][-1]["date"],
                                   "history_sha256": digest(snapshot["history"]), "history_rows": len(snapshot["history"])},
              "code_commit": snapshot["code_commit"], "normalization_scales": snapshot["normalization_scales"],
              "launch_lock_sha256": snapshot.get("launch_lock_sha256"),
              "legacy_forecast_sha256": digest(legacy), "legacy_forecast": legacy,
              "legacy_original": snapshot["legacy_original"],
              "llm_overlay": overlay, "fit": {"daily_sigmas": dict(zip(IDS, map(sqrt, fit["variances"]))), "eligible_blocks": len(fit["blocks"])},
              "experiments": {version: {"markets": {k: summarize(v) for k, v in data[version].items()},
                             "events": {k: mean(v) for k, v in event_draws[version].items()}} for version in EXPERIMENTS},
              "publication": "UNCONFIRMED: requires separate remote Git receipt; hash alone is insufficient"}
    return sealed(record)


def validate_distribution(v):
    number(v["point_change"])
    if not 0 <= number(v["prob_positive"]) <= 1:
        raise TailRiskError("probability outside [0,1]")
    if set(v.get("intervals", {})) != {"50", "80", "90"}:
        raise TailRiskError("all three intervals required")
    previous = None
    for c in (50, 80, 90):
        q = v["intervals"][str(c)]
        if not isinstance(q, list) or len(q) != 2:
            raise TailRiskError("two interval endpoints required")
        lo, hi = map(number, q)
        if lo > hi or previous and not (lo <= previous[0] <= previous[1] <= hi):
            raise TailRiskError("intervals must be ordered and nested")
        previous = lo, hi
    if "median_change" in v and not v["intervals"]["50"][0] <= number(v["median_change"]) <= v["intervals"]["50"][1]:
        raise TailRiskError("median outside central interval")


def distribution_score(v, y):
    validate_distribution(v)
    y = number(y)
    intervals, weighted, weight = {}, 0, 0
    for c in (50, 80, 90):
        lo, hi = v["intervals"][str(c)]
        alpha = 1-c/100
        score = hi-lo+2/alpha*(max(0, lo-y)+max(0, y-hi))
        intervals[str(c)] = {"covered": lo <= y <= hi, "width": hi-lo, "score": score,
                            "lower_breach": y < lo, "upper_breach": y > hi,
                            "exceedance": max(0, lo-y, y-hi)}
        weighted += alpha/2*score
        weight += alpha/2
    q05, q95 = v["intervals"]["90"]
    pinball = lambda q, p: (p-(y < q))*(y-q)
    return {"absolute_error": abs(v["point_change"]-y), "squared_error": (v["point_change"]-y)**2,
            "prob_positive": v["prob_positive"], "actual_positive": int(y > 0),
            "brier": (v["prob_positive"]-(y > 0))**2, "intervals": intervals,
            "weighted_interval_score": weighted/weight,
            "wis_with_median": (weighted+.5*abs(v["median_change"]-y))/3.5 if "median_change" in v else None,
            "tail_pinball": (pinball(q05, .05)+pinball(q95, .95))/2}


def score(record, outcomes, *, evaluation_as_of):
    verify(record)
    now = timestamp(evaluation_as_of)
    if set(outcomes) - set(IDS):
        raise TailRiskError("unknown actual target")
    actuals, pending = {}, []
    for k in IDS:
        o = outcomes.get(k)
        if not o or o.get("status") != "verified":
            pending.append(k)
            continue
        if o.get("source_identity") != record["sources"][k] or o.get("observed_at") != record["targets"][k]["observed_at"]:
            raise TailRiskError("settlement instrument/provider/unit/time differs from frozen target")
        if not timestamp(o["observed_at"]) <= timestamp(o["available_at"]) <= now:
            raise TailRiskError("settlement not yet available")
        level = number(o["value"])
        if k != "us10y" and level <= 0:
            raise TailRiskError("settlement price must be positive")
        actuals[k] = 100*(level-record["reference"][k]) if k == "us10y" else 100*(level/record["reference"][k]-1)
    versions = {"legacy_"+arm: {k: record["legacy_forecast"]["market_forecasts"][k]["arms"][arm] for k in IDS} for arm in LEGACY}
    versions.update({version: record["experiments"][version]["markets"] for version in EXPERIMENTS})
    by_version = {v: {k: distribution_score(f[k], y) for k, y in actuals.items()} for v, f in versions.items()}
    event_actuals = {}
    if "sp500" in actuals:
        event_actuals["sp500_down_5"] = actuals["sp500"] <= -5
    if "nasdaq100" in actuals:
        event_actuals["nasdaq100_down_5"] = actuals["nasdaq100"] <= -5
    if "us10y" in actuals:
        event_actuals.update(us10y_up_25=actuals["us10y"] >= 25, us10y_down_25=actuals["us10y"] <= -25)
    if set(IDS[:2]) <= set(actuals):
        event_actuals["equities_joint_down_5"] = actuals["sp500"] <= -5 and actuals["nasdaq100"] <= -5
    risk = {v: {k: {"probability": record["experiments"][v]["events"][k], "actual": int(y),
                       "brier": (record["experiments"][v]["events"][k]-y)**2} for k, y in event_actuals.items()} for v in EXPERIMENTS}
    return sealed({"record_type": "parallel_verification", "forecast_sha256": record["sha256"],
                   "information_cutoff": record["information_cutoff"], "evaluation_as_of": evaluation_as_of,
                   "actual_changes": actuals, "outcomes_sha256": digest(outcomes), "outcomes": outcomes,
                   "pending": pending, "by_version": by_version, "risk": risk,
                   "event_note": "Events share underlying market outcomes; never count as independent samples."})


def launch_lock(record):
    verify(record)
    if record["information_cutoff"][:10] != record["policy"]["first_origin"] or record["demo"] or record["dataset_kind"] != "real":
        raise TailRiskError("launch lock must originate from first real prospective cohort")
    return sealed({"record_type": "parallel_launch_lock", "first_origin": record["policy"]["first_origin"],
                   "first_forecast_sha256": record["sha256"], "policy_sha256": record["policy_sha256"],
                   "normalization_scales": record["normalization_scales"], "sources": record["sources"]})


def admission(record, receipt, lock):
    verify(record)
    verify(receipt)
    verify(lock)
    validate_policy(record["policy"])
    if digest(record["policy"]) != record["policy_sha256"] or digest(record["legacy_forecast"]) != record["legacy_forecast_sha256"] or digest(record["legacy_original"]) != record["legacy_forecast"]["original_record_sha256"]:
        raise TailRiskError("embedded policy or legacy hash mismatch")
    if record["demo"] or record["dataset_kind"] != "real":
        raise TailRiskError("synthetic/demo artifacts never enter live acceptance")
    if lock["policy_sha256"] != record["policy_sha256"] or lock["sources"] != record["sources"] or lock["normalization_scales"] != record["normalization_scales"]:
        raise TailRiskError("policy/source/scales changed: register a new cohort, do not pool")
    first = record["information_cutoff"][:10] == lock["first_origin"]
    if first and lock["first_forecast_sha256"] != record["sha256"] or not first and record["launch_lock_sha256"] != lock["sha256"]:
        raise TailRiskError("missing or mismatched launch lock")
    if receipt.get("forecast_sha256") != record["sha256"] or receipt.get("remote_content_verified") is not True:
        raise TailRiskError("remote publication receipt mismatch")
    _sha(receipt["commit"])
    _url(receipt["commit_url"])
    published = timestamp(receipt["committed_at"])
    # Git timestamps have second precision; preserve exact generation time too.
    if not timestamp(record["generated_at"]).replace(microsecond=0) <= published < timestamp(record["target_start_at"]):
        raise TailRiskError("publication must follow generation and precede target observation window")
    return {"prospective": True, "on_time": max(published, timestamp(record["generated_at"])) <= timestamp(record["information_cutoff"]),
            "timestamp_limit": "Git metadata + remotely matched content; not an independent trusted timestamp service"}


def cumulative(cohorts, lock, *, bootstrap_draws=2000):
    """Paired losses, one weekly cluster across all assets; no optional stopping."""
    verify(lock)
    weeks, excluded, seen = [], [], set()
    for item in cohorts:
        f, s, receipt = item["forecast"], item["verification"], item["receipt"]
        verify(s)
        status = admission(f, receipt, lock)
        origin = f["information_cutoff"]
        if origin in seen:
            raise TailRiskError("duplicate cohort, including corrections")
        seen.add(origin)
        if s["forecast_sha256"] != f["sha256"] or s != score(f, s["outcomes"], evaluation_as_of=s["evaluation_as_of"]):
            raise TailRiskError("verification does not independently replay")
        if not status["on_time"] or s["pending"]:
            excluded.append({"origin": origin, "reason": "late" if not status["on_time"] else "pending", "pending": s["pending"]})
            continue
        weeks.append((origin, f, s))
    weeks.sort(key=lambda x: x[0])
    if weeks and weeks[0][0][:10] != lock["first_origin"]:
        excluded.append({"reason": "nonconsecutive_admitted_weeks", "missing_first_origin": lock["first_origin"]})
    for (a, _, _), (b, _, _) in zip(weeks, weeks[1:]):
        if (timestamp(b)-timestamp(a)).days != 7:
            # Gaps are reported and break block-bootstrap admission, not silently bridged.
            excluded.append({"reason": "nonconsecutive_admitted_weeks", "between": [a, b]})
    if not weeks:
        return {"admitted_weeks": 0, "excluded": excluded, "promote": False}
    versions = list(weeks[0][2]["by_version"])
    metrics = {}
    for v in versions:
        metrics[v] = {k: {"weighted_interval_score": mean(s["by_version"][v][k]["weighted_interval_score"] for _, _, s in weeks),
                          "tail_pinball": mean(s["by_version"][v][k]["tail_pinball"] for _, _, s in weeks),
                          "mae": mean(s["by_version"][v][k]["absolute_error"] for _, _, s in weeks),
                          "rmse": sqrt(mean(s["by_version"][v][k]["squared_error"] for _, _, s in weeks)),
                          "brier": mean(s["by_version"][v][k]["brier"] for _, _, s in weeks),
                          "direction_calibration": {"mean_probability": mean(s["by_version"][v][k]["prob_positive"] for _, _, s in weeks),
                                                    "observed_frequency": mean(s["by_version"][v][k]["actual_positive"] for _, _, s in weeks)},
                          "coverage": {str(c): mean(s["by_version"][v][k]["intervals"][str(c)]["covered"] for _, _, s in weeks) for c in (50, 80, 90)},
                          "tail_breach_counts": {side: sum(s["by_version"][v][k]["intervals"]["90"][side] for _, _, s in weeks) for side in ("lower_breach", "upper_breach")}}
                      for k in IDS}
    policy, n = weeks[0][1]["policy"], len(weeks)
    scales = lock["normalization_scales"]
    comparisons = {}
    for v in EXPERIMENTS[1:]:
        comparisons[v] = {}
        for baseline in ("legacy_hybrid", "ewma_gaussian") + (("joint_fhs",) if v == "joint_fhs_llm" else ()):
            series = [mean((s["by_version"][v][k]["weighted_interval_score"]-s["by_version"][baseline][k]["weighted_interval_score"])/scales[k] for k in IDS) for _, _, s in weeks]
            base_score = mean(metrics[baseline][k]["weighted_interval_score"]/scales[k] for k in IDS)
            improvement = -mean(series)/base_score if base_score > 0 else None
            bounds = None
            if n >= 26 and not any(x.get("reason") == "nonconsecutive_admitted_weeks" for x in excluded):
                rng, draws, length = random.Random(policy["seed"]), [], 4
                for _ in range(bootstrap_draws):
                    sample = []
                    while len(sample) < n:
                        i = rng.randrange(n-length+1)
                        sample.extend(series[i:i+length])
                    draws.append(mean(sample[:n]))
                bounds = [_quantile(draws, .025), _quantile(draws, .975)]
            improved_assets = sum(metrics[v][k]["weighted_interval_score"] < metrics[baseline][k]["weighted_interval_score"] for k in IDS)
            guards = all(metrics[v][k]["weighted_interval_score"] <= (1+policy["max_asset_wis_regression"])*metrics[baseline][k]["weighted_interval_score"] and
                         metrics[v][k]["mae"] <= (1+policy["max_center_mae_regression"])*metrics[baseline][k]["mae"] for k in IDS)
            tail_better = mean(metrics[v][k]["tail_pinball"]/scales[k] for k in IDS) < mean(metrics[baseline][k]["tail_pinball"]/scales[k] for k in IDS)
            comparisons[v][baseline] = {"relative_improvement": improvement, "paired_weekly_loss_difference": mean(series),
                                       "moving_block_bootstrap_95_interval": bounds, "improved_assets": improved_assets,
                                       "guards_pass": guards, "tail_better": tail_better,
                                       "passes": n >= 26 and n in policy["checkpoints"] and improvement is not None and improvement >= policy["wis_improvement"] and improved_assets >= 2 and guards and tail_better and bounds is not None and bounds[1] < 0}
    risk_summary = {v: {event: {"n": n,
                               "brier": mean(s["risk"][v][event]["brier"] for _, _, s in weeks),
                               "mean_probability": mean(s["risk"][v][event]["probability"] for _, _, s in weeks),
                               "observed_frequency": mean(s["risk"][v][event]["actual"] for _, _, s in weeks)}
                        for event in weeks[0][2]["risk"][v]} for v in EXPERIMENTS}
    return {"admitted_weeks": n, "excluded": excluded, "per_asset": metrics, "comparisons": comparisons,
            "risk_calibration": risk_summary,
            "checkpoint": n in policy["checkpoints"], "promote": False,
            "eligible_for_review": {v: all(c["passes"] for c in cs.values()) for v, cs in comparisons.items()},
            "note": "No automatic promotion; bootstrap is approximate with few weeks. 26 weeks cannot establish 5% tail calibration."}
