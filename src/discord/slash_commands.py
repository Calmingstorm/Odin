"""Slash-command registration (RFC-001 Phase 10).

Four commands: ``/status`` (runtime configuration and health), ``/reload``
(context files, with the loader's report of what is effective, removed, and
skipped), ``/usage`` (durable usage totals plus the live Codex quota for the
account currently serving), and ``/stop``.  ``/reset`` and ``/purge`` were
removed: session reset stays reachable through the WebUI and native tools,
and message purging through the ``!purge`` moderation prefix command.

Rendering is split into pure ``render_*`` functions so the exact text is
testable without Discord objects.  Every rendering is bounded below
Discord's message limit.
"""

from __future__ import annotations

import asyncio
import math
import re
import time
import unicodedata
from typing import Literal

import discord
from discord import app_commands

from .. import __version__
from ..odin_log import get_logger

log = get_logger("discord")

MESSAGE_LIMIT = 1900
USAGE_RANGES = ("24h", "7d", "30d", "all")
UsageRange = Literal["24h", "7d", "30d", "all"]
_PROVIDERS = ("codex", "ollama", "kimi")


# --------------------------------------------------------------------------
# formatting helpers (pure)
# --------------------------------------------------------------------------

def _bounded(text: str, limit: int = MESSAGE_LIMIT) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _fmt_count(value: object) -> str:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or value < 0:
        return "?"
    number = float(value)
    if number < 10_000:
        return f"{int(number):,}"
    for unit, size in (("B", 1e9), ("M", 1e6), ("K", 1e3)):
        if number >= size:
            return f"{number / size:.1f}{unit}"
    return f"{int(number):,}"


