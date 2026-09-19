"""OpenRouter-only catalogue, routing, and profile policy.

This module is intentionally not a generic compatible-provider extension
point. OpenRouter exposes route-level topology, prices, and served-provider
provenance that ordinary Chat-Completions endpoints do not.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import quote, urlsplit

OPENROUTER_API_ORIGIN = "https://openrouter.ai"
OPENROUTER_API_BASE_URL = f"{OPENROUTER_API_ORIGIN}/api/v1"
OPENROUTER_PRICE_SENTINEL = Decimal("-1000000")
OPENROUTER_AGENT_MIN_TOKENS = 63_000


async def fetch_json(
    session: Any,
    path: str,
    *,
    timeout_seconds: int = 20,
    api_key: str | None = None,
) -> dict:
    """Fetch one public OpenRouter JSON document with bounded response size."""
    import json

    import aiohttp

    url = f"{OPENROUTER_API_ORIGIN}{path}"
    headers = {"Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    async with session.get(
        url,
        headers=headers,
        timeout=aiohttp.ClientTimeout(total=timeout_seconds),
    ) as response:
        if response.status != 200:
            raise RuntimeError(f"OpenRouter catalogue HTTP {response.status}")
        raw = await response.read()
        if len(raw) > 4 * 1024 * 1024:
            raise ValueError("OpenRouter catalogue response exceeds 4 MiB")
        value = json.loads(raw)
        if not isinstance(value, dict):
            raise ValueError("OpenRouter catalogue response is not an object")
        return value


def is_openrouter_base_url(value: object) -> bool:
    """Recognize only the public OpenRouter API root, ignoring a trailing slash."""
    if not isinstance(value, str):
        return False
    parsed = urlsplit(value.strip().rstrip("/"))
    return (
        parsed.scheme.lower() == "https"
        and (parsed.hostname or "").lower() == "openrouter.ai"
        and parsed.port is None
        and parsed.path.rstrip("/") == "/api/v1"
        and not parsed.query
        and not parsed.fragment
    )


def openrouter_variant(model_id: str) -> str:
    if model_id.endswith(":free"):
        return "free"
    if model_id.endswith(":batch"):
        return "batch"
    return "standard"


def _positive_int(value: object) -> int | None:
    return value if type(value) is int and value > 0 else None


def _decimal_string(value: object) -> str | None:
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    if not parsed.is_finite() or parsed < 0 or parsed == OPENROUTER_PRICE_SENTINEL:
        return None
    return format(parsed, "f")


def _pricing(raw: object) -> dict[str, Any]:
    values = raw if isinstance(raw, dict) else {}
    mapped: dict[str, Any] = {
        "prompt_per_token": _decimal_string(values.get("prompt")),
        "completion_per_token": _decimal_string(values.get("completion")),
        "cache_read_per_token": _decimal_string(values.get("input_cache_read")),
        "cache_write_per_token": _decimal_string(values.get("input_cache_write")),
    }
    mapped["known"] = mapped["prompt_per_token"] is not None
    return mapped


def model_detail_path(model_id: str) -> str:
    """Return a safely encoded OpenRouter endpoint-detail API path."""
    author, separator, slug = model_id.partition("/")
    if not separator or not author or not slug or any(ch in model_id for ch in "?#"):
        raise ValueError("OpenRouter model id must be a namespaced vendor/model id")
    return f"/api/v1/models/{quote(author, safe='')}/{quote(slug, safe=':._-')}/endpoints"


def _endpoint_supports_tools(endpoint: dict) -> bool:
    parameters = endpoint.get("supported_parameters")
    return isinstance(parameters, list) and "tools" in parameters


def normalize_endpoint_rows(payload: object) -> list[dict[str, Any]]:
    data = payload.get("data") if isinstance(payload, dict) else None
    records = data.get("endpoints") if isinstance(data, dict) else None
    if not isinstance(records, list):
        raise ValueError("OpenRouter endpoint response has no endpoint catalogue")
    result: list[dict[str, Any]] = []
    for raw in records:
        if not isinstance(raw, dict):
            continue
        tag = raw.get("tag")
        provider_name = raw.get("provider_name")
        if not isinstance(tag, str) or not tag or not isinstance(provider_name, str):
            continue
        parameters = raw.get("supported_parameters")
        parameters = parameters if isinstance(parameters, list) else []
        result.append(
            {
                "tag": tag,
                "provider_name": provider_name,
                "context_length": _positive_int(raw.get("context_length")),
                "max_completion_tokens": _positive_int(raw.get("max_completion_tokens")),
                "quantization": str(raw.get("quantization") or "unknown"),
                "supports_tools": _endpoint_supports_tools(raw),
                "supports_reasoning": (
                    "reasoning" in parameters or "reasoning_effort" in parameters
                ),
                # Advisory only. Live cached-token evidence is authoritative.
                "declares_implicit_caching": raw.get("supports_implicit_caching") is True,
                "pricing": _pricing(raw.get("pricing")),
                "uptime_last_30m": raw.get("uptime_last_30m"),
                "latency_last_30m": raw.get("latency_last_30m"),
                "throughput_last_30m": raw.get("throughput_last_30m"),
            }
        )
    return result


def permitted_endpoint_rows(
    rows: list[dict[str, Any]],
    routing: object,
    *,
    require_reasoning: bool = False,
) -> list[dict[str, Any]]:
    """Apply only route constraints OpenRouter documents as endpoint filters."""
    candidates = [row for row in rows if row.get("supports_tools")]
    if require_reasoning:
        candidates = [row for row in candidates if row.get("supports_reasoning")]
    order = list(getattr(routing, "order", []) or [])
    allow_fallbacks = bool(getattr(routing, "allow_fallbacks", False))
    if order and not allow_fallbacks:
        allowed = set(order)
        candidates = [row for row in candidates if row.get("tag") in allowed]
    quantizations = set(getattr(routing, "quantizations", []) or [])
    if quantizations:
        candidates = [row for row in candidates if row.get("quantization") in quantizations]
    return candidates


def conservative_profile(
    rows: list[dict[str, Any]],
    routing: object,
    *,
    require_reasoning: bool = False,
) -> dict[str, Any] | None:
    """Derive one safe profile from the endpoints the current route may serve."""
    candidates = permitted_endpoint_rows(
        rows,
        routing,
        require_reasoning=require_reasoning,
    )
    usable = [
        row
        for row in candidates
        if _positive_int(row.get("context_length"))
        and _positive_int(row.get("max_completion_tokens"))
    ]
    if not usable:
        return None
    context_limit = min(usable, key=lambda row: int(row["context_length"]))
    output_limit = min(usable, key=lambda row: int(row["max_completion_tokens"]))
    return {
        "total_window_tokens": int(context_limit["context_length"]),
        "max_output_tokens": int(output_limit["max_completion_tokens"]),
        "source": (
            "openrouter_pinned_endpoint"
            if getattr(routing, "order", None) and not getattr(routing, "allow_fallbacks", False)
            else "openrouter_conservative_routes"
        ),
        "context_route_tag": context_limit.get("tag"),
        "output_route_tag": output_limit.get("tag"),
    }


def normalize_model_catalogue(payload: object) -> list[dict[str, Any]]:
    records = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(records, list):
        raise ValueError("OpenRouter response has no model catalogue")
    normalized: list[dict[str, Any]] = []
    for raw in records:
        if not isinstance(raw, dict):
            continue
        model_id = raw.get("id")
        if not isinstance(model_id, str) or "/" not in model_id:
            continue
        raw_top = raw.get("top_provider")
        top: dict[str, Any] = raw_top if isinstance(raw_top, dict) else {}
        parameters = raw.get("supported_parameters")
        parameters = parameters if isinstance(parameters, list) else []
        total = _positive_int(raw.get("context_length")) or _positive_int(top.get("context_length"))
        output = _positive_int(top.get("max_completion_tokens"))
        usable = total - output if total is not None and output is not None else 0
        variant = openrouter_variant(model_id)
        supports_tools = "tools" in parameters
        reason = None
        if variant != "standard":
            reason = f"{variant} variant is not offered for ordinary agents"
        elif not supports_tools:
            reason = "model catalogue does not declare tool support"
        elif not total or not output:
            reason = "catalogue has no complete context profile"
        elif usable < OPENROUTER_AGENT_MIN_TOKENS:
            reason = (
                f"catalogue usable input is {usable:,} tokens; "
                f"at least {OPENROUTER_AGENT_MIN_TOKENS:,} are required"
            )
        raw_reasoning = raw.get("reasoning")
        reasoning: dict[str, Any] = raw_reasoning if isinstance(raw_reasoning, dict) else {}
        normalized.append(
            {
                "id": model_id,
                "name": str(raw.get("name") or model_id),
                "vendor": model_id.split("/", 1)[0],
                "variant": variant,
                "context_length": total,
                "max_completion_tokens": output,
                "supports_tools": supports_tools,
                "supports_reasoning": "reasoning" in parameters or "reasoning_effort" in parameters,
                "supported_efforts": list(reasoning.get("supported_efforts") or []),
                "pricing": _pricing(raw.get("pricing")),
                "agent_eligible": reason is None,
                "agent_unavailable_reason": reason,
            }
        )
    return normalized


def request_provider_policy(
    routing: object,
    *,
    model: str,
    has_tools: bool,
    has_reasoning: bool,
) -> dict:
    """Render the documented OpenRouter provider object from bounded config."""
    body: dict[str, Any] = {
        "require_parameters": bool(has_tools or has_reasoning),
        "allow_fallbacks": bool(getattr(routing, "allow_fallbacks", False)),
    }
    raw_pins = getattr(routing, "model_pins", {}) or {}
    model_pins: dict[str, str] = raw_pins if isinstance(raw_pins, dict) else {}
    model_pin = model_pins.get(model)
    if model_pin:
        body["order"] = [model_pin]
        body["allow_fallbacks"] = False
    for key in ("order", "quantizations"):
        value = list(getattr(routing, key, []) or [])
        if value and (key != "order" or not model_pin):
            body[key] = value
    for key in ("sort", "data_collection"):
        scalar = getattr(routing, key, None)
        if scalar:
            body[key] = scalar
    return body
