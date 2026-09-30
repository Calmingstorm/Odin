"""Open-file headroom health checks and packaged service configuration."""

from __future__ import annotations

import configparser
import json
import os
import resource
import subprocess
import sys
from pathlib import Path

from src.health import checker


def test_check_reports_real_process_descriptor_data() -> None:
    result = checker.check_open_files(None)

    assert result.name == "open_files"
    assert result.status in {"ok", "degraded"}
    assert result.metadata["open_descriptors"] == len(os.listdir("/proc/self/fd")) - 1
    assert result.metadata["soft_limit"] == resource.getrlimit(resource.RLIMIT_NOFILE)[0]
    assert "open descriptors" in result.detail
    assert "soft limit" in result.detail
    assert "%" in result.detail


def test_warning_is_strictly_above_70_percent() -> None:
    at_threshold = checker._open_files_status(70, 100)
    above_threshold = checker._open_files_status(71, 100)

    assert at_threshold.status == "ok"
    assert at_threshold.healthy
    assert at_threshold.metadata["usage_percent"] == 70
    assert above_threshold.status == "degraded"
    assert not above_threshold.healthy
    assert above_threshold.metadata["usage_percent"] == 71


def test_threshold_with_real_descriptors_and_child_soft_limit() -> None:
    # RLIMIT_NOFILE is process-wide: only change it in our disposable child,
    # never the pytest worker or the active Odin process.
    probe = """
import json, os, resource
from src.health.checker import check_open_files, _process_descriptor_usage
resource.setrlimit(resource.RLIMIT_NOFILE, (100, resource.getrlimit(resource.RLIMIT_NOFILE)[1]))
handles = []
try:
    while _process_descriptor_usage()[0] < 70:
        handles.append(os.open('/dev/null', os.O_RDONLY))
    at = check_open_files(None).to_dict()
    handles.append(os.open('/dev/null', os.O_RDONLY))
    above = check_open_files(None).to_dict()
    print(json.dumps([at, above]))
finally:
    for handle in handles:
        os.close(handle)
"""
    child = subprocess.run([sys.executable, "-c", probe], check=True, capture_output=True,
                           text=True, timeout=15, cwd=Path(__file__).parents[1])
    at, above = json.loads(child.stdout)
    assert at["status"] == "ok" and at["metadata"]["usage_percent"] == 70
    assert above["status"] == "degraded" and above["metadata"]["usage_percent"] == 71
    assert at["metadata"]["open_descriptors"] == 70
    assert above["metadata"]["soft_limit"] == 100


def test_infinite_soft_limit_is_reported_without_invalid_percentage() -> None:
    result = checker._open_files_status(12, resource.RLIM_INFINITY)

    assert result.status == "ok"
    assert result.metadata["soft_limit"] == "unlimited"
    assert result.metadata["usage_percent"] is None
    assert "unlimited" in result.detail


def test_measurement_failure_is_reported_as_down(monkeypatch) -> None:
    def fail():
        raise OSError("procfs unavailable")

    monkeypatch.setattr(checker, "_process_descriptor_usage", fail)
    result = checker.check_open_files(None)

    assert result.status == "down"
    assert not result.healthy
    assert "Unable to measure open descriptors" in result.detail
    assert "procfs unavailable" in result.detail


def test_packaged_systemd_unit_sets_raised_nofile_limit() -> None:
    unit_path = Path(__file__).parents[1] / "packaging" / "odin.service"
    # systemd permits repeated directives such as Environment=; those do not
    # affect the semantic value being checked here.
    unit = configparser.ConfigParser(interpolation=None, strict=False)
    unit.read_string(unit_path.read_text(encoding="utf-8"))

    assert unit.getint("Service", "LimitNOFILE") > 1024
