"""Pins for the 2026-07-16 Discord typing-endpoint incident fixes.

Discord's REST API incident that night returned Cloudflare HTML 500 pages
from ``POST /channels/{id}/typing``; the raw ``discord.DiscordServerError``
escaped the tool loop and its full HTML body was posted into chat. Three
surfaces were hardened, each pinned here:

- ``_best_effort_typing`` (tool_loop): the indicator is attempted on every
  call (no failure memory), can never fail the wrapped work, and never
  suppresses body exceptions or cancellation.
- ``run()``'s escape guard (tool_loop): an exception escaping the chat
  iteration loop records a bounded-error trajectory, clears the
  active-request entry, and re-raises; cancellation cleans up without an
  error trajectory; a recorder failure masks nothing.
- ``_user_facing_error`` (intake_pipeline): user-facing error text is
  bounded, HTML-free, control-character-free, and mention-safe.
"""

import asyncio
import logging
import time
from types import SimpleNamespace

import pytest

import discord
from src.discord.intake_pipeline import MessagePipeline, MessagePipelineDeps
from src.discord.tool_loop import (
    ToolLoopDeps,
    ToolLoopRunner,
    _best_effort_typing,
    _error_summary,
)

CF_HTML = (
    "<html>\n  <head>\n    <title>Internal Server Error</title>\n  </head>\n"
    "  <body>\n    <h1><p>Internal Server Error</p></h1>\n"
    "  <script>(function(){/* cloudflare challenge boilerplate */})();"
    "</script></body>\n</html>"
)


def _http_500(text: str = CF_HTML) -> discord.HTTPException:
    """A DiscordServerError-shaped exception with the incident's HTML body."""
    resp = SimpleNamespace(status=500, reason="Internal Server Error")
    return discord.HTTPException(resp, text)


class _FakeTypingCM:
    def __init__(self, channel, enter_exc, exit_exc):
        self._channel = channel
        self._enter_exc = enter_exc
        self._exit_exc = exit_exc

    async def __aenter__(self):
        self._channel.enters += 1
        if self._enter_exc is not None:
            raise self._enter_exc
        self._channel.entered += 1
        return self

    async def __aexit__(self, *exc_info):
        self._channel.exits += 1
        if self._exit_exc is not None:
            raise self._exit_exc
        return False


class FakeChannel:
    """Instrumented ``channel.typing()`` with scriptable failures."""

    def __init__(self, enter_exc=None, exit_exc=None, ctor_exc=None):
        self.id = "c1"
        self.typing_calls = 0
        self.enters = 0
        self.entered = 0
        self.exits = 0
        self._enter_exc = enter_exc
        self._exit_exc = exit_exc
        self._ctor_exc = ctor_exc

    def typing(self):
        self.typing_calls += 1
        if self._ctor_exc is not None:
            raise self._ctor_exc
        return _FakeTypingCM(self, self._enter_exc, self._exit_exc)


class _BrokenStrError(Exception):
    def __str__(self):
        raise ValueError("no string for you")


# ---------------------------------------------------------------------------
# _best_effort_typing
# ---------------------------------------------------------------------------


