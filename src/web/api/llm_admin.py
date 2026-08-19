"""LLM provider administration route registrars (RFC-003 P2 — carved verbatim from api/__init__).

Each ``register_*`` moves one section of the old monolith unchanged; the
composition root calls them at the sections' original positions, so the
route REGISTRATION ORDER (aiohttp path precedence) is exactly what the
parity contract pins.
"""

from __future__ import annotations

import asyncio
import ipaddress as _ipaddress
import urllib.parse as _urlparse
from typing import Any

from aiohttp import web
from pydantic import TypeAdapter, ValidationError

from ...config.persistence import (
    config_transaction,
    patch_config_paths,
    persist_config_paths_locked,
)
from ...config.schema import (
    AGENT_SETTING_AUTO,
    CODEX_REASONING_EFFORTS,
    allowed_efforts_for_model,
    effort_incompatibility_error,
)
from ...llm.window_observer import WindowObserverMutationError
from ...odin_log import get_logger

log = get_logger("web.api")

_ALLOWED_OLLAMA_HOSTS = frozenset(
    {
        "localhost",
        "127.0.0.1",
        "::1",
        "0.0.0.0",
    }
)


def _validate_ollama_url(url: str) -> str:
    """Validate Ollama base_url — restrict to local/private networks to prevent SSRF."""
    if not url.startswith(("http://", "https://")):
        raise ValueError("base_url must start with http:// or https://")
    parsed = _urlparse.urlparse(url)
    host = parsed.hostname or ""
    if host in _ALLOWED_OLLAMA_HOSTS:
        return url
    try:
        addr = _ipaddress.ip_address(host)
        if addr.is_link_local:
            raise ValueError(f"Link-local addresses not allowed: {host}")
        if addr.is_private or addr.is_loopback:
            return url
        raise ValueError(f"Public IP not allowed for Ollama: {host}")
    except ValueError as e:
        if "not allowed" in str(e) or "Public IP" in str(e):
            raise
    except Exception:
        pass
    try:
        import socket

        resolved = socket.getaddrinfo(host, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        if not resolved:
            raise ValueError(f"Could not resolve hostname: {host}")
        for _, _, _, _, sockaddr in resolved:
            addr = _ipaddress.ip_address(sockaddr[0])
            if addr.is_link_local:
                raise ValueError(f"Link-local address not allowed: {sockaddr[0]}")
            if not (addr.is_private or addr.is_loopback):
                raise ValueError(
                    f"All resolved addresses must be private/local, got public: {sockaddr[0]}"
                )
        return url
    except ValueError:
        raise
    except Exception:
        pass
    raise ValueError(f"Ollama base_url must point to a local/private network address, got: {host}")


def _parse_int(val, name: str, lo: int = 1, hi: int = 262000) -> int:
    try:
        v = int(val)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be an integer")
    if v < lo or v > hi:
        raise ValueError(f"{name} must be between {lo} and {hi}")
    return v


def register_connection_pools(routes: web.RouteTableDef, bot) -> None:
    """Connection pool status (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Connection pool status
    # ------------------------------------------------------------------

    @routes.get("/api/pools/ssh")
    async def get_ssh_pool(_request: web.Request) -> web.Response:
        executor = getattr(bot, "tool_executor", None)
        if executor is None or not hasattr(executor, "ssh_pool") or executor.ssh_pool is None:
            return web.json_response({"error": "SSH pool not available"}, status=503)
        return web.json_response(executor.ssh_pool.get_metrics())

    @routes.get("/api/pools/http")
    async def get_http_pool(_request: web.Request) -> web.Response:
        result = {}
        codex = getattr(bot.llm_gateway, "codex_client", None)
        if codex is not None and hasattr(codex, "get_pool_metrics"):
            result["codex"] = codex.get_pool_metrics()
        ollama = getattr(bot.llm_gateway, "ollama_client", None)
        if ollama is not None:
            result["ollama"] = ollama.pool_stats()
        kimi = getattr(bot.llm_gateway, "kimi_client", None)
        if kimi is not None:
            result["kimi"] = kimi.pool_stats()
        if not result:
            return web.json_response({"error": "No HTTP pools available"}, status=503)
        return web.json_response(result)

    @routes.post("/api/pools/ssh/close")
    async def close_ssh_pool_host(request: web.Request) -> web.Response:
        executor = getattr(bot, "tool_executor", None)
        if executor is None or not hasattr(executor, "ssh_pool") or executor.ssh_pool is None:
            return web.json_response({"error": "SSH pool not available"}, status=503)
        try:
            data = await request.json()
        except Exception:
            data = {}
        host = data.get("host")
        if host:
            ssh_user = data.get("ssh_user", "root")
            closed = await executor.ssh_pool.close_host(host, ssh_user)
            return web.json_response({"closed": closed, "host": host})
        count = await executor.ssh_pool.close_all()
        return web.json_response({"closed_count": count})


def _auxiliary_status(bot) -> dict:
    """Configured vs effective auxiliary state for /api/llm/status.

    ``enabled``/``model`` are the persisted config; the ``effective_*`` fields
    describe the live runtime wrapper (present only when config produced a
    working client). ``unavailable_reason`` is set when enabled config could
    NOT produce a live client (e.g. no auth). The four background jobs route
    to this model when enabled — there is no per-task configuration.
    """
    aux_cfg = getattr(bot.config.openai_codex, "auxiliary", None)
    live = getattr(bot.llm_gateway, "auxiliary_llm_client", None)
    configured_enabled = bool(aux_cfg and aux_cfg.enabled)
    unavailable_reason = None
    if configured_enabled and live is None:
        unavailable_reason = "enabled but no live auxiliary client (check credentials)"
    return {
        "enabled": configured_enabled,
        "model": aux_cfg.model if aux_cfg else "",
        "effective_enabled": live is not None,
        "effective_model": getattr(getattr(live, "aux_client", None), "model", None),
        "unavailable_reason": unavailable_reason,
    }


def _boot_codex_group_status(
    bot: Any,
    group: str,
    desired: dict[str, Any],
) -> tuple[dict[str, Any] | None, bool | None]:
    """Return boot-effective values and whether desired differs.

    Connection-pool and context-compression objects are captured by runtime
    components at boot. The desired config object is therefore not evidence
    of what this process uses. ``None`` is deliberate when the boot snapshot
    is unavailable: unknown is more honest than inventing an applied state.
    """
    # OdinClient records this once during construction. Read the concrete
    # instance dictionary so permissive mocks/proxies cannot manufacture a
    # pretend snapshot through __getattr__ and make status look authoritative.
    boot = getattr(bot, "__dict__", {}).get("boot_config_snapshot")
    if not isinstance(boot, dict):
        return None, None
    codex_boot = boot.get("openai_codex")
    if not isinstance(codex_boot, dict):
        return None, None
    effective = codex_boot.get(group)
    if not isinstance(effective, dict):
        return None, None
    # Only compare the public schema keys represented by desired. This keeps
    # future boot-snapshot metadata from creating a false pending signal.
    normalized = {key: effective.get(key) for key in desired}
    return normalized, normalized != desired


def register_llm_provider(routes: web.RouteTableDef, bot) -> None:
    """LLM provider management (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # LLM provider management
    # ------------------------------------------------------------------

    @routes.get("/api/llm/status")
    async def llm_status(_request: web.Request) -> web.Response:
        provider_cfg = getattr(bot.config, "llm_provider", None)
        active = provider_cfg.active_provider if provider_cfg else "codex"

        codex_configured = bot.llm_gateway.codex_client is not None
        ollama_configured = bot.llm_gateway.ollama_client is not None

        ollama_cfg = getattr(bot.config, "ollama", None)
        kimi_cfg = getattr(bot.config, "kimi", None)
        kimi_has_key = bool(kimi_cfg and kimi_cfg.api_key)

        desired_pool = bot.config.openai_codex.connection_pool.model_dump()
        desired_compression = bot.config.openai_codex.context_compression.model_dump()
        effective_pool, pool_pending_restart = _boot_codex_group_status(
            bot, "connection_pool", desired_pool
        )
        effective_compression, compression_pending_restart = _boot_codex_group_status(
            bot, "context_compression", desired_compression
        )

        result = {
            "active_provider": active,
            "codex": {
                "configured": codex_configured,
                "enabled": bot.config.openai_codex.enabled,
                "model": bot.config.openai_codex.model,
                "reasoning_effort": bot.config.openai_codex.reasoning_effort,
                "active_reasoning_effort": getattr(
                    bot.llm_gateway.codex_client, "reasoning_effort", None
                ),
                # Configured agent policy (null = inherit) and what the next
                # agent iteration will actually use (override, else the live
                # client's own effort — mirrors the callback's resolution).
                # configured may be "auto" (per-spawn selection); effective_*
                # resolves "auto" (and null) to the inherited MAIN setting — it
                # must never surface the "auto" sentinel, which is never sent to
                # a provider.
                "agent_reasoning_effort": bot.config.openai_codex.agent_reasoning_effort,
                "effective_agent_reasoning_effort": (
                    bot.config.openai_codex.agent_reasoning_effort
                    if bot.config.openai_codex.agent_reasoning_effort not in (None, "auto")
                    else getattr(bot.llm_gateway.codex_client, "reasoning_effort", None)
                ),
                # Codex-scoped configuration status (agent_model ?? model) —
                # deliberately independent of whichever provider is active;
                # trajectory stamps carry the runtime truth per iteration.
                "agent_model": bot.config.openai_codex.agent_model,
                "effective_agent_model": (
                    bot.config.openai_codex.agent_model
                    if bot.config.openai_codex.agent_model not in (None, "auto")
                    else bot.config.openai_codex.model
                ),
                # Advanced transport/retry/pool/compression — the LLM page's
                # Advanced panel populates exclusively from this endpoint;
                # omitting these left it displaying schema defaults forever
                # regardless of config.yml truth.
                "request_timeout_seconds": bot.config.openai_codex.request_timeout_seconds,
                "stream_stall_timeout_seconds": (
                    bot.config.openai_codex.stream_stall_timeout_seconds
                ),
                "retry": {
                    "max_retries": bot.config.openai_codex.retry.max_retries,
                    "base_delay": bot.config.openai_codex.retry.base_delay,
                    "max_delay": bot.config.openai_codex.retry.max_delay,
                },
                "connection_pool": desired_pool,
                "effective_connection_pool": effective_pool,
                "connection_pool_pending_restart": pool_pending_restart,
                "context_compression": desired_compression,
                "effective_context_compression": effective_compression,
                "context_compression_pending_restart": compression_pending_restart,
                "context_budget_overrides": dict(bot.config.openai_codex.context_budget_overrides),
                "context_utilization": bot.config.openai_codex.context_utilization,
            },
            "ollama": {
                "configured": ollama_configured,
                "enabled": ollama_cfg.enabled if ollama_cfg else False,
                "model": ollama_cfg.model if ollama_cfg else "",
                "base_url": ollama_cfg.base_url if ollama_cfg else "",
                "max_tokens": ollama_cfg.max_tokens if ollama_cfg else 4096,
                "timeout": ollama_cfg.timeout if ollama_cfg else 300,
                "has_api_key": bool(ollama_cfg and ollama_cfg.api_key),
            },
            "kimi": {
                "configured": bot.llm_gateway.kimi_client is not None,
                "enabled": kimi_cfg.enabled if kimi_cfg else False,
                "model": kimi_cfg.model if kimi_cfg else "",
                "max_tokens": kimi_cfg.max_tokens if kimi_cfg else 4096,
                # Present for the same reason as ollama's: the Advanced panel
                # reads it here — saving worked while display showed the
                # default forever.
                "timeout": kimi_cfg.timeout if kimi_cfg else 300,
                "has_api_key": kimi_has_key,
            },
            "auxiliary": _auxiliary_status(bot),
        }

        client = bot.llm_gateway.active_client
        if client:
            result["active_model"] = getattr(client, "model", "unknown")
            result["active_provider_name"] = getattr(client, "provider_name", active)

        return web.json_response(result)

    @routes.post("/api/llm/switch")
    async def llm_switch(request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)

        provider = body.get("provider", "")
        if provider not in ("codex", "ollama", "kimi"):
            return web.json_response(
                {"error": "provider must be 'codex', 'ollama', or 'kimi'"}, status=400
            )

        # Mutation AND persistence happen under ONE provider_lock ownership:
        # switch_provider runs the SYNC persist on an executor future inside
        # its own lock (settled before the lock releases) and restores the
        # prior provider on persist failure — no interleaving window.
        async with config_transaction():
            result = await bot.llm_gateway.switch_provider(
                provider,
                persist=lambda: patch_config_paths(
                    [(("llm_provider", "active_provider"), provider)]
                ),
            )
        if "error" in result:
            reason = result["error"]
            status = 500 if "persist failed" in reason else 400
            return web.json_response(result, status=status)
        return web.json_response(result)


def _set_fields(obj, values: dict[str, object]) -> None:
    for key, value in values.items():
        setattr(obj, key, value)


def _provider_changes(
    section: str, desired: dict[str, object], body: dict
) -> list[tuple[tuple[str, ...], Any]]:
    return [((section, key), desired[key]) for key in desired if key in body]


async def _persist_or_response(changes: list, label: str) -> tuple[web.Response | None, bool]:
    """Persist desired leaves and return explicit error/cancel outcomes."""
    persist_exc, was_cancelled = await persist_config_paths_locked(changes)
    if persist_exc is not None:
        log.warning("%s config rejected — could not persist: %s", label, persist_exc)
        if was_cancelled:
            raise asyncio.CancelledError
        return (
            web.json_response({"error": f"{label} configuration not saved"}, status=500),
            False,
        )
    return None, was_cancelled


def _parse_codex_advanced(body: dict, cfg) -> tuple[list, list, bool] | web.Response:
    """Validate the Advanced-panel keys out of a codex PUT body.

    Returns ``(persist_changes, apply_ops, wants_reload)`` — persist tuples
    for the config writer, ``(cfg attribute, new value)`` ops for live config,
    and whether a live-appliable transport/retry key was present — or an error
    Response.

    Validation runs through the MERGED Pydantic models themselves, not a
    hand-mirrored copy of their rules: the first cut re-implemented bounds and
    got all four ways it can go wrong — int() truncated 1.9 to 1, bool()
    turned the string "false" into True, a list where a dict belonged was
    silently ignored with a 200, and an invented floor rejected values the
    schema accepts. Constructing the real model gives schema-exact coercion
    and rejection for free, forever.

    Nested groups are applied by REPLACING the whole sub-model object, never
    by mutating it in place: the boot-built context compressor holds the boot
    config's nested object by identity, so in-place mutation made compression
    thresholds live-before-rebind and stale-after — replacement makes
    persist-only deterministic.
    """
    from ...config.schema import (
        ConnectionPoolConfig,
        ContextCompressionConfig,
        RetryConfig,
    )

    integer_adapter = TypeAdapter(int)

    def _schema_int(value: Any, name: str, lo: int, hi: int) -> int:
        # Match Pydantic's lax integer coercion (for example "600" -> 600),
        # except JSON booleans stay forbidden at this HTTP boundary. Pydantic
        # accepts bool as int for compatibility, but an operator checkbox is
        # never a meaningful timeout.
        if isinstance(value, bool):
            raise ValueError(f"{name} must be an integer")
        try:
            parsed = integer_adapter.validate_python(value)
        except ValidationError as exc:
            raise ValueError(f"{name} must be an integer") from exc
        if not lo <= parsed <= hi:
            raise ValueError(f"{name} must be between {lo} and {hi}")
        return parsed

    persist: list[tuple[tuple[str, ...], Any]] = []
    ops: list[tuple[str, Any]] = []
    wants_reload = False
    try:
        if "request_timeout_seconds" in body:
            value = _schema_int(
                body["request_timeout_seconds"], "request_timeout_seconds", 60, 86400
            )
            persist.append((("openai_codex", "request_timeout_seconds"), value))
            ops.append(("request_timeout_seconds", value))
            wants_reload = True
        if "stream_stall_timeout_seconds" in body:
            value = _schema_int(
                body["stream_stall_timeout_seconds"],
                "stream_stall_timeout_seconds",
                10,
                3600,
            )
            persist.append((("openai_codex", "stream_stall_timeout_seconds"), value))
            ops.append(("stream_stall_timeout_seconds", value))
            wants_reload = True
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=400)

    groups = (
        ("retry", RetryConfig, True),
        ("connection_pool", ConnectionPoolConfig, False),
        ("context_compression", ContextCompressionConfig, False),
    )
    for group, model_cls, live in groups:
        if group not in body:
            continue
        submitted = body[group]
        if not isinstance(submitted, dict):
            # A list here used to be silently ignored with a 200.
            return web.json_response(
                {"error": f"{group} must be an object of settings"}, status=400
            )
        unknown = set(submitted) - set(model_cls.model_fields)
        if unknown:
            return web.json_response(
                {"error": f"unknown {group} field(s): {', '.join(sorted(unknown))}"},
                status=400,
            )
        current = getattr(cfg, group)
        try:
            merged = model_cls(**{**current.model_dump(), **submitted})
        except ValidationError as exc:
            first = exc.errors()[0]
            loc = ".".join(str(part) for part in first.get("loc", ()))
            return web.json_response(
                {"error": f"{group}.{loc}: {first.get('msg', 'invalid value')}"},
                status=400,
            )
        ops.append((group, merged))
        persist.extend((("openai_codex", group, key), getattr(merged, key)) for key in submitted)
        wants_reload = wants_reload or live
    try:
        candidate_payload = cfg.model_dump()
        if "context_budget_overrides" in body:
            candidate_payload["context_budget_overrides"] = body["context_budget_overrides"]
        if "context_utilization" in body:
            candidate_payload["context_utilization"] = body["context_utilization"]
        if "context_budget_overrides" in body or "context_utilization" in body:
            from ...config.schema import OpenAICodexConfig

            candidate = OpenAICodexConfig(**candidate_payload)
            for field in ("context_budget_overrides", "context_utilization"):
                if field not in body:
                    continue
                value = getattr(candidate, field)
                persist.append((("openai_codex", field), value))
                ops.append((field, value))
    except ValidationError as exc:
        first = exc.errors()[0]
        loc = ".".join(str(part) for part in first.get("loc", ()))
        return web.json_response(
            {"error": f"{loc}: {first.get('msg', 'invalid value')}"},
            status=400,
        )
    return persist, ops, wants_reload


def _apply_ops(cfg: Any, ops: list[tuple[str, Any]]) -> list[tuple[str, Any]]:
    """Apply ``(attribute, value)`` ops on cfg; return inverse ops.

    Nested groups arrive as whole model objects and REPLACE the previous
    object — the inverse holds the prior object by identity, so rollback
    restores exactly what boot-time captors still reference.
    """
    inverse: list[tuple[str, Any]] = []
    for attr, value in ops:
        inverse.append((attr, getattr(cfg, attr)))
        setattr(cfg, attr, value)
    return inverse


def register_provider_config(routes: web.RouteTableDef, bot) -> None:
    """Provider config update (enable/disable, set keys, endpoints) (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Provider config update (enable/disable, set keys, endpoints)
    # ------------------------------------------------------------------

    @routes.put("/api/llm/codex/config")
    async def llm_codex_config(request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)

        lock = getattr(getattr(bot, "llm_gateway", None), "provider_lock", None)
        if lock is None:
            return web.json_response({"error": "provider lock not available"}, status=503)

        try:
            # config_transaction() is the OUTER lock everywhere; a generic
            # /api/config save takes it too, so the two paths can no longer
            # interleave between reading bot.config and rebinding it.
            async with config_transaction(), lock:
                cfg = bot.config.openai_codex
                # Validate BEFORE any mutation — Literal does not validate
                # direct assignment, and a rejected request must leave config,
                # persisted YAML, and the live client untouched.
                effort = body.get("reasoning_effort")
                if effort is not None and str(effort) not in CODEX_REASONING_EFFORTS:
                    return web.json_response(
                        {
                            "error": f"invalid reasoning_effort: {effort!r}",
                            "allowed": sorted(CODEX_REASONING_EFFORTS),
                        },
                        status=400,
                    )
                # agent_reasoning_effort: JSON null (and "") mean INHERIT, so
                # presence must be checked by key — .get() cannot distinguish
                # "missing" from "explicitly null".
                agent_effort_present = "agent_reasoning_effort" in body
                agent_effort = body.get("agent_reasoning_effort")
                if agent_effort in ("", None):
                    agent_effort = None
                elif (
                    str(agent_effort) not in CODEX_REASONING_EFFORTS
                    and str(agent_effort) != AGENT_SETTING_AUTO
                ):
                    # "auto" is a valid agent-axis value (per-spawn selection);
                    # it is NOT a real effort and is never sent to a provider.
                    return web.json_response(
                        {
                            "error": f"invalid agent_reasoning_effort: {agent_effort!r}",
                            "allowed": [*sorted(CODEX_REASONING_EFFORTS), AGENT_SETTING_AUTO, None],
                        },
                        status=400,
                    )
                # agent_model: same inherit contract (null/""/whitespace);
                # free string like model — the dropdown is the UI constraint.
                agent_model_present = "agent_model" in body
                agent_model = body.get("agent_model")
                if agent_model is not None:
                    agent_model = str(agent_model).strip() or None
                # Merged desired state (PUT boundary): partial bodies mean an
                # incompatible pair must be caught on the RESULT of the update
                # — changing only model to gpt-5.5 under a persisted "max" is
                # as invalid as changing only the effort. Checked before any
                # mutation, in either update direction, on both axes.
                desired_model = (
                    str(body["model"]) if ("model" in body and body["model"]) else cfg.model
                )
                desired_effort = str(effort) if effort is not None else cfg.reasoning_effort
                pair_err = effort_incompatibility_error(desired_model, desired_effort)
                if pair_err:
                    return web.json_response(
                        {
                            "error": pair_err,
                            "allowed": sorted(allowed_efforts_for_model(desired_model)),
                        },
                        status=400,
                    )
                desired_agent_model = agent_model if agent_model_present else cfg.agent_model
                desired_agent_effort = (
                    (None if agent_effort is None else str(agent_effort))
                    if agent_effort_present
                    else cfg.agent_reasoning_effort
                )
                # "auto" on either agent axis defers to the spawn-time and
                # request-construction boundaries; concrete axes resolve here
                # (None inherits the main setting being saved).
                if AGENT_SETTING_AUTO not in (desired_agent_model, desired_agent_effort):
                    eff_model = desired_agent_model if desired_agent_model else desired_model
                    eff_effort = desired_agent_effort if desired_agent_effort else desired_effort
                    pair_err = effort_incompatibility_error(eff_model, eff_effort)
                    if pair_err:
                        return web.json_response(
                            {
                                "error": f"agent settings: {pair_err}",
                                "allowed": sorted(allowed_efforts_for_model(eff_model)),
                            },
                            status=400,
                        )
                desired = {
                    "enabled": bool(body["enabled"]) if "enabled" in body else cfg.enabled,
                    "model": str(body["model"]) if body.get("model") else cfg.model,
                    "reasoning_effort": (
                        str(effort) if effort is not None else cfg.reasoning_effort
                    ),
                    "agent_reasoning_effort": (
                        (None if agent_effort is None else str(agent_effort))
                        if agent_effort_present
                        else cfg.agent_reasoning_effort
                    ),
                    "agent_model": agent_model if agent_model_present else cfg.agent_model,
                }
                advanced = _parse_codex_advanced(body, cfg)
                if isinstance(advanced, web.Response):
                    return advanced
                adv_persist, adv_ops, adv_reload = advanced
                changes = _provider_changes("openai_codex", desired, body)
                changes = changes + adv_persist
                persist_response, was_cancelled = await _persist_or_response(changes, "Codex")
                if persist_response is not None:
                    return persist_response
                if changes:
                    prior = {key: getattr(cfg, key) for key in desired}
                    _set_fields(cfg, desired)
                    # Advanced transport/retry apply live through the same
                    # reload the primary knobs use; pool and compression
                    # persist only and surface as pending-restart. The old
                    # handler dropped all of these silently and returned 200.
                    adv_inverse = _apply_ops(cfg, adv_ops)
                    needs_reload = adv_reload or any(
                        key in body for key in ("enabled", "model", "reasoning_effort")
                    )
                    try:
                        if needs_reload:
                            await bot.llm_gateway.reload_codex_inner()
                    except BaseException:
                        _set_fields(cfg, prior)
                        _apply_ops(cfg, adv_inverse)  # restore prior objects
                        adv_prior_persist: list[tuple[tuple[str, ...], Any]] = []
                        for attr, prior_value in adv_inverse:
                            if hasattr(prior_value, "model_dump"):
                                adv_prior_persist.extend(
                                    (("openai_codex", attr, key), val)
                                    for key, val in prior_value.model_dump().items()
                                )
                            else:
                                adv_prior_persist.append((("openai_codex", attr), prior_value))
                        prior_persist: list[tuple[tuple[str, ...], Any]] = [
                            (("openai_codex", key), value)
                            for key, value in prior.items()
                            if key in body
                        ]
                        rollback_exc, rollback_cancelled = await persist_config_paths_locked(
                            prior_persist + adv_prior_persist
                        )
                        if rollback_exc is not None:
                            log.critical(
                                "Codex apply failed and persistence rollback failed: %s",
                                rollback_exc,
                            )
                            _set_fields(cfg, desired)
                            # Disk kept the DESIRED nested values (their
                            # rollback failed too) — runtime must republish
                            # them as well, or transport/retry/pool split
                            # between disk and process.
                            _apply_ops(cfg, adv_ops)
                            if needs_reload:
                                await bot.llm_gateway.reload_codex_inner()
                        elif needs_reload:
                            await bot.llm_gateway.reload_codex_inner()
                        if was_cancelled or rollback_cancelled:
                            raise asyncio.CancelledError
                        raise
                    catalog_changed = any(
                        key in body
                        for key in (
                            "model",
                            "reasoning_effort",
                            "agent_reasoning_effort",
                            "agent_model",
                        )
                    )
                    if catalog_changed and getattr(bot, "tool_catalog", None):
                        bot.tool_catalog.invalidate()
                if was_cancelled:
                    raise asyncio.CancelledError

        except ValueError as e:
            return web.json_response({"error": str(e)}, status=400)
        except Exception as e:
            log.warning("Codex configuration apply failed: %s", e)
            return web.json_response({"error": "Codex configuration not applied"}, status=500)

        return web.json_response(
            {
                "status": "updated",
                "enabled": cfg.enabled,
                "model": cfg.model,
                "reasoning_effort": cfg.reasoning_effort,
                "agent_reasoning_effort": cfg.agent_reasoning_effort,
                "agent_model": cfg.agent_model,
                "configured": bot.llm_gateway.codex_client is not None,
            }
        )

    @routes.put("/api/llm/auxiliary/config")
    async def llm_auxiliary_config(request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)

        # Prepare under the global config transaction, then release it for
        # candidate construction and the live model probe. reload_auxiliary()
        # reacquires config_transaction() OUTER and provider_lock inner for a
        # CAS-checked swap + persistence transaction.
        try:
            async with config_transaction():
                aux_cfg = getattr(bot.config.openai_codex, "auxiliary", None)
                if aux_cfg is None:
                    return web.json_response({"error": "auxiliary config unavailable"}, status=503)

                want_enabled = bool(body["enabled"]) if "enabled" in body else aux_cfg.enabled
                want_model = aux_cfg.model
                if "model" in body and str(body["model"]).strip():
                    want_model = str(body["model"]).strip()
                desired = {"enabled": want_enabled, "model": want_model}
                plan = bot.llm_gateway.prepare_auxiliary_reload(desired)

            result = await bot.llm_gateway.reload_auxiliary(
                plan=plan,
                persist=lambda: patch_config_paths(
                    [
                        (("openai_codex", "auxiliary", "enabled"), desired["enabled"]),
                        (("openai_codex", "auxiliary", "model"), desired["model"]),
                    ]
                ),
            )
        except Exception as e:
            log.exception("Auxiliary reload raised")
            return web.json_response({"error": f"reload failed: {e}"}, status=500)
        if not result.get("committed"):
            reason = result.get("reason", "auxiliary reload not committed")
            if "concurrent" in reason:
                status = 409
            elif "persist failed" in reason:
                status = 500
            else:
                status = 400
            return web.json_response({"error": reason}, status=status)
        return web.json_response({"status": "updated", **_auxiliary_status(bot)})

    @routes.put("/api/llm/ollama/config")
    async def llm_ollama_config(request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)

        lock = getattr(getattr(bot, "llm_gateway", None), "provider_lock", None)
        if lock is None:
            return web.json_response({"error": "provider lock not available"}, status=503)

        try:
            # config_transaction() is the OUTER lock everywhere; a generic
            # /api/config save takes it too, so the two paths can no longer
            # interleave between reading bot.config and rebinding it.
            async with config_transaction(), lock:
                cfg = bot.config.ollama
                desired = {
                    "enabled": bool(body["enabled"]) if "enabled" in body else cfg.enabled,
                    "base_url": (
                        _validate_ollama_url(str(body["base_url"]))
                        if body.get("base_url")
                        else cfg.base_url
                    ),
                    "model": str(body["model"]) if body.get("model") else cfg.model,
                    "max_tokens": (
                        _parse_int(body["max_tokens"], "max_tokens", 1, 128000)
                        if "max_tokens" in body
                        else cfg.max_tokens
                    ),
                    "api_key": str(body["api_key"]) if "api_key" in body else cfg.api_key,
                    "timeout": (
                        _parse_int(body["timeout"], "timeout", 10, 3600)
                        if "timeout" in body
                        else cfg.timeout
                    ),
                }
                changes = _provider_changes("ollama", desired, body)
                persist_response, was_cancelled = await _persist_or_response(changes, "Ollama")
                if persist_response is not None:
                    return persist_response
                if changes:
                    prior = {key: getattr(cfg, key) for key in desired}
                    prior_client = bot.llm_gateway.ollama_client
                    _set_fields(cfg, desired)
                    try:
                        await bot.llm_gateway.reload_ollama_inner()
                    except BaseException:
                        _set_fields(cfg, prior)
                        bot.llm_gateway.ollama_client = prior_client
                        rollback_exc, rollback_cancelled = await persist_config_paths_locked(
                            [
                                (("ollama", key), value)
                                for key, value in prior.items()
                                if key in body
                            ]
                        )
                        if rollback_exc is not None:
                            log.critical(
                                "Ollama apply failed and persistence rollback failed: %s",
                                rollback_exc,
                            )
                            _set_fields(cfg, desired)
                            await bot.llm_gateway.reload_ollama_inner()
                        if was_cancelled or rollback_cancelled:
                            raise asyncio.CancelledError
                        raise
                if was_cancelled:
                    raise asyncio.CancelledError

        except ValueError as e:
            return web.json_response({"error": str(e)}, status=400)
        except Exception as e:
            log.warning("Ollama configuration apply failed: %s", e)
            return web.json_response({"error": "Ollama configuration not applied"}, status=500)

        return web.json_response(
            {
                "status": "updated",
                "enabled": cfg.enabled,
                "model": cfg.model,
                "base_url": cfg.base_url,
                "configured": bot.llm_gateway.ollama_client is not None,
            }
        )

    @routes.put("/api/llm/kimi/config")
    async def llm_kimi_config(request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)

        lock = getattr(getattr(bot, "llm_gateway", None), "provider_lock", None)
        if lock is None:
            return web.json_response({"error": "provider lock not available"}, status=503)

        try:
            # config_transaction() is the OUTER lock everywhere; a generic
            # /api/config save takes it too, so the two paths can no longer
            # interleave between reading bot.config and rebinding it.
            async with config_transaction(), lock:
                cfg = bot.config.kimi
                desired = {
                    "enabled": bool(body["enabled"]) if "enabled" in body else cfg.enabled,
                    "api_key": str(body["api_key"]) if "api_key" in body else cfg.api_key,
                    "model": str(body["model"]) if body.get("model") else cfg.model,
                    "max_tokens": (
                        _parse_int(body["max_tokens"], "max_tokens", 1, 262000)
                        if "max_tokens" in body
                        else cfg.max_tokens
                    ),
                    "timeout": (
                        _parse_int(body["timeout"], "timeout", 10, 3600)
                        if "timeout" in body
                        else cfg.timeout
                    ),
                }
                changes = _provider_changes("kimi", desired, body)
                persist_response, was_cancelled = await _persist_or_response(changes, "Kimi")
                if persist_response is not None:
                    return persist_response
                if changes:
                    prior = {key: getattr(cfg, key) for key in desired}
                    prior_client = bot.llm_gateway.kimi_client
                    _set_fields(cfg, desired)
                    try:
                        await bot.llm_gateway.reload_kimi_inner()
                    except BaseException:
                        _set_fields(cfg, prior)
                        bot.llm_gateway.kimi_client = prior_client
                        rollback_exc, rollback_cancelled = await persist_config_paths_locked(
                            [(("kimi", key), value) for key, value in prior.items() if key in body]
                        )
                        if rollback_exc is not None:
                            log.critical(
                                "Kimi apply failed and persistence rollback failed: %s",
                                rollback_exc,
                            )
                            _set_fields(cfg, desired)
                            await bot.llm_gateway.reload_kimi_inner()
                        if was_cancelled or rollback_cancelled:
                            raise asyncio.CancelledError
                        raise
                if was_cancelled:
                    raise asyncio.CancelledError

        except ValueError as e:
            return web.json_response({"error": str(e)}, status=400)
        except Exception as e:
            log.warning("Kimi configuration apply failed: %s", e)
            return web.json_response({"error": "Kimi configuration not applied"}, status=500)

        return web.json_response(
            {
                "status": "updated",
                "enabled": cfg.enabled,
                "model": cfg.model,
                "configured": bot.llm_gateway.kimi_client is not None,
            }
        )


def register_context_windows(routes: web.RouteTableDef, bot) -> None:
    """Per-model context-budget view + clamp management (campaign phase 5).

    The GET serves canonical model keys with the built-in floor, configured
    override, CONFIGURED resolution (no clamp) and EFFECTIVE resolution
    (observer clamp applied) side by side, provenance for both, and the raw
    per-account evidence (opaque account keys only). The POST clears clamps
    for one account (optionally one model) — the manual, account-scoped
    escape hatch; TTL expiry is otherwise the only way a clamp dies.
    """

    def _observer():
        return getattr(getattr(bot, "services", None), "window_observer", None)

    def _resolution(snapshot) -> dict:
        return {
            "base_budget": snapshot.base_budget,
            "base_source": snapshot.base_source,
            "effective_budget": snapshot.effective_budget,
            "clamp_applied": snapshot.clamp_applied,
            "working_budget": snapshot.working_budget,
            "primary_chars": snapshot.primary_chars,
            "ceiling_applied": snapshot.ceiling_applied,
            "ladder": list(snapshot.ladder),
        }

    @routes.get("/api/context/windows")
    async def get_context_windows(_request: web.Request) -> web.Response:
        from ...config.schema import (
            CODEX_MODEL_INPUT_BUDGETS,
            canonical_codex_model,
        )
        from ...llm.context_budget import resolve_context_budget

        observer = _observer()
        codex_cfg = getattr(bot.config, "openai_codex", None)
        overrides = {
            canonical_codex_model(k): v
            for k, v in (getattr(codex_cfg, "context_budget_overrides", None) or {}).items()
        }
        utilization = getattr(codex_cfg, "context_utilization", 60)
        cc = getattr(codex_cfg, "context_compression", None)
        configured_ceiling = (
            getattr(cc, "max_context_chars", None) if cc is not None else None
        )
        desired_compression = cc.model_dump() if cc is not None else {}
        effective_compression, ceiling_pending_restart = _boot_codex_group_status(
            bot, "context_compression", desired_compression
        )
        # The runtime compressor is boot-frozen. Prefer the shared boot snapshot
        # used by /api/llm/status; a narrow embedding without it reports runtime
        # truth directly from the compressor rather than pretending the saved
        # restart-bound value is effective.
        if effective_compression is not None:
            # Disabled-at-boot means the runtime has no compressor and generation
            # applies no explicit ceiling. The saved scalar remains configuration,
            # not runtime policy, until compression is enabled by a restart.
            runtime_ceiling = (
                effective_compression.get("max_context_chars")
                if effective_compression.get("enabled")
                else None
            )
        else:
            compressor = getattr(bot, "context_compressor", None)
            # Production stores the boot-frozen ContextCompressionConfig object
            # directly; a few embedders wrap it as ``.config``.
            runtime_cfg = getattr(compressor, "config", compressor)
            runtime_available = runtime_cfg is not None and hasattr(
                runtime_cfg, "max_context_chars"
            )
            # With no boot snapshot and no runtime compressor, the only safe
            # runtime ceiling is none: generation applies the model-derived
            # target. Restart-pending provenance remains unknown rather than
            # guessing from a mutable saved config object.
            runtime_ceiling = (
                getattr(runtime_cfg, "max_context_chars", None)
                if runtime_available
                else None
            )
            ceiling_pending_restart = (
                runtime_ceiling != configured_ceiling if runtime_available else None
            )
        evidence: dict = observer.view() if observer is not None else {"version": 1, "accounts": {}}
        # Resolve eligibility once for one internally-consistent management
        # snapshot.  Re-reading a changing pool provider per model could pair a
        # clamp from one account set with expiry rows from another.
        clamp_rows = observer.account_clamps() if observer is not None else []
        active_clamp_rows: dict[str, dict] = {}
        for row in clamp_rows:
            prior = active_clamp_rows.get(row["model"])
            if (
                prior is None
                or row["value"] < prior["value"]
                or (row["value"] == prior["value"] and row["expires_at"] > prior["expires_at"])
            ):
                active_clamp_rows[row["model"]] = row
        models = set(CODEX_MODEL_INPUT_BUDGETS) | set(overrides)
        for account in evidence.get("accounts", {}).values():
            models |= set(account.get("models", {}))
        out = {}
        for model in sorted(models):
            active_row = active_clamp_rows.get(model)
            clamp = active_row["value"] if active_row is not None else None
            configured = resolve_context_budget(
                model,
                overrides=overrides,
                utilization=utilization,
                max_context_chars=configured_ceiling,
            )
            effective = resolve_context_budget(
                model,
                overrides=overrides,
                utilization=utilization,
                max_context_chars=runtime_ceiling,
                observed_clamp=clamp,
            )
            out[model] = {
                "floor": CODEX_MODEL_INPUT_BUDGETS.get(model),
                "override": overrides.get(model),
                "active_clamp": clamp,
                "provenance": (
                    "temporary learned clamp"
                    if effective.clamp_applied
                    else "override"
                    if configured.base_source == "override"
                    else "built-in"
                ),
                "configured": _resolution(configured),
                "effective": _resolution(effective),
                "clamp_expires_at": (
                    active_row["expires_at"]
                    if effective.clamp_applied and active_row is not None
                    else None
                ),
            }
        return web.json_response(
            {
                "utilization": utilization,
                "max_context_chars": configured_ceiling,
                "runtime_max_context_chars": runtime_ceiling,
                "max_context_chars_pending_restart": ceiling_pending_restart,
                "models": out,
                "clamps": clamp_rows,
                "evidence": evidence,
            }
        )

    @routes.post("/api/context/windows/clear")
    async def clear_context_window_clamp(request: web.Request) -> web.Response:
        observer = _observer()
        if observer is None:
            return web.json_response({"error": "window observer not available"}, status=503)
        try:
            data = await request.json()
        except Exception:
            data = {}
        if not isinstance(data, dict):
            return web.json_response({"error": "JSON body must be an object"}, status=400)
        account_key = data.get("account_key")
        if not isinstance(account_key, str) or not account_key.strip():
            return web.json_response({"error": "account_key is required"}, status=400)
        model = data.get("model")
        try:
            cleared = await observer.clear_account(
                account_key.strip(),
                model=str(model).strip() if isinstance(model, str) and model.strip() else None,
            )
        except WindowObserverMutationError:
            return web.json_response(
                {"error": "context-window clear could not be persisted"}, status=503
            )
        return web.json_response({"cleared": cleared})


def register_ollama_admin(routes: web.RouteTableDef, bot) -> None:
    """Ollama provider management (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Ollama provider management
    # ------------------------------------------------------------------

    @routes.get("/api/ollama/status")
    async def ollama_status(_request: web.Request) -> web.Response:
        client = getattr(getattr(bot, "llm_gateway", None), "ollama_client", None)
        if client is None:
            return web.json_response({"configured": False, "enabled": False})

        health = await client.health_check()
        return web.json_response(
            {
                "configured": True,
                "enabled": True,
                "model": client.model,
                "base_url": client.base_url,
                "health": health,
                "stats": client.pool_stats(),
            }
        )

    @routes.post("/api/ollama/reload")
    async def ollama_reload(_request: web.Request) -> web.Response:
        result = await bot.llm_gateway.reload_ollama()
        status = 200 if result.get("configured") else 503
        return web.json_response(result, status=status)

    @routes.post("/api/ollama/probe-models")
    async def ollama_probe_models(request: web.Request) -> web.Response:
        """Fetch models from an arbitrary Ollama base_url — works even when client is disabled."""
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)

        base_url = (body.get("base_url") or "").rstrip("/")
        try:
            base_url = _validate_ollama_url(base_url)
        except ValueError as e:
            return web.json_response({"error": str(e)}, status=400)
        if not base_url.startswith(("http://", "https://")):
            return web.json_response(
                {"error": "base_url must start with http:// or https://"}, status=400
            )
        try:
            import aiohttp as _aio

            async with _aio.ClientSession(timeout=_aio.ClientTimeout(total=10)) as sess:
                async with sess.get(f"{base_url}/api/tags") as resp:
                    if resp.status != 200:
                        return web.json_response({"error": f"HTTP {resp.status}"}, status=502)
                    data = await resp.json()
                    return web.json_response({"models": data.get("models", [])})
        except Exception as e:
            return web.json_response({"error": str(e)}, status=502)

    @routes.get("/api/ollama/models")
    async def ollama_models(_request: web.Request) -> web.Response:
        client = getattr(getattr(bot, "llm_gateway", None), "ollama_client", None)
        if client is None:
            return web.json_response({"error": "Ollama not configured"}, status=503)

        try:
            import aiohttp as _aiohttp

            session = await client._get_session()
            async with session.get(
                f"{client.base_url}/api/tags",
                headers=client._headers(),
                timeout=_aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status != 200:
                    return web.json_response({"error": f"HTTP {resp.status}"}, status=502)
                data = await resp.json()
                return web.json_response(
                    {
                        "models": data.get("models", []),
                        "active_model": client.model,
                    }
                )
        except Exception as e:
            return web.json_response({"error": str(e)}, status=502)

    @routes.post("/api/ollama/model")
    async def ollama_set_model(request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)

        model = body.get("model", "").strip()
        if not model:
            return web.json_response({"error": "model is required"}, status=400)

        lock = getattr(getattr(bot, "llm_gateway", None), "provider_lock", None)
        if lock is None:
            return web.json_response({"error": "provider lock not available"}, status=503)

        # config_transaction() is the OUTER lock everywhere (see the config
        # routes) so a generic /api/config save cannot interleave with this one.
        async with config_transaction(), lock:
            client = getattr(getattr(bot, "llm_gateway", None), "ollama_client", None)
            if client is None:
                return web.json_response({"error": "Ollama not configured"}, status=503)

            health = await client.health_check()
            available = health.get("models", [])
            if available and model not in available:
                base = model.split(":")[0]
                if not any(m.startswith(base + ":") for m in available):
                    return web.json_response(
                        {
                            "error": (
                                f"Model '{model}' not available. "
                                f"Pulled models: {', '.join(available[:10])}"
                            ),
                        },
                        status=400,
                    )

            persist_exc, was_cancelled = await persist_config_paths_locked(
                [(("ollama", "model"), model)]
            )
            if persist_exc is not None:
                if was_cancelled:
                    raise asyncio.CancelledError
                return web.json_response({"error": "Ollama model not saved"}, status=500)
            client.model = model
            bot.config.ollama.model = model
            if was_cancelled:
                raise asyncio.CancelledError
        return web.json_response({"status": "updated", "model": model})


def register_kimi_admin(routes: web.RouteTableDef, bot) -> None:
    """Kimi provider management (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Kimi provider management
    # ------------------------------------------------------------------

    @routes.get("/api/kimi/status")
    async def kimi_status(_request: web.Request) -> web.Response:
        client = getattr(getattr(bot, "llm_gateway", None), "kimi_client", None)
        if client is None:
            return web.json_response({"configured": False, "enabled": False})

        health = await client.health_check()
        return web.json_response(
            {
                "configured": True,
                "enabled": True,
                "model": client.model,
                "base_url": client.base_url,
                "health": health,
                "stats": client.pool_stats(),
            }
        )

    @routes.post("/api/kimi/reload")
    async def kimi_reload(_request: web.Request) -> web.Response:
        result = await bot.llm_gateway.reload_kimi()
        status = 200 if result.get("configured") else 503
        return web.json_response(result, status=status)

    @routes.get("/api/kimi/models")
    async def kimi_models(_request: web.Request) -> web.Response:
        client = getattr(getattr(bot, "llm_gateway", None), "kimi_client", None)
        if client is None:
            return web.json_response({"error": "Kimi not configured"}, status=503)

        health = await client.health_check()
        if not health.get("healthy"):
            return web.json_response({"error": health.get("error", "unhealthy")}, status=502)
        return web.json_response(
            {
                "models": health.get("models", []),
                "active_model": client.model,
            }
        )

    @routes.post("/api/kimi/model")
    async def kimi_set_model(request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)

        model = body.get("model", "").strip()
        if not model:
            return web.json_response({"error": "model is required"}, status=400)

        lock = getattr(getattr(bot, "llm_gateway", None), "provider_lock", None)
        if lock is None:
            return web.json_response({"error": "provider lock not available"}, status=503)

        # config_transaction() is the OUTER lock everywhere (see the config
        # routes) so a generic /api/config save cannot interleave with this one.
        async with config_transaction(), lock:
            client = getattr(getattr(bot, "llm_gateway", None), "kimi_client", None)
            if client is None:
                return web.json_response({"error": "Kimi not configured"}, status=503)

            health = await client.health_check()
            available = health.get("models", [])
            if available and model not in available:
                return web.json_response(
                    {
                        "error": (
                            f"Model '{model}' not available. Models: {', '.join(available[:10])}"
                        ),
                    },
                    status=400,
                )

            persist_exc, was_cancelled = await persist_config_paths_locked(
                [(("kimi", "model"), model)]
            )
            if persist_exc is not None:
                if was_cancelled:
                    raise asyncio.CancelledError
                return web.json_response({"error": "Kimi model not saved"}, status=500)
            client.model = model
            bot.config.kimi.model = model
            if was_cancelled:
                raise asyncio.CancelledError
        return web.json_response({"status": "updated", "model": model})
