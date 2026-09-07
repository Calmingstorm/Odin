"""The offered task gate is shared by controller and direct runtime input."""
import pytest

from src.computer.models import ComputerError
from tests.test_computer_keyboard_grounding_r6 import fixture
from tests.test_computer_x11_guardian_r5 import click, observed


@pytest.mark.parametrize("operation,fields", [
    ("click", {"x": 2, "y": 2}),
    ("drag", {"points": [[2, 2], [3, 3]], "duration": .1}),
    ("key", {"key": "ctrl+o"}), ("key", {"key": "ctrl+n"}),
])
async def test_controller_offering_before_capture_or_pending(tmp_path, monkeypatch, operation, fields):
    async with fixture(tmp_path, monkeypatch) as (c, ctx, action, _state, calls):
        c.store.db.execute("UPDATE sessions SET app='writer'")
        action.update(operation=operation, **fields)
        with pytest.raises(ComputerError, match="application_task_not_offered"):
            await c.act(ctx, action)
        assert not calls
        assert c.store.db.execute("SELECT count(*) FROM receipts").fetchone()[0] == 0
        status = await c.session(ctx, {"operation": "status", "session_id": action["session_id"]})
        assert status["application_profile"]["id"] == "writer"
        assert status["application_profile"]["input_operations"] == ["type", "key"]


@pytest.mark.parametrize("kind,fields", [
    ("click", {"x": 2, "y": 2}),
    ("polyline", {"points": [[2, 2], [3, 3]], "duration": .1}),
    ("key", {"chord": "ctrl+o"}), ("key", {"chord": "ctrl+n"}),
])
async def test_direct_backend_offering_before_injection(monkeypatch, kind, fields):
    backend, _state, frame = await observed(monkeypatch)
    backend._config["app_profile"] = "writer"
    action = {k: v for k, v in click(frame).items() if k not in {"x", "y"}}
    action.update(type=kind, **fields)
    async def forbidden(request):
        pytest.fail("unoffered Writer task reached input")
    monkeypatch.setattr(backend, "_input_worker", forbidden)
    with pytest.raises(ComputerError, match="application_task_not_offered"):
        await backend.act(action)
    assert backend._frame is frame
    await backend.detach()
