"""Executor-through-transport retention and live authorization regression pins."""
import json
from types import SimpleNamespace

import pytest

from src.config.schema import ToolHost, ToolsConfig
from src.tools.executor import ToolExecutor
from src.tools.output_authorization import request_tool_scope, web_output_scope
from src.tools.output_retention import OutputStore
from src.tools.runtime_delivery import execution_delivery_scope


def executor(tmp_path):
    ex = ToolExecutor(ToolsConfig(
        local_working_dir=str(tmp_path / "workspace"),
        audit_log_path=str(tmp_path / "data" / "audit.jsonl"),
        hosts={"testhost": ToolHost(address="127.0.0.1")},
    ))
    ex._protected_roots = lambda: [str(tmp_path / "protected")]
    return ex


async def retrieve(ex, cursor, user="owner"):
    return await ex.execute("get_tool_output", {"cursor": cursor}, user_id=user)


@pytest.mark.parametrize("exit_code", [0, 7])
async def test_actual_command_full_capture_restart_reconstruction(tmp_path, exit_code):
    ex = executor(tmp_path)
    command = f"printf '%050000d' 0; exit {exit_code}"
    result = await ex.execute("run_command", {"host": "testhost", "command": command},
                              user_id="owner")
    assert result.ok is (exit_code == 0)
    envelope = json.loads(result.output)
    assert len(result.output) <= 12000
    assert envelope["status"] == ("failed" if exit_code else "succeeded")
    assert envelope["total_chars"] >= 50000
    rebuilt = envelope["head"]
    ex = executor(tmp_path)
    cursor = envelope["cursor"]
    while cursor:
        page_result = await retrieve(ex, cursor)
        assert page_result.ok, page_result.output
        page = json.loads(page_result.output)
        assert page["start"] == len(rebuilt)
        assert len(page_result.output) <= 12000
        rebuilt += page["text"]
        cursor = page["cursor"]
    assert len(rebuilt) == envelope["total_chars"]
    assert "0" * 50000 in rebuilt


async def test_scope_host_policy_generation_quota_and_expiry(tmp_path):
    ex = executor(tmp_path)
    with execution_delivery_scope("owner", "channel-a"):
        result = await ex.execute("run_command", {
            "host": "testhost", "command": "printf '%030000d' 0"}, user_id="owner")
        cursor = json.loads(result.output)["cursor"]
        assert not (await retrieve(ex, cursor, user="other")).ok
    with execution_delivery_scope("owner", "channel-b"):
        assert not (await retrieve(ex, cursor)).ok
    with execution_delivery_scope("owner", "channel-a"):
        token = request_tool_scope.set(["get_tool_output"])
        try:
            assert not (await retrieve(ex, cursor)).ok
        finally:
            request_tool_scope.reset(token)
        ex._builtin_policy = SimpleNamespace(is_disabled=lambda tool: tool == "run_command")
        assert not (await retrieve(ex, cursor)).ok
        ex._builtin_policy = None
        ex._host_access = SimpleNamespace(is_host_allowed=lambda *args: False)
        assert not (await retrieve(ex, cursor)).ok
        ex._host_access = None
        from dataclasses import replace
        target = ex.host_registry.get("testhost")
        original_get = ex.host_registry.get
        ex.host_registry.get = lambda *args, **kwargs: replace(target, generation=999)
        assert not (await retrieve(ex, cursor)).ok
        ex.host_registry.get = original_get
        store = ex._ensure_output_store()
        store.clock = lambda: 10**12
        assert "expired" in (await retrieve(ex, cursor)).output
    ex._output_store = OutputStore(tmp_path / "quota.sqlite3", global_bytes=1)
    failed = ex.deliver_output("a" * 20000, tool_name="run_command", tool_input={},
                               user_id="owner", status="failed")
    assert json.loads(failed)["cursor"] is None
    assert json.loads(failed)["status"] == "failed"


async def test_web_token_live_revocation_and_host_scope(tmp_path):
    ex = executor(tmp_path)
    identity = SimpleNamespace(allowed_tools=[], allowed_hosts=None)
    manager = SimpleNamespace(resolve=lambda raw: identity)
    bot = SimpleNamespace(api_token_manager=manager)
    request = SimpleNamespace(headers={"Authorization": "Bearer test-fixture-credential"})
    with web_output_scope(bot, request), execution_delivery_scope("owner", "channel-a"):
        result = await ex.execute("run_command", {
            "host": "testhost", "command": "printf '%030000d' 0"}, user_id="owner")
        cursor = json.loads(result.output)["cursor"]
        assert (await retrieve(ex, cursor)).ok
        identity.allowed_hosts = []
        assert not (await retrieve(ex, cursor)).ok
        identity.allowed_hosts = None
        identity.allowed_tools = ["get_tool_output"]
        assert not (await retrieve(ex, cursor)).ok
        identity.allowed_tools = []
        manager.resolve = lambda raw: None
        assert not (await retrieve(ex, cursor)).ok


