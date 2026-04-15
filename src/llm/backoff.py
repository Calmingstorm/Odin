"""Exponential backoff with jitter for retry loops.

Replaces fixed [2, 5, 10] delay ladders with proper exponential backoff
plus randomized jitter to decorrelate retried requests.
"""

from __future__ import annotations

import random

DEFAULT_BASE_DELAY = 1.0
DEFAULT_MAX_DELAY = 30.0
DEFAULT_MAX_RETRIES = 3


def compute_backoff(
    attempt: int,
    base_delay: float = DEFAULT_BASE_DELAY,
    max_delay: float = DEFAULT_MAX_DELAY,
) -> float:
    """Return a jittered exponential backoff delay in seconds.

    Uses the "full jitter" algorithm from AWS Architecture Blog:
    delay = random(0, min(max_delay, base_delay * 2^attempt))

    This decorrelates concurrent retriers better than equal jitter or
    no jitter, reducing thundering-herd effects on shared backends.
    """
    ceiling = min(max_delay, base_delay * (2 ** attempt))
    return random.uniform(0, ceiling)


def compute_backoff_no_jitter(
    attempt: int,
    base_delay: float = DEFAULT_BASE_DELAY,
    max_delay: float = DEFAULT_MAX_DELAY,
) -> float:
    """Return exponential backoff delay without jitter (for testing/deterministic use)."""
    return min(max_delay, base_delay * (2 ** attempt))
