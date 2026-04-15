"""Tests for Slack webhook notifier (Round 17).

Tests the SlackNotifier module: payload building, message formatting,
rate limiting, secret scrubbing, health server integration, monitoring
watcher integration, config schema, and REST API endpoints.
"""

from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from aiohttp.test_utils import TestClient, TestServer

from src.notifications.slack import (
    DEFAULT_COLOR,
    DEFAULT_RATE_LIMIT,
    MAX_TEXT_LEN,
    SEVERITY_COLORS,
    SlackNotifier,
    _discord_to_slack_markdown,
    _truncate,
    build_formatted_payload,
    build_plain_payload,
)
from src.config.schema import Config, SlackConfig


# ---------------------------------------------------------------------------
# SlackConfig schema
# ---------------------------------------------------------------------------


class TestSlackConfigDefaults:
    def test_defaults(self):
        cfg = SlackConfig()
        assert cfg.enabled is False
        assert cfg.webhook_urls == {}
        assert cfg.default_webhook_url == ""
        assert cfg.scrub_secrets is True
        assert cfg.rate_limit_seconds == 1
        assert cfg.forward_alerts is True
        assert cfg.forward_webhooks is False

    def test_custom_values(self):
        cfg = SlackConfig(
            enabled=True,
            webhook_urls={"alerts": "https://hooks.slack.com/test"},
            default_webhook_url="https://hooks.slack.com/default",
            scrub_secrets=False,
            rate_limit_seconds=5,
            forward_alerts=False,
            forward_webhooks=True,
        )
        assert cfg.enabled is True
        assert cfg.webhook_urls == {"alerts": "https://hooks.slack.com/test"}
        assert cfg.default_webhook_url == "https://hooks.slack.com/default"
        assert cfg.scrub_secrets is False
        assert cfg.rate_limit_seconds == 5
        assert cfg.forward_alerts is False
        assert cfg.forward_webhooks is True

    def test_config_includes_slack(self):
        cfg = Config(discord={"token": "test"})
        assert hasattr(cfg, "slack")
        assert isinstance(cfg.slack, SlackConfig)
        assert cfg.slack.enabled is False

    def test_config_with_slack(self):
        cfg = Config(
            discord={"token": "test"},
            slack={"enabled": True, "default_webhook_url": "https://hooks.slack.com/x"},
        )
        assert cfg.slack.enabled is True
        assert cfg.slack.default_webhook_url == "https://hooks.slack.com/x"

    def test_empty_webhook_urls(self):
        cfg = SlackConfig(webhook_urls={})
        assert cfg.webhook_urls == {}

    def test_multiple_webhook_urls(self):
        urls = {
            "alerts": "https://hooks.slack.com/1",
            "monitoring": "https://hooks.slack.com/2",
            "builds": "https://hooks.slack.com/3",
        }
        cfg = SlackConfig(webhook_urls=urls)
        assert len(cfg.webhook_urls) == 3


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------


class TestTruncate:
    def test_short_text(self):
        assert _truncate("hello") == "hello"

    def test_exact_limit(self):
        text = "a" * MAX_TEXT_LEN
        assert _truncate(text) == text

    def test_over_limit(self):
        text = "a" * (MAX_TEXT_LEN + 100)
        result = _truncate(text)
        assert len(result) <= MAX_TEXT_LEN
        assert result.endswith("…(truncated)")

    def test_custom_limit(self):
        result = _truncate("a" * 200, limit=100)
        assert len(result) <= 100
        assert result.endswith("…(truncated)")

    def test_empty(self):
        assert _truncate("") == ""


class TestDiscordToSlackMarkdown:
    def test_bold(self):
        assert _discord_to_slack_markdown("**bold**") == "*bold*"

    def test_underline_to_italic(self):
        assert _discord_to_slack_markdown("__text__") == "_text_"

    def test_mixed(self):
        result = _discord_to_slack_markdown("**Disk Alert** on `host`")
        assert result == "*Disk Alert* on `host`"

    def test_no_change(self):
        text = "plain text"
        assert _discord_to_slack_markdown(text) == text

    def test_code_preserved(self):
        text = "`code block`"
        assert _discord_to_slack_markdown(text) == "`code block`"

    def test_multiple_bold(self):
        result = _discord_to_slack_markdown("**a** and **b**")
        assert result == "*a* and *b*"


# ---------------------------------------------------------------------------
# Payload building
# ---------------------------------------------------------------------------


class TestBuildPlainPayload:
    def test_basic(self):
        payload = build_plain_payload("hello")
        assert payload == {"text": "hello"}

    def test_truncated(self):
        payload = build_plain_payload("a" * (MAX_TEXT_LEN + 100))
        assert len(payload["text"]) <= MAX_TEXT_LEN

    def test_empty(self):
        payload = build_plain_payload("")
        assert payload == {"text": ""}