class TestBestEffortTyping:
    async def test_enter_failure_does_not_stop_work(self):
        ch = FakeChannel(enter_exc=_http_500())
        ran = False
        async with _best_effort_typing(ch):
            ran = True
        assert ran

    async def test_typing_constructor_failure_does_not_stop_work(self):
        ch = FakeChannel(ctor_exc=RuntimeError("constructor boom"))
        ran = False
        async with _best_effort_typing(ch):
            ran = True
        assert ran

    async def test_exit_failure_swallowed_after_successful_body(self):
        ch = FakeChannel(exit_exc=RuntimeError("cleanup boom"))
        ran = False
        async with _best_effort_typing(ch):
            ran = True
        assert ran
        assert ch.exits == 1

    async def test_body_exception_propagates(self):
        ch = FakeChannel()
        with pytest.raises(ValueError, match="body boom"):
            async with _best_effort_typing(ch):
                raise ValueError("body boom")

    async def test_body_exception_wins_over_exit_failure(self):
        ch = FakeChannel(exit_exc=RuntimeError("cleanup boom"))
        with pytest.raises(ValueError, match="body boom"):
            async with _best_effort_typing(ch):
                raise ValueError("body boom")
        assert ch.exits == 1

    async def test_cancellation_propagates_from_body(self):
        ch = FakeChannel()
        with pytest.raises(asyncio.CancelledError):
            async with _best_effort_typing(ch):
                raise asyncio.CancelledError()

    async def test_cancellation_on_enter_propagates_and_skips_body(self):
        ch = FakeChannel(enter_exc=asyncio.CancelledError())
        ran = False
        with pytest.raises(asyncio.CancelledError):
            async with _best_effort_typing(ch):
                ran = True
        assert not ran

    async def test_exit_not_called_when_enter_failed(self):
        ch = FakeChannel(enter_exc=_http_500())
        async with _best_effort_typing(ch):
            pass
        assert ch.exits == 0

    async def test_attempted_on_every_call_after_failure(self):
        # Aaron's constraint: no failure memory / cooldown — every turn
        # attempts the indicator again.
        ch = FakeChannel(enter_exc=_http_500())
        async with _best_effort_typing(ch):
            pass
        async with _best_effort_typing(ch):
            pass
        assert ch.typing_calls == 2
        assert ch.enters == 2

    async def test_failure_log_is_bounded_and_html_free(self, caplog):
        ch = FakeChannel(enter_exc=_http_500())
        with caplog.at_level(logging.WARNING):
            async with _best_effort_typing(ch):
                pass
        msgs = [r.getMessage() for r in caplog.records]
        assert any("Typing indicator failed" in m for m in msgs)
        assert all("<html" not in m for m in msgs)
        assert any("HTTP 500" in m for m in msgs)


# ---------------------------------------------------------------------------
# _error_summary (log/trajectory bounding)
# ---------------------------------------------------------------------------


class TestErrorSummary:
    def test_status_bearing_exception_uses_structured_fields(self):
        out = _error_summary(_http_500())
        assert "HTTP 500" in out
        assert "Internal Server Error" in out
        assert "<html" not in out

    def test_html_body_in_generic_exception_reduced_to_type_name(self):
        assert _error_summary(RuntimeError(CF_HTML)) == "RuntimeError"

    def test_empty_message_falls_back_to_type_name(self):
        assert _error_summary(TimeoutError()) == "TimeoutError"

    def test_broken_str_falls_back_to_type_name(self):
        assert _error_summary(_BrokenStrError()) == "_BrokenStrError"

    def test_output_is_bounded(self):
        assert len(_error_summary(RuntimeError("x" * 5000))) <= 200


# ---------------------------------------------------------------------------
# _user_facing_error (chat presentation)
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# run() escape guard
# ---------------------------------------------------------------------------


def _make_runner(recorder_save=None):
    saved = []
    cleared = []

    async def _default_save(trajectory, **kwargs):
        saved.append((trajectory, kwargs))

    deps = ToolLoopDeps(
        get_config=lambda: None,
        get_default_system_prompt=lambda: "sys",
        get_context_compressor=lambda: None,
        llm_gateway=SimpleNamespace(),
        prompt_builder=SimpleNamespace(),
        tool_catalog=SimpleNamespace(),
        channel_state=SimpleNamespace(
            clear_active_request=lambda ch, req: cleared.append((ch, req))
        ),
        channel_config=SimpleNamespace(),
        delivery=SimpleNamespace(),
        turn_recorder=SimpleNamespace(_save_turn_trajectory=recorder_save or _default_save),
        completion_classifier=SimpleNamespace(),
        native_tools=SimpleNamespace(),
        tool_executor=SimpleNamespace(),
        permissions=SimpleNamespace(),
        skill_manager=SimpleNamespace(),
        audit=SimpleNamespace(),
        loop_manager=SimpleNamespace(),
        stuck_loop_tracker_cls=object,
    )
    return ToolLoopRunner(deps), saved, cleared


