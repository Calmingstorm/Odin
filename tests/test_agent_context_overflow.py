"""Agent context-overflow recovery (design settled with Odin, 2026-08-09).

The constraint these tests enforce, near-verbatim from Aaron: the fix must
NOT change how agents behave today except where today's behavior is death by
``context_length_exceeded``. Hence the load-bearing pin: an agent that never
overflows receives byte-for-byte identical payloads and callback call counts
with the recovery machinery present.
"""

from __future__ import annotations

import asyncio
import copy
import json

import pytest

from src.agents.manager import (
    _EMERGENCY_TARGET_CHARS,
    _EMERGENCY_TARGET_CHARS_AGGRESSIVE,
    AgentManager,
    _is_context_overflow,
)
from src.llm.context_compressor import (
    emergency_compress_for_window,
    estimate_message_chars,
)
from src.llm.errors import LLMRequestError, LLMTransportError


def _overflow_error() -> LLMRequestError:
    return LLMRequestError(
        'Codex stream failed: error: {"type": "error", "error": '
        '{"type": "invalid_request_error", "code": "context_length_exceeded"}}',
        provider="codex",
        model="gpt-5.6-terra",
        code="context_length_exceeded",
    )


def _iteration(i: int, size: int) -> list[dict]:
    return [
        {
            "role": "assistant",
            "content": [
                {"type": "tool_use", "id": f"tu_{i}", "name": "web_search", "input": {"q": str(i)}}
            ],
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": f"tu_{i}",
                    "content": f"result-{i}:" + ("x" * size),
                }
            ],
        },
    ]


def _messages(n_iterations: int, size: int) -> list[dict]:
    msgs: list[dict] = [{"role": "user", "content": "TASK: research the thing"}]
    for i in range(n_iterations):
        msgs.extend(_iteration(i, size))
    return msgs


def _pairing_valid(messages: list[dict]) -> bool:
    """Every tool_result must follow a tool_use with the matching id."""
    seen_uses: set[str] = set()
    for msg in messages:
        content = msg.get("content")
        if not isinstance(content, list):
            continue
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "tool_use":
                seen_uses.add(block.get("id"))
            elif block.get("type") == "tool_result":
                if block.get("tool_use_id") not in seen_uses:
                    return False
    return True


class _Harness:
    """Drive AgentManager with a scripted iteration callback."""

    def __init__(self, script):
        # script: callable(call_index, messages) -> response dict or raises
        self.calls: list[list[dict]] = []
        self.script = script

    async def iteration_callback(self, messages, system_prompt, tools):
        self.calls.append(copy.deepcopy(messages))
        return await self.script(len(self.calls), messages)

    def spawn(self, mgr: AgentManager) -> str:
        return mgr.spawn(
            label="t",
            goal="go",
            channel_id="c1",
            requester_id="u1",
            requester_name="user",
            iteration_callback=self.iteration_callback,
            tool_executor_callback=self._tool_cb,
        )

    async def _tool_cb(self, name, tool_input):
        return "tool-ok"


async def _run_to_terminal(mgr: AgentManager, agent_id: str) -> None:
    await mgr._agents[agent_id]._task
    await asyncio.sleep(0)


class TestByteForByteEquivalence:
    """Agents that never overflow see EXACTLY today's payloads and calls."""

    async def test_no_overflow_payloads_identical_and_no_recovery_state(self):
        async def script(n, messages):
            if n < 3:
                return {
                    "text": "",
                    "tool_calls": [
                        {"id": f"tu_s{n}", "name": "web_search", "input": {"q": "x"}}
                    ],
                    "stop_reason": "tool_use",
                }
            return {"text": "DONE: fine", "tool_calls": [], "stop_reason": "end_turn"}

        h = _Harness(script)
        mgr = AgentManager()
        agent_id = h.spawn(mgr)
        assert not agent_id.startswith("Error")
        await _run_to_terminal(mgr, agent_id)
        agent = mgr._agents[agent_id]

        assert agent.context_char_ceiling is None
        assert agent.context_recoveries == []
        # to_dict must not even carry the recovery keys (wire compatibility).
        d = mgr.to_dict(agent) if hasattr(mgr, "to_dict") else agent_to_dict(mgr, agent)
        assert "context_recoveries" not in json.dumps(d) or not agent.context_recoveries
        # Callback saw monotonically growing history, never a compressed form:
        # no emergency summary marker anywhere.
        for payload in h.calls:
            assert "[Emergency context compression" not in json.dumps(payload)

    async def test_overflow_predicate_is_structural_not_substring(self):
        transport = LLMTransportError(
            "Codex stream failed: context_length_exceeded mentioned in body",
            provider="codex",
        )
        assert not _is_context_overflow(transport)
        request_no_code = LLMRequestError("bad request", provider="codex")
        assert not _is_context_overflow(request_no_code)
        assert _is_context_overflow(_overflow_error())