def _fmt_duration(seconds: object) -> str:
    if (
        not isinstance(seconds, (int, float))
        or isinstance(seconds, bool)
        or not math.isfinite(seconds)
    ):
        return "?"
    total = max(0, int(seconds))
    days, rem = divmod(total, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, secs = divmod(rem, 60)
    if days:
        return f"{days}d {hours}h"
    if hours:
        return f"{hours}h {minutes}m"
    if minutes:
        return f"{minutes}m {secs}s"
    return f"{secs}s"


def _or_unknown(value: object) -> str:
    return "?" if value is None else str(value)


def _fmt_percent(value: object) -> str:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
        return "?"
    return f"{value:.0f}%" if float(value).is_integer() else f"{value:.1f}%"


# --------------------------------------------------------------------------
# /status
# --------------------------------------------------------------------------

def _provider_state(bot, name: str) -> str:
    """disabled | live | degraded | unavailable, from client presence + guard."""
    gateway = getattr(bot, "llm_gateway", None)
    client = getattr(gateway, f"{name}_client", None) if gateway is not None else None
    if client is None:
        return "disabled"
    guard = getattr(gateway, "subsystem_guard", None)
    state = "live"
    if guard is not None:
        try:
            if not guard.is_usable(f"llm_{name}"):
                state = "unavailable"
            elif not guard.is_available(f"llm_{name}"):
                state = "degraded"
        except Exception:
            state = "live"
    breaker = getattr(client, "breaker", None)
    breaker_state = getattr(breaker, "state", None)
    if isinstance(breaker_state, str) and breaker_state != "closed":
        state = f"{state}, breaker {breaker_state.replace('_', '-')}"
    return state


def collect_status(bot) -> dict:
    """Gather the facts ``/status`` renders; every field degrades to unknown."""
    gateway = getattr(bot, "llm_gateway", None)
    provider_cfg = getattr(getattr(bot, "config", None), "llm_provider", None)
    requested = getattr(provider_cfg, "active_provider", None) or "codex"
    serving = None
    if gateway is not None:
        try:
            serving = gateway.capture_serving_identity()
        except Exception:
            log.exception("/status could not capture the serving identity")
    codex_client = getattr(gateway, "codex_client", None) if gateway is not None else None
    auth = getattr(codex_client, "auth", None)
    accounts = getattr(auth, "account_count", None)
    latency = getattr(bot, "latency", None)
    try:
        tool_count: int | None = len(bot.tool_catalog.merged_definitions())
    except Exception:
        tool_count = None

    def _count(owner: str) -> int | None:
        manager = getattr(bot, owner, None)
        try:
            return int(manager.active_count) if manager is not None else None
        except Exception:
            return None

    return {
        "version": __version__,
        "uptime_seconds": (
            time.monotonic() - bot.start_time
            if isinstance(getattr(bot, "start_time", None), (int, float))
            else None
        ),
        "latency_seconds": (
            latency if isinstance(latency, (int, float)) and math.isfinite(latency) else None
        ),
        "requested_provider": requested,
        "serving_provider": getattr(serving, "provider", None),
        "model": getattr(serving, "model", None),
        "reasoning_effort": getattr(serving, "reasoning_effort", None),
        "providers": {name: _provider_state(bot, name) for name in _PROVIDERS},
        "codex_accounts": accounts if isinstance(accounts, int) else None,
        "tool_count": tool_count,
        "active_agents": _count("agent_manager"),
        "active_loops": _count("loop_manager"),
    }


def render_status(facts: dict) -> str:
    requested = facts.get("requested_provider") or "?"
    serving = facts.get("serving_provider") or "not configured"
    provider_line = (
        f"Provider: **{serving}**"
        if serving == requested
        else f"Provider: **{serving}** (requested {requested} — fallback)"
    )
    model = facts.get("model") or "unknown"
    effort = facts.get("reasoning_effort")
    model_line = f"Model: **{model}**" + (f" · effort {effort}" if effort else "")
    providers = facts.get("providers") or {}
    codex_state = providers.get("codex", "?")
    accounts = facts.get("codex_accounts")
    if accounts is not None and codex_state != "disabled":
        codex_state = f"{codex_state} ({accounts} account{'s' if accounts != 1 else ''})"
    backends = (
        f"Codex: {codex_state} | Ollama: {providers.get('ollama', '?')} | "
        f"Kimi: {providers.get('kimi', '?')}"
    )
    latency = facts.get("latency_seconds")
    latency_text = f"{latency * 1000:.0f} ms" if latency is not None else "?"
    header = (
        f"**Odin v{facts.get('version', '?')}** · up {_fmt_duration(facts.get('uptime_seconds'))}"
        f" · Discord latency {latency_text}"
    )
    counts = (
        f"Tools advertised: {_or_unknown(facts.get('tool_count'))}"
        f" · Agents active: {_or_unknown(facts.get('active_agents'))}"
        f" · Loops active: {_or_unknown(facts.get('active_loops'))}"
    )
    return _bounded("\n".join([header, provider_line, model_line, backends, counts]))


# --------------------------------------------------------------------------
# /reload
# --------------------------------------------------------------------------

def render_reload(report) -> str:
    loaded = list(getattr(report, "loaded", ()) or ())
    removed = list(getattr(report, "removed", ()) or ())
    skipped = list(getattr(report, "skipped", ()) or ())
    if getattr(report, "directory_exists", True) is False:
        lines = ["**Context reloaded** — context directory does not exist; nothing is loaded."]
    else:
        lines = [
            f"**Context reloaded** — {len(loaded)} file{'s' if len(loaded) != 1 else ''} in "
            f"context ({_fmt_count(getattr(report, 'total_bytes', 0))} bytes, "
            f"{_fmt_count(getattr(report, 'context_chars', 0))} chars)"
        ]
    lines.append("Loaded: " + (", ".join(f"`{name}`" for name in loaded) if loaded else "none"))
    if removed:
        lines.append("Removed: " + ", ".join(f"`{name}`" for name in removed))
    if skipped:
        lines.append(
            "Skipped: " + "; ".join(f"`{name}` ({reason})" for name, reason in skipped)
        )
    return _bounded("\n".join(lines))


# --------------------------------------------------------------------------
# /usage
# --------------------------------------------------------------------------

def _window_line(label: str, window, now: float) -> str:
    if window is None:
        return f"{label}: not reported"
    text = f"{label}: {_fmt_percent(window.used_percent)} used"
    if window.resets_at is not None:
        remaining = window.resets_at - now
        text += f" · resets in {_fmt_duration(remaining)}" if remaining > 0 else " · reset due"
    return text


def _window_label(window, fallback: str) -> str:
    minutes = getattr(window, "window_minutes", None) if window is not None else None
    if isinstance(minutes, int) and minutes > 0:
        if minutes % 1440 == 0:
            return f"{minutes // 1440}d window"
        if minutes % 60 == 0:
            return f"{minutes // 60}h window"
        return f"{minutes}m window"
    return fallback


def _short_window(snapshot) -> str:
    primary = snapshot.primary.used_percent if snapshot.primary else None
    secondary = snapshot.secondary.used_percent if snapshot.secondary else None
    return f"{_fmt_percent(primary)}/{_fmt_percent(secondary)}"


def _display_label(value: object, fallback: str) -> str:
    """Normalize untrusted operator labels and neutralize Discord markup."""
    raw = value if isinstance(value, str) else fallback
    normalized = unicodedata.normalize("NFKC", raw)
    normalized = "".join(
        " " if unicodedata.category(ch).startswith("C") else ch for ch in normalized
    )
    normalized = " ".join(normalized.split())[:40] or fallback
    # escape_mentions handles @everyone/@here; neutralizing every remaining @
    # also keeps numeric user/role mention syntax inert.
    normalized = discord.utils.escape_mentions(normalized.replace("@", "@\u200b"))
    normalized = discord.utils.escape_markdown(normalized)
    # Discord still recognizes angle-bracket autolinks after escape_markdown.
    return re.sub(r"(?<!\\)([<>])", r"\\\1", normalized)


def render_quota(view, labels: dict[str, str], now: float) -> list[str]:
    """Lines for the current account first, then other accounts last-seen."""
    current_label = _display_label(labels.get(view.current_key or ""), "current account")
    lines: list[str] = []
    snapshot = view.current
    if snapshot is None:
        lines.append(
            f"**Codex quota — {current_label} (current)**: not yet observed in this process; "
            "the first ordinary Codex reply populates it."
        )
    else:
        age = _fmt_duration(now - snapshot.observed_at)
        lines.append(f"**Codex quota — {current_label} (current)** · observed {age} ago")
        lines.append(
            "  " + _window_line(_window_label(snapshot.primary, "primary"), snapshot.primary, now)
        )
        lines.append(
            "  "
            + _window_line(_window_label(snapshot.secondary, "secondary"), snapshot.secondary, now)
        )
        facts = []
        if snapshot.plan_type:
            facts.append(f"plan {snapshot.plan_type}")
        if snapshot.active_limit:
            facts.append(f"limit {snapshot.active_limit}")
        if snapshot.credits_unlimited:
            facts.append("credits unlimited")
        elif snapshot.credits_balance is not None:
            facts.append(f"credits {snapshot.credits_balance:g}")
        if facts:
            lines.append("  " + " · ".join(facts))
        if snapshot.limit_reached_type:
            lines.append(f"  ⚠ rate limit reached: {snapshot.limit_reached_type}")
    if view.others:
        others = []
        for other in view.others:
            label = _display_label(labels.get(other.account_key), "another account")
            others.append(
                f"{label} {_short_window(other)} ({_fmt_duration(now - other.observed_at)} ago)"
            )
        lines.append("Other accounts (last seen): " + " · ".join(others))
    return lines


def render_usage(summary: dict, range_name: str, quota_lines: list[str] | None) -> str:
    lines: list[str] = []
    if not summary.get("available"):
        lines.append(
            f"**Usage — {range_name}**: history unavailable "
            f"({summary.get('reason') or 'usage store not enabled'})"
        )
    else:
        work = summary.get("work") or {}
        inputs = work.get("input_tokens") or {}
        outputs = work.get("output_tokens") or {}
        cache = work.get("cache") or {}
        coverage = summary.get("coverage") or {}
        lines.append(
            f"**Usage — {range_name}** · settled turns {_fmt_count(work.get('settled_turns'))}"
            f" · generations {_fmt_count(work.get('accepted_generations'))}"
            f" · error turns {_fmt_count(work.get('explicit_error_turns'))}"
        )
        reported = inputs.get("provider_reported_percent")
        provenance = (
            f" ({_fmt_percent(reported)} provider-reported)" if reported is not None else ""
        )
        lines.append(
            f"Tokens: in {_fmt_count(inputs.get('total'))}{provenance}"
            f" · out {_fmt_count(outputs.get('total'))}"
        )
        if cache.get("generations_reported"):
            lines.append(
                f"Prompt cache: read {_fmt_count(cache.get('cached_tokens'))}"
                f" · write {_fmt_count(cache.get('cache_write_tokens'))}"
                f" (subsets of input, {_fmt_count(cache.get('generations_reported'))} generations)"
            )
        notes = []
        if inputs.get("approximate") or outputs.get("approximate"):
            notes.append("some generations are estimated or unknown")
        if coverage.get("backfill_complete") is False:
            notes.append("history backfill incomplete")
        if coverage.get("malformed_rows_skipped"):
            notes.append(f"{coverage['malformed_rows_skipped']} malformed rows skipped")
        if notes:
            lines.append("Coverage: " + "; ".join(notes))
    if quota_lines:
        lines.extend(quota_lines)
    else:
        lines.append("Codex quota: no Codex auth pool is configured.")
    return _bounded("\n".join(lines))


def _quota_lines(bot, now: float) -> list[str] | None:
    gateway = getattr(bot, "llm_gateway", None)
    client = getattr(gateway, "codex_client", None) if gateway is not None else None
    auth = getattr(client, "auth", None)
    if auth is None or not hasattr(auth, "quota_view"):
        return None
    try:
        view = auth.quota_view()
        labels = {
            row["key"]: row["label"]
            for row in auth.describe_accounts()
            if row.get("key")
        }
    except Exception:
        log.exception("/usage could not read the Codex quota view")
        return ["Codex quota: unavailable (see logs)."]
    return render_quota(view, labels, now)


# --------------------------------------------------------------------------
# registration
# --------------------------------------------------------------------------

def register_commands(bot) -> None:
    @bot.tree.command(name="status", description="Show Odin's runtime configuration and health")
    async def cmd_status(interaction: discord.Interaction) -> None:
        if not bot.intake.is_allowed_user(interaction.user):
            await interaction.response.send_message("Access denied.", ephemeral=True)
            return
        await interaction.response.send_message(render_status(collect_status(bot)))

    @bot.tree.command(
        name="reload", description="Reload context files and show what is in context"
    )
    async def cmd_reload(interaction: discord.Interaction) -> None:
        if not bot.intake.is_allowed_user(interaction.user):
            await interaction.response.send_message("Access denied.", ephemeral=True)
            return
        report = bot.context_loader.reload()
        bot.prompt_builder.invalidate()
        bot.tool_catalog.invalidate()
        bot.prompt_builder.rebuild_default()
        await interaction.response.send_message(render_reload(report), ephemeral=True)

    @bot.tree.command(
        name="usage", description="Show usage totals and the current Codex quota"
    )
    @app_commands.describe(window="History range to summarize (default 7d)")
    async def cmd_usage(interaction: discord.Interaction, window: UsageRange = "7d") -> None:
        if not bot.intake.is_allowed_user(interaction.user):
            await interaction.response.send_message("Access denied.", ephemeral=True)
            return
        range_name = window if window in USAGE_RANGES else "7d"
        # The rollup read happens off-thread; defer so a slow disk cannot
        # turn a truthful answer into an expired interaction.
        await interaction.response.defer(ephemeral=True)
        rollup = getattr(bot, "usage_rollup", None)
        if rollup is None:
            summary: dict = {"available": False, "reason": "usage store not enabled"}
        else:
            try:
                summary = await rollup.summary(range_name)
            except Exception:
                log.exception("/usage summary failed")
                summary = {"available": False, "reason": "summary failed"}
        now = time.time()
        await interaction.followup.send(
            render_usage(summary, range_name, _quota_lines(bot, now)), ephemeral=True
        )

    @bot.tree.command(name="stop", description="Stop Odin's current task in this channel")
    async def cmd_stop(interaction: discord.Interaction) -> None:
        if not bot.intake.is_allowed_user(interaction.user):
            await interaction.response.send_message("Access denied.", ephemeral=True)
            return
        channel_id = str(interaction.channel_id)
        stop_target = bot.channel_state.request_stop(channel_id)
        if stop_target is not None:
            _request_id, waiter = stop_target
            # A safe stop may need to wait for an effect-capable tool to finish.
            # Defer before waiting so Discord's three-second interaction window
            # does not turn a truthful acknowledgement into an expired one.
            await interaction.response.defer(ephemeral=True)
            try:
                result = await asyncio.wait_for(asyncio.shield(waiter), timeout=10.0)
            except TimeoutError:
                bot.channel_state.expire_stop_waiter(channel_id, _request_id, waiter)
                result = (
                    "Stop requested, but the in-flight operation could not be "
                    "safely interrupted yet."
                )
            await interaction.followup.send(result, ephemeral=True)
        else:
            await interaction.response.send_message(
                "No active task in this channel.", ephemeral=True
            )
