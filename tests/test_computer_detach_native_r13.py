"""Focused native-contract mocks for disposable X11 session pairs."""
from __future__ import annotations

import ctypes as C  # noqa: N812 - native ABI convention

import pytest

from src.computer.runtime import x11_owned_device as m
from tests.test_computer_x11_owned_device_r5 import Fake


def test_private_xvfb_detach_lifecycle_r13(tmp_path):
    """Actual isolated Xvfb lifecycle, lease fence, recovery, and grab evidence."""
    import json
    import shutil
    import subprocess
    import sys
    from pathlib import Path

    if not all(shutil.which(command) for command in ("Xvfb", "xauth", "xinput")):
        pytest.skip("private X11 utilities unavailable")
    root = Path(__file__).resolve().parents[1]
    report = tmp_path / "owned-detach-r13.json"
    supervisor = root / "scripts/computer-feasibility/owned-test-supervisor-r6.py"
    result = subprocess.run(
        [sys.executable, "-B", str(supervisor), "--deadline", "55", "--grace", "2",
         "--report", str(report), "--", sys.executable, "-B", "-I",
         str(root / "tests/fixtures/computer_detach_live_r13.py")],
        cwd=root, env={"PATH": "/usr/bin", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8",
                       "HOME": str(tmp_path), "XAUTHORITY": "/dev/null",
                       "PYTHONDONTWRITEBYTECODE": "1"}, capture_output=True, text=True, timeout=65)
    assert result.returncode == 0, result.stdout + result.stderr
    owned_report = json.loads(report.read_text())
    assert owned_report["completed"] and owned_report["cleanup_ok"]
    assert owned_report["census_complete"] and not owned_report["residuals"]
    evidence = json.loads(result.stdout.splitlines()[-1])
    assert evidence["server_alive"] is True
    assert all(receipt["owned_masters_removed"] for key, receipt in evidence.items()
               if key != "server_alive")
    assert evidence["backend_cycle"]["stopped"] is True


PREFIX = "Odin session 0123456789abcdef0123456789abcdef"


class SessionFake(Fake):
    def __init__(self):
        super().__init__()
        self.next_id, self.external_grab = 20, None
        self.x.XGrabServer = lambda *_: self.calls.append(("server_grab",))
        self.x.XUngrabServer = lambda *_: self.calls.append(("server_ungrab",))
        self.xi.XISetClientPointer = lambda _d, _w, ident: self.calls.append(("client", ident)) or 0
        self.xi.XIChangeHierarchy = self.change
        self.xi.XIGrabDevice = self.grab
        self.xi.XIUngrabDevice = lambda _d, ident, _time: self.calls.append(("ungrab", ident)) or 0

    def change(self, _display, change, count):
        typ = C.cast(change, C.POINTER(m._AddMaster)).contents.type
        if typ == 1:
            prefix = C.cast(change, C.POINTER(m._AddMaster)).contents.name.decode()
            pointer, keyboard, xt_pointer, xt_keyboard = range(self.next_id, self.next_id + 4)
            self.next_id += 4
            self.rows.extend([
                (pointer, prefix + " pointer", 1, keyboard, True),
                (keyboard, prefix + " keyboard", 2, pointer, True),
                (xt_pointer, prefix + " XTEST pointer", 3, pointer, True),
                (xt_keyboard, prefix + " XTEST keyboard", 4, keyboard, True),
            ])
            self.states.update({xt_pointer: {"buttons": {1}}, xt_keyboard: {"keys": {38}}})
            self.calls.append(("add", prefix))
        elif typ == 3:
            entries = C.cast(change, C.POINTER(m._AttachSlave))
            for n in range(count):
                item = entries[n]
                self.rows = [(ident, name, use,
                              item.new_master if ident == item.deviceid else attached, enabled)
                             for ident, name, use, attached, enabled in self.rows]
                self.calls.append(("attach", item.deviceid, item.new_master))
        elif typ == 2:
            remove = C.cast(change, C.POINTER(m._RemoveMaster)).contents
            names = {PREFIX + suffix for suffix in
                     (" pointer", " keyboard", " XTEST pointer", " XTEST keyboard")}
            self.rows = [row for row in self.rows if row[1] not in names]
            self.calls.append(("remove", remove.deviceid,
                               remove.return_pointer, remove.return_keyboard))
        else:
            raise AssertionError(typ)
        return 0

    def inject(self, kind, pointer, code, down):
        super().inject(kind, pointer, code, down)
        field = "keys" if kind == "key" else "buttons"
        state = self.states[pointer.contents.device_id][field]
        (state.add if down else state.discard)(code)
        return 1

    def grab(self, _display, ident, *_args):
        self.calls.append(("probe", ident))
        return int(ident == self.external_grab)


