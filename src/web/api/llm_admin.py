"""LLM provider administration route registrars (RFC-003 P2 — carved verbatim from api/__init__).

Each ``register_*`` moves one section of the old monolith unchanged; the
composition root calls them at the sections' original positions, so the
route REGISTRATION ORDER (aiohttp path precedence) is exactly what the
parity contract pins.
"""

from __future__ import annotations

import asyncio
import contextlib
import ipaddress as _ipaddress
import tempfile
import urllib.parse as _urlparse

from aiohttp import web

from ...config.schema import CODEX_REASONING_EFFORTS, active_config_path
from ...odin_log import get_logger

log = get_logger("web.api")

_ALLOWED_OLLAMA_HOSTS = frozenset({
    "localhost", "127.0.0.1", "::1", "0.0.0.0",
})

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

_ui_set_secrets: set[str] = set()

def _safe_secret(key, existing_val, memory_val):
    """Preserve env-var placeholders unless explicitly set via UI this session."""
    if key in _ui_set_secrets:
        return memory_val
    if isinstance(existing_val, str) and "${" in existing_val:
        return existing_val
    return memory_val

class PersistError(RuntimeError):
    """The persistence target could not be read, parsed, or written. Raised
    (not silently swallowed) so a mutation endpoint fails loudly and triggers
    rollback instead of reporting a phantom success."""


def _persist_llm_sections_sync(bot) -> None:
    """Merge only LLM-related sections into config.yml using round-trip YAML.

    Preserves comments, ordering, style, env-var placeholders, and the file's
    permission mode. Raises ``PersistError`` when the target is missing,
    empty, malformed, or unreadable — for a mutation endpoint that MUST be a
    failure, not a silent no-op that lets the route claim it persisted.
    """
    import os

    # Persist the file the live config was LOADED from — never a CWD-relative
    # "config.yml". A fabricated Config (a test double or one-off script that
    # never called load_config) has no active path, so persistence refuses
    # rather than clobbering whatever config.yml happens to sit in the CWD.
    config_path = active_config_path()
    if config_path is None:
        raise PersistError("refusing to persist a config not loaded from disk")
    if not config_path.exists():
        raise PersistError("config.yml does not exist")
    from ruamel.yaml import YAML

    ry = YAML()
    ry.preserve_quotes = True
    try:
        with open(config_path) as f:
            existing = ry.load(f)
    except Exception as exc:
        # GENERIC client message — ruamel parse errors (esp. duplicate-key)
        # echo the conflicting VALUES, which in this file are secrets. The raw
        # detail goes to logs only, never into the raised message / HTTP body.
        log.warning("config.yml parse failed: %s", type(exc).__name__)
        raise PersistError("config.yml unreadable or malformed") from None
    if existing is None:
        raise PersistError("config.yml is empty")
    orig_mode = os.stat(config_path).st_mode & 0o777

    if "openai_codex" not in existing:
        existing["openai_codex"] = {}
    existing["openai_codex"]["enabled"] = bot.config.openai_codex.enabled
    existing["openai_codex"]["model"] = bot.config.openai_codex.model
    existing["openai_codex"]["max_tokens"] = bot.config.openai_codex.max_tokens
    existing["openai_codex"]["reasoning_effort"] = bot.config.openai_codex.reasoning_effort
    existing["openai_codex"]["agent_reasoning_effort"] = (
        bot.config.openai_codex.agent_reasoning_effort
    )
    existing["openai_codex"]["agent_model"] = bot.config.openai_codex.agent_model

    # Auxiliary: only enabled + model are configurable (auth and token limit
    # are shared with the main Codex client, never overwritten by this surface).
    aux_cfg = getattr(bot.config.openai_codex, "auxiliary", None)
    if aux_cfg is not None:
        if "auxiliary" not in existing["openai_codex"]:
            existing["openai_codex"]["auxiliary"] = {}
        existing["openai_codex"]["auxiliary"]["enabled"] = aux_cfg.enabled
        existing["openai_codex"]["auxiliary"]["model"] = aux_cfg.model

    if "ollama" not in existing:
        existing["ollama"] = {}
    existing["ollama"]["enabled"] = bot.config.ollama.enabled
    existing["ollama"]["base_url"] = bot.config.ollama.base_url
    existing["ollama"]["model"] = bot.config.ollama.model
    existing["ollama"]["max_tokens"] = bot.config.ollama.max_tokens
    existing["ollama"]["timeout"] = bot.config.ollama.timeout
    ex_ollama_key = existing["ollama"].get("api_key", "")
    existing["ollama"]["api_key"] = _safe_secret(
        "ollama.api_key", ex_ollama_key, bot.config.ollama.api_key
    )

    if "kimi" not in existing:
        existing["kimi"] = {}
    existing["kimi"]["enabled"] = bot.config.kimi.enabled
    existing["kimi"]["model"] = bot.config.kimi.model
    existing["kimi"]["max_tokens"] = bot.config.kimi.max_tokens
    existing["kimi"]["timeout"] = bot.config.kimi.timeout
    ex_kimi_key = existing["kimi"].get("api_key", "")
    existing["kimi"]["api_key"] = _safe_secret("kimi.api_key", ex_kimi_key, bot.config.kimi.api_key)

    if "llm_provider" not in existing:
        existing["llm_provider"] = {}
    existing["llm_provider"]["active_provider"] = bot.config.llm_provider.active_provider

    # Atomic replace: write a temp file in the same dir, restore the ORIGINAL
    # mode (mkstemp creates 0600 — os.replace would otherwise silently chmod
    # the live 0664 config), fsync the file, os.replace, then fsync the dir so
    # the rename is durable.
    import io

    buf = io.StringIO()
    ry.dump(existing, buf)
    parent = str(config_path.parent or ".")
    fd, tmp = tempfile.mkstemp(dir=parent, suffix=".yml.tmp")
    try:
        with os.fdopen(fd, "w") as f:
            f.write(buf.getvalue())
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, orig_mode)
        os.replace(tmp, config_path)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(tmp)
        raise
    # os.replace is THE atomic commit point — the new config is now on disk.
    # The directory fsync is a durability nicety ONLY; its failure must NOT
    # raise (that would make the caller "roll back" runtime while disk already
    # holds the new state, splitting disk vs runtime).
    with contextlib.suppress(OSError):
        dir_fd = os.open(parent, os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)

