"""Additional production backend lifecycle decisions with synthetic portal peers."""

import asyncio
from unittest.mock import AsyncMock

import pytest

from src.computer.models import ComputerError
from src.computer.runtime import wayland_backend as m
from tests.test_computer_wayland_backend_r8 import SCOPE, action, png
from tests.test_computer_wayland_backend_r8 import adapter as adapter


@pytest.mark.parametrize(
    "kwargs",
    [
        dict(bus_address="ambient", expected_uid=1),
        dict(bus_address="unix:path=/x", expected_uid=True),
    ],
)
def test_r10_config_refuses(kwargs):
    with pytest.raises(ComputerError):
        m.WaylandSessionConfig(**kwargs)


@pytest.mark.parametrize("kwargs", [dict(environment="owned"), dict(enabled=1)])
def test_r10_backend_constructor_refuses(kwargs):
    with pytest.raises(ComputerError):
        m.WaylandRuntimeBackend(config=m.WaylandSessionConfig("unix:path=/x", 1), **kwargs)


def test_r10_png_dimensions_and_descriptor_refusals(adapter):
    with pytest.raises(ComputerError, match="dimensions_changed"):
        m._bounded_png(png(), 1, 1)
    with pytest.raises(ComputerError, match="identity_missing"):
        adapter._record_spawn(None)
    adapter.startup_descriptor("session1")
    with pytest.raises(ComputerError, match="identity_changed"):
        adapter.startup_descriptor("session2")
    adapter._descriptor["processes"] = [{}] * 2048
    with pytest.raises(ComputerError, match="process_limit"):
        adapter._record_spawn({"pid": 1})


@pytest.mark.parametrize(
    "fault,code",
    [
        ("invalid", "probe_evidence_invalid"),
        ("exception", "scope_or_probe_unavailable"),
        ("identity", "compositor_identity_changed"),
        ("guardian", "guardian_input_path_lost"),
    ],
)
async def test_r10_qualification_fail_closed(adapter, monkeypatch, fault, code):
    if fault == "invalid":
        adapter._qualify = AsyncMock(return_value={})
    if fault == "exception":
        adapter._qualify = AsyncMock(side_effect=ValueError("private detail"))
    if fault == "identity":
        monkeypatch.setattr(m, "revalidate_identity", AsyncMock(return_value=False))
    if fault == "guardian":
        original = adapter._qualify

        async def qualify(identity):
            adapter._guardian.alive = False
            return await original(identity)

        adapter._qualify = qualify
    result = await adapter.start("session1")
    assert result["capture_only"] and result["input_blocker"] == "wayland_" + code
    await adapter.stop()


async def test_r10_start_failure_and_disabled(adapter):
    adapter.enabled = False
    with pytest.raises(ComputerError, match="not_startable"):
        await adapter.start("session1")
    adapter.enabled = True
    adapter._open = AsyncMock(side_effect=OSError())
    with pytest.raises(m.InputAdmissionError):
        await adapter.start("session1")
    assert adapter._closed


async def test_r10_source_selection_and_export(adapter):
    with pytest.raises(ComputerError, match="revoked"):
        await adapter.observe()
    await adapter.start("session1")
    with pytest.raises(ComputerError, match="not_granted"):
        await adapter.select_source("absent")
    selected = adapter.sources()[0]["source_id"]
    assert (await adapter.select_source(selected))["selected_source"] == selected
    with pytest.raises(ComputerError, match="export_not_granted"):
        await adapter.export("x")
    with pytest.raises(ComputerError, match="renewed_session"):
        await adapter.resume(consent_generation=2)
    await adapter.stop()


@pytest.mark.parametrize(
    "fault,code", [("generation", "generation_changed"), ("source", "source_changed")]
)
async def test_r10_capture_metadata_refused(adapter, fault, code):
    await adapter.start("session1")
    original = adapter._portal.capture

    async def capture(node):
        result = await original(node)
        if fault == "generation":
            result["generation"] = 100
        else:
            result["source_metadata"]["mapping_id"] = "replaced"
        return result

    adapter._portal.capture = capture
    with pytest.raises(ComputerError, match=code):
        await adapter.observe()
    await adapter.stop()


