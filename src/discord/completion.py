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

CLASSIFIER_SYSTEM_PROMPT = (
    "You are a completion judge. A user asked an AI assistant to do something. "
    "The assistant called some tools, then wrote a response. Your job: decide "
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
    def __init__(self, *, get_llm_client: Callable) -> None:
        self.get_llm_client = get_llm_client

    async def classify(
        self,
        user_message: str,
        response_text: str,
        tools_used: list[str],
    ) -> tuple[bool, str]:
        """Judge whether the assistant's response fully addresses the user's request.

        Uses the same client (same OAuth, same API) to make a lightweight
        classifier call.  Fail-open: any error/timeout/ambiguity → COMPLETE.

        Short-circuit: if ``start_loop`` was called, the user's request was to
        *schedule* recurring work, not to complete it now.  The loop runs
        asynchronously in the background, so treat the scheduling itself as
        completion.  Without this, the classifier reads the user's goal (e.g.
        "run 50 iterations") and keeps flagging the response INCOMPLETE,
        forcing redundant in-band execution of the loop's body.

        Returns (is_complete, reason).  reason is non-empty only for INCOMPLETE.
        """
        client = self.get_llm_client()
        if not client:
            return True, ""

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
            raw = await asyncio.wait_for(
                client.chat(
                    messages=[{"role": "user", "content": classifier_user_msg}],
                    system=CLASSIFIER_SYSTEM_PROMPT,
                ),
                timeout=10,
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
        log.info(
            "Completion classifier: ambiguous response, treating as COMPLETE (raw: %r)",
            stripped[:80],
        )
        return True, ""
