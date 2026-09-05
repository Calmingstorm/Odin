"""Concrete-generation leases shared by direct and gateway provider calls."""

import asyncio
from contextlib import asynccontextmanager
from functools import wraps

from ..odin_log import get_logger
from .errors import LLMTransportError

log = get_logger("client_lifecycle")
SHUTDOWN_DRAIN_SECONDS = 3.0
SHUTDOWN_CLOSE_SECONDS = 1.0


def _observe_shutdown_task(task):
    if not task.cancelled():
        error = task.exception()
        if error is not None:
            log.warning("Provider shutdown task failed (%s)", type(error).__name__)


async def shutdown_provider_clients(gateway):
    """One shared drain deadline, then bounded force-close, including retirees.

    Reload drains must not sever healthy long generations. Only shutdown may
    abandon leases: its total budget must leave time for browser/image cleanup.
    """
    if gateway is None:
        return
    owners = dict(getattr(gateway, "_draining_clients", {}))
    tasks = set(getattr(gateway, "_aux_drains", ()))
    for name in ("auxiliary_llm_client", "codex_client", "ollama_client", "kimi_client"):
        client = getattr(gateway, name, None)
        if client is None or any(client is owner for owner in owners.values()):
            continue
        task = asyncio.create_task(client.drain_and_close())
        owners[task] = client
        tasks.add(task)
    if not tasks:
        return
    for task in tasks:
        task.add_done_callback(_observe_shutdown_task)
    _, pending = await asyncio.wait(tasks, timeout=SHUTDOWN_DRAIN_SECONDS)
    if not pending:
        return
    abandoned = sum(
        getattr(owners[task], "_generation_inflight", getattr(owners[task], "_inflight", 0))
        for task in pending if task in owners
    )
    log.warning(
        "Provider shutdown drain deadline reached: abandoned %d lease(s), %d task(s)",
        abandoned, len(pending),
    )
    closes = set()
    for task in pending:
        task.cancel()
        client = owners.get(task)
        if client is not None:
            closing = asyncio.create_task(client.close())
            closing.add_done_callback(_observe_shutdown_task)
            closes.add(closing)
    # asyncio.wait, unlike wait_for(gather(...)), cannot run past its deadline
    # while waiting for a cancellation-resistant transport or reload task.
    _, unsettled = await asyncio.wait(pending | closes, timeout=SHUTDOWN_CLOSE_SECONDS)
    for task in unsettled:
        task.cancel()
    if unsettled:
        log.warning(
            "Provider shutdown: %d task(s) did not settle after force-close", len(unsettled),
        )


def leased_call(method):
    @wraps(method)
    async def call(self, *args, **kwargs):
        async with self.generation_lease():
            return await method(self, *args, **kwargs)
    return call


class ClientLifecycle:
    """Retirement closes admission synchronously; reload waits for active leases.

    The gateway owns reload drain tasks. Shutdown enforces a shared bounded
    drain then force-close via shutdown_provider_clients. Caller cancellation
    releases its lease in finally; cancelling a reload drain does not close it.
    """

    def _lifecycle_state(self):
        if not hasattr(self, "_generation_idle"):
            self._generation_idle = asyncio.Event()
            self._generation_idle.set()
            self._generation_inflight = 0
            self._generation_retired = False
            self._generation_owners = {}

    @asynccontextmanager
    async def generation_lease(self):
        self._lifecycle_state()
        owner = asyncio.current_task()
        if self._generation_retired and owner not in self._generation_owners:
            raise LLMTransportError("Provider generation retired; capture the current client")
        self._generation_owners[owner] = self._generation_owners.get(owner, 0) + 1
        self._generation_inflight += 1
        self._generation_idle.clear()
        try:
            yield
        finally:
            self._generation_owners[owner] -= 1
            if not self._generation_owners[owner]:
                del self._generation_owners[owner]
            self._generation_inflight -= 1
            if not self._generation_inflight:
                self._generation_idle.set()

    def retire(self):
        self._lifecycle_state()
        self._generation_retired = True

    async def close(self) -> None:
        raise NotImplementedError

    async def drain_and_close(self):
        self.retire()
        await self._generation_idle.wait()
        await self.close()
