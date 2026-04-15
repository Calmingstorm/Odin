"""Slack webhook notifier for posting messages alongside Discord output.

Sends messages to Slack incoming webhooks with optional severity-colored
formatting, rate limiting per webhook URL, and secret scrubbing.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any

import aiohttp

from ..llm.secret_scrubber import scrub_output_secrets
from ..odin_log import get_logger

log = get_logger("slack")

MAX_TEXT_LEN = 3000
DEFAULT_RATE_LIMIT = 1  # seconds between messages to same webhook
_SEND_TIMEOUT = 10  # seconds

SEVERITY_COLORS = {
    "info": "#2196F3",
    "warning": "#FF9800",
    "error": "#F44336",
    "success": "#4CAF50",
}

DEFAULT_COLOR = "#9E9E9E"


def _truncate(text: str, limit: int = MAX_TEXT_LEN) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 20] + "\n…(truncated)"


def _discord_to_slack_markdown(text: str) -> str:
    """Convert common Discord markdown to Slack mrkdwn."""
    import re
    text = re.sub(r"\*\*(.+?)\*\*", r"*\1*", text)
    text = re.sub(r"__(.+?)__", r"_\1_", text)
    return text


def build_plain_payload(text: str) -> dict[str, Any]:
    return {"text": _truncate(text)}


def build_formatted_payload(
    title: str,
    message: str,
    severity: str = "info",
    source: str = "odin",
) -> dict[str, Any]:
    color = SEVERITY_COLORS.get(severity, DEFAULT_COLOR)
    fields = []
    if source:
        fields.append({"title": "Source", "value": source, "short": True})
    if severity:
        fields.append({"title": "Severity", "value": severity.upper(), "short": True})

    attachment: dict[str, Any] = {
        "color": color,
        "title": _truncate(title, 150),
        "text": _truncate(message),
        "mrkdwn_in": ["text"],
    }
    if fields:
        attachment["fields"] = fields

    return {
        "text": _truncate(title, 150),
        "attachments": [attachment],
    }


class SlackNotifier:
    """Async Slack webhook poster with rate limiting and secret scrubbing."""

    def __init__(
        self,
        webhook_urls: dict[str, str] | None = None,
        default_webhook_url: str = "",
        scrub_secrets: bool = True,
        rate_limit_seconds: int = DEFAULT_RATE_LIMIT,
    ) -> None:
        self._webhook_urls = dict(webhook_urls) if webhook_urls else {}
        self._default_url = default_webhook_url
        self._scrub = scrub_secrets
        self._rate_limit = max(0, rate_limit_seconds)
        self._last_sent: dict[str, float] = {}
        self._session: aiohttp.ClientSession | None = None
        self._send_count = 0
        self._error_count = 0

    @property
    def send_count(self) -> int:
        return self._send_count

    @property
    def error_count(self) -> int:
        return self._error_count

    @property
    def configured_channels(self) -> list[str]:
        return list(self._webhook_urls.keys())

    def resolve_url(self, channel: str | None = None) -> str | None:
        if channel and channel in self._webhook_urls:
            return self._webhook_urls[channel]
        if channel and channel.startswith("https://"):
            return channel
        return self._default_url or None

    def _check_rate_limit(self, url: str) -> bool:
        if self._rate_limit <= 0:
            return True
        last = self._last_sent.get(url, 0.0)
        return (time.monotonic() - last) >= self._rate_limit

    def _mark_sent(self, url: str) -> None:
        self._last_sent[url] = time.monotonic()

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=_SEND_TIMEOUT),
            )
        return self._session

    async def send(
        self,
        text: str,
        channel: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> bool:
        """Send a message to a Slack webhook. Returns True on success."""
        url = self.resolve_url(channel)
        if not url:
            log.warning("Slack send skipped: no webhook URL for channel=%s", channel)
            return False

        if not self._check_rate_limit(url):
            log.debug("Slack send rate-limited for %s", channel or "default")
            return False

        if self._scrub:
            text = scrub_output_secrets(text)

        if payload is None:
            payload = build_plain_payload(_discord_to_slack_markdown(text))
        else:
            if self._scrub and "text" in payload:
                payload["text"] = scrub_output_secrets(str(payload["text"]))

        try:
            session = await self._get_session()
            async with session.post(url, json=payload) as resp:
                if resp.status == 200:
                    self._mark_sent(url)
                    self._send_count += 1
                    return True
                body = await resp.text()
                log.warning("Slack webhook returned %d: %s", resp.status, body[:200])
                self._error_count += 1
                return False
        except asyncio.TimeoutError:
            log.warning("Slack webhook timed out for channel=%s", channel)
            self._error_count += 1
            return False
        except Exception as exc:
            log.warning("Slack webhook error for channel=%s: %s", channel, exc)
            self._error_count += 1
            return False

    async def send_formatted(
        self,
        title: str,
        message: str,
        severity: str = "info",
        source: str = "odin",
        channel: str | None = None,
    ) -> bool:
        """Send a formatted Slack message with color-coded severity."""
        if self._scrub:
            title = scrub_output_secrets(title)
            message = scrub_output_secrets(message)
        title = _discord_to_slack_markdown(title)
        message = _discord_to_slack_markdown(message)
        payload = build_formatted_payload(title, message, severity, source)
        return await self.send(title, channel=channel, payload=payload)

    async def broadcast(
        self,
        text: str,
        channels: list[str] | None = None,
    ) -> dict[str, bool]:
        """Send a message to multiple channels. Returns {channel: success}."""
        targets = channels or list(self._webhook_urls.keys())
        if not targets:
            if self._default_url:
                result = await self.send(text)
                return {"default": result}
            return {}
        results: dict[str, bool] = {}
        for ch in targets:
            results[ch] = await self.send(text, channel=ch)
        return results

    def get_status(self) -> dict[str, Any]:
        return {
            "configured_channels": self.configured_channels,
            "has_default_url": bool(self._default_url),
            "scrub_secrets": self._scrub,
            "rate_limit_seconds": self._rate_limit,
            "send_count": self._send_count,
            "error_count": self._error_count,
        }

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None
