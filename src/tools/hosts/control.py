"""Host candidate validation, SSH trust preflight, and dependencies."""

from __future__ import annotations

import asyncio
import ipaddress
import re
import shlex
import time
import uuid
from collections.abc import Mapping
from dataclasses import replace
from pathlib import Path
from typing import Any

from ...config.schema import ToolHost
from ...error_presentation import sanitize_error_text
from ...llm.secret_scrubber import scrub_output_secrets
from ..ssh import is_local_address
from .registry import deterministic_host_id
from .trust import HostCandidate, HostTrustError, fingerprint_public_key, normalize_public_key

_ALIAS_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]{0,63}$")
_HOSTNAME_RE = re.compile(
    r"^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$"
)
_USER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_.-]{0,63}$")
_FINGERPRINT_RE = re.compile(r"^SHA256:[A-Za-z0-9+/]{20,64}$")
_CANDIDATE_TTL = 15 * 60
_SCAN_TIMEOUT = 12.0
_TEST_TIMEOUT = 15.0


def _clean_line(value: Any, field: str, limit: int, *, required: bool = False) -> str:
    if not isinstance(value, str):
        raise HostTrustError(f"{field} must be a string")
    text = value.strip()
    if required and not text:
        raise HostTrustError(f"{field} is required")
    if len(text) > limit:
        raise HostTrustError(f"{field} exceeds {limit} characters")
    if any(ord(char) < 32 or ord(char) == 127 for char in text):
        raise HostTrustError(f"{field} contains control characters")
    return text


def validate_host_details(alias: Any, body: Mapping[str, Any]) -> dict[str, Any]:
    name = _clean_line(alias, "alias", 64, required=True)
    if not _ALIAS_RE.fullmatch(name) or name.startswith("-"):
        raise HostTrustError("alias must start with a letter and use letters, digits, . _ or -")
    address = _clean_line(body.get("address", ""), "address", 253, required=True)
    if address.startswith("-") or any(char in address for char in "[]/@ "):
        raise HostTrustError("address is not a plain hostname or IP address")
    try:
        ipaddress.ip_address(address)
    except ValueError:
        if not _HOSTNAME_RE.fullmatch(address):
            raise HostTrustError("address is not a valid hostname or IP address")
    ssh_user = _clean_line(body.get("ssh_user", "root"), "ssh_user", 64, required=True)
    if not _USER_RE.fullmatch(ssh_user) or ssh_user.startswith("-"):
        raise HostTrustError("ssh_user is invalid")
    host_os = _clean_line(body.get("os", "linux"), "os", 16, required=True).lower()
    if host_os not in {"linux", "macos"}:
        raise HostTrustError("os must be 'linux' or 'macos'")
    port = body.get("port", 22)
    if isinstance(port, bool) or not isinstance(port, int) or not 1 <= port <= 65535:
        raise HostTrustError("port must be an integer between 1 and 65535")
    description = _clean_line(body.get("description", ""), "description", 200)
    description = scrub_output_secrets(description)
    trust_mode = _clean_line(body.get("trust_mode", "pinned"), "trust_mode", 16).lower()
    if trust_mode not in {"legacy", "pinned", "ca", "tofu"}:
        raise HostTrustError("trust_mode must be legacy, pinned, ca, or tofu")
    return {
        "alias": name,
        "address": address,
        "ssh_user": ssh_user,
        "os": host_os,
        "port": port,
        "description": description,
        "enabled": bool(body.get("enabled", True)),
        "trust_mode": trust_mode,
    }


