"""Authenticated browser-session binding, never caller-supplied chat continuity."""
from __future__ import annotations

import asyncio
import hashlib
import hmac
from collections.abc import Callable
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any


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
    # Hashed dynamic logins bind to an exact server-owned identity object.
    # Rotation/update replaces it; deletion removes it. Relogin rebinds authority.
    hashed_dynamic = bool(not credential and tokens is not None
                          and getattr(tokens, "get", lambda _: None)(owner) is original
                          and original is not None)
    static = next((i for i in bot.config.web.api_tokens
                   if credential and hmac.compare_digest(i.token, credential)), None)
    legacy_digest = hashlib.sha256(bot.config.web.api_token.encode()).digest()
    hosts = getattr(identity, "allowed_hosts", None)
    hosts = None if hosts is None else tuple(hosts)
    tools = tuple(getattr(identity, "allowed_tools", ()) or ())

    def current():
        if not sessions.validate(sid, touch=False):
            return False
        value = sessions.get_identity(sid)
        if value is not original:
            return False
        if dynamic is not None:
            value = tokens.resolve(credential)
        elif hashed_dynamic:
            value = tokens.get(owner)
            if value is not original:
                return False
        elif static is not None:
            value = next((i for i in bot.config.web.api_tokens
                          if hmac.compare_digest(i.token, credential)), None)
        elif (owner == "api-admin" and credential and bot.config.web.api_token
              and hmac.compare_digest(credential, bot.config.web.api_token)):
            if not hmac.compare_digest(
                    legacy_digest, hashlib.sha256(bot.config.web.api_token.encode()).digest()):
                return False
        else:
            # An unknown/deleted backing credential cannot leave a stale session
            # with desktop authority, even if ordinary chat policy is broader.
            return False
        return bool(value is not None and value.user_id == owner and value.tier == "admin"
                    and (None if getattr(value, "allowed_hosts", None) is None else
                         tuple(value.allowed_hosts)) == hosts
                    and tuple(getattr(value, "allowed_tools", ()) or ()) == tools)

    return (sid, current) if current() else None


_operator_grant: ContextVar[
    tuple[str, str, Callable[[], bool], asyncio.Task[Any] | None] | None
] = ContextVar("computer_operator_grant", default=None)
_TOOLS = frozenset({"computer_session", "computer_observe", "computer_act"})


def operator_binding(bot, request):
    """Desktop scope. Empty tool lists mean unrestricted in the token schema."""
    binding = browser_binding(bot, request)
    if binding is None:
        return None
    sid, credential_current = binding
    identity = request._api_identity
    owner = str(identity.user_id)
    hosts = getattr(identity, "allowed_hosts", None)
    tools = frozenset(getattr(identity, "allowed_tools", ()) or ())
    scoped = (hosts is None or "localhost" in hosts) and (not tools or _TOOLS <= tools)

    def current():
        try:
            host_manager = getattr(bot, "host_access_manager", None)
            executor = getattr(bot, "tool_executor", None)
            return bool(scoped and credential_current()
                        and host_manager is not None and executor is not None
                        and host_manager.is_host_allowed(owner, "localhost")
                        and all(not executor.check_permission(tool, owner) for tool in _TOOLS))
        except Exception:
            return False

    return (owner, sid, current) if current() else None


@contextmanager
def operator_scope(binding):
    owner, sid, current = binding
    channel = "web:" + hashlib.sha256(sid.encode("utf-8")).hexdigest()
    token = _operator_grant.set((owner, channel, current, asyncio.current_task()))
    try:
        yield
    finally:
        _operator_grant.reset(token)


def operator_context_authorized(context):
    """Integration/manager fence; copied child contexts confer no authority."""
    grant = _operator_grant.get()
    return bool(grant is not None and grant[3] is asyncio.current_task()
                and context.turn_id == "web-operator" and context.surface == "webui"
                and context.host_id == "localhost" and context.owner_id == grant[0]
                and context.channel_id == grant[1] and grant[2]() is True)
