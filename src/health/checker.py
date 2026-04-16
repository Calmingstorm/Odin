"""Component health checker for the Odin web management dashboard.

Probes all bot subsystems and returns a structured health report suitable
for the ``/api/health/components`` endpoint and the web UI health page.
Each component reports: name, healthy (bool), status label, detail string,
and optional metadata dict.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from ..odin_log import get_logger

if TYPE_CHECKING:
    from ..discord.client import OdinBot

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
            name="discord", healthy=False, status="degraded",
            detail="Gateway not ready",
        )
    except Exception as exc:
        return ComponentStatus(
            name="discord", healthy=False, status="down",
            detail=f"Error: {exc}",
        )


def check_codex(bot: OdinBot) -> ComponentStatus:
    codex = getattr(bot, "codex", None)
    if codex is None:
        return ComponentStatus(
            name="codex", healthy=False, status="down",
            detail="Codex client not initialised",
        )
    try:
        breaker = getattr(codex, "breaker", None)
        breaker_state = breaker.state if breaker else "unknown"
        pool_metrics = codex.get_pool_metrics()
        session = getattr(codex, "_session", None)
        session_ok = session is not None and not session.closed

        healthy = breaker_state in ("closed", "half_open") and session_ok
        if breaker_state == "open":
            status_label = "down"
            detail = "Circuit breaker OPEN — API failures detected"
        elif breaker_state == "half_open":
            status_label = "degraded"
            detail = "Circuit breaker half-open — probing recovery"
        elif not session_ok:
            status_label = "degraded"
            detail = "HTTP session closed or missing"
        else:
            status_label = "ok"
            detail = f"Healthy — {pool_metrics.get('http_pool_total_requests', 0)} total requests"

        return ComponentStatus(
            name="codex", healthy=healthy, status=status_label,
            detail=detail,
            metadata={
                "circuit_breaker": breaker_state,
                "model": getattr(codex, "model", "unknown"),
                **pool_metrics,
            },
        )
    except Exception as exc:
        return ComponentStatus(
            name="codex", healthy=False, status="down",
            detail=f"Error probing Codex: {exc}",
        )


def check_sessions(bot: OdinBot) -> ComponentStatus:
    sessions = getattr(bot, "sessions", None)
    if sessions is None:
        return ComponentStatus(
            name="sessions", healthy=False, status="down",
            detail="Session manager not initialised",
        )
    try:
        session_dict = getattr(sessions, "_sessions", {})
        count = len(session_dict) if isinstance(session_dict, dict) else 0
        token_metrics = {}
        if hasattr(sessions, "get_token_metrics"):
            token_metrics = sessions.get_token_metrics()
        total_tokens = token_metrics.get("total_tokens", 0)
        over_budget = token_metrics.get("over_budget_count", 0)

        if over_budget > 0:
            return ComponentStatus(
                name="sessions", healthy=False, status="degraded",
                detail=f"{count} active, {over_budget} over token budget",
                metadata={"count": count, "total_tokens": total_tokens, "over_budget": over_budget},
            )
        return ComponentStatus(
            name="sessions", healthy=True, status="ok",
            detail=f"{count} active session(s), {total_tokens} total tokens",
            metadata={"count": count, "total_tokens": total_tokens},
        )
    except Exception as exc:
        return ComponentStatus(
            name="sessions", healthy=False, status="down",
            detail=f"Error: {exc}",
        )


def check_knowledge(bot: OdinBot) -> ComponentStatus:
    knowledge = getattr(bot, "knowledge", None)
    if knowledge is None:
        return ComponentStatus(
            name="knowledge", healthy=False, status="unconfigured",
            detail="Knowledge store not initialised",
        )
    try:
        available = knowledge.available
        if not available:
            return ComponentStatus(
                name="knowledge", healthy=False, status="down",
                detail="SQLite connection closed",
            )
        chunk_count = knowledge.count()
        has_vec = getattr(knowledge, "_has_vec", False)
        search_mode = "vector + FTS" if has_vec else "FTS only"
        return ComponentStatus(
            name="knowledge", healthy=True, status="ok",
            detail=f"{chunk_count} chunks indexed ({search_mode})",
            metadata={"chunks": chunk_count, "vector_search": has_vec},
        )
    except Exception as exc:
        return ComponentStatus(
            name="knowledge", healthy=False, status="down",
            detail=f"Error: {exc}",
        )


def check_ssh_hosts(bot: OdinBot) -> ComponentStatus:
    executor = getattr(bot, "tool_executor", None)
    if executor is None:
        return ComponentStatus(
            name="ssh_hosts", healthy=True, status="unconfigured",
            detail="Tool executor not initialised",
        )
    try:
        config = executor.config
        hosts = config.hosts
        if not hosts:
            return ComponentStatus(
                name="ssh_hosts", healthy=True, status="unconfigured",
                detail="No SSH hosts configured",
            )
        host_list = []
        for alias, host_cfg in hosts.items():
            host_list.append({
                "alias": alias,
                "address": host_cfg.address,
                "ssh_user": host_cfg.ssh_user,
                "os": host_cfg.os,
            })

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
            name="ssh_hosts", healthy=True, status="ok",
            detail=f"{len(hosts)} host(s) configured",
            metadata={
                "hosts": host_list,
                "pool_enabled": pool is not None,
                **({k: v for k, v in pool_metrics.items() if k != "active_hosts"} if pool_metrics else {}),
            },
        )
    except Exception as exc:
        return ComponentStatus(
            name="ssh_hosts", healthy=False, status="down",
            detail=f"Error: {exc}",
        )


def check_voice(bot: OdinBot) -> ComponentStatus:
    voice_mgr = getattr(bot, "voice_manager", None)
    if voice_mgr is None:
        return ComponentStatus(
            name="voice", healthy=True, status="unconfigured",
            detail="Voice not enabled",
        )
    try:
        connected = voice_mgr.is_connected
        channel = voice_mgr.current_channel
        ws_connected = getattr(voice_mgr, "_connected", False)

        if connected and channel:
            return ComponentStatus(
                name="voice", healthy=True, status="ok",
                detail=f"Connected to #{channel.name}",
                metadata={"channel": channel.name, "channel_id": str(channel.id), "ws_connected": ws_connected},
            )
        elif ws_connected:
            return ComponentStatus(
                name="voice", healthy=True, status="ok",
                detail="Voice service connected, idle",
                metadata={"ws_connected": True},
            )
        return ComponentStatus(
            name="voice", healthy=True, status="degraded",
            detail="Voice enabled but not connected",
            metadata={"ws_connected": False},
        )
    except Exception as exc:
        return ComponentStatus(
            name="voice", healthy=False, status="down",
            detail=f"Error: {exc}",
        )


def check_monitoring(bot: OdinBot) -> ComponentStatus:
    watcher = getattr(bot, "infra_watcher", None)
    if watcher is None:
        return ComponentStatus(
            name="monitoring", healthy=True, status="unconfigured",
            detail="Infrastructure watcher not enabled",
        )
    try:
        status = watcher.get_status()
        active_alerts = status.get("active_alerts", 0)
        checks = status.get("checks", 0)
        running = status.get("running", 0)

        if active_alerts > 0:
            return ComponentStatus(
                name="monitoring", healthy=True, status="degraded",
                detail=f"{active_alerts} active alert(s), {checks} checks configured",
                metadata=status,
            )
        return ComponentStatus(
            name="monitoring", healthy=True, status="ok",
            detail=f"{checks} checks configured, {running} running",
            metadata=status,
        )
    except Exception as exc:
        return ComponentStatus(
            name="monitoring", healthy=False, status="down",
            detail=f"Error: {exc}",
        )


def check_browser(bot: OdinBot) -> ComponentStatus:
    executor = getattr(bot, "tool_executor", None)
    browser_mgr = getattr(executor, "_browser_manager", None) if executor else None
    if browser_mgr is None:
        return ComponentStatus(
            name="browser", healthy=True, status="unconfigured",
            detail="Browser automation not enabled",
        )
    try:
        browser = getattr(browser_mgr, "_browser", None)
        connected = browser is not None and hasattr(browser, "is_connected") and browser.is_connected()
        if connected:
            return ComponentStatus(
                name="browser", healthy=True, status="ok",
                detail="Playwright browser connected",
            )
        return ComponentStatus(
            name="browser", healthy=True, status="degraded",
            detail="Browser configured but not connected (lazy init)",
        )
    except Exception as exc:
        return ComponentStatus(
            name="browser", healthy=False, status="down",
            detail=f"Error: {exc}",
        )


def check_scheduler(bot: OdinBot) -> ComponentStatus:
    scheduler = getattr(bot, "scheduler", None)
    if scheduler is None:
        return ComponentStatus(
            name="scheduler", healthy=True, status="unconfigured",
            detail="Scheduler not initialised",
        )
    try:
        all_tasks = scheduler.list_all()
        count = len(all_tasks) if all_tasks else 0
        return ComponentStatus(
            name="scheduler", healthy=True, status="ok",
            detail=f"{count} scheduled task(s)",
            metadata={"count": count},
        )
    except Exception as exc:
        return ComponentStatus(
            name="scheduler", healthy=False, status="down",
            detail=f"Error: {exc}",
        )


def check_loops(bot: OdinBot) -> ComponentStatus:
    loop_mgr = getattr(bot, "loop_manager", None)
    if loop_mgr is None:
        return ComponentStatus(
            name="loops", healthy=True, status="unconfigured",
            detail="Loop manager not initialised",
        )
    try:
        active = loop_mgr.active_count
        return ComponentStatus(
            name="loops", healthy=True, status="ok",
            detail=f"{active} active loop(s)",
            metadata={"active": active},
        )
    except Exception as exc:
        return ComponentStatus(
            name="loops", healthy=False, status="down",
            detail=f"Error: {exc}",
        )


def check_agents(bot: OdinBot) -> ComponentStatus:
    agent_mgr = getattr(bot, "agent_manager", None)
    if agent_mgr is None:
        return ComponentStatus(
            name="agents", healthy=True, status="unconfigured",
            detail="Agent manager not initialised",
        )
    try:
        agents = getattr(agent_mgr, "_agents", {})
        if not isinstance(agents, dict):
            agents = {}
        total = len(agents)
        running = sum(1 for a in agents.values() if a.status == "running")
        return ComponentStatus(
            name="agents", healthy=True, status="ok",
            detail=f"{running} running, {total} total",
            metadata={"running": running, "total": total},
        )
    except Exception as exc:
        return ComponentStatus(
            name="agents", healthy=False, status="down",
            detail=f"Error: {exc}",
        )


# Ordered list of all checkers
_ALL_CHECKERS = [
    check_discord,
    check_codex,
    check_sessions,
    check_knowledge,
    check_ssh_hosts,
    check_voice,
    check_monitoring,
    check_browser,
    check_scheduler,
    check_loops,
    check_agents,
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
            results.append({
                "name": checker.__name__.replace("check_", ""),
                "healthy": False,
                "status": "down",
                "detail": f"Checker crashed: {exc}",
            })

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

    from datetime import datetime, timezone
    return {
        "overall": overall,
        "components": results,
        "healthy_count": healthy_count,
        "degraded_count": degraded_count,
        "down_count": down_count,
        "unconfigured_count": unconfigured_count,
        "total": len(results),
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