class TestBuildFormattedPayload:
    def test_basic(self):
        payload = build_formatted_payload("Title", "Message")
        assert payload["text"] == "Title"
        assert len(payload["attachments"]) == 1
        att = payload["attachments"][0]
        assert att["title"] == "Title"
        assert att["text"] == "Message"
        assert att["color"] == SEVERITY_COLORS["info"]

    def test_severity_colors(self):
        for sev, color in SEVERITY_COLORS.items():
            payload = build_formatted_payload("T", "M", severity=sev)
            assert payload["attachments"][0]["color"] == color

    def test_unknown_severity(self):
        payload = build_formatted_payload("T", "M", severity="custom")
        assert payload["attachments"][0]["color"] == DEFAULT_COLOR

    def test_fields(self):
        payload = build_formatted_payload("T", "M", source="test", severity="error")
        fields = payload["attachments"][0]["fields"]
        sources = [f for f in fields if f["title"] == "Source"]
        assert sources[0]["value"] == "test"
        severities = [f for f in fields if f["title"] == "Severity"]
        assert severities[0]["value"] == "ERROR"

    def test_mrkdwn_in(self):
        payload = build_formatted_payload("T", "M")
        assert "text" in payload["attachments"][0]["mrkdwn_in"]

    def test_truncated_title(self):
        long_title = "a" * 200
        payload = build_formatted_payload(long_title, "M")
        assert len(payload["attachments"][0]["title"]) <= 150

    def test_no_source(self):
        payload = build_formatted_payload("T", "M", source="")
        fields = payload["attachments"][0].get("fields", [])
        sources = [f for f in fields if f["title"] == "Source"]
        assert len(sources) == 0

    def test_no_severity_field(self):
        payload = build_formatted_payload("T", "M", severity="")
        fields = payload["attachments"][0].get("fields", [])
        severities = [f for f in fields if f["title"] == "Severity"]
        assert len(severities) == 0


# ---------------------------------------------------------------------------
# SlackNotifier init
# ---------------------------------------------------------------------------


class TestSlackNotifierInit:
    def test_defaults(self):
        n = SlackNotifier()
        assert n.send_count == 0
        assert n.error_count == 0
        assert n.configured_channels == []

    def test_with_urls(self):
        n = SlackNotifier(webhook_urls={"a": "url_a", "b": "url_b"})
        assert sorted(n.configured_channels) == ["a", "b"]

    def test_default_url(self):
        n = SlackNotifier(default_webhook_url="https://hooks.slack.com/x")
        url = n.resolve_url()
        assert url == "https://hooks.slack.com/x"

    def test_scrub_default(self):
        n = SlackNotifier()
        assert n._scrub is True

    def test_scrub_off(self):
        n = SlackNotifier(scrub_secrets=False)
        assert n._scrub is False

    def test_rate_limit(self):
        n = SlackNotifier(rate_limit_seconds=5)
        assert n._rate_limit == 5

    def test_negative_rate_limit(self):
        n = SlackNotifier(rate_limit_seconds=-1)
        assert n._rate_limit == 0


# ---------------------------------------------------------------------------
# URL resolution
# ---------------------------------------------------------------------------


class TestResolveUrl:
    def test_named_channel(self):
        n = SlackNotifier(webhook_urls={"alerts": "https://hooks/alerts"})
        assert n.resolve_url("alerts") == "https://hooks/alerts"

    def test_unknown_channel_fallback(self):
        n = SlackNotifier(
            webhook_urls={"alerts": "https://hooks/alerts"},
            default_webhook_url="https://hooks/default",
        )
        assert n.resolve_url("unknown") == "https://hooks/default"

    def test_no_url(self):
        n = SlackNotifier()
        assert n.resolve_url("any") is None

    def test_none_channel(self):
        n = SlackNotifier(default_webhook_url="https://hooks/default")
        assert n.resolve_url(None) == "https://hooks/default"

    def test_https_url_passthrough(self):
        n = SlackNotifier()
        assert n.resolve_url("https://hooks.slack.com/custom") == "https://hooks.slack.com/custom"

    def test_named_overrides_default(self):
        n = SlackNotifier(
            webhook_urls={"alerts": "https://specific"},
            default_webhook_url="https://default",
        )
        assert n.resolve_url("alerts") == "https://specific"


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------


