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

from collections.abc import Callable

# OpenAI documents 512 MB as the total payload of one request. Base64 image
# data dominates it, and an oversized request fails outright.
REQUEST_PAYLOAD_LIMIT = 512 * 1024 * 1024

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


def payload_bytes(messages: list[dict]) -> int:
    """Approximate request size: text characters plus base64 image data."""
    from ..llm.context_compressor import estimate_message_chars

    total = estimate_message_chars(messages)
    for message in messages:
        content = message.get("content")
        if isinstance(content, list):
            total += sum(len(block["source"]["data"]) for block in content if _is_image(block))
    return total


def within_payload_limit(messages: list[dict], limit: int | None = None) -> bool:
    return payload_bytes(messages) <= (REQUEST_PAYLOAD_LIMIT if limit is None else limit)


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
