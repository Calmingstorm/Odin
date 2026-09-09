"""Event-gated races through the real main-turn iteration runner.

Only provider and external effects are fake. Guards, transcript assembly,
ownership and durability hook ordering run through production code.
"""

from __future__ import annotations

import asyncio
import copy
from unittest.mock import AsyncMock, Mock

import pytest

from src.discord.tool_loop import CHAT_POLICY
from src.tools.result_validator import ToolResult
from tests.fakes import FakeLLM, FakeMessage, make_bot, text_response, tool_call_response


@pytest.fixture(autouse=True)
def isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


async def prepare(script, *, cap=8):
    llm = FakeLLM(script)
    bot = make_bot(fake_llm=llm)
    runner = bot.tool_loop
    runner._turn_store = None
    runner._window_observer = None
    message = FakeMessage("Original task")
    state = await runner._prepare_chat_turn(
        message, [{"role": "user", "content": message.content}], None, None, CHAT_POLICY
    )
    state.chat_cap = cap
    checkpoints = []
    for name in ("on_generation_start", "on_llm_response", "on_batch_settled",
                 "on_guard_injection"):
        original = getattr(state.durability, name)

        async def record(*args, _name=name, _original=original, **kwargs):
            checkpoints.append((_name, copy.deepcopy(state.messages),
                                state.wait_judgment_pending,
                                state.stuck_tracker.last_fingerprint))
            return await _original(*args, **kwargs)

        setattr(state.durability, name, record)
    runner._run_chat_iterations = AsyncMock(wraps=runner._run_chat_iterations)
    runner._turn_recorder._save_turn_trajectory = AsyncMock()
    return bot, runner, state, llm, checkpoints


def enqueue(runner, state, text="Use the corrected plan", *, user_id=None, notifier=None):
    receipt = runner._channel_state.request_steer(
        state._ch_id, text, user_id=user_id or state.user_id,
        is_admin=user_id is not None,
        notifier=notifier,
    )
    assert "not yet consumed" in receipt
    return receipt


def directives(messages):
    return [m for m in messages if m.get("provenance") == "human_steer"]


def gate_first_call(monkeypatch, owner, name):
    entered, release = asyncio.Event(), asyncio.Event()
    original = getattr(owner, name)
    first = True

    async def gated(*args, **kwargs):
        nonlocal first
        if first:
            first = False
            entered.set()
            await release.wait()
        return await original(*args, **kwargs)

    monkeypatch.setattr(owner, name, gated)
    return entered, release


async def reach(event):
    await asyncio.wait_for(event.wait(), 5)


async def finish(task):
    return await asyncio.wait_for(task, 5)


@pytest.mark.parametrize("cap", [1, 4])
async def test_generation_correction_suppresses_stale_text_without_guard_budget(monkeypatch, cap):
    _, runner, st, llm, checkpoints = await prepare(
        [text_response("I ran the command and everything looks fine."),
         text_response("Corrected answer.")], cap=cap,
    )
    entered, release = gate_first_call(monkeypatch, llm, "chat_with_tools")
    task = asyncio.create_task(runner._run_with_guards(st))
    await reach(entered)
    enqueue(runner, st)
    assert st.last_consumed_sequence == 0
    release.set()
    result = await finish(task)
    runner._run_chat_iterations.assert_awaited_once_with(st)
    assert not st.fabrication_retried
    assert st.continuation_count == 0
    assert st.last_consumed_sequence == 1
    assert [x[0] for x in checkpoints].count("on_guard_injection") == 1
    assert len(llm.calls) == (1 if cap == 1 else 2)
    if cap == 1:
        assert result[2] is True
        assert "not been acted on" in result[0]
        assert "I ran" not in result[0]
    else:
        assert result == ("Corrected answer.", False, False, [], False)
        assert directives(llm.messages_of_call(1))[0]["sequence"] == 1
    assert not st._steer_inbox.accepting


