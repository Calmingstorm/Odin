"""Production C guardian, fake libei transport + real libxkbcommon keymaps.

No display/socket/session is opened. These tests are source safety regressions,
not compositor/toolkit release qualification. Reuses the isolated pipe fixture.
"""
from __future__ import annotations

import importlib.util
import json
import os
import select
import signal
import subprocess
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src/computer/runtime/assets/wayland_owned_input.c"
spec = importlib.util.spec_from_file_location(
    "wayland_fixture", ROOT / "scripts/computer-feasibility/wayland-owned-input-test.py"
)
assert spec and spec.loader
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

HEADER = fixture.HEADER.replace(
    "EI_EVENT_DEVICE_PAUSED };", "EI_EVENT_DEVICE_PAUSED, EI_EVENT_KEYBOARD_MODIFIERS };"
).replace("#endif", """
struct ei_keymap;
enum ei_keymap_type { EI_KEYMAP_TYPE_XKB=1 };
struct ei_keymap *ei_device_keyboard_get_keymap(struct ei_device *);
enum ei_keymap_type ei_keymap_get_type(struct ei_keymap *);
size_t ei_keymap_get_size(struct ei_keymap *);
int ei_keymap_get_fd(struct ei_keymap *);
uint32_t ei_event_keyboard_get_xkb_mods_depressed(struct ei_event *);
uint32_t ei_event_keyboard_get_xkb_mods_latched(struct ei_event *);
uint32_t ei_event_keyboard_get_xkb_mods_locked(struct ei_event *);
uint32_t ei_event_keyboard_get_xkb_group(struct ei_event *);
#endif
""").replace("#include <stdint.h>", "#include <stdint.h>\n#include <stddef.h>")

LIBRARY = fixture.LIBRARY.replace(
    '#include "libei.h"', '#include "libei.h"\n#include <xkbcommon/xkbcommon.h>'
).replace(
    "static struct ei_region region;",
    "static struct ei_region region, second; static int region_gone, changed;"
).replace(
    "static uint64_t clock_us=1000000;", "static uint64_t clock_us=1000000;"
).replace(
    "clock_us+=5000;", "clock_us+=1000;"
).replace(
    "(void)d;(void)x;(void)y;", '(void)d;emit("MOVE %.3f %.3f\\n",x,y);'
).replace(
    "(void)d; return n==0 ? &region : NULL;",
    '(void)d; if(region_gone)return NULL; if(n==1 && getenv("FAKE_MULTI"))return &second; '
    'return n==0 ? &region : NULL;'
).replace(
    '(void)r; const char *mode=getenv("FAKE_MAPPING");',
    'if(r==&second){return getenv("FAKE_DUPLICATE")?"source-1":"source-2";} '
    'const char *mode=getenv("FAKE_MAPPING");'
).replace(
    "(void)r;return 100;", "return r==&second?1000:100;"
).replace(
    "(void)r;return 800;", "(void)r;return changed?799:800;"
).replace(
    "if(signal=='D') add(EI_EVENT_DEVICE_REMOVED,&keyboard);",
    """if(signal=='D') add(EI_EVENT_DEVICE_REMOVED,&keyboard);
    if(signal=='G') region_gone=1;
    if(signal=='Z') changed=1;
    if(signal=='A') add(EI_EVENT_DEVICE_RESUMED,&pointer);
    if(signal=='L') add(EI_EVENT_KEYBOARD_MODIFIERS,&keyboard);"""
) + r"""
struct ei_keymap { int fd; size_t size; };
static struct ei_keymap km;
struct ei_keymap *ei_device_keyboard_get_keymap(struct ei_device *dev) {
 (void)dev;
 if(getenv("FAKE_NO_KEYMAP"))return NULL;
 struct xkb_context *ctx=xkb_context_new(XKB_CONTEXT_NO_FLAGS);
 struct xkb_rule_names names={.layout=getenv("FAKE_LAYOUT"),.options=getenv("FAKE_XKB_OPTIONS")};
 if(!names.layout)names.layout="us";
 struct xkb_keymap *map=xkb_keymap_new_from_names(ctx,&names,XKB_KEYMAP_COMPILE_NO_FLAGS);
 if(!map)_exit(96);
 char *text=xkb_keymap_get_as_string(map,XKB_KEYMAP_FORMAT_TEXT_V1);
 char path[]="/tmp/odin-guardian-fake-keymap-XXXXXX";
 km.fd=mkstemp(path);unlink(path);km.size=strlen(text)+(getenv("FAKE_NO_NUL")?0:1);
 if(write(km.fd,text,km.size)!=(ssize_t)km.size)_exit(97);
 free(text);xkb_keymap_unref(map);xkb_context_unref(ctx);return &km;
}
enum ei_keymap_type ei_keymap_get_type(struct ei_keymap *m){(void)m;return EI_KEYMAP_TYPE_XKB;}
size_t ei_keymap_get_size(struct ei_keymap *m){return m->size;}
int ei_keymap_get_fd(struct ei_keymap *m){return m->fd;}
uint32_t ei_event_keyboard_get_xkb_mods_depressed(struct ei_event *e){(void)e;return 1;}
uint32_t ei_event_keyboard_get_xkb_mods_latched(struct ei_event *e){(void)e;return 0;}
uint32_t ei_event_keyboard_get_xkb_mods_locked(struct ei_event *e){(void)e;return 0;}
uint32_t ei_event_keyboard_get_xkb_group(struct ei_event *e){(void)e;return 0;}
"""