async def _run_argv(
    argv: list[str], timeout: float, *, input_bytes: bytes | None = None
) -> tuple[int, bytes]:
    proc = await asyncio.create_subprocess_exec(
        *argv,
        stdin=asyncio.subprocess.PIPE if input_bytes is not None else None,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    try:
        output, _ = await asyncio.wait_for(proc.communicate(input_bytes), timeout=timeout)
    except (TimeoutError, asyncio.CancelledError):
        if proc.returncode is None:
            proc.kill()
            await proc.wait()
        raise
    return proc.returncode or 0, output


def sanitized_diagnostic(value: bytes | str, limit: int = 500) -> str:
    text = value.decode("utf-8", "replace") if isinstance(value, bytes) else str(value)
    return sanitize_error_text(scrub_output_secrets(text))[:limit]


class HostEnrollmentManager:
    """Short-lived candidates that cannot be targeted before connection test."""

    def __init__(self, registry) -> None:
        self.registry = registry
        self._candidates: dict[str, HostCandidate] = {}

    async def prepare(
        self,
        alias: str,
        body: Mapping[str, Any],
        *,
        allow_tofu: bool,
        existing: ToolHost | None = None,
    ) -> HostCandidate:
        details = validate_host_details(alias, body)
        local = is_local_address(details["address"])
        local_confirmed = body.get("confirm_local") is True
        if local and not local_confirmed:
            raise HostTrustError(
                "local targets execute inside Odin and require confirm_local=true"
            )
        trust_mode = details["trust_mode"]
        if existing is not None and trust_mode == "legacy" and any(
            (
                details["address"] != existing.address,
                details["ssh_user"] != existing.ssh_user,
                details["port"] != existing.port,
                details["os"] != existing.os,
            )
        ):
            raise HostTrustError(
                "endpoint, user, port, or OS edits require pinned enrollment"
            )
        keys: tuple[str, ...] = ()
        fingerprints: tuple[str, ...] = ()
        tofu_confirmed = body.get("confirm_tofu") is True
        if local:
            trust_mode = "legacy"
        elif trust_mode == "legacy":
            if existing is None or existing.trust_mode != "legacy":
                raise HostTrustError("legacy trust is available only to existing legacy hosts")
        else:
            keys = await self.scan(details["address"], details["port"])
            fingerprints = tuple(fingerprint_public_key(key) for key in keys)
            expected = body.get("expected_fingerprints")
            if isinstance(expected, str):
                expected = [expected]
            if trust_mode in {"pinned", "ca"}:
                if not isinstance(expected, list) or not expected:
                    raise HostTrustError("expected_fingerprints is required")
                normalized_expected = tuple(
                    _clean_line(v, "fingerprint", 80, required=True)
                    for v in expected
                )
                if any(not _FINGERPRINT_RE.fullmatch(v) for v in normalized_expected):
                    raise HostTrustError("expected fingerprint must use OpenSSH SHA256: form")
                if not set(normalized_expected).intersection(fingerprints):
                    raise HostTrustError("scanned host key does not match the expected fingerprint")
                keys = tuple(
                    key
                    for key in keys
                    if fingerprint_public_key(key) in set(normalized_expected)
                )
                fingerprints = tuple(fingerprint_public_key(key) for key in keys)
            elif trust_mode == "tofu":
                if not allow_tofu:
                    raise HostTrustError("TOFU is disabled by configuration")
                candidate_fingerprints = body.get("candidate_fingerprints")
                if isinstance(candidate_fingerprints, str):
                    candidate_fingerprints = [candidate_fingerprints]
                if not candidate_fingerprints:
                    # Discovery is not trust. Return a non-targetable preview
                    # token so the UI can display the exact scanned keys; a
                    # second request must bind confirmation to this tuple.
                    tofu_confirmed = False
                elif not tofu_confirmed or tuple(candidate_fingerprints) != fingerprints:
                    raise HostTrustError(
                        "TOFU requires confirm_tofu=true bound to the exact candidate_fingerprints"
                    )
        token = str(uuid.uuid4())
        candidate = HostCandidate(
            token=token,
            alias=details["alias"],
            host_id=(
                (existing.host_id or deterministic_host_id(alias))
                if existing is not None
                else str(uuid.uuid4())
            ),
            address=details["address"],
            ssh_user=details["ssh_user"],
            os=details["os"],
            port=details["port"],
            description=details["description"],
            enabled=details["enabled"],
            trust_mode=trust_mode,
            host_keys=keys,
            fingerprints=fingerprints,
            local_confirmed=local_confirmed,
            tofu_confirmed=tofu_confirmed,
            created_monotonic=time.monotonic(),
            expected_definition=(
                tuple(sorted(existing.model_dump().items())) if existing is not None else None
            ),
        )
        self._candidates[token] = candidate
        self._prune()
        return candidate

    async def scan(self, address: str, port: int) -> tuple[str, ...]:
        code, output = await _run_argv(
            ["ssh-keyscan", "-T", "8", "-p", str(port), address],
            _SCAN_TIMEOUT,
        )
        if code != 0:
            raise HostTrustError(f"host-key scan failed: {sanitized_diagnostic(output)}")
        keys: list[str] = []
        for raw in output.decode("utf-8", "replace").splitlines():
            if not raw or raw.startswith("#"):
                continue
            try:
                normalized = normalize_public_key(raw)
            except HostTrustError:
                continue
            if normalized not in keys:
                keys.append(normalized)
        if not keys:
            raise HostTrustError("host-key scan returned no supported public keys")
        return tuple(keys)

    async def import_legacy(self, alias: str, host: ToolHost) -> HostCandidate:
        if is_local_address(host.address):
            raise HostTrustError("local hosts do not use SSH host-key enrollment")
        query = f"[{host.address}]:{host.port}" if host.port != 22 else host.address
        code, output = await _run_argv(
            ["ssh-keygen", "-F", query, "-f", self.registry.effective_legacy_known_hosts_path],
            8.0,
        )
        if code != 0:
            raise HostTrustError("no matching legacy known_hosts entry was found")
        keys: list[str] = []
        for raw in output.decode("utf-8", "replace").splitlines():
            if raw.startswith("#"):
                continue
            try:
                key = normalize_public_key(raw)
            except HostTrustError:
                continue
            if key not in keys:
                keys.append(key)
        if not keys:
            raise HostTrustError("legacy known_hosts entry has no importable public key")
        token = str(uuid.uuid4())
        candidate = HostCandidate(
            token=token,
            alias=alias,
            host_id=host.host_id or deterministic_host_id(alias),
            address=host.address,
            ssh_user=host.ssh_user,
            os=host.os,
            port=host.port,
            description=host.description,
            enabled=host.enabled,
            trust_mode="pinned",
            host_keys=tuple(keys),
            fingerprints=tuple(fingerprint_public_key(key) for key in keys),
            local_confirmed=False,
            tofu_confirmed=False,
            created_monotonic=time.monotonic(),
            expected_definition=tuple(sorted(host.model_dump().items())),
        )
        self._candidates[token] = candidate
        return candidate

    async def test(self, token: str) -> HostCandidate:
        candidate = self.get(token)
        if is_local_address(candidate.address):
            argv = ["sh", "-c", "printf 'odin-host-test linux\\n'"]
        else:
            legacy = candidate.trust_mode == "legacy"
            known_hosts = (
                self.registry.effective_legacy_known_hosts_path
                if legacy
                else self.registry.materialize_trust(
                    candidate.host_id,
                    f"odin-{candidate.host_id}",
                    candidate.trust_mode,
                    candidate.host_keys,
                )
            )
            remote = (
                "printf 'odin-host-test '; "
                "case \"$(uname -s)\" in Linux) echo linux;; "
                "Darwin) echo macos;; *) echo unknown;; esac"
            )
            argv = [
                "ssh",
                "-i",
                self.registry.effective_key_path,
                "-o",
                f"UserKnownHostsFile={known_hosts}",
                "-o",
                "StrictHostKeyChecking=yes",
                "-o",
                "BatchMode=yes",
                "-o",
                "IdentitiesOnly=yes",
                "-o",
                "PasswordAuthentication=no",
                "-o",
                "KbdInteractiveAuthentication=no",
                "-o",
                "PreferredAuthentications=publickey",
                "-o",
                "ControlMaster=no",
                *(
                    []
                    if legacy
                    else ["-o", f"HostKeyAlias=odin-{candidate.host_id}"]
                ),
                "-o",
                "ConnectTimeout=10",
                "-p",
                str(candidate.port),
                "--",
                f"{candidate.ssh_user}@{candidate.address}",
                remote,
            ]
        try:
            code, output = await _run_argv(argv, _TEST_TIMEOUT)
        except TimeoutError:
            result = {"ok": False, "checked_at": time.time(), "detail": "connection test timed out"}
        else:
            text = sanitized_diagnostic(output)
            observed = text.rsplit(" ", 1)[-1].strip() if text else ""
            ok = code == 0 and text.startswith("odin-host-test ") and observed == candidate.os
            result = {
                "ok": ok,
                "checked_at": time.time(),
                "platform": observed,
                "detail": (
                    "authentication and platform verified"
                    if ok
                    else text or f"ssh exit {code}"
                ),
            }
        active = self.registry.get(candidate.alias)
        mismatch = not result["ok"] and _is_host_key_mismatch(
            str(result.get("detail", ""))
        )
        testing_active_identity = bool(
            active is not None
            and candidate.address == active.address
            and candidate.ssh_user == active.ssh_user
            and candidate.port == active.port
            and candidate.trust_mode == active.trust_mode
            and candidate.host_keys == active.host_keys
        )
        if mismatch and testing_active_identity:
            self.registry.mark_test_result(
                candidate.alias, result, host_key_mismatch=True
            )
        candidate = replace(candidate, tested=bool(result["ok"]), test_result=result)
        self._candidates[token] = candidate
        return candidate

    def get(self, token: str) -> HostCandidate:
        candidate = self._candidates.get(token)
        if candidate is None or time.monotonic() - candidate.created_monotonic > _CANDIDATE_TTL:
            self._candidates.pop(token, None)
            raise HostTrustError("candidate is unknown or expired")
        return candidate

    def consume(self, token: str) -> HostCandidate:
        candidate = self.get(token)
        if candidate.trust_mode == "tofu" and not candidate.tofu_confirmed:
            raise HostTrustError(
                "TOFU candidate requires a second confirmation bound to its exact fingerprints"
            )
        if not candidate.tested:
            raise HostTrustError("candidate must pass the connection test before activation")
        del self._candidates[token]
        return candidate

    def discard(self, token: str) -> None:
        self._candidates.pop(token, None)

    def _prune(self) -> None:
        now = time.monotonic()
        for token, candidate in list(self._candidates.items()):
            if now - candidate.created_monotonic > _CANDIDATE_TTL:
                self._candidates.pop(token, None)


async def public_key_info(private_key_path: str) -> dict[str, str]:
    path = Path(private_key_path)
    if not path.exists():
        raise HostTrustError("effective SSH private key does not exist")
    code, output = await _run_argv(["ssh-keygen", "-y", "-f", str(path)], 8.0)
    if code != 0:
        raise HostTrustError(f"could not derive SSH public key: {sanitized_diagnostic(output)}")
    key = normalize_public_key(output.decode("utf-8", "replace"))
    return {
        "public_key": key,
        "fingerprint": fingerprint_public_key(key),
        "authorized_keys_command": authorized_keys_command(key),
        "permissions": "~/.ssh permissions must be 0700 and authorized_keys 0600",
    }


def authorized_keys_command(public_key: str) -> str:
    key = normalize_public_key(public_key)
    return (
        "umask 077; mkdir -p ~/.ssh; touch ~/.ssh/authorized_keys; "
        f"grep -qxF {shlex.quote(key)} ~/.ssh/authorized_keys || "
        f"printf '%s\\n' {shlex.quote(key)} >> ~/.ssh/authorized_keys; "
        "chmod 700 ~/.ssh; chmod 600 ~/.ssh/authorized_keys"
    )


def scan_host_references(bot: Any, alias: str) -> list[dict[str, str]]:
    refs: list[dict[str, str]] = []

    def add(kind: str, location: str) -> None:
        refs.append({"kind": kind, "location": location})

    access = getattr(bot, "host_access_manager", None)
    if access is not None:
        policy = access.default_policy
        if policy.allowed_hosts is not None and alias in policy.allowed_hosts:
            add("host_access", "default_policy.allowed_hosts")
        if policy.default_host == alias:
            add("host_access", "default_policy.default_host")
        for user_id, entry in access.list_users().items():
            if entry.get("allowed_hosts") is not None and alias in entry["allowed_hosts"]:
                add("host_access", f"users.{user_id}.allowed_hosts")
            if entry.get("default_host") == alias:
                add("host_access", f"users.{user_id}.default_host")
    token_manager = getattr(bot, "api_token_manager", None)
    if token_manager is not None:
        for token in token_manager.list_tokens():
            if token.get("allowed_hosts") is not None and alias in token["allowed_hosts"]:
                add("api_token", f"dynamic.{token.get('user_id', '')}.allowed_hosts")
            if token.get("default_host") == alias:
                add("api_token", f"dynamic.{token.get('user_id', '')}.default_host")
    config = bot.config
    for index, token in enumerate(config.web.api_tokens):
        if token.allowed_hosts is not None and alias in token.allowed_hosts:
            add("api_token", f"web.api_tokens.{index}.allowed_hosts")
        if token.default_host == alias:
            add("api_token", f"web.api_tokens.{index}.default_host")
    if alias in config.tools.governor.host_overrides:
        add("governor", f"tools.governor.host_overrides.{alias}")
    if config.tools.default_host == alias:
        add("default_host", "tools.default_host")

    def walk(value: Any, path: str) -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                child_path = f"{path}.{key}" if path else str(key)
                if key in {"host", "default_host"} and child == alias:
                    add("task_reference", child_path)
                if key == "hosts" and isinstance(child, list) and alias in child:
                    add("task_reference", child_path)
                walk(child, child_path)
        elif isinstance(value, list):
            for index, child in enumerate(value):
                walk(child, f"{path}.{index}")

    scheduler = getattr(bot, "scheduler", None)
    for index, schedule in enumerate(scheduler.list_all() if scheduler else []):
        walk(schedule, f"schedules.{index}")
    channel_state = getattr(bot, "channel_state", None)
    tasks = getattr(channel_state, "background_tasks", {}) if channel_state else {}
    for task_id, task in tasks.items():
        if task.status not in {"completed", "failed", "cancelled", "done"}:
            walk(task.steps, f"background_tasks.{task_id}.steps")
    return refs


def _is_host_key_mismatch(detail: str) -> bool:
    """Recognize OpenSSH's strict host-identity refusal diagnostics."""
    lowered = detail.lower()
    return any(
        marker in lowered
        for marker in (
            "remote host identification has changed",
            "host key verification failed",
            "offending ",
        )
    )