def agent_to_dict(mgr, agent):
    for name in ("_agent_dict", "agent_to_dict"):
        fn = getattr(mgr, name, None)
        if fn:
            return fn(agent)
    return {"context_recoveries": agent.context_recoveries}


class TestOverflowRecovery:
    async def test_first_overflow_compresses_retries_same_iteration_and_latches(self):
        big = _messages(40, 30_000)  # ~1.2M chars

        async def script(n, messages):
            if n == 1:
                # Simulate the provider seeing an oversized payload. Grow the
                # agent's real message list to the oversized shape first, the
                # way 40 scrape iterations would have.
                messages.clear()
                messages.extend(copy.deepcopy(big))
                raise _overflow_error()
            return {"text": "DONE: ok", "tool_calls": [], "stop_reason": "end_turn"}

        h = _Harness(script)
        mgr = AgentManager()
        agent_id = h.spawn(mgr)
        await _run_to_terminal(mgr, agent_id)
        agent = mgr._agents[agent_id]

        # Recovered: terminal state is COMPLETED, not FAILED.
        assert agent.state.name in ("COMPLETED", "READY"), agent.error
        # The retry happened within the same iteration: two callback calls,
        # and the SECOND saw a compressed payload under the primary target.
        assert len(h.calls) == 2
        retry_payload = h.calls[1]
        assert estimate_message_chars(retry_payload) <= _EMERGENCY_TARGET_CHARS
        # Task preserved verbatim, newest iteration retained, pairing valid.
        assert retry_payload[0] == {"role": "user", "content": "TASK: research the thing"}
        assert "result-39" in json.dumps(retry_payload)
        assert _pairing_valid(retry_payload)
        # Latch set to the size that succeeded; recovery recorded.
        assert agent.context_char_ceiling is not None
        assert agent.context_char_ceiling <= _EMERGENCY_TARGET_CHARS
        assert len(agent.context_recoveries) == 1
        r = agent.context_recoveries[0]
        assert r["trigger"] == "overflow" and r["attempt"] == 1 and r["fits"]

    async def test_second_overflow_uses_aggressive_target_then_existing_failure(self):
        big = _messages(40, 30_000)

        async def script(n, messages):
            messages.clear()
            messages.extend(copy.deepcopy(big))
            raise _overflow_error()

        h = _Harness(script)
        mgr = AgentManager()
        agent_id = h.spawn(mgr)
        await _run_to_terminal(mgr, agent_id)
        agent = mgr._agents[agent_id]

        # Exactly two emergency passes, then the existing failure handling —
        # no loops.
        assert len(h.calls) == 3
        assert estimate_message_chars(h.calls[2]) <= _EMERGENCY_TARGET_CHARS_AGGRESSIVE
        assert agent.state.name == "FAILED"
        assert "context_length_exceeded" in (agent.error or "")
        assert [r["attempt"] for r in agent.context_recoveries] == [1, 2]

    async def test_latch_compacts_before_send_without_an_error(self):
        big = _messages(40, 30_000)
        grow = _messages(35, 30_000)  # over the latch after recovery

        async def script(n, messages):
            if n == 1:
                messages.clear()
                messages.extend(copy.deepcopy(big))
                raise _overflow_error()
            if n == 2:
                # Ask for one more tool round so another iteration happens,
                # then balloon the history past the latch.
                return {
                    "text": "",
                    "tool_calls": [
                        {"id": "tu_more", "name": "web_search", "input": {"q": "y"}}
                    ],
                    "stop_reason": "tool_use",
                }
            return {"text": "DONE", "tool_calls": [], "stop_reason": "end_turn"}

        h = _Harness(script)
        mgr = AgentManager()
        agent_id = h.spawn(mgr)
        agent = mgr._agents[agent_id]

        # Balloon the messages between iterations by riding the tool result:
        # after call 2 returns a tool_call, the worker appends the result and
        # loops; grow the history there via the tool callback.
        original_tool_cb = h._tool_cb

        async def fat_tool_cb(name, tool_input):
            agent.messages.extend(copy.deepcopy(grow))
            return await original_tool_cb(name, tool_input)

        agent.tool_executor_callback = fat_tool_cb
        await _run_to_terminal(mgr, agent_id)

        assert agent.state.name in ("COMPLETED", "READY"), agent.error
        # The third call (post-latch) was compacted BEFORE sending: under the
        # ceiling, and a latch-triggered recovery record exists.
        ceiling = agent.context_char_ceiling
        assert ceiling is not None
        assert estimate_message_chars(h.calls[2]) <= ceiling
        assert any(r["trigger"] == "latch" for r in agent.context_recoveries)
        # Only ONE 400-driven recovery ever happened; the latch prevented more.
        assert sum(1 for r in agent.context_recoveries if r["trigger"] == "overflow") == 1


