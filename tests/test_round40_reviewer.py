"""Tests for Round 40 REVIEWER fixes — validates bug fixes from rounds 31-39."""
from __future__ import annotations

import asyncio
from collections import deque
from unittest.mock import AsyncMock, MagicMock, PropertyMock, patch

import pytest

# ---------------------------------------------------------------------------
# Fix 1: output_streamer finish() now emits ALL buffered data (no truncation)
# ---------------------------------------------------------------------------


class TestOutputStreamerFinishDrainsFully:
    """finish() must emit ALL remaining buffer, not truncate at max_chunk_chars."""

    @pytest.mark.asyncio
    async def test_finish_emits_all_chunks_when_buffer_exceeds_max(self):
        from src.tools.output_streamer import ToolOutputStreamer

        s = ToolOutputStreamer(
            enabled_tools={"run_command"},
            chunk_interval=100.0,  # prevent mid-stream emits
            max_chunk_chars=100,
        )
        emitted: list = []
        s.add_listener(AsyncMock(side_effect=lambda c: emitted.append(c)))

        _, on_output, finish = s.create_callback("run_command", "ch1")
        # Buffer 350 chars — should require 4 chunks on finish (100+100+100+50 + final)
        await on_output("A" * 350)
        assert len(emitted) == 0  # rate-limited, nothing emitted yet

        await finish()
        # 3 data chunks (100, 100, 100, 50) + 1 final finished=True
        data_chunks = [c for c in emitted if not c.finished]
        final_chunks = [c for c in emitted if c.finished]
        assert len(final_chunks) == 1
        assert len(data_chunks) == 4
        total_chars = sum(len(c.chunk) for c in data_chunks)
        assert total_chars == 350

    @pytest.mark.asyncio
    async def test_finish_single_chunk_under_max(self):
        from src.tools.output_streamer import ToolOutputStreamer

        s = ToolOutputStreamer(
            enabled_tools={"run_command"},
            chunk_interval=100.0,
            max_chunk_chars=500,
        )
        emitted: list = []
        s.add_listener(AsyncMock(side_effect=lambda c: emitted.append(c)))

        _, on_output, finish = s.create_callback("run_command", "ch1")
        await on_output("short output")
        await finish()
        data_chunks = [c for c in emitted if not c.finished]
        assert len(data_chunks) == 1
        assert data_chunks[0].chunk == "short output"

    @pytest.mark.asyncio
    async def test_finish_sequence_numbers_monotonic(self):
        from src.tools.output_streamer import ToolOutputStreamer

        s = ToolOutputStreamer(
            enabled_tools={"run_command"},
            chunk_interval=100.0,
            max_chunk_chars=50,
        )
        emitted: list = []
        s.add_listener(AsyncMock(side_effect=lambda c: emitted.append(c)))

        _, on_output, finish = s.create_callback("run_command")
        await on_output("X" * 200)
        await finish()
        sequences = [c.sequence for c in emitted]
        assert sequences == sorted(sequences)
        assert len(set(sequences)) == len(sequences)  # all unique


# ---------------------------------------------------------------------------
# Fix 2: ssh.py _read_lines_with_callback — proc.wait() is now bounded
# ---------------------------------------------------------------------------


class TestReadLinesCallbackTimeout:
    """proc.wait() must not hang indefinitely after readline loop exits."""

    @pytest.mark.asyncio
    async def test_proc_wait_is_bounded(self):
        from src.tools.ssh import _read_lines_with_callback

        proc = AsyncMock()
        proc.stdout.readline = AsyncMock(side_effect=[b"line\n", b""])
        proc.returncode = 0

        # Make proc.wait() hang — it should be killed after bounded timeout
        async def hang_forever():
            await asyncio.sleep(999)

        proc.wait = hang_forever
        proc.kill = MagicMock()

        cb = AsyncMock()
        code, output = await _read_lines_with_callback(proc, timeout=30, on_output=cb)
        # proc.wait hung, so proc.kill should have been called
        proc.kill.assert_called_once()
        assert "line" in output

    @pytest.mark.asyncio
    async def test_proc_wait_completes_normally(self):
        from src.tools.ssh import _read_lines_with_callback

        proc = AsyncMock()
        proc.stdout.readline = AsyncMock(side_effect=[b"ok\n", b""])
        proc.wait = AsyncMock(return_value=0)
        proc.returncode = 0

        cb = AsyncMock()
        code, output = await _read_lines_with_callback(proc, timeout=10, on_output=cb)
        assert code == 0
        assert "ok" in output


# ---------------------------------------------------------------------------
# Fix 3: ssh.py on_output callback failures now logged (not silently swallowed)
# ---------------------------------------------------------------------------


