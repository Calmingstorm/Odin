"""Configuration campaign regressions through actual schema, writer and routes."""
import asyncio
import json
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
import yaml
from aiohttp import web

from src.config import migrations, persistence
from src.config.apply_registry import build_field_record
from src.config.schema import Config, load_config
from src.config.webhook_text import WebhookTextPatch


@pytest.fixture(autouse=True)
def isolated_config_path(monkeypatch):
    from src.config import schema
    monkeypatch.setattr(schema, "_ACTIVE_CONFIG_PATH", None)
    monkeypatch.setattr(schema, "_LAUNCH_CONFIG_PATH", None)


def config(**values):
    return Config(discord={"token": "fixture"}, **values)


@pytest.mark.parametrize("provider", [None, {}])
def test_588_implicit_codex_preserves_explicit_model(provider):
    values = {"openai_codex": {"model": "gpt-6.1-sol"}}
    if provider is not None:
        values["llm_provider"] = provider
    cfg = config(**values)
    from src.tools.agent_tool_policy import configured_agent_model
    assert cfg.llm_provider.model == "gpt-6.1-sol"
    cfg.agents.model = None
    assert configured_agent_model(cfg) == "gpt-6.1-sol"
    from src.discord.llm_gateway import LLMGateway
    gateway = SimpleNamespace(
        get_config=lambda: cfg, codex_client=SimpleNamespace(model="transport-default"),
        compatible_client=None, ollama_client=None,
    )
    assert LLMGateway.capture_serving_identity(gateway).model == "gpt-6.1-sol"


@pytest.mark.parametrize("agents", [
    {"model": "gpt-5.5"},
    {"auto_model_allowlist": ["gpt-5.5", "gpt-6-sol"]},
    {"auto_model_allowlist": [{"model": "gpt-5.5", "reasoning_effort": "high"}]},
    {"model_selection_hints": {"gpt-5.5": "historical", "gpt-6-sol": "current"}},
])
def test_459_canonical_retirement_loads_without_rewriting(tmp_path, agents):
    path = tmp_path / "config.yml"
    raw = yaml.safe_dump({"discord": {"token": "fixture"}, "agents": agents})
    path.write_text(raw)
    cfg = load_config(path)
    assert "gpt-5.5" not in json.dumps(cfg.agents.model_dump())
    assert path.read_text() == raw
    if "model_selection_hints" in agents:
        assert cfg.agents.model_selection_hints["gpt-6-sol"] == "current"
    if isinstance(agents.get("auto_model_allowlist", [None])[0], dict):
        assert cfg.agents.auto_model_allowlist[0].reasoning_effort == "high"


@pytest.mark.parametrize("values", [
    {"llm_provider": {"model": "gpt-6.1-sol"},
     "openai_codex": {"model": "gpt-6-luna", "reasoning_effort": "none"}},
    {"agents": {"model": "gpt-6.1-sol"},
     "openai_codex": {"agent_model": "auto", "agent_reasoning_effort": "none"}},
])
def test_460_canonical_pairs_reject_save_warn_startup(tmp_path, caplog, values):
    with pytest.raises(ValueError, match="not supported"):
        config(**values)
    path = tmp_path / "config.yml"
    path.write_text(yaml.safe_dump({"discord": {"token": "fixture"}, **values}))
    cfg = load_config(path)
    assert cfg.openai_codex.agent_reasoning_effort == values["openai_codex"].get(
        "agent_reasoning_effort", "auto"
    )
    assert "Effective model/effort pair" in caplog.text


def test_460_legacy_pairs_cannot_override_canonical_or_auto():
    cfg = config(llm_provider={"model": "gpt-6-luna"}, agents={"model": "auto"},
                 openai_codex={"model": "gpt-6.1-sol", "reasoning_effort": "none"})
    assert cfg.agents.model == "auto"


@pytest.mark.parametrize("timeout", [0, -1])
def test_593_nonpositive_override_reject_save_default_on_load(tmp_path, caplog, timeout):
    with pytest.raises(ValueError, match="positive integers"):
        config(tools={"tool_timeouts": {"fetch_url": timeout}})
    path = tmp_path / "config.yml"
    path.write_text(yaml.safe_dump({
        "discord": {"token": "fixture"},
        "tools": {"tool_timeouts": {"fetch_url": timeout, "run_command": 15}},
    }))
    cfg = load_config(path)
    assert cfg.tools.tool_timeouts == {"run_command": 15}
    assert cfg.tools.get_tool_timeout("fetch_url") > 0
    assert "using tool defaults" in caplog.text


