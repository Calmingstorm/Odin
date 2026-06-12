"""Heuristic failure classification for audit entries.

Classifies tool-execution error text into a stable taxonomy at write time —
no LLM in the path, deterministic, rule-id'd so future reclassification can
tell which heuristic generation produced a verdict. The raw error string is
classified but never re-stored by the aggregate layer.

Class order matters: the first matching rule wins, so specific classes
(dependency_missing, quota, policy_blocked) precede broad ones (network,
provider).
"""
from __future__ import annotations

import re

CLASSIFIER_SOURCE = "heuristic_v1"

FAILURE_CLASSES = (
    "cancelled",
    "policy_blocked",
    "auth",
    "rate_limit",
    "quota",
    "dependency_missing",
    "validation_failed",
    "conflict",
    "permission_denied",
    "not_found",
    "timeout",
    "remote_state",
    "network",
    "bad_input",
    "command_failed",
    "provider",
    "unknown",
)

# (rule_id, class, subclass, compiled_pattern, confidence)
_RULES: tuple[tuple[str, str, str, re.Pattern, float], ...] = (
    # -- cancelled --------------------------------------------------------
    ("cancel_explicit_v1", "cancelled", "explicit_cancel",
     re.compile(
         r"cancell?ed|keyboardinterrupt|task was destroyed|loop stopped|"
         r"aborted by user",
         re.I), 0.9),
    # -- policy / RBAC ------------------------------------------------------
    ("policy_rbac_v1", "policy_blocked", "rbac_denied",
     re.compile(
         r"rbac|not permitted|denied by polic|governor blocked|"
         r"blocked by governor|tool .* is restricted|permission tier",
         re.I), 0.9),
    # -- auth ----------------------------------------------------------------
    ("auth_401_v1", "auth", "unauthorized",
     re.compile(
         r"\b401\b|\b403\b|forbidden|unauthorized|invalid[ _]token|"
         r"token.{0,20}(expired|invalidated)|"
         r"authentication failed|sign in again|"
         r"invalid credentials|oauth",
         re.I), 0.88),
    # -- rate limit / quota --------------------------------------------------
    ("rate_429_v1", "rate_limit", "http_429",
     re.compile(r"\b429\b|rate.?limit|too many requests|slow down", re.I), 0.9),
    ("quota_v1", "quota", "quota_exhausted",
     re.compile(
         r"quota|insufficient[ _]credits|out of credits|usage limit reached|"
         r"billing",
         re.I), 0.85),
    # -- dependency ---------------------------------------------------------
    ("dep_missing_v1", "dependency_missing", "missing_component",
     re.compile(
         r"command not found|no module named|modulenotfounderror|"
         r"not installed|no such (binary|executable)|"
         r"executable file not found|importerror",
         re.I), 0.9),
    # -- validation (post-change check failed, structurally fine) ------------
    ("validation_v1", "validation_failed", "post_change_validation",
     re.compile(
         r"validate_action|validation failed|verification failed|"
         r"post-?change check",
         re.I), 0.85),
    # -- conflict -------------------------------------------------------------
    ("conflict_git_v1", "conflict", "vcs_or_lock",
     re.compile(
         r"merge conflict|\bCONFLICT\b|would be overwritten|lock(ed| held|"
         r" contention)|stale.{0,12}branch|non-fast-forward|"
         r"concurrent modification|resource busy",
         re.I), 0.88),
    # -- permission (filesystem/OS, not auth) ----------------------------------
    ("perm_denied_v1", "permission_denied", "os_permission",
     re.compile(
         r"permission denied|eacces|read-?only file system|"
         r"operation not permitted",
         re.I), 0.88),
    # -- not found -------------------------------------------------------------
    ("notfound_v1", "not_found", "missing_target",
     re.compile(
         r"\b404\b|not found|no such (file|directory|host|container|table|"
         r"column)|does not exist|unknown (host|channel|tool)",
         re.I), 0.8),
    # -- timeout ---------------------------------------------------------------
    ("timeout_v1", "timeout", "operation_timeout",
     re.compile(r"timed? ?out|timeouterror|deadline exceeded", re.I), 0.9),
    # -- remote state (transport works, service is dead) ------------------------
    ("remote_state_v1", "remote_state", "service_down",
     re.compile(
         r"daemon (is not|not) running|is the docker daemon running|"
         r"service (is )?(inactive|dead|not active|failed)|"
         r"connection refused.*sock|systemctl status|"
         r"container .* (is not running|exited)",
         re.I), 0.82),
    # -- network ------------------------------------------------------------------
    ("network_v1", "network", "transport",
     re.compile(
         r"econnrefused|econnreset|etimedout|ehostunreach|enetunreach|"
         r"connection (refused|reset|aborted)|name or service not known|"
         r"temporary failure in name resolution|no route to host|ssl|"
         r"certificate|broken pipe|getaddrinfo",
         re.I), 0.85),
    # -- bad input -------------------------------------------------------------------
    ("badinput_v1", "bad_input", "invalid_arguments",
     re.compile(
         r"invalid (argument|input|option|value|syntax)|jsondecodeerror|"
         r"expecting value|unrecognized arguments|usage:|missing required|"
         r"valueerror|typeerror",
         re.I), 0.8),
    # -- plain nonzero exit (the bulk of real-world failures) ---------------
    ("cmd_exit_v1", "command_failed", "nonzero_exit",
     re.compile(
         r"(script|command) failed \(exit|exited with (code|status) [1-9]|"
         r"non-zero exit|returned exit code [1-9]",
         re.I), 0.85),
    # -- provider/upstream --------------------------------------------------------------
    ("provider_5xx_v1", "provider", "upstream_error",
     re.compile(
         r"\b(500|502|503|504)\b|internal server error|bad gateway|"
         r"service unavailable|upstream|model (error|overloaded)|codex|"
         r"api error",
         re.I), 0.75),
)


def classify_failure(error_text: str | None) -> dict:
    """Classify an error string into the failure taxonomy.

    Returns Odin's agreed structure::

        {"class": ..., "subclass": ..., "confidence": ...,
         "matched_rule": ..., "source": "heuristic_v1"}

    Never raises; anything unmatchable is ``unknown`` at low confidence.
    """
    try:
        text = str(error_text or "")
        if not text.strip():
            return {
                "class": "unknown", "subclass": "empty_error",
                "confidence": 0.3, "matched_rule": None,
                "source": CLASSIFIER_SOURCE,
            }
        for rule_id, cls, subclass, pattern, confidence in _RULES:
            if pattern.search(text):
                return {
                    "class": cls, "subclass": subclass,
                    "confidence": confidence, "matched_rule": rule_id,
                    "source": CLASSIFIER_SOURCE,
                }
        return {
            "class": "unknown", "subclass": "no_rule_matched",
            "confidence": 0.3, "matched_rule": None,
            "source": CLASSIFIER_SOURCE,
        }
    except Exception:  # noqa: BLE001 — classification must never break audit writes
        return {
            "class": "unknown", "subclass": "classifier_error",
            "confidence": 0.0, "matched_rule": None,
            "source": CLASSIFIER_SOURCE,
        }
