"""Configuration, status and lifecycle admin route registrars (RFC-003 P5).

Carved verbatim from api/__init__.

Each ``register_*`` moves one section of the old monolith unchanged; the
composition root calls them at the sections' original positions, so the
route REGISTRATION ORDER (aiohttp path precedence) is exactly what the
parity contract pins.
"""

from __future__ import annotations

import asyncio
import time
from pathlib import Path

from aiohttp import web

from ...config.schema import Config
from ...odin_log import get_logger
from ...setup_wizard import (
    build_config,
    build_env,
    is_setup_needed,
    validate_token_format,
)
from ...version import get_version
from ..api_common import (
    _SENSITIVE_FIELDS,
    _contains_blocked_fields,
    _deep_merge,
    _redact_config,
    _sanitize_error,
    _write_config,
    _write_env_file,
    admin_gate,
)

log = get_logger("web.api")

def register_setup_wizard(routes: web.RouteTableDef, bot) -> None:
    """Setup wizard (first-boot, no auth required) (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Setup wizard (first-boot, no auth required)
    # ------------------------------------------------------------------

    @routes.get("/api/setup/status")
    async def setup_status(_request: web.Request) -> web.Response:
        """Check whether first-boot setup is needed."""
        config_path = Path("config.yml")
        env_path = Path(".env")
        needed = is_setup_needed(config_path, env_path)
        return web.json_response({"needed": needed})

    @routes.post("/api/setup/complete")
    async def setup_complete(request: web.Request) -> web.Response:
        """Receive wizard data, write config files, signal restart.

        Gated on ``is_setup_needed()`` — once setup is done, this
        endpoint returns ``409 Conflict`` instead of silently rewriting
        the operator's config. Odin's PR #18 self-audit finding #2:
        first-boot routes should stop being first-boot routes after
        first boot.
        """
        config_path = Path("config.yml")
        env_path = Path(".env")
        if not is_setup_needed(config_path, env_path):
            return web.json_response(
                {
                    "error": "setup already complete",
                    "detail": (
                        "The setup wizard endpoint only accepts writes on "
                        "first boot. Use the regular config management "
                        "endpoints to change operational settings after "
                        "initial setup."
                    ),
                },
                status=409,
            )
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)

        # Validate required fields
        discord_token = (data.get("discord_token") or "").strip()
        if not discord_token:
            return web.json_response(
                {"error": "discord_token is required"}, status=400
            )
        if not validate_token_format(discord_token):
            return web.json_response(
                {"error": "discord_token format is invalid"}, status=400
            )

        # Extract optional fields
        hosts: dict[str, dict[str, str]] = {}
        raw_hosts = data.get("hosts")
        if isinstance(raw_hosts, dict):
            for name, info in raw_hosts.items():
                if isinstance(info, dict) and info.get("address"):
                    hosts[str(name)] = {
                        "address": str(info["address"]),
                        "ssh_user": str(info.get("ssh_user", "root")),
                    }

        features: dict[str, bool] = {}
        raw_features = data.get("features")
        if isinstance(raw_features, dict):
            for key in ("browser", "comfyui"):
                if key in raw_features:
                    features[key] = bool(raw_features[key])

        web_api_token = str(data.get("web_api_token", "")).strip()
        claude_code_host = str(data.get("claude_code_host", "")).strip()
        timezone = str(data.get("timezone", "UTC")).strip() or "UTC"

        # Build config and env content
        cfg = build_config(
            timezone=timezone,
            hosts=hosts,
            features=features,
            web_api_token=web_api_token,
            claude_code_host=claude_code_host,
        )
        env_content = build_env(discord_token)

        # Write files
        config_path = Path("config.yml")
        env_path = Path(".env")
        try:
            await asyncio.to_thread(_write_config, config_path, cfg)
            await asyncio.to_thread(_write_env_file, env_path, env_content)
        except Exception as e:
            log.error("Setup wizard failed to write config: %s", e)
            return web.json_response(
                {"error": f"Failed to write config: {_sanitize_error(e)}"},
                status=500,
            )

        log.info("Setup wizard completed — config files written")

        # Schedule a delayed process exit to allow the HTTP response to be sent.
        # Under systemd (Restart=on-failure) or Docker (restart: unless-stopped),
        # the process will be restarted automatically with the new config.
        import os as _os
        import signal as _signal
        loop = asyncio.get_event_loop()
        loop.call_later(2.0, _os.kill, _os.getpid(), _signal.SIGTERM)

        return web.json_response({
            "status": "ok",
            "message": "Configuration saved. Odin is restarting...",
            "restart_scheduled": True,
        })


def register_status_info(routes: web.RouteTableDef, bot) -> None:
    """Status & info (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Status & info
    # ------------------------------------------------------------------

    @routes.get("/api/status")
    async def get_status(_request: web.Request) -> web.Response:
        guilds = [
            {"id": str(g.id), "name": g.name, "member_count": g.member_count or 0}
            for g in bot.guilds
        ]
        user_count = sum(g.member_count or 0 for g in bot.guilds)
        tools = bot.tool_catalog.merged_definitions()
        uptime = time.monotonic() - bot.start_time if hasattr(bot, "_start_time") else 0

        # Agent counts
        try:
            agent_agents = bot.agent_manager._agents
            if not isinstance(agent_agents, dict):
                raise AttributeError
            agent_count = len(agent_agents)
            agent_running = sum(
                1 for a in agent_agents.values() if a.status == "running"
            )
        except (AttributeError, TypeError):
            agent_count = 0
            agent_running = 0

        # Process counts
        try:
            proc_procs = bot.tool_executor._process_registry._processes
            if not isinstance(proc_procs, dict):
                raise AttributeError
            process_count = len(proc_procs)
            process_running = sum(
                1 for p in proc_procs.values() if p.status == "running"
            )
        except (AttributeError, TypeError):
            process_count = 0
            process_running = 0

        # Monitoring status
        _default_mon = {
            "enabled": False, "checks": 0, "running": 0, "active_alerts": 0,
        }
        try:
            watcher = bot.infra_watcher
            if watcher is None:
                raise AttributeError
            result = watcher.get_status()
            monitoring = result if isinstance(result, dict) else _default_mon
        except (AttributeError, TypeError):
            monitoring = _default_mon

        return web.json_response({
            "version": get_version(),
            "status": "online" if bot.is_ready() else "starting",
            "uptime_seconds": round(uptime, 1),
            "guilds": guilds,
            "guild_count": len(guilds),
            "user_count": user_count,
            "tool_count": len(tools),
            "skill_count": len(bot.skill_manager.list_skills()),
            "session_count": bot.sessions.count(),
            "loop_count": bot.loop_manager.active_count,
            "schedule_count": len(bot.scheduler.list_all()),
            "schedule_failing": sum(
                1 for s in bot.scheduler.list_all() if s.get("consecutive_failures", 0) > 0
            ),
            "schedule_paused": sum(1 for s in bot.scheduler.list_all() if s.get("paused")),
            "agent_count": agent_count,
            "agent_running": agent_running,
            "process_count": process_count,
            "process_running": process_running,
            "monitoring": monitoring,
        })


def register_discord_config(routes: web.RouteTableDef, bot) -> None:
    """Discord per-guild/per-channel config (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Discord per-guild/per-channel config
    # ------------------------------------------------------------------

    @routes.get("/api/discord/guilds")
    async def discord_guilds(_request: web.Request) -> web.Response:
        result = []
        cc = bot.channel_config
        for g in bot.guilds:
            gid = str(g.id)
            guild_cfg = cc.get_guild_config(gid)
            channels = []
            for ch in sorted(g.text_channels, key=lambda c: c.position):
                cid = str(ch.id)
                ch_cfg = cc.get_channel_config(cid)
                effective_mention = cc.should_require_mention(
                    gid, cid, bot.config.discord.require_mention,
                )
                effective_enabled = cc.is_enabled(gid, cid)
                effective_bots = cc.should_respond_to_bots(
                    gid, cid, bot.config.discord.respond_to_bots,
                )
                channels.append({
                    "id": cid,
                    "name": ch.name,
                    "category": ch.category.name if ch.category else None,
                    "config": ch_cfg,
                    "effective": {
                        "enabled": effective_enabled,
                        "require_mention": effective_mention,
                        "respond_to_bots": effective_bots,
                    },
                })
            result.append({
                "id": gid,
                "name": g.name,
                "member_count": g.member_count or 0,
                "icon_url": str(g.icon.url) if g.icon else None,
                "config": guild_cfg,
                "channels": channels,
            })
        return web.json_response(result)

    @routes.get("/api/discord/members")
    async def discord_members(_request: web.Request) -> web.Response:
        seen = {}
        for g in bot.guilds:
            for m in g.members:
                uid = str(m.id)
                if uid not in seen:
                    seen[uid] = {
                        "id": uid,
                        "username": m.name,
                        "display_name": m.display_name,
                        "avatar_url": str(m.display_avatar.url) if m.display_avatar else None,
                        "bot": m.bot,
                    }
        members = sorted(seen.values(), key=lambda x: x["display_name"].lower())
        return web.json_response(members)

    @routes.put("/api/discord/guild/{guild_id}/config")
    async def update_guild_config(request: web.Request) -> web.Response:
        gid = request.match_info["guild_id"]
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)
        cfg = bot.channel_config.set_guild_config(
            gid,
            enabled=data.get("enabled"),
            require_mention=data.get("require_mention"),
            respond_to_bots=data.get("respond_to_bots"),
        )
        return web.json_response({"guild_id": gid, "config": cfg})

    @routes.put("/api/discord/channel/{channel_id}/config")
    async def update_channel_config(request: web.Request) -> web.Response:
        cid = request.match_info["channel_id"]
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)
        cfg = bot.channel_config.set_channel_config(
            cid,
            enabled=data.get("enabled"),
            require_mention=data.get("require_mention"),
            respond_to_bots=data.get("respond_to_bots"),
            clear=data.get("clear", False),
        )
        return web.json_response({"channel_id": cid, "config": cfg})

    @routes.get("/api/health/components")
    async def get_health_components(_request: web.Request) -> web.Response:
        from ...health.checker import check_all
        return web.json_response(check_all(bot))

    @routes.get("/api/resource-usage")
    async def get_resource_usage(_request: web.Request) -> web.Response:
        from ...monitoring.resource_usage import collect_all
        return web.json_response(collect_all(bot))

    @routes.get("/api/tool-streams")
    async def get_tool_streams(_request: web.Request) -> web.Response:
        executor = getattr(bot, "tool_executor", None)
        streamer = getattr(executor, "output_streamer", None) if executor else None
        if streamer is None:
            return web.json_response({"enabled": False, "streams": []})
        return web.json_response({
            "enabled": True,
            "enabled_tools": sorted(streamer.enabled_tools),
            "active_streams": streamer.get_active_streams(),
        })

    @routes.get("/api/config")
    async def get_config(_request: web.Request) -> web.Response:
        raw = bot.config.model_dump()
        return web.json_response(_redact_config(raw))

    @routes.put("/api/config")
    async def update_config(request: web.Request) -> web.Response:
        try:
            updates = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)

        if not isinstance(updates, dict):
            return web.json_response({"error": "expected JSON object"}, status=400)

        # Block sensitive field updates
        if _contains_blocked_fields(updates, _SENSITIVE_FIELDS):
            return web.json_response(
                {"error": "Cannot update sensitive fields via API"}, status=403
            )

        # Snapshot before state for diff
        before_config = _redact_config(bot.config.model_dump())

        # Deep merge updates into current config
        current = bot.config.model_dump()
        _deep_merge(current, updates)

        # Validate by reconstructing the config model
        try:
            new_config = Config(**current)
        except Exception as e:
            return web.json_response({"error": f"Invalid config: {e}"}, status=400)

        # Apply to bot
        bot.config = new_config

        # Write to disk
        config_path = Path("config.yml")
        if config_path.exists():
            try:
                await asyncio.to_thread(_write_config, config_path, current)
            except Exception:
                log.warning(
                    "Config applied in memory but failed to persist to %s",
                    config_path,
                    exc_info=True,
                )

        # Compute config diff and record in audit log
        after_config = _redact_config(new_config.model_dump())
        try:
            from ...audit.diff_tracker import compute_dict_diff
            config_diff = compute_dict_diff(before_config, after_config, label="config.yml")
        except Exception:
            config_diff = None

        # Store diff on request for the audit middleware
        request["_config_diff"] = config_diff

        return web.json_response(after_config)


def register_quick_actions(routes: web.RouteTableDef, bot) -> None:
    """Quick actions (verbatim from the monolith)."""
    _require_admin = admin_gate(bot)
    # ------------------------------------------------------------------
    # Quick actions
    # ------------------------------------------------------------------

    @routes.post("/api/sessions/clear-all")
    async def clear_all_sessions(request: web.Request) -> web.Response:
        denied = _require_admin(request)
        if denied:
            return denied
        count = bot.sessions.clear_all()
        return web.json_response({"status": "cleared", "count": count})

    @routes.post("/api/reload")
    async def reload_config(_request: web.Request) -> web.Response:
        bot.context_loader.reload()
        bot.prompt_builder.invalidate()
        bot.tool_catalog.invalidate()
        bot.prompt_builder.rebuild_default()
        return web.json_response({"status": "reloaded"})


def register_personality(routes: web.RouteTableDef, bot) -> None:
    """Personality (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Personality
    # ------------------------------------------------------------------

    @routes.get("/api/personality")
    async def get_personality(_request: web.Request) -> web.Response:
        from src.llm.system_prompt import PERSONALITY_PRESETS
        p = bot.config.personality if hasattr(bot.config, "personality") else None
        user_presets = {k: {"name": v.name, "identity": v.identity, "voice": v.voice}
                       for k, v in (p.user_presets.items() if p else {})}
        all_presets = {**{k: v for k, v in PERSONALITY_PRESETS.items()}, **user_presets}
        return web.json_response({
            "preset": p.preset if p else "odin",
            "custom_name": p.custom_name if p else "",
            "custom_identity": p.custom_identity if p else "",
            "custom_voice": p.custom_voice if p else "",
            "presets": all_presets,
            "builtin_presets": list(PERSONALITY_PRESETS.keys()),
            "user_presets": list(user_presets.keys()),
        })

    @routes.put("/api/personality")
    async def update_personality(request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        preset = data.get("preset", "odin")
        custom_name = data.get("custom_name", "")
        custom_identity = data.get("custom_identity", "")
        custom_voice = data.get("custom_voice", "")
        from src.config.schema import PersonalityConfig
        existing_user_presets = (
            bot.config.personality.user_presets if hasattr(bot.config, "personality") else {}
        )
        bot.config.personality = PersonalityConfig(
            preset=preset,
            custom_name=custom_name,
            custom_identity=custom_identity,
            custom_voice=custom_voice,
            user_presets=existing_user_presets,
        )
        from src.llm.system_prompt import register_user_presets
        register_user_presets(
            {
                k: {"name": v.name, "identity": v.identity, "voice": v.voice}
                for k, v in existing_user_presets.items()
            }
        )
        current = bot.config.model_dump()
        config_path = getattr(request.app, "_config_path", "config.yml")
        await asyncio.to_thread(_write_config, config_path, current)
        bot.prompt_builder.invalidate()
        bot.tool_catalog.invalidate()
        bot.prompt_builder.rebuild_default()
        return web.json_response({"status": "updated", "preset": preset})

    @routes.post("/api/personality/presets")
    async def save_preset(request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        import re as _re
        name = (data.get("name") or "").strip().lower().replace(" ", "_")
        if not name:
            return web.json_response({"error": "name is required"}, status=400)
        if not _re.fullmatch(r"[a-z0-9_-]+", name):
            return web.json_response(
                {
                    "error": (
                        "preset name must contain only lowercase letters, "
                        "numbers, hyphens, and underscores"
                    )
                },
                status=400,
            )
        from src.llm.system_prompt import PERSONALITY_PRESETS
        if name in PERSONALITY_PRESETS:
            return web.json_response(
                {"error": f"cannot overwrite built-in preset '{name}'"}, status=400
            )
        display_name = data.get("display_name", name)
        identity = data.get("identity", "")
        voice = data.get("voice", "")
        if not identity and not voice:
            return web.json_response({"error": "identity or voice is required"}, status=400)
        from src.config.schema import PersonalityPreset
        bot.config.personality.user_presets[name] = PersonalityPreset(
            name=display_name, identity=identity, voice=voice
        )
        from src.llm.system_prompt import register_user_presets
        register_user_presets(
            {
                k: {"name": v.name, "identity": v.identity, "voice": v.voice}
                for k, v in bot.config.personality.user_presets.items()
            }
        )
        current = bot.config.model_dump()
        config_path = getattr(request.app, "_config_path", "config.yml")
        await asyncio.to_thread(_write_config, config_path, current)
        return web.json_response({"status": "saved", "name": name})

    @routes.delete("/api/personality/presets/{name}")
    async def delete_preset(request: web.Request) -> web.Response:
        name = request.match_info["name"]
        from src.llm.system_prompt import PERSONALITY_PRESETS
        if name in PERSONALITY_PRESETS:
            return web.json_response(
                {"error": f"cannot delete built-in preset '{name}'"}, status=400
            )
        if name not in bot.config.personality.user_presets:
            return web.json_response({"error": "preset not found"}, status=404)
        del bot.config.personality.user_presets[name]
        from src.llm.system_prompt import register_user_presets
        register_user_presets(
            {
                k: {"name": v.name, "identity": v.identity, "voice": v.voice}
                for k, v in bot.config.personality.user_presets.items()
            }
        )
        if bot.config.personality.preset == name:
            bot.config.personality.preset = "odin"
            bot.prompt_builder.invalidate()
            bot.tool_catalog.invalidate()
            bot.prompt_builder.rebuild_default()
        current = bot.config.model_dump()
        config_path = getattr(request.app, "_config_path", "config.yml")
        await asyncio.to_thread(_write_config, config_path, current)
        return web.json_response({"status": "deleted", "name": name})


def register_startup_diagnostics(routes: web.RouteTableDef, bot) -> None:
    """Startup diagnostics (boot-time checks) (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Startup diagnostics (boot-time checks)
    # ------------------------------------------------------------------

    @routes.get("/api/startup/diagnostics")
    async def startup_diagnostics(_request: web.Request) -> web.Response:
        report = getattr(bot, "startup_report", None)
        if report is None:
            return web.json_response({"error": "startup diagnostics not available"}, status=503)
        return web.json_response(report.to_dict())


