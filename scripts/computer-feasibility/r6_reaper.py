"""Experiment-local subreaper; signal exact owned children and explicitly wait."""

import ctypes
import os
import signal
import time
from pathlib import Path


class Reaper:
    def __init__(self):
        if ctypes.CDLL(None, use_errno=True).prctl(36, 1, 0, 0, 0):
            raise RuntimeError("subreaper_setup_failed")
        self.reaped = []

    def children(self):
        result = set()
        for task in Path("/proc/self/task").iterdir():
            try:
                result.update(map(int, (task / "children").read_text().split()))
            except FileNotFoundError:
                pass
        return result

    def close(self):
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            for pid in self.children():
                try:
                    fd = os.pidfd_open(pid)
                    try:
                        if pid in self.children():
                            signal.pidfd_send_signal(fd, signal.SIGKILL)
                    finally:
                        os.close(fd)
                except ProcessLookupError:
                    pass
            while True:
                try:
                    pid, status = os.waitpid(-1, os.WNOHANG)
                except ChildProcessError:
                    pid = 0
                if not pid:
                    break
                self.reaped.append({"pid": pid, "status": status})
            if not self.children():
                return {"remaining_children": 0, "reaped": self.reaped}
            time.sleep(0.03)
        raise RuntimeError("owned_children_not_reaped")
