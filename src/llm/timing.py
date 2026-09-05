"""Accepted logical-generation time includes retries, never tool execution."""

import time
from functools import wraps


def elapsed_ms(start_ns: int) -> int:
    elapsed = time.monotonic_ns() - start_ns
    return max(1, elapsed // 1_000_000) if elapsed > 0 else 0


def timed_generation(method):
    """Include recovery/backoff/preflight; no sample for a fully failed call."""
    @wraps(method)
    async def call(*args, **kwargs):
        start = time.monotonic_ns()
        result = await method(*args, **kwargs)
        response = result
        if isinstance(result, tuple):
            response = result[1] if result[0] == "ok" else None
        if response is not None:
            duration = elapsed_ms(start)
            if isinstance(response, dict):
                response["duration_ms"] = duration
            else:
                response.duration_ms = duration
        return result
    return call


def timed_tool_batch(method):
    @wraps(method)
    async def call(self, st, *args, **kwargs):
        start = time.monotonic_ns()
        try:
            return await method(self, st, *args, **kwargs)
        finally:
            trajectory = getattr(st, "_trajectory", None)
            if trajectory is not None and getattr(trajectory, "iterations", None):
                trajectory.iterations[-1].tool_duration_ms = elapsed_ms(start)
    return call
