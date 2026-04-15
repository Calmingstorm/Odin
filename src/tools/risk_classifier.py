"""Command risk classifier — tags tool calls by risk level for observability.

Observability only: classifies commands/tools into risk tiers (low, medium,
high, critical) so operators can monitor dangerous operations.  Never blocks
execution — the classification is logged in audit entries and exposed via
metrics.
"""
from __future__ import annotations

import re
import threading
from collections import defaultdict
from enum import Enum
from typing import NamedTuple

from ..odin_log import get_logger

log = get_logger("risk_classifier")


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class RiskAssessment(NamedTuple):
    level: RiskLevel
    reason: str


# --- Command pattern definitions ---
# Each tuple: (compiled regex, reason string)
# Checked top-down; first match wins within a tier.

_CRITICAL_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\brm\s+.*-[a-zA-Z]*r[a-zA-Z]*f?.*\s+/\s*$"), "recursive delete on root"),
    (re.compile(r"\brm\s+.*-[a-zA-Z]*f[a-zA-Z]*r?.*\s+/\s*$"), "forced delete on root"),
    (re.compile(r"\bmkfs\b"), "filesystem format"),
    (re.compile(r"\bdd\s+.*\bif="), "raw disk write"),
    (re.compile(r":\(\)\s*\{\s*:\|:&\s*\}\s*;"), "fork bomb"),
    (re.compile(r"\b(shutdown|poweroff|halt|init\s+0)\b"), "system shutdown"),
    (re.compile(r"\breboot\b"), "system reboot"),
    (re.compile(r"\bchmod\s+.*-[a-zA-Z]*R.*\s+777\s+/"), "recursive world-writable root"),
    (re.compile(r"\biptables\s+.*-F\b"), "firewall flush"),
    (re.compile(r"\bufw\s+disable\b"), "firewall disable"),
    (re.compile(r"\b(DROP|TRUNCATE)\s+(DATABASE|TABLE)\b", re.IGNORECASE), "database drop/truncate"),
    (re.compile(r"\bcrontab\s+.*-r\b"), "crontab remove all"),
    (re.compile(r">\s*/dev/sd[a-z]"), "write to block device"),
]

_HIGH_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\brm\s+.*-[a-zA-Z]*r"), "recursive delete"),
    (re.compile(r"\brm\s+.*-[a-zA-Z]*f"), "forced delete"),
    (re.compile(r"\bsystemctl\s+(stop|disable|restart|mask)\b"), "service lifecycle change"),
    (re.compile(r"\bservice\s+\S+\s+(stop|restart)\b"), "service stop/restart"),
    (re.compile(r"\b(apt|apt-get)\s+(remove|purge|autoremove)\b"), "package removal"),
    (re.compile(r"\b(yum|dnf)\s+(remove|erase)\b"), "package removal"),
    (re.compile(r"\bdocker\s+(rm|rmi|stop|kill)\b"), "container/image removal"),
    (re.compile(r"\bdocker\s+system\s+prune\b"), "docker system prune"),
    (re.compile(r"\b(userdel|groupdel)\b"), "user/group deletion"),
    (re.compile(r"(?<!/)\bpasswd\s"), "password change"),
    (re.compile(r"\bkill\s+.*-9\b"), "forced process kill"),
    (re.compile(r"\bkillall\b"), "kill all processes by name"),
    (re.compile(r"\bpkill\b"), "pattern-based process kill"),
    (re.compile(r"\bgit\s+push\s+.*--force"), "git force push"),
    (re.compile(r"\bgit\s+reset\s+--hard\b"), "git hard reset"),
    (re.compile(r"\biptables\b"), "firewall rule change"),
    (re.compile(r"\bufw\b"), "firewall configuration"),
    (re.compile(r"\bchmod\s+.*-[a-zA-Z]*R"), "recursive permission change"),
    (re.compile(r"\bchown\s+.*-[a-zA-Z]*R"), "recursive ownership change"),
    (re.compile(r"\bDELETE\s+FROM\b", re.IGNORECASE), "database delete"),
    (re.compile(r"\bALTER\s+TABLE\b", re.IGNORECASE), "database schema change"),
    (re.compile(r"\bDROP\s+(INDEX|VIEW|FUNCTION|TRIGGER)\b", re.IGNORECASE), "database object drop"),
]

