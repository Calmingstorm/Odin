"""Regression coverage for executor timeouts crossing the durable tool wrapper.

The executor is allowed to settle its own timeout before the chat wrapper's
larger dispatch/settlement budget. A handler can have applied an effect before
that cancellation, so the durable ledger must retain uncertainty and never
permit a replay.
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.config.schema import ToolsConfig
from src.discord.tool_loop import ToolLoopRunner
from src.tools.effect_classifier import classify_tool_effect
from src.tools.executor import ToolExecutor
from src.turn_state import OpState, StaleTurnError, TurnStateStore
from src.turn_state.durability import TurnDurability


def _message():
    return SimpleNamespace(
        id="timeout-message",
        content="exercise executor timeout durability",
        guild=None,
        author=SimpleNamespace(id="timeout-user"),
        channel=SimpleNamespace(id="timeout-channel"),
    )


async def _durability(store: TurnStateStore) -> TurnDurability:
    durability = await TurnDurability.admit(
        store,
        message=_message(),
        system_prompt="test",
        tools=[],
        session_snapshot=None,
    )
    assert durability.enabled
    return durability


def _runner(executor: ToolExecutor, tools: ToolsConfig) -> ToolLoopRunner:
    """A real runner with deliberately inert delivery/audit collaborators."""
    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    runner._get_config = lambda: SimpleNamespace(tools=tools)
    # Native dispatch is false even for wait_for_agents. The effect class is
    # code-owned and must not depend on the selected dispatch route.
    runner._native_tools = SimpleNamespace(handles=lambda _tool_name: False)
    runner._mcp_manager = None
    runner._tool_executor = executor
    runner._delivery = SimpleNamespace(set_status=AsyncMock())
    runner._audit = SimpleNamespace(log_event=AsyncMock(), log_execution=AsyncMock())
    runner._channel_state = SimpleNamespace(track_action=lambda *_args, **_kwargs: None)
    return runner


def _state(durability: TurnDurability) -> SimpleNamespace:
    return SimpleNamespace(
        iteration=1,
        _cancel=asyncio.Event(),
        durability=durability,
        message=_message(),
        user_id="timeout-user",
        policy=SimpleNamespace(skill_file_delivery=False),
        _pending_validations=[],
    )


def _ledger_state(store: TurnStateStore, durability: TurnDurability, call_id: str) -> str:
    row = store._conn.execute(
        "SELECT state FROM operations WHERE source=? AND channel_id=? AND message_id=? "
        "AND turn_generation=? AND generation_seq=? AND tool_call_id=?",
        (
            "discord",
            "timeout-channel",
            "timeout-message",
            durability.lease.generation,
            durability.generation_seq,
            call_id,
        ),
    ).fetchone()
    assert row is not None
    return row[0]


async def _record_and_start(durability: TurnDurability, block: SimpleNamespace) -> None:
    """Use production intent persistence without unrelated ChatTurn snapshots.

    The real ``_run_one_tool_captured`` below performs WI-2 (``before_tool``)
    itself, exactly as production does.
    """
    durability.generation_seq = 1
    store = durability._store
    assert store is not None and durability.lease is not None
    await asyncio.to_thread(
        store.record_intents_sync,
        durability.lease,
        durability.generation_seq,
        [{
            "tool_call_id": block.id,
            "tool_name": block.name,
            "tool_input": block.input,
            "effect_class": classify_tool_effect(block.name, block.input),
        }],
        iteration=1,
    )


@pytest.mark.asyncio
async def test_effectful_executor_timeout_is_durably_unknown_and_not_replayed(tmp_path):
    """An effect before an inner executor timeout remains OUTCOME_UNKNOWN.

    The outer wrapper is deliberately larger than the one-second executor
    budget. It must retain the executor's structured timeout settlement rather
    than impose its own timeout or retry this effect-capable handler.
    """
    tools = ToolsConfig(tool_timeouts={"apply_patch": 1})
    executor = ToolExecutor(config=tools, memory_path=str(tmp_path / "memory.json"))
    runner = _runner(executor, tools)
    store = TurnStateStore(tmp_path / "turn-state" / "turns.sqlite3")
    durability = await _durability(store)
    block = SimpleNamespace(
        name="apply_patch",
        input={"host": "localhost", "root": str(tmp_path), "patch_text": "ignored"},
        id="effectful-timeout",
        parse_error=None,
    )
    await _record_and_start(durability, block)

    calls = 0
    started = asyncio.Event()
    cancelled = asyncio.Event()
    effect = tmp_path / "effect-was-applied"

    async def applies_then_waits(_tool_input):
        nonlocal calls
        calls += 1
        effect.write_text("applied", encoding="utf-8")
        started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            cancelled.set()
            raise

    # This is the sanctioned instance override seam. The real executor,
    # timeout handling, wrapper, and TurnDurability path remain exercised.
    executor._handle_apply_patch = applies_then_waits
    durability.after_tool_interrupted = AsyncMock(wraps=durability.after_tool_interrupted)
    result = await runner._run_one_tool_with_timeout(_state(durability), block)

    assert started.is_set() and cancelled.is_set()
    assert effect.read_text(encoding="utf-8") == "applied"
    assert calls == 1
    assert "timed out" in result["content"].lower()
    # The inner executor settled, rather than the outer interruption path.
    durability.after_tool_interrupted.assert_not_awaited()
    assert _ledger_state(store, durability, block.id) == OpState.OUTCOME_UNKNOWN

    # The durable no-replay fence is stronger than the local call counter:
    # an already terminal op cannot legally return to RUNNING.
    with pytest.raises(StaleTurnError):
        await durability.before_tool(block)
    assert calls == 1

    await durability.settle_terminal(cancelled=False, is_error=True)
    store.close()


@pytest.mark.asyncio
async def test_safe_tool_retry_timeout_retains_structured_uncertainty(tmp_path):
    """A timeout on recovery's second attempt cannot be textually downgraded.

    ``read_file`` is retryable. Its first attempt returns a recoverable network
    error; the retry performs a test effect and reaches the real executor
    timeout. The structured timeout marker must survive retry processing and
    suppress any further execution.
    """
    tools = ToolsConfig(tool_timeouts={"read_file": 1})
    executor = ToolExecutor(config=tools, memory_path=str(tmp_path / "memory.json"))
    calls = 0
    effect = tmp_path / "retry-effect-was-applied"
    cancelled = asyncio.Event()

    async def transient_then_applies_and_waits(_tool_input):
        nonlocal calls
        calls += 1
        if calls == 1:
            return "Error: ConnectionResetError during test transport"
        effect.write_text("applied", encoding="utf-8")
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            cancelled.set()
            raise

    executor._handle_read_file = transient_then_applies_and_waits
    result = await executor.execute("read_file", {"path": str(tmp_path / "x")})

    assert calls == 2
    assert cancelled.is_set()
    assert effect.read_text(encoding="utf-8") == "applied"
    assert result.ok is False
    assert result.uncertain_outcome is True
    assert "timed out" in result.output.lower()


@pytest.mark.asyncio
@pytest.mark.parametrize("registered_handler", [False, True])
@pytest.mark.parametrize(
    ("tool_name", "expected_effect_class"),
    [
        ("wait_for_agents", "EFFECT_FREE_OBSERVATION"),
        ("future_dynamic_tool", "EXTERNAL_EFFECT_CAPABLE"),
    ],
)
async def test_executor_timeout_effect_class_and_unstarted_failures(
    tmp_path, tool_name, expected_effect_class, registered_handler
):
    """Only the audited observation name is effect-free, regardless of route.

    Missing handlers are definite failures, but dispatched dynamic handlers
    time out uncertain while the audited observation remains definite.
    """
    tools = ToolsConfig(tool_timeouts={tool_name: 1})
    executor = ToolExecutor(config=tools, memory_path=str(tmp_path / "memory.json"))
    runner = _runner(executor, tools)
    store = TurnStateStore(tmp_path / "turn-state" / "turns.sqlite3")
    durability = await _durability(store)
    block = SimpleNamespace(
        name=tool_name,
        input={"agent_ids": ["agent-1"]},
        id=f"unknown-{tool_name}",
        parse_error=None,
    )
    await _record_and_start(durability, block)

    calls = 0

    async def waits_until_timeout(_tool_input):
        nonlocal calls
        calls += 1
        await asyncio.Event().wait()

    if registered_handler:
        setattr(executor, f"_handle_{tool_name}", waits_until_timeout)
    durability.after_tool_interrupted = AsyncMock(wraps=durability.after_tool_interrupted)
    result = await runner._run_one_tool_with_timeout(_state(durability), block)

    assert calls == int(registered_handler)
    assert ("timed out" if registered_handler else "unknown tool") in result["content"].lower()
    durability.after_tool_interrupted.assert_not_awaited()
    expected_state = (
        OpState.OUTCOME_UNKNOWN
        if registered_handler and expected_effect_class == "EXTERNAL_EFFECT_CAPABLE"
        else OpState.DEFINITELY_FAILED
    )
    assert _ledger_state(store, durability, block.id) == expected_state
    (effect_class,) = store._conn.execute(
        "SELECT effect_class FROM operations WHERE tool_call_id=?", (block.id,)
    ).fetchone()
    assert effect_class == expected_effect_class

    await durability.settle_terminal(cancelled=False, is_error=True)
    store.close()
