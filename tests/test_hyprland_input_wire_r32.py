"""Native helper wire evidence only: not Hyprland or application delivery proof.

Set ODIN_HYPRLAND_INPUT_TEST_BINARY to a built native helper. No mocks replace
the helper's AF_UNIX transport, SO_PEERCRED checks, signal handling or stdout.
"""

import importlib.util
import json
import os
import select
import signal
import subprocess
import sys
import time
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location(
    "hyprland_input_wire_r32", Path(__file__).parent / "fixtures/hyprland_input_wire_r32.py"
)
fixture_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture_module)


@pytest.fixture
def binary():
    configured = os.environ.get("ODIN_HYPRLAND_INPUT_TEST_BINARY")
    if not configured:
        pytest.skip("set ODIN_HYPRLAND_INPUT_TEST_BINARY to run native wire tests")
    path = Path(configured).resolve()
    assert path.is_file() and os.access(path, os.X_OK), path
    return str(path)


@pytest.fixture
def peer(tmp_path):
    result = fixture_module.WirePeer(tmp_path)
    yield result
    result.close()
    assert not result.errors, result.errors


class Client:
    def __init__(self, binary, peer, controller=False, output=None, **kwargs):
        command = [binary, peer.wayland, str(os.getpid()), str(os.getuid()),
                   "WIRE-1", peer.scope, "800", "600"]
        if controller:
            command = [sys.executable, "-c",
                       "import subprocess,sys; subprocess.Popen(sys.argv[1:]).wait()", *command]
        self.proc = subprocess.Popen(
            command, stdin=subprocess.PIPE,
            stdout=subprocess.PIPE if output is None else output,
            stderr=subprocess.PIPE, **kwargs,
        )
        self.buffer = b""
        self.receipts = []

    def send(self, line):
        self.proc.stdin.write((line + "\n").encode())
        self.proc.stdin.flush()

    def receipt(self, event, timeout=3):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if b"\n" in self.buffer:
                line, self.buffer = self.buffer.split(b"\n", 1)
                value = json.loads(line)
                self.receipts.append(value)
                assert value.get("receiver_proven") is False, value
                if value["event"] == event:
                    return value
                continue
            if select.select([self.proc.stdout], [], [], 0.05)[0]:
                data = os.read(self.proc.stdout.fileno(), 8192)
                assert data, (self.proc.poll(), self.receipts, self.proc.stderr.read())
                self.buffer += data
        raise AssertionError((event, self.receipts, self.proc.poll()))

    def begin(self, scope_ms=240, lease_ms=2000):
        self.send("F " + "a" * 64)
        self.send(f"B {lease_ms} {time.monotonic_ns() // 1000 + scope_ms * 1000}")

    def close(self):
        if self.proc.poll() is None:
            self.proc.terminate()
        try:
            self.proc.wait(3)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            self.proc.wait(3)
            raise
        for stream in (self.proc.stdin, self.proc.stdout, self.proc.stderr):
            if stream:
                stream.close()


@pytest.fixture
def client(binary, peer):
    result = Client(binary, peer)
    yield result
    result.close()


def test_native_ready_and_click_explicit_release(client, peer):
    ready = client.receipt("ready")
    assert ready["peer_pid"] == os.getpid()
    assert (ready["width"], ready["height"]) == (800, 600)
    assert peer.keymaps and b"xkb_keymap" in peer.keymaps[0]
    client.begin()
    client.send("P 272 30 40")
    done = client.receipt("action_done")
    assert done["release_sent"] and done["release_acknowledged"]
    assert peer.buttons() == [(272, 1), (272, 0)]
    assert [request["op"] for request in peer.requests] == ["status", "arm", "release_all"]


@pytest.mark.parametrize("cause", ["eof", "term", "expiry"])
def test_native_mid_drag_cleanup(client, peer, cause):
    client.receipt("ready")
    client.begin()
    client.send("L 272 2 1000 30 40 300 400")
    peer.wait(lambda: (272, 1) in peer.buttons())
    if cause == "eof":
        client.proc.stdin.close()
    elif cause == "term":
        client.proc.send_signal(signal.SIGTERM)
    client.proc.wait(3)
    peer.wait(lambda: (272, 0) in peer.buttons())
    closed = client.receipt("closed")
    assert closed["release_sent"] and closed["release_acknowledged"]
    expected = {"eof": "controller-eof", "term": "signal-cancel",
                "expiry": "scope-evidence-expired"}
    assert closed["reason"] == expected[cause]
    assert peer.buttons() == [(272, 1), (272, 0)]
    assert any(r["op"] == "release_all" for r in peer.requests)


