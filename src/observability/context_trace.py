"""Per-request context trace: what was assembled into the prompt, what was
filtered out, and WHY — recorded as metadata only, attached to the turn's
trajectory record.

The collector is deliberately paranoid: every public method is wrapped so
that an internal failure can never propagate into the request path.
Observability must never become the outage.
"""
from __future__ import annotations

import functools
import hashlib
import json
import re
import time
from typing import Any

from ..odin_log import get_logger

log = get_logger("observability")

TRACE_SCHEMA_VERSION = 1
ASSEMBLY_VERSION = "prompt_assembler_v1"

# Heuristic patterns for the privacy self-check. Intentionally coarse —
# the goal is catching accidental key/token leakage into trace metadata,
# not perfect secret detection.
_SECRET_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9]{16,}"),
    re.compile(r"ghp_[A-Za-z0-9]{20,}"),
    re.compile(r"gho_[A-Za-z0-9]{20,}"),
    re.compile(r"AKIA[A-Z0-9]{12,}"),
    re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}"),
    re.compile(r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}"),  # JWT-ish
)


def _guarded(method):
    """Recording must never raise into the request path."""
    @functools.wraps(method)
    def wrapper(self, *args, **kwargs):
        try:
            return method(self, *args, **kwargs)
        except Exception as e:  # noqa: BLE001 — by design: swallow everything
            self._internal_errors += 1
            if self._internal_errors == 1:
                log.warning("Context trace recording failed (non-fatal): %s", e)
            return None
    return wrapper


