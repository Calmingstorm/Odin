"""Isolated backend contracts, never desktop input or native qualification."""

import asyncio
import io
import time
from dataclasses import asdict, replace
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from PIL import Image

from src.computer.admission import CompositorIdentity, InputAdmission
from src.computer.models import ComputerError
from src.computer.runtime import hyprland_backend as hb
from src.computer.runtime.hyprland_capture import ExplicitOutput, NativeFrame
from src.computer.runtime.hyprland_identity import ExecutableTrust


def config(**kwargs):
    values = dict(expected_uid=1000, runtime_dir="/run/user/1000", wayland_display="wayland-1",
                  instance_signature="instance", output_name="DP-1", compositor_pid=4242,
                  compositor_trust=ExecutableTrust("/usr/bin/Hyprland", "a" * 64,
                                                  "0.55.2", "b" * 40))
    return hb.HyprlandSessionConfig(**(values | kwargs))


def output(transform=0):
    return ExplicitOutput("DP-1", 8, 6, transform, -800, 20, 80, 60)


def scope(out=None, **overrides):
    out = out or output()
    return dict(source_digest="a" * 64, focus_digest="b" * 64, bounds_digest="c" * 64,
                application={"kind": "test"}, compositor={"name": "Hyprland"}, modal=False,
                bounds={"x": 0, "y": 0, "width": out.logical_width,
                        "height": out.logical_height},
                output=asdict(out), locked=False, authenticated=True, native_wayland=True,
                safe_focus=True, observed_monotonic_ns=time.monotonic_ns(),
                native_scope_serial=1, native_scope_token="d" * 64) | overrides


def native(out=None, shade=0):
    out = out or output()
    return NativeFrame(out, bytes([shade, shade, shade, 0]) * out.width * out.height, None)


class Guardian:
    alive = True
    ready = {"timed_polyline": True, "bounded_clicks": True, "pointer_modifiers_v1": True,
             "pixel_fields_v1": True}

    def __init__(self):
        self.commands = []
        self.bound = []
        self.close_count = 0
        self.release_ack = True
        self.delay = 0

    async def select(self, mapping):
        return {"width": 80, "height": 60}

    async def bind_scope(self, value):
        self.bound.append(value)

    async def refresh_scope(self, deadline):
        assert deadline > time.monotonic_ns()

    async def act(self, command, **kwargs):
        assert kwargs["scope_deadline_ns"] > time.monotonic_ns()
        self.commands.append(command)
        await asyncio.sleep(self.delay)
        return {"event": "action_done", "release_ack": self.release_ack}

    async def close(self):
        self.close_count += 1
        self.alive = False
        return {"release_ack": self.release_ack, "process_reaped": True}


@pytest.fixture
def backend(monkeypatch):
    backend = hb.HyprlandRuntimeBackend(config=config(), enabled=True)
    backend._started = True
    backend._identity = SimpleNamespace(digest="f" * 64)
    backend._output = output()
    backend._guardian = Guardian()
    backend._scope_provider = SimpleNamespace(
        snapshot=AsyncMock(side_effect=lambda _: scope()), close=AsyncMock())
    backend.input_supported = True
    backend.input_admission = InputAdmission(
        "eligible", "hyprland_best_effort_ready", "Fixture only", "No desktop testing",
        CompositorIdentity("Hyprland", "0.55.2", "native", "a" * 64),
        "active_session", ("fixture_transport",))
    monkeypatch.setattr(hb, "revalidate", AsyncMock())

    async def capture(crop=None):
        rendered = hb._render_native(native(backend._output), crop)
        return rendered, scope(backend._output), time.monotonic()

    monkeypatch.setattr(backend, "_capture", capture)
    return backend


def action(frame, **kwargs):
    return dict(type="click", x=2, y=2, source_id=frame.source.source_id,
                source_revision=frame.source.source_revision,
                consent_generation=frame.source.consent_generation,
                expected={"type": "visual_change"}) | kwargs


@pytest.mark.parametrize("bad", [dict(expected_uid=True), dict(compositor_pid=1),
                                 dict(wayland_display="../wayland-1"),
                                 dict(runtime_dir="relative"), dict(scope_socket="/tmp/../s")])
def test_explicit_configuration_refuses(bad):
    with pytest.raises(ComputerError):
        config(**bad)


