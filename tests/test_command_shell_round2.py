"""Round-two regression tests. Executable fixtures are harmless printf only.

Dangerous classifier cases live exclusively in test_command_shell_policy.py.
"""
from __future__ import annotations

import errno
import json
import socket
from unittest.mock import MagicMock

import pytest

from src.config.schema import Config
from src.discord.tool_catalog import ToolCatalog
from src.tools.command_shell import CommandOutput, apply_shell_contracts
from src.tools.local_supervisor_worker import Pin, Worker
from src.tools.post_validation import Check, _evaluate
from src.tools.process_manager import ProcessInfo, ProcessRegistry
from src.tools.registry import get_tool_definitions
from tests.test_command_shell_callers import HOST, USER
from tests.test_command_shell_callers import runtime as _runtime


@pytest.fixture
async def runtime(tmp_path, monkeypatch):
    async for value in _runtime.__wrapped__(tmp_path, monkeypatch):
        yield value


@pytest.mark.parametrize("point", ["children", "stat", "pidfd_open"])
@pytest.mark.parametrize("error", [errno.ENOENT, errno.ESRCH])
def test_discovery_vanishing_process_is_not_ownership_loss(monkeypatch, point, error):
    from src.tools import local_supervisor_worker as module

    left, right = socket.socketpair()
    worker = Worker(left)
    monkeypatch.setattr(module, "children", lambda _: {123})
    monkeypatch.setattr(module, "stat", lambda _: (worker.owner, 456))
    monkeypatch.setattr(module.os, "pidfd_open", lambda _: 789)

    def vanished(*_):
        raise OSError(error, "fixture exit race")

    monkeypatch.setattr(module.os if point == "pidfd_open" else module, point, vanished)
    try:
        assert not worker.discover()
        assert not worker.failed and not worker.reported_errors
        assert worker.stop_at is None and not worker.outgoing
    finally:
        worker.selector.close()
        left.close()
        right.close()


@pytest.mark.parametrize("error", [errno.EPERM, errno.EIO, errno.EBADF])
def test_discovery_real_failure_stays_closed(monkeypatch, error):
    from src.tools import local_supervisor_worker as module

    left, right = socket.socketpair()
    worker = Worker(left)

    def refused(*_):
        raise OSError(error, "fixture failure")

    monkeypatch.setattr(module, "children", refused)
    try:
        assert not worker.discover()
        assert worker.failed and worker.stop_at is not None
        assert "descendant discovery failed" in worker.outgoing.decode()
    finally:
        worker.selector.close()
        left.close()
        right.close()


def test_discovery_nonmissing_error_with_proven_gone_parent(monkeypatch):
    from src.tools import local_supervisor_worker as module

    left, right = socket.socketpair()
    worker = Worker(left)
    worker.pins[(123, 456)] = Pin(123, 456, 789)
    monkeypatch.setattr(module, "dead", lambda _: False)
    monkeypatch.setattr(module, "stat", lambda _: None)

    def children(pid):
        if pid == 123:
            raise OSError(errno.EIO, "fixture vanished parent")
        return set()

    monkeypatch.setattr(module, "children", children)
    try:
        assert not worker.discover() and not worker.failed
    finally:
        worker.selector.close()
        left.close()
        right.close()


def test_discovery_pidfd_error_with_proven_gone_child(monkeypatch):
    from src.tools import local_supervisor_worker as module

    left, right = socket.socketpair()
    worker = Worker(left)
    states = iter([(worker.owner, 456), None])
    monkeypatch.setattr(module, "children", lambda _: {123})
    monkeypatch.setattr(module, "stat", lambda _: next(states))

    def gone(*_):
        raise OSError(errno.EIO, "fixture vanished child")

    monkeypatch.setattr(module.os, "pidfd_open", gone)
    try:
        assert not worker.discover() and not worker.failed
    finally:
        worker.selector.close()
        left.close()
        right.close()


