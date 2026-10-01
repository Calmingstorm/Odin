"""Transient Codex replay boundaries with synthetic SSE and real storage."""
import asyncio
import copy
import dataclasses
import json
import logging
import pickle
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.llm.openai_codex import CodexChatClient, _request_tool_adapter
from src.llm.strict_tool_adapter import compile_catalog
from src.llm.tool_history import assistant_content, normalize_tool_calls
from src.llm.tool_replay import CODEX_ARGUMENT_LIMIT, CodexReplay, codex_arguments
from src.llm.types import LLMResponse, ToolCall

SECRET = "REPLAY_ONLY_SECRET_7b23_not_canonical"
RAW = json.dumps({"json": json.dumps({"credentials": {"password": SECRET},
    "steps": [{"tool_input": json.dumps({"token": SECRET})}]}), "optional": None}, indent=2)
CANONICAL = {"query": "safe query", "nested": {"count": 2}}


def client():
    return CodexChatClient(auth=SimpleNamespace(), model="fixture")


class Content:
    def __init__(self, events):
        self.events = events

    def __aiter__(self):
        async def lines():
            for event in self.events:
                yield ("data: " + json.dumps(event)).encode()
        return lines()


async def stream(raws, adapter=None, reverse=False):
    items = [{"type": "function_call", "call_id": f"call-{i}", "name": "fixture",
              "arguments": raw} for i, raw in enumerate(raws)]
    events = [{"type": "response.output_item.added", "output_index": i,
               "item": item} for i, item in enumerate(items)]
    for i in reversed(range(len(items))) if reverse else range(len(items)):
        events.extend([
            {"type": "response.function_call_arguments.done", "output_index": i,
             "arguments": items[i]["arguments"]},
            {"type": "response.output_item.done", "output_index": i, "item": items[i]},
        ])
    events.append({"type": "response.completed", "response": {"output": items}})
    binding = _request_tool_adapter.set(adapter)
    try:
        return await client()._read_tool_stream(SimpleNamespace(content=Content(events)))
    finally:
        _request_tool_adapter.reset(binding)


def call(identity="call-0"):
    return ToolCall(id=identity, name="fixture", input=copy.deepcopy(CANONICAL),
                    codex_replay=CodexReplay(RAW))


def messages(calls=None, chars=10):
    calls = normalize_tool_calls(calls or [call()])
    return [{"role": "user", "content": "immutable request"},
            {"role": "assistant", "content": assistant_content("", calls)},
            {"role": "user", "content": [{"type": "tool_result", "tool_use_id": c["id"],
                                          "content": "x" * chars} for c in calls]}]


def blocks(msgs):
    return [b for m in msgs if isinstance(m["content"], list) for b in m["content"]
            if b.get("type") == "tool_use"]


def clean(value):
    text = json.dumps(value, default=str)
    assert SECRET not in text
    assert "codex_replay" not in text


