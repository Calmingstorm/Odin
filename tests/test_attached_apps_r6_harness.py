"""Historical safety checks, with executed entry-point and evidence regressions."""

import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/computer-feasibility/attached-apps-r6.py"


@pytest.fixture
def harness(monkeypatch):
    monkeypatch.syspath_prepend(str(SCRIPT.parent))
    spec = importlib.util.spec_from_file_location("attached_apps_fixture", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    def forbidden(*args, **kwargs):
        pytest.fail("real process or reaper attempted")

    monkeypatch.setattr(module, "Reaper", forbidden)
    monkeypatch.setattr(module.subprocess, "Popen", forbidden)
    monkeypatch.setattr(module.subprocess, "run", forbidden)
    return module


def test_parse_and_private_gate(harness, monkeypatch):
    with pytest.raises(RuntimeError, match="explicit_private_execution_required"):
        harness.outer(SimpleNamespace(execute_isolated=False))
    monkeypatch.delenv("XI2_PRIVATE_SANDBOX", raising=False)
    with pytest.raises(AssertionError):
        harness.inner()
    monkeypatch.setenv("XI2_PRIVATE_SANDBOX", "1")
    monkeypatch.delenv("DISPLAY", raising=False)
    with pytest.raises(AssertionError):
        harness.inner()


@pytest.fixture
def exercise_fixture(harness, monkeypatch, tmp_path):
    from src.computer import controller, store, vision
    from src.computer.runtime import x11_attached

    events, actions, states, sessions, closed = [], [], [], [], []
    obs = SimpleNamespace(
        session_id="session",
        generation=1,
        source=SimpleNamespace(consent_generation=1, source_id="source", source_revision=1),
        observation_id="observation",
        modal=None,
        modal_kind=None,
        focused=True,
        frame_metadata={"fixture": True},
        image_sha256="hash",
    )

    class Backend:
        def __init__(self, **kwargs):
            self._children = []

    class Store:
        def __init__(self, *args):
            pass

        def get_session(self, session_id):
            return obs

        def close(self):
            closed.append("store")

    class Controller:
        def __init__(self, *args, **kwargs):
            self._live = {obs.session_id: SimpleNamespace(observations={obs.observation_id: obs})}

        async def session(self, ctx, payload):
            sessions.append(payload)
            return {"session_id": obs.session_id}

        async def observe(self, ctx, payload):
            return {"observation_id": obs.observation_id, "image_bytes": b"fixture-pixels"}

        async def validate_observation_delivery(self, ctx, frame_metadata, image_sha256):
            assert frame_metadata is obs.frame_metadata and image_sha256 == "hash"
            events.append(("delivery_validated", {}))

        async def act(self, ctx, payload):
            assert events[-2][0] == "delivery_validated"
            actions.append(payload)
            return {"status": states.pop(0) if states else "executed"}

        async def close(self):
            closed.append("controller")

    def local_path(value):
        value = Path(value)
        if value.is_absolute():
            assert value.is_relative_to("/workspace")
            value = tmp_path / value.relative_to("/workspace")
        return value

    target = tmp_path / "home/result.svg"
    target.parent.mkdir()
    target.write_text("<svg><rect/><ellipse/></svg>")
    monkeypatch.setattr(harness, "Path", local_path)
    monkeypatch.setattr(harness, "record", lambda kind, **fields: events.append((kind, fields)))
    monkeypatch.setattr(harness.asyncio, "sleep", AsyncMock())
    monkeypatch.setattr(controller, "ComputerController", Controller)
    monkeypatch.setattr(store, "ComputerStore", Store)
    monkeypatch.setattr(x11_attached, "X11AttachedBackend", Backend)
    monkeypatch.setattr(vision, "observation_image", lambda *args: {"__computer_frame__": True})
    display = SimpleNamespace(
        screen=lambda: SimpleNamespace(root=SimpleNamespace(get_full_property=lambda *args: None)),
        intern_atom=lambda name: name,
    )
    return SimpleNamespace(
        module=harness,
        display=display,
        events=events,
        actions=actions,
        states=states,
        sessions=sessions,
        closed=closed,
        target=target,
    )


async def test_real_controller_no_shell_document_generation(exercise_fixture):
    f = exercise_fixture
    f.states.append("unknown")
    with pytest.raises(RuntimeError, match="uncertain_action_no_replay"):
        await f.module.exercise("inkscape", None, f.display)
    assert len(f.actions) == 1 and f.actions[0]["operation"] == "type"
    assert f.closed == ["controller", "store"]
    assert not any(kind.startswith("task_") for kind, _ in f.events)


async def test_census_closes_without_granting_input(exercise_fixture):
    f = exercise_fixture
    await f.module.exercise("census", None, f.display)
    assert f.actions == [] and f.sessions == []
    assert f.closed == ["controller", "store"]


async def test_partial_not_full_qualification(exercise_fixture):
    f = exercise_fixture
    before = f.target.read_bytes()
    await f.module.exercise("inkscape", None, f.display)
    assert f.target.read_bytes() == before
    assert f.sessions == [{"operation": "start", "app": "inkscape"}]
    assert ("task_partial", {"saved": True, "reopened": False}) in f.events
    saved = next(fields for kind, fields in f.events if kind == "saved_artifact")
    assert saved["content_verified"] is True and saved["size"] == len(before)
    assert not any(kind == "task_complete" for kind, _ in f.events)
    assert not any(action.get("key") == "ctrl+o" for action in f.actions)
    assert f.closed == ["controller", "store"]


@pytest.mark.parametrize("task", ["calc", "draw"])
async def test_unoffered_tasks_refuse_without_input(exercise_fixture, task):
    f = exercise_fixture
    with pytest.raises(RuntimeError, match="application_task_not_offered"):
        await f.module.exercise(task, None, f.display)
    assert f.actions == [] and f.closed == ["controller", "store"]
