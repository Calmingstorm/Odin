"""Exercise shipped packaging contracts without installs, services or networks."""
from __future__ import annotations

import importlib.util
import io
import json
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path
from unittest.mock import patch

import pytest
import yaml

from src.config.initialization import InitializationMode, InitializationRecoveryRequiredError
from src.config.package_migrations import migrate_compose_initialization, migrate_packaged_ssh_key
from src.config.persistence import patch_config_paths
from src.config.startup_context import provision_initialization_parent, resolve_startup_context

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def built_wheel(tmp_path_factory):
    directory = tmp_path_factory.mktemp("packaging-wheel")
    shutil.copy(ROOT / "pyproject.toml", directory)
    shutil.copytree(ROOT / "src", directory / "src", ignore=shutil.ignore_patterns("__pycache__"))
    subprocess.run(
        [sys.executable, "-c", "import setuptools.build_meta as b; b.build_wheel('wheel')"],
        cwd=directory, check=True, capture_output=True, text=True, timeout=90,
    )
    wheel = next((directory / "wheel").glob("*.whl"))
    extracted = directory / "extracted"
    with zipfile.ZipFile(wheel) as archive:
        assert "src/tools/model_hints_seed.json" in archive.namelist()
        archive.extractall(extracted)
    return extracted


def test_built_wheel_imports_catalogue_and_explicit_entrypoint_help(built_wheel, tmp_path):
    # CWD is deliberately not the source tree; no editable src may mask omissions.
    code = '''
import importlib.metadata as metadata
import pathlib, sys, urllib.request
import src.tools.model_hints as hints
assert pathlib.Path(hints.__file__).is_relative_to(pathlib.Path(sys.path[0]))
def no_network(*args, **kwargs):
    raise AssertionError("help must not contact a server")
urllib.request.urlopen = no_network
entries = metadata.distribution("odin-bot").entry_points
for name in ("odin-client", "odin-server", "odin"):
    entry = next(e for e in entries if e.name == name)
    sys.argv = [name, "--help"]
    try:
        entry.load()()
    except SystemExit as exc:
        assert exc.code == 0
'''
    result = subprocess.run(
        [sys.executable, "-c", f"import sys; sys.path.insert(0, {str(built_wheel)!r});" + code],
        cwd=tmp_path, env=os.environ | {"PYTHONPATH": str(built_wheel)},
        text=True, capture_output=True, check=True, timeout=30,
    )
    assert "--token" in result.stdout and "--env-file" in result.stdout


def test_debian_client_script_help_is_network_inert(tmp_path):
    result = subprocess.run([sys.executable, str(ROOT / "scripts/odin-cli.py"), "--help"],
                            cwd=tmp_path, check=True, capture_output=True, text=True, timeout=10,
                            env=os.environ | {"ODIN_URL": "http://inert.invalid"})
    assert "--token" in result.stdout and "--json" in result.stdout


