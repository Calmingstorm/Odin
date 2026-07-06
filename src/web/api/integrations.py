"""External integration route registrars (RFC-003 P5 — carved verbatim from api/__init__).

Each ``register_*`` moves one section of the old monolith unchanged; the
composition root calls them at the sections' original positions, so the
route REGISTRATION ORDER (aiohttp path precedence) is exactly what the
parity contract pins.
"""

from __future__ import annotations

from aiohttp import web

from ...odin_log import get_logger
from ..api_common import (
    _safe_int_param,
    _validate_string,
)

log = get_logger("web.api")

def register_mcp_servers(routes: web.RouteTableDef, bot) -> None:
    """MCP servers (verbatim from the monolith)."""
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