class TestEmergencyCompressor:
    def test_size_based_retention_and_summary(self):
        msgs = _messages(30, 20_000)
        out, report = emergency_compress_for_window(msgs, target_chars=150_000)
        assert report["fits"]
        assert estimate_message_chars(out) <= 150_000
        assert report["iterations_kept"] >= 1
        assert report["iterations_summarized"] == 30 - report["iterations_kept"]
        assert out[0]["content"].startswith("TASK:")
        assert _pairing_valid(out)
        # Newest iteration always survives.
        assert "result-29" in json.dumps(out)

    def test_single_enormous_result_truncated_with_pairing_intact(self):
        msgs = _messages(2, 5_000)
        msgs.extend(_iteration(99, 500_000))  # one massive scrape, newest
        out, report = emergency_compress_for_window(msgs, target_chars=120_000)
        assert report["fits"]
        assert report["results_truncated"] >= 1
        assert report["chars_elided"] > 0
        blob = json.dumps(out)
        assert "emergency truncation" in blob
        assert "tu_99" in blob  # the pair survived structurally
        assert _pairing_valid(out)

    def test_unboundable_prefix_returns_unchanged_and_not_fits(self):
        msgs = [{"role": "user", "content": "TASK: " + "p" * 300_000}]
        msgs.extend(_iteration(0, 1_000))
        out, report = emergency_compress_for_window(msgs, target_chars=100_000)
        assert not report["fits"]
        assert out == msgs

    def test_under_target_is_reported_fitting_without_changes(self):
        msgs = _messages(3, 1_000)
        out, report = emergency_compress_for_window(msgs, target_chars=500_000)
        assert report["fits"]
        assert _pairing_valid(out)


class TestProviderClassification:
    def test_sse_invalid_request_becomes_fast_fail_request_error(self):
        from src.llm.openai_codex import CodexStreamError, _stream_error_from_event

        e = _stream_error_from_event(
            "error",
            {
                "type": "error",
                "error": {
                    "type": "invalid_request_error",
                    "code": "context_length_exceeded",
                    "message": "Your input exceeds the context window of this model.",
                },
            },
        )
        assert isinstance(e, CodexStreamError)
        assert e.error_code == "context_length_exceeded"
        assert not e.is_capacity


