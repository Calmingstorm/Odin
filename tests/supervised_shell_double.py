"""In-memory owner protocol with real monitor and settlement ACK, no processes."""
import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from src.tools.local_supervisor import SupervisedShell


def supervised_shell(text="fixture\n", *, returncode=0):
    control = asyncio.StreamReader()
    stdout = asyncio.StreamReader()
    stdout.feed_data(text.encode())
    stdout.feed_eof()
    acknowledged = False
    published = False

    def frame(event, **values):
        control.feed_data(json.dumps({"event": event, **values}).encode() + b"\n")

    def settle(code):
        nonlocal published
        if not published:
            published = True
            frame("exit", returncode=code)
            frame("settled", clean=True)

    def write(data):
        nonlocal acknowledged
        message = json.loads(data)
        if message["op"] == "settled_ack":
            assert published
            acknowledged = True
        else:
            assert message["op"] == "terminate"
            settle(-15 if returncode is None else returncode)

    async def worker_wait():
        assert acknowledged, "worker cannot exit cleanly before settlement ACK"
        return 0

    writer = SimpleNamespace(write=Mock(side_effect=write), drain=AsyncMock(), close=Mock())
    worker = SimpleNamespace(
        stdin=None, stdout=stdout, stderr=None, wait=AsyncMock(side_effect=worker_wait),
    )
    frame("started", pid=54321)
    if returncode is not None:
        settle(returncode)
    shell = SupervisedShell(worker, control, writer)
    # create_supervised_shell only returns after START establishes identity.
    # This synchronous fixture publishes the same identity before handing off.
    shell.pid = 54321
    shell.terminate_tree = AsyncMock(wraps=shell.terminate_tree)
    return shell


def assert_supervisor_settled(shell):
    from src.tools.local_supervisor import _active

    shell.terminate_tree.assert_awaited()
    assert shell._settled.done() and shell._settled.result() is True
    assert shell._monitor_task.done()
    assert shell not in _active
    shell._worker.wait.assert_awaited_once()
    shell._writer.close.assert_called_once()
    assert b'{"op":"settled_ack"}\n' in [
        call.args[0] for call in shell._writer.write.call_args_list
    ]