_MEDIUM_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\b(apt|apt-get)\s+install\b"), "package install"),
    (re.compile(r"\b(yum|dnf)\s+install\b"), "package install"),
    (re.compile(r"\bpip3?\s+install\b"), "pip install"),
    (re.compile(r"\bnpm\s+install\b"), "npm install"),
    (re.compile(r"\bdocker\s+(run|exec|build)\b"), "container operation"),
    (re.compile(r"\bdocker-compose\s+(up|down|restart)\b"), "compose operation"),
    (re.compile(r"\bgit\s+push\b"), "git push"),
    (re.compile(r"\bgit\s+reset\b"), "git reset"),
    (re.compile(r"\bgit\s+checkout\b"), "git checkout"),
    (re.compile(r"\bgit\s+merge\b"), "git merge"),
    (re.compile(r"\bgit\s+rebase\b"), "git rebase"),
    (re.compile(r"\bsystemctl\s+(start|enable|reload)\b"), "service start/enable"),
    (re.compile(r"\bmkdir\b"), "directory creation"),
    (re.compile(r"\bchmod\b"), "permission change"),
    (re.compile(r"\bchown\b"), "ownership change"),
    (re.compile(r"\bcurl\s+.*\|\s*(bash|sh)\b"), "piped script execution"),
    (re.compile(r"\bwget\s+.*\|\s*(bash|sh)\b"), "piped script execution"),
    (re.compile(r"\b(useradd|groupadd|usermod)\b"), "user/group management"),
    (re.compile(r"\bmount\b"), "filesystem mount"),
    (re.compile(r"\bUPDATE\s+\S+\s+SET\b", re.IGNORECASE), "database update"),
    (re.compile(r"\bINSERT\s+INTO\b", re.IGNORECASE), "database insert"),
    (re.compile(r"\bCREATE\s+(TABLE|DATABASE|INDEX)\b", re.IGNORECASE), "database create"),
    (re.compile(r"\brm\b"), "file delete"),
    (re.compile(r"\bmv\b"), "file move/rename"),
    (re.compile(r"\bcp\s+.*-[a-zA-Z]*r"), "recursive copy"),
]

# Tools with inherent risk levels (tool_name -> RiskLevel).
# Used when no command string is available or as a baseline.
_TOOL_RISK_MAP: dict[str, RiskLevel] = {
    # Low — read-only / info
    "read_file": RiskLevel.LOW,
    "search_knowledge": RiskLevel.LOW,
    "web_search": RiskLevel.LOW,
    "fetch_url": RiskLevel.LOW,
    "browser_read_page": RiskLevel.LOW,
    "browser_read_table": RiskLevel.LOW,
    "analyze_pdf": RiskLevel.LOW,
    "analyze_image": RiskLevel.LOW,
    "memory_manage": RiskLevel.LOW,
    "manage_list": RiskLevel.LOW,
    # Medium — writes data
    "write_file": RiskLevel.MEDIUM,
    "browser_click": RiskLevel.MEDIUM,
    "browser_fill": RiskLevel.MEDIUM,
    "browser_evaluate": RiskLevel.MEDIUM,
    "manage_process": RiskLevel.MEDIUM,
    "generate_image": RiskLevel.MEDIUM,
    "ingest_knowledge": RiskLevel.MEDIUM,
    # High — arbitrary code execution
    "run_script": RiskLevel.HIGH,
    "claude_code": RiskLevel.HIGH,
    "run_command_multi": RiskLevel.HIGH,
}