@pytest.mark.parametrize("field", ["archive_max_files", "archive_max_bytes"])
def test_594_negative_archive_cap_is_unset_on_load(tmp_path, caplog, field):
    with pytest.raises(ValueError, match="nonnegative"):
        config(sessions={field: -1})
    assert getattr(config(sessions={field: 0}).sessions, field) == 0
    path = tmp_path / "config.yml"
    path.write_text(yaml.safe_dump({"discord": {"token": "fixture"}, "sessions": {field: -1}}))
    assert getattr(load_config(path).sessions, field) is None
    assert "treating as unset" in caplog.text


@pytest.mark.parametrize("enabled", [True, False])
@pytest.mark.parametrize("timeout,expected", [(5, 10), (4000, 3600), ("4000", 3600)])
def test_595_legacy_kimi_timeouts_load(tmp_path, enabled, timeout, expected):
    path = tmp_path / "config.yml"
    path.write_text(yaml.safe_dump({
        "discord": {"token": "fixture"}, "kimi": {"enabled": enabled, "timeout": timeout}
    }))
    cfg = load_config(path)
    assert cfg.openai_compatible.stream_stall_timeout_seconds == expected
    with pytest.raises(ValueError):
        config(openai_compatible={"stream_stall_timeout_seconds": timeout})


def test_458_ceiling_migration_fences_later_operator_save(tmp_path, monkeypatch):
    path = tmp_path / "config.yml"
    raw = (
        "discord: {token: fixture}\nopenai_codex:\n  context_compression:\n"
        f"    max_context_chars: {migrations.LEGACY_MAX_CONTEXT_CHARS}\n"
    )
    assert migrations._is_shipped_legacy_literal(raw)
    path.write_text(raw)
    old_lock = persistence._config_file_lock

    @contextmanager
    def interleave(target):
        # The newer edit is durably acknowledged before the migration locks.
        persistence.patch_config_paths(
            [(("openai_codex", "context_compression", "max_context_chars"), 123456)], path=target
        )
        with old_lock(target):
            yield

    with monkeypatch.context() as patch:
        # Avoid recursively interleaving our own fixture save.
        @contextmanager
        def lock(target):
            with patch.context() as inner:
                inner.setattr(persistence, "_config_file_lock", old_lock)
                with interleave(target):
                    yield
        patch.setattr(persistence, "_config_file_lock", lock)
        data = yaml.safe_load(raw)
        migrations.apply_legacy_ceiling_migration(data, path, raw)
    assert yaml.safe_load(path.read_text())["openai_codex"]["context_compression"] == {
        "max_context_chars": 123456
    }
    assert data["openai_codex"]["context_compression"]["max_context_chars"] == 123456


def test_457_noop_marker_storage_failure_is_not_startup_failure(tmp_path, monkeypatch):
    path = tmp_path / "config.yml"
    path.write_text("discord: {token: fixture}\n")
    def readonly(*_args, **_kwargs):
        raise PermissionError(13, "read only fixture")
    monkeypatch.setattr(migrations, "_atomic_write_marker", readonly)
    assert load_config(path).discord.token == "fixture"
    assert path.read_text() == "discord: {token: fixture}\n"


@pytest.mark.parametrize("image", [False, True])
def test_457_unprivileged_readonly_config_with_writable_data(tmp_path, monkeypatch, image):
    import os

    from src.config.image_defaults import IMAGE_MODEL_DEFAULTS, LEGACY_IMAGE_MODEL_DEFAULTS
    if os.geteuid() == 0:
        pytest.skip("Read-only permission evidence requires an unprivileged test runner")
    monkeypatch.chdir(tmp_path)
    storage = tmp_path / "config-mount"
    storage.mkdir()
    writable = tmp_path / "application-data"
    writable.mkdir()
    path = storage / "config.yml"
    values = {"discord": {"token": "fixture"}, "sessions": {"persist_directory": str(writable)}}
    if image:
        values["image"] = {"openai": dict(LEGACY_IMAGE_MODEL_DEFAULTS)}
    raw = yaml.safe_dump(values)
    path.write_text(raw)
    storage.chmod(0o555)
    try:
        cfg = load_config(path)
        assert cfg.sessions.persist_directory == str(writable)
        assert path.read_text() == raw
        if image:
            for leaf, value in IMAGE_MODEL_DEFAULTS.items():
                assert getattr(cfg.image.openai, leaf) == value
    finally:
        storage.chmod(0o755)