@pytest.mark.parametrize("cap", [1, 4])
@pytest.mark.parametrize("verdict", [(True, ""), (False, "Finish the obsolete plan")])
async def test_classifier_correction_discards_verdict_and_preserves_budget(
    monkeypatch, cap, verdict,
):
    _, runner, st, llm, checkpoints = await prepare(
        [text_response("Old answer."), text_response("Corrected answer.")], cap=cap
    )
    st.tools_used_in_loop.append("parse_time")
    classifier = AsyncMock(side_effect=[verdict, (True, "")])
    monkeypatch.setattr(runner._completion_classifier, "classify", classifier)
    entered, release = gate_first_call(monkeypatch, runner._completion_classifier, "classify")
    task = asyncio.create_task(runner._run_with_guards(st))
    await reach(entered)
    enqueue(runner, st, "Abandon the original plan")
    release.set()
    result = await finish(task)
    assert st.continuation_count == 0
    assert [x[0] for x in checkpoints].count("on_guard_injection") == 1
    assert "Finish the obsolete plan" not in str(st.messages)
    assert classifier.await_args_list[0].args == ("Original task", "Old answer.", ["parse_time"])
    if cap == 1:
        assert result[2] and "not been acted on" in result[0]
        assert len(llm.calls) == 1
    else:
        assert result[0] == "Corrected answer."
        assert len(llm.calls) == 2
        request = classifier.await_args_list[1].args[0]
        assert request.startswith("Original task")
        assert "Abandon the original plan" in request
        assert "supersede" in request


@pytest.mark.parametrize("batch_kind", ["parallel", "wait", "handoff"])
@pytest.mark.parametrize("cap", [1, 4])
async def test_tool_batch_pairs_checkpoint_before_replan_no_stale_judgment_or_handoff(
    monkeypatch, batch_kind, cap,
):
    calls = [("run_command", {"command": "first"}), ("run_command", {"command": "second"})]
    if batch_kind == "wait":
        calls = [("wait_for_agents", {"agent_ids": ["a"]})]
    elif batch_kind == "handoff":
        calls = [("a_skill", {})]
    _, runner, st, llm, checkpoints = await prepare(
        [tool_call_response(*calls), text_response("Corrected answer.")], cap=cap
    )
    monkeypatch.setattr(runner._native_tools, "handles", lambda name: False)
    entered, release = asyncio.Event(), asyncio.Event()
    executions = []

    async def execute(name, args, *, user_id):
        executions.append((name, args, user_id))
        entered.set()
        await release.wait()
        return ToolResult(output="Agent a still running", tool_name=name)

    monkeypatch.setattr(runner._tool_executor, "execute", execute)
    handoff = Mock(wraps=runner._check_skill_handoff)
    monkeypatch.setattr(runner, "_check_skill_handoff", handoff)
    judge = AsyncMock(wraps=runner._judge_wait_stuck)
    monkeypatch.setattr(runner, "_judge_wait_stuck", judge)
    if batch_kind == "handoff":
        monkeypatch.setattr(runner._skill_manager, "should_handoff_to_codex", lambda name: True)
    st.stuck_tracker.warned = True
    st.continuation_count = 1
    task = asyncio.create_task(runner._run_with_guards(st))
    await reach(entered)
    enqueue(runner, st, user_id="999999")
    assert not directives(st.messages)
    release.set()
    result = await finish(task)
    assert len(executions) == len(calls)
    assert all(item[2] == st.user_id for item in executions)
    assert st.user_id != "999999"
    assert st.message.author.id == int(st.user_id)
    judge.assert_not_awaited()
    handoff.assert_not_called()
    assert st.stuck_tracker.warned is True
    assert st.continuation_count == 1
    assert st.wait_judgment_pending is False
    batch = next(x for x in checkpoints if x[0] == "on_batch_settled")
    guard = next(x for x in checkpoints if x[0] == "on_guard_injection")
    assert checkpoints.index(batch) < checkpoints.index(guard)
    assert not directives(batch[1])
    assert len(directives(guard[1])) == 1
    assert guard[2] is False
    if batch_kind == "wait":
        assert batch[2] is True
        assert batch[3].startswith("wait:")
        assert guard[3] == batch[3]
    transcript = guard[1]
    assistant = next(m for m in transcript if isinstance(m["content"], list)
                     and m["role"] == "assistant")
    ai = transcript.index(assistant)
    result_message = transcript[ai + 1]
    assert result_message["role"] == "user"
    assert [b["id"] for b in assistant["content"] if b["type"] == "tool_use"] == [
        b["tool_use_id"] for b in result_message["content"]
    ]
    assert transcript.index(directives(transcript)[0]) > ai + 1
    assert result[4] is False
    if cap == 1:
        assert result[2] and "not been acted on" in result[0]
    else:
        assert result[0] == "Corrected answer."
        assert directives(llm.messages_of_call(1))


