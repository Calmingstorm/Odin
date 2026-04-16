from __future__ import annotations

import hashlib
import json
import re
from collections import deque

from ..llm.secret_scrubber import scrub_output_secrets

# ---------------------------------------------------------------------------
# Secret scrubbing
# ---------------------------------------------------------------------------

# Additional patterns for scrubbing LLM responses before Discord delivery.
# These extend OUTPUT_SECRET_PATTERNS (applied via scrub_output_secrets) with
# patterns more likely to appear in natural-language LLM output.
_RESPONSE_EXTRA_PATTERNS = [
    re.compile(r"xox[boaprs]-[a-zA-Z0-9-]+"),  # Slack tokens
    # Natural language: "the password is ...", "my password is hunter2"
    re.compile(r"(?i)(?:my\s+)?(?:password|passwd|pwd)\s+(?:\S+\s+){0,4}(?:is|was)\s+\S{6,}"),
]


def scrub_response_secrets(text: str) -> str:
    """Scrub potential secrets from LLM responses before sending to Discord.

    Applies the tool-output patterns (passwords, API keys, private keys,
    database URLs) plus additional patterns for secrets that LLMs might
    express in natural language.
    """
    text = scrub_output_secrets(text)
    for pattern in _RESPONSE_EXTRA_PATTERNS:
        text = pattern.sub("[REDACTED]", text)
    return text


# ---------------------------------------------------------------------------
# Fabrication detection
# ---------------------------------------------------------------------------

# Patterns that suggest fabricated tool output when no tools were actually called.
# Each is (compiled_regex, description) for testability.
_FABRICATION_PATTERNS: list[re.Pattern[str]] = [
    # Claims of running/executing/investigating commands
    re.compile(
        r"(?i)\b(?:I\s+(?:ran|executed|checked|performed|ran\s+a|"
        r"looked\s+at|reviewed|inspected|examined|verified|confirmed|"
        r"tested|scanned|monitored|queried)|"
        r"running|executing|here(?:'s| is) the (?:output|result)|"
        r"the (?:command|output|result) (?:returned|shows?|is)|"
        r"I (?:can see|found) (?:that )?(?:the |your )?)"
    ),
    # Fake command output patterns (``` followed by lines that look like terminal output)
    re.compile(
        r"```(?:bash|shell|console|text|output)?\s*\n"
        r"(?:[\$#>].*\n|(?:total |drwx|Filesystem|CONTAINER|NAME |PID |USER ))",
    ),
    # Claims of completed actions without tool calls (generated, posted, created, saved, etc.)
    re.compile(
        r"(?i)\b(?:generated|posted|created|saved|uploaded|deployed|installed|"
        r"started|stopped|deleted|removed|wrote|written|sent|fetched|downloaded)"
        r"(?:\s+(?:and\s+)?(?:posted|uploaded|saved|sent|attached|delivered))?"
        r"\b.{0,40}\b(?:image|file|script|server|container|process|document|skill)"
    ),
    # Claims referencing data sources without having checked them
    re.compile(
        r"(?i)\b(?:according to (?:the )?(?:logs?|output|results?|data|metrics|dashboard)|"
        r"based on (?:the )?(?:output|logs?|results?|metrics))\b"
    ),
]


def detect_fabrication(text: str, tools_used: list[str]) -> bool:
    """Detect if a text-only response fabricates tool results.

    Returns True if the response contains patterns suggesting the LLM claimed
    to run commands or check systems without actually calling any tools.

    Only meaningful when tools_used is empty — if tools were called, the
    response is based on real results.
    """
    if tools_used:
        return False
    if not text or len(text) < 20:
        return False
    return any(p.search(text) for p in _FABRICATION_PATTERNS)


# Developer message injected when fabrication is detected, prompting a retry.
_FABRICATION_RETRY_MSG = {
    "role": "developer",
    "content": "That was a fabrication. Call the appropriate tool to get real results.",
}


# ---------------------------------------------------------------------------
# Promise detection
# ---------------------------------------------------------------------------