@pytest.mark.parametrize("error", [errno.ENOENT, errno.ESRCH])
def test_discovery_vanished_after_pin_closes_fd_without_veto(monkeypatch, error):
    from src.tools import local_supervisor_worker as module

    left, right = socket.socketpair()
    worker = Worker(left)
    states = iter([(worker.owner, 456), OSError(error, "fixture stat race")])
    monkeypatch.setattr(module, "children", lambda _: {123})
    monkeypatch.setattr(module.os, "pidfd_open", lambda _: 789)
    closed = []
    monkeypatch.setattr(module.os, "close", closed.append)

    def stat(_):
        value = next(states)
        if isinstance(value, Exception):
            raise value
        return value

    monkeypatch.setattr(module, "stat", stat)
    try:
        assert not worker.discover() and not worker.failed
        assert closed == [789] and not worker.pins
    finally:
        worker.selector.close()
        left.close()
        right.close()


async def test_short_internal_patch_sequence_has_no_settlement_warning(runtime, tmp_path, caplog):
    import asyncio

    from src.tools import local_supervisor

    patches = [
        "*** Update File: a.txt\n@@\n alpha\n-beta\n+BETA\n gamma\n",
        "*** Add File: new/deep/file.txt\n+created\n",
        "*** Delete File: gone.txt\n",
        "*** Update File: move.txt\n*** Move to: moved/move.txt\n@@\n-moving\n+moved\n",
        "*** Update File: crlf.txt\n@@\n one\n-two\n+TWO\n",
        "*** Update File: sp ace.txt\n@@\n-spaced\n+SPACED\n",
        "*** Update File: a.txt\n@@\n alpha\n-nomatch\n+X\n",
    ]
    for iteration in range(30):
        root = tmp_path / f"fixture-{iteration}"
        root.mkdir()
        for name, data in {"a.txt": b"alpha\nbeta\ngamma\n", "gone.txt": b"gone\n",
                           "move.txt": b"moving\n", "crlf.txt": b"one\r\ntwo\r\n",
                           "sp ace.txt": b"spaced\n"}.items():
            (root / name).write_bytes(data)
        for index, body in enumerate(patches):
            result = await runtime.executor.execute("apply_patch", {
                "host": HOST, "root": str(root),
                "patch_text": "*** Begin Patch\n" + body + "*** End Patch\n",
            }, user_id=USER)
            assert result.ok is (index != 6), result.output
    owned = [shell for shell in local_supervisor._active
             if shell._settled.get_loop() is asyncio.get_running_loop()]
    for shell in owned:
        assert await asyncio.wait_for(asyncio.shield(shell._settled), 5)
    assert not any("ownership lost" in record.message or "settlement failed" in record.message
                   for record in caplog.records)


def test_shell_catalog_idempotence_and_configuration_refresh(monkeypatch):
    monkeypatch.setattr("src.tools.command_shell.shutil.which", lambda _: "/bin/bash")
    config = Config(discord={"token": "fixture"})
    skills = MagicMock()
    skills.get_tool_definitions.return_value = []
    catalog = ToolCatalog(get_config=lambda: config, skill_manager=skills)
    # All three consumers serve ToolCatalog.merged_definitions; exercise its
    # cached and fresh decoration with already-decorated builtins as input.
    monkeypatch.setattr("src.discord.tool_catalog.get_tool_definitions",
                        lambda **_: apply_shell_contracts(get_tool_definitions(), "bash"))
    served = catalog.merged_definitions()
    assert apply_shell_contracts(served) == served
    assert apply_shell_contracts(apply_shell_contracts(served)) == served
    changed = apply_shell_contracts(served, "sh")
    assert apply_shell_contracts(changed, "sh") == changed
    for tool in changed:
        if tool["name"] in {"run_command", "run_command_multi"}:
            assert tool["description"].count("Local effective shell") == 1
            assert "sh (/bin/sh)" in tool["description"]
    named = {tool["name"]: tool["description"] for tool in changed}
    for name in ("run_command", "run_command_multi", "manage_process", "validate_action"):
        assert "sh (/bin/sh)" in named[name]
    assert "explicit interpreter" in named["run_script"]


