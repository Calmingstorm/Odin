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

    def _record_user_content(self, trajectory, content):
        # P7: the bot delegate is retired — forward like it used to
        return self._turn_recorder._record_user_content(trajectory, content)

    def __init__(self, enabled=True, cap=4000):
        from src.discord.turn_recorder import TurnRecorder

        class _Obs:
            trajectory_user_content = enabled
            max_user_content_chars = cap
        class _Cfg:
            observability = _Obs()
        self.config = _Cfg()
        # P10 migration: _record_user_content delegates to TurnRecorder
        # (narrow-deps since RFC-002 P3)
        self._turn_recorder = TurnRecorder(
            get_config=lambda: self.config,
            trajectory_saver=None,
            reflector=None,
            outbound_webhook_dispatcher=None,
            loop_reflection_gate=None,
        )


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
# Tool results persisted into trajectory iterations
# ---------------------------------------------------------------------------

class TestStoredToolResults:
    def test_under_cap_passthrough(self):
        from src.trajectories.saver import stored_tool_results
        out = stored_tool_results(
            [{"type": "tool_result", "tool_use_id": "t1", "content": "ok"}],
        )
        assert out == [{"tool_use_id": "t1", "content": "ok"}]

    def test_caps_with_metadata(self):
        from src.trajectories.saver import stored_tool_results
        out = stored_tool_results(
            [{"tool_use_id": "t1", "content": "x" * 5000}], max_chars=100,
        )
        assert len(out[0]["content"]) == 100
        assert out[0]["truncated"] is True
        assert out[0]["original_chars"] == 5000

    def test_skips_non_dicts_and_tolerates_missing_keys(self):
        from src.trajectories.saver import stored_tool_results
        out = stored_tool_results(["garbage", None, {}])
        assert out == [{"tool_use_id": "", "content": ""}]
        assert stored_tool_results(None) == []


class _LoopIterClient:
    """Fake client driving the REAL loop body + user-content recording."""

    async def _run_loop_iteration(self, prompt, channel, prev_context, user_id):
        # P7: the bot delegate is retired — drive the runner directly
        return await self._tool_loop_runner.run_autonomous(prompt, channel, prev_context, user_id)

    def _record_user_content(self, trajectory, content):
        return self._turn_recorder._record_user_content(trajectory, content)

    def __init__(self, responses, tool_output="hi out", result_cap=2000):
        from types import SimpleNamespace

        class _Obs:
            loop_trace = True
            trajectory_user_content = True
            max_user_content_chars = 4000
            max_tool_result_chars = result_cap

        class _Tools:
            enabled = True
            tool_timeout_seconds = 5
            max_tool_iterations_loop = 4

        class _Cfg:
            observability = _Obs()
            tools = _Tools()

        self.config = _Cfg()
        from src.discord.turn_recorder import TurnRecorder

        # narrow-deps recorder (RFC-002 P3) — only _record_user_content is used
        self._turn_recorder = TurnRecorder(
            get_config=lambda: self.config,
            trajectory_saver=None,
            reflector=None,
            outbound_webhook_dispatcher=None,
            loop_reflection_gate=None,
        )
        self.loop_manager = SimpleNamespace(_loops={})
        self._responses = list(responses)
        self._tool_output = tool_output
        self.saved = []          # (trajectory, kwargs) per _save_turn_trajectory
        self.reflected = []      # kwargs per _maybe_loop_reflect

        async def _chat_with_tools(**kwargs):
            return self._responses.pop(0)

        async def _log_execution(**kwargs):
            pass

        self.llm_client = SimpleNamespace(chat_with_tools=_chat_with_tools)
        self.audit = SimpleNamespace(log_execution=_log_execution)

        from src.llm.model_breaker import ModelBreakerRegistry
        from src.llm.recovery import RecoveryPolicy

        _registry = ModelBreakerRegistry()
        self._fake_gateway = SimpleNamespace(
            active_client=self.llm_client,
            capacity_breaker_for=lambda model=None, provider=None: _registry.for_model(
                "codex", "m"
            ),
            recovery_policy=RecoveryPolicy,
            notify_generation_success=lambda provider: None,
        )

        # P4 migration: the runner takes narrow deps now. The recorder is the
        # REAL one; its save/reflect hooks are shadowed with this fake's
        # capture methods so assertions keep observing the loop body.
        self._turn_recorder._save_turn_trajectory = self._save_turn_trajectory
        self._turn_recorder._maybe_loop_reflect = self._maybe_loop_reflect
        from src.discord.tool_loop import ToolLoopDeps, ToolLoopRunner

        self._tool_loop_runner = ToolLoopRunner(
            ToolLoopDeps(
                get_config=lambda: self.config,
                get_default_system_prompt=lambda: "sys",
                get_context_compressor=lambda: None,
                llm_gateway=self._fake_gateway,
                prompt_builder=SimpleNamespace(build_full_prompt=lambda **kw: "sys"),
                tool_catalog=SimpleNamespace(
                    merged_definitions=lambda: [{"name": "run_command"}]
                ),
                channel_state=SimpleNamespace(),
                channel_config=SimpleNamespace(),
                delivery=SimpleNamespace(),
                turn_recorder=self._turn_recorder,
                completion_classifier=SimpleNamespace(),
                native_tools=SimpleNamespace(handles=lambda n: False),
                tool_executor=SimpleNamespace(),
                permissions=SimpleNamespace(),
                skill_manager=SimpleNamespace(),
                audit=self.audit,
                loop_manager=self.loop_manager,
                stuck_loop_tracker_cls=object,
            )
        )
        # Same capture seam the old bot-delegate override provided
        self._tool_loop_runner.dispatch_loop_tool = self._dispatch_loop_tool

    def _new_context_trace(self):
        return None

    def _build_system_prompt(self, **kwargs):
        return "sys"

    def _merged_tool_definitions(self):
        return [{"name": "run_command"}]

    async def _dispatch_loop_tool(self, tool_name, tool_input, msg_proxy, user_id):
        return self._tool_output

    async def _save_turn_trajectory(self, trajectory, **kwargs):
        self.saved.append((trajectory, kwargs))

    def _maybe_loop_reflect(self, **kwargs):
        self.reflected.append(kwargs)


