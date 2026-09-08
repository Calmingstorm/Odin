"""Read-only final cross-run identity and retained evidence assertions."""

import argparse
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "ledger", Path(__file__).with_name("wayland-process-ledger.py")
)
ledger = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ledger)

SUFFIXES = (
    "guardian1",
    "causal-baseline",
    "causal-fixed1",
    "guardian-fixed1",
    "guardian-fixed2",
    "guardian-fixed3",
)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--evidence-root", type=Path, required=True)
parser.add_argument("--run-date", required=True)
args = parser.parse_args()
if not args.run_date.isascii() or not args.run_date.isdigit() or len(args.run_date) != 8:
    parser.error("--run-date must be YYYYMMDD")
evidence_root = args.evidence_root.resolve(strict=True)
current, errors = ledger.processes()
assert not errors, errors
report = []
for suffix in SUFFIXES:
    root = evidence_root / ("wayland-r5-" + suffix + "-" + args.run_date)
    cid = (root / "container.cid").read_text().strip()
    group = json.loads((root / "owned-cgroup.json").read_text())
    assert ledger.owned_group_path(["0::" + group["group"]], cid) == group["group"]
    assert not Path(group["path"]).exists(), group
    owned = json.loads((root / "census-identities.json").read_text())
    owned += json.loads((root / "owned-identities.json").read_text())
    survivors = [
        p for p in owned if p["pid"] in current and p["start"] == current[p["pid"]]["start"]
    ]
    assert not survivors, survivors
    assert json.loads((root / "census-errors.json").read_text()) == []
    assert (root / "artifact-inventory.json").is_file()
    report.append(
        dict(
            suffix=suffix,
            cgroup_absent=True,
            identities_absent=len(owned),
            exact_container_id_binding=True,
        )
    )
print(json.dumps(dict(current_scan_errors=errors, runs=report), indent=2))