def _stub_state(channel=None):
    from src.discord.response_guards import StuckLoopTracker
    from src.turn_state.durability import TurnDurability

    return SimpleNamespace(
        chat_cap=3,
        iteration=0,
        stuck_tracker=StuckLoopTracker(),
        wait_judgment_pending=False,
        _cancel=asyncio.Event(),
        _trajectory=SimpleNamespace(),
        trace=None,
        _ch_id="c1",
        _req_id="r1",
        message=SimpleNamespace(channel=channel or FakeChannel(), content="hi"),
        messages=[],
        tools_used_in_loop=[],
        system_prompt="sys",
        tools=[],
        user_id="u1",
        durability=TurnDurability.disabled(),
    )


def _wire(runner, st, call_llm):
    async def _prep(*args, **kwargs):
        return st

    runner._prepare_chat_turn = _prep
    runner._maybe_compress = lambda st: None
    runner._call_llm = call_llm


class TestRunEscapeGuard:
    async def test_escape_records_bounded_error_clears_and_reraises(self):
        runner, saved, cleared = _make_runner()
        st = _stub_state()

        async def _boom(_st):
            raise RuntimeError(CF_HTML)

        _wire(runner, st, _boom)
        with pytest.raises(RuntimeError):
            await runner.run(SimpleNamespace(), [])
        assert cleared == [("c1", "r1")]
        assert len(saved) == 1
        err = saved[0][1]["error"]
        assert "RuntimeError" in err
        assert "<html" not in err
        assert len(err) <= 200

    async def test_cancellation_cleans_up_without_error_trajectory(self):
        runner, saved, cleared = _make_runner()
        st = _stub_state()

        async def _cancel(_st):
            raise asyncio.CancelledError()

        _wire(runner, st, _cancel)
        with pytest.raises(asyncio.CancelledError):
            await runner.run(SimpleNamespace(), [])
        assert cleared == [("c1", "r1")]
        assert saved == []

    async def test_recorder_failure_masks_nothing_and_still_clears(self):
        async def _bad_save(trajectory, **kwargs):
            raise OSError("disk full")

        runner, _saved, cleared = _make_runner(recorder_save=_bad_save)
        st = _stub_state()

        async def _boom(_st):
            raise RuntimeError("original failure")

        _wire(runner, st, _boom)
        with pytest.raises(RuntimeError, match="original failure"):
            await runner.run(SimpleNamespace(), [])
        assert cleared == [("c1", "r1")]

    async def test_success_path_gets_no_extra_clear_from_guard(self):
        # Ordinary "done" exits own their cleanup inside the phase methods;
        # the guard must not double-clear on success.
        runner, saved, cleared = _make_runner()
        st = _stub_state()
        done = ("all good", False, False, [], False)

        async def _done(_st):
            return ("done", done)

        _wire(runner, st, _done)
        result = await runner.run(SimpleNamespace(), [])
        assert result == done
        assert cleared == []
        assert saved == []


# ---------------------------------------------------------------------------
# Both call sites survive a dead typing endpoint (the incident regression)
# ---------------------------------------------------------------------------