async def test_process_retention_root_and_short_output(tmp_path):
    ex = executor(tmp_path)
    result = await ex.execute("run_command", {
        "host": "testhost", "command": "printf short"}, user_id="owner")
    assert result.output == "short"
    assert ex._retention_root() == tmp_path / "data"
    assert ex._ensure_process_registry() is ex._ensure_process_registry()


async def test_skill_actual_host_access_not_in_arguments(tmp_path):
    ex = executor(tmp_path)
    with execution_delivery_scope("owner", "skills"):
        ex.set_user_context("owner")
        code_and_text = await ex._run_on_host("testhost", "printf '%025000d' 0")
        rendered = ex.deliver_output(code_and_text[0], tool_name="example_skill",
                                     tool_input={}, user_id="owner")
        cursor = json.loads(rendered)["cursor"]
        assert (await retrieve(ex, cursor)).ok
        ex._host_access = SimpleNamespace(is_host_allowed=lambda *args: False)
        assert not (await retrieve(ex, cursor)).ok


async def test_initial_retrieval_unavailable_is_honest(tmp_path):
    ex = executor(tmp_path)
    with execution_delivery_scope("owner", "channel-a", allowed_tools=["run_command"]):
        result = await ex.execute("run_command", {
            "host": "testhost", "command": "printf '%030000d' 0"}, user_id="owner")
        page = json.loads(result.output)
        assert page["retention"] == "failed" and page["cursor"] is None


async def test_execute_ephemeral_conversation_has_stable_evidence_scope(tmp_path):
    ex = executor(tmp_path)
    identity = SimpleNamespace(allowed_tools=[], allowed_hosts=None)
    manager = SimpleNamespace(resolve=lambda raw: identity)
    bot = SimpleNamespace(api_token_manager=manager)
    request = SimpleNamespace(path="/api/execute", headers={
        "Authorization": "Bearer test-fixture-credential"})
    with web_output_scope(bot, request), execution_delivery_scope("owner", "ephemeral-one"):
        result = await ex.execute("run_command", {
            "host": "testhost", "command": "printf '%030000d' 0"}, user_id="owner")
        cursor = json.loads(result.output)["cursor"]
    with web_output_scope(bot, request), execution_delivery_scope("owner", "ephemeral-two"):
        assert (await retrieve(ex, cursor)).ok
    request.path = "/api/chat"
    with web_output_scope(bot, request), execution_delivery_scope("owner", "ephemeral-two"):
        assert not (await retrieve(ex, cursor)).ok


async def test_real_web_chat_entry_binds_and_resets_token_scope(tmp_path, monkeypatch):
    from src.tools.output_authorization import request_scope_id, tool_scope_allows
    from src.web.api.sessions_chat import _pkg_process_web_chat

    identity = SimpleNamespace(allowed_tools=["get_tool_output"], allowed_hosts=None)
    manager = SimpleNamespace(resolve=lambda raw: identity)
    bot = SimpleNamespace(api_token_manager=manager)
    request = SimpleNamespace(headers={"Authorization": "Bearer test-fixture-credential"})

    async def dispatch(*args, **kwargs):
        assert "_request" not in kwargs
        assert request_scope_id.get()
        assert tool_scope_allows("get_tool_output")
        assert not tool_scope_allows("run_command")
        manager.resolve = lambda raw: None
        assert not tool_scope_allows("get_tool_output")
        return "done"

    monkeypatch.setattr("src.web.api.process_web_chat", dispatch)
    assert await _pkg_process_web_chat(bot, "prompt", "channel", _request=request) == "done"
    assert request_scope_id.get() == ""


async def test_websocket_entry_rechecks_generation_during_dispatch(monkeypatch):
    from unittest.mock import AsyncMock

    from src.tools.output_authorization import request_scope_id, tool_scope_allows
    from src.web.websocket import WebSocketManager

    manager = WebSocketManager(SimpleNamespace())
    identity = SimpleNamespace(user_id="owner", username="Owner", tier="admin",
                               allowed_tools=None, allowed_hosts=None, default_host="")
    ws = SimpleNamespace(_odin_identity=identity, closed=False,
                         send_json=AsyncMock(), _odin_credential_policy=None)
    manager._policy_authorized = lambda socket: True

    async def dispatch(*args, **kwargs):
        assert request_scope_id.get()
        assert tool_scope_allows("run_command")
        manager._policy_authorized = lambda socket: False
        assert not tool_scope_allows("run_command")
        return {"response": "done", "tools_used": [], "is_error": False}

    monkeypatch.setattr("src.web.websocket.process_web_chat", dispatch)
    await manager._handle_chat(ws, {"content": "prompt"})
    assert request_scope_id.get() == ""