@pytest.mark.parametrize("route", ["chat", "agent", "loop"])
async def test_served_catalogs_name_shell_once(monkeypatch, route):
    from types import SimpleNamespace

    from src.discord.tool_loop import ToolLoopRunner
    from tests.test_native_agents_tasks import _message, _tools

    monkeypatch.setattr("src.tools.command_shell.shutil.which", lambda _: "/bin/bash")
    config = Config(discord={"token": "fixture"})
    skills = MagicMock()
    skills.get_tool_definitions.return_value = []
    catalog = ToolCatalog(get_config=lambda: config, skill_manager=skills)
    catalog.cached = apply_shell_contracts(catalog.merged_definitions())
    if route == "agent":
        # The manager is an inert test double. No agent/task/model is started.
        native = _tools(tool_catalog=catalog)
        native._agent_manager.spawn.return_value = "fixture-agent"
        native._agent_manager._agents = {}
        result = await native._handle_spawn_agent(
            _message(), {"label": "fixture", "goal": "fixture"},
        )
        assert "spawned" in result
        tools = native._agent_manager.spawn.call_args.kwargs["tools"]
    else:
        # Chat and autonomous loop share this real request-assembly boundary.
        runner = ToolLoopRunner.__new__(ToolLoopRunner)
        runner._get_config = lambda: config
        runner._tool_catalog = catalog
        runner._permissions = SimpleNamespace(filter_tools=lambda _, tools: tools)
        tools = runner._scoped_tools_for_request(user_id=USER, cache_result=route == "chat")
    named = {tool["name"]: tool["description"] for tool in tools}
    for name in ("run_command", "run_command_multi", "manage_process", "validate_action"):
        assert named[name].count("bash (/bin/bash)") == 1


@pytest.mark.parametrize("context,hosts,tz", [
    ("", {}, "UTC"),
    ("fixture context", {"localhost": "127.0.0.1"}, "America/New_York"),
])
def test_built_system_prompt_byte_identical_to_precampaign_master(monkeypatch, context, hosts, tz):
    import hashlib
    import inspect
    from datetime import UTC, datetime

    from src.llm import system_prompt

    # Pin the pre-campaign file's bytes, then build twice with the same inputs
    # and a fixed clock. No Git subprocess or shell is involved in this test.
    source = inspect.getsource(system_prompt).encode()
    assert hashlib.sha256(source).hexdigest() == (
        "69f65608ece50596ace38862bf5c93377ea24f92424a91bb2935050936c26194"
    )

    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 9, 30, 12, 0, tzinfo=UTC).astimezone(tz)

    monkeypatch.setattr(system_prompt, "datetime", FixedDatetime)
    baseline = {"__name__": system_prompt.__name__, "__package__": system_prompt.__package__}
    exec(compile(source, "precampaign-master-system-prompt", "exec"), baseline)
    baseline["datetime"] = FixedDatetime
    arguments = dict(context=context, hosts=hosts, tz=tz)
    assert (system_prompt.build_system_prompt(**arguments)
            == baseline["build_system_prompt"](**arguments))