class TestRateLimiting:
    def test_first_send_allowed(self):
        n = SlackNotifier(rate_limit_seconds=10)
        assert n._check_rate_limit("url") is True

    def test_second_send_blocked(self):
        n = SlackNotifier(rate_limit_seconds=10)
        n._mark_sent("url")
        assert n._check_rate_limit("url") is False

    def test_send_allowed_after_cooldown(self):
        n = SlackNotifier(rate_limit_seconds=1)
        n._last_sent["url"] = time.monotonic() - 2
        assert n._check_rate_limit("url") is True

    def test_zero_rate_limit(self):
        n = SlackNotifier(rate_limit_seconds=0)
        n._mark_sent("url")
        assert n._check_rate_limit("url") is True

    def test_different_urls(self):
        n = SlackNotifier(rate_limit_seconds=10)
        n._mark_sent("url_a")
        assert n._check_rate_limit("url_b") is True


# ---------------------------------------------------------------------------
# Secret scrubbing
# ---------------------------------------------------------------------------


class TestSecretScrubbing:
    async def test_scrubs_text(self):
        n = SlackNotifier(
            default_webhook_url="https://hooks/test",
            scrub_secrets=True,
        )
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.text = AsyncMock(return_value="ok")
        mock_session = AsyncMock()
        mock_session.post = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=mock_resp),
            __aexit__=AsyncMock(return_value=False),
        ))
        mock_session.closed = False
        n._session = mock_session

        await n.send("password=supersecret123")
        call_args = mock_session.post.call_args
        payload = call_args.kwargs.get("json") or call_args[1].get("json")
        assert "supersecret" not in payload["text"]
        assert "[REDACTED]" in payload["text"]

    async def test_no_scrub_when_disabled(self):
        n = SlackNotifier(
            default_webhook_url="https://hooks/test",
            scrub_secrets=False,
        )
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.text = AsyncMock(return_value="ok")
        mock_session = AsyncMock()
        mock_session.post = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=mock_resp),
            __aexit__=AsyncMock(return_value=False),
        ))
        mock_session.closed = False
        n._session = mock_session

        await n.send("password=supersecret123")
        call_args = mock_session.post.call_args
        payload = call_args.kwargs.get("json") or call_args[1].get("json")
        assert "password=supersecret123" in payload["text"]


# ---------------------------------------------------------------------------
# Send (mocked HTTP)
# ---------------------------------------------------------------------------


class TestSend:
    def _make_notifier(self, **kwargs):
        defaults = {
            "default_webhook_url": "https://hooks.slack.com/test",
            "rate_limit_seconds": 0,
            "scrub_secrets": False,
        }
        defaults.update(kwargs)
        return SlackNotifier(**defaults)

    def _mock_session(self, status=200, body="ok"):
        mock_resp = AsyncMock()
        mock_resp.status = status
        mock_resp.text = AsyncMock(return_value=body)
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(return_value=mock_resp)
        ctx.__aexit__ = AsyncMock(return_value=False)
        session = AsyncMock()
        session.post = MagicMock(return_value=ctx)
        session.closed = False
        return session

    async def test_success(self):
        n = self._make_notifier()
        n._session = self._mock_session()
        result = await n.send("hello")
        assert result is True
        assert n.send_count == 1
        assert n.error_count == 0

    async def test_no_url(self):
        n = SlackNotifier(rate_limit_seconds=0)
        result = await n.send("hello")
        assert result is False

    async def test_error_status(self):
        n = self._make_notifier()
        n._session = self._mock_session(status=400, body="invalid_payload")
        result = await n.send("hello")
        assert result is False
        assert n.error_count == 1

    async def test_timeout(self):
        n = self._make_notifier()
        session = AsyncMock()
        session.closed = False
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(side_effect=asyncio.TimeoutError)
        ctx.__aexit__ = AsyncMock(return_value=False)
        session.post = MagicMock(return_value=ctx)
        n._session = session
        result = await n.send("hello")
        assert result is False
        assert n.error_count == 1

    async def test_connection_error(self):
        n = self._make_notifier()
        session = AsyncMock()
        session.closed = False
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(side_effect=ConnectionError("refused"))
        ctx.__aexit__ = AsyncMock(return_value=False)
        session.post = MagicMock(return_value=ctx)
        n._session = session
        result = await n.send("hello")
        assert result is False
        assert n.error_count == 1

    async def test_rate_limited(self):
        n = self._make_notifier(rate_limit_seconds=60)
        n._session = self._mock_session()
        await n.send("first")
        result = await n.send("second")
        assert result is False
        assert n.send_count == 1

    async def test_named_channel(self):
        n = SlackNotifier(
            webhook_urls={"alerts": "https://hooks/alerts"},
            rate_limit_seconds=0,
            scrub_secrets=False,
        )
        n._session = self._mock_session()
        result = await n.send("hello", channel="alerts")
        assert result is True
        n._session.post.assert_called_once()
        call_url = n._session.post.call_args[0][0]
        assert call_url == "https://hooks/alerts"

    async def test_custom_payload(self):
        n = self._make_notifier()
        n._session = self._mock_session()
        custom = {"text": "custom", "blocks": []}
        result = await n.send("ignored", payload=custom)
        assert result is True
        call_args = n._session.post.call_args
        sent_payload = call_args.kwargs.get("json") or call_args[1].get("json")
        assert sent_payload == custom

    async def test_send_count_increments(self):
        n = self._make_notifier()
        n._session = self._mock_session()
        await n.send("a")
        await n.send("b")
        assert n.send_count == 2

    async def test_discord_markdown_converted(self):
        n = self._make_notifier()
        n._session = self._mock_session()
        await n.send("**bold** text")
        call_args = n._session.post.call_args
        payload = call_args.kwargs.get("json") or call_args[1].get("json")
        assert "*bold*" in payload["text"]
        assert "**" not in payload["text"]


