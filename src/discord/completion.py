"""Completion classification (RFC-001 Phase 7).

Tool-loop policy machinery, not a general completion service (reviewer
boundary note, R1): judges whether a tool-using turn actually finished the
user's request, driving the loop's continuation nudges. Verbatim moves
from OdinBot. ``get_llm_client`` is a provider callable (the active client
changes with reloads/switches).
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable

from ..odin_log import get_logger

log = get_logger("discord")

CLASSIFIER_TIMEOUT_SECONDS = 10.0
COMPAT_CLASSIFIER_TIMEOUT_SECONDS = 60.0

CLASSIFIER_SYSTEM_PROMPT = (
    "You are a completion judge. A user asked an AI assistant to do something. "
    "The assistant may have called some tools, then wrote a response. Your job: decide "
    "if the user's requested outcome was actually achieved.\n\n"
    "COMPLETE means:\n"
    "- The user's full request was addressed (not just part of it)\n"
    "- The exact artifact asked for was produced, not a plausible-shaped substitute\n"
    "- The assistant is not promising to do more work\n"
    "- A failure report after genuinely trying counts as COMPLETE\n\n"
    "INCOMPLETE means:\n"
    "- The assistant only did part of what was asked (e.g., built but didn't deploy)\n"
    "- The assistant is describing work it still plans to do\n"
    "- The assistant is reporting partial progress with more steps remaining\n"
    "- The response is shaped like an answer but doesn't contain the specific "
    "  artifact requested (e.g., asked for the generated code; got a description of it)\n"
    "- The assistant closes by offering MORE work ('I could also…', 'would you like…') "
    "  instead of finishing the requested work\n\n"
    'If INCOMPLETE, briefly state what\'s missing after a colon.\n'
    'Examples: "INCOMPLETE: deployment not performed", "INCOMPLETE: verification step missing", '
    '"INCOMPLETE: described the synthesized runbook but did not include its source"\n'
    'If COMPLETE, just say: "COMPLETE"'
)


class CompletionClassifier:
    def __init__(
        self,
        *,
        get_llm_client: Callable,
        get_auxiliary_llm_client: Callable | None = None,
    ) -> None:
        self.get_llm_client = get_llm_client
        self.get_auxiliary_llm_client = get_auxiliary_llm_client

    async def classify(
        self,
        user_message: str,
        response_text: str,
        tools_used: list[str],
        *,
        timeout_seconds: float | None = None,
    ) -> tuple[bool, str]:
        """Judge whether a tool-using assistant response fully addresses its request.

        Uses a configured auxiliary client when present, otherwise the active
        provider, for a judgment call. Fail-open on errors, timeout, or
        ambiguity. ``timeout_seconds`` lets bounded callers enforce their own
        remaining execution lifetime.

        Short-circuit: if ``start_loop`` was called, the user's request was to
        *schedule* recurring work, not to complete it now.  The loop runs
        asynchronously in the background, so treat the scheduling itself as
        completion.  Without this, the classifier reads the user's goal (e.g.
        "run 50 iterations") and keeps flagging the response INCOMPLETE,
        forcing redundant in-band execution of the loop's body.

        Returns (is_complete, reason).  reason is non-empty only for INCOMPLETE.
        """
        if timeout_seconds is not None and timeout_seconds <= 0:
            return True, ""

        # A configured auxiliary model is intended for bounded background
        # judgments like this. Its wrapper records cost and falls back to its
        # primary on failure. Resolve on every call so provider/config reloads
        # do not pin a retired client.
        try:
            auxiliary = self.get_auxiliary_llm_client() if self.get_auxiliary_llm_client else None
        except Exception as e:
            log.warning("Completion classifier: auxiliary client lookup failed (%s)", e)
            auxiliary = None
        client = auxiliary or self.get_llm_client()
        if not client:
            return True, ""

        # Codex keeps its existing bound. Compatible and Ollama judges get
        # longer for inference, including the auxiliary wrapper's fallback.
        from ..llm.openai_codex import CodexChatClient

        judge_provider = getattr(auxiliary, "provider", None) if auxiliary is not None else None
        is_codex = (
            judge_provider == "codex"
            if judge_provider is not None
            else isinstance(client, CodexChatClient)
        )
        classifier_timeout = (
            CLASSIFIER_TIMEOUT_SECONDS if is_codex else COMPAT_CLASSIFIER_TIMEOUT_SECONDS
        )

        if "start_loop" in tools_used:
            log.info(
                "Completion classifier: start_loop called — loop runs in "
                "background, treating as COMPLETE"
            )
            return True, ""

        classifier_user_msg = (
            f"User's task: {user_message}\n\n"
            f"Tools called: {', '.join(tools_used)}\n\n"
            f"Assistant's response: {response_text}"
        )

        try:
            if auxiliary is not None and client is auxiliary:
                request = client.chat(
                    messages=[{"role": "user", "content": classifier_user_msg}],
                    system=CLASSIFIER_SYSTEM_PROMPT,
                    task="completion_classifier",
                )
            else:
                request = client.chat(
                    messages=[{"role": "user", "content": classifier_user_msg}],
                    system=CLASSIFIER_SYSTEM_PROMPT,
                )
            raw = await asyncio.wait_for(
                request,
                timeout=(
                    classifier_timeout
                    if timeout_seconds is None
                    else min(classifier_timeout, timeout_seconds)
                ),
            )
        except Exception as e:
            log.warning("Completion classifier: error/timeout (%s) — fail-open to COMPLETE", e)
            return True, ""

        return self.parse_response(raw)

    @staticmethod
    def parse_response(raw: str) -> tuple[bool, str]:
        """Parse the classifier's raw text into (is_complete, reason).

        Checks INCOMPLETE first (more specific), then COMPLETE, else fail-open.
        """
        stripped = (raw or "").strip()
        upper = stripped.upper()

        if upper.startswith("INCOMPLETE"):
            # Extract reason after first colon, dash, or em-dash
            reason = ""
            for sep in (":", " - ", " — ", "—"):
                idx = stripped.find(sep)
                if idx != -1:
                    reason = stripped[idx + len(sep) :].strip()
                    break
            log.info(
                "Completion classifier: INCOMPLETE reason=%r (raw: %r)",
                reason,
                stripped[:80],
            )
            return False, reason

        if upper.startswith("COMPLETE"):
            log.info("Completion classifier: COMPLETE (raw: %r)", stripped[:80])
            return True, ""

        # Ambiguous / gibberish → fail-open
        log.warning(
            "Completion classifier: ambiguous response, treating as COMPLETE (raw: %r)",
            stripped[:80],
        )
        return True, ""