@pytest.mark.parametrize("raw", [
    "outbound_webhooks: {targets: [{id: a, url: 'https://a.test'},],}\n",
    "outbound_webhooks: {targets: [{id: a, url: 'https://a.test',}],}\n",
    "outbound_webhooks: {enabled: true,}\n",
])
def test_591_flow_trailing_delimiters_append_and_update(raw):
    patch = WebhookTextPatch(raw)
    patch.append({"id": "b", "url": "https://b.test"})
    assert yaml.safe_load(patch.text)["outbound_webhooks"]["targets"][-1]["id"] == "b"
    patch.update(0, {"secret": "fixture"})
    assert yaml.safe_load(patch.text)["outbound_webhooks"]["targets"][0]["secret"] == "fixture"


def test_591_real_webhook_persistence_accepts_flow_trailing_commas(tmp_path):
    path = tmp_path / "config.yml"
    raw = "outbound_webhooks: {targets: [{id: a, url: 'https://a.test',},],}\n"
    path.write_text(raw)
    persistence.patch_webhook_targets(
        [{"id": "b", "url": "https://b.test"}],
        changed_fields={"b": {"id", "url"}}, create_ids=["b"], path=path,
    )
    persistence.patch_webhook_targets(
        [{"id": "a", "secret": "fixture"}], changed_fields={"a": {"secret"}}, path=path,
    )
    targets = yaml.safe_load(path.read_text())["outbound_webhooks"]["targets"]
    assert targets == [
        {"id": "a", "url": "https://a.test", "secret": "fixture"},
        {"id": "b", "url": "https://b.test"},
    ]


def test_592_partial_mapping_writer_keeps_current_siblings_and_env(tmp_path, monkeypatch):
    monkeypatch.setenv("FIXTURE_TIMEOUT", "900")
    path = tmp_path / "config.yml"
    raw = (
        "discord: {token: fixture}\ntools:\n  tool_timeouts:\n"
        "    run_command: ${FIXTURE_TIMEOUT} # keep\n    external_edit: 77\n    remove_me: 20\n"
    )
    path.write_text(raw)
    cfg = config(tools={"tool_timeouts": {"run_command": 900, "remove_me": 20, "fetch_url": 40}})
    updates = {"tools": {"tool_timeouts": {"fetch_url": 40, "remove_me": {"$delete": True}}}}
    changes = persistence.submitted_leaves(updates, cfg.model_dump(), Config)
    persistence.patch_config_paths(changes, path=path)
    assert "${FIXTURE_TIMEOUT} # keep" in path.read_text()
    parsed = yaml.safe_load(path.read_text())["tools"]["tool_timeouts"]
    assert parsed["external_edit"] == 77
    assert parsed["fetch_url"] == 40
    assert "remove_me" not in parsed


def test_592_partial_structured_mapping_entry_keeps_required_siblings(tmp_path):
    path = tmp_path / "config.yml"
    path.write_text(
        "openai_compatible:\n  model_profiles:\n    vendor/model:\n"
        "      total_window_tokens: 200000 # keep\n      max_output_tokens: 2000\n"
    )
    cfg = config(openai_compatible={"model_profiles": {
        "vendor/model": {"total_window_tokens": 200000, "max_output_tokens": 4000}
    }})
    updates = {"openai_compatible": {"model_profiles": {
        "vendor/model": {"max_output_tokens": 4000}
    }}}
    changes = persistence.submitted_leaves(updates, cfg.model_dump(), Config)
    assert changes == [
        (("openai_compatible", "model_profiles", "vendor/model", "max_output_tokens"), 4000)
    ]
    persistence.patch_config_paths(changes, path=path)
    assert "total_window_tokens: 200000 # keep" in path.read_text()


@pytest.mark.parametrize("path,value", [
    ("llm_provider.model", "gpt-6-sol"),
    ("openai_compatible.reasoning_effort", "high"),
    ("web.api_token", "fixture"),
    ("web.api_tokens", []),
])
def test_589_live_read_metadata_does_not_claim_boot_value(path, value):
    record = build_field_record(path, value, boot_value="old", has_boot=True)
    assert record["apply_mode"] == "live_read"
    assert not record["pending_restart"]
    assert "immediately" in record["save_effect"]


