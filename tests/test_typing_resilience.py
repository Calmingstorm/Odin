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
from types import SimpleNamespace

import pytest

import discord
from src.discord.intake_pipeline import _user_facing_error
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


class TestUserFacingError:
    def test_discord_http_exception_never_renders_body(self):
        out = _user_facing_error(_http_500())
        assert out == "Discord API error: HTTP 500 Internal Server Error"

    def test_generic_html_reduced_to_type_name(self):
        assert _user_facing_error(RuntimeError(CF_HTML)) == "RuntimeError"

    def test_html_marker_mid_line_reduced_to_type_name(self):
        assert _user_facing_error(RuntimeError("500 error: <html><body>")) == "RuntimeError"

    def test_multiline_keeps_first_line_only(self):
        out = _user_facing_error(RuntimeError("first line\nsecond line"))
        assert out == "RuntimeError: first line"

    def test_empty_timeout_renders_type_name(self):
        assert _user_facing_error(TimeoutError()) == "TimeoutError"

    def test_broken_str_falls_back_to_type_name(self):
        assert _user_facing_error(_BrokenStrError()) == "_BrokenStrError"

    def test_mass_mentions_neutralized(self):
        out = _user_facing_error(RuntimeError("notify @everyone and @here now"))
        assert "@everyone" not in out
        assert "@here" not in out
        assert "everyone" in out

    def test_control_characters_stripped(self):
        out = _user_facing_error(RuntimeError("bad\x07\x1bthing"))
        assert "\x07" not in out
        assert "\x1b" not in out
        assert "badthing" in out

    def test_entire_output_is_bounded(self):
        assert len(_user_facing_error(RuntimeError("y" * 5000))) <= 200


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
    return SimpleNamespace(
        chat_cap=3,
        iteration=0,
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

        runner._llm_gateway = SimpleNamespace(call_with_tools=_cwt)
        kind, val = await runner._call_llm(st)
        assert (kind, val) == ("ok", resp)
        assert ch.typing_calls == 1
