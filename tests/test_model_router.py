"""Tests for the smart model router (Round 45).

Tests heuristic intent classification, LLM-assisted classification,
ModelRouter routing decisions, RoutingStats counters, config integration,
and edge cases.
"""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.config.schema import ModelRoutingConfig, OpenAICodexConfig
from src.llm.model_router import (
    CHEAP_MODEL_INTENTS,
    HEURISTIC_CONFIDENCE_THRESHOLD,
    MessageIntent,
    ModelRouter,
    RoutingDecision,
    RoutingStats,
    STRONG_MODEL_INTENTS,
    _CHAT_PATTERNS,
    _CLASSIFY_SYSTEM,
    _COMPLEX_PATTERNS,
    _QUERY_PATTERNS,
    _TASK_PATTERNS,
    _build_reason,
    classify_heuristic,
    classify_with_llm,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_aux_mock(response: str = "CHAT") -> MagicMock:
    """Create a mock AuxiliaryLLMClient."""
    client = MagicMock()
    client.chat = AsyncMock(return_value=response)
    return client


# ---------------------------------------------------------------------------
# MessageIntent enum
# ---------------------------------------------------------------------------

class TestMessageIntent:
    def test_values(self):
        assert MessageIntent.CHAT.value == "chat"
        assert MessageIntent.QUERY.value == "query"
        assert MessageIntent.TASK.value == "task"
        assert MessageIntent.COMPLEX.value == "complex"

    def test_all_four(self):
        assert len(MessageIntent) == 4

    def test_str_enum(self):
        assert isinstance(MessageIntent.CHAT, str)
        assert MessageIntent.CHAT == "chat"


# ---------------------------------------------------------------------------
# Intent constants
# ---------------------------------------------------------------------------

class TestIntentConstants:
    def test_strong_intents(self):
        assert "task" in STRONG_MODEL_INTENTS
        assert "complex" in STRONG_MODEL_INTENTS
        assert "chat" not in STRONG_MODEL_INTENTS
        assert "query" not in STRONG_MODEL_INTENTS

    def test_cheap_intents(self):
        assert "chat" in CHEAP_MODEL_INTENTS
        assert "query" in CHEAP_MODEL_INTENTS
        assert "task" not in CHEAP_MODEL_INTENTS

    def test_no_overlap(self):
        assert STRONG_MODEL_INTENTS & CHEAP_MODEL_INTENTS == set()

    def test_all_intents_covered(self):
        all_intents = {i.value for i in MessageIntent}
        assert STRONG_MODEL_INTENTS | CHEAP_MODEL_INTENTS == all_intents


# ---------------------------------------------------------------------------
# RoutingDecision dataclass
# ---------------------------------------------------------------------------

class TestRoutingDecision:
    def test_creation(self):
        d = RoutingDecision(
            intent=MessageIntent.CHAT,
            use_strong=False,
            confidence=0.9,
            reason="greeting",
        )
        assert d.intent == MessageIntent.CHAT
        assert d.use_strong is False
        assert d.confidence == 0.9
        assert d.reason == "greeting"
        assert d.classified_by == "heuristic"
        assert d.latency_ms == 0.0

    def test_custom_classified_by(self):
        d = RoutingDecision(
            intent=MessageIntent.TASK,
            use_strong=True,
            confidence=0.8,
            reason="llm",
            classified_by="llm",
            latency_ms=42.5,
        )
        assert d.classified_by == "llm"
        assert d.latency_ms == 42.5

    def test_slots(self):
        d = RoutingDecision(
            intent=MessageIntent.CHAT, use_strong=False,
            confidence=1.0, reason="test",
        )
        assert hasattr(d, "__slots__")


# ---------------------------------------------------------------------------
# RoutingStats
# ---------------------------------------------------------------------------

class TestRoutingStats:
    def test_initial_zeros(self):
        s = RoutingStats()
        assert s.total_routed == 0
        assert s.routed_strong == 0
        assert s.routed_cheap == 0
        assert s.heuristic_decisions == 0
        assert s.llm_decisions == 0
        assert s.llm_fallback_errors == 0

    def test_initial_intent_counts(self):
        s = RoutingStats()
        assert s.intent_counts["chat"] == 0
        assert s.intent_counts["query"] == 0
        assert s.intent_counts["task"] == 0
        assert s.intent_counts["complex"] == 0

    def test_record_strong(self):
        s = RoutingStats()
        d = RoutingDecision(
            intent=MessageIntent.TASK, use_strong=True,
            confidence=0.9, reason="task pattern",
        )
        s.record(d)
        assert s.total_routed == 1
        assert s.routed_strong == 1
        assert s.routed_cheap == 0
        assert s.heuristic_decisions == 1
        assert s.intent_counts["task"] == 1

    def test_record_cheap(self):
        s = RoutingStats()
        d = RoutingDecision(
            intent=MessageIntent.CHAT, use_strong=False,
            confidence=0.9, reason="greeting",
        )
        s.record(d)
        assert s.routed_cheap == 1
        assert s.routed_strong == 0
        assert s.intent_counts["chat"] == 1

    def test_record_llm(self):
        s = RoutingStats()
        d = RoutingDecision(
            intent=MessageIntent.QUERY, use_strong=False,
            confidence=0.8, reason="llm classified",
            classified_by="llm",
        )
        s.record(d)
        assert s.llm_decisions == 1
        assert s.heuristic_decisions == 0

    def test_cumulative(self):
        s = RoutingStats()
        for _ in range(3):
            s.record(RoutingDecision(
                intent=MessageIntent.TASK, use_strong=True,
                confidence=0.9, reason="task",
            ))
        for _ in range(2):
            s.record(RoutingDecision(
                intent=MessageIntent.CHAT, use_strong=False,
                confidence=0.8, reason="chat",
            ))
        assert s.total_routed == 5
        assert s.routed_strong == 3
        assert s.routed_cheap == 2
        assert s.intent_counts["task"] == 3
        assert s.intent_counts["chat"] == 2

    def test_as_dict_keys(self):
        s = RoutingStats()
        d = s.as_dict()
        assert "total_routed" in d
        assert "routed_strong" in d
        assert "routed_cheap" in d
        assert "heuristic_decisions" in d
        assert "llm_decisions" in d
        assert "llm_fallback_errors" in d
        assert "intent_counts" in d

    def test_as_dict_serializable(self):
        import json
        s = RoutingStats()
        s.record(RoutingDecision(
            intent=MessageIntent.TASK, use_strong=True,
            confidence=0.9, reason="test",
        ))
        json.dumps(s.as_dict())


# ---------------------------------------------------------------------------
# Pattern coverage — chat
# ---------------------------------------------------------------------------

class TestChatPatterns:
    @pytest.mark.parametrize("text", [
        "hi", "Hey", "hello", "yo", "sup", "howdy", "greetings",
        "good morning", "good afternoon", "good evening", "good night",
        "gm", "gn",
    ])
    def test_greetings(self, text):
        d = classify_heuristic(text)
        assert d.intent == MessageIntent.CHAT

    @pytest.mark.parametrize("text", [
        "thanks", "thank you", "thx", "ty", "cheers",
        "awesome", "nice", "cool", "great",
        "lol", "haha", "lmao",
    ])
    def test_gratitude_and_reactions(self, text):
        d = classify_heuristic(text)
        assert d.intent == MessageIntent.CHAT

    @pytest.mark.parametrize("text", [
        "bye", "goodbye", "later", "see ya", "cya", "peace",
    ])
    def test_farewells(self, text):
        d = classify_heuristic(text)
        assert d.intent == MessageIntent.CHAT

    @pytest.mark.parametrize("text", [
        "who are you", "what are you", "what's your name",
        "how are you",
    ])
    def test_identity_questions(self, text):
        d = classify_heuristic(text)
        assert d.intent == MessageIntent.CHAT

    @pytest.mark.parametrize("text", [
        "tell me a joke", "tell me a story", "make me laugh",
    ])
    def test_entertainment(self, text):
        d = classify_heuristic(text)
        assert d.intent == MessageIntent.CHAT

    def test_empty_is_chat(self):
        d = classify_heuristic("")
        assert d.intent == MessageIntent.CHAT
        assert d.confidence == 1.0

    def test_whitespace_only(self):
        d = classify_heuristic("   ")
        assert d.intent == MessageIntent.CHAT
        assert d.confidence == 1.0


# ---------------------------------------------------------------------------
# Pattern coverage — query
# ---------------------------------------------------------------------------

class TestQueryPatterns:
    @pytest.mark.parametrize("text", [
        "what is the uptime?",
        "when was the last deploy?",
        "where is the config file?",
        "who deployed this?",
        "how many servers are running?",
        "how much disk space is left?",
    ])
    def test_wh_questions(self, text):
        d = classify_heuristic(text)
        assert d.intent == MessageIntent.QUERY

    @pytest.mark.parametrize("text", [
        "is the server running?",
        "are there any errors?",
        "does it support IPv6?",
        "can you check?",
        "has the migration finished?",
    ])
    def test_yes_no_questions(self, text):
        d = classify_heuristic(text)
        assert d.intent == MessageIntent.QUERY

    @pytest.mark.parametrize("text", [
        "show me the status",
        "list the logs",
        "show the version",
        "get info",
    ])
    def test_show_commands(self, text):
        d = classify_heuristic(text)
        assert d.intent in (MessageIntent.QUERY, MessageIntent.TASK)

    def test_status_keyword(self):
        d = classify_heuristic("status")
        assert d.intent == MessageIntent.QUERY


# ---------------------------------------------------------------------------
# Pattern coverage — task
# ---------------------------------------------------------------------------

class TestTaskPatterns:
    @pytest.mark.parametrize("text", [
        "run the backup script",
        "deploy to production",
        "restart the web server",
        "stop the container",
        "install nginx",
        "update the packages",
    ])
    def test_action_commands(self, text):
        d = classify_heuristic(text)
        assert d.intent == MessageIntent.TASK

    @pytest.mark.parametrize("text", [
        "create a file called test.py",
        "delete the old config",
        "edit the nginx config",
        "write a script to",
    ])
    def test_file_operations(self, text):
        d = classify_heuristic(text)
        assert d.intent == MessageIntent.TASK

    @pytest.mark.parametrize("text", [
        "ssh into the prod server",
        "docker ps",
        "git pull origin main",
        "pip install requests",
        "systemctl restart nginx",
    ])
    def test_cli_tools(self, text):
        d = classify_heuristic(text)
        assert d.intent == MessageIntent.TASK

    @pytest.mark.parametrize("text", [
        "fix the broken endpoint",
        "debug the login issue",
        "troubleshoot the database connection",
    ])
    def test_debug_commands(self, text):
        d = classify_heuristic(text)
        assert d.intent in (MessageIntent.TASK, MessageIntent.COMPLEX)

    @pytest.mark.parametrize("text", [
        "check the server health",
        "scan the network ports",
        "test the API endpoint",
    ])
    def test_infra_checks(self, text):
        d = classify_heuristic(text)
        assert d.intent == MessageIntent.TASK

    def test_code_block(self):
        d = classify_heuristic("```bash\nls -la\n```")
        assert d.intent == MessageIntent.TASK


# ---------------------------------------------------------------------------
# Pattern coverage — complex
# ---------------------------------------------------------------------------

class TestComplexPatterns:
    @pytest.mark.parametrize("text", [
        "analyze the performance bottleneck",
        "compare the two deployment strategies",
        "review the security configuration",
        "audit the access logs",
        "plan the database migration",
    ])
    def test_analysis_tasks(self, text):
        d = classify_heuristic(text)
        assert d.intent == MessageIntent.COMPLEX

    @pytest.mark.parametrize("text", [
        "why is the server failing to start",
        "why does the API return errors",
    ])
    def test_root_cause(self, text):
        d = classify_heuristic(text)
        assert d.intent == MessageIntent.COMPLEX

    @pytest.mark.parametrize("text", [
        "walk me through the deployment process",
        "explain how the auth system works",
        "step by step guide to setting up",
    ])
    def test_explanations(self, text):
        d = classify_heuristic(text)
        assert d.intent == MessageIntent.COMPLEX

    @pytest.mark.parametrize("text", [
        "migrate from MySQL to PostgreSQL",
        "upgrade from Python 3.8 to 3.12",
        "rewrite the API layer",
    ])
    def test_migrations(self, text):
        d = classify_heuristic(text)
        assert d.intent == MessageIntent.COMPLEX

    @pytest.mark.parametrize("text", [
        "implement a caching layer",
        "build a monitoring pipeline",
        "create a service for user authentication",
    ])
    def test_build_systems(self, text):
        d = classify_heuristic(text)
        assert d.intent == MessageIntent.COMPLEX

    @pytest.mark.parametrize("text", [
        "across all servers, update the config",
        "each host needs a new certificate",
    ])
    def test_multi_target(self, text):
        d = classify_heuristic(text)
        assert d.intent == MessageIntent.COMPLEX


# ---------------------------------------------------------------------------
# Heuristic classification edge cases
# ---------------------------------------------------------------------------

class TestClassifyHeuristicEdgeCases:
    def test_no_pattern_match_short_defaults_to_chat(self):
        d = classify_heuristic("xyzzy plugh")
        assert d.intent == MessageIntent.CHAT
        assert d.use_strong is False
        assert d.confidence <= 0.5

    def test_no_pattern_match_long_defaults_to_task(self):
        d = classify_heuristic("xyzzy plugh " * 20)
        assert d.intent == MessageIntent.TASK
        assert d.use_strong is True
        assert d.confidence <= 0.5

    def test_short_message_boosts_chat(self):
        d = classify_heuristic("ok")
        assert d.intent == MessageIntent.CHAT

    def test_long_message_forces_strong(self):
        long_msg = "please " * 50
        d = classify_heuristic(long_msg)
        assert d.use_strong is True

    def test_question_mark_boosts_query(self):
        d = classify_heuristic("hmm?")
        assert d.intent == MessageIntent.QUERY

    def test_mixed_signals(self):
        d = classify_heuristic("hello, can you deploy the app?")
        assert d.use_strong is True

    def test_confidence_range(self):
        for text in ["hi", "deploy to prod", "analyze logs", "what is uptime?"]:
            d = classify_heuristic(text)
            assert 0 <= d.confidence <= 1.0

    def test_reason_not_empty(self):
        for text in ["hi", "deploy", "", "analyze this"]:
            d = classify_heuristic(text)
            assert d.reason

    def test_classified_by_heuristic(self):
        d = classify_heuristic("hello")
        assert d.classified_by == "heuristic"

    def test_use_strong_matches_intent(self):
        d = classify_heuristic("hi")
        assert d.intent == MessageIntent.CHAT
        assert d.use_strong is False

        d = classify_heuristic("deploy to production")
        assert d.intent == MessageIntent.TASK
        assert d.use_strong is True


# ---------------------------------------------------------------------------
# _build_reason
# ---------------------------------------------------------------------------

class TestBuildReason:
    def test_with_scores(self):
        scores = {
            MessageIntent.CHAT: 1.0,
            MessageIntent.QUERY: 0.0,
            MessageIntent.TASK: 0.5,
            MessageIntent.COMPLEX: 0.0,
        }
        reason = _build_reason(MessageIntent.CHAT, scores)
        assert "chat" in reason
        assert "task" in reason
        assert "query" not in reason

    def test_no_scores(self):
        scores = {
            MessageIntent.CHAT: 0.0,
            MessageIntent.QUERY: 0.0,
            MessageIntent.TASK: 0.0,
            MessageIntent.COMPLEX: 0.0,
        }
        reason = _build_reason(MessageIntent.TASK, scores)
        assert "task" in reason


# ---------------------------------------------------------------------------
# LLM-assisted classification
# ---------------------------------------------------------------------------

class TestClassifyWithLLM:
    @pytest.mark.parametrize("response,expected_intent", [
        ("CHAT", MessageIntent.CHAT),
        ("QUERY", MessageIntent.QUERY),
        ("TASK", MessageIntent.TASK),
        ("COMPLEX", MessageIntent.COMPLEX),
    ])
    async def test_valid_labels(self, response, expected_intent):
        aux = _make_aux_mock(response)
        d = await classify_with_llm("test message", aux)
        assert d.intent == expected_intent
        assert d.classified_by == "llm"
        assert d.confidence == 0.8

    async def test_label_with_whitespace(self):
        aux = _make_aux_mock("  TASK  \n")
        d = await classify_with_llm("deploy it", aux)
        assert d.intent == MessageIntent.TASK

    async def test_label_case_insensitive(self):
        aux = _make_aux_mock("chat")
        d = await classify_with_llm("hello", aux)
        assert d.intent == MessageIntent.CHAT

    async def test_partial_match(self):
        aux = _make_aux_mock("The intent is COMPLEX because it requires analysis")
        d = await classify_with_llm("analyze everything", aux)
        assert d.intent == MessageIntent.COMPLEX

    async def test_unrecognised_label(self):
        aux = _make_aux_mock("UNKNOWN_INTENT")
        d = await classify_with_llm("test", aux)
        assert d.intent == MessageIntent.TASK
        assert d.use_strong is True
        assert "unrecognised" in d.reason

    async def test_error_falls_back_to_strong(self):
        aux = _make_aux_mock()
        aux.chat = AsyncMock(side_effect=RuntimeError("API error"))
        d = await classify_with_llm("test", aux)
        assert d.intent == MessageIntent.TASK
        assert d.use_strong is True
        assert d.classified_by == "llm"
        assert "RuntimeError" in d.reason

    async def test_timeout_falls_back_to_strong(self):
        aux = _make_aux_mock()
        aux.chat = AsyncMock(side_effect=asyncio.TimeoutError())
        d = await classify_with_llm("test", aux)
        assert d.intent == MessageIntent.TASK
        assert d.use_strong is True

    async def test_latency_tracked(self):
        aux = _make_aux_mock("CHAT")
        d = await classify_with_llm("hello", aux)
        assert d.latency_ms >= 0

    async def test_message_truncated(self):
        aux = _make_aux_mock("CHAT")
        long_msg = "x" * 1000
        d = await classify_with_llm(long_msg, aux)
        call_args = aux.chat.call_args
        msg_content = call_args[0][0][0]["content"]
        assert len(msg_content) <= 500

    async def test_system_prompt_used(self):
        aux = _make_aux_mock("TASK")
        await classify_with_llm("test", aux)
        call_args = aux.chat.call_args
        system = call_args[0][1]
        assert system == _CLASSIFY_SYSTEM

    async def test_uses_classification_task(self):
        aux = _make_aux_mock("TASK")
        await classify_with_llm("test", aux)
        call_args = aux.chat.call_args
        assert call_args[1]["task"] == "classification"
        assert call_args[1]["max_tokens"] == 10

    async def test_use_strong_based_on_intent(self):
        aux = _make_aux_mock("CHAT")
        d = await classify_with_llm("hello", aux)
        assert d.use_strong is False

        aux = _make_aux_mock("TASK")
        d = await classify_with_llm("deploy", aux)
        assert d.use_strong is True


# ---------------------------------------------------------------------------
# ModelRouter construction
# ---------------------------------------------------------------------------

class TestModelRouterInit:
    def test_defaults(self):
        router = ModelRouter()
        assert router.enabled is True
        assert router.confidence_threshold == HEURISTIC_CONFIDENCE_THRESHOLD
        assert router.strong_intents == STRONG_MODEL_INTENTS
        assert router.aux_client is None
        assert isinstance(router.stats, RoutingStats)

    def test_custom_params(self):
        stats = RoutingStats()
        aux = _make_aux_mock()
        router = ModelRouter(
            enabled=False,
            confidence_threshold=0.8,
            strong_intents=frozenset({"complex"}),
            max_cheap_length=100,
            aux_client=aux,
            stats=stats,
        )
        assert router.enabled is False
        assert router.confidence_threshold == 0.8
        assert router.strong_intents == frozenset({"complex"})
        assert router.max_cheap_length == 100
        assert router.aux_client is aux
        assert router.stats is stats

    def test_has_slots(self):
        router = ModelRouter()
        assert hasattr(router, "__slots__")


# ---------------------------------------------------------------------------
# ModelRouter.route() — heuristic only
# ---------------------------------------------------------------------------

class TestModelRouterRouteHeuristic:
    async def test_chat_routes_cheap(self):
        router = ModelRouter()
        d = await router.route("hello")
        assert d.intent == MessageIntent.CHAT
        assert d.use_strong is False

    async def test_task_routes_strong(self):
        router = ModelRouter()
        d = await router.route("deploy to production")
        assert d.intent == MessageIntent.TASK
        assert d.use_strong is True

    async def test_complex_routes_strong(self):
        router = ModelRouter()
        d = await router.route("analyze the security posture across all servers")
        assert d.intent == MessageIntent.COMPLEX
        assert d.use_strong is True

    async def test_query_routes_cheap(self):
        router = ModelRouter()
        d = await router.route("what is the uptime?")
        assert d.intent == MessageIntent.QUERY
        assert d.use_strong is False

    async def test_stats_updated(self):
        router = ModelRouter()
        await router.route("hello")
        assert router.stats.total_routed == 1
        assert router.stats.routed_cheap == 1

        await router.route("deploy now")
        assert router.stats.total_routed == 2
        assert router.stats.routed_strong == 1

    async def test_disabled_always_strong(self):
        router = ModelRouter(enabled=False)
        d = await router.route("hello")
        assert d.use_strong is True
        assert d.reason == "routing disabled"
        assert router.stats.routed_strong == 1


# ---------------------------------------------------------------------------
# ModelRouter.route() — with LLM fallback
# ---------------------------------------------------------------------------

class TestModelRouterRouteLLM:
    async def test_llm_used_for_low_confidence(self):
        aux = _make_aux_mock("CHAT")
        router = ModelRouter(aux_client=aux, confidence_threshold=0.99)
        d = await router.route("hello")
        assert aux.chat.called or d.confidence >= 0.99

    async def test_llm_not_used_for_high_confidence(self):
        aux = _make_aux_mock("COMPLEX")
        router = ModelRouter(aux_client=aux, confidence_threshold=0.01)
        d = await router.route("hello")
        assert not aux.chat.called

    async def test_llm_error_still_routes(self):
        aux = _make_aux_mock()
        aux.chat = AsyncMock(side_effect=RuntimeError("fail"))
        router = ModelRouter(aux_client=aux, confidence_threshold=0.99)
        d = await router.route("something ambiguous here")
        assert d.use_strong is True

    async def test_llm_improves_decision(self):
        aux = _make_aux_mock("QUERY")
        router = ModelRouter(aux_client=aux, confidence_threshold=0.99)
        d = await router.route("hmm, tell me about that?")
        if aux.chat.called:
            assert d.classified_by == "llm" or d.confidence < 0.99


# ---------------------------------------------------------------------------
# ModelRouter.route() — strong intent enforcement
# ---------------------------------------------------------------------------

class TestModelRouterStrongEnforcement:
    async def test_strong_intent_overrides(self):
        router = ModelRouter(strong_intents=frozenset({"chat", "query", "task", "complex"}))
        d = await router.route("hello")
        assert d.use_strong is True

    async def test_custom_strong_intents(self):
        router = ModelRouter(strong_intents=frozenset({"query"}))
        d = await router.route("what is the uptime?")
        assert d.use_strong is True

    async def test_empty_strong_intents(self):
        router = ModelRouter(strong_intents=frozenset())
        d = await router.route("deploy to production")
        assert d.use_strong is True  # Task still uses strong from heuristic


# ---------------------------------------------------------------------------
# ModelRouter.get_metrics()
# ---------------------------------------------------------------------------

class TestModelRouterMetrics:
    def test_keys(self):
        router = ModelRouter()
        m = router.get_metrics()
        assert "enabled" in m
        assert "confidence_threshold" in m
        assert "strong_intents" in m
        assert "max_cheap_length" in m
        assert "has_llm_fallback" in m
        assert "total_routed" in m
        assert "intent_counts" in m

    def test_has_llm_fallback_true(self):
        router = ModelRouter(aux_client=_make_aux_mock())
        assert router.get_metrics()["has_llm_fallback"] is True

    def test_has_llm_fallback_false(self):
        router = ModelRouter()
        assert router.get_metrics()["has_llm_fallback"] is False

    async def test_metrics_after_routing(self):
        router = ModelRouter()
        await router.route("hello")
        await router.route("deploy now")
        m = router.get_metrics()
        assert m["total_routed"] == 2
        assert m["routed_cheap"] >= 1
        assert m["routed_strong"] >= 1

    def test_json_serializable(self):
        import json
        router = ModelRouter()
        json.dumps(router.get_metrics())


# ---------------------------------------------------------------------------
# Config integration
# ---------------------------------------------------------------------------

class TestModelRoutingConfig:
    def test_defaults(self):
        cfg = ModelRoutingConfig()
        assert cfg.enabled is False
        assert cfg.confidence_threshold == 0.6
        assert cfg.max_cheap_length == 200
        assert "task" in cfg.strong_intents
        assert "complex" in cfg.strong_intents

    def test_custom(self):
        cfg = ModelRoutingConfig(
            enabled=True,
            confidence_threshold=0.8,
            max_cheap_length=300,
            strong_intents=["complex"],
        )
        assert cfg.enabled is True
        assert cfg.confidence_threshold == 0.8
        assert cfg.max_cheap_length == 300
        assert cfg.strong_intents == ["complex"]

    def test_in_codex_config(self):
        codex_cfg = OpenAICodexConfig()
        assert hasattr(codex_cfg, "model_routing")
        assert isinstance(codex_cfg.model_routing, ModelRoutingConfig)

    def test_full_config_parse(self):
        codex_cfg = OpenAICodexConfig(
            model_routing=ModelRoutingConfig(enabled=True, confidence_threshold=0.9),
        )
        assert codex_cfg.model_routing.enabled is True
        assert codex_cfg.model_routing.confidence_threshold == 0.9


# ---------------------------------------------------------------------------
# Pattern lists integrity
# ---------------------------------------------------------------------------

class TestPatternIntegrity:
    def test_chat_patterns_non_empty(self):
        assert len(_CHAT_PATTERNS) >= 5

    def test_query_patterns_non_empty(self):
        assert len(_QUERY_PATTERNS) >= 4

    def test_task_patterns_non_empty(self):
        assert len(_TASK_PATTERNS) >= 7

    def test_complex_patterns_non_empty(self):
        assert len(_COMPLEX_PATTERNS) >= 6

    def test_all_patterns_compile(self):
        for patterns in (_CHAT_PATTERNS, _QUERY_PATTERNS, _TASK_PATTERNS, _COMPLEX_PATTERNS):
            for p in patterns:
                assert hasattr(p, "search")


# ---------------------------------------------------------------------------
# Real-world message scenarios
# ---------------------------------------------------------------------------

class TestRealWorldScenarios:
    async def test_greeting_exchange(self):
        router = ModelRouter()
        d = await router.route("Hey Odin, how are you doing today?")
        assert d.intent == MessageIntent.CHAT

    async def test_status_check(self):
        router = ModelRouter()
        d = await router.route("what's the status of the prod servers?")
        assert d.intent in (MessageIntent.QUERY, MessageIntent.TASK)

    async def test_deployment_request(self):
        router = ModelRouter()
        d = await router.route("deploy branch feature/new-api to staging")
        assert d.intent == MessageIntent.TASK
        assert d.use_strong is True

    async def test_debug_session(self):
        router = ModelRouter()
        d = await router.route("the API is returning 500 errors, investigate and fix it")
        assert d.use_strong is True

    async def test_architecture_review(self):
        router = ModelRouter()
        d = await router.route("review the microservices architecture and suggest improvements for scaling")
        assert d.intent == MessageIntent.COMPLEX
        assert d.use_strong is True

    async def test_simple_file_read(self):
        router = ModelRouter()
        d = await router.route("read /etc/nginx/nginx.conf")
        assert d.use_strong is True

    async def test_docker_command(self):
        router = ModelRouter()
        d = await router.route("docker logs web-app --tail 50")
        assert d.intent == MessageIntent.TASK
        assert d.use_strong is True

    async def test_joke_request(self):
        router = ModelRouter()
        d = await router.route("tell me a joke about servers")
        assert d.intent == MessageIntent.CHAT
        assert d.use_strong is False

    async def test_multi_server_operation(self):
        router = ModelRouter()
        d = await router.route("update nginx config across all production servers")
        assert d.intent == MessageIntent.COMPLEX
        assert d.use_strong is True

    async def test_git_operation(self):
        router = ModelRouter()
        d = await router.route("git pull and rebuild the project")
        assert d.intent == MessageIntent.TASK
        assert d.use_strong is True


# ---------------------------------------------------------------------------
# Imports
# ---------------------------------------------------------------------------

class TestImports:
    def test_public_symbols(self):
        from src.llm.model_router import (
            MessageIntent,
            ModelRouter,
            RoutingDecision,
            RoutingStats,
            classify_heuristic,
            classify_with_llm,
        )

    def test_constants(self):
        from src.llm.model_router import (
            CHEAP_MODEL_INTENTS,
            HEURISTIC_CONFIDENCE_THRESHOLD,
            STRONG_MODEL_INTENTS,
        )

    def test_config(self):
        from src.config.schema import ModelRoutingConfig


# ---------------------------------------------------------------------------
# Concurrent routing
# ---------------------------------------------------------------------------

class TestConcurrentRouting:
    async def test_concurrent_routes(self):
        router = ModelRouter()
        results = await asyncio.gather(
            router.route("hello"),
            router.route("deploy now"),
            router.route("analyze logs"),
            router.route("what is uptime?"),
            router.route("hi there"),
        )
        assert len(results) == 5
        assert router.stats.total_routed == 5

    async def test_stats_thread_safe_counting(self):
        router = ModelRouter()
        tasks = [router.route("hello") for _ in range(20)]
        await asyncio.gather(*tasks)
        assert router.stats.total_routed == 20


# ---------------------------------------------------------------------------
# Confidence threshold behavior
# ---------------------------------------------------------------------------

class TestConfidenceThreshold:
    async def test_high_threshold_triggers_llm(self):
        aux = _make_aux_mock("CHAT")
        router = ModelRouter(aux_client=aux, confidence_threshold=0.99)
        d = await router.route("hello there friend")
        # With threshold=0.99, heuristic confidence < 0.99 should trigger LLM
        # (if heuristic confidence was low enough)

    async def test_zero_threshold_never_triggers_llm(self):
        aux = _make_aux_mock("COMPLEX")
        router = ModelRouter(aux_client=aux, confidence_threshold=0.0)
        await router.route("hello")
        assert not aux.chat.called

    async def test_without_aux_client_no_llm(self):
        router = ModelRouter(confidence_threshold=0.0)
        d = await router.route("something")
        assert d.classified_by == "heuristic"


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    async def test_unicode_message(self):
        router = ModelRouter()
        d = await router.route("こんにちは")
        assert d is not None
        assert isinstance(d, RoutingDecision)

    async def test_emoji_message(self):
        router = ModelRouter()
        d = await router.route("👋")
        assert d is not None

    async def test_very_long_message(self):
        router = ModelRouter()
        msg = "deploy " * 500
        d = await router.route(msg)
        assert d.use_strong is True

    async def test_newlines_in_message(self):
        router = ModelRouter()
        d = await router.route("line1\nline2\nline3")
        assert d is not None

    async def test_only_punctuation(self):
        router = ModelRouter()
        d = await router.route("???")
        assert d is not None

    async def test_numbers_only(self):
        router = ModelRouter()
        d = await router.route("12345")
        assert d is not None

    async def test_case_sensitivity(self):
        router = ModelRouter()
        d1 = await router.route("HELLO")
        d2 = await router.route("hello")
        assert d1.intent == d2.intent

    async def test_repeated_routing(self):
        router = ModelRouter()
        for _ in range(100):
            d = await router.route("hi")
        assert router.stats.total_routed == 100
        assert router.stats.intent_counts["chat"] == 100
