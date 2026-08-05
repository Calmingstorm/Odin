"""Cross-language contract for the Internals cards and their API payloads.

These cards previously rendered zeros because the template guessed names such
as ``riskStats.total`` while the server returned ``riskStats.totals``. Exact
server shapes and the matching Vue bindings are pinned together here so either
side changing alone fails loudly.
"""

from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.llm.kimi import KimiClient
from src.llm.ollama import OllamaClient
from src.llm.openai_codex import CodexChatClient
from src.tools.branch_freshness import FreshnessEvent, FreshnessStats
from src.tools.recovery import RecoveryCategory, RecoveryStats
from src.tools.risk_classifier import RiskAssessment, RiskLevel, RiskStats
from src.tools.ssh_pool import SSHConnectionPool
from src.web.api.llm_admin import register_connection_pools
from src.web.api.observability import (
    register_branch_freshness,
    register_recovery_stats,
    register_risk_classification,
)

INTERNALS_SOURCE = Path("ui/js/pages/internals.js").read_text(encoding="utf-8")


def _assert_bound(prefix: str, keys: set[str]) -> None:
    for key in keys:
        optional = f"{prefix}?.{key}"
        direct = f"{prefix}.{key}"
        assert direct in INTERNALS_SOURCE or optional in INTERNALS_SOURCE, (
            f"Internals does not bind {direct} from the server payload"
        )


def test_ssh_pool_response_shape_is_bound(tmp_path):
    payload = SSHConnectionPool(socket_dir=str(tmp_path)).get_metrics()
    expected = {
        "active_connections",
        "active_hosts",
        "total_opened",
        "total_reused",
        "control_persist",
        "socket_dir",
    }
    assert set(payload) == expected
    _assert_bound(
        "sshPool",
        {"active_connections", "active_hosts", "total_opened", "total_reused"},
    )


def test_provider_keyed_http_pool_shapes_are_bound():
    codex = CodexChatClient(cast(Any, object()), "test-model").get_pool_metrics()
    ollama = OllamaClient().pool_stats()
    kimi = KimiClient(api_key="test").pool_stats()

    assert set(codex) == {
        "http_pool_max_connections",
        "http_pool_keepalive_timeout",
        "http_pool_active_connections",
        "http_pool_total_requests",
    }
    assert set(ollama) == {"provider", "base_url", "model", "total_requests"}
    assert set(kimi) == {"provider", "base_url", "model", "total_requests"}
    assert "v-for=\"(pool, provider) in httpPool\"" in INTERNALS_SOURCE
    _assert_bound("pool", set(codex))
    _assert_bound("pool", {"model", "total_requests"})


def test_risk_totals_response_shape_is_bound():
    stats = RiskStats()
    for level in RiskLevel:
        stats.record("run_command", RiskAssessment(level, "contract"))
    payload = stats.get_summary()

    assert set(payload) == {"totals", "by_tool"}
    assert set(payload["totals"]) == {level.value for level in RiskLevel}
    _assert_bound("riskStats.totals", {level.value for level in RiskLevel})


def test_recovery_totals_response_shape_is_bound():
    stats = RecoveryStats()
    stats.record_attempt("run_command", RecoveryCategory.TIMEOUT)
    stats.record_success("run_command", RecoveryCategory.TIMEOUT)
    stats.record_failure("run_command", RecoveryCategory.TIMEOUT)
    payload = stats.get_summary()

    assert set(payload) == {"by_category", "by_tool", "totals"}
    assert set(payload["totals"]) == {"attempts", "successes", "failures"}
    _assert_bound("recoveryStats.totals", set(payload["totals"]))


def test_stale_internals_bindings_do_not_return():
    for stale in (
        "sshPool.connections",
        "httpPool.connections",
        "riskStats.total ||",
        "recoveryStats.total ||",
        "freshnessStats.total ||",
        "freshnessStats.stale ||",
    ):
        assert stale not in INTERNALS_SOURCE


def test_freshness_response_shape_is_bound():
    stats = FreshnessStats()
    stats.record(FreshnessEvent("git_ops", "status", True, 1, "main"))
    stats.record_fetch_failure()
    payload = stats.get_summary()

    expected = {"total_checks", "stale_found", "fetch_failures"}
    assert set(payload) == expected
    _assert_bound("freshnessStats", expected)


@pytest.mark.asyncio
async def test_actual_internals_endpoints_preserve_the_bound_shapes(tmp_path):
    risk = RiskStats()
    risk.record("run_command", RiskAssessment(RiskLevel.HIGH, "contract"))
    recovery = RecoveryStats()
    recovery.record_attempt("run_command", RecoveryCategory.TIMEOUT)
    recovery.record_success("run_command", RecoveryCategory.TIMEOUT)
    freshness = FreshnessStats()
    freshness.record(FreshnessEvent("git_ops", "status", True, 1, "main"))

    tool_executor = SimpleNamespace(
        ssh_pool=SSHConnectionPool(socket_dir=str(tmp_path)),
        risk_stats=risk,
        recovery_stats=recovery,
        freshness_stats=freshness,
    )
    bot = SimpleNamespace(
        tool_executor=tool_executor,
        llm_gateway=SimpleNamespace(
            codex_client=CodexChatClient(cast(Any, object()), "test-model"),
            ollama_client=OllamaClient(),
            kimi_client=KimiClient(api_key="test"),
        ),
    )
    routes = web.RouteTableDef()
    for registrar in (
        register_connection_pools,
        register_risk_classification,
        register_recovery_stats,
        register_branch_freshness,
    ):
        registrar(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)

    async with TestClient(TestServer(app)) as client:
        ssh = await (await client.get("/api/pools/ssh")).json()
        http = await (await client.get("/api/pools/http")).json()
        risk_payload = await (await client.get("/api/risk/stats")).json()
        recovery_payload = await (await client.get("/api/recovery/stats")).json()
        freshness_payload = await (await client.get("/api/freshness/stats")).json()

    assert set(ssh) == {
        "active_connections", "active_hosts", "total_opened", "total_reused",
        "control_persist", "socket_dir",
    }
    assert set(http) == {"codex", "ollama", "kimi"}
    assert set(risk_payload) == {"totals", "by_tool"}
    assert set(recovery_payload["totals"]) == {"attempts", "successes", "failures"}
    assert set(freshness_payload) == {"total_checks", "stale_found", "fetch_failures"}
