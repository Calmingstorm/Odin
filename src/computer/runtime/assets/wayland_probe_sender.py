#!/usr/bin/python3
"""Private SAME_STACK_DISPOSABLE EI sender, requiring no runtime compiler.

Run with ``--fd N`` in the probe namespace. The helper must close its copy of
the inherited EI socket, then write {"op":"handoff"} to stdin. Subsequent
commands are hold/release/fresh/escape/eof. Output is one JSON event per line.
``*_sent`` means framed/submitted, NOT compositor-observed qualification.
Only explicit eof is abrupt; normal stdin closure/errors release orderly.

ABI declarations/constants were checked against stock image libei-dev
1.3.901-1 /usr/include/libei-1.0/libei.h. libei has no ei_flush API: frame
submits event groups and dispatch services its nonblocking backend.
"""

import argparse
import ctypes as c
import json
import os
import select
import socket
import struct
import time

ABSOLUTE, KEYBOARD, BUTTON = 2, 4, 32
CONNECT, DISCONNECT, SEAT_ADDED = 1, 2, 3
DEVICE_ADDED, DEVICE_REMOVED, DEVICE_PAUSED, DEVICE_RESUMED = 5, 6, 7, 8
MAX_LINE = 4096


class ProbeError(RuntimeError):
    pass


def bind_library(library="libei.so.1"):
    """Declare every ABI boundary, including pointer/uint64 returns and varargs."""
    lib = c.CDLL(library)
    p, i, u, q, b, d = c.c_void_p, c.c_int, c.c_uint32, c.c_uint64, c.c_bool, c.c_double
    signatures = {
        "ei_new_sender": (p, [p]),
        "ei_configure_name": (None, [p, c.c_char_p]),
        "ei_setup_backend_fd": (i, [p, i]),
        "ei_get_fd": (i, [p]),
        "ei_dispatch": (None, [p]),
        "ei_get_event": (p, [p]),
        "ei_event_get_type": (i, [p]),
        "ei_event_get_seat": (p, [p]),
        "ei_event_get_device": (p, [p]),
        "ei_event_unref": (p, [p]),
        "ei_device_ref": (p, [p]),
        "ei_device_unref": (p, [p]),
        "ei_device_has_capability": (b, [p, i]),
        # Only the fixed argument belongs in argtypes for this variadic API.
        "ei_seat_bind_capabilities": (None, [p]),
        "ei_device_start_emulating": (None, [p, u]),
        "ei_device_stop_emulating": (None, [p]),
        "ei_device_pointer_motion_absolute": (None, [p, d, d]),
        "ei_device_button_button": (None, [p, u, b]),
        "ei_device_keyboard_key": (None, [p, u, b]),
        "ei_device_frame": (None, [p, q]),
        "ei_now": (q, [p]),
        "ei_unref": (p, [p]),
    }
    for name, (result, args) in signatures.items():
        func = getattr(lib, name)
        func.restype, func.argtypes = result, args
    return lib


