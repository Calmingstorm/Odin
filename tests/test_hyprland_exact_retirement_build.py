"""Qualification cannot be inherited by a merely trusted changed executable."""

import os
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from src.computer.runtime import hyprland_absence as absence
from src.computer.runtime.hyprland_scope import HyprlandScopeFailure, HyprlandScopeProvider
from tests.test_hyprland_recovery_backend import runtime as runtime


@pytest.mark.parametrize("changed", [None, "plugin_sha256", "companion_build_id",
                                    "compositor_sha256"])
def test_exact_native_tuple_required(changed):
    actual = absence.QUALIFIED_RETIREMENT_TUPLE._asdict()
    actual.pop("guardian_sha256")
    if changed:
        actual[changed] = "f" * 64
    assert absence.exact_retirement_build(**actual) is (changed is None)
    provider = HyprlandScopeProvider(
        socket_path="/unused/scope.sock", expected_uid=os.geteuid(), expected_compositor_pid=42)
    if changed:
        with pytest.raises(HyprlandScopeFailure, match="retirement_protocol_unavailable"):
            provider.authorize_resource_containment(**actual)
    else:
        provider.authorize_resource_containment(**actual)


def test_build_registry_matches_runtime_qualification():
    qualified = absence.QUALIFIED_RETIREMENT_TUPLE
    records = Path("assets/hyprland-input/runtime-qualified-tuples.txt").read_text().splitlines()
    assert " ".join((qualified.companion_build_id, qualified.plugin_sha256,
                     qualified.guardian_sha256)) in records


async def test_only_captured_native_witness_enables_coordinator(runtime):
    backend, _, _ = runtime
    provider = HyprlandScopeProvider(
        socket_path="/unused/scope.sock", expected_uid=os.geteuid(), expected_compositor_pid=42)
    witness = absence.ResourceContainmentWitness()
    provider.capture_resource_witness = AsyncMock(return_value=witness)
    assert backend._cross_incarnation.capability.runtime_qualified is False
    await backend._capture_resource_witness(provider)
    assert backend._cross_incarnation.capability.runtime_qualified is True
    assert backend._resource_witness is witness
    backend._close_resource_witness()
