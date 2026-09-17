"""Focus/scope contracts with in-memory transports, never live desktop input."""

import asyncio
import copy
import time
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.computer.models import ComputerError
from src.computer.runtime import hyprland_backend as hb
from src.computer.runtime.hyprland_scope import HyprlandScopeFailure
from tests.computer.test_hyprland_backend import config, output, scope


@pytest.fixture
def focus_runtime(monkeypatch):
    backend = hb.HyprlandRuntimeBackend(config=config(), enabled=True)
    backend._started = backend.input_supported = True
    backend._identity = SimpleNamespace(digest="f" * 64)
    backend._output = backend._output_pin = output()
    backend._application_pin = scope()["application"]
    backend._scope = scope()
    backend._frame, backend._captured_at = object(), time.monotonic()
    backend._fingerprint = "old-observation"
    backend._selected_binding = {
        "instance_id": "fixture-instance", "window_id": "fixture-window",
        "plugin_epoch": "e" * 48, "output_name": "DP-1",
        "output": {"x": -800, "y": 20, "width": 80, "height": 60,
                   "pixel_width": 8, "pixel_height": 6, "scale": 0.1, "transform": 0},
        "identity": {"pid": 1234, "uid": 1000, "start_ticks": 100,
                     "executable": "/usr/bin/test", "exe_device": 1, "exe_inode": 2},
    }
    backend._scope_provider = SimpleNamespace(
        snapshot=AsyncMock(side_effect=lambda _: scope()),
        focus_bound_candidate=AsyncMock(return_value=copy.deepcopy(backend._selected_binding)),
        refresh_application_group=AsyncMock(side_effect=lambda _: scope()),
        export_application_group=Mock(return_value=({"token": "fixture-group"}, {})),
    )
    backend._guardian = SimpleNamespace(
        alive=True, application_group_refresh_ready=True, bind_scope=AsyncMock())
    monkeypatch.setattr(hb, "revalidate", AsyncMock())
    return backend


def assert_invalidated(backend):
    assert backend._frame is None
    assert backend._captured_at == 0.0
    assert backend._fingerprint is None
    assert backend.input_readiness == "observation_required"


async def test_exact_selection_recovers_with_real_scope_validation(focus_runtime):
    backend = focus_runtime
    original = copy.deepcopy(backend._selected_binding)
    assert await backend.recover_focus(backend.application_provenance, context=None)
    backend._scope_provider.focus_bound_candidate.assert_awaited_once_with(original)
    passed = backend._scope_provider.focus_bound_candidate.call_args.args[0]
    assert passed is not backend._selected_binding
    assert passed["identity"] is not backend._selected_binding["identity"]
    backend._guardian.bind_scope.assert_awaited_once_with(backend._scope)
    assert backend._scope["application"] == backend._application_pin
    assert hb.revalidate.await_count == 2
    assert backend._selected_binding == original
    assert_invalidated(backend)


@pytest.mark.parametrize("missing", ["_selected_binding", "_output"])
async def test_unavailable_selection_never_attempts_focus(focus_runtime, missing):
    backend = focus_runtime
    setattr(backend, missing, None)
    assert not await backend.recover_focus(backend.application_provenance, context=None)
    backend._scope_provider.focus_bound_candidate.assert_not_awaited()
    assert_invalidated(backend)


@pytest.mark.parametrize("key,value", [
    ("output_name", None), ("output_name", "DP-2"),
    ("output", []), ("identity", None),
])
async def test_malformed_selection_is_not_focus_authority(focus_runtime, key, value):
    backend = focus_runtime
    backend._selected_binding[key] = value
    assert not await backend.recover_focus(backend.application_provenance, context=None)
    backend._scope_provider.focus_bound_candidate.assert_not_awaited()
    hb.revalidate.assert_not_awaited()
    assert_invalidated(backend)


@pytest.mark.parametrize("change", ["output", "identity", "invalid_output"])
async def test_selection_must_still_match_original_grant(focus_runtime, change):
    backend = focus_runtime
    if change == "output":
        backend._selected_binding["output"]["x"] += 1
    elif change == "identity":
        backend._selected_binding["identity"]["exe_inode"] += 1
    else:
        backend._selected_binding["output"].pop("width")
    assert not await backend.recover_focus(backend.application_provenance, context=None)
    backend._scope_provider.focus_bound_candidate.assert_not_awaited()
    assert_invalidated(backend)


