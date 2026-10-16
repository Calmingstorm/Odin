"""Spawned agents see native image results (analyze_image) as real images.

Aaron, 2026-10-15: agents handle images natively, as Odin's main turn does. A
native marker takes the typed path MCP media already uses; nothing becomes tool
text, trajectory or audit content. The guards he approved: a malformed marker
is a bounded, pixel-free error before any text delivery; the repetition
fingerprint includes the pixels; images are dropped, oldest seen first, only
when the next request would otherwise fail.
"""
from __future__ import annotations

import asyncio
import base64
import copy
import json
import tracemalloc
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

import src.llm.context_compressor as cc
from src.agents import image_retention
from src.agents.manager import (
    AgentInfo,
    AgentManager,
    AgentState,
    _call_llm_with_recovery,
    _run_agent,
)
from src.audit.tool_context import _pending_observers, agent_tool_context
from src.discord.tool_loop import _LoopMessageProxy
from src.llm.context_budget import resolve_context_budget
from src.llm.context_compressor import emergency_compress_for_window, estimate_message_images
from src.llm.openai_codex import CodexChatClient
from src.llm.strict_tool_adapter import compile_catalog
from src.llm.tool_replay import CodexReplay, ReplayDict
from src.tools.execution_outcome import ToolFailure
from src.tools.media_result import (
    MediaRejection,
    append_image_messages,
    media_safe_text,
    tool_image_content,
)
from src.tools.registry import TOOLS
from src.tools.result_validator import ToolResult
from tests.fakes import FakeLLM, make_bot, text_response, tool_call_response
from tests.test_agent_context_overflow import _overflow_error
from tests.test_agent_image_safety import _wire
from tests.test_agent_transcript_contract import agent as bare_agent
from tests.test_mcp_media_surfaces_checkpoint import assert_grouping, image
from tests.test_native_agents_tasks import _cfg, _fake_gateway, _message, _tools

PIXELS = ("NATIVE_PIXELS_A", "NATIVE_PIXELS_B", "NATIVE_PIXELS_C")
PROMPT = "Which shape is inside the other?"
EFFECTS = SimpleNamespace(rebuild_system_prompt=False)
DONE = {"text": "done", "tool_calls": [], "stop_reason": "end_turn"}


@pytest.fixture(autouse=True)
def isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


def marker(data: str, prompt: str = PROMPT) -> dict:
    return {"__image_block__": image(data), "__prompt__": prompt}


def _capturing(fake) -> list:
    requests = []
    original = fake.chat_with_tools

    async def chat_with_tools(**kwargs):
        requests.append(copy.deepcopy(kwargs["messages"]))
        return await original(**kwargs)

    fake.chat_with_tools = chat_with_tools
    return requests


def _native_bot(fake, *results):
    bot = make_bot(fake_llm=fake)
    bot.native_tools.handles = lambda name: name == "analyze_image"
    bot.native_tools.dispatch = AsyncMock(side_effect=[(result, EFFECTS) for result in results])
    return bot


async def _spawned(bot, fake):
    agents = AgentManager()
    saver = SimpleNamespace(save=AsyncMock())
    cfg = _cfg()
    cfg.agents.max_iterations = 2
    tools = _tools(get_config=lambda: cfg, llm_gateway=_fake_gateway(fake),
                   agent_manager=agents, agent_trajectory_saver=saver, tool_loop=bot.tool_loop)
    spawned = await tools._handle_spawn_agent(_message(), {"label": "vision", "goal": "inspect"})
    assert "spawned" in spawned
    agent_id = next(iter(agents._agents))
    return agents, agent_id, agents._agents[agent_id], saver


async def _finish(agents, agent_id, agent):
    try:
        await asyncio.wait_for(agent._task, timeout=5)
    finally:
        if not agent._task.done():
            agent._task.cancel()
            await asyncio.gather(agent._task, return_exceptions=True)


async def _settled_audit(bot) -> str:
    if _pending_observers:
        await asyncio.gather(*list(_pending_observers), return_exceptions=True)
    return json.dumps(await bot.audit.search(), default=str)


def _records(messages: list[dict]) -> list[dict]:
    return [b for m in messages if isinstance(m.get("content"), list)
            for b in m["content"] if b.get("type") == "tool_result"]


def _sent(messages: list[dict]) -> dict:
    """{call id: (pixels, notes)} for each labelled tool-image group."""
    groups = {}
    for message in messages:
        content = message.get("content")
        if message.get("role") != "user" or not isinstance(content, list) or not content:
            continue
        label = content[0]
        if label.get("type") != "text" or "image(s) from tool" not in label.get("text", ""):
            continue
        call = label["text"].split(", call ", 1)[1].split(",", 1)[0]
        groups[call] = (
            [b["source"]["data"] for b in content[1:] if b.get("type") == "image"],
            [b["text"] for b in content[1:] if b.get("type") == "text"],
        )
    return groups


