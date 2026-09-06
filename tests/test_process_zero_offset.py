"""Zero-filled native poll requests must remain newest-lines status queries."""

import asyncio
import json
import time

import pytest

from src.tools.process_manager import OUTPUT_CAPTURE_BYTES
from tests.test_process_tail_correctness import delivered, job, preview


@pytest.fixture(autouse=True)
def no_background(monkeypatch):
    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())


@pytest.mark.parametrize("remote", [False, True])
async def test_zero_filled_poll_shows_newest_lines_running_and_finished(tmp_path, remote):
    # A stdin handshake keeps the process running independently of CI load.
    # Both sentinels land beyond the captured prefix, reproducing the live soak.
    end = "REMOTE-END" if remote else "LOCAL-END"
    producer = (
        "import sys\n"
        "sys.stdout.write('BEGIN\\n' + ('x'*95+'\\n')*48000 + 'RUNNING-END\\n')\n"
        "sys.stdout.flush()\n"
        "sys.stdin.readline()\n"
        f"print({end!r}, flush=True)\n"
    )
    async with job(tmp_path, producer, remote, wait_for_exit=False) as (ex, reg, info):
        deadline = time.monotonic() + 15
        while True:
            raw = await reg.poll(info.pid)
            display, metadata = preview(raw)
            assert metadata["status"] == "running"
            if display.endswith("RUNNING-END\n"):
                break
            assert time.monotonic() < deadline, "producer output did not reach the reader"
            await asyncio.sleep(0.02)

        async def assert_status(expected_status, sentinel):
            raw = await delivered(ex, info, cursor="", offset=0, limit=4000,
                                  host="", command="", input_text="", wait_seconds=0)
            assert raw.startswith(f"[PID {info.pid}] "), raw[:200]
            display, metadata = preview(raw)
            assert metadata["status"] == expected_status
            assert display.endswith(sentinel + "\n")
            assert len(display.splitlines()) == 50
            assert metadata["emitted_bytes"] > 4_500_000
            assert metadata["retained_bytes"] == OUTPUT_CAPTURE_BYTES
            assert metadata["shown_intervals"][0][0] > OUTPUT_CAPTURE_BYTES
            assert metadata["not_retained_bytes"] > 0
            assert metadata["cursor"] == info.generation + ":0"
            # The preview's cursor, even with offset=0, selects byte zero.
            first = json.loads(await delivered(ex, info, cursor=metadata["cursor"],
                                               offset=0, limit=4000))
            assert first["shown_intervals"] == [[0, 4000]]
            assert first["text"].startswith("BEGIN\n")
            assert first["cursor"] == info.generation + ":4000"
            assert first["truncated"]
            # Nonzero offsets still select explicit ranges without a cursor.
            one = json.loads(await delivered(ex, info, cursor="", offset=1, limit=4))
            assert one["shown_intervals"] == [[1, 5]] and one["text"] == "EGIN"

        await assert_status("running", "RUNNING-END")
        assert "Wrote" in await reg.write(info.pid, "finish\n")
        terminal = await reg.poll(info.pid, wait_seconds=10)
        assert preview(terminal)[1]["status"] == "completed"
        await assert_status("completed", end)