# ---------------------------------------------------------------------------
# Send formatted
# ---------------------------------------------------------------------------


class TestSendFormatted:
    def _make_notifier(self):
        n = SlackNotifier(
            default_webhook_url="https://hooks/test",
            rate_limit_seconds=0,
            scrub_secrets=False,
        )
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.text = AsyncMock(return_value="ok")
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(return_value=mock_resp)
        ctx.__aexit__ = AsyncMock(return_value=False)
        session = AsyncMock()
        session.post = MagicMock(return_value=ctx)
        session.closed = False
        n._session = session
        return n

    async def test_formatted_send(self):
        n = self._make_notifier()
        result = await n.send_formatted("Alert", "Disk full", severity="error")
        assert result is True

    async def test_formatted_payload_structure(self):
        n = self._make_notifier()
        await n.send_formatted("Alert", "Message", severity="warning", source="test")
        call_args = n._session.post.call_args
        payload = call_args.kwargs.get("json") or call_args[1].get("json")
        assert "attachments" in payload
        att = payload["attachments"][0]
        assert att["color"] == SEVERITY_COLORS["warning"]

    async def test_formatted_scrubs_secrets(self):
        n = SlackNotifier(
            default_webhook_url="https://hooks/test",
            rate_limit_seconds=0,
            scrub_secrets=True,
        )
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.text = AsyncMock(return_value="ok")
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(return_value=mock_resp)
        ctx.__aexit__ = AsyncMock(return_value=False)
        session = AsyncMock()
        session.post = MagicMock(return_value=ctx)
        session.closed = False
        n._session = session

        await n.send_formatted("Alert", "password=secret123", severity="error")
        call_args = n._session.post.call_args
        payload = call_args.kwargs.get("json") or call_args[1].get("json")
        assert "secret123" not in str(payload)


# ---------------------------------------------------------------------------
# Broadcast
# ---------------------------------------------------------------------------


class TestBroadcast:
    async def test_broadcast_all_channels(self):
        n = SlackNotifier(
            webhook_urls={"a": "https://a", "b": "https://b"},
            rate_limit_seconds=0,
            scrub_secrets=False,
        )
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.text = AsyncMock(return_value="ok")
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(return_value=mock_resp)
        ctx.__aexit__ = AsyncMock(return_value=False)
        session = AsyncMock()
        session.post = MagicMock(return_value=ctx)
        session.closed = False
        n._session = session

        results = await n.broadcast("hello")
        assert len(results) == 2
        assert all(v is True for v in results.values())

    async def test_broadcast_specific_channels(self):
        n = SlackNotifier(
            webhook_urls={"a": "https://a", "b": "https://b", "c": "https://c"},
            rate_limit_seconds=0,
            scrub_secrets=False,
        )
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.text = AsyncMock(return_value="ok")
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(return_value=mock_resp)
        ctx.__aexit__ = AsyncMock(return_value=False)
        session = AsyncMock()
        session.post = MagicMock(return_value=ctx)
        session.closed = False
        n._session = session

        results = await n.broadcast("hello", channels=["a", "c"])
        assert len(results) == 2
        assert "a" in results
        assert "c" in results
        assert "b" not in results

    async def test_broadcast_no_channels_default(self):
        n = SlackNotifier(
            default_webhook_url="https://default",
            rate_limit_seconds=0,
            scrub_secrets=False,
        )
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.text = AsyncMock(return_value="ok")
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(return_value=mock_resp)
        ctx.__aexit__ = AsyncMock(return_value=False)
        session = AsyncMock()
        session.post = MagicMock(return_value=ctx)
        session.closed = False
        n._session = session

        results = await n.broadcast("hello")
        assert results == {"default": True}

    async def test_broadcast_empty(self):
        n = SlackNotifier(rate_limit_seconds=0)
        results = await n.broadcast("hello")
        assert results == {}


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------


