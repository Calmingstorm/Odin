"""Standalone offline wire fixture, never connects to a display.

Usage: python3 tests/fixtures/hyprland_native_capture_check.py /absolute/helper
Implements only the relevant Wayland wire messages over inherited socketpair.
No pytest dependency, environment socket lookup, or compositor process.
"""

import array
import mmap
import os
import socket
import struct
import subprocess
import sys
import threading
import time

PREFIX = (["valgrind", "--quiet", "--leak-check=full", "--errors-for-leak-kinds=definite",
           "--error-exitcode=90"] if "--valgrind" in sys.argv[2:] else [])


def words(*values):
    return struct.pack("=" + "I" * len(values), *values)


def string(value):
    data = value.encode() + b"\0"
    return words(len(data)) + data + b"\0" * (-len(data) % 4)


class Server:
    def __init__(self, sock, case):
        self.sock = sock
        self.case = case
        self.objects = {1: "display"}
        self.pending = b""
        self.fds = []
        self.maps = []
        self.errors = []
        self.captured = []
        self.disconnected = False
        self.output = None

    def event(self, obj, opcode, payload=b""):
        self.sock.sendall(words(obj, ((8 + len(payload)) << 16) | opcode) + payload)

    def dispatch(self, obj, opcode, payload):
        kind = self.objects[obj]
        values = struct.unpack("=" + "I" * (len(payload) // 4), payload)
        if kind == "display":
            if opcode == 1:
                registry = values[0]
                self.objects[registry] = "registry"
                for ident, interface, version in (
                    (10, "wl_shm", 1),
                    (11, "wl_output", 3 if self.case == "old-output" else 4),
                    (12, "zwlr_screencopy_manager_v1", 2 if self.case == "old-manager" else 3),
                    (13, "wl_output", 4),
                ):
                    self.event(registry, 0, words(ident) + string(interface) + words(version))
            else:
                self.event(values[0], 0, words(0))
                self.event(1, 1, words(values[0]))
        elif kind == "registry":
            ident, length = values[:2]
            interface = payload[8:8 + length - 1].decode()
            version, new_id = struct.unpack_from("=II", payload, 8 + (length + 3) // 4 * 4)
            self.objects[new_id] = interface
            if interface == "wl_output":
                if ident == 11:
                    self.output = new_id
                transform = 1 if self.case == "transform-mismatch" else 0
                self.event(new_id, 0, (
                    words(0, 0, 10, 10, 0) + string("fixture")
                    + string("fixture") + words(transform)
                ))
                self.event(new_id, 1, words(1, 3 if self.case == "mode-mismatch" else 2, 2, 60000))
                self.event(new_id, 3, words(1))
                if version >= 4:
                    name = "DP-CONSENT" if ident == 11 or self.case == "duplicate" else "DP-OTHER"
                    self.event(new_id, 4, string(name))
                self.event(new_id, 2)
            elif interface == "wl_shm":
                self.event(new_id, 0, words(0))
                self.event(new_id, 0, words(1))
        elif kind == "zwlr_screencopy_manager_v1" and opcode == 0:
            frame, overlay, output = values
            assert overlay == 0 and output == self.output
            self.captured.append(output)
            self.objects[frame] = "frame"
            if self.case == "failed":
                self.event(frame, 3)
                return
            fmt = 0 if self.case == "argb" else 1
            if self.case == "format":
                fmt = 0x34325258
            width = 3 if self.case == "size" else 2
            stride = 0x7FFFFFFC if self.case == "allocation" else 12
            if self.case == "dmabuf-only":
                self.event(frame, 5, words(0, 2, 2))
            else:
                self.event(frame, 0, words(fmt, width, 2, stride))
            if self.case != "no-buffer-done":
                self.event(frame, 6)
        elif kind == "wl_shm":
            new_id, size = values
            fd = self.fds.pop(0)
            mapping = mmap.mmap(fd, size)
            os.close(fd)
            self.maps.append(mapping)
            self.objects[new_id] = "pool"
        elif kind == "pool" and opcode == 0:
            buffer_id, offset, width, height, stride, fmt = values
            assert (offset, width, height, stride) == (0, 2, 2, 12)
            assert fmt in (0, 1)
            self.objects[buffer_id] = "buffer"
            # Native uint32 pixels, ignored alpha bytes, deliberately padded rows.
            self.maps[-1][:] = words(0x00112233, 0x80445566, 0xDEADBEEF,
                                     0xFF778899, 0x00AABBCC, 0xDEADBEEF)
        elif kind == "frame" and opcode == 0:
            if self.case == "change":
                self.event(self.output, 1, words(1, 4, 2, 60000))
                self.event(self.output, 2)
            if self.case != "no-flags":
                flags = 1 if self.case == "invert" else 0
                self.event(obj, 1, words(2 if self.case == "bad-flags" else flags))
            if self.case != "no-ready":
                self.event(obj, 2, words(0, 0, 0))
            if self.case == "release":
                self.event(values[0], 0)

    def run(self):
        try:
            while True:
                data, ancillary, _, _ = self.sock.recvmsg(65536, socket.CMSG_SPACE(64))
                if not data:
                    self.disconnected = True
                    return
                for level, kind, payload in ancillary:
                    if level == socket.SOL_SOCKET and kind == socket.SCM_RIGHTS:
                        descriptors = array.array("i")
                        size = len(payload) // descriptors.itemsize * descriptors.itemsize
                        descriptors.frombytes(payload[:size])
                        self.fds.extend(descriptors)
                self.pending += data
                while len(self.pending) >= 8:
                    obj, word = struct.unpack_from("=II", self.pending)
                    size, opcode = word >> 16, word & 0xFFFF
                    if len(self.pending) < size:
                        break
                    assert size >= 8
                    message, self.pending = self.pending[8:size], self.pending[size:]
                    self.dispatch(obj, opcode, message)
        except (BrokenPipeError, ConnectionResetError):
            self.disconnected = True
        except Exception as error:
            self.errors.append(repr(error))
        finally:
            self.sock.close()
            for mapping in self.maps:
                mapping.close()
            for fd in self.fds:
                os.close(fd)


def check(binary, case, success=False, **overrides):
    client, server_socket = socket.socketpair()
    server = Server(server_socket, case)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    args = dict(pid=os.getpid(), uid=os.getuid(), name="DP-CONSENT", width=2,
                height=2, transform=0, timeout=2000 if PREFIX else 250)
    args.update(overrides)
    started = time.monotonic()
    try:
        result = subprocess.run([*PREFIX, binary, str(client.fileno()), *map(str, args.values())],
                                pass_fds=(client.fileno(),), capture_output=True, timeout=10,
                                env={"PATH": "/usr/bin:/bin", "WAYLAND_DISPLAY": "/never-connect"})
    finally:
        client.close()
    thread.join(2)
    assert not thread.is_alive(), case
    assert not server.errors, (case, server.errors)
    assert server.disconnected, case
    assert time.monotonic() - started < (8 if PREFIX else 2), case
    assert result.returncode != 90, (case, result.stderr.decode())
    if success:
        assert result.returncode == 0, (case, result.stderr)
        assert result.stdout[:32] == b"ODINSC01" + struct.pack("<6I", 2, 2, 8, 1, 0, 16)
        top = bytes.fromhex("332211ff665544ff")
        bottom = bytes.fromhex("998877ffccbbaaff")
        assert result.stdout[32:] == (bottom + top if case == "invert" else top + bottom)
        assert len(server.captured) == 1
    else:
        assert result.returncode != 0, case
        assert result.stdout == b"", (case, result.stdout)
    print("PASS", case)


if __name__ == "__main__":
    binary = sys.argv[1]
    for case in ("normal", "argb", "invert", "release"):
        check(binary, case, success=True)
    for case in ("old-output", "old-manager", "duplicate", "mode-mismatch",
                 "transform-mismatch", "failed", "format", "size", "allocation",
                 "dmabuf-only", "no-buffer-done", "change", "no-flags",
                 "bad-flags", "no-ready"):
        check(binary, case)
    check(binary, "wrong-name", name="DP-NOT-CONSENTED")
    check(binary, "wrong-pid", pid=os.getpid() + 1)
    check(binary, "wrong-uid", uid=os.getuid() + 1)
    check(binary, "max-side", width=16385)
    check(binary, "max-pixels", width=16384, height=16384)
    check(binary, "zero-deadline", timeout=0)
    print("25 isolated native capture checks passed")
