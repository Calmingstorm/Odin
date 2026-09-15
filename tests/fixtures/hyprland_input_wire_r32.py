"""Isolated AF_UNIX protocol peer, not a compositor or receiver proof.

The native client performs real kernel SO_PEERCRED checks against this process.
No display discovery, installed plugin, service, or real desktop is used.
"""

from __future__ import annotations

import array
import json
import os
import socket
import struct
import threading
import time


def uints(*values: int) -> bytes:
    return struct.pack("=" + "I" * len(values), *values)


def string(value: str) -> bytes:
    data = value.encode() + b"\0"
    return uints(len(data)) + data + b"\0" * (-len(data) % 4)


class WirePeer:
    """Small strict wire peer recording native requests and passed keymap fds."""

    def __init__(self, root):
        self.wayland = str(root / "wayland")
        self.scope = str(root / "scope")
        self.events = []
        self.requests = []
        self.errors = []
        self.keymaps = []
        self.stop = threading.Event()
        self.sockets = []
        self.threads = []
        self.armed = False
        self.bad_scope = False
        self.ack_release = True
        self.delay_op = None
        self.drop_release_once = False
        self.release_status_reply = None
        for path, handler in ((self.wayland, self._wayland), (self.scope, self._scope)):
            listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            listener.bind(path)
            os.chmod(path, 0o600)
            listener.listen(1)
            listener.settimeout(0.1)
            self.sockets.append(listener)
            thread = threading.Thread(target=self._serve, args=(listener, handler), daemon=True)
            thread.start()
            self.threads.append(thread)

    def _serve(self, listener, handler):
        try:
            while not self.stop.is_set():
                try:
                    connection, _ = listener.accept()
                except TimeoutError:
                    continue
                with connection:
                    connection.settimeout(0.1)
                    handler(connection)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as error:
            if not self.stop.is_set():
                self.errors.append(repr(error))

    def _scope(self, connection):
        pending = b""
        while not self.stop.is_set():
            try:
                data = connection.recv(4096)
            except TimeoutError:
                continue
            if not data:
                return
            pending += data
            while b"\n" in pending:
                line, pending = pending.split(b"\n", 1)
                request = json.loads(line)
                self.requests.append(request)
                op = request["op"]
                assert op in {"status", "arm", "renew", "release_all", "release_status"}, request
                if op == self.delay_op:
                    time.sleep(0.12)
                if op == "release_all" and self.drop_release_once:
                    # Model a complete release command whose response is lost,
                    # not a request which never reached the scope peer.
                    self.armed = False
                    self.drop_release_once = False
                    return
                if op == "arm":
                    self.armed = True
                if op == "release_all":
                    self.armed = not self.ack_release
                if op == "release_status" and self.release_status_reply is not None:
                    connection.sendall(self.release_status_reply)
                    continue
                response = {"ok": not self.bad_scope, "armed": self.armed,
                            "keys": 0, "buttons": 0, "rejected": 0,
                            "release_acknowledged": self.ack_release,
                            "release_status_v1": True}
                connection.sendall(json.dumps(response).encode() + b"\n")

    def _wayland(self, connection):
        objects = {1: "wl_display"}
        pending = b""

        def event(obj, opcode, payload=b""):
            connection.sendall(uints(obj, ((8 + len(payload)) << 16) | opcode) + payload)

        globals_ = ((1, "wl_seat", 1), (2, "wl_output", 4),
                    (3, "zwlr_virtual_pointer_manager_v1", 2),
                    (4, "zwp_virtual_keyboard_manager_v1", 1))
        while not self.stop.is_set():
            try:
                data, ancillary, flags, _ = connection.recvmsg(65536, socket.CMSG_SPACE(64))
            except TimeoutError:
                continue
            assert not flags & socket.MSG_CTRUNC
            for level, kind, raw in ancillary:
                if level == socket.SOL_SOCKET and kind == socket.SCM_RIGHTS:
                    fds = array.array("i")
                    fds.frombytes(raw[:len(raw) - len(raw) % fds.itemsize])
                    for fd in fds:
                        try:
                            self.keymaps.append(os.pread(fd, 65536, 0))
                        finally:
                            os.close(fd)
            if not data:
                return
            pending += data
            while len(pending) >= 8:
                obj, header = struct.unpack_from("=II", pending)
                size, opcode = header >> 16, header & 65535
                assert size >= 8 and size % 4 == 0
                if len(pending) < size:
                    break
                payload, pending = pending[8:size], pending[size:]
                interface = objects[obj]
                self.events.append((interface, opcode, payload))
                if interface == "wl_display":
                    new_id, = struct.unpack("=I", payload)
                    if opcode == 1:
                        objects[new_id] = "wl_registry"
                        for name, iface, version in globals_:
                            event(new_id, 0, uints(name) + string(iface) + uints(version))
                    else:
                        assert opcode == 0
                        event(new_id, 0, uints(1))
                        event(1, 1, uints(new_id))
                elif interface == "wl_registry":
                    assert opcode == 0
                    name, length = struct.unpack_from("=II", payload)
                    iface = payload[8:8 + length - 1].decode()
                    version, new_id = struct.unpack_from("=II", payload, 8 + ((length + 3) & ~3))
                    assert (name, iface, version) in globals_
                    objects[new_id] = iface
                    if iface == "wl_output":
                        geometry = uints(0, 0, 300, 200, 0)
                        event(new_id, 0, geometry + string("fake") + string("wire") + uints(0))
                        event(new_id, 1, uints(1, 800, 600, 60000))
                        event(new_id, 3, uints(1))
                        event(new_id, 4, string("WIRE-1"))
                        event(new_id, 2)
                    elif iface == "wl_seat":
                        event(new_id, 0, uints(3))
                elif interface == "zwlr_virtual_pointer_manager_v1" and opcode in (0, 2):
                    objects[struct.unpack_from("=I", payload, len(payload) - 4)[0]] = "pointer"
                elif interface == "zwp_virtual_keyboard_manager_v1":
                    assert opcode == 0
                    objects[struct.unpack_from("=I", payload, len(payload) - 4)[0]] = "keyboard"

    def buttons(self):
        return [struct.unpack("=III", payload)[1:] for iface, opcode, payload in self.events
                if iface == "pointer" and opcode == 2]

    def wait(self, predicate, timeout=3):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            assert not self.errors, self.errors
            if predicate():
                return
            time.sleep(0.005)
        raise AssertionError(f"wire condition timed out: {self.events!r}; {self.requests!r}")

    def close(self):
        self.stop.set()
        for thread in self.threads:
            thread.join(1)
        for sock in self.sockets:
            sock.close()
