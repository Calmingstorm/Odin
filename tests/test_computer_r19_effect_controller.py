"""End-to-end action settlement with native-protocol fixture endpoints."""

import pytest

from src.computer.effects import measured_appearance
from tests.test_computer_keyboard_grounding_r6 import fixture


@pytest.mark.parametrize("expected", ["visual_change", "dialog_appeared"])
async def test_gimp_dialog_without_transient_hint(tmp_path, monkeypatch, expected):
    async with fixture(tmp_path, monkeypatch) as (controller, context, action, state, calls):
        backend = controller._live[action["session_id"]].backend
        state["binding"].update(
            topology={"root": 2},
            window_kind="normal",
            wm_class="gimp Gimp",
            process={
                "pid": 17,
                "start_ticks": 300,
                "uid": 1000,
                "exe": "/usr/bin/gimp",
                "exe_identity": [1, 2],
                "cmdline_digest": "a" * 64,
                "trusted_executable": True,
                "script_identity": None,
            },
        )
        read, inject = backend._read_worker, backend._input_worker

        async def capture(operation, **kwargs):
            reply = await read(operation, **kwargs)
            if operation == "capture":
                binding = state["binding"]
                reply["window_inventory"] = {
                    "root": 2,
                    "process": binding["process"],
                    "target": binding["window"],
                    "complete": True,
                    "windows": [[2, 2], [90, 2], [91, 2 if binding["window"] == 91 else 0]],
                }
            return reply

        async def open_dialog(request):
            result = await inject(request)
            state["binding"].update(
                window=91,
                focus_window=91,
                window_kind="dialog",
                modal=True,
                modal_kind="safe_application",
            )
            return result

        monkeypatch.setattr(backend, "_read_worker", capture)
        monkeypatch.setattr(backend, "_input_worker", open_dialog)
        observed = await controller.observe(
            context, {"session_id": action["session_id"], "generation": 1}
        )
        obs = controller._live[action["session_id"]].observations[observed["observation_id"]]
        await controller.validate_observation_delivery(
            context, obs.frame_metadata, obs.image_sha256
        )
        action.update(
            operation="click",
            x=2,
            y=2,
            expect={"type": expected},
            observation_id=obs.observation_id,
            source_revision=obs.source.source_revision,
        )
        result = await controller.act(context, action)
        assert result["status"] == "verified"
        assert measured_appearance(result)
        assert "next_observation" in result
        assert len(calls) == 1


@pytest.mark.parametrize("operation", ["polyline", "drag"])
async def test_stroke_never_durably_settles_as_semantically_verified(
    tmp_path, monkeypatch, operation
):
    async with fixture(tmp_path, monkeypatch) as (controller, context, action, _state, calls):
        action.update(operation=operation, points=[[2, 2], [15, 5]], duration=0.1)
        finish = controller.store.finish_action
        statuses = []

        def settle(*args):
            statuses.append(args[-1]["status"])
            return finish(*args)

        monkeypatch.setattr(controller.store, "finish_action", settle)
        result = await controller.act(context, action)
        assert result["status"] == "executed"
        assert result["verification"]["semantic_mark_verified"] is False
        assert "path_evidence" in result["verification"]
        assert "next_observation" in result
        replay = await controller.act(context, action)
        assert replay["status"] == "executed"
        assert len(calls) == 1 and "verified" not in statuses
