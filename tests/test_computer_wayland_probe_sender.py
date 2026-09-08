"""Native ABI unit coverage only, NEVER compositor behavioral qualification.

The C fixture records actual ctypes calls across a shared-library boundary.
It does not implement EIS or pretend that submitted input reached a desktop.
No desktop, compositor, or real libei connection is opened by these tests.
"""

import ast
import ctypes
import importlib.util
import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest

ASSET = (
    Path(__file__).resolve().parents[1]
    / "src/computer/runtime/assets/wayland_probe_sender.py"
)
SPEC = importlib.util.spec_from_file_location("private_probe_sender", ASSET)
sender = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sender)


NATIVE_FIXTURE = r"""
#include <stdbool.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

static int context, seat, devices[3];
struct event { int kind; int device; };
static struct event events[128];
static int count, next, fd = -1, missing, setup_error, refs, event_unrefs;
static char trace[32768];
static size_t length;
static void logline(const char *fmt, ...) {
    va_list args;
    va_start(args, fmt);
    length += vsnprintf(trace + length, sizeof(trace) - length, fmt, args);
    va_end(args);
}
static int indexof(void *d) {
    for (int i = 0; i < 3; i++) if (d == &devices[i]) return i;
    abort();
}
void fixture_event(int kind, int device) {
    events[count++] = (struct event){kind, device};
}
void fixture_reset(int omit, int fail) {
    count = next = refs = event_unrefs = 0;
    missing = omit; setup_error = fail;
    length = 0; trace[0] = 0;
}
const char *fixture_trace(void) { return trace; }
int fixture_refs(void) { return refs; }
int fixture_event_unrefs(void) { return event_unrefs; }
void *ei_new_sender(void *data) { if (data) abort(); return &context; }
void ei_configure_name(void *ctx, const char *name) {
    logline("name %s\n", name);
}
int ei_setup_backend_fd(void *ctx, int socket) {
    fd = socket;
    if (setup_error) return -1;
    fixture_event(1, -1); fixture_event(3, -1);
    return 0;
}
int ei_get_fd(void *ctx) { return fd; }
void ei_dispatch(void *ctx) { logline("dispatch\n"); }
void *ei_get_event(void *ctx) { return next < count ? &events[next++] : NULL; }
int ei_event_get_type(void *event) { return ((struct event *)event)->kind; }
void *ei_event_get_seat(void *event) { return &seat; }
void *ei_event_get_device(void *event) {
    int i = ((struct event *)event)->device;
    return i < 0 ? NULL : &devices[i];
}
void *ei_event_unref(void *event) { event_unrefs++; return NULL; }
void *ei_device_ref(void *device) { refs++; return device; }
void *ei_device_unref(void *device) { refs--; logline("device_unref\n"); return NULL; }
bool ei_device_has_capability(void *device, int cap) {
    int caps[3] = {2, 32, 4};
    return caps[indexof(device)] == cap && cap != missing;
}
void ei_seat_bind_capabilities(void *s, ...) {
    va_list args;
    va_start(args, s);
    int a = va_arg(args, int), b = va_arg(args, int), c = va_arg(args, int);
    void *end = va_arg(args, void *);
    va_end(args);
    if (s != &seat || a != 2 || b != 32 || c != 4 || end != NULL) abort();
    logline("bind %d %d %d\n", a, b, c);
    for (int i = 0; i < 3; i++) { fixture_event(5, i); fixture_event(8, i); }
}
void ei_device_start_emulating(void *d, uint32_t sequence) {
    logline("start %d %u\n", indexof(d), sequence);
}
void ei_device_stop_emulating(void *d) { logline("stop %d\n", indexof(d)); }
void ei_device_pointer_motion_absolute(void *d, double x, double y) {
    logline("move %d %.1f %.1f\n", indexof(d), x, y);
}
void ei_device_button_button(void *d, uint32_t key, bool down) {
    logline("button %d %u %d\n", indexof(d), key, down);
}
void ei_device_keyboard_key(void *d, uint32_t key, bool down) {
    logline("key %d %u %d\n", indexof(d), key, down);
}
uint64_t ei_now(void *ctx) { return UINT64_C(0x123456789abcdef0); }
void ei_device_frame(void *d, uint64_t timestamp) {
    if (timestamp != UINT64_C(0x123456789abcdef0)) abort();
    logline("frame %d\n", indexof(d));
}
void *ei_unref(void *ctx) {
    if (fd >= 0) { close(fd); fd = -1; }
    logline("unref\n"); return NULL;
}
"""