def test_589_legacy_selectors_metadata_names_canonical_precedence():
    agent = build_field_record("openai_codex.agent_model", "gpt-6-sol")
    assert agent["apply_mode"] == "dormant"
    assert "agents.model" in agent["description"]
    model = build_field_record("openai_codex.model", "gpt-6-sol")
    assert "llm_provider.model overrides" in model["description"]


@pytest.mark.asyncio
async def test_501_agent_partial_update_merges_after_lock(monkeypatch):
    from src.web.api.agents_loops import register_agents
    bot = SimpleNamespace(config=config(), tool_catalog=MagicMock())
    monkeypatch.setattr(
        "src.web.api.agents_loops.persist_config_paths_locked",
        AsyncMock(return_value=(None, False)),
    )
    routes = web.RouteTableDef()
    register_agents(routes, bot)
    handler = next(row.handler for row in routes if row.method == "PUT")
    request = SimpleNamespace(json=AsyncMock(return_value={"model": "gpt-6-sol"}))
    async with persistence.config_transaction():
        task = asyncio.create_task(handler(request))
        await asyncio.sleep(0)
        bot.config.agents.thinking_mode = "enabled"
    response = await task
    assert response.status == 200
    assert bot.config.agents.thinking_mode == "enabled"


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint", ["codex", "ollama", "compatible", "auxiliary"])
async def test_502_string_false_is_not_enabled(endpoint, monkeypatch):
    from src.web.api.llm_admin import register_provider_config
    gateway = MagicMock()
    gateway.provider_lock = asyncio.Lock()
    gateway.codex_client = None
    gateway.ollama_client = None
    gateway.compatible_client = None
    gateway.auxiliary_llm_client = None
    gateway.reload_codex_inner = AsyncMock()
    gateway.reload_ollama_inner = AsyncMock()
    gateway.reload_openai_compatible_inner = AsyncMock(return_value={"committed": True})
    gateway.reload_auxiliary = AsyncMock(return_value={"committed": True})
    bot = SimpleNamespace(config=config(), llm_gateway=gateway, tool_catalog=MagicMock())
    monkeypatch.setattr(
        "src.web.api.llm_admin._persist_or_response", AsyncMock(return_value=(None, False))
    )
    routes = web.RouteTableDef()
    register_provider_config(routes, bot)
    url = (
        "/api/openai-compatible/config" if endpoint == "compatible"
        else f"/api/llm/{endpoint}/config"
    )
    handler = next(row.handler for row in routes if row.method == "PUT" and row.path == url)
    response = await handler(SimpleNamespace(json=AsyncMock(return_value={"enabled": "false"})))
    assert response.status == 200, response.text
    if endpoint == "auxiliary":
        assert gateway.prepare_auxiliary_reload.call_args.args[0]["enabled"] is False
    else:
        leaf = {
            "codex": "openai_codex", "ollama": "ollama", "compatible": "openai_compatible"
        }[endpoint]
        assert getattr(bot.config, leaf).enabled is False


@pytest.mark.asyncio
async def test_501_host_partial_settings_merge_after_lock(tmp_path, monkeypatch):
    from aiohttp.test_utils import TestClient, TestServer

    from tests.test_hosts_api import _app, _bot, _host
    bot = _bot(tmp_path, hosts={
        "alpha": _host(), "beta": _host(host_id="f461e880-cd75-4bba-8ea1-de8326d0caef")
    })
    monkeypatch.setattr(
        persistence, "persist_config_paths_locked", AsyncMock(return_value=(None, False))
    )
    async with TestClient(TestServer(_app(bot))) as client:
        async with persistence.config_transaction():
            task = asyncio.create_task(
                client.post("/api/hosts/settings", json={"allow_host_tofu": True})
            )
            await asyncio.sleep(0.02)
            bot.config.tools.default_host = "beta"
        response = await task
        assert response.status == 200, await response.text()
    assert bot.config.tools.default_host == "beta"
    assert bot.host_registry.default_host == "beta"
    assert bot.config.tools.allow_host_tofu is True


