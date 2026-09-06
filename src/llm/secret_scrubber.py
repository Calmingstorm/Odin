"""Secret scrubbing for tool output and LLM responses.

Provides pattern-based detection and redaction of sensitive values
(passwords, API keys, tokens, private keys, database URIs) to prevent
them from leaking through LLM responses or tool output.
"""
from __future__ import annotations

import inspect
import json
import re

# Patterns to scrub from tool output before it reaches the LLM
OUTPUT_SECRET_PATTERNS = [
    re.compile(r"(?<![a-zA-Z])(password|passwd|pwd)\s*[:=]\s*\S+", re.IGNORECASE),
    re.compile(r"(api[_-]?key|apikey)\s*[:=]\s*\S+", re.IGNORECASE),
    re.compile(r"(secret|token|access_token|auth_token)\s*[:=]\s*['\"]?\S{16,}", re.IGNORECASE),
    re.compile(r"sk-[a-zA-Z0-9]{20,}"),
    re.compile(r"BEGIN\s+(RSA|EC|OPENSSH|DSA)?\s*PRIVATE\s+KEY", re.IGNORECASE),
    re.compile(r"(mysql|postgres|mongodb(\+srv)?)://\S+:\S+@", re.IGNORECASE),
    # GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_)
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{36,}"),
    # AWS access key IDs
    re.compile(r"AKIA[0-9A-Z]{16}"),
    # AWS secret access keys
    re.compile(
        r"(?:aws_secret_access_key|aws_secret_key)\s*[:=]\s*[A-Za-z0-9/+=]{40}",
        re.IGNORECASE,
    ),
    # Stripe live/test secret keys
    re.compile(r"[sr]k_(live|test)_[A-Za-z0-9]{20,}"),
    # Slack tokens (xoxb, xoxp, xoxa, xoxo, xoxr, xoxs)
    re.compile(r"xox[boaprs]-[a-zA-Z0-9-]+"),
    # JWT tokens (header.payload.signature, each part is base64url)
    re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"),
    # Anthropic API keys (sk-ant-api03-...)
    re.compile(r"sk-ant-[A-Za-z0-9_-]{20,}"),
    # Discord bot tokens (base64-user-id.timestamp.hmac)
    re.compile(r"[MN][A-Za-z0-9]{23,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}"),
    # Google API keys
    re.compile(r"AIza[A-Za-z0-9_-]{35}"),
    # HashiCorp Vault tokens
    re.compile(r"hvs\.[A-Za-z0-9_-]{24,}"),
]


def is_credential_key(key: str) -> bool:
    """The shared JSON key rule for tool results and process captures."""
    key = re.sub(r"[^a-z0-9]", "", key.lower())
    return (key in {"password", "passwd", "pwd", "secret", "token", "authorization",
                    "apikey", "accesskey", "privatekey", "credential", "credentials"}
            or key.endswith(("password", "secret", "token", "apikey", "privatekey")))


def _decoded_string_content(text: str, start: int, end: int):
    """Decode escapes with a source boundary map, including partial captures.

    Only escaped strings need a map. Each source character is visited once;
    adjacent UTF-16 surrogate escapes are consumed together by json.loads.
    Invalid/incomplete escapes remain literal so other patterns still work.
    """
    raw = text[start:end]
    if "\\" not in raw:
        return raw, None
    pieces = []
    boundaries = [start]
    cursor = start
    escape = re.compile(r'\\(?:u[0-9a-fA-F]{4}(?:\\u[0-9a-fA-F]{4})?|[^u])')
    while cursor < end:
        match = escape.match(text, cursor, end) if text[cursor] == "\\" else None
        if match:
            try:
                decoded = json.loads('"' + match.group() + '"')
            except ValueError:
                decoded = None
            if decoded is not None:
                pieces.append(decoded)
                if len(decoded) == 2:  # Two non-surrogate Unicode escapes.
                    boundaries.extend((cursor + 6, match.end()))
                else:
                    boundaries.append(match.end())
                cursor = match.end()
                continue
        pieces.append(text[cursor])
        cursor += 1
        boundaries.append(cursor)
    return "".join(pieces), boundaries


