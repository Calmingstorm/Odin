"""Configured attachment is distinct from granting input; no real displays."""

import pytest

from src.computer.controller import ComputerController
from src.computer.geometry import AffineTransform, SourceGeometry
from src.computer.models import BackendCapabilities, BackendObservation, CaptureScope, ComputerError
from src.computer.store import ComputerStore
from tests.test_computer_contract_r1 import RequestContext, Stub, png


class Attached(Stub):
    capabilities = BackendCapabilities("x11", "existing_session", "unknown", "unknown",
                                       "unknown", "verified")
    input_supported = False
    creates_devices = False

    def __init__(self):
        super().__init__()
        self.selected = "first"

    def sources(self):
        return [{"source_id": name, "label": name, "width": 2, "height": 2}
                for name in ("first", "second")]

    async def select_source(self, source_id):
        if source_id not in {"first", "second"}:
            raise ComputerError("capture_source_not_granted")
        self.selected = source_id

    async def observe(self):
        return BackendObservation(SourceGeometry(self.selected, 1, 1, 2, 2),
            CaptureScope(1, frozenset({self.selected})), 2, 2, AffineTransform(), png())

    async def detach(self):
        result = await super().detach()
        return {**result, "owned_devices": "not_created", "input_was_enabled": False}


async def test_attachment_capture_select_and_no_devices_cleanup(tmp_path):
    backend = Attached()
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    context = RequestContext("owner", "channel", "turn", "host")
    try:
        grant = await controller.session(context, {"operation": "start"})
        assert grant["input_supported"] is False
        assert len(grant["sources"]) == 2
        args = {"session_id": grant["session_id"], "generation": 1}
        first = await controller.observe(context, args)
        assert first["source"]["source_id"] == "first"
        second = await controller.observe(context, {**args, "source_id": "second"})
        assert second["source"]["source_id"] == "second"
        assert second["input_sources"] == [] and not second["focused"]
        with pytest.raises(ComputerError, match="not_granted"):
            await controller.observe(context, {**args, "source_id": "outside"})
        closed = await controller.session(context, {"operation": "close", **args})
        assert closed["cleanup"]["complete"] is True
        assert backend.detached and not backend.stopped
    finally:
        await controller.close()
        store.close()


async def test_attachment_input_flag_without_release_evidence_refused_before_start(tmp_path):
    backend = Attached()
    backend.input_supported = True
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    try:
        with pytest.raises(ComputerError, match="lifecycle_unproven"):
            await controller.session(RequestContext("o", "c", "t", "h"),
                                     {"operation": "start"})
        assert not controller._live
    finally:
        await controller.close()
        store.close()


@pytest.mark.parametrize("creation", [True, None])
async def test_not_created_claim_requires_backend_no_device_contract(tmp_path, creation):
    backend = Attached()
    backend.creates_devices = creation
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    context = RequestContext("o", "c", "t", "h")
    try:
        grant = await controller.session(context, {"operation": "start"})
        closed = await controller.session(context, {"operation": "close",
                                                    "session_id": grant["session_id"]})
        assert closed["state"] == "quarantined"
        assert closed["cleanup"]["complete"] is False
        backend.creates_devices = False
    finally:
        await controller.close()
        store.close()