@pytest.fixture(scope="module")
def native_library(tmp_path_factory):
    path = tmp_path_factory.mktemp("native-probe-abi")
    source = path / "fake_libei.c"
    source.write_text(NATIVE_FIXTURE)
    library = path / "libei-fixture.so"
    subprocess.run(
        ["cc", "-shared", "-fPIC", "-std=c11", "-Werror", str(source), "-o", str(library)],
        check=True, capture_output=True, text=True, timeout=30,
    )
    lib = sender.bind_library(str(library))
    lib.fixture_reset.argtypes = [ctypes.c_int, ctypes.c_int]
    lib.fixture_reset.restype = None
    lib.fixture_event.argtypes = [ctypes.c_int, ctypes.c_int]
    lib.fixture_event.restype = None
    lib.fixture_trace.argtypes = []
    lib.fixture_trace.restype = ctypes.c_char_p
    for name in ("fixture_refs", "fixture_event_unrefs"):
        getattr(lib, name).argtypes = []
        getattr(lib, name).restype = ctypes.c_int
    return lib


@pytest.fixture
def driver(native_library):
    lib = native_library
    lib.fixture_reset(0, 0)
    left, right = socket.socketpair()
    owned = left.detach()
    instance = sender.Sender(lib, owned)
    try:
        instance.handshake(timeout=0.1)
        yield instance, lib
    finally:
        instance.close()
        right.close()


def trace(lib):
    return lib.fixture_trace().decode().splitlines()


def test_native_abi_handshake_and_pointer_width(driver):
    instance, lib = driver
    assert instance.ctx > 2**32  # catches accidental default c_int pointer returns
    assert instance.connected
    assert len(instance.active) == 3
    assert lib.fixture_refs() == 3
    assert lib.fixture_event_unrefs() == 8
    assert "bind 2 32 4" in trace(lib)
    assert {line for line in trace(lib) if line.startswith("start")} == {
        "start 0 1", "start 1 1", "start 2 1",
    }


def test_hold_uses_evdev_codes_and_frames_then_dispatch(driver):
    instance, lib = driver
    instance.hold()
    assert instance.held
    output = trace(lib)
    index = output.index("move 0 250.0 250.0")
    assert output[index:] == [
        "move 0 250.0 250.0", "frame 0", "button 1 272 1", "frame 1",
        "key 2 42 1", "frame 2", "dispatch",
    ]
    with pytest.raises(sender.ProbeError, match="already held"):
        instance.hold()


def test_orderly_release_before_stop_and_unref(driver):
    instance, lib = driver
    instance.hold()
    instance.close()
    output = trace(lib)
    assert output.index("button 1 272 0") < output.index("stop 1")
    assert output.index("key 2 42 0") < output.index("stop 2")
    assert output[-1] == "unref"
    assert lib.fixture_refs() == 0
    with pytest.raises(OSError):
        os.fstat(instance.fd)
    instance.close()  # idempotent


def test_fresh_and_escape_are_explicit_press_release_pairs(driver):
    instance, lib = driver
    instance.fresh()
    instance.escape()
    output = trace(lib)
    keys = [line for line in output if line.startswith(("button ", "key "))]
    assert keys == [
        "button 1 272 1", "button 1 272 0", "key 2 30 1", "key 2 30 0",
        "key 2 1 1", "key 2 1 0",
    ]
    for i, line in enumerate(output):
        if line.startswith(("button ", "key ", "move ")):
            assert output[i + 1].startswith("frame ")


@pytest.mark.parametrize("op", ["fresh", "escape"])
def test_neutral_commands_refuse_held_input(driver, op):
    instance, _ = driver
    instance.hold()
    with pytest.raises(sender.ProbeError, match="neutral sender"):
        getattr(instance, op)()


def test_resume_increases_sequence_and_references_drop(driver):
    instance, lib = driver
    lib.fixture_event(sender.DEVICE_PAUSED, 1)
    lib.fixture_event(sender.DEVICE_RESUMED, 1)
    instance.pump()
    assert "start 1 2" in trace(lib)
    lib.fixture_event(sender.DEVICE_REMOVED, 1)
    instance.pump()
    assert lib.fixture_refs() == 2
    with pytest.raises(sender.ProbeError, match="capability missing"):
        instance.device(sender.BUTTON)


def test_device_pause_during_hold_refuses_further_input(driver):
    instance, lib = driver
    instance.hold()
    lib.fixture_event(sender.DEVICE_PAUSED, 1)
    with pytest.raises(sender.ProbeError, match="lost while holding"):
        instance.pump()
    instance.close()
    assert "button 1 272 0" not in trace(lib)  # never send on paused device
    assert "key 2 42 0" in trace(lib)  # still release the surviving device


