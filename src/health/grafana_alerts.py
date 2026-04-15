"""Grafana alert parser and auto-remediation handler.

Parses Grafana unified alerting webhook payloads into structured objects,
matches alerts against configurable rules, and spawns autonomous remediation
loops for matching firing alerts.
"""
from __future__ import annotations

import fnmatch
import re
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from ..odin_log import get_logger

log = get_logger("grafana_alerts")

MAX_ALERT_HISTORY = 200
MAX_CONCURRENT_REMEDIATIONS = 5
DEFAULT_COOLDOWN_SECONDS = 300  # 5 minutes between remediations for same alert
DEFAULT_REMEDIATION_INTERVAL = 30  # seconds between loop iterations
DEFAULT_REMEDIATION_MAX_ITER = 10
MAX_ANNOTATION_LEN = 1000
MAX_LABEL_VALUE_LEN = 500


@dataclass
class GrafanaAlert:
    """Parsed Grafana alert with all relevant fields."""
    fingerprint: str
    status: str  # "firing" or "resolved"
    alert_name: str
    labels: dict[str, str]
    annotations: dict[str, str]
    starts_at: str
    ends_at: str
    generator_url: str
    silence_url: str
    dashboard_url: str
    panel_url: str
    values: dict[str, Any]
    severity: str  # extracted from labels or "unknown"
    instance: str  # extracted from labels or ""
    summary: str  # extracted from annotations or ""
    description: str  # extracted from annotations or ""
    received_at: float = field(default_factory=time.monotonic)


@dataclass
class RemediationRule:
    """Rule mapping alert patterns to remediation goals."""
    id: str
    name_pattern: str  # fnmatch pattern for alert_name
    label_matchers: dict[str, str] = field(default_factory=dict)  # label_key -> fnmatch pattern
    severity_filter: list[str] = field(default_factory=list)  # empty = match all
    remediation_goal: str = ""
    mode: str = "notify"  # "notify", "act", "silent"
    interval_seconds: int = DEFAULT_REMEDIATION_INTERVAL
    max_iterations: int = DEFAULT_REMEDIATION_MAX_ITER
    cooldown_seconds: int = DEFAULT_COOLDOWN_SECONDS
    enabled: bool = True


@dataclass
class RemediationRecord:
    """Tracks an active or completed remediation spawned from an alert."""
    alert_fingerprint: str
    alert_name: str
    rule_id: str
    loop_id: str
    started_at: float
    status: str = "running"  # "running", "completed", "error"


def parse_grafana_payload(data: dict) -> list[GrafanaAlert]:
    """Parse a Grafana unified alerting webhook payload into GrafanaAlert objects.

    Handles both the unified alerting format (alerts array) and the legacy
    single-alert format (title + message).
    """
    alerts_raw = data.get("alerts", [])
    if not alerts_raw:
        title = data.get("title", data.get("ruleName", ""))
        message = data.get("message", data.get("state", ""))
        if not title and not message:
            return []
        return [GrafanaAlert(
            fingerprint=_make_fingerprint(title, {}),
            status=data.get("state", "alerting"),
            alert_name=title,
            labels={},
            annotations={"summary": message} if message else {},
            starts_at="",
            ends_at="",
            generator_url=data.get("ruleUrl", ""),
            silence_url="",
            dashboard_url="",
            panel_url="",
            values={},
            severity="unknown",
            instance="",
            summary=message[:MAX_ANNOTATION_LEN] if message else "",
            description="",
        )]

    parsed: list[GrafanaAlert] = []
    for raw in alerts_raw:
        labels = raw.get("labels", {})
        annotations = raw.get("annotations", {})
        values = raw.get("values") or raw.get("valueString") or {}
        if isinstance(values, str):
            values = {"raw": values}

        alert_name = labels.get("alertname", raw.get("alertname", "Unknown"))
        severity = labels.get("severity", "unknown")
        instance = labels.get("instance", "")
        summary = annotations.get("summary", "")[:MAX_ANNOTATION_LEN]
        description = annotations.get("description", "")[:MAX_ANNOTATION_LEN]

        fingerprint = raw.get("fingerprint", _make_fingerprint(alert_name, labels))

        parsed.append(GrafanaAlert(
            fingerprint=fingerprint,
            status=raw.get("status", "unknown"),
            alert_name=alert_name,
            labels={k: str(v)[:MAX_LABEL_VALUE_LEN] for k, v in labels.items()},
            annotations={k: str(v)[:MAX_ANNOTATION_LEN] for k, v in annotations.items()},
            starts_at=raw.get("startsAt", ""),
            ends_at=raw.get("endsAt", ""),
            generator_url=raw.get("generatorURL", ""),
            silence_url=raw.get("silenceURL", ""),
            dashboard_url=raw.get("dashboardURL", ""),
            panel_url=raw.get("panelURL", ""),
            values=values,
            severity=severity,
            instance=instance,
            summary=summary,
            description=description,
        ))

    return parsed


