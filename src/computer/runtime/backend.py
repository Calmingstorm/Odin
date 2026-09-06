"""Async controller adapter. No launch or optional dependency unless enabled."""

from __future__ import annotations

import asyncio
import hashlib
import sys
import uuid
from pathlib import Path
from typing import Any

from ..geometry import AffineTransform, SourceGeometry
from ..models import BackendCapabilities, BackendObservation, CaptureScope
from .profile import (
    APP_PROFILES,
    MAX_EXPORT_BYTES,
    MAX_IMAGE_BYTES,
    basename,
    clean_environment,
    preflight,
    unit_for,
    validate_session,
)
from .protocol import MAX_WIRE_BYTES, decode, encode, unpack_blob


class RuntimeFailure(RuntimeError):  # noqa: N818 - Existing private adapter API name.
    """No effect guarantee: callers must record pending mutations as unknown."""


class LinuxDesktopBackend:
    capabilities = BackendCapabilities("x11", "isolated", "shared", "shared")

    def __init__(
        self, *, enabled: bool = False, app_profile: str = "drawing", runtime_sudo: bool = False
    ):
        if app_profile not in APP_PROFILES:
            raise ValueError("unapproved application profile")
        self.enabled, self.app_profile = enabled, app_profile
        self.runtime_sudo = runtime_sudo
        self._process: asyncio.subprocess.Process | None = None
        self._pending: dict[str, asyncio.Future[dict[str, Any]]] = {}
        self._writer = asyncio.Lock()
        self._ordinary = asyncio.Lock()
        self._stop_lock = asyncio.Lock()
        self._closed = False
        self._ready: asyncio.Future[dict[str, Any]] | None = None
        self._reader_task: asyncio.Task[None] | None = None
        self._heartbeat_task: asyncio.Task[None] | None = None
        self._unit: str | None = None
        self._last_window = None
        self._last_observation = None
        self._paused = False
        self._source_id = uuid.uuid4().hex
        self._source_revision = 0
        self._consent_generation = 1

    async def start(self, session_id: str) -> dict:
        if not self.enabled:
            raise RuntimeFailure("isolated computer use is disabled")
        if self._closed or self._process is not None:
            raise RuntimeFailure("backend instances are single-use")
        validate_session(session_id)
        preflight()
        owned = hashlib.sha256(session_id.encode()).hexdigest()[:32] + "-" + uuid.uuid4().hex
        self._unit = unit_for(owned)
        self._ready = asyncio.get_running_loop().create_future()
        try:
            self._process = await asyncio.create_subprocess_exec(
                sys.executable, "-I", str(Path(__file__).with_name("supervisor.py")),
                owned, self.app_profile,
                "sudo" if self.runtime_sudo else "direct",
                stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL, env=clean_environment(),
                start_new_session=True, limit=MAX_WIRE_BYTES,
            )
            self._reader_task = asyncio.create_task(self._read())
            self._heartbeat_task = asyncio.create_task(self._heartbeats())
            result = await asyncio.wait_for(asyncio.shield(self._ready), 20.0)
            if not result.get("ok"):
                raise RuntimeFailure("isolated desktop startup failed")
            return {**result, "unit": self._unit, "session_id": session_id}
        except BaseException:
            await asyncio.shield(self.stop())
            raise

    async def _send(self, message: dict) -> None:
        async with self._writer:
            if (self._process is None or self._process.stdin is None
                    or self._process.returncode is not None):
                raise RuntimeFailure("isolated desktop controller disconnected")
            self._process.stdin.write(encode(message))
            await self._process.stdin.drain()

    async def _read(self) -> None:
        try:
            while self._process and self._process.stdout:
                line = await self._process.stdout.readline()
                if not line:
                    break
                message = decode(line)
                request_id = message.get("id")
                future = (
                    self._ready if message.get("event") == "ready"
                    else self._pending.get(request_id) if isinstance(request_id, str) else None
                )
                if future is not None and not future.done():
                    future.set_result(message)
        except (Exception, asyncio.CancelledError):
            pass
        finally:
            for future in [self._ready, *self._pending.values()]:
                if future is not None and not future.done():
                    future.set_exception(RuntimeFailure("desktop connection lost; outcome unknown"))

    async def _heartbeats(self) -> None:
        try:
            while not self._closed:
                await self._send({"op": "heartbeat"})
                await asyncio.sleep(0.4)
        except (Exception, asyncio.CancelledError):
            return

    async def _rpc(self, operation: str, *, timeout: float = 5.0, **payload) -> dict:
        if self._closed:
            raise RuntimeFailure("desktop session is revoked")
        request_id = uuid.uuid4().hex
        future: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
        self._pending[request_id] = future
        try:
            await self._send({"id": request_id, "op": operation, **payload})
            result = await asyncio.wait_for(asyncio.shield(future), timeout)
            if self._closed:
                raise RuntimeFailure("desktop session revoked during operation")
            if not result.get("ok"):
                raise RuntimeFailure(str(result.get("error", "isolated operation failed"))[:160])
            return result
        except (TimeoutError, asyncio.CancelledError):
            await asyncio.shield(self.stop())
            raise
        finally:
            self._pending.pop(request_id, None)
            if not future.done():
                future.cancel()

    async def observe(self) -> BackendObservation:
        async with self._ordinary:
            reply = await self._rpc("observe")
            result = reply["observation"]
            result["image_bytes"] = unpack_blob(result.pop("image"), cap=MAX_IMAGE_BYTES)
            self._last_window = result["window"]
            self._last_observation = result.get("observation_id")
            # Worker lacks lifecycle epochs: fresh revision each capture, capture-only.
            self._source_revision += 1
            source = SourceGeometry(self._source_id, self._source_revision,
                                    self._consent_generation, result["width"], result["height"])
            scope = CaptureScope(self._consent_generation, frozenset({self._source_id}))
            return BackendObservation(source, scope, result["width"], result["height"],
                                      AffineTransform(), result["image_bytes"], focused=True,
                                      modal=uuid.uuid4().hex if result.get("modal") else None)

    async def act(self, action: dict) -> dict:
        raise RuntimeFailure("R1 adapter input mapping unavailable; capture only")

    async def _legacy_private_act(self, action: dict) -> dict:
        """Unexposed private primitive retained for later adapter migration."""
        async with self._ordinary:
            if self._paused:
                raise RuntimeFailure("desktop input is paused")
            if not isinstance(action, dict):
                raise ValueError("action must be an object")
            payload = dict(action)
            if "kind" in payload and "type" not in payload:
                payload["type"] = payload.pop("kind")
            if self._last_window is None:
                raise RuntimeFailure("a fresh observation is required")
            payload.setdefault("expected_window", self._last_window)
            payload.setdefault("observation_id", self._last_observation)
            self._last_window = None  # No stale frame can be reused after a mutation.
            return (await self._rpc("act", action=payload, timeout=5.0))["receipt"]

    async def export(self, name: str) -> bytes:
        basename(name)
        async with self._ordinary:
            result = await self._rpc("export", name=name)
            return unpack_blob(result["blob"], cap=MAX_EXPORT_BYTES)

    async def pause(self) -> dict:
        self._paused = True
        self._last_window = None
        try:
            return await self._rpc("pause", timeout=0.7)
        except BaseException:
            await asyncio.shield(self.stop())
            raise

    async def resume(self, *, consent_generation: int) -> dict:
        if not self._paused:
            raise RuntimeFailure("desktop is not paused")
        if type(consent_generation) is not int or consent_generation <= self._consent_generation:
            raise RuntimeFailure("fresh capture consent generation required")
        result = await self._rpc("resume", timeout=0.7)
        self._consent_generation = consent_generation
        self._paused = False
        self._last_window = None
        return result

    async def stop(self) -> dict:
        self._closed = True  # Independent of both ordinary-action and write locks.
        async with self._stop_lock:
            if self._heartbeat_task:
                self._heartbeat_task.cancel()
            verified = self._unit is None
            if self._unit:
                # A direct fixed-profile control path remains useful if supervisor I/O hangs.
                from .supervisor import terminate_unit
                verified = await terminate_unit(self._unit, runtime_sudo=self.runtime_sudo)
            if self._process and self._process.returncode is None:
                self._process.terminate()
                try:
                    await asyncio.wait_for(self._process.wait(), 0.4)
                except TimeoutError:
                    self._process.kill()
                    await self._process.wait()
            for task in (self._heartbeat_task, self._reader_task):
                if task and task is not asyncio.current_task():
                    task.cancel()
            await asyncio.gather(
                *(task for task in (self._heartbeat_task, self._reader_task)
                  if task and task is not asyncio.current_task()),
                return_exceptions=True,
            )
            for future in [self._ready, *self._pending.values()]:
                if future and future.done() and not future.cancelled():
                    future.exception()
            return {"stopped": verified, "state": "closed" if verified else "quarantined"}

    async def close(self) -> dict:
        return await self.stop()
