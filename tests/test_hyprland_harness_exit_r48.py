"""Controlled process races for the Hyprland live qualification harness."""

import importlib.util
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts/computer-feasibility/hyprland-live-qualification.py"
SPEC = importlib.util.spec_from_file_location("hyprland_live_qualification_r48", HARNESS)
qualification = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(qualification)


def exited_guardian(tmp_path, receipts, *, action_submitted=True):
    payload = "".join(json.dumps(row) + "\n" for row in receipts)
    process = subprocess.Popen(
        [sys.executable, "-c", f"import sys;sys.stdout.write({payload!r});sys.stdout.flush()"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=0,
    )
    assert process.wait(timeout=2) == 0
    guardian = qualification.Guardian.__new__(qualification.Guardian)
    guardian.h = SimpleNamespace(uid=os.getuid())
    guardian.path = tmp_path / "guardian.jsonl"
    guardian.rows = []
    guardian.pending = bytearray()
    guardian.action_submitted = action_submitted
    guardian.p = process
    guardian.process_identity = {"initial": "pin"}
    return guardian


def closed_receipt():
    return {
        "event": "closed",
        "reason": "signal-cancel",
        "input_was_sent": True,
        "release_acknowledged": True,
        "native_failure": {"input_loss_v1": {"resource_closure": "complete"}},
    }


@pytest.mark.parametrize("event", ["begun", "release_sent", "action_done"])
def test_exited_nonterminal_is_not_accepted_and_owned_pipe_drains_to_closed(tmp_path, event):
    guardian = exited_guardian(tmp_path, [{"event": event}, closed_receipt()])

    receipt = guardian.until({event}, 0.5)

    assert receipt == closed_receipt()
    assert [row["event"] for row in guardian.rows] == [event, "closed"]


def test_action_submission_then_exit_without_terminal_is_unknown_release(tmp_path):
    guardian = exited_guardian(tmp_path, [{"event": "begun"}])

    with pytest.raises(qualification.UnknownRelease, match="after action submission"):
        guardian.until({"begun"}, 0.5)


def test_live_provenance_mismatch_remains_hard_refusal(tmp_path, monkeypatch):
    payload = json.dumps({"event": "begun"}) + "\n"
    process = subprocess.Popen(
        [sys.executable, "-c",
         f"import sys,time;sys.stdout.write({payload!r});sys.stdout.flush();time.sleep(30)"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=0,
    )
    guardian = qualification.Guardian.__new__(qualification.Guardian)
    guardian.h = SimpleNamespace(uid=os.getuid())
    guardian.path = tmp_path / "guardian.jsonl"
    guardian.rows = []
    guardian.pending = bytearray()
    guardian.action_submitted = True
    guardian.p = process
    guardian.process_identity = {"initial": "pin"}
    monkeypatch.setattr(qualification, "pin", lambda pid, uid: {"different": "identity"})
    try:
        with pytest.raises(qualification.Refusal, match="guardian process changed"):
            guardian.until({"begun"}, 0.5)
        assert process.poll() is None
    finally:
        process.terminate()
        process.wait(timeout=2)


def harness_for(executable, logs):
    args = SimpleNamespace(
        guardian=str(executable),
        wayland_socket="unused-wayland",
        scope_socket="unused-scope",
        output_name="unused-output",
        logical_width=100,
        logical_height=100,
    )
    return SimpleNamespace(a=args, uid=os.getuid(), pid=os.getpid(), logs=logs)


def test_initial_fast_exit_is_reaped_when_pin_fails(tmp_path, monkeypatch):
    executable = tmp_path / "fast-exit"
    executable.write_text("#!/bin/sh\nexit 17\n")
    executable.chmod(0o700)
    original_pin = qualification.pin
    created = []
    original_popen = qualification.subprocess.Popen

    def recording_popen(*args, **kwargs):
        process = original_popen(*args, **kwargs)
        created.append(process)
        return process

    def pin_after_zombie(pid, uid):
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            text = Path(f"/proc/{pid}/stat").read_text()
            if text[text.rindex(")") + 2 :].split()[0] in {"Z", "X"}:
                break
            time.sleep(0.002)
        return original_pin(pid, uid)

    monkeypatch.setattr(qualification.subprocess, "Popen", recording_popen)
    monkeypatch.setattr(qualification, "pin", pin_after_zombie)
    with pytest.raises(qualification.Refusal, match="dead process"):
        qualification.Guardian(harness_for(executable, tmp_path), "fast-exit")
    assert len(created) == 1
    assert created[0].returncode == 17


def test_executable_samefile_failure_cleans_started_child(tmp_path, monkeypatch):
    executable = tmp_path / "exec-python"
    executable.write_text("#!/usr/bin/env python3\nimport time\ntime.sleep(30)\n")
    executable.chmod(0o700)
    created = []
    original_popen = qualification.subprocess.Popen

    def recording_popen(*args, **kwargs):
        process = original_popen(*args, **kwargs)
        created.append(process)
        return process

    monkeypatch.setattr(qualification.subprocess, "Popen", recording_popen)
    with pytest.raises(qualification.Refusal, match="guardian executable identity mismatch"):
        qualification.Guardian(harness_for(executable, tmp_path), "exec-mismatch")
    assert len(created) == 1
    assert created[0].returncode is not None


def test_ready_identity_mismatch_cleans_started_child(tmp_path, monkeypatch):
    executable = tmp_path / "ready-mismatch"
    executable.write_text(
        "#!/usr/bin/env python3\n"
        "import json,os,time\n"
        "print(json.dumps({'event':'ready','pid':os.getpid()+1,'peer_pid':os.getppid()}),flush=True)\n"
        "time.sleep(30)\n"
    )
    executable.chmod(0o700)
    created = []
    original_popen = qualification.subprocess.Popen

    def recording_popen(*args, **kwargs):
        process = original_popen(*args, **kwargs)
        created.append(process)
        return process

    monkeypatch.setattr(qualification.subprocess, "Popen", recording_popen)
    monkeypatch.setattr(qualification.os.path, "samefile", lambda left, right: True)
    monkeypatch.setattr(qualification, "pin", lambda pid, uid: {"executable": str(executable)})
    with pytest.raises(qualification.Refusal, match="guardian ready mismatch"):
        qualification.Guardian(harness_for(executable, tmp_path), "ready-mismatch")
    assert len(created) == 1
    assert created[0].returncode is not None


def test_cleanup_never_sigkills_after_action_submission(monkeypatch):
    class RetainedProcess:
        pid = 876543

        @staticmethod
        def poll():
            return None

        @staticmethod
        def wait(timeout):
            raise subprocess.TimeoutExpired("guardian", timeout)

    guardian = qualification.Guardian.__new__(qualification.Guardian)
    guardian.p = RetainedProcess()
    guardian.action_submitted = True
    monkeypatch.setattr(guardian, "term", lambda: None)
    killed = []
    monkeypatch.setattr(qualification.os, "killpg", lambda *args: killed.append(args))

    with pytest.raises(qualification.UnknownRelease, match="refusing SIGKILL"):
        guardian.cleanup(True)
    assert killed == []
