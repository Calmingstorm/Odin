"""Config-gated built-in tool visibility: normalization, catalog filtering
with name reservation, dispatch-time rejection on both spines, and the
Tools management routes — real Config objects, real catalog, real routes
over a tmp config file on disk."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

import src.config.persistence as persistence_mod
from src.config.schema import Config, DiscordConfig, ToolsConfig
from src.discord.native_tools.registry import NativeToolDispatcher
from src.discord.tool_catalog import ToolCatalog
from src.tools.builtin_policy import (
    BUILTIN_TOOL_NAMES,
    BuiltinToolPolicy,
    disabled_rejection,
    normalize_disabled_tools,
)
from src.tools.executor import ToolExecutor
from src.tools.registry import get_tool_definitions
from src.tools.result_validator import ToolResult
from src.web.api.observability import register_tools_meta


def _cfg(disabled=()):
    return Config(
        discord=DiscordConfig(token="test-token"),
        tools=ToolsConfig(disabled_tools=list(disabled)),
    )


class _FakeSkillManager:
    def __init__(self, defs=None):
        self._defs = defs or []

    def get_tool_definitions(self):
        return self._defs


def _catalog(config, skill_defs=None, mcp_defs=None):
    return ToolCatalog(
        get_config=lambda: config,
        skill_manager=_FakeSkillManager(skill_defs),
        get_mcp_definitions=(lambda: mcp_defs or []) if mcp_defs is not None else None,
    )


class TestNormalization:
    def test_trim_dedupe_preserve_order_drop_empties(self):
        raw = ["  kubectl ", "terraform_ops", "kubectl", "", "   ", "terraform_ops"]
        assert normalize_disabled_tools(raw) == ["kubectl", "terraform_ops"]

    def test_non_list_and_non_strings_tolerated(self):
        assert normalize_disabled_tools(None) == []
        assert normalize_disabled_tools("kubectl") == []
        assert normalize_disabled_tools([1, None, "kubectl"]) == ["kubectl"]

    def test_schema_validator_normalizes_at_load(self):
        config = _cfg([" kubectl ", "kubectl", ""])
        assert config.tools.disabled_tools == ["kubectl"]

    def test_unknown_names_preserved_ignored_and_startup_safe(self):
        config = _cfg(["not_a_real_tool", "kubectl"])
        # Preserved in config (survives catalog drift)...
        assert "not_a_real_tool" in config.tools.disabled_tools
        # ...ignored by the policy (only real built-ins gate).
        policy = BuiltinToolPolicy(get_config=lambda: config)
        assert policy.disabled_set() == {"kubectl"}
        assert not policy.is_disabled("not_a_real_tool")

    def test_case_sensitive(self):
        config = _cfg(["Kubectl"])
        policy = BuiltinToolPolicy(get_config=lambda: config)
        assert not policy.is_disabled("kubectl")


class TestCatalogFiltering:
    def test_empty_list_preserves_exact_static_order(self):
        config = _cfg()
        merged = _catalog(config).merged_definitions(cache_result=False)
        static = get_tool_definitions()
        hidden = _catalog(config).backend_hidden_names(config)
        expected = [t["name"] for t in static if t["name"] not in hidden]
        assert [t["name"] for t in merged][: len(expected)] == expected

    def test_each_candidate_independently_removable(self):
        for name in ("kubectl", "terraform_ops", "bulk_ingest_knowledge", "collect_loop_agents"):
            config = _cfg([name])
            names = [t["name"] for t in _catalog(config).merged_definitions(cache_result=False)]
            assert name not in names
            # Only that tool left; everything else untouched.
            baseline = [
                t["name"]
                for t in _catalog(_cfg()).merged_definitions(
                    cache_result=False
                )
            ]
            assert set(baseline) - set(names) == {name}

    def test_spawn_loop_agents_disable_survives_axis_policy(self):
        config = _cfg(["spawn_loop_agents"])
        names = [t["name"] for t in _catalog(config).merged_definitions(cache_result=False)]
        assert "spawn_loop_agents" not in names
        assert "spawn_agent" in names

    def test_static_definitions_never_mutated(self):
        before = [t["name"] for t in get_tool_definitions()]
        config = _cfg(["kubectl", "terraform_ops"])
        _catalog(config).merged_definitions(cache_result=False)
        assert [t["name"] for t in get_tool_definitions()] == before

    def test_disabled_names_remain_reserved_against_skills_and_mcp(self):
        shadow_skill = {
            "name": "kubectl",
            "description": "impostor",
            "input_schema": {"type": "object"},
        }
        legit_mcp = {"name": "mcp_x_probe", "description": "d", "input_schema": {}}
        shadow_mcp = {"name": "terraform_ops", "description": "impostor", "input_schema": {}}
        config = _cfg(["kubectl", "terraform_ops"])
        merged = _catalog(
            config, skill_defs=[shadow_skill], mcp_defs=[legit_mcp, shadow_mcp]
        ).merged_definitions(cache_result=False)
        names = [t["name"] for t in merged]
        assert "kubectl" not in names
        assert "terraform_ops" not in names
        assert "mcp_x_probe" in names

    def test_configured_filters_still_apply_when_switch_on(self):
        # claude_code has no host configured -> hidden even though enabled.
        config = _cfg([])
        names = [t["name"] for t in _catalog(config).merged_definitions(cache_result=False)]
        assert "claude_code" not in names


class TestDispatchRejection:
    def _config(self, disabled):
        return _cfg(disabled)

    async def test_executor_rejects_before_handler(self):
        executor = ToolExecutor(ToolsConfig())
        executor.set_builtin_policy(
            BuiltinToolPolicy(get_config=lambda: self._config(["run_command"]))
        )

        def _boom(*a, **k):  # the sanctioned instance-__dict__ patch seam
            raise AssertionError("handler must never be entered")

        executor.__dict__["_handle_run_command"] = _boom
        result = await executor.execute("run_command", {"command": "true", "host": "localhost"})
        assert result.ok is False
        assert result.error == "tool_disabled"
        assert "was not executed" in result.output
        assert result.tool_name == "run_command"

    async def test_executor_ungated_without_policy(self):
        executor = ToolExecutor(ToolsConfig())
        result = await executor.execute("nonexistent_tool", {})
        assert result.error == "unknown_tool"

    async def test_native_dispatch_rejects_before_owner_lookup(self):
        # owners={} would KeyError on any real dispatch — rejection first
        # proves the handler path is never entered.
        dispatcher = NativeToolDispatcher(
            owners={},
            skill_manager=_FakeSkillManager(),
            tool_catalog=None,
            prompt_builder=None,
            channel_state=None,
            builtin_policy=BuiltinToolPolicy(
                get_config=lambda: self._config(["list_schedules"])
            ),
        )
        result, effects = await dispatcher.dispatch(
            "list_schedules",
            {},
            message=SimpleNamespace(author="x"),
            user_id="u",
            skill_file_delivery="send",
        )
        assert result.ok is False
        assert result.error == "tool_disabled"

    async def test_live_config_read_not_snapshot(self):
        # Policy must observe a REPLACED config object (bot.config rebind).
        holder = SimpleNamespace(config=self._config([]))
        executor = ToolExecutor(ToolsConfig())
        executor.set_builtin_policy(BuiltinToolPolicy(get_config=lambda: holder.config))
        holder.config = self._config(["kubectl"])
        result = await executor.execute("kubectl", {"args": "version"})
        assert result.error == "tool_disabled"

    def test_rejection_shape(self):
        r = disabled_rejection("kubectl")
        assert r.ok is False and r.error == "tool_disabled" and r.tool_name == "kubectl"

    @pytest.mark.parametrize(
        "tool_name,tool_input",
        [
            ("ingest_document", {"source": "blocked", "content": "must not persist"}),
            ("search_knowledge", {"query": "must not search"}),
            ("list_knowledge", {}),
            (
                "bulk_ingest_knowledge",
                {"items": [{"type": "url", "url": "https://example.invalid"}]},
            ),
            ("invoke_skill", {"name": "must-not-run", "input": {}}),
        ],
    )
    async def test_background_special_cased_builtins_reject_before_effect(
        self, tool_name, tool_input
    ):
        """Every pre-executor built-in branch shares one fail-closed gate.

        These dependencies explode on inspection, not merely on mutation, so
        each row proves the corresponding store/skill branch was never entered.
        """
        from src.discord.background_task import _execute_tool

        class _ExplodingStore:
            def __getattribute__(self, name):
                if name.startswith("_"):
                    return object.__getattribute__(self, name)
                raise AssertionError(f"knowledge store entered for {tool_name}: {name}")

        class _ExplodingSkills:
            def has_skill(self, name):
                raise AssertionError(f"skill manager entered for {tool_name}: {name}")

        executor = ToolExecutor(ToolsConfig())
        executor.set_builtin_policy(
            BuiltinToolPolicy(get_config=lambda: self._config([tool_name]))
        )
        result = await _execute_tool(
            tool_name,
            tool_input,
            executor,
            _ExplodingSkills(),
            _ExplodingStore(),
            object(),
            "operator",
        )

        assert isinstance(result, ToolResult)
        assert result.ok is False
        assert result.error == "tool_disabled"
        assert result.tool_name == tool_name
        assert "was not executed" in result.output


SEED_CONFIG = """\
discord:
  token: test-token
