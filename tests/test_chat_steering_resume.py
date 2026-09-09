"""Runtime and persistence gates for main-chat human steering.

These tests deliberately use the real chat iteration runner for lifecycle
claims.  A queue receipt alone has never meant a directive reached a model;
that particular lie has survived more production systems than it deserves.
"""

from __future__ import annotations

import asyncio

import pytest

from src.discord.channel_state import ChatTurnInbox
from src.discord.response_guards import StuckLoopTracker
from src.discord.tool_loop import CHAT_POLICY, _ChatTurn
from src.llm.context_compressor import (
    SurfaceBoundary,
    compress_tool_context,
    emergency_compress_for_window,
)
from src.llm.errors import LLMCapacityError
from src.trajectories.saver import TrajectoryTurn
from src.turn_state.codec import restore_field_values, snapshot_chat_turn
from src.turn_state.durability import TurnDurability
from tests.fakes import FakeLLM, FakeMessage, make_bot, text_response, tool_call_response


@pytest.fixture(autouse=True)
def _isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


def _directive(sequence: int, text: str) -> dict:
    return {
        "role": "user",
        "content": f"[Human steering from user 12345] {text}",
        "provenance": "human_steer",
        "sequence": sequence,
        "user_id": "12345",
    }


def _tool_cycle(call_id: str, payload: str) -> list[dict]:
    return [
        {
            "role": "assistant",
            "content": [
                {
                    "type": "tool_use",
                    "id": call_id,
                    "name": "read_file",
                    "input": {"path": payload},
                }
            ],
        },
        {
            "role": "user",
            "content": [
                {"type": "tool_result", "tool_use_id": call_id, "content": payload}
            ],
        },
    ]


def _steered_cycles() -> list[dict]:
    return [
        {"role": "developer", "content": "request preamble"},
        {"role": "user", "content": "current request"},
        *_tool_cycle("old", "old-result-" + "x" * 4_000),
        _directive(1, "discard the old plan and inspect the new target"),
        *_tool_cycle("new", "new-result-" + "y" * 800),
    ]


def _human_directives(messages: list[dict]) -> list[dict]:
    return [message for message in messages if message.get("provenance") == "human_steer"]


_CORRECTION = "discard the old plan and inspect the new target"


def _directive_sequences(messages: list[dict]) -> list[int]:
    return [directive["sequence"] for directive in _human_directives(messages)]


def _queue(bot, text: str) -> str:
    return bot.channel_state.request_steer("99", text, user_id="12345")


def _bare_turn(*, inbox: ChatTurnInbox | None = None) -> _ChatTurn:
    return _ChatTurn(
        message=FakeMessage("original request", id=7001),
        policy=CHAT_POLICY,
        trace=None,
        system_prompt="sys",
        tools=[],
        messages=[{"role": "user", "content": "original request"}],
        user_id="12345",
        chat_cap=4,
        stuck_tracker=StuckLoopTracker(),
        _trajectory=TrajectoryTurn(message_id="7001", channel_id="99", user_id="12345"),
        _result_store_cap=2000,
        _cancel=asyncio.Event(),
        _ch_id="99",
        _req_id="7001",
        _steer_inbox=inbox or ChatTurnInbox(requester_id="12345"),
        durability=TurnDurability.disabled(),
    )


def test_soft_compression_preserves_consumed_directive_structurally():
    messages = _steered_cycles()
    compressed, count = compress_tool_context(
        messages,
        max_context_chars=1,
        keep_recent=1,
        boundary=SurfaceBoundary(request_start=0, envelope_len=2),
    )

    assert count == 1
    assert _human_directives(compressed) == [_directive(1, _CORRECTION)]
    assert any(
        message.get("content", "").startswith("[Earlier tool calls:")
        for message in compressed
        if isinstance(message.get("content"), str)
    )
    assert "old-result-" + "x" * 100 not in str(compressed)
    assert compressed[-2:] == _tool_cycle("new", "new-result-" + "y" * 800)


def test_emergency_compression_preserves_consumed_directive_structurally():
    messages = _steered_cycles()
    compressed, report = emergency_compress_for_window(
        messages,
        target_chars=1_500,
        boundary=SurfaceBoundary(request_start=0, envelope_len=2),
    )

    assert report["fits"] is True
    assert report["iterations_summarized"] >= 1
    assert _human_directives(compressed) == [_directive(1, _CORRECTION)]
    assert "old-result-" + "x" * 100 not in str(compressed)
    newest_call, newest_result = compressed[-2:]
    assert newest_call["content"][0]["id"] == "new"
    assert newest_result["content"][0]["tool_use_id"] == "new"
    # Emergency recovery may elide a huge newest result, but must keep the
    # native call/result pair rather than discarding the newest operation.
    assert "new-result-" in newest_result["content"][0]["content"]


