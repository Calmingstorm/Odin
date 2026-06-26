"""Tests for the observability bundle (context trace, failure classification,
aggregates).

The two contracts under test:
1. ZERO BEHAVIOR IMPACT — assembly output is byte-identical with tracing
   on, off, or broken.
2. NEVER THE OUTAGE — a failing collector logs and records nothing, but
   the request path proceeds untouched.
"""
from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime, timedelta

import pytest

from src.observability.context_trace import (
    TRACE_SCHEMA_VERSION,
    ContextTraceCollector,
)
from src.observability.failure_classes import FAILURE_CLASSES, classify_failure

# ---------------------------------------------------------------------------
# Collector
# ---------------------------------------------------------------------------

class TestCollector:
    def test_finalize_shape(self):
        c = ContextTraceCollector()
        c.section("base", tokens=1000)
        c.section("persistent_memory", tokens=200, keys=5)
        c.history(budget=64000, used=900, candidates=20, kept_recent=12,
                  kept_relevant=3, dropped_relevance=5, dropped_budget=0)
        c.continuity("live")
        c.provider(name="codex", model="gpt-5.5")
        trace = c.finalize()
        assert trace["schema_version"] == TRACE_SCHEMA_VERSION
        assert trace["summary"]["system_tokens"] == 1200
        assert trace["summary"]["sections_count"] == 2
        assert trace["history"]["candidates"] == 20
        assert trace["continuity_source"] == "live"
        assert trace["provider"]["name"] == "codex"
        assert trace["privacy"]["content_recorded"] is False
        assert trace["privacy"]["secret_scan"]["performed"] is True

    def test_finalize_idempotent(self):
        c = ContextTraceCollector()
        c.section("base", tokens=10)
        assert c.finalize() is c.finalize()

    def test_recording_never_raises(self):
        c = ContextTraceCollector()
        # Hostile inputs that would explode without guards
        c.section(None, tokens="not-an-int")
        c.history(budget="x", used=None, candidates=[], kept_recent={},
                  kept_relevant=0, dropped_relevance=0, dropped_budget=0)
        c.learned(available="?", injected_keys=None, pinned_available=None,
                  pinned_injected=None, gated_out=None, tokens=None, mode=1)
        trace = c.finalize()
        assert trace is not None
        assert trace["assembly"]["internal_errors"] >= 3

    def test_key_modes(self):
        raw = ContextTraceCollector(memory_key_mode="raw")
        assert raw.key("my_secret_key_name") == "my_secret_key_name"
        hashed = ContextTraceCollector(memory_key_mode="hash")
        h = hashed.key("my_secret_key_name")
        assert h.startswith("k_") and "secret" not in h
        assert h == hashed.key("my_secret_key_name")  # stable
        redacted = ContextTraceCollector(memory_key_mode="redacted")
        assert redacted.key("my_secret_key_name") == "<redacted>"

    def test_pinned_correction_warning(self):
        c = ContextTraceCollector()
        c.learned(available=5, injected_keys=["a"], pinned_available=["c1", "c2"],
                  pinned_injected=["c1"], gated_out=[], tokens=100, mode="gated")
        trace = c.finalize()
        codes = [w["code"] for w in trace["warnings"]]
        assert "PINNED_CORRECTION_NOT_INJECTED" in codes
        assert trace["summary"]["warnings_count"] == 1

    def test_size_cap_truncates_with_flag(self):
        c = ContextTraceCollector(max_trace_bytes=500)
        for i in range(100):
            c.segment(f"seg_{i}", decision="skipped", reason="low_relevance", tokens=10)
        trace = c.finalize()
        assert trace["summary"]["trace_truncated"] is True
        assert trace["truncation_reason"] == "max_trace_bytes"
        assert trace["segments"] == []

    def test_secret_scan_flags_leaks(self):
        c = ContextTraceCollector(memory_key_mode="raw")
        c.section("base", tokens=10, note="ghp_abcdefghijklmnopqrstuv012345")
        trace = c.finalize()
        assert trace["privacy"]["secret_scan"]["matches"] >= 1

    def test_phase_timer_records(self):
        c = ContextTraceCollector()
        with c.phase("system_prompt"):
            pass
        trace = c.finalize()
        assert "system_prompt" in trace["assembly"]["phase_ms"]


