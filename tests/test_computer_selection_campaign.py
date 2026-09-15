"""Controller-owned Hyprland target selection is never a transferable native proof."""

import pytest

from src.computer.controller import ComputerController
from src.computer.models import BackendCapabilities, ComputerError, RequestContext
from src.computer.store import ComputerStore


class SelectionBackend:
    capabilities = BackendCapabilities(
        "wayland",
        "existing_session",
        "independent",
        "independent",
        "hyprland_best_effort",
        "verified",
        "hyprland",
    )
    input_supported = False

    def __init__(self):
        self.closed = False
        self.selection = None

    async def inventory_targets(self):
        return {
            "candidate_epoch": 7,
            "candidates": [
                {"id": "c1-" + "a" * 32, "label": "Drawing", "output_id": "DP-1"},
            ],
        }

    async def start(self, _session_id, *, selection=None):
        self.selection = selection

    async def close(self):
        self.closed = True

    async def stop(self):
        return {"stopped": True}


def context(owner="owner", turn="turn"):
    return RequestContext(owner, "channel", turn, "host")


@pytest.mark.asyncio
async def test_inventory_returns_opaque_bound_handles_and_closes_read_only_backend(tmp_path):
    inventory_backend = SelectionBackend()
    controller = ComputerController(
        ComputerStore(tmp_path / "db", tmp_path / "evidence"),
        lambda _: inventory_backend,
        lambda _: True,
        enabled=True,
    )
    result = await controller.session(context(), {"operation": "inventory_targets"})
    assert result["candidate_epoch"].startswith("e1-")
    assert result["candidates"][0]["target_id"].startswith("t1-")
    assert "c1-" not in repr(result)
    assert inventory_backend.closed


@pytest.mark.asyncio
async def test_selection_cannot_be_forged_or_transferred_and_native_values_stay_private(tmp_path):
    inventory_backend = SelectionBackend()
    controller = ComputerController(
        ComputerStore(tmp_path / "db", tmp_path / "evidence"),
        lambda _: inventory_backend,
        lambda _: True,
        enabled=True,
    )
    result = await controller.session(context(), {"operation": "inventory_targets"})
    candidate = result["candidates"][0]
    selected = {"target_id": candidate["target_id"], "candidate_epoch": result["candidate_epoch"]}
    with pytest.raises(ComputerError, match="target_selection_forbidden"):
        await controller.session(context("other"), {"operation": "start", **selected})
    assert controller._selection_binding(context(), selected) == {
        "target_id": "c1-" + "a" * 32,
        "output_id": "DP-1",
        "candidate_epoch": 7,
    }


@pytest.mark.asyncio
async def test_selection_binding_is_single_use_and_rejects_malformed_public_fields(tmp_path):
    inventory_backend = SelectionBackend()
    controller = ComputerController(
        ComputerStore(tmp_path / "db", tmp_path / "evidence"),
        lambda _: inventory_backend,
        lambda _: True,
        enabled=True,
    )
    result = await controller.session(context(), {"operation": "inventory_targets"})
    candidate = result["candidates"][0]
    with pytest.raises(ComputerError, match="target_selection_invalid"):
        await controller.session(
            context(),
            {"operation": "start", "target_id": candidate["target_id"], "candidate_epoch": 7},
        )
    assert (
        controller._selection_binding(
            context(),
            {
                "target_id": candidate["target_id"],
                "candidate_epoch": result["candidate_epoch"],
            },
        )["candidate_epoch"]
        == 7
    )
    with pytest.raises(ComputerError, match="target_selection_stale"):
        controller._selection_binding(
            context(),
            {
                "target_id": candidate["target_id"],
                "candidate_epoch": result["candidate_epoch"],
            },
        )