def classify_command(command: str) -> RiskAssessment:
    """Classify a shell command string by risk level.

    Scans critical → high → medium patterns top-down.  First match wins.
    If no pattern matches, returns LOW with "no risky patterns detected".
    """
    if not command or not command.strip():
        return RiskAssessment(RiskLevel.LOW, "empty command")

    for pattern, reason in _CRITICAL_PATTERNS:
        if pattern.search(command):
            return RiskAssessment(RiskLevel.CRITICAL, reason)

    for pattern, reason in _HIGH_PATTERNS:
        if pattern.search(command):
            return RiskAssessment(RiskLevel.HIGH, reason)

    for pattern, reason in _MEDIUM_PATTERNS:
        if pattern.search(command):
            return RiskAssessment(RiskLevel.MEDIUM, reason)

    return RiskAssessment(RiskLevel.LOW, "no risky patterns detected")


def classify_tool(tool_name: str, tool_input: dict | None = None) -> RiskAssessment:
    """Classify a tool call by risk level.

    For `run_command`, inspects the command string.  For `run_script`,
    always returns HIGH.  Other tools use the static map or default LOW.
    """
    tool_input = tool_input or {}

    if tool_name == "run_command":
        cmd = tool_input.get("command", "")
        assessment = classify_command(cmd)
        if assessment.level != RiskLevel.LOW:
            return assessment
        return RiskAssessment(RiskLevel.LOW, "run_command: no risky patterns")

    if tool_name == "run_command_multi":
        cmd = tool_input.get("command", "")
        assessment = classify_command(cmd)
        if _LEVEL_ORDER[assessment.level] >= _LEVEL_ORDER[RiskLevel.HIGH]:
            return assessment
        return RiskAssessment(
            max(RiskLevel.MEDIUM, assessment.level, key=lambda r: _LEVEL_ORDER[r]),
            f"multi-host command: {assessment.reason}",
        )

    if tool_name == "run_script":
        script = tool_input.get("script", "")
        cmd_assessment = classify_command(script)
        if _LEVEL_ORDER[cmd_assessment.level] >= _LEVEL_ORDER[RiskLevel.HIGH]:
            return cmd_assessment
        return RiskAssessment(RiskLevel.HIGH, "arbitrary script execution")

    base = _TOOL_RISK_MAP.get(tool_name, RiskLevel.LOW)
    reason = f"tool baseline: {tool_name}"
    return RiskAssessment(base, reason)


# Ordering helper for max() comparisons
_LEVEL_ORDER: dict[RiskLevel, int] = {
    RiskLevel.LOW: 0,
    RiskLevel.MEDIUM: 1,
    RiskLevel.HIGH: 2,
    RiskLevel.CRITICAL: 3,
}


class RiskStats:
    """Thread-safe risk classification statistics tracker."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counts: dict[str, int] = defaultdict(int)
        self._by_tool: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self._recent: list[dict] = []
        self._max_recent = 100

    def record(self, tool_name: str, assessment: RiskAssessment) -> None:
        """Record a risk classification event."""
        level = assessment.level.value
        with self._lock:
            self._counts[level] += 1
            self._by_tool[tool_name][level] += 1
            entry = {
                "tool_name": tool_name,
                "risk_level": level,
                "reason": assessment.reason,
            }
            self._recent.append(entry)
            if len(self._recent) > self._max_recent:
                self._recent = self._recent[-self._max_recent:]

    def get_summary(self) -> dict:
        """Return aggregated risk statistics."""
        with self._lock:
            return {
                "totals": dict(self._counts),
                "by_tool": {t: dict(levels) for t, levels in self._by_tool.items()},
            }

    def get_recent(self, limit: int = 20) -> list[dict]:
        """Return the most recent risk classification events."""
        with self._lock:
            return list(self._recent[-limit:])

    def reset(self) -> None:
        """Clear all statistics."""
        with self._lock:
            self._counts.clear()
            self._by_tool.clear()
            self._recent.clear()
