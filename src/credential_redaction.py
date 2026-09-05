"""Shared channel ingress credential rule, applied before durable sinks."""

import re

SECRET_SCRUB_PATTERNS = [
    re.compile(r"sk-[a-zA-Z0-9]{20,}"),
    re.compile(r"(?i)(api[_-]?key|token|secret|password)\s*[:=]\s*\S{8,}"),
    re.compile(r"xox[boaprs]-[a-zA-Z0-9-]+"),
    re.compile(r"(?i)(?:my\s+)?(?:password|passwd|pwd)\s+(?:\S+\s+){0,4}(?:is|was)\s+\S{6,}"),
]
REDACTED_CREDENTIAL = "[message redacted: detected credential]"


def check_for_secrets(content: str) -> bool:
    return any(pattern.search(content) for pattern in SECRET_SCRUB_PATTERNS)


def redact_credentials(content: str) -> str:
    return REDACTED_CREDENTIAL if check_for_secrets(content) else content
