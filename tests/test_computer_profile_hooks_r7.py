"""Historical attached app names cannot narrow general GUI actions."""
import pytest

from tests.test_computer_keyboard_grounding_r6 import fixture, raster
from tests.test_computer_x11_guardian_r5 import click, observed


@pytest.mark.parametrize("operation,fields", [
    ("click", {"x": 2, "y": 2}),
    ("drag", {"points": [[2, 2], [3, 3]], "duration": .1}),
    ("key", {"key": "ctrl+o"}), ("key", {"key": "ctrl+n"}),
])
async def test_controller_ignores_historical_profile_for_ordinary_actions(
        tmp_path, monkeypatch, operation, fields):
    async with fixture(tmp_path, monkeypatch) as (c, ctx, action, state, calls):
        c.store.db.execute("UPDATE sessions SET app='writer'")
        state["image"] = raster(0)
        action.update(operation=operation, **fields)
        receipt = await c.act(ctx, action)
        assert receipt["status"] == "verified"
        assert len(calls) == 1
        assert c.store.db.execute("SELECT count(*) FROM receipts").fetchone()[0] == 1
        status = await c.session(ctx, {"operation": "status", "session_id": action["session_id"]})
        assert status["app"] is None and "application_profile" not in status


@pytest.mark.parametrize("kind,fields", [
    ("click", {"x": 2, "y": 2}),
    ("polyline", {"points": [[2, 2], [3, 3]], "duration": .1}),
    ("key", {"chord": "ctrl+o"}), ("key", {"chord": "ctrl+n"}),
])
async def test_direct_backend_does_not_gate_by_historical_profile(monkeypatch, kind, fields):
    backend, _state, frame = await observed(monkeypatch)
    backend._config["app_profile"] = "writer"
    action = {k: v for k, v in click(frame).items() if k not in {"x", "y"}}
    action.update(type=kind, **fields)
    calls = []
    async def input_worker(request):
        calls.append(request)
        return {"status": "executed", "injected": True, "released": True}
    monkeypatch.setattr(backend, "_input_worker", input_worker)
    result = await backend.act(action)
    assert result["status"] == "executed" and len(calls) == 1
    assert backend._frame is None
    await backend.detach()