async def test_default_disabled():
    backend = hb.HyprlandRuntimeBackend(config=config())
    with pytest.raises(ComputerError, match="not_startable"):
        await backend.start("a" * 32)


def test_descriptor_does_not_claim_process_absence_proves_release():
    backend = hb.HyprlandRuntimeBackend(config=config())
    descriptor = backend.startup_descriptor("a" * 32)
    assert descriptor["no_persistent_devices"] is False
    assert descriptor["input_was_enabled"] is True
    assert descriptor["launch_pending"] is True
    assert backend._descriptor == descriptor


@pytest.mark.parametrize("transform", range(8))
def test_native_orientation_matches_explicit_pixel_centers(transform):
    out = output(transform)
    pixels = b"".join(bytes([0, 0, n, 0]) for n in range(out.width * out.height))
    rendered = hb._render_native(NativeFrame(out, pixels, None), None)
    with Image.open(io.BytesIO(rendered.png)) as image:
        assert image.size == out.oriented_size
        for y in range(out.height):
            for x in range(out.width):
                lx, ly = out.native_to_local(x, y)
                ox = int(lx * image.width / out.logical_width)
                oy = int(ly * image.height / out.logical_height)
                assert image.getpixel((ox, oy))[0] == y * out.width + x


def test_render_rejects_bad_raster_and_crop():
    with pytest.raises(ComputerError, match="raster_invalid"):
        hb._render_native(replace(native(), pixels=b""), None)
    with pytest.raises(ComputerError):
        hb._render_native(native(), {"x": 7, "y": 0, "width": 2, "height": 2})


async def test_observation_crop_source_local_input_and_command(backend):
    frame = await backend.observe({"x": 2, "y": 1, "width": 4, "height": 3})
    point = frame.source.input_point(frame.delivered_to_source, 0, 0, frame.width, frame.height)
    assert point == (25, 15)  # no global output offset is added
    command = backend._command(action(frame, x=0, y=0), frame, backend._scope)
    assert command == "P 272 25.00000000 15.00000000"
    assert frame.scope.input_sources == frozenset({backend._selected})


async def test_observation_tokens_do_not_increment_revision_but_aba_serial_does(backend):
    first = await backend.observe()
    again = await backend.observe()
    assert first.source.source_revision == again.source.source_revision
    previous = backend._capture

    async def changed(crop=None):
        rendered, value, captured = await previous(crop)
        value["native_scope_serial"] += 2
        return rendered, value, captured

    backend._capture = changed
    changed_frame = await backend.observe()
    assert changed_frame.source.source_revision > again.source.source_revision
    one = scope()
    assert hb._binding(one) == hb._binding(one | {"native_scope_token": "other"})


async def test_action_executes_after_guard_and_retires_observation(backend):
    frame = await backend.observe()
    result = await backend.act(action(frame))
    assert result["released"] is True
    assert result["receiver_release_verified"] is False
    assert result["postcondition"]["status"] == "observed"
    assert backend._guardian.commands == ["P 272 25.00000000 25.00000000"]
    assert backend._guardian.bound
    assert backend._frame is None
    with pytest.raises(ComputerError, match="fresh_application"):
        await backend.act(action(frame))


@pytest.mark.parametrize("locked", [None, True, "false"])
async def test_locked_or_unknown_prevents_dispatch(backend, locked):
    frame = await backend.observe()
    backend._scope_provider.snapshot.side_effect = lambda _: scope(locked=locked)
    with pytest.raises(ComputerError, match="unknown_locked_or_stale"):
        await backend.act(action(frame))
    assert not backend._guardian.commands


async def test_scope_deadline_is_bounded(backend):
    async def slow(_):
        await asyncio.sleep(1)
        return scope()

    backend._scope_provider.snapshot.side_effect = slow
    started = time.monotonic()
    with pytest.raises(ComputerError, match="scope_evidence_expired"):
        await backend._action_scope(backend._metadata())
    assert time.monotonic() - started < 0.5
    await asyncio.sleep(0)


async def test_missing_release_ack_is_unknown_and_pauses(backend):
    frame = await backend.observe()
    backend._guardian.release_ack = False
    with pytest.raises(ComputerError, match="outcome_unknown"):
        await backend.act(action(frame))
    assert backend._paused and backend._release_failed
    assert backend._guardian.close_count > 0


