"""Deny stale origins before reading evidence, including boundary failure paths."""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.tools.output_authorization import host_binding, request_scope_id
from src.tools.output_delivery import DeliveredOutput, RankedOutput
from tests.test_executor_output_retention import executor


def test_legacy_missing_and_foreign_credential_bindings_fail_closed(tmp_path):
    ex = executor(tmp_path)
    assert not ex._authorize_output("run_command", ["fixture"], "owner")
    assert not ex._authorize_output("run_command", [{"scope": "another"}], "owner")
    assert not ex._authorize_output("run_command", [{"alias": "missing"}], "owner")
    target = ex.host_registry.get("testhost")
    assert ex._authorize_output("run_command", [host_binding(target)], "owner")
    # Exact alias survives, but no current generation lease can be acquired.
    ex.host_registry.acquire = lambda _: None
    assert not ex._authorize_output("run_command", [host_binding(target)], "owner")


def test_retention_not_advertised_when_continuation_is_disabled(tmp_path):
    ex = executor(tmp_path)
    ex._builtin_policy = SimpleNamespace(is_disabled=lambda tool: tool == "get_tool_output")
    result = ex.deliver_output(
        RankedOutput("short snippet", matches=("x" * 30000,)), tool_name="search_history",
        tool_input={}, user_id="owner",
    )
    failure = json.loads(result)
    assert failure["cursor"] is None
    assert failure["retention"] == "failed"
    assert "not authorized" in failure["error"]
    assert not (tmp_path / "data" / "tool-output.sqlite3").exists()


def test_direct_scope_uses_actual_caller_and_does_not_copy_process_output(tmp_path):
    ex = executor(tmp_path)
    text = "[PID 1] status=exited\nfixture"
    assert ex.deliver_output(text, tool_name="manage_process", tool_input={"action": "poll"},
                             user_id="owner") == text
    protected = DeliveredOutput('{"kind":"tool_output","cursor":null}')
    assert ex.deliver_output(protected, tool_name="get_tool_output", tool_input={},
                             user_id="owner") is protected
    assert not (tmp_path / "data" / "tool-output.sqlite3").exists()


async def test_remote_transport_uses_exact_target_without_reresolving_alias(tmp_path):
    ex = executor(tmp_path)
    target = ex.host_registry.get("testhost")
    ex._exec_command = AsyncMock(return_value=(0, "fixture"))
    assert await ex._exec_remote_target(target, "read-fixed-evidence", 30) == (0, "fixture")
    ex._exec_command.assert_awaited_once_with(
        target.address, "read-fixed-evidence", target.ssh_user, timeout=30, target=target,
    )


@pytest.mark.parametrize("limit", [0, True, "4000", 8001])
async def test_invalid_retrieval_limit_is_explicit_without_reading_store(tmp_path, limit):
    ex = executor(tmp_path)
    result = await ex.execute("get_tool_output", {"cursor": "none", "limit": limit},
                              user_id="owner")
    assert not result.ok
    assert "limit must" in result.output
    assert not (tmp_path / "data" / "tool-output.sqlite3").exists()


def test_same_owner_cannot_reuse_other_token_evidence(tmp_path):
    ex = executor(tmp_path)
    scope_token = request_scope_id.set("first-credential-scope")
    try:
        body = ex.deliver_output("x" * 30000, tool_name="search_history", tool_input={},
                                 user_id="owner", channel_id="c")
    finally:
        request_scope_id.reset(scope_token)
    cursor = json.loads(body)["cursor"]
    from src.tools.output_retention import RetentionError

    with pytest.raises(RetentionError, match="Permission denied"):
        ex._ensure_output_store().read(
            cursor, owner="owner", channel="c",
            authorize=lambda tool, hosts: ex._authorize_output(tool, hosts, "owner"),
        )
