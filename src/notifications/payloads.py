"""Preserve JSON structure while scrubbing final notification fields."""

import re
from collections.abc import Callable
from typing import Any

# Match credential carriers even when the value is too short for token-pattern
# detection. Keep notification content intact rather than using a diagnostic
# formatter that also omits command bodies or truncates keys.
_SENSITIVE_KEY = re.compile(
    r"(?:^|[_-])(?:password|passwd|secret|token|authorization|cookie|api.?key|private.?key)$",
    re.I,
)


def scrub_payload(value: Any, scrub: Callable[[str], str]) -> Any:
    if isinstance(value, str):
        return scrub(value)
    if isinstance(value, dict):
        return {
            scrub(str(key)): (
                "[REDACTED]" if _SENSITIVE_KEY.search(
                    re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", str(key)),
                ) else scrub_payload(item, scrub)
            )
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [scrub_payload(item, scrub) for item in value]
    return value