# ---------------------------------------------------------------------------
# Failure classification
# ---------------------------------------------------------------------------

class TestFailureClassification:
    CASES = [
        ("HTTP 401 Unauthorized: invalid_token", "auth"),
        ("token has been invalidated, sign in again", "auth"),
        ("HTTP 429 Too Many Requests", "rate_limit"),
        ("insufficient_quota: you have run out of credits", "quota"),
        ("bash: packwiz: command not found", "dependency_missing"),
        ("ModuleNotFoundError: No module named 'aioresponses'", "dependency_missing"),
        ("validate_action: post-change check failed on host server-1", "validation_failed"),
        ("CONFLICT (content): Merge conflict in src/web/api.py", "conflict"),
        ("error: Your local changes would be overwritten by merge", "conflict"),
        ("PermissionError: [Errno 13] Permission denied: '/etc/shadow'", "permission_denied"),
        ("HTTP 404: repository not found", "not_found"),
        ("Tool 'run_command' timed out after 900s", "timeout"),
        ("Cannot connect to the Docker daemon. Is the docker daemon running?", "remote_state"),
        ("Unit odin.service is inactive (dead)", "remote_state"),
        ("ConnectionResetError: [Errno 104] ECONNRESET", "network"),
        ("Temporary failure in name resolution", "network"),
        ("json.decoder.JSONDecodeError: Expecting value: line 1", "bad_input"),
        ("usage: git push [<options>] — unrecognized arguments", "bad_input"),
        ("HTTP 502 Bad Gateway from upstream", "provider"),
        ("RBAC gate denied tool run_command for user 42", "policy_blocked"),
        ("operation cancelled by user", "cancelled"),
        ("complete gibberish nobody can classify §§§", "unknown"),
        ("", "unknown"),
        (None, "unknown"),
    ]

    @pytest.mark.parametrize("text,expected", CASES)
    def test_classification_matrix(self, text, expected):
        result = classify_failure(text)
        assert result["class"] == expected, f"{text!r} → {result}"
        assert result["class"] in FAILURE_CLASSES
        assert result["source"] == "heuristic_v1"
        assert 0.0 <= result["confidence"] <= 1.0

    def test_structure_complete(self):
        result = classify_failure("timed out")
        assert set(result) == {"class", "subclass", "confidence", "matched_rule", "source"}


# ---------------------------------------------------------------------------
# Zero-behavior guarantee on the assembly paths
# ---------------------------------------------------------------------------

class _ExplodingCollector(ContextTraceCollector):
    """Collector whose internal recording blows up — the guard decorator
    must absorb every failure."""
    def __init__(self):
        super().__init__()
        # Poison the storage the task-history path appends to
        self._segments = None  # .append raises AttributeError


def _make_session_manager(tmp_path):
    from src.sessions.manager import SessionManager
    mgr = SessionManager(max_history=50, max_age_hours=24, persist_dir=str(tmp_path))
    for i in range(30):
        mgr.add_message("ch1", "user" if i % 2 == 0 else "assistant",
                        f"message about nginx number {i}", user_id="42" if i % 2 == 0 else None)
    session = mgr.get("ch1")
    session.summary_segments.append({
        "id": "seg_a", "summary": "earlier nginx work", "start_ts": 1.0,
        "end_ts": 2.0, "participants": [], "source_count": 10, "created_at": 3.0,
        "topics": ["nginx"], "entities": [], "decisions": [], "open_threads": [],
    })
    return mgr