class TestSpawnedAgentSurface:
    async def test_analyze_image_reaches_the_next_generation_as_a_native_image(self):
        fake = FakeLLM([tool_call_response(("analyze_image", {"host": "localhost",
                                                              "path": "/tmp/fixture.png"})),
                        text_response("agent done")])
        # Real generation planning with hermetic provider I/O.
        fake.provider_name = "ollama"
        fake.model = "test"
        requests = _capturing(fake)
        bot = _native_bot(fake, marker(PIXELS[0]))
        agents, agent_id, agent, saver = await _spawned(bot, fake)
        try:
            await _finish(agents, agent_id, agent)
            assert agent.status == "completed", agent.result
            assert len(requests) == 2
            continuation = requests[1]
            assert_grouping(continuation, {"call-1": [PIXELS[0]]})
            (record,) = _records(continuation)
            assert record["status"] == "succeeded"
            assert record["content"] == (
                f"[Image loaded. Analyze it with this instruction: {PROMPT}]")
            for provider in ("codex", "compatible", "ollama"):
                outputs, images = _wire(provider, continuation)
                assert images == [PIXELS[0]]
                assert all(PIXELS[0] not in output for output in outputs)
            stored = json.dumps({
                "trajectory": saver.save.call_args.args[0].to_dict(),
                "results": agents.get_results(agent_id),
                "serialized": AgentManager._serialize_result(agent),
            }, default=str)
            audit = await _settled_audit(bot)
            assert "analyze_image" in stored and "analyze_image" in audit
            assert PIXELS[0] not in stored and PIXELS[0] not in audit
        finally:
            agents._remove_agent(agent_id, source="test")

    async def test_several_image_calls_keep_order_labels_and_pairing(self):
        plural = {"__image_blocks__": [image(PIXELS[1]), image(PIXELS[2])],
                  "__text__": "two panels"}
        fake = FakeLLM([
            tool_call_response(("analyze_image", {"url": "https://example.test/a.png"}),
                               ("analyze_image", {"url": "https://example.test/b.png"}),
                               ("analyze_image", {"url": "https://example.test/missing.png"})),
            text_response("compared"),
        ])
        fake.provider_name = "ollama"
        fake.model = "test"
        requests = _capturing(fake)
        bot = _native_bot(fake, marker(PIXELS[0]), plural,
                          ToolFailure("Failed to fetch image from URL (HTTP 404)"))
        agents, agent_id, agent, _saver = await _spawned(bot, fake)
        try:
            await _finish(agents, agent_id, agent)
            assert agent.status == "completed", agent.result
            continuation = requests[1]
            assert_grouping(continuation, {"call-1": [PIXELS[0]], "call-2": list(PIXELS[1:])})
            records = _records(continuation)
            assert [r["tool_use_id"] for r in records] == ["call-1", "call-2", "call-3"]
            assert [r["status"] for r in records] == ["succeeded", "succeeded", "failed"]
            assert records[1]["content"] == "two panels"
            assert "HTTP 404" in records[2]["content"]
            assert all(pixel not in json.dumps(records) for pixel in PIXELS)
        finally:
            agents._remove_agent(agent_id, source="test")


class TestMarkerBoundaries:
    async def test_malformed_marker_is_refused_before_text_delivery_and_audit(self):
        bot = _native_bot(FakeLLM([]), {"__image_blocks__": "MALFORMED_PIXELS" * 100})
        proxy = _LoopMessageProxy(SimpleNamespace(id="room"), "owner", "Owner")
        owner = bare_agent()
        call = {"id": "bad-1", "name": "analyze_image", "input": {}}
        with agent_tool_context(owner, call):
            result = await bot.tool_loop.dispatch_loop_tool("analyze_image", {}, proxy, "owner")
        assert isinstance(result, ToolResult) and not result.ok
        assert result.error == "malformed_image_result" and "MALFORMED" not in result.output
        audit = await _settled_audit(bot)
        assert "analyze_image" in audit and "MALFORMED_PIXELS" not in audit

    def test_text_only_rendering_never_carries_pixels(self):
        malformed = {"__image_blocks__": "RENDER_PIXELS" * 10}
        assert media_safe_text(malformed) == MediaRejection("malformed image result").message()
        valid = marker("RENDER_PIXELS")
        assert media_safe_text(valid) == (
            f"[Image loaded. Analyze it with this instruction: {PROMPT}]\n"
            "[1 image(s) omitted from text output.]")
        assert media_safe_text({"ordinary": 1}) == "{'ordinary': 1}"

    async def test_autonomous_loop_native_marker_behavior_is_unchanged(self):
        fake = FakeLLM([tool_call_response(("analyze_image", {"url": "https://example.test/a"})),
                        text_response("loop done")])
        bot = _native_bot(fake, marker(PIXELS[0]))
        bot.turn_recorder._maybe_loop_reflect = lambda **kwargs: None
        answer = await bot.tool_loop.run_autonomous(
            "inspect", SimpleNamespace(id="room"), None, "owner")
        assert answer == "loop done"
        assert_grouping(fake.messages_of_call(1), {"call-1": [PIXELS[0]]})
        assert PIXELS[0] not in await _settled_audit(bot)


