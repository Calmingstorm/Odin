"""Configuration, status and lifecycle admin route registrars (RFC-003 P5).

Carved verbatim from api/__init__.

Each ``register_*`` moves one section of the old monolith unchanged; the
composition root calls them at the sections' original positions, so the
route REGISTRATION ORDER (aiohttp path precedence) is exactly what the
parity contract pins.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import yaml
from aiohttp import web

from ... import restart
from ...config.initialization import (
    InitializationAlreadyCompleteError,
    InitializationRecoveryRequiredError,
)
from ...config.persistence import (
    PersistOutcome,
    config_transaction,
    persist_config_paths_locked,
    submitted_leaves,
)
from ...config.schema import Config, active_config_path
from ...context.loader import ContextReloadReport
from ...odin_log import get_logger
from ...setup_wizard import validate_token_format
from ...version import get_version
from ..api_common import (
    _SENSITIVE_FIELDS,
    _contains_blocked_fields,
    _deep_merge,
    _redact_config,
    _sanitize_error,
    admin_gate,
)
from ..onboarding import OnboardingCoordinator, OnboardingError

log = get_logger("web.api")


def _image_intent_revision(metadata: dict) -> str:
    return hashlib.sha256(json.dumps(metadata, sort_keys=True).encode()).hexdigest()


def _listener_admin_current(request: web.Request, bot) -> bool:
    """Reauthenticate the supplied raw credential under the publication lock.

    Browser sessions contain identities, not credential provenance. Never
    resolve them by user_id or infer a default credential from public labels.
    This sensitive action requires explicit reauthentication, including in UI.
    """
    import hmac

    from ...health.server import _usable_web_credential

    if getattr(request, "_session_managed", False):
        return False
    header = request.headers.get("Authorization", "")
    bearer = header[7:] if header.startswith("Bearer ") else ""
    if not _usable_web_credential(bearer):
        return False
    manager = getattr(bot, "api_token_manager", None)
    current = bot.config.web
    if _usable_web_credential(current.api_token) and hmac.compare_digest(
        current.api_token, bearer,
    ):
        return True
    identity = manager.resolve(bearer) if manager else None
    if identity is None:
        identity = next((entry for entry in current.api_tokens
                         if _usable_web_credential(entry.token)
                         and hmac.compare_digest(entry.token, bearer)), None)
    return identity is not None and identity.tier == "admin"


def _config_has_explicit_path(*segments: str) -> bool | None:
    """Inspect YAML keys without resolving values or exposing configuration content."""
    path = active_config_path()
    if path is None:
        return None
    try:
        node = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, yaml.YAMLError):
        return None
    for segment in segments:
        if not isinstance(node, dict):
            return False
        if segment not in node:
            return False
        node = node[segment]
    return True


def _listener_status_payload(bot, initialization_state) -> dict[str, object]:
    """Join durable intent to the socket snapshot without treating either as the other."""
    from ...web.bootstrap_policy import numeric_loopback

    configured_host = getattr(bot.config.web, "host", "0.0.0.0") or "0.0.0.0"
    runtime: dict[str, object] = {}
    health = getattr(bot, "health_server", None)
    if health is not None:
        snapshot = getattr(health, "listener_status", None)
        if callable(snapshot):
            runtime = snapshot()

    effective_host = runtime.get("effective_host")
    listening_hosts = [
        host for host in runtime.get("listening_hosts", [])
        if isinstance(host, str) and host
    ]
    listening_ports = [
        port for port in runtime.get("listening_ports", [])
        if isinstance(port, int) and not isinstance(port, bool)
    ]
    running_scope = (
        "unavailable" if not listening_hosts
        else "loopback" if all(numeric_loopback(host) for host in listening_hosts)
        else "beyond_loopback"
    )
    authorized = not initialization_state.loopback_restricted
    applied = isinstance(effective_host, str) and effective_host == configured_host

    if running_scope == "unavailable":
        exposure_state = "unknown"
    elif authorized and applied and running_scope == "beyond_loopback":
        exposure_state = "active"
    elif authorized and applied:
        exposure_state = "authorized_loopback"
    elif authorized and running_scope == "beyond_loopback":
        exposure_state = "active_rebind_pending"
    elif authorized:
        exposure_state = "pending_widening"
    elif running_scope == "beyond_loopback":
        exposure_state = "pending_narrowing"
    else:
        exposure_state = "restricted"

    explicit = _config_has_explicit_path("web", "host")
    configured_source = "unknown" if explicit is None else "explicit" if explicit else "default"
    return {
        "authorized": authorized,
        "authorization_source": (
            "explicit" if initialization_state.explicit_widening
            else "legacy" if authorized
            else "restricted"
        ),
        "loopback_restricted": initialization_state.loopback_restricted,
        "explicit_widening": initialization_state.explicit_widening,
        "state": exposure_state,
        "configured_host": configured_host,
        "configured_host_source": configured_source,
        "effective_host": effective_host,
        "listening_hosts": listening_hosts,
        "listening_ports": listening_ports,
        "running_scope": running_scope,
    }


def register_setup_wizard(routes: web.RouteTableDef, bot) -> None:
    """Installation-bound setup endpoints, never CWD/token heuristics."""
    # ------------------------------------------------------------------
    # Setup wizard plus authenticated, post-setup listener consent.
    # ------------------------------------------------------------------

    @routes.get("/api/setup/status")
    async def setup_status(_request: web.Request) -> web.Response:
        """Check whether first-boot setup is needed."""
        coordinator = getattr(bot, "onboarding", None)
        if not isinstance(coordinator, OnboardingCoordinator):
            return web.json_response(
                {"needed": False, "error": "setup context unavailable"}, status=503
            )
        state = await coordinator.state()
        payload: dict[str, object] = {
            "needed": state.setup_allowed,
            "mode": state.mode.value,
        }
        if state.mode.value in {"complete", "legacy"}:
            payload["listener"] = _listener_status_payload(bot, state)
        return web.json_response(payload)

    @routes.post("/api/setup/complete")
    async def setup_complete(request: web.Request) -> web.Response:
        """Receive wizard data and report restart-required settings, without restarting.

        Gated on ``is_setup_needed()`` — once setup is done, this
        endpoint returns ``409 Conflict`` instead of silently rewriting
        the operator's config. Odin's PR #18 self-audit finding #2:
        first-boot routes should stop being first-boot routes after
        first boot.
        """
        coordinator = getattr(bot, "onboarding", None)
        if not isinstance(coordinator, OnboardingCoordinator):
            return web.json_response({"error": "setup context unavailable"}, status=503)
        state = await coordinator.state()
        if state.mode.value == "recovery":
            return web.json_response(
                {"error": "setup recovery is required", "mode": state.mode.value},
                status=503,
            )
        if not state.setup_allowed:
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

        # Credentials are optional: bootstrap can be completed for a local
        # web-only installation and Discord can attach later.
        discord_token = (data.get("discord_token") or "").strip() or None
        if discord_token is not None and not validate_token_format(discord_token):
            return web.json_response(
                {"error": "discord_token format is invalid"}, status=400
            )

        # Extract optional fields
        hosts: dict[str, dict[str, str]] = {}
        raw_hosts = data.get("hosts")
        if raw_hosts is not None:
            if not isinstance(raw_hosts, dict):
                return web.json_response({"error": "hosts must be an object"}, status=400)
            for name, info in raw_hosts.items():
                if not isinstance(name, str) or not name.strip() or not isinstance(info, dict):
                    return web.json_response({"error": "host entries are invalid"}, status=400)
                address = info.get("address")
                ssh_user = info.get("ssh_user", "root")
                if (
                    not isinstance(address, str)
                    or not address.strip()
                    or not isinstance(ssh_user, str)
                    or not ssh_user.strip()
                ):
                    return web.json_response(
                        {"error": "host entries require address and ssh_user strings"}, status=400
                    )
                hosts[name] = {"address": address.strip(), "ssh_user": ssh_user.strip()}

        features: dict[str, bool] = {}
        raw_features = data.get("features")
        if raw_features is not None and not isinstance(raw_features, dict):
            return web.json_response({"error": "features must be an object"}, status=400)
        if isinstance(raw_features, dict):
            for key in ("browser",):
                if key in raw_features:
                    if type(raw_features[key]) is not bool:
                        return web.json_response(
                            {"error": f"features.{key} must be boolean"}, status=400
                        )
                    features[key] = raw_features[key]

        web_api_token = str(data.get("web_api_token", "")).strip() or None
        updates: dict[str, object] = {}
        if "timezone" in data:
            timezone = data["timezone"]
            if not isinstance(timezone, str) or not timezone.strip():
                return web.json_response({"error": "timezone must be an IANA timezone"}, status=400)
            try:
                ZoneInfo(timezone.strip())
            except ZoneInfoNotFoundError:
                return web.json_response({"error": "timezone must be an IANA timezone"}, status=400)
            updates["timezone"] = timezone.strip()
        if raw_hosts is not None:
            updates["tools"] = {"hosts": hosts}
        if "browser" in features:
            updates["browser"] = {"enabled": features["browser"]}
        try:
            result = await coordinator.submit(
                bot, discord_token=discord_token, web_api_token=web_api_token,
                config_updates=updates,
            )
        except (InitializationAlreadyCompleteError, InitializationRecoveryRequiredError):
            # The preflight is for feedback only. The store lock is authority.
            return web.json_response({"error": "setup already complete"}, status=409)
        except OnboardingError as e:
            log.error("Setup wizard failed to write config: %s", e)
            return web.json_response(
                {"error": f"Failed to write config: {_sanitize_error(e)}"},
                status=500,
            )

        discord: dict[str, str] = {}
        if result.gateway_attached is True:
            # Attachment returns before discord.py's ready event. This is a
            # truthful connection state, not a fabricated ready signal.
            discord["state"] = "connecting"
        elif result.gateway_attached is False:
            discord = {"state": "failed", "error": result.activation_detail}
        elif discord_token is not None:
            discord = {
                "state": "failed",
                "error": result.activation_detail or "gateway unavailable",
            }
        return web.json_response({
            "status": "ok", "mode": "complete", "persisted": result.persisted,
            "discord": discord,
            "restart_required": list(result.restart_required),
            "message": (
                "Setup saved. Restart Odin to apply: " + ", ".join(result.restart_required)
                if result.restart_required else "Setup saved."
            ),
        })

    @routes.post("/api/setup/listener")
    async def setup_listener(request: web.Request) -> web.Response:
        """Reauthenticate a raw admin bearer and consent to web.host on next restart."""
        if getattr(request, "_session_managed", False) or not request.headers.get(
            "Authorization", "",
        ).startswith("Bearer "):
            return web.json_response({
                "error": "Re-enter a current admin API token to authorize listener exposure; "
                         "browser sessions and query credentials cannot record consent.",
            }, status=403)
        identity = getattr(request, "_api_identity", None)
        if identity is None or getattr(identity, "tier", None) != "admin":
            # Dev-mode access must never authorize a durable exposure decision.
            return web.json_response({"error": "authenticated admin access required"}, status=403)
        coordinator = getattr(bot, "onboarding", None)
        if not isinstance(coordinator, OnboardingCoordinator):
            return web.json_response({"error": "setup context unavailable"}, status=503)
        try:
            data = await request.json()
        except (ValueError, TypeError):
            return web.json_response({"error": "invalid JSON"}, status=400)
        if (
            not isinstance(data, dict)
            or set(data) != {"expose_beyond_loopback"}
            or type(data.get("expose_beyond_loopback")) is not bool
        ):
            return web.json_response(
                {"error": "explicit boolean expose_beyond_loopback choice is required"},
                status=400,
            )
        expose_beyond_loopback = data["expose_beyond_loopback"]
        try:
            await coordinator.set_listener_widening(
                bot,
                expose_beyond_loopback=expose_beyond_loopback,
                authorize=lambda: _listener_admin_current(request, bot),
            )
        except OnboardingError as exc:
            return web.json_response({"error": str(exc)}, status=409)
        state = await coordinator.state()
        listener = _listener_status_payload(bot, state)
        return web.json_response({
            "persisted": True,
            # Keep the original scalar readback for API clients while the UI
            # consumes the complete desired-versus-running listener record.
            "loopback_restricted": listener["loopback_restricted"],
            "explicit_widening": listener["explicit_widening"],
            "configured_host": listener["configured_host"],
            "listener": listener,
            "restart_required": ["web.listener"],
            "message": (
                "Exposure authorization saved. Restart Odin to apply the configured listener; "
                "the running listener is unchanged."
                if expose_beyond_loopback else
                "Loopback restriction saved. Restart Odin to narrow the listener; "
                "the running listener is unchanged."
            ),
        })


def register_status_info(routes: web.RouteTableDef, bot) -> None:
    """Status & info (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Status & info
    # ------------------------------------------------------------------

    @routes.get("/api/status")
    async def get_status(_request: web.Request) -> web.Response:
        # Bootstrap middleware denies this operational route while pending.
        # First-boot clients probe /api/setup/status instead.
        guilds = [
            {"id": str(g.id), "name": g.name, "member_count": g.member_count or 0}
            for g in bot.guilds
        ]
        user_count = sum(g.member_count or 0 for g in bot.guilds)
        tools = bot.tool_catalog.merged_definitions()
        # The bot sets ``start_time``; this guard checked ``_start_time`` (a
        # name nothing ever set), so uptime reported 0 forever (audit 2.1).
        uptime = time.monotonic() - bot.start_time if hasattr(bot, "start_time") else 0

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

    @routes.get("/api/config/meta")
    async def get_config_meta(_request: web.Request) -> web.Response:
        """Every configuration leaf, and how it reaches the running bot.

        The config page renders from THIS, so it states what the code actually
        does instead of guessing from a value's shape. Secret leaves carry
        whether one is set and nothing else — never the value, its length, or
        any prefix of it. The registry is CI-gated, so a new schema leaf cannot
        appear here unclassified.
        """
        from ...config.apply_registry import build_meta_payload
        from ...config.image_defaults import read_image_model_metadata

        async with config_transaction():
            try:
                image_defaults = read_image_model_metadata(active_config_path(), bot.config)
            except Exception as exc:
                return web.json_response(
                    {"error": f"Image model intent unavailable: {_sanitize_error(exc)}"},
                    status=500,
                )
            payload = build_meta_payload(
                bot.config.model_dump(),
                boot_dump=getattr(bot, "boot_config_snapshot", None),
                generated_at=datetime.now(UTC).isoformat(),
                image_model_defaults=image_defaults,
            )
            payload["image_model_revision"] = _image_intent_revision(image_defaults)
        return web.json_response(payload)

    @routes.post("/api/config/image-models")
    async def update_image_model_intent(request: web.Request) -> web.Response:
        """Adopt shipped defaults or pin transaction-current effective strings.

        Both leaves share one durable commit and publication. Unrelated fields
        and unsaved browser drafts never enter this operation.
        """
        denied = admin_gate(bot)(request)
        if denied is not None:
            return denied
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        operations = body.get("operations") if isinstance(body, dict) else None
        if (
            not isinstance(body, dict) or set(body) != {"operations", "expected_revision"}
            or not isinstance(body.get("expected_revision"), str)
            or not isinstance(operations, dict) or not operations
            or not set(operations).issubset({"image_model", "outer_model"})
            or any(value not in ("follow", "pin") for value in operations.values())
        ):
            return web.json_response(
                {"error": "operations must map image_model and/or outer_model to follow or pin"},
                status=400,
            )
        from ...config.image_defaults import read_image_model_metadata

        async with config_transaction():
            try:
                metadata = read_image_model_metadata(active_config_path(), bot.config)
                if body["expected_revision"] != _image_intent_revision(metadata):
                    return web.json_response(
                        {"error": "Image model intent changed; refresh status before retrying"},
                        status=409,
                    )
                before_intent = {leaf: dict(record) for leaf, record in metadata.items()}
                current = bot.config.model_dump()
                changes = []
                for leaf, operation in operations.items():
                    value = metadata[leaf]["default" if operation == "follow" else "effective"]
                    current["image"]["openai"][leaf] = value
                    changes.append((("image", "openai", leaf), value))
                desired = Config(**current)
            except Exception as exc:
                return web.json_response(
                    {"error": f"Image models not changed: {_sanitize_error(exc)}"}, status=500,
                )
            persist_exc, was_cancelled = await persist_config_paths_locked(
                changes, image_model_intent=operations,
            )
            if persist_exc is not None:
                if was_cancelled:
                    raise asyncio.CancelledError
                return web.json_response(
                    {"error": f"Image models not saved: {_sanitize_error(persist_exc)}"},
                    status=500,
                )
            # Generation reads bot.config.image on its next request. Do not
            # rebuild a backend or pretend an in-flight generation changed.
            bot.config = desired
            for leaf, operation in operations.items():
                metadata[leaf] = {**metadata[leaf],
                                  "effective": getattr(desired.image.openai, leaf),
                                  "status": operation}
            if was_cancelled:
                raise asyncio.CancelledError
            # Equal-value pin/follow changes still change operator intent.
            try:
                from ...audit.diff_tracker import compute_dict_diff

                request["_config_diff"] = compute_dict_diff(
                    before_intent, metadata, label="image model intent",
                )
            except Exception:
                request["_config_diff"] = None
            return web.json_response({
                "config": _redact_config(desired.model_dump()),
                "image_model_defaults": metadata,
                "image_model_revision": _image_intent_revision(metadata),
            })

    @routes.put("/api/config")
    async def update_config(request: web.Request) -> web.Response:
        try:
            updates = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)

        if not isinstance(updates, dict):
            return web.json_response({"error": "expected JSON object"}, status=400)

        # The Learned panel owns this live switch. Keep its generic config write
        # route-level admin-gated as well as centrally protected by middleware,
        # so alternate route composition cannot turn the UI control into a
        # privilege bypass.
        if isinstance(updates.get("learning"), dict) and "enabled" in updates["learning"]:
            denied = admin_gate(bot)(request)
            if denied is not None:
                return denied

        # Provisioning is desired state only: ComputerLifecycle owns a deep
        # startup snapshot, even across disable/enable cycles. Never let this
        # route bypass the dedicated enable/revoke lifecycle transaction.
        if "computer" in updates:
            denied = admin_gate(bot)(request)
            if denied is not None:
                return denied
            if not isinstance(updates["computer"], dict):
                return web.json_response(
                    {"error": "computer must be a provisioning object"}, status=400)
            if "enabled" in updates["computer"]:
                return web.json_response(
                    {
                        "error": "computer.enabled is read-only on this route",
                        "detail": "Use POST /api/computer/enabled to activate or revoke. "
                        "Other computer settings may be saved here and require a restart.",
                    },
                    status=409,
                )
        # MCP has a dedicated transactional owner (/api/mcp/*) that keeps
        # disk, bot.config, manager generations, and catalog publication in
        # one commit. Accepting it here would split those truths.
        if "mcp" in updates:
            return web.json_response(
                {
                    "error": "MCP settings are read-only on this route",
                    "detail": "Use the MCP Servers management API and panel.",
                },
                status=409,
            )

        # tools.disabled_tools has the same transactional-owner rule: the
        # Tools management API persists, rebinds, and invalidates the catalog
        # in one commit. Accepting the leaf here would split those truths.
        if isinstance(updates.get("tools"), dict) and "disabled_tools" in updates["tools"]:
            return web.json_response(
                {
                    "error": "tools.disabled_tools is read-only on this route",
                    "detail": "Use the Tools management API and panel.",
                },
                status=409,
            )

        dedicated_host_fields = {"hosts", "default_host", "allow_host_tofu"}
        requested_host_fields = (
            dedicated_host_fields.intersection(updates.get("tools", {}))
            if isinstance(updates.get("tools"), dict)
            else set()
        )
        if requested_host_fields:
            return web.json_response(
                {
                    "error": "managed-host fields are read-only on this route",
                    "detail": "Use the Hosts management API and panel.",
                    "fields": sorted(requested_host_fields),
                },
                status=409,
            )

        # Block sensitive field updates
        if _contains_blocked_fields(updates, _SENSITIVE_FIELDS):
            return web.json_response(
                {"error": "Cannot update sensitive fields via API"}, status=403
            )

        # ONE transaction: snapshot, validate, persist, and rebind all happen
        # under the shared config lock. Reading bot.config outside it means a
        # concurrent LLM save can land between the read and the rebind, and the
        # rebind then drops that change from runtime while the leaf-scoped
        # write leaves it on disk — runtime and disk silently disagree.
        async with config_transaction():
            # Snapshot before state for diff
            before_config = _redact_config(bot.config.model_dump())

            # Deep merge updates into current config
            current = bot.config.model_dump()
            _deep_merge(current, updates)

            # Validate by reconstructing the config model
            try:
                new_config = Config(**current)
                health = getattr(bot, "health_server", None)
                if health is not None:
                    health.validate_web_credential_transition(new_config.web)
            except Exception as e:
                return web.json_response({"error": f"Invalid config: {e}"}, status=400)

            # Persist only the submitted paths, carrying VALIDATED values: a key
            # the schema dropped never reaches disk, normalization does, and
            # every path nobody submitted keeps its file text — comments,
            # ordering, and unresolved ${VAR} placeholders included.
            leaf_changes = submitted_leaves(updates, new_config.model_dump(), Config)

            # Persist BEFORE mutating runtime. The old order applied the change
            # in memory, then logged any write failure and returned 200 anyway —
            # so the UI reported success for a change that vanished at the next
            # restart.
            persist_exc, was_cancelled = await persist_config_paths_locked(leaf_changes)
            if persist_exc is not None:
                if was_cancelled:
                    raise asyncio.CancelledError
                log.warning("Config rejected — could not persist: %s", persist_exc)
                return web.json_response(
                    {"error": f"Configuration not saved: {_sanitize_error(persist_exc)}"},
                    status=500,
                )

            # Publish every live view before cancellation may escape. bot.config
            # is not the whole effective state: personality presets and prompt /
            # tool schemas have process-global or cached derivatives.
            bot.config = new_config
            reflector = getattr(bot, "reflector", None)
            if reflector is not None:
                reflector.observe_enabled_state(new_config.learning.enabled)
            # HealthServer reads web credentials from the live config owner.
            if "personality" in updates:
                from src.llm.system_prompt import register_user_presets

                register_user_presets(
                    {
                        name: {
                            "name": preset.name,
                            "identity": preset.identity,
                            "voice": preset.voice,
                        }
                        for name, preset in new_config.personality.user_presets.items()
                    }
                )
                bot.prompt_builder.invalidate()
                bot.prompt_builder.rebuild_default()
            if getattr(bot, "tool_catalog", None):
                bot.tool_catalog.invalidate()
            if was_cancelled:
                raise asyncio.CancelledError

        # Compute config diff and record in audit log
        after_config = _redact_config(new_config.model_dump())
        try:
            from ...audit.diff_tracker import compute_dict_diff
            config_diff = compute_dict_diff(before_config, after_config, label="config.yml")
        except Exception:
            config_diff = None

        # Store diff on request for the audit middleware
        request["_config_diff"] = config_diff

        # NOTE: the response shape is the settled legacy one — callers, and
        # the Config page's own state, treat this body as the config document.
        # Per-field apply state belongs on /api/config/meta, which reports it
        # from the registry with consumer-aware effective state; adding a key
        # here invented a 36th section and duplicated that logic badly.
        return web.json_response(after_config)


