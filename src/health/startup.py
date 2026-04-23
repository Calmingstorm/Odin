"""Startup diagnostics — boot-time checks with helpful error messages.

Runs a series of checks against the configuration and filesystem at bot
startup to catch misconfigurations early.  Each check returns a
:class:`DiagnosticResult` with a human-readable recommendation on how to
fix any problem.

All checks are **non-blocking** and **fail-open**: a failing check logs a
warning but does not prevent the bot from starting.  The results are also
exposed via the ``/api/startup/diagnostics`` REST endpoint for operators.
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ..odin_log import get_logger

log = get_logger("health.startup")


@dataclass(slots=True)
class DiagnosticResult:
    """Outcome of a single boot-time diagnostic check."""

    name: str
    passed: bool
    detail: str
    recommendation: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "name": self.name,
            "passed": self.passed,
            "detail": self.detail,
        }
        if self.recommendation:
            d["recommendation"] = self.recommendation
        if self.metadata:
            d["metadata"] = self.metadata
        return d


@dataclass
class StartupReport:
    """Aggregated results from all boot-time diagnostic checks."""

    results: list[DiagnosticResult] = field(default_factory=list)
    started_at: float = 0.0
    finished_at: float = 0.0

    @property
    def all_passed(self) -> bool:
        return all(r.passed for r in self.results)

    @property
    def passed_count(self) -> int:
        return sum(1 for r in self.results if r.passed)

    @property
    def failed_count(self) -> int:
        return sum(1 for r in self.results if not r.passed)

    @property
    def duration_ms(self) -> float:
        if self.finished_at and self.started_at:
            return round((self.finished_at - self.started_at) * 1000, 1)
        return 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "all_passed": self.all_passed,
            "passed_count": self.passed_count,
            "failed_count": self.failed_count,
            "total_checks": len(self.results),
            "duration_ms": self.duration_ms,
            "results": [r.to_dict() for r in self.results],
        }


# ------------------------------------------------------------------
# Individual diagnostic checks
# ------------------------------------------------------------------


def check_discord_token(config: Any) -> DiagnosticResult:
    """Verify that a Discord token is present (non-empty)."""
    token = getattr(config, "token", "")
    if not token:
        return DiagnosticResult(
            name="discord_token",
            passed=False,
            detail="Discord bot token is missing or empty",
            recommendation="Set DISCORD_TOKEN in your .env file or shell environment.",
        )
    # Mask token for metadata — show first 5 chars only
    masked = token[:5] + "…" if len(token) > 5 else token
    return DiagnosticResult(
        name="discord_token",
        passed=True,
        detail="Discord token present",
        metadata={"token_prefix": masked, "token_length": len(token)},
    )


def check_codex_credentials(codex_config: Any) -> DiagnosticResult:
    """Check that the Codex credentials file exists and contains a token."""
    enabled = getattr(codex_config, "enabled", False)
    if not enabled:
        return DiagnosticResult(
            name="codex_credentials",
            passed=True,
            detail="Codex is disabled in config — skipped",
            metadata={"enabled": False},
        )

    creds_path = getattr(codex_config, "credentials_path", "")
    if not creds_path:
        return DiagnosticResult(
            name="codex_credentials",
            passed=False,
            detail="Codex credentials_path is empty",
            recommendation="Set openai_codex.credentials_path in config.yml (default: ./data/codex_auth.json).",
        )

    path = Path(creds_path)
    if not path.exists():
        return DiagnosticResult(
            name="codex_credentials",
            passed=False,
            detail=f"Credentials file not found: {creds_path}",
            recommendation="Run scripts/codex_login.py to authenticate with OpenAI Codex.",
            metadata={"path": creds_path},
        )

    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        return DiagnosticResult(
            name="codex_credentials",
            passed=False,
            detail=f"Cannot parse credentials file: {exc}",
            recommendation="Delete the file and re-run scripts/codex_login.py.",
            metadata={"path": creds_path},
        )

    # Support both single-object and array (pool) format
    if isinstance(data, list):
        valid = sum(1 for d in data if isinstance(d, dict) and d.get("access_token"))
        if valid == 0:
            return DiagnosticResult(
                name="codex_credentials",
                passed=False,
                detail=f"Credentials file has {len(data)} entries but none have access_token",
                recommendation="Re-run scripts/codex_login.py to generate valid credentials.",
                metadata={"path": creds_path, "entries": len(data)},
            )
        # Check expiry on first valid entry
        first_valid = next(d for d in data if isinstance(d, dict) and d.get("access_token"))
        expires_at = first_valid.get("expires_at", 0)
        expired = time.time() > expires_at if expires_at else False
        return DiagnosticResult(
            name="codex_credentials",
            passed=True,
            detail=f"Codex auth pool: {valid} valid credential(s)",
            metadata={"path": creds_path, "accounts": valid, "format": "pool",
                       "first_expired": expired},
        )

    if not isinstance(data, dict) or not data.get("access_token"):
        return DiagnosticResult(
            name="codex_credentials",
            passed=False,
            detail="Credentials file does not contain an access_token",
            recommendation="Re-run scripts/codex_login.py to generate valid credentials.",
            metadata={"path": creds_path},
        )

    expires_at = data.get("expires_at", 0)
    expired = time.time() > expires_at if expires_at else False
    has_refresh = bool(data.get("refresh_token"))
    meta: dict[str, Any] = {
        "path": creds_path,
        "format": "single",
        "expired": expired,
        "has_refresh_token": has_refresh,
    }
    if expired and not has_refresh:
        return DiagnosticResult(
            name="codex_credentials",
            passed=False,
            detail="Access token expired and no refresh token available",
            recommendation="Re-run scripts/codex_login.py to re-authenticate.",
            metadata=meta,
        )
    detail = "Codex credentials valid"
    if expired:
        detail += " (token expired, will refresh on first use)"
    return DiagnosticResult(
        name="codex_credentials",
        passed=True,
        detail=detail,
        metadata=meta,
    )


def check_ssh_hosts(tools_config: Any) -> DiagnosticResult:
    """Verify SSH key and known_hosts exist when SSH hosts are configured."""
    hosts = getattr(tools_config, "hosts", {})
    if not hosts:
        return DiagnosticResult(
            name="ssh_hosts",
            passed=True,
            detail="No SSH hosts configured — skipped",
            metadata={"host_count": 0},
        )

    ssh_key = getattr(tools_config, "ssh_key_path", "")
    known_hosts = getattr(tools_config, "ssh_known_hosts_path", "")
    issues: list[str] = []
    meta: dict[str, Any] = {"host_count": len(hosts)}

    if ssh_key and not Path(ssh_key).exists():
        issues.append(f"SSH key not found: {ssh_key}")
        meta["ssh_key_exists"] = False
    elif ssh_key:
        meta["ssh_key_exists"] = True

    if known_hosts and not Path(known_hosts).exists():
        issues.append(f"Known hosts file not found: {known_hosts}")
        meta["known_hosts_exists"] = False
    elif known_hosts:
        meta["known_hosts_exists"] = True

    host_names = list(hosts.keys()) if isinstance(hosts, dict) else []
    meta["hosts"] = host_names

    if issues:
        return DiagnosticResult(
            name="ssh_hosts",
            passed=False,
            detail="; ".join(issues),
            recommendation=(
                "Ensure tools.ssh_key_path and tools.ssh_known_hosts_path "
                "point to existing files. Generate a key with: ssh-keygen -t ed25519"
            ),
            metadata=meta,
        )

    return DiagnosticResult(
        name="ssh_hosts",
        passed=True,
        detail=f"{len(hosts)} SSH host(s) configured, key and known_hosts present",
        metadata=meta,
    )


def check_sessions_directory(sessions_config: Any) -> DiagnosticResult:
    """Verify that the sessions persist directory exists or can be created."""
    persist_dir = getattr(sessions_config, "persist_directory", "")
    if not persist_dir:
        return DiagnosticResult(
            name="sessions_directory",
            passed=True,
            detail="No persist directory configured — sessions are in-memory only",
        )

    path = Path(persist_dir)
    try:
        exists = path.is_dir()
    except OSError:
        exists = False

    if exists:
        # Check writability
        try:
            test_file = path / ".odin_write_test"
            test_file.write_text("ok")
            test_file.unlink()
            writable = True
        except OSError:
            writable = False

        if not writable:
            return DiagnosticResult(
                name="sessions_directory",
                passed=False,
                detail=f"Sessions directory exists but is not writable: {persist_dir}",
                recommendation=f"Fix permissions: chmod 755 {persist_dir}",
                metadata={"path": persist_dir, "exists": True, "writable": False},
            )

        return DiagnosticResult(
            name="sessions_directory",
            passed=True,
            detail=f"Sessions directory exists and is writable: {persist_dir}",
            metadata={"path": persist_dir, "exists": True, "writable": True},
        )

    # Directory doesn't exist — try to create it
    try:
        path.mkdir(parents=True, exist_ok=True)
        return DiagnosticResult(
            name="sessions_directory",
            passed=True,
            detail=f"Sessions directory created: {persist_dir}",
            metadata={"path": persist_dir, "created": True},
        )
    except OSError as exc:
        return DiagnosticResult(
            name="sessions_directory",
            passed=False,
            detail=f"Cannot create sessions directory: {exc}",
            recommendation=f"Create it manually: mkdir -p {persist_dir}",
            metadata={"path": persist_dir, "exists": False},
        )


def check_knowledge_db(search_config: Any) -> DiagnosticResult:
    """Verify the knowledge store SQLite DB path is accessible."""
    enabled = getattr(search_config, "enabled", True)
    if not enabled:
        return DiagnosticResult(
            name="knowledge_db",
            passed=True,
            detail="Knowledge search is disabled — skipped",
            metadata={"enabled": False},
        )

    db_path = getattr(search_config, "search_db_path", "")
    if not db_path:
        return DiagnosticResult(
            name="knowledge_db",
            passed=False,
            detail="Knowledge search_db_path is empty",
            recommendation="Set search.search_db_path in config.yml (default: ./data/search).",
        )

    # The knowledge store uses a directory path — the actual DB file is inside
    parent = Path(db_path)
    if not parent.exists():
        try:
            parent.mkdir(parents=True, exist_ok=True)
            return DiagnosticResult(
                name="knowledge_db",
                passed=True,
                detail=f"Knowledge DB directory created: {db_path}",
                metadata={"path": db_path, "created": True},
            )
        except OSError as exc:
            return DiagnosticResult(
                name="knowledge_db",
                passed=False,
                detail=f"Cannot create knowledge DB directory: {exc}",
                recommendation=f"Create it manually: mkdir -p {db_path}",
                metadata={"path": db_path},
            )

    # Check SQLite can open a connection at this path
    test_db = parent / "knowledge.db" if parent.is_dir() else parent
    try:
        conn = sqlite3.connect(str(test_db))
        conn.execute("SELECT 1")
        conn.close()
    except sqlite3.Error as exc:
        return DiagnosticResult(
            name="knowledge_db",
            passed=False,
            detail=f"SQLite cannot open knowledge DB: {exc}",
            recommendation="Check disk space and file permissions.",
            metadata={"path": str(test_db)},
        )

    return DiagnosticResult(
        name="knowledge_db",
        passed=True,
        detail=f"Knowledge DB accessible: {db_path}",
        metadata={"path": db_path, "exists": True},
    )


def check_config_sections(config: Any) -> DiagnosticResult:
    """Validate that key config sections are internally consistent."""
    issues: list[str] = []

    # Discord section required
    discord_cfg = getattr(config, "discord", None)
    if discord_cfg is None:
        issues.append("Missing 'discord' config section")
    elif not getattr(discord_cfg, "token", ""):
        issues.append("discord.token is empty")

    # Web config: warn about default/empty api_token
    web_cfg = getattr(config, "web", None)
    if web_cfg and getattr(web_cfg, "enabled", False):
        api_token = getattr(web_cfg, "api_token", "")
        if not api_token:
            issues.append("web.api_token is empty — API has no authentication (dev mode)")

    # Monitoring: if enabled, check it has at least one check
    mon_cfg = getattr(config, "monitoring", None)
    if mon_cfg and getattr(mon_cfg, "enabled", False):
        checks = getattr(mon_cfg, "checks", [])
        if not checks:
            issues.append("monitoring.enabled=true but no checks defined")
        alert_channel = getattr(mon_cfg, "alert_channel_id", "")
        if not alert_channel:
            issues.append("monitoring.enabled=true but alert_channel_id is empty")

    # Webhook: if enabled, verify secret is set
    webhook_cfg = getattr(config, "webhook", None)
    if webhook_cfg and getattr(webhook_cfg, "enabled", False):
        secret = getattr(webhook_cfg, "secret", "")
        if not secret:
            issues.append("webhook.enabled=true but secret is empty")

    if issues:
        return DiagnosticResult(
            name="config_consistency",
            passed=False,
            detail=f"{len(issues)} config issue(s): " + "; ".join(issues),
            recommendation="Review config.yml and fix the reported issues.",
            metadata={"issues": issues},
        )

    return DiagnosticResult(
        name="config_consistency",
        passed=True,
        detail="Config sections are consistent",
    )


def check_data_directories() -> DiagnosticResult:
    """Verify core data directories exist or can be created."""
    dirs = [
        "data",
        "data/sessions",
        "data/trajectories",
        "data/skills",
        "data/logs",
    ]
    created: list[str] = []
    failed: list[str] = []

    for d in dirs:
        p = Path(d)
        if p.is_dir():
            continue
        try:
            p.mkdir(parents=True, exist_ok=True)
            created.append(d)
        except OSError:
            failed.append(d)

    if failed:
        return DiagnosticResult(
            name="data_directories",
            passed=False,
            detail=f"Cannot create directories: {', '.join(failed)}",
            recommendation="Create them manually or fix filesystem permissions.",
            metadata={"failed": failed, "created": created},
        )

    detail = "All data directories present"
    if created:
        detail += f" ({len(created)} created)"
    return DiagnosticResult(
        name="data_directories",
        passed=True,
        detail=detail,
        metadata={"created": created} if created else {},
    )


def check_codex_model(codex_config: Any) -> DiagnosticResult:
    """Verify the configured Codex model name is non-empty."""
    enabled = getattr(codex_config, "enabled", False)
    if not enabled:
        return DiagnosticResult(
            name="codex_model",
            passed=True,
            detail="Codex is disabled — skipped",
            metadata={"enabled": False},
        )

    model = getattr(codex_config, "model", "")
    if not model:
        return DiagnosticResult(
            name="codex_model",
            passed=False,
            detail="openai_codex.model is empty",
            recommendation="Set openai_codex.model in config.yml (e.g., gpt-4o).",
        )

    return DiagnosticResult(
        name="codex_model",
        passed=True,
        detail=f"Codex model: {model}",
        metadata={"model": model},
    )


# ------------------------------------------------------------------
# Ordered list of all diagnostic checks
# ------------------------------------------------------------------

_CONFIG_CHECKS = [
    # (name, callable, config_attribute_or_None)
    ("discord_token", check_discord_token, None),  # uses top-level OdinConfig
    ("codex_credentials", check_codex_credentials, "openai_codex"),
    ("codex_model", check_codex_model, "openai_codex"),
    ("ssh_hosts", check_ssh_hosts, "tools"),
    ("sessions_directory", check_sessions_directory, "sessions"),
    ("knowledge_db", check_knowledge_db, "search"),
    ("config_consistency", check_config_sections, None),  # uses full Config
]


def run_startup_diagnostics(
    *,
    odin_config: Any | None = None,
    yaml_config: Any | None = None,
) -> StartupReport:
    """Run all boot-time diagnostic checks and return a :class:`StartupReport`.

    Parameters
    ----------
    odin_config:
        The :class:`OdinConfig` instance (env-based config with token, prefix, etc.).
    yaml_config:
        The :class:`Config` instance (YAML-based config with all subsystem settings).

    Both are optional — checks that require a missing config are skipped.
    """
    report = StartupReport(started_at=time.time())

    for name, check_fn, config_attr in _CONFIG_CHECKS:
        try:
            if config_attr is None:
                # Check uses either odin_config (discord_token) or yaml_config (config_consistency)
                if name == "discord_token":
                    if odin_config is None:
                        report.results.append(DiagnosticResult(
                            name=name, passed=True,
                            detail="OdinConfig not provided — skipped",
                        ))
                        continue
                    result = check_fn(odin_config)
                else:
                    if yaml_config is None:
                        report.results.append(DiagnosticResult(
                            name=name, passed=True,
                            detail="YAML config not provided — skipped",
                        ))
                        continue
                    result = check_fn(yaml_config)
            else:
                if yaml_config is None:
                    report.results.append(DiagnosticResult(
                        name=name, passed=True,
                        detail="YAML config not provided — skipped",
                    ))
                    continue
                sub_config = getattr(yaml_config, config_attr, None)
                if sub_config is None:
                    report.results.append(DiagnosticResult(
                        name=name, passed=True,
                        detail=f"Config section '{config_attr}' not present — skipped",
                    ))
                    continue
                result = check_fn(sub_config)
            report.results.append(result)
        except Exception as exc:
            report.results.append(DiagnosticResult(
                name=name,
                passed=False,
                detail=f"Check crashed: {exc}",
                recommendation="This is a bug — report to the developer.",
            ))

    # Data directories check (no config needed)
    try:
        report.results.append(check_data_directories())
    except Exception as exc:
        report.results.append(DiagnosticResult(
            name="data_directories",
            passed=False,
            detail=f"Check crashed: {exc}",
            recommendation="This is a bug — report to the developer.",
        ))

    report.finished_at = time.time()

    # Log summary
    if report.all_passed:
        log.info(
            "Startup diagnostics: %d/%d passed (%.1fms)",
            report.passed_count, len(report.results), report.duration_ms,
        )
    else:
        log.warning(
            "Startup diagnostics: %d/%d passed, %d FAILED (%.1fms)",
            report.passed_count, len(report.results),
            report.failed_count, report.duration_ms,
        )
        for r in report.results:
            if not r.passed:
                msg = f"  FAIL [{r.name}]: {r.detail}"
                if r.recommendation:
                    msg += f" → {r.recommendation}"
                log.warning(msg)

    return report
