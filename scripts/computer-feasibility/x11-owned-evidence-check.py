#!/usr/bin/python3
"""Recheck retained private-corpus records and exact owned process cleanup."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

path = Path(sys.argv[1])
text = path.read_text()
records = [json.loads(line) for line in text.splitlines() if line.startswith("{")]
trials = [r for r in records if r["kind"] == "lifecycle-pass"]
assert len(trials) == 10
assert len({r["same_application_pid"] for r in trials}) == 1
for r in trials:
    assert r["result"]["released"] and r["helper_exit"] == 0
    assert r["result"]["release_ms"] < 250
    assert r["fresh_human_text"]["kind"] == "text"
    assert r["fresh_human_text"]["text"]
for mode in ("complete", "controller-eof", "cancel", "helper-eof", "lease"):
    assert sum(r["mode"] == mode for r in trials) == 2
assert any(r["kind"] == "corpus-pass" for r in records)
actions = [r for r in records if r["kind"] == "product-action"]
assert len(actions) >= 4
assert all(r["receipt"]["released"] and r["receipt"]["status"] == "executed" for r in actions)
assert any(r["action"] == "type" and
           r["receipt"]["postcondition"]["actual"]["before_sha256"] !=
           r["receipt"]["postcondition"]["actual"]["after_sha256"] for r in actions)
assert all(r["status"] == 0 for r in records if r["kind"] == "child-reaped")
line = next(line for line in text.splitlines() if line.startswith("HOST_PROCESS_LEDGER "))
ledger = json.loads(line.removeprefix("HOST_PROCESS_LEDGER "))
assert not ledger["survivors_including_zombies"] and not ledger["monitor_errors"]
assert not ledger["cgroup_exists"] and not Path(ledger["cgroup"]).exists()
for identity in ledger["identities"]:
    try:
        stat = Path(f'/proc/{identity["pid"]}/stat').read_text()
        started = int(stat[stat.rindex(")")+2:].split()[19])
        assert started != identity["start_ticks"], identity
    except FileNotFoundError:
        pass
state = subprocess.run(["systemctl", "show", ledger["unit"], "-p", "ActiveState",
                        "-p", "ControlGroup"], capture_output=True, text=True, check=True)
assert "ActiveState=inactive" in state.stdout and "ControlGroup=\n" in state.stdout
print(json.dumps({"passed": True, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                  "lifecycle_trials": len(trials), "product_actions": len(actions),
                  "recorded_processes_absent_or_reused": len(ledger["identities"]),
                  "latencies_ms": {mode: [r["result"]["release_ms"] for r in trials
                                           if r["mode"] == mode] for mode in
                                   ("complete", "controller-eof", "cancel", "helper-eof", "lease")}}))
