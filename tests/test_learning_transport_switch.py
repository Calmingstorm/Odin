"""Behavioral transport coverage for the live learned-context switch.

These tests stop at the physical provider boundary.  They intentionally use a
real ``PromptBuilder`` so disabling learned context must remove only the
generated learned block while leaving persistent memory in the request.
"""
from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

from src.discord.prompts import PromptBuilder
from src.learning.reflector import ConversationReflector
from src.llm.errors import LLMTransportError
from tests.fakes import FakeLLM, FakeMessage, make_bot, text_response, tool_call_response
from tests.test_chat_loop_recovery import _census_runner, _chat_config, _Gateway
from tests.test_native_agents_tasks import _fake_gateway, _message, _tools
from tests.test_resume_admission import Harness, capacity_forever, rewrite_payload_with_valid_digest


def _prompt_builder(tmp_path, live) -> PromptBuilder:
    learned_path = tmp_path / "learned.json"
    learned_path.write_text(json.dumps({
        "version": 2,
        "last_reflection": None,
        "entries": [
            {"key": "runtime_lesson", "category": "operational", "content": "learned value"}
        ],
    }))
    reflector = ConversationReflector(
        str(learned_path),
        enabled=True,
    )
    config = SimpleNamespace(
        learning=live,
        timezone="UTC",
        personality=SimpleNamespace(
            preset="odin", custom_name="", custom_identity="", custom_voice=""
        ),
        tools=SimpleNamespace(hosts={}),
    )
    return PromptBuilder(
        get_config=lambda: config,
        context_loader=SimpleNamespace(context={}),
        reflector=reflector,
        skill_manager=None,
        tool_executor=SimpleNamespace(
            _load_memory_for_user=lambda _uid: {"manual_note": "memory value"}
        ),
        channel_state=SimpleNamespace(recent_entries=lambda _channel: []),
        get_codex_client=lambda: None,
    )


def _assert_learning_off_at_transport(system: str) -> None:
    assert "## Persistent Memory" in system
    assert "memory value" in system
    assert "## Learned Context" not in system
    assert "learned value" not in system


async def test_chat_physical_request_refreshes_cached_prompt_with_learning_off(
    tmp_path, monkeypatch
):
    monkeypatch.chdir(tmp_path)
    live = SimpleNamespace(enabled=True)
    builder = _prompt_builder(tmp_path, live)
    cached = builder.build_full_prompt(user_id="u1", query="learned")
    assert "learned value" in cached

    fake = FakeLLM([text_response("done")])
    bot = make_bot(fake_llm=fake)
    bot.prompt_builder = builder
    bot.tool_loop._prompt_builder = builder
    live.enabled = False

    message = FakeMessage("learned")
    result = await bot.tool_loop.run(
        message,
        [{"role": "user", "content": message.content}],
        system_prompt_override=cached,
    )

    assert result[0] == "done"
    _assert_learning_off_at_transport(fake.calls[0]["system"])


async def test_web_physical_request_refreshes_after_provider_lock_wait(
    tmp_path, monkeypatch
):
    """The web prompt is built before the wait; the wire value is read after it."""
    from src.web.chat import process_web_chat

    monkeypatch.chdir(tmp_path)
    live = SimpleNamespace(enabled=True)
    builder = _prompt_builder(tmp_path, live)
    built = asyncio.Event()
    original_build = builder.build_full_prompt

    def recording_build(*args, **kwargs):
        prompt = original_build(*args, **kwargs)
        assert "learned value" in prompt
        built.set()
        return prompt

    builder.build_full_prompt = recording_build
    fake = FakeLLM([text_response("web done")])
    bot = make_bot(fake_llm=fake)
    bot.prompt_builder = builder
    bot.tool_loop._prompt_builder = builder

    await bot.llm_gateway.provider_lock.acquire()
    task = asyncio.create_task(
        process_web_chat(
            bot,
            "learned",
            "web-channel",
            user_id="u1",
            persist_channel_lock=False,
        )
    )
    try:
        await asyncio.wait_for(built.wait(), timeout=1)
        await asyncio.sleep(0)
        assert fake.calls == []
        live.enabled = False
    finally:
        bot.llm_gateway.provider_lock.release()

    result = await task
    assert result["response"] == "web done"
    _assert_learning_off_at_transport(fake.calls[0]["system"])


