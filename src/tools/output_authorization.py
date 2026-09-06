"""Task-local evidence authorization, shared by native tools and skills."""
import hashlib
import json
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any

request_tool_scope: ContextVar[Any] = ContextVar("request_tool_scope", default=None)
request_scope_authorizer: ContextVar[Any] = ContextVar("request_scope_authorizer", default=None)
request_scope_id = ContextVar("request_scope_id", default="")
request_delivery_channel = ContextVar("request_delivery_channel", default="")
request_host_authorizer: ContextVar[Any] = ContextVar("request_host_authorizer", default=None)
accessed_hosts: ContextVar[dict | None] = ContextVar("output_accessed_hosts", default=None)


@contextmanager
def host_access_capture():
    """Gather child-task accesses into the same invocation-owned collection."""
    existing = accessed_hosts.get()
    token = accessed_hosts.set(existing if existing is not None else {})
    try:
        yield
    finally:
        accessed_hosts.reset(token)


def host_binding(target):
    # Runtime generation alone can collide after restart. Pin connection and
    # trust identity too, without persisting connection details in envelopes.
    identity = [getattr(target, key, None) for key in (
        "address", "ssh_user", "os", "port", "trust_mode", "host_keys",
        "key_path", "known_hosts_path", "host_key_alias")]
    digest = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
    return {"alias": target.alias, "generation": target.runtime_key, "identity": digest}


def record_host(lease):
    collector = accessed_hosts.get()
    if lease is not None and collector is not None:
        binding = host_binding(lease.target)
        collector[(binding["alias"], binding["generation"], binding["identity"])] = binding
    return lease


def tool_scope_allows(tool):
    scope = request_tool_scope.get()
    if scope is not None and tool not in scope:
        return False
    resolver = request_scope_authorizer.get()
    if resolver is not None:
        current = resolver()
        if current is False or (current is not None and tool not in current):
            return False
    return True


@contextmanager
def web_output_scope(bot, request):
    """Keep a live resolver, not a snapshot of a token's initial grants."""
    header = request.headers.get("Authorization", "")
    raw = header[7:] if header.startswith("Bearer ") else ""
    if not raw:
        query = getattr(request, "query", {})
        raw = query.get("token", "")
    if not raw:
        yield
        return
    manager = getattr(bot, "api_token_manager", None)
    dynamic = manager is not None and manager.resolve(raw) is not None
    sessions = getattr(request, "app", {}).get("session_manager")
    session_managed = bool(getattr(request, "_session_managed", False))
    origin = getattr(request, "_api_identity", None)

    def identity():
        if session_managed:
            if sessions is None or not sessions.validate(raw):
                return None
            current = getattr(bot, "api_token_manager", None)
            user = getattr(origin, "user_id", "")
            if current is not None:
                found = current.get(user)
                if found is not None:
                    return found
            found = next((entry for entry in bot.config.web.api_tokens
                          if entry.user_id == user), None)
            if found is not None:
                return found
            # Default-admin sessions have no per-token identity. Managed
            # token sessions fail closed once their originating token is gone.
            if origin is None or user == "api-admin":
                return sessions.get_identity(raw) or origin
            return None
        if dynamic:
            current = getattr(bot, "api_token_manager", None)
            return current.resolve(raw) if current else None
        return bot.config.web.resolve_api_identity(raw)

    def tools():
        current = identity()
        if current is None:
            return False
        scope = current.allowed_tools or None
        tier = getattr(current, "tier", "admin")
        if tier == "guest":
            return set()
        if tier == "user":
            from ..permissions.manager import USER_TIER_TOOLS

            return USER_TIER_TOOLS if scope is None else set(scope) & USER_TIER_TOOLS
        return scope

    def hosts(alias):
        current = identity()
        return current is not None and (
            current.allowed_hosts is None or alias in current.allowed_hosts)

    scope_token = request_scope_id.set(hashlib.sha256(raw.encode()).hexdigest())
    tools_token = request_scope_authorizer.set(tools)
    hosts_token = request_host_authorizer.set(hosts)
    channel_token = request_delivery_channel.set(
        "api-execute" if getattr(request, "path", "") == "/api/execute" else "")
    try:
        yield
    finally:
        request_delivery_channel.reset(channel_token)
        request_host_authorizer.reset(hosts_token)
        request_scope_authorizer.reset(tools_token)
        request_scope_id.reset(scope_token)


@contextmanager
def websocket_output_scope(manager, ws):
    """Reuse the WebSocket's generation-fenced live credential check."""
    identity = getattr(ws, "_odin_identity", None)
    credential = getattr(ws, "_odin_credential_policy", None)
    bearer = getattr(credential, "bearer", "")
    bearer = bearer if isinstance(bearer, str) else ""
    scope = (hashlib.sha256(bearer.encode()).hexdigest() if bearer else
             hashlib.sha256(repr((getattr(credential, "source", "internal"),
                                  getattr(identity, "user_id", ""),
                                  getattr(credential, "fingerprint", ""))).encode()).hexdigest())

    def tools():
        if not manager._policy_authorized(ws):
            return False
        return getattr(identity, "allowed_tools", None) or None

    def hosts(alias):
        allowed_hosts = getattr(identity, "allowed_hosts", None)
        return manager._policy_authorized(ws) and (
            allowed_hosts is None or alias in allowed_hosts)

    scope_token = request_scope_id.set(scope)
    tools_token = request_scope_authorizer.set(tools)
    hosts_token = request_host_authorizer.set(hosts)
    try:
        yield
    finally:
        request_host_authorizer.reset(hosts_token)
        request_scope_authorizer.reset(tools_token)
        request_scope_id.reset(scope_token)
