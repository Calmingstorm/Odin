"""Auth, RBAC, host-access and API-token route registrars (RFC-003 P2).

Carved verbatim from api/__init__.

Each ``register_*`` moves one section of the old monolith unchanged; the
composition root calls them at the sections' original positions, so the
route REGISTRATION ORDER (aiohttp path precedence) is exactly what the
parity contract pins.
"""

from __future__ import annotations

from aiohttp import web

from ...odin_log import get_logger
from ..api_common import admin_gate

log = get_logger("web.api")

def register_permissions_rbac(routes: web.RouteTableDef, bot) -> None:
    """Permissions / RBAC (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Permissions / RBAC
    # ------------------------------------------------------------------

    @routes.get("/api/permissions/tiers")
    async def list_tiers(_request: web.Request) -> web.Response:
        # Bot attribute is `permissions` (PermissionManager); the old
        # "permission_manager" name never resolved, so these RBAC endpoints 503'd.
        pm = getattr(bot, "permissions", None)
        if not pm:
            return web.json_response({"error": "permission manager not available"}, status=503)
        from ...permissions.manager import USER_TIER_TOOLS, VALID_TIERS
        config_tiers = dict(pm._config_tiers)
        overrides = dict(pm._overrides)
        return web.json_response({
            "valid_tiers": list(VALID_TIERS),
            "default_tier": pm._default_tier,
            "config_tiers": config_tiers,
            "overrides": overrides,
            "user_tier_tools": sorted(USER_TIER_TOOLS),
        })

    @routes.get("/api/permissions/user/{user_id}")
    async def get_user_tier(request: web.Request) -> web.Response:
        # Bot attribute is `permissions` (PermissionManager); the old
        # "permission_manager" name never resolved, so these RBAC endpoints 503'd.
        pm = getattr(bot, "permissions", None)
        if not pm:
            return web.json_response({"error": "permission manager not available"}, status=503)
        uid = request.match_info["user_id"]
        tier = pm.get_tier(uid)
        allowed = pm.allowed_tool_names(uid)
        return web.json_response({
            "user_id": uid,
            "tier": tier,
            "allowed_tools": sorted(allowed) if allowed is not None else None,
        })

    @routes.put("/api/permissions/user/{user_id}")
    async def set_user_tier(request: web.Request) -> web.Response:
        # Bot attribute is `permissions` (PermissionManager); the old
        # "permission_manager" name never resolved, so these RBAC endpoints 503'd.
        pm = getattr(bot, "permissions", None)
        if not pm:
            return web.json_response({"error": "permission manager not available"}, status=503)
        uid = request.match_info["user_id"]
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)
        tier = body.get("tier", "")
        if not tier or not isinstance(tier, str):
            return web.json_response({"error": "tier is required"}, status=400)
        try:
            await pm.async_set_tier(uid, tier)
        except ValueError as e:
            return web.json_response({"error": str(e)}, status=400)
        try:
            audit = getattr(bot, "audit", None)
            if audit:
                session_id = getattr(request, "_session_id", "web-api")
                await audit.log_event(
                    event_type="permission_change",
                    action="set_tier",
                    actor=f"web:{session_id}",
                    detail=f"Set user {uid} to tier {tier}",
                )
        except Exception:
            pass
        return web.json_response({"user_id": uid, "tier": tier, "status": "updated"})

    @routes.delete("/api/permissions/user/{user_id}")
    async def delete_user_tier(request: web.Request) -> web.Response:
        # Bot attribute is `permissions` (PermissionManager); the old
        # "permission_manager" name never resolved, so these RBAC endpoints 503'd.
        pm = getattr(bot, "permissions", None)
        if not pm:
            return web.json_response({"error": "permission manager not available"}, status=503)
        uid = request.match_info["user_id"]
        if await pm.async_delete_tier(uid):
            try:
                audit = getattr(bot, "audit", None)
                if audit:
                    session_id = getattr(request, "_session_id", "web-api")
                    await audit.log_event(
                        event_type="permission_change",
                        action="delete_tier",
                        actor=f"web:{session_id}",
                        detail=f"Removed tier override for user {uid}",
                    )
            except Exception:
                pass
            return web.json_response({"user_id": uid, "status": "override_removed"})
        return web.json_response({"error": "no override found for user"}, status=404)


def register_host_access(routes: web.RouteTableDef, bot) -> None:
    """Host access control (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Host access control
    # ------------------------------------------------------------------

    @routes.get("/api/host-access")
    async def get_host_access(_request: web.Request) -> web.Response:
        ham = getattr(bot, "host_access_manager", None)
        if not ham:
            return web.json_response({"error": "host access manager not available"}, status=503)
        return web.json_response({
            "available_hosts": ham.available_hosts,
            "default_policy": ham.default_policy.to_dict(),
            "users": ham.list_users(),
        })

    @routes.put("/api/host-access/user/{user_id}")
    async def set_host_access_user(request: web.Request) -> web.Response:
        ham = getattr(bot, "host_access_manager", None)
        if not ham:
            return web.json_response({"error": "host access manager not available"}, status=503)
        uid = request.match_info["user_id"]
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)
        allowed_hosts = body.get("allowed_hosts")
        default_host = body.get("default_host", "")
        if allowed_hosts is not None and not isinstance(allowed_hosts, list):
            return web.json_response({"error": "allowed_hosts must be a list or null"}, status=400)
        if allowed_hosts is not None and not all(isinstance(h, str) for h in allowed_hosts):
            return web.json_response({"error": "allowed_hosts entries must be strings"}, status=400)
        if not isinstance(default_host, str):
            return web.json_response({"error": "default_host must be a string"}, status=400)
        await ham.set_user(uid, allowed_hosts, default_host)
        try:
            audit = getattr(bot, "audit", None)
            if audit:
                session_id = getattr(request, "_session_id", "web-api")
                await audit.log_event(
                    event_type="host_access_change",
                    action="set_user",
                    actor=f"web:{session_id}",
                    detail=(
                        f"Set host access for user {uid}: "
                        f"hosts={allowed_hosts}, default={default_host}"
                    ),
                )
        except Exception:
            pass
        return web.json_response({"user_id": uid, "status": "updated"})

    @routes.delete("/api/host-access/user/{user_id}")
    async def delete_host_access_user(request: web.Request) -> web.Response:
        ham = getattr(bot, "host_access_manager", None)
        if not ham:
            return web.json_response({"error": "host access manager not available"}, status=503)
        uid = request.match_info["user_id"]
        if await ham.delete_user(uid):
            return web.json_response({"user_id": uid, "status": "override_removed"})
        return web.json_response({"error": "no override found for user"}, status=404)

    @routes.put("/api/host-access/default-policy")
    async def set_host_access_default(request: web.Request) -> web.Response:
        ham = getattr(bot, "host_access_manager", None)
        if not ham:
            return web.json_response({"error": "host access manager not available"}, status=503)
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)
        allowed_hosts = body.get("allowed_hosts")
        default_host = body.get("default_host", "")
        if allowed_hosts is not None and not isinstance(allowed_hosts, list):
            return web.json_response({"error": "allowed_hosts must be a list or null"}, status=400)
        if allowed_hosts is not None and not all(isinstance(h, str) for h in allowed_hosts):
            return web.json_response({"error": "allowed_hosts entries must be strings"}, status=400)
        if not isinstance(default_host, str):
            return web.json_response({"error": "default_host must be a string"}, status=400)
        await ham.set_default_policy(allowed_hosts, default_host)
        return web.json_response({"status": "updated"})