def iter_secret_spans(text: str):
    """Yield sorted, disjoint secret-content spans in original character offsets.

    A lexical scan (not a document parse/re-dump) supports JSON lines, embedded
    JSON, escaped keys, and a string cut off at the capture boundary. Credential
    keys redact STRING values only, never numbers, booleans, lists or objects.
    Quotation marks/framing are outside every JSON span. Other existing secret
    patterns run within each string or non-string segment so they cannot swallow
    JSON delimiters. Escaped payload patterns are checked after decoding too.

    The fixed pattern set writes into a character mask: overlapping detections
    cost O(patterns * characters), not repeated prefix encodes or span sorting.
    """
    mask = bytearray(len(text))

    def mark_patterns(value, start=0, end=None, boundaries=None, offset=0):
        if end is None:
            end = len(value)
        if end - start < 5:
            return  # The shortest existing match is a nonempty pwd assignment.
        if end - start < 16 and value[start:end].isidentifier():
            return  # Short identifier-only JSON keys cannot match any pattern.
        for pattern in OUTPUT_SECRET_PATTERNS:
            for match in pattern.finditer(value, start, end):
                left, right = match.span()
                if boundaries is not None:
                    left, right = boundaries[left], boundaries[right]
                else:
                    left += offset
                    right += offset
                mask[left:right] = b"\x01" * (right - left)

    strings = re.compile(
        r'''"(?:[^"\\]|\\[\s\S])*(?:"|\\?\Z)|(?<!\w)'(?:[^'\\]|\\[\s\S])*(?:'|\\?\Z)''')
    cursor = 0
    credential_value = -1
    for token in strings.finditer(text):
        mark_patterns(text, cursor, token.start())
        gap = text[cursor:token.start()].rstrip()
        if gap.endswith((":", "=")):
            assignment = re.match(r"[\w-]+", gap[:-1].rstrip()[::-1])
            if assignment and is_credential_key(assignment.group()[::-1]):
                credential_value = token.start()
        start = token.start() + 1
        # A trailing quote is closing only if it was not consumed as an escape.
        end = token.end()
        slashes = 0
        if end > start and text[end - 1] == text[token.start()]:
            pos = end - 2
            while pos >= start and text[pos] == "\\":
                slashes += 1
                pos -= 1
            if slashes % 2 == 0:
                end -= 1
        value, boundaries = _decoded_string_content(text, start, end)
        if value == "[REDACTED]" or (value and not value.strip("*")):
            pass
        elif token.start() == credential_value:
            mask[start:end] = b"\x01" * (end - start)
        else:
            mark_patterns(value, boundaries=boundaries, offset=start)
        credential_value = -1
        after = token.end()
        while after < len(text) and text[after] in " \t\r\n":
            after += 1
        if after < len(text) and text[after] == ":" and is_credential_key(value):
            after += 1
            while after < len(text) and text[after] in " \t\r\n":
                after += 1
            credential_value = after
        cursor = token.end()
    mark_patterns(text, cursor)
    for match in re.finditer(b"\x01+", mask):
        yield match.span()


def scrub_process_secrets(data: bytes) -> bytes:
    """Mask original bytes in one forward pass, preserving every byte offset.

    Call on complete captures before slicing pages, never on arbitrary page
    fragments. Quotes remain intact and malformed UTF-8 round-trips unchanged.
    """
    text = data.decode("utf-8", "surrogateescape")
    masked = None
    character_cursor = byte_cursor = 0
    for start, end in iter_secret_spans(text):
        if masked is None:
            masked = bytearray(data)
        byte_cursor += len(text[character_cursor:start].encode("utf-8", "surrogateescape"))
        length = len(text[start:end].encode("utf-8", "surrogateescape"))
        masked[byte_cursor:byte_cursor + length] = b"*" * length
        byte_cursor += length
        character_cursor = end
    return data if masked is None else bytes(masked)


def embedded_process_scrubber_source() -> str:
    """Self-contained stdlib-only source for the remote supervisor/controller."""
    return ("import json, re\nOUTPUT_SECRET_PATTERNS = [re.compile(p, f) for p, f in "
            + repr([(pattern.pattern, int(pattern.flags)) for pattern in OUTPUT_SECRET_PATTERNS])
            + "]\n"
            + "\n".join(inspect.getsource(function) for function in (
                is_credential_key, _decoded_string_content, iter_secret_spans,
                scrub_process_secrets))
            + "\nscrub = scrub_process_secrets\n")


def scrub_output_secrets(text: str) -> str:
    """Scrub payload strings without consuming JSON framing or ranked metadata."""
    from ..tools.output_delivery import DeliveredOutput, RankedOutput

    if isinstance(text, DeliveredOutput):
        return text
    if isinstance(text, RankedOutput):
        return RankedOutput(scrub_output_secrets(str(text)), matches=tuple(
            scrub_output_secrets(match) for match in text.matches),
            recovery_required=text.recovery_required)
    if not isinstance(text, str):
        text = str(text)
    return _scrub_text(text)


def _scrub_text(text: str) -> str:
    pieces: list[str] = []
    cursor = 0
    for start, end in iter_secret_spans(text):
        pieces.extend((text[cursor:start], "[REDACTED]"))
        cursor = end
    if not pieces:
        return text
    pieces.append(text[cursor:])
    return "".join(pieces)
