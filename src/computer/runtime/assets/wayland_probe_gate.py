#!/usr/bin/python3
"""Gated parent-death-bound exec; no desktop access before durable PID recording."""

import ctypes
import json
import os
import select
import signal
import subprocess
import sys
import time
from pathlib import Path


def reap_owned(child):
    if child.poll() is None:
        child.terminate()
        try:
            child.wait(timeout=1)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait(timeout=1)
    end = time.monotonic() + 1
    while time.monotonic() < end:
        adopted = Path(f"/proc/self/task/{os.getpid()}/children").read_text().split()
        if not adopted:
            return
        for value in adopted:
            try:
                os.kill(int(value), signal.SIGKILL)
            except ProcessLookupError:
                pass
        while True:
            try:
                pid, _ = os.waitpid(-1, os.WNOHANG)
            except ChildProcessError:
                pid = 0
            if pid == 0:
                break
        time.sleep(0.025)
    raise RuntimeError("probe_outer_cleanup_failed")


def supervise(argv):
    stopping = False

    def stop(_signal, _frame):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    child = subprocess.Popen(argv, stdin=subprocess.DEVNULL)
    try:
        deadline = time.monotonic() + 78
        while child.poll() is None and not stopping and time.monotonic() < deadline:
            time.sleep(0.025)
        return child.returncode if child.returncode is not None else 124
    finally:
        reap_owned(child)


def main():
    parent = int(sys.argv[1])
    libc = ctypes.CDLL(None, use_errno=True)
    if (
        libc.prctl(36, 1, 0, 0, 0)
        or libc.prctl(1, signal.SIGTERM, 0, 0, 0)
        or os.getppid() != parent
    ):
        return 2
    os.write(1, b"PROBE_GATE_READY\n")
    deadline = time.monotonic() + 10
    data = bytearray()
    while time.monotonic() < deadline and len(data) < 32768:
        if not select.select([0], [], [], max(0, deadline - time.monotonic()))[0]:
            break
        chunk = os.read(0, 4096)
        if not chunk:
            return 2
        data.extend(chunk)
        if b"\n" in data:
            argv = json.loads(data)
            if (
                not isinstance(argv, list)
                or not all(type(x) is str for x in argv)
                or argv[:2] != ["/usr/bin/bwrap", "--unshare-all"]
            ):
                return 2
            if os.getppid() != parent:
                return 2
            return supervise(argv)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
