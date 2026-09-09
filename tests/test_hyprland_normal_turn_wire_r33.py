"""Normal turn through the compiled guardian to disposable AF_UNIX peers.

Capture pixels, scope snapshots, installation trust and preliminary probes are
synthetic. Native process IPC, peer credentials, leases, input wire requests and
cleanup are real. This is not live compositor or application receiver proof.
"""

import json
import os
import struct
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer.runtime import hyprland_backend as hb
from src.computer.runtime.hyprland_capture import ExplicitOutput
from src.computer.runtime.hyprland_guardian import HyprlandGuardian
from src.discord.native_tools.registry import NativeToolDispatcher
from src.discord.tool_loop import ToolLoopRunner
from tests.computer.test_hyprland_backend import native as pixels
from tests.computer.test_hyprland_backend import scope
from tests.test_computer_dispatch_r3 import dispatch_state
from tests.test_computer_hyprland_integration_r32 import settings
from tests.test_computer_hyprland_turnloop_r33 import action, call, observe
from tests.test_computer_lifecycle_r5 import owner
from tests.test_computer_native_vision_r5 import client, serving
from tests.test_hyprland_python_native_wire_r32 import native as native


@pytest.fixture
async def joined(tmp_path, monkeypatch, native):
    binary, peer = native
    output = ExplicitOutput("WIRE-1", 800, 600, 0, 0, 0, 800, 600)

    class ScopeSnapshots:
        def __init__(self, **kwargs):
            assert kwargs["socket_path"] == peer.scope

        async def snapshot(self, metadata):
            value = scope(output)
            value["application"]["uid"] = os.getuid()
            return value

        async def close(self):
            pass

    async def capture(**kwargs):
        await kwargs["scope"]()
        # Deliberately synthetic image changes based on received native input,
        # not dispatch count. No desktop capture executable is ever launched.
        return pixels(output, shade=40 * len(peer.buttons()))

    async def pin(**kwargs):
        assert kwargs["wayland_path"] == peer.wayland
        assert kwargs["expected_pid"] == os.getpid()
        return SimpleNamespace(digest="f" * 64), SimpleNamespace(close=lambda: None)

    async def probe(path, *args, **kwargs):
        assert path in (peer.wayland, peer.scope)
        return SimpleNamespace(close=lambda: None)

    monkeypatch.setattr(hb, "trusted_binary", lambda _: None)
    monkeypatch.setattr(hb, "pin_connections", pin)
    monkeypatch.setattr(hb, "connect_peer", probe)
    monkeypatch.setattr(hb, "revalidate", AsyncMock())
    monkeypatch.setattr(hb, "capture_explicit_output", capture)
    monkeypatch.setattr("src.computer.runtime.hyprland_scope.HyprlandScopeProvider",
                        ScopeSnapshots)
    values = settings(
        wayland_uid=os.getuid(), hyprland_runtime_dir=str(Path(peer.wayland).parent),
        hyprland_wayland_display=Path(peer.wayland).name,
        hyprland_scope_socket=peer.scope, hyprland_output_name="WIRE-1",
        hyprland_compositor_pid=os.getpid(), hyprland_guardian_binary=binary,
    ).model_dump(exclude={"enabled", "storage_dir"})
    bot, manager = owner(tmp_path, enabled=True, **values)
    await manager.start()
    state = dispatch_state()
    state._computer_serving = serving(client())
    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    runner._get_computer = lambda: manager
    runner._tool_executor = bot.tool_executor
    runner._delivery = SimpleNamespace(set_status=AsyncMock())
    runner._audit = SimpleNamespace(log_event=AsyncMock())
    runner._audit_tool_outcome = AsyncMock()
    runner._channel_state = SimpleNamespace(track_action=lambda *_, **__: None)
    runner._native_tools = NativeToolDispatcher(
        owners={"computer": manager}, skill_manager=bot.skill_manager,
        tool_catalog=bot.tool_catalog, prompt_builder=None, channel_state=None)
    try:
        yield SimpleNamespace(manager=manager, service=manager._service,
                              runner=runner, state=state, peer=peer)
    finally:
        await manager.close()


@pytest.mark.parametrize("surface", ["discord", "webui"])
async def test_normal_turn_native_stroke_next_frame_no_replay_and_cleanup(joined, surface):
    normal = joined
    if surface == "webui":
        # Authenticated foreground adapter binding, not an HTTP auth test.
        normal.state.message._odin_source = "web"
        normal.state.message._computer_web_session_id = "r33-disposable-browser"
        normal.state.message._computer_web_authorized = lambda: True
    assert normal.service._context(normal.state).surface == surface
    result = await normal.runner._run_one_tool(
        normal.state, call("computer_session", operation="start"))
    assert "hyprland_best_effort" in result["content"], result
    controller = normal.service.controller
    session = controller.store.find_session(normal.service._context(normal.state))
    backend = controller._live[session.session_id].backend
    assert type(backend) is hb.HyprlandRuntimeBackend
    guardian = backend._guardian
    assert type(guardian) is HyprlandGuardian and guardian.alive
    assert guardian._child.pid != os.getpid()
    assert any(p["pid"] == guardian._child.pid for p in backend._descriptor["processes"])
    grant = {"session_id": session.session_id, "generation": session.generation}
    await observe(normal, grant)
    initial_image = normal.state.pending_image_blocks[-1]
    first = action(normal, grant, "native-stroke")
    first.pop("x")
    first.pop("y")
    points = [[30, 40], [120, 160], [260, 100], [320, 240]]
    first.update(operation="polyline", points=points, duration=0.4)
    result = await normal.runner._run_one_tool(normal.state, call("computer_act", **first))
    assert "Image loaded" in result["content"], result
    assert normal.peer.buttons() == [(272, 1), (272, 0)]
    pointer = [(op, payload) for iface, op, payload in normal.peer.events if iface == "pointer"]
    motions = [struct.unpack("=IIIII", payload)[1:] for op, payload in pointer if op == 1]
    assert motions == [(x, y, 800, 600) for x, y in points]
    assert sum(op == 4 for op, _ in pointer) >= len(points)
    for index, (op, _) in enumerate(pointer):
        if op == 1:
            assert pointer[index + 1][0] == 4, "every vertex must be framed"
    assert any(r["op"] == "renew" for r in normal.peer.requests)
    assert len(normal.state.pending_image_blocks) == 2
    assert normal.state.pending_image_blocks[-1] != initial_image
    stroke_image = normal.state.pending_image_blocks[-1]
    second = action(normal, grant, "native-second")
    assert second["observation_id"] != first["observation_id"]
    before = list(normal.peer.events)
    replay = await normal.runner._run_one_tool(normal.state, call("computer_act", **first))
    assert "Image loaded" not in replay["content"]
    assert normal.peer.events == before
    assert len(normal.state.pending_image_blocks) == 2
    result = await normal.runner._run_one_tool(normal.state, call("computer_act", **second))
    assert "Image loaded" in result["content"], result
    assert normal.peer.buttons() == [(272, 1), (272, 0)] * 2
    assert len(normal.state.pending_image_blocks) == 3
    assert normal.state.pending_image_blocks[-1] != stroke_image
    assert sum(r["op"] == "arm" for r in normal.peer.requests) == 2
    closed = await normal.runner._run_one_tool(normal.state, call(
        "computer_session", operation="close", session_id=session.session_id))
    assert json.loads(closed["content"])["state"] == "closed", closed
    assert not guardian.alive and guardian._child.returncode is not None
    assert any(r["op"] == "release_all" for r in normal.peer.requests)
    assert normal.peer.armed is False
    assert not normal.peer.errors