async def _persist_config(bot) -> None:
    """LEGACY fail-soft persist for the sibling provider routes (Codex/Ollama/
    Kimi config + model-set) and provider switch.

    Settle-safe: the filesystem worker runs on an executor future via the
    gateway and settles BEFORE the caller's provider_lock releases, so a
    cancelled writer can't continue and clobber a later commit (the master
    stale-write race is fixed). ``PersistError`` (missing/empty/malformed
    config.yml) is swallowed + logged generically, matching master's silent
    no-op; a genuine write failure propagates (master-equivalent 500).
    ``CancelledError`` is NEVER swallowed — re-raised after the worker settles.

    DEFERRED DEBT: these sibling routes are intentionally NOT transactional
    here (no config/client-generation rollback, no exact snapshot) — a
    follow-up PR owns that. Only the AUXILIARY route is strict + transactional
    (see reload_auxiliary). See the PR body's 'Deferred' section.
    """
    exc, was_cancelled = await bot.llm_gateway.run_persist_settled(
        lambda: _persist_llm_sections_sync(bot))
    if isinstance(exc, PersistError):
        log.warning("config.yml persist skipped (legacy fail-soft): %s", exc)
        exc = None
    if was_cancelled:
        raise asyncio.CancelledError
    if exc is not None:
        raise exc