tools:
  disabled_tools: []
"""


@pytest.fixture
async def tools_api(tmp_path, monkeypatch):
    config_path = tmp_path / "config.yml"
    config_path.write_text(SEED_CONFIG, encoding="utf-8")
    monkeypatch.setattr(persistence_mod, "active_config_path", lambda: config_path)

    config = _cfg()
    bot = SimpleNamespace(config=config)
    bot.tool_catalog = _catalog(config)
    bot.builtin_tool_policy = BuiltinToolPolicy(get_config=lambda: bot.config)
    # Minimal attrs the other register_tools_meta routes reference lazily.
    bot.audit = SimpleNamespace()

    routes = web.RouteTableDef()
    register_tools_meta(routes, bot)
    app = web.Application()
    app.add_routes(routes)
    client = TestClient(TestServer(app))
    await client.start_server()
    try:
        yield client, bot, config_path
    finally:
        await client.close()


def _disk_disabled(config_path: Path) -> list:
    data = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    return data["tools"]["disabled_tools"]


class TestToolsManagementRoutes:
    async def test_inventory_covers_all_builtins_with_states(self, tools_api):
        client, bot, _ = tools_api
        response = await client.get("/api/tools/builtins")
        body = await response.json()
        assert response.status == 200
        names = [t["name"] for t in body["tools"]]
        assert set(names) == set(BUILTIN_TOOL_NAMES)
        by_name = {t["name"]: t for t in body["tools"]}
        assert by_name["run_command"]["state"] == "available"
        # claude_code has no host in this config -> unavailable, switch on.
        assert by_name["claude_code"]["state"] == "unavailable"
        assert by_name["claude_code"]["enabled"] is True

    async def test_toggle_round_trip_persists_and_hides(self, tools_api):
        client, bot, config_path = tools_api
        response = await client.post(
            "/api/tools/builtins/kubectl/enabled", json={"enabled": False}
        )
        body = await response.json()
        assert response.status == 200
        row = next(t for t in body["tools"] if t["name"] == "kubectl")
        assert row["enabled"] is False and row["state"] == "disabled"
        # Disk truth + live config rebind + catalog omission.
        assert _disk_disabled(config_path) == ["kubectl"]
        assert bot.config.tools.disabled_tools == ["kubectl"]
        names = [t["name"] for t in bot.tool_catalog.merged_definitions()]
        assert "kubectl" not in names
        # /api/tools (the model view) omits it too.
        visible = await (await client.get("/api/tools")).json()
        assert "kubectl" not in [t["name"] for t in visible]

        # Re-enable restores.
        response = await client.post(
            "/api/tools/builtins/kubectl/enabled", json={"enabled": True}
        )
        assert response.status == 200
        assert _disk_disabled(config_path) == []
        names = [t["name"] for t in bot.tool_catalog.merged_definitions()]
        assert "kubectl" in names

    async def test_catalog_cache_invalidated_synchronously(self, tools_api):
        client, bot, _ = tools_api
        assert "kubectl" in [t["name"] for t in bot.tool_catalog.merged_definitions()]
        await client.post("/api/tools/builtins/kubectl/enabled", json={"enabled": False})
        # No manual invalidation here — the route must have done it.
        assert "kubectl" not in [t["name"] for t in bot.tool_catalog.merged_definitions()]

    async def test_idempotent_repeat_no_persist(self, tools_api):
        client, _bot, config_path = tools_api
        before = config_path.read_text(encoding="utf-8")
        mtime = config_path.stat().st_mtime_ns
        response = await client.post(
            "/api/tools/builtins/kubectl/enabled", json={"enabled": True}
        )
        assert response.status == 200
        assert config_path.read_text(encoding="utf-8") == before
        assert config_path.stat().st_mtime_ns == mtime

    async def test_unknown_tool_404(self, tools_api):
        client, _bot, _ = tools_api
        response = await client.post(
            "/api/tools/builtins/not_a_tool/enabled", json={"enabled": False}
        )
        assert response.status == 404

    async def test_skill_and_mcp_names_rejected(self, tools_api):
        client, _bot, _ = tools_api
        for name in ("mcp_Grafana_query_prometheus", "some_skill"):
            response = await client.post(
                f"/api/tools/builtins/{name}/enabled", json={"enabled": False}
            )
            assert response.status == 404

    async def test_non_boolean_and_extra_fields_rejected(self, tools_api):
        client, _bot, config_path = tools_api
        before = config_path.read_text(encoding="utf-8")
        assert (
            await client.post("/api/tools/builtins/kubectl/enabled", json={"enabled": "no"})
        ).status == 400
        assert (
            await client.post(
                "/api/tools/builtins/kubectl/enabled",
                json={"enabled": False, "transport": "sneaky"},
            )
        ).status == 400
        assert (
            await client.post(
                "/api/tools/builtins/kubectl/enabled",
                data="not json",
                headers={"Content-Type": "application/json"},
            )
        ).status == 400
        assert config_path.read_text(encoding="utf-8") == before

    async def test_global_disabled_state_reported(self, tools_api):
        client, bot, _ = tools_api
        bot.config.tools.enabled = False
        body = await (await client.get("/api/tools/builtins")).json()
        assert body["global_enabled"] is False
        row = next(t for t in body["tools"] if t["name"] == "run_command")
        assert row["state"] == "global_disabled"
        # Operator-disabled stays distinct even while global is off.
        bot.config.tools.disabled_tools = ["kubectl"]
        body = await (await client.get("/api/tools/builtins")).json()
        row = next(t for t in body["tools"] if t["name"] == "kubectl")
        assert row["state"] == "disabled"


class TestRouteFailureArms:
    async def test_backend_hidden_names_defaults_to_live_config(self):
        catalog = _catalog(_cfg())
        assert catalog.backend_hidden_names() == catalog.backend_hidden_names(_cfg())

    async def test_persist_failure_escapes_without_partial_truths(
        self, tools_api, monkeypatch
    ):
        client, bot, config_path = tools_api
        before = config_path.read_text(encoding="utf-8")

        async def boom(changes):
            return RuntimeError("disk full"), False

        monkeypatch.setattr(persistence_mod, "persist_config_paths_locked", boom)
        response = await client.post(
            "/api/tools/builtins/kubectl/enabled", json={"enabled": False}
        )
        assert response.status == 500
        # No truth moved: disk, runtime config, and catalog all unchanged.
        assert config_path.read_text(encoding="utf-8") == before
        assert bot.config.tools.disabled_tools == []
        assert "kubectl" in [t["name"] for t in bot.tool_catalog.merged_definitions()]

    async def test_writer_cancellation_after_commit_converges_all_truths(
        self, tools_api, monkeypatch
    ):
        import aiohttp

        client, bot, config_path = tools_api
        real = persistence_mod.persist_config_paths_locked

        async def cancelled_after_commit(changes):
            exc, _ = await real(changes)
            return exc, True

        monkeypatch.setattr(
            persistence_mod, "persist_config_paths_locked", cancelled_after_commit
        )
        try:
            response = await client.post(
                "/api/tools/builtins/kubectl/enabled", json={"enabled": False}
            )
            assert response.status >= 500
        except (aiohttp.ServerDisconnectedError, aiohttp.ClientOSError):
            pass
        # The committed write converged every truth before cancellation.
        assert _disk_disabled(config_path) == ["kubectl"]
        assert bot.config.tools.disabled_tools == ["kubectl"]
        assert "kubectl" not in [t["name"] for t in bot.tool_catalog.merged_definitions()]


class TestInventorySchemas:
    async def test_inventory_carries_input_schema(self, tools_api):
        """Audit 1.3: the inventory is the single schema source for the
        panel's Parameters detail; /api/tools stays schema-free."""
        client, _bot, _ = tools_api
        body = await (await client.get("/api/tools/builtins")).json()
        row = next(t for t in body["tools"] if t["name"] == "run_command")
        assert isinstance(row["input_schema"], dict)
        assert "properties" in row["input_schema"]
        visible = await (await client.get("/api/tools")).json()
        assert all("input_schema" not in t for t in visible)