async def test_entry_directives_persist_before_generation_without_tool_progress():
    _, runner, st, llm, checkpoints = await prepare([text_response("Corrected answer.")])
    enqueue(runner, st, "First instruction")
    enqueue(runner, st, "Second instruction")
    assert (await runner._run_with_guards(st))[0] == "Corrected answer."
    assert [m["sequence"] for m in directives(llm.messages_of_call(0))] == [1, 2]
    assert [item[0] for item in checkpoints] == ["on_guard_injection", "on_generation_start"]
    assert len(llm.calls) == 1
    assert st.continuation_count == 0
    assert st.tools_used_in_loop == []
    assert not st.stuck_tracker.warned


@pytest.mark.parametrize("exit_kind", ["final", "error", "cap"])
async def test_terminal_save_yield_closes_admission_but_cannot_close_replacement(
    monkeypatch, exit_kind,
):
    from src.discord.channel_state import ChatTurnInbox
    from src.llm.errors import LLMAuthError

    script = [text_response("Ordinary answer.")]
    if exit_kind == "error":
        script = [LLMAuthError("test authentication failure")]
    _, runner, st, _, _ = await prepare(script, cap=0 if exit_kind == "cap" else 2)
    entered, release = gate_first_call(monkeypatch, runner._turn_recorder, "_save_turn_trajectory")
    task = asyncio.create_task(runner._run_with_guards(st))
    await reach(entered)
    registry = runner._channel_state
    receipt = registry.request_steer(st._ch_id, "too late", user_id=st.user_id)
    assert "not yet consumed" not in receipt
    assert not st._steer_inbox.accepting
    registry.set_active_request(st._ch_id, "replacement")
    new_inbox = ChatTurnInbox(requester_id=st.user_id)
    registry.bind_steer_inbox(st._ch_id, "replacement", new_inbox)
    assert "not yet consumed" in registry.request_steer(st._ch_id, "new turn", user_id=st.user_id)
    release.set()
    await finish(task)
    assert registry.active_requests[st._ch_id] == "replacement"
    assert new_inbox.accepting and new_inbox.inbox.qsize() == 1


async def test_corrections_arriving_during_wi4_and_wi5_are_fifo_before_next_generation(monkeypatch):
    _, runner, st, llm, checkpoints = await prepare(
        [tool_call_response(("parse_time", {"expression": "tomorrow"})),
         text_response("Corrected answer.")]
    )
    batch_enter, batch_release = gate_first_call(monkeypatch, st.durability, "on_batch_settled")
    guard_enter, guard_release = gate_first_call(monkeypatch, st.durability, "on_guard_injection")
    task = asyncio.create_task(runner._run_with_guards(st))
    await reach(batch_enter)
    enqueue(runner, st, "First correction")
    assert st.last_consumed_sequence == 0
    batch_release.set()
    await reach(guard_enter)
    assert st.last_consumed_sequence == 1
    enqueue(runner, st, "Second correction")
    guard_release.set()
    assert (await finish(task))[0] == "Corrected answer."
    assert len(llm.calls) == 2
    received = directives(llm.messages_of_call(1))
    assert [m["sequence"] for m in received] == [1, 2]
    assert [e["sequence"] for e in st.inbox_events if e["event"] == "consumed"] == [1, 2]
    assert [x[0] for x in checkpoints].count("on_guard_injection") == 2


