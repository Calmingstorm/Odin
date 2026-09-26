"""Compatible request, admission, runtime and overflow reserve agreement (#386)."""

from __future__ import annotations

import logging
from types import SimpleNamespace

import pytest

from src.agents.manager import AgentInfo, _call_llm_with_recovery, _compatible_overflow_target_chars
from src.config.schema import (
    OpenAICodexConfig,
    OpenAICompatibleConfig,
    OpenAICompatibleModelProfile,
    OpenRouterRoutingConfig,
)
from src.discord.llm_gateway import LLMServingIdentity
from src.discord.native_tools.agents_tasks import _generation_budget_snapshot
from src.discord.tool_loop import ToolLoopRunner
from src.llm.context_budget import (
    COMPATIBLE_RESCUE_MIN_USABLE_TOKENS,
    FIXED_ENVELOPE_RESERVE_TOKENS,
    compatible_agent_unavailable_reason,
    snapshot_for_compatible_profile,
)
from src.llm.context_compressor import estimate_message_chars
from src.llm.errors import LLMContextLengthError
from src.llm.openai_compatible import OpenAICompatibleClient


def _config(model: str, total: int, output: int, *, openrouter: bool) -> OpenAICompatibleConfig:
    profile = OpenAICompatibleModelProfile(total_window_tokens=total, max_output_tokens=output)
    if openrouter:
        return OpenAICompatibleConfig(
            preset="openrouter",
            base_url="https://openrouter.ai/api/v1",
            model=model,
            model_profiles={},
            openrouter=OpenRouterRoutingConfig(catalogue_profiles={model: profile}),
        )
    return OpenAICompatibleConfig(model=model, model_profiles={model: profile})


def _client(cfg: OpenAICompatibleConfig) -> OpenAICompatibleClient:
    return OpenAICompatibleClient(
        "test",
        model=cfg.model,
        base_url=cfg.base_url,
        provider_name="compat",
        max_tokens=cfg.max_tokens,
        model_profiles=cfg.model_profiles,
        openrouter_routing=cfg.openrouter if cfg.preset == "openrouter" else None,
    )


def _chat_snapshot(model: str, root):
    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    runner._get_context_compressor = lambda: None
    runner._window_observer = None
    serving = LLMServingIdentity(
        "compat", SimpleNamespace(model=model, provider_name="compat"), model, None
    )
    return runner._capture_budget_snapshot(serving, root)


CASES = [
    ("deepseek-v4-flash", 1_048_576, 393_216, False),
    ("vendor/output-equals-context", 163_840, 163_840, True),
    ("vendor/small-output", 200_000, 8_192, False),
    ("vendor/at-ceiling", 200_000, 32_768, True),
    ("vendor/too-small", 70_000, 10_000, False),
]


