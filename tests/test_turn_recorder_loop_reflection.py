"""Regression tests for loop reflection dispatch (turn_recorder).

v3.45.0 shipped a missed rewrite from the RFC-001 P10 move: the guard
`hasattr(self, "reflector")` was carried verbatim from the bot-method era,
but on TurnRecorder `self` has no reflector — the guard was always False
and every loop reflection was silently suppressed (debug-level log only).
These tests pin the full dispatch path so the guard can never rot silently
again.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from src.discord.turn_recorder import TurnRecorder

TOOL_DETAILS = [{"tool": "run_command", "input": {}, "result": "ok", "error": False}]
ERROR_DETAILS = [{"tool": "run_command", "input": {}, "result": "Error: boom", "error": True}]


def _bot(*, reflection_enabled: bool = True, gate_verdict=(True, "test")):
    gate = Mock()
    gate.evaluate = Mock(return_value=gate_verdict)
    reflector = Mock()
    reflector.reflect_on_operation = AsyncMock()
    return SimpleNamespace(
        config=SimpleNamespace(
            learning=SimpleNamespace(loop_reflection_enabled=reflection_enabled)
        ),
        reflector=reflector,
        _loop_reflection_gate=gate,
    )


def _capture_fire_and_forget(monkeypatch):
    captured = []
    monkeypatch.setattr(
        "src.discord.turn_recorder.fire_and_forget",
        lambda coro, name="": captured.append(coro),
    )
    return captured


def _reflect(bot, **overrides):
    kwargs = dict(
        loop_id="loop-1",
        prompt="check the disks",
        outcome="all healthy",
        is_error=False,
        failure_class="",
        error_text="",
        tool_details=TOOL_DETAILS,
        user_id="u1",
    )
    kwargs.update(overrides)
    TurnRecorder(bot)._maybe_loop_reflect(**kwargs)


async def test_success_path_consults_gate_and_fires_reflection(monkeypatch):
    bot = _bot()
    captured = _capture_fire_and_forget(monkeypatch)

    _reflect(bot)

    # The regression: with the always-False hasattr guard, the gate was
    # never consulted and nothing was ever scheduled.
    bot._loop_reflection_gate.evaluate.assert_called_once_with("loop-1", is_error=False)
    assert len(captured) == 1
    await captured[0]
    bot.reflector.reflect_on_operation.assert_awaited_once()
    kwargs = bot.reflector.reflect_on_operation.await_args.kwargs
    assert kwargs["user_request"].startswith("[autonomous loop loop-1]")
    assert kwargs["tools_used"] == ["run_command"]
    assert kwargs["is_error"] is False


async def test_error_path_passes_failure_class_to_gate(monkeypatch):
    bot = _bot()
    captured = _capture_fire_and_forget(monkeypatch)

    _reflect(
        bot,
        loop_id="loop-2",
        is_error=True,
        failure_class="command_failed",
        error_text="boom",
        tool_details=ERROR_DETAILS,
        outcome="iteration failed",
    )

    bot._loop_reflection_gate.evaluate.assert_called_once_with(
        "loop-2",
        is_error=True,
        failure_class="command_failed",
        error_text="boom",
    )
    assert len(captured) == 1
    await captured[0]
    assert bot.reflector.reflect_on_operation.await_args.kwargs["is_error"] is True


async def test_tool_error_without_is_error_still_takes_error_path(monkeypatch):
    """A recovered mid-iteration tool error reflects through the error gate."""
    bot = _bot()
    captured = _capture_fire_and_forget(monkeypatch)

    _reflect(bot, is_error=False, tool_details=ERROR_DETAILS)

    args, kwargs = bot._loop_reflection_gate.evaluate.call_args
    assert kwargs["is_error"] is True
    assert kwargs["error_text"] == "Error: boom"
    assert kwargs["failure_class"]  # classified from the error text
    assert len(captured) == 1
    await captured[0]


async def test_gate_suppression_schedules_nothing(monkeypatch):
    bot = _bot(gate_verdict=(False, "cooldown"))
    captured = _capture_fire_and_forget(monkeypatch)

    _reflect(bot)

    bot._loop_reflection_gate.evaluate.assert_called_once()
    assert captured == []
    bot.reflector.reflect_on_operation.assert_not_awaited()


async def test_no_tool_details_skips_gate_entirely(monkeypatch):
    bot = _bot()
    captured = _capture_fire_and_forget(monkeypatch)

    _reflect(bot, tool_details=[])

    bot._loop_reflection_gate.evaluate.assert_not_called()
    assert captured == []


async def test_missing_reflector_is_still_a_safe_no_op(monkeypatch):
    """The defensive intent of the original guard is preserved."""
    bot = _bot()
    del bot.reflector
    captured = _capture_fire_and_forget(monkeypatch)

    _reflect(bot)

    bot._loop_reflection_gate.evaluate.assert_not_called()
    assert captured == []


async def test_disabled_by_config_short_circuits(monkeypatch):
    bot = _bot(reflection_enabled=False)
    captured = _capture_fire_and_forget(monkeypatch)

    _reflect(bot)

    bot._loop_reflection_gate.evaluate.assert_not_called()
    assert captured == []
