"""Focused coverage for the multi-provider agent-generation boundary.

These tests intentionally exercise the small policy adapters directly.  They
do not start an AgentManager worker or a real provider request.
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

import src.discord.native_tools.agents_tasks as mod


def test_spawn_reasoning_parser_rejects_fixed_axes_and_bad_neutral_values():
    assert "not accepted" in mod._parse_spawn_reasoning_overrides(
        {"model": None}, model_mode="fixed"
    )[-1]
    assert "not accepted" in mod._parse_spawn_reasoning_overrides(
        {"reasoning_effort": None}, effort_mode="fixed"
    )[-1]
    assert "not accepted" in mod._parse_spawn_reasoning_overrides(
        {"thinking_mode": "adaptive"}, thinking_mode="adaptive"
    )[-1]
    assert "not accepted" in mod._parse_spawn_reasoning_overrides(
        {"reasoning": "low"}, neutral_reasoning=False
    )[-1]
    assert "invalid thinking_mode" in mod._parse_spawn_reasoning_overrides(
        {"thinking_mode": "bogus"}
    )[-1]
    assert "invalid reasoning" in mod._parse_spawn_reasoning_overrides(
        {"reasoning": "bogus"}, neutral_reasoning=True
    )[-1]


@pytest.mark.parametrize(
    ("dialect", "attrs", "expected"),
    [
        ("codex", SimpleNamespace(agent_reasoning_effort="auto"), (None, None)),
        ("codex", SimpleNamespace(agent_reasoning_effort="high"), ("high", None)),
        ("thinking", SimpleNamespace(thinking_mode="enabled"), (None, "disabled")),
        ("thinking", SimpleNamespace(), (None, "disabled")),
        ("effort", SimpleNamespace(reasoning_effort="low"), ("low", None)),
        ("effort", SimpleNamespace(reasoning_effort="auto"), (None, None)),
        ("none", SimpleNamespace(), (None, None)),
    ],
)
def test_native_reasoning_defaults_cover_provider_dialects(monkeypatch, dialect, attrs, expected):
    cfg = SimpleNamespace(
        openai_codex=attrs,
        agents=SimpleNamespace(thinking_mode=None),
        openai_compatible=SimpleNamespace(
            thinking_mode="disabled", openrouter=attrs
        ),
    )
    monkeypatch.setattr(
        "src.tools.agent_tool_policy.agent_allowlist_entry", lambda *_: None
    )
    monkeypatch.setattr(
        "src.tools.agent_tool_policy.model_reasoning_dialect", lambda *_: dialect
    )
    assert mod._entry_native_reasoning(cfg, "model") == expected


def test_native_reasoning_value_and_observer_lookups_are_total(monkeypatch):
    cfg = SimpleNamespace()
    monkeypatch.setattr(
        "src.tools.agent_tool_policy.model_reasoning_dialect",
        lambda _cfg, model: "none" if model == "plain" else "thinking",
    )
    assert mod._native_reasoning_value(cfg, None, "high", None) == "not applicable"
    assert mod._native_reasoning_value(cfg, "plain", "high", None) == "not applicable"
    assert mod._native_reasoning_value(cfg, "thinker", None, "enabled") == "thinking: enabled"

    class BrokenObserver:
        def active_clamp(self, _model):
            raise RuntimeError("clamp")

        def density_for(self, _scope, _model):
            raise RuntimeError("density")

    observer = BrokenObserver()
    assert mod._observer_clamp(observer, "m") is None
    assert mod._observer_density(observer, mod._agent_scope("a"), "m") is None
    assert mod._agent_scope(None) is None


def test_entry_auto_and_generation_plan_thinking_fallback(monkeypatch):
    entry = SimpleNamespace(model="compat:thinker", reasoning_effort="auto", thinking_mode=None)
    monkeypatch.setattr(
        "src.tools.agent_tool_policy.agent_allowlist_entry", lambda *_: entry
    )
    assert mod._entry_native_reasoning(SimpleNamespace(), entry.model) == (None, None)

    monkeypatch.setattr(
        "src.tools.agent_tool_policy.model_reasoning_dialect", lambda *_: "thinking"
    )
    client = SimpleNamespace(model="thinker", provider_name="compat")
    serving = SimpleNamespace(
        provider="compat", client=client, model="thinker", reasoning_effort=None
    )
    cfg = SimpleNamespace(agents=SimpleNamespace())
    plan = mod._capture_agent_generation_plan(
        lambda: cfg,
        lambda _cfg: serving,
        lambda: None,
        model_override="compat:thinker",
        effort_override=None,
    )
    assert plan["thinking_mode"] == "adaptive"


def test_spawn_effort_only_catalogue_forces_effort_axis_auto(monkeypatch):
    tools = object.__new__(mod.AgentTaskTools)
    cfg = SimpleNamespace(
        agents=SimpleNamespace(
            model="auto",
            thinking_mode=None,
            auto_model_allowlist=["compat:qwen"],
            max_nesting_depth=2,
        ),
        tools=SimpleNamespace(enabled=False),
        llm_provider=SimpleNamespace(model="compat:qwen"),
        openai_compatible=SimpleNamespace(),
    )
    tools._get_config = lambda: cfg
    tools._llm_gateway = SimpleNamespace(active_client=None)
    monkeypatch.setattr(
        "src.tools.agent_tool_policy.effective_agent_model_choices",
        lambda _cfg: ["compat:qwen"],
    )
    monkeypatch.setattr(
        "src.tools.agent_tool_policy.mixed_agent_reasoning", lambda *_: False
    )
    monkeypatch.setattr(
        "src.tools.agent_tool_policy.model_reasoning_dialect", lambda *_: "effort"
    )
    # The compatible override reaches the serving check after the effort axis
    # has been promoted to auto, proving the effort-only branch was traversed.
    message = SimpleNamespace(author=SimpleNamespace(id=1))
    output = asyncio.run(
        tools._handle_spawn_agent(
            message,
            {"label": "q", "goal": "g", "model": "compat:qwen", "reasoning_effort": "high"},
        )
    )
    assert output.startswith("Error:")


@pytest.mark.asyncio
async def test_collect_result_without_agent_config_uses_legacy_timeout():
    tools = object.__new__(mod.AgentTaskTools)
    manager = SimpleNamespace(
        _agents={},
        wait_for_agents=AsyncMock(
            return_value={"missing": {"status": "failed", "label": "missing", "error": "gone"}}
        ),
    )
    tools._agent_manager = manager
    tools._get_config = lambda: SimpleNamespace()
    text, raw = await tools._collect_agent_result("missing")
    manager.wait_for_agents.assert_awaited_once_with(["missing"], timeout=3660)
    assert raw["status"] == "failed"
    assert "gone" in text


@pytest.mark.asyncio
async def test_evidence_and_density_recorders_gate_on_codex_provenance():
    observer = MagicMock()
    observer.record_rescue = AsyncMock()
    observer.record_density = MagicMock()
    cell = {"id": "agent-7"}
    evidence = mod._make_evidence_recorder(observer)
    density = mod._make_density_recorder(observer, cell)

    await evidence(False, {"provider": "ollama", "model": "gpt-5.6-sol"})
    density({"provider": "ollama", "model": "gpt-5.6-sol"}, 10, 0)
    observer.record_rescue.assert_not_awaited()
    observer.record_density.assert_not_called()

    await evidence(
        True,
        {
            "provider": "codex",
            "account_key": "acct",
            "model": "gpt-5.6-sol",
            "server_input_tokens": 42,
        },
        rejected_attempt=1,
        accepted_chars=20,
        accepted_images=0,
    )
    density(
        {"provider": "codex", "model": "gpt-5.6-sol", "server_input_tokens": 42},
        20,
        0,
    )
    observer.record_rescue.assert_awaited_once()
    observer.record_density.assert_called_once()

    # Object responses from a diverted provider are also ignored.
    await evidence(False, SimpleNamespace(provenance_provider="ollama"))
    assert observer.record_rescue.await_count == 1


class _ProviderClient:
    model = "qwen3"
    provider_name = "compat"

    async def chat_with_tools(self, **kwargs):
        self.kwargs = kwargs
        return SimpleNamespace(provenance_provider="compat", text="ok")


@pytest.mark.asyncio
async def test_agent_generate_uses_thinking_and_compat_request_controls():
    client = _ProviderClient()
    gateway = SimpleNamespace(
        capacity_breaker_for=MagicMock(return_value=None),
        recovery_policy=MagicMock(return_value=SimpleNamespace()),
        notify_generation_success=MagicMock(),
    )
    tools = object.__new__(mod.AgentTaskTools)
    tools._llm_gateway = gateway

    async def fake_recovery(attempt, *, policy, breaker):
        return await attempt()

    original = mod.generate_with_recovery
    mod.generate_with_recovery = fake_recovery
    try:
        result = await tools._agent_generate(
            client,
            messages=[],
            sys_prompt="sys",
            tool_defs=[],
            agent_effort=None,
            resolved_model="qwen3",
            provider="compat",
            reasoning_dialect="thinking",
            thinking_mode="enabled",
            reasoning_capable=True,
        )
    finally:
        mod.generate_with_recovery = original
    assert result.provenance_provider == "compat"
    assert client.kwargs["thinking_mode"] == "enabled"
    assert client.kwargs["apply_reasoning"] is True


def test_provenance_stamp_preserves_unknowns():
    stamped = mod._provenance_stamp(SimpleNamespace(), SimpleNamespace(provider_name="x"))
    assert stamped == {
        "provider": "",
        "model": "",
        "reasoning_effort": None,
        "upstream_provider": None,
    }