async def test_steering_does_not_bypass_operational_validation(monkeypatch):
    _, runner, st, llm, checkpoints = await prepare(
        [tool_call_response(("run_command", {"command": "change"})),
         text_response("Corrected answer."),
         tool_call_response(("validate_action", {}), id_prefix="validate"),
         text_response("Validated answer.")]
    )
    entered, release = asyncio.Event(), asyncio.Event()

    async def execute(name, args, *, user_id):
        if name == "run_command":
            entered.set()
            await release.wait()
            return ToolResult(output="changed", tool_name=name, requires_validation=True,
                              validation_reason="test operational change")
        return ToolResult(output="pass", tool_name=name)

    monkeypatch.setattr(runner._native_tools, "handles", lambda name: False)
    monkeypatch.setattr(runner._tool_executor, "execute", execute)
    task = asyncio.create_task(runner._run_with_guards(st))
    await reach(entered)
    enqueue(runner, st, "Report immediately")
    release.set()
    result = await finish(task)
    assert result == ("Validated answer.", False, False, ["run_command", "validate_action"], False)
    assert len(llm.calls) == 4
    assert "VALIDATION REQUIRED" in str(llm.messages_of_call(2))
    assert not st._validation_required
    assert [x[0] for x in checkpoints].count("on_guard_injection") == 2


async def test_failed_consumed_directive_checkpoint_blocks_next_generation(monkeypatch):
    from src.turn_state.store import TurnStateUnavailableError

    _, runner, st, llm, _ = await prepare([text_response("Old answer.")])
    entered, release = gate_first_call(monkeypatch, llm, "chat_with_tools")
    monkeypatch.setattr(st.durability, "on_guard_injection", AsyncMock(
        side_effect=TurnStateUnavailableError("checkpoint unavailable")
    ))
    task = asyncio.create_task(runner._run_with_guards(st))
    await reach(entered)
    enqueue(runner, st)
    release.set()
    with pytest.raises(TurnStateUnavailableError, match="checkpoint unavailable"):
        await finish(task)
    assert len(llm.calls) == 1
    assert st.last_consumed_sequence == 1
    assert st.durability.settled
    assert not st._steer_inbox.accepting
    assert st._ch_id not in runner._channel_state.active_requests


