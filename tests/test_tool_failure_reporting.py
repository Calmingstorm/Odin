"""Tool failures must be structurally reported as failures.

The executor classifies a bare-string handler return by matching a short list
of prose prefixes ("Error", "Command failed", ...). Any failure phrased
differently was reported as ok=True with no exit code — so the model saw a
success, workflows and schedules continued past the failed step, and the audit
log recorded the action approved with no error.

Found by adversarial review of v3.65.1 and reproduced through the real
executor. These pins drive the PRODUCTION dispatch path, not the handlers
directly, because the classification happens in the executor.
"""

from __future__ import annotations

import pytest

from src.config.schema import ToolHost, ToolsConfig
from src.tools.executor import ToolExecutor


def _executor(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir(mode=0o700)
    ex = ToolExecutor(
        config=ToolsConfig(
            local_working_dir=str(ws),
            hosts={"localhost": ToolHost(address="127.0.0.1")},
        )
    )
    ex._protected_roots = lambda: [str(tmp_path / "install")]
    return ex


@pytest.mark.parametrize(
    "tool,params,needle",
    [
        # curl cannot connect: exit 7, status_code 000. Previously ok=True.
        (
            "http_probe",
            {"url": "http://127.0.0.1:9/", "host": "localhost", "retries": 0, "timeout": 2},
            "",
        ),
        # An action the tool does not implement is a failure, not a result.
        ("git_ops", {"action": "not_a_real_action", "host": "localhost"}, "Unknown git action"),
        ("manage_process", {"action": "not_a_real_action", "host": "localhost"}, "Unknown action"),
    ],
)
async def test_failures_are_reported_as_failures(tmp_path, tool, params, needle):
    result = await _executor(tmp_path).execute(tool, params)
    assert result.ok is False, (
        f"{tool} reported ok=True for a genuine failure — the model, the audit "
        f"log and any workflow step would all treat this as success: {result.output!r}"
    )
    if needle:
        assert needle in str(result.output)


async def test_successful_probe_is_still_ok(tmp_path):
    """The fix must not turn healthy probes into failures."""
    result = await _executor(tmp_path).execute(
        "http_probe", {"url": "https://odin-bot.net/", "host": "localhost", "timeout": 20}
    )
    assert result.ok is True, result.output
    assert "status_code: 200" in str(result.output)


async def test_browser_tools_report_disabled_as_failure(tmp_path):
    """A disabled backend is not a successful page read."""
    result = await _executor(tmp_path).execute(
        "browser_read_page", {"url": "https://example.com"}
    )
    assert result.ok is False, result.output
    assert "not enabled" in str(result.output)
