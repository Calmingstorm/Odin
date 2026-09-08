"""Execute actual hook logic with relocated paths and inert system interfaces.

No package operation, service operation, account change or live path is used.
Only absolute filesystem roots are relocated; shell control flow is unchanged.
"""
import os
import stat
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def sandbox(tmp_path):
    root = tmp_path / "root"
    bins = tmp_path / "bin"
    bins.mkdir()
    trace = tmp_path / "trace"
    state = tmp_path / "active"
    app = root / "opt/odin"
    (app / ".venv/bin").mkdir(parents=True)
    (app / ".ssh").mkdir()
    (app / ".ssh/id_ed25519").write_text("inert fixture")
    (app / ".ssh/id_ed25519.pub").write_text("inert public fixture")
    (app / "pyproject.toml").write_text("[project]\nname='fixture'\n")
    (app / "config.yml.default").write_text("web: {}\n")
    (app / ".env.example").write_text("DISCORD_TOKEN=\n")
    (root / "etc/sudoers.d").mkdir(parents=True)
    (root / "usr/lib/systemd/system").mkdir(parents=True)
    (root / "usr/lib/systemd/system/odin.service").touch()

    def executable(path, content):
        path.write_text("#!/bin/bash\nset -e\n" + content)
        path.chmod(0o755)

    executable(bins / "systemctl", '''
echo "systemctl $*" >> "$TRACE"
case "$1" in
  is-active) test -f "$ACTIVE" ;;
  stop) rm -f "$ACTIVE" ;;
  restart) test "${FAIL_RESTART:-0}" != 1; touch "$ACTIVE" ;;
esac
''')
    for command in ("getent", "id", "chown", "groupadd", "useradd"):
        executable(bins / command, f'echo "{command} $*" >> "$TRACE"\n')
    executable(app / ".venv/bin/pip", '''
echo "pip $*" >> "$TRACE"
test "${FAIL_PIP:-0}" != 1
''')
    executable(app / ".venv/bin/python", '''
echo "python $*" >> "$TRACE"
test "${FAIL_IMPORT:-0}" != 1
''')
    executable(app / ".venv/bin/playwright", "exit 1\n")
    scripts = {}
    for name in ("preremove", "postinstall"):
        script = (ROOT / f"packaging/{name}.sh").read_text()
        for prefix in ("/opt/odin", "/etc/odin", "/var/lib/odin", "/var/log/odin",
                       "/etc/sudoers.d", "/usr/lib/systemd/system"):
            script = script.replace(prefix, str(root) + prefix)
        scripts[name] = tmp_path / f"{name}.sh"
        scripts[name].write_text(script)

    def invoke(name, *args, **extra):
        env = {**os.environ, "PATH": f"{bins}:/usr/bin:/bin", "TRACE": str(trace),
               "ACTIVE": str(state), **extra}
        return subprocess.run(["bash", str(scripts[name]), *args], env=env,
                              capture_output=True, text=True, timeout=15)

    return root, trace, state, invoke


def configured(root):
    config = root / "etc/odin"
    config.mkdir(exist_ok=True)
    (config / "config.yml").write_text("existing config\n")


@pytest.mark.parametrize("active", [True, False])
def test_upgrade_preserves_prior_active_state_and_enablement(sandbox, active):
    root, trace, state, invoke = sandbox
    configured(root)
    if active:
        state.touch()
    assert invoke("preremove", "upgrade", "next").returncode == 0
    assert not state.exists()
    assert invoke("postinstall", "configure", "previous").returncode == 0
    assert state.exists() == active
    calls = trace.read_text()
    assert "systemctl disable" not in calls
    assert "systemctl enable" not in calls
    assert ("systemctl restart" in calls) == active
    assert "import src.__main__" in calls
    assert not (root / "var/lib/odin/.package-service-state").exists()


def test_fresh_install_enables_but_does_not_start(sandbox):
    _, trace, state, invoke = sandbox
    assert invoke("postinstall", "configure").returncode == 0
    assert "systemctl enable" in trace.read_text()
    assert "systemctl restart" not in trace.read_text()
    assert not state.exists()