@pytest.mark.parametrize(
    "kind,extra,error",
    [
        ("type", {"text": "\ud800"}, "unicode"),
        ("type", {"text": ""}, "unicode"),
        ("click", {"x": True, "y": 10}, "invalid_point"),
        ("polyline", {"points": [[10, 10]], "duration": 0}, "invalid_polyline"),
        (
            "polyline",
            {"points": [[10, 10], [11, 11]], "duration": float("nan")},
            "invalid_polyline",
        ),
    ],
)
async def test_r10_grounded_command_refusals(adapter, monkeypatch, kind, extra, error):
    await adapter.start("session1")
    frame = await adapter.observe()
    with pytest.raises(ComputerError, match=error):
        adapter._command(action(frame, kind, **extra), frame, SCOPE)
    await adapter.stop()


async def test_r10_commands_and_shape_validation(adapter, monkeypatch):
    await adapter.start("session1")
    adapter._guardian.ready = {"timed_polyline": True}
    frame = await adapter.observe()
    assert adapter._command(action(frame, "key", chord="ctrl+a"), frame, SCOPE) == "J ctrl+a"
    assert adapter._command(action(frame, "click", x=10, y=10), frame, SCOPE).startswith(
        "P 272 10."
    )
    assert (
        adapter._command(
            action(frame, "polyline", points=[[10, 10], [11, 11]], duration=0.1), frame, SCOPE
        )
        == "L 272 2 100 10.50000000 10.50000000 11.50000000 11.50000000"
    )
    for request, error in [
        (action(frame) | {"extra": 1}, "unsupported"),
        (action(frame) | {"expected": {}}, "invalid_arguments"),
        (action(frame) | {"expected": {"type": "dialog_appeared"}}, "postcondition"),
        (action(frame, "key", chord="invalid+key"), "unsupported_key"),
    ]:
        with pytest.raises(ComputerError, match=error):
            adapter._command(request, frame, SCOPE)
    await adapter.stop()


@pytest.mark.parametrize("ready", [{}, {"timed_polyline": False}])
async def test_timed_polyline_requires_native_readiness(adapter, ready):
    await adapter.start("session1")
    try:
        adapter._guardian.ready = ready
        frame = await adapter.observe()
        with pytest.raises(ComputerError, match="wayland_unsupported_grounded_action"):
            adapter._command(
                action(frame, "polyline", points=[[10, 10], [11, 11]], duration=0.1), frame, SCOPE
            )
        assert adapter._guardian.commands == []
    finally:
        await adapter.stop()


@pytest.mark.parametrize("fault", ["scope", "generation", "provider"])
async def test_r10_watchdog_revokes(adapter, fault):
    await adapter.start("session1")
    scope_provider = adapter._scope_provider
    if fault == "scope":
        scope_provider.scope = SCOPE | {"focus_digest": "changed"}
    if fault == "provider":
        adapter._scope_provider = None
    generation = adapter._generation + (fault == "generation")
    await asyncio.wait_for(
        adapter._watch_action({}, SCOPE, generation, [m.time.monotonic_ns() + m._SCOPE_LEASE_NS]), 1
    )
    assert adapter._paused and not adapter._guardian.alive
    adapter._scope_provider = scope_provider
    await adapter.stop()


@pytest.mark.parametrize("fault", ["identity", "extent", "receipt"])
async def test_r10_dispatch_revocations(adapter, monkeypatch, fault):
    await adapter.start("session1")
    frame = await adapter.observe()
    if fault == "identity":
        monkeypatch.setattr(m, "revalidate_identity", AsyncMock(return_value=False))
    if fault == "extent":
        adapter._guardian.select = AsyncMock(return_value={"width": 1, "height": 1})
    if fault == "receipt":
        adapter._guardian.act = AsyncMock(return_value={"event": "closed"})
    with pytest.raises(ComputerError):
        await adapter.act(action(frame))
    assert not adapter._jobs
    await adapter.stop()


async def test_r10_observation_extent_and_job_cleanup(adapter):
    await adapter.start("session1")
    adapter._guardian.select = AsyncMock(return_value={"width": 1, "height": 1})
    assert not (await adapter.observe()).focused
    job = asyncio.create_task(asyncio.sleep(30))
    adapter._jobs.add(job)
    await adapter.stop()
    assert job.cancelled()
