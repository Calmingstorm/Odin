import base64
import builtins
import io
import json
import subprocess
import sys
import threading
from types import SimpleNamespace

from src.tools import process_manager as pm


def test_real_embedded_supervisor_never_claims_escaped_descendants_empty(monkeypatch):
    files = {}

    class File(io.BytesIO):
        def __init__(self, path, text):
            super().__init__(files.get(path, b""))
            self.path, self.text = path, text

        def write(self, value):
            return super().write(value.encode() if isinstance(value, str) else value)

        def close(self):
            files[self.path] = self.getvalue()
            super().close()

        def read(self, *args):
            value = super().read(*args)
            return value.decode() if self.text else value

    def open_file(path, mode="r", **kwargs):
        if path.startswith("/proc/"):
            raise FileNotFoundError
        return File(path, "b" not in mode)

    monkeypatch.setattr(builtins, "open", open_file)
    monkeypatch.setattr(sys, "argv", [
        "supervisor", "/fixture", "fixture", base64.b64encode(b"fixture").decode(), "1",
    ])
    monkeypatch.setattr(pm.os, "umask", lambda mode: None)
    monkeypatch.setattr(pm.os, "setsid", lambda: None)
    monkeypatch.setattr(pm.os, "open", lambda *args: 9123)
    monkeypatch.setattr(pm.os, "close", lambda fd: None)
    monkeypatch.setattr(pm.os, "getpgid", lambda pid: 101)
    monkeypatch.setattr(pm.os, "getsid", lambda pid: 99)
    monkeypatch.setattr(pm.os, "replace", lambda source, dest: files.update({dest: files[source]}))
    monkeypatch.setattr(pm.os, "killpg", lambda *args: (_ for _ in ()).throw(ProcessLookupError()))
    monkeypatch.setattr(pm.signal, "signal", lambda *args: None)
    monkeypatch.setattr(subprocess, "check_output", lambda *args, **kwargs: b"fixture-start")
    leader = SimpleNamespace(pid=101, returncode=0, poll=lambda: 0, wait=lambda **kwargs: 0)
    monkeypatch.setattr(subprocess, "Popen", lambda *args, **kwargs: leader)
    monkeypatch.setattr(threading, "Thread", lambda **kwargs: SimpleNamespace(
        start=lambda: None, join=lambda **kwargs: None,
    ))
    exec(compile(pm._REMOTE_SUPERVISOR, "<supervisor-fixture>", "exec"), {})
    record = json.loads(files["/fixture/exit.json"])
    assert record["group_empty"] is True
    assert record["empty"] is False
    assert record["containment"] == "process_group_only"
    assert record["exit_code"] == 0
