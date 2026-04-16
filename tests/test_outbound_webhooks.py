"""Tests for outbound webhook dispatcher (Round 48).

Tests the OutboundWebhookDispatcher module: webhook CRUD, event dispatch,
HMAC signing, rate limiting, secret scrubbing, retries, payload building,
config schema, and REST API endpoints.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac as hmac_mod
import json
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.notifications.outbound_webhooks import (
    ALL_EVENT_TYPES,
    MAX_PAYLOAD_CHARS,
    MAX_RECENT_DELIVERIES,
    MAX_WEBHOOKS,
    DeliveryResult,
    EventType,
    OutboundWebhookDispatcher,
    WebhookStats,
    WebhookTarget,
    build_event_payload,
    sign_payload,
    _truncate_payload,
    _MAX_URL_LEN,
    _MAX_SECRET_LEN,
    _MAX_NAME_LEN,
)
from src.config.schema import Config, OutboundWebhooksConfig, OutboundWebhookTarget


def _make_mock_session(*, status=200, text="ok"):
    """Build a mock aiohttp session with a properly configured post context manager."""
    mock_resp = AsyncMock()
    mock_resp.status = status
    mock_resp.text = AsyncMock(return_value=text)

    mock_session = AsyncMock()
    mock_session.post = MagicMock(return_value=AsyncMock(
        __aenter__=AsyncMock(return_value=mock_resp),
        __aexit__=AsyncMock(return_value=False),
    ))
    mock_session.closed = False
    return mock_session, mock_resp


# ---------------------------------------------------------------------------
# EventType enum
# ---------------------------------------------------------------------------


class TestEventType:
    def test_values(self):
        assert EventType.TOOL_EXECUTION == "tool_execution"
        assert EventType.ALERT == "alert"
        assert EventType.SCHEDULE == "schedule"
        assert EventType.AGENT == "agent"
        assert EventType.LOOP == "loop"
        assert EventType.HEALTH == "health"
        assert EventType.WEB_ACTION == "web_action"
        assert EventType.CUSTOM == "custom"

    def test_count(self):
        assert len(EventType) == 8

    def test_str_inheritance(self):
        assert isinstance(EventType.TOOL_EXECUTION, str)

    def test_all_event_types_set(self):
        assert ALL_EVENT_TYPES == frozenset(e.value for e in EventType)
        assert len(ALL_EVENT_TYPES) == 8


# ---------------------------------------------------------------------------
# WebhookTarget dataclass
# ---------------------------------------------------------------------------


class TestWebhookTarget:
    def test_defaults(self):
        t = WebhookTarget(id="abc", name="test", url="https://example.com/hook")
        assert t.id == "abc"
        assert t.name == "test"
        assert t.url == "https://example.com/hook"
        assert t.secret == ""
        assert t.events == []
        assert t.enabled is True
        assert t.scrub_secrets is True
        assert t.verify_ssl is True
        assert t.created_at  # auto-populated

    def test_accepts_event_empty_list(self):
        t = WebhookTarget(id="a", name="t", url="https://x.com", events=[])
        assert t.accepts_event("tool_execution") is True
        assert t.accepts_event("anything") is True

    def test_accepts_event_filtered(self):
        t = WebhookTarget(id="a", name="t", url="https://x.com", events=["alert", "health"])
        assert t.accepts_event("alert") is True
        assert t.accepts_event("health") is True
        assert t.accepts_event("tool_execution") is False
        assert t.accepts_event("loop") is False

    def test_to_dict(self):
        t = WebhookTarget(
            id="xyz",
            name="my-hook",
            url="https://example.com/hook",
            secret="s3cr3t",
            events=["alert"],
            enabled=True,
        )
        d = t.to_dict()
        assert d["id"] == "xyz"
        assert d["name"] == "my-hook"
        assert d["url"] == "https://example.com/hook"
        assert d["has_secret"] is True  # secret is NOT exposed
        assert "secret" not in d
        assert d["events"] == ["alert"]
        assert d["enabled"] is True
        assert d["created_at"]

    def test_to_dict_no_secret(self):
        t = WebhookTarget(id="a", name="t", url="https://x.com", secret="")
        d = t.to_dict()
        assert d["has_secret"] is False

    def test_slots(self):
        assert hasattr(WebhookTarget, "__slots__")


# ---------------------------------------------------------------------------
# DeliveryResult dataclass
# ---------------------------------------------------------------------------


class TestDeliveryResult:
    def test_defaults(self):
        r = DeliveryResult(webhook_id="a", webhook_name="n", event_type="alert")
        assert r.status_code == 0
        assert r.success is False
        assert r.error == ""
        assert r.attempt == 1
        assert r.latency_ms == 0.0
        assert r.timestamp  # auto-populated

    def test_to_dict_minimal(self):
        r = DeliveryResult(
            webhook_id="a", webhook_name="n", event_type="alert", success=True,
            status_code=200, latency_ms=42.6789,
        )
        d = r.to_dict()
        assert d["webhook_id"] == "a"
        assert d["success"] is True
        assert d["status_code"] == 200
        assert d["latency_ms"] == 42.7
        assert "error" not in d  # empty error omitted

    def test_to_dict_with_error(self):
        r = DeliveryResult(
            webhook_id="a", webhook_name="n", event_type="alert", error="timeout",
        )
        d = r.to_dict()
        assert d["error"] == "timeout"

    def test_slots(self):
        assert hasattr(DeliveryResult, "__slots__")


# ---------------------------------------------------------------------------
# WebhookStats
# ---------------------------------------------------------------------------


class TestWebhookStats:
    def test_initial_zeros(self):
        s = WebhookStats()
        assert s.total_dispatched == 0
        assert s.total_delivered == 0
        assert s.total_failed == 0
        assert s.total_retries == 0
        assert s.recent_deliveries == []

    def test_record_success(self):
        s = WebhookStats()
        r = DeliveryResult(
            webhook_id="a", webhook_name="n", event_type="alert",
            success=True, status_code=200, attempt=1,
        )
        s.record(r)
        assert s.total_dispatched == 1
        assert s.total_delivered == 1
        assert s.total_failed == 0
        assert s.total_retries == 0
        assert len(s.recent_deliveries) == 1

    def test_record_failure(self):
        s = WebhookStats()
        r = DeliveryResult(
            webhook_id="a", webhook_name="n", event_type="alert",
            success=False, error="timeout", attempt=1,
        )
        s.record(r)
        assert s.total_dispatched == 1
        assert s.total_delivered == 0
        assert s.total_failed == 1

    def test_record_retry(self):
        s = WebhookStats()
        r = DeliveryResult(
            webhook_id="a", webhook_name="n", event_type="alert",
            success=True, status_code=200, attempt=2,
        )
        s.record(r)
        assert s.total_retries == 1
        assert s.total_delivered == 1

    def test_recent_deliveries_capped(self):
        s = WebhookStats()
        for i in range(MAX_RECENT_DELIVERIES + 50):
            r = DeliveryResult(
                webhook_id=str(i), webhook_name="n", event_type="alert", success=True,
            )
            s.record(r)
        assert len(s.recent_deliveries) == MAX_RECENT_DELIVERIES

    def test_as_dict_keys(self):
        s = WebhookStats()
        d = s.as_dict()
        assert "total_dispatched" in d
        assert "total_delivered" in d
        assert "total_failed" in d
        assert "total_retries" in d
        assert "recent_deliveries_count" in d
        assert "recent_deliveries" in d

    def test_as_dict_recent_capped_at_20(self):
        s = WebhookStats()
        for i in range(30):
            r = DeliveryResult(
                webhook_id=str(i), webhook_name="n", event_type="alert", success=True,
            )
            s.record(r)
        d = s.as_dict()
        assert len(d["recent_deliveries"]) == 20

    def test_json_serializable(self):
        s = WebhookStats()
        r = DeliveryResult(
            webhook_id="a", webhook_name="n", event_type="alert", success=True,
        )
        s.record(r)
        json.dumps(s.as_dict())


# ---------------------------------------------------------------------------
# sign_payload
# ---------------------------------------------------------------------------


class TestSignPayload:
    def test_hmac_matches(self):
        body = b'{"event":"test"}'
        secret = "mysecret"
        sig = sign_payload(body, secret)
        expected = hmac_mod.new(secret.encode(), body, hashlib.sha256).hexdigest()
        assert sig == expected

    def test_different_secrets_differ(self):
        body = b"hello"
        assert sign_payload(body, "key1") != sign_payload(body, "key2")

    def test_different_bodies_differ(self):
        assert sign_payload(b"a", "key") != sign_payload(b"b", "key")


# ---------------------------------------------------------------------------
# build_event_payload
# ---------------------------------------------------------------------------


class TestBuildEventPayload:
    def test_standard_fields(self):
        p = build_event_payload("alert", {"msg": "CPU high"})
        assert p["event_type"] == "alert"
        assert p["data"] == {"msg": "CPU high"}
        assert p["source"] == "odin"
        assert p["event_id"]  # auto-generated
        assert p["timestamp"]  # auto-generated

    def test_custom_event_id(self):
        p = build_event_payload("alert", {}, event_id="abc123")
        assert p["event_id"] == "abc123"

    def test_custom_source(self):
        p = build_event_payload("alert", {}, source="test-bot")
        assert p["source"] == "test-bot"

    def test_json_serializable(self):
        p = build_event_payload("tool_execution", {"result": "ok"})
        json.dumps(p)


# ---------------------------------------------------------------------------
# _truncate_payload
# ---------------------------------------------------------------------------


class TestTruncatePayload:
    def test_short_payload_unchanged(self):
        p = '{"a": 1}'
        assert _truncate_payload(p) == p

    def test_long_payload_truncated(self):
        p = "x" * (MAX_PAYLOAD_CHARS + 100)
        result = _truncate_payload(p)
        assert len(result) <= MAX_PAYLOAD_CHARS
        assert '"_truncated":true}' in result


# ---------------------------------------------------------------------------
# OutboundWebhookDispatcher — CRUD
# ---------------------------------------------------------------------------


class TestDispatcherRegister:
    def test_register_basic(self):
        d = OutboundWebhookDispatcher()
        t = d.register(name="test", url="https://example.com/hook")
        assert t.name == "test"
        assert t.url == "https://example.com/hook"
        assert t.id
        assert t.enabled is True

    def test_register_with_all_fields(self):
        d = OutboundWebhookDispatcher()
        t = d.register(
            name="jenkins",
            url="https://jenkins.local/hook",
            secret="s3cr3t",
            events=["alert", "health"],
            enabled=True,
            scrub_secrets=False,
            verify_ssl=False,
            webhook_id="custom-id",
        )
        assert t.id == "custom-id"
        assert t.secret == "s3cr3t"
        assert t.events == ["alert", "health"]
        assert t.scrub_secrets is False
        assert t.verify_ssl is False

    def test_register_filters_invalid_events(self):
        d = OutboundWebhookDispatcher()
        t = d.register(
            name="test",
            url="https://x.com/hook",
            events=["alert", "bogus", "tool_execution", "not_real"],
        )
        assert t.events == ["alert", "tool_execution"]

    def test_register_no_url_raises(self):
        d = OutboundWebhookDispatcher()
        with pytest.raises(ValueError, match="URL is required"):
            d.register(name="test", url="")

    def test_register_bad_url_scheme(self):
        d = OutboundWebhookDispatcher()
        with pytest.raises(ValueError, match="http://"):
            d.register(name="test", url="ftp://example.com/hook")

    def test_register_url_too_long(self):
        d = OutboundWebhookDispatcher()
        with pytest.raises(ValueError, match="URL must be under"):
            d.register(name="test", url="https://x.com/" + "a" * _MAX_URL_LEN)

    def test_register_name_too_long(self):
        d = OutboundWebhookDispatcher()
        with pytest.raises(ValueError, match="Name must be under"):
            d.register(name="a" * (_MAX_NAME_LEN + 1), url="https://x.com/hook")

    def test_register_secret_too_long(self):
        d = OutboundWebhookDispatcher()
        with pytest.raises(ValueError, match="Secret must be under"):
            d.register(name="test", url="https://x.com/hook", secret="s" * (_MAX_SECRET_LEN + 1))

    def test_register_duplicate_id(self):
        d = OutboundWebhookDispatcher()
        d.register(name="a", url="https://x.com/1", webhook_id="dup")
        with pytest.raises(ValueError, match="already exists"):
            d.register(name="b", url="https://x.com/2", webhook_id="dup")

    def test_register_max_webhooks(self):
        d = OutboundWebhookDispatcher()
        for i in range(MAX_WEBHOOKS):
            d.register(name=f"wh-{i}", url=f"https://x.com/{i}")
        with pytest.raises(ValueError, match="Maximum"):
            d.register(name="overflow", url="https://x.com/overflow")

    def test_register_empty_name_uses_url(self):
        d = OutboundWebhookDispatcher()
        t = d.register(name="", url="https://x.com/hook")
        assert t.name == "https://x.com/hook"


class TestDispatcherUnregister:
    def test_unregister_existing(self):
        d = OutboundWebhookDispatcher()
        t = d.register(name="test", url="https://x.com/hook")
        assert d.unregister(t.id) is True
        assert d.get(t.id) is None

    def test_unregister_nonexistent(self):
        d = OutboundWebhookDispatcher()
        assert d.unregister("no-such-id") is False


class TestDispatcherGet:
    def test_get_existing(self):
        d = OutboundWebhookDispatcher()
        t = d.register(name="test", url="https://x.com/hook")
        assert d.get(t.id) is t

    def test_get_nonexistent(self):
        d = OutboundWebhookDispatcher()
        assert d.get("nope") is None


class TestDispatcherList:
    def test_list_empty(self):
        d = OutboundWebhookDispatcher()
        assert d.list_webhooks() == []

    def test_list_multiple(self):
        d = OutboundWebhookDispatcher()
        d.register(name="a", url="https://a.com/hook")
        d.register(name="b", url="https://b.com/hook")
        assert len(d.list_webhooks()) == 2


class TestDispatcherUpdate:
    def test_update_name(self):
        d = OutboundWebhookDispatcher()
        t = d.register(name="old", url="https://x.com/hook")
        updated = d.update(t.id, name="new")
        assert updated is not None
        assert updated.name == "new"

    def test_update_url(self):
        d = OutboundWebhookDispatcher()
        t = d.register(name="test", url="https://old.com/hook")
        updated = d.update(t.id, url="https://new.com/hook")
        assert updated is not None
        assert updated.url == "https://new.com/hook"

    def test_update_events(self):
        d = OutboundWebhookDispatcher()
        t = d.register(name="test", url="https://x.com/hook", events=["alert"])
        updated = d.update(t.id, events=["health", "loop", "bogus"])
        assert updated is not None
        assert updated.events == ["health", "loop"]

    def test_update_enabled(self):
        d = OutboundWebhookDispatcher()
        t = d.register(name="test", url="https://x.com/hook")
        updated = d.update(t.id, enabled=False)
        assert updated is not None
        assert updated.enabled is False

    def test_update_secret(self):
        d = OutboundWebhookDispatcher()
        t = d.register(name="test", url="https://x.com/hook")
        updated = d.update(t.id, secret="new-secret")
        assert updated is not None
        assert updated.secret == "new-secret"

    def test_update_nonexistent(self):
        d = OutboundWebhookDispatcher()
        assert d.update("nope", name="x") is None

    def test_update_invalid_url(self):
        d = OutboundWebhookDispatcher()
        t = d.register(name="test", url="https://x.com/hook")
        with pytest.raises(ValueError, match="URL is required"):
            d.update(t.id, url="")

    def test_update_bad_url_scheme(self):
        d = OutboundWebhookDispatcher()
        t = d.register(name="test", url="https://x.com/hook")
        with pytest.raises(ValueError, match="http://"):
            d.update(t.id, url="ftp://bad.com")

    def test_update_url_too_long(self):
        d = OutboundWebhookDispatcher()
        t = d.register(name="test", url="https://x.com/hook")
        with pytest.raises(ValueError):
            d.update(t.id, url="https://x.com/" + "a" * _MAX_URL_LEN)

    def test_update_name_too_long(self):
        d = OutboundWebhookDispatcher()
        t = d.register(name="test", url="https://x.com/hook")
        with pytest.raises(ValueError):
            d.update(t.id, name="x" * (_MAX_NAME_LEN + 1))

    def test_update_secret_too_long(self):
        d = OutboundWebhookDispatcher()
        t = d.register(name="test", url="https://x.com/hook")
        with pytest.raises(ValueError):
            d.update(t.id, secret="s" * (_MAX_SECRET_LEN + 1))

    def test_update_verify_ssl(self):
        d = OutboundWebhookDispatcher()
        t = d.register(name="test", url="https://x.com/hook")
        updated = d.update(t.id, verify_ssl=False)
        assert updated is not None
        assert updated.verify_ssl is False

    def test_update_scrub_secrets(self):
        d = OutboundWebhookDispatcher()
        t = d.register(name="test", url="https://x.com/hook")
        updated = d.update(t.id, scrub_secrets=False)
        assert updated is not None
        assert updated.scrub_secrets is False


# ---------------------------------------------------------------------------
# Dispatch + delivery
# ---------------------------------------------------------------------------


class TestDispatchDelivery:
    @pytest.fixture
    def dispatcher(self):
        return OutboundWebhookDispatcher(rate_limit_seconds=0)

    async def test_dispatch_no_targets(self, dispatcher):
        results = await dispatcher.dispatch("alert", {"msg": "test"})
        assert results == []

    async def test_dispatch_no_enabled_targets(self, dispatcher):
        dispatcher.register(name="disabled", url="https://x.com/hook", enabled=False)
        results = await dispatcher.dispatch("alert", {"msg": "test"})
        assert results == []

    async def test_dispatch_event_filter_skips(self, dispatcher):
        dispatcher.register(name="health-only", url="https://x.com/hook", events=["health"])
        results = await dispatcher.dispatch("alert", {"msg": "test"})
        assert results == []

    async def test_dispatch_success(self, dispatcher):
        dispatcher.register(name="test", url="https://x.com/hook", webhook_id="wh1")

        mock_session, _ = _make_mock_session(status=200)
        dispatcher._session = mock_session

        results = await dispatcher.dispatch("alert", {"msg": "cpu high"})
        assert len(results) == 1
        assert results[0].success is True
        assert results[0].status_code == 200
        assert results[0].event_type == "alert"
        assert dispatcher.stats.total_delivered == 1

    async def test_dispatch_failure(self, dispatcher):
        dispatcher.register(name="test", url="https://x.com/hook", webhook_id="wh1")

        mock_session, _ = _make_mock_session(status=500, text="Internal Server Error")
        dispatcher._session = mock_session

        with patch("src.notifications.outbound_webhooks.asyncio.sleep", new_callable=AsyncMock):
            results = await dispatcher.dispatch("alert", {"msg": "test"})
        assert len(results) == 1
        assert results[0].success is False
        assert results[0].status_code == 500
        assert "500" in results[0].error
        assert dispatcher.stats.total_failed == 1

    async def test_dispatch_timeout(self, dispatcher):
        dispatcher.register(name="test", url="https://x.com/hook", webhook_id="wh1")

        mock_session = AsyncMock()
        mock_session.post = MagicMock(side_effect=asyncio.TimeoutError())
        mock_session.closed = False
        dispatcher._session = mock_session

        with patch("src.notifications.outbound_webhooks.asyncio.sleep", new_callable=AsyncMock):
            results = await dispatcher.dispatch("alert", {"msg": "test"})
        assert len(results) == 1
        assert results[0].success is False
        assert results[0].error == "timeout"

    async def test_dispatch_connection_error(self, dispatcher):
        dispatcher.register(name="test", url="https://x.com/hook", webhook_id="wh1")

        mock_session = AsyncMock()
        mock_session.post = MagicMock(side_effect=ConnectionError("refused"))
        mock_session.closed = False
        dispatcher._session = mock_session

        with patch("src.notifications.outbound_webhooks.asyncio.sleep", new_callable=AsyncMock):
            results = await dispatcher.dispatch("alert", {"msg": "test"})
        assert len(results) == 1
        assert results[0].success is False
        assert "refused" in results[0].error

    async def test_dispatch_multiple_targets(self, dispatcher):
        dispatcher.register(name="a", url="https://a.com/hook", webhook_id="wh1")
        dispatcher.register(name="b", url="https://b.com/hook", webhook_id="wh2")

        mock_session, _ = _make_mock_session(status=200)
        dispatcher._session = mock_session

        results = await dispatcher.dispatch("alert", {"msg": "test"})
        assert len(results) == 2
        assert all(r.success for r in results)
        assert dispatcher.stats.total_dispatched == 2


class TestDispatchSigning:
    async def test_signed_payload(self):
        d = OutboundWebhookDispatcher(rate_limit_seconds=0)
        d.register(
            name="signed",
            url="https://x.com/hook",
            secret="test-secret",
            webhook_id="wh1",
        )

        mock_session, _ = _make_mock_session(status=200)
        d._session = mock_session

        await d.dispatch("alert", {"msg": "test"})

        call_kwargs = mock_session.post.call_args
        headers = call_kwargs.kwargs.get("headers", {})
        assert "X-Webhook-Signature" in headers
        sig_header = headers["X-Webhook-Signature"]
        assert sig_header.startswith("sha256=")

        # Verify the signature is correct
        payload_body = call_kwargs.kwargs.get("data", b"")
        expected_sig = sign_payload(payload_body, "test-secret")
        assert sig_header == f"sha256={expected_sig}"

    async def test_unsigned_payload(self):
        d = OutboundWebhookDispatcher(rate_limit_seconds=0)
        d.register(name="unsigned", url="https://x.com/hook", webhook_id="wh1")

        mock_session, _ = _make_mock_session(status=200)
        d._session = mock_session

        await d.dispatch("alert", {"msg": "test"})

        call_kwargs = mock_session.post.call_args
        headers = call_kwargs.kwargs.get("headers", {})
        assert "X-Webhook-Signature" not in headers


class TestDispatchRateLimiting:
    async def test_rate_limited_webhook_skipped(self):
        d = OutboundWebhookDispatcher(rate_limit_seconds=60)
        d.register(name="test", url="https://x.com/hook", webhook_id="wh1")

        mock_session, _ = _make_mock_session(status=200)
        d._session = mock_session

        # First dispatch should work
        results1 = await d.dispatch("alert", {"msg": "first"})
        assert len(results1) == 1

        # Second dispatch immediately should be skipped (rate-limited)
        results2 = await d.dispatch("alert", {"msg": "second"})
        assert len(results2) == 0

    async def test_no_rate_limit(self):
        d = OutboundWebhookDispatcher(rate_limit_seconds=0)
        d.register(name="test", url="https://x.com/hook", webhook_id="wh1")

        mock_session, _ = _make_mock_session(status=200)
        d._session = mock_session

        results1 = await d.dispatch("alert", {"msg": "first"})
        results2 = await d.dispatch("alert", {"msg": "second"})
        assert len(results1) == 1
        assert len(results2) == 1


class TestDispatchSecretScrubbing:
    async def test_scrubs_secrets_in_payload(self):
        d = OutboundWebhookDispatcher(scrub_secrets=True, rate_limit_seconds=0)
        d.register(
            name="test",
            url="https://x.com/hook",
            webhook_id="wh1",
            scrub_secrets=True,
        )

        mock_session, _ = _make_mock_session(status=200)
        d._session = mock_session

        # Include something that looks like a secret
        await d.dispatch("tool_execution", {"output": "password=s3cr3t123"})

        call_kwargs = mock_session.post.call_args
        payload_body = call_kwargs.kwargs.get("data", b"")
        payload_str = payload_body.decode()
        assert "s3cr3t123" not in payload_str
        assert "[REDACTED]" in payload_str

    async def test_no_scrub_when_disabled(self):
        d = OutboundWebhookDispatcher(scrub_secrets=True, rate_limit_seconds=0)
        d.register(
            name="test",
            url="https://x.com/hook",
            webhook_id="wh1",
            scrub_secrets=False,  # per-webhook scrub disabled
        )

        mock_session, _ = _make_mock_session(status=200)
        d._session = mock_session

        await d.dispatch("tool_execution", {"output": "password=s3cr3t123"})

        call_kwargs = mock_session.post.call_args
        payload_body = call_kwargs.kwargs.get("data", b"")
        payload_str = payload_body.decode()
        # With scrubbing disabled per-webhook, the raw password is present
        assert "s3cr3t123" in payload_str


class TestDispatchRetries:
    async def test_retries_on_failure(self):
        d = OutboundWebhookDispatcher(rate_limit_seconds=0)
        d.register(name="test", url="https://x.com/hook", webhook_id="wh1")

        # First two calls fail, third succeeds
        call_count = 0

        def mock_post(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            resp = AsyncMock()
            if call_count < 3:
                resp.status = 500
                resp.text = AsyncMock(return_value="error")
            else:
                resp.status = 200
            return AsyncMock(
                __aenter__=AsyncMock(return_value=resp),
                __aexit__=AsyncMock(return_value=False),
            )

        mock_session = AsyncMock()
        mock_session.post = MagicMock(side_effect=mock_post)
        mock_session.closed = False
        d._session = mock_session

        with patch("src.notifications.outbound_webhooks.asyncio.sleep", new_callable=AsyncMock):
            results = await d.dispatch("alert", {"msg": "test"})

        assert len(results) == 1
        assert results[0].success is True
        assert results[0].attempt == 3
        assert call_count == 3

    async def test_all_retries_fail(self):
        d = OutboundWebhookDispatcher(rate_limit_seconds=0)
        d.register(name="test", url="https://x.com/hook", webhook_id="wh1")

        mock_session, _ = _make_mock_session(status=502, text="Bad Gateway")
        d._session = mock_session

        with patch("src.notifications.outbound_webhooks.asyncio.sleep", new_callable=AsyncMock):
            results = await d.dispatch("alert", {"msg": "test"})

        assert len(results) == 1
        assert results[0].success is False
        assert results[0].attempt == 3  # 1 + 2 retries


# ---------------------------------------------------------------------------
# Fire-and-forget dispatch
# ---------------------------------------------------------------------------


class TestFireAndForget:
    async def test_no_error_on_empty(self):
        d = OutboundWebhookDispatcher(rate_limit_seconds=0)
        await d.dispatch_fire_and_forget("alert", {"msg": "test"})

    async def test_swallows_exceptions(self):
        d = OutboundWebhookDispatcher(rate_limit_seconds=0)
        d.register(name="test", url="https://x.com/hook", webhook_id="wh1")
        # Force _get_session to raise, which will propagate through dispatch
        mock_session = MagicMock()
        mock_session.closed = False
        mock_session.post = MagicMock(side_effect=RuntimeError("boom"))
        d._session = mock_session
        # dispatch_fire_and_forget should catch and log, not raise
        with patch("src.notifications.outbound_webhooks.asyncio.sleep", new_callable=AsyncMock):
            await d.dispatch_fire_and_forget("alert", {"msg": "test"})


# ---------------------------------------------------------------------------
# Test event delivery
# ---------------------------------------------------------------------------


class TestSendTestEvent:
    async def test_nonexistent_webhook(self):
        d = OutboundWebhookDispatcher()
        result = await d.send_test_event("no-such-id")
        assert result is None

    async def test_successful_test(self):
        d = OutboundWebhookDispatcher()
        d.register(name="test", url="https://x.com/hook", webhook_id="wh1")

        mock_session, _ = _make_mock_session(status=200)
        d._session = mock_session

        result = await d.send_test_event("wh1")
        assert result is not None
        assert result.success is True
        assert result.event_type == "test"
        assert d.stats.total_dispatched == 1


# ---------------------------------------------------------------------------
# Observability
# ---------------------------------------------------------------------------


class TestGetStatus:
    def test_empty_status(self):
        d = OutboundWebhookDispatcher()
        s = d.get_status()
        assert s["webhook_count"] == 0
        assert s["enabled_count"] == 0
        assert s["webhooks"] == []
        assert "stats" in s

    def test_status_with_webhooks(self):
        d = OutboundWebhookDispatcher()
        d.register(name="a", url="https://a.com/hook")
        d.register(name="b", url="https://b.com/hook", enabled=False)
        s = d.get_status()
        assert s["webhook_count"] == 2
        assert s["enabled_count"] == 1
        assert len(s["webhooks"]) == 2

    def test_status_json_serializable(self):
        d = OutboundWebhookDispatcher()
        d.register(name="a", url="https://a.com/hook", secret="sec")
        json.dumps(d.get_status())

    def test_status_no_secret_leak(self):
        d = OutboundWebhookDispatcher()
        d.register(name="a", url="https://a.com/hook", secret="super-secret")
        status_json = json.dumps(d.get_status())
        assert "super-secret" not in status_json
        assert "has_secret" in status_json


# ---------------------------------------------------------------------------
# Lifecycle (close)
# ---------------------------------------------------------------------------


class TestLifecycle:
    async def test_close_no_session(self):
        d = OutboundWebhookDispatcher()
        await d.close()  # should not raise

    async def test_close_with_session(self):
        d = OutboundWebhookDispatcher()
        mock_session = AsyncMock()
        mock_session.closed = False
        d._session = mock_session
        await d.close()
        mock_session.close.assert_called_once()
        assert d._session is None

    async def test_close_already_closed(self):
        d = OutboundWebhookDispatcher()
        mock_session = AsyncMock()
        mock_session.closed = True
        d._session = mock_session
        await d.close()
        mock_session.close.assert_not_called()


# ---------------------------------------------------------------------------
# Config schema
# ---------------------------------------------------------------------------


class TestOutboundWebhookTargetConfig:
    def test_defaults(self):
        t = OutboundWebhookTarget()
        assert t.name == ""
        assert t.url == ""
        assert t.secret == ""
        assert t.events == []
        assert t.enabled is True
        assert t.scrub_secrets is True
        assert t.verify_ssl is True

    def test_custom_values(self):
        t = OutboundWebhookTarget(
            name="jenkins",
            url="https://jenkins.local/hook",
            secret="s3cr3t",
            events=["alert", "health"],
            enabled=True,
            scrub_secrets=False,
            verify_ssl=False,
        )
        assert t.name == "jenkins"
        assert t.url == "https://jenkins.local/hook"
        assert t.secret == "s3cr3t"
        assert t.events == ["alert", "health"]
        assert t.scrub_secrets is False
        assert t.verify_ssl is False


class TestOutboundWebhooksConfig:
    def test_defaults(self):
        cfg = OutboundWebhooksConfig()
        assert cfg.enabled is False
        assert cfg.scrub_secrets is True
        assert cfg.rate_limit_seconds == 0.5
        assert cfg.targets == []

    def test_custom_values(self):
        cfg = OutboundWebhooksConfig(
            enabled=True,
            scrub_secrets=False,
            rate_limit_seconds=2.0,
            targets=[
                OutboundWebhookTarget(
                    name="jenkins",
                    url="https://jenkins.local/hook",
                    events=["alert"],
                ),
            ],
        )
        assert cfg.enabled is True
        assert cfg.scrub_secrets is False
        assert cfg.rate_limit_seconds == 2.0
        assert len(cfg.targets) == 1
        assert cfg.targets[0].name == "jenkins"

    def test_in_main_config(self):
        cfg = Config(discord={"token": "test"})
        assert isinstance(cfg.outbound_webhooks, OutboundWebhooksConfig)
        assert cfg.outbound_webhooks.enabled is False

    def test_from_dict(self):
        cfg = Config(
            discord={"token": "test"},
            outbound_webhooks={
                "enabled": True,
                "targets": [
                    {"name": "ci", "url": "https://ci.example.com/hook"},
                ],
            },
        )
        assert cfg.outbound_webhooks.enabled is True
        assert len(cfg.outbound_webhooks.targets) == 1


# ---------------------------------------------------------------------------
# SSL verification
# ---------------------------------------------------------------------------


class TestSSLVerification:
    async def test_verify_ssl_true(self):
        d = OutboundWebhookDispatcher(rate_limit_seconds=0)
        d.register(name="test", url="https://x.com/hook", verify_ssl=True, webhook_id="wh1")

        mock_session, _ = _make_mock_session(status=200)
        d._session = mock_session

        await d.dispatch("alert", {"msg": "test"})

        call_kwargs = mock_session.post.call_args
        # When verify_ssl=True, ssl should be None (default verification)
        assert call_kwargs.kwargs.get("ssl") is None

    async def test_verify_ssl_false(self):
        d = OutboundWebhookDispatcher(rate_limit_seconds=0)
        d.register(name="test", url="https://x.com/hook", verify_ssl=False, webhook_id="wh1")

        mock_session, _ = _make_mock_session(status=200)
        d._session = mock_session

        await d.dispatch("alert", {"msg": "test"})

        call_kwargs = mock_session.post.call_args
        assert call_kwargs.kwargs.get("ssl") is False


# ---------------------------------------------------------------------------
# Imports
# ---------------------------------------------------------------------------


class TestImports:
    def test_public_symbols(self):
        from src.notifications.outbound_webhooks import (
            EventType,
            WebhookTarget,
            DeliveryResult,
            WebhookStats,
            OutboundWebhookDispatcher,
            build_event_payload,
            sign_payload,
            ALL_EVENT_TYPES,
        )
        assert EventType is not None
        assert WebhookTarget is not None
        assert OutboundWebhookDispatcher is not None

    def test_from_package(self):
        from src.notifications import OutboundWebhookDispatcher
        assert OutboundWebhookDispatcher is not None


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    def test_shared_stats(self):
        stats = WebhookStats()
        d1 = OutboundWebhookDispatcher(stats=stats)
        d2 = OutboundWebhookDispatcher(stats=stats)
        assert d1.stats is d2.stats

    async def test_dispatch_empty_data(self):
        d = OutboundWebhookDispatcher(rate_limit_seconds=0)
        d.register(name="test", url="https://x.com/hook", webhook_id="wh1")

        mock_session, _ = _make_mock_session(status=200)
        d._session = mock_session

        results = await d.dispatch("alert", {})
        assert len(results) == 1
        assert results[0].success is True

    def test_negative_rate_limit_clamped(self):
        d = OutboundWebhookDispatcher(rate_limit_seconds=-5)
        assert d._rate_limit_seconds == 0.0

    async def test_dispatch_custom_event_id_and_source(self):
        d = OutboundWebhookDispatcher(rate_limit_seconds=0)
        d.register(name="test", url="https://x.com/hook", webhook_id="wh1")

        mock_session, _ = _make_mock_session(status=200)
        d._session = mock_session

        await d.dispatch("alert", {"msg": "test"}, event_id="evt-123", source="my-bot")

        call_kwargs = mock_session.post.call_args
        payload = json.loads(call_kwargs.kwargs.get("data", b"{}"))
        assert payload["event_id"] == "evt-123"
        assert payload["source"] == "my-bot"

    def test_event_payload_envelope_structure(self):
        p = build_event_payload("tool_execution", {"tool": "run_command", "result": "ok"})
        assert set(p.keys()) == {"event_id", "event_type", "timestamp", "source", "data"}

    async def test_get_session_creates_new(self):
        d = OutboundWebhookDispatcher()
        assert d._session is None
        with patch("src.notifications.outbound_webhooks.aiohttp.ClientSession") as mock_cls:
            mock_instance = MagicMock()
            mock_instance.closed = False
            mock_cls.return_value = mock_instance
            session = await d._get_session()
            assert session is mock_instance
            mock_cls.assert_called_once()

    async def test_get_session_reuses_existing(self):
        d = OutboundWebhookDispatcher()
        mock_session = MagicMock()
        mock_session.closed = False
        d._session = mock_session
        with patch("src.notifications.outbound_webhooks.aiohttp.ClientSession") as mock_cls:
            session = await d._get_session()
            assert session is mock_session
            mock_cls.assert_not_called()

    async def test_get_session_recreates_closed(self):
        d = OutboundWebhookDispatcher()
        mock_old = MagicMock()
        mock_old.closed = True
        d._session = mock_old
        with patch("src.notifications.outbound_webhooks.aiohttp.ClientSession") as mock_cls:
            mock_new = MagicMock()
            mock_new.closed = False
            mock_cls.return_value = mock_new
            session = await d._get_session()
            assert session is mock_new


# ---------------------------------------------------------------------------
# Real-world scenarios
# ---------------------------------------------------------------------------


class TestRealWorldScenarios:
    async def test_jenkins_style_trigger(self):
        """Simulate a Jenkins-style webhook trigger on tool execution."""
        d = OutboundWebhookDispatcher(rate_limit_seconds=0)
        d.register(
            name="jenkins-ci",
            url="https://jenkins.internal/generic-webhook-trigger/invoke",
            secret="jenkins-token-123",
            events=["tool_execution"],
            webhook_id="jenkins1",
        )

        mock_session, _ = _make_mock_session(status=200)
        d._session = mock_session

        results = await d.dispatch(
            "tool_execution",
            {
                "tool_name": "git_ops",
                "action": "push",
                "branch": "main",
                "user": "admin",
            },
        )
        assert len(results) == 1
        assert results[0].success is True

    async def test_pagerduty_style_alert(self):
        """Simulate forwarding an alert to a PagerDuty-style endpoint."""
        d = OutboundWebhookDispatcher(rate_limit_seconds=0)
        d.register(
            name="pagerduty",
            url="https://events.pagerduty.com/v2/enqueue",
            events=["alert", "health"],
            webhook_id="pd1",
        )

        mock_session, _ = _make_mock_session(status=202)
        d._session = mock_session

        results = await d.dispatch(
            "alert",
            {
                "severity": "critical",
                "summary": "Disk usage > 95% on prod-web-01",
                "source": "monitoring",
            },
        )
        assert len(results) == 1
        assert results[0].success is True  # 202 is success

    async def test_multi_webhook_fanout(self):
        """Multiple webhooks subscribing to different events."""
        d = OutboundWebhookDispatcher(rate_limit_seconds=0)
        d.register(name="ci", url="https://ci.com/hook", events=["tool_execution"], webhook_id="wh1")
        d.register(name="pager", url="https://pager.com/hook", events=["alert"], webhook_id="wh2")
        d.register(name="all", url="https://all.com/hook", events=[], webhook_id="wh3")  # all events

        mock_session, _ = _make_mock_session(status=200)
        d._session = mock_session

        # Tool execution: should hit ci + all
        results = await d.dispatch("tool_execution", {"tool": "run_command"})
        assert len(results) == 2

        # Alert: should hit pager + all
        results = await d.dispatch("alert", {"msg": "down"})
        assert len(results) == 2

        # Custom: should hit only all
        results = await d.dispatch("custom", {"data": "test"})
        assert len(results) == 1


# ---------------------------------------------------------------------------
# Content-Type header
# ---------------------------------------------------------------------------


class TestContentTypeHeader:
    async def test_json_content_type(self):
        d = OutboundWebhookDispatcher(rate_limit_seconds=0)
        d.register(name="test", url="https://x.com/hook", webhook_id="wh1")

        mock_session, _ = _make_mock_session(status=200)
        d._session = mock_session

        await d.dispatch("alert", {"msg": "test"})

        call_kwargs = mock_session.post.call_args
        headers = call_kwargs.kwargs.get("headers", {})
        assert headers.get("Content-Type") == "application/json"
