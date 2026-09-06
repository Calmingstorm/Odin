"""Independent pipe supervisor; lease/stop never wait for the action writer.

This executable accepts only a server-generated session token and fixed profile.
It is unprivileged; sudo is restricted to the fixed systemd launch/control argv.
"""

from __future__ import annotations

import asyncio
import signal
import sys
import time
from pathlib import Path
from typing import TYPE_CHECKING

if not __package__:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

if TYPE_CHECKING or __package__:
    from .profile import clean_environment, launch_argv, unit_for, validate_unit
    from .protocol import MAX_WIRE_BYTES, decode, encode
else:
    from runtime.profile import clean_environment, launch_argv, unit_for, validate_unit
    from runtime.protocol import MAX_WIRE_BYTES, decode, encode


async def unit_command(
    unit: str, *args: str, timeout: float = 0.7, runtime_sudo: bool = False
) -> tuple[int, bytes]:
    validate_unit(unit)
    proc = await asyncio.create_subprocess_exec(
        *(["/usr/bin/sudo", "-n"] if runtime_sudo else []), "/usr/bin/systemctl", *args, unit,
        stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL, env=clean_environment(),
    )
    try:
        output, _ = await asyncio.wait_for(proc.communicate(), timeout)
        assert proc.returncode is not None  # communicate() has reaped the process.
        return proc.returncode, output[:4096]
    except TimeoutError:
        if proc.returncode is None:
            proc.kill()
        await proc.wait()
        return 124, b""


async def terminate_unit(unit: str, *, runtime_sudo: bool = False) -> bool:
    """Kill only this supervisor's unpredictable named cgroup, then verify gone."""
    await unit_command(unit, "kill", "--kill-whom=all", "--signal=KILL", runtime_sudo=runtime_sudo)
    await unit_command(unit, "stop", "--no-block", runtime_sudo=runtime_sudo)
    end = time.monotonic() + 0.7
    while time.monotonic() < end:
        code, output = await unit_command(
            unit, "show", "--property=ActiveState", "--value",
            timeout=0.3, runtime_sudo=runtime_sudo,
        )
        if code == 0 and output.strip() in (b"inactive", b"failed", b""):
            return True
        await asyncio.sleep(0.05)
    return False


class Supervisor:
    def __init__(self, session_id: str, profile: str, *, runtime_sudo: bool = False):
        self.runtime_sudo = runtime_sudo
        self.argv = launch_argv(session_id, profile, runtime_sudo=runtime_sudo)
        self.unit = unit_for(session_id)
        self.last_heartbeat = time.monotonic()
        self.revoked = asyncio.Event()
        self.worker: asyncio.subprocess.Process | None = None
        self.outbound = asyncio.Lock()
        self.forwarded: set[str] = set()
        self.stop_result = False
        self.stop_lock = asyncio.Lock()

    async def emit(self, message: dict) -> None:
        async with self.outbound:
            # The pipe cannot contain model text except bounded worker metadata.
            await asyncio.to_thread(self._write, encode(message))

    @staticmethod
    def _write(data: bytes) -> None:
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()

    async def stop(self) -> bool:
        self.revoked.set()  # Fence before any await, including ordinary I/O.
        async with self.stop_lock:
            if self.stop_result:
                return True
            self.stop_result = await terminate_unit(self.unit, runtime_sudo=self.runtime_sudo)
            return self.stop_result

    async def commands(self, reader: asyncio.StreamReader) -> None:
        while not self.revoked.is_set():
            line = await reader.readline()
            if not line:
                return
            message = decode(line, cap=65536)
            operation = message.get("op")
            if operation == "heartbeat":
                self.last_heartbeat = time.monotonic()
                continue
            if operation == "stop":
                result = await self.stop()
                await self.emit({"id": message.get("id"), "ok": result, "stopped": result})
                return
            if operation not in {"observe", "act", "export", "pause", "resume"}:
                raise ValueError("unsupported supervisor operation")
            request_id = message.get("id")
            if (not isinstance(request_id, str) or len(request_id) > 64
                    or request_id in self.forwarded):
                raise ValueError("duplicate or invalid request; no replay permitted")
            if len(self.forwarded) >= 1024:
                raise ValueError("desktop operation ceiling exceeded")
            self.forwarded.add(request_id)
            if self.revoked.is_set() or self.worker is None or self.worker.stdin is None:
                return
            self.worker.stdin.write(encode(message))
            await self.worker.stdin.drain()

    async def replies(self) -> None:
        assert self.worker is not None and self.worker.stdout is not None
        while not self.revoked.is_set():
            line = await self.worker.stdout.readline()
            if not line:
                return
            message = decode(line)
            if not self.revoked.is_set():
                await self.emit(message)

    async def watchdog(self) -> None:
        while not self.revoked.is_set():
            if time.monotonic() - self.last_heartbeat >= 2.0:
                await self.stop()
                return
            await asyncio.sleep(0.05)

    async def run(self) -> None:
        reader = asyncio.StreamReader(limit=65536)
        await asyncio.get_running_loop().connect_read_pipe(
            lambda: asyncio.StreamReaderProtocol(reader), sys.stdin.buffer,
        )
        self.worker = await asyncio.create_subprocess_exec(
            *self.argv, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL, env=clean_environment(), limit=MAX_WIRE_BYTES,
        )
        tasks = [
            asyncio.create_task(fn())
            for fn in (lambda: self.commands(reader), self.replies, self.watchdog)
        ]
        try:
            await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        finally:
            await self.stop()
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            if self.worker.returncode is None:
                try:
                    await asyncio.wait_for(self.worker.wait(), 0.5)
                except TimeoutError:
                    self.worker.kill()
                    await self.worker.wait()


async def main() -> None:
    if len(sys.argv) != 4 or sys.argv[3] not in {"sudo", "direct"}:
        raise SystemExit(2)
    supervisor = Supervisor(sys.argv[1], sys.argv[2], runtime_sudo=sys.argv[3] == "sudo")
    loop = asyncio.get_running_loop()
    task = asyncio.current_task()
    assert task is not None  # main() is executed by asyncio.run().
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, task.cancel)
    await supervisor.run()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (Exception, KeyboardInterrupt):
        # Never print wire payloads, stack locals, typed text or captured images.
        raise SystemExit(1) from None