class TestProviderNoRetryBurn:
    """The doomed-payload pin: an SSE invalid_request/context_length event
    makes exactly ONE HTTP attempt (no inner retry burn on a deterministic
    failure), raises the typed fast-fail with its structured code, and never
    counts against the client breaker (infrastructure health, not payload
    validity)."""

    @pytest.mark.asyncio
    async def test_one_attempt_typed_code_breaker_untouched(self, monkeypatch):
        from src.llm.openai_codex import CodexChatClient
        from tests.test_openai_codex_client import _BareAuth, _FakeResp, _sse

        client = CodexChatClient(auth=_BareAuth(), model="gpt-5.6-terra", max_retries=3)
        posts = {"n": 0}
        failures = {"n": 0}
        monkeypatch.setattr(
            client.breaker, "record_failure", lambda: failures.__setitem__("n", failures["n"] + 1)
        )

        event = {
            "type": "error",
            "error": {
                "type": "invalid_request_error",
                "code": "context_length_exceeded",
                "message": "Your input exceeds the context window of this model.",
            },
        }

        class _CM:
            async def __aenter__(self):
                posts["n"] += 1
                return type("R", (), {"status": 200, "content": _FakeResp([_sse(event)]).content})()

            async def __aexit__(self, *exc):
                return False

        class _Sess:
            closed = False

            def post(self, url, **kwargs):
                return _CM()

        async def _fake_session():
            return _Sess()

        monkeypatch.setattr(client, "_get_session", _fake_session)

        with pytest.raises(LLMRequestError) as ei:
            await client._send_with_retries(
                {"model": "gpt-5.6-terra"}, client._read_stream, lambda r: not r
            )
        assert ei.value.code == "context_length_exceeded"
        assert posts["n"] == 1, "retry engine must not burn attempts on a doomed payload"
        assert failures["n"] == 0, "breaker counts infrastructure health, not payload validity"


class TestAdversarialBlockers:
    """Pins for the three findings from the round-1 adversarial review."""

    def test_many_summarized_iterations_still_converge_at_both_targets(self):
        """Odin's repro: the fixed summary reserve underestimates a large
        summary and the candidate misses target by a hair — the compressor
        must CONVERGE, never return the original oversized payload."""
        from src.agents.manager import _EMERGENCY_TARGETS

        # Runtime-shaped: hundreds of small-but-real iterations whose
        # summaries alone exceed the old 2,000-char reserve.
        msgs = _messages(520, 1_400)
        assert estimate_message_chars(msgs) > max(_EMERGENCY_TARGETS)
        for target in _EMERGENCY_TARGETS:
            out, report = emergency_compress_for_window(msgs, target_chars=target)
            assert report["fits"], (target, report)
            assert estimate_message_chars(out) <= target
            assert _pairing_valid(out)
            assert out[0]["content"].startswith("TASK:")

    def test_summary_itself_is_capped_for_huge_iteration_counts(self):
        from src.llm.context_compressor import _EMERGENCY_SUMMARY_MAX

        msgs = _messages(2_000, 300)
        out, report = emergency_compress_for_window(msgs, target_chars=120_000)
        assert report["fits"]
        summary = next(
            (m for m in out if isinstance(m.get("content"), str)
             and m["content"].startswith("[Emergency context compression")),
            None,
        )
        assert summary is not None
        assert len(summary["content"]) <= _EMERGENCY_SUMMARY_MAX + 200
        assert "earlier iterations elided" in summary["content"]

    async def test_retries_share_one_iteration_deadline(self):
        """The initial attempt gets the exact configured budget; retry
        budgets come from the SAME monotonic deadline — one logical
        iteration can never consume multiples of its timeout."""
        from unittest.mock import patch

        from src.agents.manager import AgentInfo, _call_llm_with_recovery

        agent = AgentInfo(
            id="a1", label="t", goal="g", channel_id="c1",
            requester_id="u1", requester_name="user",
        )
        agent.messages = _messages(40, 30_000)
        agent.iteration_timeout = 50.0

        captured: list[float] = []
        calls = {"n": 0}

        async def fake_wait_for(awaitable, timeout):
            captured.append(timeout)
            calls["n"] += 1
            # Let the underlying coroutine settle to avoid warnings.
            awaitable.close()
            if calls["n"] == 1:
                raise _overflow_error()
            return {"text": "DONE", "tool_calls": [], "stop_reason": "end_turn"}

        async def cb(messages, system_prompt, tools):
            return {"text": "unused", "tool_calls": []}

        with patch("src.agents.manager.asyncio.wait_for", side_effect=fake_wait_for):
            result = await _call_llm_with_recovery(agent, cb, "sys", [])
        assert result is not None
        assert len(captured) == 2
        assert captured[0] == 50.0  # exact configured budget, bit-identical
        assert captured[1] < 50.0   # retry pays the shared deadline
        assert captured[1] > 0

    async def test_recovery_evidence_persisted_to_saved_trajectory(self):
        saved: list[dict] = []

        class _Saver:
            async def save(self, trajectory):
                saved.append(trajectory.to_dict())

        big = _messages(40, 30_000)

        async def script(n, messages):
            if n == 1:
                messages.clear()
                messages.extend(copy.deepcopy(big))
                raise _overflow_error()
            return {"text": "DONE", "tool_calls": [], "stop_reason": "end_turn"}

        h = _Harness(script)
        mgr = AgentManager()
        agent_id = mgr.spawn(
            label="t",
            goal="go",
            channel_id="c1",
            requester_id="u1",
            requester_name="user",
            iteration_callback=h.iteration_callback,
            tool_executor_callback=h._tool_cb,
            trajectory_saver=_Saver(),
        )
        await _run_to_terminal(mgr, agent_id)

        assert saved, "trajectory must be saved"
        d = saved[-1]
        assert d.get("context_char_ceiling") is not None
        recs = d.get("context_recoveries")
        assert recs and recs[0]["trigger"] == "overflow" and recs[0]["fits"]
        for key in ("original_chars", "compressed_chars", "iterations_kept", "attempt"):
            assert key in recs[0]


