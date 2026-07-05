"""Characterization: the OdinBot facade contract (RFC-001 Appendix B).

Three enforcement layers:
1. POSITIVE — every externally-consumed attribute/property/method exists on
   a constructed bot (and stays settable where external code writes it).
2. LATE-BOUND — names set after construction must be ABSENT on a fresh bot
   (hasattr/getattr semantics are load-bearing for health checks).
3. NEGATIVE — the 12 internal-only names must have zero references outside
   src/discord/client.py (and outside this campaign's own test infra),
   enforced by source scan so nothing starts reaching in mid-campaign.

Plus: the web-chat route (the facade's highest-value consumer) driven
end-to-end through the real _process_with_tools.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from tests.fakes import FakeLLM, make_bot, text_response

REPO_ROOT = Path(__file__).resolve().parents[2]

# --- Appendix B: positive surface -------------------------------------------

SUBSYSTEM_ATTRS = [
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
    "codex_client",
    "ollama_client",
    "kimi_client",
    "stuck_loop_tracker_cls",
    "classify_command_risk",
    "classify_tool_risk",
]

PROPERTIES = ["llm_client", "codex", "knowledge"]

PRIVATE_READ_ATTRS = [
    "_system_prompt",
    "_cached_merged_tools",
    "_cached_skills_text",
    "_embedder",
    "_knowledge_store",
    "_start_time",
    "_llm_provider_lock",
    "_memory_path",
    "_recent_actions",
    "_pending_files",
    "_channel_locks",
    "_cancel_events",
    "_last_op_details",
]

FACADE_METHODS = [
    "reload_codex_auth",
    "reload_ollama",
    "reload_kimi",
    "switch_llm_provider",
    "_reload_codex_inner",
    "_reload_ollama_inner",
    "_reload_kimi_inner",
    "_build_system_prompt",
    "_build_chat_system_prompt",
    "_invalidate_prompt_caches",
    "_merged_tool_definitions",
    "_new_context_trace",
    "_set_status",
    "_process_with_tools",
    "_run_loop_iteration",
    "_codex_call",
    "_dispatch_loop_tool",
    "_emit_lifecycle_event",
    "_classify_completion",
    "_is_allowed_user",
    "_is_cancelled",
]

LATE_BOUND_ABSENT = [
    "startup_report",
    "mcp_manager",
    "_codex_auth_pool",
    "_issue_tracker_client",
    "compression_stats",
    "health_server",
]

# RFC-001 Appendix B negative contract: internal-only, zero external refs.
INTERNAL_ONLY = [
    "_active_request_by_channel",
    "_processed_messages",
    "_processed_messages_max",
    "_bot_msg_buffer",
    "_bot_msg_tasks",
    "_bot_msg_buffer_delay",
    "_bot_msg_buffer_max",
    "_cached_hosts",
    "_memory_cache",
    "_memory_cache_ttl",
    "_llm_active_requests",
    "_llm_switching",
]


@pytest.fixture(autouse=True)
def _isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


@pytest.fixture
def bot():
    return make_bot(fake_llm=FakeLLM([]))


class TestPositiveSurface:
    def test_subsystem_attributes_exist(self, bot):
        missing = [a for a in SUBSYSTEM_ATTRS if not hasattr(bot, a)]
        assert missing == [], f"facade attributes missing: {missing}"

    def test_properties_exist(self, bot):
        missing = [p for p in PROPERTIES if not hasattr(type(bot), p)]
        assert missing == [], f"facade properties missing: {missing}"

    def test_private_read_attrs_exist(self, bot):
        missing = [a for a in PRIVATE_READ_ATTRS if not hasattr(bot, a)]
        assert missing == [], f"externally-read private attrs missing: {missing}"

    def test_facade_methods_exist_and_callable(self, bot):
        missing = [m for m in FACADE_METHODS if not callable(getattr(bot, m, None))]
        assert missing == [], f"facade methods missing: {missing}"

    def test_externally_written_names_are_settable(self, bot):
        # web/api.py writes these on live config/skill changes:
        bot._system_prompt = "replaced"
        assert bot._system_prompt == "replaced"
        bot._cached_merged_tools = None
        bot._cached_skills_text = None
        bot.config = bot.config  # hot-reload assigns a fresh Config
        # property setters used by tests/reloads:
        bot.codex = "sentinel"
        assert bot.codex_client == "sentinel"
        bot.knowledge = "kstore"
        assert bot._knowledge_store == "kstore"
        # (the web-chat lock cache moved to src.web.chat.WEB_CHANNEL_LOCKS
        # in RFC-002 P6 — web-owned state no longer parked on the bot)

    def test_classifier_prompt_class_attr_exists(self, bot):
        assert isinstance(type(bot)._CLASSIFIER_SYSTEM_PROMPT, str)
        assert "COMPLETE" in type(bot)._CLASSIFIER_SYSTEM_PROMPT

    def test_module_level_reexports(self):
        from src.discord.client import (  # noqa: F401
            DISCORD_MAX_LEN,
            INITIAL_EXTENSIONS,
            OdinBot,
            combine_bot_messages,
            scrub_response_secrets,
            truncate_tool_output,
        )

        assert DISCORD_MAX_LEN == 2000
        assert isinstance(INITIAL_EXTENSIONS, tuple)


class TestLateBoundAbsent:
    def test_late_bound_names_absent_on_fresh_bot(self, bot):
        present = [a for a in LATE_BOUND_ABSENT if hasattr(bot, a)]
        assert present == [], (
            f"late-bound names unexpectedly present at construction: {present} — "
            "if a refactor made these eager, health-check hasattr semantics changed."
        )


class TestNegativeContract:
    """No code outside client.py (and this campaign's test infra) may
    reference the internal-only names. Keeps the corpse closed while the
    decomposition operates on it."""

    def _scan(self, root: Path, exclude: set[Path]) -> list[str]:
        offenders = []
        for py in sorted(root.rglob("*.py")):
            if py in exclude or "__pycache__" in py.parts:
                continue
            text = py.read_text(encoding="utf-8", errors="replace")
            for name in INTERNAL_ONLY:
                if name in text:
                    offenders.append(f"{py.relative_to(REPO_ROOT)}: {name}")
        return offenders

    def test_no_src_references_outside_client(self):
        offenders = self._scan(
            REPO_ROOT / "src",
            exclude={REPO_ROOT / "src" / "discord" / "client.py"},
        )
        assert offenders == [], (
            "internal-only OdinBot state referenced outside client.py:\n" + "\n".join(offenders)
        )

    def test_no_test_references_outside_campaign_infra(self):
        campaign_dirs = (
            REPO_ROOT / "tests" / "characterization",
            REPO_ROOT / "tests" / "fakes",
        )
        exclude = {p for d in campaign_dirs for p in d.rglob("*.py")}
        offenders = self._scan(REPO_ROOT / "tests", exclude=exclude)
        assert offenders == [], (
            "internal-only OdinBot state referenced by tests outside the "
            "campaign infra:\n" + "\n".join(offenders)
        )


class TestWebChatRoute:
    async def test_process_web_chat_drives_real_tool_loop(self):
        from src.web.chat import process_web_chat

        fake = FakeLLM([text_response("web answer")])
        bot = make_bot(fake_llm=fake)
        result = await process_web_chat(bot, "hello from the web", channel_id="web-42")
        assert result["is_error"] is False
        assert result["response"] == "web answer"
        assert result["tools_used"] == []
        assert len(fake.calls) == 1  # went through the REAL tool loop
        # The lock cache is web-owned module state now (RFC-002 P6)
        from src.web.chat import WEB_CHANNEL_LOCKS

        assert "web-42" in WEB_CHANNEL_LOCKS
