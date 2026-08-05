"""One authority for deciding whether a configuration key carries a secret.

Both the generic config API and the Config Center registry consume this rule.
Keeping a second list in the registry previously let ``default_webhook_url``
through even though GET ``/api/config`` correctly redacted it.
"""

from __future__ import annotations

# Exact names retained for backward compatibility and for generic-PUT blocking.
# Do not add container-only names here without also providing their dedicated
# set/clear route: config_admin imports this set for the C2 capability fence.
SENSITIVE_FIELDS: frozenset[str] = frozenset(
    {
        "token",
        "api_token",
        "secret",
        "ssh_key_path",
        "credentials_path",
        "api_key",
        "password",
        "hmac_key",
    }
)

# Substring matching closes compound-name leaks such as webhook_url,
# app_password, and future provider_credentials_path fields.
SENSITIVE_KEY_SUBSTRINGS: tuple[str, ...] = (
    "token",
    "secret",
    "password",
    "api_key",
    "apikey",
    "hmac",
    "webhook_url",
    "webhook_urls",
    "private_key",
    "credential",
)

# These containers may hold credentials under arbitrary operator-chosen keys.
# They are sensitive metadata, but are deliberately not generic-PUT blocked by
# SENSITIVE_FIELDS until their dedicated set/clear flows exist in the same
# release.
SENSITIVE_CONTAINER_KEYS: frozenset[str] = frozenset({"headers", "env"})

# Schema keys that contain security vocabulary but hold controls or counts,
# not credentials. The generic response currently avoids masking their numeric
# or boolean values by type; the registry is type-agnostic, so the shared rule
# must state the semantic exception explicitly instead of relying on that
# accident.
PUBLIC_NON_SECRET_KEYS: frozenset[str] = frozenset(
    {
        "scrub_secrets",
        "max_tokens",
        "token_budget",
        "context_token_budget",
        "injection_token_budget",
    }
)

# Checkpointed tool payloads use deliberately narrower, exact normalized-key
# matching.  This is a different policy from config metadata: broad substring
# matching would start redacting innocent tool arguments such as ``tokenizer``,
# while PUBLIC_NON_SECRET_KEYS must never weaken storage redaction by accident.
# Keep the policy here beside the config rule so there is one sensitivity
# authority, but expose a separate predicate because their contracts differ.
STORAGE_SENSITIVE_KEYS: frozenset[str] = frozenset(
    {
        "password",
        "passwd",
        "pwd",
        "passphrase",
        "secret",
        "clientsecret",
        "secretkey",
        "token",
        "apitoken",
        "accesstoken",
        "refreshtoken",
        "sessiontoken",
        "idtoken",
        "bearertoken",
        "authtoken",
        "apikey",
        "authorization",
        "auth",
        "bearer",
        "credential",
        "credentials",
        "privatekey",
        "accesskey",
        "secretaccesskey",
        "cookie",
        "setcookie",
        "sessionid",
        "csrftoken",
    }
)


# Containers whose CHILD KEYS are operator-chosen, so per-key classification
# cannot work inside them: an HTTP header is named "Authorization", an env var
# is named whatever the operator called it, a webhook map is keyed by nickname.
# Everything beneath these is opaque and must be masked wholesale. Containers
# whose children are SCHEMA fields (web.api_tokens, outbound_webhooks.targets,
# mcp.servers) are deliberately absent: per-key classification works there, and
# blanket masking would hide a target's url or a token's tier for no gain.
OPAQUE_CONTAINER_KEYS: frozenset[str] = frozenset(
    {"headers", "env", "webhook_urls"}
)


def is_opaque_container_key(key: object) -> bool:
    """Whether every value beneath *key* must be masked, not just matching ones."""
    return isinstance(key, str) and key.lower() in OPAQUE_CONTAINER_KEYS


def is_sensitive_key(key: object) -> bool:
    """Return whether *key* names a secret or credential-bearing container."""
    if not isinstance(key, str):
        return False
    lowered = key.lower()
    if lowered in PUBLIC_NON_SECRET_KEYS:
        return False
    return (
        lowered in SENSITIVE_FIELDS
        or lowered in SENSITIVE_CONTAINER_KEYS
        or any(fragment in lowered for fragment in SENSITIVE_KEY_SUBSTRINGS)
    )


def is_storage_sensitive_key(key: object) -> bool:
    """Return whether *key* must redact its whole checkpointed value.

    Matching stays exact after case/separator normalization. This preserves the
    checkpoint codec's established behavior independently of config-only public
    control names and compound-name matching.
    """
    if not isinstance(key, str):
        return False
    normalized = key.lower().replace("-", "").replace("_", "")
    return normalized in STORAGE_SENSITIVE_KEYS
