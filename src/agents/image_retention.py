"""Failure-boundary image retention for one spawned agent's model messages.

Images reach an agent as labelled tool-image groups: one user message per tool
call, holding a text label followed by native image blocks
(``media_result.tool_image_content`` and ``append_image_messages``). Character
compaction cannot see them: characters are blind to pixels.

Nothing here acts while a request fits. When the next request would fail, the
OLDEST groups the model has already seen lose their pixels first. Each image
becomes a one-line note in place, so labels, order and call/result pairing stay
intact. Images the model has not seen yet (everything after the last assistant
message) are withheld only when nothing else lets the request fit, and then
explicitly, without re-running the tool.
"""

from __future__ import annotations

import json
from collections.abc import Callable

# OpenAI documents 512 MB as the total payload of one Responses API request.
# The Codex endpoint takes the same request format, so the bound is applied to
# Codex requests. No limit is established for other providers, so none is
# applied to them: their own answer decides.
REQUEST_PAYLOAD_LIMIT = 512 * 1024 * 1024

# Conservative serialization allowances for ``request_bytes_bound``. A code
# point costs at most 14 bytes: a surrogate pair escaped (12) inside tool
# argument JSON whose backslashes are escaped again (14) in the request JSON.
# Every container node may gain converter fields (type, role, call ids) and
# punctuation; the envelope carries the model, flags and settings.
_CHAR_BYTES = 14
_NODE_BYTES = 512
_ENVELOPE_BYTES = 64 * 1024

OMITTED_SEEN = (
    "[Image omitted from later requests to keep the request within limits. "
    "Call the tool again to see it.]"
)
WITHHELD_UNSEEN = (
    "[Image not sent: the images from this call do not fit the request limits together. "
    "Nothing was re-run; load fewer images at a time.]"
)


def _is_image(block: object) -> bool:
    """A block that reaches the wire as an image (``estimate_message_images``'s rule)."""
    if not isinstance(block, dict) or block.get("type") != "image":
        return False
    source = block.get("source")
    return (
        isinstance(source, dict)
        and source.get("type") == "base64"
        and isinstance(source.get("data"), str)
        and bool(source.get("data"))
    )


def _image_groups(messages: list[dict]) -> list[int]:
    return [
        index
        for index, message in enumerate(messages)
        if message.get("role") == "user"
        and isinstance(message.get("content"), list)
        and any(_is_image(block) for block in message["content"])
    ]


def _last_assistant(messages: list[dict]) -> int:
    for index in range(len(messages) - 1, -1, -1):
        if messages[index].get("role") == "assistant":
            return index
    return -1


def has_images(messages: list[dict]) -> bool:
    return bool(_image_groups(messages))


def seen_groups(messages: list[dict]) -> list[int]:
    """Image groups an earlier generation already carried, oldest first."""
    last = _last_assistant(messages)
    return [index for index in _image_groups(messages) if index < last]


def unseen_groups(messages: list[dict]) -> list[int]:
    """Image groups the next generation would carry for the first time."""
    last = _last_assistant(messages)
    return [index for index in _image_groups(messages) if index > last]


def group_count(messages: list[dict]) -> int:
    return len(_image_groups(messages))


def _bound(value: object) -> int:
    if isinstance(value, str):
        return _CHAR_BYTES * len(value) + 2
    if isinstance(value, dict):
        if _is_image(value):
            # Base64 is ASCII and passes through unescaped, inside a data URL.
            source = value["source"]
            return len(source["data"]) + _bound(str(source.get("media_type", ""))) + _NODE_BYTES
        return _NODE_BYTES + sum(_bound(str(key)) + _bound(item) for key, item in value.items())
    if isinstance(value, (list, tuple)):
        return _NODE_BYTES + sum(_bound(item) for item in value)
    return _NODE_BYTES


def fixed_request_bytes(system_prompt: str, tools: object) -> int:
    """Bound for the parts of a request outside its messages; measure once per call."""
    return _bound(system_prompt or "") + _bound(json.dumps(tools or [], default=str))


def request_bytes_bound(messages: list[dict], fixed_bytes: int = 0) -> int:
    """A conservative upper bound on the serialized request, in bytes.

    Walks the messages without copying them: every string at the worst-case
    escaped size, image data at its base64 length, an allowance per container.
    """
    return _ENVELOPE_BYTES + fixed_bytes + _bound(messages)


def within_request_limit(
    messages: list[dict], fixed_bytes: int = 0, limit: int | None = None
) -> bool:
    bound = REQUEST_PAYLOAD_LIMIT if limit is None else limit
    return request_bytes_bound(messages, fixed_bytes) <= bound


def _replace_images(messages: list[dict], indices: list[int], note: str) -> list[dict]:
    """A new list in which the given groups' images become notes; inputs are not mutated."""
    targets = set(indices)
    replaced = []
    for index, message in enumerate(messages):
        if index in targets:
            content = [
                {"type": "text", "text": note} if _is_image(block) else block
                for block in message["content"]
            ]
            message = {**message, "content": content}
        replaced.append(message)
    return replaced


def omit_seen(messages: list[dict], count: int) -> tuple[list[dict], int]:
    """Replace the images of the ``count`` oldest seen groups; returns (messages, groups)."""
    groups = seen_groups(messages)[: max(0, count)]
    if not groups:
        return messages, 0
    return _replace_images(messages, groups, OMITTED_SEEN), len(groups)


def fit_seen(
    messages: list[dict], fits: Callable[[list[dict]], bool]
) -> tuple[list[dict], int]:
    """Omit the oldest seen groups one at a time, only until ``fits`` holds."""
    omitted = 0
    while not fits(messages):
        messages, count = omit_seen(messages, 1)
        if not count:
            break
        omitted += count
    return messages, omitted


def withhold_unseen(messages: list[dict]) -> tuple[list[dict], int]:
    """Replace every unseen group's images with an explicit not-sent note."""
    groups = unseen_groups(messages)
    if not groups:
        return messages, 0
    return _replace_images(messages, groups, WITHHELD_UNSEEN), len(groups)
