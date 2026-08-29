"""External integration route registrars (RFC-003 P5 — carved verbatim from api/__init__).

Each ``register_*`` moves one section of the old monolith unchanged; the
composition root calls them at the sections' original positions, so the
route REGISTRATION ORDER (aiohttp path precedence) is exactly what the
parity contract pins.
"""

from __future__ import annotations

import asyncio

from aiohttp import web

from ...odin_log import get_logger
from ..api_common import (
    _safe_int_param,
    _validate_string,
)

log = get_logger("web.api")


async def _drain_mcp_management(operation, *, commit_started: asyncio.Event):
    """Abort a management operation while queued; drain it after commit starts."""
    task = asyncio.create_task(operation, name="mcp-management-mutation")
    cancelled = False
    while not task.done():
        try:
            await asyncio.shield(task)
        except asyncio.CancelledError:
            if not commit_started.is_set():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
                raise
            cancelled = True
            current = asyncio.current_task()
            if current is not None:
                while current.cancelling():
                    current.uncancel()
    result = await task
    if cancelled:
        raise asyncio.CancelledError
    return result


def register_mcp_servers(routes: web.RouteTableDef, bot) -> None:
    """MCP server management (MCP campaign P4).

    The activation contract for ``mcp.*``: CRUD persists desired state to the
    live config file through the shared transactional writer, then reconciles
    the always-present control plane — validate → persist → adopt → reconcile,
    with ``saved`` and ``connected`` reported as separate truths. Network work
    never happens inside the config transaction. Secrets (header/env VALUES)
    never leave the server: reads expose key names only; writes use explicit
    ``headers_set``/``headers_remove`` and ``env_set``/``env_remove`` patch
    ops, and redaction-mask values are rejected outright.
    """
    from ...config import persistence as config_persistence
    from ...config.persistence import DELETE_CONFIG_PATH, config_transaction
    from ...config.schema import MCPServerConfig
    from ...tools.mcp import MCPConfigError, validate_server_config
    from ..api_common import contains_redaction_mask

    def _manager(bot=bot):
        return bot.mcp_manager

    def _sanitized(text: str) -> str:
        from ...error_presentation import sanitize_error_text

        return sanitize_error_text(str(text))[:500]

    def _server_row(name: str) -> dict | None:
        for row in _manager().get_status()["servers"]:
            if row["name"] == name:
                return row
        return None

    def _live_servers() -> dict[str, dict]:
        return {
            name: config.model_dump() if hasattr(config, "model_dump") else dict(config)
            for name, config in (bot.config.mcp.servers or {}).items()
        }

    def _leaf_changes(
        path: tuple[str, ...], before: object, after: object
    ) -> list[tuple[tuple[str, ...], object]]:
        """Name only changed leaves so untouched placeholders remain opaque."""
        if isinstance(before, dict) and isinstance(after, dict):
            changes: list[tuple[tuple[str, ...], object]] = []
            for key in before.keys() - after.keys():
                changes.append(((*path, str(key)), DELETE_CONFIG_PATH))
            for key in after.keys() - before.keys():
                changes.append(((*path, str(key)), after[key]))
            for key in before.keys() & after.keys():
                changes.extend(_leaf_changes((*path, str(key)), before[key], after[key]))
            return changes
        return [] if before == after else [(path, after)]

    async def _persist_desired(servers: dict[str, dict], enabled: bool | None = None) -> bool:
        """Persist only changed MCP leaves, then rebind the live config.

        A replacement of the whole server map would flatten untouched
        ``${ENV}`` credentials into resolved plaintext.  Diffing from the
        transaction-current live config lets the shared writer preserve those
        leaves exactly and gives deletions an explicit path.
        """
        changes: list = _leaf_changes(("mcp", "servers"), _live_servers(), servers)
        if enabled is not None and bot.config.mcp.enabled != bool(enabled):
            changes.append((("mcp", "enabled"), bool(enabled)))
        exc, cancelled = await config_persistence.persist_config_paths_locked(changes)
        if exc is not None:
            raise exc
        # Rebind runtime config so restarts and readers agree with disk.
        bot.config.mcp.servers = {
            name: MCPServerConfig(**config) for name, config in servers.items()
        }
        if enabled is not None:
            bot.config.mcp.enabled = bool(enabled)
        return cancelled

    # One route-level state machine orders every MCP read → durable write →
    # manager adoption → reconcile.  This lock is separate from the shared
    # config lock so slow transport teardown/connect never blocks unrelated
    # configuration writers.
    management_lock = asyncio.Lock()

    async def _commit_desired(
        servers: dict[str, dict],
        *,
        enabled: bool,
        commit_started: asyncio.Event,
    ):
        """Commit all live truths, then do transport work outside config lock."""
        commit_started.set()
        writer_cancelled = await _persist_desired(servers, enabled=enabled)
        transition = _manager().stage_desired_state(enabled=enabled, servers=servers)
        return transition, writer_cancelled

    def _apply_secret_patches(base: dict, body: dict, field: str) -> dict | web.Response:
        mapping = dict(base.get(field) or {})
        set_key = f"{field}_set"
        remove_key = f"{field}_remove"
        set_ops = body[set_key] if set_key in body else {}
        remove_ops = body[remove_key] if remove_key in body else []
        if not isinstance(set_ops, dict) or not isinstance(remove_ops, list):
            return web.json_response(
                {"error": f"{field}_set must be an object and {field}_remove a list"},
                status=400,
            )
        if contains_redaction_mask(set_ops):
            return web.json_response(
                {"error": f"{field}_set contains a redaction mask; secrets must be re-entered"},
                status=400,
            )
        for key, value in set_ops.items():
            mapping[str(key)] = str(value)
        for key in remove_ops:
            mapping.pop(str(key), None)
        return mapping

    _plain_fields = (
        "transport",
        "command",
        "args",
        "url",
        "cwd",
        "timeout_seconds",
        "enabled",
        "tool_allowlist",
    )

    def _compose_config(base: dict, body: dict) -> dict | web.Response:
        config = dict(base)
        for field in _plain_fields:
            if field in body:
                config[field] = body[field]
        headers = _apply_secret_patches(config, body, "headers")
        if isinstance(headers, web.Response):
            return headers
        env = _apply_secret_patches(config, body, "env")
        if isinstance(env, web.Response):
            return env
        config["headers"] = headers
        config["env"] = env
        try:
            config = MCPServerConfig(**config).model_dump()
        except Exception as exc:
            return web.json_response({"error": _sanitized(str(exc))}, status=400)
        return config

    def _mutation_response(name: str, *, saved: bool) -> web.Response:
        row = _server_row(name)
        return web.json_response(
            {
                "saved": saved,
                "connected": bool(row and row["state"] == "connected"),
                "state": row["state"] if row else "unknown",
                "last_error": _sanitized(row["last_error"]) if row else "",
            },
            status=201 if saved else 500,
        )

    # ------------------------------------------------------------------
    # The four original paths keep their registration positions (parity).
    # ------------------------------------------------------------------

    @routes.get("/api/mcp/servers")
    async def list_mcp_servers(_request: web.Request) -> web.Response:
        return web.json_response({"servers": _manager().get_status()["servers"]})

    @routes.get("/api/mcp/servers/{name}/tools")
    async def list_mcp_server_tools(request: web.Request) -> web.Response:
        try:
            tools = _manager().server_tools(request.match_info["name"])
        except MCPConfigError as exc:
            return web.json_response({"error": _sanitized(str(exc))}, status=404)
        return web.json_response({"server": request.match_info["name"], "tools": tools})

    @routes.post("/api/mcp/servers")
    async def add_mcp_server(request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        name = str(body.get("name", "")).strip()
        if not name:
            return web.json_response({"error": "name is required"}, status=400)
        composed = _compose_config({}, body)
        if isinstance(composed, web.Response):
            return composed
        try:
            validate_server_config(name, composed)
        except MCPConfigError as exc:
            return web.json_response({"error": _sanitized(str(exc))}, status=400)

        commit_started = asyncio.Event()

        async def mutate():
            async with management_lock:
                async with config_transaction():
                    servers = _live_servers()
                    if name in servers or name in _manager().desired_servers():
                        return (
                            web.json_response(
                                {"error": f"server '{name}' already exists"}, status=409
                            ),
                            False,
                        )
                    servers[name] = composed
                    transition, writer_cancelled = await _commit_desired(
                        servers,
                        enabled=bool(bot.config.mcp.enabled),
                        commit_started=commit_started,
                    )
                await _manager().finish_desired_state(transition)
                return _mutation_response(name, saved=True), writer_cancelled

        response, writer_cancelled = await _drain_mcp_management(
            mutate(), commit_started=commit_started
        )
        if writer_cancelled:
            raise asyncio.CancelledError
        return response

    @routes.delete("/api/mcp/servers/{name}")
    async def remove_mcp_server(request: web.Request) -> web.Response:
        name = request.match_info["name"]
        commit_started = asyncio.Event()

        async def mutate():
            async with management_lock:
                async with config_transaction():
                    servers = _live_servers()
                    if name not in servers:
                        return web.json_response({"error": "server not found"}, status=404), False
                    servers.pop(name)
                    transition, writer_cancelled = await _commit_desired(
                        servers,
                        enabled=bool(bot.config.mcp.enabled),
                        commit_started=commit_started,
                    )
                await _manager().finish_desired_state(transition)
                return web.json_response({"saved": True, "removed": name}), writer_cancelled

        response, writer_cancelled = await _drain_mcp_management(
            mutate(), commit_started=commit_started
        )
        if writer_cancelled:
            raise asyncio.CancelledError
        return response

    # ------------------------------------------------------------------
    # P4 additions (appended after the original four paths).
    # ------------------------------------------------------------------

    @routes.put("/api/mcp/servers/{name}")
    async def update_mcp_server(request: web.Request) -> web.Response:
        name = request.match_info["name"]
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        commit_started = asyncio.Event()

        async def mutate():
            async with management_lock:
                async with config_transaction():
                    servers = _live_servers()
                    base = servers.get(name)
                    if base is None:
                        return web.json_response({"error": "server not found"}, status=404), False
                    composed = _compose_config(base, body)
                    if isinstance(composed, web.Response):
                        return composed, False
                    try:
                        validate_server_config(name, composed)
                    except MCPConfigError as exc:
                        return (
                            web.json_response({"error": _sanitized(str(exc))}, status=400),
                            False,
                        )
                    servers[name] = composed
                    transition, writer_cancelled = await _commit_desired(
                        servers,
                        enabled=bool(bot.config.mcp.enabled),
                        commit_started=commit_started,
                    )
                await _manager().finish_desired_state(transition)
                return _mutation_response(name, saved=True), writer_cancelled

        response, writer_cancelled = await _drain_mcp_management(
            mutate(), commit_started=commit_started
        )
        if writer_cancelled:
            raise asyncio.CancelledError
        return response

    @routes.post("/api/mcp/servers/{name}/reconnect")
    async def reconnect_mcp_server(request: web.Request) -> web.Response:
        try:
            await _manager().reconnect_server(request.match_info["name"])
        except MCPConfigError as exc:
            return web.json_response({"error": _sanitized(str(exc))}, status=404)
        return _mutation_response(request.match_info["name"], saved=True)

    @routes.post("/api/mcp/servers/{name}/refresh-tools")
    async def refresh_mcp_server_tools(request: web.Request) -> web.Response:
        try:
            await _manager().refresh_server_tools(request.match_info["name"])
        except MCPConfigError as exc:
            return web.json_response({"error": _sanitized(str(exc))}, status=404)
        return _mutation_response(request.match_info["name"], saved=True)

    @routes.get("/api/mcp/status")
    async def mcp_status(_request: web.Request) -> web.Response:
        # ALWAYS works — including globally disabled (the control plane is
        # always present; disabled is a truthful state, not an error).
        return web.json_response(_manager().get_status())

    @routes.post("/api/mcp/enabled")
    async def set_mcp_enabled(request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        if not isinstance(body.get("enabled"), bool):
            return web.json_response({"error": "enabled must be a boolean"}, status=400)
        enabled = body["enabled"]
        commit_started = asyncio.Event()

        async def mutate():
            async with management_lock:
                async with config_transaction():
                    transition, writer_cancelled = await _commit_desired(
                        _live_servers(), enabled=enabled, commit_started=commit_started
                    )
                await _manager().finish_desired_state(transition)
                status = _manager().get_status()
                return (
                    web.json_response(
                        {
                            "saved": True,
                            "enabled": status["enabled"],
                            "connected_count": status["connected_count"],
                        }
                    ),
                    writer_cancelled,
                )

        response, writer_cancelled = await _drain_mcp_management(
            mutate(), commit_started=commit_started
        )
        if writer_cancelled:
            raise asyncio.CancelledError
        return response

    @routes.post("/api/mcp/servers/{name}/enabled")
    async def set_mcp_server_enabled(request: web.Request) -> web.Response:
        """Single-purpose per-server switch (panel card toggle).

        Mutates ONLY ``enabled`` from transaction-current configuration —
        never transport or any other field, so a toggle can never overwrite a
        concurrent edit. Repeating the current value is idempotent (no
        reconnect). A server disabled here is unpublished before the response
        reports it disabled. Returns the canonical refreshed status payload
        so card and aggregate render from one source of truth.
        """
        name = request.match_info["name"]
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        if not isinstance(body, dict) or not isinstance(body.get("enabled"), bool):
            return web.json_response({"error": "enabled must be a boolean"}, status=400)
        extra = sorted(set(body) - {"enabled"})
        if extra:
            return web.json_response(
                {"error": f"only 'enabled' is accepted on this route (got: {', '.join(extra)})"},
                status=400,
            )
        enabled = body["enabled"]
        commit_started = asyncio.Event()

        async def mutate():
            async with management_lock:
                async with config_transaction():
                    servers = _live_servers()
                    current = servers.get(name)
                    if current is None:
                        return web.json_response({"error": "server not found"}, status=404), False
                    if bool(current.get("enabled", True)) == enabled:
                        # Idempotent repeat: no persist, no reconnect.
                        return web.json_response(_manager().get_status()), False
                    servers[name] = {**current, "enabled": enabled}
                    transition, writer_cancelled = await _commit_desired(
                        servers,
                        enabled=bool(bot.config.mcp.enabled),
                        commit_started=commit_started,
                    )
                await _manager().finish_desired_state(transition)
                return web.json_response(_manager().get_status()), writer_cancelled

        response, writer_cancelled = await _drain_mcp_management(
            mutate(), commit_started=commit_started
        )
        if writer_cancelled:
            raise asyncio.CancelledError
        return response


def register_slack(routes: web.RouteTableDef, bot) -> None:
    """Slack notifications (verbatim from the monolith)."""
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


def register_issue_tracker(routes: web.RouteTableDef, bot) -> None:
    """Issue tracker (Linear / Jira) (verbatim from the monolith)."""
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


def register_grafana_alerts(routes: web.RouteTableDef, bot) -> None:
    """Grafana alerts (verbatim from the monolith)."""
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


def register_outbound_webhooks(routes: web.RouteTableDef, bot) -> None:
    """Outbound webhooks (CRUD + test + stats) (verbatim from the monolith)."""
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