def register_connection_pools(routes: web.RouteTableDef, bot) -> None:
    """Connection pool status (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Connection pool status
    # ------------------------------------------------------------------

    @routes.get("/api/pools/ssh")
    async def get_ssh_pool(_request: web.Request) -> web.Response:
        executor = getattr(bot, "executor", None)
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
        executor = getattr(bot, "executor", None)
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

        result = {
            "active_provider": active,
            "codex": {
                "configured": codex_configured,
                "enabled": bot.config.openai_codex.enabled,
                "model": bot.config.openai_codex.model,
                "max_tokens": bot.config.openai_codex.max_tokens,
                "reasoning_effort": bot.config.openai_codex.reasoning_effort,
                "active_reasoning_effort": getattr(
                    bot.llm_gateway.codex_client, "reasoning_effort", None
                ),
                # Configured agent policy (null = inherit) and what the next
                # agent iteration will actually use (override, else the live
                # client's own effort — mirrors the callback's resolution).
                "agent_reasoning_effort": bot.config.openai_codex.agent_reasoning_effort,
                "effective_agent_reasoning_effort": (
                    bot.config.openai_codex.agent_reasoning_effort
                    if bot.config.openai_codex.agent_reasoning_effort is not None
                    else getattr(bot.llm_gateway.codex_client, "reasoning_effort", None)
                ),
                # Codex-scoped configuration status (agent_model ?? model) —
                # deliberately independent of whichever provider is active;
                # trajectory stamps carry the runtime truth per iteration.
                "agent_model": bot.config.openai_codex.agent_model,
                "effective_agent_model": (
                    bot.config.openai_codex.agent_model
                    if bot.config.openai_codex.agent_model is not None
                    else bot.config.openai_codex.model
                ),
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
        result = await bot.llm_gateway.switch_provider(
            provider, persist=lambda: _persist_llm_sections_sync(bot))
        if "error" in result:
            reason = result["error"]
            status = 500 if "persist failed" in reason else 400
            return web.json_response(result, status=status)
        return web.json_response(result)


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
            async with lock:
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
                elif str(agent_effort) not in CODEX_REASONING_EFFORTS:
                    return web.json_response(
                        {
                            "error": f"invalid agent_reasoning_effort: {agent_effort!r}",
                            "allowed": [*sorted(CODEX_REASONING_EFFORTS), None],
                        },
                        status=400,
                    )
                # agent_model: same inherit contract (null/""/whitespace);
                # free string like model — the dropdown is the UI constraint.
                agent_model_present = "agent_model" in body
                agent_model = body.get("agent_model")
                if agent_model is not None:
                    agent_model = str(agent_model).strip() or None
                changed = False
                # Agent effort is read from config at call time by the agent
                # iteration callbacks — persisting it must NOT trigger a codex
                # client reload (auth-pool refresh) when nothing else changed.
                needs_reload = False
                if "enabled" in body:
                    cfg.enabled = bool(body["enabled"])
                    changed = True
                    needs_reload = True
                if "model" in body and body["model"]:
                    cfg.model = str(body["model"])
                    changed = True
                    needs_reload = True
                if "max_tokens" in body:
                    cfg.max_tokens = _parse_int(body["max_tokens"], "max_tokens", 1, 128000)
                    changed = True
                    needs_reload = True
                if effort is not None:
                    cfg.reasoning_effort = str(effort)
                    changed = True
                    needs_reload = True
                if agent_effort_present:
                    cfg.agent_reasoning_effort = (
                        None if agent_effort is None else str(agent_effort)
                    )
                    changed = True
                if agent_model_present:
                    # Read at call time by the agent callbacks — no client
                    # reload needed (mirrors agent_reasoning_effort).
                    cfg.agent_model = agent_model
                    changed = True
                if changed:
                    if needs_reload:
                        await bot.llm_gateway.reload_codex_inner()
                    await _persist_config(bot)
        except ValueError as e:
            return web.json_response({"error": str(e)}, status=400)

        return web.json_response({
            "status": "updated",
            "enabled": cfg.enabled,
            "model": cfg.model,
            "reasoning_effort": cfg.reasoning_effort,
            "agent_reasoning_effort": cfg.agent_reasoning_effort,
            "agent_model": cfg.agent_model,
            "configured": bot.llm_gateway.codex_client is not None,
        })

    @routes.put("/api/llm/auxiliary/config")
    async def llm_auxiliary_config(request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)

        aux_cfg = getattr(bot.config.openai_codex, "auxiliary", None)
        if aux_cfg is None:
            return web.json_response({"error": "auxiliary config unavailable"}, status=503)

        # Build an IMMUTABLE desired spec (presence-merged with current config)
        # WITHOUT mutating live config — reload_auxiliary commits it atomically
        # under the lock, so a concurrent PUT can't install a candidate built
        # from a config this handler already changed. Only enabled + model are
        # configurable; auth and token limit are shared with the main Codex.
        want_enabled = bool(body["enabled"]) if "enabled" in body else aux_cfg.enabled
        want_model = aux_cfg.model
        if "model" in body and str(body["model"]).strip():
            want_model = str(body["model"]).strip()
        desired = {"enabled": want_enabled, "model": want_model}
        # Persistence runs INSIDE reload_auxiliary's locked transaction: the
        # SYNC write runs on an executor future (settled before the lock
        # releases), the candidate is applied, persisted, and (on persist
        # failure) EXACTLY restored — no phantom success, no probed reload.
        try:
            result = await bot.llm_gateway.reload_auxiliary(
                desired, persist=lambda: _persist_llm_sections_sync(bot))
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
            async with lock:
                cfg = bot.config.ollama
                changed = False
                if "enabled" in body:
                    cfg.enabled = bool(body["enabled"])
                    changed = True
                if "base_url" in body and body["base_url"]:
                    cfg.base_url = _validate_ollama_url(str(body["base_url"]))
                    changed = True
                if "model" in body and body["model"]:
                    cfg.model = str(body["model"])
                    changed = True
                if "max_tokens" in body:
                    cfg.max_tokens = _parse_int(body["max_tokens"], "max_tokens", 1, 128000)
                    changed = True
                if "api_key" in body:
                    cfg.api_key = str(body["api_key"])
                    _ui_set_secrets.add("ollama.api_key")
                    changed = True
                if "timeout" in body:
                    cfg.timeout = _parse_int(body["timeout"], "timeout", 10, 3600)
                    changed = True
                if changed:
                    await bot.llm_gateway.reload_ollama_inner()
                    await _persist_config(bot)
        except ValueError as e:
            return web.json_response({"error": str(e)}, status=400)

        return web.json_response({
            "status": "updated",
            "enabled": cfg.enabled,
            "model": cfg.model,
            "base_url": cfg.base_url,
            "configured": bot.llm_gateway.ollama_client is not None,
        })

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
            async with lock:
                cfg = bot.config.kimi
                changed = False
                if "enabled" in body:
                    cfg.enabled = bool(body["enabled"])
                    changed = True
                if "api_key" in body:
                    cfg.api_key = str(body["api_key"])
                    _ui_set_secrets.add("kimi.api_key")
                    changed = True
                if "model" in body and body["model"]:
                    cfg.model = str(body["model"])
                    changed = True
                if "max_tokens" in body:
                    cfg.max_tokens = _parse_int(body["max_tokens"], "max_tokens", 1, 262000)
                    changed = True
                if "timeout" in body:
                    cfg.timeout = _parse_int(body["timeout"], "timeout", 10, 3600)
                    changed = True
                if changed:
                    await bot.llm_gateway.reload_kimi_inner()
                    await _persist_config(bot)
        except ValueError as e:
            return web.json_response({"error": str(e)}, status=400)

        return web.json_response({
            "status": "updated",
            "enabled": cfg.enabled,
            "model": cfg.model,
            "configured": bot.llm_gateway.kimi_client is not None,
        })


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
        return web.json_response({
            "configured": True,
            "enabled": True,
            "model": client.model,
            "base_url": client.base_url,
            "health": health,
            "stats": client.pool_stats(),
        })

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
                return web.json_response({
                    "models": data.get("models", []),
                    "active_model": client.model,
                })
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

        async with lock:
            client = getattr(getattr(bot, "llm_gateway", None), "ollama_client", None)
            if client is None:
                return web.json_response({"error": "Ollama not configured"}, status=503)

            health = await client.health_check()
            available = health.get("models", [])
            if available and model not in available:
                base = model.split(":")[0]
                if not any(m.startswith(base + ":") for m in available):
                    return web.json_response({
                        "error": (
                            f"Model '{model}' not available. "
                            f"Pulled models: {', '.join(available[:10])}"
                        ),
                    }, status=400)

            client.model = model
            bot.config.ollama.model = model
            await _persist_config(bot)
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
        return web.json_response({
            "configured": True,
            "enabled": True,
            "model": client.model,
            "base_url": client.base_url,
            "health": health,
            "stats": client.pool_stats(),
        })

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
        return web.json_response({
            "models": health.get("models", []),
            "active_model": client.model,
        })

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

        async with lock:
            client = getattr(getattr(bot, "llm_gateway", None), "kimi_client", None)
            if client is None:
                return web.json_response({"error": "Kimi not configured"}, status=503)

            health = await client.health_check()
            available = health.get("models", [])
            if available and model not in available:
                return web.json_response({
                    "error": f"Model '{model}' not available. Models: {', '.join(available[:10])}",
                }, status=400)

            client.model = model
            bot.config.kimi.model = model
            await _persist_config(bot)
        return web.json_response({"status": "updated", "model": model})