def _looks(pixels):
    return ToolResult(f"[Image loaded. Analyze it with this instruction: {PROMPT}]",
                      image_blocks=(image(pixels),))


class TestRepetitionSeesPixels:
    async def test_identical_pixels_still_nudge_then_stop(self):
        a = bare_agent()

        async def cb(*args, **kwargs):
            return {"tool_calls": [{"id": str(a.iteration_count), "name": "analyze_image",
                                    "input": {"path": "/tmp/render.png"}}]}

        execute = AsyncMock(return_value=_looks("SAME_FRAME"))
        await _run_agent(a, "", [], cb, execute, max_iterations=10)
        assert a.state == AgentState.FAILED and a.iteration_count == 4
        assert "after one warning" in a.result and "SAME_FRAME" not in a.result

    async def test_changed_pixels_with_identical_text_are_progress(self):
        a = bare_agent()
        frames = iter(f"FRAME_{i}" for i in range(20))

        async def cb(*args, **kwargs):
            if a.iteration_count >= 6:
                return {"text": "render converged"}
            return {"tool_calls": [{"id": str(a.iteration_count), "name": "analyze_image",
                                    "input": {"path": "/tmp/render.png"}}]}

        execute = AsyncMock(side_effect=lambda *args, **kwargs: _looks(next(frames)))
        await _run_agent(a, "", [], cb, execute, max_iterations=10)
        assert a.state == AgentState.COMPLETED and a.result == "render converged"
        assert not any(m.get("provenance") == "agent_guard" for m in a.messages)
        assert execute.await_count == 5

    async def test_parent_correction_between_image_calls_sends_no_image_for_the_skipped_call(self):
        a = bare_agent()
        responses = [{"tool_calls": [{"id": "c1", "name": "analyze_image", "input": {}},
                                     {"id": "c2", "name": "analyze_image", "input": {}}]},
                     {"text": "using the other file"}]
        requests = []

        async def cb(messages, *args, **kwargs):
            requests.append(copy.deepcopy(messages))
            return responses.pop(0)

        async def execute(name, arguments):
            a._inbox.put_nowait({"sequence": 1, "text": "use the other file"})
            return _looks("FIRST_ONLY")

        await _run_agent(a, "", [], cb, execute, max_iterations=3)
        assert a.result == "using the other file"
        assert _sent(requests[1]) == {"c1": (["FIRST_ONLY"], [])}
        assert [r["status"] for r in _records(requests[1])] == ["succeeded", "not_executed"]


    async def test_a_timed_out_call_sends_no_image(self):
        a = bare_agent()
        responses = [{"tool_calls": [{"id": "c1", "name": "analyze_image", "input": {}},
                                     {"id": "c2", "name": "slow_image", "input": {}}]},
                     {"text": "saw one"}]
        requests = []

        async def cb(messages, *args, **kwargs):
            requests.append(copy.deepcopy(messages))
            return responses.pop(0)

        async def execute(name, arguments):
            if name == "slow_image":
                await asyncio.sleep(5)
            return _looks(f"{name}_PIXELS")

        await _run_agent(a, "", [], cb, execute, max_iterations=3,
                         tool_timeouts={"slow_image": 0.05})
        assert a.result == "saw one"
        assert _sent(requests[1]) == {"c1": (["analyze_image_PIXELS"], [])}
        assert [r["status"] for r in _records(requests[1])] == ["succeeded", "timed_out"]

def _cycle(index: int, *pixels: str, result_size: int = 0) -> list[dict]:
    call = f"c{index}"
    group: list[dict] = []
    append_image_messages(group, tool_image_content(
        [image(p) for p in pixels], "analyze_image", call))
    return [
        {"role": "assistant", "content": [{"type": "tool_use", "id": call,
                                           "name": "analyze_image",
                                           "input": {"path": f"/tmp/{index}.png"}}]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": call,
                                      "content": "[Image loaded. Analyze it with this "
                                                 "instruction: compare]" + "r" * result_size}]},
        *group,
    ]


def _text_cycle(index: int, size: int) -> list[dict]:
    call = f"t{index}"
    return [
        {"role": "assistant", "content": [{"type": "tool_use", "id": call, "name": "read_file",
                                           "input": {"path": f"/tmp/{index}.txt"}}]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": call,
                                      "content": "log:" + "x" * size}]},
    ]


def _history(*cycles: tuple[str, ...]) -> list[dict]:
    messages: list[dict] = [{"role": "user", "content": "TASK: compare the renders"}]
    for index, pixels in enumerate(cycles):
        messages.extend(_cycle(index, *pixels))
    return messages