class TestGetStatus:
    def test_status(self):
        n = SlackNotifier(
            webhook_urls={"alerts": "https://hooks/a"},
            default_webhook_url="https://hooks/d",
            rate_limit_seconds=3,
        )
        status = n.get_status()
        assert status["configured_channels"] == ["alerts"]
        assert status["has_default_url"] is True
        assert status["scrub_secrets"] is True
        assert status["rate_limit_seconds"] == 3
        assert status["send_count"] == 0
        assert status["error_count"] == 0

    def test_status_no_urls(self):
        n = SlackNotifier()
        status = n.get_status()
        assert status["configured_channels"] == []
        assert status["has_default_url"] is False


# ---------------------------------------------------------------------------
# Close
# ---------------------------------------------------------------------------


class TestClose:
    async def test_close_session(self):
        n = SlackNotifier()
        mock_session = AsyncMock()
        mock_session.closed = False
        n._session = mock_session
        await n.close()
        mock_session.close.assert_called_once()
        assert n._session is None

    async def test_close_no_session(self):
        n = SlackNotifier()
        await n.close()  # should not raise

    async def test_close_already_closed(self):
        n = SlackNotifier()
        mock_session = AsyncMock()
        mock_session.closed = True
        n._session = mock_session
        await n.close()
        mock_session.close.assert_not_called()


# ---------------------------------------------------------------------------
# Health server integration
# ---------------------------------------------------------------------------


class TestHealthServerSlackIntegration:
    def test_slack_disabled_by_default(self):
        from src.health.server import HealthServer
        from src.config.schema import WebhookConfig
        server = HealthServer(port=0, webhook_config=WebhookConfig(enabled=False))
        assert server.slack_notifier is None

    def test_slack_enabled(self):
        from src.health.server import HealthServer
        from src.config.schema import WebhookConfig
        slack_cfg = SlackConfig(
            enabled=True,
            default_webhook_url="https://hooks.slack.com/test",
        )
        server = HealthServer(
            port=0,
            webhook_config=WebhookConfig(enabled=False),
            slack_config=slack_cfg,
        )
        assert server.slack_notifier is not None
        assert server.slack_notifier.resolve_url() == "https://hooks.slack.com/test"

    def test_slack_notifier_property(self):
        from src.health.server import HealthServer
        from src.config.schema import WebhookConfig
        slack_cfg = SlackConfig(
            enabled=True,
            webhook_urls={"alerts": "https://hooks/a"},
        )
        server = HealthServer(
            port=0,
            webhook_config=WebhookConfig(enabled=False),
            slack_config=slack_cfg,
        )
        notifier = server.slack_notifier
        assert notifier is not None
        assert "alerts" in notifier.configured_channels

    async def test_send_forwards_to_slack_when_enabled(self):
        from src.health.server import HealthServer
        from src.config.schema import WebhookConfig
        slack_cfg = SlackConfig(
            enabled=True,
            forward_webhooks=True,
            default_webhook_url="https://hooks/test",
        )
        server = HealthServer(
            port=0,
            webhook_config=WebhookConfig(
                enabled=True,
                channel_id="123",
            ),
            slack_config=slack_cfg,
        )
        discord_send = AsyncMock()
        server.set_send_message(discord_send)

        mock_notifier = AsyncMock(spec=SlackNotifier)
        server._slack_notifier = mock_notifier

        from aiohttp import web
        resp = await server._send("gitea", "test message")
        assert resp.status == 200
        discord_send.assert_called_once_with("123", "test message")
        mock_notifier.send_formatted.assert_called_once()

    async def test_send_no_slack_forward_when_disabled(self):
        from src.health.server import HealthServer
        from src.config.schema import WebhookConfig
        slack_cfg = SlackConfig(
            enabled=True,
            forward_webhooks=False,
            default_webhook_url="https://hooks/test",
        )
        server = HealthServer(
            port=0,
            webhook_config=WebhookConfig(
                enabled=True,
                channel_id="123",
            ),
            slack_config=slack_cfg,
        )
        discord_send = AsyncMock()
        server.set_send_message(discord_send)

        mock_notifier = AsyncMock(spec=SlackNotifier)
        server._slack_notifier = mock_notifier

        resp = await server._send("gitea", "test message")
        assert resp.status == 200
        discord_send.assert_called_once()
        mock_notifier.send_formatted.assert_not_called()

    async def test_slack_error_does_not_block_discord(self):
        from src.health.server import HealthServer
        from src.config.schema import WebhookConfig
        slack_cfg = SlackConfig(
            enabled=True,
            forward_webhooks=True,
            default_webhook_url="https://hooks/test",
        )
        server = HealthServer(
            port=0,
            webhook_config=WebhookConfig(
                enabled=True,
                channel_id="123",
            ),
            slack_config=slack_cfg,
        )
        discord_send = AsyncMock()
        server.set_send_message(discord_send)

        mock_notifier = AsyncMock(spec=SlackNotifier)
        mock_notifier.send_formatted.side_effect = Exception("slack down")
        server._slack_notifier = mock_notifier

        resp = await server._send("gitea", "test message")
        assert resp.status == 200
        discord_send.assert_called_once()

    async def test_stop_closes_slack(self):
        from src.health.server import HealthServer
        from src.config.schema import WebhookConfig
        slack_cfg = SlackConfig(
            enabled=True,
            default_webhook_url="https://hooks/test",
        )
        server = HealthServer(
            port=0,
            webhook_config=WebhookConfig(enabled=False),
            slack_config=slack_cfg,
        )
        mock_notifier = AsyncMock(spec=SlackNotifier)
        server._slack_notifier = mock_notifier
        server._runner = None
        await server.stop()
        mock_notifier.close.assert_called_once()