_PROMISE_PATTERNS: list[re.Pattern[str]] = [
    # "I'll <verb>" — any verb after I'll/I will (not just a fixed list)
    re.compile(
        r"(?i)\bI'(?:ll|m going to)\s+\w+"
    ),
    # "I'm <gerund>" — any -ing verb after I'm
    re.compile(
        r"(?i)\bI'm\s+\w+ing\b"
    ),
    # "I will <verb>"
    re.compile(
        r"(?i)\bI will\s+\w+"
    ),
    # "I can <verb> it/that/this immediately/now/right now"
    re.compile(
        r"(?i)\bI can\s+\w+\s+(?:it|that|this|right now|now|immediately)\b"
    ),
    # Action openers without subject — gerund-initial promises
    re.compile(
        r"(?i)^(?:On it|Working on|Spawning|Spinning up|Starting|Kicking off|"
        r"Setting up|Pulling|Generating|Building|Deploying|Running|"
        r"Creating|Launching|Firing up|Booting|Preparing|Fetching)\b",
        re.MULTILINE,
    ),
    # "Plan:" or "Plan in" followed by description
    re.compile(
        r"(?i)^Plan(?::|(?:\s+in\s+))\s*.{10,}",
        re.MULTILINE,
    ),
]

# Phrases that indicate genuine chat, not a promise to act.
# If any of these appear, the promise detector should NOT fire.
_PROMISE_CHAT_EXEMPTIONS: list[re.Pattern[str]] = [
    # Opinions/thoughts — "I'm thinking", "I'm not sure", "I'm guessing"
    re.compile(r"(?i)\bI'm\s+(?:thinking|not sure|unsure|guessing|wondering|curious)"),
    # Statements about state — "I'm aware", "I'm online", "I'm Odin"
    re.compile(r"(?i)\bI'm\s+(?:aware|online|here|ready|Odin|a |the |not )"),
    # Refusals — "I can't", "I won't"
    re.compile(r"(?i)\bI\s+(?:can't|won't|cannot|will not)\b"),
    # Past tense reports — "I'll note that", "I'm reporting"
    re.compile(r"(?i)\bI'll\s+(?:note|say|add|mention|point out)\b"),
]


def detect_promise_without_action(text: str, tools_used: list[str]) -> bool:
    """Detect if a response promises action but includes no tool calls.

    Catches patterns like "I'll do X now" or "I'm executing that" when
    no tools were actually called — the LLM described doing work without
    doing it.
    """
    if tools_used:
        return False
    if not text or len(text) < 15:
        return False
    # Check exemptions first — genuine chat shouldn't trigger
    if any(p.search(text) for p in _PROMISE_CHAT_EXEMPTIONS):
        return False
    return any(p.search(text) for p in _PROMISE_PATTERNS)


_PROMISE_RETRY_MSG = {
    "role": "developer",
    "content": "Execute the action with tool calls now.",
}


# ---------------------------------------------------------------------------
# Continuation message — injected when the classifier determines the
# response is incomplete and the model should keep working.
# ---------------------------------------------------------------------------

_CONTINUATION_MSG = {
    "role": "developer",
    "content": (
        "Continue executing the remaining steps with tool calls."
    ),
}


# ---------------------------------------------------------------------------
# Tool-unavailability fabrication — catches Codex claiming tools are disabled
# without actually trying them. Only fires when no tools were called.
# ---------------------------------------------------------------------------

_TOOL_UNAVAIL_PATTERNS: list[re.Pattern[str]] = [
    re.compile(
        r"(?i)\b(?:not (?:enabled|available|configured)|"
        r"is(?:n't| not) (?:enabled|available|configured|supported)|"
        r"is disabled|cannot be used)\b"
    ),
    re.compile(
        r"(?i)\bcan(?:'t|not)\b.{0,30}\b(?:generate|create|produce|render)\b.{0,20}"
        r"\b(?:image|photo|picture|screenshot)"
    ),
    re.compile(
        r"(?i)\b(?:image|photo) generation.{0,20}\b(?:not|isn't|unavailable|disabled)\b"
    ),
    # Claims of lacking access or capability
    re.compile(
        r"(?i)\b(?:(?:don't|do not) have (?:access|the ability) to|"
        r"no (?:tool|way) (?:to |for )(?:do )?(?:that|this)|"
        r"that(?:'s| is) not something I can)\b"
    ),
]


def detect_tool_unavailable(text: str, tools_used: list[str]) -> bool:
    """Detect if a response falsely claims a tool is unavailable.

    Returns True if the response claims a tool is not enabled/available/etc.
    without actually trying to call it.  Only meaningful when tools_used is
    empty — if tools were called and returned a real error, that's legitimate.
    """
    if tools_used:
        return False
    if not text or len(text) < 15:
        return False
    return any(p.search(text) for p in _TOOL_UNAVAIL_PATTERNS)


