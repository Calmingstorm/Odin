"""Ordinary-turn desktop dispatch contracts; no desktop or live service access."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.computer.integration import COMPUTER_TOOLS, ComputerIntegration, _grant
from src.config.schema import ToolsConfig
from src.discord.native_tools.registry import NativeToolDispatcher
from src.discord.tool_loop import ToolLoopRunner
from src.tools.executor import ToolExecutor
from src.tools.output_authorization import request_tool_scope, tool_scope_allows
from tests.test_chat_loop_recovery import _chat_state, _Gateway, _runner


def facade():
    controller = SimpleNamespace(
        session=AsyncMock(return_value={"state": "active"}),
        observe=AsyncMock(return_value={"state": "active"}),
        act=AsyncMock(return_value={"state": "active"}),
    )
    bot = SimpleNamespace(
        config=SimpleNamespace(computer=SimpleNamespace(enabled=True)),
        host_access_manager=SimpleNamespace(is_host_allowed=lambda *_: True),
        tool_executor=SimpleNamespace(check_permission=lambda *_: None),
    )
    return ComputerIntegration(bot, controller=controller)


def dispatch_state(*, owner="alice", turn="turn-one"):
    state = _chat_state([{"role": "user", "content": "Use the desktop and ordinary tools."}])
    state.user_id = owner
    state.message.author = SimpleNamespace(id=owner)
    state._req_id = turn
    state.policy = SimpleNamespace(trajectory_source="discord", skill_file_delivery="stage")
    return state


@pytest.mark.parametrize("desktop_denied", [False, True])
async def test_mixed_batch_grants_only_desktop_and_does_not_abort_ordinary(
    monkeypatch, desktop_denied,
):
    service = facade()
    def vision(_):
        if desktop_denied:
            raise PermissionError("unsupported vision")

    monkeypatch.setattr("src.computer.integration.require_vision", vision)
    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    runner._get_computer = lambda: service
    runner._get_config = lambda: SimpleNamespace(tools=SimpleNamespace(tool_timeout_seconds=5))
    seen = []

    async def captured(st, block):
        if block.name in COMPUTER_TOOLS:
            assert service.grant_allows(block.name, st.user_id, str(st.message.channel.id))
            # Child tasks do not inherit usable desktop authority.
            async def child():
                return service.grant_allows(block.name, st.user_id, str(st.message.channel.id))
            assert not await asyncio.create_task(child())
        else:
            assert _grant.get() is None
        assert tool_scope_allows(block.name)
        seen.append((st.user_id, st._req_id, block.name))
        return {"type": "tool_result", "tool_use_id": block.id, "content": "ok"}

    runner._run_one_tool_captured = captured
    state = dispatch_state()
    state.durability = SimpleNamespace(on_llm_response=AsyncMock(), after_tool=AsyncMock())
    calls = [SimpleNamespace(name=name, input={}, id=str(index)) for index, name in enumerate(
        ["search_history", "computer_observe", "read_file"])]
    results = await runner._execute_tool_calls(state, calls)
    assert [result["tool_use_id"] for result in results] == ["0", "1", "2"]
    assert results[0]["content"] == results[2]["content"] == "ok"
    assert ("Permission denied" in results[1]["content"]) == desktop_denied
    if desktop_denied:
        assert state.durability.after_tool.await_args.kwargs["uncertain"] is False
    assert _grant.get() is None

    # Later turns and another participant stay ordinary as well.
    for next_state in [dispatch_state(turn="turn-two"), dispatch_state(owner="bob")]:
        assert (await runner._run_one_tool(next_state, calls[0]))["content"] == "ok"
    assert len(seen) == (4 if desktop_denied else 5)


@pytest.mark.parametrize("enabled", [False, True])
async def test_native_ordinary_handler_and_skill_independent_of_desktop(enabled):
    service = facade()
    service.bot.config.computer.enabled = enabled
    ordinary = SimpleNamespace(handle=AsyncMock(return_value="ordinary"))
    dispatcher = NativeToolDispatcher(
        owners={"computer": service, "ordinary": ordinary}, skill_manager=SimpleNamespace(),
        tool_catalog=None, prompt_builder=None, channel_state=None,
    )
    dispatcher.register("search_history", "ordinary", "handle", "input")
    dispatcher.skills = SimpleNamespace(dispatch=AsyncMock(return_value=("skill", None)))
    # A minimal ordinary transport does not need desktop channel admission.
    message = SimpleNamespace()
    for name, expected in [("search_history", "ordinary"), ("custom_skill", "skill")]:
        result, _ = await dispatcher.dispatch(
            name, {}, message=message, user_id="alice", skill_file_delivery="stage")
        assert result == expected
    token = request_tool_scope.set(frozenset())
    try:
        result, _ = await dispatcher.dispatch(
            "search_history", {}, message=message, user_id="alice", skill_file_delivery="stage")
        assert result.error == "permission_denied"
    finally:
        request_tool_scope.reset(token)
    ordinary.handle.assert_awaited_once()


async def test_native_desktop_still_needs_foreground_authority():
    service = facade()
    dispatcher = NativeToolDispatcher(
        owners={"computer": service}, skill_manager=SimpleNamespace(),
        tool_catalog=None, prompt_builder=None, channel_state=None,
    )
    result, _ = await dispatcher.dispatch(
        "computer_act", {}, message=SimpleNamespace(channel=SimpleNamespace(id="room")),
        user_id="alice", skill_file_delivery="stage")
    assert result.error == "permission_denied"
    service.controller.act.assert_not_called()


def test_live_catalog_retains_rbac_and_explicit_allowed_tools():
    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    runner._get_config = lambda: SimpleNamespace(tools=SimpleNamespace(enabled=True))
    catalog = [{"name": name} for name in ["computer_act", "read_file", "run_command"]]
    runner._tool_catalog = SimpleNamespace(merged_definitions=lambda: catalog)
    runner._permissions = SimpleNamespace(
        filter_tools=lambda _user, tools: [tool for tool in tools if tool["name"] != "run_command"])
    assert runner._scoped_tools_for_request(user_id="alice") == catalog[:2]
    assert runner._scoped_tools_for_request(
        user_id="alice", api_allowed=["read_file", "run_command"],
    ) == [{"name": "read_file"}]
    assert runner._scoped_tools_for_request(user_id="alice", api_allowed=[]) == []


async def test_executor_ordinary_tools_keep_scope_and_desktop_reservation(tmp_path):
    executor = ToolExecutor(config=ToolsConfig(), memory_path=str(tmp_path / "memory.json"))
    executor.computer_reserved = lambda name: name in COMPUTER_TOOLS
    executor._handle_search_history = AsyncMock(return_value="ordinary")
    # Use handler resolution seam without any infrastructure operations.
    executor._resolve_handler = Mock(return_value=executor._handle_search_history)
    result = await executor._execute_inner("search_history", {}, user_id="alice")
    assert result.ok and result.output == "ordinary"
    assert (await executor._execute_inner("computer_act", {})).error == "permission_denied"
    token = request_tool_scope.set(frozenset())
    try:
        assert (await executor._execute_inner("search_history", {})).error == "permission_denied"
    finally:
        request_tool_scope.reset(token)
    executor._handle_search_history.assert_awaited_once()


@pytest.mark.parametrize("service_available", [False, True])
async def test_request_keeps_ordinary_and_desktop_tools_without_mode(service_available):
    async def script(*_):
        return SimpleNamespace(text="ok", tool_calls=[], stop_reason="end_turn")

    gateway = _Gateway(script)
    gateway.call_with_tools = AsyncMock(return_value=await script())
    runner = _runner(gateway)
    runner._get_computer = lambda: facade() if service_available else None
    state = dispatch_state()
    state.tools = [{"name": name} for name in ["read_file", "computer_session", "search_history"]]
    expected = list(state.tools)
    kind, _ = await runner._call_llm(state)
    assert kind == "ok"
    assert gateway.call_with_tools.await_args.kwargs["tools"] == expected


async def test_turn_cleanup_delegates_without_restriction_lookup():
    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    service = SimpleNamespace(finish_turn=AsyncMock())
    runner._get_computer = lambda: service
    state = dispatch_state()
    await runner._stop_computer_turn(state)
    service.finish_turn.assert_awaited_once_with(state)


def test_frame_integrity_retires_lost_evidence_without_blocking_ordinary_turn():
    from src.computer.vision import observation_image
    from tests.test_computer_vision import image_message, metadata, png

    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    state = dispatch_state()
    state.messages.append(image_message(observation_image(png(), metadata())))
    runner._get_computer = lambda: SimpleNamespace(enabled=True)
    runner._computer_frames(state, capture=True)
    assert state._computer_required_frames
    runner._computer_frames(state)
    state.messages.pop()
    assert runner._computer_frames(state) == frozenset()
    assert state._computer_frame_error


@pytest.mark.parametrize("malformed", [False, True])
async def test_unusable_previous_frame_does_not_block_request_assembly(malformed):
    from src.computer.vision import observation_image
    from tests.test_computer_vision import image_message, metadata, png

    async def script(*_):
        return SimpleNamespace(text="ok", tool_calls=[], stop_reason="end_turn")

    gateway = _Gateway(script)  # Not a supported native vision client.
    gateway.call_with_tools = AsyncMock(return_value=await script())
    runner = _runner(gateway)
    runner._get_computer = lambda: SimpleNamespace(enabled=True)
    state = dispatch_state()
    image = image_message(observation_image(png(), metadata()))
    if malformed:
        image["content"][0]["__computer_frame__"]["sha256"] = "bad"
    state.messages.insert(0, image)
    state.tools = [{"name": "read_file"}, {"name": "computer_act"}]
    kind, _ = await runner._call_llm(state)
    assert kind == "ok"
    request = gateway.call_with_tools.await_args.kwargs
    assert request["tools"] == state.tools
    assert state._computer_frame_error
    assert request["messages"][0]["content"][0]["type"] == "text"
    assert "__computer_frame__" not in request["messages"][0]["content"][0]


async def test_historical_frame_cannot_repair_retired_evidence(monkeypatch):
    from src.computer.vision import observation_image
    from tests.test_computer_vision import image_message, metadata, png

    monkeypatch.setattr("src.computer.integration.require_vision", lambda _: None)
    service = facade()
    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    runner._get_computer = lambda: service
    runner._run_one_tool_captured = AsyncMock(return_value={"content": "ok"})
    state = dispatch_state()
    state.durability = SimpleNamespace(after_tool=AsyncMock())
    runner._retire_computer_frames(state)
    for name in ["computer_act", "computer_observe", "read_file"]:
        result = await runner._run_one_tool(state, SimpleNamespace(name=name, input={}, id=name))
        assert ("Permission denied" in result["content"]) == (name == "computer_act")
    state.messages.append(image_message(observation_image(png(), metadata())))
    runner._computer_frames(state, capture=True)
    result = await runner._run_one_tool(
        state, SimpleNamespace(name="computer_act", input={}, id="new"))
    assert "Permission denied" in result["content"]