@pytest.fixture
def session(monkeypatch):
    fake = SessionFake()
    monkeypatch.setattr(m, "_load_native", lambda: (fake.x, fake.xi, fake.xt))
    native = m.SessionXTest(":987", PREFIX, create=True)
    yield fake, native
    native.close()


def test_session_create_refuses_adoption_and_open_never_creates(monkeypatch):
    fake = SessionFake()
    monkeypatch.setattr(m, "_load_native", lambda: (fake.x, fake.xi, fake.xt))
    created = m.SessionXTest(":987", PREFIX, create=True)
    with pytest.raises(m.X11DeviceError, match="session_prefix_exists"):
        m.SessionXTest(":987", PREFIX, create=True)
    created.close()
    opened = m.SessionXTest(":987", PREFIX, create=False)
    opened.close()
    assert sum(call[0] == "add" for call in fake.calls) == 1


def test_open_missing_session_never_creates(monkeypatch):
    fake = SessionFake()
    monkeypatch.setattr(m, "_load_native", lambda: (fake.x, fake.xi, fake.xt))
    with pytest.raises(m.X11DeviceError, match="session_not_found"):
        m.SessionXTest(":987", PREFIX, create=False)
    assert not any(call[0] == "add" for call in fake.calls)


def test_detach_releases_restores_probes_and_removes_only_owned_pair(session):
    fake, native = session
    pointer = next(row[0] for row in fake.rows if row[1] == PREFIX + " pointer")
    fake.rows = [(r[0], r[1], r[2], pointer if r[0] == 7 else r[3], r[4])
                 for r in fake.rows]
    assert native.detach_owned()["owned_masters_removed"] is True
    assert ("key", 23, 38, 0) in fake.calls and ("button", 22, 1, 0) in fake.calls
    assert ("attach", 7, 2) in fake.calls
    assert ("probe", 20) in fake.calls and ("probe", 21) in fake.calls
    assert fake.calls.index(("client", 2)) < fake.calls.index(("remove", 20, 2, 3))
    assert not any(row[1].startswith(PREFIX + " ") for row in fake.rows)
    assert next(row for row in fake.rows if row[0] == 8)[3] == 99


def test_external_master_grab_fails_without_clean_receipt(session):
    fake, native = session
    fake.external_grab = 20
    with pytest.raises(m.X11DeviceError, match="owned_master_grabbed"):
        native.detach_owned()
    assert not any(call[0] == "remove" for call in fake.calls)


@pytest.mark.parametrize("change", ["floating", "missing", "renamed", "hotplug"])
def test_ambiguous_nonowned_topology_cannot_be_cleaned_by_guessing(session, change):
    fake, native = session
    if change == "floating":
        fake.rows = [(r[0], r[1], 5, 0, r[4]) if r[0] == 7 else r for r in fake.rows]
    elif change == "missing":
        fake.rows = [r for r in fake.rows if r[0] != 7]
    elif change == "renamed":
        fake.rows = [(r[0], "replacement", *r[2:]) if r[0] == 7 else r for r in fake.rows]
    else:
        fake.rows.append((50, "new unknown floating device", 5, 0, True))
    with pytest.raises(m.X11DeviceError, match="session_physical_topology_changed"):
        native.detach_owned()
    assert not any(call[0] in {"attach", "remove"} for call in fake.calls)


def test_grab_failure_can_retry_after_physical_restoration(session):
    fake, native = session
    fake.rows = [(r[0], r[1], r[2], 20 if r[0] == 7 else r[3], r[4])
                 for r in fake.rows]
    fake.external_grab = 20
    with pytest.raises(m.X11DeviceError, match="owned_master_grabbed"):
        native.detach_owned()
    assert next(r for r in fake.rows if r[0] == 7)[3] == 2
    fake.external_grab = None
    assert native.detach_owned()["owned_devices"] == "removed"