class Sender:
    """Bounded native protocol driver; does not decide behavioral qualification."""

    def __init__(self, lib, fd):
        self.lib = lib
        self.ctx = lib.ei_new_sender(None)
        self.devices = {}
        self.sequences = {}
        self.active = set()
        self.connected = False
        self.held = False
        self.hold_devices = None
        if not self.ctx:
            os.close(fd)
            raise ProbeError("ei_new_sender failed")
        lib.ei_configure_name(self.ctx, b"odin-private-release-probe")
        # Ownership passes to libei here, including teardown on setup failure.
        if lib.ei_setup_backend_fd(self.ctx, fd) != 0:
            lib.ei_unref(self.ctx)
            self.ctx = None
            raise ProbeError("EI backend setup failed")
        self.fd = lib.ei_get_fd(self.ctx)
        if self.fd < 0:
            self.close()
            raise ProbeError("EI backend has no event fd")

    def pump(self):
        lib = self.lib
        lib.ei_dispatch(self.ctx)
        for _ in range(1024):
            event = lib.ei_get_event(self.ctx)
            if not event:
                return
            try:
                kind = lib.ei_event_get_type(event)
                if kind == CONNECT:
                    self.connected = True
                elif kind == DISCONNECT:
                    self.connected = False
                    self.active.clear()
                    raise ProbeError("EI disconnected")
                elif kind == SEAT_ADDED:
                    lib.ei_seat_bind_capabilities(
                        lib.ei_event_get_seat(event),
                        c.c_int(ABSOLUTE), c.c_int(BUTTON), c.c_int(KEYBOARD), c.c_void_p(),
                    )
                elif kind in (DEVICE_ADDED, DEVICE_REMOVED, DEVICE_PAUSED, DEVICE_RESUMED):
                    device = lib.ei_event_get_device(event)
                    if not device:
                        raise ProbeError("EI device event has no device")
                    if kind == DEVICE_ADDED and device not in self.devices:
                        self.devices[device] = lib.ei_device_ref(device)
                    elif kind == DEVICE_RESUMED:
                        if device not in self.devices:
                            raise ProbeError("EI resumed an unknown device")
                        if device not in self.active:
                            sequence = self.sequences.get(device, 0) + 1
                            self.sequences[device] = sequence
                            lib.ei_device_start_emulating(device, sequence)
                            self.active.add(device)
                    elif kind in (DEVICE_REMOVED, DEVICE_PAUSED):
                        self.active.discard(device)
                        if kind == DEVICE_REMOVED and device in self.devices:
                            lib.ei_device_unref(self.devices.pop(device))
                            self.sequences.pop(device, None)
                        if self.held:
                            raise ProbeError("EI device lost while holding input")
            finally:
                lib.ei_event_unref(event)
        raise ProbeError("EI event budget exhausted")

    def device(self, capability):
        for device in sorted(self.active):
            if self.lib.ei_device_has_capability(device, capability):
                return device
        raise ProbeError("required resumed EI capability missing")

    def handshake(self, timeout=10.0):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            self.pump()
            if self.connected:
                try:
                    for capability in (ABSOLUTE, BUTTON, KEYBOARD):
                        self.device(capability)
                    self.flush()
                    return
                except ProbeError:
                    if not self.connected:
                        raise
            select.select([self.fd], [], [], min(0.05, max(0, deadline - time.monotonic())))
        raise ProbeError("EI handshake timed out")

    def frame(self, device):
        self.lib.ei_device_frame(device, self.lib.ei_now(self.ctx))

    def flush(self):
        # libei handles writes internally. Service pending IO, but never imply
        # this is compositor acknowledgement or an application observation.
        self.pump()

    def move(self):
        device = self.device(ABSOLUTE)
        self.lib.ei_device_pointer_motion_absolute(device, 250.0, 250.0)
        self.frame(device)

    def button(self, device, down):
        self.lib.ei_device_button_button(device, 272, down)
        self.frame(device)

    def key(self, device, code, down):
        self.lib.ei_device_keyboard_key(device, code, down)
        self.frame(device)

    def hold(self):
        self.pump()
        if self.held:
            raise ProbeError("input already held")
        button, keyboard = self.device(BUTTON), self.device(KEYBOARD)
        self.move()
        self.hold_devices = (button, keyboard)
        self.held = True
        self.button(button, True)
        self.key(keyboard, 42, True)
        self.flush()

    def release(self):
        if self.held:
            button, keyboard = self.hold_devices
            if button in self.active:
                self.button(button, False)
            if keyboard in self.active:
                self.key(keyboard, 42, False)
            self.held = False
            self.hold_devices = None
        self.flush()

    def fresh(self):
        self.pump()
        if self.held:
            raise ProbeError("fresh requires neutral sender")
        self.move()
        button, keyboard = self.device(BUTTON), self.device(KEYBOARD)
        self.button(button, True)
        self.button(button, False)
        self.key(keyboard, 30, True)
        self.key(keyboard, 30, False)
        self.flush()

    def escape(self):
        self.pump()
        if self.held:
            raise ProbeError("escape requires neutral sender")
        keyboard = self.device(KEYBOARD)
        self.key(keyboard, 1, True)
        self.key(keyboard, 1, False)
        self.flush()

    def close(self):
        if not self.ctx:
            return
        try:
            self.release()
        except (ProbeError, OSError):
            pass
        for device in self.active:
            self.lib.ei_device_stop_emulating(device)
        self.lib.ei_dispatch(self.ctx)
        for device in self.devices.values():
            self.lib.ei_device_unref(device)
        self.lib.ei_unref(self.ctx)
        self.ctx = None