_TOOL_UNAVAIL_RETRY_MSG = {
    "role": "developer",
    "content": "The tool is available. Try calling it.",
}


# ---------------------------------------------------------------------------
# Hedging detection — catches "shall I", "if you want", etc.
# Used for bot-to-bot interactions where hedging is never appropriate.
# ---------------------------------------------------------------------------

_HEDGING_PATTERNS: list[re.Pattern[str]] = [
    # --- Group 1: Permission-asking / deference ---
    re.compile(
        r"(?i)\b(?:if you(?:'d| would)? (?:like|want|prefer)|"
        r"shall I|should I|would you like(?: me to)?|"
        r"ready (?:when|on) you|let me know (?:if|when)|"
        r"I can (?:do|help|run|execute|set up) (?:that|this|it) (?:for you|if)|"
        r"just (?:say|tell) (?:the word|me when|me if)|"
        r"want me to)\b"
    ),
    # --- Group 2: Waiting for approval / consensus-seeking ---
    re.compile(
        r"(?i)\b(?:here(?:'s| is) (?:a |the )?plan|"
        r"I(?:'d| would) (?:suggest|recommend)|"
        r"before (?:I |we )(?:proceed|go ahead|start)|"
        r"I'll wait for (?:your|the) (?:go[- ]ahead|confirmation|approval)|"
        r"awaiting (?:your|the) (?:confirmation|input|response|approval|go[- ]ahead)|"
        r"once you (?:confirm|approve|give the go[- ]ahead)|"
        r"(?:your call|up to you|your decision))\b"
    ),
    # --- Group 3: Announcing intent without acting ---
    re.compile(
        r"(?i)^Plan:|"
        r"I (?:need|have) to .{0,30} (?:first|before)|"
        r"I'm (?:going to|about to|proceeding to)",
        re.MULTILINE,
    ),
    # --- Group 4: Offering numbered options instead of executing ---
    re.compile(
        r"(?i)(?:pick (?:one|an option)|choose (?:one|from)|"
        r"(?:option|choice) \d|"
        r"tell me (?:what you (?:want|need|prefer)|which)|"
        r"which (?:would you|do you|one))\b"
    ),
    # --- Group 5: Conditional hedges ("if that's okay", "if that works") ---
    re.compile(
        r"(?i)\b(?:if (?:that(?:'s| is) )?(?:okay|ok|alright|fine|acceptable|good)"
        r"(?: with you)?|"
        r"if that (?:sounds|works|looks) (?:good|right|fine|okay|ok)"
        r"(?: (?:to|for) you)?|"
        r"if that works for you|"
        r"if you(?:'re| are) (?:okay|ok|comfortable|fine|happy) with (?:that|this|it)|"
        r"if you (?:agree|don't mind|give (?:me )?(?:the )?(?:go[- ]ahead|green light)))\b"
    ),
    # --- Group 6: Deferring / softening with false politeness ---
    re.compile(
        r"(?i)\b(?:whenever you(?:'re| are) ready|"
        r"at your (?:convenience|discretion|leisure)|"
        r"feel free to (?:let me know|tell me|decide)|"
        r"I(?:'d| would) be happy to (?:help|do|run|handle|take care of)|"
        r"no rush|no pressure|take your time|"
        r"just let me know)\b"
    ),
    # --- Group 7: Soft suggestions instead of acting ---
    re.compile(
        r"(?i)\b(?:perhaps (?:I |we )?(?:could|should|might)|"
        r"maybe (?:I |we )?(?:could|should|might)|"
        r"it might be (?:worth|better|good|best)(?: to)?|"
        r"it (?:may|could) be (?:worth|better|good|best)(?: to)?|"
        r"you (?:might|may|could) (?:want|prefer|consider))\b"
    ),
    # --- Group 8: Consensus / confirmation-seeking questions ---
    re.compile(
        r"(?i)\b(?:does that (?:sound|look|seem) (?:right|good|okay|ok|fine|reasonable)|"
        r"(?:what|how) (?:do|would) you (?:think|prefer|suggest)|"
        r"how (?:would|should|shall) (?:I|we) (?:proceed|handle|approach)|"
        r"(?:do|would) you (?:agree|prefer|mind)|"
        r"is that (?:okay|ok|alright|fine|acceptable|what you (?:want|need|mean)))\b"
    ),
    # --- Group 9: Listing steps/approaches without execution ---
    re.compile(
        r"(?i)\b(?:(?:the |my )?(?:steps|approach|plan|strategy) (?:would|could|will) be|"
        r"here(?:'s| is) (?:what|how) I(?:'d| would)|"
        r"(?:one|another) (?:option|approach|way|alternative) (?:would be|is to)|"
        r"we could (?:either|also|try)|"
        r"there are (?:a few|several|multiple|some) (?:options|approaches|ways))\b"
    ),
    # --- Group 10: Disclaimers / excessive caution ---
    re.compile(
        r"(?i)\b(?:just to (?:be safe|confirm|clarify|double[- ]check|make sure)|"
        r"(?:could|can) you (?:confirm|clarify|verify|double[- ]check)|"
        r"I (?:want|need) to (?:confirm|clarify|verify|check|make sure)|"
        r"before (?:doing anything|making any changes|I do anything)|"
        r"I (?:don't|do not) want to .{0,30} without (?:your|checking))\b"
    ),
]


