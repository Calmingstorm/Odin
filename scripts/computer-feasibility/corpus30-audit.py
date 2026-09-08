#!/usr/bin/env python3
"""Read-only independent artifact and exact owned-lifecycle acceptance audit."""

import argparse
import hashlib
import json
import subprocess
from pathlib import Path


def audit(root):
    starts = []
    failures = []
    checks = []
    for event_file in sorted(root.glob("case-*/events.jsonl")):
        events = [json.loads(line) for line in event_file.read_text().splitlines()]
        starts.extend(e for e in events if e["event"] == "started")
        results = [e for e in events if e["event"] == "task_result"]
        if not results or results[-1]["status"] != "pass":
            continue
        row = results[-1]
        directory = event_file.parent
        if "exact_utf8" in row:
            expected = json.loads((directory / "predeclared.json").read_text())["final_saved_utf8"]
            blob = (directory / row["artifact"]).read_bytes()
            assert blob == expected.encode(), f"{directory}: wrong independently declared bytes"
            closed = subprocess.run(
                ["tesseract", str(directory / "closed-tab.png"), "stdout"],
                capture_output=True,
                text=True,
                check=True,
            ).stdout
            assert "Pressure stable" not in closed and "First paragraph" not in closed
            assert row["artifact"] not in closed, f"{directory}: saved file still visible"
            checks.append(
                dict(
                    task=row["task"],
                    exact_bytes=len(blob),
                    sha256=hashlib.sha256(blob).hexdigest(),
                    closed_ocr=closed,
                )
            )
    for start in starts:
        unit = start["unit"]
        result = subprocess.run(
            ["systemctl", "show", unit, "-p", "MainPID", "-p", "ActiveState"],
            text=True,
            capture_output=True,
        )
        assert "MainPID=0" in result.stdout, (unit, result.stdout)
        assert "ActiveState=active" not in result.stdout, (unit, result.stdout)
        assert not Path("/sys/fs/cgroup/system.slice", unit).exists(), unit
        for field in ("driver_pid", "supervisor_pid"):
            if Path("/proc", str(start[field])).exists():
                failures.append(f"{field} still exists: {start[field]}")
    assert not failures, failures
    report = dict(
        root=str(root), fixtures=len(starts), cleanup="pass", independent_artifacts=checks
    )
    (root / "independent-audit.json").write_text(json.dumps(report, indent=2))
    print(
        json.dumps(
            dict(
                root=str(root),
                exact_cleanup_fixtures=len(starts),
                independently_verified_artifacts=len(checks),
            )
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("roots", nargs="+")
    for path in parser.parse_args().roots:
        audit(Path(path))
