"""Concrete-generation leases shared by direct and gateway provider calls."""

import asyncio
from contextlib import asynccontextmanager
from functools import wraps

from .errors import LLMTransportError


def leased_call(method):
    @wraps(method)
    async def call(self, *args, **kwargs):
        async with self.generation_lease():
            return await method(self, *args, **kwargs)
    return call


class ClientLifecycle:
    """Retirement closes admission synchronously; active leases drain unboundedly.

    The gateway owns the drain task. Cancellation of a caller releases its
    lease in finally; cancellation of a drain never closes active transports.
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
