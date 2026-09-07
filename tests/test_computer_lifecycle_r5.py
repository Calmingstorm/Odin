"""Actual composition plus transactional lifecycle, with disposable data only."""
import asyncio
import builtins
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.computer.manager import ComputerLifecycle
from src.config.schema import Config
from src.discord.tool_catalog import ToolCatalog
from src.web.api.computer import register_computer


def owner(tmp_path, *, enabled=False, factory=None, persist=None, **settings):
    root = tmp_path / "private"
    root.mkdir(mode=0o700, exist_ok=True)
    bot = SimpleNamespace(
        config=Config(discord={"token": "test"}, computer={
            "enabled": enabled, "storage_dir": str(root), **settings}),
        skill_manager=SimpleNamespace(get_tool_definitions=lambda: []),
        mcp_manager=SimpleNamespace(get_tool_definitions=lambda: []),
        host_access_manager=SimpleNamespace(is_host_allowed=lambda *_: True),
        tool_executor=SimpleNamespace(check_permission=lambda *_: None),
    )
    manager = ComputerLifecycle(bot, factory=factory, persist=persist or AsyncMock(
        return_value=(None, False)))
    bot.computer = manager
    bot.computer_authorize_context = manager.authorize_context
    bot.computer_set_enabled = manager.set_enabled
    bot.tool_catalog = ToolCatalog(get_config=lambda: bot.config,
        skill_manager=bot.skill_manager, computer_available=lambda: manager.enabled)
    return bot, manager


def fake_factory(*_args, **_kwargs):
    return SimpleNamespace(controller=SimpleNamespace(store=None),
                           set_enabled=AsyncMock(), close=AsyncMock())