def format_alert_message(alerts: list[GrafanaAlert]) -> str:
    """Format parsed alerts into a Discord message."""
    if not alerts:
        return "**Grafana Alert** \u2014 (no alerts in payload)"

    lines: list[str] = []
    for alert in alerts[:10]:
        emoji = "\U0001f534" if alert.status == "firing" else "\U0001f7e2"
        line = f"{emoji} **{alert.alert_name}** ({alert.status})"
        if alert.instance:
            line += f" \u2014 `{alert.instance}`"
        if alert.severity and alert.severity != "unknown":
            line += f" [{alert.severity}]"
        if alert.summary:
            line += f"\n  {alert.summary[:200]}"
        elif alert.description:
            line += f"\n  {alert.description[:200]}"
        if alert.values and isinstance(alert.values, dict) and "raw" not in alert.values:
            val_parts = [f"{k}={v}" for k, v in list(alert.values.items())[:3]]
            if val_parts:
                line += f"\n  Values: {', '.join(val_parts)}"
        lines.append(line)

    header = f"**Grafana Alerts** ({len(alerts)} alert(s)):"
    if len(alerts) == 1:
        header = "**Grafana Alert**:"
    return header + "\n" + "\n".join(lines)


def _make_fingerprint(name: str, labels: dict) -> str:
    """Generate a deterministic fingerprint from alert name + labels."""
    parts = [name] + [f"{k}={v}" for k, v in sorted(labels.items())]
    import hashlib
    return hashlib.md5("|".join(parts).encode()).hexdigest()[:16]


def matches_rule(alert: GrafanaAlert, rule: RemediationRule) -> bool:
    """Check if an alert matches a remediation rule."""
    if not rule.enabled:
        return False
    if not fnmatch.fnmatch(alert.alert_name, rule.name_pattern):
        return False
    if rule.severity_filter and alert.severity not in rule.severity_filter:
        return False
    for label_key, pattern in rule.label_matchers.items():
        label_val = alert.labels.get(label_key, "")
        if not fnmatch.fnmatch(label_val, pattern):
            return False
    return True


def build_remediation_prompt(alert: GrafanaAlert, rule: RemediationRule) -> str:
    """Build the goal prompt for a remediation loop from alert + rule context."""
    parts = [
        f"ALERT REMEDIATION: {alert.alert_name} is {alert.status}",
    ]
    if alert.instance:
        parts.append(f"Instance: {alert.instance}")
    if alert.severity != "unknown":
        parts.append(f"Severity: {alert.severity}")
    if alert.summary:
        parts.append(f"Summary: {alert.summary[:300]}")
    elif alert.description:
        parts.append(f"Description: {alert.description[:300]}")
    if alert.values and isinstance(alert.values, dict):
        val_str = ", ".join(f"{k}={v}" for k, v in list(alert.values.items())[:5])
        if val_str:
            parts.append(f"Values: {val_str}")

    parts.append("")
    if rule.remediation_goal:
        parts.append(f"Goal: {rule.remediation_goal}")
    else:
        parts.append(
            f"Goal: Investigate and remediate the alert '{alert.alert_name}'. "
            "Check the affected service, diagnose root cause, and take corrective action if safe."
        )

    parts.append("")
    parts.append(
        "Stop condition: The alert is resolved or you have diagnosed the issue "
        "and taken corrective action (or determined no action is needed)."
    )

    return "\n".join(parts)


