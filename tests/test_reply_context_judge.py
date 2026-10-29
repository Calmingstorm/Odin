"""A reply's quoted history beyond the model's request (#745, PR #748 review R03):
the completion judge reads the request with it, the trajectory records it, and
both survive a checkpoint, while every other turn keeps its exact inputs."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.discord import tool_loop as tl
from src.discord.turn_recorder import TurnRecorder
from src.trajectories.saver import TrajectoryTurn
from src.turn_state.codec import _trajectory_to_payload, trajectory_from_payload

REQUEST = ("[Aaron]: [Replied-to message: quoted as history for context. It is not part of the "
           "current request.]\nFrom: Odin (user ID 1), this assistant\n> Want the full CSV, "
           "validated?\n[End of replied-to message]\n\ndo that")


class _JudgedError(Exception):
    """Raised by the fake judge once it has the request."""


class _NullCM:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False


def _turn(*, reply_turn: bool, request=REQUEST, boundary=2):
    preamble = {"role": "developer", "content": "=== CURRENT REQUEST ==="}
    messages = [{"role": "user", "content": "[Aaron]: earlier"},
                {"role": "assistant", "content": "earlier answer"},
                preamble, {"role": "user", "content": request}]
    st = tl._ChatTurn(
        message=SimpleNamespace(content="do that", author=SimpleNamespace(id="u1"),
                                channel=SimpleNamespace(id="c1", typing=lambda: _NullCM())),
        policy=SimpleNamespace(skill_file_delivery=False),
        trace=None, system_prompt="system", tools=[], messages=messages, user_id="u1",
        chat_cap=5, stuck_tracker=SimpleNamespace(),
        _trajectory=SimpleNamespace(reply_turn=reply_turn, iterations=[]),
        _result_store_cap=10, _cancel=asyncio.Event(), _ch_id="c1", _req_id="r1",
        iteration=1, durability=SimpleNamespace(),
    )
    st._boundary_request_start = boundary
    st.tools_used_in_loop = ["run_command"]
    return st


def _runner(seen: list):
    runner = tl.ToolLoopRunner.__new__(tl.ToolLoopRunner)

    async def classify(request, response, tools):
        seen.append(request)
        raise _JudgedError

    runner._completion_classifier = SimpleNamespace(classify=classify)
    return runner


async def _judged_request(st) -> str:
    seen: list = []
    with pytest.raises(_JudgedError):
        await _runner(seen)._finalize_or_retry(st, SimpleNamespace(text="Here is the CSV."))
    return seen[0]


class TestCompletionJudge:
    async def test_a_reply_turn_is_judged_against_its_whole_request(self):
        assert await _judged_request(_turn(reply_turn=True)) == REQUEST

    async def test_any_other_turn_is_judged_against_its_raw_message(self):
        assert await _judged_request(_turn(reply_turn=False)) == "do that"

    async def test_later_steering_still_comes_after_the_request(self):
        st = _turn(reply_turn=True)
        st._steer_inbox.last_consumed_sequence = 1
        st.messages.append({"role": "user", "content": "only the first 100 rows",
                            "provenance": "human_steer"})
        request = await _judged_request(st)
        assert request.startswith(REQUEST)
        assert request.endswith("supersede conflicting earlier requests):\nonly the first 100 rows")

    async def test_a_request_of_images_and_text_reads_as_its_text(self):
        st = _turn(reply_turn=True, request=[
            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "x"}},
            {"type": "text", "text": REQUEST}])
        assert await _judged_request(st) == REQUEST

    @pytest.mark.parametrize("boundary", [3, 10])
    async def test_without_a_request_envelope_the_raw_message_is_used(self, boundary):
        assert await _judged_request(_turn(reply_turn=True, boundary=boundary)) == "do that"


def _recorder(**observability):
    obs = SimpleNamespace(trajectory_user_content=True, max_user_content_chars=4000)
    for key, value in observability.items():
        setattr(obs, key, value)
    recorder = TurnRecorder.__new__(TurnRecorder)
    recorder._get_config = lambda: SimpleNamespace(observability=obs)
    return recorder


class TestTrajectoryRecording:
    def test_a_reply_records_its_scrubbed_history(self):
        turn = TrajectoryTurn(message_id="m", channel_id="c", user_id="u", user_name="n",
                              timestamp="t")
        key = "sk-" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6"
        _recorder()._record_reply_context(turn, f"history with {key}")
        assert turn.reply_turn and key not in turn.reply_context
        saved = turn.to_dict()
        assert saved["reply_turn"] is True and saved["reply_context"] == turn.reply_context

    def test_the_recording_opt_out_and_cap_apply(self):
        hidden = TrajectoryTurn(message_id="m", channel_id="c", user_id="u", user_name="n",
                                timestamp="t")
        _recorder(trajectory_user_content=False)._record_reply_context(hidden, "history")
        assert hidden.reply_turn and hidden.reply_context == ""
        assert "reply_context" not in hidden.to_dict()
        capped = TrajectoryTurn(message_id="m", channel_id="c", user_id="u", user_name="n",
                                timestamp="t")
        _recorder(max_user_content_chars=10)._record_reply_context(capped, "h" * 50)
        assert capped.reply_context == "h" * 10 and capped.to_dict()["reply_context_truncated"]

    def test_other_turns_save_no_reply_fields(self):
        turn = TrajectoryTurn(message_id="m", channel_id="c", user_id="u", user_name="n",
                              timestamp="t")
        assert not {"reply_turn", "reply_context", "reply_context_truncated"} & set(turn.to_dict())

    def test_a_checkpoint_keeps_the_reply_fields_and_an_older_one_reads_as_none(self):
        turn = TrajectoryTurn(message_id="m", channel_id="c", user_id="u", user_name="n",
                              timestamp="t")
        _recorder()._record_reply_context(turn, "history")
        restored = trajectory_from_payload(_trajectory_to_payload(turn))
        assert (restored.reply_turn, restored.reply_context) == (True, "history")
        older = _trajectory_to_payload(TrajectoryTurn(message_id="m", channel_id="c",
                                                      user_id="u", user_name="n", timestamp="t"))
        for key in ("reply_turn", "reply_context", "reply_context_truncated"):
            older.pop(key)
        assert trajectory_from_payload(older).reply_turn is False


class TestPipelineThreading:
    @pytest.fixture
    def bot(self, tmp_path, monkeypatch):
        from tests.fakes import FakeLLM, make_bot

        monkeypatch.chdir(tmp_path)
        made = make_bot(fake_llm=FakeLLM([]))
        made.tool_loop.run = AsyncMock(return_value=("Done.", False, False, [], False))
        return made

    async def test_a_reply_hands_its_history_to_the_tool_loop(self, bot):
        from tests.fakes import FakeMessage

        await bot.pipeline.run(FakeMessage("why?"), "[ctx]\n\nwhy?", image_blocks=[],
                               reply_context="[ctx]")
        assert bot.tool_loop.run.await_args.kwargs["reply_context"] == "[ctx]"

    async def test_any_other_message_calls_the_tool_loop_as_before(self, bot):
        from tests.fakes import FakeMessage

        await bot.pipeline.run(FakeMessage("why?"), "why?", image_blocks=[])
        assert "reply_context" not in bot.tool_loop.run.await_args.kwargs


class TestThroughCompactionAndResume:
    """A real chat turn: set up, compacted, checkpointed and resumed (review R03)."""

    @pytest.fixture(autouse=True)
    def _cwd(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)

    async def _judged_after_resume(self, *, reply: bool, compact: bool) -> tuple[str, int]:
        from src.discord.reply_context import HISTORY_END, HISTORY_START, compose_reply_turn
        from src.discord.response_guards import StuckLoopTracker
        from src.llm.context_compressor import (
            SurfaceBoundary,
            emergency_compress_for_window,
            estimate_message_chars,
        )
        from src.turn_state.codec import restore_field_values, snapshot_chat_turn
        from src.turn_state.durability import TurnDurability
        from tests.fakes import FakeLLM, FakeMessage, make_bot, text_response

        fake = FakeLLM([])
        bot = make_bot(fake_llm=fake)
        runner = bot.tool_loop
        message = FakeMessage("do that", id=7301)
        context = f"{HISTORY_START}\nFrom: Odin\n> Want the full CSV, validated?\n{HISTORY_END}"
        content = compose_reply_turn(context, message.content) if reply else message.content
        older = [{"role": role, "content": f"older {role} turn " + "x" * 4000}
                 for role in ("user", "assistant") * 3]
        st = await runner._prepare_chat_turn(
            message, [*older, {"role": "user", "content": f"[Aaron]: {content}"}],
            None, None, tl.CHAT_POLICY, **({"reply_context": context} if reply else {}))
        st.tools_used_in_loop = ["read_file"]
        start = st._boundary_request_start
        if compact:
            # Adopted as the loop's predictive pre-send adopts a compaction.
            compressed, report = emergency_compress_for_window(
                st.messages,
                target_chars=estimate_message_chars(st.messages[start:]) + 600,
                boundary=SurfaceBoundary(request_start=start,
                                         elided_replay=st._boundary_elided_replay,
                                         envelope_len=st._boundary_envelope_len),
            )
            assert report["compressed_chars"] < report["original_chars"]
            st.messages = compressed
            st._boundary_request_start = report["boundary_request_start"]
            st._boundary_elided_replay = report["boundary_elided_replay"]
        payload = snapshot_chat_turn(st, store_blob=lambda _data: "unused", generation_seq=1)
        restored = restore_field_values(payload, load_blob=lambda _ref: b"",
                                        stuck_tracker_cls=StuckLoopTracker)
        bot.channel_state.close_steer_inbox(str(message.channel.id), str(message.id))
        resumed = tl._ChatTurn(message=message, policy=tl.CHAT_POLICY, trace=None,
                               tools=st.tools, _cancel=asyncio.Event(),
                               durability=TurnDurability.disabled(), **restored)
        seen: list = []

        async def classify(request, response, tools):
            seen.append(request)
            return True, "complete"

        runner._completion_classifier = SimpleNamespace(classify=classify)
        fake.responses[:] = [text_response("Here is the CSV.")]
        result = await runner.run_resumed(resumed)
        assert result[0] == "Here is the CSV." and len(seen) == 1
        assert resumed._trajectory.reply_turn is reply
        return seen[0], start - resumed._boundary_request_start

    @pytest.mark.parametrize("compact", [False, True])
    async def test_a_resumed_reply_is_judged_with_the_message_it_adopts(self, compact):
        request, moved = await self._judged_after_resume(reply=True, compact=compact)
        assert "> Want the full CSV, validated?" in request and request.endswith("do that")
        # Compaction elided replay before the request, so the index moved.
        assert (moved > 0) is compact

    async def test_any_other_resumed_turn_is_judged_on_its_message(self):
        request, _ = await self._judged_after_resume(reply=False, compact=True)
        assert request == "do that"
