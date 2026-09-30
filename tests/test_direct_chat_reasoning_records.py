"""Real direct-chat wire → guest intake → durable JSONL and usage accounting."""
import sqlite3
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.discord.intake_pipeline import MessagePipeline
from src.discord.llm_gateway import LLMGateway
from src.discord.turn_recorder import TurnRecorder
from src.llm.types import ChatText
from src.trajectories.saver import TrajectorySaver, TrajectoryTurn
from tests.test_provider_reasoning_usage import accepted_events, client_for, endpoint
from tests.test_usage_rollup import drain, make_rollup


def pipeline_for(recorder, gateway, *, guest=True):
    sessions = Mock()
    sessions.get_history_with_compaction = AsyncMock(
        return_value=[{"role": "user", "content": "Hello"}],
    )
    sessions.get_history.return_value = [{"role": "user", "content": "Hello"}]
    delivery = SimpleNamespace(set_status=AsyncMock(), send_chunked=AsyncMock())
    tools = Mock(run=AsyncMock())
    pipeline = MessagePipeline(SimpleNamespace(
        channel_state=SimpleNamespace(pending_files={}, last_op_details={}),
        sessions=sessions, permissions=SimpleNamespace(is_guest=lambda _id: guest),
        llm_gateway=gateway, prompt_builder=Mock(), turn_recorder=recorder,
        tool_loop=tools, delivery=delivery, housekeeping=Mock(), turn_resume=None,
    ))
    pipeline._prompt_builder.build_chat_prompt.return_value = "Follow the rules"
    pipeline._prompt_builder.build_full_prompt.return_value = "Follow the rules"
    sessions.get_task_history = AsyncMock(return_value=[])
    return pipeline, delivery, tools


def recorder_for(saver):
    return TurnRecorder(
        get_config=lambda: SimpleNamespace(observability=None), trajectory_saver=saver,
        reflector=None, outbound_webhook_dispatcher=None, loop_reflection_gate=None,
    )


def message():
    return SimpleNamespace(
        id=99, author=SimpleNamespace(id=5, display_name="Guest", name="Guest"),
        channel=SimpleNamespace(id=42),
    )


@pytest.mark.parametrize("provider,terminal", [
    ("codex", "completed"), ("codex", "incomplete"), ("compatible", "completed"),
])
@pytest.mark.parametrize("value,expected", [(None, None), (0, 0), (37, 37), (True, None)])
async def test_guest_actual_wire_persists_nullable_reasoning(
    tmp_path, monkeypatch, provider, terminal, value, expected,
):
    rollup = make_rollup(tmp_path)
    saver = TrajectorySaver(str(tmp_path / "trajectories"), usage_observer=rollup)
    if provider == "codex":
        usage = {"input_tokens": 101, "output_tokens": 80,
                 "output_tokens_details": {"reasoning_tokens": value}}
    else:
        usage = {"prompt_tokens": 101, "completion_tokens": 80,
                 "completion_tokens_details": {"reasoning_tokens": value}}
    try:
        async with endpoint(accepted_events(provider, usage, terminal)) as (url, requests):
            client = client_for(provider, url, monkeypatch)
            # The real gateway forwards the ChatText without coercing to str.
            gateway = LLMGateway.__new__(LLMGateway)
            gateway.capture_serving_identity = lambda: SimpleNamespace(
                client=client, model="fixture",
            )
            monkeypatch.setattr(LLMGateway, "active_client", property(lambda _self: client))
            pipeline, delivery, tools = pipeline_for(recorder_for(saver), gateway)
            try:
                await pipeline._run_inner(message(), "Hello", "42")
            finally:
                await client.close()
        assert len(requests) == 1
        tools.run.assert_not_awaited()
        delivery.send_chunked.assert_awaited_once()
        delivered = delivery.send_chunked.await_args.args[1]
        assert "accepted" in delivered
        persisted = await saver.find_by_message_id("99")
        assert persisted["is_error"] == (terminal == "incomplete")
        assert len(persisted["iterations"]) == 1
        row = persisted["iterations"][0]
        assert row["reasoning_tokens"] == expected
        assert row["model"] == "fixture"
        assert row["duration_ms"] >= 0
        if terminal == "completed":
            assert row["server_output_tokens"] == row["output_tokens"] == 80
            assert row["server_input_tokens"] == row["input_tokens"] == 101
        else:
            assert row["server_output_tokens"] is None
        await drain(rollup)
        with sqlite3.connect(tmp_path / "usage" / "usage.sqlite3") as conn:
            assert conn.execute("SELECT reasoning_tokens FROM generation_facts").fetchall() == [
                (expected,),
            ]
    finally:
        await drain(rollup)


async def test_guest_transport_failure_does_not_fabricate_generation(tmp_path):
    saver = TrajectorySaver(str(tmp_path))
    gateway = SimpleNamespace(
        active_client=object(), chat=AsyncMock(side_effect=RuntimeError("down")),
    )
    pipeline, delivery, _tools = pipeline_for(recorder_for(saver), gateway)
    await pipeline._run_inner(message(), "Hello", "42")
    assert await saver.find_by_message_id("99") is None
    assert "unavailable" in delivery.send_chunked.await_args.args[1]