def _tool_call_response(text="", calls=()):
    from types import SimpleNamespace
    return SimpleNamespace(
        text=text,
        tool_calls=[
            SimpleNamespace(id=i, name=n, input=inp) for (i, n, inp) in calls
        ],
        input_tokens=10,
        output_tokens=5,
    )


class TestLoopIterationTrajectory:
    @pytest.mark.asyncio
    async def test_persists_tool_calls_and_results(self):
        from types import SimpleNamespace
        fake = _LoopIterClient([
            _tool_call_response(calls=[("t1", "run_command", {"command": "echo hi"})]),
            _tool_call_response(text="done"),
        ])
        token = set_turn(source="loop", loop_id="l1", loop_iteration=1,
                         turn_id="loop:l1:1", channel_id="c1")
        try:
            out = await fake._run_loop_iteration(
                "do the thing", SimpleNamespace(id="c1"), None, "42",
            )
        finally:
            reset_turn(token)

        assert out == "done"
        assert len(fake.saved) == 1
        traj, save_kwargs = fake.saved[0]
        assert traj.source == "loop"
        assert traj.message_id == "loop:l1:1"
        assert traj.user_content == "do the thing"
        assert save_kwargs["final_response"] == "done"
        assert traj.loop_id == "l1"
        assert traj.loop_iteration == 1
        # The iteration must hold BOTH halves: the call and its result
        assert traj.iterations[0].tool_calls[0]["name"] == "run_command"
        assert traj.iterations[0].tool_results[0]["tool_use_id"] == "t1"
        assert traj.iterations[0].tool_results[0]["content"] == "hi out"
        assert fake.reflected and fake.reflected[0]["is_error"] is False

    @pytest.mark.asyncio
    async def test_results_respect_storage_cap(self):
        from types import SimpleNamespace
        fake = _LoopIterClient(
            [
                _tool_call_response(calls=[("t1", "run_command", {"command": "x"})]),
                _tool_call_response(text="done"),
            ],
            tool_output="y" * 5000,
            result_cap=100,
        )
        token = set_turn(source="loop", loop_id="l1", loop_iteration=1,
                         turn_id="loop:l1:1", channel_id="c1")
        try:
            await fake._run_loop_iteration(
                "go", SimpleNamespace(id="c1"), None, "42",
            )
        finally:
            reset_turn(token)
        stored = fake.saved[0][0].iterations[0].tool_results[0]
        assert len(stored["content"]) == 100
        assert stored["truncated"] is True
        assert stored["original_chars"] == 5000


# ---------------------------------------------------------------------------
# Loop manager correlation stamp — first iteration must be :1, not :2
# ---------------------------------------------------------------------------

class TestLoopManagerStamp:
    @pytest.mark.asyncio
    async def test_first_iteration_stamped_one_and_reset_after(self):
        import asyncio

        from src.tools.autonomous_loop import LoopManager

        mgr = LoopManager()
        stamps = []
        holder = {}

        class _Chan:
            id = "c9"
            def __init__(self):
                self.send_stamps = []
            async def send(self, *a, **k):
                self.send_stamps.append(get_turn())

        chan = _Chan()

        async def callback(prompt, channel, prev_context, cancel_event):
            stamps.append(dict(get_turn() or {}))
            mgr._loops[holder["lid"]]._cancel_event.set()
            return "ok"

        lid = mgr.start_loop(
            goal="g", channel=chan, requester_id="1", requester_name="n",
            iteration_callback=callback, interval_seconds=10,
            mode="silent", max_iterations=1,
        )
        assert not lid.startswith("Error")
        holder["lid"] = lid
        await asyncio.wait_for(mgr._loops[lid]._task, timeout=5)

        assert stamps and stamps[0]["loop_iteration"] == 1
        assert stamps[0]["turn_id"] == f"loop:{lid}:1"
        assert stamps[0]["source"] == "loop"
        # The manager resets the stamp after the callback, so post-iteration
        # sends (completion notices etc.) carry no stale turn context.
        assert chan.send_stamps and all(s is None for s in chan.send_stamps)


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

        # P5c: body moved to native_tools/agents_tasks.py (host-based)
        from src.discord.native_tools.agents_tasks import AgentTaskTools

        assert (
            "trajectory_saver=self._agent_trajectory_saver"
            in inspect.getsource(AgentTaskTools._handle_spawn_agent)
        )


def test_tool_iteration_serializes_frozen_context_budget_facts():
    from dataclasses import asdict

    from src.trajectories.saver import ToolIteration

    row = asdict(ToolIteration(
        iteration=1,
        context_density_milli=609,
        context_density_source="calibrated",
        context_primary_chars=193_184,
    ))
    assert row["context_density_milli"] == 609
    assert row["context_density_source"] == "calibrated"
    assert row["context_primary_chars"] == 193_184