@pytest.fixture(scope="module")
def binaries(tmp_path_factory):
    root = tmp_path_factory.mktemp("wayland-guardian-r8")
    (root / "libei.h").write_text(HEADER)
    (root / "fake.c").write_text(LIBRARY)
    flags = ["cc", "-std=c11", "-Wall", "-Wextra", "-Werror", "-I", str(root)]
    libraries = subprocess.check_output(
        ["pkg-config", "--cflags", "--libs", "xkbcommon"], text=True
    ).split()
    result = []
    for faults in (False, True):
        binary = root / ("faults" if faults else "production")
        subprocess.run(flags + (["-DWAYLAND_FIXTURE_FAULTS"] if faults else []) + [
            str(SOURCE), str(root / "fake.c"), *libraries, "-lm", "-o", str(binary)
        ], check=True, timeout=30)
        result.append(binary)
    return result


class Guardian(fixture.Guardian):
    def __init__(self, binary, **kwargs):
        super().__init__(binary, **kwargs)
        self.receipts = []
        self.stdout_partial = b""
        if self.proc.stdout:
            os.set_blocking(self.proc.stdout.fileno(), False)
        self.await_ready = kwargs.get("mapping", "source-1") == "source-1"
        if self.await_ready and self.proc.stdout and not os.getenv("FAKE_DUPLICATE"):
            self.event("ready")
        else:
            time.sleep(0.08)

    def outputs(self):
        if not self.proc.stdout:
            return
        while True:
            try:
                data = os.read(self.proc.stdout.fileno(), 8192)
            except BlockingIOError:
                return
            if not data:
                return
            self.stdout_partial += data
            while b"\n" in self.stdout_partial:
                line, self.stdout_partial = self.stdout_partial.split(b"\n", 1)
                self.receipts.append(json.loads(line))

    def event(self, name, count=1):
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            self.drain()
            self.outputs()
            events = [r for r in self.receipts if r["event"] == name]
            if len(events) >= count:
                return events[-1]
            if self.proc.poll() is not None:
                raise AssertionError((self.proc.returncode, self.receipts, self.lines))
            select.select([self.trace_r, self.proc.stdout], [], [], 0.002)
        raise AssertionError((name, self.receipts, self.lines))

    def finish(self):
        self.read_until(lambda: self.proc.poll() is not None, timeout=4)
        self.outputs()
        error = self.proc.stderr.read()
        assert not error, error
        return self.proc.returncode, self.receipts


@pytest.fixture
def guardian(binaries):
    instances = []

    def make(*, faults=False, **kwargs):
        obj = Guardian(binaries[int(faults)], **kwargs)
        instances.append(obj)
        return obj

    yield make
    for obj in instances:
        obj.close()


def test_readiness_and_single_fd_owner(guardian):
    g = guardian()
    ready = g.event("ready")
    assert (ready["width"], ready["height"], ready["text"]) == (800, 600, True)
    assert ready["keymap_format"] == "xkb_v1"
    assert "x" not in ready and "y" not in ready
    target = os.readlink(f"/proc/{g.proc.pid}/fd/{g.backend_r}")
    copies = [p for p in Path(f"/proc/{g.proc.pid}/fd").iterdir() if os.readlink(p) == target]
    assert len(copies) == 1
    g.send(b"C\n")
    assert g.finish()[0] == 0


@pytest.mark.parametrize("ending", [
    b"R\n", b"C\n", b"R\nH 31 273 160 260 2000\n", b"C\nH 31 273 160 260 2000\n", None, "signal"])
def test_legacy_exact_ledger_and_fence(guardian, ending):
    g = guardian()
    g.hold()
    if ending is None:
        g.proc.stdin.close()
    elif ending == "signal":
        g.proc.send_signal(signal.SIGTERM)
    else:
        g.send(ending)
    assert g.finish()[0] == 0
    assert g.inputs() == [
        ["BUTTON", "272", "1"], ["KEY", "30", "1"], ["KEY", "30", "0"], ["BUTTON", "272", "0"]]
    release = next(i for i, s in enumerate(g.lines) if s.startswith("BUTTON 272 0"))
    assert all(i > release for i, s in enumerate(g.lines) if s.startswith("STOP"))


