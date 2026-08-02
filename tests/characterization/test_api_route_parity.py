"""Characterization: web API route-table parity (RFC-003 P1).

The load-bearing contract for the api.py domain carve. Pins, BEFORE any
handler moves:

1. The exact ordered list of (method, path, handler_name) for all 184
   routes — the carve cannot lose, rename, reorder, or duplicate a route.
   ORDER is behavior: aiohttp resolves overlapping static/variable paths
   by registration order.
2. The import surface live consumers use (`create_api_routes`,
   `setup_api`, the shared helpers, the `process_web_chat` patch seam) —
   the P5 file→package swap must preserve every one (RFC-003 R1).

Per-domain dispatch behavior is already covered by the endpoint suites
(test_web_api_new_endpoints, test_web_chat, test_execute_api,
test_web_auth_policy, test_web_security_reliability, test_knowledge_*,
test_connection_pools, ...); this file pins the table itself plus one
closure-liveness smoke.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

EXPECTED_ROUTES = [
    ("POST", "/api/auth/login", "auth_login"),
    ("POST", "/api/auth/logout", "auth_logout"),
    ("GET", "/api/auth/session", "auth_session"),
    ("GET", "/api/setup/status", "setup_status"),
    ("POST", "/api/setup/complete", "setup_complete"),
    ("GET", "/api/status", "get_status"),
    ("GET", "/api/discord/guilds", "discord_guilds"),
    ("GET", "/api/discord/members", "discord_members"),
    ("PUT", "/api/discord/guild/{guild_id}/config", "update_guild_config"),
    ("PUT", "/api/discord/channel/{channel_id}/config", "update_channel_config"),
    ("GET", "/api/health/components", "get_health_components"),
    ("GET", "/api/resource-usage", "get_resource_usage"),
    ("GET", "/api/tool-streams", "get_tool_streams"),
    ("GET", "/api/config", "get_config"),
    ("PUT", "/api/config", "update_config"),
    ("POST", "/api/sessions/clear-all", "clear_all_sessions"),
    ("POST", "/api/reload", "reload_config"),
    ("GET", "/api/personality", "get_personality"),
    ("PUT", "/api/personality", "update_personality"),
    ("POST", "/api/personality/presets", "save_preset"),
    ("DELETE", "/api/personality/presets/{name}", "delete_preset"),
    ("GET", "/api/update/check", "check_update"),
    ("POST", "/api/update/apply", "apply_update"),
    ("POST", "/api/loops/stop-all", "stop_all_loops"),
    ("POST", "/api/chat", "chat"),
    ("POST", "/api/execute", "execute"),
    ("GET", "/api/sessions", "list_sessions"),
    ("GET", "/api/sessions/token-usage", "session_token_usage"),
    ("GET", "/api/sessions/activity", "session_activity"),
    ("GET", "/api/sessions/search", "search_sessions"),
    ("GET", "/api/sessions/{channel_id}", "get_session"),
    ("GET", "/api/sessions/{channel_id}/export", "export_session"),
    ("DELETE", "/api/sessions/{channel_id}", "delete_session"),
    ("POST", "/api/sessions/clear-bulk", "clear_bulk_sessions"),
    ("GET", "/api/tools", "list_tools"),
    ("GET", "/api/tools/stats", "tool_stats"),
    ("GET", "/api/tools/timeouts", "get_tool_timeouts"),
    ("PUT", "/api/tools/timeouts", "set_tool_timeouts"),
    ("GET", "/api/tools/bulkheads", "get_bulkheads"),
    ("GET", "/api/pools/ssh", "get_ssh_pool"),
    ("GET", "/api/pools/http", "get_http_pool"),
    ("POST", "/api/pools/ssh/close", "close_ssh_pool_host"),
    ("GET", "/api/usage", "get_usage"),
    ("GET", "/api/observability/context", "get_observability_context"),
    ("GET", "/api/observability/failures", "get_observability_failures"),
    ("GET", "/api/usage/totals", "get_usage_totals"),
    ("GET", "/api/trajectories", "list_trajectory_files"),
    ("GET", "/api/trajectories/{filename}", "get_trajectory_file"),
    ("GET", "/api/trajectories/message/{message_id}", "get_trajectory_by_message"),
    ("GET", "/api/trajectories/search/query", "search_trajectories"),
    ("GET", "/api/skills", "list_skills"),
    ("POST", "/api/skills", "create_skill"),
    ("PUT", "/api/skills/{name}", "update_skill"),
    ("POST", "/api/skills/{name}/test", "test_skill"),
    ("DELETE", "/api/skills/{name}", "delete_skill"),
    ("GET", "/api/skills/{name}", "get_skill_detail"),
    ("POST", "/api/skills/validate", "validate_skill"),
    ("POST", "/api/skills/{name}/enable", "enable_skill"),
    ("POST", "/api/skills/{name}/disable", "disable_skill_api"),
    ("GET", "/api/skills/{name}/config", "get_skill_config"),
    ("PUT", "/api/skills/{name}/config", "set_skill_config"),
    ("GET", "/api/mcp/servers", "list_mcp_servers"),
    ("GET", "/api/mcp/servers/{name}/tools", "list_mcp_server_tools"),
    ("POST", "/api/mcp/servers", "add_mcp_server"),
    ("DELETE", "/api/mcp/servers/{name}", "remove_mcp_server"),
    ("GET", "/api/slack/status", "slack_status"),
    ("POST", "/api/slack/test", "slack_test"),
    ("POST", "/api/slack/send", "slack_send"),
    ("GET", "/api/issues/status", "issue_tracker_status"),
    ("POST", "/api/issues/execute", "issue_tracker_execute"),
    ("POST", "/api/issues/create", "issue_tracker_create"),
    ("GET", "/api/grafana-alerts/status", "grafana_alerts_status"),
    ("GET", "/api/grafana-alerts/history", "grafana_alerts_history"),
    ("GET", "/api/grafana-alerts/rules", "grafana_alerts_rules"),
    ("POST", "/api/grafana-alerts/rules", "grafana_alerts_add_rule"),
    ("DELETE", "/api/grafana-alerts/rules/{rule_id}", "grafana_alerts_delete_rule"),
    ("GET", "/api/grafana-alerts/remediations", "grafana_alerts_remediations"),
    ("GET", "/api/knowledge", "list_knowledge"),
    ("POST", "/api/knowledge", "ingest_knowledge"),
    ("DELETE", "/api/knowledge/{source}", "delete_knowledge"),
    ("POST", "/api/knowledge/{source}/reingest", "reingest_knowledge"),
    ("GET", "/api/knowledge/search", "search_knowledge"),
    ("GET", "/api/knowledge/{source}/chunks", "list_knowledge_chunks"),
    ("GET", "/api/knowledge/duplicates", "list_knowledge_duplicates"),
    ("POST", "/api/knowledge/merge", "merge_knowledge"),
    ("GET", "/api/knowledge/{source}/versions", "list_knowledge_versions"),
    ("GET", "/api/knowledge/{source}/versions/{version:\\d+}", "get_knowledge_version"),
    (
        "POST",
        "/api/knowledge/{source}/versions/{version:\\d+}/restore",
        "restore_knowledge_version",
    ),
    ("GET", "/api/knowledge/{source}/versions/{v1:\\d+}/diff/{v2:\\d+}", "diff_knowledge_versions"),
    ("POST", "/api/knowledge/import", "import_knowledge"),
    ("GET", "/api/schedules", "list_schedules"),
    ("POST", "/api/schedules", "create_schedule"),
    ("PUT", "/api/schedules/{schedule_id}", "update_schedule"),
    ("DELETE", "/api/schedules/{schedule_id}", "delete_schedule"),
    ("POST", "/api/schedules/{schedule_id}/run", "run_schedule_now"),
    ("POST", "/api/schedules/{schedule_id}/reset-failures", "reset_schedule_failures"),
    ("GET", "/api/schedules/history", "schedule_history_all"),
    ("GET", "/api/schedules/{schedule_id}/history", "schedule_history"),
    ("GET", "/api/schedules/{schedule_id}/stats", "schedule_stats"),
    ("POST", "/api/schedules/validate-cron", "validate_cron"),
    ("GET", "/api/loops", "list_loops"),
    ("POST", "/api/loops", "start_loop"),
    ("DELETE", "/api/loops/{loop_id}", "stop_loop"),
    ("POST", "/api/loops/{loop_id}/restart", "restart_loop"),
    ("GET", "/api/agents", "list_agents"),
    ("GET", "/api/agents/{agent_id}", "agent_detail"),
    ("DELETE", "/api/agents/{agent_id}", "kill_agent"),
    ("GET", "/api/agents/{agent_id}/children", "get_agent_children"),
    ("GET", "/api/agents/{agent_id}/lineage", "get_agent_lineage"),
    ("GET", "/api/agents/{agent_id}/descendants", "get_agent_descendants"),
    ("GET", "/api/processes", "list_processes"),
    ("DELETE", "/api/processes/{pid}", "kill_process"),
    ("GET", "/api/audit", "search_audit"),
    ("GET", "/api/audit/diffs", "search_audit_diffs"),
    ("GET", "/api/audit/verify", "verify_audit_integrity"),
    ("GET", "/api/logs/search", "search_logs"),
    ("GET", "/api/logs/stats", "log_stats"),
    ("GET", "/api/memory", "list_memory"),
    ("GET", "/api/memory/{scope}/{key}", "get_memory"),
    ("PUT", "/api/memory/{scope}/{key}", "set_memory"),
    ("DELETE", "/api/memory/{scope}/{key}", "delete_memory"),
    ("POST", "/api/memory/bulk-delete", "bulk_delete_memory"),
    ("GET", "/api/risk/stats", "risk_stats"),
    ("GET", "/api/risk/recent", "risk_recent"),
    ("GET", "/api/governor/stats", "governor_stats"),
    ("GET", "/api/audit/risk", "audit_by_risk"),
    ("GET", "/api/permissions/tiers", "list_tiers"),
    ("GET", "/api/permissions/user/{user_id}", "get_user_tier"),
    ("PUT", "/api/permissions/user/{user_id}", "set_user_tier"),
    ("DELETE", "/api/permissions/user/{user_id}", "delete_user_tier"),
    ("GET", "/api/codex/status", "codex_status"),
    ("POST", "/api/codex/device-code", "codex_device_code"),
    ("POST", "/api/codex/device-poll", "codex_device_poll"),
    ("POST", "/api/codex/account/{index}/refresh", "codex_refresh_account"),
    ("POST", "/api/codex/account/{index}/activate", "codex_activate_account"),
    ("POST", "/api/codex/reload", "codex_reload"),
    ("PUT", "/api/codex/account/{index}/label", "codex_set_label"),
    ("DELETE", "/api/codex/account/{index}", "codex_delete_account"),
    ("GET", "/api/llm/status", "llm_status"),
    ("POST", "/api/llm/switch", "llm_switch"),
    ("PUT", "/api/llm/codex/config", "llm_codex_config"),
    ("PUT", "/api/llm/auxiliary/config", "llm_auxiliary_config"),
    ("PUT", "/api/llm/ollama/config", "llm_ollama_config"),
    ("PUT", "/api/llm/kimi/config", "llm_kimi_config"),
    ("GET", "/api/ollama/status", "ollama_status"),
    ("POST", "/api/ollama/reload", "ollama_reload"),
    ("POST", "/api/ollama/probe-models", "ollama_probe_models"),
    ("GET", "/api/ollama/models", "ollama_models"),
    ("POST", "/api/ollama/model", "ollama_set_model"),
    ("GET", "/api/kimi/status", "kimi_status"),
    ("POST", "/api/kimi/reload", "kimi_reload"),
    ("GET", "/api/kimi/models", "kimi_models"),
    ("POST", "/api/kimi/model", "kimi_set_model"),
    ("GET", "/api/host-access", "get_host_access"),
    ("PUT", "/api/host-access/user/{user_id}", "set_host_access_user"),
    ("DELETE", "/api/host-access/user/{user_id}", "delete_host_access_user"),
    ("PUT", "/api/host-access/default-policy", "set_host_access_default"),
    ("GET", "/api/tokens", "list_api_tokens"),
    ("POST", "/api/tokens", "create_api_token"),
    ("PUT", "/api/tokens/{user_id}", "update_api_token"),
    ("POST", "/api/tokens/{user_id}/regenerate", "regenerate_api_token"),
    ("DELETE", "/api/tokens/{user_id}", "delete_api_token"),
    ("GET", "/api/recovery/stats", "recovery_stats"),
    ("GET", "/api/recovery/recent", "recovery_recent"),
    ("GET", "/api/freshness/stats", "freshness_stats"),
    ("GET", "/api/freshness/recent", "freshness_recent"),
    ("GET", "/api/validation/stats", "validation_stats"),
    ("GET", "/api/learned", "list_learned"),
    ("DELETE", "/api/learned/{key}", "delete_learned"),
    ("PUT", "/api/learned/{key}", "update_learned"),
    ("GET", "/api/affordances", "affordances"),
    ("GET", "/api/compression/stats", "compression_stats"),
    ("GET", "/api/startup/diagnostics", "startup_diagnostics"),
    ("GET", "/api/subsystems/status", "subsystem_status"),
    ("GET", "/api/agent-trajectories", "list_agent_trajectory_files"),
    ("GET", "/api/agent-trajectories/agent/{agent_id}", "get_agent_trajectory"),
    ("GET", "/api/agent-trajectories/search/query", "search_agent_trajectories"),
    ("GET", "/api/agent-trajectories/{filename}", "get_agent_trajectory_file"),
    ("GET", "/api/outbound-webhooks", "list_outbound_webhooks"),
    ("POST", "/api/outbound-webhooks", "create_outbound_webhook"),
    ("PUT", "/api/outbound-webhooks/{webhook_id}", "update_outbound_webhook"),
    ("DELETE", "/api/outbound-webhooks/{webhook_id}", "delete_outbound_webhook"),
    ("POST", "/api/outbound-webhooks/{webhook_id}/test", "test_outbound_webhook"),
    ("GET", "/api/outbound-webhooks/stats", "outbound_webhook_stats"),
]


def _routes(bot=None):
    from src.web.api import create_api_routes

    made = create_api_routes(bot if bot is not None else MagicMock())
    out = []
    for rd in made:
        method = getattr(rd, "method", None)
        path = getattr(rd, "path", None)
        handler = getattr(rd, "handler", None)
        out.append((method, path, getattr(handler, "__name__", "?")))
    return out


class TestRouteTableParity:
    def test_exact_route_list_and_order(self):
        actual = _routes()
        expected = [tuple(e) for e in EXPECTED_ROUTES]
        assert len(actual) == len(expected) == 184
        # set equality first for a readable diff on failure
        missing = set(expected) - set(actual)
        added = set(actual) - set(expected)
        assert not missing and not added, (
            f"route set drifted:\nmissing={sorted(missing)}\nadded={sorted(added)}"
        )
        # then ORDER — aiohttp path precedence depends on it
        assert actual == expected, "route registration ORDER drifted"

    def test_no_duplicate_method_path_pairs(self):
        pairs = [(m, p) for m, p, _ in _routes()]
        assert len(pairs) == len(set(pairs))

    def test_handlers_close_over_the_given_bot(self):
        """Closure liveness: two bots get two distinct handler sets, and a
        rebuilt table does not share closures with the first."""
        bot_a, bot_b = MagicMock(), MagicMock()
        handlers_a = {h for _, _, h in _routes(bot_a)}
        table_a1 = _routes(bot_a)
        table_a2 = _routes(bot_a)
        assert handlers_a  # sanity
        # names identical, closure objects fresh per call
        from src.web.api import create_api_routes

        ra1 = [rd.handler for rd in create_api_routes(bot_a)]
        ra2 = [rd.handler for rd in create_api_routes(bot_b)]
        assert all(f1 is not f2 for f1, f2 in zip(ra1, ra2))
        assert table_a1 == table_a2


class TestImportSurface:
    """The P5 file→package swap must keep every one of these working."""

    def test_public_entry_points(self):
        from src.web.api import create_api_routes, setup_api

        assert callable(create_api_routes)
        assert callable(setup_api)

    def test_shared_helpers_importable_from_api(self):
        from src.web.api import (  # noqa: F401
            _is_sensitive_key,
            _redact_config,
            _safe_int_param,
        )

    def test_helpers_canonical_home_is_api_common(self):
        from src.web import api_common
        from src.web.api import _redact_config

        assert _redact_config is api_common._redact_config

    def test_process_web_chat_patch_seam(self):
        with patch("src.web.api.process_web_chat") as mocked:
            import src.web.api as api_mod

            assert api_mod.process_web_chat is mocked
