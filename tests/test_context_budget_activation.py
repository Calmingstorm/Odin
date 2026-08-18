"""Budget-policy activation (context-budget campaign phase 3).

Pins the wiring that makes the per-model resolver real: agents resolve
their EFFECTIVE model's snapshot per generation, chat's soft threshold
follows the serving model, rescue ladders come from the snapshot, and the
no-provider fallback reproduces the pre-campaign conservative math.
"""

from __future__ import annotations

from types import SimpleNamespace

from src.agents.manager import _fallback_budget_snapshot
from src.config.schema import ContextCompressionConfig, OpenAICodexConfig
from src.discord.native_tools.agents_tasks import _make_budget_snapshot_provider
from src.discord.tool_loop import ToolLoopRunner
from src.llm.context_budget import snapshot_for_codex_config
from src.llm.context_compressor import estimate_message_chars


class _CodexClient(SimpleNamespace):
    """Codex-shaped: has reasoning_effort, so agent policy resolves models."""


def _codex_client(model="gpt-5.6-sol"):
    return _CodexClient(model=model, reasoning_effort="xhigh")


# ---------------------------------------------------------------------------
# snapshot_for_codex_config
# ---------------------------------------------------------------------------
class TestSnapshotForCodexConfig:
    def test_reads_live_policy_fields_and_passed_ceiling(self):
        cfg = OpenAICodexConfig(
            context_budget_overrides={"gpt-5.6-sol": 800_000},
            context_utilization=100,
        )
        snap = snapshot_for_codex_config("gpt-5.6-sol", cfg, max_context_chars=1_000_000)
        assert snap.base_budget == 800_000
        assert snap.working_budget == 800_000  # utilization 100
        assert snap.primary_chars == 1_000_000  # explicit ceiling lowers
        assert snap.ceiling_applied is True

    def test_getattr_safe_on_none_config(self):
        snap = snapshot_for_codex_config("gpt-5.6-sol", None, max_context_chars=None)
        assert snap.primary_chars == 1_277_400  # defaults: 60% utilization

    def test_fallback_snapshot_is_unknown_model_math(self):
        snap = _fallback_budget_snapshot()
        assert snap.base_source == "unknown_default"
        assert snap.primary_chars == 575_000
        assert snap.ladder == (402_500, 400_000)


# ---------------------------------------------------------------------------
# Agent spawn-path provider
# ---------------------------------------------------------------------------
class TestAgentSnapshotProvider:
    def test_inherit_tracks_live_model_next_generation(self):
        config = SimpleNamespace(
            openai_codex=OpenAICodexConfig(model="gpt-5.6-sol", agent_model=None)
        )
        client = _codex_client("gpt-5.6-sol")
        compressor = ContextCompressionConfig()
        provider = _make_budget_snapshot_provider(
            lambda: config, lambda: client, lambda: compressor, None
        )
        assert provider().canonical_model == "gpt-5.6-sol"
        assert provider().primary_chars == 1_277_400
        # A live model change reaches the NEXT resolution.
        config.openai_codex.model = "gpt-5.5"
        client.model = "gpt-5.5"
        after = provider()
        assert after.canonical_model == "gpt-5.5"
        assert after.primary_chars == 570_002

    def test_fixed_override_wins_over_live_config(self):
        config = SimpleNamespace(
            openai_codex=OpenAICodexConfig(model="gpt-5.6-sol", agent_model=None)
        )
        provider = _make_budget_snapshot_provider(
            lambda: config, lambda: _codex_client(), lambda: ContextCompressionConfig(),
            "gpt-5.5",
        )
        snap = provider()
        assert snap.canonical_model == "gpt-5.5"
        assert snap.primary_chars == 570_002

    def test_non_codex_client_uses_its_own_model_name(self):
        config = SimpleNamespace(openai_codex=OpenAICodexConfig())
        ollama = SimpleNamespace(model="qwen3:14b")  # no reasoning_effort attr
        provider = _make_budget_snapshot_provider(
            lambda: config, lambda: ollama, lambda: ContextCompressionConfig(), None
        )
        snap = provider()
        assert snap.base_source == "unknown_default"
        assert snap.primary_chars == 575_000

    def test_non_codex_collision_gets_unknown_math(self):
        """Review blocker #2 pin (agents): an Ollama client named after a
        Codex slug never inherits the Codex capability floor."""
        config = SimpleNamespace(openai_codex=OpenAICodexConfig())
        impostor = SimpleNamespace(model="gpt-5.6-sol")  # not codex-shaped
        provider = _make_budget_snapshot_provider(
            lambda: config, lambda: impostor, lambda: ContextCompressionConfig(), None
        )
        snap = provider()
        assert snap.base_source == "unknown_default"
        assert snap.primary_chars == 575_000

    def test_frozen_ceiling_comes_from_compressor_object(self):
        config = SimpleNamespace(openai_codex=OpenAICodexConfig())
        compressor = ContextCompressionConfig(max_context_chars=500_000)
        provider = _make_budget_snapshot_provider(
            lambda: config, lambda: _codex_client(), lambda: compressor, None
        )
        snap = provider()
        assert snap.primary_chars == 500_000
        assert snap.ceiling_applied is True


