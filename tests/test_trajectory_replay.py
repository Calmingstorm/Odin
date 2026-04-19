"""Tests for trajectory replay narrative + diff."""
from __future__ import annotations

from src.trajectories.replay import (
    diff_turns,
    summarize_turn,
)


def _sample_turn(*, message_id="m1", sequence=None, final="done") -> dict:
    iterations = []
    for i, (tool, host, out) in enumerate(sequence or []):
        iterations.append({
            "iteration": i,
            "tool_calls": [{"id": f"c{i}", "name": tool, "input": {"host": host}}],
            "tool_results": [{"tool_use_id": f"c{i}", "content": out}],
            "llm_text": f"thinking about {tool}",
            "input_tokens": 100,
            "output_tokens": 50,
        })
    return {
        "message_id": message_id,
        "channel_id": "c1",
        "user_id": "alice",
        "user_name": "alice",
        "timestamp": "2026-04-18T10:00:00Z",
        "user_content": "deploy the thing",
        "iterations": iterations,
        "tools_used": [t for t, _, _ in (sequence or [])],
        "is_error": False,
        "final_response": final,
        "total_input_tokens": len(iterations) * 100,
        "total_output_tokens": len(iterations) * 50,
        "total_duration_ms": len(iterations) * 500,
    }


class TestSummarizeTurn:
    def test_minimal(self):
        out = summarize_turn(_sample_turn(sequence=[]))
        assert "USER:" in out
        assert "deploy the thing" in out
        assert "ITERATIONS: 0" in out
        assert "OUTCOME: ok" in out

    def test_with_tools(self):
        turn = _sample_turn(sequence=[
            ("run_command", "hostA", "exit 0"),
            ("validate_action", "hostA", '{"verdict": "pass"}'),
        ])
        out = summarize_turn(turn)
        assert "run_command(host=hostA)" in out
        assert "validate_action" in out
        assert "TOOLS USED: run_command, validate_action" in out
        assert "iter 0" in out and "iter 1" in out

    def test_error_outcome(self):
        turn = _sample_turn()
        turn["is_error"] = True
        assert "OUTCOME: ERROR" in summarize_turn(turn)

    def test_truncates_long_output(self):
        big = "X" * 5000
        turn = _sample_turn(sequence=[("run_command", "h", big)])
        out = summarize_turn(turn)
        assert big not in out  # truncated
        assert "[+" in out

    def test_invalid_input(self):
        assert "invalid trajectory" in summarize_turn(None)  # type: ignore[arg-type]
        assert "invalid trajectory" in summarize_turn("not a dict")  # type: ignore[arg-type]


class TestDiffTurns:
    def test_identical_sequences(self):
        a = _sample_turn(sequence=[("run_command", "h", "ok")])
        b = _sample_turn(message_id="m2", sequence=[("run_command", "h", "ok")])
        out = diff_turns(a, b)
        assert "sequences are identical" in out
        assert "FINAL RESPONSE: (identical)" in out

    def test_divergence_step(self):
        a = _sample_turn(sequence=[
            ("run_command", "h", "ok"),
            ("validate_action", "h", '{"verdict": "pass"}'),
        ])
        b = _sample_turn(message_id="m2", sequence=[
            ("run_command", "h", "ok"),
            ("detect_runbooks", "h", "[]"),
        ])
        out = diff_turns(a, b)
        assert "first divergence at step 1" in out
        assert "validate_action" in out
        assert "detect_runbooks" in out

    def test_output_diff_same_tool(self):
        a = _sample_turn(sequence=[("run_command", "h", "exit 0: ok")])
        b = _sample_turn(message_id="m2", sequence=[("run_command", "h", "exit 1: boom")])
        out = diff_turns(a, b)
        assert "output differs" in out
        assert "ok" in out and "boom" in out

    def test_outcome_differs(self):
        a = _sample_turn(sequence=[("run_command", "h", "ok")])
        b = _sample_turn(message_id="m2", sequence=[("run_command", "h", "fail")])
        b["is_error"] = True
        out = diff_turns(a, b)
        assert "A=ok vs B=ERROR" in out

    def test_user_content_diff(self):
        a = _sample_turn()
        b = _sample_turn(message_id="m2")
        b["user_content"] = "something else entirely"
        assert "USER CONTENT differs" in diff_turns(a, b)

    def test_prefix_case(self):
        a = _sample_turn(sequence=[
            ("run_command", "h", "ok"),
            ("validate_action", "h", "pass"),
        ])
        b = _sample_turn(message_id="m2", sequence=[("run_command", "h", "ok")])
        out = diff_turns(a, b)
        assert "prefix" in out
