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

from ...odin_log import get_logger
from ..api_common import _codex_creds_lock

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


def register_codex_oauth(routes: web.RouteTableDef, bot) -> None:
    """Codex OAuth management (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Codex OAuth management
    # ------------------------------------------------------------------

    @routes.get("/api/codex/status")
    async def codex_status(_request: web.Request) -> web.Response:
        pool = getattr(bot.llm_gateway, "codex_client", None)
        pool = getattr(pool, "auth", None) if pool else None
        if pool is None:
            pool = getattr(bot, "_codex_auth_pool", None)
        if pool is None:
            return web.json_response({"configured": False, "accounts": []})

        import time as _time

        from ...llm.codex_auth import _decode_jwt_payload

        accounts = []
        for i, auth in enumerate(pool._accounts):
            try:
                creds = auth._load()
                payload = _decode_jwt_payload(creds.get("access_token", ""))
                expires_at = creds.get("expires_at", 0)
                accounts.append({
                    "index": i,
                    "label": creds.get("label", ""),
                    "email": creds.get("email", payload.get("email", "unknown")),
                    "account_id": creds.get("account_id", payload.get("chatgpt_account_id", "")),
                    "plan_type": creds.get("plan_type", payload.get("chatgpt_plan_type", "")),
                    "expires_at": expires_at,
                    "expired": _time.time() >= expires_at,
                    "rate_limited": auth.is_rate_limited(),
                    "is_current": i == pool._current_index,
                })
            except Exception as e:
                accounts.append({"index": i, "error": str(e)})

        return web.json_response({
            "configured": True,
            "account_count": pool.account_count,
            "current_index": pool._current_index,
            "accounts": accounts,
        })

    @routes.post("/api/codex/device-code")
    async def codex_device_code(_request: web.Request) -> web.Response:
        from ...llm.codex_auth import CodexAuth
        try:
            result = await CodexAuth.request_device_code()
            return web.json_response(result)
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)

    @routes.post("/api/codex/device-poll")
    async def codex_device_poll(request: web.Request) -> web.Response:
        from ...llm.codex_auth import CodexAuth
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)

        device_auth_id = body.get("device_auth_id", "")
        user_code = body.get("user_code", "")
        interval = body.get("interval", 5)
        if not device_auth_id or not user_code:
            return web.json_response({"error": "device_auth_id and user_code required"}, status=400)

        try:
            creds = await CodexAuth.poll_device_auth(device_auth_id, user_code, interval=interval)
        except TimeoutError:
            return web.json_response({"error": "Authorization timed out"}, status=408)
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)

        creds_path = bot.config.openai_codex.credentials_path
        save_index = body.get("save_index")
        if save_index is not None:
            try:
                save_index = int(save_index)
            except (TypeError, ValueError):
                return web.json_response({"error": "save_index must be an integer"}, status=400)

        import json as _json
        from pathlib import Path as _Path

        from ...llm.codex_auth import _atomic_write_secure

        path = _Path(creds_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        async with _codex_creds_lock:
            try:
                if path.exists():
                    raw = _json.loads(path.read_text())
                    if save_index is not None:
                        if isinstance(raw, list) and 0 <= save_index < len(raw):
                            raw[save_index] = creds
                        elif isinstance(raw, list):
                            raw.append(creds)
                        else:
                            raw = [raw, creds] if isinstance(raw, dict) else [creds]
                    else:
                        if isinstance(raw, list):
                            raw.append(creds)
                        elif isinstance(raw, dict):
                            raw = [raw, creds]
                        else:
                            raw = [creds]
                    _atomic_write_secure(path, _json.dumps(raw, indent=2))
                else:
                    _atomic_write_secure(path, _json.dumps([creds], indent=2))
            except Exception as e:
                bak = path.with_suffix(".bak")
                if path.exists():
                    try:
                        import shutil
                        shutil.copy2(path, bak)
                    except Exception:
                        pass
                _atomic_write_secure(path, _json.dumps([creds], indent=2))
                log.warning("Failed to merge credentials (backup at %s), wrote fresh: %s", bak, e)

        await bot.llm_gateway.reload_codex()

        return web.json_response({
            "status": "authenticated",
            "email": creds.get("email", "unknown"),
            "account_id": creds.get("account_id", ""),
        })

    @routes.post("/api/codex/account/{index}/refresh")
    async def codex_refresh_account(request: web.Request) -> web.Response:
        try:
            index = int(request.match_info["index"])
        except ValueError:
            return web.json_response({"error": "index must be an integer"}, status=400)

        pool = getattr(bot.llm_gateway, "codex_client", None)
        pool = getattr(pool, "auth", None) if pool else None
        if pool is None:
            return web.json_response({"error": "codex not configured"}, status=503)
        if index < 0 or index >= len(pool._accounts):
            return web.json_response({"error": f"index {index} out of range"}, status=400)

        auth = pool._accounts[index]
        try:
            import json as _json
            from pathlib import Path as _Path

            from ...llm.codex_auth import _atomic_write_secure

            creds = auth._load()
            await auth._refresh(creds)
            creds = auth._load()

            async with _codex_creds_lock:
                path = _Path(bot.config.openai_codex.credentials_path)
                if path.exists():
                    raw = _json.loads(path.read_text())
                    if isinstance(raw, list) and index < len(raw):
                        raw[index] = creds
                        _atomic_write_secure(path, _json.dumps(raw, indent=2))

            return web.json_response({
                "status": "refreshed",
                "email": creds.get("email", "unknown"),
                "expired": False,
            })
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)

    @routes.post("/api/codex/account/{index}/activate")
    async def codex_activate_account(request: web.Request) -> web.Response:
        try:
            index = int(request.match_info["index"])
        except ValueError:
            return web.json_response({"error": "index must be an integer"}, status=400)

        pool = getattr(bot.llm_gateway, "codex_client", None)
        pool = getattr(pool, "auth", None) if pool else None
        if pool is None:
            return web.json_response({"error": "codex not configured"}, status=503)
        try:
            await pool.set_active(index)
        except ValueError as e:
            return web.json_response({"error": str(e)}, status=400)
        return web.json_response({"status": "activated", "active_index": index})

    @routes.post("/api/codex/reload")
    async def codex_reload(_request: web.Request) -> web.Response:
        result = await bot.llm_gateway.reload_codex()
        status = 200 if result.get("configured") else 503
        return web.json_response(result, status=status)

    @routes.put("/api/codex/account/{index}/label")
    async def codex_set_label(request: web.Request) -> web.Response:
        import json as _json
        from pathlib import Path as _Path

        from ...llm.codex_auth import _atomic_write_secure

        try:
            index = int(request.match_info["index"])
        except ValueError:
            return web.json_response({"error": "index must be an integer"}, status=400)
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)

        label = body.get("label", "")
        if not isinstance(label, str):
            return web.json_response({"error": "label must be a string"}, status=400)

        path = _Path(bot.config.openai_codex.credentials_path)
        if not path.exists():
            return web.json_response({"error": "no credentials file"}, status=404)

        async with _codex_creds_lock:
            try:
                raw = _json.loads(path.read_text())
            except Exception:
                return web.json_response({"error": "failed to read credentials"}, status=500)

            if isinstance(raw, list):
                if index < 0 or index >= len(raw):
                    return web.json_response({"error": f"index {index} out of range"}, status=400)
                raw[index]["label"] = label
            elif isinstance(raw, dict) and index == 0:
                raw["label"] = label
            else:
                return web.json_response({"error": "invalid index"}, status=400)

            _atomic_write_secure(path, _json.dumps(raw, indent=2))

        # Also update the in-memory shadow file so status reflects immediately
        pool = getattr(bot.llm_gateway, "codex_client", None)
        pool = getattr(pool, "auth", None) if pool else None
        if pool and index < len(pool._accounts):
            try:
                creds = pool._accounts[index]._load()
                creds["label"] = label
                pool._accounts[index]._save(creds)
            except Exception:
                pass

        return web.json_response({"status": "updated", "label": label})

    @routes.delete("/api/codex/account/{index}")
    async def codex_delete_account(request: web.Request) -> web.Response:
        import json as _json
        from pathlib import Path as _Path

        from ...llm.codex_auth import _atomic_write_secure

        try:
            index = int(request.match_info["index"])
        except ValueError:
            return web.json_response({"error": "index must be an integer"}, status=400)

        path = _Path(bot.config.openai_codex.credentials_path)
        if not path.exists():
            return web.json_response({"error": "no credentials file"}, status=404)

        async with _codex_creds_lock:
            try:
                raw = _json.loads(path.read_text())
            except Exception:
                return web.json_response({"error": "failed to read credentials"}, status=500)

            if isinstance(raw, list):
                if index < 0 or index >= len(raw):
                    return web.json_response(
                        {"error": f"index {index} out of range (0-{len(raw)-1})"}, status=400
                    )
                removed = raw.pop(index)
                _atomic_write_secure(path, _json.dumps(raw, indent=2))
                email = removed.get("email", "unknown")
            elif isinstance(raw, dict) and index == 0:
                email = raw.get("email", "unknown")
                _atomic_write_secure(path, _json.dumps([], indent=2))
            else:
                return web.json_response({"error": "invalid index"}, status=400)

        pool = getattr(bot.llm_gateway, "codex_client", None)
        pool = getattr(pool, "auth", None) if pool else None
        if pool:
            # reload() ignores the pool lock and can race in-flight token
            # operations (account-mutation methods index the list after an
            # await) — use the locked variant.
            if hasattr(pool, "reload_async"):
                await pool.reload_async()
            else:
                pool.reload()

        return web.json_response({
            "status": "deleted",
            "email": email,
        })


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
                changed = False
                if "enabled" in body:
                    cfg.enabled = bool(body["enabled"])
                    changed = True
                if "model" in body and body["model"]:
                    cfg.model = str(body["model"])
                    changed = True
                if "max_tokens" in body:
                    cfg.max_tokens = _parse_int(body["max_tokens"], "max_tokens", 1, 128000)
                    changed = True
                if changed:
                    await bot.llm_gateway.reload_codex_inner()
                    await _persist_config(bot)
        except ValueError as e:
            return web.json_response({"error": str(e)}, status=400)

        return web.json_response({
            "status": "updated",
            "enabled": cfg.enabled,
            "model": cfg.model,
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


