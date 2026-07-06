"""REST API for Odin web management UI.

All endpoints are prefixed with /api/ and require Bearer token auth
(unless api_token is empty in config, which disables auth for dev mode).
"""
from __future__ import annotations

import asyncio
import time
import uuid
from pathlib import Path
from typing import TYPE_CHECKING

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

# Shared helpers live in api_common (RFC-003 P1) — re-imported so existing
# spellings (`from src.web.api import _redact_config`, internal uses) and
# patch targets keep working through the carve.
from ..api_common import (  # noqa: F401 — re-exports
    _MAX_CODE_LEN,
    _MAX_CONTENT_LEN,
    _MAX_DESCRIPTION_LEN,
    _MAX_GOAL_LEN,
    _MAX_NAME_LEN,
    _SENSITIVE_FIELDS,
    _SENSITIVE_KEY_SUBSTRINGS,
    _SESSION_ID_RE,
    _codex_creds_lock,
    _contains_blocked_fields,
    _deep_merge,
    _is_sensitive_key,
    _redact_config,
    _safe_filename,
    _safe_int_param,
    _sanitize_error,
    _scoped_chat_channel,
    _validate_string,
    _write_config,
    _write_env_file,
    admin_gate,
)
from ..chat import MAX_CHAT_CONTENT_LEN, process_web_chat
from .knowledge_mem import (
    register_knowledge,
    register_learned_context,
    register_memory_notes,
)
from .llm_admin import (  # noqa: E501
    register_codex_oauth,
    register_connection_pools,
    register_kimi_admin,
    register_llm_provider,
    register_ollama_admin,
    register_provider_config,
)
from .observability import (
    register_affordances,
    register_aggregates,
    register_audit_log,
    register_branch_freshness,
    register_bulkheads,
    register_compression_stats,
    register_log_search,
    register_recovery_stats,
    register_risk_classification,
    register_routing_stats,
    register_tools_meta,
    register_usage_cost,
    register_validation_stats,
)
from .schedules_api import register_schedules
from .security import (
    register_api_tokens,
    register_auth,
    register_host_access,
    register_permissions_rbac,
)
from .skills_api import register_skills

if TYPE_CHECKING:
    from ...discord.client import OdinBot

log = get_logger("web.api")

