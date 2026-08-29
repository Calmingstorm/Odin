"""Component health checker for the Odin web management dashboard.

Probes all bot subsystems and returns a structured health report suitable
for the ``/api/health/components`` endpoint and the web UI health page.
Each component reports: name, healthy (bool), status label, detail string,
and optional metadata dict.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC
from typing import TYPE_CHECKING, Any

from ..odin_log import get_logger

if TYPE_CHECKING:
    from ..discord.client import OdinBot
    from .subsystem_guard import SubsystemGuard

log = get_logger("health.checker")


@dataclass
class ComponentStatus:
    name: str
    healthy: bool
    status: str  # "ok", "degraded", "down", "unconfigured"
    detail: str
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "name": self.name,
            "healthy": self.healthy,
            "status": self.status,
            "detail": self.detail,
        }
        if self.metadata:
            d["metadata"] = self.metadata
        return d


def check_discord(bot: OdinBot) -> ComponentStatus:
    try:
        ready = bot.is_ready()
        guild_count = len(bot.guilds)
        user_count = sum(g.member_count or 0 for g in bot.guilds)
        if ready:
            return ComponentStatus(
                name="discord",
                healthy=True,
                status="ok",
                detail=f"Online — {guild_count} guild(s), {user_count} users",
                metadata={"guild_count": guild_count, "user_count": user_count},
            )
        return ComponentStatus(
            name="discord",
            healthy=False,
            status="degraded",
            detail="Gateway not ready",
        )
    except Exception as exc:
        return ComponentStatus(
            name="discord",
            healthy=False,
            status="down",
            detail=f"Error: {exc}",
        )


def check_codex(bot: OdinBot) -> ComponentStatus:
    codex = getattr(getattr(bot, "llm_gateway", None), "codex_client", None)
    if codex is None:
        cfg = getattr(bot, "config", None)
        codex_cfg = getattr(cfg, "openai_codex", None) if cfg else None
        enabled = codex_cfg.enabled if codex_cfg else False
        if not enabled:
            return ComponentStatus(
                name="codex",
                healthy=True,
                status="unconfigured",
                detail="Codex disabled in config (optional)",
            )
        return ComponentStatus(
            name="codex",
            healthy=False,
            status="down",
            detail="Codex enabled but no credentials configured",
        )
    try:
        breaker = getattr(codex, "breaker", None)
        breaker_state = breaker.state if breaker else "unknown"
        pool_metrics = codex.get_pool_metrics()
        session = getattr(codex, "_session", None)
        # The aiohttp session is created lazily on first request. None (or a
        # not-yet-opened session) is healthy — only an EXPLICITLY closed
        # session indicates a problem.
        session_closed = session is not None and getattr(session, "closed", False)

        healthy = breaker_state in ("closed", "half_open") and not session_closed
        if breaker_state == "open":
            status_label = "down"
            detail = "Circuit breaker OPEN — API failures detected"
        elif breaker_state == "half_open":
            status_label = "degraded"
            detail = "Circuit breaker half-open — probing recovery"
        elif session_closed:
            status_label = "degraded"
            detail = "HTTP session was closed unexpectedly"
        elif session is None:
            status_label = "ok"
            detail = "Initialised — HTTP session will open on first request (lazy)"
        else:
            status_label = "ok"
            detail = f"Healthy — {pool_metrics.get('http_pool_total_requests', 0)} total requests"

        return ComponentStatus(
            name="codex",
            healthy=healthy,
            status=status_label,
            detail=detail,
            metadata={
                "circuit_breaker": breaker_state,
                "model": getattr(codex, "model", "unknown"),
                **pool_metrics,
            },
        )
    except Exception as exc:
        return ComponentStatus(
            name="codex",
            healthy=False,
            status="down",
            detail=f"Error probing Codex: {exc}",
        )


def check_sessions(bot: OdinBot) -> ComponentStatus:
    sessions = getattr(bot, "sessions", None)
    if sessions is None:
        return ComponentStatus(
            name="sessions",
            healthy=False,
            status="down",
            detail="Session manager not initialised",
        )
    try:
        count = sessions.count() if hasattr(sessions, "count") else 0
        token_metrics = {}
        if hasattr(sessions, "get_token_metrics"):
            token_metrics = sessions.get_token_metrics()
        total_tokens = token_metrics.get("total_tokens", 0)
        over_budget = token_metrics.get("over_budget_count", 0)

        if over_budget > 0:
            return ComponentStatus(
                name="sessions",
                healthy=False,
                status="degraded",
                detail=f"{count} active, {over_budget} over token budget",
                metadata={"count": count, "total_tokens": total_tokens, "over_budget": over_budget},
            )
        return ComponentStatus(
            name="sessions",
            healthy=True,
            status="ok",
            detail=f"{count} active session(s), {total_tokens} total tokens",
            metadata={"count": count, "total_tokens": total_tokens},
        )
    except Exception as exc:
        return ComponentStatus(
            name="sessions",
            healthy=False,
            status="down",
            detail=f"Error: {exc}",
        )


def check_knowledge(bot: OdinBot) -> ComponentStatus:
    knowledge = getattr(bot, "knowledge", None)
    if knowledge is None:
        return ComponentStatus(
            name="knowledge",
            healthy=False,
            status="unconfigured",
            detail="Knowledge store not initialised",
        )
    try:
        available = knowledge.available
        if not available:
            return ComponentStatus(
                name="knowledge",
                healthy=False,
                status="down",
                detail="SQLite connection closed",
            )
        chunk_count = knowledge.count()
        has_vec = getattr(knowledge, "_has_vec", False)
        search_mode = "vector + FTS" if has_vec else "FTS only"
        return ComponentStatus(
            name="knowledge",
            healthy=True,
            status="ok",
            detail=f"{chunk_count} chunks indexed ({search_mode})",
            metadata={"chunks": chunk_count, "vector_search": has_vec},
        )
    except Exception as exc:
        return ComponentStatus(
            name="knowledge",
            healthy=False,
            status="down",
            detail=f"Error: {exc}",
        )


def check_ssh_hosts(bot: OdinBot) -> ComponentStatus:
    executor = getattr(bot, "tool_executor", None)
    if executor is None:
        return ComponentStatus(
            name="ssh_hosts",
            healthy=True,
            status="unconfigured",
            detail="Tool executor not initialised",
        )
    try:
        config = executor.config
        hosts = config.hosts
        if not hosts:
            return ComponentStatus(
                name="ssh_hosts",
                healthy=True,
                status="unconfigured",
                detail="No SSH hosts configured",
            )
        host_list = []
        for alias, host_cfg in hosts.items():
            host_list.append(
                {
                    "alias": alias,
                    "address": host_cfg.address,
                    "ssh_user": host_cfg.ssh_user,
                    "os": host_cfg.os,
                }
            )

        pool = executor.ssh_pool
        pool_metrics = {}
        if pool:
            pool_metrics = pool.get_metrics()
            active_hosts = pool_metrics.get("active_hosts", [])
            for h in host_list:
                key = f"{h['ssh_user']}@{h['address']}"
                h["pool_connected"] = key in active_hosts
        else:
            for h in host_list:
                h["pool_connected"] = None

        return ComponentStatus(
            name="ssh_hosts",
            healthy=True,
            status="ok",
            detail=f"{len(hosts)} host(s) configured",
            metadata={
                "hosts": host_list,
                "pool_enabled": pool is not None,
                **(
                    {k: v for k, v in pool_metrics.items() if k != "active_hosts"}
                    if pool_metrics
                    else {}
                ),
            },
        )
    except Exception as exc:
        return ComponentStatus(
            name="ssh_hosts",
            healthy=False,
            status="down",
            detail=f"Error: {exc}",
        )


def check_browser(bot: OdinBot) -> ComponentStatus:
    executor = getattr(bot, "tool_executor", None)
    browser_mgr = getattr(executor, "_browser_manager", None) if executor else None
    if browser_mgr is None:
        return ComponentStatus(
            name="browser",
            healthy=True,
            status="unconfigured",
            detail="Browser automation not enabled",
        )
    try:
        browser = getattr(browser_mgr, "_browser", None)
        connected = (
            browser is not None and hasattr(browser, "is_connected") and browser.is_connected()
        )
        if connected:
            return ComponentStatus(
                name="browser",
                healthy=True,
                status="ok",
                detail="Playwright browser connected",
            )
        # Browser hasn't been used yet — Playwright opens lazily on the first
        # browser_screenshot/browser_goto call. Treat as ok rather than degraded.
        return ComponentStatus(
            name="browser",
            healthy=True,
            status="ok",
            detail="Browser configured — will connect on first use (lazy)",
        )
    except Exception as exc:
        return ComponentStatus(
            name="browser",
            healthy=False,
            status="down",
            detail=f"Error: {exc}",
        )


def check_scheduler(bot: OdinBot) -> ComponentStatus:
    scheduler = getattr(bot, "scheduler", None)
    if scheduler is None:
        return ComponentStatus(
            name="scheduler",
            healthy=True,
            status="unconfigured",
            detail="Scheduler not initialised",
        )
    try:
        all_tasks = scheduler.list_all()
        count = len(all_tasks) if all_tasks else 0
        return ComponentStatus(
            name="scheduler",
            healthy=True,
            status="ok",
            detail=f"{count} scheduled task(s)",
            metadata={"count": count},
        )
    except Exception as exc:
        return ComponentStatus(
            name="scheduler",
            healthy=False,
            status="down",
            detail=f"Error: {exc}",
        )


def check_loops(bot: OdinBot) -> ComponentStatus:
    loop_mgr = getattr(bot, "loop_manager", None)
    if loop_mgr is None:
        return ComponentStatus(
            name="loops",
            healthy=True,
            status="unconfigured",
            detail="Loop manager not initialised",
        )
    try:
        active = loop_mgr.active_count
        return ComponentStatus(
            name="loops",
            healthy=True,
            status="ok",
            detail=f"{active} active loop(s)",
            metadata={"active": active},
        )
    except Exception as exc:
        return ComponentStatus(
            name="loops",
            healthy=False,
            status="down",
            detail=f"Error: {exc}",
        )


def check_agents(bot: OdinBot) -> ComponentStatus:
    agent_mgr = getattr(bot, "agent_manager", None)
    if agent_mgr is None:
        return ComponentStatus(
            name="agents",
            healthy=True,
            status="unconfigured",
            detail="Agent manager not initialised",
        )
    try:
        agents = getattr(agent_mgr, "_agents", {})
        if not isinstance(agents, dict):
            agents = {}
        total = len(agents)
        running = sum(1 for a in agents.values() if a.status == "running")
        return ComponentStatus(
            name="agents",
            healthy=True,
            status="ok",
            detail=f"{running} running, {total} total",
            metadata={"running": running, "total": total},
        )
    except Exception as exc:
        return ComponentStatus(
            name="agents",
            healthy=False,
            status="down",
            detail=f"Error: {exc}",
        )


def check_ollama(bot: OdinBot) -> ComponentStatus:
    from ..llm.ollama import OllamaClient

    ollama = getattr(getattr(bot, "llm_gateway", None), "ollama_client", None)
    if not isinstance(ollama, OllamaClient):
        return ComponentStatus(
            name="ollama",
            healthy=True,
            status="unconfigured",
            detail="Ollama client not configured (optional)",
        )
    try:
        breaker = getattr(ollama, "breaker", None)
        breaker_state = str(breaker.state) if breaker else "unknown"
        stats = ollama.pool_stats()
        healthy = breaker_state in ("closed", "half_open")
        if breaker_state == "open":
            status_label = "down"
            detail = "Circuit breaker OPEN — Ollama API failures detected"
        elif breaker_state == "half_open":
            status_label = "degraded"
            detail = "Circuit breaker half-open — probing recovery"
        else:
            status_label = "ok"
            detail = f"Healthy — {stats.get('total_requests', 0)} total requests"
        return ComponentStatus(
            name="ollama",
            healthy=healthy,
            status=status_label,
            detail=detail,
            metadata={
                "circuit_breaker": breaker_state,
                "model": getattr(ollama, "model", "unknown"),
                "base_url": getattr(ollama, "base_url", ""),
                **stats,
            },
        )
    except Exception as exc:
        return ComponentStatus(
            name="ollama",
            healthy=False,
            status="down",
            detail=f"Error probing Ollama: {exc}",
        )


def check_kimi(bot: OdinBot) -> ComponentStatus:
    from ..llm.kimi import KimiClient

    kimi = getattr(getattr(bot, "llm_gateway", None), "kimi_client", None)
    if not isinstance(kimi, KimiClient):
        return ComponentStatus(
            name="kimi",
            healthy=True,
            status="unconfigured",
            detail="Kimi client not configured (optional)",
        )
    try:
        breaker = getattr(kimi, "breaker", None)
        breaker_state = str(breaker.state) if breaker else "unknown"
        stats = kimi.pool_stats()
        healthy = breaker_state in ("closed", "half_open")
        if breaker_state == "open":
            status_label = "down"
            detail = "Circuit breaker OPEN — Kimi API failures detected"
        elif breaker_state == "half_open":
            status_label = "degraded"
            detail = "Circuit breaker half-open — probing recovery"
        else:
            status_label = "ok"
            detail = f"Healthy — {stats.get('total_requests', 0)} total requests"
        return ComponentStatus(
            name="kimi",
            healthy=healthy,
            status=status_label,
            detail=detail,
            metadata={
                "circuit_breaker": breaker_state,
                "model": getattr(kimi, "model", "unknown"),
                **stats,
            },
        )
    except Exception as exc:
        return ComponentStatus(
            name="kimi",
            healthy=False,
            status="down",
            detail=f"Error probing Kimi: {exc}",
        )


# Ordered list of all checkers
def check_mcp(bot: OdinBot) -> ComponentStatus:
    """MCP control plane — always present; disabled is a truthful state,
    never an error. A failed optional MCP server degrades, it does not mark
    Odin unhealthy."""
    manager = getattr(bot, "mcp_manager", None)
    if manager is None:
        return ComponentStatus(
            name="mcp",
            healthy=True,
            status="unconfigured",
            detail="MCP control plane not initialised",
        )
    try:
        status = manager.get_status()
    except Exception as exc:
        return ComponentStatus(
            name="mcp",
            healthy=False,
            status="down",
            detail=f"Error: {exc}",
        )
    if not isinstance(status, dict):
        return ComponentStatus(
            name="mcp",
            healthy=False,
            status="down",
            detail="Manager returned an unexpected status shape",
        )
    configured = status.get("server_count", 0)
    enabled_servers = status.get("enabled_server_count", configured)
    connected = status.get("connected_count", 0)
    published = status.get("published_tool_count", 0)
    metadata = {
        "enabled": status.get("enabled", False),
        "servers": configured,
        "enabled_servers": enabled_servers,
        "connected": connected,
        "published_tools": published,
    }
    if not status.get("enabled"):
        return ComponentStatus(
            name="mcp",
            healthy=True,
            status="unconfigured",
            detail="MCP disabled",
            metadata=metadata,
        )
    if configured == 0:
        return ComponentStatus(
            name="mcp",
            healthy=True,
            status="ok",
            detail="Enabled, no servers configured",
            metadata=metadata,
        )
    detail = (
        f"{connected}/{enabled_servers} enabled server(s) connected, {published} tool(s) published"
    )
    if connected == enabled_servers:
        return ComponentStatus(
            name="mcp",
            healthy=True,
            status="ok",
            detail=detail,
            metadata=metadata,
        )
    return ComponentStatus(
        name="mcp",
        healthy=True,
        status="degraded",
        detail=detail,
        metadata=metadata,
    )


_ALL_CHECKERS = [
    check_discord,
    check_codex,
    check_ollama,
    check_kimi,
    check_sessions,
    check_knowledge,
    check_ssh_hosts,
    check_browser,
    check_scheduler,
    check_loops,
    check_agents,
    check_mcp,
]


def check_all(bot: OdinBot) -> dict[str, Any]:
    """Run all component health checks and return a summary.

    Returns a dict with:
    - ``overall``: "healthy", "degraded", or "unhealthy"
    - ``components``: list of per-component dicts
    - ``healthy_count``, ``degraded_count``, ``down_count``, ``total``
    - ``checked_at``: ISO timestamp
    """
    results: list[dict[str, Any]] = []
    for checker in _ALL_CHECKERS:
        try:
            status = checker(bot)
            results.append(status.to_dict())
        except Exception as exc:
            results.append(
                {
                    "name": checker.__name__.replace("check_", ""),
                    "healthy": False,
                    "status": "down",
                    "detail": f"Checker crashed: {exc}",
                }
            )

    healthy_count = sum(1 for r in results if r["status"] == "ok")
    degraded_count = sum(1 for r in results if r["status"] == "degraded")
    down_count = sum(1 for r in results if r["status"] == "down")
    unconfigured_count = sum(1 for r in results if r["status"] == "unconfigured")

    if down_count > 0:
        overall = "unhealthy"
    elif degraded_count > 0:
        overall = "degraded"
    else:
        overall = "healthy"

    from datetime import datetime

    return {
        "overall": overall,
        "components": results,
        "healthy_count": healthy_count,
        "degraded_count": degraded_count,
        "down_count": down_count,
        "unconfigured_count": unconfigured_count,
        "total": len(results),
        "checked_at": datetime.now(UTC).isoformat(),
    }


def sync_guard_from_health(
    health_results: dict[str, Any],
    guard: SubsystemGuard,
) -> None:
    """Bridge health check results into a SubsystemGuard.

    Reads the ``components`` list from *health_results* and calls
    ``record_failure`` / ``record_success`` on the guard for each
    component that is registered with it.  Components in "unconfigured"
    status are ignored (they were never meant to run).

    The ``SubsystemGuard`` annotation is TYPE_CHECKING-only to avoid a
    circular import at runtime.
    """
    components = health_results.get("components", [])
    for comp in components:
        name = comp.get("name", "")
        status_label = comp.get("status", "")
        detail = comp.get("detail", "")

        # Only touch subsystems the guard already tracks
        if not hasattr(guard, "get_state") or guard.get_state(name) is None:
            continue

        if status_label == "unconfigured":
            continue

        if status_label == "down":
            guard.record_failure(name, detail)
        elif status_label == "degraded":
            guard.record_failure(name, detail)
        elif status_label == "ok":
            guard.record_success(name)
