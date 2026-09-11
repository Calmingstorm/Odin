"""Actual setup persistence and updater Git/config transitions, never live paths.

Only local Git in a pytest-owned tiny repository executes. Fetch, workspace
provisioning, restart intent and delayed signals are replaced; no HTTP listener,
pip, external network, service restart or process exec is involved.
"""
from __future__ import annotations

import asyncio
import json
import subprocess
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
import yaml
from aiohttp import web

from src.config import schema
from src.config.environment import EnvironmentSource
from src.config.initialization import InitializationStore, InstallationBinding
from src.config.startup_context import provision_initialization_parent
from src.web.api import config_admin, self_update
from src.web.onboarding import OnboardingCoordinator

NEW_IMAGE = "gpt-image-2.5-flare"
NEW_OUTER = "gpt-6-astra"
PREFIX = b"# operator comment stays\ndiscord: {token: fixture}\ntimezone: UTC\n"


def handler(registrar, path, bot=None):
    routes = web.RouteTableDef()
    registrar(routes, bot or SimpleNamespace())
    return next(route.handler for route in routes if route.path == path)


@pytest.fixture(autouse=True)
def isolate_runtime(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(schema, "_ACTIVE_CONFIG_PATH", None)
    monkeypatch.setattr(schema, "_LAUNCH_CONFIG_PATH", None)
    monkeypatch.setenv("DISCORD_TOKEN", "fixture.token.only")
    # Setup's existing webhook placeholder otherwise resolves to YAML null;
    # this image-default gate supplies a synthetic value, never a real secret.
    monkeypatch.setenv("WEBHOOK_SECRET", "fixture-webhook-only")
    restart = Mock()
    delayed = Mock()
    for module in (self_update, config_admin):
        monkeypatch.setattr(module, "restart", SimpleNamespace(request_restart=restart))
        monkeypatch.setattr(module, "asyncio", SimpleNamespace(
            get_running_loop=lambda: SimpleNamespace(call_later=delayed),
            to_thread=asyncio.to_thread))
    # Even an accidentally executed delayed callback cannot signal anything.
    monkeypatch.setattr(
        self_update.os, "kill", Mock(side_effect=AssertionError("signal forbidden")))
    return restart, delayed


@pytest.fixture
def tiny_repo(tmp_path, monkeypatch):
    repo = tmp_path / "checkout"
    repo.mkdir()
    real_run = subprocess.run
    env = dict(self_update.os.environ)
    # Do not inherit operator Git config, hooks, alternate worktree or indexes.
    env = {k: v for k, v in env.items() if not k.startswith("GIT_")}
    env.update(GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL="/dev/null",
               GIT_TERMINAL_PROMPT="0")

    def git(*args):
        return real_run(["git", "-c", "core.hooksPath=/dev/null", "-C", str(repo), *args],
                        env=env, capture_output=True, text=True, check=True).stdout.strip()

    git("init", "-b", "master")
    git("config", "user.name", "Test Fixture")
    git("config", "user.email", "fixture@example.invalid")
    (repo / "config.yml").write_bytes(PREFIX)
    (repo / ".env").write_bytes(b"FIXTURE=old\n")
    (repo / "code.txt").write_text("old code\n")
    git("add", ".")
    git("commit", "-m", "old release")
    old = git("rev-parse", "HEAD")
    (repo / "config.yml").write_bytes(PREFIX + b"# new release template\n")
    (repo / ".env").write_bytes(b"FIXTURE=new-template\n")
    (repo / "code.txt").write_text("new code\n")
    git("commit", "-am", "new release")
    git("tag", "v99.0.0")
    new = git("rev-parse", "HEAD")
    git("reset", "--hard", old)
    commands = []

    def guarded_run(cmd, **kwargs):
        assert cmd[:3] == ["git", "-C", str(repo)], "non-sandbox execution forbidden"
        args = cmd[3:]
        commands.append(args)
        if args == ["fetch", "--tags", "origin"]:
            return subprocess.CompletedProcess(cmd, 0, "", "")
        assert args in (["rev-parse", "--is-inside-work-tree"],
                        ["diff", "--name-only", "HEAD"], ["checkout", "--", "config.yml"],
                        ["checkout", "--", ".env"], ["rev-parse", "HEAD"],
                        ["checkout", "master"], ["merge", "--ff-only", "v99.0.0"],
                        ["merge", "--ff-only", "v98.0.0"], ["reset", "--hard", old])
        return real_run(["git", "-c", "core.hooksPath=/dev/null", *cmd[1:]],
                        env=env, **kwargs)

    monkeypatch.setattr(self_update, "_repo_root", lambda: str(repo))
    monkeypatch.setattr(self_update, "_ensure_local_workspace_for_update", Mock(return_value=None))
    monkeypatch.setattr(self_update.subprocess, "run", guarded_run)
    return SimpleNamespace(path=repo, old=old, new=new, git=git, commands=commands)


@pytest.mark.parametrize("leaves,expected", [
    (b"", b""),
    (b"    image_model: custom-image\n    outer_model: custom-outer\n",
     b"    image_model: custom-image\n    outer_model: custom-outer\n"),
    (b"    image_model: gpt-image-2\n    outer_model: gpt-5.5\n",
     b"    image_model: gpt-image-2.5-flare\n    outer_model: gpt-6-astra\n"),
    (b"    image_model: custom-image\n    outer_model: gpt-5.5\n",
     b"    image_model: custom-image\n    outer_model: gpt-6-astra\n"),
    (b"    image_model: gpt-image-2\n    outer_model: custom-outer\n",
     b"    image_model: gpt-image-2.5-flare\n    outer_model: custom-outer\n"),
])
async def test_real_self_update_preserves_then_loader_migrates(
        tiny_repo, isolate_runtime, leaves, expected):
    repo = tiny_repo.path
    prefix = PREFIX + (b"image:\n  backend: auto\n  openai:\n" if leaves else b"")
    before = prefix + leaves
    config = repo / "config.yml"
    config.write_bytes(before)
    env = b"# synthetic operator fixture\nFIXTURE='keep these bytes'\n"
    (repo / ".env").write_bytes(env)
    response = await handler(self_update.register_self_update, "/api/update/apply")(
        SimpleNamespace(json=AsyncMock(return_value={"version": "v99.0.0"})))
    assert response.status == 200, response.text
    assert json.loads(response.text)["previous"] == tiny_repo.old[:12]
    assert tiny_repo.git("rev-parse", "HEAD") == tiny_repo.new
    assert (repo / "code.txt").read_text() == "new code\n"
    assert ["checkout", "--", "config.yml"] in tiny_repo.commands
    assert config.read_bytes() == before  # updater itself must not migrate
    assert (repo / ".env").read_bytes() == env
    cfg = schema.load_config(config)
    assert config.read_bytes() == prefix + expected
    native = yaml.safe_load(config.read_text()).get("image", {}).get("openai", {})
    assert cfg.image.openai.image_model == native.get("image_model", NEW_IMAGE)
    assert cfg.image.openai.outer_model == native.get("outer_model", NEW_OUTER)
    schema.load_config(config)
    assert config.read_bytes() == prefix + expected
    assert (repo / ".env").read_bytes() == env
    isolate_runtime[0].assert_called_once_with()
    isolate_runtime[1].assert_called_once()


async def test_real_self_update_failed_tag_restores_operator_bytes(tiny_repo, isolate_runtime):
    config = tiny_repo.path / "config.yml"
    before = PREFIX + b"image: {openai: {image_model: gpt-image-2}}\n"
    config.write_bytes(before)
    env = b"FIXTURE=operator-only\n"
    (tiny_repo.path / ".env").write_bytes(env)
    response = await handler(self_update.register_self_update, "/api/update/apply")(
        SimpleNamespace(json=AsyncMock(return_value={"version": "v98.0.0"})))
    assert response.status == 500
    assert "fast-forward" in json.loads(response.text)["error"]
    assert tiny_repo.git("rev-parse", "HEAD") == tiny_repo.old
    assert (tiny_repo.path / "code.txt").read_text() == "old code\n"
    assert config.read_bytes() == before
    assert (tiny_repo.path / ".env").read_bytes() == env
    isolate_runtime[0].assert_not_called()
    isolate_runtime[1].assert_not_called()


async def test_webui_setup_persists_following_defaults(tmp_path, isolate_runtime):
    config_path = tmp_path / "config.yml"
    config_path.write_bytes(PREFIX.replace(b"token: fixture", b"token: '${DISCORD_TOKEN}'"))
    environment_path = tmp_path / ".env"
    store = InitializationStore(
        tmp_path / "data" / "initialization" / "state.json",
        InstallationBinding("image-default-setup-test", config_path.resolve()),
    )
    provision_initialization_parent(store.path)
    store.provision_fresh()
    bot = SimpleNamespace(
        config=schema.Config(discord={"token": "[REDACTED]"}),
        onboarding=OnboardingCoordinator(store, EnvironmentSource(environment_path), True),
        connection_supervisor=None,
    )
    response = await handler(config_admin.register_setup_wizard, "/api/setup/complete", bot)(
        SimpleNamespace(json=AsyncMock(return_value={
            "discord_token": "fixture.token.only", "timezone": "UTC",
            "features": {"browser": True, "comfyui": True}})))
    assert response.status == 200, response.text
    path = tmp_path / "config.yml"
    before = path.read_bytes()
    doc = yaml.safe_load(before)
    native = doc.get("image", {}).get("openai", {})
    assert "image_model" not in native and "outer_model" not in native
    assert "${DISCORD_TOKEN}" in path.read_text()
    assert (tmp_path / ".env").exists()
    cfg = schema.load_config(path)
    assert (cfg.image.openai.image_model, cfg.image.openai.outer_model) == (NEW_IMAGE, NEW_OUTER)
    assert cfg.browser.enabled and cfg.comfyui.enabled
    assert path.read_bytes() == before
    schema.load_config(path)
    assert path.read_bytes() == before
    # Setup publishes durable desired state and leaves gateway attachment to
    # the lifecycle supervisor. It no longer invokes the updater restart path.
    isolate_runtime[0].assert_not_called()
    isolate_runtime[1].assert_not_called()


async def test_package_without_git_refuses_self_update(tmp_path, monkeypatch, isolate_runtime):
    """A package-shaped directory cannot enter the Git update/config path."""
    (tmp_path / "config.yml.default").write_bytes(PREFIX)
    config = tmp_path / "config.yml"
    config.write_bytes(PREFIX + b"image: {openai: {image_model: custom}}\n")
    before = config.read_bytes()
    real_run = subprocess.run

    def probe_only(cmd, **kwargs):
        assert cmd == ["git", "-C", str(tmp_path), "rev-parse", "--is-inside-work-tree"]
        env = {k: v for k, v in self_update.os.environ.items() if not k.startswith("GIT_")}
        env.update(GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL="/dev/null",
                   GIT_CEILING_DIRECTORIES=str(tmp_path.parent))
        return real_run(cmd, env=env, **kwargs)

    monkeypatch.setattr(self_update, "_repo_root", lambda: str(tmp_path))
    monkeypatch.setattr(self_update.subprocess, "run", probe_only)
    provision = Mock(side_effect=AssertionError("workspace forbidden"))
    monkeypatch.setattr(self_update, "_ensure_local_workspace_for_update", provision)
    response = await handler(self_update.register_self_update, "/api/update/apply")(
        SimpleNamespace(json=AsyncMock(return_value={"version": "v99.0.0"})))
    assert response.status == 409
    assert "apt" in json.loads(response.text)["error"]
    assert config.read_bytes() == before
    assert not (tmp_path / ".env").exists()
    provision.assert_not_called()
    isolate_runtime[0].assert_not_called()
    isolate_runtime[1].assert_not_called()
