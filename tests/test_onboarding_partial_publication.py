"""Failure-boundary tests for durable onboarding publication.

These use the actual YAML, environment, and initialization stores.  The only
fault injection points are the publication boundaries where a real filesystem
failure can occur.
"""

from __future__ import annotations

import asyncio
import os
from types import SimpleNamespace

import pytest
import yaml

from src.config.environment import EnvironmentSource, EnvironmentWriteResult, edit_environment
from src.config.initialization import InitializationMode, InitializationStore, InstallationBinding
from src.config.schema import Config
from src.web.onboarding import OnboardingCoordinator, OnboardingError


def _make(tmp_path, monkeypatch):
    config_path = tmp_path / "config.yml"
    initial = Config(discord={"token": "old-token"})
    config_path.write_text(yaml.safe_dump(initial.model_dump()), encoding="utf-8")
    environment = tmp_path / "environment"
    environment.write_text("DISCORD_TOKEN=old-token\nKEEP=this\n", encoding="utf-8")
    store = InitializationStore(
        tmp_path / "initialization.json", InstallationBinding("test", config_path)
    )
    store.provision_fresh()
    monkeypatch.delenv("DISCORD_TOKEN", raising=False)
    bot = SimpleNamespace(config=initial, connection_supervisor=None)
    return (
        bot,
        OnboardingCoordinator(store, EnvironmentSource(environment), True),
        store,
        config_path,
        environment,
    )


def _yaml(path):
    return yaml.safe_load(path.read_text(encoding="utf-8"))


@pytest.mark.asyncio
async def test_config_commit_then_environment_precommit_failure_reconciles_pending(
    tmp_path, monkeypatch
):
    bot, coordinator, store, config_path, environment = _make(tmp_path, monkeypatch)

    def fail_before_environment(*_args, **_kwargs):
        assert "DISCORD_TOKEN=old-token" in environment.read_text(encoding="utf-8")
        raise OSError("simulated pre-rename failure")

    monkeypatch.setattr("src.web.onboarding.edit_environment", fail_before_environment)
    with pytest.raises(
        OnboardingError, match=r"config_committed=True; environment_committed=False"
    ):
        await coordinator.submit(
            bot,
            discord_token="new-token",
            web_api_token=None,
            config_updates={"timezone": "America/New_York"},
        )

    assert (await coordinator.state()).mode is InitializationMode.PENDING
    assert _yaml(config_path)["timezone"] == "America/New_York"
    assert "DISCORD_TOKEN=old-token" in environment.read_text(encoding="utf-8")
    assert bot.config.timezone == "America/New_York"
    assert bot.config.discord.token == "old-token"


@pytest.mark.asyncio
async def test_environment_postrename_nondurable_failure_reconciles_actual_disk_and_runtime(
    tmp_path, monkeypatch
):
    bot, coordinator, store, config_path, environment = _make(tmp_path, monkeypatch)
    real_edit = edit_environment

    def commit_then_report_nondurable(source, updates):
        result = real_edit(source, updates)
        return EnvironmentWriteResult(result.terminal_path, False)

    monkeypatch.setattr("src.web.onboarding.edit_environment", commit_then_report_nondurable)
    with pytest.raises(OnboardingError, match=r"config_committed=True; environment_committed=True"):
        await coordinator.submit(
            bot,
            discord_token="new-token",
            web_api_token=None,
            config_updates={"timezone": "America/Chicago"},
        )

    assert (await coordinator.state()).mode is InitializationMode.PENDING
    assert _yaml(config_path)["timezone"] == "America/Chicago"
    assert "DISCORD_TOKEN=new-token" in environment.read_text(encoding="utf-8")
    assert bot.config.timezone == "America/Chicago"
    assert bot.config.discord.token == "new-token"
    assert os.environ["DISCORD_TOKEN"] == "new-token"


