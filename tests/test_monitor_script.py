"""Monitor script reads the actual application log destination without real services."""

import subprocess
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "monitor.sh"


def _stub(bin_dir: Path, name: str, body: str):
    path = bin_dir / name
    path.write_text("#!/bin/sh\n" + body)
    path.chmod(0o755)


def _run(tmp_path: Path, *, unit_exists: bool, env_extra: dict | None = None):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    calls = tmp_path / "calls.log"
    _stub(bin_dir, "journalctl", f'echo "journalctl $*" >> "{calls}"\necho "journal line"\n')
    _stub(
        bin_dir, "systemctl", f'echo "systemctl $*" >> "{calls}"\nexit {0 if unit_exists else 1}\n'
    )
    _stub(bin_dir, "incus", f'echo "incus $*" >> "{calls}"\necho "incus journal line"\n')
    env = {
        "PATH": f"{bin_dir}:/usr/bin:/bin",
        "HOME": str(tmp_path),
        "ODIN_DEPLOY": "local",
        **(env_extra or {}),
    }
    result = subprocess.run(
        ["bash", str(SCRIPT), "logs", "5"],
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
    )
    return result, calls.read_text() if calls.exists() else ""


def test_service_install_reads_the_journal(tmp_path):
    result, calls = _run(tmp_path, unit_exists=True)
    assert result.returncode == 0, result.stderr
    assert "journalctl -u odin -n 5 --no-pager" in calls
    assert "journal line" in result.stdout
    assert "Log file not found" not in result.stdout


def test_source_run_explains_stdout_instead_of_a_missing_file(tmp_path):
    result, calls = _run(tmp_path, unit_exists=False)
    assert result.returncode == 0, result.stderr
    assert "journalctl" not in calls
    assert "standard output/error, not to a file" in result.stdout
    assert "ODIN_LOG_FILE" in result.stdout


def test_explicit_log_file_override_is_preserved(tmp_path):
    log_file = tmp_path / "odin.out"
    log_file.write_text("".join(f"line {i}\n" for i in range(20)))
    result, calls = _run(tmp_path, unit_exists=True, env_extra={"ODIN_LOG_FILE": str(log_file)})
    assert result.returncode == 0, result.stderr
    assert result.stdout.rstrip().splitlines()[-5:] == [f"line {i}" for i in range(15, 20)]
    assert "journalctl" not in calls


def test_incus_reads_the_instance_journal_directly(tmp_path):
    result, calls = _run(tmp_path, unit_exists=True, env_extra={"ODIN_DEPLOY": "incus"})
    assert result.returncode == 0, result.stderr
    assert calls.splitlines() == ["incus exec odin -- journalctl -u odin -n 5 --no-pager"]