async def test_graceful_stop_ack_is_not_receiver_proof(backend):
    await backend.observe()
    result = await backend.stop()
    assert result["stopped"] and result["hyprland_owned_connections_closed"]
    assert result["receiver_release_verified"] is False
    assert result["applications_preserved"] is True
    assert backend._frame is None
    assert backend._scope_provider.close.await_count == 1


async def test_recovery_remains_paused_and_requires_ack(backend, monkeypatch):
    backend._guardian.release_ack = False
    provider = SimpleNamespace(release_all=AsyncMock(return_value={"release_ack": True}),
                               close=AsyncMock())
    monkeypatch.setattr(backend, "_new_provider", lambda: provider)
    result = await backend.recover_owned_input()
    assert result["released"] and not result["receiver_release_verified"]
    assert backend._paused and not backend.input_supported
    assert not backend._release_failed


async def test_cancel_during_action_releases_and_retires(backend):
    frame = await backend.observe()
    backend._guardian.delay = 10
    task = asyncio.create_task(backend.act(action(frame)))
    while not backend._guardian.commands:
        await asyncio.sleep(0)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert backend._guardian.close_count > 0
    assert backend._paused and backend._frame is None


async def test_recovery_then_resume_does_not_reuse_dead_guardian(backend, monkeypatch):
    backend._guardian.release_ack = False
    provider = SimpleNamespace(release_all=AsyncMock(return_value={"release_ack": True}),
                               close=AsyncMock())
    monkeypatch.setattr(backend, "_new_provider", lambda: provider)
    await backend.recover_owned_input()
    assert backend._guardian is None
    monkeypatch.setattr(backend, "_open", AsyncMock())
    result = await backend.resume(consent_generation=2)
    assert result["resumed"] is True
    assert backend._generation == 2


async def test_real_capture_path_uses_fenced_native_raster_and_durable_spawn(backend, monkeypatch):
    backend.startup_descriptor("b" * 32)
    connection = SimpleNamespace(close=lambda: None)
    monkeypatch.setattr(hb, "connect_peer", AsyncMock(return_value=connection))
    monkeypatch.setattr(hb, "trusted_binary", lambda path: None)
    calls = []

    async def capture(**kwargs):
        calls.append(kwargs)
        kwargs["on_spawn"]({"pid": 12345, "start_ticks": 1})
        before = await kwargs["scope"]()
        after = await kwargs["scope"]()
        assert before.binding() == after.binding()
        return NativeFrame(backend._output, native().pixels, after)

    monkeypatch.setattr(hb, "capture_explicit_output", capture)
    result, evidence, captured_at = await hb.HyprlandRuntimeBackend._capture(backend)
    assert result.metadata.width == 8 and evidence["locked"] is False
    assert time.monotonic() - captured_at < 1
    assert calls[0]["wayland"] is connection
    assert calls[0]["output"].name == "DP-1"
    assert backend._descriptor["processes"] == [{"pid": 12345, "start_ticks": 1}]


async def test_capture_render_aba_refused(backend, monkeypatch):
    monkeypatch.setattr(hb, "connect_peer", AsyncMock(return_value=object()))
    monkeypatch.setattr(hb, "trusted_binary", lambda path: None)

    async def capture(**kwargs):
        proof = await kwargs["scope"]()
        backend._scope_provider.snapshot.side_effect = lambda _: scope(native_scope_serial=3)
        return NativeFrame(backend._output, native().pixels, proof)

    monkeypatch.setattr(hb, "capture_explicit_output", capture)
    with pytest.raises(ComputerError, match="capture_scope_changed"):
        await hb.HyprlandRuntimeBackend._capture(backend)


async def test_watchdog_scope_change_closes_native_path(backend):
    original = scope()
    backend._scope_provider.snapshot.side_effect = lambda _: scope(native_scope_serial=3)
    await backend._watch_action(original, backend._generation,
                                [time.monotonic_ns() + 250_000_000])
    assert backend._paused
    assert backend._guardian.close_count == 1


async def test_late_native_noop_not_reported_injected(backend):
    frame = await backend.observe()
    backend._guardian.act = AsyncMock(return_value={
        "event": "action_done", "release_ack": True, "input_was_sent": False})
    result = await backend.act(action(frame))
    assert result["injected"] is False
    assert result["status"] == "unavailable"