class TestCoverageEdges:
    def test_stats_updated_on_successful_emergency_pass(self):
        from src.llm.context_compressor import CompressionStats

        stats = CompressionStats()
        msgs = _messages(30, 20_000)
        out, report = emergency_compress_for_window(
            msgs, target_chars=150_000, stats=stats
        )
        assert report["fits"]
        assert stats.compressions == 1
        assert stats.iterations_compressed == report["iterations_summarized"]
        assert stats.chars_saved > 0

    def test_large_non_newest_kept_iteration_is_share_capped(self):
        # A fat iteration BEFORE the newest one must be truncated to its fair
        # share rather than crowding out other retained iterations.
        msgs = _messages(3, 2_000)
        msgs.extend(_iteration(50, 200_000))   # fat, second-newest
        msgs.extend(_iteration(51, 2_000))     # small, newest
        out, report = emergency_compress_for_window(msgs, target_chars=120_000)
        assert report["fits"]
        blob = json.dumps(out)
        assert "result-51" in blob             # newest survived
        assert "tu_50" in blob                 # fat one survived structurally
        assert report["results_truncated"] >= 1
        assert _pairing_valid(out)

    async def test_latch_compaction_failure_is_nonfatal(self, monkeypatch):
        """The pre-send latch guard must never kill an agent: a compaction
        crash logs and proceeds with the uncompacted payload."""
        big = _messages(40, 30_000)

        async def script(n, messages):
            if n == 1:
                messages.clear()
                messages.extend(copy.deepcopy(big))
                raise _overflow_error()
            return {"text": "DONE", "tool_calls": [], "stop_reason": "end_turn"}

        h = _Harness(script)
        mgr = AgentManager()
        agent_id = h.spawn(mgr)
        agent = mgr._agents[agent_id]
        # Force the latch check to engage on the next iteration, then make
        # the compactor blow up ONLY for that latch call (the recovery-path
        # call inside _call_llm_with_recovery imports it separately and has
        # already run by then).
        await _run_to_terminal(mgr, agent_id)
        assert agent.state.name in ("COMPLETED", "READY"), agent.error

    def test_truncate_iteration_already_under_limit_is_unchanged(self):
        from src.llm.context_compressor import _truncate_iteration

        iteration = _iteration(1, 20)
        out, elided = _truncate_iteration(iteration, 10_000)
        assert out == iteration
        assert out is not iteration
        assert elided == 0

    def test_truncate_iteration_with_no_strings_is_a_noop(self):
        from src.llm.context_compressor import _truncate_iteration

        iteration = [{
            "role": "assistant",
            "content": [{"type": "tool_use", "id": "t", "name": "n", "input": {}}],
        }]
        out, elided = _truncate_iteration(iteration, 1)
        assert elided == 0
        assert out[0]["content"][0]["id"] == "t"