@pytest.mark.asyncio
async def test_501_openrouter_remote_await_rebuilds_current_policy(monkeypatch):
    from src.web.api.llm_admin import register_openai_compatible_admin
    cfg = config(openai_compatible={"preset": "openrouter", "base_url": "https://openrouter.ai/api/v1"})
    client = SimpleNamespace(openrouter_routing=None)
    bot = SimpleNamespace(
        config=cfg, llm_gateway=SimpleNamespace(compatible_client=client), tool_catalog=MagicMock()
    )
    entered, release = asyncio.Event(), asyncio.Event()
    rows = [{"tag": "provider", "context_length": 200000, "max_completion_tokens": 8000,
             "supports_tools": True, "supports_reasoning": True, "quantization": "unknown"}]
    async def endpoints(*args, **kwargs):
        entered.set()
        await release.wait()
        return rows
    monkeypatch.setattr("src.web.api.llm_admin._openrouter_endpoint_rows", endpoints)
    monkeypatch.setattr(
        "src.web.api.llm_admin._openrouter_models",
        AsyncMock(return_value=([{"id": "vendor/model", "supports_reasoning": True}], False, None)),
    )
    persist = AsyncMock(return_value=(None, False))
    monkeypatch.setattr("src.web.api.llm_admin.persist_config_paths_locked", persist)
    routes = web.RouteTableDef()
    register_openai_compatible_admin(routes, bot)
    handler = next(
        row.handler for row in routes if row.method == "POST" and row.path.endswith("/select")
    )
    request = SimpleNamespace(
        json=AsyncMock(return_value={"provider_tag": "provider"}),
        match_info={"author": "vendor", "slug": "model"},
    )
    task = asyncio.create_task(handler(request))
    await entered.wait()
    replacement = config(openai_compatible={
        "preset": "openrouter", "base_url": "https://openrouter.ai/api/v1",
        "openrouter": {"model_pins": {"other/model": "operator"}},
    })
    bot.config = replacement
    release.set()
    response = await task
    assert response.status == 200, response.text
    assert replacement.openai_compatible.openrouter.model_pins == {
        "other/model": "operator", "vendor/model": "provider"
    }
    assert client.openrouter_routing is replacement.openai_compatible.openrouter
    assert cfg.openai_compatible.openrouter.model_pins == {}


def test_594_unset_caps_do_not_prune_real_archives(monkeypatch):
    from src.sessions.manager import SessionManager
    files = [MagicMock(stem=f"channel_{i}") for i in range(3)]
    for i, item in enumerate(files):
        item.stat.return_value = SimpleNamespace(st_mtime=i, st_size=100)
    directory = MagicMock()
    directory.glob.return_value = files
    manager = SessionManager.__new__(SessionManager)
    manager.archive_max_bytes = None
    manager.archive_max_files = None
    manager._prune_old_archives(directory)
    for item in files:
        item.unlink.assert_not_called()
    # Explicit zero retains its old policy, with unlink replaced by inert fakes.
    manager.archive_max_files = 0
    manager._prune_old_archives(directory)
    for item in files:
        item.unlink.assert_called_once()


@pytest.mark.asyncio
async def test_589_save_reaches_canonical_and_reasoning_consumer(monkeypatch):
    from src.discord.llm_gateway import LLMGateway
    from src.web.api.config_admin import register_discord_config
    from tests.test_web_api_config_admin import _bot
    bot = _bot()
    bot.health_server = None
    gateway = SimpleNamespace(
        get_config=lambda: bot.config,
        codex_client=SimpleNamespace(model="old", reasoning_effort="high"),
        compatible_client=SimpleNamespace(model="old"), ollama_client=None,
    )
    routes = web.RouteTableDef()
    register_discord_config(routes, bot)
    handler = next(
        row.handler for row in routes if row.method == "PUT" and row.path == "/api/config"
    )
    monkeypatch.setattr(
        "src.web.api.config_admin.persist_config_paths_locked",
        AsyncMock(return_value=(None, False)),
    )
    body = {
        "llm_provider": {"model": "compat:deepseek-v4-flash"},
        "openai_compatible": {"reasoning_effort": "high"},
    }
    request = MagicMock()
    request.json = AsyncMock(return_value=body)
    response = await handler(request)
    assert response.status == 200, response.text
    identity = LLMGateway.capture_serving_identity(gateway)
    assert identity.model == "deepseek-v4-flash"
    assert identity.reasoning_effort == "enabled"
    record = build_field_record("llm_provider.model", bot.config.llm_provider.model)
    assert record["effective"] == "compat:deepseek-v4-flash"