async def test_start_observe_act_pause_resume_detach_contract(monkeypatch):
    """Real backend methods, synthetic native seam. Not native qualification."""
    from src.computer.policy import input_eligible
    from src.computer.runtime import hyprland_guardian

    events = []

    class FakeGuardian(Guardian):
        def __init__(self, binary, uid, on_spawn):
            super().__init__()
            self.on_spawn = on_spawn

        async def start(self, path, mapping, scope_path, pid, width, height):
            events.append((path, mapping, scope_path, pid, width, height))
            self.on_spawn({"pid": 1234, "start_ticks": 56})
            return {"width": width, "height": height}

    backend = hb.HyprlandRuntimeBackend(config=config(), enabled=True)

    def provider():
        return SimpleNamespace(snapshot=AsyncMock(side_effect=lambda _: scope()), close=AsyncMock())

    monkeypatch.setattr(backend, "_new_provider", provider)
    monkeypatch.setattr(hyprland_guardian, "HyprlandGuardian", FakeGuardian)
    monkeypatch.setattr(hb, "trusted_binary", lambda path: None)
    monkeypatch.setattr(hb, "revalidate", AsyncMock())
    connection = SimpleNamespace(close=lambda: None)
    identity = SimpleNamespace(digest="f" * 64)
    monkeypatch.setattr(hb, "pin_connections", AsyncMock(return_value=(identity, connection)))
    monkeypatch.setattr(hb, "connect_peer", AsyncMock(return_value=connection))

    async def capture(**kwargs):
        before, after = await kwargs["scope"](), await kwargs["scope"]()
        assert before.binding() == after.binding()
        return NativeFrame(backend._output, native().pixels, after)

    monkeypatch.setattr(hb, "capture_explicit_output", capture)
    descriptor_updates = []
    backend.runtime_identity_callback = descriptor_updates.append
    started = await backend.start("c" * 32)
    assert started["input_supported"] is True
    assert started["input_admission"]["probe_scope"] == "active_session"
    assert started["capabilities"]["owned_input_release"] == "hyprland_best_effort"
    input_eligible(backend.capabilities)  # raises on refusal, returns None on eligibility
    assert events[0][-2:] == (80, 60)
    assert descriptor_updates[-1]["launch_pending"] is False
    assert descriptor_updates[-1]["no_persistent_devices"] is False
    frame = await backend.observe()
    result = await backend.act(action(frame))
    assert result["status"] == "executed" and result["released"] is True
    assert (await backend.pause())["released"] is True
    assert (await backend.resume(consent_generation=2))["resumed"] is True
    resumed = await backend.observe()
    assert resumed.source.consent_generation == 2
    stopped = await backend.detach()
    assert stopped["owned_devices"] == "hyprland_owned_connections_closed"
    assert stopped["hyprland_owned_connections_closed"] is True
    assert stopped["receiver_release_verified"] is False


async def test_pause_cancels_and_reaps_owned_capture_before_ack(backend, monkeypatch):
    started, reaped = asyncio.Event(), asyncio.Event()
    monkeypatch.setattr(hb, "connect_peer", AsyncMock(return_value=object()))
    monkeypatch.setattr(hb, "trusted_binary", lambda path: None)

    async def capture(**kwargs):
        started.set()
        try:
            await asyncio.sleep(10)
        finally:
            reaped.set()

    monkeypatch.setattr(hb, "capture_explicit_output", capture)
    task = asyncio.create_task(hb.HyprlandRuntimeBackend._capture(backend))
    await started.wait()
    receipt = await backend.pause()
    assert reaped.is_set()
    assert receipt["released"] is True
    with pytest.raises(asyncio.CancelledError):
        await task


async def test_untrusted_capture_helper_is_rejected_before_socket_open(backend, monkeypatch):
    def untrusted(path):
        raise ComputerError("wayland_guardian_path_untrusted")

    connect = AsyncMock()
    monkeypatch.setattr(hb, "connect_peer", connect)
    monkeypatch.setattr(hb, "trusted_binary", untrusted)
    with pytest.raises(ComputerError, match="path_untrusted"):
        await hb.HyprlandRuntimeBackend._capture(backend)
    connect.assert_not_awaited()