class TestCallSitesSurviveTypingFailure:
    async def test_execute_tool_calls_with_dead_typing_endpoint(self):
        runner, _saved, _cleared = _make_runner()
        ch = FakeChannel(enter_exc=_http_500())
        st = _stub_state(channel=ch)
        runner._get_config = lambda: SimpleNamespace(tools=SimpleNamespace(tool_timeout_seconds=5))

        async def _one(_st, block, _timeout):
            return {"type": "tool_result", "tool_use_id": block.id, "content": "ok"}

        runner._run_one_tool_with_timeout = _one
        block = SimpleNamespace(id="t1", name="run_command", input={})
        results = await runner._execute_tool_calls(st, [block])
        assert results == [{"type": "tool_result", "tool_use_id": "t1", "content": "ok"}]
        assert st.messages[-1] == {"role": "user", "content": results}
        assert ch.typing_calls == 1

    async def test_call_llm_with_dead_typing_endpoint(self):
        runner, _saved, _cleared = _make_runner()
        ch = FakeChannel(enter_exc=_http_500())
        st = _stub_state(channel=ch)
        resp = SimpleNamespace(text="hello", tool_calls=[])

        async def _cwt(**kwargs):
            return resp

        from src.llm.model_breaker import ModelBreakerRegistry
        from src.llm.recovery import RecoveryPolicy

        registry = ModelBreakerRegistry()
        runner._llm_gateway = SimpleNamespace(
            call_with_tools=_cwt,
            capacity_breaker_for=lambda model=None: registry.for_model("codex", "m"),
            recovery_policy=RecoveryPolicy,
            # consumed by the pre-admission effort preflight (no-op for None)
            active_client=None,
        )
        kind, val = await runner._call_llm(st)
        assert (kind, val) == ("ok", resp)
        assert ch.typing_calls == 1


# ---------------------------------------------------------------------------
# Review round 1 additions (PR #233): Unicode-category stripping, formatter
# fail-safes, and pipeline-level coverage of the _run_inner error paths.
# ---------------------------------------------------------------------------


class _RaisingInstanceCheckMeta(type):
    def __instancecheck__(cls, instance):
        raise RuntimeError("isinstance exploded")


class _InstanceCheckBombError(Exception, metaclass=_RaisingInstanceCheckMeta):
    pass


class _EvilStatusError(Exception):
    @property
    def status(self):
        raise RuntimeError("status exploded")


class TestUnicodeControlStripping:
    def test_error_summary_strips_del_and_c1(self):
        out = _error_summary(RuntimeError("bad\x7fmid\x9bthing"))
        assert "\x7f" not in out
        assert "\x9b" not in out
        assert "badmidthing" in out


class TestFormatterFailSafes:
    def test_error_summary_internal_failure_falls_back_to_type_name(self):
        assert _error_summary(_EvilStatusError()) == "_EvilStatusError"


class _FakeSessions:
    def __init__(self):
        self.added = []
        self.removed = []
        self.task_history_exc = None

    def add_message(self, channel_id, role, content, user_id=None):
        self.added.append((channel_id, role, content))

    async def get_task_history(self, channel_id, max_messages=160, current_query=None, trace=None):
        if self.task_history_exc is not None:
            raise self.task_history_exc
        return [{"role": "user", "content": "hi"}]

    def remove_last_message(self, channel_id, role):
        self.removed.append((channel_id, role))

    def prune(self):
        pass

    def save(self):
        pass


class _FakeDelivery:
    def __init__(self):
        self.chunked = []
        self.retried = []

    async def set_status(self, *args, **kwargs):
        pass

    async def send_chunked(self, message, response):
        self.chunked.append(response)

    async def send_with_retry(self, message, text):
        self.retried.append(text)


def _make_pipeline(tool_loop_exc=None, sessions=None):
    sessions = sessions or _FakeSessions()
    delivery = _FakeDelivery()

    async def _run(message, history, system_prompt_override=None, trace=None):
        if tool_loop_exc is not None:
            raise tool_loop_exc
        return ("ok-response", False, False, [], False)

    deps = MessagePipelineDeps(
        channel_state=SimpleNamespace(pending_files={}, last_op_details={}),
        sessions=sessions,
        permissions=SimpleNamespace(is_guest=lambda uid: False),
        llm_gateway=SimpleNamespace(active_client=object()),
        prompt_builder=SimpleNamespace(build_full_prompt=lambda **kwargs: "sys"),
        turn_recorder=SimpleNamespace(_new_context_trace=lambda: None),
        tool_loop=SimpleNamespace(run=_run),
        delivery=delivery,
        housekeeping=SimpleNamespace(maybe_cleanup=lambda: None),
    )
    return MessagePipeline(deps), sessions, delivery