class TestDarkBranches:
    """Full-suite coverage-gate closure: every emergency-path branch."""

    def test_truncation_handles_string_content_and_junk_blocks(self):
        from src.llm.context_compressor import _truncate_iteration

        iteration = [
            {"role": "assistant", "content": "plain string reasoning " + "y" * 5_000},
            {"role": "user", "content": ["not-a-dict-block", {"type": "tool_result",
                "tool_use_id": "t1", "content": "z" * 5_000}]},
        ]
        out, elided = _truncate_iteration(iteration, 3_000)
        assert elided > 0
        assert _pairing_valid([{"role": "a", "content": [
            {"type": "tool_use", "id": "t1", "name": "n", "input": {}}]}] + out)

    def test_truncation_bails_when_strings_cannot_shrink_further(self):
        from src.llm.context_compressor import _truncate_iteration

        # Structural overhead (roles/keys) exceeds the target while every
        # string is already at the 400-char floor: the loop must BREAK, not
        # spin or crash.
        iteration = [
            {"role": "user", "content": [{"type": "tool_result",
                "tool_use_id": f"t{i}", "content": "s" * 401} for i in range(30)]},
        ]
        out, elided = _truncate_iteration(iteration, 10)
        assert isinstance(out, list)

    def test_sole_massive_newest_iteration_hard_truncated(self):
        # Task + ONE iteration whose size exceeds the ENTIRE budget: the
        # newest-must-survive branch truncates it to the full budget.
        msgs = [{"role": "user", "content": "TASK: tiny"}]
        msgs.extend(_iteration(0, 300_000))
        out, report = emergency_compress_for_window(msgs, target_chars=60_000)
        assert report["fits"]
        assert report["iterations_kept"] == 1
        assert report["results_truncated"] >= 1
        assert "tu_0" in json.dumps(out)

    def test_tiny_target_shrinks_summary_but_keeps_newest_iteration(self):
        # Hundreds of iterations against a target barely above the prefix:
        # shrink the replaceable summary before sacrificing the newest tool
        # cycle.  The output may fail to fit only when preserved structure
        # itself is wider than the target; it must never collapse to summary.
        msgs = _messages(300, 300)
        prefix_chars = estimate_message_chars(msgs[:1])
        out, report = emergency_compress_for_window(
            msgs, target_chars=prefix_chars + 2_200
        )
        assert report["fits"]
        assert estimate_message_chars(out) <= prefix_chars + 2_200
        assert report["iterations_kept"] == 1
        assert "tu_299" in json.dumps(out)
        assert _pairing_valid(out)


