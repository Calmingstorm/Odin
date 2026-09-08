"""Real native guardian against fake sockets only; no desktop input."""
import json
import struct
import threading
import time

from tests.test_hyprland_input_wire_r32 import binary, client, peer  # noqa: F401


def test_five_vertex_650ms_wire_timing(client, peer):
    class TimedEvents(list):
        def append(self, event):
            arrival.append(time.monotonic_ns())
            super().append(event)

    client.receipt("ready")
    arrival = []
    peer.events = TimedEvents()
    stop = threading.Event()

    def renew():
        while not stop.wait(0.08):
            client.send("F " + "b" * 64)
            client.send(f"O {time.monotonic_ns() // 1000 + 240000}")

    client.begin()
    client.receipt("begun")
    thread = threading.Thread(target=renew)
    thread.start()
    try:
        client.send("L 272 5 650 30 400 200 100 350 400 500 100 700 400")
        done = client.receipt("action_done")
    finally:
        stop.set()
        thread.join()
    rows = []
    for received, (iface, opcode, payload) in zip(arrival, peer.events):
        if iface == "pointer":
            rows.append({"opcode": opcode, "arrival_ns": received,
                         "args": list(struct.unpack("=" + "I" * (len(payload)//4), payload))})
    origin = rows[0]["arrival_ns"]
    for row in rows:
        row["arrival_ms"] = round((row.pop("arrival_ns") - origin) / 1e6, 3)
    print(json.dumps({"events": rows, "receipt": done}, indent=2))
    motions = [row for row in rows if row["opcode"] == 1]
    assert [row["args"][1:] for row in motions] == [
        [30, 400, 800, 600], [200, 100, 800, 600], [350, 400, 800, 600],
        [500, 100, 800, 600], [700, 400, 800, 600]]
    timestamps = [row["args"][0] for row in motions]
    assert all(120 <= b-a <= 205 for a, b in zip(timestamps, timestamps[1:]))
    assert 620 <= motions[-1]["arrival_ms"] <= 750
    assert [row["opcode"] for row in rows] == [1, 4, 2, 4, 1, 4, 1, 4, 1, 4, 1, 4, 2, 4]
    assert peer.buttons() == [(272, 1), (272, 0)]
    assert done["diagnostics"]["steps_completed"] == 7
    assert done["release_acknowledged"]
