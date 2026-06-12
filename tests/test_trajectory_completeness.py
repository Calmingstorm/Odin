"""Tests for trajectory completeness (PR: complete trajectory coverage and
prompt-input observability).

Covers: user_content recording (cap/scrub/metadata/kill-switch), the loop
reflection gate (dedup/cooldown/recovery/global cap), turn correlation
context, the command_failed classifier class, and the agent trajectory-saver
wiring that was orphaned in production.
"""
from __future__ import annotations

import pytest

from src.learning.loop_reflection import LoopReflectionGate, failure_signature
from src.observability.correlation import get_turn, reset_turn, set_turn
from src.observability.failure_classes import classify_failure
from src.trajectories.saver import TrajectoryTurn

# ---------------------------------------------------------------------------
# Loop reflection gate — Odin's spec: one lesson, not sixty
# ---------------------------------------------------------------------------

class TestLoopReflectionGate:
    def test_first_occurrence_reflects(self):
        gate = LoopReflectionGate()
        ok, reason = gate.evaluate("loop1", is_error=True,
                                   failure_class="network", error_text="ECONNRESET")
        assert ok and reason == "first_occurrence"

    def test_identical_failure_suppressed_all_night(self):
        gate = LoopReflectionGate(cooldown_hours=12)
        gate.evaluate("loop1", is_error=True, failure_class="network",
                      error_text="dns timeout host 10.0.0.5")
        suppressed = [
            gate.evaluate("loop1", is_error=True, failure_class="network",
                          error_text="dns timeout host 10.0.0.7")  # digits normalized
            for _ in range(60)
        ]
        assert all(not ok for ok, _ in suppressed)
        assert {r for _, r in suppressed} == {"duplicate_suppressed"}

    def test_signature_change_reflects(self):
        gate = LoopReflectionGate()
        gate.evaluate("loop1", is_error=True, failure_class="network",
                      error_text="dns timeout")
        ok, reason = gate.evaluate("loop1", is_error=True, failure_class="auth",
                                   error_text="401 unauthorized")
        assert ok and reason == "signature_change"

    def test_recovery_after_repeated_failure_reflects_once(self):
        gate = LoopReflectionGate()
        for _ in range(3):
            gate.evaluate("loop1", is_error=True, failure_class="timeout",
                          error_text="timed out")
        ok, reason = gate.evaluate("loop1", is_error=False)
        assert ok and reason == "recovery"
        # Next success is routine again
        ok2, reason2 = gate.evaluate("loop1", is_error=False)
        assert not ok2 and reason2 == "routine_success"

    def test_single_failure_then_success_is_not_recovery(self):
        gate = LoopReflectionGate()
        gate.evaluate("loop1", is_error=True, failure_class="timeout",
                      error_text="timed out")
        ok, reason = gate.evaluate("loop1", is_error=False)
        assert not ok and reason == "routine_success"

    def test_cooldown_expiry_allows_again(self):
        gate = LoopReflectionGate(cooldown_hours=0)  # immediate expiry
        gate.evaluate("loop1", is_error=True, failure_class="network",
                      error_text="dns timeout")
        ok, reason = gate.evaluate("loop1", is_error=True, failure_class="network",
                                   error_text="dns timeout")
        assert ok and reason == "cooldown_expired"

    def test_global_hourly_cap(self):
        gate = LoopReflectionGate(max_per_hour=3)
        granted = 0
        for i in range(10):
            ok, _ = gate.evaluate(f"loop{i}", is_error=True,
                                  failure_class="network", error_text=f"err {i}")
            granted += ok
        assert granted == 3

    def test_loops_are_isolated(self):
        gate = LoopReflectionGate()
        gate.evaluate("loop1", is_error=True, failure_class="network",
                      error_text="dns timeout")
        ok, reason = gate.evaluate("loop2", is_error=True, failure_class="network",
                                   error_text="dns timeout")
        assert ok and reason == "first_occurrence"

    def test_signature_normalizes_digits(self):
        a = failure_signature("l1", "network", "timeout after 30s on host 10.0.0.5")
        b = failure_signature("l1", "network", "timeout after 99s on host 10.9.8.7")
        assert a == b

    def test_gate_never_raises(self):
        gate = LoopReflectionGate()
        ok, reason = gate.evaluate(None, is_error=True,  # type: ignore[arg-type]
                                   failure_class=None, error_text=None)  # type: ignore[arg-type]
        assert isinstance(ok, bool)


# ---------------------------------------------------------------------------
# Turn correlation context
# ---------------------------------------------------------------------------

