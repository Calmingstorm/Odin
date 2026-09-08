"""Bounded baseline recovery for an explicitly exclusive scratch test only.

This is not production desktop policy. Never guess topology after hotplug or
replay input to finish a failed task. Call only after owned input and apps settle.
"""

from __future__ import annotations

import asyncio

from main_scratch_support import durable_json, stage


async def restore_desktop(
    *,
    stages,
    base,
    before,
    restore_topology,
    restore_windows,
    restore_focus,
    restore_power,
    snapshot,
):
    """Independent cleanup stages; power and verification always run.

    Topology failure fences coordinate-dependent restoration. Window failure does
    not prevent restoring focus/pointer against the established baseline topology.
    The final exact comparison, not successful requests, establishes restoration.
    """
    start = len(stages)
    topology_ok = await stage(stages, base, "restore_topology", restore_topology)
    if topology_ok:
        await stage(stages, base, "restore_baseline_windows", restore_windows)
        await stage(stages, base, "restore_focus_pointer", restore_focus)
    else:
        for name in ("restore_baseline_windows", "restore_focus_pointer"):
            stages.append(
                {
                    "stage": name,
                    "ok": False,
                    "reason": "baseline_topology_unavailable",
                    "operator_action": "restore_display_layout_then_window_positions",
                }
            )
    await stage(stages, base, "restore_monitor_power", restore_power)
    await asyncio.sleep(0.5)

    def compare():
        after = snapshot()
        durable_json(base / "after.json", after)
        if after != before:
            changed = sorted(
                key
                for key in before.keys() | after.keys()
                if key not in before or key not in after or after[key] != before[key]
            )
            return {"errors": changed, "operator_action": "review_before_and_after_metadata"}
        return {"exact_baseline_match": True}

    exact = await stage(stages, base, "compare_exact_session", compare)
    return exact and all(row["ok"] for row in stages[start:])


async def finish_cleanup(awaitable):
    """A second cancellation must not abandon already-started cleanup.

    Each stage has its own finite deadline and the standalone supervisor has an
    independent final bound. Do not claim success if that supervisor must intervene.
    """
    task = asyncio.create_task(awaitable)
    cancelled = False
    while not task.done():
        try:
            await asyncio.shield(task)
        except asyncio.CancelledError:
            cancelled = True
            continue
    result = task.result()
    if cancelled:
        # Finish cleanup first, then preserve cancellation as task failure.
        raise asyncio.CancelledError
    return result


def cleanup_status(stages, *, start, baseline_validated):
    """Task outcome is separate from teardown and the observed baseline match."""
    rows = stages[start:]
    exact = next(
        (row["ok"] for row in reversed(rows) if row["stage"] == "compare_exact_session"), False
    )
    return {
        "cleanup_complete": all(row["ok"] for row in rows) and (exact or not baseline_validated),
        "session_restored": exact if baseline_validated else None,
        "baseline_validated": baseline_validated,
        "manual_actions": manual_actions(rows),
    }


def manual_actions(stages):
    """Fixed metadata-only operator handoff; never emit guessed replay commands."""
    actions = {
        "controller_close": "revoke_owned_input_and_verify_cleanup_receipt_before_any_recovery",
        "integration_close": "inspect_retained_runtime_then_revoke_owned_input",
        "restore_topology": "inspect_before_json_and_live_outputs_no_guess_or_replay_on_hotplug",
        "restore_baseline_windows": "inspect_baseline_window_identities_do_not_unhide_or_activate",
        "restore_focus_pointer": "wait_for_exclusive_idle_input_then_review_baseline_focus",
        "restore_monitor_power": "check_display_response_then_restore_only_recorded_power_state",
        "compare_exact_session": "review_before_json_and_after_json_do_not_claim_exact_recovery",
    }
    return [
        {
            "stage": row["stage"],
            "action": actions.get(
                row["stage"],
                "inspect_stage_and_supervisor_json_clean_only_verified_owned_resources",
            ),
        }
        for row in stages
        if not row["ok"]
    ]


async def close_controller_verified(controller, context):
    """close() returns None. Inspect durable receipt and retained live ownership."""
    await controller.close()
    grant = controller.store.find_session(context)
    receipt = controller.store.cleanup(grant.session_id) if grant else None
    required = (
        "complete",
        "stopped",
        "released",
        "applications_preserved",
        "input_revoked",
        "capture_revoked",
    )
    device_states = {"removed", "retained_inactive", "not_created"}
    if controller._live or (
        grant
        and (
            grant.state not in {"closed", "cancelled"}
            or not isinstance(receipt, dict)
            or any(receipt.get(key) is not True for key in required)
            or receipt.get("owned_devices") not in device_states
        )
    ):
        return {"errors": ["controller_cleanup_unverified"], "cleanup": receipt}
    return {"cleanup_verified": True, "session_existed": grant is not None, "cleanup": receipt}