def test_native_nonrenewable_lease_expires(client, peer):
    client.receipt("ready")
    client.begin(lease_ms=80)
    closed = client.receipt("closed")
    assert closed["reason"] == "lease-expired"
    assert closed["release_acknowledged"]
    assert not peer.buttons()


def test_native_scope_renew_uses_original_arm_token(client, peer):
    client.receipt("ready")
    client.begin()
    client.receipt("begun")
    client.send("F " + "b" * 64)
    client.send(f"O {time.monotonic_ns() // 1000 + 245000}")
    peer.wait(lambda: any(r["op"] == "renew" for r in peer.requests))
    renewal = next(r for r in peer.requests if r["op"] == "renew")
    assert renewal["token"] == "a" * 64
    client.send("P 272 30 40")
    assert client.receipt("action_done")["release_acknowledged"]


def test_native_scope_release_refusal_is_not_acknowledged(client, peer):
    client.receipt("ready")
    peer.ack_release = False
    client.begin()
    client.send("P 272 30 40")
    closed = client.receipt("closed")
    assert closed["release_sent"]
    assert closed["release_acknowledged"] is False
    assert closed["reason"] == "input-path-lost"
    assert peer.buttons() == [(272, 1), (272, 0)]
    assert not any(r["event"] == "action_done" for r in client.receipts)


def test_native_delayed_scope_reply_cannot_acknowledge_cleanup(client, peer):
    client.receipt("ready")
    peer.delay_op = "arm"
    client.begin()
    closed = client.receipt("closed")
    assert closed["release_acknowledged"] is False
    assert closed["input_was_sent"] is False
    assert not peer.buttons()
    client.proc.wait(3)
    time.sleep(0.15)
    # The ambiguous exchange poisons and closes the socket. Its late successful
    # arm reply must never be read as the acknowledgement for release_all.
    assert [r["op"] for r in peer.requests] == ["status", "arm"]


def test_native_refuses_wrong_kernel_peer(binary, peer):
    proc = subprocess.run(
        [binary, peer.wayland, str(os.getpid() + 100000), str(os.getuid()),
         "WIRE-1", peer.scope, "800", "600"],
        input=b"", capture_output=True, timeout=3,
    )
    assert proc.returncode != 0
    assert b'"event":"ready"' not in proc.stdout
    assert not peer.buttons()


def test_native_controller_death_releases_without_stdin_eof(binary, peer):
    client = Client(binary, peer, controller=True)
    try:
        ready = client.receipt("ready")
        assert ready["pid"] != client.proc.pid
        client.begin()
        client.send("L 272 2 1000 30 40 300 400")
        peer.wait(lambda: (272, 1) in peer.buttons())
        client.proc.kill()
        client.proc.wait(3)
        # Keep stdin open deliberately: this is parent-death, not pipe EOF.
        closed = client.receipt("closed")
        assert closed["release_acknowledged"]
        peer.wait(lambda: (272, 0) in peer.buttons())
        assert peer.buttons() == [(272, 1), (272, 0)]
    finally:
        client.close()


def test_native_blocked_stdout_does_not_block_release(binary, peer):
    read_fd, write_fd = os.pipe()
    client = Client(binary, peer, output=write_fd)
    client.proc.stdout = os.fdopen(read_fd, "rb", buffering=0)
    try:
        client.receipt("ready")
        client.begin()
        client.send("L 272 2 1000 30 40 300 400")
        peer.wait(lambda: (272, 1) in peer.buttons())
        os.set_blocking(write_fd, False)
        filled = 0
        while True:
            try:
                filled += os.write(write_fd, b"x" * 4096)
            except BlockingIOError:
                break
        assert filled > 0
        # No stdout reads until termination. Cleanup must proceed despite EAGAIN.
        client.proc.send_signal(signal.SIGTERM)
        client.proc.wait(3)
        peer.wait(lambda: (272, 0) in peer.buttons())
        assert peer.buttons() == [(272, 1), (272, 0)]
        assert any(r["op"] == "release_all" for r in peer.requests)
    finally:
        os.close(write_fd)
        client.close()


def test_native_scope_refusal_prevents_ready(binary, peer):
    peer.bad_scope = True
    proc = subprocess.run(
        [binary, peer.wayland, str(os.getpid()), str(os.getuid()),
         "WIRE-1", peer.scope, "800", "600"],
        input=b"", capture_output=True, timeout=3,
    )
    assert proc.returncode != 0
    assert b'"event":"ready"' not in proc.stdout
    assert not peer.buttons()
