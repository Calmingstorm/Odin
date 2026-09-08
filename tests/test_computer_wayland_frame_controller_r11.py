"""Real controller + Wayland backend, with fake native/portal boundaries only."""

import io
import time
from fractions import Fraction

import pytest
from PIL import Image

from src.computer.controller import ComputerController
from src.computer.models import ComputerError
from src.computer.runtime.wayland_guardian import WaylandGuardianError
from src.computer.store import ComputerStore
from tests.test_computer_contract_r1 import RequestContext
from tests.test_computer_wayland_backend_r8 import SCOPE, Portal
from tests.test_computer_wayland_backend_r8 import adapter as adapter_fixture

adapter = adapter_fixture

IDENTITY_SCOPE = {
    **SCOPE,
    "wm_class": "ordinary-app",
    "application": {
        "pid": 456,
        "uid": 1000,
        "start_ticks": 123,
        "exe": "/home/operator/.local/bin/app",
        "exe_identity": [1, 2],
        "cmdline_digest": "b" * 64,
        "trusted_executable": False,
        "script_identity": None,
    },
}


@pytest.mark.parametrize(
    "size,crop,dimensions,scale",
    [
        ((3840, 2160), None, (1600, 900), Fraction(5, 12)),
        (
            (3840, 2160),
            {"x": 123, "y": 59, "width": 3200, "height": 1801},
            (1600, 901),
            Fraction(1, 2),
        ),
        (
            (5120, 1440),
            {"x": 1900, "y": 101, "width": 3200, "height": 1001},
            (1600, 501),
            Fraction(1, 2),
        ),
        ((5120, 1440), {"x": 2500, "y": 200, "width": 801, "height": 601}, (801, 601), Fraction(1)),
    ],
)
async def test_controller_delivers_exact_crop_transform_and_dispatches(
    tmp_path, adapter, monkeypatch, size, crop, dimensions, scale
):
    original_init = Portal.__init__

    def init(portal, *args, **kwargs):
        original_init(portal, *args, **kwargs)
        portal.source["size"] = list(size)

    output = io.BytesIO()
    with Image.new("RGB", size, "white") as image:
        image.save(output, format="PNG")

    async def capture(portal, node_id):
        return {
            "source_metadata": dict(portal.source),
            "image": output.getvalue(),
            "width": size[0],
            "height": size[1],
            "captured_at": time.monotonic(),
            "clock_verified": True,
            "generation": portal.current_generation,
        }

    monkeypatch.setattr(Portal, "__init__", init)
    monkeypatch.setattr(Portal, "capture", capture)
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, lambda _: adapter, lambda _: True, enabled=True)
    context = RequestContext("operator", "channel", "turn", "host")
    try:
        grant = await controller.session(context, {"operation": "start"})

        async def select(mapping_id):
            return {"width": size[0], "height": size[1]}

        adapter._guardian.select = select
        adapter._scope_provider.scope = {
            **IDENTITY_SCOPE,
            "bounds": {"x": 0, "y": 0, "width": size[0], "height": size[1]},
        }
        args = {"session_id": grant["session_id"], "generation": 1}
        observed = await controller.observe(context, {**args, **({"crop": crop} if crop else {})})
        obs = controller._live[grant["session_id"]].observations[observed["observation_id"]]
        metadata = obs.frame_metadata
        assert (metadata.width, metadata.height) == dimensions
        assert Fraction(*metadata.resize_scale) == scale
        assert metadata.resize_rounding == "nearest"
        assert observed["frame_metadata"]["crop"] == crop
        assert metadata.delivered_to_source == adapter._frame.delivered_to_source
        await controller.validate_observation_delivery(context, metadata, obs.image_sha256)
        action = {
            **args,
            "operation": "click",
            "x": 17,
            "y": 23,
            "action_id": "click",
            "observation_id": obs.observation_id,
            "source_id": obs.source.source_id,
            "source_revision": obs.source.source_revision,
            "consent_generation": 1,
            "expect": {"type": "visual_change"},
        }
        result = await controller.act(context, action)
        # The fake desktop deliberately does not change pixels after input.
        assert result["status"] == "not_satisfied", result
        assert result["execution"] == {"sent": True, "injected": True, "released": True}
        assert result["application_provenance"]["exe_basename"] == "app"
        assert "/home/operator" not in str(result)
        x, y = obs.source.input_point(
            metadata.delivered_to_source, 17, 23, metadata.width, metadata.height
        )
        assert adapter._guardian.commands == [f"P 272 {float(x):.8f} {float(y):.8f}"]
        next_view = result["next_observation"]
        with Image.open(io.BytesIO(next_view["image_bytes"])) as image:
            assert image.size == dimensions
            assert image.convert("RGB").getextrema() == ((255, 255),) * 3
        assert next_view["observation_id"] != observed["observation_id"]
        replay = await controller.act(context, action)
        assert replay == {key: value for key, value in result.items() if key != "next_observation"}
        assert "next_observation" not in replay and "image_bytes" not in replay
        assert len(adapter._guardian.commands) == 1
    finally:
        await controller.close()
        store.close()


@pytest.mark.parametrize(
    "modal,expected", [(False, None), (True, "a" * 64), (True, None), (True, "wrong")]
)
async def test_controller_unicode_preflight_and_ordinary_modal(tmp_path, adapter, modal, expected):
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, lambda _: adapter, lambda _: True, enabled=True)
    context = RequestContext("operator", "channel", "turn", "host")
    try:
        grant = await controller.session(context, {"operation": "start"})
        adapter._scope_provider.scope = IDENTITY_SCOPE
        if modal:
            adapter._scope_provider.scope = {
                **IDENTITY_SCOPE,
                "modal": True,
                "modal_title_digest": "a" * 64,
                "modal_kind": "safe_application",
            }
        calls = []

        async def reject(command):
            calls.append(command)
            error = WaylandGuardianError("unsupported_character")
            error.details = {
                "event": "action_rejected",
                "input_was_sent": False,
                "reason": "unsupported_character",
                "characters": [{"index": 0, "codepoint": 128512}],
            }
            raise error

        adapter._guardian.act = reject
        args = {"session_id": grant["session_id"], "generation": 1}
        observed = await controller.observe(context, args)
        obs = controller._live[grant["session_id"]].observations[observed["observation_id"]]
        assert obs.modal == ("a" * 64 if modal else None)
        await controller.validate_observation_delivery(
            context, obs.frame_metadata, obs.image_sha256
        )
        action = {
            **args,
            "operation": "type",
            "text": "😀",
            "action_id": "unicode",
            "observation_id": obs.observation_id,
            "source_id": obs.source.source_id,
            "source_revision": obs.source.source_revision,
            "consent_generation": 1,
            "expect": {"type": "visual_change"},
        }
        if expected is not None:
            action["expected_modal"] = expected
        if modal and expected != "a" * 64:
            with pytest.raises(ComputerError, match="unexpected_modal"):
                await controller.act(context, action)
            assert not calls
        else:
            receipt = await controller.act(context, action)
            assert receipt["status"] == "unavailable", receipt
            assert receipt["reason"] == "unsupported_character"
            assert receipt["application_provenance"]["exe_basename"] == "app"
            assert receipt["unsupported_characters"] == [{"index": 0, "codepoint": "U+1F600"}]
            assert adapter._guardian.alive and not adapter._paused
            assert await controller.act(context, action) == receipt
            assert len(calls) == 1
    finally:
        await controller.close()
        store.close()