@pytest.mark.parametrize(("model", "total", "output", "openrouter"), CASES)
def test_request_admission_runtime_and_rescue_reserve_the_same_output(
    model, total, output, openrouter, caplog
):
    cfg = _config(model, total, output, openrouter=openrouter)
    root = SimpleNamespace(openai_codex=OpenAICodexConfig(), openai_compatible=cfg)
    client = _client(cfg)
    request_cap = client._request_max_tokens(model=model)
    chat = _chat_snapshot(model, root)
    agent = _generation_budget_snapshot(root, client, model, None, is_codex=False)
    assert total - chat.base_budget == request_cap
    assert total - agent.base_budget == request_cap
    assert chat == agent

    admitted = compatible_agent_unavailable_reason(model, cfg) is None
    assert admitted == (chat.working_budget >= COMPATIBLE_RESCUE_MIN_USABLE_TOKENS)
    assert admitted == bool(chat.ladder)

    caplog.set_level(logging.WARNING)
    plan = {"client": client, "model": model, "is_codex": False, "snapshot": agent}
    exc = LLMContextLengthError(
        "overflow", code="context_length_exceeded", context_window_tokens=total
    )
    expected = max(1, (total - request_cap - FIXED_ENVELOPE_RESERVE_TOKENS) * 2500 // 1000)
    assert _compatible_overflow_target_chars(exc, plan) == expected
    assert "profile/request output mismatch" not in caplog.text
    if output <= 32_768:
        # The below-cap and at-cap cases also prove the transition to an
        # over-cap profile. Otherwise these parameter rows pass on master.
        next_cfg = _config(model, total, 32_769, openrouter=openrouter)
        next_root = SimpleNamespace(openai_codex=OpenAICodexConfig(), openai_compatible=next_cfg)
        next_cap = _client(next_cfg)._request_max_tokens(model=model)
        assert next_cap == 32_768
        assert total - _chat_snapshot(model, next_root).base_budget == next_cap
        assert (
            total
            - _generation_budget_snapshot(
                next_root, _client(next_cfg), model, None, is_codex=False
            ).base_budget
            == next_cap
        )


def test_admitted_profile_never_gets_a_zero_runtime_budget():
    model = "vendor/output-equals-context"
    cfg = _config(model, 163_840, 163_840, openrouter=True)
    root = SimpleNamespace(openai_codex=OpenAICodexConfig(), openai_compatible=cfg)
    assert compatible_agent_unavailable_reason(model, cfg) is None
    for snapshot in (
        _chat_snapshot(model, root),
        _generation_budget_snapshot(root, _client(cfg), model, None, is_codex=False),
    ):
        assert snapshot.working_budget == 98_304
        assert snapshot.primary_chars == 140_760
        assert snapshot.ladder == (98_532,)


def test_request_override_and_admission_guards_alongside_runtime_regression():
    cfg = _config("vendor/big-output", 163_840, 163_840, openrouter=False)
    client = _client(cfg)
    # Request output is unchanged, including explicit overrides and fallback.
    assert client._request_max_tokens() == 32_768
    assert client._request_max_tokens(1_234) == 1_234
    unknown = _config("vendor/missing", 163_840, 32_768, openrouter=False)
    unknown.model_profiles.clear()
    assert _client(unknown)._request_max_tokens() == unknown.max_tokens
    # Admission's existing eligibility and reason-string behavior is pinned.
    assert compatible_agent_unavailable_reason("vendor/big-output", cfg) is None
    assert compatible_agent_unavailable_reason("vendor/missing", cfg) == (
        "no context profile configured"
    )
    # These guards share an actual mismatch assertion and fail on master.
    assert (
        snapshot_for_compatible_profile(
            "vendor/big-output", cfg, max_context_chars=None
        ).base_budget
        == 131_072
    )


def _history(total_chars: int) -> list[dict]:
    messages: list[dict] = [{"role": "user", "content": "TASK"}]
    chunk = "x" * 50_000
    i = 0
    while estimate_message_chars(messages) < total_chars:
        messages.extend(
            [
                {
                    "role": "assistant",
                    "content": [
                        {"type": "tool_use", "id": f"t{i}", "name": "read_file", "input": {"p": i}}
                    ],
                },
                {
                    "role": "user",
                    "content": [{"type": "tool_result", "tool_use_id": f"t{i}", "content": chunk}],
                },
            ]
        )
        i += 1
    return messages


async def test_dense_overflow_below_typed_target_compacts_instead_of_resending():
    cfg = OpenAICompatibleConfig()
    model = "deepseek-v4-flash"
    client = OpenAICompatibleClient(
        "fixture", model=model, provider_name="compat", model_profiles=cfg.model_profiles
    )
    snapshot = snapshot_for_compatible_profile(model, cfg, max_context_chars=None)
    agent = AgentInfo(
        id="dense", label="d", goal="g", channel_id="c", requester_id="u", requester_name="u"
    )
    agent.messages = _history(1_750_000)
    agent.iteration_timeout = 30
    sent: list[int] = []

    async def callback(messages, system_prompt, tools, generation_state=None):
        generation_state.setdefault(
            "plan", {"client": client, "model": model, "is_codex": False, "snapshot": snapshot}
        )
        sent.append(estimate_message_chars(messages))
        if sent[-1] > 1_400_000:
            raise LLMContextLengthError(
                "overflow", code="context_length_exceeded", context_window_tokens=1_048_576
            )
        return {"text": "DONE", "tool_calls": [], "stop_reason": "end_turn"}

    result = await _call_llm_with_recovery(
        agent, callback, "sys", [], rescue_ladder=snapshot.ladder, generation_state={}
    )
    assert result is not None
    assert len(sent) == 2 and sent[1] < sent[0]
    assert agent.context_recoveries[0]["target_chars"] < sent[0]