@pytest.mark.asyncio
@pytest.mark.parametrize("valid", [True, False])
@pytest.mark.parametrize("extra", [0, 1])
async def test_utf8_byte_limit_inclusive_over_valid_and_malformed(valid, extra, caplog):
    assert CODEX_ARGUMENT_LIMIT == 256 * 1024
    prefix, suffix = '{"text":"', '"}' if valid else ''
    room = CODEX_ARGUMENT_LIMIT + extra - len(prefix + suffix)
    raw = prefix + "\U0001f9ea" * (room // 4) + "a" * (room % 4) + suffix
    assert len(raw.encode()) == CODEX_ARGUMENT_LIMIT + extra
    assert len(raw) < CODEX_ARGUMENT_LIMIT
    c, = (await stream([raw])).tool_calls
    assert bool(c.parse_error) is not valid
    assert c.input == (json.loads(raw) if valid else {})
    if extra:
        assert c.codex_replay is None
        with pytest.raises(ValueError, match="byte limit"):
            CodexReplay(raw)
        assert "argument_bytes=262145" in caplog.text
    else:
        assert c.codex_replay.arguments == raw
        assert c.codex_replay.byte_count == CODEX_ARGUMENT_LIMIT
        assert client()._convert_messages_with_tools(messages([c]))[1]["arguments"] == raw
    assert raw[:200] not in caplog.text


@pytest.mark.asyncio
@pytest.mark.parametrize("valid", [True, False])
async def test_invalid_utf8_surrogate_omits_replay_without_breaking_acceptance(valid, caplog):
    raw = '{"text":"\ud800"' + ('}' if valid else '')
    c, = (await stream([raw])).tool_calls
    assert c.codex_replay is None
    assert bool(c.parse_error) is not valid
    assert c.input == (json.loads(raw) if valid else {})
    assert "invalid_utf8=true" in caplog.text


@pytest.mark.asyncio
async def test_rejected_canonical_call_never_dispatches_raw(caplog):
    from src.discord.tool_loop import ToolLoopRunner
    adapter = compile_catalog([{"name": "fixture", "input_schema": {
        "type": "object", "properties": {"count": {"type": "integer"}}, "required": ["count"]}}])
    assert adapter.report["fixture"]["mode"] == "external_envelope"
    raw = json.dumps({"json": json.dumps({"count": SECRET, "nested": {"password": SECRET}})})
    c, = (await stream([raw], adapter)).tool_calls
    assert c.input == {} and c.parse_error
    assert c.codex_replay.arguments == raw
    runner = object.__new__(ToolLoopRunner)
    runner._tool_executor = SimpleNamespace(check_permission=Mock(), execute=AsyncMock())
    runner._native_tools = SimpleNamespace(dispatch=AsyncMock())
    runner.dispatch_loop_tool = AsyncMock()
    for method in (runner._run_one_tool_captured, runner._run_one_loop_tool):
        result = await method(SimpleNamespace(), c)
        assert result["tool_use_id"] == c.id and "NOT executed" in result["content"]
        assert SECRET not in result["content"]
    runner._tool_executor.execute.assert_not_called()
    runner._tool_executor.check_permission.assert_not_called()
    runner._native_tools.dispatch.assert_not_called()
    runner.dispatch_loop_tool.assert_not_called()
    assert SECRET not in caplog.text
    assert client()._convert_messages_with_tools(messages([c]))[1]["arguments"] == raw


@pytest.mark.asyncio
@pytest.mark.parametrize("reverse", [False, True])
async def test_multiple_ids_order_and_deterministic_prefix_across_iterations(reverse):
    adapter = compile_catalog([{"name": "fixture", "input_schema": {
        "type": "object", "properties": {"query": {"type": "string"}},
        "additionalProperties": False, "required": ["query"]}}])
    adapter.accept = Mock(wraps=adapter.accept)
    transcript = [{"role": "user", "content": "immutable request"}]
    prefixes = []
    for iteration in range(3):
        raws = [f' {{ "query" : "value-{iteration}-{i}" }} ' for i in range(3)]
        response = await stream(raws, adapter, reverse)
        assert [c.id for c in response.tool_calls] == [f"call-{i}" for i in range(3)]
        # Distinct provider IDs per iteration; acceptance is the only point
        # where identities may be assigned, not during replay conversion.
        for c in response.tool_calls:
            c.id = f"iteration-{iteration}-{c.id}"
        transcript.extend(messages(response.tool_calls)[1:])
        before = adapter.accept.call_count
        wire = client()._convert_messages_with_tools(transcript)
        assert adapter.accept.call_count == before
        assert wire == client()._convert_messages_with_tools(copy.deepcopy(transcript))
        for prefix in prefixes:
            assert wire[:len(prefix)] == prefix
        prefixes.append(copy.deepcopy(wire))
        calls = [e for e in wire if e["type"] == "function_call"]
        results = [e for e in wire if e["type"] == "function_call_output"]
        assert [e["call_id"] for e in calls] == [e["call_id"] for e in results]
        assert [e["arguments"] for e in calls[-3:]] == raws
    assert adapter.accept.call_count == 9


@pytest.mark.parametrize("copier", [copy.copy, copy.deepcopy])
def test_copy_deepcopy_preserve_sidecar_without_aliasing_canonical(copier):
    c = call()
    assert copier(c).codex_replay.arguments == RAW
    normalized = normalize_tool_calls([c])
    for mapping in (normalized[0], assistant_content("", normalized)[0]):
        assert codex_arguments(copier(mapping)) == RAW
        assert codex_arguments(mapping.copy()) == RAW
        assert codex_arguments(dict(mapping)) is None
        assert "codex_replay" not in mapping
    normalized[0]["input"]["nested"]["count"] = 99
    assert c.input == CANONICAL


def test_actual_soft_and_emergency_compaction_preserve_retained_wire():
    from src.llm.context_compressor import compress_tool_context, emergency_compress_for_window
    transcript = [{"role": "user", "content": "immutable request"}]
    for i in range(5):
        transcript.extend(messages([call(f"call-{i}")], chars=12000)[1:])
    original = copy.deepcopy(transcript)
    soft, count = compress_tool_context(transcript, max_context_chars=1000, keep_recent=2)
    assert count == 3
    assert [b["id"] for b in blocks(soft)] == ["call-3", "call-4"]
    emergency, report = emergency_compress_for_window(transcript, target_chars=6000)
    assert report["fits"] and report["results_truncated"] > 0
    assert blocks(emergency)[-1]["id"] == "call-4"
    for result in (soft, emergency, transcript):
        assert all(codex_arguments(b) == RAW for b in blocks(result))
        assert all(b["input"] == CANONICAL for b in blocks(result))
    assert transcript == original
    assert soft[0] == emergency[0] == original[0]


def test_compatible_and_ollama_ignore_raw_sidecar_and_reserved_legacy_key():
    from src.llm.ollama import OllamaClient
    from src.llm.openai_compatible import OpenAICompatibleClient
    transcript = messages()
    blocks(transcript)[0]["codex_replay"] = {"arguments": RAW}
    compatible = OpenAICompatibleClient(
        base_url="http://unused.invalid", model="fixture", api_key="fixture")
    wire = compatible._convert_messages(transcript, "sys")
    ollama = OllamaClient()._convert_messages(transcript, "sys")
    clean(wire)
    clean(ollama)
    assert json.loads(wire[2]["tool_calls"][0]["function"]["arguments"]) == CANONICAL
    assert ollama[2]["tool_calls"][0]["function"]["arguments"] == CANONICAL


def test_repr_logging_asdict_and_all_pickle_protocols_exclude_secret(caplog):
    c = call()
    response = LLMResponse(tool_calls=[c])
    mapping = normalize_tool_calls([c])[0]
    block = assistant_content("", [mapping])[0]
    with caplog.at_level(logging.INFO):
        logging.getLogger(__name__).info("%r %r %r", response, block, c.codex_replay)
    assert SECRET not in caplog.text
    exported = dataclasses.asdict(response)
    clean(exported)
    assert exported["tool_calls"][0]["input"] == CANONICAL
    for value in (c.codex_replay, c, response, mapping, block, {"calls": [c, mapping, block]}):
        assert SECRET not in repr(value)
        for protocol in range(pickle.HIGHEST_PROTOCOL + 1):
            try:
                dumped = pickle.dumps(value, protocol=protocol)
            except TypeError:
                # Dataclasses with slots already refuse legacy protocols 0/1.
                # Refusal is fail-closed, not an exported payload.
                assert protocol < 2
                continue
            assert SECRET.encode() not in dumped
            assert SECRET not in repr(pickle.loads(dumped))
    assert c.codex_replay.arguments == RAW


def trajectory_calls(legacy):
    calls = normalize_tool_calls([call()])
    if legacy:
        calls[0]["codex_replay"] = {"arguments": RAW, "nested": {"token": SECRET}}
        calls[0]["input"]["codex_replay"] = {"arguments": RAW}
    return calls


@pytest.mark.asyncio
@pytest.mark.parametrize("legacy", [False, True])
async def test_actual_chat_agent_exports_and_savers_exclude_raw(tmp_path, legacy):
    from src.agents.trajectory import AgentTrajectorySaver, AgentTrajectoryTurn
    from src.trajectories.saver import TrajectorySaver, TrajectoryTurn
    calls = trajectory_calls(legacy)
    chat = TrajectoryTurn(message_id="fixture-message", channel_id="fixture-channel")
    agent = AgentTrajectoryTurn(agent_id="fixture-agent", channel_id="fixture-channel")
    for turn in (chat, agent):
        turn.add_iteration(iteration=1, tool_calls=copy.deepcopy(calls))
        data = turn.to_dict()
        clean(data)
        assert data["iterations"][0]["tool_calls"][0]["input"] == CANONICAL
    for turn, saver in ((chat, TrajectorySaver(str(tmp_path / "chat"))),
                        (agent, AgentTrajectorySaver(str(tmp_path / "agents")))):
        path = await saver.save(turn)
        assert path.is_relative_to(tmp_path)
        clean(json.loads(path.read_text()))
    assert calls[0].codex_replay.arguments == RAW


@pytest.mark.parametrize("legacy", [False, True])
def test_actual_codec_checkpoint_and_restore_exclude_raw(tmp_path, legacy):
    from src.discord.response_guards import StuckLoopTracker
    from src.discord.tool_loop import CHAT_POLICY, _ChatTurn
    from src.trajectories.saver import TrajectoryTurn
    from src.turn_state import TurnKey, TurnStateStore
    from src.turn_state.codec import restore_field_values, snapshot_chat_turn
    calls = trajectory_calls(legacy)
    trajectory = TrajectoryTurn(message_id="fixture", history=messages())
    trajectory.add_iteration(iteration=1, tool_calls=copy.deepcopy(calls))
    transcript = messages()
    if legacy:
        blocks(transcript)[0]["codex_replay"] = {"arguments": RAW}
        blocks(transcript)[0]["input"]["codex_replay"] = {"arguments": RAW}
    turn = _ChatTurn(message=SimpleNamespace(), policy=CHAT_POLICY, trace=None,
        system_prompt="fixture", tools=[], messages=transcript, user_id="fixture", chat_cap=10000,
        stuck_tracker=StuckLoopTracker(), _trajectory=trajectory, _result_store_cap=10000,
        _cancel=asyncio.Event(), _ch_id="fixture", _req_id="fixture")
    store = TurnStateStore(tmp_path / "turns.sqlite3", blob_dir=tmp_path / "blobs")
    try:
        payload = snapshot_chat_turn(turn, store_blob=store.store_blob_sync, generation_seq=1)
        clean(payload)
        restored = restore_field_values(json.loads(json.dumps(payload)),
            load_blob=store.load_blob_sync, stuck_tracker_cls=StuckLoopTracker)
        assert restored["messages"] == messages()
        assert all(codex_arguments(b) is None for b in blocks(restored["messages"]))
        lease, disposition = store.admit_turn_sync(
            TurnKey(source="discord", channel_id="fixture", message_id="fixture"),
            guild_id=None, user_id="fixture", content_digest="fixture", code_version="fixture",
            prompt_policy_hash="fixture", tool_catalog_hash="fixture", session_snapshot={})
        assert disposition == "admitted"
        store.checkpoint_sync(lease, payload, progressed=True)
        stored, = store._conn.execute("SELECT payload FROM turns").fetchone()
        clean(json.loads(stored))
        assert SECRET.encode() not in (tmp_path / "turns.sqlite3").read_bytes()
    finally:
        store.close()
    assert blocks(turn.messages)[0].codex_replay.arguments == RAW


@pytest.mark.asyncio
async def test_real_agent_cycle_dispatches_only_canonical_and_never_replays_handlers():
    from src.agents.tool_cycle import execute_cycle
    accepted = call("accepted")
    rejected = ToolCall(id="rejected", name="fixture", input={},
                        parse_error="invalid tool arguments: violates integer constraint",
                        codex_replay=CodexReplay(RAW))
    calls = normalize_tool_calls([accepted, rejected])
    agent = SimpleNamespace(max_lifetime=60, created_at=time.time(), _cancel_event=asyncio.Event(),
        _inbox=asyncio.Queue(), messages=[{"role": "user", "content": "request"},
            {"role": "assistant", "content": assistant_content("", calls)}],
        tool_execution_count=0, tools_used=[], set_phase=Mock())
    execute = AsyncMock(return_value="done")
    results = []
    await execute_cycle(agent, calls, execute, results, timeouts={}, default_timeout=5)
    execute.assert_awaited_once_with("fixture", CANONICAL)
    assert agent.tool_execution_count == 1
    assert [r["tool_use_id"] for r in results] == ["accepted", "rejected"]
    assert [r["status"] for r in results] == ["succeeded", "invalid_arguments"]
    clean(results)
    for _ in range(3):
        wire = client()._convert_messages_with_tools(copy.deepcopy(agent.messages))
        assert [e["arguments"] for e in wire if e["type"] == "function_call"] == [RAW, RAW]
    execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_actual_audit_and_diagnostic_reconstruction_excludes_raw(tmp_path):
    from src.audit.logger import AuditLogger
    from src.observability.diagnostics import scrub_diagnostic
    payload = normalize_tool_calls([call()])[0]
    cleaned = scrub_diagnostic(payload)
    clean(cleaned)
    assert cleaned["input"] == CANONICAL
    assert codex_arguments(cleaned) is None
    logger = AuditLogger(str(tmp_path / "audit.jsonl"))
    await logger.log_event(event_type="fixture", action="fixture", metadata={"accepted": payload})
    await logger.log_execution(user_id="fixture", user_name="fixture", channel_id="fixture",
        tool_name="fixture", tool_input=payload, approved=True, result_summary="done",
        execution_time_ms=1)
    for line in (tmp_path / "audit.jsonl").read_text().splitlines():
        clean(json.loads(line))
    assert payload.codex_replay.arguments == RAW


def test_prefix_digest_tracks_raw_wire_whitespace_without_exporting_secret():
    from src.llm.context_compressor import _hash_prefix
    first = messages()
    second = copy.deepcopy(first)
    blocks(second)[0].codex_replay = CodexReplay(RAW + " ")
    assert first == second
    assert _hash_prefix("sys", first) != _hash_prefix("sys", second)
    assert SECRET not in _hash_prefix("sys", first)


def test_opaque_evidence_immutable_copy_and_explicit_storage_null():
    from src.llm.tool_replay import without_replay
    replay = CodexReplay(RAW)
    with pytest.raises(AttributeError, match="immutable"):
        replay.byte_count = 0
    with pytest.raises(AttributeError, match="immutable"):
        replay._arguments = "different"
    assert copy.copy(replay) is replay
    assert copy.deepcopy(replay) is replay
    assert without_replay(replay) is None
    assert replay.arguments == RAW