def _msg():
    return SimpleNamespace(
        author=SimpleNamespace(id=42, display_name="Tester", name="tester"),
        channel=SimpleNamespace(id="c1"),
    )


class TestRunInnerErrorPresentation:
    """The incident path end-to-end: what actually reaches chat on failure."""

    async def test_tool_loop_discord_500_sends_sanitized_error(self):
        pipeline, sessions, delivery = _make_pipeline(tool_loop_exc=_http_500())
        await pipeline._run_inner(_msg(), "do the thing", "c1")
        assert delivery.chunked == [
            "Tool execution failed: Discord API error: HTTP 500 Internal Server Error"
        ]
        assert all("<html" not in t for t in delivery.chunked)
        assert (
            "c1",
            "assistant",
            "[Previous request encountered an error before tool execution.]",
        ) in sessions.added

    async def test_tool_loop_timeout_sends_sanitized_error(self):
        pipeline, _sessions, delivery = _make_pipeline(tool_loop_exc=TimeoutError())
        await pipeline._run_inner(_msg(), "do the thing", "c1")
        assert delivery.chunked == ["Tool execution timed out: TimeoutError"]

    async def test_outer_discord_error_path_sends_sanitized_error(self):
        sessions = _FakeSessions()
        sessions.task_history_exc = _http_500()
        pipeline, _sessions, delivery = _make_pipeline(sessions=sessions)
        await pipeline._run_inner(_msg(), "do the thing", "c1")
        assert delivery.retried == [
            "Something went wrong: Discord API error: HTTP 500 Internal Server Error"
        ]
        assert sessions.removed == [("c1", "user")]

    async def test_outer_generic_error_path_sends_sanitized_error(self):
        sessions = _FakeSessions()
        sessions.task_history_exc = RuntimeError(CF_HTML)
        pipeline, _sessions, delivery = _make_pipeline(sessions=sessions)
        await pipeline._run_inner(_msg(), "do the thing", "c1")
        assert delivery.retried == ["Something went wrong: RuntimeError"]
        assert all("<html" not in t for t in delivery.retried)


# ---------------------------------------------------------------------------
# Review round 2 (PR #233): the status/HTTPException branches must clean the
# upstream-controlled reason phrase exactly like generic detail.
# ---------------------------------------------------------------------------


def _http_exc_with_reason(reason, status=500):
    resp = SimpleNamespace(status=status, reason=reason)
    return discord.HTTPException(resp, "body")


class TestStructuredReasonSanitization:
    def test_error_summary_strips_controls_in_reason(self):
        out = _error_summary(_http_exc_with_reason("Bad\x9bReason\x7f"))
        assert "\x9b" not in out
        assert "\x7f" not in out
        assert "BadReason" in out

    def test_error_summary_html_reason_dropped_status_kept(self):
        out = _error_summary(_http_exc_with_reason("<html>oops"))
        assert out == "HTTPException: HTTP 500"

    def test_error_summary_non_int_status_renders_safely(self):
        out = _error_summary(_http_exc_with_reason("ok", status="evil"))
        assert out == "HTTPException: HTTP ? ok"


# ---------------------------------------------------------------------------
# Follow-up (typing attempt timeout): a dead typing endpoint may cost at most
# _TYPING_ATTEMPT_TIMEOUT per phase — wait briefly, then abandon the
# ornamentation and do the actual work. Constant is read at call time so
# these tests can shrink it.
# ---------------------------------------------------------------------------


class _SlowTypingCM:
    def __init__(self, channel, slow_enter, slow_exit):
        self._channel = channel
        self._slow_enter = slow_enter
        self._slow_exit = slow_exit

    async def __aenter__(self):
        self._channel.enters += 1
        if self._slow_enter:
            try:
                await asyncio.sleep(30)
            except asyncio.CancelledError:
                self._channel.enter_cancelled = True
                raise
        self._channel.entered += 1
        return self

    async def __aexit__(self, *exc_info):
        self._channel.exits += 1
        if self._slow_exit:
            try:
                await asyncio.sleep(30)
            except asyncio.CancelledError:
                self._channel.exit_cancelled = True
                raise
        return False


