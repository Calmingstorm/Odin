"""Runtime contract for the learned-context master switch.

These tests deliberately exercise only automatic learned/reflection behavior.
Persistent memory is a separate subsystem and must remain present while
learning is disabled.
"""
from __future__ import annotations

import asyncio
import inspect
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import Config, active_config_path, set_active_config_path
from src.discord.prompts import PromptBuilder
from src.discord.turn_recorder import TurnRecorder
from src.learning.reflector import ConversationReflector
from src.tools.executor import ToolExecutor
from src.web.api.config_admin import register_discord_config


def _entry() -> dict:
    return {"key": "runtime_lesson", "category": "operational", "content": "learned value"}


def _live_reflector(tmp_path, live, *, result: str = "[]") -> ConversationReflector:
    path = tmp_path / "learned.json"
    path.write_text(json.dumps({"version": 2, "last_reflection": None, "entries": [_entry()]}))
    reflector = ConversationReflector(
        str(path),
        enabled=True,
        enabled_provider=lambda: live.enabled,
    )
    reflector.set_text_fn(AsyncMock(return_value=result))
    reflector.set_consolidation_fn(AsyncMock(return_value=result))
    return reflector


def _message(content: str = "hello") -> SimpleNamespace:
    return SimpleNamespace(role="user", content=content, user_id="u1")


async def test_master_switch_blocks_operation_session_compaction_and_consolidation(tmp_path):
    live = SimpleNamespace(enabled=False)
    reflector = _live_reflector(tmp_path, live)
    session = SimpleNamespace(messages=[_message(str(i)) for i in range(5)], summary="")

    await reflector.reflect_on_operation("request", ["tool"], [], "response", user_id="u1")
    await reflector.reflect_on_session(session, user_id="u1")
    await reflector.reflect_on_compacted(session.messages, "summary", user_id="u1")
    original = [_entry(), {**_entry(), "key": "second"}]
    assert await reflector._consolidate(original) == original

    reflector._text_fn.assert_not_awaited()
    reflector._consolidation_fn.assert_not_awaited()


async def test_disable_during_operation_generation_prevents_publication(tmp_path):
    live = SimpleNamespace(enabled=True)
    entered = asyncio.Event()
    release = asyncio.Event()
    reflector = _live_reflector(tmp_path, live)

    async def delayed(*_args):
        entered.set()
        await release.wait()
        return json.dumps([
            {"key": "new_lesson", "category": "operational", "content": "must not publish"}
        ])

    reflector.set_text_fn(delayed)
    task = asyncio.create_task(
        reflector.reflect_on_operation("request", ["tool"], [], "response", user_id="u1")
    )
    await entered.wait()
    live.enabled = False
    release.set()
    await task

    assert [entry["key"] for entry in reflector.get_all_entries()] == ["runtime_lesson"]


async def test_disable_during_session_generation_prevents_publication(tmp_path):
    live = SimpleNamespace(enabled=True)
    entered = asyncio.Event()
    release = asyncio.Event()
    reflector = _live_reflector(tmp_path, live)

    async def delayed(*_args):
        entered.set()
        await release.wait()
        return json.dumps([
            {"key": "new_lesson", "category": "operational", "content": "must not publish"}
        ])

    reflector.set_text_fn(delayed)
    session = SimpleNamespace(messages=[_message(str(i)) for i in range(5)], summary="")
    task = asyncio.create_task(reflector.reflect_on_session(session, user_id="u1"))
    await entered.wait()
    live.enabled = False
    release.set()
    await task

    assert [entry["key"] for entry in reflector.get_all_entries()] == ["runtime_lesson"]


@pytest.mark.asyncio
async def test_disable_during_operation_load_prevents_publication(tmp_path, monkeypatch):
    live = SimpleNamespace(enabled=True)
    reflector = _live_reflector(tmp_path, live)
    real_load = reflector._load_for_write

    def disable_after_load():
        data = real_load()
        live.enabled = False
        return data

    monkeypatch.setattr(reflector, "_load_for_write", disable_after_load)
    await reflector.reflect_on_operation("request", ["tool"], [], "response", user_id="u1")

    reflector._text_fn.assert_awaited_once()
    reflector._consolidation_fn.assert_not_awaited()
    assert [entry["key"] for entry in reflector.get_all_entries()] == ["runtime_lesson"]