@pytest.mark.asyncio
async def test_589_web_credentials_live_metadata_matches_real_auth_consumer():
    from aiohttp.test_utils import TestClient, TestServer

    from src.health.server import SessionManager, _make_auth_middleware
    owner = SimpleNamespace(config=config(web={"api_token": "old-fixture"}))
    app = web.Application(middlewares=[
        _make_auth_middleware(lambda: owner.config.web, SessionManager())
    ])
    async def handler(request):
        return web.json_response({"user": request._api_identity.user_id})
    app.router.add_get("/api/fixture", handler)
    async with TestClient(TestServer(app)) as client:
        response = await client.get("/api/fixture", headers={"Authorization": "Bearer old-fixture"})
        assert response.status == 200
        owner.config = config(web={"api_tokens": [{"token": "new-fixture", "user_id": "operator"}]})
        response = await client.get("/api/fixture", headers={"Authorization": "Bearer old-fixture"})
        assert response.status == 401
        response = await client.get("/api/fixture", headers={"Authorization": "Bearer new-fixture"})
        assert response.status == 200
        assert (await response.json())["user"] == "operator"
    record = build_field_record("web.api_tokens", owner.config.web.api_tokens)
    assert record["apply_mode"] == "live_read"


@pytest.mark.asyncio
@pytest.mark.parametrize("route", ["/api/llm/main-model", "/api/llm/switch"])
async def test_460_canonical_selector_api_rejects_bad_pair_before_switch(route):
    from src.web.api.llm_admin import register_llm_provider
    gateway = SimpleNamespace(switch_provider=AsyncMock())
    bot = SimpleNamespace(
        config=config(llm_provider={"model": "gpt-6-luna"},
                      openai_codex={"reasoning_effort": "none"}), llm_gateway=gateway,
    )
    routes = web.RouteTableDef()
    register_llm_provider(routes, bot)
    handler = next(row.handler for row in routes if row.path == route)
    response = await handler(SimpleNamespace(json=AsyncMock(return_value={
        "model": "gpt-6.1-sol", "provider": "codex"
    })))
    assert response.status == 400
    gateway.switch_provider.assert_not_awaited()


@pytest.mark.asyncio
async def test_592_generic_mapping_tombstone_reaches_disk_and_runtime(tmp_path, monkeypatch):
    from src.config.schema import set_active_config_path
    from src.web.api.config_admin import register_discord_config
    from tests.test_web_api_config_admin import _bot
    monkeypatch.setenv("FIXTURE_TIMEOUT", "900")
    path = tmp_path / "config.yml"
    path.write_text(
        "discord: {token: fixture}\ntools:\n  tool_timeouts:\n"
        "    run_command: ${FIXTURE_TIMEOUT}\n    remove_me: 10\n    external_edit: 77\n"
    )
    set_active_config_path(path)
    bot = _bot()
    bot.health_server = None
    bot.config = config(tools={"tool_timeouts": {"run_command": 900, "remove_me": 10}})
    routes = web.RouteTableDef()
    register_discord_config(routes, bot)
    handler = next(
        row.handler for row in routes if row.method == "PUT" and row.path == "/api/config"
    )
    request = MagicMock()
    request.json = AsyncMock(return_value={
        "tools": {"tool_timeouts": {"fetch_url": 40, "remove_me": {"$delete": True}}}
    })
    response = await handler(request)
    assert response.status == 200, response.text
    assert bot.config.tools.tool_timeouts == {"run_command": 900, "fetch_url": 40}
    assert "${FIXTURE_TIMEOUT}" in path.read_text()
    assert yaml.safe_load(path.read_text())["tools"]["tool_timeouts"]["external_edit"] == 77
    assert "remove_me" not in path.read_text()


@pytest.mark.asyncio
@pytest.mark.parametrize("body", [
    {"tools": {"tool_timeouts": {"fetch_url": 0}}},
    {"sessions": {"archive_max_files": -1}},
    {"llm_provider": {"model": "gpt-6.1-sol"}, "openai_codex": {"reasoning_effort": "none"}},
])
async def test_460_593_594_generic_save_rejects_before_write(monkeypatch, body):
    from src.web.api.config_admin import register_discord_config
    from tests.test_web_api_config_admin import _bot
    bot = _bot()
    bot.health_server = None
    write = AsyncMock()
    monkeypatch.setattr("src.web.api.config_admin.persist_config_paths_locked", write)
    routes = web.RouteTableDef()
    register_discord_config(routes, bot)
    handler = next(
        row.handler for row in routes if row.method == "PUT" and row.path == "/api/config"
    )
    request = MagicMock()
    request.json = AsyncMock(return_value=body)
    response = await handler(request)
    assert response.status == 400, response.text
    write.assert_not_awaited()