@pytest.mark.parametrize("output", ["normal", "blocked", "lost"])
def test_independent_lease_nonblocking_observer(guardian, output):
    g = guardian(output=output)
    g.hold(60)
    g.send(b"N\nN\nH partial")
    assert g.finish()[0] == 2
    keys = [s.split() for s in g.lines if s.startswith("KEY ")]
    assert 60000 <= int(keys[1][3]) - int(keys[0][3]) <= 65000


@pytest.mark.parametrize("command", [
    b"F\n", b"B 2001\n", b"B 0\n", b"B -1\n", b"B 9 extra\n", b"B 100\nB 100\n",
    b"B 100\nM nan 0\n", b"B 100\nM 800 1\n", b"B 100\nM 1 600\n", b"B 100\nP 271 0 0\n",
    b"B 100\nK 2 30 30\n", b"B 100\nD 272 257\n", b"B 100\nT 00\n", b"B 100\nT zz\n",
    b"B 100\nT 7f\n", b"B 100\nT " + b"61" * 257 + b"\n", b"\x00", b"x" * 32768, b"\r\n"])
def test_malformed_never_injects(guardian, command):
    g = guardian()
    g.send(command)
    assert g.finish()[0] == 2
    assert g.inputs() == []


def test_bad_repeated_hold_releases_original(guardian):
    g = guardian()
    g.hold()
    g.send(b"H 31 273 150 250 100\n")
    assert g.finish()[0] == 2
    assert g.inputs()[-2:] == [["KEY", "30", "0"], ["BUTTON", "272", "0"]]


def test_multiaction_same_ei_context(guardian):
    g = guardian()
    for n, cmd in enumerate(
        [b"M 10 20", b"P 272 30 40", b"D 273 3 1 2 3 4 5 6", b"K 2 29 30", b"T 6141"], 1
    ):
        g.send(b"B 1000\n" + cmd + b"\n")
        g.event("action_done", n)
        assert g.proc.poll() is None
    g.send(b"R\n")
    assert g.finish()[0] == 0
    assert sum(s.startswith("HANDSHAKE") for s in g.lines) == 1
    assert "MOVE 110.000 220.000" in g.lines
    assert "MOVE 105.000 206.000" in g.lines
    inputs = g.inputs()
    for kind in ("KEY", "BUTTON"):
        downs = sorted(s[1] for s in inputs if s[0] == kind and s[2] == "1")
        ups = sorted(s[1] for s in inputs if s[0] == kind and s[2] == "0")
        assert downs == ups


@pytest.mark.parametrize("layout,expected", [("us", 21), ("de", 44), ("fr", 21)])
@pytest.mark.parametrize("nul_terminated", [True, False])
def test_text_uses_current_ei_keymap(guardian, monkeypatch, layout, expected, nul_terminated):
    monkeypatch.setenv("FAKE_LAYOUT", layout)
    if not nul_terminated:
        monkeypatch.setenv("FAKE_NO_NUL", "1")
    g = guardian()
    g.send(b"B 1000\nT 79\n")  # y, swaps physical position in German
    g.event("action_done")
    g.send(b"R\n")
    assert g.finish()[0] == 0
    assert ["KEY", str(expected), "1"] in g.inputs()


def test_text_refuses_external_modifier_state(guardian):
    g = guardian()
    os.write(g.backend_w, b"L")
    time.sleep(0.01)
    g.send(b"B 1000\nT 61\n")
    assert g.finish()[0] == 2
    assert g.inputs() == []


def test_missing_keymap_explicit_capability(guardian, monkeypatch):
    monkeypatch.setenv("FAKE_NO_KEYMAP", "1")
    g = guardian()
    assert g.event("ready")["text"] is False
    g.send(b"B 100\nT 61\n")
    assert g.finish()[0] == 2
    assert not g.inputs()


def test_multimonitor_exact_selection_and_private_offsets(guardian, monkeypatch):
    monkeypatch.setenv("FAKE_MULTI", "1")
    g = guardian()
    g.send(b"S source-2\n")
    selected = g.event("selected")
    assert "x" not in selected
    g.send(b"B 100\nM 10 20\n")
    g.event("action_done")
    g.send(b"R\n")
    assert g.finish()[0] == 0
    assert "MOVE 1010.000 220.000" in g.lines


def test_duplicate_mapping_rejected(guardian, monkeypatch):
    monkeypatch.setenv("FAKE_MULTI", "1")
    monkeypatch.setenv("FAKE_DUPLICATE", "1")
    g = guardian()
    g.send(b"B 100\nM 1 2\n")
    assert g.finish()[0] == 2
    assert not g.inputs()


