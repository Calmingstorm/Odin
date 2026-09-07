"""Local shell ownership separated from Odin's ordinary subprocess owners."""
from __future__ import annotations

import asyncio
import json
import socket
import sys
from pathlib import Path


class SupervisorError(RuntimeError):
    """Command ownership/cleanup could not be verified."""


_active: set[SupervisedShell] = set()
_unverified_startup = False
_pending: set[asyncio.Task] = set()
_closing_loops: set[asyncio.AbstractEventLoop] = set()


class SupervisedShell:
    def __init__(self, worker, reader, writer):
        self._worker = worker
        self._reader = reader
        self._writer = writer
        self.stdin = worker.stdin
        self.stdout = worker.stdout
        self.stderr = worker.stderr
        self.pid = 0
        self.returncode: int | None = None
        loop = asyncio.get_running_loop()
        self._started = loop.create_future()
        self._exited = loop.create_future()
        self._settled = loop.create_future()
        self._monitor_task = asyncio.create_task(self._monitor(), name='local-shell-owner')
        _active.add(self)

    async def _monitor(self):
        clean = False
        try:
            while line := await self._reader.readline():
                event = json.loads(line)
                if not isinstance(event, dict) or type(event.get('event')) is not str:
                    raise SupervisorError('Invalid supervisor frame')
                if event['event'] == 'started':
                    if set(event) != {'event', 'pid'} or type(event['pid']) is not int:
                        raise SupervisorError('Invalid supervisor startup frame')
                    self.pid = event['pid']
                    if self.pid <= 1 or self._started.done():
                        raise SupervisorError('Invalid supervisor startup identity')
                    self._started.set_result(None)
                elif event['event'] == 'exit':
                    if (set(event) != {'event', 'returncode'}
                            or type(event['returncode']) is not int):
                        raise SupervisorError('Invalid supervisor exit frame')
                    if not self._started.done() or self._exited.done():
                        raise SupervisorError('Invalid supervisor exit ordering')
                    self.returncode = int(event['returncode'])
                    self._exited.set_result(self.returncode)
                elif event['event'] == 'settled':
                    if set(event) != {'event', 'clean'} or not self._exited.done():
                        raise SupervisorError('Invalid supervisor settlement ordering')
                    clean = event.get('clean') is True
                    break
                else:
                    raise SupervisorError('Local command supervisor reported failure')
            if not clean:
                raise SupervisorError('Local command supervisor control channel lost')
            rc = await asyncio.wait_for(self._worker.wait(), timeout=2)
            if not clean or rc != 0 or not self._exited.done():
                raise SupervisorError('Local command supervisor exited without verified cleanup')
            self._settled.set_result(True)
        except BaseException as exc:
            from ..restart import block_reexec

            block_reexec('local command supervisor ownership lost')
            error = SupervisorError('Local command supervisor ownership lost')
            for future in (self._started, self._exited, self._settled):
                if not future.done():
                    future.set_exception(error)
                    future.exception()
            if isinstance(exc, asyncio.CancelledError):
                raise
        finally:
            self._writer.close()  # EOF asks a surviving worker to clean up
            if self._settled.done() and not self._settled.exception():
                _active.discard(self)

    async def wait(self):
        if self._settled.done() and self._settled.exception() is not None:
            raise SupervisorError('Local command supervisor ownership lost')
        return await asyncio.shield(self._exited)

    async def communicate(self, input=None):
        async def feed():
            if self.stdin is not None:
                try:
                    if input:
                        self.stdin.write(input)
                        await self.stdin.drain()
                except (BrokenPipeError, ConnectionResetError):
                    pass
                finally:
                    self.stdin.close()
        async def read(stream):
            return await stream.read() if stream is not None else None
        _, stdout, stderr = await asyncio.gather(feed(), read(self.stdout), read(self.stderr))
        await self.wait()
        return stdout, stderr

    async def terminate_tree(self, grace=3.0):
        if not self._settled.done():
            try:
                self._writer.write(json.dumps({'op': 'terminate', 'grace': grace}).encode() + b'\n')
                await self._writer.drain()
            except (BrokenPipeError, ConnectionResetError):
                pass
        return await asyncio.wait_for(asyncio.shield(self._settled), timeout=grace + 12)


