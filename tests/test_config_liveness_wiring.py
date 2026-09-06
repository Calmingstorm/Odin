"""Two wiring paths that claimed to be live and were not.

Both are the same shape: a config update REBINDS ``bot.config``, so anything
holding the boot object — or holding nothing at all — silently keeps serving
the old world while the API reports the new one.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from src.config.schema import Config
from src.discord.wiring import _live_recovery_policy_source


class TestHealthServerBacklink:
    """``bot.health_server`` was never assigned anywhere in src/.

    The bot-facing Slack and Grafana admin routes resolve their runtime through
    that attribute, so on a working install /api/slack/status answered
    ``{"enabled": false}`` and every mutating route 503'd — while Slack
    forwarding itself kept working, because HealthServer owns its own notifier.
    """

    def _server(self, enabled=True):
        from src.config.schema import WebConfig
        from src.health.server import HealthServer

        return HealthServer(port=0, web_config=WebConfig(enabled=enabled, api_token=""))

    def test_set_bot_backlinks_the_server(self):
        server = self._server()
        bot = MagicMock()
        bot.api_token_manager = None
        server.set_bot(bot)
        assert bot.health_server is server

    def test_backlink_happens_even_when_the_web_ui_is_disabled(self):
        """set_bot returns early when web is off — but shutdown still needs the
        link, so the assignment precedes the check."""
        server = self._server(enabled=False)
        bot = MagicMock()
        server.set_bot(bot)
        assert bot.health_server is server

    async def test_stop_is_idempotent(self):
        """Both shutdown_services (via the new backlink) and __main__ hold a
        reference; before the backlink only one could reach it, so a second
        stop() must be a no-op rather than a second cleanup."""
        server = self._server()
        runner = MagicMock()
        calls = []

        async def cleanup():
            calls.append(1)

        runner.cleanup = cleanup
        server._runner = runner
        await server.stop()
        await server.stop()
        assert calls == [1]

    async def test_failed_cleanup_stays_retryable(self):
        """Idempotence must not be achieved by forgetting unfinished work: if
        cleanup raises, the runner is still held so the later shutdown caller
        can retry it."""
        server = self._server()
        runner = MagicMock()
        attempts = []

        async def cleanup():
            attempts.append(1)
            if len(attempts) == 1:
                raise OSError("cleanup failed")

        runner.cleanup = cleanup
        server._runner = runner

        with pytest.raises(OSError):
            await server.stop()
        assert server._runner is runner, "a failed cleanup must remain retryable"

        await server.stop()
        assert len(attempts) == 2
        assert server._runner is None



class TestLiveRecoveryPolicySource:
    """``recovery_policy_source`` carried the comment "config object is
    replaced wholesale on hot reload" while closing over the Config passed to
    build_services — which a rebind never touches."""

    def test_reads_the_current_config_not_the_one_seen_at_build_time(self):
        boot = Config(discord={"token": "fake"})
        boot.llm_recovery.generation_deadline_seconds = 300
        bot = SimpleNamespace(config=boot)
        source = _live_recovery_policy_source(bot)
        assert source().deadline_seconds == 300

        # What a config PUT does: a NEW object, not a mutation of the old one.
        updated = Config(discord={"token": "fake"})
        updated.llm_recovery.generation_deadline_seconds = 45
        bot.config = updated
        assert source().deadline_seconds == 45

    def test_backoff_cap_tracks_the_rebind_too(self):
        boot = Config(discord={"token": "fake"})
        boot.llm_recovery.backoff_cap_seconds = 60
        bot = SimpleNamespace(config=boot)
        source = _live_recovery_policy_source(bot)
        assert source().backoff_cap == 60

        updated = Config(discord={"token": "fake"})
        updated.llm_recovery.backoff_cap_seconds = 5
        bot.config = updated
        assert source().backoff_cap == 5


class TestLiveAgentAdmissionSource:
    """Agent admission follows the rebound bot.config root, not boot config."""

    def test_manager_provider_follows_config_rebind(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        from tests.fakes import make_bot

        bot = make_bot()
        provider = bot.agent_manager._max_concurrent_agents_provider
        assert provider is not None
        assert provider() == 5

        updated = bot.config.model_copy(deep=True)
        updated.agents.max_concurrent_agents = 6
        bot.config = updated
        assert provider() == 6

    def test_catalog_limits_share_live_admission_source(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        from src.tools import get_tool_definitions
        from tests.fakes import make_bot

        bot = make_bot()
        static = next(t for t in get_tool_definitions() if t["name"] == "spawn_agent")
        original = static["description"]

        def description():
            return next(t["description"] for t in bot.tool_catalog.merged_definitions()
                        if t["name"] == "spawn_agent")

        assert "Max 5/channel" in description()
        updated = bot.config.model_copy(deep=True)
        updated.agents.max_concurrent_agents = 17
        updated.agents.max_lifetime_seconds = 12345
        bot.config = updated
        bot.tool_catalog.invalidate()
        assert bot.agent_manager._max_concurrent_agents_provider() == 17
        assert "Max 17/channel" in description()
        assert "lifetime limit for NEW agents: 12345 seconds" in description()
        assert static["description"] == original
