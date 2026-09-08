"""Shared-X11 failure claims via inert transports only: no X server or signals."""

import asyncio
import json
from unittest.mock import AsyncMock, Mock

import pytest

from src.computer.models import BackendCapabilities
from src.computer.runtime import recovery
from src.computer.runtime.x11_attached import AttachedFailure, X11AttachedBackend
from src.tools.defs.computer import _DEFINITIONS


@pytest.fixture(autouse=True)
def no_native_processes(monkeypatch):
    monkeypatch.setattr(
        asyncio,
        "create_subprocess_exec",
        AsyncMock(side_effect=AssertionError("native process forbidden")),
    )


def backend():
    value = X11AttachedBackend(
        enabled=True, display_name=":991", monitor_names=["fixture"], input_enabled=True
    )
    value._device_identity = [1, 2]
    value._shared_cleanup_identity = [1, 2]
    return value


def transport(reply, exit_code):
    child = Mock()
    child.returncode = exit_code
    child.stdin.drain = AsyncMock()
    child.stdout.readline = AsyncMock(return_value=reply)
    child.wait = AsyncMock(return_value=exit_code)
    return child


@pytest.mark.parametrize(
    "reply,exit_code",
    [
        (b"", -9),  # Stub EOF after abrupt guardian loss, never a real signal.
        (b"not-json", 0),
        (b'{"released": true}', -9),  # Exit failure must not bless a partial receipt.
    ],
)
async def test_missing_guardian_ack_never_becomes_clean(monkeypatch, reply, exit_code):
    value = backend()
    child = transport(reply, exit_code)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", AsyncMock(return_value=child))

    with pytest.raises(AttachedFailure, match="input_outcome_unknown"):
        await value._input_worker({"action": {"type": "click"}})

    assert value._release_failed
    assert not value._guardians and not value._jobs
    # An unchanged hierarchy and complete process settlement cannot replace the
    # dead guardian's ledger/acknowledgment, even on repeated cleanup attempts.
    for _ in range(2):
        receipt = await value.detach()
        assert receipt["released"] is False
        assert receipt["stopped"] is False
        assert receipt["state"] == "quarantined"
        assert receipt["recovery"] == "owned_x11_cleanup_unverified"
        assert receipt["input_revoked"] and receipt["capture_revoked"]
    child.kill.assert_not_called()
    child.terminate.assert_not_called()


@pytest.mark.parametrize("released", [True, False])
async def test_acknowledged_shared_release_retains_clean_detach_semantics(monkeypatch, released):
    value = backend()
    payload = {
        "released": released,
        "status": "executed" if released else "unknown",
        "device_identity": [1, 2],
        "persistent_input_devices": False,
        "owned_devices": "not_created",
    }
    child = transport(json.dumps(payload).encode(), 0)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", AsyncMock(return_value=child))
    assert await value._input_worker({"action": {"type": "click"}}) == payload
    receipt = await value.detach()
    assert receipt["released"] is released and receipt["stopped"] is released
    assert receipt["state"] == ("closed" if released else "quarantined")
    # This measures dispatch settlement only; it is deliberately distinct from
    # released=False in the failed-release case. Do not weaken the classifier.
    assert receipt["no_inflight_input"] is True
    assert receipt["cleanup_checks"]["no_inflight_input"] == "measured_owned_worker_fence"
    assert receipt["no_active_grabs"] is None
    assert receipt["applications_preserved"] is True


async def test_process_absence_without_ledger_does_not_prove_shared_release(monkeypatch):
    value = backend()
    monkeypatch.setattr(recovery, "boot_id", lambda: "0" * 36)
    monkeypatch.setattr(recovery, "_processes_gone", lambda descriptor: None)
    descriptor = value.startup_descriptor("shared-loss")
    descriptor["no_persistent_devices"] = True
    assert await recovery.verify_absence(descriptor) == {
        "status": "unknown",
        "reason": "owned_input_release_unproven",
    }


def test_public_tool_and_runtime_limits_qualify_shared_guardian_loss():
    tools = {tool["name"]: tool["description"] for tool in _DEFINITIONS}
    for name in ("computer_session", "computer_act"):
        assert "sole-guardian death" in tools[name]
        assert "no proven universal server-side release guarantee" in tools[name]
    limits = backend().input_limits
    assert limits["shared_x11_release"] == "surviving_guardian_acknowledgment_required"
    assert limits["shared_x11_abrupt_guardian_death"] == "sole_ledger_lost_server_release_unproven"


def test_verified_shared_capability_is_qualified_without_changing_admission():
    caps = BackendCapabilities(
        "x11", "existing_session", "shared", "shared", "verified", "verified"
    )
    public = caps.public()
    assert caps.owned_input_release == public["owned_input_release"] == "verified"
    assert "shared_x11_release_requires_surviving_guardian_acknowledgment" in public["limitations"]
    assert "shared_x11_abrupt_guardian_death_server_release_unproven" in public["limitations"]


@pytest.mark.parametrize(
    "platform,environment,separation",
    [
        ("x11", "isolated", "shared"),
        ("x11", "existing_session", "independent"),
        ("wayland", "existing_session", "shared"),
    ],
)
def test_shared_x11_qualification_not_applied_to_other_paths(platform, environment, separation):
    caps = BackendCapabilities(
        platform, environment, separation, separation, "verified", "verified"
    )
    assert not any(item.startswith("shared_x11_") for item in caps.public()["limitations"])
