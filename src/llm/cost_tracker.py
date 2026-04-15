"""LLM cost tracking — token estimation and USD cost aggregation.

Tracks estimated prompt/completion tokens and USD cost per Codex call,
aggregated by user, channel, and tool.  Exposes data for Prometheus
metrics and the REST API.

Token counts are *estimates* (≈4 chars per token) because the Codex
Responses API does not return usage metadata in its SSE stream.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field

CHARS_PER_TOKEN = 4

# Default pricing per 1K tokens (USD).  Can be overridden via config.
DEFAULT_INPUT_PRICE_PER_1K = 0.005
DEFAULT_OUTPUT_PRICE_PER_1K = 0.015


def estimate_tokens(text: str) -> int:
    """Estimate token count from character length (~4 chars/token)."""
    return max(1, len(text) // CHARS_PER_TOKEN)


@dataclass(slots=True)
class UsageRecord:
    """A single LLM call's usage snapshot."""
    timestamp: float
    input_tokens: int
    output_tokens: int
    cost_usd: float
    model: str
    user_id: str
    channel_id: str
    tools_used: list[str] = field(default_factory=list)


class CostTracker:
    """Aggregates LLM token usage and estimated cost.

    Thread-safe — a lock protects all mutation.  Designed to be a
    long-lived singleton attached to the bot or health server.
    """

    def __init__(
        self,
        input_price_per_1k: float = DEFAULT_INPUT_PRICE_PER_1K,
        output_price_per_1k: float = DEFAULT_OUTPUT_PRICE_PER_1K,
    ) -> None:
        self.input_price_per_1k = input_price_per_1k
        self.output_price_per_1k = output_price_per_1k
        self._lock = threading.Lock()

        # Cumulative counters
        self._total_input_tokens: int = 0
        self._total_output_tokens: int = 0
        self._total_cost_usd: float = 0.0
        self._total_requests: int = 0

        # Per-dimension counters: {key: {input_tokens, output_tokens, cost_usd, requests}}
        self._by_user: dict[str, dict] = defaultdict(lambda: {"input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0, "requests": 0})
        self._by_channel: dict[str, dict] = defaultdict(lambda: {"input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0, "requests": 0})
        self._by_tool: dict[str, dict] = defaultdict(lambda: {"input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0, "requests": 0})

        # Recent records for time-windowed queries (bounded)
        self._recent: list[UsageRecord] = []
        self._max_recent = 1000

    def _compute_cost(self, input_tokens: int, output_tokens: int) -> float:
        return (
            (input_tokens / 1000.0) * self.input_price_per_1k
            + (output_tokens / 1000.0) * self.output_price_per_1k
        )

    def record(
        self,
        input_tokens: int,
        output_tokens: int,
        *,
        model: str = "",
        user_id: str = "",
        channel_id: str = "",
        tools_used: list[str] | None = None,
    ) -> UsageRecord:
        """Record a single LLM call's usage."""
        cost = self._compute_cost(input_tokens, output_tokens)
        rec = UsageRecord(
            timestamp=time.time(),
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost,
            model=model,
            user_id=user_id,
            channel_id=channel_id,
            tools_used=tools_used or [],
        )

        with self._lock:
            self._total_input_tokens += input_tokens
            self._total_output_tokens += output_tokens
            self._total_cost_usd += cost
            self._total_requests += 1

            if user_id:
                u = self._by_user[user_id]
                u["input_tokens"] += input_tokens
                u["output_tokens"] += output_tokens
                u["cost_usd"] += cost
                u["requests"] += 1

            if channel_id:
                c = self._by_channel[channel_id]
                c["input_tokens"] += input_tokens
                c["output_tokens"] += output_tokens
                c["cost_usd"] += cost
                c["requests"] += 1

            for tool in rec.tools_used:
                t = self._by_tool[tool]
                t["input_tokens"] += input_tokens
                t["output_tokens"] += output_tokens
                t["cost_usd"] += cost
                t["requests"] += 1

            self._recent.append(rec)
            if len(self._recent) > self._max_recent:
                self._recent = self._recent[-self._max_recent:]

        return rec

    # ------------------------------------------------------------------
    # Query methods
    # ------------------------------------------------------------------

    def get_totals(self) -> dict:
        with self._lock:
            return {
                "input_tokens": self._total_input_tokens,
                "output_tokens": self._total_output_tokens,
                "total_tokens": self._total_input_tokens + self._total_output_tokens,
                "cost_usd": round(self._total_cost_usd, 6),
                "requests": self._total_requests,
            }

    def get_by_user(self) -> dict[str, dict]:
        with self._lock:
            return {
                uid: {**v, "cost_usd": round(v["cost_usd"], 6)}
                for uid, v in self._by_user.items()
            }

    def get_by_channel(self) -> dict[str, dict]:
        with self._lock:
            return {
                cid: {**v, "cost_usd": round(v["cost_usd"], 6)}
                for cid, v in self._by_channel.items()
            }

    def get_by_tool(self) -> dict[str, dict]:
        with self._lock:
            return {
                tool: {**v, "cost_usd": round(v["cost_usd"], 6)}
                for tool, v in self._by_tool.items()
            }

    def get_recent(self, limit: int = 50) -> list[dict]:
        with self._lock:
            return [
                {
                    "timestamp": r.timestamp,
                    "input_tokens": r.input_tokens,
                    "output_tokens": r.output_tokens,
                    "cost_usd": round(r.cost_usd, 6),
                    "model": r.model,
                    "user_id": r.user_id,
                    "channel_id": r.channel_id,
                    "tools_used": r.tools_used,
                }
                for r in self._recent[-limit:]
            ]

    def get_summary(self) -> dict:
        """Full summary for the /api/usage endpoint."""
        return {
            "totals": self.get_totals(),
            "by_user": self.get_by_user(),
            "by_channel": self.get_by_channel(),
            "by_tool": self.get_by_tool(),
            "recent": self.get_recent(),
            "pricing": {
                "input_per_1k_tokens": self.input_price_per_1k,
                "output_per_1k_tokens": self.output_price_per_1k,
                "note": "Token counts are estimates (~4 chars/token)",
            },
        }

    def get_prometheus_metrics(self) -> dict:
        """Return dict consumed by MetricsCollector."""
        with self._lock:
            return {
                "total_input_tokens": self._total_input_tokens,
                "total_output_tokens": self._total_output_tokens,
                "total_cost_usd": round(self._total_cost_usd, 6),
                "total_requests": self._total_requests,
                "by_user": {
                    uid: {**v, "cost_usd": round(v["cost_usd"], 6)}
                    for uid, v in self._by_user.items()
                },
                "by_channel": {
                    cid: {**v, "cost_usd": round(v["cost_usd"], 6)}
                    for cid, v in self._by_channel.items()
                },
            }
