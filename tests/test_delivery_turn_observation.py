"""Retained output must not make noncritical turn observations fatal."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

from src.discord.turn_recorder import TurnRecorder


def recorder(**kwargs):
    return TurnRecorder(get_config=lambda: None, trajectory_saver=None, reflector=None,
                        outbound_webhook_dispatcher=kwargs.get("dispatcher"),
                        loop_reflection_gate=None)


def test_scrub_failure_does_not_break_turn_content_observation():
    class Unwritable:
        @property
        def user_content(self):
            return "existing"

    target = Unwritable()
    recorder()._record_user_content(target, "ordinary retained output")
    assert target.user_content == "existing"


async def test_observation_failure_is_nonfatal_after_tool_delivery():
    saver = SimpleNamespace(save=AsyncMock(side_effect=OSError("fixture disk failure")))
    target = recorder()
    target._trajectory_saver = saver
    trajectory = SimpleNamespace(iterations=[], _started_ns=1)
    await target._save_turn_trajectory(trajectory, final_response="retained evidence available")
    saver.save.assert_awaited_once_with(trajectory)
    assert trajectory.final_response == "retained evidence available"


async def test_lifecycle_dispatch_failure_does_not_change_completed_turn():
    dispatcher = SimpleNamespace(dispatch_fire_and_forget=AsyncMock(side_effect=OSError("offline")))
    await recorder(dispatcher=dispatcher)._emit_lifecycle_event("tool.completed", {"status": "ok"})
    dispatcher.dispatch_fire_and_forget.assert_awaited_once()
