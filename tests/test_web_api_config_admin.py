"""Route-level coverage for src/web/api/config_admin.py (RFC-006 P4a + CONT-2).

Drives status / setup / discord / config / personality / quick-action / startup
routes through the real aiohttp route layer with a real pydantic Config and
faked components. These handler bodies ran only in production before P4a; CONT-2
finishes the surface. Dangerous boundaries are stubbed: the setup wizard's
process-SIGTERM is patched to a no-op. Personality handlers run the real
register_user_presets (2 trivial lines) with a snapshot/restore fixture around
its system_prompt._USER_PRESETS global so registrations don't leak between tests.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import Config
from src.web.api.config_admin import (
    register_discord_config,
    register_personality,
    register_quick_actions,
    register_setup_wizard,
    register_startup_diagnostics,
    register_status_info,
)


@pytest.fixture(autouse=True)
def _isolate_cwd(tmp_path, monkeypatch):
    # The setup-wizard handler persists to a RELATIVE Path("config.yml")
    # (correct at /opt/odin in prod). Chdir to a temp dir so no test can
    # write the repo's tracked config.yml template.
    monkeypatch.chdir(tmp_path)


@pytest.fixture(autouse=True)
def _active_config(tmp_path):
    """Point config persistence at a temp file.

    Config and personality writes go through the shared round-trip writer,
    which targets the file the live config was LOADED from and refuses to
    guess a CWD-relative one — a fabricated Config must never clobber whatever
    config.yml happens to sit in the working directory. Tests therefore have
    to declare an active path like a real deployment does.
    """
    from pathlib import Path

    from src.config.schema import active_config_path, set_active_config_path

    path = tmp_path / "active-config.yml"
    path.write_text("discord:\n  token: fake\n")
    previous = active_config_path()
    set_active_config_path(Path(path))
    yield path
    set_active_config_path(previous)


@pytest.fixture(autouse=True)
def _restore_user_presets():
    # Personality handlers call the real register_user_presets, which mutates
    # the system_prompt._USER_PRESETS module global. Snapshot + restore around
    # each test so registrations don't leak — the real 2-line function still
    # runs (we exercise it rather than patch it out).
    from src.llm import system_prompt
    saved = dict(system_prompt._USER_PRESETS)
    yield
    system_prompt._USER_PRESETS.clear()
    system_prompt._USER_PRESETS.update(saved)


def _bot():
    import time
    bot = MagicMock()
    bot.config = Config(discord={"token": "fake"})
    bot.guilds = []
    bot.start_time = time.monotonic()
    bot.is_ready.return_value = True
    bot.tool_catalog.merged_definitions.return_value = [{"name": "t1"}]
    bot.skill_manager.list_skills.return_value = []
    bot.sessions.count.return_value = 3
    bot.loop_manager.active_count = 1
    bot.scheduler.list_all.return_value = [
        {"consecutive_failures": 0, "paused": False},
        {"consecutive_failures": 2, "paused": True},
    ]
    bot.agent_manager._agents = {}
    return bot


def _app(*registrars, bot=None):
    bot = bot or _bot()
    routes = web.RouteTableDef()
    for reg in registrars:
        reg(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    return app, bot


# --------------------------------------------------------------------------- #
# Fake discord objects
# --------------------------------------------------------------------------- #
def _channel(cid, name, position=0, category=None):
    ch = SimpleNamespace(id=cid, name=name, position=position)
    ch.category = SimpleNamespace(name=category) if category else None
    return ch


def _guild(gid=1, name="Guild", members=None, channels=None):
    g = SimpleNamespace(id=gid, name=name, member_count=10)
    g.icon = SimpleNamespace(url="http://icon")
    g.text_channels = channels or []
    g.members = members or []
    return g


def _member(mid, name, bot=False):
    return SimpleNamespace(
        id=mid, name=name, display_name=name.title(),
        display_avatar=SimpleNamespace(url=f"http://a/{mid}"), bot=bot,
    )


def _channel_config():
    cc = MagicMock()
    cc.get_guild_config.return_value = {"enabled": True}
    cc.get_channel_config.return_value = {}
    cc.should_require_mention.return_value = True
    cc.is_enabled.return_value = True
    cc.should_respond_to_bots.return_value = False
    cc.set_guild_config.return_value = {"enabled": False}
    cc.set_channel_config.return_value = {"enabled": True}
    return cc


# --------------------------------------------------------------------------- #
# Setup wizard
# --------------------------------------------------------------------------- #
class TestSetupWizard:
    @pytest.mark.asyncio
    async def test_status(self):
        app, _ = _app(register_setup_wizard)
        async with TestClient(TestServer(app)) as c:
            # empty tmp dir → no config.yml → setup is needed
            assert (await (await c.get("/api/setup/status")).json())["needed"] is True

    @pytest.mark.asyncio
    async def test_complete_already_done_409(self):
        app, _ = _app(register_setup_wizard)
        with patch("src.web.api.config_admin.is_setup_needed", return_value=False):
            async with TestClient(TestServer(app)) as c:
                assert (await c.post("/api/setup/complete", json={})).status == 409

    @pytest.mark.asyncio
    async def test_complete_validation(self):
        app, _ = _app(register_setup_wizard)
        async with TestClient(TestServer(app)) as c:  # setup needed (empty dir)
            assert (await c.post("/api/setup/complete", data="bad")).status == 400
            assert (await c.post("/api/setup/complete", json={})).status == 400  # no token
            with patch("src.web.api.config_admin.validate_token_format", return_value=False):
                r = await c.post("/api/setup/complete", json={"discord_token": "x"})
                assert r.status == 400

    @pytest.mark.asyncio
    async def test_complete_success_writes_and_schedules_restart(self):
        from src import restart

        app, _ = _app(register_setup_wizard)
        # Patch the process-kill primitive to a no-op — the handler schedules a
        # SIGTERM to itself on success; it must never reach the test runner.
        with patch("src.web.api.config_admin.validate_token_format", return_value=True), \
             patch("os.kill") as kill:
            async with TestClient(TestServer(app)) as c:
                r = await c.post("/api/setup/complete", json={
                    "discord_token": "fake-token",
                    "hosts": {"srv": {"address": "10.0.0.1", "ssh_user": "root"}},
                    "features": {"browser": True, "voice": False},
                    "web_api_token": "tok", "timezone": "UTC",
                })
                assert r.status == 200 and (await r.json())["restart_scheduled"] is True
            kill.assert_not_called()  # scheduled via call_later(2s), not fired in-test
        # In-place restart armed, carrying the fresh token as an exec-time env
        # override — exec inherits the old environment and
        # load_dotenv(override=False) would otherwise keep the stale value.
        assert restart.restart_requested() is True
        assert restart.pending_env_overrides() == {"DISCORD_TOKEN": "fake-token"}

    @pytest.mark.asyncio
    async def test_complete_write_failure_500(self):
        from src import restart

        app, _ = _app(register_setup_wizard)
        with patch("src.web.api.config_admin.validate_token_format", return_value=True), \
             patch("src.web.api.config_admin._write_config", side_effect=OSError("disk full")):
            async with TestClient(TestServer(app)) as c:
                r = await c.post("/api/setup/complete", json={"discord_token": "fake-token"})
                assert r.status == 500
        # a failed save must never arm the restart
        assert restart.restart_requested() is False


# --------------------------------------------------------------------------- #
# Status
# --------------------------------------------------------------------------- #
class TestStatus:
    @pytest.mark.asyncio
    async def test_get_status_aggregates(self):
        app, bot = _app(register_status_info)
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/status")).json()
            assert body["status"] == "online"
            assert body["tool_count"] == 1 and body["session_count"] == 3
            assert body["schedule_count"] == 2 and body["schedule_failing"] == 1
            assert body["schedule_paused"] == 1

    @pytest.mark.asyncio
    async def test_uptime_reports_real_seconds(self):
        """Audit 2.1: the guard checked `_start_time` (never set by the real
        bot) while reading `start_time` — MagicMock's permissive hasattr hid
        it, so uptime shipped as a permanent 0. Deleting the underscore attr
        makes the mock's surface match the real bot's."""
        import time as _time

        app, bot = _app(register_status_info)
        del bot._start_time  # real bots never have this name
        bot.start_time = _time.monotonic() - 90
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/status")).json()
        assert body["uptime_seconds"] >= 90

    @pytest.mark.asyncio
    async def test_uptime_absent_start_time_is_zero_not_crash(self):
        app, bot = _app(register_status_info)
        del bot._start_time
        del bot.start_time
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/status")).json()
        assert body["uptime_seconds"] == 0

    @pytest.mark.asyncio
    async def test_status_with_guilds(self):
        app, bot = _app(register_status_info)
        g = MagicMock()
        g.id, g.name, g.member_count = 1, "Guild", 10
        bot.guilds = [g]
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/status")).json()
            assert body["guild_count"] == 1 and body["user_count"] == 10

    @pytest.mark.asyncio
    async def test_status_agents_processes_populated(self):
        app, bot = _app(register_status_info)
        bot.agent_manager._agents = {
            "a": SimpleNamespace(status="running"),
            "b": SimpleNamespace(status="done"),
        }
        bot.tool_executor._process_registry._processes = {
            1: SimpleNamespace(status="running"),
        }
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/status")).json()
            assert body["agent_count"] == 2 and body["agent_running"] == 1
            assert body["process_count"] == 1 and body["process_running"] == 1

    @pytest.mark.asyncio
    async def test_status_non_dict_registries_fall_back(self):
        app, bot = _app(register_status_info)
        bot.agent_manager._agents = "not-a-dict"
        bot.tool_executor._process_registry._processes = "not-a-dict"
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/status")).json()
            assert body["agent_count"] == 0 and body["process_count"] == 0


# --------------------------------------------------------------------------- #
# Discord config
# --------------------------------------------------------------------------- #
class TestDiscordConfig:
    @pytest.mark.asyncio
    async def test_guilds_with_channels(self):
        app, bot = _app(register_discord_config)
        bot.channel_config = _channel_config()
        bot.guilds = [_guild(channels=[_channel(20, "general", 0, "Cat"),
                                        _channel(21, "random", 1)])]
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/discord/guilds")).json()
            assert body[0]["name"] == "Guild" and len(body[0]["channels"]) == 2
            assert body[0]["channels"][0]["effective"]["require_mention"] is True

    @pytest.mark.asyncio
    async def test_members_deduped_sorted(self):
        app, bot = _app(register_discord_config)
        g1 = _guild(members=[_member(1, "zed"), _member(2, "amy")])
        g2 = _guild(gid=2, members=[_member(2, "amy"), _member(3, "bob", bot=True)])
        bot.guilds = [g1, g2]
        async with TestClient(TestServer(app)) as c:
            members = await (await c.get("/api/discord/members")).json()
            assert [m["id"] for m in members] == ["2", "3", "1"]  # by display_name

    @pytest.mark.asyncio
    async def test_guild_and_channel_config_put(self):
        app, bot = _app(register_discord_config)
        bot.channel_config = _channel_config()
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/discord/guild/5/config", json={"enabled": False})
            assert r.status == 200 and (await r.json())["guild_id"] == "5"
            assert (await c.put("/api/discord/guild/5/config", data="bad")).status == 400
            r = await c.put("/api/discord/channel/9/config", json={"clear": True})
            assert r.status == 200 and (await r.json())["channel_id"] == "9"
            assert (await c.put("/api/discord/channel/9/config", data="bad")).status == 400

    @pytest.mark.asyncio
    async def test_update_config_persists_normalized_dropping_removed_keys(self, _active_config):
        # The general /api/config write must persist the VALIDATED config, not
        # the raw merge — a removed key named in the update (model_routing)
        # can't linger on disk.
        from pathlib import Path

        from ruamel.yaml import YAML

        from src.config.schema import active_config_path, set_active_config_path

        Path("config.yml").write_text("discord:\n  token: fake\n")
        previous = active_config_path()
        set_active_config_path(Path("config.yml"))
        try:
            app, bot = _app(register_discord_config)
            async with TestClient(TestServer(app)) as c:
                r = await c.put("/api/config", json={
                    "context": {"max_system_prompt_tokens": 12345},
                    "openai_codex": {
                        "model_routing": {"enabled": True},
                        "max_tokens": 98765,
                    },
                    "graceful_degradation": {
                        "enabled": False,
                        "degraded_threshold": 7,
                    },
                    "grafana_alerts": {
                        "enabled": False,
                        "cooldown_seconds": 612,
                    },
                })
                assert r.status == 200
        finally:
            set_active_config_path(previous)
        saved = YAML().load(Path("config.yml").read_text())
        oc = saved.get("openai_codex", {})
        assert "model_routing" not in oc
        assert "max_tokens" not in oc
        assert "max_system_prompt_tokens" not in saved.get("context", {})
        assert "enabled" not in saved["graceful_degradation"]
        assert saved["graceful_degradation"]["degraded_threshold"] == 7
        assert "enabled" not in saved["grafana_alerts"]
        assert saved["grafana_alerts"]["cooldown_seconds"] == 612

    @pytest.mark.asyncio
    async def test_context_budget_alias_persists_canonical_key_through_restart(
        self, _active_config
    ):
        from pathlib import Path

        from ruamel.yaml import YAML

        from src.config.schema import Config as _Config
        from src.config.schema import active_config_path, set_active_config_path

        path = Path("config.yml")
        path.write_text("discord:\n  token: fake\n")
        previous = active_config_path()
        set_active_config_path(path)
        try:
            app, bot = _app(register_discord_config)
            async with TestClient(TestServer(app)) as c:
                r = await c.put(
                    "/api/config",
                    json={
                        "openai_codex": {
                            "context_budget_overrides": {
                                "codex-auto-review": 600_000,
                            }
                        }
                    },
                )
                assert r.status == 200
                assert (await r.json())["openai_codex"][
                    "context_budget_overrides"
                ] == {"gpt-5.6-luna": 600_000}
        finally:
            set_active_config_path(previous)

        expected = {"gpt-5.6-luna": 600_000}
        assert bot.config.openai_codex.context_budget_overrides == expected
        document = YAML().load(path.read_text())
        assert document["openai_codex"]["context_budget_overrides"] == expected
        assert _Config(**document).openai_codex.context_budget_overrides == expected

    @pytest.mark.asyncio
    async def test_blanking_the_workspace_normalizes_everywhere(self):
        """PR #239 round-8 follow-up: the persisted-config path, for real.

        tools.local_working_dir accepts free strings and can be blanked through
        this endpoint. Blank must normalize to the default in the RESPONSE, in
        the runtime config, on disk, and on a fresh reload — otherwise the
        self-update preflight and the restarted process disagree about which
        directory they are validating, which is how a blank value used to
        approve an update that then failed closed on every local command.
        """
        from pathlib import Path

        from ruamel.yaml import YAML

        from src.config.schema import Config as _Config
        from src.config.schema import active_config_path, set_active_config_path

        Path("config.yml").write_text("discord:\n  token: fake\n")
        # Explicit: persistence targets the ACTIVE config path, and any earlier
        # test that called load_config leaves that module global set.
        previous = active_config_path()
        set_active_config_path(Path("config.yml"))
        try:
            app, bot = _app(register_discord_config)
            async with TestClient(TestServer(app)) as c:
                r = await c.put("/api/config", json={"tools": {"local_working_dir": "   "}})
                assert r.status == 200
        finally:
            set_active_config_path(previous)

        default = "/var/lib/odin-workspace"
        assert bot.config.tools.local_working_dir == default, "runtime config"
        on_disk = YAML().load(Path("config.yml").read_text())["tools"]["local_working_dir"]
        assert on_disk == default, "persisted YAML"
        reloaded = _Config(**YAML().load(Path("config.yml").read_text()))
        assert reloaded.tools.local_working_dir == default, "fresh reload"

    @pytest.mark.asyncio
    async def test_writes_to_the_active_config_not_cwd_config_yml(self):
        """PR #239 round-10 blocker 3: alternate-config deployments.

        Odin can be launched with `python -m src /somewhere/odin.yml`, and
        restart.reexec replays that argument. Persisting to a cwd-relative
        config.yml meant a change lived in bot.config, was validated by the
        self-update preflight, and then vanished on re-exec — contradicting the
        preflight's contract that it validates what the restarted process will
        use. llm_admin already wrote to the active path; this one did not.
        """
        from pathlib import Path

        from ruamel.yaml import YAML

        from src.config.schema import active_config_path, set_active_config_path

        alternate = Path("odin-alternate.yml")
        alternate.write_text("discord:\n  token: fake\n")
        decoy = Path("config.yml")
        decoy.write_text("discord:\n  token: fake\n")

        previous = active_config_path()
        set_active_config_path(alternate)
        try:
            app, bot = _app(register_discord_config)
            async with TestClient(TestServer(app)) as c:
                r = await c.put(
                    "/api/config", json={"tools": {"local_working_dir": "/srv/ws"}}
                )
                assert r.status == 200
        finally:
            set_active_config_path(previous)

        written = YAML().load(alternate.read_text())["tools"]["local_working_dir"]
        assert written == "/srv/ws", "the ACTIVE config must receive the change"
        assert bot.config.tools.local_working_dir == "/srv/ws", "runtime agrees"
        assert "tools" not in (YAML().load(decoy.read_text()) or {}), (
            "the cwd config.yml is a decoy here and must not be written"
        )

    @pytest.mark.asyncio
    async def test_health_and_resource_and_streams(self):
        app, bot = _app(register_discord_config)
        bot.tool_executor.output_streamer = SimpleNamespace(
            enabled_tools={"run_command"}, get_active_streams=lambda: [])
        with patch("src.health.checker.check_all", return_value={"ok": True}), \
             patch("src.monitoring.resource_usage.collect_all", return_value={"cpu": 1}):
            async with TestClient(TestServer(app)) as c:
                assert (await (await c.get("/api/health/components")).json())["ok"] is True
                assert (await (await c.get("/api/resource-usage")).json())["cpu"] == 1
                s = await (await c.get("/api/tool-streams")).json()
                assert s["enabled"] is True and s["enabled_tools"] == ["run_command"]

    @pytest.mark.asyncio
    async def test_tool_streams_disabled(self):
        app, bot = _app(register_discord_config)
        bot.tool_executor.output_streamer = None
        async with TestClient(TestServer(app)) as c:
            assert (await (await c.get("/api/tool-streams")).json())["enabled"] is False

    @pytest.mark.asyncio
    async def test_config_get_redacts(self):
        app, bot = _app(register_discord_config)
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/config")).json()
            # the discord token is redacted, never returned in the clear
            assert body["discord"]["token"] != "fake"

    @pytest.mark.asyncio
    async def test_config_put_paths(self):
        app, bot = _app(register_discord_config)
        async with TestClient(TestServer(app)) as c:
            assert (await c.put("/api/config", data="bad")).status == 400
            assert (await c.put("/api/config", json=[1, 2])).status == 400  # not an object
            # sensitive field blocked
            assert (await c.put("/api/config",
                                json={"discord": {"token": "new"}})).status == 403
            # invalid value → Config reconstruction fails
            assert (await c.put("/api/config",
                                json={"tools": {"max_tool_iterations_chat": "nope"}})).status == 400
            # valid update applies
            r = await c.put("/api/config", json={"tools": {"max_tool_iterations_chat": 7}})
            assert r.status == 200
            assert bot.config.tools.max_tool_iterations_chat == 7

    @pytest.mark.asyncio
    async def test_config_put_persists_when_file_exists(self, _active_config):
        from ruamel.yaml import YAML

        app, bot = _app(register_discord_config)
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/config", json={"tools": {"max_tool_iterations_chat": 9}})
            assert r.status == 200
        on_disk = YAML().load(_active_config.read_text())
        assert on_disk["tools"]["max_tool_iterations_chat"] == 9

    @pytest.mark.asyncio
    async def test_config_put_persist_failure_is_reported_and_changes_nothing(self):
        """A save that cannot reach disk must fail loudly.

        The old handler applied the change to bot.config FIRST and merely
        logged a write failure, so the UI reported "Config saved successfully"
        for a change that silently reverted at the next restart. Persistence
        now happens before the runtime swap: a failed write means 500 AND an
        untouched runtime config."""
        app, bot = _app(register_discord_config)
        before = bot.config.tools.max_tool_iterations_chat
        with patch("src.config.persistence.patch_config_paths", side_effect=OSError("ro")):
            async with TestClient(TestServer(app)) as c:
                r = await c.put("/api/config", json={"tools": {"max_tool_iterations_chat": 6}})
                assert r.status == 500
        assert bot.config.tools.max_tool_iterations_chat == before

    @pytest.mark.asyncio
    async def test_config_put_missing_file_is_reported(self, _active_config):
        """A missing target used to skip persistence and still return 200."""
        _active_config.unlink()
        app, bot = _app(register_discord_config)
        before = bot.config.tools.max_tool_iterations_chat
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/config", json={"tools": {"max_tool_iterations_chat": 6}})
            assert r.status == 500
        assert bot.config.tools.max_tool_iterations_chat == before

    @pytest.mark.asyncio
    async def test_config_put_diff_failure_still_200(self):
        app, bot = _app(register_discord_config)
        with patch("src.audit.diff_tracker.compute_dict_diff", side_effect=RuntimeError("x")):
            async with TestClient(TestServer(app)) as c:
                r = await c.put("/api/config", json={"tools": {"max_tool_iterations_chat": 6}})
                assert r.status == 200  # diff failure swallowed, config_diff=None


# --------------------------------------------------------------------------- #
# Quick actions
# --------------------------------------------------------------------------- #
class TestQuickActions:
    @pytest.mark.asyncio
    async def test_clear_all_dev_mode(self):
        app, bot = _app(register_quick_actions)
        bot.api_token_manager = None  # no auth configured → dev mode allows
        bot.sessions.clear_all.return_value = 4
        async with TestClient(TestServer(app)) as c:
            r = await c.post("/api/sessions/clear-all")
            assert r.status == 200 and (await r.json())["count"] == 4

    @pytest.mark.asyncio
    async def test_clear_all_denied_when_auth_configured(self):
        app, bot = _app(register_quick_actions)
        bot.api_token_manager = None
        bot.config.web.api_token = "secret"  # auth configured, no identity → 403
        async with TestClient(TestServer(app)) as c:
            assert (await c.post("/api/sessions/clear-all")).status == 403

    @pytest.mark.asyncio
    async def test_reload(self):
        app, bot = _app(register_quick_actions)
        async with TestClient(TestServer(app)) as c:
            assert (await (await c.post("/api/reload")).json())["status"] == "reloaded"
            bot.prompt_builder.rebuild_default.assert_called_once()


# --------------------------------------------------------------------------- #
# Personality
# --------------------------------------------------------------------------- #
class TestPersonality:
    @pytest.mark.asyncio
    async def test_get_personality(self):
        app, _ = _app(register_personality)
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/personality")).json()
            assert "preset" in body and "builtin_presets" in body
            assert isinstance(body["presets"], dict)

    @pytest.mark.asyncio
    async def test_update_personality_and_bad_json(self):
        app, bot = _app(register_personality)
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/personality", json={"preset": "odin"})
            assert r.status == 200 and (await r.json())["preset"] == "odin"
            assert (await c.put("/api/personality", data="bad")).status == 400

    @pytest.mark.asyncio
    async def test_save_preset(self):
        app, bot = _app(register_personality)
        async with TestClient(TestServer(app)) as c:
            assert (await c.post("/api/personality/presets", data="bad")).status == 400
            assert (await c.post("/api/personality/presets", json={})).status == 400  # no name
            assert (await c.post("/api/personality/presets",
                                 json={"name": "bad name!"})).status == 400  # bad chars
            # cannot overwrite a built-in preset name
            assert (await c.post("/api/personality/presets",
                                 json={"name": "odin", "identity": "x"})).status == 400
            assert (await c.post("/api/personality/presets",
                                 json={"name": "custom1"})).status == 400  # no identity/voice
            r = await c.post("/api/personality/presets",
                             json={"name": "custom1", "identity": "witty"})
            assert r.status == 200 and (await r.json())["name"] == "custom1"
            assert "custom1" in bot.config.personality.user_presets

    @pytest.mark.asyncio
    async def test_delete_preset(self):
        app, bot = _app(register_personality)
        from src.config.schema import PersonalityPreset
        bot.config.personality.user_presets["mine"] = PersonalityPreset(
            name="Mine", identity="i", voice="v")
        async with TestClient(TestServer(app)) as c:
            assert (await c.delete("/api/personality/presets/odin")).status == 400  # builtin
            assert (await c.delete("/api/personality/presets/ghost")).status == 404
            r = await c.delete("/api/personality/presets/mine")
            assert r.status == 200 and (await r.json())["name"] == "mine"
            assert "mine" not in bot.config.personality.user_presets

    @pytest.mark.asyncio
    async def test_delete_preset_resets_active(self):
        app, bot = _app(register_personality)
        from src.config.schema import PersonalityPreset
        bot.config.personality.user_presets["active"] = PersonalityPreset(
            name="A", identity="i", voice="v")
        bot.config.personality.preset = "active"
        async with TestClient(TestServer(app)) as c:
            assert (await c.delete("/api/personality/presets/active")).status == 200
            assert bot.config.personality.preset == "odin"  # reset to default


# --------------------------------------------------------------------------- #
# Startup diagnostics
# --------------------------------------------------------------------------- #
class TestStartupDiagnostics:
    @pytest.mark.asyncio
    async def test_unavailable_503(self):
        app, bot = _app(register_startup_diagnostics)
        bot.startup_report = None
        async with TestClient(TestServer(app)) as c:
            assert (await c.get("/api/startup/diagnostics")).status == 503

    @pytest.mark.asyncio
    async def test_available(self):
        app, bot = _app(register_startup_diagnostics)
        bot.startup_report = SimpleNamespace(to_dict=lambda: {"checks": 8, "passed": 8})
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/startup/diagnostics")).json()
            assert body["checks"] == 8


class TestPersonalityPersistFirst:
    """A failed personality write must leave nothing live.

    All three endpoints used to install the new personality — and register its
    presets into the process-global registry — BEFORE persisting, so a 500
    left the new identity effective with nothing on disk behind it.
    """

    @pytest.mark.asyncio
    async def test_update_failure_leaves_runtime_untouched(self):
        app, bot = _app(register_personality)
        before = bot.config.personality.preset
        with patch("src.config.persistence.patch_config_paths",
                   side_effect=OSError("read-only fs")):
            async with TestClient(TestServer(app)) as c:
                r = await c.put("/api/personality", json={"preset": "pirate"})
                assert r.status == 500
        assert bot.config.personality.preset == before

    @pytest.mark.asyncio
    async def test_failed_save_preset_does_not_register_globally(self):
        from src.llm import system_prompt

        app, bot = _app(register_personality)
        with patch("src.config.persistence.patch_config_paths",
                   side_effect=OSError("read-only fs")):
            async with TestClient(TestServer(app)) as c:
                r = await c.post("/api/personality/presets", json={
                    "name": "ghost", "identity": "spooky",
                })
                assert r.status == 500
        assert "ghost" not in bot.config.personality.user_presets
        assert "ghost" not in system_prompt._USER_PRESETS

    @pytest.mark.asyncio
    async def test_failed_delete_keeps_the_preset(self):
        from src.config.schema import PersonalityPreset

        app, bot = _app(register_personality)
        bot.config.personality.user_presets["keeper"] = PersonalityPreset(
            name="keeper", identity="stays", voice="",
        )
        with patch("src.config.persistence.patch_config_paths",
                   side_effect=OSError("read-only fs")):
            async with TestClient(TestServer(app)) as c:
                r = await c.delete("/api/personality/presets/keeper")
                assert r.status == 500
        assert "keeper" in bot.config.personality.user_presets

    @pytest.mark.asyncio
    async def test_successful_update_still_applies_and_persists(self, _active_config):
        from ruamel.yaml import YAML

        app, bot = _app(register_personality)
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/personality", json={
                "preset": "custom", "custom_name": "Test", "custom_identity": "id",
            })
            assert r.status == 200
        assert bot.config.personality.preset == "custom"
        on_disk = YAML().load(_active_config.read_text())["personality"]
        assert on_disk["preset"] == "custom"
        assert on_disk["custom_name"] == "Test"


class TestConfigTransaction:
    """The whole mutation runs under one lock.

    Odin's repro: an LLM update overwritten by a stale generic document. A
    generic save reads bot.config, validates a merged copy, persists, then
    rebinds bot.config. If another writer commits between the read and the
    rebind, the rebind is built from a snapshot that predates it — so the
    change vanishes from runtime while the leaf-scoped write leaves it on
    disk, and runtime and disk silently disagree.
    """

    @pytest.mark.asyncio
    async def test_concurrent_writer_is_not_clobbered(self, _active_config):
        import asyncio

        from src.config.persistence import config_transaction

        app, bot = _app(register_discord_config)
        async with TestClient(TestServer(app)) as c:
            # Hold the transaction like a concurrent LLM route would, mutate
            # bot.config underneath, and only then let the generic save run.
            async with config_transaction():
                request = asyncio.create_task(
                    c.put("/api/config", json={"tools": {"max_tool_iterations_chat": 7}})
                )
                await asyncio.sleep(0.05)
                # The generic handler must still be waiting for the lock — if it
                # read bot.config already, this change would be lost below.
                assert not request.done()
                bot.config.openai_codex.model = "concurrently-set-model"

            r = await request
            assert r.status == 200

        assert bot.config.tools.max_tool_iterations_chat == 7, "the save applied"
        assert bot.config.openai_codex.model == "concurrently-set-model", (
            "the concurrent writer's change survived the rebind"
        )

    @pytest.mark.asyncio
    async def test_lock_is_released_after_a_rejected_save(self, _active_config):
        """A 400 returns from inside the transaction — the lock must not leak."""
        from src.config.persistence import config_transaction

        app, bot = _app(register_discord_config)
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/config", json={"tools": {"max_tool_iterations_chat": "no"}})
            assert r.status == 400
        assert not config_transaction().locked()


class TestCancellationCoherence:
    """A cancelled save must not leave disk and runtime disagreeing.

    The write commits before the cancellation is observed, so raising at that
    point would strand the handler before it updates bot.config — disk would
    say DEBUG while the process kept serving INFO.
    """

    @pytest.mark.asyncio
    async def test_runtime_matches_disk_after_a_cancelled_save(self, _active_config):
        import asyncio
        import threading

        from ruamel.yaml import YAML

        import src.config.persistence as persistence

        app, bot = _app(register_discord_config)
        real = persistence.patch_config_paths

        # Synchronise on EVENTS, not sleeps. Cancelling after a fixed delay is
        # a guess about scheduling: under full-suite load the write had not
        # always begun when the cancel landed, so this test failed for a reason
        # that had nothing to do with the behaviour it pins.
        write_started = threading.Event()
        may_finish = threading.Event()

        def slow(changes, *, path=None):
            write_started.set()
            assert may_finish.wait(timeout=10), "test never released the write"
            real(changes, path=path)

        with patch.object(persistence, "patch_config_paths", slow):
            async with TestClient(TestServer(app)) as c:
                request = asyncio.create_task(
                    c.put("/api/config", json={"logging": {"level": "DEBUG"}})
                )
                # The write is genuinely in flight before we cancel.
                assert await asyncio.to_thread(write_started.wait, 10), "write never started"
                request.cancel()
                may_finish.set()
                with pytest.raises(asyncio.CancelledError):
                    await request

        on_disk = YAML().load(_active_config.read_text())["logging"]["level"]
        assert on_disk == "DEBUG"
        assert bot.config.logging.level == "DEBUG", (
            "runtime must match what was committed to disk"
        )


class TestPersonalityTransaction:
    """Read → compute → persist → publish must be one transaction: computing
    outside the lock and publishing after releasing it lets two concurrent
    saves land with runtime holding one value and disk the other."""

    @pytest.mark.asyncio
    async def test_personality_save_blocks_on_the_shared_lock(self, _active_config):
        import asyncio

        from src.config.persistence import config_transaction

        app, bot = _app(register_personality)
        async with TestClient(TestServer(app)) as c:
            async with config_transaction():
                request = asyncio.create_task(
                    c.put("/api/personality", json={"preset": "pirate"})
                )
                await asyncio.sleep(0.05)
                assert not request.done(), (
                    "the handler must wait for the lock before reading bot.config"
                )
            r = await request
            assert r.status == 200
        assert bot.config.personality.preset == "pirate"

    @pytest.mark.asyncio
    async def test_personality_placeholder_is_not_flattened(self, _active_config, monkeypatch):
        _active_config.write_text(
            "discord:\n  token: x\npersonality:\n  custom_name: ${ODIN_NAME}\n"
        )
        monkeypatch.setenv("ODIN_NAME", "Odin")
        app, bot = _app(register_personality)
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/personality", json={
                "preset": "custom", "custom_name": "Odin", "custom_identity": "id",
            })
            assert r.status == 200
        text = _active_config.read_text()
        assert "custom_name: ${ODIN_NAME}" in text, (
            "an unchanged placeholder must survive a personality save"
        )
        assert "preset: custom" in text


class TestCancellationDerivedPublication:
    @pytest.mark.asyncio
    async def test_generic_personality_save_publishes_derived_state_before_cancel(
        self, _active_config
    ):
        import asyncio
        import threading

        import src.config.persistence as persistence
        from src.llm import system_prompt

        app, bot = _app(register_discord_config)
        started = threading.Event()
        release = threading.Event()
        real = persistence.patch_config_paths

        def slow(changes, *, path=None):
            started.set()
            release.wait()
            real(changes, path=path)

        with patch.object(persistence, "patch_config_paths", slow):
            async with TestClient(TestServer(app)) as c:
                request = asyncio.create_task(
                    c.put(
                        "/api/config",
                        json={
                            "personality": {
                                "preset": "custom",
                                "custom_name": "Cancelled Odin",
                                "custom_identity": "still committed",
                                "user_presets": {
                                    "cancelled": {
                                        "name": "Cancelled",
                                        "identity": "committed",
                                        "voice": "steady",
                                    }
                                },
                            }
                        },
                    )
                )
                while not started.is_set():
                    await asyncio.sleep(0.005)
                request.cancel()
                release.set()
                with pytest.raises(asyncio.CancelledError):
                    await request

        assert bot.config.personality.custom_name == "Cancelled Odin"
        assert "cancelled" in system_prompt._USER_PRESETS
        bot.prompt_builder.rebuild_default.assert_called_once()
        bot.tool_catalog.invalidate.assert_called_once()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "route", "body"),
    [
        ("put", "/api/personality", {"preset": "pirate"}),
        ("post", "/api/personality/presets", {"name": "cancelled", "identity": "still here"}),
    ],
)
async def test_cancelled_failed_personality_write_does_not_publish(
    monkeypatch, method, route, body
):
    async def cancelled_failure(_changes):
        return OSError("disk full"), True

    monkeypatch.setattr(
        "src.web.api.config_admin.persist_config_paths_locked", cancelled_failure
    )
    app, bot = _app(register_personality)
    before = bot.config.personality.model_copy(deep=True)

    async with TestClient(TestServer(app)) as c:
        with pytest.raises(Exception):
            await getattr(c, method)(route, json=body)

    assert bot.config.personality == before
    bot.prompt_builder.invalidate.assert_not_called()
    bot.tool_catalog.invalidate.assert_not_called()


@pytest.mark.asyncio
async def test_cancelled_failed_generic_write_does_not_publish(monkeypatch):
    async def cancelled_failure(_changes):
        return OSError("disk full"), True

    monkeypatch.setattr(
        "src.web.api.config_admin.persist_config_paths_locked", cancelled_failure
    )
    app, bot = _app(register_discord_config)
    before = bot.config.tools.max_tool_iterations_chat

    async with TestClient(TestServer(app)) as c:
        with pytest.raises(Exception):
            await c.put("/api/config", json={"tools": {"max_tool_iterations_chat": 7}})

    assert bot.config.tools.max_tool_iterations_chat == before
    bot.tool_catalog.invalidate.assert_not_called()


@pytest.mark.asyncio
async def test_cancelled_successful_personality_update_publishes_before_escape(
    monkeypatch,
):
    async def cancelled_success(_changes):
        return None, True

    monkeypatch.setattr(
        "src.web.api.config_admin.persist_config_paths_locked", cancelled_success
    )
    app, bot = _app(register_personality)

    async with TestClient(TestServer(app)) as c:
        with pytest.raises(Exception):
            await c.put("/api/personality", json={"preset": "pirate"})

    assert bot.config.personality.preset == "pirate"
    bot.prompt_builder.rebuild_default.assert_called_once()


@pytest.mark.asyncio
async def test_cancelled_successful_active_preset_save_publishes_derived_state(
    monkeypatch,
):
    async def cancelled_success(_changes):
        return None, True

    monkeypatch.setattr(
        "src.web.api.config_admin.persist_config_paths_locked", cancelled_success
    )
    app, bot = _app(register_personality)
    bot.config.personality.preset = "active"

    async with TestClient(TestServer(app)) as c:
        with pytest.raises(Exception):
            await c.post(
                "/api/personality/presets",
                json={"name": "active", "identity": "committed"},
            )

    assert "active" in bot.config.personality.user_presets
    bot.prompt_builder.invalidate.assert_called_once()
    bot.tool_catalog.invalidate.assert_called_once()
    bot.prompt_builder.rebuild_default.assert_called_once()


@pytest.mark.asyncio
async def test_cancelled_failed_preset_delete_does_not_publish(monkeypatch):
    from src.config.schema import PersonalityPreset

    async def cancelled_failure(_changes):
        return OSError("disk full"), True

    monkeypatch.setattr(
        "src.web.api.config_admin.persist_config_paths_locked", cancelled_failure
    )
    app, bot = _app(register_personality)
    bot.config.personality.user_presets["keep"] = PersonalityPreset(
        name="Keep", identity="still present"
    )

    async with TestClient(TestServer(app)) as c:
        with pytest.raises(Exception):
            await c.delete("/api/personality/presets/keep")

    assert "keep" in bot.config.personality.user_presets


@pytest.mark.asyncio
async def test_cancelled_successful_preset_delete_publishes_before_escape(monkeypatch):
    from src.config.schema import PersonalityPreset

    async def cancelled_success(_changes):
        return None, True

    monkeypatch.setattr(
        "src.web.api.config_admin.persist_config_paths_locked", cancelled_success
    )
    app, bot = _app(register_personality)
    bot.config.personality.user_presets["gone"] = PersonalityPreset(
        name="Gone", identity="committed deletion"
    )

    async with TestClient(TestServer(app)) as c:
        with pytest.raises(Exception):
            await c.delete("/api/personality/presets/gone")

    assert "gone" not in bot.config.personality.user_presets


class TestConfigMeta:
    """GET /api/config/meta — how each section reaches the running bot.

    The page renders apply-mode badges from this. Before it existed the UI
    inferred everything from a value's shape, which is how it came to report
    "Config saved successfully" for changes that needed a restart, were owned
    by another endpoint, or were not wired to anything at all.
    """

    #: The complete server record contract consumed by Config Center. The page
    #: reads this route directly; keeping the exact key set pinned makes schema
    #: additions and removals deliberate rather than silent UI drift.
    RECORD_KEYS = {
        "path", "owner", "label", "description", "aliases", "unit", "examples",
        "type", "structured_container", "structured_container_child", "enum",
        "constraints", "default",
        "sensitivity", "secret_route",
        "apply_mode", "apply_handler", "consumers", "restart_reason",
        "activation_policy", "group_description", "save_effect",
        "runtime_effect", "action_available", "action_label",
        "action_endpoint", "action_method", "action_body",
        "desired", "effective", "configured", "provenance",
        "valid", "validation_errors", "pending_restart", "drift", "last_apply",
        "apply_state",
    }


    @pytest.mark.asyncio
    async def test_an_ordinary_save_is_unaffected(self):
        app, bot = _app(register_discord_config)
        async with TestClient(TestServer(app)) as c:
            resp = await c.put(
                "/api/config", json={"discord": {"require_mention": False}}
            )

        assert resp.status == 200
        assert bot.config.discord.require_mention is False

    def test_the_route_sits_behind_the_admin_gate(self):
        """It returns every non-secret configuration value. Route-level tests
        run without the auth middleware, so nothing else here would notice the
        route being moved somewhere the gate does not cover."""
        from src.health.server import ADMIN_ONLY_PREFIXES

        assert any(
            "/api/config/meta".startswith(prefix) for prefix in ADMIN_ONLY_PREFIXES
        )

    @pytest.mark.asyncio
    async def test_payload_is_the_envelope_the_page_consumes(self):
        app, _bot = _app(register_discord_config)
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/config/meta")).json()

        assert body["schema_version"] == 1
        assert body["revision"]
        assert isinstance(body["fields"], list) and body["fields"]
        status = body["status"]
        assert set(status["counts"]) == {
            "applied", "pending_restart", "dormant", "invalid", "drift", "unknown",
        }
        assert sum(status["counts"].values()) == len(body["fields"])
        assert status["desired_revision"] == body["revision"]

    @pytest.mark.asyncio
    async def test_every_record_carries_the_full_contract(self):
        app, _bot = _app(register_discord_config)
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/config/meta")).json()

        for record in body["fields"]:
            assert set(record) == self.RECORD_KEYS, (
                f"{record['path']} does not match the fixture contract: "
                f"{set(record) ^ self.RECORD_KEYS}"
            )

    @pytest.mark.asyncio
    async def test_every_schema_leaf_is_a_field(self):
        """Nested leaves too — a section entry cannot stand in for the leaves
        underneath it, which is how the retry and pool settings went
        unclassified."""
        app, _bot = _app(register_discord_config)
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/config/meta")).json()

        paths = {record["path"] for record in body["fields"]}
        for expected in (
            "timezone",
            "openai_codex.model",
            "openai_codex.retry.max_retries",
            "openai_codex.connection_pool.max_connections",
            "tools.max_tool_iterations_chat",
            "turn_state.resume_ttl_hours",
        ):
            assert expected in paths, f"{expected} has no field record"
        assert "graceful_degradation.enabled" not in paths
        assert "grafana_alerts.enabled" not in paths

    @pytest.mark.asyncio
    async def test_populated_container_descendants_are_read_only(self):
        """A populated tools.hosts used to flatten into ordinary editable text
        inputs even though its empty parent promised a read-only collection."""
        bot = _bot()
        bot.config = Config(
            discord={"token": "fake"},
            tools={
                "hosts": {
                    "prod": {
                        "address": "10.0.0.8",
                        "ssh_user": "deploy",
                        "os": "linux",
                    }
                }
            },
        )
        app, _ = _app(register_discord_config, bot=bot)
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/config/meta")).json()

        records = {
            record["path"]: record
            for record in body["fields"]
            if record["path"].startswith("tools.hosts.prod.")
        }
        assert set(records) == {
            "tools.hosts.prod.address",
            "tools.hosts.prod.ssh_user",
            "tools.hosts.prod.os",
        }
        assert all(record["structured_container_child"] for record in records.values())
        assert all(not record["structured_container"] for record in records.values())

    @pytest.mark.asyncio
    async def test_apply_modes_are_from_the_known_vocabulary(self):
        app, _bot = _app(register_discord_config)
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/config/meta")).json()

        # Mirrors APPLY_MODE_LABELS in ui/js/pages/config.js — the page maps
        # anything else onto its Restart group.
        allowed = {
            "live_read", "live_apply", "live_for_new_work", "restart",
            "activation_required", "legacy_control", "dormant",
        }
        for record in body["fields"]:
            assert record["apply_mode"] in allowed, (
                f"{record['path']}: {record['apply_mode']} is a mode the page "
                f"cannot render, and unknown modes fall into its Restart group"
            )
            assert record["description"], f"{record['path']} has no description"

    @pytest.mark.asyncio
    async def test_restart_fields_say_why(self):
        """A restart badge with no reason is the kind of unexplained claim
        this campaign kept finding in comments."""
        app, _bot = _app(register_discord_config)
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/config/meta")).json()

        for record in body["fields"]:
            if record["apply_mode"] == "restart":
                assert record["restart_reason"], (
                    f"{record['path']} claims restart without a reason"
                )

    @pytest.mark.asyncio
    async def test_live_apply_fields_name_their_handler(self):
        app, _bot = _app(register_discord_config)
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/config/meta")).json()

        for record in body["fields"]:
            if record["apply_mode"] == "live_apply":
                assert record["apply_handler"], (
                    f"{record['path']} claims a live apply with no handler"
                )

    @pytest.mark.asyncio
    async def test_activation_required_fields_say_what_activation_means(self):
        app, _bot = _app(register_discord_config)
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/config/meta")).json()

        dormant = [
            r for r in body["fields"] if r["apply_mode"] == "activation_required"
        ]
        assert dormant, "no dormant fields — the vocabulary would be untested"
        for record in dormant:
            assert record["activation_policy"], f"{record['path']}"
            assert record["apply_state"] == "dormant"

    @pytest.mark.asyncio
    async def test_disagreeing_consumers_are_published_not_averaged(self):
        """timezone is live for prompts and restart for the time parser. One
        badge for both would be false whichever it showed."""
        app, _bot = _app(register_discord_config)
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/config/meta")).json()

        record = next(r for r in body["fields"] if r["path"] == "timezone")
        modes = {c["apply_mode"] for c in record["consumers"]}
        assert "live_read" in modes and "restart" in modes
        assert all(c["detail"] for c in record["consumers"])

    @pytest.mark.asyncio
    async def test_secret_state_without_secret_values(self):
        app, bot = _app(register_discord_config)
        bot.config.discord.token = "super-secret-token-value"
        async with TestClient(TestServer(app)) as c:
            resp = await c.get("/api/config/meta")
            raw = await resp.text()
            body = await resp.json()

        record = next(r for r in body["fields"] if r["path"] == "discord.token")
        assert record["sensitivity"] == "sensitive"
        assert record["configured"] is True
        # Null until the dedicated set/clear route exists — a link that 404s
        # is worse than no link.
        assert record["secret_route"] is None
        assert "super-secret-token-value" not in raw
        # Not even a length, which would narrow a brute force.
        assert record["desired"] == "•" * 8

    @pytest.mark.asyncio
    async def test_unset_secret_reports_not_configured(self):
        app, bot = _app(register_discord_config)
        bot.config.discord.token = ""
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/config/meta")).json()

        record = next(r for r in body["fields"] if r["path"] == "discord.token")
        assert record["configured"] is False
        assert record["desired"] == ""
        assert record["provenance"] == "unset"

    @pytest.mark.asyncio
    async def test_no_secret_value_appears_anywhere_in_the_payload(self):
        """Populates the LIST-shaped sections deliberately. A default config
        leaves api_tokens and webhook targets empty, so a scan over defaults
        passes while every real install serves its tokens."""
        app, bot = _app(register_discord_config)
        bot.config.discord.token = "tok-discord-leak"
        bot.config.web.api_token = "tok-web-leak"
        bot.config.audit.hmac_key = "tok-audit-leak"
        bot.config.slack.default_webhook_url = "tok-slack-webhook-url-leak"
        raw_config = bot.config.model_dump()
        raw_config["web"]["api_tokens"] = [
            {"name": "ops", "token": "tok-in-a-list-leak"}
        ]
        raw_config["outbound_webhooks"]["targets"] = [
            {"name": "a", "url": "https://x", "secret": "tok-target-leak"}
        ]
        bot.config = SimpleNamespace(model_dump=lambda: raw_config)

        async with TestClient(TestServer(app)) as c:
            raw = await (await c.get("/api/config/meta")).text()

        for secret in (
            "tok-discord-leak",
            "tok-web-leak",
            "tok-audit-leak",
            "tok-slack-webhook-url-leak",
            "tok-in-a-list-leak",
            "tok-target-leak",
        ):
            assert secret not in raw, f"{secret} reached the config page"

    @pytest.mark.asyncio
    async def test_restart_field_reports_the_boot_value_as_effective(self):
        """Changing a restart-mode setting must not read back as applied. The
        page's whole purpose is to stop claiming success for changes the
        running process has not adopted."""
        app, bot = _app(register_discord_config)
        bot.boot_config_snapshot = bot.config.model_dump()
        bot.config.sessions.max_history = bot.config.sessions.max_history + 7

        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/config/meta")).json()

        record = next(
            r for r in body["fields"] if r["path"] == "sessions.max_history"
        )
        assert record["apply_mode"] == "restart"
        assert record["desired"] == bot.config.sessions.max_history
        assert record["effective"] == bot.boot_config_snapshot["sessions"]["max_history"]
        assert record["pending_restart"] is True
        assert record["apply_state"] == "pending_restart"
        assert body["status"]["counts"]["pending_restart"] >= 1
        assert body["status"]["effective_revision"] != body["revision"]

    @pytest.mark.asyncio
    async def test_live_field_is_applied_the_moment_it_changes(self):
        app, bot = _app(register_discord_config)
        bot.boot_config_snapshot = bot.config.model_dump()
        bot.config.discord.respond_to_bots = not bot.config.discord.respond_to_bots

        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/config/meta")).json()

        record = next(
            r for r in body["fields"] if r["path"] == "discord.respond_to_bots"
        )
        assert record["apply_mode"] == "live_read"
        assert record["pending_restart"] is False
        assert record["effective"] == record["desired"]
        assert record["apply_state"] == "applied"


class TestRestartEndpoint:
    """POST /api/restart — the Config page's pending-restart flow.

    Restart-mode settings save but keep startup values; the page offers a
    clean restart instead of pointing the operator at a shell. The wizard's
    delayed-SIGTERM pattern lets the 202 flush before the process exits.
    """

    @pytest.mark.asyncio
    async def test_restarts_cleanly_and_returns_202(self):
        from src import restart as restart_mod

        app, bot = _app(register_quick_actions)
        bot.api_token_manager = None  # dev mode: no auth configured → gate allows
        bot.config.web.api_token = ""
        with patch.object(restart_mod, "request_restart") as req, \
             patch.object(restart_mod, "restart_requested", return_value=False), \
             patch("os.kill") as kill:
            async with TestClient(TestServer(app)) as c:
                resp = await c.post("/api/restart", json={})
                body = await resp.json()
            kill.assert_not_called()  # scheduled via call_later, not fired in-test
        assert resp.status == 202
        assert body["status"] == "restarting"
        req.assert_called_once_with()  # NO env overrides — first-boot-only power

    @pytest.mark.asyncio
    async def test_idempotent_while_a_restart_is_scheduled(self):
        from src import restart as restart_mod

        app, bot = _app(register_quick_actions)
        bot.api_token_manager = None
        bot.config.web.api_token = ""
        with patch.object(restart_mod, "request_restart") as req, \
             patch.object(restart_mod, "restart_requested", return_value=True):
            async with TestClient(TestServer(app)) as c:
                resp = await c.post("/api/restart", json={})
        assert resp.status == 202
        req.assert_not_called()  # already scheduled — do not double-arm

    def test_the_route_sits_behind_the_admin_gate(self):
        from src.health.server import _is_admin_only_path

        assert _is_admin_only_path("/api/restart")


    @pytest.mark.asyncio
    async def test_denied_without_admin_identity(self):
        """Auth configured + no identity on the request = the gate refuses,
        and nothing gets scheduled."""
        from src import restart as restart_mod

        app, bot = _app(register_quick_actions)
        bot.api_token_manager = None
        bot.config.web.api_token = "configured-token"
        with patch.object(restart_mod, "request_restart") as req:
            async with TestClient(TestServer(app)) as c:
                resp = await c.post("/api/restart", json={})
        assert resp.status == 403
        req.assert_not_called()


@pytest.mark.asyncio
async def test_generic_config_rejects_mcp_without_splitting_any_truth(_active_config):
    """Config Center is read-only for MCP; only /api/mcp owns mutation."""
    from ruamel.yaml import YAML

    from src.tools.mcp.manager import STATE_CONNECTED, MCPManager, ToolRecord, _ServerRuntime

    invalidations: list[str] = []
    manager = MCPManager(on_catalog_changed=lambda: invalidations.append("changed"))
    config = {
        "transport": "stdio",
        "command": "/bin/true",
        "enabled": True,
        "timeout_seconds": 120,
    }
    runtime = _ServerRuntime(config=config, generation=1, state=STATE_CONNECTED)
    record = ToolRecord("echo", "Echo", {"type": "object"})
    runtime.published = {"mcp_fake_echo": record}
    manager._servers = {"fake": runtime}  # noqa: SLF001
    manager._global_enabled = True  # noqa: SLF001
    manager._rebuild_published_index_locked()  # noqa: SLF001

    bot = _bot()
    bot.config.mcp.enabled = True
    bot.mcp_manager = manager
    app, bot = _app(register_discord_config, bot=bot)
    before_disk = _active_config.read_text()
    async with TestClient(TestServer(app)) as c:
        response = await c.put("/api/config", json={"mcp": {"enabled": False}})
        body = await response.json()

    assert response.status == 409
    assert body["error"] == "MCP settings are read-only on this route"
    assert _active_config.read_text() == before_disk
    assert YAML().load(_active_config.read_text()) == YAML().load(before_disk)
    assert bot.config.mcp.enabled is True
    assert manager.global_enabled is True
    assert manager.has_tool("mcp_fake_echo")
    assert manager.get_tool_definitions()[0]["name"] == "mcp_fake_echo"
    assert invalidations == []


@pytest.mark.asyncio
async def test_generic_config_rejects_disabled_tools_leaf(_active_config):
    """tools.disabled_tools has a transactional owner (the Tools API);
    the generic route must 409 without touching disk or runtime config —
    while OTHER tools leaves stay writable here."""
    from ruamel.yaml import YAML

    bot = _bot()
    app, bot = _app(register_discord_config, bot=bot)
    before_disk = _active_config.read_text()
    async with TestClient(TestServer(app)) as c:
        response = await c.put(
            "/api/config", json={"tools": {"disabled_tools": ["kubectl"]}}
        )
        body = await response.json()

    assert response.status == 409
    assert body["error"] == "tools.disabled_tools is read-only on this route"
    assert _active_config.read_text() == before_disk
    assert YAML().load(_active_config.read_text()) == YAML().load(before_disk)
    assert bot.config.tools.disabled_tools == []


@pytest.mark.asyncio
async def test_reload_returns_the_context_report(tmp_path):
    """/api/reload shares the slash command's immutable loader report."""
    from src.context.loader import ContextLoader

    (tmp_path / "architecture.md").write_text("# arch")
    app, bot = _app(register_quick_actions)
    bot.context_loader = ContextLoader(str(tmp_path))
    bot.context_loader.load()
    (tmp_path / "architecture.md").unlink()
    (tmp_path / "fresh.md").write_text("new")
    async with TestClient(TestServer(app)) as c:
        payload = await (await c.post("/api/reload")).json()
    assert payload["status"] == "reloaded"
    assert payload["context"]["loaded"] == ["fresh.md"]
    assert payload["context"]["removed"] == ["architecture.md"]
    assert payload["context"]["skipped"] == []
    bot.prompt_builder.rebuild_default.assert_called_once()