@pytest.mark.parametrize("key,value", [
    ("output_name", "DP-2"), ("instance_id", "replacement"),
    ("output", {}), ("identity", {}),
])
async def test_focus_reply_cannot_broaden_selection(focus_runtime, key, value):
    backend = focus_runtime
    backend._scope_provider.focus_bound_candidate.return_value[key] = value
    assert not await backend.recover_focus(backend.application_provenance, context=None)
    backend._scope_provider.snapshot.assert_not_awaited()
    backend._guardian.bind_scope.assert_not_awaited()
    assert_invalidated(backend)


async def test_expected_provenance_mismatch_refuses_guardian_binding(focus_runtime):
    backend = focus_runtime
    old_scope = backend._scope
    assert not await backend.recover_focus("wrong-application", context=None)
    backend._scope_provider.snapshot.assert_awaited_once()
    backend._guardian.bind_scope.assert_not_awaited()
    assert backend._scope is old_scope
    assert_invalidated(backend)


@pytest.mark.parametrize("phase", ["prevalidate", "focus", "scope", "bind", "postvalidate"])
@pytest.mark.parametrize("error_type", [ComputerError, HyprlandScopeFailure])
async def test_recovery_failure_leaves_no_old_pixels(focus_runtime, phase, error_type):
    backend = focus_runtime
    failure = error_type("fixture-refusal")
    if phase == "prevalidate":
        hb.revalidate.side_effect = failure
    elif phase == "postvalidate":
        hb.revalidate.side_effect = [None, failure]
    elif phase == "focus":
        backend._scope_provider.focus_bound_candidate.side_effect = failure
    elif phase == "scope":
        backend._scope_provider.snapshot.side_effect = failure
    else:
        backend._guardian.bind_scope.side_effect = failure
    assert not await backend.recover_focus(backend.application_provenance, context=None)
    if phase in {"prevalidate", "focus", "scope"}:
        backend._guardian.bind_scope.assert_not_awaited()
    assert_invalidated(backend)


@pytest.mark.parametrize("expected_matches", [True, False])
async def test_group_recovery_validates_survivor_without_refocusing(
    focus_runtime, expected_matches,
):
    backend = focus_runtime
    backend._application_group_proof = ({"token": "old-group"}, {})
    expected = backend.application_provenance if expected_matches else "wrong-application"
    old_scope = backend._scope
    assert await backend.recover_focus(expected, context=None) is expected_matches
    backend._scope_provider.refresh_application_group.assert_awaited_once_with(backend._metadata())
    backend._scope_provider.export_application_group.assert_called_once()
    assert backend._application_group_proof == ({"token": "fixture-group"}, {})
    backend._scope_provider.snapshot.assert_awaited_once()
    backend._scope_provider.focus_bound_candidate.assert_not_awaited()
    backend._guardian.bind_scope.assert_not_awaited()
    hb.revalidate.assert_not_awaited()
    assert (backend._scope is old_scope) is (not expected_matches)
    assert_invalidated(backend)


@pytest.mark.parametrize("phase", ["refresh", "scope", "validation"])
async def test_group_recovery_refusals_do_not_fall_back_to_old_window(focus_runtime, phase):
    backend = focus_runtime
    backend._application_group_proof = ({"token": "old-group"}, {})
    if phase == "refresh":
        backend._scope_provider.refresh_application_group.side_effect = HyprlandScopeFailure(
            "refused")
    elif phase == "scope":
        backend._scope_provider.snapshot.side_effect = ComputerError("refused")
    else:
        backend._scope_provider.snapshot.side_effect = lambda _: scope(safe_focus=False)
    assert not await backend.recover_focus(backend.application_provenance, context=None)
    backend._scope_provider.focus_bound_candidate.assert_not_awaited()
    assert_invalidated(backend)


async def test_cancellation_while_waiting_for_lock_invalidates_before_yield(focus_runtime):
    backend = focus_runtime
    await backend._lock.acquire()
    task = asyncio.create_task(backend.recover_focus(backend.application_provenance, context=None))
    try:
        await asyncio.sleep(0)
        assert_invalidated(backend)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        backend._scope_provider.focus_bound_candidate.assert_not_awaited()
    finally:
        backend._lock.release()


