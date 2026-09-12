"""R3 state migration and owned cleanup, without desktop IO."""

from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer.controller import ComputerController
from src.computer.integration import ComputerIntegration
from src.computer.models import ComputerError, RequestContext
from src.computer.store import ComputerStore
from src.config.schema import ToolsConfig
from src.discord.native_tools.registry import NativeToolDispatcher
from src.tools.executor import ToolExecutor
from tests.test_computer_contract_r1 import Stub


def test_migration_drops_only_obsolete_restrictions(tmp_path):
    context = RequestContext("alice", "channel", "turn", "localhost")
    store = ComputerStore(tmp_path / "state.db", tmp_path / "evidence")
    grant = store.create_session(context, "xed")
    grant = store.set_state(grant.session_id, "active")
    store.begin_action(grant, "action", "hash", 10)
    store.finish_action(grant.session_id, "action", {"status": "verified"})
    evidence_id = store.put_evidence(grant.session_id, b"preserved artifact", kind="export")
    store.record_cleanup(grant.session_id, {"stopped": True}, clean=True)
    store.db.execute("CREATE TABLE restrictions (owner_id TEXT NOT NULL, "
                     "channel_id TEXT NOT NULL, turn_id TEXT NOT NULL, "
                     "created_at REAL NOT NULL, PRIMARY KEY(owner_id,channel_id))")
    store.db.execute("INSERT INTO restrictions VALUES ('alice','channel','turn',0)")
    before = {table: [tuple(row) for row in store.db.execute(f"SELECT * FROM {table}")]
              for table in ("sessions", "evidence", "receipts", "session_cleanup")}
    store.close()
    for _ in range(2):
        store = ComputerStore(tmp_path / "state.db", tmp_path / "evidence")
        try:
            assert store.db.execute("SELECT name FROM sqlite_master "
                                    "WHERE name='restrictions'").fetchone() is None
            assert before == {
                table: [tuple(row) for row in store.db.execute(f"SELECT * FROM {table}")]
                for table in before
            }
            assert store.read_evidence(context, evidence_id)[0] == b"preserved artifact"
            assert store.receipt(grant.session_id, "action", "hash")["status"] == "verified"
            with pytest.raises(ComputerError, match="action_id_conflict"):
                store.receipt(grant.session_id, "action", "different hash")
        finally:
            store.close()


async def test_finish_turn_only_stops_its_owned_session(tmp_path):
    store = ComputerStore(tmp_path / "state.db", tmp_path / "evidence")
    backend = Stub()
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    context = RequestContext("alice", "channel", "current", "localhost")
    try:
        grant = await controller.session(context, {"operation": "start", "app": "xed"})
        for other in (replace(context, owner_id="bob"), replace(context, channel_id="other"),
                      replace(context, host_id="other"), replace(context, turn_id="old")):
            assert await controller.finish_turn(other) is None
            assert not backend.stopped
        await controller.finish_turn(context)
        assert backend.stopped
        assert store.get_session(grant["session_id"]).state == "cancelled"
        assert await controller.finish_turn(context) is None
    finally:
        await controller.close()
        store.close()


@pytest.mark.parametrize("ending", ["close", "disable", "reopen", "failure"])
async def test_ordinary_executor_survives_real_desktop_lifecycle(tmp_path, monkeypatch, ending):
    monkeypatch.setattr("src.computer.integration.require_vision", lambda _: None)
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    backend = Stub()
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    executor = ToolExecutor(config=ToolsConfig())
    handler = AsyncMock(return_value="ordinary executed")
    monkeypatch.setattr(executor, "_resolve_handler", lambda _: handler)
    bot = SimpleNamespace(config=SimpleNamespace(computer=SimpleNamespace(enabled=True)),
                          host_access_manager=SimpleNamespace(is_host_allowed=lambda *_: True),
                          tool_executor=executor)
    service = ComputerIntegration(bot, controller=controller)
    executor.computer_reserved = service.reserves_tool
    dispatcher = NativeToolDispatcher(owners={"computer": service}, skill_manager=SimpleNamespace(),
                                      tool_catalog=None, prompt_builder=None, channel_state=None)
    dispatcher.skills = SimpleNamespace(handles=lambda _: True,
        dispatch=AsyncMock(return_value=("ordinary native", None)))
    context = RequestContext("alice", "channel", "turn", "localhost")
    st = SimpleNamespace(user_id="alice", _req_id="turn", _computer_serving=None,
        message=SimpleNamespace(author=SimpleNamespace(id="alice"),
                                channel=SimpleNamespace(id="channel")),
        policy=SimpleNamespace(trajectory_source="discord"))

    async def ordinary():
        for who in ("alice", "bob"):
            result = await executor._execute_inner("ordinary", {}, user_id=who)
            assert result.ok and result.output == "ordinary executed"
            native, _ = await dispatcher.dispatch("ordinary", {}, message=st.message,
                user_id=who, skill_file_delivery="stage")
            assert native == "ordinary native"

    try:
        await ordinary()
        with service.foreground(st, SimpleNamespace(id="start", name="computer_session")):
            result = await service._handle_computer_session({"operation": "start", "app": "xed"})
            assert result.ok
            await ordinary()
        grant = store.find_session(context)
        assert grant.state == "active"
        st._req_id = "later-turn"
        await ordinary()
        if ending == "close":
            await controller.session(context, {"operation": "close"})
        elif ending == "disable":
            await service.set_enabled(False)
            bot.config.computer.enabled = False
        elif ending == "failure":
            backend.stop = AsyncMock(side_effect=RuntimeError("cleanup failed"))
            result = await controller.session(context, {"operation": "close"})
            assert result["state"] == "quarantined"
        else:
            controller._watchdogs.pop(grant.session_id).cancel()
            controller._live.clear()
            store.close()
            store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
            controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
            service.controller = controller
            assert store.get_session(grant.session_id).state == "quarantined"
        await ordinary()
    finally:
        await controller.close()
        store.close()