def register_quick_actions(routes: web.RouteTableDef, bot) -> None:
    """Quick actions (verbatim from the monolith)."""
    _require_admin = admin_gate(bot)
    # ------------------------------------------------------------------
    # Quick actions
    # ------------------------------------------------------------------

    @routes.post("/api/restart")
    async def restart_odin(request: web.Request) -> web.Response:
        """Cleanly restart the running process, on operator request.

        Exists for the Config page's pending-restart flow: restart-mode
        settings are saved but keep their startup values until the process
        comes back, so the page offers this instead of telling the operator
        to find a shell. Same mechanism as the setup wizard: record restart
        intent, return before dying, then a delayed SIGTERM lets main()
        re-exec in place regardless of the unit's Restart= policy.

        Idempotent while a restart is already scheduled, and deliberately
        accepts NO body/env overrides — the wizard's env-override path is for
        first boot only; this route must never become a way to mutate the
        process environment.
        """
        denied = _require_admin(request)
        if denied is not None:
            return denied
        if restart.restart_requested():
            return web.json_response({"status": "restarting"}, status=202)
        restart.request_restart()
        import os as _os
        import signal as _signal
        loop = asyncio.get_running_loop()
        loop.call_later(2.0, _os.kill, _os.getpid(), _signal.SIGTERM)
        log.info("Restart requested via /api/restart")
        return web.json_response({"status": "restarting"}, status=202)

    @routes.post("/api/sessions/clear-all")
    async def clear_all_sessions(request: web.Request) -> web.Response:
        denied = _require_admin(request)
        if denied:
            return denied
        count = bot.sessions.clear_all()
        return web.json_response({"status": "cleared", "count": count})

    @routes.post("/api/reload")
    async def reload_config(_request: web.Request) -> web.Response:
        # The same immutable report the /reload slash command renders: which
        # files are effective now, which dropped out, and which were skipped.
        report = bot.context_loader.reload()
        bot.prompt_builder.invalidate()
        bot.tool_catalog.invalidate()
        bot.prompt_builder.rebuild_default()
        payload: dict = {"status": "reloaded"}
        if isinstance(report, ContextReloadReport):
            payload["context"] = report.to_dict()
        return web.json_response(payload)