class TestZeroBehavior:
    @pytest.mark.asyncio
    async def test_task_history_identical_with_and_without_trace(self, tmp_path):
        mgr = _make_session_manager(tmp_path)
        without = await mgr.get_task_history("ch1", max_messages=160, current_query="fix nginx")
        trace = ContextTraceCollector()
        with_trace = await mgr.get_task_history(
            "ch1", max_messages=160, current_query="fix nginx", trace=trace,
        )
        assert with_trace == without
        # And the trace actually recorded the decisions
        final = trace.finalize()
        assert final["history"]["candidates"] == 30
        assert final["continuity_source"] in ("fresh", "live")
        assert any(s["decision"] == "injected" for s in final["segments"])

    @pytest.mark.asyncio
    async def test_task_history_survives_exploding_collector(self, tmp_path):
        mgr = _make_session_manager(tmp_path)
        without = await mgr.get_task_history("ch1", max_messages=160, current_query="fix nginx")
        broken = _ExplodingCollector()
        with_broken = await mgr.get_task_history(
            "ch1", max_messages=160, current_query="fix nginx", trace=broken,
        )
        assert with_broken == without
        assert broken._internal_errors > 0

    def test_learned_injection_identical_with_and_without_trace(self, tmp_path):
        from src.learning.reflector import ConversationReflector
        path = tmp_path / "learned.json"
        entries = [
            {"key": f"op{i}", "category": "operational",
             "content": f"operational lesson about {t}."}
            for i, t in enumerate(["nginx", "dns", "minecraft", "eve", "docker",
                                   "grafana", "loki", "incus", "plex", "gitea"])
        ]
        entries.append({"key": "corr1", "category": "correction",
                        "content": "never do the bad thing."})
        path.write_text(json.dumps({"version": 2, "last_reflection": None,
                                    "entries": entries}))
        r = ConversationReflector(str(path), injection_token_budget=50)  # force gating
        without = r.get_prompt_section(query="fix the nginx config")
        trace = ContextTraceCollector()
        with_trace = r.get_prompt_section(query="fix the nginx config", trace=trace)
        assert with_trace == without
        final = trace.finalize()
        assert final["learned"]["mode"] == "gated"
        assert final["learned"]["available_count"] == 11
        # Correction pinned and recorded (hashed key)
        assert len(final["learned"]["pinned_corrections_injected"]) == 1
        assert final["learned"]["pinned_corrections_injected"][0].startswith("k_")
        assert all(g["reason"] in ("low_relevance", "pin_cap")
                   for g in final["learned"]["gated_out"])
        assert final["warnings"] == []

    def test_continuity_source_archive_restore(self, tmp_path):
        mgr = _make_session_manager(tmp_path)
        session = mgr.get("ch1")
        # Ancient enough to prune, but a positive timestamp — an archive at
        # ts=0 would collide with the default reset-epoch boundary, a state
        # impossible in reality.
        session.last_active = 1000.0
        for m in session.messages:
            m.timestamp = 999.0
        mgr.prune()
        mgr.get_or_create("ch1")  # restores
        assert mgr._continuity_source["ch1"] == "archive_restore"


# ---------------------------------------------------------------------------
# Audit integration
# ---------------------------------------------------------------------------

class TestAuditClassification:
    def _log(self, tmp_path, *, error, classify=True):
        from src.audit.logger import AuditLogger
        path = tmp_path / "audit.jsonl"
        logger = AuditLogger(path=str(path), classify_failures=classify)
        asyncio.run(logger.log_execution(
            user_id="42", user_name="aaron", channel_id="ch1",
            tool_name="run_command", tool_input={"command": "x"},
            approved=True, result_summary="failed", execution_time_ms=10,
            error=error,
        ))
        return json.loads(path.read_text().splitlines()[-1])

    def test_error_entries_get_failure_class(self, tmp_path):
        entry = self._log(tmp_path, error="Tool 'run_command' timed out after 900s")
        assert entry["failure"]["class"] == "timeout"
        assert entry["failure"]["matched_rule"] == "timeout_v1"

    def test_success_entries_have_no_failure_field(self, tmp_path):
        entry = self._log(tmp_path, error=None)
        assert "failure" not in entry

    def test_kill_switch_disables_classification(self, tmp_path):
        entry = self._log(tmp_path, error="timed out", classify=False)
        assert "failure" not in entry