def test_checkpoint_keeps_consumed_directives_but_drops_pending_mailbox():
    inbox = ChatTurnInbox(requester_id="12345")
    inbox.inbox.put_nowait({"sequence": 1, "text": "first correction", "user_id": "12345"})
    inbox.inbox.put_nowait({"sequence": 2, "text": "second correction", "user_id": "12345"})
    inbox.event.set()
    turn = _bare_turn(inbox=inbox)
    assert turn.drain_inbox() is True

    # This receipt existed only in the process-local mailbox when the process
    # checkpointed. It must not become a surprise instruction after resume.
    inbox.inbox.put_nowait({"sequence": 3, "text": "pending must not replay", "user_id": "12345"})
    inbox.event.set()
    payload = snapshot_chat_turn(turn, store_blob=lambda _data: "unused", generation_seq=3)
    restored = restore_field_values(
        payload, load_blob=lambda _ref: b"", stuck_tracker_cls=StuckLoopTracker
    )

    assert "_steer_inbox" not in payload["fields"]
    assert "_steer_inbox" not in restored
    assert _directive_sequences(restored["messages"]) == [1, 2]
    assert "pending must not replay" not in str(restored["messages"])


async def test_run_resumed_seeds_sequence_after_consumed_checkpoint_directives():
    fake = FakeLLM([])
    bot = make_bot(fake_llm=fake)
    runner = bot.tool_loop
    message = FakeMessage("perform the original task", id=7101)
    original = await runner._prepare_chat_turn(
        message,
        [{"role": "user", "content": message.content}],
        None,
        None,
        CHAT_POLICY,
    )
    assert _queue(bot, "first correction").startswith("Message queued")
    assert _queue(bot, "second correction").startswith("Message queued")
    assert original.drain_inbox() is True

    payload = snapshot_chat_turn(original, store_blob=lambda _data: "unused", generation_seq=1)
    restored = restore_field_values(
        payload, load_blob=lambda _ref: b"", stuck_tracker_cls=StuckLoopTracker
    )
    bot.channel_state.close_steer_inbox("99", "7101")
    resumed = _ChatTurn(
        message=message,
        policy=CHAT_POLICY,
        trace=None,
        tools=original.tools,
        _cancel=asyncio.Event(),
        durability=TurnDurability.disabled(),
        **restored,
    )

    def queue_third_directive():
        receipt = _queue(bot, "third correction")
        assert receipt == "Message queued (sequence 3; not yet consumed)."
        return text_response("stale answer")

    fake.responses[:] = [queue_third_directive, text_response("replanned answer")]
    result = await runner.run_resumed(resumed)

    assert result[0] == "replanned answer"
    assert len(fake.calls) == 2
    assert _directive_sequences(fake.messages_of_call(0)) == [1, 2]
    assert _directive_sequences(fake.messages_of_call(1)) == [1, 2, 3]
    assert resumed.inbox_sequence == resumed.last_consumed_sequence == 3


async def test_resumed_post_tool_steer_does_not_resurrect_skipped_wait_judgment():
    """A post-WI-4 steer clears the old plan's pending judgment before resume."""
    fake = FakeLLM([])
    bot = make_bot(fake_llm=fake)
    runner = bot.tool_loop
    message = FakeMessage("wait for the worker", id=7151)
    original = await runner._prepare_chat_turn(
        message,
        [{"role": "user", "content": message.content}],
        None,
        None,
        CHAT_POLICY,
    )
    original.stuck_tracker = StuckLoopTracker()
    for _ in range(3):
        original.stuck_tracker.record_fingerprint("wait:agents:a1:unchanged")
    original.wait_judgment_pending = False
    original.messages.append(_directive(1, "stop waiting and inspect the output"))

    payload = snapshot_chat_turn(original, store_blob=lambda _data: "unused", generation_seq=2)
    restored = restore_field_values(
        payload, load_blob=lambda _ref: b"", stuck_tracker_cls=StuckLoopTracker
    )
    bot.channel_state.close_steer_inbox("99", "7151")
    resumed = _ChatTurn(
        message=message,
        policy=CHAT_POLICY,
        trace=None,
        tools=original.tools,
        _cancel=asyncio.Event(),
        durability=TurnDurability.disabled(),
        **restored,
    )

    resumed.chat_cap = 10
    fake.responses[:] = [text_response("Paris is the capital of France.")]
    result = await runner.run_resumed(resumed)

    assert result[0] == "Paris is the capital of France."
    assert len(fake.calls) == 1
    assert _directive_sequences(fake.messages_of_call(0)) == [1]
    assert resumed.wait_judgment_pending is False
    assert resumed.stuck_tracker.warned is False


