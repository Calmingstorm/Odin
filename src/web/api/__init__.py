"""REST API for Odin web management UI.

All endpoints are prefixed with /api/ and require Bearer token auth
(unless api_token is empty in config, which disables auth for dev mode).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from aiohttp import web

from ...odin_log import get_logger

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
from ..chat import process_web_chat  # noqa: F401 — R1 patch seam + import surface
from .agents_loops import (
    register_agents,
    register_loops,
    register_processes,
)
from .codex_admin import register_codex_oauth
from .config_admin import (
    register_discord_config,
    register_personality,
    register_quick_actions,
    register_setup_wizard,
    register_startup_diagnostics,
    register_status_info,
)
from .integrations import (
    register_grafana_alerts,
    register_issue_tracker,
    register_mcp_servers,
    register_outbound_webhooks,
    register_slack,
)
from .knowledge_mem import (
    register_knowledge,
    register_learned_context,
    register_memory_notes,
)
from .llm_admin import (  # noqa: E501
    register_connection_pools,
    register_context_windows,
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
    register_degradation,
    register_log_search,
    register_recovery_stats,
    register_risk_classification,
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
from .self_update import register_self_update
from .sessions_chat import (
    register_agent_trajectories,
    register_chat,
    register_sessions,
    register_trajectories,
)
from .skills_api import register_skills
from .turn_state import register_turn_state

if TYPE_CHECKING:
    from ...discord.client import OdinBot

log = get_logger("web.api")


def create_api_routes(bot: OdinBot) -> web.RouteTableDef:
    """Create all API route handlers bound to the given bot instance."""
    _require_admin = admin_gate(bot)
    routes = web.RouteTableDef()

    register_auth(routes, bot)

    register_setup_wizard(routes, bot)

    register_status_info(routes, bot)

    register_discord_config(routes, bot)

    register_quick_actions(routes, bot)

    register_personality(routes, bot)

    register_self_update(routes, bot)

    register_chat(routes, bot)

    register_sessions(routes, bot)

    register_tools_meta(routes, bot)

    register_bulkheads(routes, bot)

    register_connection_pools(routes, bot)

    register_usage_cost(routes, bot)

    register_aggregates(routes, bot)

    register_trajectories(routes, bot)

    register_skills(routes, bot)

    register_mcp_servers(routes, bot)

    register_slack(routes, bot)

    register_issue_tracker(routes, bot)

    register_grafana_alerts(routes, bot)

    register_knowledge(routes, bot)

    register_schedules(routes, bot)

    register_loops(routes, bot)

    register_agents(routes, bot)

    register_processes(routes, bot)

    register_audit_log(routes, bot)

    register_log_search(routes, bot)

    register_memory_notes(routes, bot)

    register_risk_classification(routes, bot)

    register_permissions_rbac(routes, bot)

    register_codex_oauth(routes, bot)

    register_llm_provider(routes, bot)

    register_provider_config(routes, bot)

    register_context_windows(routes, bot)

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

    register_startup_diagnostics(routes, bot)

    register_degradation(routes, bot)

    register_agent_trajectories(routes, bot)

    register_outbound_webhooks(routes, bot)

    register_turn_state(routes, bot)

    return routes


def setup_api(app: web.Application, bot: OdinBot) -> None:
    """Register all API routes on the given aiohttp application."""
    routes = create_api_routes(bot)
    app.router.add_routes(routes)
    log.info("Web API endpoints registered")
