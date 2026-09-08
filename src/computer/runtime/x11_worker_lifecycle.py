"""Private pipe launch gates. No input before durable identity acknowledgement."""

from __future__ import annotations

import ctypes
import json
import os
import select
import signal
import sys
import time

from .recovery import process_identity

REVOKED = False


def revoke(signum, frame):
    global REVOKED
    REVOKED = True


def parent_watch(*, injector=False):
    """Supervisor TERM means revoke/release, never immediate termination."""
    parent = os.getppid()
    for sig in (signal.SIGTERM, signal.SIGHUP, signal.SIGINT):
        signal.signal(sig, revoke)
    sig = signal.SIGKILL if injector else signal.SIGTERM
    if ctypes.CDLL(None, use_errno=True).prctl(1, sig, 0, 0, 0) != 0:
        raise RuntimeError("parent_watch_unavailable")
    if os.getppid() != parent:
        revoke(0, None)
    if injector:
        signal.alarm(4)  # Independent of caller and supervisor pipes.


def read_gate(fd=0, timeout=2.0):
    deadline, line = time.monotonic() + timeout, bytearray()
    while len(line) <= 65536:
        if REVOKED or time.monotonic() >= deadline:
            raise RuntimeError("launch_gate_revoked")
        if not select.select([fd], [], [], min(0.05, max(0, deadline - time.monotonic())))[0]:
            continue
        char = os.read(fd, 1)
        if char == b"\n":
            return json.loads(line)
        if not char:
            raise RuntimeError("launch_gate_eof")
        line.extend(char)
    raise RuntimeError("launch_gate_limit")


def announce(role, pid=None):
    identity = process_identity(os.getpid() if pid is None else pid)
    print(json.dumps({"ready": role, "identity": identity}), file=sys.__stdout__, flush=True)
    return identity


def acknowledge(identity):
    if read_gate() != {"ack": identity}:
        raise RuntimeError("launch_ack_mismatch")
