"""Bulkhead isolation — semaphore-based concurrency limiters for resource categories.

Prevents failures in one resource category (SSH, subprocess, browser) from
cascading into others by capping how many concurrent operations each category
can have in flight. When a bulkhead is full, new requests either queue (up to
a configurable depth) or are rejected immediately.
"""
from __future__ import annotations

import asyncio
import time
from contextlib import asynccontextmanager
from typing import AsyncIterator

from ..odin_log import get_logger

log = get_logger("bulkhead")


class BulkheadFullError(Exception):
    """Raised when a bulkhead's queue is full and cannot accept more work."""

    def __init__(self, name: str, max_concurrent: int, max_queued: int) -> None:
        self.bulkhead_name = name
        super().__init__(
            f"Bulkhead '{name}' is full: {max_concurrent} active, "
            f"{max_queued} queued — rejecting request"
        )


class Bulkhead:
    """Concurrency limiter for a single resource category.

    Uses an asyncio.Semaphore to cap in-flight operations. Tracks active,
    queued, total, rejected, and error counts for observability.
    """

    def __init__(
        self,
        name: str,
        max_concurrent: int,
        max_queued: int = 0,
    ) -> None:
        self.name = name
        self._max_concurrent = max_concurrent
        self._max_queued = max_queued
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._active = 0
        self._queued = 0
        self._total = 0
        self._rejected = 0
        self._errors = 0
        self._last_rejection: float | None = None
        self._last_error: float | None = None

    @property
    def max_concurrent(self) -> int:
        return self._max_concurrent

    @property
    def max_queued(self) -> int:
        return self._max_queued

    @property
    def active(self) -> int:
        return self._active

    @property
    def queued(self) -> int:
        return self._queued

    @property
    def total(self) -> int:
        return self._total

    @property
    def rejected(self) -> int:
        return self._rejected

    @property
    def errors(self) -> int:
        return self._errors

    @asynccontextmanager
    async def acquire(self) -> AsyncIterator[None]:
        """Acquire a slot in the bulkhead. Rejects if queue is full."""
        if self._max_queued > 0 and self._queued >= self._max_queued:
            self._rejected += 1
            self._last_rejection = time.monotonic()
            log.warning(
                "Bulkhead '%s' rejecting request: %d active, %d queued (max %d)",
                self.name, self._active, self._queued, self._max_queued,
            )
            raise BulkheadFullError(self.name, self._max_concurrent, self._max_queued)

        self._queued += 1
        try:
            await self._semaphore.acquire()
        except BaseException:
            self._queued -= 1
            raise
        self._queued -= 1
        self._active += 1
        self._total += 1

        try:
            yield
        except Exception:
            self._errors += 1
            self._last_error = time.monotonic()
            raise
        finally:
            self._active -= 1
            self._semaphore.release()

    def get_metrics(self) -> dict:
        """Return current bulkhead state for Prometheus/observability."""
        return {
            "name": self.name,
            "max_concurrent": self._max_concurrent,
            "max_queued": self._max_queued,
            "active": self._active,
            "queued": self._queued,
            "total": self._total,
            "rejected": self._rejected,
            "errors": self._errors,
        }


class BulkheadRegistry:
    """Named collection of bulkheads for different resource categories.

    Typical categories: ssh, subprocess, browser. Each gets its own
    concurrency limit so one overwhelmed category can't starve the others.
    """

    def __init__(self) -> None:
        self._bulkheads: dict[str, Bulkhead] = {}

    def register(
        self,
        name: str,
        max_concurrent: int,
        max_queued: int = 0,
    ) -> Bulkhead:
        """Create and register a named bulkhead. Returns the bulkhead."""
        bh = Bulkhead(name, max_concurrent, max_queued)
        self._bulkheads[name] = bh
        log.info("Registered bulkhead '%s': max_concurrent=%d, max_queued=%d",
                 name, max_concurrent, max_queued)
        return bh

    def get(self, name: str) -> Bulkhead | None:
        """Get a bulkhead by name. Returns None if not registered."""
        return self._bulkheads.get(name)

    def get_or_create(
        self,
        name: str,
        max_concurrent: int = 10,
        max_queued: int = 0,
    ) -> Bulkhead:
        """Get existing bulkhead or create one with the given limits."""
        existing = self._bulkheads.get(name)
        if existing is not None:
            return existing
        return self.register(name, max_concurrent, max_queued)

    @property
    def names(self) -> list[str]:
        return list(self._bulkheads.keys())

    def get_all_metrics(self) -> dict[str, dict]:
        """Return metrics for all registered bulkheads."""
        return {name: bh.get_metrics() for name, bh in self._bulkheads.items()}

    def get_prometheus_metrics(self) -> dict:
        """Return flattened metrics dict for the Prometheus collector."""
        result: dict = {"bulkhead_count": len(self._bulkheads)}
        for name, bh in self._bulkheads.items():
            m = bh.get_metrics()
            for key in ("active", "queued", "total", "rejected", "errors",
                        "max_concurrent"):
                result[f"bulkhead_{name}_{key}"] = m[key]
        return result
