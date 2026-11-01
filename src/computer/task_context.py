"""Small descriptive working context. Never consulted to authorize desktop input.

Tool/color/brush descriptions are the caller's interpretation of a delivered
view, not backend attestations. Keep that distinction visible. The caller's own
actions do not expire them: it chose those actions and sees their frames, and
calling every note stale after each step made it re-check values it had already
read. Expire them only when the target changes under them: another monitor,
window or application that the caller's own input did not bring up, a human
focus change, a pause or an interrupted input.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .models import ComputerError

_FIELDS = frozenset({"goal", "tool", "color", "brush"})


def context_arguments(value):
    if not isinstance(value, dict) or set(value) - _FIELDS or not value:
        raise ComputerError("invalid_task_context")
    result = {}
    for key, text in value.items():
        if (
            not isinstance(text, str)
            or not 1 <= len(text) <= 160
            or any(ord(c) < 32 or 0xD800 <= ord(c) <= 0xDFFF for c in text)
        ):
            raise ComputerError("invalid_task_context")
        result[key] = text
    return result


@dataclass
class TaskContext:
    """Ephemeral hints survive a focus interruption, but never become authority."""

    hints: dict[str, str] = field(default_factory=dict)
    hint_observation_id: str | None = None
    last_view_id: str | None = None
    delivered_view_id: str | None = None
    state: str = "unobserved"
    reason: str | None = None
    target_binding: tuple | None = field(default=None, repr=False)
    target: dict = field(default_factory=dict)
    application: dict = field(default_factory=dict)
    own_transition: bool = field(default=False, repr=False)

    def describe(self, hints, *, delivered_observation_id):
        self.hints.update(context_arguments(hints))
        self.hint_observation_id = delivered_observation_id
        self.state = "caller_described" if delivered_observation_id else "unverified"
        self.reason = None if delivered_observation_id else "no_delivered_view"

    def acted(self):
        """Input may have reached the target: its next capture is the caller's own."""
        self.own_transition = True

    def action_finished(self):
        """End of an action. A mark its own verification capture never consumed
        means nobody saw the target after that input: expire the mark, and the
        notes with it, so a later change cannot pass as the caller's own."""
        if self.own_transition:
            self.own_transition = False
            self.invalidate("post_action_view_unavailable")

    def captured(self, observation):
        source = observation.source
        binding = (source.source_id, source.input_region_id, source.source_revision)
        # The revision advances on window, focus and dialog changes. Right after
        # the caller's own input that is its own transition (a dialog it opened);
        # any other change is external, such as a person switching to another
        # window of the same application. Another monitor is always external.
        if self.target_binding is not None and (
            self.target_binding[:2] != binding[:2]
            or (self.target_binding[2] != binding[2] and not self.own_transition)
        ):
            self.invalidate("target_binding_changed")
        self.own_transition = False
        self.target_binding = binding
        self.target = {
            "source_id": observation.source.source_id,
            "source_revision": observation.source.source_revision,
            "input_region_id": observation.source.input_region_id,
            "modal": observation.modal,
        }
        self.last_view_id = observation.observation_id

    def delivered(self, observation_id):
        self.delivered_view_id = observation_id
        # Delivery is evidence availability, not semantic verification of hints.

    def identify(self, application):
        """Record the target application; notes about another one are stale."""
        if self.application and application and application != self.application:
            self.invalidate("application_changed")
        self.application = application

    def invalidate(self, reason):
        self.state = "stale"
        self.reason = reason

    def public(self):
        result = {
            "hints": dict(self.hints),
            "hint_source": "caller_description_not_attestation",
            "hint_observation_id": self.hint_observation_id,
            "last_view_id": self.last_view_id,
            "delivered_view_id": self.delivered_view_id,
            "state": self.state,
            "reason": self.reason,
            "target": dict(self.target),
            "application": dict(self.application),
            "authorizes_input": False,
        }
        if self.state == "stale":
            result["recovery"] = (
                "The target changed since these notes were written; check them against "
                "the current view before relying on them. Do not steal focus or replay "
                "interrupted input."
            )
        return result