async def test_legacy_plain_chat_string_stores_unknown_reasoning(tmp_path):
    saver = TrajectorySaver(str(tmp_path))
    gateway = SimpleNamespace(active_client=object(), chat=AsyncMock(return_value="hello"))
    pipeline, _delivery, _tools = pipeline_for(recorder_for(saver), gateway)
    await pipeline._run_inner(message(), "Hello", "42")
    persisted = await saver.find_by_message_id("99")
    assert persisted["iterations"][0]["reasoning_tokens"] is None


async def test_guest_empty_reply_retains_reasoning_before_fallback(tmp_path):
    saver = TrajectorySaver(str(tmp_path))
    reply = ChatText("", model="fixture", input_tokens=0, output_tokens=0, reasoning_tokens=9)
    gateway = SimpleNamespace(active_client=object(), chat=AsyncMock(return_value=reply))
    pipeline, delivery, _tools = pipeline_for(recorder_for(saver), gateway)
    await pipeline._run_inner(message(), "Hello", "42")
    persisted = await saver.find_by_message_id("99")
    assert persisted["iterations"][0]["reasoning_tokens"] == 9
    assert persisted["iterations"][0]["llm_text"] == ""
    assert delivery.send_chunked.await_args.args[1]


async def test_direct_recording_scrubs_text_and_is_nonfatal(tmp_path, monkeypatch):
    saver = TrajectorySaver(str(tmp_path))
    reply = ChatText("sensitive text", model="fixture", input_tokens=0, output_tokens=0,
                     reasoning_tokens=9)
    gateway = SimpleNamespace(active_client=object(), chat=AsyncMock(return_value=reply))
    recorder = recorder_for(saver)
    pipeline, delivery, _tools = pipeline_for(recorder, gateway)
    monkeypatch.setattr("src.discord.turn_recorder.scrub_output_secrets", lambda _text: "scrubbed")
    await pipeline._run_inner(message(), "Hello", "42")
    persisted = await saver.find_by_message_id("99")
    assert persisted["iterations"][0]["llm_text"] == "scrubbed"
    assert persisted["iterations"][0]["reasoning_tokens"] == 9
    saver.save = AsyncMock(side_effect=RuntimeError("disk unavailable"))
    await pipeline._run_inner(message(), "Hello", "42")
    assert delivery.send_chunked.await_count == 2
    recorder._trajectory_saver = None
    await pipeline._run_inner(message(), "Hello", "42")
    assert delivery.send_chunked.await_count == 3


async def test_disabled_recorder_does_not_finalize_or_mutate_ephemeral_turn():
    recorder = recorder_for(None)
    turn = TrajectoryTurn(final_response="original", tools_used=["original"])
    original = turn.to_dict()
    trace = Mock()
    await recorder._save_turn_trajectory(
        turn, final_response="replacement", error="failure", tools_used=["replacement"],
        trace=trace,
    )
    trace.finalize.assert_not_called()
    assert turn.to_dict() == original


async def test_unreadable_direct_response_metadata_is_nonfatal_and_next_chat_records(tmp_path):
    class BrokenMetadata(str):
        @property
        def server_input_tokens(self):
            raise ValueError("unavailable response metadata")

    saver = TrajectorySaver(str(tmp_path))
    gateway = SimpleNamespace(
        active_client=object(), chat=AsyncMock(side_effect=[BrokenMetadata("hello"), "next"]),
    )
    pipeline, delivery, _tools = pipeline_for(recorder_for(saver), gateway)
    await pipeline._run_inner(message(), "Hello", "42")
    assert delivery.send_chunked.await_args.args[1] == "hello"
    assert await saver.find_by_message_id("99") is None

    await pipeline._run_inner(message(), "Hello again", "42")
    persisted = await saver.find_by_message_id("99")
    assert persisted["iterations"][0]["llm_text"] == "next"
    assert delivery.send_chunked.await_count == 2


async def test_handoff_keeps_original_generations_and_records_direct_reply(tmp_path):
    rollup = make_rollup(tmp_path)
    saver = TrajectorySaver(str(tmp_path / "trajectories"), usage_observer=rollup)
    recorder = recorder_for(saver)
    reply = ChatText("chat reply", model="fixture", input_tokens=10, output_tokens=20,
                     reasoning_tokens=7, server_output_tokens=20)
    gateway = SimpleNamespace(active_client=object(), chat=AsyncMock(return_value=reply))
    pipeline, delivery, tools = pipeline_for(recorder, gateway, guest=False)

    async def tool_run(*args, **kwargs):
        turn = TrajectoryTurn(message_id="99", channel_id="42")
        turn.add_iteration(iteration=1, reasoning_tokens=3)
        await recorder._save_turn_trajectory(turn, final_response="skill result")
        return "skill result", False, False, [], True

    tools.run.side_effect = tool_run
    try:
        await pipeline._run_inner(message(), "Hello", "42")
        assert (await saver.find_by_message_id("99"))["iterations"][0]["reasoning_tokens"] == 3
        handoff = await saver.find_by_message_id("99:handoff")
        assert handoff["iterations"][0]["reasoning_tokens"] == 7
        assert delivery.send_chunked.await_args.args[1] == "chat reply"
        await drain(rollup)
        with sqlite3.connect(tmp_path / "usage" / "usage.sqlite3") as conn:
            total = conn.execute("SELECT SUM(reasoning_tokens) FROM generation_facts").fetchone()
            assert total == (10,)
    finally:
        await drain(rollup)