@pytest.mark.parametrize("client", ["source", "debian"])
@pytest.mark.parametrize("json_mode", [False, True])
@pytest.mark.parametrize("is_error", [False, True])
def test_cli_real_request_rendering_and_exit_parity(
    monkeypatch, capsys, client, json_mode, is_error
):
    if client == "source":
        from src.cli import main
    else:
        spec = importlib.util.spec_from_file_location("packaged_cli", ROOT / "scripts/odin-cli.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        main = module.main
    payload = {"response": "fixture response", "is_error": is_error}
    calls = []

    def urlopen(request, timeout):
        calls.append((request, timeout))
        return io.BytesIO(json.dumps(payload).encode())

    monkeypatch.setattr(sys, "argv", ["odin-client", "fixture prompt", "--url", "http://inert/",
                                      "--token", "fixture", "--timeout", "17"] +
                       (["--json"] if json_mode else []))
    with patch("urllib.request.urlopen", urlopen):
        assert main() == int(is_error)
    request, timeout = calls[0]
    assert request.full_url == "http://inert/api/execute"
    assert request.get_method() == "POST"
    assert request.get_header("Authorization") == "Bearer fixture"
    assert json.loads(request.data) == {"prompt": "fixture prompt"}
    assert timeout == 17
    output = capsys.readouterr().out
    assert json.loads(output) == payload if json_mode else output.strip() == "fixture response"


def test_debian_server_wrapper_uses_install_cwd_from_unrelated_directory(tmp_path):
    app = tmp_path / "package"
    shutil.copytree(ROOT / "src", app / "src", ignore=shutil.ignore_patterns("__pycache__"))
    bin_dir = app / ".venv/bin"
    bin_dir.mkdir(parents=True)
    python = bin_dir / "python"
    python.write_text(f'#!/bin/sh\nexec "{sys.executable}" "$@"\n')
    python.chmod(0o755)
    wrapper = tmp_path / "odin-server"
    wrapper.write_text((ROOT / "scripts/odin-server").read_text().replace("/opt/odin", str(app)))
    result = subprocess.run(["sh", str(wrapper), "--help"], cwd=tmp_path, check=True,
                            text=True, capture_output=True, timeout=30,
                            env=os.environ | {"PYTHONPATH": ""})
    assert "active configuration file" in result.stdout


@pytest.mark.parametrize("key_value", [None, "legacy", "/custom/key", "${CUSTOM_KEY}"])
def test_debian_key_migration_preserves_custom_values_comments_mode_and_symlinks(
    tmp_path, key_value
):
    legacy = tmp_path / "legacy/key"
    packaged = tmp_path / "package/key"
    packaged.parent.mkdir()
    packaged.write_text("inert identity, never replaced")
    target = tmp_path / "operator.yml"
    effective_value = legacy if key_value == "legacy" else key_value
    key_line = "" if key_value is None else f"  ssh_key_path: {effective_value}\n"
    original = "# operator comment\ntools:\n" + key_line + "  command_timeout: 77\n"
    target.write_text(original)
    target.chmod(0o600)
    alias = tmp_path / "config.yml"
    alias.symlink_to(target)
    changes = key_value in (None, "legacy")
    assert migrate_packaged_ssh_key(alias, packaged, legacy) == changes
    assert alias.is_symlink() and alias.resolve() == target
    assert target.stat().st_mode & 0o777 == 0o600
    assert "# operator comment" in target.read_text()
    assert yaml.safe_load(target.read_text())["tools"]["command_timeout"] == 77
    if changes:
        assert yaml.safe_load(target.read_text())["tools"]["ssh_key_path"] == str(packaged)
    else:
        assert target.read_text() == original
    assert packaged.read_text() == "inert identity, never replaced"
    assert not migrate_packaged_ssh_key(alias, packaged, legacy)


@pytest.mark.parametrize("legacy_kind", ["file", "dangling_symlink", "absent_packaged", "anchor"])
def test_debian_key_migration_never_replaces_existing_identity_or_shared_yaml(
    tmp_path, legacy_kind
):
    legacy = tmp_path / "legacy-key"
    packaged = tmp_path / "packaged-key"
    if legacy_kind != "absent_packaged":
        packaged.write_text("packaged fixture")
    if legacy_kind == "file":
        legacy.write_text("operator identity")
    elif legacy_kind == "dangling_symlink":
        legacy.symlink_to(tmp_path / "not-present")
    config = tmp_path / "config.yml"
    original = f"tools: {'&shared ' if legacy_kind == 'anchor' else ''}{{ssh_key_path: {legacy}}}\n"
    if legacy_kind == "anchor":
        original += "other: *shared\n"
    config.write_text(original)
    assert not migrate_packaged_ssh_key(config, packaged, legacy)
    assert config.read_text() == original


def test_browser_installer_executes_install_and_launch_without_swallowing_failures(tmp_path):
    python = tmp_path / "python"
    trace = tmp_path / "trace"
    python.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$TRACE"\n'
                      'if [ "$1" = -m ]; then exit "${FAIL_INSTALL:-0}"; fi\n'
                      'exit "${FAIL_LAUNCH:-0}"\n')
    python.chmod(0o755)
    env = os.environ | {"TRACE": str(trace), "PLAYWRIGHT_BROWSERS_PATH": str(tmp_path / "cache")}
    script = ROOT / "scripts/install-browser-runtime.sh"
    for extras in ([], ["--with-deps"]):
        result = subprocess.run(["sh", str(script), str(python), *extras], env=env,
                                capture_output=True, text=True, check=True)
        assert result.returncode == 0
    calls = trace.read_text()
    assert "-m playwright install chromium" in calls
    assert "-m playwright install --with-deps chromium" in calls
    assert "p.chromium.launch(headless=True" in calls and "browser.close()" in calls
    for failure in ("FAIL_INSTALL", "FAIL_LAUNCH"):
        result = subprocess.run(["sh", str(script), str(python)], env=env | {failure: "17"},
                                capture_output=True, text=True)
        assert result.returncode == 17


