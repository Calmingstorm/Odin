"""Tool failures must be visible to the model, not just to structured consumers.

Found by Odin's post-deploy v3.44.0 smoke test: run_command_multi's all-denied
aggregate carried ok=False (audit/scheduler saw the failure) but str(ToolResult)
is just the output — the markdown-wrapped denial had no error prefix, so the
model read a refused action as success.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.config.schema import Config
from src.discord.client import OdinBot


def _make_bot() -> OdinBot:
    cfg = Config(
        discord={"token": "smoke-test-token"},
        permissions={"default_tier": "admin"},
    )
    return OdinBot(cfg)


# ---------------------------------------------------------------------------
# The helper itself
# ---------------------------------------------------------------------------

def test_ok_result_untouched():
    text = "### host\n```\nall good\n```"
    assert OdinBot._ensure_failure_visible(text, True) == text


def test_failed_result_without_marker_gets_prefixed():
    text = "### definitely-not-a-host\n```\nHost access denied: definitely-not-a-host\n```"
    out = OdinBot._ensure_failure_visible(text, False)
    assert out.startswith("Error (tool reported failure):")
    assert "Host access denied" in out


def test_failed_result_with_existing_marker_not_double_prefixed():
    for text in (
        "Error: something broke",
        "Command failed (exit 1):\nboom",
        "Blocked [critical]: nope",
        "Unknown or disallowed host: x",
    ):
        assert OdinBot._ensure_failure_visible(text, False) == text


# ---------------------------------------------------------------------------
# End-to-end: run_command_multi denial reaches the model as an error
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_multi_host_denial_visible_through_executor():
    bot = _make_bot()
    result = await bot.tool_executor.execute(
        "run_command_multi",
        {"hosts": ["definitely-not-a-host"], "command": "echo hi"},
        user_id="u1",
    )
    # Structured layer: classified as failure (PR#128 fix).
    assert result.ok is False
    # Model layer: after the visibility wrapper, the text carries an error marker.
    rendered = OdinBot._ensure_failure_visible(str(result), result.ok)
    assert rendered.startswith("Error")
    assert "Unknown or disallowed host" in rendered or "Host access denied" in rendered