async def test_disabled_owner_start_close_no_import_storage_tasks(tmp_path, monkeypatch):
    bot, manager = owner(tmp_path)
    manager.settings.storage_dir = str(tmp_path / "must-not-create")
    original = builtins.__import__

    def blocked(name, *args, **kwargs):
        if name.endswith((".integration", ".controller", ".store", ".runtime")):
            pytest.fail("Disabled lifecycle imported " + name)
        return original(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", blocked)
    before = asyncio.all_tasks()
    await manager.start()
    assert not manager.enabled and manager._service is None and manager._janitor is None
    assert await manager.operator_status(owner_id="a", web_session_id="s") == manager.snapshot()
    assert "computer_act" not in {t["name"] for t in bot.tool_catalog.merged_definitions()}
    await manager.close()
    assert asyncio.all_tasks() == before
    assert not (tmp_path / "must-not-create").exists()


async def test_cancelled_enable_settles_config_publication(tmp_path):
    entered, release = asyncio.Event(), asyncio.Event()

    async def persist(changes):
        assert changes == [(("computer", "enabled"), True)]
        entered.set()
        await release.wait()
        return None, False

    bot, manager = owner(tmp_path, factory=fake_factory, persist=persist)
    task = asyncio.create_task(manager.set_enabled(True))
    await entered.wait()
    task.cancel()
    await asyncio.sleep(0)
    assert not task.done() and not bot.config.computer.enabled
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert manager.enabled and bot.config.computer.enabled
    assert "computer_act" in {t["name"] for t in bot.tool_catalog.merged_definitions()}
    await manager.close()


async def test_persistence_preserves_unrelated_placeholders_and_current_publication(tmp_path):
    from functools import partial

    from src.config.persistence import persist_config_paths_locked

    config_path = tmp_path / "config.yml"
    config_path.write_text("# keep\ndiscord:\n  token: ${TOKEN}\ncomputer:\n  enabled: false\n")
    bot, manager = owner(tmp_path, factory=fake_factory,
        persist=partial(persist_config_paths_locked, path=config_path))
    await manager.set_enabled(True)
    assert bot.config.computer.enabled and manager.enabled
    saved = config_path.read_text()
    assert "# keep" in saved and "${TOKEN}" in saved and "enabled: true" in saved
    await manager.set_enabled(False)
    saved = config_path.read_text()
    assert "${TOKEN}" in saved and "enabled: false" in saved
    await manager.close()


async def test_operator_stop_independent_of_hung_model_and_observation(tmp_path):
    _, manager = owner(tmp_path, factory=fake_factory)
    await manager.set_enabled(True)
    entered, release = asyncio.Event(), asyncio.Event()

    async def observe(**_):
        entered.set()
        await release.wait()
        return {"frame": {}}

    manager._service.operator_observe = observe
    manager._service.operator_stop = AsyncMock(return_value={"state": "cancelled"})
    observation = asyncio.create_task(manager.operator_observe(
        owner_id="alice", web_session_id="b"))
    model = asyncio.create_task(asyncio.sleep(60))
    try:
        await entered.wait()
        response = await asyncio.wait_for(manager.operator_stop(
            owner_id="alice", web_session_id="b"), 0.25)
        assert response["state"] == "cancelled"
        assert not observation.done() and not model.done()
    finally:
        release.set()
        await observation
        model.cancel()
        await asyncio.gather(model, return_exceptions=True)
        await manager.close()


async def test_restart_only_settings_pinned_across_toggles(tmp_path):
    calls = []

    def factory(bot, *, settings):
        calls.append(settings)
        return fake_factory()

    bot, manager = owner(tmp_path, factory=factory)
    original = manager.settings.storage_dir
    bot.config.computer.storage_dir = str(tmp_path / "changed-not-provisioned")
    bot.config.computer.runtime_sudo = True
    for _ in range(2):
        await manager.set_enabled(True)
        assert manager.snapshot()["restart_required"] == ["storage_dir", "runtime_sudo"]
        await manager.set_enabled(False)
    assert len(calls) == 2
    assert all(c.storage_dir == original and c.runtime_sudo is False for c in calls)
    assert not (tmp_path / "changed-not-provisioned").exists()
    await manager.close()


async def test_collision_and_missing_wayland_session_never_persist_or_construct(tmp_path):
    factory, persist = Mock(side_effect=fake_factory), AsyncMock(return_value=(None, False))
    bot, manager = owner(tmp_path, factory=factory, persist=persist)
    bot.skill_manager.get_tool_definitions = lambda: [{"name": "computer_act"}]
    with pytest.raises(ValueError, match="collision"):
        await manager.set_enabled(True)
    bot.skill_manager.get_tool_definitions = lambda: []
    manager.settings.platform = "wayland"
    with pytest.raises(ValueError, match="Wayland"):
        await manager.set_enabled(True)
    persist.assert_not_called()
    factory.assert_not_called()
    assert not bot.config.computer.enabled


async def test_failed_enable_closes_candidate_but_failed_disable_does_not_revive(tmp_path):
    candidates = []

    def factory(*args, **kwargs):
        value = fake_factory()
        candidates.append(value)
        return value

    persist = AsyncMock(return_value=(OSError("not saved"), False))
    bot, manager = owner(tmp_path, factory=factory, persist=persist)
    with pytest.raises(RuntimeError, match="enable was not saved"):
        await manager.set_enabled(True)
    assert not manager.enabled and not bot.config.computer.enabled
    candidates[0].close.assert_awaited_once()
    persist.return_value = (None, False)
    await manager.set_enabled(True)
    persist.return_value = (OSError("not saved"), False)
    with pytest.raises(RuntimeError, match="disable not saved"):
        await manager.set_enabled(False)
    assert bot.config.computer.enabled and not manager.enabled
    assert manager.snapshot()["error"] == "disable_not_saved"
    assert "computer_act" not in {t["name"] for t in bot.tool_catalog.merged_definitions()}
    assert manager.reserves_tool("computer_act")
    await manager.close()


async def test_quarantined_cleanup_retains_owner_and_blocks_reenable(tmp_path):
    bot, manager = owner(tmp_path, factory=fake_factory)
    await manager.set_enabled(True)
    service = manager._service
    service.close.side_effect = RuntimeError("cleanup failed")
    with pytest.raises(RuntimeError, match="cleanup unverified"):
        await manager.set_enabled(False)
    assert manager._service is service and not manager.enabled and not bot.config.computer.enabled
    with pytest.raises(RuntimeError, match="cleanup remains"):
        await manager.set_enabled(True)
    service.close.side_effect = None
    await manager.close()
    assert manager._service is None


async def test_real_facade_foreground_dispatch_revocation_and_operator_artifacts(
    tmp_path, monkeypatch,
):
    from src.computer.controller import ComputerController
    from src.computer.integration import ComputerIntegration
    from src.computer.store import ComputerStore
    from src.discord.native_tools.registry import NativeToolDispatcher
    from tests.test_computer_contract_r1 import Stub

    monkeypatch.setattr("src.computer.integration.require_vision", lambda _: None)
    backend = Stub()
    stop_entered, release_stop = asyncio.Event(), asyncio.Event()
    immediate_stop = backend.stop

    async def controlled_stop():
        result = await immediate_stop()
        stop_entered.set()
        await release_stop.wait()
        return result

    backend.stop = controlled_stop

    def factory(bot, *, settings):
        store = ComputerStore(tmp_path / "private" / "db", tmp_path / "private" / "evidence")
        integration = ComputerIntegration(bot, settings=settings, controller=ComputerController(
            store, lambda _: backend, lambda ctx: integration._authorize(ctx), enabled=True))
        integration._owns_store = True
        return integration

    bot, manager = owner(tmp_path, factory=factory)
    await manager.set_enabled(True)
    dispatcher = NativeToolDispatcher(owners={"computer": manager},
        skill_manager=SimpleNamespace(), tool_catalog=bot.tool_catalog,
        prompt_builder=None, channel_state=None)
    st = SimpleNamespace(user_id="alice", _req_id="turn",
        policy=SimpleNamespace(trajectory_source="discord"),
        message=SimpleNamespace(author=SimpleNamespace(id="alice"),
                                channel=SimpleNamespace(id="room")))
    call = SimpleNamespace(name="computer_session", id="start", input={"operation": "start"})
    assert dispatcher.handles("computer_session")
    with manager.foreground(st, call):
        result, _ = await dispatcher.dispatch(
            "computer_session", {"operation": "start", "app": "xed"},
            message=st.message, user_id="alice", skill_file_delivery="stage")
        assert result.ok
    from tests.test_computer_operator_auth_r5 import bound_operator

    with bound_operator(bot, "alice", "browser"):
        status = await manager.operator_status(owner_id="alice", web_session_id="browser")
        assert status["state"] == "active" and status["backend"]["input_supported"] is True
        image = await manager.operator_observe(owner_id="alice", web_session_id="browser")
        assert set(image) == {"frame"} and "image_bytes" not in image
        evidence = await manager.operator_evidence(owner_id="alice", web_session_id="browser",
                                                   evidence_id=image["frame"]["evidence_id"])
    assert evidence["data"].startswith(b"\x89PNG")
    assert evidence["expires_at"].endswith("+00:00")
    # A later permission change is noticed while the model is not doing anything.
    watcher = manager._watchers[("alice", "room", "turn")]
    bot.host_access_manager.is_host_allowed = lambda *_: False
    await stop_entered.wait()
    # The backend's own stopped flag precedes the controller's durable cleanup
    # receipt and final session state. It is not a completion primitive.
    assert backend.stopped and not watcher.done()
    assert manager._service.controller.store.find_session(
        manager._service._context(st)).state == "quarantined"
    release_stop.set()
    await watcher
    assert manager._service.controller.store.find_session(
        manager._service._context(st)).state == "cancelled"
    await manager.close()
    assert not tuple((tmp_path / "private" / "evidence").iterdir())


async def test_real_store_startup_idle_ttl_and_disable_purge(tmp_path):
    from src.computer.integration import ComputerIntegration
    from src.computer.models import RequestContext
    from src.computer.store import EVIDENCE_TTL, ComputerStore

    clock = [100.0]
    store = ComputerStore(tmp_path / "private-db", tmp_path / "evidence", clock=lambda: clock[0])
    context = RequestContext("alice", "room", "turn", "localhost")
    grant = store.create_session(context, "xed")
    old = store.put_evidence(grant.session_id, b"old", kind="export")
    clock[0] += EVIDENCE_TTL + 1
    assert (tmp_path / "evidence" / old).exists()

    def factory(bot, *, settings):
        controller = SimpleNamespace(store=store, set_enabled=AsyncMock(), close=AsyncMock())
        return ComputerIntegration(bot, settings=settings, controller=controller)

    _, manager = owner(tmp_path, factory=factory)
    try:
        await manager.set_enabled(True)
        assert not (tmp_path / "evidence" / old).exists()
        fresh = store.put_evidence(grant.session_id, b"fresh", kind="export")
        clock[0] += EVIDENCE_TTL + 1
        async with asyncio.timeout(2):
            while (tmp_path / "evidence" / fresh).exists():
                await asyncio.sleep(0.01)
        last = store.put_evidence(grant.session_id, b"last", kind="export")
        await manager.set_enabled(False)
        assert not (tmp_path / "evidence" / last).exists()
        assert store.db.execute("SELECT COUNT(*) FROM evidence").fetchone()[0] == 0
        assert store.get_session(grant.session_id) is not None
        assert manager._janitor is None
    finally:
        await manager.close()
        store.close()


async def test_generation_bound_call_cannot_target_replacement(tmp_path, monkeypatch):
    from src.computer.integration import ComputerIntegration

    monkeypatch.setattr("src.computer.integration.require_vision", lambda _: None)

    def factory(bot, *, settings):
        return ComputerIntegration(bot, settings=settings, controller=SimpleNamespace(
            store=None, set_enabled=AsyncMock(), close=AsyncMock(),
            session=AsyncMock(return_value={"state": "closed"})))

    _, manager = owner(tmp_path, factory=factory)
    await manager.set_enabled(True)
    st = SimpleNamespace(user_id="alice", _req_id="turn",
        policy=SimpleNamespace(trajectory_source="discord"),
        message=SimpleNamespace(author=SimpleNamespace(id="alice"),
                                channel=SimpleNamespace(id="room")))
    call = SimpleNamespace(name="computer_session", id="call", input={"operation": "status"})
    with manager.foreground(st, call):
        assert manager.grant_allows(call.name, "alice", "room")
        await manager.set_enabled(False)
        await manager.set_enabled(True)
        assert not manager.grant_allows(call.name, "alice", "room")
        with pytest.raises(PermissionError, match="generation revoked"):
            await manager._handle_computer_session({"operation": "status"})
    await manager.close()


async def test_real_bot_composition_has_one_lifecycle_and_disabled_loop_is_inert(
    tmp_path, monkeypatch,
):
    from tests.fakes import make_bot

    monkeypatch.chdir(tmp_path)
    bot = make_bot()
    assert bot.computer is bot.native_tools.owners["computer"]
    assert bot.tool_loop._computer_service() is None
    assert bot.computer_set_enabled.__self__ is bot.computer
    assert not bot.tool_executor.computer_reserved("computer_act")
    await bot.computer.start()
    assert bot.computer._service is None
    await bot.computer.close()


async def test_production_manager_api_disabled_status_and_toggle(tmp_path):
    bot, manager = owner(tmp_path, factory=fake_factory)
    from src.config.schema import ApiTokenIdentity
    from src.health.server import SessionManager

    principal = ApiTokenIdentity(token="fixture-only", user_id="alice", tier="admin")
    bot.config.web.api_tokens = [principal]
    sessions = SessionManager()
    sid, _ = sessions.create(principal)

    @web.middleware
    async def auth(request, handler):
        request._api_identity = principal
        request._session_id = sid
        request._session_managed = True
        return await handler(request)

    routes = web.RouteTableDef()
    register_computer(routes, bot)
    app = web.Application(middlewares=[auth])
    app["session_manager"] = sessions
    app.router.add_routes(routes)
    async with TestClient(TestServer(app)) as client:
        response = await client.get("/api/computer")
        assert response.status == 200
        body = await response.json()
        assert body["runtime_enabled"] is False and body["configured_enabled"] is False
        assert body["backend"]["input_supported"] is None
        assert (await client.post("/api/computer/enabled", json={"enabled": True})).status == 200
        assert manager.enabled
        assert (await client.post("/api/computer/enabled", json={"enabled": False})).status == 200
        assert not manager.enabled
    await manager.close()
