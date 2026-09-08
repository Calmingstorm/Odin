"""R8 evidence regressions, no desktop/input/network side effects."""

import ast
import importlib.util
import io
import json
import os
import subprocess
import time
from pathlib import Path
from types import SimpleNamespace

import pytest

spec = importlib.util.spec_from_file_location(
    "r8_evidence", Path(__file__).with_name("wayland-r8-evidence.py")
)
evidence = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evidence)


def test_empty_six_case_claim_rejected(tmp_path):
    (tmp_path / "session.log").write_text("")
    (tmp_path / "receiver.log").write_text("")
    (tmp_path / "lifecycle-driver.json").write_text("[]")
    with pytest.raises(AssertionError):
        evidence.analyze(tmp_path)


def test_malformed_json_never_silently_filtered(tmp_path):
    p = tmp_path / "evidence"
    p.write_text("informational line\n{invalid}\n")
    with pytest.raises(json.JSONDecodeError):
        evidence.rows(p)


def test_shell_does_not_bind_host_desktop_or_devices():
    script = Path(__file__).with_name("wayland-r8-lab.sh").read_text()
    for required in (
        "--init",
        "--network=none",
        "--cap-drop=ALL",
        "--read-only",
        "--pids-limit=256",
        "--cgroupns=private",
        "wayland-process-ledger.py",
        'wait "$cli"',
    ):
        assert required in script
    for forbidden in (
        "--privileged",
        "--device=",
        "--pid=host",
        "--network=host",
        "--ipc=host",
        "DISPLAY=:0",
    ):
        assert forbidden not in script


@pytest.mark.parametrize("mode", ["guardian-loss", "guardian-lease", "guardian-orderly"])
def test_sole_owner_loss_is_separate_fault_binary(tmp_path, monkeypatch, mode):
    # Load only the function, avoiding the container-only portal import.
    syntax = ast.parse(Path(__file__).with_name("wayland-r8-portal.py").read_text())
    function = next(node for node in syntax.body if isinstance(node, ast.FunctionDef))
    reports, calls = [], []
    returned_fd, writer = os.pipe()
    child = SimpleNamespace(
        pid=123, stdin=io.BytesIO(), returncode=None, poll=lambda: 0, wait=lambda **kw: None
    )

    def launch(argv, **kw):
        calls.append((argv, kw["pass_fds"]))
        child.returncode = 2 if mode == "guardian-lease" else 0
        event = "guardian_loss" if mode == "guardian-loss" else "release_sent"
        kw["stdout"].write(
            "\n".join(json.dumps({"event": value}) for value in ("ready", "held", event))
        )
        kw["stdout"].flush()
        return child

    def private_path(value):
        return tmp_path / Path(value).name

    (tmp_path / "lifecycle-release-go").touch()
    scope = {
        "Path": private_path,
        "os": os,
        "json": json,
        "time": time,
        "subprocess": SimpleNamespace(Popen=launch, PIPE=subprocess.PIPE),
        "portal": SimpleNamespace(report=lambda event, **kw: reports.append((event, kw))),
    }
    exec(compile(ast.Module(body=[function], type_ignores=[]), "<guardian-fixture>", "exec"), scope)
    try:
        scope["run_owned_guardian"](returned_fd, "mapping", mode)
        assert calls[0][0][0].endswith("-fault-fixture") == (mode == "guardian-loss")
        assert calls[0][1] == (returned_fd,)
        with pytest.raises(OSError):
            os.fstat(returned_fd)
        assert reports[0][1]["parent_returned_fd_closed"] is True
        assert reports[-1][1]["code"] == (2 if mode == "guardian-lease" else 0)
        assert child.stdin.closed
    finally:
        os.close(writer)