async def test_revocation_still_invalidates_before_active_check(focus_runtime):
    backend = focus_runtime
    backend._scope_provider = None
    with pytest.raises(ComputerError, match="hyprland_session_revoked"):
        await backend.recover_focus(backend.application_provenance, context=None)
    assert_invalidated(backend)


@pytest.mark.parametrize("measured", [None, True, -1, 10**30])
async def test_action_scope_rejects_unmeasured_or_out_of_interval_snapshot(focus_runtime, measured):
    backend = focus_runtime
    backend._scope_provider.snapshot.side_effect = lambda _: scope(observed_monotonic_ns=measured)
    with pytest.raises(ComputerError, match="wayland_scope_evidence_stale"):
        await backend._action_scope(backend._metadata())
    await asyncio.sleep(0)
    assert not backend._scope_jobs


async def test_expired_deadline_does_not_start_snapshot(focus_runtime):
    backend = focus_runtime
    with pytest.raises(ComputerError, match="wayland_scope_evidence_expired"):
        await backend._action_scope({}, deadline_ns=0)
    backend._scope_provider.snapshot.assert_not_awaited()
    assert not backend._scope_jobs


async def test_scope_requires_provider(focus_runtime):
    focus_runtime._scope_provider = None
    with pytest.raises(ComputerError, match="wayland_session_revoked"):
        await focus_runtime._action_scope({})


async def test_scope_timeout_cancels_owned_snapshot(focus_runtime):
    backend = focus_runtime
    cancelled = asyncio.Event()

    async def snapshot(_):
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    backend._scope_provider.snapshot.side_effect = snapshot
    with pytest.raises(ComputerError, match="wayland_scope_evidence_expired"):
        await backend._action_scope({}, deadline_ns=time.monotonic_ns() + 20_000_000)
    await asyncio.wait_for(cancelled.wait(), timeout=1)
    await asyncio.sleep(0)
    assert not backend._scope_jobs


@pytest.mark.parametrize("field,value", [
    ("locked", True), ("authenticated", False), ("native_wayland", False),
    ("safe_focus", False), ("observed_monotonic_ns", True),
    ("observed_monotonic_ns", 0), ("native_scope_serial", True),
    ("native_scope_serial", 0), ("native_scope_token", ""),
])
def test_scope_flags_are_not_input_authority(focus_runtime, field, value):
    with pytest.raises(ComputerError, match="hyprland_scope_unknown_locked_or_stale"):
        focus_runtime._check_scope(scope(**{field: value}))


@pytest.mark.parametrize("field,value", [
    ("pid", True), ("pid", 1), ("start_ticks", 0), ("uid", 1001),
    ("exe", "relative"), ("exe", None), ("exe_identity", (1, 2)),
    ("exe_identity", [1]), ("exe_identity", [-1, 2]), ("exe_identity", [True, 2]),
])
def test_scope_application_identity_requires_exact_typed_pin(focus_runtime, field, value):
    candidate = scope()
    candidate["application"][field] = value
    with pytest.raises(ComputerError, match="hyprland_application_identity_unavailable"):
        focus_runtime._check_scope(candidate)


def test_scope_first_pin_is_deep_copied_and_cannot_drift(focus_runtime):
    backend = focus_runtime
    backend._application_pin = backend._output_pin = None
    candidate = scope()
    backend._check_scope(candidate)
    candidate["application"]["exe_identity"][1] += 1
    assert backend._application_pin["exe_identity"] == [1, 2]
    with pytest.raises(ComputerError, match="hyprland_original_application_changed"):
        backend._check_scope(candidate)


@pytest.mark.parametrize("change,reason", [
    ("missing", "hyprland_native_output_unavailable"),
    ("malformed", "hyprland_native_output_unavailable"),
    ("name", "hyprland_explicit_output_changed"),
    ("geometry", "hyprland_explicit_output_changed"),
    ("pin", "hyprland_explicit_output_changed"),
])
def test_scope_output_cannot_change_or_escape_original_pin(focus_runtime, change, reason):
    backend = focus_runtime
    candidate = scope()
    if change == "missing":
        candidate.pop("output")
    elif change == "malformed":
        candidate["output"] = None
    elif change == "name":
        candidate["output"]["name"] = "DP-2"
    elif change == "geometry":
        candidate["output"]["logical_x"] += 1
    else:
        backend._output_pin = replace(backend._output, logical_x=0)
    with pytest.raises(ComputerError, match=reason):
        backend._check_scope(candidate)
