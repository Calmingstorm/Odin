"""Chat and loop emergency overflow recovery (campaign phase 4, §§7-9).

Pins the two new surfaces' rescue contracts: only the structural overflow
class enters rescue; compression is boundary-aware; the durability sequence
runs BEFORE the resend and a blocked write blocks the retry; a resumed
generation continues at the NEXT rung with its persisted identity facts;
latches publish only on server acceptance and scope per-surface.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

from src.discord.response_guards import StuckLoopTracker
from src.discord.tool_loop import ToolLoopRunner
from src.llm.context_budget import resolve_context_budget
from src.llm.context_compressor import SurfaceBoundary, estimate_message_chars
from src.llm.errors import LLMAuthError, LLMRequestError
from src.trajectories.saver import TrajectoryTurn
from src.turn_state.durability import TurnDurability


def _overflow() -> LLMRequestError:
    return LLMRequestError(
        "Codex stream failed: overflow",
        provider="codex",
        model="gpt-5.6-sol",
        code="context_length_exceeded",
    )


def _history(n: int, size: int) -> list[dict]:
    return [
        {"role": "user" if i % 2 == 0 else "assistant", "content": f"h{i}:" + "y" * size}
        for i in range(n)
    ]


_ENVELOPE = [
    {"role": "developer", "content": "preamble"},
    {"role": "user", "content": "CURRENT: do the thing"},
]


class _Gateway:
    """Codex-shaped gateway fake with capture + call_with_tools recording."""

    def __init__(self, script):
        self.client = SimpleNamespace(model="gpt-5.6-sol", reasoning_effort="xhigh")
        self.script = script
        self.calls: list[dict] = []

    def capture_serving_identity(self, config=None):
        from src.discord.llm_gateway import LLMServingIdentity

        return LLMServingIdentity(
            provider="codex", client=self.client,
            model=self.client.model, reasoning_effort=self.client.reasoning_effort,
        )

    def capacity_breaker_for(self, model=None, provider=None):
        return None

    def recovery_policy(self):
        from src.llm.recovery import RecoveryPolicy

        return RecoveryPolicy(deadline_seconds=30.0)

    def notify_generation_success(self, provider):
        pass

    async def call_with_tools(self, *, messages, system, tools, **kwargs):
        self.calls.append({"messages": list(messages), "kwargs": kwargs})
        return await self.script(len(self.calls), messages)


def _chat_state(messages, *, durability=None) -> SimpleNamespace:
    return SimpleNamespace(
        chat_cap=3,
        iteration=0,
        stuck_tracker=StuckLoopTracker(),
        wait_judgment_pending=False,
        _cancel=asyncio.Event(),
        _trajectory=TrajectoryTurn(),
        trace=None,
        _ch_id="c1",
        _req_id="r1",
        message=SimpleNamespace(
            channel=SimpleNamespace(id=1, typing=lambda: _NullCM()), content="hi"
        ),
        messages=messages,
        tools_used_in_loop=[],
        tools=[],
        system_prompt="sys",
        user_id="u1",
        durability=durability or TurnDurability.disabled(),
        _boundary_request_start=max(0, len(messages) - 2),
        _boundary_elided_replay=0,
        _char_latch=None,
        _rescue_passes=0,
        _gen_identity=None,
    )


class _NullCM:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


def _runner(gateway) -> ToolLoopRunner:
    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    runner._llm_gateway = gateway
    runner._get_config = lambda: SimpleNamespace(openai_codex=None)
    runner._get_context_compressor = lambda: None
    runner._get_compression_stats = lambda: None
    runner.errors_seen = []

    async def _fake_error_done(st, api_err):
        runner.errors_seen.append(api_err)
        return ("terminal", str(api_err))

    runner._llm_error_done = _fake_error_done
    return runner


class TestChatRescue:
    async def test_overflow_rescues_history_and_retries_same_identity(self):
        big = _history(60, 20_000) + _ENVELOPE

        async def script(n, messages):
            if n == 1:
                raise _overflow()
            return SimpleNamespace(text="ok", tool_calls=[], stop_reason="end_turn")

        gw = _Gateway(script)
        st = _chat_state(big)
        kind, val = await _runner(gw)._call_llm(st)
        assert kind == "ok"
        assert len(gw.calls) == 2
        # Retry went out smaller, envelope intact at the tail.
        assert estimate_message_chars(gw.calls[1]["messages"]) < estimate_message_chars(
            gw.calls[0]["messages"]
        )
        assert gw.calls[1]["messages"][-2:] == _ENVELOPE
        # Same pinned identity on both attempts.
        assert gw.calls[0]["kwargs"]["model"] == "gpt-5.6-sol"
        assert gw.calls[1]["kwargs"]["model"] == "gpt-5.6-sol"
        # Latch published from server acceptance; generation state settled.
        assert st._char_latch is not None
        assert st._rescue_passes == 0
        assert st._gen_identity is None
        assert [r["trigger"] for r in st._trajectory.context_recoveries] == ["overflow"]

    async def test_non_overflow_error_never_enters_rescue(self):
        async def script(n, messages):
            raise LLMAuthError("no healthy account")

        gw = _Gateway(script)
        st = _chat_state(_history(4, 100) + _ENVELOPE)
        kind, _val = await _runner(gw)._call_llm(st)
        assert kind == "done"
        assert st._trajectory.context_recoveries == []
        assert st._char_latch is None

    async def test_failed_retry_publishes_no_latch(self):
        big = _history(60, 20_000) + _ENVELOPE

        async def script(n, messages):
            if n == 1:
                raise _overflow()
            raise LLMAuthError("retry died")

        gw = _Gateway(script)
        st = _chat_state(big)
        kind, _val = await _runner(gw)._call_llm(st)
        assert kind == "done"
        assert st._char_latch is None  # local fit is not acceptance
        # The rescue attempt itself is still recorded for diagnostics, and
        # the generation facts survive for a potential resume.
        assert st._rescue_passes == 1
        assert st._gen_identity is not None

    async def test_durability_write_failure_blocks_the_retry(self):
        """Contract §7: the retry never runs ahead of what resume can
        reconstruct."""
        big = _history(60, 20_000) + _ENVELOPE

        async def script(n, messages):
            if n == 1:
                raise _overflow()
            raise AssertionError("retry must not run after a blocked write")

        class _BlockedDurability(TurnDurability):
            def __init__(self):
                super().__init__(None, None)

            @property
            def enabled(self):
                return True

            async def on_generation_start(self, st, deadline_seconds):
                return None

            def pop_resume_budget(self):
                return None

            async def on_context_recovery(self, st):
                raise OSError("store write failed")

        gw = _Gateway(script)
        st = _chat_state(big, durability=_BlockedDurability())
        kind, _val = await _runner(gw)._call_llm(st)
        assert kind == "done"  # terminal error path, not a rescue retry
        assert len(gw.calls) == 1

    async def test_resumed_generation_continues_at_next_rung_with_facts(self):
        """A turn resumed mid-recovery: persisted rung phase advances (never
        re-arms rung one) and the persisted identity FACTS pin the wire."""
        big = _history(70, 20_000) + _ENVELOPE
        sol_ladder = list(resolve_context_budget("gpt-5.6-sol").ladder)

        async def script(n, messages):
            if n == 1:
                raise _overflow()
            return SimpleNamespace(text="ok", tool_calls=[], stop_reason="end_turn")

        gw = _Gateway(script)
        # The resumed identity deliberately differs from the live client so
        # the pin provably comes from the FACTS.
        st = _chat_state(big)
        st._rescue_passes = 1
        st._gen_identity = {
            "provider": "codex",
            "model": "gpt-5.5",
            "effort": "low",
            "ladder": sol_ladder,
        }
        kind, _val = await _runner(gw)._call_llm(st)
        assert kind == "ok"
        assert gw.calls[0]["kwargs"]["model"] == "gpt-5.5"
        assert gw.calls[0]["kwargs"]["reasoning_effort"] == "low"
        # The rescue that fired used rung TWO (index 1): the compressed
        # payload came in at or under the second rung's target.
        rescue = st._trajectory.context_recoveries[0]
        assert rescue["attempt"] == 2
        assert rescue["target_chars"] == sol_ladder[1]


class TestLoopRescue:
    def _loop_state(self, messages) -> SimpleNamespace:
        boundary = SurfaceBoundary(request_start=2)
        return SimpleNamespace(
            messages=messages,
            system_prompt="sys",
            tools=[],
            _boundary=boundary,
            _char_latch=None,
            context_recoveries=[],
            _iteration_index=0,
        )

    async def test_loop_overflow_rescues_and_latches_on_acceptance(self):
        prev = [
            {"role": "user", "content": "Previous iteration results:\n" + "p" * 400_000},
            {"role": "assistant", "content": "Understood, I have the context."},
        ]
        prompt = [{"role": "user", "content": "GOAL: keep going"}]
        calls = {"n": 0}

        class _Client(SimpleNamespace):
            async def chat_with_tools(self, *, messages, system, tools, **kwargs):
                calls["n"] += 1
                if calls["n"] == 1:
                    raise _overflow()
                return SimpleNamespace(
                    text="ok", tool_calls=[], stop_reason="end_turn",
                    provenance_provider="codex", provenance_model="gpt-5.6-sol",
                    provenance_reasoning_effort="xhigh",
                )

        client = _Client(model="gpt-5.6-sol", reasoning_effort="xhigh")

        class _LoopGateway(_Gateway):
            def __init__(self):
                super().__init__(None)
                self.client = client

        gw = _LoopGateway()
        runner = _runner(gw)
        st = self._loop_state(prev + prompt)
        kind, _val = await runner._call_loop_llm(st)
        assert kind == "ok"
        assert calls["n"] == 2
        assert st._char_latch is not None
        assert [r["trigger"] for r in st.context_recoveries] == ["overflow"]
        # The current autonomous prompt survived verbatim.
        assert st.messages[-1] == prompt[0]