class GrafanaAlertHandler:
    """Manages Grafana alert parsing, rule matching, and remediation loop spawning."""

    def __init__(
        self,
        rules: list[RemediationRule] | None = None,
        auto_remediate: bool = False,
        cooldown_seconds: int = DEFAULT_COOLDOWN_SECONDS,
        max_concurrent: int = MAX_CONCURRENT_REMEDIATIONS,
    ) -> None:
        self._rules: list[RemediationRule] = list(rules or [])
        self._auto_remediate = auto_remediate
        self._cooldown_seconds = cooldown_seconds
        self._max_concurrent = max_concurrent
        self._alert_history: deque[dict] = deque(maxlen=MAX_ALERT_HISTORY)
        self._remediations: dict[str, RemediationRecord] = {}
        self._cooldowns: dict[str, float] = {}  # fingerprint -> last_remediation_time
        self._stats = {"alerts_received": 0, "remediations_spawned": 0, "rules_matched": 0}

    @property
    def rules(self) -> list[RemediationRule]:
        return list(self._rules)

    @property
    def alert_history(self) -> list[dict]:
        return list(self._alert_history)

    @property
    def active_remediations(self) -> dict[str, RemediationRecord]:
        return dict(self._remediations)

    def add_rule(self, rule: RemediationRule) -> None:
        for existing in self._rules:
            if existing.id == rule.id:
                raise ValueError(f"Rule with id '{rule.id}' already exists")
        self._rules.append(rule)
        log.info("Added remediation rule: %s (pattern=%s)", rule.id, rule.name_pattern)

    def remove_rule(self, rule_id: str) -> bool:
        for i, rule in enumerate(self._rules):
            if rule.id == rule_id:
                self._rules.pop(i)
                log.info("Removed remediation rule: %s", rule_id)
                return True
        return False

    def get_rule(self, rule_id: str) -> RemediationRule | None:
        for rule in self._rules:
            if rule.id == rule_id:
                return rule
        return None

    def process_alerts(self, alerts: list[GrafanaAlert]) -> list[tuple[GrafanaAlert, RemediationRule]]:
        """Process alerts and return (alert, rule) pairs that should spawn remediations.

        Only firing alerts are considered for remediation. Resolved alerts are
        recorded in history but don't trigger new loops.
        """
        self._stats["alerts_received"] += len(alerts)
        matches: list[tuple[GrafanaAlert, RemediationRule]] = []

        for alert in alerts:
            self._alert_history.append({
                "fingerprint": alert.fingerprint,
                "alert_name": alert.alert_name,
                "status": alert.status,
                "severity": alert.severity,
                "instance": alert.instance,
                "summary": alert.summary[:200],
                "received_at": alert.received_at,
                "labels": dict(list(alert.labels.items())[:10]),
            })

            if alert.status != "firing":
                self._mark_resolved(alert.fingerprint)
                continue

            if not self._auto_remediate:
                continue

            for rule in self._rules:
                if matches_rule(alert, rule):
                    cooldown_key = f"{alert.fingerprint}:{rule.id}"
                    if self._is_on_cooldown(cooldown_key, rule.cooldown_seconds):
                        log.debug(
                            "Alert %s matches rule %s but is on cooldown",
                            alert.alert_name, rule.id,
                        )
                        continue
                    if self._count_active() >= self._max_concurrent:
                        log.warning(
                            "Max concurrent remediations (%d) reached, skipping %s",
                            self._max_concurrent, alert.alert_name,
                        )
                        continue
                    self._stats["rules_matched"] += 1
                    matches.append((alert, rule))
                    self._cooldowns[cooldown_key] = time.monotonic()
                    break  # first matching rule wins

        return matches

    def record_remediation(
        self, alert: GrafanaAlert, rule: RemediationRule, loop_id: str,
    ) -> None:
        """Record that a remediation loop was spawned for an alert."""
        self._remediations[loop_id] = RemediationRecord(
            alert_fingerprint=alert.fingerprint,
            alert_name=alert.alert_name,
            rule_id=rule.id,
            loop_id=loop_id,
            started_at=time.monotonic(),
        )
        self._stats["remediations_spawned"] += 1
        log.info(
            "Remediation loop %s spawned for alert %s (rule %s)",
            loop_id, alert.alert_name, rule.id,
        )

    def update_remediation_status(self, loop_id: str, status: str) -> None:
        """Update the status of a tracked remediation."""
        rec = self._remediations.get(loop_id)
        if rec:
            rec.status = status

    def _mark_resolved(self, fingerprint: str) -> None:
        """Mark active remediations for a fingerprint as completed."""
        for rec in self._remediations.values():
            if rec.alert_fingerprint == fingerprint and rec.status == "running":
                rec.status = "completed"

    def _is_on_cooldown(self, key: str, cooldown_seconds: int) -> bool:
        last = self._cooldowns.get(key, 0)
        return (time.monotonic() - last) < cooldown_seconds

    def _count_active(self) -> int:
        return sum(1 for r in self._remediations.values() if r.status == "running")

    def cleanup_old_remediations(self) -> int:
        """Remove completed/errored remediations older than 1 hour and stale cooldowns."""
        now = time.monotonic()
        to_remove = [
            lid for lid, rec in self._remediations.items()
            if rec.status != "running" and (now - rec.started_at) > 3600
        ]
        for lid in to_remove:
            del self._remediations[lid]
        max_cooldown = max(
            (r.cooldown_seconds for r in self._rules),
            default=self._cooldown_seconds,
        )
        stale_keys = [
            k for k, ts in self._cooldowns.items()
            if (now - ts) > max_cooldown * 2
        ]
        for k in stale_keys:
            del self._cooldowns[k]
        return len(to_remove) + len(stale_keys)

    def get_status(self) -> dict:
        """Return handler status for API/status endpoints."""
        active = self._count_active()
        return {
            "auto_remediate": self._auto_remediate,
            "rules_count": len(self._rules),
            "alerts_received": self._stats["alerts_received"],
            "remediations_spawned": self._stats["remediations_spawned"],
            "rules_matched": self._stats["rules_matched"],
            "active_remediations": active,
            "alert_history_size": len(self._alert_history),
            "max_concurrent": self._max_concurrent,
            "cooldown_seconds": self._cooldown_seconds,
        }

    def get_rules_list(self) -> list[dict]:
        """Return rules as serializable dicts."""
        return [
            {
                "id": r.id,
                "name_pattern": r.name_pattern,
                "label_matchers": r.label_matchers,
                "severity_filter": r.severity_filter,
                "remediation_goal": r.remediation_goal,
                "mode": r.mode,
                "interval_seconds": r.interval_seconds,
                "max_iterations": r.max_iterations,
                "cooldown_seconds": r.cooldown_seconds,
                "enabled": r.enabled,
            }
            for r in self._rules
        ]

    def get_remediations_list(self) -> list[dict]:
        """Return remediations as serializable dicts."""
        return [
            {
                "loop_id": r.loop_id,
                "alert_fingerprint": r.alert_fingerprint,
                "alert_name": r.alert_name,
                "rule_id": r.rule_id,
                "started_at": r.started_at,
                "status": r.status,
            }
            for r in self._remediations.values()
        ]
