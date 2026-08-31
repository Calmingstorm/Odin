"""Token-usage provenance captured at an accepted generation boundary.

This module is deliberately metadata-only.  It observes the exact payload and
frozen context snapshot that already governed admission; it never participates
in request construction, retries, compaction, or window evidence.
"""
from __future__ import annotations

from typing import Any


def _nonnegative_int(value: object) -> int | None:
    return value if type(value) is int and value >= 0 else None


def _field(response: object, name: str, default=None):
    if isinstance(response, dict):
        return response.get(name, default)
    return getattr(response, name, default)


def accepted_usage_fields(
    response: object,
    *,
    chars_sent: int,
    images_sent: int,
    snapshot: object | None,
) -> dict[str, Any]:
    """Return immutable, JSON-safe usage facts for one accepted request.

    Provider usage wins when present.  Its fallback is the same image-aware,
    frozen-density estimator used by admission.  The legacy four-chars/token
    CostTracker estimate is never used for input fallback here.
    """
    server_input = _nonnegative_int(_field(response, "server_input_tokens"))
    server_output = _nonnegative_int(_field(response, "server_output_tokens"))

    estimated_input: int | None = None
    density = getattr(snapshot, "density_milli", None)
    if (
        type(chars_sent) is int
        and chars_sent >= 0
        and type(images_sent) is int
        and images_sent >= 0
        and type(density) is int
        and getattr(snapshot, "base_source", None) != "persisted"
    ):
        try:
            from ..llm.context_budget import estimate_request_tokens

            estimated_input = estimate_request_tokens(
                chars_sent,
                images_sent,
                density_milli=density,
            )
        except Exception:
            estimated_input = None

    if server_input is not None:
        input_tokens = server_input
        input_provenance = "provider_reported"
    elif estimated_input is not None:
        input_tokens = estimated_input
        input_provenance = "estimated_context_v1"
    else:
        input_tokens = None
        input_provenance = "unknown"

    output_tokens: int | None
    if server_output is not None:
        output_tokens = server_output
        output_provenance = "provider_reported"
    else:
        declared_output = str(_field(response, "output_token_provenance", "") or "")
        if declared_output in {
            "estimated_text_v1",
            "estimated_context_v1",
            "estimated_legacy_4char",
        }:
            output_tokens = _nonnegative_int(_field(response, "output_tokens"))
            output_provenance = declared_output if output_tokens is not None else "unknown"
        else:
            output_tokens = None
            output_provenance = "unknown"

    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "server_input_tokens": server_input,
        "server_output_tokens": server_output,
        "estimated_input_tokens": estimated_input,
        "input_token_provenance": input_provenance,
        "output_token_provenance": output_provenance,
    }


def apply_accepted_usage(response: object, **kwargs) -> None:
    """Best-effort response annotation; usage telemetry can never fail work."""
    try:
        usage = accepted_usage_fields(response, **kwargs)
        for key in (
            "estimated_input_tokens",
            "input_token_provenance",
            "output_token_provenance",
        ):
            setattr(response, key, usage[key])
    except Exception:
        return