@pytest.mark.asyncio
async def test_disable_during_session_load_prevents_generation_and_publication(
    tmp_path, monkeypatch
):
    live = SimpleNamespace(enabled=True)
    reflector = _live_reflector(tmp_path, live)
    real_load = reflector._load_for_write

    def disable_after_load():
        data = real_load()
        live.enabled = False
        return data

    monkeypatch.setattr(reflector, "_load_for_write", disable_after_load)
    session = SimpleNamespace(messages=[_message(str(i)) for i in range(5)], summary="")
    await reflector.reflect_on_session(session, user_id="u1")

    reflector._text_fn.assert_not_awaited()
    assert [entry["key"] for entry in reflector.get_all_entries()] == ["runtime_lesson"]


@pytest.mark.asyncio
async def test_disable_then_reenable_during_generation_still_prevents_publication(tmp_path):
    live = SimpleNamespace(enabled=True)
    entered = asyncio.Event()
    release = asyncio.Event()
    reflector = _live_reflector(tmp_path, live)

    async def delayed(*_args):
        entered.set()
        await release.wait()
        return json.dumps([
            {"key": "aba_lesson", "category": "operational", "content": "stale"}
        ])

    reflector.set_text_fn(delayed)
    task = asyncio.create_task(
        reflector.reflect_on_operation("request", ["tool"], [], "response", user_id="u1")
    )
    await entered.wait()
    live.enabled = False
    reflector.observe_enabled_state(False)
    live.enabled = True
    reflector.observe_enabled_state(True)
    release.set()
    await task
    assert [entry["key"] for entry in reflector.get_all_entries()] == ["runtime_lesson"]

    reflector.set_text_fn(AsyncMock(return_value=json.dumps([
        {"key": "fresh_lesson", "category": "operational", "content": "fresh"}
    ])))
    await reflector.reflect_on_operation("request", ["tool"], [], "response", user_id="u1")
    assert {entry["key"] for entry in reflector.get_all_entries()} == {
        "runtime_lesson", "fresh_lesson"
    }


def _prompt_builder(tmp_path, live) -> PromptBuilder:
    reflector = _live_reflector(tmp_path, live)
    config = SimpleNamespace(
        learning=live,
        timezone="UTC",
        personality=SimpleNamespace(
            preset="odin", custom_name="", custom_identity="", custom_voice=""
        ),
        tools=SimpleNamespace(hosts={}),
    )
    tool_executor = SimpleNamespace(
        _load_memory_for_user=lambda _uid: {"manual_note": "memory value"}
    )
    return PromptBuilder(
        get_config=lambda: config,
        context_loader=SimpleNamespace(context={}),
        reflector=reflector,
        skill_manager=None,
        tool_executor=tool_executor,
        channel_state=SimpleNamespace(recent_entries=lambda _channel: []),
        get_codex_client=lambda: None,
    )


def test_prompt_switch_is_live_and_never_removes_persistent_memory(tmp_path):
    live = SimpleNamespace(enabled=True)
    builder = _prompt_builder(tmp_path, live)

    for assemble in (builder.build_full_prompt, builder.build_chat_prompt):
        enabled = assemble(user_id="u1", query="learned")
        assert "## Persistent Memory" in enabled
        assert "memory value" in enabled
        assert "## Learned Context" in enabled

        live.enabled = False
        disabled = assemble(user_id="u1", query="learned")
        assert "## Persistent Memory" in disabled
        assert "memory value" in disabled
        assert "## Learned Context" not in disabled

        live.enabled = True
        assert "## Learned Context" in assemble(user_id="u1", query="learned")


