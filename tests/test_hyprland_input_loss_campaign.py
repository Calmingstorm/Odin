"""Native terminal-loss evidence over the real isolated AF_UNIX wire fixture.

This compiles the guardian into /tmp and never starts a compositor, loads a
plugin, or touches the active desktop.
"""
from pathlib import Path

import pytest

from src.computer.runtime.hyprland_guardian import native_failure
from tests.test_hyprland_input_wire_r32 import Client, fixture_module


@pytest.fixture(scope="session")
def binary():
    # The campaign command rebuilds this fixed isolated directory with
    # --guardian-only immediately before pytest. No compositor is involved.
    result = Path("/tmp/odin-hyprland-native-loss-final/odin-hyprland-input")
    assert result.is_file() and result.stat().st_mode & 0o111
    return str(result)


@pytest.fixture
def peer(tmp_path):
    result = fixture_module.WirePeer(tmp_path)
    yield result
    result.close()
    assert not result.errors, result.errors


def loss(receipt):
    # The actual C receipt crosses the AF_UNIX fixture and then production
    # sanitisation. Independent invented wire fixtures conceal schema drift.
    sanitized = native_failure(receipt)
    assert sanitized is not None
    value = sanitized["input_loss_v1"]
    assert set(value) == {
        "terminal_cause", "scope_outcome", "events_queued", "events_submitted",
        "release_submission", "release_ack", "resource_closure",
    }
    assert receipt["receiver_proven"] is False
    assert "receiver_release_verified" not in value
    return value


def test_native_loss_before_down_preserves_no_input_sent(binary, peer):
    client = Client(binary, peer)
    try:
        client.receipt("ready")
        peer.bad_scope = True
        client.begin()
        closed = client.receipt("closed")
        detail = loss(closed)
        assert detail["terminal_cause"] == "scope_refused"
        assert detail["events_queued"] == detail["events_submitted"] == 0
        assert detail["release_submission"] == "submitted"
        assert not peer.buttons()
    finally:
        client.close()


def test_native_loss_after_down_submits_owned_up(binary, peer):
    client = Client(binary, peer)
    try:
        client.receipt("ready")
        client.begin()
        client.send("L 272 2 1000 30 40 300 400")
        peer.wait(lambda: (272, 1) in peer.buttons())
        client.proc.stdin.close()
        closed = client.receipt("closed")
        peer.wait(lambda: (272, 0) in peer.buttons())
        detail = loss(closed)
        assert detail["terminal_cause"] == "controller_eof"
        assert detail["events_queued"] >= detail["events_submitted"] >= 1
        assert detail["release_submission"] == "submitted"
        assert detail["release_ack"] == "acknowledged"
        assert detail["resource_closure"] == "complete"
        assert peer.buttons() == [(272, 1), (272, 0)]
    finally:
        client.close()


def test_native_loss_after_up_preserves_eof_after_completed_release(binary, peer):
    client = Client(binary, peer)
    try:
        client.receipt("ready")
        client.begin(lease_ms=500)
        client.send("P 272 30 40")
        client.receipt("action_done")
        # The action returns to idle; force the distinct idle timeout rather
        # than relying on a short lease racing the click.
        client.send("N")
        client.proc.stdin.close()
        closed = client.receipt("closed")
        detail = loss(closed)
        assert detail["terminal_cause"] == "controller_eof"
        assert detail["events_queued"] >= 3
        assert detail["release_ack"] == "acknowledged"
        assert detail["resource_closure"] == "complete"
        assert peer.buttons() == [(272, 1), (272, 0)]
    finally:
        client.close()


def test_native_release_ack_loss_is_not_reconstructed_as_ack(binary, peer):
    client = Client(binary, peer)
    try:
        client.receipt("ready")
        peer.ack_release = False
        client.begin()
        client.send("P 272 30 40")
        closed = client.receipt("closed")
        detail = loss(closed)
        assert detail["release_submission"] == "submitted"
        assert detail["release_ack"] == "invalid_or_unconfirmed"
        assert closed["release_acknowledged"] is False
    finally:
        client.close()


def test_native_release_status_queries_once_after_lost_ack(binary, peer):
    client = Client(binary, peer)
    try:
        client.receipt("ready")
        peer.drop_release_once = True
        client.begin()
        client.send("L 272 2 1000 30 40 300 400")
        peer.wait(lambda: (272, 1) in peer.buttons())
        client.proc.send_signal(__import__("signal").SIGTERM)
        closed = client.receipt("closed")
        detail = loss(closed)
        peer.wait(lambda: [request["op"] for request in peer.requests].count("release_status") == 1)
        assert detail["scope_outcome"] == "transport_lost"
        assert detail["release_ack"] == "acknowledged"
        assert [request["op"] for request in peer.requests].count("release_all") == 1
        assert [request["op"] for request in peer.requests].count("release_status") == 1
    finally:
        client.close()


@pytest.mark.parametrize("reply", [b"not-json\n", b'{"ok":true,"armed":false}\n'])
def test_native_malformed_or_incomplete_release_status_is_not_ack(binary, peer, reply):
    client = Client(binary, peer)
    try:
        client.receipt("ready")
        peer.drop_release_once = True
        peer.release_status_reply = reply
        client.begin()
        client.send("L 272 2 1000 30 40 300 400")
        peer.wait(lambda: (272, 1) in peer.buttons())
        client.proc.send_signal(__import__("signal").SIGTERM)
        closed = client.receipt("closed")
        detail = loss(closed)
        assert detail["scope_outcome"] == "transport_lost"
        assert closed["release_acknowledged"] is False
        assert detail["release_ack"] in {"transport_lost", "invalid_or_unconfirmed"}
        assert [request["op"] for request in peer.requests].count("release_all") == 1
        assert [request["op"] for request in peer.requests].count("release_status") == 1
    finally:
        client.close()
