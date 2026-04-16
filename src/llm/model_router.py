"""Smart model routing — classify message intent to choose cheap vs strong LLM.

Heuristic-first classification with optional cheap-LLM fallback for ambiguous
messages.  Routes simple chat/greetings to the cheap model and complex tasks
to the strong model.  Fail-open: when unsure, default to the strong model
(quality over cost).
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING

from ..odin_log import get_logger

if TYPE_CHECKING:
    from .auxiliary import AuxiliaryLLMClient

log = get_logger("model_router")


# -----------------------------------------------------------------------
# Intent taxonomy
# -----------------------------------------------------------------------

class MessageIntent(str, Enum):
    """Classified intent of an incoming message."""
    CHAT = "chat"
    QUERY = "query"
    TASK = "task"
    COMPLEX = "complex"


# Intents that should use the strong model
STRONG_MODEL_INTENTS: frozenset[str] = frozenset({"task", "complex"})

# Intents routable to the cheap model
CHEAP_MODEL_INTENTS: frozenset[str] = frozenset({"chat", "query"})


# -----------------------------------------------------------------------
# Routing decision
# -----------------------------------------------------------------------

@dataclass(slots=True)
class RoutingDecision:
    """Result of intent classification + model routing."""
    intent: MessageIntent
    use_strong: bool
    confidence: float
    reason: str
    classified_by: str = "heuristic"  # "heuristic" or "llm"
    latency_ms: float = 0.0


# -----------------------------------------------------------------------
# Routing stats (observability)
# -----------------------------------------------------------------------

@dataclass
class RoutingStats:
    """Counters for routing decisions — exposed via REST API."""
    total_routed: int = 0
    routed_strong: int = 0
    routed_cheap: int = 0
    heuristic_decisions: int = 0
    llm_decisions: int = 0
    llm_fallback_errors: int = 0
    intent_counts: dict[str, int] = field(default_factory=lambda: {
        "chat": 0, "query": 0, "task": 0, "complex": 0,
    })

    def record(self, decision: RoutingDecision) -> None:
        self.total_routed += 1
        if decision.use_strong:
            self.routed_strong += 1
        else:
            self.routed_cheap += 1
        if decision.classified_by == "heuristic":
            self.heuristic_decisions += 1
        else:
            self.llm_decisions += 1
        self.intent_counts[decision.intent.value] = (
            self.intent_counts.get(decision.intent.value, 0) + 1
        )

    def as_dict(self) -> dict:
        return {
            "total_routed": self.total_routed,
            "routed_strong": self.routed_strong,
            "routed_cheap": self.routed_cheap,
            "heuristic_decisions": self.heuristic_decisions,
            "llm_decisions": self.llm_decisions,
            "llm_fallback_errors": self.llm_fallback_errors,
            "intent_counts": dict(self.intent_counts),
        }


# -----------------------------------------------------------------------
# Heuristic patterns
# -----------------------------------------------------------------------

# Chat/greeting patterns — short, social, no technical content
_CHAT_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"^(?:hi|hey|hello|yo|sup|howdy|greetings|good\s+(?:morning|afternoon|evening|night)|gm|gn)\b", re.I),
    re.compile(r"^(?:thanks|thank\s+you|thx|ty|cheers|awesome|nice|cool|great|lol|haha|lmao)\b", re.I),
    re.compile(r"^(?:bye|goodbye|later|see\s+ya|cya|peace|good\s*bye)\b", re.I),
    re.compile(r"^(?:who\s+are\s+you|what\s+are\s+you|what(?:'s| is)\s+your\s+name|how\s+are\s+you)\b", re.I),
    re.compile(r"^(?:tell\s+me\s+(?:a\s+)?(?:joke|story|riddle)|make\s+me\s+laugh)\b", re.I),
)

# Query patterns — information lookup, status checks
_QUERY_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"^(?:what|when|where|who|which|how\s+(?:many|much|long|often))\b.*\?$", re.I | re.S),
    re.compile(r"^(?:is|are|was|were|does|do|did|can|could|will|would|should|has|have)\b.*\?$", re.I | re.S),
    re.compile(r"\b(?:status|uptime|version|info)\b", re.I),
    re.compile(r"^(?:show|list|display|print|get)\s+(?:me\s+)?(?:the\s+)?(?:status|logs?|info|version|help)\b", re.I),
)

# Task patterns — commands, file operations, deployments, tool-requiring work
_TASK_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?:^|(?:and|then|please|can you|could you|go)\s+)(?:run|execute|deploy|restart|stop|start|install|update|upgrade|patch|build|compile)\b", re.I),
    re.compile(r"\b(?:create|write|edit|modify|delete|remove|move|copy|rename|chmod|chown)\s+(?:a\s+)?(?:file|dir|folder|script|config)", re.I),
    re.compile(r"\b(?:ssh|scp|rsync|curl|wget|docker|git|pip|npm|apt|yum|systemctl|journalctl)\b", re.I),
    re.compile(r"\b(?:fix|debug|troubleshoot|investigate|diagnose|resolve)\b", re.I),
    re.compile(r"\b(?:check|scan|test|verify|validate)\s+(?:the\s+)?(?:server|service|host|container|pod|port|disk|cpu|memory|network)", re.I),
    re.compile(r"\b(?:set\s+up|configure|provision|bootstrap|initialize)\b", re.I),
    re.compile(r"```", re.I),  # Code blocks suggest technical work
)

# Complex patterns — multi-step reasoning, analysis, planning
_COMPLEX_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\b(?:analyze|compare|evaluate|review|audit|assess|plan|design|architect|refactor)\b", re.I),
    re.compile(r"\b(?:why\s+(?:is|are|does|did|was|were))\b.*(?:failing|broken|slow|down|error|crash)", re.I),
    re.compile(r"\b(?:step.by.step|walk\s+me\s+through|explain\s+how|break\s+(?:it\s+)?down)\b", re.I),
    re.compile(r"\b(?:migrate|migration|upgrade\s+from|convert|rewrite|port(?:ing)?)\b", re.I),
    re.compile(r"\b(?:implement|build\s+(?:a|an|the)|develop|create\s+(?:a|an)\s+(?:\w+\s+)?(?:system|service|api|pipeline|workflow))\b", re.I),
    re.compile(r"\b(?:across\s+(?:all|every|multiple)|each\s+(?:server|host|node|container))\b", re.I),
)


# Maximum message length (chars) to consider for cheap-model routing
_CHEAP_MAX_LENGTH = 200

# Minimum confidence to accept heuristic classification without LLM
HEURISTIC_CONFIDENCE_THRESHOLD = 0.6

# -----------------------------------------------------------------------
# Classification prompts for LLM fallback
# -----------------------------------------------------------------------

_CLASSIFY_SYSTEM = (
    "You are a message intent classifier. Classify the user message into "
    "exactly one category: CHAT (greetings, social, jokes), QUERY (information "
    "questions, status checks), TASK (commands, file ops, deployments, tool use), "
    "or COMPLEX (multi-step analysis, debugging, architecture). "
    "Respond with ONLY the category name, nothing else."
)

_INTENT_MAP: dict[str, MessageIntent] = {
    "CHAT": MessageIntent.CHAT,
    "QUERY": MessageIntent.QUERY,
    "TASK": MessageIntent.TASK,
    "COMPLEX": MessageIntent.COMPLEX,
}


# -----------------------------------------------------------------------
# Core classifier
# -----------------------------------------------------------------------

def classify_heuristic(text: str) -> RoutingDecision:
    """Classify message intent using pattern matching.

    Returns a RoutingDecision with confidence reflecting match quality.
    High confidence (>=0.8) for strong pattern matches; lower confidence
    for ambiguous messages.
    """
    stripped = text.strip()
    if not stripped:
        return RoutingDecision(
            intent=MessageIntent.CHAT,
            use_strong=False,
            confidence=1.0,
            reason="empty message",
        )

    scores: dict[MessageIntent, float] = {
        MessageIntent.CHAT: 0.0,
        MessageIntent.QUERY: 0.0,
        MessageIntent.TASK: 0.0,
        MessageIntent.COMPLEX: 0.0,
    }

    for pat in _COMPLEX_PATTERNS:
        if pat.search(stripped):
            scores[MessageIntent.COMPLEX] += 1.0

    for pat in _TASK_PATTERNS:
        if pat.search(stripped):
            scores[MessageIntent.TASK] += 1.0

    for pat in _QUERY_PATTERNS:
        if pat.search(stripped):
            scores[MessageIntent.QUERY] += 1.0

    for pat in _CHAT_PATTERNS:
        if pat.search(stripped):
            scores[MessageIntent.CHAT] += 1.0

    has_pattern_match = any(v > 0 for v in scores.values())

    length = len(stripped)
    if length <= 20:
        scores[MessageIntent.CHAT] += 0.3 if has_pattern_match else 0.5
    elif length > 300:
        scores[MessageIntent.COMPLEX] += 0.3
    elif length > 150:
        scores[MessageIntent.TASK] += 0.2

    if stripped.endswith("?") and scores[MessageIntent.TASK] == 0:
        scores[MessageIntent.QUERY] += 0.5

    # When task/complex patterns fire alongside chat, suppress chat — the
    # message requires tool use regardless of the greeting.
    if scores[MessageIntent.CHAT] > 0 and (
        scores[MessageIntent.TASK] > 0 or scores[MessageIntent.COMPLEX] > 0
    ):
        scores[MessageIntent.CHAT] *= 0.3

    total = sum(scores.values())
    if total == 0:
        return RoutingDecision(
            intent=MessageIntent.TASK,
            use_strong=True,
            confidence=0.3,
            reason="no patterns matched, defaulting to strong",
        )

    # Tiebreak priority: complex > task > query > chat (prefer conservative)
    _PRIORITY = {
        MessageIntent.COMPLEX: 4,
        MessageIntent.TASK: 3,
        MessageIntent.QUERY: 2,
        MessageIntent.CHAT: 1,
    }
    best_intent = max(scores, key=lambda k: (scores[k], _PRIORITY[k]))
    best_score = scores[best_intent]
    confidence = min(best_score / max(total, 1.0), 1.0)

    runner_up = sorted(scores.values(), reverse=True)
    if len(runner_up) >= 2 and runner_up[0] > 0 and runner_up[1] > 0:
        gap = runner_up[0] - runner_up[1]
        if gap < 0.5:
            confidence *= 0.7

    use_strong = best_intent.value in STRONG_MODEL_INTENTS
    if length > _CHEAP_MAX_LENGTH and not use_strong:
        use_strong = True
        best_intent = MessageIntent.TASK
        confidence = max(confidence * 0.8, 0.4)

    return RoutingDecision(
        intent=best_intent,
        use_strong=use_strong,
        confidence=round(confidence, 3),
        reason=_build_reason(best_intent, scores),
        classified_by="heuristic",
    )


def _build_reason(intent: MessageIntent, scores: dict[MessageIntent, float]) -> str:
    """Build a human-readable reason string."""
    parts = [f"{k.value}={v:.1f}" for k, v in sorted(scores.items(), key=lambda x: -x[1]) if v > 0]
    if not parts:
        return f"{intent.value}: no pattern matches"
    return f"{intent.value}: {', '.join(parts)}"


# -----------------------------------------------------------------------
# LLM-assisted classification (for ambiguous messages)
# -----------------------------------------------------------------------

async def classify_with_llm(
    text: str,
    aux_client: AuxiliaryLLMClient,
) -> RoutingDecision:
    """Use the cheap LLM model to classify message intent.

    Falls back to TASK (strong model) on any error — fail-open to quality.
    """
    t0 = time.monotonic()
    messages = [{"role": "user", "content": text[:500]}]
    try:
        result = await aux_client.chat(
            messages, _CLASSIFY_SYSTEM, task="classification", max_tokens=10,
        )
        elapsed = (time.monotonic() - t0) * 1000

        label = result.strip().upper()
        intent = _INTENT_MAP.get(label)
        if intent is None:
            for key, val in _INTENT_MAP.items():
                if key in label:
                    intent = val
                    break

        if intent is None:
            return RoutingDecision(
                intent=MessageIntent.TASK,
                use_strong=True,
                confidence=0.5,
                reason=f"llm returned unrecognised label: {label!r}",
                classified_by="llm",
                latency_ms=elapsed,
            )

        use_strong = intent.value in STRONG_MODEL_INTENTS
        return RoutingDecision(
            intent=intent,
            use_strong=use_strong,
            confidence=0.8,
            reason=f"llm classified as {intent.value}",
            classified_by="llm",
            latency_ms=elapsed,
        )

    except Exception as exc:
        elapsed = (time.monotonic() - t0) * 1000
        log.warning("LLM classification failed: %s — defaulting to strong model", exc)
        return RoutingDecision(
            intent=MessageIntent.TASK,
            use_strong=True,
            confidence=0.4,
            reason=f"llm error: {type(exc).__name__}",
            classified_by="llm",
            latency_ms=elapsed,
        )


# -----------------------------------------------------------------------
# Router
# -----------------------------------------------------------------------

class ModelRouter:
    """Routes messages to cheap or strong LLM based on classified intent.

    Uses heuristic classification first.  When confidence is below the
    threshold and an ``AuxiliaryLLMClient`` is available, falls back to
    cheap-LLM classification.  If both are uncertain, defaults to the
    strong model (fail-open to quality).
    """

    __slots__ = (
        "enabled",
        "confidence_threshold",
        "strong_intents",
        "max_cheap_length",
        "aux_client",
        "stats",
    )

    def __init__(
        self,
        *,
        enabled: bool = True,
        confidence_threshold: float = HEURISTIC_CONFIDENCE_THRESHOLD,
        strong_intents: frozenset[str] | None = None,
        max_cheap_length: int = _CHEAP_MAX_LENGTH,
        aux_client: AuxiliaryLLMClient | None = None,
        stats: RoutingStats | None = None,
    ) -> None:
        self.enabled = enabled
        self.confidence_threshold = confidence_threshold
        self.strong_intents = strong_intents if strong_intents is not None else STRONG_MODEL_INTENTS
        self.max_cheap_length = max_cheap_length
        self.aux_client = aux_client
        self.stats = stats if stats is not None else RoutingStats()

    async def route(self, message: str) -> RoutingDecision:
        """Classify intent and decide model tier.

        When routing is disabled, always returns strong-model decision.
        """
        if not self.enabled:
            decision = RoutingDecision(
                intent=MessageIntent.TASK,
                use_strong=True,
                confidence=1.0,
                reason="routing disabled",
            )
            self.stats.record(decision)
            return decision

        decision = classify_heuristic(message)

        if (
            decision.confidence < self.confidence_threshold
            and self.aux_client is not None
        ):
            llm_decision = await classify_with_llm(message, self.aux_client)
            if llm_decision.confidence > decision.confidence:
                decision = llm_decision
            else:
                decision.use_strong = True
                decision.reason += " (llm did not improve confidence)"

        if decision.intent.value in self.strong_intents:
            decision.use_strong = True

        self.stats.record(decision)
        return decision

    def get_metrics(self) -> dict:
        """Return routing metrics for observability."""
        return {
            "enabled": self.enabled,
            "confidence_threshold": self.confidence_threshold,
            "strong_intents": sorted(self.strong_intents),
            "max_cheap_length": self.max_cheap_length,
            "has_llm_fallback": self.aux_client is not None,
            **self.stats.as_dict(),
        }
