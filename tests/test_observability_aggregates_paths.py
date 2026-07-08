"""Coverage for src/observability/aggregates.py (RFC-006 P20, safe).

Pure aggregation over tmp trajectory JSONL + audit JSONL: context_aggregates
(windowed section stats, drift candidates, warnings, malformed/untraced turns),
failure_aggregates (current/previous window classification, trends, no-file guard,
tail truncation), and the _percentile empty guard. SAFE: reads tmp files only;
no network, no live audit/trajectory state.
"""
from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

from src.observability import aggregates


def _write(directory, dt, turn):
    p = Path(directory) / f"{dt.date().isoformat()}.jsonl"
    with p.open("a") as f:
        f.write(json.dumps(turn) + "\n")


class TestContextAggregates:
    def test_windowed_stats_and_drift(self, tmp_path):
        now = datetime.now(UTC)
        _write(tmp_path, now, {
            "timestamp": (now - timedelta(hours=1)).isoformat(),
            "context_trace": {
                "summary": {"system_tokens": 500, "history_used_tokens": 100},
                "sections": [{"section": "identity", "tokens": 1000}],
                "learned": {"tokens": 50}, "history": {"used": 100},
                "warnings": ["w1"],
            },
        })
        _write(tmp_path, now - timedelta(hours=25), {
            "timestamp": (now - timedelta(hours=25)).isoformat(),
            "context_trace": {
                "summary": {"system_tokens": 100, "history_used_tokens": 50},
                "sections": [{"section": "identity", "tokens": 100}],
            },
        })
        out = aggregates.context_aggregates(str(tmp_path), window_hours=24)
        assert out["turns"] == 1 and out["turns_traced"] == 1
        assert out["trace_warnings"] == 1 and "identity" in out["by_section"]
        # identity 100 -> 1000: |Δ|=900 >= 300 and 900/100 >= 0.25 -> drift
        assert any(d["section"] == "identity" and d["type"] == "section_growth"
                   for d in out["drift_candidates"])

    def test_malformed_and_untraced_turns(self, tmp_path):
        now = datetime.now(UTC)
        p = Path(tmp_path) / f"{now.date().isoformat()}.jsonl"
        p.write_text(
            "this is not json\n"                                       # JSONDecodeError
            + json.dumps({"timestamp": "not-a-date", "context_trace": {}}) + "\n"   # bad timestamp
            + json.dumps({"timestamp": (now - timedelta(hours=1)).isoformat()}) + "\n"  # no trace
        )
        out = aggregates.context_aggregates(str(tmp_path), window_hours=24)
        assert out["turns"] == 1 and out["turns_traced"] == 0   # untraced turn counted only

    def test_percentile_empty(self):
        assert aggregates._percentile([], 95) == 0.0


class TestFailureAggregates:
    def test_no_file(self, tmp_path):
        out = aggregates.failure_aggregates(str(tmp_path / "absent.jsonl"))
        assert out["classified"] == 0 and out["by_class"] == {} and out["trends"] == []

    def test_classifies_current_previous_and_trends(self, tmp_path):
        now = datetime.now(UTC)
        p = tmp_path / "audit.jsonl"
        lines = [
            "not json",                                                            # JSONDecodeError
            json.dumps({"timestamp": (now - timedelta(hours=1)).isoformat(),
                        "failure": {"class": "TIMEOUT"}, "tool_name": "run_command"}),
            json.dumps({"timestamp": (now - timedelta(hours=1)).isoformat(),
                        "failure": {"class": "TIMEOUT"}, "tool_name": "run_command"}),
            json.dumps({"timestamp": (now - timedelta(hours=30)).isoformat(),
                        "failure": {"class": "TIMEOUT"}, "tool_name": "x"}),   # prev window
            json.dumps({"timestamp": (now - timedelta(hours=1)).isoformat(),
                        "failure": "not-a-dict"}),                    # non-dict failure
            json.dumps({"timestamp": "bad", "failure": {"class": "X"}}),           # bad timestamp
        ]
        p.write_text("\n".join(lines) + "\n")
        out = aggregates.failure_aggregates(str(p), window_hours=24)
        assert out["classified"] == 2
        assert out["by_class"]["TIMEOUT"]["count"] == 2
        assert "run_command" in out["by_class"]["TIMEOUT"]["top_tools"]
        assert any(t["class"] == "TIMEOUT" and t["delta"] == 1 for t in out["trends"])

    def test_tail_truncation_discards_partial_first_line(self, tmp_path):
        now = datetime.now(UTC)
        p = tmp_path / "audit.jsonl"
        entry = json.dumps({"timestamp": (now - timedelta(hours=1)).isoformat(),
                            "failure": {"class": "OK"}, "tool_name": "t"})
        p.write_text("x" * 500 + "\n" + entry + "\n")   # long padding line, then the entry
        with patch("src.observability.aggregates._AUDIT_TAIL_BYTES", 120):
            out = aggregates.failure_aggregates(str(p), window_hours=24)
        assert out["classified"] == 1                   # padding line seeked past, entry parsed