class SlowChannel:
    """Channel whose typing enter/exit hangs far past any sane deadline."""

    def __init__(self, slow_enter=False, slow_exit=False):
        self.id = "c1"
        self.typing_calls = 0
        self.enters = 0
        self.entered = 0
        self.exits = 0
        self.enter_cancelled = False
        self.exit_cancelled = False
        self._slow_enter = slow_enter
        self._slow_exit = slow_exit

    def typing(self):
        self.typing_calls += 1
        return _SlowTypingCM(self, self._slow_enter, self._slow_exit)


class TestTypingAttemptTimeout:
    async def test_slow_enter_abandoned_fast_and_body_runs(self, monkeypatch, caplog):
        import src.discord.tool_loop as tl

        monkeypatch.setattr(tl, "_TYPING_ATTEMPT_TIMEOUT", 0.05)
        ch = SlowChannel(slow_enter=True)
        ran = False
        start = time.monotonic()
        with caplog.at_level(logging.WARNING):
            async with _best_effort_typing(ch):
                ran = True
        elapsed = time.monotonic() - start
        assert ran
        assert elapsed < 1.0
        assert ch.enter_cancelled  # the hung enter received CancelledError
        assert ch.exits == 0  # never entered -> exit never attempted
        assert any("enter timed out" in r.getMessage() for r in caplog.records)

    async def test_slow_exit_abandoned_fast(self, monkeypatch, caplog):
        import src.discord.tool_loop as tl

        monkeypatch.setattr(tl, "_TYPING_ATTEMPT_TIMEOUT", 0.05)
        ch = SlowChannel(slow_exit=True)
        ran = False
        start = time.monotonic()
        with caplog.at_level(logging.WARNING):
            async with _best_effort_typing(ch):
                ran = True
        elapsed = time.monotonic() - start
        assert ran
        assert elapsed < 1.0
        assert ch.exit_cancelled  # the hung exit received CancelledError
        assert any("exit timed out" in r.getMessage() for r in caplog.records)

    async def test_body_exception_wins_over_slow_exit_timeout(self, monkeypatch):
        import src.discord.tool_loop as tl

        monkeypatch.setattr(tl, "_TYPING_ATTEMPT_TIMEOUT", 0.05)
        ch = SlowChannel(slow_exit=True)
        with pytest.raises(ValueError, match="body boom"):
            async with _best_effort_typing(ch):
                raise ValueError("body boom")
        assert ch.exit_cancelled

    async def test_typing_still_attempted_every_call_after_timeouts(self, monkeypatch):
        import src.discord.tool_loop as tl

        monkeypatch.setattr(tl, "_TYPING_ATTEMPT_TIMEOUT", 0.05)
        ch = SlowChannel(slow_enter=True)
        async with _best_effort_typing(ch):
            pass
        async with _best_effort_typing(ch):
            pass
        assert ch.typing_calls == 2
        assert ch.enters == 2

    async def test_healthy_typing_unaffected(self):
        ch = FakeChannel()
        async with _best_effort_typing(ch):
            pass
        assert ch.entered == 1
        assert ch.exits == 1