# Phrases that indicate genuine reporting or status, not hedging.
# If any of these appear, the hedging detector should NOT fire.
_HEDGING_EXEMPTIONS: list[re.Pattern[str]] = [
    # Completed actions — "I've done X", "I did X", "done."
    re.compile(r"(?i)\b(?:I(?:'ve| have) (?:done|completed|finished|executed|run)|"
               r"done\.|task complete|completed successfully)\b"),
    # Reporting results — "the result is", "output shows"
    re.compile(r"(?i)\b(?:the (?:result|output|response) (?:is|was|shows)|"
               r"here (?:is|are) the (?:results?|output))\b"),
    # Inability / refusal (handled by other detectors)
    re.compile(r"(?i)\bI (?:can't|cannot|won't|will not|am unable to)\b"),
    # Explaining why something failed (not hedging, premature_failure covers this)
    re.compile(r"(?i)\b(?:the (?:error|issue|problem) (?:is|was)|"
               r"(?:failed|error) because)\b"),
]


def detect_hedging(text: str, tools_used: list[str]) -> bool:
    """Detect if a response hedges instead of executing.

    Returns True if the response contains hedging language and no tools
    were called — meaning the LLM asked for permission instead of acting.
    """
    if tools_used:
        return False
    if not text or len(text) < 15:
        return False
    if any(p.search(text) for p in _HEDGING_EXEMPTIONS):
        return False
    return any(p.search(text) for p in _HEDGING_PATTERNS)


# Developer message injected when hedging is detected on a bot message.
_HEDGING_RETRY_MSG = {
    "role": "developer",
    "content": "This is another bot. Do not say 'shall I' or 'if you want'. Execute immediately with tool calls.",
}


# ---------------------------------------------------------------------------
# Code-block hedging — catches Codex showing a bash/shell command instead
# of executing it via run_command.  Only fires when no tools were called.
# ---------------------------------------------------------------------------

_CODE_BLOCK_HEDGING_PATTERN: re.Pattern[str] = re.compile(
    r"```(?:bash|sh|shell|zsh)\s*\n",
)


def detect_code_hedging(text: str, tools_used: list[str]) -> bool:
    """Detect if a response shows a bash code block instead of executing it.

    Returns True if the response contains a bash/sh code block but no tools
    were called — meaning the LLM showed what it should have run.
    """
    if tools_used:
        return False
    if not text or len(text) < 15:
        return False
    return bool(_CODE_BLOCK_HEDGING_PATTERN.search(text))


_CODE_HEDGING_RETRY_MSG = {
    "role": "developer",
    "content": (
        "Execute the command using run_command instead of showing it. "
        "You are an executor, not a manual."
    ),
}


# ---------------------------------------------------------------------------
# Premature failure detection — catches when Codex gives up too early
# instead of exhausting fallback chains.
# ---------------------------------------------------------------------------

_FAILURE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(
        r"(?i)(?:couldn'?t (?:get|resolve|find|fetch|retrieve|determine|complete|"
        r"access|connect)|"
        r"(?:failed|unable) to (?:get|resolve|find|fetch|retrieve|connect|access)|"
        r"(?:no|zero) (?:results?|matches?|data) (?:found|returned|available)|"
        r"(?:is|was|currently) (?:blocked|unavailable|down|broken|failing)|"
        r"(?:error|Error):)"
    ),
    re.compile(
        r"(?i)(?:workaround|fallback|alternative|try (?:this|these|instead)|"
        r"use this .{0,20} instead|if you want .{0,30} workaround)"
    ),
    # Connection/execution failure patterns
    re.compile(
        r"(?i)(?:timed?\s*out|connection (?:refused|failed|reset|closed)|"
        r"(?:doesn't|does not|isn't|is not) (?:seem to be )?(?:work(?:ing)?|respond(?:ing)?))"
    ),
]


