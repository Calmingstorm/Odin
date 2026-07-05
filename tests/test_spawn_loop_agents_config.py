"""spawn_loop_agents config-path fix (soak round-2 finding, 2026-07-05).

The handler read ``bot.config.context_compression`` — an attribute that has
never existed on Config (compression config lives under ``openai_codex``,
and the wiring exposes the resolved object as ``bot.context_compressor``).
Every ``spawn_loop_agents`` invocation since the tool shipped raised
``AttributeError: 'Config' object has no attribute 'context_compression'``.

Now the handler uses ``bot.context_compressor`` with the same defaults as
its sibling ``_handle_spawn_agent``.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from tests.fakes import FakeChannel, FakeLLM, FakeMessage, make_bot


@pytest.fixture(autouse=True)
def _isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


def _bot_with_running_loop():
    bot = make_bot(fake_llm=FakeLLM([]))
    loop_info = SimpleNamespace(
        status="running",
        requester_id="4242",
        requester_name="tester",
        goal="soak goal",
        iteration_count=1,
    )
    bot.loop_manager._loops["loop-1"] = loop_info

    captured = {}

    def spawn_agents_for_loop(**kwargs):
        captured.update(kwargs)
        return ["agent-a"]

    bot.loop_agent_bridge.spawn_agents_for_loop = spawn_agents_for_loop
    return bot, captured


class TestSpawnLoopAgentsConfigPath:
    async def test_no_attribute_error_with_default_config(self):
        """Compression is on by default: the wiring-built compressor object's
        values are forwarded (the old code raised AttributeError here)."""
        bot, captured = _bot_with_running_loop()
        assert bot.context_compressor is not None  # schema default: enabled
        result = await bot._handle_spawn_loop_agents(
            FakeMessage("go", channel=FakeChannel(id=777)),
            {"loop_id": "loop-1", "tasks": [{"goal": "trivial"}]},
        )
        assert "AttributeError" not in result
        assert "agent-a" in result or "spawned" in result.lower()
        assert captured["context_compression_enabled"] is True
        assert captured["max_context_chars"] == bot.context_compressor.max_context_chars
        assert captured["keep_recent_iterations"] == bot.context_compressor.keep_recent_iterations

    async def test_defaults_used_when_compression_disabled(self):
        bot, captured = _bot_with_running_loop()
        bot.context_compressor = None  # config-disabled wiring outcome
        await bot._handle_spawn_loop_agents(
            FakeMessage("go", channel=FakeChannel(id=777)),
            {"loop_id": "loop-1", "tasks": [{"goal": "trivial"}]},
        )
        assert captured["context_compression_enabled"] is False
        assert captured["max_context_chars"] == 750000
        assert captured["keep_recent_iterations"] == 30

    async def test_compressor_values_forwarded_when_enabled(self):
        bot, captured = _bot_with_running_loop()
        bot.context_compressor = SimpleNamespace(
            enabled=True, max_context_chars=123456, keep_recent_iterations=7
        )
        await bot._handle_spawn_loop_agents(
            FakeMessage("go", channel=FakeChannel(id=777)),
            {"loop_id": "loop-1", "tasks": [{"goal": "trivial"}]},
        )
        assert captured["context_compression_enabled"] is True
        assert captured["max_context_chars"] == 123456
        assert captured["keep_recent_iterations"] == 7

    async def test_validation_paths_unchanged(self):
        bot, _ = _bot_with_running_loop()
        msg = FakeMessage("go", channel=FakeChannel(id=777))
        assert "loop_id" in await bot._handle_spawn_loop_agents(msg, {"tasks": [{}]})
        assert "tasks" in await bot._handle_spawn_loop_agents(msg, {"loop_id": "loop-1"})
        assert "not found" in await bot._handle_spawn_loop_agents(
            msg, {"loop_id": "nope", "tasks": [{}]}
        )
