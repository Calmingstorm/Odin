"""Authenticated browser-session binding, never caller-supplied chat continuity."""
from __future__ import annotations

import hashlib
import hmac


def browser_binding(bot, request):
    identity = getattr(request, "_api_identity", None)
    sid = getattr(request, "_session_id", None)
    sessions = request.app.get("session_manager")
    if (identity is None or not getattr(request, "_session_managed", False)
            or not sid or sessions is None
            or getattr(identity, "tier", None) != "admin" or "token" in request.query):
        return None
    owner = identity.user_id
    original = sessions.get_identity(sid)
    credential = getattr(original, "token", "")
    tokens = request.app.get("token_manager")
    dynamic = tokens.resolve(credential) if tokens is not None and credential else None
    static = next((i for i in bot.config.web.api_tokens
                   if credential and hmac.compare_digest(i.token, credential)), None)
    legacy_digest = hashlib.sha256(bot.config.web.api_token.encode()).digest()

    def current():
        if not sessions.validate(sid, touch=False):
            return False
        value = sessions.get_identity(sid)
        if dynamic is not None:
            value = tokens.resolve(credential)
        elif static is not None:
            value = next((i for i in bot.config.web.api_tokens
                          if hmac.compare_digest(i.token, credential)), None)
        elif owner == "api-admin":
            if not hmac.compare_digest(
                    legacy_digest, hashlib.sha256(bot.config.web.api_token.encode()).digest()):
                return False
        else:
            # An unknown/deleted backing credential cannot leave a stale session
            # with desktop authority, even if ordinary chat policy is broader.
            return False
        return bool(value is not None and value.user_id == owner and value.tier == "admin"
                    and getattr(value, "allowed_hosts", None) == getattr(
                        identity, "allowed_hosts", None)
                    and getattr(value, "allowed_tools", None) == getattr(
                        identity, "allowed_tools", None))

    return (sid, current) if current() else None