# ---------------------------------------------------------------------------
# Monitoring watcher integration
# ---------------------------------------------------------------------------


class TestWatcherSlackIntegration:
    def test_watcher_accepts_slack_notifier(self):
        from src.monitoring.watcher import InfraWatcher
        from src.config.schema import MonitoringConfig
        mock_executor = MagicMock()
        mock_callback = AsyncMock()
        mock_notifier = MagicMock(spec=SlackNotifier)
        watcher = InfraWatcher(
            config=MonitoringConfig(),
            executor=mock_executor,
            alert_callback=mock_callback,
            slack_notifier=mock_notifier,
        )
        assert watcher._slack_notifier is mock_notifier

    def test_watcher_no_slack_default(self):
        from src.monitoring.watcher import InfraWatcher
        from src.config.schema import MonitoringConfig
        watcher = InfraWatcher(
            config=MonitoringConfig(),
            executor=MagicMock(),
            alert_callback=AsyncMock(),
        )
        assert watcher._slack_notifier is None

    async def test_alert_sends_to_discord_and_slack(self):
        from src.monitoring.watcher import InfraWatcher
        from src.config.schema import MonitoringConfig
        mock_callback = AsyncMock()
        mock_notifier = AsyncMock(spec=SlackNotifier)
        watcher = InfraWatcher(
            config=MonitoringConfig(),
            executor=MagicMock(),
            alert_callback=mock_callback,
            slack_notifier=mock_notifier,
        )
        await watcher._alert("Test alert")
        mock_callback.assert_called_once_with("Test alert")
        mock_notifier.send_formatted.assert_called_once()

    async def test_alert_only_discord_when_no_slack(self):
        from src.monitoring.watcher import InfraWatcher
        from src.config.schema import MonitoringConfig
        mock_callback = AsyncMock()
        watcher = InfraWatcher(
            config=MonitoringConfig(),
            executor=MagicMock(),
            alert_callback=mock_callback,
        )
        await watcher._alert("Test alert")
        mock_callback.assert_called_once_with("Test alert")

    async def test_alert_slack_error_does_not_block(self):
        from src.monitoring.watcher import InfraWatcher
        from src.config.schema import MonitoringConfig
        mock_callback = AsyncMock()
        mock_notifier = AsyncMock(spec=SlackNotifier)
        mock_notifier.send_formatted.side_effect = Exception("boom")
        watcher = InfraWatcher(
            config=MonitoringConfig(),
            executor=MagicMock(),
            alert_callback=mock_callback,
            slack_notifier=mock_notifier,
        )
        await watcher._alert("Test alert")
        mock_callback.assert_called_once_with("Test alert")

    async def test_alert_formatted_params(self):
        from src.monitoring.watcher import InfraWatcher
        from src.config.schema import MonitoringConfig
        mock_callback = AsyncMock()
        mock_notifier = AsyncMock(spec=SlackNotifier)
        watcher = InfraWatcher(
            config=MonitoringConfig(),
            executor=MagicMock(),
            alert_callback=mock_callback,
            slack_notifier=mock_notifier,
        )
        await watcher._alert("Disk full")
        call_kwargs = mock_notifier.send_formatted.call_args
        assert call_kwargs.kwargs["title"] == "Infrastructure Alert"
        assert call_kwargs.kwargs["message"] == "Disk full"
        assert call_kwargs.kwargs["severity"] == "error"
        assert call_kwargs.kwargs["source"] == "monitoring"
        assert call_kwargs.kwargs["channel"] == "alerts"


# ---------------------------------------------------------------------------
# REST API endpoints
# ---------------------------------------------------------------------------