async def create_supervised_shell(command, *, stdin=None, stdout=None, stderr=None,
                                  start_new_session=True, cwd=None, env=None):
    global _unverified_startup
    loop = asyncio.get_running_loop()
    if loop in _closing_loops:
        raise SupervisorError('Local command supervision is shutting down')
    if not start_new_session:
        raise ValueError('supervised shells require a private session')
    parent, child = socket.socketpair()
    parent.setblocking(False)
    spawn_task = asyncio.create_task(asyncio.create_subprocess_exec(
        sys.executable, '-I', str(Path(__file__).with_name('local_supervisor_worker.py')),
        '--control-fd', str(child.fileno()), '--command', command,
        pass_fds=(child.fileno(),), start_new_session=True,
        stdin=stdin, stdout=stdout, stderr=stderr, cwd=cwd, env=env,
    ))
    owner = asyncio.current_task()
    assert owner is not None
    _pending.add(owner)
    shell = None
    try:
        worker = await asyncio.shield(spawn_task)
        child.close()
        reader, writer = await asyncio.open_connection(sock=parent, limit=4096)
        shell = SupervisedShell(worker, reader, writer)
        await asyncio.wait_for(asyncio.shield(shell._started), timeout=10)
        return shell
    except BaseException:
        child.close()
        if shell is None and parent.fileno() >= 0:
            # Cancellation can arrive after fork but before protocol setup.
            # Recover the worker handle, then obtain real settlement evidence.
            try:
                worker = await asyncio.shield(spawn_task)
                reader, writer = await asyncio.open_connection(sock=parent, limit=4096)
                shell = SupervisedShell(worker, reader, writer)
                await asyncio.wait_for(asyncio.shield(shell._started), timeout=10)
            except BaseException:
                if not spawn_task.done() or (
                    not spawn_task.cancelled() and spawn_task.exception() is None
                ):
                    _unverified_startup = True
                    from ..restart import block_reexec

                    block_reexec('local supervisor startup cleanup unverified')
        if shell is not None:
            try:
                await shell.terminate_tree(grace=.1)
            except Exception:
                pass  # preserve original launch failure/cancellation
        else:
            parent.close()
            if not spawn_task.done() or (
                not spawn_task.cancelled() and spawn_task.exception() is None
            ):
                # No protocol means no clean-settlement evidence. Persist the
                # veto before any cancellable cleanup or worker-status wait.
                _unverified_startup = True
                from ..restart import block_reexec

                block_reexec('local supervisor startup cleanup unverified')
            try:
                worker = await spawn_task
                await asyncio.wait_for(worker.wait(), timeout=15)
            except Exception:
                if not spawn_task.cancelled() and spawn_task.exception() is None:
                    _unverified_startup = True
                    from ..restart import block_reexec

                    block_reexec('local supervisor startup cleanup unverified')
        raise
    finally:
        child.close()
        _pending.discard(owner)


async def shutdown_local_supervisors():
    """Explicit shutdown barrier, before blanket event-loop cancellation."""
    loop = asyncio.get_running_loop()
    _closing_loops.add(loop)
    pending = [task for task in _pending if task.get_loop() is loop]
    for task in pending:
        task.cancel()
    if pending:
        _, remaining = await asyncio.wait(pending, timeout=18)
        if remaining:
            raise SupervisorError('Local supervisor launches did not settle')
    results = await asyncio.gather(*(shell.terminate_tree(grace=.5)
                                    for shell in list(_active)
                                    if shell._settled.get_loop() is loop), return_exceptions=True)
    if _unverified_startup or any(result is not True for result in results):
        raise SupervisorError('Local command supervisor cleanup unverified')
