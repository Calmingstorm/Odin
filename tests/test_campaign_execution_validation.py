"""Execution campaign regressions; transports and governors are inert fakes."""
from __future__ import annotations

import asyncio
import json
import subprocess
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.tools.post_validation import Check, _evaluate, run_bundle
from tests.test_hosts_executor_leases import _executor


@pytest.mark.parametrize("output,status", [("0", "pass"), ("", "fail")])
def test_equals_preserves_numeric_zero(output, status):
    check = Check("command", "fixture", expected=0, compare="equals")
    assert _evaluate(check, 0, output)[0] == status


def test_brace_quantifier_has_real_deadline_in_isolation():
    # A subprocess timeout is the test's backstop, not the production bound.
    code = (
        "import json; from src.tools.post_validation import Check, _evaluate; "
        "print(json.dumps(_evaluate(Check('command', 'fixture', "
        "expected='(a{1,}){1,}b', compare='regex_match'), 0, 'a'*10000)))"
    )
    proc = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, timeout=5)
    assert proc.returncode == 0, proc.stderr
    status, error = json.loads(proc.stdout)
    assert status == "error" and "deadline" in error


async def test_regex_evaluation_does_not_block_event_loop():
    ticked = asyncio.Event()

    async def heartbeat():
        await asyncio.sleep(0.005)
        ticked.set()

    task = asyncio.create_task(heartbeat())
    report = await run_bundle(
        [{"type": "command", "target": "fixture", "compare": "regex_match",
          "expected": "(a{1,}){1,}b"}], bundle_name="deadline", default_host=None,
        resolve_host=lambda _: ("localhost", "root", "linux"),
        exec_command=AsyncMock(return_value=(0, "a" * 10000)),
    )
    assert ticked.is_set()
    await task
    assert report.errored == 1


@pytest.mark.parametrize("compare,expected", [("exit_nonzero", None), ("not_contains", "absent")])
@pytest.mark.parametrize("raises", [False, True])
async def test_real_validation_governor_refusal_cannot_pass(tmp_path, compare, expected, raises):
    exe = _executor(tmp_path)

    class Governor:
        def check(self, _command):
            if raises:
                raise RuntimeError("fixture governor unavailable")
            return SimpleNamespace(allowed=False, denial_message=lambda: "fixture denied")

    exe.command_governor = Governor()
    exe._exec_command = AsyncMock(side_effect=AssertionError("must never dispatch"))
    report = json.loads(await exe.validation_tools._handle_validate_action({
        "format": "json", "default_host": "alpha",
        "checks": [{"type": "command", "target": "fixture", "compare": compare,
                    **({"expected": expected} if expected is not None else {})}],
    }))
    assert report["verdict"] == "error"
    assert report["checks"][0]["status"] == "error"
    assert "governor" in report["checks"][0]["error"]
    exe._exec_command.assert_not_awaited()


async def test_invalid_probe_never_pins_host_generation(tmp_path):
    exe = _executor(tmp_path)
    exe._exec_command = AsyncMock(side_effect=AssertionError("must never dispatch"))
    raw = await exe.browser_web_tools._handle_http_probe({
        "host": "alpha", "url": "https://example.test", "method": "POST", "body": "x" * 60000,
    })
    assert raw[1] == 1
    assert not exe.host_registry.has_active_leases("alpha")
    exe._exec_command.assert_not_awaited()