def detect_premature_failure(text: str, tools_used: list[str]) -> bool:
    """Detect if a response reports failure without exhausting alternatives.

    Returns True if the response describes a failure/error AND tools were
    called (partial execution) — meaning the LLM tried something, hit an
    error, and gave up instead of trying a different approach.

    Only fires when tools WERE used (partial attempt). Pure fabrication
    (no tools) is handled by detect_fabrication instead.
    """
    if not tools_used:
        return False  # No tools called — fabrication detector handles this
    if not text or len(text) < 30:
        return False
    return any(p.search(text) for p in _FAILURE_PATTERNS)


_FAILURE_RETRY_MSG = {
    "role": "developer",
    "content": "Try alternative approaches before reporting failure.",
}


# ---------------------------------------------------------------------------
# Stuck loop detection — catches agents/loops repeating the same tool calls
# across consecutive iterations without making progress.
# ---------------------------------------------------------------------------

def _fingerprint_tool_calls(
    tool_calls: list[dict],
    *,
    names_only: bool = False,
) -> str:
    """Create a deterministic string fingerprint of a tool call sequence.

    Args:
        tool_calls: List of tool call dicts with "name" and "input"/"arguments".
        names_only: If True, ignore arguments (match on tool names + order only).

    Returns a string that is identical iff the tool call sequences are identical.
    Empty tool_calls returns the empty string.
    """
    if not tool_calls:
        return ""
    parts: list[str] = []
    for tc in tool_calls:
        name = tc.get("name", "")
        if names_only:
            parts.append(name)
        else:
            args = tc.get("input", tc.get("arguments", {}))
            if not isinstance(args, dict):
                args = {}
            args_json = json.dumps(args, sort_keys=True, default=str)
            args_hash = hashlib.sha256(args_json.encode()).hexdigest()[:16]
            parts.append(f"{name}:{args_hash}")
    return "|".join(parts)


def _detect_stuck_from_fingerprints(
    fingerprints: list[str],
    min_repeats: int = 3,
    max_cycle_length: int = 3,
) -> tuple[bool, int]:
    """Core stuck detection on pre-computed fingerprints.

    Returns (is_stuck, cycle_length). cycle_length is 0 if not stuck.
    """
    n = len(fingerprints)
    if n < min_repeats:
        return False, 0

    for cycle_len in range(1, max_cycle_length + 1):
        needed = min_repeats * cycle_len
        if n < needed:
            continue
        tail = fingerprints[-needed:]
        cycle = tail[:cycle_len]
        if not any(cycle):
            continue
        match = True
        for i in range(cycle_len, needed):
            if tail[i] != cycle[i % cycle_len]:
                match = False
                break
        if match:
            return True, cycle_len

    return False, 0


def detect_stuck_loop(
    recent_iterations: list[list[dict]],
    min_repeats: int = 3,
    max_cycle_length: int = 3,
    *,
    names_only: bool = False,
) -> bool:
    """Detect when iterations repeat the same tool call pattern.

    Args:
        recent_iterations: List of tool_call lists from recent iterations.
            Each inner list contains dicts with "name" and "input"/"arguments".
        min_repeats: Consecutive identical iterations required to trigger.
        max_cycle_length: Maximum cycle length to check (e.g., 2 = A,B,A,B,A,B).
        names_only: If True, compare tool names only (ignore arguments).

    Returns True if the last iterations form a repeating pattern of length
    1..max_cycle_length repeated at least min_repeats times.
    """
    if len(recent_iterations) < min_repeats:
        return False
    fingerprints = [
        _fingerprint_tool_calls(calls, names_only=names_only)
        for calls in recent_iterations
    ]
    stuck, _ = _detect_stuck_from_fingerprints(
        fingerprints, min_repeats, max_cycle_length
    )
    return stuck


