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
from pathlib import Path

from aiohttp import web

from ...config.schema import CODEX_REASONING_EFFORTS
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

def _persist_llm_sections_sync(bot) -> None:
    """Merge only LLM-related sections into config.yml using round-trip YAML.

    Preserves comments, ordering, style, and env-var placeholders.
    """
    config_path = Path("config.yml")
    if not config_path.exists():
        return
    from ruamel.yaml import YAML

    ry = YAML()
    ry.preserve_quotes = True
    try:
        with open(config_path) as f:
            existing = ry.load(f)
        if existing is None:
            return
    except Exception:
        return

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

    with open(config_path, "w") as f:
        ry.dump(existing, f)

async def _persist_config(bot) -> None:
    """Persist LLM config sections without touching env vars or other settings."""
    await asyncio.to_thread(_persist_llm_sections_sync, bot)


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

        result = await bot.llm_gateway.switch_provider(provider)
        if "error" in result:
            return web.json_response(result, status=400)
        await _persist_config(bot)
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


