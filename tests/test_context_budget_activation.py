"""Budget-policy activation (context-budget campaign phase 3).

Pins the wiring that makes the per-model resolver real: agents resolve
their EFFECTIVE model's snapshot per generation, chat's soft threshold
follows the serving model, rescue ladders come from the snapshot, and the
no-provider fallback reproduces the pre-campaign conservative math.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.agents.manager import _fallback_budget_snapshot
from src.config.schema import ContextCompressionConfig, OpenAICodexConfig
from src.discord.llm_gateway import LLMGateway
from src.discord.native_tools.agents_tasks import (
    _capture_agent_generation_plan,
    _make_budget_snapshot_provider,
)
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


# ---------------------------------------------------------------------------
# Round-2 blocker regression pins
# ---------------------------------------------------------------------------
class TestRound2GenerationIdentityPins:
    async def test_agent_plan_freezes_effective_effort_before_in_place_mutation(self):
        """The production live-reload shape mutates the SAME client object.
        A frozen plan must contain xhigh, never the None inherit sentinel that
        would re-read the now-max client during rescue."""
        cfg = SimpleNamespace(
            openai_codex=OpenAICodexConfig(
                model="gpt-5.6-sol",
                agent_model=None,
                agent_reasoning_effort=None,
            )
        )
        client = _codex_client("gpt-5.6-sol")
        plan = _capture_agent_generation_plan(
            lambda: cfg,
            lambda _cfg: client,
            lambda: ContextCompressionConfig(),
            model_override=None,
            effort_override=None,
        )
        assert plan["effort"] == "xhigh"
        client.reasoning_effort = "max"
        assert plan["client"] is client
        assert plan["effort"] == "xhigh"

    def test_agent_capture_reads_root_config_once(self):
        configs = [
            SimpleNamespace(
                openai_codex=OpenAICodexConfig(
                    model="gpt-5.6-sol",
                    context_budget_overrides={"gpt-5.6-sol": 800_000},
                )
            ),
            SimpleNamespace(
                openai_codex=OpenAICodexConfig(
                    model="gpt-5.5",
                    context_budget_overrides={"gpt-5.6-sol": 270_001},
                )
            ),
        ]
        reads = 0

        def get_config():
            nonlocal reads
            value = configs[min(reads, 1)]
            reads += 1
            return value

        plan = _capture_agent_generation_plan(
            get_config,
            lambda _cfg: _codex_client("gpt-5.6-sol"),
            lambda: ContextCompressionConfig(),
            model_override=None,
            effort_override=None,
        )
        assert reads == 1
        assert plan["model"] == "gpt-5.6-sol"
        assert plan["snapshot"].base_budget == 800_000

    async def test_chat_capture_and_budget_share_one_root_config_read(self):
        configs = [
            SimpleNamespace(
                llm_provider=SimpleNamespace(active_provider="codex"),
                openai_codex=OpenAICodexConfig(
                    model="gpt-5.6-sol",
                    context_budget_overrides={"gpt-5.6-sol": 800_000},
                ),
            ),
            SimpleNamespace(
                llm_provider=SimpleNamespace(active_provider="codex"),
                openai_codex=OpenAICodexConfig(
                    model="gpt-5.5",
                    context_budget_overrides={"gpt-5.6-sol": 270_001},
                ),
            ),
        ]
        reads = 0

        def get_config():
            nonlocal reads
            value = configs[min(reads, 1)]
            reads += 1
            return value

        client = _codex_client("gpt-5.6-sol")
        gateway = LLMGateway(
            get_config=get_config,
            codex_client=client,
            ollama_client=None,
            kimi_client=None,
            subsystem_guard=None,
            auxiliary_llm_client=None,
            cost_tracker=None,
            sessions=SimpleNamespace(),
            reflector=SimpleNamespace(),
        )
        from tests.test_typing_resilience import _make_runner, _stub_state

        runner, _saved, _cleared = _make_runner()
        runner._get_config = get_config
        runner._llm_gateway = gateway
        runner._judge_entry_stuck = AsyncMock(return_value=None)
        captures = []
        runner._maybe_compress = lambda st, client, config: (
            captures.append((client, config)) or True
        )
        done = ("done", False, False, [], False)
        runner._call_llm = AsyncMock(return_value=("done", done))
        assert await runner._run_chat_iterations(_stub_state()) == done
        assert reads == 1
        assert captures == [(client, configs[0])]
        serving = runner._call_llm.await_args.kwargs["serving_identity"]
        assert serving.model == "gpt-5.6-sol"

    async def test_chat_soft_and_rescue_share_one_observer_snapshot(self):
        from src.llm.errors import LLMRequestError
        from src.llm.recovery import RecoveryPolicy
        from tests.test_typing_resilience import FakeChannel, _make_runner, _stub_state

        class ChangingObserver:
            def __init__(self):
                self.calls = 0
                self.density_calls = 0

            def active_clamp(self, _model):
                self.calls += 1
                return 500_000 if self.calls == 1 else 100_000

            def density_for(self, _scope, _model):
                self.density_calls += 1
                return 2500 if self.density_calls == 1 else 2000

        class Client:
            model = "gpt-5.6-sol"
            reasoning_effort = "xhigh"

            async def chat_with_tools(self, **_kwargs):
                raise LLMRequestError(
                    "overflow",
                    provider="codex",
                    model=self.model,
                    code="context_length_exceeded",
                )

        config = SimpleNamespace(
            llm_provider=SimpleNamespace(active_provider="codex"),
            openai_codex=OpenAICodexConfig(),
        )
        client = Client()
        gateway = LLMGateway(
            get_config=lambda: config,
            codex_client=client,
            ollama_client=None,
            kimi_client=None,
            subsystem_guard=None,
            auxiliary_llm_client=None,
            cost_tracker=None,
            sessions=SimpleNamespace(),
            reflector=SimpleNamespace(),
            recovery_policy_source=lambda: RecoveryPolicy(deadline_seconds=1),
        )
        runner, _saved, _cleared = _make_runner()
        runner._get_config = lambda: config
        runner._llm_gateway = gateway
        runner._window_observer = ChangingObserver()
        runner._judge_entry_stuck = AsyncMock(return_value=None)
        runner._get_context_compressor = lambda: None
        st = _stub_state(channel=FakeChannel())
        st._trajectory.context_recoveries = []
        st.messages = [
            {"role": "user", "content": "history" * 80_000},
            {"role": "developer", "content": "preamble"},
            {"role": "user", "content": "current"},
        ]
        st._boundary_request_start = 1
        st._boundary_envelope_len = 2
        result = await runner._run_chat_iterations(st)
        assert result[2] is True
        assert runner._window_observer.calls == 1
        assert runner._window_observer.density_calls == 1
        # Clamp 500K and calibrated density 2500 at capture yield this frozen
        # ladder. A second observer read would splice 2000 into the generation.
        assert st._trajectory.context_recoveries[0]["target_chars"] == 451_500

    async def test_chat_physical_retries_keep_captured_identity(self):
        from src.llm.errors import LLMTransportError
        from src.llm.recovery import RecoveryPolicy
        from tests.test_typing_resilience import FakeChannel, _make_runner, _stub_state

        calls: list[tuple[object, str | None, str | None]] = []
        configs = [SimpleNamespace(llm_provider=SimpleNamespace(active_provider="codex"))]

        class Client:
            model = "gpt-5.6-sol"
            reasoning_effort = "xhigh"

            async def chat_with_tools(self, *, model=None, reasoning_effort=None, **_kwargs):
                calls.append((self, model, reasoning_effort))
                if len(calls) == 1:
                    self.model = "gpt-5.5"
                    self.reasoning_effort = "max"
                    configs[0] = SimpleNamespace(
                        llm_provider=SimpleNamespace(active_provider="kimi")
                    )
                    raise LLMTransportError("retry")
                return SimpleNamespace(text="ok", tool_calls=[])

        client = Client()
        gateway = LLMGateway(
            get_config=lambda: configs[0],
            codex_client=client,
            ollama_client=None,
            kimi_client=None,
            subsystem_guard=None,
            auxiliary_llm_client=None,
            cost_tracker=None,
            sessions=SimpleNamespace(),
            reflector=SimpleNamespace(),
            recovery_policy_source=lambda: RecoveryPolicy(
                deadline_seconds=1,
                backoff_base=0,
                backoff_cap=0,
            ),
        )
        serving = gateway.capture_serving_identity()
        breaker = gateway.capacity_breaker_for(serving.model, provider=serving.provider)
        runner, _saved, _cleared = _make_runner()
        runner._llm_gateway = gateway
        st = _stub_state(channel=FakeChannel())
        kind, response = await runner._call_llm(st, serving_identity=serving)
        assert kind == "ok" and response.text == "ok"
        assert calls == [
            (client, "gpt-5.6-sol", "xhigh"),
            (client, "gpt-5.6-sol", "xhigh"),
        ]
        assert gateway.capacity_breaker_for("gpt-5.6-sol", provider="codex") is breaker
        assert gateway.capacity_breaker_for("gpt-5.5", provider="kimi") is not breaker

    async def test_gateway_call_uses_captured_provider_for_guard_and_client(self):
        guards = []

        class Guard:
            def check(self, key):
                guards.append(("check", key))
                return None

            def record_success(self, key):
                guards.append(("success", key))

            def record_failure(self, key, error):
                guards.append(("failure", key))

        class Client:
            model = "gpt-5.6-sol"
            reasoning_effort = "xhigh"

            async def chat_with_tools(self, **_kwargs):
                return SimpleNamespace(text="ok", input_tokens=0, output_tokens=0)

        client = Client()
        config = SimpleNamespace(llm_provider=SimpleNamespace(active_provider="codex"))
        gateway = LLMGateway(
            get_config=lambda: config,
            codex_client=client,
            ollama_client=None,
            kimi_client=SimpleNamespace(model="kimi-live", reasoning_effort=None),
            subsystem_guard=Guard(),
            auxiliary_llm_client=None,
            cost_tracker=None,
            sessions=SimpleNamespace(),
            reflector=SimpleNamespace(),
        )
        serving = gateway.capture_serving_identity()
        config.llm_provider.active_provider = "kimi"
        assert gateway.active_client is gateway.kimi_client
        response = await gateway.call_with_tools(
            messages=[], system="s", tools=[], serving_identity=serving
        )
        assert response.text == "ok"
        assert guards == [("check", "llm_codex"), ("success", "llm_codex")]

    async def test_chat_preflight_uses_captured_pair_before_open_breaker(self):
        from src.llm.errors import LLMRequestError
        from src.llm.recovery import RecoveryPolicy
        from tests.test_typing_resilience import FakeChannel, _make_runner, _stub_state

        calls = 0

        class Client:
            model = "gpt-5.5"
            reasoning_effort = "xhigh"

            async def chat_with_tools(self, **_kwargs):
                nonlocal calls
                calls += 1
                return SimpleNamespace(text="wrong", tool_calls=[])

        client = Client()
        gateway = LLMGateway(
            get_config=lambda: SimpleNamespace(
                llm_provider=SimpleNamespace(active_provider="codex")
            ),
            codex_client=client,
            ollama_client=None,
            kimi_client=None,
            subsystem_guard=None,
            auxiliary_llm_client=None,
            cost_tracker=None,
            sessions=SimpleNamespace(),
            reflector=SimpleNamespace(),
            recovery_policy_source=lambda: RecoveryPolicy(deadline_seconds=0.1),
        )
        serving = gateway.capture_serving_identity()
        breaker = gateway.capacity_breaker_for(serving.model, provider=serving.provider)
        while breaker.snapshot()["state"] != "open":
            breaker.record_generation_failure()
        client.reasoning_effort = "max"  # live drift after capture
        frozen = type(serving)(
            provider=serving.provider,
            client=serving.client,
            model=serving.model,
            reasoning_effort="max",
        )
        assert gateway.capacity_breaker_for(
            frozen.model, provider=frozen.provider
        ) is breaker
        runner, _saved, _cleared = _make_runner()
        runner._llm_gateway = gateway
        st = _stub_state(channel=FakeChannel())
        with pytest.raises(LLMRequestError):
            await runner._call_llm(st, serving_identity=frozen)
        assert calls == 0
        assert breaker.snapshot()["state"] == "open"

class TestSingleSnapshotAcrossLoopGeneration:
    async def test_loop_soft_and_rescue_share_one_observer_snapshot(self):
        from src.discord.llm_gateway import LLMServingIdentity
        from src.llm.context_compressor import SurfaceBoundary
        from src.llm.errors import LLMRequestError
        from tests.test_chat_loop_recovery import _Gateway, _runner

        class ChangingObserver:
            def __init__(self):
                self.calls = 0
                self.density_calls = 0

            def active_clamp(self, _model):
                self.calls += 1
                return 500_000 if self.calls == 1 else 100_000

            def density_for(self, _scope, _model):
                self.density_calls += 1
                return 2500 if self.density_calls == 1 else 2000

        class Client(SimpleNamespace):
            calls = 0

            async def chat_with_tools(self, **_kwargs):
                self.calls += 1
                if self.calls == 1:
                    raise LLMRequestError(
                        "overflow",
                        provider="codex",
                        model=self.model,
                        code="context_length_exceeded",
                    )
                return SimpleNamespace(
                    text="ok",
                    tool_calls=[],
                    provenance_provider="codex",
                    provenance_model=self.model,
                )

        client = Client(model="gpt-5.6-sol", reasoning_effort="xhigh")
        gw = _Gateway(None)
        gw.client = client
        gw.codex_client = client
        runner = _runner(gw)
        observer = ChangingObserver()
        runner._window_observer = observer
        config = SimpleNamespace(openai_codex=OpenAICodexConfig())
        serving = LLMServingIdentity("codex", client, client.model, client.reasoning_effort)
        # Capture with the loop's workload identity: calibration is scoped to
        # the lineage that produced it, so a capture without one honestly
        # resolves to the fixed prior instead of borrowing another workload's.
        snapshot = runner._capture_budget_snapshot(
            serving, config, SimpleNamespace(_loop_id="L", _req_id=None)
        )
        st = SimpleNamespace(
            messages=[
                {"role": "user", "content": "prior" * 100_000},
                {"role": "assistant", "content": "ok"},
                {"role": "user", "content": "goal"},
            ],
            system_prompt="sys",
            tools=[],
            _boundary=SurfaceBoundary(request_start=2, envelope_len=1),
            _char_latch=None,
            context_recoveries=[],
            _iteration_index=0,
            _trajectory=None,
            _loop_details=[],
            _trace=None,
            _loop_id="L",
            channel_id_str="c",
            prompt="p",
            user_id="u",
        )
        runner._maybe_compress_loop(st, serving, config, budget_snapshot=snapshot)
        kind, _ = await runner._call_loop_llm(
            st,
            serving_identity=serving,
            request_config=config,
            budget_snapshot=snapshot,
        )
        assert kind == "ok"
        assert observer.calls == 1
        assert observer.density_calls == 1
        assert st.context_recoveries[0]["target_chars"] == 451_500

class TestIntegrationAgentGenerationSeams:
    async def test_agent_soft_compaction_and_request_share_one_generation_snapshot(
        self, monkeypatch
    ):
        from src.agents.manager import AgentManager
        from src.llm.context_budget import resolve_context_budget

        snapshots = [
            resolve_context_budget("gpt-5.6-sol"),
            resolve_context_budget("gpt-5.5", observed_clamp=200_000),
        ]
        reads = 0

        def plan_provider():
            nonlocal reads
            snap = snapshots[min(reads, 1)]
            reads += 1
            return {
                "provider": "codex",
                "client": object(),
                "model": snap.canonical_model,
                "effort": "xhigh",
                "snapshot": snap,
            }

        seen_targets = []

        def fake_soft(messages, **kwargs):
            seen_targets.append(kwargs["max_context_chars"])
            return messages, 1

        monkeypatch.setattr(
            "src.llm.context_compressor.compress_tool_context", fake_soft
        )
        calls = []

        async def iteration(messages, system_prompt, tools, *, generation_state):
            calls.append(generation_state["plan"])
            if len(calls) == 1:
                return {
                    "text": "",
                    "tool_calls": [{"id": "1", "name": "noop", "arguments": {}}],
                }
            return {"text": "done", "tool_calls": []}

        async def tool_executor(*_args, **_kwargs):
            return "tool completed"

        manager = AgentManager()
        agent_id = manager.spawn(
            label="single-snapshot",
            # Input context, unlike tool output, is not reduced by the delivery
            # cap. Keep the real delivery guard while crossing the second
            # generation's soft-compaction threshold.
            goal="g" * 500_000,
            channel_id="c",
            requester_id="u",
            requester_name="user",
            iteration_callback=iteration,
            tool_executor_callback=tool_executor,
            tools=[],
            max_iterations=2,
            context_compression_enabled=True,
            generation_plan_provider=plan_provider,
        )
        task = manager._agents[agent_id]._task
        assert task is not None
        await task

        assert reads == 2
        assert calls[0]["snapshot"] is snapshots[0]
        assert calls[1]["snapshot"] is snapshots[1]
        assert seen_targets == [snapshots[1].primary_chars]
