"""Outbound webhook dispatcher — push structured events to registered URLs.

Odin can post JSON event payloads to external HTTP endpoints when events
occur (tool executions, alerts, scheduled actions, etc.).  Each registered
webhook specifies which event types it subscribes to.  Payloads are
HMAC-SHA256 signed when a per-webhook secret is configured.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

import aiohttp

from ..llm.secret_scrubber import scrub_output_secrets
from ..odin_log import get_logger

log = get_logger("outbound_webhooks")

# Hard limits
MAX_WEBHOOKS = 50
MAX_PAYLOAD_CHARS = 64_000
MAX_RECENT_DELIVERIES = 200
_SEND_TIMEOUT = 10  # seconds per delivery attempt
_MAX_RETRIES = 2  # total attempts = 1 + retries
_RETRY_BASE_DELAY = 1.0  # seconds (doubles each retry)
_MAX_URL_LEN = 2048
_MAX_SECRET_LEN = 256
_MAX_NAME_LEN = 128


class EventType(str, Enum):
    """Categories of events that can trigger outbound webhooks."""

    TOOL_EXECUTION = "tool_execution"
    ALERT = "alert"
    SCHEDULE = "schedule"
    AGENT = "agent"
    LOOP = "loop"
    HEALTH = "health"
    WEB_ACTION = "web_action"
    CUSTOM = "custom"


ALL_EVENT_TYPES: frozenset[str] = frozenset(e.value for e in EventType)


@dataclass(slots=True)
class WebhookTarget:
    """A registered outbound webhook endpoint."""

    id: str
    name: str
    url: str
    secret: str = ""  # HMAC-SHA256 signing key; empty = unsigned
    events: list[str] = field(default_factory=list)  # empty = all events
    enabled: bool = True
    scrub_secrets: bool = True
    verify_ssl: bool = True
    created_at: str = ""

    def __post_init__(self) -> None:
        if not self.created_at:
            self.created_at = datetime.now(timezone.utc).isoformat()

    def accepts_event(self, event_type: str) -> bool:
        """Return True if this webhook subscribes to the given event type."""
        if not self.events:
            return True  # empty list = all events
        return event_type in self.events

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "url": self.url,
            "has_secret": bool(self.secret),
            "events": list(self.events),
            "enabled": self.enabled,
            "scrub_secrets": self.scrub_secrets,
            "verify_ssl": self.verify_ssl,
            "created_at": self.created_at,
        }


@dataclass(slots=True)
class DeliveryResult:
    """Outcome of a single webhook delivery attempt."""

    webhook_id: str
    webhook_name: str
    event_type: str
    status_code: int = 0
    success: bool = False
    error: str = ""
    attempt: int = 1
    latency_ms: float = 0.0
    timestamp: str = ""

    def __post_init__(self) -> None:
        if not self.timestamp:
            self.timestamp = datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "webhook_id": self.webhook_id,
            "webhook_name": self.webhook_name,
            "event_type": self.event_type,
            "status_code": self.status_code,
            "success": self.success,
            "attempt": self.attempt,
            "latency_ms": round(self.latency_ms, 1),
            "timestamp": self.timestamp,
        }
        if self.error:
            d["error"] = self.error
        return d


@dataclass
class WebhookStats:
    """Aggregate delivery statistics."""

    total_dispatched: int = 0
    total_delivered: int = 0
    total_failed: int = 0
    total_retries: int = 0
    recent_deliveries: list[dict[str, Any]] = field(default_factory=list)

    def record(self, result: DeliveryResult) -> None:
        self.total_dispatched += 1
        if result.success:
            self.total_delivered += 1
        else:
            self.total_failed += 1
        if result.attempt > 1:
            self.total_retries += 1
        self.recent_deliveries.append(result.to_dict())
        if len(self.recent_deliveries) > MAX_RECENT_DELIVERIES:
            self.recent_deliveries = self.recent_deliveries[-MAX_RECENT_DELIVERIES:]

    def as_dict(self) -> dict[str, Any]:
        return {
            "total_dispatched": self.total_dispatched,
            "total_delivered": self.total_delivered,
            "total_failed": self.total_failed,
            "total_retries": self.total_retries,
            "recent_deliveries_count": len(self.recent_deliveries),
            "recent_deliveries": self.recent_deliveries[-20:],
        }


def sign_payload(body: bytes, secret: str) -> str:
    """Compute HMAC-SHA256 hex digest for a payload body."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def build_event_payload(
    event_type: str,
    data: dict[str, Any],
    *,
    event_id: str = "",
    source: str = "odin",
) -> dict[str, Any]:
    """Construct the standard outbound webhook payload envelope."""
    return {
        "event_id": event_id or uuid.uuid4().hex,
        "event_type": event_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "data": data,
    }


def _truncate_payload(payload: str) -> str:
    if len(payload) <= MAX_PAYLOAD_CHARS:
        return payload
    return payload[:MAX_PAYLOAD_CHARS - 30] + ',"_truncated":true}'


