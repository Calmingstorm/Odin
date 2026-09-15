"""Authenticated fake wire and runtime seams only, never desktop qualification."""
# ruff: noqa: F811
import os
import time
from unittest.mock import AsyncMock

import pytest

from src.computer.models import ComputerError
from src.computer.runtime import hyprland_scope as hs
from src.computer.runtime.hyprland_backend import _binding
from tests.computer.test_hyprland_backend import action, backend, scope  # noqa: F401
from tests.test_computer_hyprland_scope_r32 import sample, server
from tests.test_hyprland_recovery_backend import runtime  # noqa: F401

PLUGIN = "b" * 48
MAIN = "w1-" + PLUGIN + "-" + "1" * 48
DIALOG = "w1-" + PLUGIN + "-" + "2" * 48


def group(epoch=1, members=None):
    return {"token": "a" * 48, "epoch": epoch, "member_tokens": members or [MAIN, DIALOG]}


def row_for(target=MAIN):
    row = sample()
    row.update(window_id=target, plugin_epoch=PLUGIN, application_group=group())
    row["focus"].update(token=target, modal=target == DIALOG)
    return row


@pytest.mark.parametrize("mutation", [
    lambda g: g.update(epoch=True), lambda g: g.update(epoch=0),
    lambda g: g.update(token="a" * 64), lambda g: g.update(member_tokens=[]),
    lambda g: g.update(member_tokens=[MAIN, MAIN]),
    lambda g: g.update(member_tokens=["untrusted"]),
    lambda g: g.update(extra=True),
])
def test_group_decoder_rejects_unbounded_or_ambiguous_identity(mutation):
    value = group()
    mutation(value)
    with pytest.raises(hs.HyprlandScopeFailure):
        hs.application_group(value, surface_token=MAIN)


async def test_explicit_refresh_and_exact_watchdog_snapshots(tmp_path):
    row, requests = row_for(), []

    def reply(request):
        requests.append(request)
        row["measured_monotonic_ns"] = time.monotonic_ns()
        return row

    listener, provider = await server(tmp_path, reply)
    async with listener:
        before = await provider.refresh_application_group({"mapping_id": "TEST-1"})
        assert requests[-1]["refresh_group"] is True
        row.update(window_id=DIALOG)
        row["focus"].update(token=DIALOG, modal=True, wm_class="different-class", title="dialog")
        after = await provider.snapshot({"mapping_id": "TEST-1"})
        assert "refresh_group" not in requests[-1]
        assert requests[-1]["group_token"] == group()["token"]
        assert before["application"] == after["application"]
        assert after["parent_tokens"] == []
        assert _binding(before) != _binding(after)
        proof = provider.export_application_group()
        await provider.close()
        replacement = hs.HyprlandScopeProvider(socket_path=provider.socket_path,
            expected_uid=os.getuid(), expected_compositor_pid=os.getpid())
        replacement.import_application_group(proof)
        row.update(window_id=MAIN, application_group=group(2, [MAIN]))
        row["focus"].update(token=MAIN, modal=False)
        resumed = await replacement.refresh_application_group({"mapping_id": "TEST-1"})
        assert resumed["surface_token"] == MAIN
        assert resumed["application_group"]["token"] == proof[0]["token"]
        await replacement.close()


@pytest.mark.parametrize("mutation", [
    lambda r: r["application_group"].update(epoch=2),
    lambda r: r["application_group"].update(token="c" * 48),
    lambda r: r["application_group"].update(member_tokens=[MAIN]),
    lambda r: r["output"].update(x=-101),
])
async def test_ordinary_snapshot_never_adopts_group_drift(tmp_path, mutation):
    row = row_for()

    def reply(_):
        row["measured_monotonic_ns"] = time.monotonic_ns()
        return row

    listener, provider = await server(tmp_path, reply)
    async with listener:
        await provider.refresh_application_group({"mapping_id": "TEST-1"})
        original = provider.export_application_group()
        mutation(row)
        with pytest.raises(hs.HyprlandScopeFailure):
            await provider.snapshot({"mapping_id": "TEST-1"})
        assert provider.export_application_group() == original


async def test_old_plugin_cannot_silently_supply_group_authority(tmp_path):
    listener, provider = await server(tmp_path, lambda _: sample())
    async with listener:
        with pytest.raises(hs.HyprlandScopeFailure, match="application_group_invalid"):
            await provider.refresh_application_group({"mapping_id": "TEST-1"})


@pytest.mark.parametrize("failure", ["release", "jobs", "guardian"])
async def test_observe_refresh_requires_clean_release_and_no_action_jobs(backend, failure):
    backend._application_group_proof = (group(), {"plugin_epoch": PLUGIN})
    backend._scope_provider.refresh_application_group = AsyncMock(return_value=scope())
    if failure == "release":
        backend._release_failed = True
    elif failure == "jobs":
        backend._jobs.add(object())
    else:
        backend._guardian.application_group_refresh_ready = False
    with pytest.raises(ComputerError, match="cleanup_unverified"):
        await backend._refresh_application_group()
    backend._scope_provider.refresh_application_group.assert_not_awaited()


def test_sanitized_group_identity_survives_membership_not_authority_changes(backend):
    backend._application_group_proof = (group(), {"plugin_epoch": PLUGIN, "pid": 10})
    original = backend.application_window_group
    backend._application_group_proof = (group(2, [MAIN]), {"plugin_epoch": PLUGIN, "pid": 10})
    assert backend.application_window_group == original
    assert original != group()["token"]
    backend._application_group_proof[1]["pid"] = 11
    assert backend.application_window_group != original