@pytest.mark.parametrize("route", [
    "run_command", "run_command_multi", "manage_process", "validate_action",
])
async def test_explicit_missing_bash_clean_refusal_without_dispatch(runtime, monkeypatch, route):
    runtime.config.command_shell = "bash"
    monkeypatch.setattr("src.tools.command_shell.shutil.which", lambda _: None)
    spawned = []

    async def impossible(*args, **kwargs):
        spawned.append(True)
        raise AssertionError("must refuse before spawning")

    monkeypatch.setattr("src.tools.local_supervisor.create_supervised_shell", impossible)
    if route == "validate_action":
        arguments = {"format": "json", "default_host": HOST, "checks": [{
            "type": "command", "target": "printf harmless",
        }]}
    elif route == "manage_process":
        arguments = {"action": "start", "host": HOST, "command": "printf harmless"}
    else:
        arguments = {"command": "printf harmless"}
        arguments.update({"hosts": [HOST]} if route.endswith("multi") else {"host": HOST})
    result = await runtime.executor.execute(route, arguments, user_id=USER)
    text = result.output
    if route == "validate_action":
        check = json.loads(text)["checks"][0]
        assert check["status"] == "error"
        text = check["error"]
    else:
        assert not result.ok
    assert "tools.command_shell=bash" in text
    assert "command not executed" in text
    assert "Local exec error" not in text and '"kind"' not in text
    assert "Command failed" not in text
    assert not spawned


def test_command_timeout_truthful_and_noncommand_legacy_verdict():
    output = CommandOutput("Command timed out after 2 seconds", shell="sh",
                           reason="timeout", returncode=-15)
    check = Check(type="command", target="printf harmless", timeout_seconds=2)
    assert _evaluate(check, 1, output) == (
        "fail", "timed out after 2s",
    )
    check = Check(type="http", target="http://fixture.invalid", timeout_seconds=2)
    assert _evaluate(check, 1, output) == _evaluate(check, 1, str(output))
    assert _evaluate(check, 1, output)[1].endswith("got Command timed out after 2 seconds")


@pytest.mark.parametrize("status,code,reason", [
    ("completed", 0, None), ("running", None, None),
    ("failed", 7, None), ("killed", -15, "cancellation"),
])
def test_poll_only_informative_failure_metadata(status, code, reason):
    info = ProcessInfo(pid=123, command="printf harmless", host="localhost", start_time=1,
                       status=status, exit_code=code, termination_reason=reason,
                       effective_shell="bash", shell_executable="/bin/bash")
    text = ProcessRegistry._output_page(info, b"", 0, 4000, 8000, preview=True)
    meta = json.loads(text.partition("[output retention] ")[2])
    assert "effective_shell" not in meta and "shell_executable" not in meta
    assert ("cleanup_verified" in meta) is (status in {"failed", "killed"})
    assert ("termination_reason" in meta) is bool(reason)
    assert ("signal" in meta) is (code is not None and code < 0)


@pytest.mark.parametrize("preview", [True, False])
def test_successful_poll_exact_master_wire_bytes(monkeypatch, preview):
    monkeypatch.setattr("src.tools.process_manager.time.time", lambda: 11)
    info = ProcessInfo(pid=123, generation="fixture", command="printf harmless",
                       host="localhost", start_time=1, status="completed", exit_code=0,
                       effective_shell="bash", shell_executable="/bin/bash",
                       session_confirmed_empty=True, total_output_bytes=5, retained_bytes=5)
    expected_meta = {
        "kind": "process_output", "pid": 123, "generation": "fixture",
        "status": "completed", "exit_code": 0, "lifetime_deadline": 3601,
        "emitted_bytes": 5, "retained_bytes": 5,
        "shown_intervals": [[0, 5]], "shown_bytes": 5,
        "capture_limit_loss_bytes": 0, "not_retained_bytes": 0,
        "capture_error": None, "expires_at": None,
        "retention_seconds_after_exit": 86400, "truncated": preview,
        "cursor": "fixture:0" if preview else None,
        "retrieval": {"tool": "manage_process", "arguments": {
            "action": "poll", "pid": 123, "cursor": "fixture:0", "limit": 4000,
        }} if preview else None,
    }
    if preview:
        prefix = "[PID 123] status=completed exit_code=0 uptime=10s output_bytes=5\nhello\n"
        expected = prefix + "[output retention] " + json.dumps(expected_meta, separators=(",", ":"))
    else:
        expected_meta["text"] = "hello"
        expected = json.dumps(expected_meta, separators=(",", ":"))
    assert ProcessRegistry._output_page(info, b"hello", 0, 4000, 8000, preview=preview) == expected
