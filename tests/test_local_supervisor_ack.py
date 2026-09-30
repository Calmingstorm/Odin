"""Receiver acknowledgement cannot replace exact empty-tree evidence."""
import asyncio
import json
import socket
import sys

import pytest

from src.tools import local_supervisor_worker


@pytest.mark.parametrize("mode", ["delayed", "disconnect", "wrong"])
async def test_empty_worker_holds_channel_until_receiver_ack(mode):
    parent, child = socket.socketpair()
    parent.setblocking(False)
    worker = await asyncio.create_subprocess_exec(
        sys.executable, "-I", local_supervisor_worker.__file__,
        "--control-fd", str(child.fileno()), "--command", "printf harmless",
        pass_fds=(child.fileno(),), stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE, start_new_session=True,
    )
    child.close()
    reader, writer = await asyncio.open_connection(sock=parent)
    try:
        events = []
        async with asyncio.timeout(5):
            while True:
                event = json.loads(await reader.readline())
                events.append(event)
                if event["event"] == "settled":
                    assert event["clean"] is True
                    break
        assert [e["event"] for e in events] == ["started", "exit", "settled"]
        assert events[1]["returncode"] == 0
        assert worker.returncode is None
        writer.write(b'{"op":"terminate","grace":0}\n')
        await writer.drain()
        if mode == "wrong":
            writer.write(b'{"op":"invalid_ack"}\n')
            await writer.drain()
            error = json.loads(await asyncio.wait_for(reader.readline(), 3))
            assert error["event"] == "error"
            assert worker.returncode is None
        if mode == "disconnect":
            writer.close()
            await writer.wait_closed()
        else:
            writer.write(b'{"op":"settled_ack"}\n')
            await writer.drain()
        assert await asyncio.wait_for(worker.wait(), 3) == (1 if mode == "wrong" else 0)
        out, err = await worker.communicate()
        assert out == b"harmless" and err == b""
    finally:
        writer.close()
        if worker.returncode is None:
            worker.terminate()
            await asyncio.wait_for(worker.wait(), 5)