def test_disconnect_and_unknown_events_are_unrefed(driver):
    instance, lib = driver
    before = lib.fixture_event_unrefs()
    lib.fixture_event(999, -1)
    lib.fixture_event(sender.DISCONNECT, -1)
    with pytest.raises(sender.ProbeError, match="disconnected"):
        instance.pump()
    assert lib.fixture_event_unrefs() == before + 2
    assert not instance.active


@pytest.mark.parametrize("missing", [sender.ABSOLUTE, sender.BUTTON, sender.KEYBOARD])
def test_handshake_requires_every_resumed_capability(native_library, missing):
    lib = native_library
    lib.fixture_reset(missing, 0)
    left, right = socket.socketpair()
    instance = sender.Sender(lib, left.detach())
    try:
        with pytest.raises(sender.ProbeError, match="handshake timed out"):
            instance.handshake(timeout=0.01)
    finally:
        instance.close()
        right.close()


def test_setup_failure_unref_closes_owned_fd(native_library):
    lib = native_library
    lib.fixture_reset(0, 1)
    left, right = socket.socketpair()
    fd = left.detach()
    try:
        with pytest.raises(sender.ProbeError, match="backend setup failed"):
            sender.Sender(lib, fd)
        with pytest.raises(OSError):
            os.fstat(fd)
        assert trace(lib)[-1] == "unref"
    finally:
        right.close()


def read_commands(data):
    read, write = os.pipe()
    os.write(write, data)
    os.close(write)
    return sender.Commands(read), read


def test_bounded_reader_preserves_multiple_lines_and_normal_eof():
    commands, fd = read_commands(b'{"op":"hold"}\n{"op":"release"}\n')
    try:
        assert commands.read(time.monotonic() + 1) == "hold"
        assert commands.read(time.monotonic() + 1) == "release"
        assert commands.read(time.monotonic() + 1) is None
    finally:
        os.close(fd)


@pytest.mark.parametrize("data", [
    b"x" * 4097, b'{"op":"hold"}', b"\xff\n", b"garbage\n", b"[]\n",
    b'{"op":"hold","key":42}\n', b'{"op":"teleport"}\n', b'{"op":{}}\n',
])
def test_bounded_reader_rejects_malformed_or_oversized_input(data):
    commands, fd = read_commands(data)
    try:
        with pytest.raises(sender.ProbeError):
            commands.read(time.monotonic() + 1)
    finally:
        os.close(fd)


def test_reader_has_deadline_and_command_budget():
    read, write = os.pipe()
    try:
        with pytest.raises(sender.ProbeError, match="deadline"):
            sender.Commands(read).read(time.monotonic() - 1)
    finally:
        os.close(read)
        os.close(write)
    commands, fd = read_commands(b'{"op":"release"}\n' * 65)
    try:
        for _ in range(64):
            assert commands.read(time.monotonic() + 1) == "release"
        with pytest.raises(sender.ProbeError, match="budget"):
            commands.read(time.monotonic() + 1)
    finally:
        os.close(fd)


def test_handoff_rejects_duplicate_and_non_socket():
    left, right = socket.socketpair()
    duplicate = os.dup(left.fileno())
    try:
        with pytest.raises(sender.ProbeError, match="duplicate"):
            sender.verify_socket_handoff(left.fileno())
        os.close(duplicate)
        duplicate = -1
        sender.verify_socket_handoff(left.fileno())
    finally:
        if duplicate >= 0:
            os.close(duplicate)
        left.close()
        right.close()
    fd = os.open("/dev/null", os.O_RDONLY)
    try:
        with pytest.raises(OSError):
            sender.verify_socket_handoff(fd)
    finally:
        os.close(fd)


def test_main_refuses_without_private_environment_before_loading_libei():
    env = dict(os.environ)
    env.pop("ODIN_WAYLAND_PROBE_NONCE", None)
    result = subprocess.run(
        [sys.executable, str(ASSET), "--fd", "9999"],
        input='{"op":"handoff"}\n', env=env, capture_output=True, text=True, timeout=5,
    )
    assert result.returncode == 2
    record = json.loads(result.stdout)
    assert record["event"] == "error"
    assert "ready" not in result.stdout


def test_abrupt_eof_has_fresh_private_guard_and_no_orderly_teardown():
    # Structural safety contract, not a simulated compositor success result.
    tree = ast.parse(ASSET.read_text())
    branches = [node for node in ast.walk(tree) if isinstance(node, ast.If)
                and ast.unparse(node.test) == "op == 'eof'"]
    assert len(branches) == 1
    assert [ast.unparse(node) for node in branches[0].body] == [
        "assert_private_environment()", "os._exit(0)",
    ]
    assert "ei_setup_backend_socket" not in ASSET.read_text()
    assert "subprocess" not in ASSET.read_text()