def _agent(messages: list[dict]) -> AgentInfo:
    agent = AgentInfo(id="vision", label="vision", goal="compare", channel_id="room",
                      requester_id="owner", requester_name="Owner")
    agent.messages = messages
    agent.iteration_timeout = 50.0
    return agent


class TestRetentionHelpers:
    def test_seen_and_unseen_follow_the_last_generation(self):
        messages = _history(("P0",), ("P1",), ("P2",))
        groups = image_retention.seen_groups(messages) + image_retention.unseen_groups(messages)
        assert [_sent([messages[i]]) for i in groups] == [
            {"c0": (["P0"], [])}, {"c1": (["P1"], [])}, {"c2": (["P2"], [])}]
        assert len(image_retention.unseen_groups(messages)) == 1

    def test_omission_replaces_only_the_oldest_pixels_and_never_mutates(self):
        messages = _history(("P0", "P0b"), ("P1",), ("P2",))
        before = copy.deepcopy(messages)
        omitted, count = image_retention.omit_seen(messages, 1)
        assert count == 1 and messages == before
        assert _sent(omitted) == {
            "c0": ([], [image_retention.OMITTED_SEEN] * 2),
            "c1": (["P1"], []),
            "c2": (["P2"], []),
        }
        assert _records(omitted) == _records(messages)

    def test_fit_stops_as_soon_as_the_request_fits(self):
        messages = _history(("P0",), ("P1",), ("P2",), ("P3",))
        fitted, count = image_retention.fit_seen(
            messages, lambda m: estimate_message_images(m) <= 3)
        assert count == 1 and estimate_message_images(fitted) == 3
        untouched, none = image_retention.fit_seen(messages, lambda m: True)
        assert none == 0 and untouched is messages

    def test_before_any_generation_every_group_is_unseen(self):
        messages = [{"role": "user", "content": "TASK"}, *_history(("P0",))[2:]]
        assert image_retention.seen_groups(messages) == []
        assert len(image_retention.unseen_groups(messages)) == 1

    def test_nothing_to_withhold_leaves_the_payload_alone(self):
        messages = [*_history(("P0",)), {"role": "assistant", "content": "looked at it"}]
        assert image_retention.withhold_unseen(messages) == (messages, 0)

    def test_withholding_unseen_is_explicit(self):
        messages = _history(("P0",), ("P1", "P1b"))
        withheld, count = image_retention.withhold_unseen(messages)
        assert count == 1
        assert _sent(withheld)["c1"] == ([], [image_retention.WITHHELD_UNSEEN] * 2)
        assert _sent(withheld)["c0"] == (["P0"], [])

    def test_request_limit_is_read_at_call_time(self, monkeypatch):
        messages = _history(("P" * 1000,))
        assert image_retention.within_request_limit(messages)
        monkeypatch.setattr(image_retention, "REQUEST_PAYLOAD_LIMIT", 500)
        assert not image_retention.within_request_limit(messages)

    @pytest.mark.parametrize("text", ["plain ascii", "漢字" * 500, "emoji 😀" * 300,
                                      'quotes " and \\\\ backslashes\\n\x7f' * 100])
    def test_bound_covers_the_real_codex_request(self, text):
        """An upper bound on the body the Codex client sends, in both JSON forms.

        The body is built as the client builds it: compiled wire tools for the
        full built-in catalog, the request flags, a tool call that carries raw
        replay arguments, and an image whose base64 is MIME-wrapped.
        """
        raw = "{" + " " * 50_000 + json.dumps({"path": text}, ensure_ascii=False)[1:]
        call = ReplayDict({"type": "tool_use", "id": "c0", "name": "analyze_image",
                           "input": {"path": text, "tags": [text, 7, None, True, 2.5]}},
                          codex_replay=CodexReplay(raw))
        wrapped = base64.encodebytes(bytes(range(256)) * 400).decode("ascii")
        messages = [
            {"role": "user", "content": f"TASK: {text}"},
            {"role": "assistant", "content": [call]},
            {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "c0",
                                          "content": text, "is_error": False,
                                          "uncertain_outcome": False}]},
            *_cycle(1, wrapped)[1:],
        ]
        system = f"You are Odin. {text}"
        body = {"model": "gpt-6.1-sol", "instructions": system,
                "input": CodexChatClient._convert_messages_with_tools(None, messages),
                "tools": compile_catalog(TOOLS).wire_tools, "tool_choice": "auto",
                "store": False, "stream": True, "reasoning": {"effort": "xhigh"}}
        (sent,) = [item for item in body["input"] if item.get("type") == "function_call"]
        assert sent["arguments"] == raw  # the converter sends the replay text, not the input
        actual = max(len(json.dumps(body, ensure_ascii=True).encode()),
                     len(json.dumps(body, ensure_ascii=False).encode("utf-8")))
        fixed = image_retention.fixed_request_bytes(system, TOOLS)
        assert image_retention.request_bytes_bound(messages, fixed) >= actual


    def _minimal_body_bytes(self, messages: list[dict]) -> int:
        body = {"model": "gpt-6.1-sol", "instructions": "sys",
                "input": CodexChatClient._convert_messages_with_tools(None, messages),
                "tools": [], "tool_choice": "auto", "store": False, "stream": True}
        return max(len(json.dumps(body, ensure_ascii=True).encode()),
                   len(json.dumps(body, ensure_ascii=False).encode("utf-8")))

    def test_bound_counts_raw_replay_arguments(self):
        """Odin's B4a: the converter sends raw replay text the canonical input hides."""
        raw = "{" + " " * 200_000 + '"path":"/tmp/a.png"}'
        call = ReplayDict({"type": "tool_use", "id": "c0", "name": "analyze_image",
                           "input": {"path": "/tmp/a.png"}}, codex_replay=CodexReplay(raw))
        messages = [{"role": "user", "content": "TASK"},
                    {"role": "assistant", "content": [call]},
                    {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "c0",
                                                  "content": "loaded"}]},
                    *_cycle(1, "TINY")[1:]]
        actual = self._minimal_body_bytes(messages)
        assert actual > 200_000
        fixed = image_retention.fixed_request_bytes("sys", [])
        assert image_retention.request_bytes_bound(messages, fixed) >= actual

    def test_bound_counts_wrapped_base64(self):
        """Odin's B4b: MIME-wrapped base64 escapes every line break in the request."""
        wrapped = base64.encodebytes(bytes(range(256)) * 24_000).decode("ascii")
        assert wrapped.count("\n") > 100_000
        messages = [{"role": "user", "content": "TASK"}, *_cycle(0, wrapped)[1:]]
        actual = self._minimal_body_bytes(messages)
        fixed = image_retention.fixed_request_bytes("sys", [])
        assert image_retention.request_bytes_bound(messages, fixed) >= actual

    @staticmethod
    def _image_shaped_call(data: str, **extra) -> list[dict]:
        """A tool call whose ordinary (canonical, no replay) arguments look like an image."""
        payload = {"type": "image",
                   "source": {"type": "base64", "media_type": "image/png", "data": data},
                   **extra}
        return [{"role": "user", "content": "TASK"},
                {"role": "assistant", "content": [{"type": "tool_use", "id": "c0",
                                                   "name": "inspect_fixture", "input": payload}]},
                {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "c0",
                                              "content": "inspected"}]}]

    def test_image_shaped_arguments_get_ordinary_accounting(self):
        """Odin's round-3 B4: only direct content blocks become native images."""
        messages = self._image_shaped_call("iVBORw0KGgo=", caption="c" * 300_000)
        assert image_retention.group_count(messages) == 0
        actual = self._minimal_body_bytes(messages)
        assert actual > 300_000
        fixed = image_retention.fixed_request_bytes("sys", [])
        assert image_retention.request_bytes_bound(messages, fixed) >= actual

    def test_wrapped_base64_inside_arguments_is_escaped_twice(self):
        wrapped = base64.encodebytes(bytes(range(256)) * 24_000).decode("ascii")
        messages = self._image_shaped_call(wrapped)
        actual = self._minimal_body_bytes(messages)
        fixed = image_retention.fixed_request_bytes("sys", [])
        assert image_retention.request_bytes_bound(messages, fixed) >= actual

    def test_unusual_values_are_bounded_by_their_text(self):
        odd = [{"role": "user", "content": [{"type": "text", "text": "x",
                                             "meta": Decimal("12345.6789")}]}]
        assert image_retention.request_bytes_bound(odd) >= len(json.dumps(odd, default=str))

    def test_counting_escapes_does_not_allocate_per_character(self):
        wrapped = ("A" * 76 + "\n") * 100_000
        tracemalloc.start()
        try:
            size = image_retention._json_string_bytes(wrapped)
            _current, peak = tracemalloc.get_traced_memory()
        finally:
            tracemalloc.stop()
        assert size == len(json.dumps(wrapped))
        assert peak < 64 * 1024