class ContextTraceCollector:
    """Accumulates prompt-assembly decision metadata for a single turn.

    Pass an instance into the assembly functions (system prompt builder,
    task history, learned injection); each records its decisions when a
    collector is present and does nothing different when it is not.
    Call :meth:`finalize` once to produce the JSON-safe trace dict.
    """

    def __init__(
        self,
        *,
        memory_key_mode: str = "hash",
        include_segment_ids: bool = True,
        max_trace_bytes: int = 16384,
    ) -> None:
        self._memory_key_mode = memory_key_mode
        self._include_segment_ids = include_segment_ids
        self._max_trace_bytes = max_trace_bytes
        self._internal_errors = 0
        self._started = time.monotonic()
        self._sections: list[dict] = []
        self._history: dict = {}
        self._learned: dict = {}
        self._segments: list[dict] = []
        self._warnings: list[dict] = []
        self._timings: dict[str, float] = {}
        self._provider: dict = {}
        self._continuity_source: str | None = None
        self._finalized: dict | None = None

    # -- key/id privacy -----------------------------------------------------

    def key(self, raw_key: str) -> str:
        """Apply the configured memory-key privacy mode."""
        try:
            if self._memory_key_mode == "raw":
                return str(raw_key)
            if self._memory_key_mode == "redacted":
                return "<redacted>"
            digest = hashlib.sha256(str(raw_key).encode()).hexdigest()[:12]
            return f"k_{digest}"
        except Exception:  # noqa: BLE001
            return "<key-error>"

    def segment_id(self, raw_id: str) -> str:
        return str(raw_id) if self._include_segment_ids else "<segment>"

    # -- recording ------------------------------------------------------------

    @_guarded
    def section(self, name: str, *, tokens: int, **meta) -> None:
        """Record one system-prompt section with its estimated token cost."""
        entry = {"section": name, "tokens": int(tokens)}
        for field_name, value in meta.items():
            entry[field_name] = value
        self._sections.append(entry)

    @_guarded
    def learned(
        self,
        *,
        available: int,
        injected_keys: list[str],
        pinned_available: list[str],
        pinned_injected: list[str],
        gated_out: list[dict],
        tokens: int,
        mode: str,
    ) -> None:
        """Record the learned-context selection decision.

        *mode* is ``include_all`` (corpus fit the budget) or ``gated``.
        ``gated_out`` entries are ``{"key": ..., "reason": ...}`` dicts with
        keys already passed through :meth:`key`.
        """
        self._learned = {
            "available_count": int(available),
            "injected_count": len(injected_keys),
            "injected_keys": list(injected_keys),
            "pinned_corrections_available": list(pinned_available),
            "pinned_corrections_injected": list(pinned_injected),
            "gated_out": list(gated_out),
            "tokens": int(tokens),
            "mode": mode,
        }
        missing = set(pinned_available) - set(pinned_injected)
        if missing:
            self.warning(
                "PINNED_CORRECTION_NOT_INJECTED", "error",
                f"{len(missing)} correction(s) available but not injected",
            )

    @_guarded
    def history(
        self,
        *,
        budget: int,
        used: int,
        candidates: int,
        kept_recent: int,
        kept_relevant: int,
        dropped_relevance: int,
        dropped_budget: int,
    ) -> None:
        self._history = {
            "budget": int(budget),
            "used": int(used),
            "candidates": int(candidates),
            "kept_recent": int(kept_recent),
            "kept_relevant": int(kept_relevant),
            "dropped_relevance": int(dropped_relevance),
            "dropped_budget": int(dropped_budget),
        }

    @_guarded
    def segment(
        self, seg_id: str, *, decision: str, reason: str,
        tokens: int = 0, source_type: str = "session",
    ) -> None:
        """Record one summary-segment decision: injected/skipped + reason."""
        self._segments.append({
            "id": self.segment_id(seg_id),
            "decision": decision,
            "reason": reason,
            "tokens": int(tokens),
            "source_type": source_type,
        })

    @_guarded
    def continuity(self, source: str) -> None:
        """Where this turn's session came from: live | archive_restore | fresh."""
        self._continuity_source = source

    @_guarded
    def provider(self, *, name: str, model: str, message_format: str = "") -> None:
        self._provider = {"name": name, "model": model}
        if message_format:
            self._provider["message_format"] = message_format

    @_guarded
    def warning(self, code: str, severity: str, detail: str) -> None:
        """Record an invariant violation. Golden eval cases assert zero of these."""
        self._warnings.append({
            "code": code, "severity": severity, "detail": str(detail)[:200],
        })

    @_guarded
    def timing(self, phase: str, ms: float) -> None:
        self._timings[phase] = round(float(ms), 2)

    class _PhaseTimer:
        def __init__(self, collector: ContextTraceCollector, phase: str) -> None:
            self._collector = collector
            self._phase = phase
            self._t0 = 0.0

        def __enter__(self):
            self._t0 = time.monotonic()
            return self

        def __exit__(self, *exc):
            self._collector.timing(self._phase, (time.monotonic() - self._t0) * 1000)
            return False

    def phase(self, name: str) -> _PhaseTimer:
        """Context manager recording wall-time for an assembly phase."""
        return self._PhaseTimer(self, name)

    # -- output -----------------------------------------------------------------

    def _secret_scan(self, serialized: str) -> dict:
        matches = 0
        try:
            for pattern in _SECRET_PATTERNS:
                matches += len(pattern.findall(serialized))
        except Exception:  # noqa: BLE001
            return {"performed": False, "matches": -1}
        if matches:
            log.warning(
                "Context trace privacy scan found %d secret-like token(s) in metadata",
                matches,
            )
        return {"performed": True, "matches": matches}

    def finalize(self) -> dict | None:
        """Build the JSON-safe trace dict. Never raises; returns None only if
        even the minimal fallback cannot be built."""
        if self._finalized is not None:
            return self._finalized
        try:
            duration_ms = round((time.monotonic() - self._started) * 1000, 2)
            total_tokens = sum(s.get("tokens", 0) for s in self._sections)
            trace: dict[str, Any] = {
                "schema_version": TRACE_SCHEMA_VERSION,
                "assembly": {
                    "version": ASSEMBLY_VERSION,
                    "duration_ms": duration_ms,
                    "phase_ms": dict(self._timings),
                    "internal_errors": self._internal_errors,
                },
                "summary": {
                    "system_tokens": total_tokens,
                    "sections_count": len(self._sections),
                    "history_used_tokens": self._history.get("used", 0),
                    "history_candidates": self._history.get("candidates", 0),
                    "learned_injected": self._learned.get("injected_count", 0),
                    "pinned_corrections_injected": len(
                        self._learned.get("pinned_corrections_injected", [])
                    ),
                    "dropped_budget": self._history.get("dropped_budget", 0),
                    "warnings_count": len(self._warnings),
                    "trace_truncated": False,
                },
                "sections": self._sections,
                "history": self._history,
                "learned": self._learned,
                "segments": self._segments,
                "continuity_source": self._continuity_source,
                "provider": self._provider,
                "warnings": self._warnings,
            }
            serialized = json.dumps(trace, default=str)
            trace["privacy"] = {
                "content_recorded": False,
                "memory_key_mode": self._memory_key_mode,
                "secret_scan": self._secret_scan(serialized),
            }
            # Enforce the size cap by shedding the bulkiest sublists —
            # explicitly flagged, never silent.
            if len(serialized) > self._max_trace_bytes:
                for bulky in ("segments", "sections"):
                    trace[bulky] = []
                self._learned.pop("gated_out", None)
                trace["summary"]["trace_truncated"] = True
                trace["truncation_reason"] = "max_trace_bytes"
            self._finalized = trace
            return trace
        except Exception as e:  # noqa: BLE001
            log.warning("Context trace finalize failed (non-fatal): %s", e)
            try:
                self._finalized = {
                    "schema_version": TRACE_SCHEMA_VERSION,
                    "finalize_error": True,
                    "internal_errors": self._internal_errors + 1,
                }
                return self._finalized
            except Exception:  # noqa: BLE001
                return None
