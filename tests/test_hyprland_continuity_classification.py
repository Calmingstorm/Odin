"""Identity discontinuity is not synonymous with unavailable evidence."""
from types import SimpleNamespace

import pytest

from src.computer.controller import ComputerController
from src.computer.models import ComputerError
from src.computer.runtime.hyprland_errors import HyprlandDiagnosticError
from src.computer.runtime.hyprland_errors import HyprlandFailureCause as Cause
from src.computer.runtime.hyprland_errors import HyprlandFailureStage as Stage
from src.computer.runtime.hyprland_scope import HyprlandScopeFailure


def classified(error, backend="hyprland"):
    live = SimpleNamespace(capabilities=SimpleNamespace(backend=backend))
    return ComputerController._hyprland_continuity_failure(live, error)


@pytest.mark.parametrize("error", [
    TimeoutError(), ConnectionError(), HyprlandScopeFailure(),
    HyprlandScopeFailure("human-input-held"),
    ComputerError("hyprland_session_revoked"),
    ComputerError("hyprland_peer_unavailable"),
    ComputerError("hyprland_original_target_continuity_unproven"),
    ComputerError("hyprland_capture_scope_changed"),
    ComputerError("stale_source_binding"),
    HyprlandDiagnosticError("unavailable", stage=Stage.READ, cause=Cause.EOF),
    HyprlandDiagnosticError("unavailable", stage=Stage.PARSE, cause=Cause.INVALID),
    HyprlandDiagnosticError("unavailable", stage=Stage.PROCESS, cause=Cause.UNREADABLE),
])
def test_unavailable_evidence_is_not_identity_loss(error):
    assert not classified(error)


@pytest.mark.parametrize("error", [
    ComputerError("hyprland_provider_owner_changed"),
    ComputerError("hyprland_compositor_exited"),
    ComputerError("hyprland_original_target_changed"),
    ComputerError("hyprland_original_application_changed"),
    HyprlandScopeFailure("hyprland_scope_plugin_incarnation_changed"),
    HyprlandDiagnosticError("gone", stage=Stage.PROCESS, cause=Cause.MISSING),
    HyprlandScopeFailure(stage=Stage.PEER, cause=Cause.MISMATCH),
])
def test_actual_identity_discontinuity_enters_recovery(error):
    assert classified(error)
    assert not classified(error, "x11")