@pytest.mark.asyncio
async def test_complete_state_fsync_failure_is_authoritative_and_never_replays(
    tmp_path, monkeypatch
):
    bot, coordinator, store, config_path, environment = _make(tmp_path, monkeypatch)
    original = store._write_locked
    writes = 0

    def write_then_fail(state):
        nonlocal writes
        writes += 1
        original(state)
        if state.mode is InitializationMode.COMPLETE:
            raise OSError("directory fsync failed after rename")

    monkeypatch.setattr(store, "_write_locked", write_then_fail)
    result = await coordinator.submit(
        bot,
        discord_token="new-token",
        web_api_token="web-secret",
        config_updates={"timezone": "America/Denver"},
    )

    assert result.persisted is True
    assert (await coordinator.state()).mode is InitializationMode.COMPLETE
    assert writes == 1
    assert _yaml(config_path)["timezone"] == "America/Denver"
    assert _yaml(config_path)["web"]["api_token"] == "web-secret"
    assert "DISCORD_TOKEN=new-token" in environment.read_text(encoding="utf-8")
    assert bot.config.discord.token == "new-token"
    assert os.environ["DISCORD_TOKEN"] == "new-token"
    with pytest.raises(Exception):
        await coordinator.submit(bot, discord_token="another", web_api_token=None)
    assert writes == 1


@pytest.mark.asyncio
async def test_cancelled_settled_write_publishes_then_propagates_without_attach(
    tmp_path, monkeypatch
):
    bot, coordinator, store, config_path, environment = _make(tmp_path, monkeypatch)

    class Supervisor:
        calls = 0

        async def attach(self, _token):
            self.calls += 1

    supervisor = Supervisor()
    bot.connection_supervisor = supervisor
    from src.web import onboarding

    real_settled = onboarding._run_settled

    async def settled_but_cancelled(write):
        exc, _cancelled = await real_settled(write)
        return exc, True

    monkeypatch.setattr(onboarding, "_run_settled", settled_but_cancelled)
    with pytest.raises(asyncio.CancelledError):
        await coordinator.submit(bot, discord_token="new-token", web_api_token=None)

    assert (await coordinator.state()).mode is InitializationMode.COMPLETE
    assert "DISCORD_TOKEN=new-token" in environment.read_text(encoding="utf-8")
    assert bot.config.discord.token == "new-token"
    assert supervisor.calls == 0


@pytest.mark.asyncio
async def test_simultaneous_setup_completion_publishes_callback_once(tmp_path, monkeypatch):
    bot, coordinator, store, _config_path, environment = _make(tmp_path, monkeypatch)
    calls = 0
    real_edit = edit_environment

    def counted_edit(source, updates):
        nonlocal calls
        calls += 1
        return real_edit(source, updates)

    monkeypatch.setattr("src.web.onboarding.edit_environment", counted_edit)
    results = await asyncio.gather(
        coordinator.submit(bot, discord_token="new-token", web_api_token=None),
        coordinator.submit(bot, discord_token="new-token", web_api_token=None),
        return_exceptions=True,
    )
    assert sum(not isinstance(item, BaseException) for item in results) == 1
    assert calls == 1
    assert (await coordinator.state()).mode is InitializationMode.COMPLETE
    assert "DISCORD_TOKEN=new-token" in environment.read_text(encoding="utf-8")


@pytest.mark.asyncio
async def test_timezone_hosts_and_web_token_leaves_all_persist(tmp_path, monkeypatch):
    bot, coordinator, _store, config_path, _environment = _make(tmp_path, monkeypatch)
    await coordinator.submit(
        bot,
        discord_token=None,
        web_api_token="web-secret",
        config_updates={
            "timezone": "America/Los_Angeles",
            "tools": {"hosts": {"forge": {"address": "192.0.2.11", "ssh_user": "odin"}}},
        },
    )
    saved = _yaml(config_path)
    assert saved["timezone"] == "America/Los_Angeles"
    assert saved["tools"]["hosts"]["forge"]["address"] == "192.0.2.11"
    assert saved["web"]["api_token"] == "web-secret"


@pytest.mark.asyncio
async def test_environment_source_symlink_is_preserved(tmp_path, monkeypatch):
    bot, coordinator, _store, _config_path, target = _make(tmp_path, monkeypatch)
    source = tmp_path / "declared-environment"
    source.symlink_to(target)
    coordinator.environment_source = EnvironmentSource(source)

    await coordinator.submit(bot, discord_token="new-token", web_api_token=None)

    assert source.is_symlink()
    assert source.resolve() == target
    assert "DISCORD_TOKEN=new-token" in target.read_text(encoding="utf-8")
