"""Regressions for campaign findings 3 and 4, using isolated durable stores."""

import subprocess
from pathlib import Path
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest
import yaml
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from dotenv import dotenv_values

from src.config.environment import EnvironmentSource, edit_environment
from src.config.initialization import InitializationStore, InstallationBinding
from src.config.schema import Config, active_config_path, load_config, set_active_config_path
from src.tools import time_parser
from src.tools.hosts import HostRegistry
from src.web.api.config_admin import register_setup_wizard
from src.web.onboarding import OnboardingCoordinator, OnboardingError


@pytest.fixture
def install(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("DISCORD_TOKEN", "old-token")
    monkeypatch.setenv("CUSTOM_DISCORD_TOKEN", "custom-old-token")
    monkeypatch.setattr(time_parser, "_default_tz", ZoneInfo("UTC"))
    previous = active_config_path()
    config_path = tmp_path / "config.yml"
    initial = Config(discord={"token": "old-token"}, timezone="UTC", browser={"enabled": False})
    config_path.write_text(yaml.safe_dump(initial.model_dump()), encoding="utf-8")
    environment = tmp_path / "environment"
    environment.write_text("DISCORD_TOKEN=old-token\nKEEP=untouched\n", encoding="utf-8")
    store = InitializationStore(
        tmp_path / "initialization.json", InstallationBinding("regression", config_path)
    )
    store.provision_fresh()
    bot = SimpleNamespace(
        config=initial,
        onboarding=OnboardingCoordinator(store, EnvironmentSource(environment), True),
        connection_supervisor=None,
        host_registry=HostRegistry(initial.tools.hosts, key_path=initial.tools.ssh_key_path),
        browser_manager=None,
    )
    try:
        yield bot, config_path, environment
    finally:
        set_active_config_path(previous)


@pytest.mark.asyncio
@pytest.mark.parametrize("binding", ["", "literal-old-token", "${DISCORD_TOKEN}",
                                    "${CUSTOM_DISCORD_TOKEN}"],
                         ids=["blank", "literal", "reference", "custom-reference"])
async def test_submitted_discord_credential_survives_fresh_environment_reload(
    install, monkeypatch, binding
):
    bot, config_path, environment = install
    document = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    document["discord"]["token"] = binding
    config_path.write_text(yaml.safe_dump(document), encoding="utf-8")
    bot.config = load_config(config_path)
    result = await bot.onboarding.submit(
        bot, discord_token="new-token", web_api_token=None,
    )
    assert result.persisted and result.initialization_complete
    assert bot.config.discord.token == "new-token"
    # Discard the coordinator's process-environment publication. Only the
    # declared durable environment may supply the token to the fresh load.
    monkeypatch.delenv("DISCORD_TOKEN")
    for key, value in dotenv_values(environment).items():
        assert value is not None
        monkeypatch.setenv(key, value)
    assert load_config(config_path).discord.token == "new-token"
    saved = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert saved["discord"]["token"] == "${DISCORD_TOKEN}"
    assert "new-token" not in config_path.read_text(encoding="utf-8")
    assert dotenv_values(environment)["KEEP"] == "untouched"


@pytest.mark.asyncio
@pytest.mark.parametrize("payload, fields", [
    ({"timezone": "America/New_York"}, ["timezone"]),
    ({"hosts": {"forge": {"address": "192.0.2.11", "ssh_user": "odin"}}}, ["tools.hosts"]),
    ({"features": {"browser": True}}, ["browser.enabled"]),
    ({"timezone": "America/New_York", "hosts": {"forge": {"address": "192.0.2.11"}},
      "features": {"browser": True}},
     ["timezone", "tools.hosts", "browser.enabled"]),
])
async def test_setup_reports_restart_for_boot_time_consumers(install, payload, fields):
    bot, config_path, _environment = install
    original_hosts = bot.host_registry.active_aliases()
    routes = web.RouteTableDef()
    register_setup_wizard(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    async with TestClient(TestServer(app)) as client:
        response = await client.post("/api/setup/complete", json=payload)
        body = await response.json()
    assert response.status == 200
    assert body["persisted"] is True and body["mode"] == "complete"
    # Setup does not rebuild these boot-owned components. Its response must
    # distinguish durable desired settings from already-applied runtime state.
    assert bot.host_registry.active_aliases() == original_hosts
    assert bot.browser_manager is None
    assert time_parser._default_tz.key == "UTC"
    assert body["restart_required"] == fields
    assert "restart" in body["message"].lower()
    for field in fields:
        assert field in body["message"]
    reloaded = load_config(config_path)
    assert reloaded.timezone == bot.config.timezone
    assert reloaded.tools.hosts == bot.config.tools.hosts
    assert reloaded.browser.enabled == bot.config.browser.enabled


@pytest.mark.asyncio
@pytest.mark.parametrize("updates", [None, {"timezone": "UTC"}, {"browser": {"enabled": False}},
                                     {"comfyui": {"enabled": True}}])
async def test_credentials_unchanged_and_dynamic_settings_do_not_require_restart(install, updates):
    bot, _config_path, _environment = install
    result = await bot.onboarding.submit(
        bot, discord_token="new-token", web_api_token=None, config_updates=updates,
    )
    assert result.restart_required == ()


@pytest.mark.asyncio
async def test_comfyui_setup_change_is_read_by_existing_backend(install, monkeypatch):
    from src.tools.image import comfyui_backend as mod
    from src.tools.image.base import ImageBackendUnavailableError

    bot, _config_path, _environment = install
    bot.config.comfyui.enabled = False
    backend = mod.ComfyUIImageBackend(get_config=lambda: bot.config)
    with pytest.raises(ImageBackendUnavailableError):
        await backend.generate(prompt="test")

    result = await bot.onboarding.submit(
        bot, discord_token=None, web_api_token=None,
        config_updates={"comfyui": {"enabled": True, "url": "http://comfy.test"}},
    )
    assert result.restart_required == ()

    class ClientReachedError(Exception):
        pass

    def client(url, default_checkpoint):
        assert url == "http://comfy.test"
        raise ClientReachedError

    monkeypatch.setattr(mod, "ComfyUIClient", client)
    # Same pre-setup backend, newly configured client. Only network IO is stubbed.
    with pytest.raises(ClientReachedError):
        await backend.generate(prompt="test")


@pytest.mark.asyncio
async def test_partial_publication_retry_preserves_binding_and_restart_notice(install, monkeypatch):
    bot, config_path, environment = install

    def fail_environment(*_args, **_kwargs):
        raise OSError("synthetic environment precommit failure")

    monkeypatch.setattr("src.web.onboarding.edit_environment", fail_environment)
    with pytest.raises(OnboardingError, match="environment_committed=False"):
        await bot.onboarding.submit(
            bot, discord_token="new-token", web_api_token=None,
            config_updates={"timezone": "America/New_York"},
        )
    assert (await bot.onboarding.state()).setup_allowed
    assert bot.config.discord.token == "old-token"
    assert yaml.safe_load(config_path.read_text())["discord"]["token"] == "${DISCORD_TOKEN}"
    assert dotenv_values(environment)["DISCORD_TOKEN"] == "old-token"
    monkeypatch.setattr("src.web.onboarding.edit_environment", edit_environment)
    result = await bot.onboarding.submit(bot, discord_token="new-token", web_api_token=None)
    assert result.restart_required == ("timezone",)
    assert result.initialization_complete
    assert load_config(config_path).discord.token == "new-token"


@pytest.mark.asyncio
async def test_setup_without_discord_submission_preserves_unrelated_references(
    install, monkeypatch,
):
    bot, config_path, environment = install
    monkeypatch.setenv("CUSTOM_ZONE", "UTC")
    config_path.write_text(
        "# operator bindings\ndiscord:\n  token: '${CUSTOM_DISCORD_TOKEN}'\n"
        "timezone: '${CUSTOM_ZONE}'\nlogging:\n  level: DEBUG\n", encoding="utf-8",
    )
    bot.config = load_config(config_path)
    before = config_path.read_text(encoding="utf-8")
    before_environment = environment.read_text(encoding="utf-8")
    result = await bot.onboarding.submit(bot, discord_token=None, web_api_token=None)
    assert result.initialization_complete and result.restart_required == ()
    assert config_path.read_text(encoding="utf-8") == before
    assert environment.read_text(encoding="utf-8") == before_environment


@pytest.mark.parametrize("discord_state", ["failed", "connecting", "ready", ""])
def test_setup_ui_displays_required_restart_with_every_gateway_outcome(discord_state):
    """Exercise the real component's save(), replacing only Vue refs and API IO."""
    root = Path(__file__).resolve().parents[1]
    program = r"""
        import assert from 'node:assert/strict';
        import fs from 'node:fs';
        import vm from 'node:vm';
        const state = process.argv[1];
        const source = fs.readFileSync('ui/js/pages/setup.js', 'utf8');
        const component = new vm.SourceTextModule(source);
        const vue = new vm.SyntheticModule(['ref', 'onUnmounted'], function () {
            this.setExport('ref', value => ({ value }));
            this.setExport('onUnmounted', () => {});
        });
        const api = new vm.SyntheticModule(['api'], function () {
            this.setExport('api', { post: async () => ({
                persisted: true, discord: { state },
                restart_required: ['timezone', 'tools.hosts', 'browser.enabled'],
                message: 'Setup saved. Restart Odin to apply: '
                    + 'timezone, tools.hosts, browser.enabled',
            }) });
        });
        await component.link(name => name === 'vue' ? vue : api);
        await component.evaluate();
        const page = component.namespace.default.setup({});
        page.discordToken.value = 'synthetic-token';
        await page.save();
        assert.equal(page.completed.value, true);
        assert.match(page.statusMessage.value, /Restart Odin to apply/);
        for (const field of ['timezone', 'tools.hosts', 'browser.enabled']) {
            assert.ok(page.statusMessage.value.includes(field));
        }
        assert.doesNotMatch(page.statusMessage.value, /restart scheduled|restarting/i);
    """
    result = subprocess.run(
        ["node", "--experimental-vm-modules", "--input-type=module", "-e", program, discord_state],
        cwd=root, capture_output=True, text=True, timeout=20,
    )
    assert result.returncode == 0, result.stderr