def test_compose_layout_allows_real_atomic_config_update_after_legacy_migration(tmp_path):
    compose = yaml.safe_load((ROOT / "docker-compose.yml").read_text())
    volumes = compose["services"]["odin-bot"]["volumes"]
    assert "./config:/app/config" in volumes
    assert "./config.yml:/app/config.yml:ro" in volumes
    assert "odin-voice" not in compose["services"]
    legacy = tmp_path / "legacy.yml"
    legacy.write_text("# retained\nweb:\n  port: 3001\n")
    config_dir = tmp_path / "config"
    bindir = tmp_path / "bin"
    bindir.mkdir()
    python = bindir / "python"
    python.write_text('#!/bin/sh\nprintf "%s\\n" "$@"\n')
    python.chmod(0o755)
    env = os.environ | {"ODIN_COMPOSE_CONFIG_DIR": str(config_dir),
                        "ODIN_COMPOSE_LEGACY_CONFIG": str(legacy),
                        "PATH": f"{bindir}:/usr/bin:/bin"}
    command = compose["services"]["odin-bot"]["command"]
    command[1] = str(ROOT / "scripts/docker-compose-entrypoint.sh")
    subprocess.run(command, env=env, check=True, capture_output=True)
    target = config_dir / "config.yml"
    inode = target.stat().st_ino
    patch_config_paths([(("web", "port"), 3002)], path=target)
    assert target.stat().st_ino != inode
    assert "# retained" in target.read_text()
    assert yaml.safe_load(target.read_text())["web"]["port"] == 3002
    assert yaml.safe_load(legacy.read_text())["web"]["port"] == 3001
    subprocess.run(command, env=env, check=True, capture_output=True)
    assert yaml.safe_load(target.read_text())["web"]["port"] == 3002


def test_incus_script_manifest_and_template_paths_with_inert_transport(tmp_path):
    project = tmp_path / "project"
    scripts = project / "scripts"
    scripts.mkdir(parents=True)
    script = scripts / "incus-deploy.sh"
    shutil.copy(ROOT / "scripts/incus-deploy.sh", script)
    for name in ("config.yml", ".env", "pyproject.toml"):
        (project / name).write_text("inert fixture")
    for name in ("src", "ui/dist", "data/context", "data/skills"):
        (project / name).mkdir(parents=True)
    (project / "data/context/inert.template").write_text("template fixture")
    shutil.copy(ROOT / "scripts/install-browser-runtime.sh", scripts)
    bindir = tmp_path / "bin"
    bindir.mkdir()
    trace = tmp_path / "trace"
    incus = bindir / "incus"
    incus.write_text('#!/usr/bin/python3\nimport json, os, sys\n'
                     'with open(os.environ["TRACE"], "a") as f:\n'
                     '    f.write(json.dumps(sys.argv[1:]) + "\\n")\n')
    incus.chmod(0o755)
    subprocess.run(["bash", str(script), "inert-container"], check=True, text=True,
                   capture_output=True, timeout=15,
                   env=os.environ | {"PATH": f"{bindir}:/usr/bin:/bin", "TRACE": str(trace)})
    calls = [json.loads(line) for line in trace.read_text().splitlines()]
    ui = [call for call in calls if call[:3] == ["file", "push", "-r"] and
          call[3] == str(project / "ui")]
    assert ui == [["file", "push", "-r", str(project / "ui"), "inert-container/app/"]]
    assert ["file", "push", str(project / "data/context/inert.template"),
            "inert-container/app/data/context/inert.template"] in calls
    exec_code = "\n".join(call[-1] for call in calls if call[0] == "exec")
    assert "'[pdf,browser]'" not in exec_code  # dependency is attached to the project
    assert "'.[pdf,browser]'" in exec_code
    assert "sh /app/install-browser-runtime.sh python3 --with-deps" in exec_code
    assert "Environment=PLAYWRIGHT_BROWSERS_PATH=/app/.cache/ms-playwright" in exec_code
    for call in calls:
        if call[:2] == ["file", "push"]:
            assert Path(call[-2]).exists()


