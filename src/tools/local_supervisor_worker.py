"""Stdlib-only Linux subprocess ownership worker.

Invoke in a new session with --control-fd FD --command COMMAND. FD is a duplex
socket, never stdin. Cwd/env/stdio are inherited. Normal leader exit preserves
background descendants. Cleanup reports timeout at ten seconds but retains
ownership and keeps retrying: uninterruptible tasks cannot have bounded death.
"""

from __future__ import annotations

import argparse
import ctypes
import errno
import json
import math
import os
import select
import selectors
import signal
import socket
import subprocess
import time
from dataclasses import dataclass
from typing import Never


@dataclass
class Pin:
    pid: int
    start: int
    fd: int
    termed: bool = False


def stat(pid: int) -> tuple[int, int] | None:
    try:
        with open(f"/proc/{pid}/stat", "rb") as stream:
            text = stream.read()
    except OSError as exc:
        if exc.errno in (errno.ENOENT, errno.ESRCH):
            return None
        raise
    fields = text[text.rindex(b")") + 2 :].split()
    return int(fields[1]), int(fields[19])


def children(pid: int) -> set[int]:
    result: set[int] = set()
    try:
        tids = os.listdir(f"/proc/{pid}/task")
    except OSError as exc:
        if exc.errno in (errno.ENOENT, errno.ESRCH):
            return result
        raise
    for tid in tids:
        if not tid.isdecimal():
            continue
        try:
            with open(f"/proc/{pid}/task/{tid}/children", encoding="ascii") as stream:
                result.update(int(value) for value in stream.read().split())
        except OSError as exc:
            if exc.errno not in (errno.ENOENT, errno.ESRCH):
                raise
    return result


def dead(pin: Pin) -> bool:
    poller = select.poll()
    poller.register(pin.fd, select.POLLIN)
    return bool(poller.poll(0))


def subreaper() -> None:
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(36, 1, 0, 0, 0) != 0:
        raise OSError(ctypes.get_errno(), "subreaper setup failed")
    enabled = ctypes.c_int()
    if libc.prctl(37, ctypes.byref(enabled), 0, 0, 0) != 0 or enabled.value != 1:
        raise RuntimeError("subreaper verification failed")
    fd = os.pidfd_open(os.getpid())
    try:
        signal.pidfd_send_signal(fd, 0)
        try:
            os.waitid(os.P_PIDFD, fd, os.WEXITED | os.WNOHANG)
        except ChildProcessError:
            pass  # Expected for our own pidfd; kernel supports P_PIDFD.
    finally:
        os.close(fd)