class TestSlackAPIEndpoints:
    def _make_bot(self, slack_notifier=None):
        bot = MagicMock()
        hs = MagicMock()
        hs.slack_notifier = slack_notifier
        bot.health_server = hs
        bot.config = Config(
            discord={"token": "test"},
            slack=SlackConfig(enabled=slack_notifier is not None),
        )
        return bot

    def _make_app(self, bot):
        from src.web.api import create_api_routes
        from aiohttp import web
        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)
        return app

    async def test_status_disabled(self):
        bot = self._make_bot()
        app = self._make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/slack/status")
            assert resp.status == 200
            data = await resp.json()
            assert data["enabled"] is False

    async def test_status_enabled(self):
        notifier = SlackNotifier(
            webhook_urls={"alerts": "https://hooks/a"},
            default_webhook_url="https://hooks/d",
        )
        bot = self._make_bot(slack_notifier=notifier)
        app = self._make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/slack/status")
            assert resp.status == 200
            data = await resp.json()
            assert data["enabled"] is True
            assert "alerts" in data["configured_channels"]

    async def test_test_disabled(self):
        bot = self._make_bot()
        app = self._make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.post("/api/slack/test", json={})
            assert resp.status == 503

    async def test_test_enabled(self):
        notifier = AsyncMock(spec=SlackNotifier)
        notifier.send = AsyncMock(return_value=True)
        bot = self._make_bot(slack_notifier=notifier)
        app = self._make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.post("/api/slack/test", json={"message": "hi"})
            assert resp.status == 200
            data = await resp.json()
            assert data["sent"] is True

    async def test_send_disabled(self):
        bot = self._make_bot()
        app = self._make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.post("/api/slack/send", json={"text": "hello"})
            assert resp.status == 503

    async def test_send_plain(self):
        notifier = AsyncMock(spec=SlackNotifier)
        notifier.send = AsyncMock(return_value=True)
        bot = self._make_bot(slack_notifier=notifier)
        app = self._make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.post("/api/slack/send", json={"text": "hello"})
            assert resp.status == 200
            data = await resp.json()
            assert data["sent"] is True
            notifier.send.assert_called_once()

    async def test_send_formatted(self):
        notifier = AsyncMock(spec=SlackNotifier)
        notifier.send_formatted = AsyncMock(return_value=True)
        bot = self._make_bot(slack_notifier=notifier)
        app = self._make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.post("/api/slack/send", json={
                "text": "disk full",
                "severity": "error",
                "title": "Alert",
                "source": "monitor",
            })
            assert resp.status == 200
            data = await resp.json()
            assert data["sent"] is True
            notifier.send_formatted.assert_called_once()

    async def test_send_no_text(self):
        notifier = AsyncMock(spec=SlackNotifier)
        bot = self._make_bot(slack_notifier=notifier)
        app = self._make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.post("/api/slack/send", json={"severity": "info"})
            assert resp.status == 400

    async def test_send_invalid_json(self):
        notifier = AsyncMock(spec=SlackNotifier)
        bot = self._make_bot(slack_notifier=notifier)
        app = self._make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.post(
                "/api/slack/send",
                data=b"not json",
                headers={"Content-Type": "application/json"},
            )
            assert resp.status == 400

    async def test_test_with_channel(self):
        notifier = AsyncMock(spec=SlackNotifier)
        notifier.send = AsyncMock(return_value=True)
        bot = self._make_bot(slack_notifier=notifier)
        app = self._make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.post("/api/slack/test", json={"channel": "alerts"})
            assert resp.status == 200
            notifier.send.assert_called_once()
            call_kwargs = notifier.send.call_args
            assert call_kwargs.kwargs.get("channel") == "alerts"


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    def test_severity_colors_complete(self):
        expected = {"info", "warning", "error", "success"}
        assert set(SEVERITY_COLORS.keys()) == expected

    def test_default_color_not_in_severity(self):
        assert DEFAULT_COLOR not in SEVERITY_COLORS.values()

    async def test_send_empty_text(self):
        n = SlackNotifier(
            default_webhook_url="https://hooks/test",
            rate_limit_seconds=0,
            scrub_secrets=False,
        )
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.text = AsyncMock(return_value="ok")
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(return_value=mock_resp)
        ctx.__aexit__ = AsyncMock(return_value=False)
        session = AsyncMock()
        session.post = MagicMock(return_value=ctx)
        session.closed = False
        n._session = session
        result = await n.send("")
        assert result is True

    def test_max_text_len_is_reasonable(self):
        assert 1000 <= MAX_TEXT_LEN <= 10000

    def test_default_rate_limit(self):
        assert DEFAULT_RATE_LIMIT == 1

    def test_webhook_url_dict_not_shared(self):
        urls = {"a": "url"}
        n = SlackNotifier(webhook_urls=urls)
        urls["b"] = "url2"
        assert "b" not in n._webhook_urls

    async def test_multiple_errors_tracked(self):
        n = SlackNotifier(
            default_webhook_url="https://hooks/test",
            rate_limit_seconds=0,
        )
        session = AsyncMock()
        session.closed = False
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(side_effect=ConnectionError("refused"))
        ctx.__aexit__ = AsyncMock(return_value=False)
        session.post = MagicMock(return_value=ctx)
        n._session = session
        await n.send("a")
        await n.send("b")
        assert n.error_count == 2

    def test_truncate_marker(self):
        result = _truncate("a" * 5000)
        assert "…(truncated)" in result

    async def test_get_session_creates_new(self):
        n = SlackNotifier()
        assert n._session is None
        session = await n._get_session()
        assert session is not None
        await n.close()

    async def test_formatted_converts_discord_markdown(self):
        n = SlackNotifier(
            default_webhook_url="https://hooks/test",
            rate_limit_seconds=0,
            scrub_secrets=False,
        )
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.text = AsyncMock(return_value="ok")
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(return_value=mock_resp)
        ctx.__aexit__ = AsyncMock(return_value=False)
        session = AsyncMock()
        session.post = MagicMock(return_value=ctx)
        session.closed = False
        n._session = session

        await n.send_formatted("**Alert**", "**msg**")
        call_args = n._session.post.call_args
        payload = call_args.kwargs.get("json") or call_args[1].get("json")
        att = payload["attachments"][0]
        assert "**" not in att["title"]
        assert "**" not in att["text"]

    def test_plain_payload_structure(self):
        p = build_plain_payload("test")
        assert set(p.keys()) == {"text"}

    def test_formatted_payload_keys(self):
        p = build_formatted_payload("T", "M", severity="info", source="src")
        assert "text" in p
        assert "attachments" in p
        att = p["attachments"][0]
        assert "color" in att
        assert "title" in att
        assert "text" in att
        assert "fields" in att
        assert "mrkdwn_in" in att


