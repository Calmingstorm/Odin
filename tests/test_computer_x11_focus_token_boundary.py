"""Unfocused candidate is private evidence, not ordinary input authority."""

import time
from dataclasses import replace

import pytest

from src.computer.geometry import AffineTransform, SourceGeometry
from src.computer.models import BackendObservation, CaptureScope
from src.computer.runtime.x11_attached import X11AttachedBackend
from tests.test_computer_contract_r1 import png


def fake_backend():
    backend = X11AttachedBackend(
        enabled=True, display_name=":177", monitor_names=("fake",), input_enabled=True
    )
    backend._started = True
    backend._selected = "opaque"
    backend._sources = {"opaque": {"name": "fake", "index": 0}}
    backend._captured_at = time.monotonic()
    backend._scope = None
    backend._focus_candidate_token = [{"token": "a" * 64, "rect": [0, 0, 2, 2]}]
    backend._focus_source_origin = [0, 0]
    for candidate in backend._focus_candidate_token:
        candidate["keyboard_focus"] = 77
    source = SourceGeometry("opaque", 1, 1, 2, 2)
    backend._frame = BackendObservation(
        source, CaptureScope(1, frozenset({"opaque"})),
        2, 2, AffineTransform(), png(), focused=False,
    )
    return backend


@pytest.mark.asyncio
async def test_unfocused_candidate_token_does_not_require_ordinary_input_scope():
    backend = fake_backend()
    assert backend._scope is None
    assert await backend.focus_candidate_token() == (("a" * 64, (0, 0, 2, 2), 77),)
    assert backend._frame.source.pixel_to_input is None
    assert not backend._frame.scope.input_sources


@pytest.mark.asyncio
@pytest.mark.parametrize("invalid", ["focused", "modal", "crop", "closed", "release"])
async def test_focus_token_fail_closed_on_lifecycle_or_binding(invalid):
    backend = fake_backend()
    if invalid == "focused":
        backend._frame = replace(backend._frame, focused=True)
    elif invalid == "modal":
        backend._frame = replace(backend._frame, modal="own-dialog", modal_kind="safe_application")
    elif invalid == "crop":
        backend._frame = replace(backend._frame, crop=(0, 0, 2, 2))
    elif invalid == "closed":
        backend._closed = True
    else:
        backend._release_failed = True
    assert await backend.focus_candidate_token() is None


@pytest.mark.asyncio
async def test_attached_focus_maps_capture_only_raster_to_private_native_anchor():
    backend = fake_backend()
    backend._focus_candidate_token = [{"token": "a" * 64, "rect": [100, 200, 2, 2]}]
    backend._focus_source_origin = [100, 200]
    backend._focus_candidate_token[0]["keyboard_focus"] = 77
    backend._device_identity = ["fake-identity"]
    requests = []

    async def worker(request):
        requests.append(request)
        return {"status": "executed", "released": True, "injected": True,
                "focus_confirmed": True, "focus_confirmed_binding": "a" * 64}

    backend._input_worker = worker
    token = await backend.focus_candidate_token()
    receipt = await backend.focus_acquire(
        {"type": "focus", "x": 1, "y": 1, "source_id": "opaque",
         "source_revision": 1, "consent_generation": 1,
         "expected": {"type": "visual_change"}}, expected_candidate=token,
    )
    assert receipt["focus_confirmed"]
    assert len(requests) == 1
    assert requests[0]["operation"] == "focus_only"
    assert requests[0]["expected_candidate"] == "a" * 64
    assert requests[0]["expected_keyboard_focus"] == 77
    assert requests[0]["action"] == {"type": "focus", "x": 101, "y": 201}
    assert backend._frame is None


@pytest.mark.asyncio
async def test_attached_focus_rejects_ambiguous_anchor_without_worker():
    backend = fake_backend()
    backend._focus_candidate_token = [
        {"token": "a" * 64, "rect": [0, 0, 2, 2]},
        {"token": "b" * 64, "rect": [0, 0, 2, 2]},
    ]
    for candidate in backend._focus_candidate_token:
        candidate["keyboard_focus"] = 77

    async def worker(request):
        raise AssertionError("no worker may be spawned")

    backend._input_worker = worker
    token = await backend.focus_candidate_token()
    receipt = await backend.focus_acquire(
        {"type": "focus", "x": 1, "y": 1, "source_id": "opaque",
         "source_revision": 1, "consent_generation": 1,
         "expected": {"type": "visual_change"}}, expected_candidate=token,
    )
    assert receipt["injected"] is False
