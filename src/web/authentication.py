"""Shared HTTP, login and WebSocket credential admission and provenance."""
import hmac


def credential_equals(left: str, right: str) -> bool:
    """Constant-time comparison supporting every configured UTF-8 credential."""
    return hmac.compare_digest(left.encode("utf-8"), right.encode("utf-8"))


def resolve_credential(config, snapshot, token: str):
    """Dynamic, then static, then legacy: identical precedence on all carriers."""
    recovery = getattr(snapshot, "credential_store_auth_required", False) is True
    resolver = getattr(snapshot, "resolve", None)
    identity = resolver(token) if token and callable(resolver) and not recovery else None
    if identity is not None:
        return identity, "dynamic"
    for entry in getattr(config, "api_tokens", ()):
        if entry.token and credential_equals(entry.token, token):
            # Keep old configurations loadable, but never elevate a typo.
            if entry.tier not in {"admin", "user", "guest"}:
                return None, "invalid"
            return entry, "static"
    identity = config.resolve_api_identity(token) if config is not None else None
    return (identity, "legacy") if identity is not None else (None, "unknown")


def current_session_identity(sessions, sid, config, snapshot):
    """Revalidate only the credential which issued this session, never its ID."""
    if not sessions.validate(sid, touch=False):
        return None
    origin = sessions.get_identity(sid)
    source = sessions.get_auth_source(sid)
    current = None
    if source == "dynamic" and snapshot is not None:
        if snapshot.identity_is_current(origin):
            current = origin
    elif source in {"static", "legacy"} and origin is not None:
        if source == "static":
            current = next((entry for entry in getattr(config, "api_tokens", ())
                            if entry.user_id == origin.user_id and entry.token
                            and credential_equals(entry.token, origin.token)
                            and entry.tier in {"admin", "user", "guest"}), None)
        elif getattr(config, "api_token", "") and credential_equals(config.api_token, origin.token):
            from ..config.schema import ApiTokenIdentity
            current = ApiTokenIdentity(token=config.api_token, user_id="api-admin",
                                       username="Admin", tier="admin", label="default")
    if current is None:
        sessions.destroy(sid)
    return current
