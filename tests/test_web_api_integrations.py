"""Route coverage for web/api/integrations.py (RFC-006 P4-continuation, CONT-1).

Per Odin's advisory: fake the remote services hard. These tests validate request
parsing, validation, and delegation/response shaping for MCP / Slack / issue
tracker / Grafana alerts / outbound webhooks — never the network. Each service
is a faked object; the "disabled" path is simply the attribute being absent.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.web.api.integrations import (
    register_grafana_alerts,
    register_issue_tracker,
    register_mcp_servers,
    register_outbound_webhooks,
    register_slack,
)


def _app(*registrars, bot):
    routes = web.RouteTableDef()
    for reg in registrars:
        reg(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    return app


def _bot(**attrs):
    """A plain bot object — unset service attrs read as None (the disabled path)."""
    bot = type("B", (), {})()
    for k, v in attrs.items():
        setattr(bot, k, v)
    return bot


# --------------------------------------------------------------------------- #
# MCP servers
# --------------------------------------------------------------------------- #
class TestMcpServers:
    """Route-shape pins for the live P4 management contract. Full
    persistence round-trips (disk truth, secret patch ops, fake-server
    reconciliation) live in tests/test_mcp_admin.py; these pin the thin
    route behaviors against a real (empty) control plane."""

    def _mcp_bot(self):
        from types import SimpleNamespace

        from src.config.schema import MCPConfig
        from src.tools.mcp import MCPManager

        bot = _bot()
        bot.mcp_manager = MCPManager()
        bot.config = SimpleNamespace(mcp=MCPConfig())
        return bot

    async def test_status_always_works_even_disabled(self):
        async with TestClient(TestServer(_app(register_mcp_servers, bot=self._mcp_bot()))) as c:
            response = await c.get("/api/mcp/status")
            assert response.status == 200
            body = await response.json()
            assert body["enabled"] is False
            assert body["servers"] == []

    async def test_list_and_unknown_lookups(self):
        async with TestClient(TestServer(_app(register_mcp_servers, bot=self._mcp_bot()))) as c:
            assert (await c.get("/api/mcp/servers")).status == 200
            assert (await c.get("/api/mcp/servers/ghost/tools")).status == 404
            assert (await c.put("/api/mcp/servers/ghost", json={})).status == 404
            assert (await c.delete("/api/mcp/servers/ghost")).status == 404
            assert (await c.post("/api/mcp/servers/ghost/reconnect")).status == 404
            assert (await c.post("/api/mcp/servers/ghost/refresh-tools")).status == 404

    async def test_add_validates_before_any_persistence(self):
        async with TestClient(TestServer(_app(register_mcp_servers, bot=self._mcp_bot()))) as c:
            assert (await c.post("/api/mcp/servers", json={})).status == 400
            response = await c.post(
                "/api/mcp/servers", json={"name": "x", "transport": "carrier-pigeon"}
            )
            assert response.status == 400

    async def test_mask_values_rejected(self):
        async with TestClient(TestServer(_app(register_mcp_servers, bot=self._mcp_bot()))) as c:
            response = await c.post(
                "/api/mcp/servers",
                json={
                    "name": "x",
                    "transport": "stdio",
                    "command": "/bin/true",
                    "headers_set": {"Authorization": "\u2022" * 8},
                },
            )
            assert response.status == 400
            assert "mask" in (await response.json())["error"]

    async def test_enabled_requires_boolean(self):
        async with TestClient(TestServer(_app(register_mcp_servers, bot=self._mcp_bot()))) as c:
            assert (await c.post("/api/mcp/enabled", json={"enabled": "yes"})).status == 400


class TestSlack:
    def _notifier(self):
        n = MagicMock()
        n.get_status.return_value = {"channel": "#ops"}
        n.send = AsyncMock(return_value=True)
        n.send_formatted = AsyncMock(return_value=True)
        return n

    async def test_status_disabled_and_enabled(self):
        async with TestClient(TestServer(_app(register_slack, bot=_bot()))) as c:
            assert (await (await c.get("/api/slack/status")).json())["enabled"] is False
        bot = _bot(health_server=SimpleNamespace(slack_notifier=self._notifier()))
        async with TestClient(TestServer(_app(register_slack, bot=bot))) as c:
            body = await (await c.get("/api/slack/status")).json()
            assert body["enabled"] is True and body["channel"] == "#ops"

    async def test_test_endpoint(self):
        async with TestClient(TestServer(_app(register_slack, bot=_bot()))) as c:
            assert (await c.post("/api/slack/test", json={})).status == 503
        bot = _bot(health_server=SimpleNamespace(slack_notifier=self._notifier()))
        async with TestClient(TestServer(_app(register_slack, bot=bot))) as c:
            r = await c.post("/api/slack/test", json={"message": "hi"})
            assert r.status == 200 and (await r.json())["sent"] is True
            # tolerates a non-JSON body (defaults to {})
            assert (await c.post("/api/slack/test", data="not json")).status == 200

    async def test_send_plain_and_formatted(self):
        notifier = self._notifier()
        bot = _bot(health_server=SimpleNamespace(slack_notifier=notifier))
        async with TestClient(TestServer(_app(register_slack, bot=bot))) as c:
            assert (await c.post("/api/slack/send", data="bad")).status == 400
            assert (await c.post("/api/slack/send", json={})).status == 400  # no text
            assert (await c.post("/api/slack/send", json={"text": "hello"})).status == 200
            notifier.send.assert_awaited()
            assert (
                await c.post("/api/slack/send", json={"text": "warn", "severity": "critical"})
            ).status == 200
            notifier.send_formatted.assert_awaited()

    async def test_send_disabled(self):
        async with TestClient(TestServer(_app(register_slack, bot=_bot()))) as c:
            assert (await c.post("/api/slack/send", json={"text": "x"})).status == 503


# --------------------------------------------------------------------------- #
# Issue tracker
# --------------------------------------------------------------------------- #
class TestIssueTracker:
    def _client(self):
        cl = MagicMock()
        cl.get_status.return_value = {"provider": "linear"}
        cl.execute = AsyncMock(return_value={"id": "ISS-1"})
        return cl

    async def test_status(self):
        async with TestClient(TestServer(_app(register_issue_tracker, bot=_bot()))) as c:
            assert (await (await c.get("/api/issues/status")).json())["enabled"] is False
        bot = _bot(_issue_tracker_client=self._client())
        async with TestClient(TestServer(_app(register_issue_tracker, bot=bot))) as c:
            assert (await (await c.get("/api/issues/status")).json())["provider"] == "linear"

    async def test_execute(self):
        async with TestClient(TestServer(_app(register_issue_tracker, bot=_bot()))) as c:
            assert (await c.post("/api/issues/execute", json={"action": "x"})).status == 503
        bot = _bot(_issue_tracker_client=self._client())
        async with TestClient(TestServer(_app(register_issue_tracker, bot=bot))) as c:
            assert (await c.post("/api/issues/execute", data="bad")).status == 400
            assert (await c.post("/api/issues/execute", json={})).status == 400  # no action
            r = await c.post("/api/issues/execute", json={"action": "list_issues"})
            assert r.status == 200 and (await r.json())["ok"] is True
            bot._issue_tracker_client.execute.side_effect = ValueError("bad action")
            assert (await c.post("/api/issues/execute", json={"action": "z"})).status == 400

    async def test_create(self):
        async with TestClient(TestServer(_app(register_issue_tracker, bot=_bot()))) as c:
            assert (await c.post("/api/issues/create", json={"title": "t"})).status == 503
        bot = _bot(_issue_tracker_client=self._client())
        async with TestClient(TestServer(_app(register_issue_tracker, bot=bot))) as c:
            assert (await c.post("/api/issues/create", data="bad")).status == 400
            assert (await c.post("/api/issues/create", json={})).status == 400  # no title
            r = await c.post("/api/issues/create", json={"title": "Fix bug"})
            assert r.status == 201 and (await r.json())["ok"] is True
            bot._issue_tracker_client.execute.side_effect = ValueError("nope")
            assert (await c.post("/api/issues/create", json={"title": "x"})).status == 400


# --------------------------------------------------------------------------- #
# Grafana alerts
# --------------------------------------------------------------------------- #
class TestGrafanaAlerts:
    def _handler(self):
        h = MagicMock()
        h.get_status.return_value = {"rules": 2}
        h.alert_history = [{"n": 1}, {"n": 2}, {"n": 3}]
        h.get_rules_list.return_value = [{"id": "r1"}]
        h.get_remediations_list.return_value = [{"id": "rem1"}]
        h.remove_rule.return_value = True
        return h

    async def test_status_and_disabled(self):
        async with TestClient(TestServer(_app(register_grafana_alerts, bot=_bot()))) as c:
            assert (await (await c.get("/api/grafana-alerts/status")).json())["enabled"] is False
            assert (await c.get("/api/grafana-alerts/history")).status == 503
            assert (await c.get("/api/grafana-alerts/rules")).status == 503
            assert (await c.post("/api/grafana-alerts/rules", json={})).status == 503
            assert (await c.delete("/api/grafana-alerts/rules/r1")).status == 503
            assert (await c.get("/api/grafana-alerts/remediations")).status == 503

    async def test_enabled_reads(self):
        bot = _bot(health_server=SimpleNamespace(grafana_handler=self._handler()))
        async with TestClient(TestServer(_app(register_grafana_alerts, bot=bot))) as c:
            assert (await (await c.get("/api/grafana-alerts/status")).json())["rules"] == 2
            hist = await (await c.get("/api/grafana-alerts/history?limit=2")).json()
            assert hist["total"] == 3 and len(hist["alerts"]) == 2
            rules = await (await c.get("/api/grafana-alerts/rules")).json()
            assert rules["rules"][0]["id"] == "r1"
            rems = await (await c.get("/api/grafana-alerts/remediations")).json()
            assert rems["remediations"][0]["id"] == "rem1"

    async def test_add_rule(self):
        handler = self._handler()
        bot = _bot(health_server=SimpleNamespace(grafana_handler=handler))
        async with TestClient(TestServer(_app(register_grafana_alerts, bot=bot))) as c:
            assert (await c.post("/api/grafana-alerts/rules", data="bad")).status == 400
            # missing name_pattern → 400
            assert (await c.post("/api/grafana-alerts/rules", json={"id": "r1"})).status == 400
            r = await c.post(
                "/api/grafana-alerts/rules",
                json={"id": "r1", "name_pattern": "CPU.*", "remediation_goal": "go"},
            )
            assert r.status == 201 and (await r.json())["rule"] == "r1"
            handler.add_rule.assert_called_once()
            # a rule the handler rejects surfaces as 400
            handler.add_rule.side_effect = ValueError("duplicate rule id")
            assert (
                await c.post(
                    "/api/grafana-alerts/rules", json={"id": "r2", "name_pattern": "Mem.*"}
                )
            ).status == 400

    async def test_delete_rule(self):
        handler = self._handler()
        bot = _bot(health_server=SimpleNamespace(grafana_handler=handler))
        async with TestClient(TestServer(_app(register_grafana_alerts, bot=bot))) as c:
            assert (await c.delete("/api/grafana-alerts/rules/r1")).status == 200
            handler.remove_rule.return_value = False
            assert (await c.delete("/api/grafana-alerts/rules/ghost")).status == 404


# --------------------------------------------------------------------------- #
# Outbound webhooks
# --------------------------------------------------------------------------- #
class TestOutboundWebhooks:
    def _dispatcher(self):
        d = MagicMock()
        d.get_status.return_value = {"count": 1}
        target = MagicMock()
        target.to_dict.return_value = {"id": "wh1", "name": "hook"}
        d.register.return_value = target
        d.update.return_value = target
        d.unregister.return_value = True
        d.send_test_event = AsyncMock(return_value=target)
        d.stats.as_dict.return_value = {"sent": 5}
        return d, target

    async def test_disabled_503(self):
        async with TestClient(TestServer(_app(register_outbound_webhooks, bot=_bot()))) as c:
            assert (await c.get("/api/outbound-webhooks")).status == 503
            assert (await c.post("/api/outbound-webhooks", json={})).status == 503
            assert (await c.put("/api/outbound-webhooks/x", json={})).status == 503
            assert (await c.delete("/api/outbound-webhooks/x")).status == 503
            assert (await c.post("/api/outbound-webhooks/x/test")).status == 503
            assert (await c.get("/api/outbound-webhooks/stats")).status == 503

    async def test_list_and_stats(self):
        d, _ = self._dispatcher()
        bot = _bot(outbound_webhook_dispatcher=d)
        async with TestClient(TestServer(_app(register_outbound_webhooks, bot=bot))) as c:
            assert (await (await c.get("/api/outbound-webhooks")).json())["count"] == 1
            assert (await (await c.get("/api/outbound-webhooks/stats")).json())["sent"] == 5

    async def test_create(self):
        d, _ = self._dispatcher()
        bot = _bot(outbound_webhook_dispatcher=d)
        async with TestClient(TestServer(_app(register_outbound_webhooks, bot=bot))) as c:
            assert (await c.post("/api/outbound-webhooks", data="bad")).status == 400
            # name is length-validated (max 128); an over-long name is rejected
            assert (await c.post("/api/outbound-webhooks", json={"name": "n" * 200})).status == 400
            r = await c.post(
                "/api/outbound-webhooks", json={"name": "hook", "url": "https://example.test/x"}
            )
            assert r.status == 201 and (await r.json())["id"] == "wh1"
            # dispatcher rejecting the target (e.g. bad url) surfaces as 400
            d.register.side_effect = ValueError("bad url")
            assert (await c.post("/api/outbound-webhooks", json={"name": "hook2"})).status == 400

    async def test_update(self):
        d, _ = self._dispatcher()
        bot = _bot(outbound_webhook_dispatcher=d)
        async with TestClient(TestServer(_app(register_outbound_webhooks, bot=bot))) as c:
            assert (await c.put("/api/outbound-webhooks/wh1", data="bad")).status == 400
            assert (await c.put("/api/outbound-webhooks/wh1", json={"name": "new"})).status == 200
            d.update.return_value = None
            assert (await c.put("/api/outbound-webhooks/ghost", json={})).status == 404
            d.update.side_effect = ValueError("bad")
            assert (await c.put("/api/outbound-webhooks/wh1", json={})).status == 400

    async def test_delete_and_test(self):
        d, _ = self._dispatcher()
        bot = _bot(outbound_webhook_dispatcher=d)
        async with TestClient(TestServer(_app(register_outbound_webhooks, bot=bot))) as c:
            assert (await c.delete("/api/outbound-webhooks/wh1")).status == 200
            d.unregister.return_value = False
            assert (await c.delete("/api/outbound-webhooks/ghost")).status == 404
            assert (await c.post("/api/outbound-webhooks/wh1/test")).status == 200
            d.send_test_event = AsyncMock(return_value=None)
            assert (await c.post("/api/outbound-webhooks/ghost/test")).status == 404