@pytest.mark.parametrize("failure", ["FAIL_PIP", "FAIL_IMPORT", "FAIL_RESTART"])
def test_failed_upgrade_retains_restart_intent_for_retry(sandbox, failure):
    root, _, state, invoke = sandbox
    configured(root)
    state.touch()
    assert invoke("preremove", "upgrade", "next").returncode == 0
    assert invoke("postinstall", "configure", "previous", **{failure: "1"}).returncode != 0
    assert (root / "var/lib/odin/.package-service-state").read_text() == "active\n"
    assert not state.exists()
    assert invoke("preremove", "failed-upgrade", "next").returncode == 0
    assert invoke("postinstall", "configure", "previous").returncode == 0
    assert state.exists()


def test_remove_stops_disables_and_preserves_data(sandbox):
    root, trace, state, invoke = sandbox
    configured(root)
    state.touch()
    assert invoke("preremove", "remove").returncode == 0
    assert "systemctl disable" in trace.read_text()
    assert not state.exists()
    assert (root / "etc/odin/config.yml").read_text() == "existing config\n"


def test_unhandled_postinstall_argument_has_no_effect(sandbox):
    _, trace, _, invoke = sandbox
    assert invoke("postinstall", "unrecognized").returncode == 0
    assert not trace.exists()


def test_removal_after_failed_upgrade_cannot_replay_restart_intent(sandbox):
    root, trace, state, invoke = sandbox
    configured(root)
    state.touch()
    assert invoke("preremove", "upgrade", "next").returncode == 0
    assert invoke("postinstall", "configure", "previous", FAIL_IMPORT="1").returncode != 0
    marker = root / "var/lib/odin/.package-service-state"
    assert marker.read_text() == "active\n"
    assert invoke("preremove", "remove").returncode == 0
    assert not marker.exists()
    assert invoke("postinstall", "configure").returncode == 0
    assert not state.exists()
    assert "systemctl restart" not in trace.read_text()


@pytest.mark.parametrize("upgrade", [False, True])
def test_computer_runtime_and_private_state_provisioned_without_enabling(sandbox, upgrade):
    root, trace, _, invoke = sandbox
    data = root / "var/lib/odin/computer"
    if upgrade:
        configured(root)
        data.mkdir(parents=True)
        data.chmod(0o755)
        (data / "receipt").write_text("retained evidence")
    result = invoke("postinstall", "configure")
    assert result.returncode == 0, result.stderr
    assert data.is_dir() and not data.is_symlink()
    assert stat.S_IMODE(data.stat().st_mode) == 0o700
    calls = trace.read_text()
    assert f"pip install --quiet {root}/opt/odin[pdf,computer]" in calls
    assert "import PIL; import Xlib; import dbus_next" in calls
    assert f"chown -R odin:odin {root}/opt/odin {root}/var/lib/odin" in calls
    assert "gnome-extensions" not in calls
    assert "gsettings" not in calls
    if upgrade:
        assert (data / "receipt").read_text() == "retained evidence"
        assert (root / "etc/odin/config.yml").read_text() == "existing config\n"
    else:
        assert (root / "etc/odin/config.yml").read_text() == "web: {}\n"
    assert "Screen access" in result.stdout


@pytest.mark.parametrize("component", ["computer", "data"])
def test_computer_state_symlink_is_refused_before_ownership_changes(sandbox, component):
    root, trace, _, invoke = sandbox
    target = root / "unrelated"
    target.mkdir()
    (target / "keep").write_text("untouched")
    path = root / "var/lib/odin"
    path.parent.mkdir(parents=True)
    if component == "computer":
        path.mkdir()
        path /= "computer"
    path.symlink_to(target, target_is_directory=True)
    before = target.stat()
    result = invoke("postinstall", "configure")
    assert result.returncode != 0
    assert "unsafe computer state directory" in result.stderr
    assert "chown" not in trace.read_text()
    assert "systemctl" not in trace.read_text()
    assert "pip" not in trace.read_text()
    assert (target / "keep").read_text() == "untouched"
    assert target.stat().st_mode == before.st_mode


def test_computer_state_file_is_not_replaced(sandbox):
    root, _, _, invoke = sandbox
    path = root / "var/lib/odin/computer"
    path.parent.mkdir(parents=True)
    path.write_text("do not replace")
    result = invoke("postinstall", "configure")
    assert result.returncode != 0
    assert path.read_text() == "do not replace"
