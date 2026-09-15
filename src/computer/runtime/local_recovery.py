"""Bounded local Hyprland cleanup truth, never receiver-delivery proof."""
import math
import re


def local_cleanup_verified(result, *, session_id, generation, command_id, now):
    if type(result) is not dict or result.get("released") is not True:
        return False
    if (type(generation) is not int or generation < 1
            or type(command_id) is not str
            or re.fullmatch(r"[a-f0-9]{32}", command_id) is None
            or type(result.get("recovery_generation")) is not int
            or result["recovery_generation"] != generation
            or result.get("recovery_command_id") != command_id):
        return False
    attestation = result.get("external_cleanup_attestation")
    if type(attestation) is not dict:
        return False
    timestamp = attestation.get("acknowledged_at")
    operator = attestation.get("operator_id")
    return (
        result.get("status") == "operator_acknowledged_unverified"
        and result.get("complete") is False
        and attestation.get("status") == "operator_acknowledged_unverified"
        and attestation.get("reason") == "operator_verified_external_cleanup"
        and attestation.get("complete") is False
        and attestation.get("acknowledgment") == f"ACKNOWLEDGE UNVERIFIED CLEANUP {session_id}"
        and type(operator) is str and 1 <= len(operator) <= 128
        and all(32 <= ord(c) < 127 for c in operator)
        and (type(timestamp) is int or type(timestamp) is float) and math.isfinite(timestamp)
        and 0 < timestamp <= now
        and all(attestation.get(k) is True for k in (
            "scope_ledger_empty", "physical_devices_empty", "scope_disarmed",
            "recorded_processes_absent"))
    )