def register_api_tokens(routes: web.RouteTableDef, bot) -> None:
    """API Token Management (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # API Token Management
    # ------------------------------------------------------------------

    _require_admin = admin_gate(bot)

    @routes.get("/api/tokens")
    async def list_api_tokens(request: web.Request) -> web.Response:
        denied = _require_admin(request)
        if denied:
            return denied
        tm = getattr(bot, "api_token_manager", None)
        tokens = tm.list_tokens() if tm else []
        for t in bot.config.web.api_tokens:
            d = t.model_dump()
            d["token"] = d["token"][:8] + "..." if len(d.get("token", "")) > 8 else "***"
            d["source"] = "config"
            tokens.append(d)
        ham = getattr(bot, "host_access_manager", None)
        available_hosts = ham.available_hosts if ham else []
        return web.json_response({"tokens": tokens, "available_hosts": available_hosts})

    @routes.post("/api/tokens")
    async def create_api_token(request: web.Request) -> web.Response:
        denied = _require_admin(request)
        if denied:
            return denied
        tm = getattr(bot, "api_token_manager", None)
        if not tm:
            return web.json_response({"error": "token manager not available"}, status=503)
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        user_id = (data.get("user_id") or "").strip()
        if not user_id:
            return web.json_response({"error": "user_id is required"}, status=400)
        import re as _re
        if not _re.fullmatch(r"[a-zA-Z0-9_.-]{1,64}", user_id):
            return web.json_response(
                {"error": "user_id must be alphanumeric/dash/underscore, max 64 chars"}, status=400
            )
        tier = data.get("tier", "admin")
        if tier not in ("admin", "user", "guest"):
            return web.json_response({"error": "tier must be admin, user, or guest"}, status=400)
        allowed_tools = data.get("allowed_tools") or []
        raw_hosts = data.get("allowed_hosts")
        if raw_hosts is None:
            allowed_hosts = None
        elif isinstance(raw_hosts, list) and all(isinstance(h, str) for h in raw_hosts):
            allowed_hosts = raw_hosts
        else:
            return web.json_response(
                {"error": "allowed_hosts must be a list of strings or null"}, status=400
            )
        if not isinstance(
            allowed_tools, list) or not all(isinstance(t, str) for t in allowed_tools
        ):
            return web.json_response(
                {"error": "allowed_tools must be a list of strings"}, status=400
            )
        ham = getattr(bot, "host_access_manager", None)
        if allowed_hosts and ham:
            valid_hosts = set(ham.available_hosts)
            bad = [h for h in allowed_hosts if h not in valid_hosts]
            if bad:
                return web.json_response({"error": f"unknown hosts: {', '.join(bad)}"}, status=400)
        default_host = str(data.get("default_host") or "").strip()
        if default_host:
            if ham and default_host not in ham.available_hosts:
                return web.json_response(
                    {"error": f"unknown default_host: {default_host}"}, status=400
                )
            if isinstance(allowed_hosts, list) and default_host not in allowed_hosts:
                return web.json_response(
                    {"error": "default_host must be in allowed_hosts"}, status=400
                )
        try:
            identity = await tm.create_token(
                user_id=user_id,
                username=data.get("username") or "API",
                tier=tier,
                label=data.get("label") or "",
                allowed_tools=allowed_tools,
                allowed_hosts=allowed_hosts,
                default_host=default_host,
            )
        except ValueError as e:
            return web.json_response({"error": str(e)}, status=409)
        return web.json_response({
            "user_id": identity.user_id,
            "token": identity.token,
            "username": identity.username,
            "tier": identity.tier,
            "label": identity.label,
            "allowed_tools": identity.allowed_tools,
            "allowed_hosts": identity.allowed_hosts,
            "default_host": identity.default_host,
        }, status=201)

    @routes.put("/api/tokens/{user_id}")
    async def update_api_token(request: web.Request) -> web.Response:
        denied = _require_admin(request)
        if denied:
            return denied
        tm = getattr(bot, "api_token_manager", None)
        if not tm:
            return web.json_response({"error": "token manager not available"}, status=503)
        uid = request.match_info["user_id"]
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        kwargs = {}
        for field in (
            "username", "tier", "label", "allowed_tools", "allowed_hosts", "default_host"
        ):
            if field in data:
                kwargs[field] = data[field]
        if "tier" in kwargs and kwargs["tier"] not in ("admin", "user", "guest"):
            return web.json_response({"error": "tier must be admin, user, or guest"}, status=400)
        if "allowed_tools" in kwargs:
            if not isinstance(
                kwargs["allowed_tools"], list
            ) or not all(
                isinstance(t, str) for t in kwargs["allowed_tools"]
            ):
                return web.json_response(
                    {"error": "allowed_tools must be a list of strings"}, status=400
                )
        if "allowed_hosts" in kwargs:
            if kwargs["allowed_hosts"] is not None:
                if not isinstance(
                    kwargs["allowed_hosts"], list
            ) or not all(
                isinstance(h, str) for h in kwargs["allowed_hosts"]
                ):
                    return web.json_response(
                        {"error": "allowed_hosts must be a list of strings or null"}, status=400
                    )
            ham = getattr(bot, "host_access_manager", None)
            if kwargs["allowed_hosts"] and ham:
                valid_hosts = set(ham.available_hosts)
                bad = [h for h in kwargs["allowed_hosts"] if h not in valid_hosts]
                if bad:
                    return web.json_response(
                        {"error": f"unknown hosts: {', '.join(bad)}"}, status=400
                    )
        if "default_host" in kwargs:
            dh = str(kwargs["default_host"] or "").strip()
            kwargs["default_host"] = dh
            if dh:
                ham = getattr(bot, "host_access_manager", None)
                if ham and dh not in ham.available_hosts:
                    return web.json_response({"error": f"unknown default_host: {dh}"}, status=400)
                ah = kwargs.get("allowed_hosts")
                if ah is None:
                    existing = tm.get(uid)
                    ah = existing.allowed_hosts if existing else None
                if isinstance(ah, list) and dh not in ah:
                    return web.json_response(
                        {"error": "default_host must be in allowed_hosts"}, status=400
                    )
        if not kwargs:
            return web.json_response({"error": "no fields to update"}, status=400)
        identity = await tm.update_token(uid, **kwargs)
        if identity is None:
            return web.json_response({"error": "token not found"}, status=404)
        return web.json_response({"user_id": uid, "status": "updated"})

    @routes.post("/api/tokens/{user_id}/regenerate")
    async def regenerate_api_token(request: web.Request) -> web.Response:
        denied = _require_admin(request)
        if denied:
            return denied
        tm = getattr(bot, "api_token_manager", None)
        if not tm:
            return web.json_response({"error": "token manager not available"}, status=503)
        uid = request.match_info["user_id"]
        new_token = await tm.regenerate_token(uid)
        if new_token is None:
            return web.json_response({"error": "token not found"}, status=404)
        sm = request.app.get("session_manager")
        if sm:
            sm.destroy_by_user_id(uid)
        ws_mgr = request.app.get("ws_manager")
        if ws_mgr:
            await ws_mgr.close_by_user_id(uid)
        return web.json_response({"user_id": uid, "token": new_token})

    @routes.delete("/api/tokens/{user_id}")
    async def delete_api_token(request: web.Request) -> web.Response:
        denied = _require_admin(request)
        if denied:
            return denied
        tm = getattr(bot, "api_token_manager", None)
        if not tm:
            return web.json_response({"error": "token manager not available"}, status=503)
        uid = request.match_info["user_id"]
        deleted = await tm.delete_token(uid)
        if not deleted:
            return web.json_response({"error": "token not found"}, status=404)
        sm = request.app.get("session_manager")
        if sm:
            sm.destroy_by_user_id(uid)
        ws_mgr = request.app.get("ws_manager")
        if ws_mgr:
            await ws_mgr.close_by_user_id(uid)
        return web.json_response({"user_id": uid, "status": "deleted"})




def register_auth(routes: web.RouteTableDef, bot) -> None:
    """Auth (login / logout / session check) (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Auth (login / logout / session check)
    # ------------------------------------------------------------------

    @routes.post("/api/auth/login")
    async def auth_login(request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)

        token = (data.get("token") or "").strip()
        if not token:
            return web.json_response({"error": "token is required"}, status=400)

        api_token = bot.config.web.api_token
        tm = getattr(bot, "api_token_manager", None)
        has_any_token = api_token or bot.config.web.api_tokens or (tm and tm.list_tokens())
        if not has_any_token:
            # No auth configured — dev mode, issue session anyway
            sm = request.app.get("session_manager")
            if sm:
                sid, timeout = sm.create()
                return web.json_response({
                    "session_id": sid,
                    "timeout_seconds": timeout,
                })
            return web.json_response({"error": "no session manager"}, status=500)

        # Check dynamic token manager first, then static config tokens
        tm = getattr(bot, "api_token_manager", None)
        identity = tm.resolve(token) if tm else None
        if identity is None:
            identity = bot.config.web.resolve_api_identity(token)
        if identity is not None:
            sm = request.app.get("session_manager")
            if not sm:
                return web.json_response({"error": "no session manager"}, status=500)
            sid, timeout = sm.create(identity=identity)
            return web.json_response({
                "session_id": sid,
                "timeout_seconds": timeout,
            })

        # Fall back to legacy single token
        import hmac as _hmac
        if api_token and not _hmac.compare_digest(token, api_token):
            return web.json_response({"error": "invalid token"}, status=401)
        if not api_token:
            return web.json_response({"error": "invalid token"}, status=401)

        sm = request.app.get("session_manager")
        if not sm:
            return web.json_response({"error": "no session manager"}, status=500)

        from ...config.schema import ApiTokenIdentity
        legacy_identity = ApiTokenIdentity(
            token="", user_id="api-admin",
            username="Admin", tier="admin", label="default",
        )
        sid, timeout = sm.create(identity=legacy_identity)
        return web.json_response({
            "session_id": sid,
            "timeout_seconds": timeout,
        })

    @routes.post("/api/auth/logout")
    async def auth_logout(request: web.Request) -> web.Response:
        sm = request.app.get("session_manager")
        if not sm:
            return web.json_response({"status": "ok"})

        # Extract session ID from Authorization header
        auth_header = request.headers.get("Authorization", "")
        bearer_prefix = "Bearer "
        if auth_header.startswith(bearer_prefix):
            sid = auth_header[len(bearer_prefix):]
            sm.destroy(sid)

        return web.json_response({"status": "logged_out"})

    @routes.get("/api/auth/session")
    async def auth_session(request: web.Request) -> web.Response:
        sm = request.app.get("session_manager")
        auth_header = request.headers.get("Authorization", "")
        is_authed = False
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            import hmac as _hmac
            api_token = request.app.get("api_token", "")
            if api_token and _hmac.compare_digest(token, api_token):
                is_authed = True
            elif sm and sm.validate(token):
                is_authed = True
        identity = getattr(request, "_api_identity", None)
        user_id = identity.user_id if identity else "web-user"
        timeout = sm.timeout_seconds if sm else 0
        return web.json_response({
            "authenticated": is_authed,
            "timeout_seconds": timeout,
            "active_sessions": sm.active_count if sm else 0,
            "user_id": user_id,
            "channel_id": user_id,
        })
