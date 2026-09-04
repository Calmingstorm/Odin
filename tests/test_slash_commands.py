"""Slash-command surface: the exact command set, ephemeral operational
replies, and the pure renderers behind /status, /reload, and /usage."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from src.agents.manager import AgentManager
from src.context.loader import ContextReloadReport
from src.discord.slash_commands import (
    MESSAGE_LIMIT,
    collect_status,
    register_commands,
    render_quota,
    render_reload,
    render_status,
    render_usage,
)
from src.health.subsystem_guard import SubsystemGuard
from src.llm.codex_quota import CodexQuotaTracker
from src.tools.autonomous_loop import LoopManager

NOW = 1_700_000_000.0


class _Tree:
    def __init__(self):
        self.commands = {}

    def command(self, *, name, description):
        del description

        def decorate(fn):
            self.commands[name] = fn
            return fn

        return decorate


class _Interaction:
    def __init__(self, channel_id=42):
        self.channel_id = channel_id
        self.user = object()
        self.response = SimpleNamespace(send_message=AsyncMock(), defer=AsyncMock())
        self.followup = SimpleNamespace(send=AsyncMock())


def _bot(**extra):
    bot = SimpleNamespace(
        tree=_Tree(),
        intake=SimpleNamespace(is_allowed_user=lambda _user: True),
        **extra,
    )
    register_commands(bot)
    return bot


def test_exact_command_set():
    bot = _bot()
    assert set(bot.tree.commands) == {"status", "reload", "usage", "stop"}


async def test_reload_is_ephemeral_and_renders_the_report():
    report = ContextReloadReport(
        loaded=("architecture.md",),
        removed=("old.md",),
        skipped=(("huge.md", "300000 bytes exceeds per-file cap 262144"),),
        file_count=1,
        total_bytes=1200,
        context_chars=1300,
    )
    bot = _bot(
        context_loader=SimpleNamespace(reload=MagicMock(return_value=report)),
        prompt_builder=SimpleNamespace(invalidate=MagicMock(), rebuild_default=MagicMock()),
        tool_catalog=SimpleNamespace(invalidate=MagicMock()),
    )
    interaction = _Interaction()
    await bot.tree.commands["reload"](interaction)
    bot.prompt_builder.invalidate.assert_called_once()
    bot.tool_catalog.invalidate.assert_called_once()
    bot.prompt_builder.rebuild_default.assert_called_once()
    args, kwargs = interaction.response.send_message.await_args
    assert kwargs == {"ephemeral": True}
    text = args[0]
    assert "`architecture.md`" in text and "Removed: `old.md`" in text
    assert "`huge.md` (300000 bytes exceeds per-file cap 262144)" in text


def test_render_reload_variants():
    empty = ContextReloadReport((), (), (), 0, 0, 0)
    assert "Loaded: none" in render_reload(empty)
    missing = ContextReloadReport((), ("a.md",), (), 0, 0, 0, directory_exists=False)
    rendered = render_reload(missing)
    assert "does not exist" in rendered and "Removed: `a.md`" in rendered
    huge = ContextReloadReport(tuple(f"file{i}.md" for i in range(400)), (), (), 400, 1, 1)
    assert len(render_reload(huge)) <= MESSAGE_LIMIT


async def test_usage_defers_ephemeral_and_reports_unobserved_quota():
    summary = {
        "available": True,
        "work": {
            "settled_turns": 12,
            "accepted_generations": 34,
            "explicit_error_turns": 1,
            "input_tokens": {
                "total": 1_234_567,
                "provider_reported_percent": 98.2,
                "approximate": True,
            },
            "output_tokens": {"total": 4321, "approximate": False},
            "cache": {
                "cached_tokens": 900_000,
                "cache_write_tokens": 50_000,
                "generations_reported": 30,
            },
        },
        "coverage": {"backfill_complete": True, "malformed_rows_skipped": 0},
    }
    pool = SimpleNamespace(
        quota_view=lambda: CodexQuotaTracker(clock=lambda: NOW).view(current_key="k1"),
        describe_accounts=lambda: [{"key": "k1", "label": "TOVDC", "is_current": True}],
    )
    bot = _bot(
        usage_rollup=SimpleNamespace(summary=AsyncMock(return_value=summary)),
        llm_gateway=SimpleNamespace(codex_client=SimpleNamespace(auth=pool)),
    )
    interaction = _Interaction()
    await bot.tree.commands["usage"](interaction, "24h")
    interaction.response.defer.assert_awaited_once_with(ephemeral=True)
    bot.usage_rollup.summary.assert_awaited_once_with("24h")
    args, kwargs = interaction.followup.send.await_args
    assert kwargs == {"ephemeral": True}
    text = args[0]
    assert "**Usage — 24h**" in text and "settled turns 12" in text
    assert "in 1.2M (98.2% provider-reported)" in text and "out 4,321" in text
    assert "Prompt cache: read 900.0K · write 50.0K (subsets of input" in text
    assert "TOVDC (current)**: not yet observed" in text
    assert "subscription" not in text


async def test_usage_unknown_range_falls_back_to_7d_and_missing_store_is_honest():
    bot = _bot(llm_gateway=SimpleNamespace(codex_client=None))
    interaction = _Interaction()
    await bot.tree.commands["usage"](interaction, "bogus")
    text = interaction.followup.send.await_args.args[0]
    assert text.startswith("**Usage — 7d**: history unavailable")
    assert "no Codex auth pool" in text


def test_render_quota_current_then_others_never_raw_identity():
    tracker = CodexQuotaTracker(clock=lambda: NOW - 30)
    headers = {
        "x-codex-primary-used-percent": "37",
        "x-codex-primary-window-minutes": "300",
        "x-codex-primary-reset-after-seconds": "7980",
        "x-codex-secondary-used-percent": "12",
        "x-codex-secondary-window-minutes": "10080",
        "x-codex-secondary-reset-after-seconds": "356400",
        "x-codex-plan-type": "team",
        "x-codex-active-limit": "premium",
        "x-codex-rate-limit-reached-type": "primary",
    }
    tracker.record_headers("cur", headers)
    tracker.record_headers("oth", {**headers, "x-codex-primary-used-percent": "5"})
    view = tracker.view(current_key="cur")
    lines = render_quota(view, {"cur": "TOVDC", "oth": "Personal"}, NOW)
    text = "\n".join(lines)
    assert lines[0].startswith("**Codex quota — TOVDC (current)** · observed 30s ago")
    assert "5h window: 37% used · resets in 2h 12m" in text
    assert "7d window: 12% used · resets in 4d 2h" in text
    assert "plan team · limit premium" in text
    assert "⚠ rate limit reached: primary" in text
    assert "Other accounts (last seen): Personal 5%/12% (30s ago)" in text
    assert "cur" not in text.replace("(current)", "") and "oth" not in text


def test_render_quota_normalizes_and_escapes_operator_labels():
    tracker = CodexQuotaTracker(clock=lambda: NOW)
    tracker.record_headers("cur", {"x-codex-primary-used-percent": "1"})
    tracker.record_headers("oth", {"x-codex-primary-used-percent": "2"})
    view = tracker.view(current_key="cur")
    lines = render_quota(
        view,
        {"cur": "  **Ops**\n@everyone `quota`  ", "oth": "<@123> [other] <https://x>"},
        NOW,
    )
    text = "\n".join(lines)
    assert "\n@everyone" not in text and "@everyone" not in text
    assert "\\*\\*Ops\\*\\*" in text and "\\`quota\\`" in text
    assert "<@123>" not in text and "@\u200b" in text and "\\<https://x\\>" in text


def test_render_status_shows_fallback_and_states():
    facts = {
        "version": "3.88.0",
        "uptime_seconds": 90061,
        "latency_seconds": 0.0421,
        "requested_provider": "ollama",
        "serving_provider": "codex",
        "model": "gpt-5.6-sol",
        "reasoning_effort": "xhigh",
        "providers": {"codex": "live", "ollama": "unavailable", "kimi": "disabled"},
        "codex_accounts": 3,
        "tool_count": 59,
        "active_agents": 2,
        "active_loops": 0,
    }
    text = render_status(facts)
    assert text.startswith("**Odin v3.88.0** · up 1d 1h · Discord latency 42 ms")
    assert "Provider: **codex** (requested ollama — fallback)" in text
    assert "Model: **gpt-5.6-sol** · effort xhigh" in text
    assert "Codex: live (3 accounts) | Ollama: unavailable | Kimi: disabled" in text
    assert "Tools advertised: 59 · Agents active: 2 · Loops active: 0" in text
    facts["serving_provider"] = "ollama"
    assert "Provider: **ollama**\n" in render_status(facts)


def test_collect_status_degrades_every_field_to_unknown():
    facts = collect_status(SimpleNamespace())
    assert facts["serving_provider"] is None and facts["uptime_seconds"] is None
    assert facts["providers"] == {"codex": "disabled", "ollama": "disabled", "kimi": "disabled"}
    assert "?" in render_status(facts)


def test_collect_status_uses_serving_identity_and_guard():
    guard = SubsystemGuard()
    for name in ("llm_codex", "llm_ollama", "llm_kimi"):
        guard.register(name)
    guard.mark_degraded("llm_ollama", "test")
    guard.mark_unavailable("llm_kimi", "test")
    gateway = SimpleNamespace(
        capture_serving_identity=lambda: SimpleNamespace(
            provider="codex", model="gpt-5.6-sol", reasoning_effort="high"
        ),
        codex_client=SimpleNamespace(
            auth=SimpleNamespace(account_count=3), breaker=SimpleNamespace(state="half_open")
        ),
        ollama_client=SimpleNamespace(breaker=SimpleNamespace(state="closed")),
        kimi_client=SimpleNamespace(),
        subsystem_guard=guard,
    )
    bot = SimpleNamespace(
        llm_gateway=gateway,
        config=SimpleNamespace(llm_provider=SimpleNamespace(active_provider="codex")),
        latency=0.05,
        start_time=0.0,
        tool_catalog=SimpleNamespace(merged_definitions=lambda: [{}] * 7),
        agent_manager=AgentManager(),
        loop_manager=LoopManager(),
    )
    bot.agent_manager._agents = {
        "running": SimpleNamespace(_sm=SimpleNamespace(is_active=True)),
    }
    bot.loop_manager._loops = {
        f"loop-{i}": SimpleNamespace(status="running") for i in range(4)
    }
    facts = collect_status(bot)
    assert facts["providers"] == {
        "codex": "live, breaker half-open",
        "ollama": "degraded",
        "kimi": "unavailable",
    }
    assert facts["model"] == "gpt-5.6-sol" and facts["codex_accounts"] == 3
    assert facts["tool_count"] == 7 and facts["active_agents"] == 1 and facts["active_loops"] == 4


def test_render_usage_is_bounded():
    summary = {"available": True, "work": {}, "coverage": {}}
    text = render_usage(summary, "all", ["x" * 5000])
    assert len(text) <= MESSAGE_LIMIT
