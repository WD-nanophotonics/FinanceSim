"""Offline launch and historical integrity check; does not claim live data."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from financesim.tail_risk import validate_policy, verify


def main():
    policy = json.loads((ROOT/"research/parallel/policies/tail-risk-v1.json").read_text(encoding="utf-8"))
    validate_policy(policy)
    manifest = json.loads((ROOT/"research/parallel/historical-integrity.json").read_text(encoding="utf-8"))
    for path, checksum in manifest["sha256"].items():
        data = (ROOT/path).read_bytes().replace(b"\r\n", b"\n")
        if hashlib.sha256(data).hexdigest() != checksum:
            raise ValueError(f"archived history or original generator changed: {path}")
    staged = []
    for path in sorted((ROOT/"research/parallel/data").glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        verify(data)
        staged.append({"path": path.name, "counts": data["counts"], "status": data["status"]})
    print(json.dumps({"policy_valid": True, "first_origin": policy["first_origin"],
                      "historical_files_unchanged": len(manifest["sha256"]),
                      "live_forecast_generated": False,
                      "staged_sources": staged,
                      "live_inputs": "pending audited long history and Nov27 closing snapshot"}))


if __name__ == "__main__":
    main()