async def _persist_personality(p) -> PersistOutcome:
    """Write the DESIRED personality section through the shared round-trip writer.

    Takes the desired value rather than reading ``bot.config`` so callers can
    persist BEFORE they mutate runtime: the endpoints used to install the new
    personality (and register its presets globally) first and persist after, so
    a failed write returned 500 with the new personality already live — the
    same lie the generic config path had.

    The three endpoints also used to dump the whole resolved model to
    ``getattr(request.app, "_config_path", "config.yml")`` — an attribute
    nothing ever assigns, so the write landed on a CWD-relative path rather
    than the file the live config was loaded from, and materialized every
    ``${VAR}`` placeholder on the way.
    """

    # Leaf changes rather than a section rewrite: rewriting the whole resolved
    # section flattens any ${VAR} in these fields, and only the leaf path
    # carries the placeholder, alias, and YAML-anchor guards.
    changes = [
        (("personality", "preset"), p.preset),
        (("personality", "custom_name"), p.custom_name),
        (("personality", "custom_identity"), p.custom_identity),
        (("personality", "custom_voice"), p.custom_voice),
        (
            ("personality", "user_presets"),
            {
                name: {"name": v.name, "identity": v.identity, "voice": v.voice}
                for name, v in p.user_presets.items()
            },
        ),
    ]
    return await persist_config_paths_locked(changes)


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
        # ONE transaction over read → compute → persist → publish. Computing the
        # desired value outside the lock and publishing after releasing it lets
        # two concurrent saves interleave: runtime ends up with one preset and
        # disk with the other.
        async with config_transaction():
            existing_user_presets = (
                bot.config.personality.user_presets
                if hasattr(bot.config, "personality") else {}
            )
            desired = PersonalityConfig(
                preset=preset,
                custom_name=custom_name,
                custom_identity=custom_identity,
                custom_voice=custom_voice,
                user_presets=existing_user_presets,
            )
            # Persist first: installing the personality and registering its
            # presets globally before the write means a failed save leaves the
            # new identity live with nothing on disk to match it.
            persist_exc, was_cancelled = await _persist_personality(desired)
            if persist_exc is not None:
                if was_cancelled:
                    raise asyncio.CancelledError
                log.warning("Personality rejected — could not persist: %s", persist_exc)
                return web.json_response(
                    {"error": f"Personality not saved: {_sanitize_error(persist_exc)}"},
                    status=500,
                )
            bot.config.personality = desired
            from src.llm.system_prompt import register_user_presets
            register_user_presets(
                {
                    k: {"name": v.name, "identity": v.identity, "voice": v.voice}
                    for k, v in existing_user_presets.items()
                }
            )
            bot.prompt_builder.invalidate()
            bot.tool_catalog.invalidate()
            bot.prompt_builder.rebuild_default()
            if was_cancelled:
                raise asyncio.CancelledError
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
        async with config_transaction():
            desired_presets = dict(bot.config.personality.user_presets)
            desired_presets[name] = PersonalityPreset(
                name=display_name, identity=identity, voice=voice
            )
            desired = bot.config.personality.model_copy(
                update={"user_presets": desired_presets}
            )
            persist_exc, was_cancelled = await _persist_personality(desired)
            if persist_exc is not None:
                if was_cancelled:
                    raise asyncio.CancelledError
                log.warning("Preset rejected — could not persist: %s", persist_exc)
                return web.json_response(
                    {"error": f"Preset not saved: {_sanitize_error(persist_exc)}"},
                    status=500,
                )
            bot.config.personality = desired
            from src.llm.system_prompt import register_user_presets
            register_user_presets(
                {
                    k: {"name": v.name, "identity": v.identity, "voice": v.voice}
                    for k, v in desired_presets.items()
                }
            )
            if desired.preset == name:
                bot.prompt_builder.invalidate()
                bot.tool_catalog.invalidate()
                bot.prompt_builder.rebuild_default()
            if was_cancelled:
                raise asyncio.CancelledError
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
        async with config_transaction():
            desired_presets = {
                k: v for k, v in bot.config.personality.user_presets.items() if k != name
            }
            update: dict = {"user_presets": desired_presets}
            resets_active = bot.config.personality.preset == name
            if resets_active:
                update["preset"] = "odin"
            desired = bot.config.personality.model_copy(update=update)
            persist_exc, was_cancelled = await _persist_personality(desired)
            if persist_exc is not None:
                if was_cancelled:
                    raise asyncio.CancelledError
                log.warning("Preset deletion rejected — could not persist: %s", persist_exc)
                return web.json_response(
                    {"error": f"Preset not deleted: {_sanitize_error(persist_exc)}"},
                    status=500,
                )
            bot.config.personality = desired
            from src.llm.system_prompt import register_user_presets
            register_user_presets(
                {
                    k: {"name": v.name, "identity": v.identity, "voice": v.voice}
                    for k, v in desired_presets.items()
                }
            )
            if resets_active:
                bot.prompt_builder.invalidate()
                bot.tool_catalog.invalidate()
                bot.prompt_builder.rebuild_default()
            if was_cancelled:
                raise asyncio.CancelledError
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


