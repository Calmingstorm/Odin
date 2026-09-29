"""Native monitoring removal preserves upgrades and component health."""
from __future__ import annotations

from types import SimpleNamespace

from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import Config, WebConfig, WebhookConfig
from src.health.server import AUTH_PUBLIC_PREFIXES, HealthServer
from src.tools.defs.media_scheduling import TOOLS_SECTION as TOOLS
from src.tools.skill_context import SkillContext


def test_removed_settings_are_inert_and_neighbors_survive():
    config = Config.model_validate({
        "discord": {"token": "fixture"},
        "grafana_alerts": {"auto_remediate": True, "rules": [{"id": "old"}]},
        "webhook": {"grafana_channel_id": "old", "enabled": True, "channel_id": "kept"},
    })
    assert not hasattr(config, "grafana_alerts")
    assert not hasattr(config.webhook, "grafana_channel_id")
    assert config.webhook.enabled
    assert config.webhook.channel_id == "kept"
    assert "grafana_alerts" not in config.model_dump()


def test_scheduling_catalog_no_longer_advertises_removed_trigger():
    for tool in TOOLS:
        if tool["name"] in {"schedule_task", "update_schedule"}:
            trigger = tool["input_schema"]["properties"]["trigger"]["properties"]
            assert "grafana" not in trigger["source"]["enum"]
            assert "alert_name" not in trigger
    assert not hasattr(SkillContext, "query_prometheus")
    assert "/metrics" not in AUTH_PUBLIC_PREFIXES


async def test_removed_routes_absent_but_component_health_remains():
    server = HealthServer(
        webhook_config=WebhookConfig(enabled=True), web_config=WebConfig(enabled=False),
    )
    server.set_ready()
    server.register_component("fixture", lambda: (True, "healthy"))
    assert not hasattr(server, "metrics")
    async with TestClient(TestServer(server._app)) as client:
        for path in ("/metrics", "/api/grafana-alerts/status"):
            assert (await client.get(path)).status == 404
        assert (await client.post("/webhook/grafana", json={})).status == 404
        response = await client.get("/health/ready")
        assert response.status == 200
        body = await response.json()
        assert body["components"]["fixture"] == {"healthy": True, "detail": "healthy"}


def test_startup_wires_component_health_without_a_metrics_collector():
    from src.__main__ import _wire_observability

    components = {}
    health = SimpleNamespace(
        register_component=lambda name, check: components.setdefault(name, check),
    )
    bot = SimpleNamespace(
        config=SimpleNamespace(discord=SimpleNamespace(token="configured")),
        latency=0.01,
        is_ready=lambda: True,
    )

    _wire_observability(health, bot, SimpleNamespace(info=lambda _message: None))

    assert set(components) == {"discord"}
    assert components["discord"]() == (True, "latency=10ms")