def _scripted(*outcomes):
    calls: list[list[dict]] = []
    queue = list(outcomes)

    async def cb(messages, system_prompt, tools, generation_state=None):
        calls.append(copy.deepcopy(messages))
        outcome = queue.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome

    return cb, calls


def _recording_compressor(monkeypatch) -> list[int]:
    targets: list[int] = []
    real = cc.emergency_compress_for_window

    def recording(messages, *, target_chars, stats=None):
        targets.append(target_chars)
        return real(messages, target_chars=target_chars)

    monkeypatch.setattr("src.llm.context_compressor.emergency_compress_for_window", recording)
    return targets


class TestFailureBoundaryRetention:
    async def test_requests_that_fit_are_sent_unchanged(self):
        snapshot = resolve_context_budget("vision-small", overrides={"vision-small": 100_000})
        messages = _history(("P0", "P0b"), ("P1", "P1b"), ("P2", "P2b"), ("P3", "P3b"))
        agent = _agent(copy.deepcopy(messages))
        cb, calls = _scripted(DONE)
        result = await _call_llm_with_recovery(
            agent, cb, "sys", [], generation_state={"plan": {"is_codex": True,
                                                             "snapshot": snapshot}})
        assert result is not None and calls == [messages]
        assert agent.context_recoveries == []

    async def test_predictive_drops_only_enough_seen_images_to_fit(self):
        snapshot = resolve_context_budget("vision-small", overrides={"vision-small": 100_000})
        cycles = [tuple(f"P{i}_{j}" for j in range(4)) for i in range(7)]
        agent = _agent(_history(*cycles))
        cb, calls = _scripted(DONE)
        result = await _call_llm_with_recovery(
            agent, cb, "sys", [], generation_state={"plan": {"is_codex": True,
                                                             "snapshot": snapshot}})
        assert result is not None
        sent = _sent(calls[0])
        assert estimate_message_images(calls[0]) == 20
        assert sent["c0"][0] == [] and sent["c1"][0] == []
        assert all(sent[f"c{i}"][0] == list(cycles[i]) for i in range(2, 7))
        assert agent.context_recoveries == [{"trigger": "predictive", "images_omitted_groups": 2}]

    async def test_overflow_drops_oldest_seen_images_before_any_character_rung(self, monkeypatch):
        targets = _recording_compressor(monkeypatch)
        agent = _agent(_history(("P0",), ("P1",), ("P2",), ("P3",)))
        cb, calls = _scripted(_overflow_error(), DONE)
        evidence = AsyncMock()
        result = await _call_llm_with_recovery(
            agent, cb, "sys", [], generation_state={}, evidence_recorder=evidence)
        assert result is not None and len(calls) == 2
        assert targets == []
        sent = _sent(calls[1])
        assert sent["c0"] == ([], [image_retention.OMITTED_SEEN])
        assert sent["c1"] == ([], [image_retention.OMITTED_SEEN])
        assert sent["c2"] == (["P2"], []) and sent["c3"] == (["P3"], [])
        assert agent.context_recoveries == [{"trigger": "overflow", "images_omitted_groups": 2}]
        assert agent.context_char_ceiling is None and evidence.await_count == 0

    async def test_text_driven_overflow_still_compacts_text_and_keeps_images(self, monkeypatch):
        targets = _recording_compressor(monkeypatch)
        agent = _agent([{"role": "user", "content": "TASK: compare the renders"},
                        *_text_cycle(0, 60_000), *_cycle(1, "SEEN"), *_cycle(2, "FRESH")])
        cb, calls = _scripted(_overflow_error(), DONE)
        result = await _call_llm_with_recovery(
            agent, cb, "sys", [], rescue_ladder=(40_000,), generation_state={})
        assert result is not None and len(calls) == 2
        assert targets == [40_000]
        assert _sent(calls[1]) == {"c1": (["SEEN"], []), "c2": (["FRESH"], [])}
        assert not any("images_omitted_groups" in r for r in agent.context_recoveries)
        # An image-free rescue keeps the existing latch behavior.
        assert agent.context_char_ceiling is not None

    async def test_unseen_images_are_withheld_only_when_nothing_else_fits(self, monkeypatch):
        targets = _recording_compressor(monkeypatch)
        agent = _agent([{"role": "user", "content": "TASK: compare the renders"},
                        *_text_cycle(0, 60_000), *_cycle(1, "FRESH_A", "FRESH_B")])
        cb, calls = _scripted(_overflow_error(), _overflow_error(), DONE)
        evidence = AsyncMock()
        result = await _call_llm_with_recovery(
            agent, cb, "sys", [], rescue_ladder=(40_000,), generation_state={},
            evidence_recorder=evidence)
        assert result is not None and len(calls) == 3
        assert targets == [40_000]
        assert _sent(calls[1])["c1"] == (["FRESH_A", "FRESH_B"], [])
        assert _sent(calls[2])["c1"] == ([], [image_retention.WITHHELD_UNSEEN] * 2)
        assert [r["tool_use_id"] for r in _records(calls[2])] == ["t0", "c1"]
        assert agent.context_recoveries[-1] == {"trigger": "overflow_unseen",
                                                "images_omitted_groups": 1}
        # A request that only fit without pixels proves nothing about characters.
        assert agent.context_char_ceiling is None and evidence.await_count == 0

    async def test_predictive_keeps_images_when_characters_are_the_excess(self):
        snapshot = resolve_context_budget("vision-small", overrides={"vision-small": 100_000})
        agent = _agent([{"role": "user", "content": "TASK: compare the renders"},
                        *_text_cycle(0, 300_000), *_cycle(1, "SEEN_A"), *_cycle(2, "SEEN_B"),
                        *_cycle(3, "FRESH")])
        cb, calls = _scripted(DONE)
        result = await _call_llm_with_recovery(
            agent, cb, "sys", [], generation_state={"plan": {"is_codex": True,
                                                             "snapshot": snapshot}})
        assert result is not None
        assert _sent(calls[0]) == {"c1": (["SEEN_A"], []), "c2": (["SEEN_B"], []),
                                   "c3": (["FRESH"], [])}
        assert not any("images_omitted_groups" in r for r in agent.context_recoveries)
        assert any(r.get("trigger") == "predictive" for r in agent.context_recoveries)

    async def test_overflow_tries_lower_character_rungs_before_dropping_fresh_images(
            self, monkeypatch):
        targets = _recording_compressor(monkeypatch)
        agent = _agent([{"role": "user", "content": "TASK: compare the renders"},
                        *_text_cycle(0, 60_000), *_cycle(1, "FRESH")])
        cb, calls = _scripted(_overflow_error(), DONE)
        result = await _call_llm_with_recovery(
            agent, cb, "sys", [], rescue_ladder=(900_000, 40_000), generation_state={})
        assert result is not None and len(calls) == 2
        assert targets == [40_000]
        assert _sent(calls[1]) == {"c1": (["FRESH"], [])}
        assert not any("images_omitted_groups" in r for r in agent.context_recoveries)
        assert agent.context_char_ceiling is not None

    async def test_compaction_that_drops_images_publishes_no_latch_or_evidence(self, monkeypatch):
        targets = _recording_compressor(monkeypatch)
        agent = _agent([{"role": "user", "content": "TASK: compare the renders"}])
        for i in range(10):
            agent.messages.extend(_cycle(i, f"P{i}", result_size=4_000))
        cb, calls = _scripted(_overflow_error(), DONE)
        evidence = AsyncMock()
        result = await _call_llm_with_recovery(
            agent, cb, "sys", [], rescue_ladder=(10_000,), generation_state={},
            evidence_recorder=evidence)
        assert result is not None and targets == [10_000]
        kept = estimate_message_images(calls[1])
        assert 0 < kept < 10
        assert {"trigger": "overflow_compaction",
                "images_omitted_groups": 10 - kept} in agent.context_recoveries
        assert agent.context_char_ceiling is None and evidence.await_count == 0

    async def test_predictive_compaction_records_the_images_it_drops(self):
        snapshot = resolve_context_budget("vision-small", overrides={"vision-small": 100_000})
        agent = _agent([{"role": "user", "content": "TASK: compare the renders"}])
        for i in range(10):
            agent.messages.extend(_cycle(i, f"P{i}", result_size=30_000))
        cb, calls = _scripted(DONE)
        result = await _call_llm_with_recovery(
            agent, cb, "sys", [], generation_state={"plan": {"is_codex": True,
                                                             "snapshot": snapshot}})
        assert result is not None
        kept = estimate_message_images(calls[0])
        assert {"trigger": "predictive_compaction",
                "images_omitted_groups": 10 - kept} in agent.context_recoveries
        assert _sent(calls[0])["c9"] == (["P9"], [])


