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
    (re.compile(r"(?:^|[;&|]\s*|sudo\s+)(?:/sbin/)?(shutdown|poweroff|halt)\b", re.MULTILINE), "system shutdown"),
    (re.compile(r"\binit\s+0\b"), "system shutdown"),
    (re.compile(r"(?:^|[;&|]\s*|sudo\s+)(?:/sbin/)?reboot\b", re.MULTILINE), "system reboot"),
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


# --- Exfiltration / reverse-shell patterns (separate from risk tiers) ---
_EXFIL_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\bcurl\b.*\|\s*(ba)?sh\b"), "pipe remote script to shell"),
    (re.compile(r"\bwget\b.*\|\s*(ba)?sh\b"), "pipe remote download to shell"),
    (re.compile(r"\bbash\s+-i\s+>&\s*/dev/tcp/"), "reverse shell via /dev/tcp"),
    (re.compile(r"\bnc\s+.*-e\s+/bin/(ba)?sh"), "netcat reverse shell"),
    (re.compile(r"\bpython[23]?\s+.*-c\s+.*socket.*connect"), "python reverse shell"),
    (re.compile(r"\bbase64\s+-d\b.*\|\s*(ba)?sh"), "base64 decode pipe to shell"),
    (re.compile(r">\s*/etc/(passwd|shadow|sudoers)"), "write to auth files"),
    (re.compile(r"\becho\b.*>>\s*/etc/cron"), "cron persistence"),
    (re.compile(r"\b(ssh-keygen|ssh-copy-id)\b.*-f\s*/"), "SSH key manipulation to root paths"),
]


class CommandGovernorResult:
    """Result of a command governor check."""
    __slots__ = ("allowed", "risk", "reason", "suggestion")

    def __init__(self, allowed: bool, risk: RiskLevel, reason: str, suggestion: str = ""):
        self.allowed = allowed
        self.risk = risk
        self.reason = reason
        self.suggestion = suggestion

    def denial_message(self) -> str:
        msg = f"Blocked [{self.risk.value}]: {self.reason}"
        if self.suggestion:
            msg += f"\nSuggested alternative: {self.suggestion}"
        return msg


_SUGGESTION_MAP: dict[str, str] = {
    "recursive delete on root": "Use a more specific path, e.g. rm -rf /tmp/specific_dir",
    "recursive delete": "Use a more specific path or ls first to verify targets",
    "forced delete": "Use rm without -f to get confirmation prompts",
    "filesystem format": "This is never safe to run from an automated agent",
    "raw disk write": "This is never safe to run from an automated agent",
    "fork bomb": "This is never safe to run from an automated agent",
    "system shutdown": "Use run_command to check uptime/status instead",
    "system reboot": "Use run_command to check uptime/status instead",
    "firewall flush": "List rules with iptables -L instead",
    "firewall disable": "Check status with ufw status instead",
    "pipe remote script to shell": "Download the script first, inspect it, then run",
    "reverse shell via /dev/tcp": "This looks like an attack pattern",
    "netcat reverse shell": "This looks like an attack pattern",
}


class CommandGovernor:
    """Enforces shell command policy before execution.

    CRITICAL commands and exfiltration patterns are always blocked.
    HIGH commands are allowed but logged with warnings.
    The governor runs AFTER the LLM chooses a tool but BEFORE anything
    touches a shell — the last line of defense.
    """

    def __init__(self, block_critical: bool = True, block_exfil: bool = True) -> None:
        self._block_critical = block_critical
        self._block_exfil = block_exfil
        self._stats = GovernorStats()

    @property
    def stats(self) -> "GovernorStats":
        return self._stats

    def check(self, command: str) -> CommandGovernorResult:
        """Check a command against the policy. Returns allow/deny with reason."""
        if not command or not command.strip():
            return CommandGovernorResult(True, RiskLevel.LOW, "empty command")

        if self._block_exfil:
            for pattern, reason in _EXFIL_PATTERNS:
                if pattern.search(command):
                    result = CommandGovernorResult(
                        False, RiskLevel.CRITICAL, reason,
                        _SUGGESTION_MAP.get(reason, ""),
                    )
                    self._stats.record_block(command, result)
                    log.warning("Governor BLOCKED (exfil): %s — %s", reason, command[:200])
                    return result

        assessment = classify_command(command)

        if self._block_critical and assessment.level == RiskLevel.CRITICAL:
            result = CommandGovernorResult(
                False, RiskLevel.CRITICAL, assessment.reason,
                _SUGGESTION_MAP.get(assessment.reason, ""),
            )
            self._stats.record_block(command, result)
            log.warning("Governor BLOCKED (critical): %s — %s", assessment.reason, command[:200])
            return result

        if assessment.level == RiskLevel.HIGH:
            self._stats.record_allow(command, assessment)
            log.info("Governor ALLOWED (high risk): %s — %s", assessment.reason, command[:120])

        return CommandGovernorResult(True, assessment.level, assessment.reason)


class GovernorStats:
    """Tracks governor policy decisions."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._blocked: list[dict] = []
        self._allowed_high: list[dict] = []
        self._block_count = 0
        self._allow_count = 0

    def record_block(self, command: str, result: CommandGovernorResult) -> None:
        with self._lock:
            self._block_count += 1
            self._blocked.append({
                "command": command[:200],
                "risk": result.risk.value,
                "reason": result.reason,
            })
            if len(self._blocked) > 50:
                self._blocked = self._blocked[-50:]

    def record_allow(self, command: str, assessment: RiskAssessment) -> None:
        with self._lock:
            self._allow_count += 1
            self._allowed_high.append({
                "command": command[:200],
                "risk": assessment.level.value,
                "reason": assessment.reason,
            })
            if len(self._allowed_high) > 50:
                self._allowed_high = self._allowed_high[-50:]

    def get_summary(self) -> dict:
        with self._lock:
            return {
                "blocked": self._block_count,
                "allowed_high_risk": self._allow_count,
                "recent_blocks": list(self._blocked[-10:]),
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