class OutboundWebhookDispatcher:
    """Manages registered webhook targets and dispatches events to them."""

    __slots__ = (
        "_webhooks",
        "_session",
        "_stats",
        "_scrub",
        "_rate_limit_seconds",
        "_last_sent",
    )

    def __init__(
        self,
        *,
        scrub_secrets: bool = True,
        rate_limit_seconds: float = 0.5,
        stats: WebhookStats | None = None,
    ) -> None:
        self._webhooks: dict[str, WebhookTarget] = {}
        self._session: aiohttp.ClientSession | None = None
        self._stats = stats or WebhookStats()
        self._scrub = scrub_secrets
        self._rate_limit_seconds = max(0.0, rate_limit_seconds)
        self._last_sent: dict[str, float] = {}

    @property
    def stats(self) -> WebhookStats:
        return self._stats

    # ------------------------------------------------------------------
    # Webhook CRUD
    # ------------------------------------------------------------------

    def register(
        self,
        *,
        name: str,
        url: str,
        secret: str = "",
        events: list[str] | None = None,
        enabled: bool = True,
        scrub_secrets: bool = True,
        verify_ssl: bool = True,
        webhook_id: str = "",
    ) -> WebhookTarget:
        """Register a new outbound webhook. Returns the created target."""
        if len(self._webhooks) >= MAX_WEBHOOKS:
            raise ValueError(f"Maximum of {MAX_WEBHOOKS} webhooks reached")
        if not url:
            raise ValueError("Webhook URL is required")
        if len(url) > _MAX_URL_LEN:
            raise ValueError(f"URL must be under {_MAX_URL_LEN} characters")
        if not url.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        if len(name) > _MAX_NAME_LEN:
            raise ValueError(f"Name must be under {_MAX_NAME_LEN} characters")
        if len(secret) > _MAX_SECRET_LEN:
            raise ValueError(f"Secret must be under {_MAX_SECRET_LEN} characters")

        wh_id = webhook_id or uuid.uuid4().hex[:12]
        if wh_id in self._webhooks:
            raise ValueError(f"Webhook ID '{wh_id}' already exists")

        valid_events = [e for e in (events or []) if e in ALL_EVENT_TYPES]

        target = WebhookTarget(
            id=wh_id,
            name=name or url,
            url=url,
            secret=secret,
            events=valid_events,
            enabled=enabled,
            scrub_secrets=scrub_secrets,
            verify_ssl=verify_ssl,
        )
        self._webhooks[wh_id] = target
        log.info("Registered outbound webhook %s -> %s", wh_id, url)
        return target

    def unregister(self, webhook_id: str) -> bool:
        """Remove a webhook. Returns True if it existed."""
        removed = self._webhooks.pop(webhook_id, None)
        if removed:
            log.info("Unregistered outbound webhook %s (%s)", webhook_id, removed.url)
        return removed is not None

    def get(self, webhook_id: str) -> WebhookTarget | None:
        return self._webhooks.get(webhook_id)

    def list_webhooks(self) -> list[WebhookTarget]:
        return list(self._webhooks.values())

    def update(
        self,
        webhook_id: str,
        *,
        name: str | None = None,
        url: str | None = None,
        secret: str | None = None,
        events: list[str] | None = None,
        enabled: bool | None = None,
        scrub_secrets: bool | None = None,
        verify_ssl: bool | None = None,
    ) -> WebhookTarget | None:
        """Update fields on an existing webhook. Returns None if not found."""
        wh = self._webhooks.get(webhook_id)
        if wh is None:
            return None

        if url is not None:
            if not url:
                raise ValueError("Webhook URL is required")
            if len(url) > _MAX_URL_LEN:
                raise ValueError(f"URL must be under {_MAX_URL_LEN} characters")
            if not url.startswith(("http://", "https://")):
                raise ValueError("URL must start with http:// or https://")
            wh.url = url
        if name is not None:
            if len(name) > _MAX_NAME_LEN:
                raise ValueError(f"Name must be under {_MAX_NAME_LEN} characters")
            wh.name = name
        if secret is not None:
            if len(secret) > _MAX_SECRET_LEN:
                raise ValueError(f"Secret must be under {_MAX_SECRET_LEN} characters")
            wh.secret = secret
        if events is not None:
            wh.events = [e for e in events if e in ALL_EVENT_TYPES]
        if enabled is not None:
            wh.enabled = enabled
        if scrub_secrets is not None:
            wh.scrub_secrets = scrub_secrets
        if verify_ssl is not None:
            wh.verify_ssl = verify_ssl

        return wh

    # ------------------------------------------------------------------
    # Delivery
    # ------------------------------------------------------------------

    def _check_rate_limit(self, webhook_id: str) -> bool:
        if self._rate_limit_seconds <= 0:
            return True
        last = self._last_sent.get(webhook_id, 0.0)
        return (time.monotonic() - last) >= self._rate_limit_seconds

    def _mark_sent(self, webhook_id: str) -> None:
        self._last_sent[webhook_id] = time.monotonic()

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=_SEND_TIMEOUT),
            )
        return self._session

    async def _deliver_one(
        self,
        target: WebhookTarget,
        payload_body: bytes,
        event_type: str,
    ) -> DeliveryResult:
        """Deliver a payload to a single webhook with retries."""
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if target.secret:
            sig = sign_payload(payload_body, target.secret)
            headers["X-Webhook-Signature"] = f"sha256={sig}"

        last_result: DeliveryResult | None = None
        ssl_ctx: bool | None = None if target.verify_ssl else False

        for attempt in range(1, _MAX_RETRIES + 2):  # 1-indexed, up to 3 attempts
            t0 = time.monotonic()
            try:
                session = await self._get_session()
                async with session.post(
                    target.url,
                    data=payload_body,
                    headers=headers,
                    ssl=ssl_ctx,
                ) as resp:
                    latency = (time.monotonic() - t0) * 1000
                    success = 200 <= resp.status < 300
                    error = ""
                    if not success:
                        body_text = await resp.text()
                        error = f"HTTP {resp.status}: {body_text[:200]}"

                    last_result = DeliveryResult(
                        webhook_id=target.id,
                        webhook_name=target.name,
                        event_type=event_type,
                        status_code=resp.status,
                        success=success,
                        error=error,
                        attempt=attempt,
                        latency_ms=latency,
                    )
                    if success:
                        return last_result

            except asyncio.TimeoutError:
                latency = (time.monotonic() - t0) * 1000
                last_result = DeliveryResult(
                    webhook_id=target.id,
                    webhook_name=target.name,
                    event_type=event_type,
                    error="timeout",
                    attempt=attempt,
                    latency_ms=latency,
                )
            except Exception as exc:
                latency = (time.monotonic() - t0) * 1000
                last_result = DeliveryResult(
                    webhook_id=target.id,
                    webhook_name=target.name,
                    event_type=event_type,
                    error=str(exc)[:200],
                    attempt=attempt,
                    latency_ms=latency,
                )

            # Retry with exponential backoff
            if attempt <= _MAX_RETRIES:
                await asyncio.sleep(_RETRY_BASE_DELAY * (2 ** (attempt - 1)))

        return last_result  # type: ignore[return-value]

    async def dispatch(
        self,
        event_type: str,
        data: dict[str, Any],
        *,
        event_id: str = "",
        source: str = "odin",
    ) -> list[DeliveryResult]:
        """Dispatch an event to all matching enabled webhooks.

        Returns a list of DeliveryResults (one per webhook that was attempted).
        """
        targets = [
            wh
            for wh in self._webhooks.values()
            if wh.enabled
            and wh.accepts_event(event_type)
            and self._check_rate_limit(wh.id)
        ]
        if not targets:
            return []

        payload = build_event_payload(
            event_type, data, event_id=event_id, source=source,
        )

        results: list[DeliveryResult] = []

        for target in targets:
            payload_json = json.dumps(payload, default=str)

            if target.scrub_secrets and self._scrub:
                payload_json = scrub_output_secrets(payload_json)

            payload_json = _truncate_payload(payload_json)
            payload_body = payload_json.encode()

            result = await self._deliver_one(target, payload_body, event_type)
            self._mark_sent(target.id)
            self._stats.record(result)
            results.append(result)

            if result.success:
                log.debug(
                    "Delivered %s event to webhook %s (%s)",
                    event_type, target.id, target.name,
                )
            else:
                log.warning(
                    "Failed to deliver %s event to webhook %s (%s): %s",
                    event_type, target.id, target.name, result.error,
                )

        return results

    async def dispatch_fire_and_forget(
        self,
        event_type: str,
        data: dict[str, Any],
        *,
        event_id: str = "",
        source: str = "odin",
    ) -> None:
        """Dispatch an event without waiting for delivery results.

        Suitable for use as an audit event callback where blocking is
        undesirable.
        """
        try:
            await self.dispatch(
                event_type, data, event_id=event_id, source=source,
            )
        except Exception as exc:
            log.warning("Fire-and-forget dispatch error: %s", exc)

    async def send_test_event(self, webhook_id: str) -> DeliveryResult | None:
        """Send a test event to a specific webhook. Returns None if not found."""
        target = self._webhooks.get(webhook_id)
        if target is None:
            return None

        payload = build_event_payload(
            "test",
            {"message": "This is a test event from Odin.", "webhook_id": webhook_id},
        )
        payload_body = json.dumps(payload, default=str).encode()
        result = await self._deliver_one(target, payload_body, "test")
        self._stats.record(result)
        return result

    # ------------------------------------------------------------------
    # Observability
    # ------------------------------------------------------------------

    def get_status(self) -> dict[str, Any]:
        return {
            "webhook_count": len(self._webhooks),
            "enabled_count": sum(1 for w in self._webhooks.values() if w.enabled),
            "scrub_secrets": self._scrub,
            "rate_limit_seconds": self._rate_limit_seconds,
            "webhooks": [w.to_dict() for w in self._webhooks.values()],
            "stats": self._stats.as_dict(),
        }

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None