class StuckLoopTracker:
    """Stateful tracker that records iteration tool calls and detects stuck patterns.

    Usage in an agent/loop iteration::

        tracker = StuckLoopTracker()
        for iteration in agent_loop:
            tool_calls = run_iteration()
            tracker.record(tool_calls)
            if tracker.check():
                if tracker.warned:
                    terminate()  # stuck after warning
                else:
                    inject_message(_STUCK_LOOP_RETRY_MSG)
                    tracker.warned = True
    """

    __slots__ = (
        "_fingerprints",
        "_window_size",
        "_min_repeats",
        "_max_cycle_length",
        "_names_only",
        "warned",
    )

    def __init__(
        self,
        *,
        window_size: int = 12,
        min_repeats: int = 3,
        max_cycle_length: int = 3,
        names_only: bool = False,
    ) -> None:
        self._fingerprints: deque[str] = deque(maxlen=window_size)
        self._window_size = window_size
        self._min_repeats = min_repeats
        self._max_cycle_length = max_cycle_length
        self._names_only = names_only
        self.warned: bool = False

    def record(self, tool_calls: list[dict]) -> None:
        """Record one iteration's tool calls."""
        fp = _fingerprint_tool_calls(tool_calls, names_only=self._names_only)
        self._fingerprints.append(fp)

    def check(self) -> bool:
        """Return True if recent iterations form a stuck pattern."""
        fps = list(self._fingerprints)
        stuck, _ = _detect_stuck_from_fingerprints(
            fps, self._min_repeats, self._max_cycle_length
        )
        return stuck

    def check_detailed(self) -> tuple[bool, int]:
        """Return (is_stuck, cycle_length). cycle_length is 0 if not stuck."""
        fps = list(self._fingerprints)
        return _detect_stuck_from_fingerprints(
            fps, self._min_repeats, self._max_cycle_length
        )

    @property
    def iteration_count(self) -> int:
        """Number of iterations recorded so far."""
        return len(self._fingerprints)

    def reset(self) -> None:
        """Clear all recorded iterations and the warned flag."""
        self._fingerprints.clear()
        self.warned = False


_STUCK_LOOP_RETRY_MSG = {
    "role": "developer",
    "content": (
        "You are stuck in a loop — your last several iterations made the "
        "exact same tool calls with the same arguments. This is not making "
        "progress. Try a DIFFERENT approach: use different tools, different "
        "arguments, or report your current findings and stop."
    ),
}


# ---------------------------------------------------------------------------
# Tool output truncation
# ---------------------------------------------------------------------------

# Imported by client.py for use in tool result processing.
# Defined here alongside the other guard utilities.
TOOL_OUTPUT_MAX_CHARS = 12000  # ~3000 tokens; cap tool results to prevent context bloat


def truncate_tool_output(text: str, max_chars: int = TOOL_OUTPUT_MAX_CHARS) -> str:
    """Truncate large tool output, preserving the start and end for context.

    Tool results stay in the messages list and are re-sent as input tokens
    on every subsequent iteration of the tool loop.  Capping output prevents
    a single large result (Prometheus JSON, file contents, long command output)
    from ballooning costs across iterations.
    """
    if len(text) <= max_chars:
        return text
    half = max_chars // 2
    omitted = len(text) - max_chars
    return (
        text[:half]
        + f"\n\n[... {omitted} characters omitted ...]\n\n"
        + text[-half:]
    )


# ---------------------------------------------------------------------------
# Message combination
# ---------------------------------------------------------------------------

# Pre-compiled regex for merging adjacent code blocks in combine_bot_messages
_ADJACENT_FENCE_RE = re.compile(r"\n```[ \t]*\n\n```(\w*)[ \t]*\n")


def combine_bot_messages(parts: list[str]) -> str:
    """Combine buffered bot messages, intelligently merging code blocks.

    Handles:
    - Split code blocks (open in one message, close in later one) — joined
      with a single newline so no extra blank lines appear inside the block.
    - Adjacent code blocks (close fence then immediately open fence) — merged
      into one continuous block by removing the redundant fence pair.
    - Regular text between code blocks — joined with double newline as usual.
    """
    if len(parts) <= 1:
        return parts[0] if parts else ""

    # Join parts, using \n (not \n\n) when the previous part has an unclosed
    # code block — meaning the next part is a continuation of the same block.
    # Track fence count incrementally to avoid O(n²) rescanning.
    result = parts[0]
    fence_count = result.count("```")
    for i in range(1, len(parts)):
        if fence_count % 2 == 1:
            # Inside an unclosed code block — continuation, single newline
            result += "\n" + parts[i]
        else:
            result += "\n\n" + parts[i]
        fence_count += parts[i].count("```")

    # Merge adjacent code blocks: \n```<ws>\n\n```<lang>\n → \n
    # This collapses e.g. "\n```\n\n```bash\n" into a single block.
    result = _ADJACENT_FENCE_RE.sub("\n", result)

    return result