@pytest.mark.asyncio
async def test_config_api_flip_drives_real_prompt_with_persisted_memory(tmp_path):
    """Exercise the UI's actual persistence route against call-time prompt assembly."""
    config_path = tmp_path / "config.yml"
    config_path.write_text("discord:\n  token: fixture\nlearning:\n  enabled: true\n")
    memory_path = tmp_path / "memory.json"
    memory_path.write_text(json.dumps({"global": {"manual_note": "persisted memory value"}}))
    learned_path = tmp_path / "learned.json"
    learned_path.write_text(json.dumps({
        "version": 2, "last_reflection": None, "entries": [_entry()],
    }))

    executor = ToolExecutor.__new__(ToolExecutor)
    executor._memory_path = memory_path
    executor._memory_corrupt_logged_at = 0.0
    bot = SimpleNamespace(
        config=Config(discord={"token": "fixture"}, learning={"enabled": True}),
        api_token_manager=None,
        health_server=None,
        tool_catalog=None,
    )
    builder = PromptBuilder(
        get_config=lambda: bot.config,
        context_loader=SimpleNamespace(context={}),
        reflector=ConversationReflector(str(learned_path), enabled=True),
        skill_manager=None,
        tool_executor=executor,
        channel_state=SimpleNamespace(recent_entries=lambda _channel: []),
        get_codex_client=lambda: None,
    )
    bot.prompt_builder = builder

    routes = web.RouteTableDef()
    register_discord_config(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    previous_path = active_config_path()
    set_active_config_path(config_path)
    try:
        async with TestClient(TestServer(app)) as client:
            enabled = builder.build_full_prompt(user_id="u1", query="learned")
            assert "persisted memory value" in enabled
            assert "## Learned Context" in enabled

            response = await client.put("/api/config", json={"learning": {"enabled": False}})
            assert response.status == 200
            disabled = builder.build_full_prompt(user_id="u1", query="learned")
            assert "persisted memory value" in disabled
            assert "## Learned Context" not in disabled

            response = await client.put("/api/config", json={"learning": {"enabled": True}})
            assert response.status == 200
            reenabled = builder.build_full_prompt(user_id="u1", query="learned")
            assert "persisted memory value" in reenabled
            assert "## Learned Context" in reenabled
    finally:
        set_active_config_path(previous_path)


def test_cached_prompt_refreshes_learned_only_across_runtime_flips(tmp_path):
    live = SimpleNamespace(enabled=True)
    builder = _prompt_builder(tmp_path, live)
    cached = builder.build_full_prompt(user_id="u1", query="learned")
    memory_literal_heading = "literal memory\n## Learned Context\nnot generated"
    agent_suffix = "\n\nAGENT CONTEXT: preserve this byte-for-byte"
    cached = cached.replace("memory value", memory_literal_heading) + agent_suffix

    live.enabled = False
    disabled = builder.refresh_learned_context(cached, user_id="u1", query="learned")
    assert memory_literal_heading in disabled
    assert disabled.endswith(agent_suffix)
    assert "learned value" not in disabled

    live.enabled = True
    reenabled = builder.refresh_learned_context(disabled, user_id="u1", query="learned")
    assert memory_literal_heading in reenabled
    assert "learned value" in reenabled
    assert reenabled.endswith(agent_suffix)

    live.enabled = False
    disabled_again = builder.refresh_learned_context(reenabled, user_id="u1", query="learned")
    assert disabled_again == disabled


@pytest.mark.asyncio
async def test_reflector_provider_tracks_replaced_config_object(tmp_path):
    root = SimpleNamespace(config=Config(discord={"token": "x"}, learning={"enabled": True}))
    reflector = ConversationReflector(
        str(tmp_path / "learned.json"),
        enabled=False,
        enabled_provider=lambda: root.config.learning.enabled,
    )
    assert reflector.is_enabled() is True

    root.config = Config(discord={"token": "x"}, learning={"enabled": False})
    assert reflector.is_enabled() is False

    root.config = Config(discord={"token": "x"}, learning={"enabled": True})
    assert reflector.is_enabled() is True


def test_off_at_build_reenable_preserves_insertion_point_and_cross_builder_refresh(tmp_path):
    live = SimpleNamespace(enabled=False)
    builder_a = _prompt_builder(tmp_path, live)
    builder_a.skill_manager = SimpleNamespace(
        list_skills=lambda: [{"name": "tail_skill", "description": "tail"}]
    )
    built_off = builder_a.build_full_prompt(user_id="u1", query="learned")
    suffix = "\n\nAGENT CONTEXT: exact suffix"
    literal = "memory value\n## Learned Context\nliteral memory heading"
    durable = (built_off + suffix).replace("memory value", literal)

    live.enabled = True
    builder_b = _prompt_builder(tmp_path, live)
    enabled = builder_b.refresh_learned_context(durable, user_id="u1", query="learned")
    assert literal in enabled
    assert enabled.endswith(suffix)
    assert enabled.index("learned value") < enabled.index("## User-Created Skills")

    live.enabled = False
    disabled = builder_b.refresh_learned_context(enabled, user_id="u1", query="learned")
    assert literal in disabled
    assert "learned value" not in disabled
    assert disabled.endswith(suffix)


def test_loop_master_switch_precedes_subswitch_and_gate(monkeypatch):
    learning = SimpleNamespace(enabled=False, loop_reflection_enabled=True)
    gate = Mock()
    reflector = SimpleNamespace(reflect_on_operation=AsyncMock())
    recorder = TurnRecorder(
        get_config=lambda: SimpleNamespace(learning=learning),
        trajectory_saver=None,
        reflector=reflector,
        outbound_webhook_dispatcher=None,
        loop_reflection_gate=gate,
    )
    scheduled = []
    monkeypatch.setattr(
        "src.discord.turn_recorder.fire_and_forget",
        lambda coroutine, name="": scheduled.append(coroutine),
    )

    recorder._maybe_loop_reflect(
        loop_id="loop-1",
        prompt="prompt",
        outcome="failed",
        is_error=True,
        failure_class="test",
        error_text="failed",
        tool_details=[{"tool": "run_command", "result": "failed", "error": True}],
        user_id="u1",
    )

    gate.evaluate.assert_not_called()
    assert scheduled == []


async def test_operation_dispatch_switch_resumes_without_restart():
    learning = SimpleNamespace(enabled=False)
    reflector = SimpleNamespace(reflect_on_operation=AsyncMock())
    recorder = TurnRecorder(
        get_config=lambda: SimpleNamespace(learning=learning),
        trajectory_saver=None,
        reflector=reflector,
        outbound_webhook_dispatcher=None,
        loop_reflection_gate=None,
    )
    await recorder._operational_reflection("failed", ["tool"], "result", True, "u1")
    reflector.reflect_on_operation.assert_not_awaited()
    learning.enabled = True
    await recorder._operational_reflection("failed", ["tool"], "result", True, "u1")
    reflector.reflect_on_operation.assert_awaited_once()
    assert reflector.reflect_on_operation.call_args.kwargs["tool_details"] == [{"tool": "tool"}]
    reflector.reflect_on_operation.reset_mock()
    await recorder._operational_reflection("routine", ["tool"], "result", False, "u1")
    reflector.reflect_on_operation.assert_not_awaited()
    reflector.reflect_on_operation.side_effect = RuntimeError("fixture reflection failure")
    await recorder._operational_reflection("failed", ["tool"], "result", True, "u1")
    reflector.reflect_on_operation.assert_awaited_once()


def test_every_reused_prompt_consumer_applies_call_time_learned_refresh():
    """Cached/default prompts must be scrubbed at each physical model request."""
    from src.discord import tool_loop
    from src.discord.native_tools import agents_tasks

    tool_loop_source = inspect.getsource(tool_loop.ToolLoopRunner)
    agent_source = inspect.getsource(agents_tasks.AgentTaskTools)
    assert tool_loop_source.count("_refresh_learned_prompt(") >= 3  # helper + chat + loop
    assert agent_source.count("_refresh_learned_prompt(") >= 3  # helper + both agent paths