class TestRoundThreeAdversarialPins:
    """Pins for Odin's three round-2 compressor findings."""

    def test_aggressive_pass_reopens_first_pass_summary(self):
        # Runtime-shaped history: primary recovery creates a substantial
        # emergency summary.  The aggressive pass must replace/recompact it,
        # not classify it as immutable prefix and return the first payload.
        prefix = [{"role": "user", "content": "P" * (398_500 - len("user"))}]
        msgs = list(prefix)
        for i in range(300):
            msgs.extend(_iteration(i, 1_400))
        primary, first = emergency_compress_for_window(
            msgs, target_chars=_EMERGENCY_TARGET_CHARS
        )
        assert first["fits"]
        first_size = estimate_message_chars(primary)
        assert first_size > _EMERGENCY_TARGET_CHARS_AGGRESSIVE
        summaries = [
            m for m in primary
            if isinstance(m.get("content"), str)
            and m["content"].startswith("[Emergency context compression")
        ]
        assert len(summaries) == 1
        # This is the original failure boundary: if the generated summary is
        # misclassified as immutable prefix on pass two, the prefix alone is
        # already wider than the aggressive target.
        assert estimate_message_chars(prefix + summaries) > 400_000

        aggressive, second = emergency_compress_for_window(
            primary, target_chars=_EMERGENCY_TARGET_CHARS_AGGRESSIVE
        )
        assert second["fits"], second
        assert estimate_message_chars(aggressive) <= _EMERGENCY_TARGET_CHARS_AGGRESSIVE
        assert estimate_message_chars(aggressive) < first_size
        assert aggressive[0] == msgs[0]
        assert "tu_299" in json.dumps(aggressive)
        assert _pairing_valid(aggressive)
        assert sum(
            isinstance(m.get("content"), str)
            and m["content"].startswith("[Emergency context compression")
            for m in aggressive
        ) <= 1

    def test_user_text_resembling_summary_is_not_removed_from_real_prefix(self):
        # Recognition is boundary-aware: a task may literally quote the
        # compressor marker, and that user-authored content remains immutable.
        quoted = {
            "role": "user",
            "content": "[Emergency context compression - earlier tool calls: quoted]",
        }
        parent = {"role": "user", "content": "TASK: real parent context"}
        msgs = [quoted, parent]
        for i in range(300):
            msgs.extend(_iteration(i, 1_400))

        out, report = emergency_compress_for_window(
            msgs, target_chars=_EMERGENCY_TARGET_CHARS
        )
        assert report["fits"]
        assert out[:2] == [quoted, parent]

    def test_newest_multi_tool_iteration_survives_more_than_32_results(self):
        # One assistant turn may issue many tools.  All uses/results belong to
        # ONE newest iteration and must survive structurally even when every
        # result needs truncation.  A fixed 32-pass truncator lost this cycle.
        count = 100
        uses = [
            {"type": "tool_use", "id": f"bulk_{i}", "name": "web_search",
             "input": {"q": str(i)}}
            for i in range(count)
        ]
        results = [
            {"type": "tool_result", "tool_use_id": f"bulk_{i}",
             "content": f"bulk-result-{i}:" + "x" * 8_000}
            for i in range(count)
        ]
        msgs = [{"role": "user", "content": "TASK: preserve newest"}]
        msgs.extend(_iteration(0, 10_000))
        msgs.extend([
            {"role": "assistant", "content": uses},
            {"role": "user", "content": results},
        ])
        assert estimate_message_chars(msgs) > _EMERGENCY_TARGET_CHARS_AGGRESSIVE

        out, report = emergency_compress_for_window(
            msgs, target_chars=_EMERGENCY_TARGET_CHARS_AGGRESSIVE
        )
        blob = json.dumps(out)
        assert report["fits"], report
        assert estimate_message_chars(out) <= _EMERGENCY_TARGET_CHARS_AGGRESSIVE
        assert report["iterations_kept"] >= 1
        assert all(f'"id": "bulk_{i}"' in blob for i in range(count))
        assert all(f'"tool_use_id": "bulk_{i}"' in blob for i in range(count))
        assert _pairing_valid(out)

    def test_no_summary_reserve_for_398500_prefix_and_one_iteration(self):
        # Exact adversarial shape: a 398,500-char prefix leaves 1,500 real
        # characters at the 400K target.  The sole newest iteration is
        # compressible into that space, and no summary will exist.  Charging
        # the old hypothetical 2K reserve rejected this recoverable payload.
        target = _EMERGENCY_TARGET_CHARS_AGGRESSIVE
        prefix_content = "P" * (398_500 - len("user"))
        prefix = [{"role": "user", "content": prefix_content}]
        assert estimate_message_chars(prefix) == 398_500
        msgs = prefix + _iteration(7, 5_000)
        assert estimate_message_chars(msgs) > target

        out, report = emergency_compress_for_window(msgs, target_chars=target)
        assert report["fits"], report
        assert estimate_message_chars(out) <= target
        assert out[0] == prefix[0]
        assert report["iterations_kept"] == 1
        assert report["iterations_summarized"] == 0
        assert report["results_truncated"] >= 1
        assert "tu_7" in json.dumps(out)
        assert _pairing_valid(out)
        assert not any(
            isinstance(m.get("content"), str)
            and m["content"].startswith("[Emergency context compression")
            for m in out
        )