class TestCorrelation:
    def test_set_get_reset(self):
        token = set_turn(turn_id="t1", source="loop", loop_id="l1", empty=None)
        turn = get_turn()
        assert turn == {"turn_id": "t1", "source": "loop", "loop_id": "l1"}
        reset_turn(token)
        assert get_turn() is None

    @pytest.mark.asyncio
    async def test_propagates_into_gathered_tasks(self):
        import asyncio
        set_turn(turn_id="t2", source="discord")

        async def child():
            return (get_turn() or {}).get("turn_id")

        results = await asyncio.gather(child(), child())
        assert results == ["t2", "t2"]

    @pytest.mark.asyncio
    async def test_audit_logger_stamps_turn(self, tmp_path):
        import json

        from src.audit.logger import AuditLogger
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        set_turn(turn_id="loop:abc:3", source="loop", loop_id="abc", loop_iteration=3)
        await logger.log_execution(
            user_id="42", user_name="loop", channel_id="ch1",
            tool_name="run_command", tool_input={"command": "x"},
            approved=True, result_summary="ok", execution_time_ms=5,
        )
        entry = json.loads((tmp_path / "audit.jsonl").read_text().splitlines()[-1])
        assert entry["turn"]["turn_id"] == "loop:abc:3"
        assert entry["turn"]["loop_id"] == "abc"
        assert entry["turn"]["source"] == "loop"


# ---------------------------------------------------------------------------
# command_failed classification
# ---------------------------------------------------------------------------

class TestCommandFailedClass:
    CASES = [
        ("[governor: allowed — high risk, recursive delete]\nScript failed (exit 1):",
         "command_failed"),
        ("Command failed (exit 2):\n/bin/sh: 1: set: Illegal option -o pipefail", "command_failed"),
        ("process exited with code 3", "command_failed"),
        ("Error: HTTP 403: Forbidden\n\n[recovery hint: authentication failure]", "auth"),
        # Specific classes still win over the generic exit class
        ("Script failed (exit 1):\nModuleNotFoundError: No module named 'x'", "dependency_missing"),
        ("Script failed (exit 1):\nCONFLICT (content): Merge conflict in a.py", "conflict"),
    ]

    @pytest.mark.parametrize("text,expected", CASES)
    def test_matrix(self, text, expected):
        assert classify_failure(text)["class"] == expected


# ---------------------------------------------------------------------------
# user_content recording
# ---------------------------------------------------------------------------

class _FakeClient:
    """Just enough client surface for _record_user_content."""
    from src.discord.client import OdinBot as _C  # noqa: N814
    _record_user_content = _C._record_user_content

    def __init__(self, enabled=True, cap=4000):
        class _Obs:
            trajectory_user_content = enabled
            max_user_content_chars = cap
        class _Cfg:
            observability = _Obs()
        self.config = _Cfg()


class TestUserContentRecording:
    def test_records_plain_content(self):
        turn = TrajectoryTurn()
        _FakeClient()._record_user_content(turn, "fix the nginx config")
        assert turn.user_content == "fix the nginx config"
        assert turn.user_content_truncated is False
        assert "user_content_truncated" not in turn.to_dict()

    def test_caps_with_metadata(self):
        turn = TrajectoryTurn()
        _FakeClient(cap=100)._record_user_content(turn, "x" * 500)
        assert len(turn.user_content) == 100
        assert turn.user_content_truncated is True
        assert turn.user_content_original_chars == 500
        d = turn.to_dict()
        assert d["user_content_truncated"] is True
        assert d["user_content_original_chars"] == 500

    def test_kill_switch(self):
        turn = TrajectoryTurn()
        _FakeClient(enabled=False)._record_user_content(turn, "secret request")
        assert turn.user_content == ""

    def test_secrets_scrubbed(self):
        turn = TrajectoryTurn()
        _FakeClient()._record_user_content(
            turn, "use key sk-abcdefghijklmnopqrstuvwx1234 for the api",
        )
        assert "sk-abcdefghijklmnopqrstuvwx1234" not in turn.user_content

    def test_never_raises(self):
        turn = TrajectoryTurn()
        _FakeClient()._record_user_content(turn, None)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Agent trajectory saver wiring — the production-orphaned saver
# ---------------------------------------------------------------------------

class TestAgentSaverWiring:
    def test_loop_bridge_forwards_saver(self):
        from src.agents.loop_bridge import LoopAgentBridge

        class RecordingManager:
            def __init__(self):
                self.kwargs = None
            def spawn(self, **kwargs):
                self.kwargs = kwargs
                return "agent-1"

        mgr = RecordingManager()
        sentinel = object()
        bridge = LoopAgentBridge(mgr, trajectory_saver=sentinel)
        bridge.spawn_agents_for_loop(
            loop_id="l1", iteration=1, loop_goal="g",
            tasks=[{"label": "a", "goal": "t"}],
            channel_id="c", requester_id="u", requester_name="n",
            iteration_callback=None, tool_executor_callback=None,
        )
        assert mgr.kwargs is not None
        assert mgr.kwargs.get("trajectory_saver") is sentinel

    def test_chat_spawn_passes_saver(self):
        # The omission hid for months because nothing asserted the call site.
        import inspect

        from src.discord.client import OdinBot
        src = inspect.getsource(OdinBot._handle_spawn_agent)
        assert "trajectory_saver=self.agent_trajectory_saver" in src