class Worker:
    def __init__(self, control: socket.socket) -> None:
        self.control = control
        control.setblocking(False)
        control.set_inheritable(False)
        self.selector = selectors.DefaultSelector()
        self.selector.register(control, selectors.EVENT_READ)
        self.connected = True
        self.incoming = bytearray()
        self.outgoing = bytearray()
        self.owner = os.getpid()
        self.leader: subprocess.Popen[bytes] | None = None
        self.exit_reported = False
        self.pins: dict[tuple[int, int], Pin] = {}
        self.stop_at: float | None = None
        self.kill_at = 0.0
        self.timeout_reported = False
        self.failed = False
        self.signal_requested = False
        self.reported_errors: set[str] = set()

    def emit(self, event: str, **values: object) -> None:
        if not self.connected:
            return
        data = (json.dumps({"event": event, **values}) + "\n").encode()
        if len(self.outgoing) + len(data) > 65536:
            self.disconnect()
            return
        self.outgoing.extend(data)

    def terminate(self, grace: float) -> None:
        now = time.monotonic()
        deadline = now + min(8.0, max(0.0, grace))
        if self.stop_at is None:
            self.stop_at = now
            self.kill_at = deadline
        else:
            self.kill_at = min(self.kill_at, deadline)

    def error(self, category: str, exc: BaseException | None = None) -> None:
        # Never quote exception text, which can contain command/env/path secrets.
        label = category if exc is None else f"{category} ({type(exc).__name__})"
        self.failed = True
        if label not in self.reported_errors:
            self.reported_errors.add(label)
            self.emit("error", message=label)
        self.terminate(0.0)

    def disconnect(self) -> None:
        if self.connected:
            self.connected = False
            try:
                self.selector.unregister(self.control)
            except (OSError, KeyError, ValueError):
                pass
            self.control.close()
            self.outgoing.clear()
        self.terminate(0.5)

    def io(self, timeout: float = 0.02) -> None:
        if not self.connected:
            time.sleep(timeout)
            return
        try:
            events = selectors.EVENT_READ
            if self.outgoing:
                events |= selectors.EVENT_WRITE
            self.selector.modify(self.control, events)
            for _, mask in self.selector.select(timeout):
                if mask & selectors.EVENT_WRITE and self.outgoing:
                    try:
                        sent = self.control.send(self.outgoing)
                    except BlockingIOError:
                        sent = 0
                    if sent:
                        del self.outgoing[:sent]
                if mask & selectors.EVENT_READ:
                    try:
                        data = self.control.recv(16384)
                    except BlockingIOError:
                        continue
                    if not data:
                        self.disconnect()
                        return
                    self.incoming.extend(data)
                    if len(self.incoming) > 65536:
                        raise ValueError("oversized control frame")
                    while b"\n" in self.incoming:
                        line, _, rest = self.incoming.partition(b"\n")
                        self.incoming = bytearray(rest)
                        message = json.loads(line)
                        if not isinstance(message, dict) or message.get("op") != "terminate":
                            raise ValueError("unsupported control operation")
                        grace = message.get("grace", 1.0)
                        if isinstance(grace, bool) or not isinstance(grace, (int, float)):
                            raise ValueError("invalid grace")
                        grace = float(grace)
                        if not math.isfinite(grace) or grace < 0:
                            raise ValueError("invalid grace")
                        self.terminate(grace)
        except OSError:
            self.disconnect()
        except Exception as exc:
            self.error("invalid control message", exc)
            self.incoming.clear()

    def discover(self) -> bool:
        complete = True
        scan_deadline = time.monotonic() + 0.02
        parents: list[Pin | None] = [None, *self.pins.values()]
        visited: set[tuple[int, int]] = set()
        index = 0
        while index < len(parents):
            if index and time.monotonic() >= scan_deadline:
                # Bound traversal so control handling/escalation cannot starve
                # behind a process continuously forking more descendants.
                complete = False
                break
            parent = parents[index]
            index += 1
            parent_pid = self.owner if parent is None else parent.pid
            key = (parent_pid, -1 if parent is None else parent.start)
            if key in visited:
                continue
            visited.add(key)
            try:
                if parent is not None and dead(parent):
                    continue
                for pid in children(parent_pid):
                    before = stat(pid)
                    if before is None or before[0] != parent_pid:
                        continue
                    key = (pid, before[1])
                    if key in self.pins:
                        continue
                    try:
                        fd = os.pidfd_open(pid)
                    except ProcessLookupError:
                        continue
                    try:
                        if stat(pid) != before:
                            continue
                        # Verify exact parent remains alive after membership read.
                        if parent is not None:
                            info = stat(parent.pid)
                            if info is None or info[1] != parent.start or dead(parent):
                                continue
                        pin = Pin(pid, before[1], fd)
                        self.pins[key] = pin
                        parents.append(pin)
                        fd = -1
                    finally:
                        if fd >= 0:
                            os.close(fd)
            except Exception as exc:
                complete = False
                self.error("descendant discovery failed", exc)
        return complete

    def poll_leader(self) -> None:
        if self.leader is not None and not self.exit_reported:
            status = self.leader.poll()
            if status is not None:
                self.exit_reported = True
                self.emit("exit", returncode=status)
                self.io(0.0)

    def reap(self) -> None:
        for key, pin in list(self.pins.items()):
            try:
                info = stat(pin.pid)
                # Only Popen can wait on the original leader.
                if (
                    (
                        self.leader is None
                        or self.exit_reported
                        or pin.pid != self.leader.pid
                    )
                    and info == (self.owner, pin.start)
                ):
                    try:
                        os.waitid(os.P_PIDFD, pin.fd, os.WEXITED | os.WNOHANG)
                    except ChildProcessError:
                        pass
                if dead(pin):
                    if stat(pin.pid) == (self.owner, pin.start):
                        continue
                    os.close(pin.fd)
                    del self.pins[key]
            except Exception as exc:
                self.error("descendant reap failed", exc)

    def signal_descendants(self) -> None:
        if self.stop_at is None:
            return
        now = time.monotonic()
        kill = now >= self.kill_at
        for pin in list(self.pins.values()):
            try:
                if not pin.termed:
                    signal.pidfd_send_signal(pin.fd, signal.SIGTERM)
                    pin.termed = True
                if kill:
                    signal.pidfd_send_signal(pin.fd, signal.SIGKILL)
            except ProcessLookupError:
                pass
            except Exception as exc:
                self.error("descendant signal failed", exc)
        if now - self.stop_at >= 10.0 and not self.timeout_reported:
            self.timeout_reported = True
            self.error("cleanup exceeded ten seconds; retaining descendant ownership")

    def run(self, command: str) -> int:
        try:
            subreaper()
            self.leader = subprocess.Popen(
                ["/bin/sh", "-c", command], start_new_session=True, close_fds=True
            )
            self.emit("started", pid=self.leader.pid)
        except Exception as exc:
            self.error("command setup failed", exc)
        finally:
            # Child owns independent references; worker copies delay pipe EOF.
            for fd in (0, 1, 2):
                try:
                    os.close(fd)
                except OSError:
                    pass
        while True:
            try:
                if self.signal_requested:
                    self.terminate(0.5)
                self.poll_leader()
                complete = self.discover()
                self.signal_descendants()
                self.poll_leader()
                self.reap()
                if complete and not self.pins and (self.leader is None or self.exit_reported):
                    # Reaping can adopt grandchildren; recheck root ownership.
                    if not children(self.owner):
                        self.emit("settled", clean=True)
                        end = time.monotonic() + 0.25
                        while self.connected and self.outgoing and time.monotonic() < end:
                            self.io()
                        return 1 if self.failed else 0
                self.io()
            except Exception as exc:
                self.error("worker iteration failed", exc)
                self.signal_descendants()
                self.io()


class QuietParser(argparse.ArgumentParser):
    def error(self, message: str) -> Never:
        raise ValueError("invalid worker arguments")


def main() -> int:
    parser = QuietParser(exit_on_error=False, add_help=False)
    parser.add_argument("--control-fd", required=True, type=int)
    parser.add_argument("--command", required=True)
    try:
        args, extras = parser.parse_known_args()
        if extras or args.control_fd < 3:
            return 2
        worker = Worker(socket.socket(fileno=args.control_fd))
    except (Exception, SystemExit):
        return 2  # No subprocess spawned; no argument echo to standard streams.

    def request_cleanup(_signum: int, _frame: object) -> None:
        worker.signal_requested = True

    for signum in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(signum, request_cleanup)
    # An inherited SIG_IGN would auto-reap children and destroy leader status.
    signal.signal(signal.SIGCHLD, signal.SIG_DFL)
    return worker.run(args.command)


if __name__ == "__main__":
    raise SystemExit(main())
