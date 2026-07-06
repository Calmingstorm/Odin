"""Codex OAuth administration route registrars (RFC-003 P5 size split).

Carved from llm_admin.py to honor the module-size gate; same verbatim
section, same registrar shape, same composition position.
"""

from __future__ import annotations

from aiohttp import web

from ...odin_log import get_logger
from ..api_common import _codex_creds_lock

log = get_logger("web.api")


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
