"""CLI for immutable parallel forecasts, settlement and remote publication audit.

Network access occurs ONLY in the explicitly invoked receipt command (gh API).
"""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
from math import sqrt
from statistics import stdev
import subprocess
import sys

from .tail_risk import (TailRiskError, admission, cumulative, digest, generate,
                        launch_lock, legacy_sidecar, prepare, score, sealed,
                        timestamp, validate_policy, verify, write_new)

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_POLICY = ROOT / "research/parallel/policies/tail-risk-v1.json"


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def import_panel(bundle_path):
    """Convert externally acquired CSVs plus an audited calendar; no fetching/filling.

    Acquisition timestamps are today's snapshot provenance, not fabricated
    historical first-availability times. Raw file hashes accompany the result.
    """
    spec = read(bundle_path)
    root = Path(bundle_path).resolve().parent
    raw = {}
    checksums = {}
    from .tail_risk import IDS
    from hashlib import sha256
    if set(spec["series_files"]) != set(IDS):
        raise TailRiskError("three source CSV descriptors required")
    for k, descriptor in spec["series_files"].items():
        path = root / descriptor["path"]
        checksums[k] = sha256(path.read_bytes()).hexdigest()
        values = {}
        with path.open(encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                day, value = row[descriptor["date_column"]], row[descriptor["value_column"]]
                if day in values:
                    raise TailRiskError("duplicate source CSV date")
                if day > spec["information_cutoff"][:10]:
                    raise TailRiskError("source CSV contains post-cutoff data")
                if value in ("", ".", "NA", "N/A"):
                    values[day] = None
                else:
                    values[day] = float(value)
        raw[k] = values
    calendar_path = root / spec["history_calendar_file"]
    checksums["calendar"] = sha256(calendar_path.read_bytes()).hexdigest()
    calendar = read(calendar_path)
    history = []
    for r in calendar:
        values = {}
        for k in IDS:
            v = raw[k].get(r["date"])
            if r["sessions"][k] and v is None:
                raise TailRiskError(f"missing open-session quote: {k} {r['date']}")
            if not r["sessions"][k] and v is not None:
                raise TailRiskError(f"closed-calendar/source conflict: {k} {r['date']}")
            values[k] = v
        history.append(dict(r, values=values))
    snapshot = {k: v for k, v in spec.items() if k not in ("series_files", "history_calendar_file")}
    snapshot.update(history=history, raw_sha256=checksums,
                    history_provenance="Acquired snapshot, not historical original publication vintages. Calendar supplied explicitly; no silent forward fill.")
    if not snapshot.get("normalization_scales") or all(v is None for v in snapshot["normalization_scales"].values()):
        if snapshot["information_cutoff"][:10] != "2026-11-28":
            raise TailRiskError("derive scales only at registered launch; later snapshots must copy launch lock")
        last, changes = None, {k: [] for k in IDS}
        for row in history:
            values = {k: row["values"][k] if row["sessions"][k] else (last[k] if last else None) for k in IDS}
            if last:
                for k in IDS:
                    if values[k] is None or last[k] is None:
                        raise TailRiskError("initial reference missing")
                    changes[k].append(100*(values[k]-last[k]) if k == "us10y" else 100*(values[k]/last[k]-1))
            last = values
        snapshot["normalization_scales"] = {k: stdev(v)*sqrt(5) for k, v in changes.items()}
        snapshot["normalization_method"] = "Launch acquired history daily simple-return/bp sample stdev * sqrt(5), including explicit closed-session zeros; fixed thereafter."
    return snapshot


def remote_receipt(path, repository, *, ref="main", runner=None):
    """Match exact remote bytes and inspect entire file history; no credential output.

    This verifies GitHub content + commit metadata, not a trusted wall-clock seal.
    Raises on a rewritten file. Corrections must use a new file path.
    """
    runner = subprocess.check_output if runner is None else runner
    if repository != "WD-nanophotonics/FinanceSim":
        raise TailRiskError("unexpected repository")
    p = Path(path).resolve()
    relative = p.relative_to(ROOT).as_posix()
    if not relative.startswith("research/parallel/forecasts/"):
        raise TailRiskError("only append-only parallel forecast paths may be attested")
    record = read(p)
    verify(record)
    local_bytes = p.read_bytes()
    from urllib.parse import quote
    log = json.loads(runner(["gh", "api", f"repos/{repository}/commits?path={relative}&per_page=100&sha={quote(ref, safe='')}"], cwd=ROOT))
    if len(log) != 1:
        raise TailRiskError("remote file absent or has multiple modifications; never rewrite forecasts")
    commit = log[0]["sha"]
    info = json.loads(runner(["gh", "api", f"repos/{repository}/commits/{commit}"], cwd=ROOT))
    change = next((x for x in info["files"] if x["filename"] == relative), None)
    if not change or change["status"] != "added":
        raise TailRiskError("remote forecast must be a newly added path")
    import base64
    response = json.loads(runner(["gh", "api", f"repos/{repository}/contents/{relative}?ref={commit}"], cwd=ROOT))
    if response.get("encoding") != "base64" or base64.b64decode(response["content"]) != local_bytes:
        raise TailRiskError("remote bytes differ from local frozen forecast")
    code = json.loads(runner(["gh", "api", f"repos/{repository}/commits/{record['code_commit']}"], cwd=ROOT))
    if timestamp(code["commit"]["committer"]["date"]) > timestamp(record["generated_at"]):
        raise TailRiskError("declared code commit postdates model execution")
    return sealed({"record_type": "parallel_publication_receipt", "forecast_sha256": record["sha256"],
                   "commit": commit, "commit_url": f"https://github.com/{repository}/commit/{commit}",
                   "path": relative, "remote_content_verified": True,
                   "remote_ref": ref,
                   "committed_at": log[0]["commit"]["committer"]["date"],
                   "checked_at": datetime.now(timezone.utc).isoformat(),
                   "limitation": "Remote content and Git metadata verified; commit dates are not third-party trusted timestamps."})


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    p = commands.add_parser("import-panel")
    p.add_argument("bundle")
    p.add_argument("-o", "--output", required=True)
    p = commands.add_parser("preflight")
    p.add_argument("--policy", default=str(DEFAULT_POLICY))
    p.add_argument("--input")
    p = commands.add_parser("generate")
    p.add_argument("input")
    p.add_argument("--policy", default=str(DEFAULT_POLICY))
    p.add_argument("--legacy", required=True, help="Existing same-origin three-arm JSON, read only")
    p.add_argument("--launch-lock")
    p.add_argument("--demo", action="store_true")
    p.add_argument("-o", "--output", required=True)
    p = commands.add_parser("lock")
    p.add_argument("forecast")
    p.add_argument("-o", "--output", required=True)
    p = commands.add_parser("receipt")
    p.add_argument("forecast")
    p.add_argument("--repository", default="WD-nanophotonics/FinanceSim")
    p.add_argument("--ref", default="main", help="Published remote branch/ref, defaults to main")
    p.add_argument("-o", "--output", required=True)
    p = commands.add_parser("score")
    p.add_argument("forecast")
    p.add_argument("outcomes")
    p.add_argument("-o", "--output", required=True)
    p = commands.add_parser("report")
    p.add_argument("manifest", help="List of forecast/verification/receipt file paths")
    p.add_argument("--launch-lock", required=True)
    p.add_argument("-o", "--output", required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "import-panel":
            result = import_panel(args.bundle)
        elif args.command == "preflight":
            policy = read(args.policy)
            validate_policy(policy)
            result = {"policy_valid": True, "first_origin": policy["first_origin"], "policy_sha256": digest(policy),
                      "live_ready": False, "outstanding": ["audited long history through origin Friday", "same-origin three-arm forecast", "LLM overlay", "source/calendar review", "publication receipt"]}
            if args.input:
                fit = prepare(read(args.input), policy)
                result.update(input_valid=True, eligible_blocks=len(fit["blocks"]))
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0
        elif args.command == "generate":
            snapshot = read(args.input)
            head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
            if snapshot["code_commit"] != head:
                raise TailRiskError("input code_commit must equal current checkout HEAD")
            if subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=normal", "--", "financesim", "research/parallel/policies"], cwd=ROOT, text=True).strip():
                raise TailRiskError("model/policy working tree differs from declared code commit")
            snapshot["legacy_original"] = read(args.legacy)
            snapshot["legacy_forecast"] = legacy_sidecar(snapshot["legacy_original"], snapshot)
            if args.launch_lock:
                lock = read(args.launch_lock)
                verify(lock)
                snapshot["launch_lock_sha256"] = lock["sha256"]
                if lock["normalization_scales"] != snapshot["normalization_scales"] or lock["sources"] != snapshot["sources"] or lock["policy_sha256"] != digest(read(args.policy)):
                    raise TailRiskError("launch scales, sources or policy changed")
            elif snapshot["information_cutoff"][:10] != read(args.policy)["first_origin"] and not args.demo:
                raise TailRiskError("subsequent origins require --launch-lock")
            result = generate(snapshot, read(args.policy), demo=args.demo)
        elif args.command == "lock":
            result = launch_lock(read(args.forecast))
        elif args.command == "receipt":
            result = remote_receipt(args.forecast, args.repository, ref=args.ref)
        elif args.command == "score":
            result = score(read(args.forecast), read(args.outcomes), evaluation_as_of=datetime.now(timezone.utc).isoformat())
        else:
            manifest = read(args.manifest)
            cohorts = [{key: read(value) for key, value in x.items()} for x in manifest]
            result = sealed(cumulative(cohorts, read(args.launch_lock)))
        write_new(args.output, result)
        print(f"Created {args.output}; historical files untouched.")
        return 0
    except (OSError, ValueError, KeyError, TypeError, subprocess.CalledProcessError) as exc:
        # Do not echo subprocess output, which can contain account information.
        print(f"Parallel experiment error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