CODEX = {"plan": {"is_codex": True}}


def _size_limit(monkeypatch, limit: int) -> None:
    monkeypatch.setattr(image_retention, "REQUEST_PAYLOAD_LIMIT", limit)


def _bound(messages: list[dict]) -> int:
    return image_retention.request_bytes_bound(
        messages, image_retention.fixed_request_bytes("sys", []))


def _measuring(*outcomes):
    """A Codex-shaped callback: it measures as the agent's request assembly does.

    A request over the limit raises before anything is "sent"; ``sent`` records
    only the requests that passed the measurement.
    """
    sent: list[list[dict]] = []
    queue = list(outcomes)

    async def cb(messages, system_prompt, tools, generation_state=None):
        image_retention.check_request_size(messages, system_prompt, tools,
                                           provider="codex", model="gpt-6.1-sol")
        sent.append(copy.deepcopy(messages))
        outcome = queue.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome

    return cb, sent


class TestRequestSizeLimit:
    async def test_seen_images_go_first(self, monkeypatch):
        cycles = [(f"PIX{i}" + "x" * 20_000,) for i in range(3)]
        agent = _agent(_history(*cycles))
        _size_limit(monkeypatch, _bound(agent.messages) - 10_000)
        cb, sent = _measuring(DONE)
        assert await _call_llm_with_recovery(agent, cb, "sys", [], generation_state={})
        assert len(sent) == 1
        assert [len(pixels) for pixels, _notes in _sent(sent[0]).values()] == [0, 1, 1]
        assert agent.context_recoveries == [{"trigger": "payload_limit",
                                             "images_omitted_groups": 1}]

    async def test_text_is_compacted_before_fresh_images_are_withheld(self, monkeypatch):
        messages = [{"role": "user", "content": "TASK: compare the renders"},
                    *_text_cycle(0, 11_000), *_cycle(1, "FRESH" + "x" * 2_000)]
        compacted, _report = emergency_compress_for_window(messages, target_chars=4_000)
        full, small = _bound(messages), _bound(compacted)
        assert small < full
        _size_limit(monkeypatch, (small + full) // 2)
        agent = _agent(messages)
        cb, sent = _measuring(DONE)
        assert await _call_llm_with_recovery(
            agent, cb, "sys", [], rescue_ladder=(900_000, 4_000), generation_state={})
        assert _sent(sent[0])["c1"] == (["FRESH" + "x" * 2_000], [])
        assert [r["trigger"] for r in agent.context_recoveries] == ["payload_limit"]

    async def test_a_request_that_cannot_fit_is_never_sent(self, monkeypatch):
        agent = _agent(_history(("SEEN",), ("FRESH",)))
        _size_limit(monkeypatch, 1_000)
        cb, sent = _measuring(DONE)
        assert await _call_llm_with_recovery(
            agent, cb, "sys", [], rescue_ladder=(), generation_state={}) is None
        assert sent == []
        assert agent.state == AgentState.FAILED and "size limit" in agent.error
        assert estimate_message_images(agent.messages) == 0

    async def test_hidden_replay_text_counts_toward_the_limit(self, monkeypatch):
        raw = "{" + " " * 200_000 + '"path":"/tmp/a.png"}'
        call = ReplayDict({"type": "tool_use", "id": "c0", "name": "analyze_image",
                           "input": {"path": "/tmp/a.png"}}, codex_replay=CodexReplay(raw))
        agent = _agent([{"role": "user", "content": "TASK"},
                        {"role": "assistant", "content": [call]},
                        {"role": "user", "content": [{"type": "tool_result",
                                                      "tool_use_id": "c0", "content": "loaded"}]},
                        *_cycle(1, "TINY")[1:]])
        _size_limit(monkeypatch, 131_072)
        cb, sent = _measuring(DONE)
        assert await _call_llm_with_recovery(
            agent, cb, "sys", [], rescue_ladder=(), generation_state={}) is None
        assert sent == [] and agent.state == AgentState.FAILED

    async def test_image_shaped_arguments_count_toward_the_limit(self, monkeypatch):
        messages = TestRetentionHelpers._image_shaped_call("iVBORw0KGgo=", caption="c" * 300_000)
        agent = _agent(messages)
        _size_limit(monkeypatch, 131_072)
        cb, sent = _measuring(DONE)
        assert await _call_llm_with_recovery(
            agent, cb, "sys", [], rescue_ladder=(), generation_state={}) is None
        assert sent == [] and agent.state == AgentState.FAILED


class TestInconsistentMeasurement:
    async def test_a_refusal_the_manager_cannot_act_on_fails_instead_of_resending(self):
        agent = _agent(_history(("P0",)))
        before = copy.deepcopy(agent.messages)
        cb, calls = _scripted(image_retention.RequestTooLargeError(0, provider="codex"), DONE)
        assert await _call_llm_with_recovery(
            agent, cb, "sys", [], rescue_ladder=(), generation_state={}) is None
        assert len(calls) == 1 and agent.messages == before
        assert agent.state == AgentState.FAILED and "size limit" in agent.error


class TestAgentRequestAssembly:
    """The agent's real request assembly measures what it is about to send."""

    @staticmethod
    def _client():
        reply = SimpleNamespace(text="ok", tool_calls=[], provenance_provider="codex")
        return SimpleNamespace(model="local", chat_with_tools=AsyncMock(return_value=reply))

    async def _generate(self, client, provider, system_provider):
        t = _tools(llm_gateway=_fake_gateway(client))
        return await t._agent_generate(
            client, messages=[{"role": "user", "content": "hi"}], sys_prompt="s",
            tool_defs=[], agent_effort=None, resolved_model=None, provider=provider,
            system_provider=system_provider)

    async def test_codex_requests_are_measured_with_the_refreshed_prompt(self, monkeypatch):
        _size_limit(monkeypatch, 200_000)
        client = self._client()
        assert (await self._generate(client, "codex", lambda: "s")).text == "ok"
        learned = "s" + "L" * 50_000  # learned context added at request assembly
        with pytest.raises(image_retention.RequestTooLargeError) as raised:
            await self._generate(client, "codex", lambda: learned)
        assert raised.value.code == "request_too_large"
        assert raised.value.fixed_bytes == image_retention.fixed_request_bytes(learned, [])
        assert client.chat_with_tools.await_count == 1

    async def test_other_providers_are_not_measured(self, monkeypatch):
        _size_limit(monkeypatch, 1_000)
        client = self._client()
        assert (await self._generate(client, "compat", lambda: "s" + "L" * 50_000)).text == "ok"

