"""Hyprland-only validation for the closed native input-loss schema."""
from __future__ import annotations

import copy

import pytest

from src.computer.runtime import hyprland_guardian as module

LEGACY = {
    "command": "action", "scope_operation": "arm", "scope_error": "scope-exchange-failed",
}
V1 = {
    "terminal_cause": "scope_transport_failed",
    "scope_outcome": "transport_lost",
    "events_queued": 3,
    "events_submitted": 1,
    "release_submission": "submitted",
    "release_ack": "transport_lost",
    "resource_closure": "display_disconnected",
}


def row(extension=V1):
    failure = copy.deepcopy(LEGACY)
    if extension is not None:
        failure["input_loss_v1"] = copy.deepcopy(extension)
    return {"native_failure": failure}


def test_native_input_loss_extension_is_additive_and_sanitized():
    assert module.native_failure(row()) == {**LEGACY, "input_loss_v1": V1}


def test_native_input_loss_absence_preserves_legacy_compatibility():
    assert module.native_failure(row(None)) == LEGACY


@pytest.mark.parametrize("field,value", [
    ("terminal_cause", "private exception"), ("scope_outcome", []),
    ("events_queued", True), ("events_submitted", 4),
    ("release_submission", "queued"),
    ("release_ack", "receiver_true"), ("resource_closure", "processclosed"),
])
def test_malformed_native_extension_is_dropped_without_losing_legacy(field, value):
    extension = copy.deepcopy(V1)
    extension[field] = value
    assert module.native_failure(row(extension)) == LEGACY


def test_native_extension_rejects_unbounded_counts_and_unknown_fields_without_copying_them():
    extension = {**V1, "events_queued": 4097, "raw_exception": "private"}
    before = copy.deepcopy(extension)
    assert module.native_failure(row(extension)) == LEGACY
    assert extension == before


def test_native_extension_does_not_claim_receiver_release_proof():
    evidence = module.native_failure(row())
    assert evidence["input_loss_v1"]["release_ack"] == "transport_lost"
    assert "receiver_release_verified" not in evidence["input_loss_v1"]
