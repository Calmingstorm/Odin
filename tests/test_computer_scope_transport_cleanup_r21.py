"""Actual private D-Bus transport cleanup, without a desktop or host bus."""

import asyncio
import os
from contextlib import asynccontextmanager

import pytest

from src.computer.runtime.kwin_scope import KWinWaylandScopeProvider
from src.computer.runtime.wayland_scope import GNOMEWaylandScopeProvider, WaylandScopeFailure


@asynccontextmanager
async def stalled_bus(tmp_path, monkeypatch, stage):
    from dbus_next.aio import MessageBus

    arrived, eof = asyncio.Event(), asyncio.Event()
    buses, peers, tasks = [], [], []

    async def accept(reader, writer):
        tasks.append(asyncio.current_task())
        peers.append(writer)
        assert b"AUTH EXTERNAL" in await reader.readline()
        if stage == "hello":
            writer.write(b"OK 1234567890abcdef1234567890abcdef\r\n")
            await writer.drain()
            assert await reader.readline() == b"BEGIN\r\n"
            assert await reader.read(4096)
        arrived.set()
        assert await reader.read() == b""
        eof.set()

    def tracked_bus(*args, **kwargs):
        bus = MessageBus(*args, **kwargs)
        buses.append(bus)
        return bus

    address = tmp_path / "bus"
    server = await asyncio.start_unix_server(accept, path=str(address))
    monkeypatch.setattr("dbus_next.aio.MessageBus", tracked_bus)
    try:
        yield "unix:path=" + str(address), arrived, eof, buses
    finally:
        # Harness cleanup also makes this safe against the unfixed source.
        for bus in buses:
            if bus._sock.fileno() >= 0:
                bus.disconnect()
                bus._finalize(EOFError())
                bus._stream.close()
                bus._sock.close()
        for writer in peers:
            writer.close()
            await writer.wait_closed()
        server.close()
        await server.wait_closed()
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


@pytest.mark.parametrize("provider_type", [GNOMEWaylandScopeProvider, KWinWaylandScopeProvider])
@pytest.mark.parametrize("stage", ["auth", "hello"])
@pytest.mark.parametrize("failure", ["cancel", "timeout"])
async def test_pending_connection_closes_native_transport(
    tmp_path, monkeypatch, provider_type, stage, failure
):
    async with stalled_bus(tmp_path, monkeypatch, stage) as (address, arrived, eof, buses):
        provider = provider_type(bus_address=address, expected_uid=os.geteuid())
        pending = asyncio.create_task(provider.identity())
        await asyncio.wait_for(arrived.wait(), 1)
        fd = buses[0]._sock.fileno()
        try:
            if failure == "cancel":
                pending.cancel()
                with pytest.raises(asyncio.CancelledError):
                    await pending
            else:
                with pytest.raises(WaylandScopeFailure, match="wayland_scope_unavailable"):
                    await asyncio.wait_for(pending, 3)
            await asyncio.wait_for(eof.wait(), 1)
            assert buses[0]._sock.fileno() == -1
            assert buses[0]._stream.closed
            assert fd not in asyncio.get_running_loop()._selector.get_map()
            assert provider._bus is None
            # Idempotent close cannot resurrect or lose cleanup ownership.
            await provider.close()
            await provider.close()
        finally:
            pending.cancel()
            await asyncio.gather(pending, return_exceptions=True)


@pytest.mark.parametrize("peer_exits", [False, True])
async def test_connected_transport_is_closed_and_failure_is_consumed(tmp_path, peer_exits):
    address = "unix:path=" + str(tmp_path / "real-bus")
    daemon = await asyncio.create_subprocess_exec(
        "dbus-daemon",
        "--session",
        "--nofork",
        "--print-address=1",
        "--address=" + address,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    provider = GNOMEWaylandScopeProvider(bus_address=address, expected_uid=os.geteuid())
    try:
        assert await asyncio.wait_for(daemon.stdout.readline(), 2)
        result = await provider._call(
            "org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus", "GetId"
        )
        assert len(result) == 1 and len(result[0]) == 32
        bus, fd = provider._bus, provider._bus._sock.fileno()
        if peer_exits:
            daemon.terminate()
            await asyncio.wait_for(daemon.wait(), 2)
            with pytest.raises(EOFError):
                await asyncio.wait_for(bus.wait_for_disconnect(), 2)
        await provider.close()
        assert bus._sock.fileno() == -1
        assert bus._stream.closed
        assert fd not in asyncio.get_running_loop()._selector.get_map()
        assert provider._bus is None
        await provider.close()
    finally:
        await provider.close()
        if daemon.returncode is None:
            daemon.terminate()
        await asyncio.wait_for(daemon.communicate(), 2)