async def test_pause_resume_after_original_dialog_closed_uses_group_not_dead_window(runtime):
    backend, provider, guardian = runtime
    backend._application_group_proof = (group(), {"plugin_epoch": "e" * 48})
    backend._selected_binding["window_id"] = DIALOG
    resumed = scope(backend._output, surface_token=MAIN, plugin_epoch="e" * 48,
                    application_group=group(2, [MAIN]))
    provider.import_application_group = lambda proof: None
    provider.refresh_application_group = AsyncMock(side_effect=lambda _: {
        **resumed, "observed_monotonic_ns": time.monotonic_ns()})
    provider.export_application_group = lambda: (group(2, [MAIN]), {"plugin_epoch": "e" * 48})
    backend._action_scope = AsyncMock(side_effect=lambda _: ({
        **resumed, "observed_monotonic_ns": time.monotonic_ns()}, 1))
    assert (await backend.pause())["released"]
    assert (await backend.resume(consent_generation=2))["resumed"]
    provider.focus_bound_candidate.assert_not_awaited()
    assert backend._selected_binding["window_id"] == MAIN
    assert backend._frame is None
    assert backend.input_readiness == "observation_required"


async def test_group_resume_native_discontinuity_refuses_before_guardian_start(runtime):
    backend, provider, guardian = runtime
    backend._application_group_proof = (group(), {"plugin_epoch": PLUGIN})
    provider.import_application_group = lambda proof: None
    provider.refresh_application_group = AsyncMock(
        side_effect=hs.HyprlandScopeFailure("hyprland_application_group_identity_refused"))
    assert (await backend.pause())["released"]
    with pytest.raises(hs.HyprlandScopeFailure):
        await backend.resume(consent_generation=2)
    guardian.start.assert_not_awaited()
    assert backend._paused


@pytest.mark.parametrize("released", [True, False])
async def test_watchdog_exact_target_switch_distinguishes_terminal_release(backend, released):
    backend._application_group_proof = (group(), {"plugin_epoch": PLUGIN})
    backend._guardian.application_group_refresh_ready = False
    original = scope(surface_token=MAIN, application_group=group())

    async def snapshot(*args, **kwargs):
        backend._guardian.application_group_refresh_ready = released
        return (scope(surface_token=DIALOG, focus_digest="f" * 64, application_group=group()),
                time.monotonic_ns() + 100000000)

    backend._action_scope = snapshot
    await backend._watch_action(original, backend._generation, [time.monotonic_ns() + 100000000])
    assert backend._paused is (not released)
    assert backend._guardian.close_count == (0 if released else 1)


async def test_group_recovery_does_not_focus_a_stale_original_dialog(backend):
    backend._application_group_proof = (group(), {"plugin_epoch": PLUGIN})
    backend._scope_provider.focus_bound_candidate = AsyncMock()
    backend._scope_provider.refresh_application_group = AsyncMock(
        side_effect=hs.HyprlandScopeFailure("hyprland_application_group_member_refused"))
    assert not await backend.recover_focus("any", context=None)
    backend._scope_provider.focus_bound_candidate.assert_not_awaited()


async def test_prepare_wire_uses_fresh_exact_token_and_does_not_refresh_inventory(tmp_path):
    row, requests = row_for(), []

    def reply(request):
        requests.append(request)
        row["measured_monotonic_ns"] = time.monotonic_ns()
        if request["op"] == "prepare_group_target":
            row.update(window_id=DIALOG, target_changed=True)
            row["focus"].update(token=DIALOG, modal=True)
        return row

    listener, provider = await server(tmp_path, reply)
    async with listener:
        original = await provider.refresh_application_group({"mapping_id": "TEST-1"})
        prepared = await provider.prepare_group_target(
            {"mapping_id": "TEST-1"}, original, -50.5, 40.5)
        assert requests[-1] == {"op": "prepare_group_target", "group_token": group()["token"],
                               "group_epoch": 1, "target_token": original["native_scope_token"],
                               "x": -50.5, "y": 40.5}
        assert prepared["target_changed"] is True
        assert prepared["surface_token"] == DIALOG
        assert prepared["application_group"] == original["application_group"]


async def test_prepared_sibling_refuses_original_action_without_dispatch(backend):
    frame = await backend.observe()
    backend._application_group_proof = (group(), {"plugin_epoch": PLUGIN})
    backend._scope_provider.prepare_group_target = AsyncMock(return_value=scope(
        surface_token=DIALOG, target_changed=True))
    receipt = await backend.act(action(frame))
    assert receipt["reason"] == "hyprland_application_group_target_changed"
    assert receipt["status"] == "unavailable"
    assert receipt["injected"] is False and receipt["released"] is True
    assert backend._guardian.commands == []
    assert backend._frame is None
    assert not backend._paused
    # SourceMapping deliberately returns Fraction pixel centers. The real JSON
    # transport must receive finite primitive coordinates, not mocked Fractions.
    import json
    args = backend._scope_provider.prepare_group_target.await_args.args
    assert type(args[2]) is float and type(args[3]) is float
    json.dumps({"x": args[2], "y": args[3]})


async def test_native_preparation_refusal_keeps_static_reason_and_confirmed_no_input(backend):
    frame = await backend.observe()
    backend._application_group_proof = (group(), {"plugin_epoch": PLUGIN})
    backend._scope_provider.prepare_group_target = AsyncMock(side_effect=hs.HyprlandScopeFailure(
        "hyprland_application_group_target_layer_surface"))
    result = await backend.act(action(frame))
    assert result["reason"] == "hyprland_application_group_target_layer_surface"
    assert result["injected"] is False and result["released"] is True
    assert not backend._guardian.commands