class Commands:
    """Nonblocking byte-level reader: no unbounded readline or buffered-select race."""

    def __init__(self, fd=0):
        self.fd = fd
        self.buffer = bytearray()
        self.count = 0

    def read(self, deadline, sender=None):
        while True:
            newline = self.buffer.find(b"\n")
            if newline >= 0:
                if newline > MAX_LINE:
                    raise ProbeError("command too large")
                raw = bytes(self.buffer[:newline])
                del self.buffer[:newline + 1]
                self.count += 1
                if self.count > 64:
                    raise ProbeError("command budget exhausted")
                try:
                    command = json.loads(raw.decode("utf-8"))
                except (ValueError, UnicodeError) as exc:
                    raise ProbeError("invalid command JSON") from exc
                if not isinstance(command, dict) or set(command) != {"op"}:
                    raise ProbeError("command must contain only op")
                if command["op"] not in (
                    "handoff", "hold", "release", "fresh", "escape", "eof",
                ):
                    raise ProbeError("unsupported command")
                return command["op"]
            if len(self.buffer) > MAX_LINE:
                raise ProbeError("command too large")
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ProbeError("command deadline expired")
            fds = [self.fd] + ([sender.fd] if sender is not None else [])
            ready, _, _ = select.select(fds, [], [], min(remaining, 0.1))
            if sender is not None:
                sender.pump()
            if self.fd in ready:
                chunk = os.read(self.fd, MAX_LINE + 1 - len(self.buffer))
                if not chunk:
                    if self.buffer:
                        raise ProbeError("incomplete command")
                    return None
                self.buffer.extend(chunk)


def verify_socket_handoff(fd):
    if fd < 3:
        raise ProbeError("EI fd must not alias standard IO")
    wrapped = socket.socket(fileno=fd)
    try:
        if wrapped.family != socket.AF_UNIX or wrapped.type != socket.SOCK_STREAM:
            raise ProbeError("EI fd must be a private Unix stream")
        wrapped.getpeername()
        peer_pid, _, _ = struct.unpack(
            "3i", wrapped.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12),
        )
        if peer_pid <= 0:
            raise ProbeError("EI peer is outside the private PID namespace")
        for namespace in ("pid", "mnt"):
            if os.readlink(f"/proc/{peer_pid}/ns/{namespace}") != os.readlink(
                f"/proc/self/ns/{namespace}",
            ):
                raise ProbeError("EI peer is outside the private namespace")
    finally:
        wrapped.detach()
    target = os.readlink(f"/proc/self/fd/{fd}")
    # Closing only the child copy would not test last-owner disconnect. Refuse
    # any surviving parent copy or extra inherited child copy before ready.
    for pid in (os.getpid(), os.getppid()):
        with os.scandir(f"/proc/{pid}/fd") as entries:
            for entry in entries:
                if pid == os.getpid() and entry.name == str(fd):
                    continue
                try:
                    if os.readlink(entry.path) == target:
                        raise ProbeError("EI socket still has a helper/inherited duplicate")
                except FileNotFoundError:
                    continue
    os.set_inheritable(fd, False)


def emit(event):
    print(json.dumps({"event": event}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fd", required=True, type=int)
    args = parser.parse_args()
    sender = None
    try:
        # Shared asset checks nonce, fixed environment and independent private
        # mount/PID namespaces. Missing guard is deliberately a hard refusal.
        from wayland_probe_private import assert_private_environment

        assert_private_environment()
        lifetime = time.monotonic() + 120
        commands = Commands()
        if commands.read(time.monotonic() + 10) != "handoff":
            raise ProbeError("helper must confirm closed FD handoff first")
        verify_socket_handoff(args.fd)
        sender = Sender(bind_library(), args.fd)
        sender.handshake()
        emit("ready")
        responses = {
            "hold": "held_sent", "release": "released",
            "fresh": "fresh_sent", "escape": "escape_sent",
        }
        while True:
            op = commands.read(min(lifetime, time.monotonic() + 30), sender)
            if op is None:
                return 0
            if op == "eof":
                assert_private_environment()
                # Deliberately no release, stop-emulating, unref or finally.
                # The OS closes the last sender socket only in the private probe.
                os._exit(0)
            if op not in responses:
                raise ProbeError("handoff is only valid before ready")
            getattr(sender, op)()
            emit(responses[op])
    except Exception as exc:
        print(json.dumps({"event": "error", "error": type(exc).__name__}), flush=True)
        return 2
    finally:
        if sender is not None:
            sender.close()


if __name__ == "__main__":
    raise SystemExit(main())