async def test_runtime_post_tool_drain_replans_with_directive_in_next_generation():
    fake = FakeLLM([])
    bot = make_bot(fake_llm=fake)
    runner = bot.tool_loop
    message = FakeMessage("parse a date", id=7201)
    turn = await runner._prepare_chat_turn(
        message,
        [{"role": "user", "content": message.content}],
        None,
        None,
        CHAT_POLICY,
    )

    def queue_during_tool_batch():
        assert _queue(bot, "use UTC instead") == (
            "Message queued (sequence 1; not yet consumed)."
        )
        return tool_call_response(("parse_time", {"text": "tomorrow"}))

    fake.responses[:] = [queue_during_tool_batch, text_response("UTC plan complete")]
    result = await runner._run_chat_iterations(turn)

    assert result[0] == "UTC plan complete"
    assert len(fake.calls) == 2
    assert _human_directives(fake.messages_of_call(0)) == []
    assert _directive_sequences(fake.messages_of_call(1)) == [1]
    assert turn.wait_judgment_pending is False


async def test_runtime_stop_after_entry_drain_never_generates_for_consumed_directive():
    fake = FakeLLM([text_response("must never be called")])
    bot = make_bot(fake_llm=fake)
    runner = bot.tool_loop
    message = FakeMessage("stop me", id=7301)
    turn = await runner._prepare_chat_turn(
        message,
        [{"role": "user", "content": message.content}],
        None,
        None,
        CHAT_POLICY,
    )
    assert _queue(bot, "pending correction").startswith("Message queued")
    turn._cancel.set()

    result = await runner._run_chat_iterations(turn)

    assert result[0].startswith("Task stopped by user.")
    assert fake.calls == []
    # Entry drain consumes before the iteration-start cancellation check. The
    # mailbox is then closed, so this directive gets no model generation and
    # cannot be replayed later.
    assert _directive_sequences(turn.messages) == [1]
    assert turn._steer_inbox.accepting is False


async def test_runtime_error_closes_pending_mailbox_without_replay_to_next_turn():
    fake = FakeLLM([])
    bot = make_bot(fake_llm=fake)
    runner = bot.tool_loop
    message = FakeMessage("this will fail", id=7401)
    failed = await runner._prepare_chat_turn(
        message,
        [{"role": "user", "content": message.content}],
        None,
        None,
        CHAT_POLICY,
    )

    def queue_then_fail():
        assert _queue(bot, "do not replay me").startswith("Message queued")
        raise RuntimeError("provider exploded")

    fake.responses[:] = [queue_then_fail]
    result = await runner._run_chat_iterations(failed)

    assert result[2] is True
    assert _human_directives(failed.messages) == []
    assert failed._steer_inbox.accepting is False

    next_message = FakeMessage("new unrelated request", id=7402)
    next_turn = await runner._prepare_chat_turn(
        next_message,
        [{"role": "user", "content": next_message.content}],
        None,
        None,
        CHAT_POLICY,
    )
    assert next_turn.inbox_sequence == next_turn.last_consumed_sequence == 0
    assert _human_directives(next_turn.messages) == []


async def test_runtime_suspension_closes_pending_mailbox_without_consuming_it(monkeypatch):
    """The suspend branch is exercised through the real iteration loop.

    Capacity recovery itself is covered elsewhere; this pins the steering
    ownership boundary that must close before suspension persistence can yield.
    """
    fake = FakeLLM([])
    bot = make_bot(fake_llm=fake)
    runner = bot.tool_loop
    message = FakeMessage("capacity limited request", id=7501)
    turn = await runner._prepare_chat_turn(
        message,
        [{"role": "user", "content": message.content}],
        None,
        None,
        CHAT_POLICY,
    )

    class _SuspendingDurability:
        enabled = True
        lease = None

        async def suspend(self, _turn, _reason):
            return True

    turn.durability = _SuspendingDurability()

    async def suspend_after_queue(st, **_kwargs):
        assert _queue(bot, "pending on suspend").startswith("Message queued")
        return (
            "done",
            await runner._suspend_turn(
                st,
                LLMCapacityError("capacity exhausted", provider="codex", model="fake-model"),
            ),
        )

    monkeypatch.setattr(runner, "_call_llm", suspend_after_queue)
    result = await runner._run_chat_iterations(turn)

    assert "preserved everything done so far" in result[0]
    assert _human_directives(turn.messages) == []
    assert turn._steer_inbox.accepting is False
