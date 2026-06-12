"""Reflection gating for autonomous loop iterations.

Loops repeat — a 60-second loop hitting the same DNS timeout all night must
produce ONE lesson, not sixty. This gate implements the agreed policy:

reflect on
- the FIRST occurrence of a failure signature per loop,
- a CHANGED failure signature (something new is wrong),
- RECOVERY after repeated failure (what fixed it is worth learning),

and suppress
- repeats of the same signature within the cooldown window,
- routine successes,
- everything beyond the global hourly volume cap.

State is in-memory by design: a restart resets cooldowns, which at worst
allows one duplicate lesson per signature — the learned store's merge-by-key
absorbs that.
"""
from __future__ import annotations

import hashlib
import re
import time

from ..odin_log import get_logger

log = get_logger("learning")

_DIGITS = re.compile(r"\d+")


def failure_signature(loop_id: str, failure_class: str, error_text: str) -> str:
    """Stable signature for 'the same thing failing the same way'."""
    normalized = _DIGITS.sub("N", (error_text or "")[:200].lower())
    digest = hashlib.sha1(
        f"{loop_id}|{failure_class}|{normalized}".encode(),
    ).hexdigest()[:12]
    return f"{failure_class}:{digest}"


class LoopReflectionGate:
    """Decides whether a completed loop iteration deserves reflection."""

    def __init__(
        self,
        *,
        cooldown_hours: float = 12.0,
        max_per_hour: int = 10,
    ) -> None:
        self._cooldown_seconds = cooldown_hours * 3600
        self._max_per_hour = max_per_hour
        # signature -> last reflected timestamp
        self._reflected_at: dict[str, float] = {}
        # loop_id -> (last failure signature, consecutive failure count)
        self._loop_state: dict[str, tuple[str | None, int]] = {}
        # timestamps of recent reflections (global volume cap)
        self._recent: list[float] = []

    def _over_global_cap(self, now: float) -> bool:
        cutoff = now - 3600
        self._recent = [t for t in self._recent if t > cutoff]
        return len(self._recent) >= self._max_per_hour

    def _grant(self, now: float, signature: str | None, reason: str) -> tuple[bool, str]:
        if signature is not None:
            self._reflected_at[signature] = now
        self._recent.append(now)
        return True, reason

    def evaluate(
        self,
        loop_id: str,
        *,
        is_error: bool,
        failure_class: str = "",
        error_text: str = "",
    ) -> tuple[bool, str]:
        """Return (should_reflect, reason). Never raises."""
        try:
            now = time.time()
            last_sig, fail_streak = self._loop_state.get(loop_id, (None, 0))

            if is_error:
                sig = failure_signature(loop_id, failure_class or "unknown", error_text)
                self._loop_state[loop_id] = (sig, fail_streak + 1)
                if self._over_global_cap(now):
                    return False, "global_cap"
                last_reflected = self._reflected_at.get(sig)
                if last_reflected is None:
                    # A signature never reflected before: if the loop was
                    # previously failing differently, the change is the story.
                    # (A flip-flop BACK to a recently-reflected signature still
                    # suppresses below — alternating errors can't spam.)
                    reason = (
                        "signature_change"
                        if last_sig is not None and sig != last_sig
                        else "first_occurrence"
                    )
                    return self._grant(now, sig, reason)
                if now - last_reflected >= self._cooldown_seconds:
                    return self._grant(now, sig, "cooldown_expired")
                return False, "duplicate_suppressed"

            # Success path: only a recovery after repeated failure is a lesson
            self._loop_state[loop_id] = (None, 0)
            if fail_streak >= 2:
                if self._over_global_cap(now):
                    return False, "global_cap"
                return self._grant(now, None, "recovery")
            return False, "routine_success"
        except Exception:  # noqa: BLE001 — gating must never break the loop
            log.debug("Loop reflection gate failed (non-fatal)", exc_info=True)
            return False, "gate_error"

    def forget_loop(self, loop_id: str) -> None:
        """Drop per-loop state (call when a loop is stopped/removed)."""
        self._loop_state.pop(loop_id, None)