@pytest.mark.parametrize("loss", [b"X", b"P", b"D", b"G", b"Z", b"A"])
def test_dynamic_path_loss_cancels_no_replacement(guardian, loss):
    g = guardian()
    g.hold()
    os.write(g.backend_w, loss)
    assert g.finish()[0] == 3
    inputs = g.inputs()
    if loss == b"X":
        assert len(inputs) == 2
    if loss == b"P":
        assert ["BUTTON", "272", "0"] not in inputs
        assert ["KEY", "30", "0"] in inputs
    if loss == b"D":
        assert ["KEY", "30", "0"] not in inputs
        assert ["BUTTON", "272", "0"] in inputs


def test_fault_command_only_explicit_fixture_binary(guardian):
    g = guardian(faults=True)
    g.hold()
    g.send(b"F\n")
    assert g.finish()[0] == 0
    assert len(g.inputs()) == 2
    assert any(r["event"] == "guardian_loss" for r in g.receipts)


def test_lease_deadline_checked_before_late_action(guardian):
    g = guardian()
    g.send(b"B 1\n")
    g.event("begun")
    time.sleep(0.01)
    try:
        g.send(b"P 272 0 0\n")
    except BrokenPipeError:
        pass
    assert g.finish()[0] == 2
    assert not g.inputs()


def test_idle_heartbeat_not_permanent_authority(guardian):
    g = guardian()
    g.send(b"N\n")
    assert g.event("idle")["reason"] == "controller-heartbeat"
    assert g.finish()[0] == 2
    assert g.receipts[-1]["reason"] == "controller-timeout"


@pytest.mark.parametrize(
    "program", [b"D 272 256 " + b"10 20 " * 255 + b"30 40", b"T " + b"61" * 256])
def test_maximum_program_completes_within_nonrenewed_lease(guardian, program):
    g = guardian()
    g.send(b"B 2000\n" + program + b"\n")
    done = g.event("action_done")
    begun = next(r for r in g.receipts if r["event"] == "begun")
    assert done["monotonic_us"] - begun["monotonic_us"] < 2000000
    g.send(b"R\n")
    assert g.finish()[0] == 0


def test_partial_queued_command_cannot_cross_action_boundary(guardian):
    g = guardian()
    g.send(b"B 1000\nP 272 1 2\nB ")
    assert g.finish()[0] == 2
    assert not any(r["event"] == "action_done" for r in g.receipts)
    assert g.inputs() == [["BUTTON", "272", "1"], ["BUTTON", "272", "0"]]


def test_active_heartbeat_does_not_extend_program_or_expire_idle(guardian):
    g = guardian()
    g.send(b"B 50\nD 272 256 " + b"10 20 " * 255 + b"30 40\nN\n")
    assert g.finish()[0] == 2
    assert g.receipts[-1]["reason"] == "lease-expired"
    assert g.inputs() == [["BUTTON", "272", "1"], ["BUTTON", "272", "0"]]


@pytest.mark.parametrize("layout,expected", [("us", 21), ("de", 44)])
def test_named_chord_uses_current_layout(guardian, monkeypatch, layout, expected):
    monkeypatch.setenv("FAKE_LAYOUT", layout)
    g = guardian()
    g.send(b"B 1000\nJ ctrl+y\n")
    g.event("action_done")
    g.send(b"R\n")
    assert g.finish()[0] == 0
    assert g.inputs()[:2] == [["KEY", "29", "1"], ["KEY", str(expected), "1"]]


def test_named_modifier_follows_current_caps_control_swap(guardian, monkeypatch):
    monkeypatch.setenv("FAKE_XKB_OPTIONS", "ctrl:swapcaps")
    g = guardian()
    g.send(b"B 1000\nJ ctrl+a\n")
    g.event("action_done")
    g.send(b"R\n")
    assert g.finish()[0] == 0
    assert g.inputs()[:2] == [["KEY", "58", "1"], ["KEY", "30", "1"]]
    assert ["KEY", "29", "1"] not in g.inputs()


@pytest.mark.parametrize(
    "chord", [b"ctrl+NotAKey", b"ctrl+ctrl+a", b"hyper+a", b"ctrl+", b"ctrl++a"])
def test_named_chord_refuses_unknown_or_malformed(guardian, chord):
    g = guardian()
    g.send(b"B 1000\nJ " + chord + b"\n")
    assert g.finish()[0] == 2
    assert not g.inputs()


def test_named_chord_refuses_unknown_keymap(guardian, monkeypatch):
    monkeypatch.setenv("FAKE_NO_KEYMAP", "1")
    g = guardian()
    g.send(b"B 1000\nJ ctrl+a\n")
    assert g.finish()[0] == 2
    assert not g.inputs()