class TestToolEventCallId:
    """tool_start/tool_end must carry the model's tool_use id.

    The WebUI pairs a completion with its card by this id. Pairing by tool
    NAME cannot distinguish concurrent same-name calls, and no ordering rule
    saves it: newest-first closes the wrong card when an earlier call finishes
    first, oldest-first when a later one does.
    """

    async def test_tool_end_event_carries_the_call_id(self):
        from types import SimpleNamespace

        from src.discord.tool_loop import ToolLoopRunner

        events = []

        class _Audit:
            async def log_event(self, **kwargs):
                events.append(kwargs)

            async def log_execution(self, **kwargs):
                pass

        runner = ToolLoopRunner.__new__(ToolLoopRunner)
        runner._audit = _Audit()
        st = SimpleNamespace(
            message=SimpleNamespace(
                author=SimpleNamespace(id=1),
                channel=SimpleNamespace(id=2),
            ),
            iteration=3,
        )

        await runner._audit_tool_outcome(
            st,
            "run_command",
            {"command": "echo hi"},
            "ok",
            12,
            None,
            None,
            call_id="call_abc123",
        )

        end = [e for e in events if e.get("event_type") == "tool_end"]
        assert end, "no tool_end event emitted"
        assert end[0]["metadata"]["call_id"] == "call_abc123"

    async def test_call_id_is_keyword_only_and_optional(self):
        """Optional so an older caller cannot break; keyword-only so it can
        never be filled positionally by accident."""
        import inspect
        from types import SimpleNamespace

        from src.discord.tool_loop import ToolLoopRunner

        sig = inspect.signature(ToolLoopRunner._audit_tool_outcome)
        assert sig.parameters["call_id"].kind is inspect.Parameter.KEYWORD_ONLY

        events = []

        class _Audit:
            async def log_event(self, **kwargs):
                events.append(kwargs)

            async def log_execution(self, **kwargs):
                pass

        runner = ToolLoopRunner.__new__(ToolLoopRunner)
        runner._audit = _Audit()
        st = SimpleNamespace(
            message=SimpleNamespace(author=SimpleNamespace(id=1), channel=SimpleNamespace(id=2)),
            iteration=0,
        )
        await runner._audit_tool_outcome(st, "t", {}, "r", 1, None, None)
        end = [e for e in events if e.get("event_type") == "tool_end"]
        assert end and end[0]["metadata"]["call_id"] is None


class TestDeliberateSilence:
    """Empty final text after a tool-using turn is a choice, not a failure.

    Field reality, twice: a thumbs-up reaction landed, then Odin posted
    "I couldn't generate a response. Please try again."; a video posted with
    its commentary on the attachment, then the same apology. The classifier
    had judged both turns complete — only the terminal fallback fabricated a
    failure out of chosen silence. With NO tools used the fallback stands.
    """

    def _final_state(self, tools_used):
        st = _stub_state()
        st.tools_used_in_loop = list(tools_used)
        st._validation_required = False
        st._validation_retries = 0
        st._max_validation_retries = 2
        # Every response-guard flag set 'already retried' so the cascade
        # falls through to the terminal fallback — the actor under test.
        st.promise_retried = True
        st.unavail_retried = True
        st.hedging_retried = True
        st.fabrication_retried = True
        st.code_hedging_retried = True
        st.premature_failure_retried = True
        # Classifier already ran its budget — the fallback is the only actor.
        st.continuation_count = 3
        st.max_continuations = 3
        return st

    async def test_silence_after_work_is_delivered_as_silence(self):
        runner, saved, cleared = _make_runner()
        st = self._final_state(["add_reaction"])
        kind, result = await runner._finalize_or_retry(
            st, SimpleNamespace(text="", tool_calls=None)
        )
        assert kind == "done"
        final = result[0]
        assert final == ""
        assert "couldn't generate" not in final
        # Trajectory records the truthful empty final, not the apology.
        assert saved and saved[0][1]["final_response"] == ""

    async def test_empty_with_no_tools_is_still_reported_as_failure(self):
        from src.discord.tool_loop_helpers import _EMPTY_RESPONSE_FALLBACK

        runner, saved, cleared = _make_runner()
        st = self._final_state([])
        kind, result = await runner._finalize_or_retry(
            st, SimpleNamespace(text="", tool_calls=None)
        )
        assert kind == "done"
        assert result[0] == _EMPTY_RESPONSE_FALLBACK

    async def test_real_text_is_untouched(self):
        runner, saved, cleared = _make_runner()
        st = self._final_state(["add_reaction"])
        kind, result = await runner._finalize_or_retry(
            st, SimpleNamespace(text="done, reacted.", tool_calls=None)
        )
        assert result[0] == "done, reacted."
