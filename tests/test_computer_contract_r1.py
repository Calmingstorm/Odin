import struct
import zlib
from dataclasses import replace

import pytest

from src.computer.controller import ComputerController
from src.computer.geometry import AffineTransform as A
from src.computer.geometry import SourceGeometry
from src.computer.models import (
    BackendCapabilities,
    BackendObservation,
    CaptureScope,
    ComputerError,
    LiveSession,
    RequestContext,
)
from src.computer.policy import input_eligible
from src.computer.store import ComputerStore


def png():
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind+data))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB",2,2,8,2,0,0,0))
            + chunk(b"IDAT", zlib.compress(b"\x00"*14)) + chunk(b"IEND", b""))


class Stub:
    capabilities = BackendCapabilities("wayland", "isolated", "shared", "shared")
    def __init__(self):
        self.source = SourceGeometry("opaque",1,1,2,2,"input",2,2,A())
        self.detached = self.stopped = False
    async def start(self, sid):
        return {}
    async def observe(self):
        return BackendObservation(self.source, CaptureScope(1, frozenset({"opaque"}),
                                  frozenset({"opaque"})), 2,2,A(),png(),True)
    async def stop(self):
        self.stopped = True
        return {"stopped": True}
    async def detach(self):
        self.detached = True
        return {"stopped": True}


@pytest.mark.parametrize("platform", ["x11", "wayland"])
@pytest.mark.parametrize(
    "pointer,keyboard",
    [("shared", "independent"), ("independent", "unknown"), ("unknown", "shared")],
)
def test_existing_session_requires_both_separations(platform, pointer, keyboard):
    with pytest.raises(ComputerError, match="separation"):
        input_eligible(BackendCapabilities(platform,"existing_session",pointer,keyboard))
    input_eligible(BackendCapabilities(platform,"isolated",pointer,keyboard))


@pytest.mark.asyncio
@pytest.mark.parametrize("change", [{"source_revision":2}, {"input_region_id":"new-device"},
                                       {"pixel_to_input":A(1,0,1,0,1,0)}])
async def test_neutral_capture_and_stale_binding(tmp_path, change):
    store = ComputerStore(tmp_path/"db", tmp_path/"evidence")
    backend = Stub()
    controller = ComputerController(store, lambda app: backend, lambda ctx: True, enabled=True)
    ctx = RequestContext("owner","channel","turn","host")
    try:
        grant = await controller.session(ctx, {"operation":"start","app":"adapter-profile"})
        observed = await controller.observe(ctx, {"session_id":grant["session_id"],"generation":1})
        assert observed["frame_metadata"]["source_id"] == "opaque"
        assert "window" not in observed and "display_width" not in observed
        backend.source = replace(backend.source, **change)
        with pytest.raises(ComputerError, match="stale_source_binding"):
            await controller.validate_action_binding(store.get_session(grant["session_id"]),
                                                     observed["observation_id"])
        with pytest.raises(ComputerError, match="grounded_actions_unavailable"):
            await controller.act(ctx, {})
    finally:
        await controller.close()


@pytest.mark.asyncio
async def test_existing_stop_detaches_never_terminates_apps(tmp_path):
    store = ComputerStore(tmp_path/"db", tmp_path/"evidence")
    controller = ComputerController(store, None, lambda ctx: True, enabled=True)
    ctx = RequestContext("owner","channel","turn","host")
    grant = store.create_session(ctx,"",platform="wayland",environment="existing_session")
    backend = Stub()
    controller._live[grant.session_id] = LiveSession(backend,999999,
        capabilities=BackendCapabilities("wayland","existing_session"))
    await controller._stop(grant.session_id,"closed")
    assert backend.detached and not backend.stopped
    updated = store.get_session(grant.session_id)
    assert updated.generation == updated.consent_generation == 2


def test_additive_store_reopen(tmp_path):
    store = ComputerStore(tmp_path/"db",tmp_path/"evidence")
    grant = store.create_session(RequestContext("o","c","t","h"),"profile")
    store.db.close()
    reopened = ComputerStore(tmp_path/"db",tmp_path/"evidence")
    assert reopened.get_session(grant.session_id) == grant


@pytest.mark.asyncio
async def test_adapter_never_exposes_private_ids_or_accepts_input():
    from src.computer.runtime.backend import LinuxDesktopBackend, RuntimeFailure
    from src.computer.runtime.protocol import pack_blob

    adapter = LinuxDesktopBackend()
    async def rpc(operation, **kwargs):
        return {"observation": {"window": {"id": 424242, "x": -1920, "y": 213},
                                "width":2, "height":2, "observation_id":"native-token",
                                "image":pack_blob(png()), "modal":False}}
    adapter._rpc = rpc
    first, second = await adapter.observe(), await adapter.observe()
    assert first.source.source_id == second.source.source_id
    assert first.source.source_revision != second.source.source_revision
    assert first.source.pixel_to_input is None and not first.scope.input_sources
    assert "424242" not in repr(first) and "native-token" not in repr(first)
    with pytest.raises(RuntimeFailure, match="capture only"):
        await adapter.act({"x":0,"y":0})


@pytest.mark.asyncio
@pytest.mark.parametrize("change", [{"source_id":"replacement"}, {"consent_generation":2}])
async def test_same_size_replacement_and_revocation_fail_closed(tmp_path, change):
    store = ComputerStore(tmp_path/"db", tmp_path/"evidence")
    backend = Stub()
    controller = ComputerController(store, lambda app: backend, lambda ctx: True, enabled=True)
    ctx = RequestContext("owner","channel","turn","host")
    try:
        grant = await controller.session(ctx, {"operation":"start","app":"profile"})
        observed = await controller.observe(ctx, {"session_id":grant["session_id"],"generation":1})
        backend.source = replace(backend.source, **change)
        with pytest.raises(ComputerError):
            await controller.validate_action_binding(store.get_session(grant["session_id"]),
                                                     observed["observation_id"])
    finally:
        await controller.close()
