"""Pure fake inventories and native adapters; no desktop or live sessions."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

from src.computer.controller import ComputerController
from src.computer.models import BackendCapabilities, RequestContext
from src.computer.store import ComputerStore
from tests.test_computer_contract_r1 import Stub


async def test_repeated_unused_inventory_expires_private_proof_and_close_clears(tmp_path):
    now = [0.0]
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    backend = SimpleNamespace(
        capabilities=BackendCapabilities("wayland", "existing_session", backend="hyprland"),
        inventory_targets=AsyncMock(return_value={"candidate_epoch": 1, "candidates": [
            {"id": "private-native-id", "label": "fixture", "output_id": "output"}]}),
        export_selection_proof=lambda _: {"private": "proof"}, close=AsyncMock())
    controller = ComputerController(store, lambda _: backend, lambda _: True,
                                    enabled=True, monotonic=lambda: now[0])
    context = RequestContext("owner", "channel", "turn", "host")
    for _ in range(6):
        await controller.session(context, {"operation": "inventory_targets"})
        assert len(controller._selection_bindings) == 1
        now[0] += 1000
    await controller.close()
    assert not controller._selection_bindings
    store.close()


async def test_clean_terminal_stop_retires_all_caches(tmp_path):
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, lambda _: Stub(), lambda _: True, enabled=True)
    context = RequestContext("owner", "channel", "turn", "host")
    result = await controller.session(context, {"operation": "start", "app": "drawing"})
    sid = result["session_id"]
    controller._hyprland_contexts[sid] = context
    controller._hyprland_bindings[sid] = {"private": "binding"}
    controller._hyprland_recovery_epochs[sid] = 1
    controller._x11_focus_candidates[sid] = ("observation", "private")
    stopped = await controller._stop(sid, "closed")
    assert stopped["state"] == "closed"
    await asyncio.sleep(0)
    for cache in (controller._live, controller._stop_locks, controller._stops,
                  controller._hyprland_contexts, controller._hyprland_bindings,
                  controller._hyprland_recovery_epochs, controller._x11_focus_candidates):
        assert sid not in cache
    await controller.close()
    store.close()


async def test_terminal_lock_identity_survives_queued_waiter_and_worker(tmp_path):
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, None, lambda _: True, enabled=True)
    context = RequestContext("owner", "channel", "turn", "host")
    grant = store.create_session(context, "drawing")
    store.set_state(grant.session_id, "closed")
    sid = grant.session_id
    lock = controller._stop_locks[sid] = asyncio.Lock()
    await lock.acquire()
    waiter = asyncio.create_task(lock.acquire())
    await asyncio.sleep(0)
    lock.release()
    controller._prune_caches()
    assert controller._stop_locks[sid] is lock
    await waiter
    lock.release()
    worker = asyncio.create_task(asyncio.sleep(0))
    controller._recoveries[sid] = worker
    controller._prune_caches()
    assert controller._stop_locks[sid] is lock
    await worker
    controller._recoveries.pop(sid)
    controller._prune_caches()
    assert sid not in controller._stop_locks
    store.close()