def create_api_routes(bot: OdinBot) -> web.RouteTableDef:
    """Create all API route handlers bound to the given bot instance."""
    _require_admin = admin_gate(bot)
    routes = web.RouteTableDef()

    register_auth(routes, bot)

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
            for key in ("browser", "voice", "comfyui"):
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

    # ------------------------------------------------------------------
    # Self-Update
    # ------------------------------------------------------------------

    @routes.get("/api/update/check")
    async def check_update(_request: web.Request) -> web.Response:
        from src.version import get_version
        current = get_version()
        try:
            import subprocess
            result = subprocess.run(
                ["gh", "api", "repos/Calmingstorm/Odin/releases/latest", "--jq", ".tag_name,.body"],
                capture_output=True, text=True, timeout=15,
            )
            if result.returncode != 0:
                return web.json_response(
                    {"current": current, "error": "Failed to check GitHub"}, status=502
                )
            lines = result.stdout.strip().split("\n", 1)
            latest_tag = lines[0].strip()
            changelog = lines[1].strip() if len(lines) > 1 else ""
            latest_version = latest_tag.lstrip("v")
            update_available = latest_version != current and latest_tag != f"v{current}"
            return web.json_response({
                "current": current,
                "latest": latest_tag,
                "update_available": update_available,
                "changelog": changelog[:2000],
            })
        except Exception as e:
            return web.json_response({"current": current, "error": str(e)}, status=502)

    @routes.post("/api/update/apply")
    async def apply_update(request: web.Request) -> web.Response:
        import os
        import re as _re
        import shutil
        import subprocess
        try:
            data = await request.json()
        except Exception:
            data = {}
        target = data.get("version", "latest")
        base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

        # Resolve "latest" to actual release tag
        if target == "latest":
            r = subprocess.run(
                ["gh", "api", "repos/Calmingstorm/Odin/releases/latest", "--jq", ".tag_name"],
                capture_output=True, text=True, timeout=15,
            )
            if r.returncode != 0 or not r.stdout.strip():
                return web.json_response(
                    {"error": "Failed to resolve latest release tag"}, status=502
                )
            target = r.stdout.strip()

        # Validate tag format
        if not _re.fullmatch(r"v?\d+\.\d+\.\d+", target):
            return web.json_response({"error": f"Invalid version format: {target}"}, status=400)

        try:
            # Backup user-modified config files before updating
            _preserve = {"config.yml", ".env"}
            _backups: dict[str, bytes] = {}
            for fname in _preserve:
                fpath = os.path.join(base, fname)
                if os.path.exists(fpath):
                    _backups[fname] = open(fpath, "rb").read()

            # Check for unexpected dirty files (anything besides config.yml/.env)
            r = subprocess.run(
                ["git", "-C", base, "diff", "--name-only", "HEAD"],
                capture_output=True, text=True, timeout=10,
            )
            dirty = [
                f for f in r.stdout.strip().splitlines() if f.strip() and f.strip() not in _preserve
            ]
            if dirty:
                return web.json_response({
                    "error": (
                        f"Worktree has unexpected modifications ({', '.join(dirty[:5])}). "
                        "Only config.yml and .env are preserved automatically."
                    ),
                }, status=409)

            # Reset only the preserved config files for clean pull
            for fname in _preserve:
                subprocess.run(
                    ["git", "-C", base, "checkout", "--", fname],
                    capture_output=True, timeout=10,
                )

            # Record current ref for potential rollback
            r = subprocess.run(
                ["git", "-C", base, "rev-parse", "HEAD"],
                capture_output=True, text=True, timeout=5,
            )
            prev_ref = r.stdout.strip() if r.returncode == 0 else None

            # Fetch and update master to the release tag's commit
            steps = [
                (["git", "-C", base, "fetch", "--tags", "origin"], "fetch"),
                (["git", "-C", base, "checkout", "master"], "checkout master"),
                (["git", "-C", base, "merge", "--ff-only", target], "fast-forward to release tag"),
            ]
            def _rollback(reason: str) -> web.Response:
                if prev_ref:
                    subprocess.run(
                    ["git", "-C", base, "checkout", "master"], capture_output=True, timeout=10
                )
                    subprocess.run(
                    ["git", "-C", base, "reset", "--hard", prev_ref],
                    capture_output=True,
                    timeout=10,
                )
                # Restore config backups even on failure
                for fname, data in _backups.items():
                    open(os.path.join(base, fname), "wb").write(data)
                return web.json_response({"error": reason}, status=500)

            for cmd, label in steps:
                r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
                if r.returncode != 0:
                    return _rollback(f"{label} failed: {r.stderr.strip()}")

            # Restore user config files after update
            for fname, data in _backups.items():
                open(os.path.join(base, fname), "wb").write(data)

            # Install/update dependencies
            venv_pip = os.path.join(base, ".venv", "bin", "pip")
            if os.path.exists(venv_pip):
                r = subprocess.run(
                    [venv_pip, "install", "-q", base], capture_output=True, text=True, timeout=120
                )
                if r.returncode != 0:
                    return _rollback(f"dependency install failed: {r.stderr.strip()}")

            # Nuke pycache
            for root, dirs, _files in os.walk(base):
                for d in dirs:
                    if d == "__pycache__":
                        shutil.rmtree(os.path.join(root, d), ignore_errors=True)

            # Graceful shutdown — systemd Restart=always will restart with new code
            asyncio.get_event_loop().call_later(2, lambda: os.kill(os.getpid(), 15))
            return web.json_response({
                "status": "updating",
                "version": target,
                "previous": prev_ref[:12] if prev_ref else None,
                "message": f"Updated master to {target}. Restarting in 2 seconds...",
            })
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)

    @routes.post("/api/loops/stop-all")
    async def stop_all_loops(_request: web.Request) -> web.Response:
        result = bot.loop_manager.stop_loop("all")
        return web.json_response({"result": result})

    # ------------------------------------------------------------------
    # Chat
    # ------------------------------------------------------------------

    @routes.post("/api/chat")
    async def chat(request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)

        content = (data.get("content") or "").strip()
        if not content:
            return web.json_response({"error": "content is required"}, status=400)
        if len(content) > MAX_CHAT_CONTENT_LEN:
            return web.json_response(
                {"error": f"content exceeds {MAX_CHAT_CONTENT_LEN} chars"}, status=400
            )

        identity = getattr(request, "_api_identity", None)
        user_id = identity.user_id if identity else "web-user"
        username = identity.username if identity else "WebUser"
        tier = identity.tier if identity else None
        token_tools = identity.allowed_tools if identity and identity.allowed_tools else None
        token_hosts = (
            identity.allowed_hosts
            if identity and isinstance(getattr(identity, "allowed_hosts", None), list)
            else None
        )
        token_default_host = getattr(identity, "default_host", "") if identity else ""

        # Optional caller-supplied session id for multi-request chat continuity.
        # Omitted -> historical behavior (one history per identity). Supplied -> validated
        # and namespaced UNDER the authenticated identity. It only controls conversation
        # continuity + lock serialization; permissions, tier, tools/hosts, memory, and
        # audit identity all stay keyed to the authenticated token, never the session id.
        channel_id = user_id
        session_id = data.get("session_id")
        if session_id is not None:
            session_id = session_id.strip() if isinstance(session_id, str) else ""
            if not _SESSION_ID_RE.match(session_id):
                return web.json_response(
                    {"error": "invalid session_id (expected 1-128 chars of [A-Za-z0-9._:-])"},
                    status=400,
                )
            channel_id = _scoped_chat_channel(user_id, session_id)

        result = await process_web_chat(
            bot, content, channel_id,
            user_id=user_id, username=username,
            allowed_tools=token_tools, tier=tier,
            token_allowed_hosts=token_hosts,
            token_default_host=token_default_host,
        )

        # Scoped-session locks are cached like the default per-identity lock. We do NOT
        # clean them up per-request: that races a waiter and can split one session across
        # two lock objects (concurrent _do_process_web_chat). Bounding _web_channel_locks
        # via a TTL/max-size sweep is a deliberate follow-up; correct serialization first.
        status = 200 if not result["is_error"] else 502
        resp = {
            "response": result["response"],
            "tools_used": result["tools_used"],
            "is_error": result["is_error"],
        }
        if session_id is not None:
            resp["session_id"] = session_id
        files = result.get("files", [])
        if files:
            resp["files"] = files
        return web.json_response(resp, status=status)

    @routes.post("/api/execute")
    async def execute(request: web.Request) -> web.Response:
        """Stateless prompt execution — no session history, no persistence.

        Designed for CLI tools, scripts, CI/CD pipelines, and automation.
        Each request gets a unique ephemeral channel_id that is discarded
        after the response is returned.
        """
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)

        content = (data.get("prompt") or data.get("content") or "").strip()
        if not content:
            return web.json_response({"error": "prompt is required"}, status=400)
        if len(content) > MAX_CHAT_CONTENT_LEN:
            return web.json_response(
                {"error": f"prompt exceeds {MAX_CHAT_CONTENT_LEN} chars"}, status=400
            )

        channel_id = f"api-{uuid.uuid4().hex[:12]}"

        # Resolve identity from middleware or fallback
        identity = getattr(request, "_api_identity", None)
        if identity is None:
            auth_header = request.headers.get("Authorization", "")
            bearer_token = auth_header[7:] if auth_header.startswith("Bearer ") else ""
            tm = getattr(bot, "api_token_manager", None)
            identity = tm.resolve(bearer_token) if tm else None
            if identity is None:
                identity = bot.config.web.resolve_api_identity(bearer_token)
        user_id = identity.user_id if identity else "api-user"
        username = identity.username if identity else "API"
        token_tools = identity.allowed_tools if identity and identity.allowed_tools else None
        tier = identity.tier if identity else None
        token_hosts = (
            identity.allowed_hosts
            if identity and isinstance(getattr(identity, "allowed_hosts", None), list)
            else None
        )
        token_default_host = getattr(identity, "default_host", "") if identity else ""

        result = await process_web_chat(
            bot, content, channel_id,
            user_id=user_id, username=username,
            allowed_tools=token_tools, tier=tier,
            token_allowed_hosts=token_hosts,
            token_default_host=token_default_host,
            persist_channel_lock=False,  # ephemeral per-request channel — no lock to cache or leak
        )

        bot.sessions.reset(channel_id)

        status = 200 if not result["is_error"] else 502
        resp = {
            "response": result["response"],
            "tools_used": result["tools_used"],
            "is_error": result["is_error"],
            "source": "web_api",
        }
        if identity and identity.label:
            resp["token_label"] = identity.label
        files = result.get("files", [])
        if files:
            resp["files"] = files
        return web.json_response(resp, status=status)

    # ------------------------------------------------------------------
    # Sessions
    # ------------------------------------------------------------------

    @routes.get("/api/sessions")
    async def list_sessions(request: web.Request) -> web.Response:
        identity = getattr(request, "_api_identity", None)
        is_admin = not identity or getattr(identity, "tier", "admin") == "admin"
        own_id = identity.user_id if identity else None
        sessions = []
        for cid, session in bot.sessions.items_snapshot():
            if not is_admin and cid != own_id and not cid.startswith(f"web:{own_id}:session:"):
                continue
            # Build preview from last 2 messages
            preview = []
            for m in session.messages[-2:]:
                text = m.content or ""
                if len(text) > 120:
                    text = text[:120] + "..."
                preview.append({"role": m.role, "content": text})
            # Determine source type
            source = "web" if cid.startswith(("web-", "web:")) else "discord"
            sessions.append({
                "channel_id": cid,
                "message_count": len(session.messages),
                "estimated_tokens": session.estimated_tokens,
                "last_active": session.last_active,
                "created_at": session.created_at,
                "has_summary": bool(session.summary),
                "preview": preview,
                "source": source,
                "last_user_id": session.last_user_id,
            })
        sessions.sort(key=lambda s: s["last_active"], reverse=True)
        return web.json_response(sessions)

    @routes.get("/api/sessions/token-usage")
    async def session_token_usage(request: web.Request) -> web.Response:
        denied = _require_admin(request)
        if denied:
            return denied
        usage = bot.sessions.get_session_token_usage()
        return web.json_response(usage)

    @routes.get("/api/sessions/activity")
    async def session_activity(request: web.Request) -> web.Response:
        denied = _require_admin(request)
        if denied:
            return denied
        activity = bot.sessions.get_activity_metrics()
        return web.json_response(activity)

    @routes.get("/api/sessions/search")
    async def search_sessions(request: web.Request) -> web.Response:
        query = request.query.get("q", "").strip()
        if not query:
            return web.json_response({"error": "q parameter required"}, status=400)
        identity = getattr(request, "_api_identity", None)
        is_admin = not identity or getattr(identity, "tier", "admin") == "admin"
        limit = _safe_int_param(request, "limit", 20, hi=50)
        channel_id = request.query.get("channel_id") or None
        if not is_admin:
            channel_id = identity.user_id
        user_id = request.query.get("user_id") or None
        after: float | None = None
        before: float | None = None
        if request.query.get("after"):
            try:
                after = float(request.query["after"])
            except ValueError:
                pass
        if request.query.get("before"):
            try:
                before = float(request.query["before"])
            except ValueError:
                pass
        results = await bot.sessions.search_history(
            query, limit=limit, channel_id=channel_id,
            user_id=user_id, after=after, before=before,
        )
        return web.json_response({"query": query, "results": results, "count": len(results)})

    def _check_session_access(request: web.Request, channel_id: str) -> web.Response | None:
        """Non-admin identities can only access their own session."""
        identity = getattr(request, "_api_identity", None)
        if not identity:
            return None
        if getattr(identity, "tier", "admin") == "admin":
            return None
        own_prefix = f"web:{identity.user_id}:session:"
        if identity.user_id != channel_id and not channel_id.startswith(own_prefix):
            return web.json_response({"error": "access denied"}, status=403)
        return None

    @routes.get("/api/sessions/{channel_id}")
    async def get_session(request: web.Request) -> web.Response:
        cid = request.match_info["channel_id"]
        denied = _check_session_access(request, cid)
        if denied:
            return denied
        session = bot.sessions.get(cid)
        if not session:
            return web.json_response({"error": "session not found"}, status=404)
        messages = [
            {
                "role": m.role,
                "content": m.content,
                "timestamp": m.timestamp,
                "user_id": m.user_id,
            }
            for m in session.messages
        ]
        return web.json_response({
            "channel_id": cid,
            "messages": messages,
            "summary": session.summary,
            "created_at": session.created_at,
            "last_active": session.last_active,
            "estimated_tokens": session.estimated_tokens,
            "token_budget": bot.sessions.token_budget,
        })

    @routes.get("/api/sessions/{channel_id}/export")
    async def export_session(request: web.Request) -> web.Response:
        cid = request.match_info["channel_id"]
        denied = _check_session_access(request, cid)
        if denied:
            return denied
        session = bot.sessions.get(cid)
        if not session:
            return web.json_response({"error": "session not found"}, status=404)
        fmt = request.query.get("format", "json")
        messages = [
            {
                "role": m.role,
                "content": m.content,
                "timestamp": m.timestamp,
                "user_id": m.user_id,
            }
            for m in session.messages
        ]
        safe_cid = _safe_filename(cid)
        if fmt == "text":
            lines = []
            if session.summary:
                lines.append(f"=== Summary ===\n{session.summary}\n")
            lines.append(f"=== Messages ({len(messages)}) ===")
            for m in messages:
                ts = (
                    time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(m["timestamp"]))
                    if m["timestamp"]
                    else "?"
                )
                role = m["role"].upper()
                uid = f" ({m['user_id']})" if m.get("user_id") else ""
                lines.append(f"\n[{ts}] {role}{uid}:\n{m['content']}")
            body = "\n".join(lines)
            return web.Response(
                text=body,
                content_type="text/plain",
                headers={"Content-Disposition": f'attachment; filename="session-{safe_cid}.txt"'},
            )
        # Default: JSON
        export = {
            "channel_id": cid,
            "messages": messages,
            "summary": session.summary,
            "created_at": session.created_at,
            "last_active": session.last_active,
            "exported_at": time.time(),
        }
        return web.json_response(
            export,
            headers={"Content-Disposition": f'attachment; filename="session-{safe_cid}.json"'},
        )

    @routes.delete("/api/sessions/{channel_id}")
    async def delete_session(request: web.Request) -> web.Response:
        cid = request.match_info["channel_id"]
        denied = _check_session_access(request, cid)
        if denied:
            return denied
        if not bot.sessions.exists(cid):
            return web.json_response({"error": "session not found"}, status=404)
        bot.sessions.reset(cid)
        return web.json_response({"status": "cleared"})

    @routes.post("/api/sessions/clear-bulk")
    async def clear_bulk_sessions(request: web.Request) -> web.Response:
        denied = _require_admin(request)
        if denied:
            return denied
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        channel_ids = data.get("channel_ids", [])
        if not isinstance(channel_ids, list) or not channel_ids:
            return web.json_response(
                {"error": "channel_ids must be a non-empty list"}, status=400
            )
        cleared = bot.sessions.reset_many(channel_ids)
        return web.json_response({"status": "cleared", "count": cleared})

    register_tools_meta(routes, bot)

    register_bulkheads(routes, bot)

    register_connection_pools(routes, bot)

    register_usage_cost(routes, bot)

    register_aggregates(routes, bot)

    # ------------------------------------------------------------------
    # Trajectories
    # ------------------------------------------------------------------

    @routes.get("/api/trajectories")
    async def list_trajectory_files(_request: web.Request) -> web.Response:
        saver = getattr(bot, "trajectory_saver", None)
        if saver is None:
            return web.json_response({"error": "trajectory saving not available"}, status=503)
        files = await saver.list_files()
        return web.json_response({"files": files, "count": saver.count})

    @routes.get("/api/trajectories/{filename}")
    async def get_trajectory_file(request: web.Request) -> web.Response:
        saver = getattr(bot, "trajectory_saver", None)
        if saver is None:
            return web.json_response({"error": "trajectory saving not available"}, status=503)
        filename = request.match_info["filename"]
        if (
            not filename.endswith(".jsonl")
            or "/" in filename
            or "\\" in filename
            or ".." in filename
        ):
            return web.json_response({"error": "invalid filename"}, status=400)
        safe_path = (saver.directory / filename).resolve()
        if not safe_path.is_relative_to(saver.directory.resolve()):
            return web.json_response({"error": "invalid filename"}, status=400)
        limit = _safe_int_param(request, "limit", 100, hi=500)
        entries = await saver.read_file(filename, limit=limit)
        return web.json_response({"entries": entries, "count": len(entries)})

    @routes.get("/api/trajectories/message/{message_id}")
    async def get_trajectory_by_message(request: web.Request) -> web.Response:
        saver = getattr(bot, "trajectory_saver", None)
        if saver is None:
            return web.json_response({"error": "trajectory saving not available"}, status=503)
        message_id = request.match_info["message_id"]
        entry = await saver.find_by_message_id(message_id)
        if entry is None:
            return web.json_response({"error": "trajectory not found"}, status=404)
        return web.json_response({"entry": entry})

    @routes.get("/api/trajectories/search/query")
    async def search_trajectories(request: web.Request) -> web.Response:
        saver = getattr(bot, "trajectory_saver", None)
        if saver is None:
            return web.json_response({"error": "trajectory saving not available"}, status=503)
        channel_id = request.query.get("channel_id")
        user_id = request.query.get("user_id")
        tool_name = request.query.get("tool_name")
        errors_only = request.query.get("errors_only", "").lower() in ("1", "true")
        limit = _safe_int_param(request, "limit", 50, hi=500)
        results = await saver.search(
            channel_id=channel_id,
            user_id=user_id,
            tool_name=tool_name,
            errors_only=errors_only,
            limit=limit,
        )
        return web.json_response({"results": results, "count": len(results)})

    register_skills(routes, bot)

    # ------------------------------------------------------------------
    # MCP servers
    # ------------------------------------------------------------------

    @routes.get("/api/mcp/servers")
    async def list_mcp_servers(_request: web.Request) -> web.Response:
        mgr = getattr(bot, "mcp_manager", None)
        if mgr is None:
            return web.json_response({"error": "MCP not enabled"}, status=503)
        return web.json_response({"servers": mgr.get_status()})

    @routes.get("/api/mcp/servers/{name}/tools")
    async def list_mcp_server_tools(request: web.Request) -> web.Response:
        mgr = getattr(bot, "mcp_manager", None)
        if mgr is None:
            return web.json_response({"error": "MCP not enabled"}, status=503)
        name = request.match_info["name"]
        conn = mgr.get_server(name)
        if conn is None:
            return web.json_response({"error": "server not found"}, status=404)
        from ...tools.mcp_client import make_tool_name
        tools = [
            {
                "name": make_tool_name(name, t["name"]),
                "original_name": t["name"],
                "description": t.get("description", ""),
            }
            for t in conn.tools
        ]
        return web.json_response({"server": name, "tools": tools})

    @routes.post("/api/mcp/servers")
    async def add_mcp_server(request: web.Request) -> web.Response:
        mgr = getattr(bot, "mcp_manager", None)
        if mgr is None:
            return web.json_response({"error": "MCP not enabled"}, status=503)
        data = await request.json()
        name = data.get("name", "").strip()
        transport = data.get("transport", "stdio")
        if not name:
            return web.json_response({"error": "name is required"}, status=400)
        try:
            info = await mgr.add_server(
                name, transport,
                command=data.get("command", ""),
                args=data.get("args", []),
                url=data.get("url", ""),
                headers=data.get("headers", {}),
                env=data.get("env", {}),
                timeout=data.get("timeout"),
            )
            bot.tool_catalog.invalidate()
            return web.json_response(info, status=201)
        except Exception as e:
            return web.json_response({"error": str(e)}, status=400)

    @routes.delete("/api/mcp/servers/{name}")
    async def remove_mcp_server(request: web.Request) -> web.Response:
        mgr = getattr(bot, "mcp_manager", None)
        if mgr is None:
            return web.json_response({"error": "MCP not enabled"}, status=503)
        name = request.match_info["name"]
        try:
            await mgr.remove_server(name)
            bot.tool_catalog.invalidate()
            return web.json_response({"status": "removed", "server": name})
        except Exception as e:
            return web.json_response({"error": str(e)}, status=404)

    # ------------------------------------------------------------------
    # Slack notifications
    # ------------------------------------------------------------------

    @routes.get("/api/slack/status")
    async def slack_status(_request: web.Request) -> web.Response:
        hs = getattr(bot, "health_server", None)
        notifier = getattr(hs, "slack_notifier", None) if hs else None
        if notifier is None:
            return web.json_response({"enabled": False})
        return web.json_response({"enabled": True, **notifier.get_status()})

    @routes.post("/api/slack/test")
    async def slack_test(request: web.Request) -> web.Response:
        hs = getattr(bot, "health_server", None)
        notifier = getattr(hs, "slack_notifier", None) if hs else None
        if notifier is None:
            return web.json_response({"error": "Slack not enabled"}, status=503)
        try:
            data = await request.json()
        except Exception:
            data = {}
        channel = data.get("channel")
        message = data.get("message", "Test message from Odin")
        ok = await notifier.send(str(message)[:500], channel=channel)
        return web.json_response({"sent": ok})

    @routes.post("/api/slack/send")
    async def slack_send(request: web.Request) -> web.Response:
        hs = getattr(bot, "health_server", None)
        notifier = getattr(hs, "slack_notifier", None) if hs else None
        if notifier is None:
            return web.json_response({"error": "Slack not enabled"}, status=503)
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        text = data.get("text", "")
        if not text:
            return web.json_response({"error": "text is required"}, status=400)
        channel = data.get("channel")
        severity = data.get("severity")
        if severity:
            ok = await notifier.send_formatted(
                title=str(data.get("title", "Odin"))[:150],
                message=str(text)[:3000],
                severity=str(severity),
                source=str(data.get("source", "odin"))[:50],
                channel=channel,
            )
        else:
            ok = await notifier.send(str(text)[:3000], channel=channel)
        return web.json_response({"sent": ok})

    # ------------------------------------------------------------------
    # Issue tracker (Linear / Jira)
    # ------------------------------------------------------------------

    @routes.get("/api/issues/status")
    async def issue_tracker_status(_request: web.Request) -> web.Response:
        client = getattr(bot, "_issue_tracker_client", None)
        if client is None:
            return web.json_response({"enabled": False})
        return web.json_response({"enabled": True, **client.get_status()})

    @routes.post("/api/issues/execute")
    async def issue_tracker_execute(request: web.Request) -> web.Response:
        client = getattr(bot, "_issue_tracker_client", None)
        if client is None:
            return web.json_response({"error": "Issue tracker not enabled"}, status=503)
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        action = data.get("action", "")
        if not action:
            return web.json_response({"error": "action is required"}, status=400)
        try:
            from ...notifications.issue_tracker import IssueTrackerError
            result = await client.execute(action, data)
            return web.json_response({"ok": True, "result": result})
        except (ValueError, IssueTrackerError) as exc:
            return web.json_response({"error": str(exc)}, status=400)

    @routes.post("/api/issues/create")
    async def issue_tracker_create(request: web.Request) -> web.Response:
        client = getattr(bot, "_issue_tracker_client", None)
        if client is None:
            return web.json_response({"error": "Issue tracker not enabled"}, status=503)
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        title = data.get("title", "")
        if not title:
            return web.json_response({"error": "title is required"}, status=400)
        try:
            from ...notifications.issue_tracker import IssueTrackerError
            result = await client.execute("create_issue", data)
            return web.json_response({"ok": True, "issue": result}, status=201)
        except (ValueError, IssueTrackerError) as exc:
            return web.json_response({"error": str(exc)}, status=400)

    # ------------------------------------------------------------------
    # Grafana alerts
    # ------------------------------------------------------------------

    @routes.get("/api/grafana-alerts/status")
    async def grafana_alerts_status(_request: web.Request) -> web.Response:
        hs = getattr(bot, "health_server", None)
        handler = getattr(hs, "grafana_handler", None) if hs else None
        if handler is None:
            return web.json_response({"enabled": False})
        return web.json_response({"enabled": True, **handler.get_status()})

    @routes.get("/api/grafana-alerts/history")
    async def grafana_alerts_history(request: web.Request) -> web.Response:
        hs = getattr(bot, "health_server", None)
        handler = getattr(hs, "grafana_handler", None) if hs else None
        if handler is None:
            return web.json_response({"error": "Grafana alert handler not available"}, status=503)
        limit = _safe_int_param(request, "limit", 50, hi=200)
        history = handler.alert_history[-limit:]
        return web.json_response({"alerts": history, "total": len(handler.alert_history)})

    @routes.get("/api/grafana-alerts/rules")
    async def grafana_alerts_rules(_request: web.Request) -> web.Response:
        hs = getattr(bot, "health_server", None)
        handler = getattr(hs, "grafana_handler", None) if hs else None
        if handler is None:
            return web.json_response({"error": "Grafana alert handler not available"}, status=503)
        return web.json_response({"rules": handler.get_rules_list()})

    @routes.post("/api/grafana-alerts/rules")
    async def grafana_alerts_add_rule(request: web.Request) -> web.Response:
        hs = getattr(bot, "health_server", None)
        handler = getattr(hs, "grafana_handler", None) if hs else None
        if handler is None:
            return web.json_response({"error": "Grafana alert handler not available"}, status=503)
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        rule_id = data.get("id", "")
        name_pattern = data.get("name_pattern", "")
        if not rule_id or not name_pattern:
            return web.json_response({"error": "id and name_pattern are required"}, status=400)
        try:
            from ...health.grafana_alerts import RemediationRule
            rule = RemediationRule(
                id=rule_id,
                name_pattern=name_pattern,
                label_matchers=data.get("label_matchers", {}),
                severity_filter=data.get("severity_filter", []),
                remediation_goal=data.get("remediation_goal", ""),
                mode=data.get("mode", "notify"),
                interval_seconds=data.get("interval_seconds", 30),
                max_iterations=data.get("max_iterations", 10),
                cooldown_seconds=data.get("cooldown_seconds", 300),
                enabled=data.get("enabled", True),
            )
            handler.add_rule(rule)
            return web.json_response({"ok": True, "rule": rule_id}, status=201)
        except ValueError as exc:
            return web.json_response({"error": str(exc)}, status=400)

    @routes.delete("/api/grafana-alerts/rules/{rule_id}")
    async def grafana_alerts_delete_rule(request: web.Request) -> web.Response:
        hs = getattr(bot, "health_server", None)
        handler = getattr(hs, "grafana_handler", None) if hs else None
        if handler is None:
            return web.json_response({"error": "Grafana alert handler not available"}, status=503)
        rule_id = request.match_info["rule_id"]
        if handler.remove_rule(rule_id):
            return web.json_response({"ok": True})
        return web.json_response({"error": f"Rule '{rule_id}' not found"}, status=404)

    @routes.get("/api/grafana-alerts/remediations")
    async def grafana_alerts_remediations(_request: web.Request) -> web.Response:
        hs = getattr(bot, "health_server", None)
        handler = getattr(hs, "grafana_handler", None) if hs else None
        if handler is None:
            return web.json_response({"error": "Grafana alert handler not available"}, status=503)
        return web.json_response({"remediations": handler.get_remediations_list()})

    register_knowledge(routes, bot)

    register_schedules(routes, bot)

    # ------------------------------------------------------------------
    # Autonomous loops
    # ------------------------------------------------------------------

    @routes.get("/api/loops")
    async def list_loops(_request: web.Request) -> web.Response:
        loops = []
        for lid, info in bot.loop_manager._loops.items():
            # Include last 5 iteration history entries
            history = list(info._iteration_history)[-5:] if info._iteration_history else []
            loops.append({
                "id": lid,
                "goal": info.goal,
                "mode": info.mode,
                "interval_seconds": info.interval_seconds,
                "stop_condition": info.stop_condition,
                "max_iterations": info.max_iterations,
                "channel_id": info.channel_id,
                "requester_id": info.requester_id,
                "requester_name": info.requester_name,
                "iteration_count": info.iteration_count,
                "last_trigger": info.last_trigger,
                "created_at": info.created_at,
                "status": info.status,
                "iteration_history": history,
            })
        return web.json_response(loops)

    @routes.post("/api/loops")
    async def start_loop(request: web.Request) -> web.Response:
        data = await request.json()
        goal = data.get("goal", "").strip()
        if not goal:
            return web.json_response({"error": "goal is required"}, status=400)
        err = _validate_string(goal, "goal", _MAX_GOAL_LEN)
        if err:
            return web.json_response({"error": err}, status=400)
        channel_id = data.get("channel_id", "").strip()
        if not channel_id:
            return web.json_response(
                {"error": "channel_id is required"}, status=400
            )
        # Find the Discord channel to post to
        try:
            channel = bot.get_channel(int(channel_id))
        except (ValueError, TypeError):
            channel = None
        if not channel:
            return web.json_response({"error": "channel not found"}, status=404)

        requester_id = "web-api"

        # Build iteration callback (same pattern as _handle_start_loop)
        async def _iteration_cb(
            prompt: str, ch: object, prev_context: str | None,
        ) -> str:
            return await bot.tool_loop.run_autonomous(
                prompt, ch, prev_context, requester_id,
            )

        result = bot.loop_manager.start_loop(
            goal=goal,
            channel=channel,
            requester_id=requester_id,
            requester_name="Web API",
            iteration_callback=_iteration_cb,
            interval_seconds=data.get("interval_seconds", 60),
            mode=data.get("mode", "notify"),
            stop_condition=data.get("stop_condition"),
            max_iterations=data.get("max_iterations", 50),
        )
        if result.startswith("Error"):
            return web.json_response({"error": result}, status=400)
        return web.json_response({"loop_id": result}, status=201)

    @routes.delete("/api/loops/{loop_id}")
    async def stop_loop(request: web.Request) -> web.Response:
        lid = request.match_info["loop_id"]
        result = bot.loop_manager.stop_loop(lid)
        is_error = "not found" in result.lower() or "not running" in result.lower()
        return web.json_response(
            {"result": result}, status=404 if is_error else 200
        )

    @routes.post("/api/loops/{loop_id}/restart")
    async def restart_loop(request: web.Request) -> web.Response:
        lid = request.match_info["loop_id"]
        info = bot.loop_manager._loops.get(lid)
        if not info:
            return web.json_response({"error": "loop not found"}, status=404)

        # Capture config before stopping
        goal = info.goal
        mode = info.mode
        interval_seconds = info.interval_seconds
        stop_condition = info.stop_condition
        max_iterations = info.max_iterations
        channel_id = info.channel_id
        requester_id = info.requester_id
        requester_name = info.requester_name

        # Stop if running
        if info.status == "running":
            bot.loop_manager.stop_loop(lid)

        # Find the channel
        try:
            channel = bot.get_channel(int(channel_id))
        except (ValueError, TypeError):
            channel = None
        if not channel:
            return web.json_response({"error": "channel not found"}, status=404)

        # Build callback
        async def _iteration_cb(
            prompt: str, ch: object, prev_context: str | None,
        ) -> str:
            return await bot.tool_loop.run_autonomous(
                prompt, ch, prev_context, requester_id,
            )

        new_id = bot.loop_manager.start_loop(
            goal=goal,
            channel=channel,
            requester_id=requester_id,
            requester_name=requester_name,
            iteration_callback=_iteration_cb,
            interval_seconds=interval_seconds,
            mode=mode,
            stop_condition=stop_condition,
            max_iterations=max_iterations,
        )
        if new_id.startswith("Error"):
            return web.json_response({"error": new_id}, status=400)
        return web.json_response({"old_id": lid, "new_id": new_id}, status=201)

    # ------------------------------------------------------------------
    # Agents
    # ------------------------------------------------------------------

    @routes.get("/api/agents")
    async def list_agents(_request: web.Request) -> web.Response:
        try:
            agent_agents = bot.agent_manager._agents
            if not isinstance(agent_agents, dict):
                return web.json_response([])
        except (AttributeError, TypeError):
            return web.json_response([])
        agents = []
        now = time.time()
        for aid, info in agent_agents.items():
            runtime = (info.ended_at or now) - info.created_at
            agents.append({
                "id": aid,
                "label": info.label,
                "goal": info.goal[:200],
                "status": info.status,
                "state": info.state.value if hasattr(info, "state") else info.status,
                "channel_id": info.channel_id,
                "requester_name": info.requester_name,
                "iteration_count": info.iteration_count,
                "tools_used": info.tools_used[-10:],
                "runtime_seconds": round(runtime, 1),
                "created_at": info.created_at,
                "result": (info.result[:200] if info.result else ""),
                "error": (info.error[:200] if info.error else ""),
                "recovery_attempts": getattr(info, "recovery_attempts", 0),
                "state_history": info._sm.history_as_dicts() if hasattr(info, "_sm") else [],
                "depth": getattr(info, "depth", 0),
                "parent_id": getattr(info, "parent_id", None),
                "children_ids": list(getattr(info, "children_ids", [])),
            })
        return web.json_response(agents)

    @routes.delete("/api/agents/{agent_id}")
    async def kill_agent(request: web.Request) -> web.Response:
        try:
            if not isinstance(bot.agent_manager._agents, dict):
                raise AttributeError
        except (AttributeError, TypeError):
            return web.json_response({"error": "no agent manager"}, status=404)
        agent_id = request.match_info["agent_id"]
        result = bot.agent_manager.kill(agent_id)
        return web.json_response(
            {"result": result}, status=404 if "not found" in result.lower() else 200
        )

    @routes.get("/api/agents/{agent_id}/children")
    async def get_agent_children(request: web.Request) -> web.Response:
        try:
            mgr = bot.agent_manager
        except (AttributeError, TypeError):
            return web.json_response({"error": "no agent manager"}, status=503)
        agent_id = request.match_info["agent_id"]
        children = mgr.get_children(agent_id)
        return web.json_response(children)

    @routes.get("/api/agents/{agent_id}/lineage")
    async def get_agent_lineage(request: web.Request) -> web.Response:
        try:
            mgr = bot.agent_manager
        except (AttributeError, TypeError):
            return web.json_response({"error": "no agent manager"}, status=503)
        agent_id = request.match_info["agent_id"]
        lineage = mgr.get_lineage(agent_id)
        return web.json_response({"lineage": lineage})

    @routes.get("/api/agents/{agent_id}/descendants")
    async def get_agent_descendants(request: web.Request) -> web.Response:
        try:
            mgr = bot.agent_manager
        except (AttributeError, TypeError):
            return web.json_response({"error": "no agent manager"}, status=503)
        agent_id = request.match_info["agent_id"]
        descendants = mgr.get_descendants(agent_id)
        return web.json_response({"descendants": descendants})

    # ------------------------------------------------------------------
    # Processes
    # ------------------------------------------------------------------

    @routes.get("/api/processes")
    async def list_processes(_request: web.Request) -> web.Response:
        registry = getattr(bot.tool_executor, "_process_registry", None)
        if not registry:
            return web.json_response([])
        processes = []
        now = time.time()
        for pid, info in sorted(registry._processes.items()):
            # Last 3 lines of output for inline preview
            output_lines = list(info.output_buffer)
            preview = [line.rstrip("\n") for line in output_lines[-3:]]
            processes.append({
                "pid": pid,
                "command": info.command,
                "host": info.host,
                "status": info.status,
                "exit_code": info.exit_code,
                "uptime_seconds": round(now - info.start_time, 1),
                "start_time": info.start_time,
                "output_preview": preview,
            })
        return web.json_response(processes)

    @routes.delete("/api/processes/{pid}")
    async def kill_process(request: web.Request) -> web.Response:
        registry = getattr(bot.tool_executor, "_process_registry", None)
        if not registry:
            return web.json_response({"error": "no process registry"}, status=404)
        try:
            pid = int(request.match_info["pid"])
        except ValueError:
            return web.json_response({"error": "invalid PID"}, status=400)
        result = await registry.kill(pid)
        is_error = "no process" in result.lower()
        return web.json_response(
            {"result": result}, status=404 if is_error else 200
        )

    register_audit_log(routes, bot)

    register_log_search(routes, bot)

    register_memory_notes(routes, bot)

    register_risk_classification(routes, bot)

    register_permissions_rbac(routes, bot)

    register_codex_oauth(routes, bot)

    register_llm_provider(routes, bot)

    register_provider_config(routes, bot)

    register_ollama_admin(routes, bot)

    register_kimi_admin(routes, bot)

    register_host_access(routes, bot)

    register_api_tokens(routes, bot)

    register_recovery_stats(routes, bot)

    register_branch_freshness(routes, bot)

    register_validation_stats(routes, bot)

    register_learned_context(routes, bot)

    register_affordances(routes, bot)

    register_compression_stats(routes, bot)

    register_routing_stats(routes, bot)

    # ------------------------------------------------------------------
    # Startup diagnostics (boot-time checks)
    # ------------------------------------------------------------------

    @routes.get("/api/startup/diagnostics")
    async def startup_diagnostics(_request: web.Request) -> web.Response:
        report = getattr(bot, "startup_report", None)
        if report is None:
            return web.json_response({"error": "startup diagnostics not available"}, status=503)
        return web.json_response(report.to_dict())

    # ------------------------------------------------------------------
    # Subsystem degradation status
    # ------------------------------------------------------------------

    @routes.get("/api/subsystems/status")
    async def subsystem_status(_request: web.Request) -> web.Response:
        guard = getattr(bot, "subsystem_guard", None)
        if guard is None:
            return web.json_response({"error": "subsystem guard not available"}, status=503)
        return web.json_response(guard.get_status())

    # ------------------------------------------------------------------
    # Agent trajectories
    # ------------------------------------------------------------------

    @routes.get("/api/agent-trajectories")
    async def list_agent_trajectory_files(_request: web.Request) -> web.Response:
        saver = getattr(bot, "agent_trajectory_saver", None)
        if saver is None:
            return web.json_response({"error": "agent trajectory saving not available"}, status=503)
        files = await saver.list_files()
        return web.json_response({"files": files, "count": saver.count})

    @routes.get("/api/agent-trajectories/agent/{agent_id}")
    async def get_agent_trajectory(request: web.Request) -> web.Response:
        saver = getattr(bot, "agent_trajectory_saver", None)
        if saver is None:
            return web.json_response({"error": "agent trajectory saving not available"}, status=503)
        agent_id = request.match_info["agent_id"]
        entry = await saver.find_by_agent_id(agent_id)
        if entry is None:
            return web.json_response({"error": "agent trajectory not found"}, status=404)
        return web.json_response({"entry": entry})

    @routes.get("/api/agent-trajectories/search/query")
    async def search_agent_trajectories(request: web.Request) -> web.Response:
        saver = getattr(bot, "agent_trajectory_saver", None)
        if saver is None:
            return web.json_response({"error": "agent trajectory saving not available"}, status=503)
        channel_id = request.query.get("channel_id")
        requester_id = request.query.get("requester_id")
        tool_name = request.query.get("tool_name")
        state = request.query.get("state")
        limit = _safe_int_param(request, "limit", 50, hi=500)
        results = await saver.search(
            channel_id=channel_id,
            requester_id=requester_id,
            tool_name=tool_name,
            state=state,
            limit=limit,
        )
        return web.json_response({"results": results, "count": len(results)})

    @routes.get("/api/agent-trajectories/{filename}")
    async def get_agent_trajectory_file(request: web.Request) -> web.Response:
        saver = getattr(bot, "agent_trajectory_saver", None)
        if saver is None:
            return web.json_response({"error": "agent trajectory saving not available"}, status=503)
        filename = request.match_info["filename"]
        if (
            not filename.endswith(".jsonl")
            or "/" in filename
            or "\\" in filename
            or ".." in filename
        ):
            return web.json_response({"error": "invalid filename"}, status=400)
        safe_path = (saver.directory / filename).resolve()
        if not safe_path.is_relative_to(saver.directory.resolve()):
            return web.json_response({"error": "invalid filename"}, status=400)
        limit = _safe_int_param(request, "limit", 100, hi=500)
        entries = await saver.read_file(filename, limit=limit)
        return web.json_response({"entries": entries, "count": len(entries)})

    # ------------------------------------------------------------------
    # Outbound webhooks (CRUD + test + stats)
    # ------------------------------------------------------------------

    @routes.get("/api/outbound-webhooks")
    async def list_outbound_webhooks(_request: web.Request) -> web.Response:
        dispatcher = getattr(bot, "outbound_webhook_dispatcher", None)
        if dispatcher is None:
            return web.json_response({"error": "outbound webhooks not available"}, status=503)
        return web.json_response(dispatcher.get_status())

    @routes.post("/api/outbound-webhooks")
    async def create_outbound_webhook(request: web.Request) -> web.Response:
        dispatcher = getattr(bot, "outbound_webhook_dispatcher", None)
        if dispatcher is None:
            return web.json_response({"error": "outbound webhooks not available"}, status=503)
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)
        url = body.get("url", "")
        name = body.get("name", "")
        if err := _validate_string(name, "name", 128):
            return web.json_response({"error": err}, status=400)
        try:
            target = dispatcher.register(
                name=name,
                url=url,
                secret=body.get("secret", ""),
                events=body.get("events"),
                enabled=body.get("enabled", True),
                scrub_secrets=body.get("scrub_secrets", True),
                verify_ssl=body.get("verify_ssl", True),
            )
        except ValueError as exc:
            return web.json_response({"error": str(exc)}, status=400)
        return web.json_response(target.to_dict(), status=201)

    @routes.put("/api/outbound-webhooks/{webhook_id}")
    async def update_outbound_webhook(request: web.Request) -> web.Response:
        dispatcher = getattr(bot, "outbound_webhook_dispatcher", None)
        if dispatcher is None:
            return web.json_response({"error": "outbound webhooks not available"}, status=503)
        webhook_id = request.match_info["webhook_id"]
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)
        try:
            target = dispatcher.update(
                webhook_id,
                name=body.get("name"),
                url=body.get("url"),
                secret=body.get("secret"),
                events=body.get("events"),
                enabled=body.get("enabled"),
                scrub_secrets=body.get("scrub_secrets"),
                verify_ssl=body.get("verify_ssl"),
            )
        except ValueError as exc:
            return web.json_response({"error": str(exc)}, status=400)
        if target is None:
            return web.json_response({"error": "webhook not found"}, status=404)
        return web.json_response(target.to_dict())

    @routes.delete("/api/outbound-webhooks/{webhook_id}")
    async def delete_outbound_webhook(request: web.Request) -> web.Response:
        dispatcher = getattr(bot, "outbound_webhook_dispatcher", None)
        if dispatcher is None:
            return web.json_response({"error": "outbound webhooks not available"}, status=503)
        webhook_id = request.match_info["webhook_id"]
        removed = dispatcher.unregister(webhook_id)
        if not removed:
            return web.json_response({"error": "webhook not found"}, status=404)
        return web.json_response({"status": "deleted", "webhook_id": webhook_id})

    @routes.post("/api/outbound-webhooks/{webhook_id}/test")
    async def test_outbound_webhook(request: web.Request) -> web.Response:
        dispatcher = getattr(bot, "outbound_webhook_dispatcher", None)
        if dispatcher is None:
            return web.json_response({"error": "outbound webhooks not available"}, status=503)
        webhook_id = request.match_info["webhook_id"]
        result = await dispatcher.send_test_event(webhook_id)
        if result is None:
            return web.json_response({"error": "webhook not found"}, status=404)
        return web.json_response(result.to_dict())

    @routes.get("/api/outbound-webhooks/stats")
    async def outbound_webhook_stats(_request: web.Request) -> web.Response:
        dispatcher = getattr(bot, "outbound_webhook_dispatcher", None)
        if dispatcher is None:
            return web.json_response({"error": "outbound webhooks not available"}, status=503)
        return web.json_response(dispatcher.stats.as_dict())

    return routes


def setup_api(app: web.Application, bot: OdinBot) -> None:
    """Register all API routes on the given aiohttp application."""
    routes = create_api_routes(bot)
    app.router.add_routes(routes)
    log.info("Web API endpoints registered")
