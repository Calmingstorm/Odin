"""The OdinBot PUBLIC surface contract (RFC-002 P7).

The RFC-001 compatibility facade is retired. This contract replaces the
old Appendix B pins with three enforcement layers:

1. POSITIVE — the documented public surface exists on a constructed bot:
   flat service handles, the component handles, the two composition
   handles (services/components), the live `knowledge` property, and the
   lifecycle attributes.
2. LATE-BOUND — names set after construction stay ABSENT on a fresh bot
   (hasattr/getattr semantics are load-bearing for health checks).
3. NEGATIVE — retired facade spellings have ZERO references anywhere in
   src/ and tests/, and no code outside the composition files reaches
   into `bot._underscore` state at all. The facade stays dead.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from tests.fakes import FakeLLM, make_bot, text_response

REPO_ROOT = Path(__file__).resolve().parents[2]

# --- positive surface -------------------------------------------------------

SERVICE_HANDLES = [
    "config",
    "sessions",
    "scheduler",
    "tool_executor",
    "skill_manager",
    "loop_manager",
    "audit",
    "agent_manager",
    "reflector",
    "channel_config",
    "channel_logger",
    "context_loader",
    "infra_watcher",
    "voice_manager",
    "browser_manager",
    "permissions",
    "host_access_manager",
    "api_token_manager",
    "cost_tracker",
    "subsystem_guard",
    "audit_signer",
    "diff_tracker",
    "model_router",
    "context_compressor",
    "prefix_tracker",
    "auxiliary_llm_client",
    "outbound_webhook_dispatcher",
    "trajectory_saver",
    "agent_trajectory_saver",
    "loop_agent_bridge",
    "loop_reflection_gate",
    "stuck_loop_tracker_cls",
    "classify_command_risk",
    "classify_tool_risk",
    "embedder",
    "start_time",
]

COMPONENT_HANDLES = [
    "services",
    "components",
    "channel_state",
    "llm_gateway",
    "prompt_builder",
    "tool_catalog",
    "native_tools",
    "scheduling_tools",
    "knowledge_tools",
    "channel_ops_tools",
    "media_tools",
    "delivery",
    "completion_classifier",
    "tool_loop",
    "turn_recorder",
    "scheduled_events",
    "agent_task_tools",
    "intake",
    "pipeline",
    "housekeeping",
]

LATE_BOUND_ABSENT = [
    "startup_report",
    "mcp_manager",
    "_codex_auth_pool",
    "_issue_tracker_client",
    "compression_stats",
    "health_server",
    "process_registry",
]

# --- negative contract: retired facade spellings ----------------------------
# Every name deleted from OdinBot in RFC-002 P7. The scan matches the
# ATTRIBUTE ACCESS form (`bot.<name>`), so component methods that
# legitimately share a suffix (e.g. turn_recorder's _save_turn_trajectory,
# reached as bot.turn_recorder._save_turn_trajectory) never false-positive.

RETIRED_BOT_ATTRS = [
    # LLM facade
    "llm_client", "codex_client", "ollama_client", "kimi_client", "codex",
    "_llm_provider_lock", "_codex_call", "_wire_llm_callbacks",
    "_wire_codex_callbacks", "reload_codex_auth", "reload_ollama",
    "reload_kimi", "switch_llm_provider", "_reload_codex_inner",
    "_reload_ollama_inner", "_reload_kimi_inner",
    # prompt/catalog facade
    "_system_prompt", "_build_system_prompt", "_build_chat_system_prompt",
    "_invalidate_prompt_caches", "_merged_tool_definitions",
    "_cached_merged_tools", "_cached_skills_text",
    # pipeline/delivery/observability delegates
    "_process_with_tools", "_run_loop_iteration", "_dispatch_loop_tool",
    "_dispatch_loop_tool_inner", "_handle_message", "_handle_message_inner",
    "_process_attachments", "_set_status", "_send_with_retry",
    "_send_chunked", "_record_user_content", "_new_context_trace",
    "_save_turn_trajectory", "_emit_lifecycle_event",
    "_operational_reflection", "_should_reflect_on_operation",
    "_maybe_loop_reflect", "_classify_completion",
    "_parse_classifier_response", "_CLASSIFIER_SYSTEM_PROMPT",
    "_ensure_failure_visible", "_TOOL_STATUS_LABELS",
    # gating/housekeeping delegates
    "_check_for_secrets", "_is_allowed_user", "_is_allowed_channel",
    "_is_cancelled", "_maybe_cleanup_caches", "_cleanup_stale_caches",
    "_track_recent_action", "_invoke_skill_missing_required",
    # channel-state aliases
    "_channel_state", "_channel_locks", "_cancel_events", "_pending_files",
    "_recent_actions", "_last_op_details", "_background_tasks",
    # scheduled-events delegates
    "_on_scheduled_task", "_on_schedule_failure", "_on_scheduled_digest",
    "_on_monitor_alert", "_execute_scheduled_tool", "_run_scheduled_workflow",
    "_format_digest_raw", "_resolve_mentions",
    # web-owned state formerly parked on the bot
    "_web_channel_locks",
    # native-tool handler delegates (owner-dispatched since P5)
    "_handle_purge", "_handle_browser_screenshot", "_handle_generate_file",
    "_handle_post_file", "_handle_schedule_task", "_handle_delegate_task",
    "_handle_start_loop", "_handle_read_channel", "_handle_add_reaction",
    "_handle_create_poll", "_handle_analyze_image", "_handle_generate_image",
    "_handle_spawn_agent", "_handle_spawn_loop_agents",
    "_handle_update_schedule", "_handle_delete_schedule", "_handle_parse_time",
    "_handle_search_history", "_handle_list_tasks", "_handle_cancel_task",
    "_handle_stop_loop", "_handle_search_knowledge", "_handle_delete_knowledge",
    "_handle_search_audit", "_handle_send_to_agent", "_handle_kill_agent",
    "_handle_get_agent_results", "_handle_wait_for_agents",
    "_handle_collect_loop_agents", "_handle_list_schedules",
    "_handle_list_loops", "_handle_list_knowledge", "_handle_list_agents",
    "_handle_ingest_document", "_handle_bulk_ingest", "_handle_set_permission",
    "_validate_schedule_payload", "_collect_agent_result",
]

_RETIRED_RE = re.compile(r"\bbot\.(" + "|".join(map(re.escape, RETIRED_BOT_ATTRS)) + r")\b")

# Files allowed to mention retired spellings (this contract itself)
_SCAN_EXCLUDE = {"test_facade_contract.py"}


@pytest.fixture(autouse=True)
def _isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


@pytest.fixture
def bot():
    return make_bot(fake_llm=FakeLLM([]))


class TestPositiveSurface:
    def test_service_handles_exist(self, bot):
        missing = [a for a in SERVICE_HANDLES if not hasattr(bot, a)]
        assert missing == [], f"public service handles missing: {missing}"

    def test_component_handles_exist(self, bot):
        missing = [a for a in COMPONENT_HANDLES if not hasattr(bot, a)]
        assert missing == [], f"public component handles missing: {missing}"

    def test_knowledge_property_is_live_and_settable(self, bot):
        sentinel = object()
        bot.knowledge = sentinel
        assert bot.knowledge is sentinel
        assert type(bot).knowledge.fset is not None

    def test_config_is_replaceable(self, bot):
        # config hot-reload assigns a fresh Config object
        bot.config = bot.config
        assert bot.config is not None


class TestLateBoundAbsent:
    def test_late_bound_names_absent_on_fresh_bot(self, bot):
        present = [a for a in LATE_BOUND_ABSENT if hasattr(bot, a)]
        assert present == [], (
            f"late-bound names unexpectedly present at construction: {present} — "
            "if a refactor made these eager, health-check hasattr semantics changed."
        )


class TestNegativeContract:
    """The retired facade stays dead: no `bot.<retired>` spelling anywhere,
    and nothing outside the composition files touches `bot._` state."""

    def _scan(self, root: Path, regex: re.Pattern, exclude_names: set[str]) -> list[str]:
        offenders = []
        for py in sorted(root.rglob("*.py")):
            if py.name in exclude_names or "__pycache__" in py.parts:
                continue
            text = py.read_text(encoding="utf-8", errors="replace")
            for m in regex.finditer(text):
                line = text.count("\n", 0, m.start()) + 1
                offenders.append(f"{py.relative_to(REPO_ROOT)}:{line}: {m.group(0)}")
        return offenders

    def test_no_retired_spellings_in_src(self):
        offenders = self._scan(REPO_ROOT / "src", _RETIRED_RE, _SCAN_EXCLUDE)
        assert offenders == [], "retired facade spellings in src:\n" + "\n".join(offenders)

    def test_no_retired_spellings_in_tests(self):
        offenders = self._scan(REPO_ROOT / "tests", _RETIRED_RE, _SCAN_EXCLUDE)
        assert offenders == [], "retired facade spellings in tests:\n" + "\n".join(offenders)

    def test_no_bot_private_access_in_src(self):
        """Outside the bot's own module and the composition root, no src
        code reaches into bot._underscore state (the god-interface is gone;
        the private storage that remains — search stores, memory path — is
        client/wiring-internal)."""
        broad = re.compile(r"\bbot\._[a-zA-Z]")
        allowed = {"client.py", "wiring.py"}
        offenders = self._scan(REPO_ROOT / "src", broad, allowed | _SCAN_EXCLUDE)
        assert offenders == [], "bot._ access outside composition files:\n" + "\n".join(offenders)


class TestWebChatRoute:
    async def test_process_web_chat_drives_real_tool_loop(self):
        from src.web.chat import WEB_CHANNEL_LOCKS, process_web_chat

        fake = FakeLLM([text_response("web answer")])
        bot = make_bot(fake_llm=fake)
        result = await process_web_chat(bot, "hello from the web", channel_id="web-42")
        assert result["is_error"] is False
        assert result["response"] == "web answer"
        assert result["tools_used"] == []
        assert len(fake.calls) == 1  # went through the REAL tool loop
        # The lock cache is web-owned module state now (RFC-002 P6)
        assert "web-42" in WEB_CHANNEL_LOCKS
