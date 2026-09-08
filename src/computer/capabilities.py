"""Native transport admission evidence, explicitly not upstream model acceptance.

The canary is a generated two-pixel PNG, never a capture. No credentials, network,
display, Pillow, or configuration reads occur. Model names are not image proofs.
"""

from __future__ import annotations

import base64
import json
import struct
import zlib
from dataclasses import dataclass

from .vision import FrameMetadata, ObservationImage, observation_image


@dataclass(frozen=True)
class NativeTransportEvidence:
    provider: str
    model: str
    native_images: int = 1
    correlation_preserved: bool = True
    # This must never be promoted to a claim that the remote model saw pixels.
    provider_acceptance: str = "unverified"


def _canary() -> ObservationImage:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
        )

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", 2, 1, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(b"\x00\xff\x00\x00\x00\xff\x00"))
        + chunk(b"IEND", b"")
    )
    return observation_image(
        png,
        FrameMetadata(
            observation_id="transport-canary",
            session_id="transport-canary",
            generation=1,
            captured_monotonic_ns=1,
            width=2,
            height=1,
            source_id="synthetic",
            source_revision=1,
            consent_generation=1,
            source_width=2,
            source_height=1,
        ),
    )


def native_transport_evidence(serving) -> NativeTransportEvidence:
    """Fail closed unless the *active* supported adapter serializes native pixels.

    Admission proves the client converter, not remote model capability. The final
    request must still retain current native images, use this serving snapshot,
    and fail closed on provider rejection. A failed visual generation must never
    unlock a visually blind action or fall back to a text-only adapter.
    """
    from ..llm.openai_codex import CodexChatClient

    client = getattr(serving, "client", None)
    model = getattr(serving, "model", None)
    if (
        getattr(serving, "provider", None) != "codex"
        or type(client) is not CodexChatClient
        or type(model) is not str
        or not model.strip()
        or model != model.strip()
    ):
        raise PermissionError("Computer use requires verified native image transport.")
    canary = _canary()
    encoded = canary["__image_block__"]["source"]["data"]
    messages = [
        {
            "role": "assistant",
            "content": [
                {"type": "tool_use", "id": "canary-call", "name": "computer_observe", "input": {}}
            ],
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": "canary-call",
                    "content": canary["__prompt__"],
                }
            ],
        },
        {"role": "user", "content": [canary["__image_block__"]]},
    ]
    try:
        wire = client._convert_messages_with_tools(messages)
        images = [
            block
            for item in wire
            for block in item.get("content", [])
            if block.get("type") == "input_image"
        ]
        calls = [item for item in wire if item.get("type") == "function_call"]
        results = [item for item in wire if item.get("type") == "function_call_output"]
        if (
            len(images) != 1
            or images[0].get("image_url") != f"data:image/png;base64,{encoded}"
            or len(calls) != 1
            or len(results) != 1
            or calls[0].get("call_id") != "canary-call"
            or results[0].get("call_id") != "canary-call"
        ):
            raise ValueError
        # Replace in converter-owned output only; no pixels may also be in text.
        images[0]["image_url"] = "native-image-verified"
        serialized = json.dumps(wire)
        if encoded in serialized or "data:image/" in serialized:
            raise ValueError
        base64.b64decode(encoded, validate=True)
    except Exception:
        # Never echo untrusted converter output or an exception containing it.
        raise PermissionError("Computer native image serialization failed verification.") from None
    return NativeTransportEvidence(provider="codex", model=model)