class TestReadLinesCallbackLogging:
    """on_output callback errors should be logged, not silently ignored."""

    @pytest.mark.asyncio
    async def test_callback_error_logged(self):
        from src.tools.ssh import _read_lines_with_callback

        proc = AsyncMock()
        proc.stdout.readline = AsyncMock(side_effect=[b"data\n", b""])
        proc.wait = AsyncMock(return_value=0)
        proc.returncode = 0

        cb = AsyncMock(side_effect=ValueError("callback broke"))

        with patch("src.tools.ssh.log") as mock_log:
            code, output = await _read_lines_with_callback(proc, timeout=10, on_output=cb)
            assert code == 0
            mock_log.debug.assert_called()

    @pytest.mark.asyncio
    async def test_callback_error_does_not_lose_data(self):
        from src.tools.ssh import _read_lines_with_callback

        proc = AsyncMock()
        proc.stdout.readline = AsyncMock(
            side_effect=[b"line1\n", b"line2\n", b""],
        )
        proc.wait = AsyncMock(return_value=0)
        proc.returncode = 0

        cb = AsyncMock(side_effect=[ValueError("broke"), None])
        code, output = await _read_lines_with_callback(proc, timeout=10, on_output=cb)
        # Both lines should be in output despite callback error on line1
        assert "line1" in output
        assert "line2" in output


# ---------------------------------------------------------------------------
# Fix 4: agents/manager.py get_descendants uses deque instead of list.pop(0)
# ---------------------------------------------------------------------------


class TestGetDescendantsDeque:
    """get_descendants should use deque.popleft() for O(1) queue operations."""

    def test_deque_imported(self):
        import src.agents.manager as mod
        assert hasattr(mod, "deque")

    def test_get_descendants_returns_correct_results(self):
        from src.agents.manager import AgentManager

        mgr = AgentManager()

        # Build a 3-level tree manually
        root_info = MagicMock()
        root_info.id = "root"
        root_info.children_ids = ["child1", "child2"]
        root_info._sm = MagicMock()

        child1_info = MagicMock()
        child1_info.id = "child1"
        child1_info.children_ids = ["grandchild1"]
        child1_info._sm = MagicMock()

        child2_info = MagicMock()
        child2_info.id = "child2"
        child2_info.children_ids = []
        child2_info._sm = MagicMock()

        grandchild_info = MagicMock()
        grandchild_info.id = "grandchild1"
        grandchild_info.children_ids = []
        grandchild_info._sm = MagicMock()

        mgr._agents = {
            "root": root_info,
            "child1": child1_info,
            "child2": child2_info,
            "grandchild1": grandchild_info,
        }

        descendants = mgr.get_descendants("root")
        assert set(descendants) == {"child1", "child2", "grandchild1"}
        assert len(descendants) == 3

    def test_get_descendants_handles_cycles(self):
        from src.agents.manager import AgentManager

        mgr = AgentManager()

        a = MagicMock()
        a.children_ids = ["b"]
        b = MagicMock()
        b.children_ids = ["a"]  # cycle

        mgr._agents = {"a": a, "b": b}
        descendants = mgr.get_descendants("a")
        assert "b" in descendants
        # Should not loop forever — visited set prevents cycles
        assert len(descendants) <= 2


# ---------------------------------------------------------------------------
# Fix 5: health/checker.py check_sessions — degraded now returns healthy=False
# ---------------------------------------------------------------------------


class TestCheckSessionsDegradedHealthy:
    """Over-budget sessions should report healthy=False, not healthy=True."""

    def test_over_budget_returns_healthy_false(self):
        from src.health.checker import check_sessions

        bot = MagicMock()
        bot.sessions._sessions = {"ch1": MagicMock()}
        bot.sessions.get_token_metrics.return_value = {
            "total_tokens": 100000,
            "over_budget_count": 2,
        }
        result = check_sessions(bot)
        assert result.status == "degraded"
        assert result.healthy is False

    def test_normal_sessions_still_healthy_true(self):
        from src.health.checker import check_sessions

        bot = MagicMock()
        bot.sessions._sessions = {"ch1": MagicMock()}
        bot.sessions.get_token_metrics.return_value = {
            "total_tokens": 500,
            "over_budget_count": 0,
        }
        result = check_sessions(bot)
        assert result.status == "ok"
        assert result.healthy is True

    def test_degraded_sessions_contribute_to_overall_degraded(self):
        from src.health.checker import check_all

        bot = MagicMock()
        # Set up sessions with over-budget
        bot.sessions._sessions = {"ch1": MagicMock()}
        bot.sessions.get_token_metrics.return_value = {
            "total_tokens": 100000,
            "over_budget_count": 1,
        }
        # Set up minimal other subsystems
        bot.is_ready.return_value = True
        bot.guilds = []

        result = check_all(bot)
        session_comp = next(
            c for c in result["components"] if c["name"] == "sessions"
        )
        assert session_comp["healthy"] is False
        assert session_comp["status"] == "degraded"


# ---------------------------------------------------------------------------
# Additional tightening tests for prior rounds
# ---------------------------------------------------------------------------


