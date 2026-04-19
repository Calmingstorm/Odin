"""Tests for the runbook pattern detector."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from src.learning.runbook_detector import (
    AuditEntry,
    RunbookSuggestion,
    detect_patterns,
    format_suggestions,
    group_into_sessions,
    suggestions_as_json,
)


def _iso(dt: datetime) -> str:
    return dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


def _entry(ts: datetime, tool: str, *, host="hostA", actor="alice", channel="c1", error=False):
    return {
        "timestamp": _iso(ts),
        "user_id": actor,
        "user_name": actor,
        "channel_id": channel,
        "tool_name": tool,
        "tool_input": {"host": host, "command": f"{tool}-cmd"},
        "error": ("boom" if error else None),
    }


def _write_audit(path: Path, events: list[dict]) -> None:
    with path.open("w") as f:
        for e in events:
            f.write(json.dumps(e) + "\n")


class TestAuditEntry:
    def test_skips_non_tool_rows(self):
        row = {"timestamp": _iso(datetime(2026, 4, 1)), "type": "web_action", "method": "POST"}
        assert AuditEntry.from_line(json.dumps(row)) is None

    def test_parses_tool_row(self):
        row = _entry(datetime(2026, 4, 1), "run_command")
        e = AuditEntry.from_line(json.dumps(row))
        assert e is not None
        assert e.tool_name == "run_command"
        assert e.host == "hostA"
        assert e.error is False

    def test_bad_json(self):
        assert AuditEntry.from_line("not-json") is None


class TestSessionGrouping:
    def _entries(self, rows: list[dict]) -> list[AuditEntry]:
        return [AuditEntry.from_line(json.dumps(r)) for r in rows]  # type: ignore[misc]

    def test_gap_starts_new_session(self):
        base = datetime(2026, 4, 1, 10, 0, 0)
        rows = [
            _entry(base, "run_command"),
            _entry(base + timedelta(seconds=30), "run_command"),
            # 20-minute gap, new session:
            _entry(base + timedelta(minutes=20), "run_command"),
            _entry(base + timedelta(minutes=20, seconds=10), "validate_action"),
        ]
        entries = [e for e in self._entries(rows) if e]
        sessions = group_into_sessions(entries, gap_seconds=300)
        assert len(sessions) == 2

    def test_error_breaks_session(self):
        base = datetime(2026, 4, 1, 10, 0, 0)
        rows = [
            _entry(base, "run_command"),
            _entry(base + timedelta(seconds=10), "validate_action", error=True),
            _entry(base + timedelta(seconds=20), "run_command"),
        ]
        entries = [e for e in self._entries(rows) if e]
        sessions = group_into_sessions(entries, gap_seconds=300)
        # First run_command becomes its own session; the errored entry is dropped;
        # the third entry starts a fresh session.
        assert len(sessions) == 2
        assert [e.tool_name for e in sessions[0]] == ["run_command"]
        assert [e.tool_name for e in sessions[1]] == ["run_command"]

    def test_different_actors_dont_merge(self):
        base = datetime(2026, 4, 1, 10, 0, 0)
        rows = [
            _entry(base, "run_command", actor="alice"),
            _entry(base + timedelta(seconds=10), "run_command", actor="bob"),
            _entry(base + timedelta(seconds=20), "validate_action", actor="alice"),
        ]
        entries = [e for e in self._entries(rows) if e]
        sessions = group_into_sessions(entries, gap_seconds=300)
        buckets = {tuple(e.actor for e in s) for s in sessions}
        assert {("alice", "alice"), ("bob",)} == buckets


class TestDetectPatterns:
    def test_repeated_pattern_surfaces(self, tmp_path):
        base = datetime(2026, 4, 18, 10, 0, 0)
        events: list[dict] = []
        # 3 sessions each run: write_file -> run_command
        for i in range(3):
            session_start = base + timedelta(hours=i)
            events.append(_entry(session_start, "write_file"))
            events.append(_entry(session_start + timedelta(seconds=10), "run_command"))
        audit = tmp_path / "audit.jsonl"
        _write_audit(audit, events)
        suggestions = detect_patterns(
            audit, min_frequency=3, min_length=2, max_length=5,
            now=base + timedelta(hours=4),
        )
        assert len(suggestions) == 1
        s = suggestions[0]
        assert s.sequence == ["write_file", "run_command"]
        assert s.frequency == 3

    def test_single_session_burst_suppressed(self, tmp_path):
        """Three repeats all inside one session shouldn't surface as recurring."""
        base = datetime(2026, 4, 18, 10, 0, 0)
        events: list[dict] = []
        # one session, six steps: three repeats of the pair
        for i in range(3):
            t = base + timedelta(seconds=i * 20)
            events.append(_entry(t, "write_file"))
            events.append(_entry(t + timedelta(seconds=5), "run_command"))
        audit = tmp_path / "audit.jsonl"
        _write_audit(audit, events)
        suggestions = detect_patterns(
            audit, min_frequency=3, min_length=2, max_length=5,
            now=base + timedelta(hours=1),
        )
        # frequency is 3 but all in one session — should be suppressed
        assert suggestions == []

    def test_ignore_tools_filters_out(self, tmp_path):
        base = datetime(2026, 4, 18, 10, 0, 0)
        events: list[dict] = []
        for i in range(3):
            session_start = base + timedelta(hours=i)
            events.append(_entry(session_start, "read_file"))
            events.append(_entry(session_start + timedelta(seconds=10), "write_file"))
            events.append(_entry(session_start + timedelta(seconds=20), "run_command"))
        audit = tmp_path / "audit.jsonl"
        _write_audit(audit, events)
        suggestions = detect_patterns(
            audit, min_frequency=3, lookback_days=30,
            ignore_tools=["read_file"],
            now=base + timedelta(hours=4),
        )
        assert any(s.sequence == ["write_file", "run_command"] for s in suggestions)
        assert not any("read_file" in s.sequence for s in suggestions)

    def test_lookback_window_excludes_old(self, tmp_path):
        base = datetime(2026, 4, 18, 10, 0, 0)
        # ancient repeats (60 days before now) + one recent run — shouldn't qualify
        old = base - timedelta(days=60)
        events: list[dict] = []
        for i in range(3):
            t = old + timedelta(hours=i)
            events.append(_entry(t, "write_file"))
            events.append(_entry(t + timedelta(seconds=5), "run_command"))
        audit = tmp_path / "audit.jsonl"
        _write_audit(audit, events)
        suggestions = detect_patterns(
            audit, min_frequency=3, lookback_days=30, now=base,
        )
        assert suggestions == []

    def test_longer_sequence_shadows_shorter(self, tmp_path):
        base = datetime(2026, 4, 18, 10, 0, 0)
        events: list[dict] = []
        for i in range(3):
            t = base + timedelta(hours=i)
            events.append(_entry(t, "write_file"))
            events.append(_entry(t + timedelta(seconds=5), "run_command"))
            events.append(_entry(t + timedelta(seconds=10), "validate_action"))
        audit = tmp_path / "audit.jsonl"
        _write_audit(audit, events)
        suggestions = detect_patterns(
            audit, min_frequency=3, min_length=2, max_length=5,
            now=base + timedelta(hours=4),
        )
        seqs = [s.sequence for s in suggestions]
        assert ["write_file", "run_command", "validate_action"] in seqs
        # Shorter prefix ["write_file", "run_command"] should be shadowed out
        assert ["write_file", "run_command"] not in seqs

    def test_shorter_with_more_sessions_survives_shadowing(self, tmp_path):
        """If [A,B] appears in more sessions than [A,B,C], the shorter must
        survive — it's its own pattern, not a prefix we can discard."""
        base = datetime(2026, 4, 18, 10, 0, 0)
        events: list[dict] = []
        # Three sessions with the full [A,B,C] sequence
        for i in range(3):
            t = base + timedelta(hours=i)
            events.append(_entry(t, "write_file"))
            events.append(_entry(t + timedelta(seconds=5), "run_command"))
            events.append(_entry(t + timedelta(seconds=10), "validate_action"))
        # Three additional sessions with just [A,B] (no C)
        for i in range(3):
            t = base + timedelta(hours=10 + i)
            events.append(_entry(t, "write_file"))
            events.append(_entry(t + timedelta(seconds=5), "run_command"))
        audit = tmp_path / "audit.jsonl"
        _write_audit(audit, events)
        suggestions = detect_patterns(
            audit, min_frequency=3, min_length=2, max_length=5,
            now=base + timedelta(hours=20),
        )
        seqs = [s.sequence for s in suggestions]
        assert ["write_file", "run_command"] in seqs
        assert ["write_file", "run_command", "validate_action"] in seqs

    def test_sample_inputs_scrub_secrets(self, tmp_path):
        """Runbook suggestions must not echo secrets from audit inputs."""
        base = datetime(2026, 4, 18, 10, 0, 0)
        events: list[dict] = []
        for i in range(3):
            t = base + timedelta(hours=i)
            events.append({
                "timestamp": _iso(t),
                "user_id": "alice",
                "user_name": "alice",
                "channel_id": "c1",
                "tool_name": "run_command",
                "tool_input": {
                    "host": "hostA",
                    "command": "curl -H 'Authorization: Bearer sk-ant-api03-SECRETSECRET1234567890abcd' https://x",
                },
                "error": None,
            })
            events.append({
                "timestamp": _iso(t + timedelta(seconds=10)),
                "user_id": "alice",
                "user_name": "alice",
                "channel_id": "c1",
                "tool_name": "validate_action",
                "tool_input": {"host": "hostA", "command": "echo ok"},
                "error": None,
            })
        audit = tmp_path / "audit.jsonl"
        _write_audit(audit, events)
        suggestions = detect_patterns(
            audit, min_frequency=3, min_length=2, max_length=5,
            now=base + timedelta(hours=5),
        )
        assert suggestions
        # Dump every sample input and assert no raw token bytes remain.
        raw = json.dumps([s.to_dict() for s in suggestions])
        assert "sk-ant-api03-SECRETSECRET1234567890abcd" not in raw

    def test_session_presence_drives_score(self):
        """Score must grow with session_count, not raw frequency."""
        now = datetime(2026, 4, 18, 12, 0, 0, tzinfo=timezone.utc)
        bursty_single_session = RunbookSuggestion(
            sequence=["a", "b"], frequency=10, session_count=2,
            hosts=["h"], actors=["alice"],
            first_seen=_iso(now - timedelta(days=1)),
            last_seen=_iso(now - timedelta(days=1)),
        )
        distributed = RunbookSuggestion(
            sequence=["a", "b"], frequency=5, session_count=5,
            hosts=["h"], actors=["alice"],
            first_seen=_iso(now - timedelta(days=1)),
            last_seen=_iso(now - timedelta(days=1)),
        )
        assert distributed.score(now=now) > bursty_single_session.score(now=now)

    def test_score_prefers_recent(self):
        now = datetime(2026, 4, 18, 12, 0, 0, tzinfo=timezone.utc)
        stale = RunbookSuggestion(
            sequence=["a", "b"], frequency=5, hosts=["h"], actors=["alice"],
            first_seen=_iso(now - timedelta(days=25)),
            last_seen=_iso(now - timedelta(days=25)),
        )
        fresh = RunbookSuggestion(
            sequence=["a", "b"], frequency=5, hosts=["h"], actors=["alice"],
            first_seen=_iso(now - timedelta(days=1)),
            last_seen=_iso(now - timedelta(days=1)),
        )
        assert fresh.score(now=now) > stale.score(now=now)


class TestFormatters:
    def test_empty_summary(self):
        assert "No runbook candidates" in format_suggestions([])

    def test_summary_has_arrow(self):
        s = RunbookSuggestion(
            sequence=["write_file", "run_command"], frequency=3,
            hosts=["hostA"], actors=["alice"],
            first_seen="2026-04-01T10:00:00Z",
            last_seen="2026-04-17T10:00:00Z",
        )
        text = format_suggestions([s])
        assert "write_file -> run_command" in text
        assert "hostA" in text

    def test_json_roundtrips(self):
        s = RunbookSuggestion(
            sequence=["write_file"], frequency=3,
            hosts=["hostA"], actors=["alice"],
            first_seen="2026-04-01T10:00:00Z",
            last_seen="2026-04-17T10:00:00Z",
        )
        payload = json.loads(suggestions_as_json([s]))
        assert payload[0]["sequence"] == ["write_file"]
        assert payload[0]["score"] >= 0