@pytest.mark.parametrize("complete", [False, True])
@pytest.mark.parametrize("explicit", [False, True])
def test_compose_relocation_preserves_initialization_and_listener_decision(
    tmp_path, monkeypatch, complete, explicit
):
    old_config = tmp_path / "old/config.yml"
    old_config.parent.mkdir()
    old_config.write_text("web: {}\n")
    target = tmp_path / "new/config.yml"
    target.parent.mkdir()
    shutil.copy(old_config, target)
    state_path = str(tmp_path / "pinned/state.json") if explicit else None
    if explicit:
        monkeypatch.setenv("ODIN_INITIALIZATION_STATE", state_path)
    else:
        monkeypatch.delenv("ODIN_INITIALIZATION_STATE", raising=False)
    context = resolve_startup_context(old_config, initialization_state=state_path)
    provision_initialization_parent(context.initialization_state_path)
    store = context.onboarding_store()
    store.provision_fresh()
    if complete:
        store.complete(lambda: None)
        store.set_bind_decision(loopback_restricted=False, explicit_widening=True)
    before = context.initialization_state_path.read_bytes()
    assert migrate_compose_initialization(old_config, target)
    relocated = resolve_startup_context(
        target, initialization_state=state_path
    ).onboarding_store().state()
    mode = InitializationMode.COMPLETE if complete else InitializationMode.PENDING
    assert relocated.mode is mode
    assert relocated.loopback_restricted is not complete
    assert relocated.explicit_widening is complete
    assert relocated.binding.config_path == target.resolve()
    if not explicit:
        assert context.initialization_state_path.read_bytes() == before
    assert not migrate_compose_initialization(old_config, target)


def test_compose_relocation_never_discards_corrupt_initialization(tmp_path):
    old_config = tmp_path / "old/config.yml"
    old_config.parent.mkdir()
    old_config.write_text("web: {}\n")
    target = tmp_path / "new/config.yml"
    target.parent.mkdir()
    shutil.copy(old_config, target)
    context = resolve_startup_context(old_config)
    provision_initialization_parent(context.initialization_state_path)
    context.initialization_state_path.write_text("broken fixture")
    context.initialization_state_path.chmod(0o600)
    with pytest.raises(InitializationRecoveryRequiredError):
        migrate_compose_initialization(old_config, target)
    assert context.initialization_state_path.read_text() == "broken fixture"
    assert not resolve_startup_context(target).initialization_state_path.exists()


def test_all_shipped_operational_shell_scripts_parse():
    for directory in ("scripts", "packaging"):
        for script in (ROOT / directory).glob("*.sh"):
            subprocess.run(["bash", "-n", str(script)], check=True, capture_output=True)
    subprocess.run(["sh", "-n", str(ROOT / "scripts/odin-server")],
                   check=True, capture_output=True)


def test_compose_relocation_keeps_existing_target_state(tmp_path):
    configs = [tmp_path / name / "config.yml" for name in ("old", "new")]
    contexts = []
    for config in configs:
        config.parent.mkdir()
        config.write_text("web: {}\n")
        context = resolve_startup_context(config)
        provision_initialization_parent(context.initialization_state_path)
        context.onboarding_store().provision_fresh()
        contexts.append(context)
    target_store = contexts[1].onboarding_store()
    target_store.complete(lambda: None)
    before = contexts[1].initialization_state_path.read_bytes()
    assert not migrate_compose_initialization(*configs)
    assert contexts[1].initialization_state_path.read_bytes() == before
    assert target_store.state().mode is InitializationMode.COMPLETE


def test_compose_relocation_does_not_invent_pending_state_for_legacy_without_record(tmp_path):
    assert not migrate_compose_initialization(tmp_path / "old.yml", tmp_path / "new.yml")
    assert not (tmp_path / "data").exists()


def test_docker_runtime_has_package_source_and_browser_qualification():
    dockerfile = (ROOT / "Dockerfile").read_text()
    assert dockerfile.index("COPY src/ src/") < dockerfile.index("RUN pip install")
    assert "ENV PLAYWRIGHT_BROWSERS_PATH=/app/.cache/ms-playwright" in dockerfile
    assert "RUN sh /app/install-browser-runtime.sh python --with-deps" in dockerfile
    package = yaml.safe_load((ROOT / "packaging/nfpm.yml").read_text())
    sources = {row["dst"]: row.get("src") for row in package["contents"]}
    assert sources["/opt/odin/scripts/install-browser-runtime.sh"] == (
        "./scripts/install-browser-runtime.sh"
    )
    assert "Environment=PLAYWRIGHT_BROWSERS_PATH=/opt/odin/.cache/ms-playwright" in (
        ROOT / "packaging/odin.service"
    ).read_text()