@pytest.mark.parametrize("exit_kind", ["stop", "cancel", "suspend", "suspend_failed"])
async def test_safety_exit_drops_pending_with_no_replay_and_fences_persistence(
    monkeypatch, exit_kind,
):
    from src.llm.errors import LLMCapacityError
    from src.turn_state.durability import TurnDurability

    _, runner, st, llm, _ = await prepare([text_response("Old answer.")])
    old_inbox = st._steer_inbox
    notifications = []

    async def notifier(sequence, outcome):
        notifications.append((sequence, outcome))
    if exit_kind.startswith("suspend"):
        entered, release = asyncio.Event(), asyncio.Event()

        async def suspend_persistence(state, reason):
            assert not old_inbox.accepting
            assert "not yet consumed" not in runner._channel_state.request_steer(
                st._ch_id, "too late", user_id=st.user_id
            )
            entered.set()
            await release.wait()
            return exit_kind == "suspend"

        monkeypatch.setattr(st.durability, "suspend", suspend_persistence)

        async def capacity(state, **kwargs):
            enqueue(runner, state, "never replay this pending directive", notifier=notifier)
            return "done", await runner._suspend_turn(state, LLMCapacityError("capacity"))

        original_call = runner._call_llm
        monkeypatch.setattr(runner, "_call_llm", capacity)
        task = asyncio.create_task(runner._run_with_guards(st))
        await reach(entered)
        assert not directives(st.messages)
        release.set()
        assert (await finish(task))[2] is True
        monkeypatch.setattr(runner, "_call_llm", original_call)
    else:
        entered, release = gate_first_call(monkeypatch, llm, "chat_with_tools")
        task = asyncio.create_task(runner._run_with_guards(st))
        await reach(entered)
        enqueue(runner, st, "never replay this pending directive", notifier=notifier)
        if exit_kind == "stop":
            runner._channel_state.request_stop(st._ch_id)
            release.set()
            assert (await finish(task))[0].startswith("Task stopped by user.")
        else:
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await finish(task)
    assert not old_inbox.accepting
    assert old_inbox.last_consumed_sequence == 0
    assert not directives(st.messages)
    for _ in range(5):
        await asyncio.sleep(0)
    assert notifications == [(1, "closed")]
    # Even reusing a restored object must reconstruct, not replay, its queue.
    # This bypasses durable resume admission deliberately to test that defense.
    st.durability = TurnDurability.disabled()
    llm.responses[:] = [text_response("Resumed answer.")]
    result = await runner.run_resumed(st)
    assert result[0] == "Resumed answer."
    assert st._steer_inbox is not old_inbox
    assert st.inbox_sequence == 0
    assert not directives(llm.messages_of_call(-1))


@pytest.mark.parametrize("exit_kind", ["provider_error", "escape", "cap"])
async def test_unconsumed_receipt_on_error_escape_and_final_budget(monkeypatch, exit_kind):
    from src.discord.steer_notifications import finish_steer_notifications
    from src.llm.errors import LLMAuthError

    response = (LLMAuthError("test failure") if exit_kind == "provider_error"
                else text_response("old"))
    _, runner, st, llm, _ = await prepare([response], cap=1)
    notifications = []

    async def notify(sequence, outcome):
        notifications.append((sequence, outcome))

    entered, release = gate_first_call(monkeypatch, llm, "chat_with_tools")
    if exit_kind == "escape":
        async def explode(*_args):
            raise RuntimeError("turn escaped")

        monkeypatch.setattr(runner, "_check_stuck_and_record", explode)
    elif exit_kind == "cap":
        # The first correction was consumed on the last iteration. Another
        # arrives while WI-5 yields, too late for the exhausted turn to drain.
        original = st.durability.on_guard_injection

        async def late_pending(state):
            enqueue(runner, state, "second, still pending", notifier=notify)
            await original(state)

        monkeypatch.setattr(st.durability, "on_guard_injection", late_pending)

    task = asyncio.create_task(runner._run_with_guards(st))
    await reach(entered)
    enqueue(runner, st, notifier=notify)
    release.set()
    if exit_kind == "escape":
        with pytest.raises(RuntimeError, match="turn escaped"):
            await finish(task)
    else:
        assert (await finish(task))[2] is True
    await finish_steer_notifications()
    assert notifications == ([(1, "consumed"), (2, "closed")] if exit_kind == "cap"
                             else [(1, "closed")])
    assert st._inbox.empty() and not st._steer_inbox.accepting


async def test_receipt_transport_never_holds_up_turn_completion():
    from src.discord.steer_notifications import finish_steer_notifications

    _, runner, st, _, _ = await prepare([text_response("Corrected answer.")])
    started, release, settled = asyncio.Event(), asyncio.Event(), asyncio.Event()

    async def notify(_sequence, _outcome):
        started.set()
        await release.wait()
        settled.set()

    enqueue(runner, st, notifier=notify)
    task = asyncio.create_task(runner._run_with_guards(st))
    try:
        await reach(started)
        assert (await finish(task))[0] == "Corrected answer."
        assert not settled.is_set()
    finally:
        release.set()
        await finish_steer_notifications()