async def test_autonomous_loop_physical_request_refreshes_prompt_with_learning_off(tmp_path):
    live = SimpleNamespace(enabled=True)
    builder = _prompt_builder(tmp_path, live)
    systems: list[str] = []

    class Client(SimpleNamespace):
        async def chat_with_tools(self, *, system, **_kwargs):
            systems.append(system)
            return SimpleNamespace(
                text="loop done",
                tool_calls=[],
                stop_reason="end_turn",
                input_tokens=10,
                output_tokens=2,
                provenance_provider="codex",
                provenance_model="gpt-5.6-sol",
                provenance_reasoning_effort="xhigh",
            )

    client = Client(model="gpt-5.6-sol", reasoning_effort="xhigh")
    gateway = _Gateway(None)
    gateway.client = client
    gateway.codex_client = client
    gateway.active_client = client
    runner, _saved, _cleared = _census_runner(gateway, config=_chat_config())
    runner._prompt_builder = builder

    original_build = builder.build_full_prompt

    def build_then_disable(*args, **kwargs):
        prompt = original_build(*args, **kwargs)
        assert "learned value" in prompt
        live.enabled = False
        return prompt

    builder.build_full_prompt = build_then_disable
    out = await runner.run_autonomous(
        "GOAL: verify transport",
        SimpleNamespace(id=9),
        None,
        "u1",
    )

    assert out == "loop done"
    assert len(systems) == 1
    _assert_learning_off_at_transport(systems[0])


async def test_agent_physical_retry_reloads_learning_switch_each_attempt(tmp_path):
    live = SimpleNamespace(enabled=True)
    builder = _prompt_builder(tmp_path, live)
    systems: list[str] = []

    class Client:
        model = "gpt-5.6-sol"
        reasoning_effort = "xhigh"

        async def chat_with_tools(self, *, system, **_kwargs):
            systems.append(system)
            if len(systems) == 1:
                live.enabled = True
                raise LLMTransportError("retry after live toggle")
            return SimpleNamespace(
                text="agent done",
                tool_calls=[],
                stop_reason="end_turn",
                provenance_provider="codex",
            )

    client = Client()
    tools = _tools(prompt_builder=builder, llm_gateway=_fake_gateway(client))
    tools._agent_manager.spawn.return_value = "agent-1"
    out = await tools._handle_spawn_agent(_message(uid=1), {"label": "x", "goal": "g"})
    assert "spawned" in out
    callback = tools._agent_manager.spawn.call_args.kwargs["iteration_callback"]
    cached = tools._agent_manager.spawn.call_args.kwargs["system_prompt"]
    assert "learned value" in cached

    live.enabled = False
    response = await callback([], cached, [], generation_state={})

    assert response["text"] == "agent done"
    assert len(systems) == 2
    _assert_learning_off_at_transport(systems[0])
    assert "## Persistent Memory" in systems[1]
    assert "memory value" in systems[1]
    assert "## Learned Context" in systems[1]
    assert "learned value" in systems[1]


async def test_legacy_checkpoint_resume_rebuilds_prompt_from_live_components(
    tmp_path, monkeypatch
):
    monkeypatch.chdir(tmp_path)
    live = SimpleNamespace(enabled=True)
    builder = _prompt_builder(tmp_path, live)
    harness = Harness([tool_call_response(("parse_time", {"text": "tomorrow"}))], tmp_path)
    harness.bot.prompt_builder = builder
    harness.bot.tool_loop._prompt_builder = builder
    harness.fake.responses.append(capacity_forever(harness.fake))

    original = FakeMessage("learned")
    harness.register(original)
    result = await harness.bot.tool_loop.run(
        original, [{"role": "user", "content": original.content}]
    )
    assert result[2] is True
    for task in list(harness.manager._waiters.values()):
        task.cancel()
    await asyncio.sleep(0)

    payload_text = harness.row()[1]
    payload = json.loads(payload_text)
    payload["fields"]["system_prompt"] = "legacy prompt without provenance"
    rewrite_payload_with_valid_digest(harness.store, json.dumps(payload, sort_keys=True))
    live.enabled = False

    key = next(iter(harness.manager._waiters), None)
    if key is None:
        from src.turn_state.store import TurnKey

        key = TurnKey("discord", str(original.channel.id), str(original.id))
    row = harness.store.load_resumable_sync(key)
    rebuilt, fetched, reason = await harness.manager._validate_and_rebuild(key, row)

    assert reason is None
    assert fetched is original
    assert rebuilt.system_prompt != "legacy prompt without provenance"
    _assert_learning_off_at_transport(rebuilt.system_prompt)