# ---------------------------------------------------------------------------
# Module imports
# ---------------------------------------------------------------------------


class TestRound20RateLimitFix:
    """Round 20 REVIEWER: verify rate limit only set on successful send."""

    def _make_notifier(self, **kwargs):
        defaults = {
            "default_webhook_url": "https://hooks.slack.com/test",
            "rate_limit_seconds": 10,
            "scrub_secrets": False,
        }
        defaults.update(kwargs)
        return SlackNotifier(**defaults)

    def _mock_session(self, status=200, body="ok"):
        mock_resp = AsyncMock()
        mock_resp.status = status
        mock_resp.text = AsyncMock(return_value=body)
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(return_value=mock_resp)
        ctx.__aexit__ = AsyncMock(return_value=False)
        session = AsyncMock()
        session.post = MagicMock(return_value=ctx)
        session.closed = False
        return session

    async def test_failed_send_does_not_rate_limit(self):
        n = self._make_notifier()
        n._session = self._mock_session(status=500, body="error")
        result = await n.send("first try")
        assert result is False
        assert n._check_rate_limit(n.resolve_url(None))

    async def test_successful_send_sets_rate_limit(self):
        n = self._make_notifier()
        n._session = self._mock_session(status=200)
        result = await n.send("message")
        assert result is True
        assert not n._check_rate_limit(n.resolve_url(None))

    async def test_retry_allowed_after_failure(self):
        n = self._make_notifier()
        fail_session = self._mock_session(status=502, body="bad gateway")
        n._session = fail_session
        r1 = await n.send("attempt 1")
        assert r1 is False
        ok_session = self._mock_session(status=200)
        n._session = ok_session
        r2 = await n.send("attempt 2")
        assert r2 is True
        assert n.send_count == 1

    async def test_timeout_does_not_rate_limit(self):
        n = self._make_notifier()
        session = AsyncMock()
        session.closed = False
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(side_effect=asyncio.TimeoutError)
        ctx.__aexit__ = AsyncMock(return_value=False)
        session.post = MagicMock(return_value=ctx)
        n._session = session
        await n.send("timeout msg")
        assert n._check_rate_limit(n.resolve_url(None))


class TestModuleImports:
    def test_notifications_package(self):
        from src.notifications import SlackNotifier as SN
        assert SN is SlackNotifier

    def test_slack_notifier_class(self):
        assert hasattr(SlackNotifier, "send")
        assert hasattr(SlackNotifier, "send_formatted")
        assert hasattr(SlackNotifier, "broadcast")
        assert hasattr(SlackNotifier, "close")
        assert hasattr(SlackNotifier, "get_status")