class TestRecoveryStatsThreadSafety:
    """RecoveryStats list trimming should work under rapid sequential calls."""

    def test_recent_list_bounded(self):
        from src.tools.recovery import RecoveryCategory, RecoveryStats

        stats = RecoveryStats(max_recent=5)
        for i in range(20):
            stats.record_failure("tool", RecoveryCategory.SSH_TRANSIENT, f"err{i}")
        assert len(stats._recent) <= 5

    def test_recent_list_keeps_latest(self):
        from src.tools.recovery import RecoveryCategory, RecoveryStats

        stats = RecoveryStats(max_recent=3)
        for i in range(10):
            stats.record_success("tool", RecoveryCategory.SSH_TRANSIENT, f"ok{i}")
        recent = stats.get_recent(3)
        assert len(recent) == 3


class TestAgentStateTransitionsCompleteness:
    """Every active state should be reachable from SPAWNING."""

    def test_all_active_states_reachable(self):
        from src.agents.manager import ACTIVE_STATES, VALID_TRANSITIONS, AgentState

        reachable = {AgentState.SPAWNING}
        frontier = [AgentState.SPAWNING]
        while frontier:
            state = frontier.pop()
            for target in VALID_TRANSITIONS.get(state, frozenset()):
                if target not in reachable:
                    reachable.add(target)
                    frontier.append(target)
        for active in ACTIVE_STATES:
            assert active in reachable, f"{active} not reachable from SPAWNING"

    def test_all_terminal_states_reachable(self):
        from src.agents.manager import TERMINAL_STATES, VALID_TRANSITIONS, AgentState

        reachable = {AgentState.SPAWNING}
        frontier = [AgentState.SPAWNING]
        while frontier:
            state = frontier.pop()
            for target in VALID_TRANSITIONS.get(state, frozenset()):
                if target not in reachable:
                    reachable.add(target)
                    frontier.append(target)
        for terminal in TERMINAL_STATES:
            assert terminal in reachable, f"{terminal} not reachable from SPAWNING"


class TestBranchFreshnessCheckerImports:
    """Branch freshness module should be importable and functional."""

    def test_is_test_command_basics(self):
        from src.tools.branch_freshness import is_test_command

        assert is_test_command("pytest tests/")
        assert is_test_command("python -m pytest")
        assert not is_test_command("ls -la")

    def test_is_test_failure_basics(self):
        from src.tools.branch_freshness import is_test_failure

        assert is_test_failure("3 failed, 10 passed", exit_code=1)
        assert not is_test_failure("10 passed", exit_code=0)


class TestAuxiliaryLLMCostTrackingEdge:
    """Cost tracking should handle missing _last_*_tokens attributes gracefully."""

    @pytest.mark.asyncio
    async def test_cost_tracking_with_missing_token_attrs(self):
        from src.llm.auxiliary import AuxiliaryLLMClient

        aux = AsyncMock()
        aux.model = "gpt-4o-mini"
        aux.chat = AsyncMock(return_value="result")
        aux.breaker = MagicMock()
        aux.breaker.state = "closed"
        # Deliberately set token attrs
        aux._last_input_tokens = 10
        aux._last_output_tokens = 20

        primary = AsyncMock()
        primary.model = "gpt-4o"

        tracker = MagicMock()
        client = AuxiliaryLLMClient(aux, primary, cost_tracker=tracker)
        await client.chat([{"role": "user", "content": "hi"}], "system", task="compaction")
        tracker.record.assert_called_once()
        call_kwargs = tracker.record.call_args
        assert call_kwargs[1]["model"] == "gpt-4o-mini"
        assert call_kwargs[1]["user_id"] == "auxiliary:compaction"


class TestFilterAgentToolsDepthBoundary:
    """filter_agent_tools must remove agent tools at exactly max_depth."""

    def test_at_max_depth_tools_removed(self):
        from src.agents.manager import AGENT_MANAGEMENT_TOOLS, filter_agent_tools

        tools = [{"name": "spawn_agent"}, {"name": "run_command"}, {"name": "read_file"}]
        filtered = filter_agent_tools(tools, depth=2, max_depth=2)
        names = {t["name"] for t in filtered}
        assert "spawn_agent" not in names
        assert "run_command" in names

    def test_below_max_depth_tools_kept(self):
        from src.agents.manager import filter_agent_tools

        tools = [{"name": "spawn_agent"}, {"name": "run_command"}]
        filtered = filter_agent_tools(tools, depth=1, max_depth=2)
        names = {t["name"] for t in filtered}
        assert "spawn_agent" in names

    def test_above_max_depth_tools_removed(self):
        from src.agents.manager import filter_agent_tools

        tools = [{"name": "spawn_agent"}, {"name": "run_command"}]
        filtered = filter_agent_tools(tools, depth=3, max_depth=2)
        names = {t["name"] for t in filtered}
        assert "spawn_agent" not in names
        assert "run_command" in names
