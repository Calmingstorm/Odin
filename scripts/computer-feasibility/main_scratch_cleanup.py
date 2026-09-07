"""Bounded baseline recovery for an explicitly exclusive scratch test only.

This is not production desktop policy. Never guess topology after hotplug or
replay input to finish a failed task. Call only after owned input and apps settle.
"""
from __future__ import annotations

import asyncio

from main_scratch_support import durable_json, stage


async def restore_desktop(*, stages, base, before, restore_topology,
                          restore_windows, restore_focus, restore_power, snapshot):
    """Independent cleanup stages; power and verification always run.

    Topology failure fences coordinate-dependent restoration. Window failure does
    not prevent restoring focus/pointer against the established baseline topology.
    The final exact comparison, not successful requests, establishes restoration.
    """
    topology_ok = await stage(stages, base, 'restore_topology', restore_topology)
    if topology_ok:
        await stage(stages, base, 'restore_baseline_windows', restore_windows)
        await stage(stages, base, 'restore_focus_pointer', restore_focus)
    else:
        for name in ('restore_baseline_windows', 'restore_focus_pointer'):
            stages.append({'stage': name, 'ok': False,
                           'reason': 'baseline_topology_unavailable',
                           'operator_action': 'restore_display_layout_then_window_positions'})
    await stage(stages, base, 'restore_monitor_power', restore_power)
    await asyncio.sleep(.5)

    def compare():
        after = snapshot()
        durable_json(base / 'after.json', after)
        if after != before:
            changed = [key for key in before if after.get(key) != before[key]]
            return {'errors': changed, 'operator_action': 'review_before_and_after_metadata'}
        return {'exact_baseline_match': True}

    return await stage(stages, base, 'compare_exact_session', compare)


async def finish_cleanup(awaitable):
    """A second cancellation must not abandon already-started cleanup.

    Each stage has its own finite deadline and the standalone supervisor has an
    independent final bound. Do not claim success if that supervisor must intervene.
    """
    task = asyncio.create_task(awaitable)
    while not task.done():
        try:
            await asyncio.shield(task)
        except asyncio.CancelledError:
            continue
    return task.result()