# ---------------------------------------------------------------------------
# Chat soft threshold follows the serving model
# ---------------------------------------------------------------------------
def _chat_runner(model, compressor, *, codex_shaped=True):
    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    runner._get_context_compressor = lambda: compressor
    runner._get_compression_stats = lambda: None
    runner._get_config = lambda: SimpleNamespace(openai_codex=OpenAICodexConfig())
    client = (
        _CodexClient(model=model, reasoning_effort="xhigh")
        if codex_shaped
        else SimpleNamespace(model=model)
    )
    runner._llm_gateway = SimpleNamespace(active_client=client)
    return runner


def _bulk_messages(char_target: int) -> list[dict]:
    # A prefix plus enough structurally complete tool iterations to cross
    # any threshold under test; sizes dominated by tool_result payloads.
    messages: list[dict] = [{"role": "user", "content": "task"}]
    # Small chunks so every fixture comfortably exceeds keep_recent=30
    # iterations — the soft pass only summarizes OLDER-than-recent ones.
    chunk = "y" * 12_000
    while estimate_message_chars(messages) < char_target:
        messages.append(
            {"role": "assistant", "content": [
                {"type": "tool_use", "id": f"t{len(messages)}", "name": "read_file",
                 "input": {"path": "x"}},
            ]}
        )
        messages.append(
            {"role": "user", "content": [
                {"type": "tool_result", "tool_use_id": f"t{len(messages) - 1}",
                 "content": chunk},
            ]}
        )
    return messages


class TestChatSoftThreshold:
    def test_sol_headroom_no_compress_where_legacy_would_have(self):
        """850K chars: over the legacy 750K, comfortably under sol's 1.277M —
        the whole point of the campaign is that this stays uncompressed."""
        st = SimpleNamespace(iteration=3, messages=_bulk_messages(850_000))
        before = list(st.messages)
        _chat_runner("gpt-5.6-sol", ContextCompressionConfig())._maybe_compress(st)
        assert st.messages == before

    def test_sol_compresses_past_model_threshold(self):
        st = SimpleNamespace(iteration=3, messages=_bulk_messages(1_400_000))
        _chat_runner("gpt-5.6-sol", ContextCompressionConfig())._maybe_compress(st)
        assert estimate_message_chars(st.messages) < 1_400_000

    def test_unknown_model_keeps_conservative_threshold(self):
        st = SimpleNamespace(iteration=3, messages=_bulk_messages(700_000))
        _chat_runner("some-local-model", ContextCompressionConfig())._maybe_compress(st)
        # 700K > the 575K unknown-model target: compressed.
        assert estimate_message_chars(st.messages) < 700_000

    def test_explicit_ceiling_still_lowers(self):
        st = SimpleNamespace(iteration=3, messages=_bulk_messages(600_000))
        _chat_runner(
            "gpt-5.6-sol", ContextCompressionConfig(max_context_chars=500_000)
        )._maybe_compress(st)
        assert estimate_message_chars(st.messages) < 600_000

    def test_non_codex_client_named_like_codex_slug_gets_unknown_math(self):
        """Review blocker #2 pin (chat): provider identity gates the registry.
        A non-Codex client literally named gpt-5.6-sol compacts at the
        conservative 575K unknown-model target, never sol's 1.277M floor."""
        st = SimpleNamespace(iteration=3, messages=_bulk_messages(700_000))
        _chat_runner(
            "gpt-5.6-sol", ContextCompressionConfig(), codex_shaped=False
        )._maybe_compress(st)
        assert estimate_message_chars(st.messages) < 700_000

    def test_first_iteration_never_compresses(self):
        st = SimpleNamespace(iteration=0, messages=_bulk_messages(2_000_000))
        before = list(st.messages)
        _chat_runner("gpt-5.6-sol", ContextCompressionConfig())._maybe_compress(st)
        assert st.messages == before
