"""A late-ACK foreground result travels the real downstream paths as an ordinary result.

The loop is held across the worker's bounded ACK wait (harmless commands only), so
settlement fails while the command's real output and exit code are recorded. The
consumers that used to receive "Local command supervisor ownership lost" now get the
ordinary result: retained output and paging, recovery classification without any
retry of raw commands or scripts, the tool wrapper's audit call, durable op
settlement, the no-replay fence, and the resume helpers (stored result, no dispatch).
"""
import asyncio
import json
import time
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.config.schema import ToolHost, ToolsConfig
from src.discord.turn_resume import TurnResumeManager
from src.tools import local_supervisor as s
from src.tools.executor import ToolExecutor
from src.turn_state import OpState, StaleTurnError, TurnStateStore
from tests.test_executor_timeout_durability import (
    _durability,
    _ledger_state,
    _record_and_start,
    _runner,
    _state,
)


@pytest.fixture
def held(monkeypatch):
    monkeypatch.setattr(s, '_active', set())
    monkeypatch.setattr(s, '_pending', set())
    monkeypatch.setattr(s, '_closing_loops', set())
    monkeypatch.setattr(s, '_unverified_startup', False)
    veto = Mock()
    monkeypatch.setattr('src.restart.block_reexec', veto)
    real = s.create_supervised_shell

    async def factory(*args, **kwargs):
        shell = await real(*args, **kwargs)
        time.sleep(3.0)  # the command finishes and the worker gives up on the ACK
        await asyncio.wait({shell._monitor_task}, timeout=10)
        return shell

    monkeypatch.setattr(s, 'create_supervised_shell', factory)
    return SimpleNamespace(veto=veto, real=real)


def tools(tmp_path):
    return ToolsConfig(
        local_working_dir=str(tmp_path / "workspace"),
        audit_log_path=str(tmp_path / "data" / "audit.jsonl"),
        hosts={"testhost": ToolHost(address="127.0.0.1")},
    )


def executor(tmp_path):
    tmp_path.mkdir(parents=True, exist_ok=True)
    ex = ToolExecutor(config=tools(tmp_path), memory_path=str(tmp_path / "memory.json"))
    ex._protected_roots = lambda: [str(tmp_path / "protected")]
    return ex


def settlement_still_failed(held):
    (shell,) = s._active
    assert shell._ack_lost_after_clean and shell._settled.exception() is not None
    held.veto.assert_called_with('local command supervisor ownership lost')


async def test_large_output_is_retained_and_pages_back(tmp_path, held):
    ex = executor(tmp_path)
    result = await ex.execute("run_command", {
        "host": "testhost", "command": "printf '%050000d' 0; exit 7"}, user_id="owner")
    assert not result.ok and not result.uncertain_outcome
    envelope = json.loads(result.output)
    assert envelope["total_chars"] >= 50000 and envelope["cursor"]
    rebuilt, cursor = envelope["head"], envelope["cursor"]
    while cursor:
        page = await ex.execute("get_tool_output", {"cursor": cursor}, user_id="owner")
        assert page.ok, page.output
        data = json.loads(page.output)
        rebuilt += data["text"]
        cursor = data["cursor"]
    assert len(rebuilt) == envelope["total_chars"] and "0" * 50000 in rebuilt
    settlement_still_failed(held)


@pytest.mark.parametrize("tool", ["run_command", "run_script"])
async def test_transient_text_is_classified_as_usual_and_never_retried(
        tmp_path, held, monkeypatch, tool):
    message = "ssh: connect to host fixture port 22: Connection refused"

    def args(counter):
        if tool == "run_command":
            return {"host": "testhost",
                    "command": f"echo once >> {counter}; echo '{message}'; exit 7"}
        return {"host": "testhost", "interpreter": "python3", "script": (
            f"open({str(counter)!r}, 'a').write('once\\n')\n"
            f"print({message!r})\nraise SystemExit(7)\n")}

    late, counter = executor(tmp_path / "late"), tmp_path / "late-counter.txt"
    result = await late.execute(tool, args(counter), user_id="owner")
    assert counter.read_text() == "once\n"  # exactly one execution
    assert not result.ok and not result.uncertain_outcome
    assert "Connection refused" in result.output and "ownership lost" not in result.output
    assert late.recovery_stats.get_summary()["totals"]["attempts"] == 0  # never retried
    settlement_still_failed(held)

    monkeypatch.setattr(s, 'create_supervised_shell', held.real)  # an ordinary run, for reference
    ordinary, reference = executor(tmp_path / "ordinary"), tmp_path / "ordinary-counter.txt"
    assert not (await ordinary.execute(tool, args(reference), user_id="owner")).ok

    def events(ex):
        return [(e["tool"], e["category"], e["succeeded"]) for e in ex.recovery_stats.get_recent()]

    assert events(late) == events(ordinary)  # the late-ACK result is classified like any other
    if tool == "run_command":
        assert events(late) == [("run_command", "ssh_transient", False)]


@pytest.mark.parametrize("exit_code,state", [(0, OpState.APPLIED), (7, OpState.DEFINITELY_FAILED)])
async def test_result_settles_durably_and_resume_never_dispatches(tmp_path, held, exit_code, state):
    config = tools(tmp_path)
    ex = ToolExecutor(config=config, memory_path=str(tmp_path / "memory.json"))
    ex._protected_roots = lambda: [str(tmp_path / "protected")]
    runner = _runner(ex, config)
    store = TurnStateStore(tmp_path / "turn-state" / "turns.sqlite3")
    durability = await _durability(store)
    counter = tmp_path / "counter.txt"
    block = SimpleNamespace(name="run_command", id="late-ack-op", parse_error=None, input={
        "host": "testhost",
        "command": f"echo once >> {counter}; printf late-ack-result; exit {exit_code}"})
    await _record_and_start(durability, block)
    result = await runner._run_one_tool_with_timeout(_state(durability), block)
    assert "late-ack-result" in result["content"] and "ownership lost" not in result["content"]
    assert counter.read_text() == "once\n"

    audit = runner._audit.log_execution.await_args.kwargs
    assert audit["tool_name"] == "run_command"
    assert "ownership lost" not in str(audit["error"])
    assert (audit["error"] is None) is (exit_code == 0)

    assert _ledger_state(store, durability, block.id) == state
    (stored,) = store._conn.execute(
        "SELECT result FROM operations WHERE tool_call_id=?", (block.id,)).fetchone()
    assert "late-ack-result" in stored
    with pytest.raises(StaleTurnError):  # a settled op cannot run again
        await durability.before_tool(block)

    ops = [dict(zip(("generation_seq", "tool_call_id", "state", "tool_name", "effect_class",
                     "result"), row)) for row in store._conn.execute(
        "SELECT generation_seq, tool_call_id, state, tool_name, effect_class, result "
        "FROM operations WHERE tool_call_id=?", (block.id,))]
    assert TurnResumeManager._unresolved_ops({"operations": ops}) == []  # no resume barrier
    messages = [{"role": "assistant", "content": [
        {"type": "tool_use", "id": block.id, "name": block.name, "input": block.input}]}]
    TurnResumeManager._repair_unmatched_tool_use(
        messages, ops, generation_seq=durability.generation_seq)
    replayed = messages[-1]["content"][0]["content"]
    if state == OpState.APPLIED:
        assert "late-ack-result" in replayed  # the stored result, not a new dispatch
    assert counter.read_text() == "once\n"
    settlement_still_failed(held)
    await durability.settle_terminal(cancelled=False, is_error=exit_code != 0)
    store.close()
