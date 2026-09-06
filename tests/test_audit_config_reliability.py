"""Tests for audit/config reliability fixes (PR7).

Covers:
- audit tool_input size cap
- audit size-based rotation (keeps N old files, bounds growth)
- audit search streams (bounded) and reads across rotated files
- config loader warns on unknown top-level keys
- subsystem-guard thresholds are passed into SubsystemGuard
"""
from __future__ import annotations

import json
import logging

from src.audit.logger import DEFAULT_TOOL_INPUT_CAP, AuditLogger, _cap_tool_input

# ---------------------------------------------------------------------------
# tool_input cap
# ---------------------------------------------------------------------------

def test_small_tool_input_unchanged():
    inp = {"host": "server", "command": "uptime"}
    assert _cap_tool_input(inp, DEFAULT_TOOL_INPUT_CAP) == inp


def test_large_tool_input_truncated():
    inp = {"content": "x" * 100_000}
    capped = _cap_tool_input(inp, 4000)
    assert isinstance(capped, dict)
    assert capped["audit_clipped"] is True
    assert len(json.dumps(capped)) <= 4000


async def test_logged_tool_input_is_capped(tmp_path):
    logger = AuditLogger(str(tmp_path / "audit.jsonl"), tool_input_cap=200)
    await logger.log_execution(
        user_id="u", user_name="U", channel_id="c",
        tool_name="apply_patch", tool_input={"content": "y" * 50_000},
        approved=True, result_summary="ok", execution_time_ms=1,
    )
    line = (tmp_path / "audit.jsonl").read_text().strip()
    entry = json.loads(line)
    assert isinstance(entry["tool_input"], dict)
    assert entry["tool_input"]["audit_clipped"] is True
    assert len(json.dumps(entry["tool_input"])) <= 200


# ---------------------------------------------------------------------------
# Rotation
# ---------------------------------------------------------------------------

async def test_rotation_creates_numbered_files_and_bounds_growth(tmp_path):
    path = tmp_path / "audit.jsonl"
    logger = AuditLogger(str(path), max_bytes=2000, max_files=2)
    for i in range(200):
        await logger.log_execution(
            user_id="u", user_name="U", channel_id="c",
            tool_name=f"t{i}", tool_input={"i": i},
            approved=True, result_summary="r" * 50, execution_time_ms=1,
        )
    # Current + at most max_files rotated files exist; older are pruned.
    assert path.exists()
    assert (tmp_path / "audit.jsonl.1").exists()
    assert not (tmp_path / "audit.jsonl.3").exists()  # never keep more than max_files
    # Current file is bounded near max_bytes (not the full 200-entry history).
    assert path.stat().st_size < 2000 * 3


async def test_search_reads_across_rotation(tmp_path):
    path = tmp_path / "audit.jsonl"
    logger = AuditLogger(str(path), max_bytes=1500, max_files=3)
    for i in range(150):
        await logger.log_execution(
            user_id="u", user_name="U", channel_id="c",
            tool_name="marker" if i == 0 else f"t{i}",
            tool_input={"i": i}, approved=True,
            result_summary="r" * 40, execution_time_ms=1,
        )
    # The most recent entries are found even though the file has rotated.
    recent = await logger.search(limit=5)
    assert len(recent) == 5
    # Newest first.
    assert recent[0]["tool_name"] == "t149"


async def test_hmac_chain_valid_after_rotation(tmp_path):
    """Rotation resets the signer chain to genesis so verify_integrity() (which
    reads the current file from genesis) stays valid — the chain no longer runs
    across the rotation boundary (Odin's PR#129 blocker)."""
    path = tmp_path / "audit.jsonl"
    logger = AuditLogger(str(path), hmac_key="secret-key", max_bytes=600, max_files=2)
    for i in range(60):
        await logger.log_execution(
            user_id="u", user_name="U", channel_id="c",
            tool_name=f"t{i}", tool_input={"i": i},
            approved=True, result_summary="r" * 30, execution_time_ms=1,
        )
    # Rotation must have happened.
    assert (tmp_path / "audit.jsonl.1").exists()
    report = await logger.verify_integrity()
    assert report["valid"] is True, report
    assert report["verified"] == report["total"]


async def test_search_is_bounded_by_limit(tmp_path):
    logger = AuditLogger(str(tmp_path / "audit.jsonl"))
    for i in range(100):
        await logger.log_execution(
            user_id="u", user_name="U", channel_id="c",
            tool_name="t", tool_input={"i": i}, approved=True,
            result_summary="ok", execution_time_ms=1,
        )
    results = await logger.search(limit=10)
    assert len(results) == 10
    assert results[0]["tool_input"]["i"] == 99  # most recent first


# ---------------------------------------------------------------------------
# Config unknown-key warning
# ---------------------------------------------------------------------------

def test_unknown_config_key_warns(caplog):
    from src.config.schema import _warn_unknown_config_keys
    with caplog.at_level(logging.WARNING):
        _warn_unknown_config_keys({"discord": {}, "sesions": {}, "web_ui": {}})
    msg = caplog.text
    # The flagged list (before the "— check" explanation) names only the typos.
    flagged = msg.split("Ignoring unknown config key(s):")[-1].split("—")[0]
    assert "sesions" in flagged and "web_ui" in flagged
    assert "discord" not in flagged  # known key not flagged as unknown


def test_known_config_keys_no_warning(caplog):
    from src.config.schema import _warn_unknown_config_keys
    with caplog.at_level(logging.WARNING):
        _warn_unknown_config_keys({"discord": {}, "web": {}, "tools": {}})
    assert "Ignoring unknown config key" not in caplog.text


# ---------------------------------------------------------------------------
# subsystem-guard thresholds wired
# ---------------------------------------------------------------------------

def test_subsystem_guard_receives_configured_thresholds():
    from src.health.subsystem_guard import SubsystemGuard
    g = SubsystemGuard(degraded_threshold=2, unavailable_threshold=5)
    assert g._degraded_threshold == 2
    assert g._unavailable_threshold == 5


def test_graceful_degradation_config_defaults():
    from src.config.schema import GracefulDegradationConfig
    cfg = GracefulDegradationConfig()
    assert cfg.degraded_threshold == 3
    assert cfg.unavailable_threshold == 10