# ---------------------------------------------------------------------------
# Aggregates
# ---------------------------------------------------------------------------

def _write_trajectory_day(directory, day, traces):
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{day.isoformat()}.jsonl"
    with path.open("a") as fh:
        for hours_ago, trace in traces:
            ts = datetime.combine(day, datetime.min.time(), tzinfo=UTC) + timedelta(hours=hours_ago)
            fh.write(json.dumps({"timestamp": ts.isoformat(), "context_trace": trace}) + "\n")


class TestAggregates:
    def _trace(self, base_tokens):
        return {
            "schema_version": 1,
            "summary": {"system_tokens": base_tokens, "history_used_tokens": 1000},
            "sections": [{"section": "context_dir", "tokens": base_tokens}],
            "history": {"used": 1000},
            "learned": {"tokens": 200},
            "warnings": [],
        }

    def test_drift_candidate_detected(self, tmp_path):
        from src.observability.aggregates import context_aggregates
        now = datetime.now(UTC)
        # Previous window: small context_dir; current window: grown by 1500
        for h in (30, 32, 34):  # 24-48h ago
            _write_trajectory_day(tmp_path, (now - timedelta(hours=h)).date(),
                                  [((now - timedelta(hours=h)).hour, self._trace(500))])
        for h in (2, 4, 6):  # current window
            _write_trajectory_day(tmp_path, (now - timedelta(hours=h)).date(),
                                  [((now - timedelta(hours=h)).hour, self._trace(2000))])
        agg = context_aggregates(str(tmp_path), window_hours=24)
        assert agg["turns_traced"] == 3
        sections = agg["by_section"]
        assert sections["context_dir"]["avg_tokens"] == 2000
        drift_sections = [d["section"] for d in agg["drift_candidates"]]
        assert "context_dir" in drift_sections

    def test_no_drift_when_stable(self, tmp_path):
        from src.observability.aggregates import context_aggregates
        now = datetime.now(UTC)
        for h in (2, 30):
            _write_trajectory_day(tmp_path, (now - timedelta(hours=h)).date(),
                                  [((now - timedelta(hours=h)).hour, self._trace(1000))])
        agg = context_aggregates(str(tmp_path), window_hours=24)
        assert agg["drift_candidates"] == []

    def test_failure_aggregates_window_and_trends(self, tmp_path):
        from src.observability.aggregates import failure_aggregates
        path = tmp_path / "audit.jsonl"
        now = datetime.now(UTC)
        rows = []
        for hours_ago, cls in ((1, "timeout"), (2, "timeout"), (3, "network"),
                               (30, "timeout")):
            rows.append(json.dumps({
                "timestamp": (now - timedelta(hours=hours_ago)).isoformat(),
                "tool_name": "run_command",
                "error": "raw error string that must not surface",
                "failure": {"class": cls, "subclass": "x", "confidence": 0.9,
                            "matched_rule": "r", "source": "heuristic_v1"},
            }))
        path.write_text("\n".join(rows) + "\n")
        agg = failure_aggregates(str(path), window_hours=24)
        assert agg["classified"] == 3
        assert agg["by_class"]["timeout"]["count"] == 2
        timeout_trend = next(t for t in agg["trends"] if t["class"] == "timeout")
        assert timeout_trend == {"class": "timeout", "current": 2, "previous": 1, "delta": 1}
        # Raw error strings never surface in aggregates
        assert "raw error string" not in json.dumps(agg)


# ---------------------------------------------------------------------------
# Trajectory serialization
# ---------------------------------------------------------------------------

class TestTrajectorySerialization:
    def test_to_dict_includes_trace_when_set(self):
        from src.trajectories.saver import TrajectoryTurn
        turn = TrajectoryTurn(message_id="m1")
        assert "context_trace" not in turn.to_dict()
        turn.context_trace = {"schema_version": 1}
        assert turn.to_dict()["context_trace"] == {"schema_version": 1}
