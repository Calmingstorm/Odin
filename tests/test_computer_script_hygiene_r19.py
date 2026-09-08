"""Execute path gates and fixture construction without a desktop or daemon."""

import ast
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from src.computer.runtime import worker

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts/computer-feasibility"


def load(name, monkeypatch):
    monkeypatch.syspath_prepend(str(SCRIPTS))
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), SCRIPTS / name)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize(
    "bad",
    ["existing", "symlink", "dangling", "escape", "traversal", "nested", "relative", "prefix"],
)
@pytest.mark.parametrize(
    "script,prefix,arguments",
    [
        (
            "wayland-lab.sh",
            "wayland-",
            ["experiment-lifecycle", "--parent-authorized-after-contract-correction"],
        ),
        (
            "wayland-r8-lab.sh",
            "wayland-r8-",
            ["--isolated-stock-qualification", "native-headless", "localhost/odin-wayland-test:r1"],
        ),
        (
            "r8-composed-lab.sh",
            "r8-composed-",
            ["--isolated-production-composition", "localhost/odin-wayland-composed:r1"],
        ),
    ],
)
def test_shell_entry_rejects_unsafe_evidence(tmp_path, bad, script, prefix, arguments):
    root = tmp_path / "evidence"
    root.mkdir()
    evidence = root / (prefix + "new")
    if bad == "existing":
        evidence.mkdir()
    elif bad == "symlink":
        evidence.symlink_to(tmp_path, target_is_directory=True)
    elif bad == "dangling":
        evidence.symlink_to(tmp_path / "absent")
    elif bad == "escape":
        evidence = tmp_path / (prefix + "new")
    elif bad == "traversal":
        evidence = str(root) + "/" + prefix + "other/../" + prefix + "new"
    elif bad == "nested":
        evidence = root / (prefix + "other") / "new"
    elif bad == "relative":
        evidence = prefix + "new"
    else:
        evidence = root / "wrong-prefix"
    # A deny-only PATH prevents accidental runtime entry even if a guard regresses.
    tools = tmp_path / "tools"
    tools.mkdir()
    for name in ("dirname", "realpath"):
        (tools / name).symlink_to("/usr/bin/" + name)
    result = subprocess.run(
        ["/bin/bash", str(SCRIPTS / script), *arguments, str(evidence)],
        env={"PATH": str(tools), "EVIDENCE_ROOT": str(root)},
        capture_output=True,
        timeout=3,
    )
    assert result.returncode == 64, result.stderr


def test_shell_new_directory_gate_and_root_symlink(tmp_path):
    script = 'source "$1"; new_evidence_path "$2" wayland- && mkdir -m 700 -- "$2"'
    evidence = tmp_path / "wayland-new"
    args = ["bash", "-c", script, "gate", str(SCRIPTS / "evidence-path.sh"), str(evidence)]
    env = {**os.environ, "EVIDENCE_ROOT": str(tmp_path)}
    first = subprocess.run(args, env=env, capture_output=True, timeout=3)
    assert first.returncode == 0, first.stderr
    assert evidence.stat().st_mode & 0o777 == 0o700
    assert subprocess.run(args, env=env, capture_output=True, timeout=3).returncode == 64
    alias = tmp_path / "alias"
    alias.symlink_to(tmp_path, target_is_directory=True)
    env["EVIDENCE_ROOT"] = str(alias)
    args[-1] = str(alias / "wayland-next")
    assert subprocess.run(args, env=env, capture_output=True, timeout=3).returncode == 64


def test_model_fixture_path_guards(tmp_path, monkeypatch):
    fixture = load("model-application-fixture-r6.py", monkeypatch)
    monkeypatch.setattr(fixture.os, "geteuid", lambda: 0)
    monkeypatch.setattr(Path, "read_bytes", lambda self: b"owned-test-supervisor-r6.py\0")
    monkeypatch.setenv("EVIDENCE_ROOT", str(tmp_path))
    args = SimpleNamespace(display=178, evidence=str(tmp_path / "new"))
    fixture.validate_fixture_args(args)
    outside = tmp_path.parent / "outside"
    link = tmp_path / "link"
    link.symlink_to(outside)
    for path in (
        tmp_path,
        outside,
        link,
        link / "child",
        str(tmp_path) + "/inside/../new",
        "relative",
    ):
        args.evidence = str(path)
        with pytest.raises(RuntimeError, match="new_private_evidence_path_required"):
            fixture.validate_fixture_args(args)
    args.evidence = str(tmp_path / "new")
    args.display = 0
    with pytest.raises(RuntimeError, match="root_and_disposable_display_required"):
        fixture.validate_fixture_args(args)
    args.display = 178
    monkeypatch.setattr(Path, "read_bytes", lambda self: b"unrelated-supervisor\0")
    with pytest.raises(RuntimeError, match="owned_outer_supervisor_required"):
        fixture.validate_fixture_args(args)


def test_model_default_uses_current_home(tmp_path, monkeypatch):
    fixture = load("model-application-fixture-r6.py", monkeypatch)
    monkeypatch.delenv("EVIDENCE_ROOT", raising=False)
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setattr(fixture.os, "geteuid", lambda: 0)
    monkeypatch.setattr(Path, "read_bytes", lambda self: b"owned-test-supervisor-r6.py\0")
    fixture.validate_fixture_args(SimpleNamespace(display=178, evidence=str(tmp_path / "new")))


def test_containment_detects_any_home_entry_and_fails_closed(tmp_path, monkeypatch):
    home = tmp_path / "home"
    home.mkdir()
    status = tmp_path / "status"
    status.write_text("NoNewPrivs:\t1\nCapEff:\t0000000000000000\n")

    def path(value):
        return {"/home": home, "/proc/self/status": status}.get(value, tmp_path / "absent")

    monkeypatch.setattr(worker, "Path", path)
    monkeypatch.setattr(worker.os, "statvfs", lambda _: SimpleNamespace(f_blocks=2, f_frsize=4))
    monkeypatch.setattr(worker.os, "readlink", lambda _: "private-namespace")
    assert worker.containment_report()["host_home_visible"] is False
    sentinel = home / ".unexpected-account"
    sentinel.symlink_to(home / "missing")
    assert worker.containment_report()["host_home_visible"] is True
    sentinel.unlink()
    home.rmdir()
    with pytest.raises(FileNotFoundError):
        worker.containment_report()


def test_corpus_aggregation_uses_configured_root_and_counts_distinct(tmp_path):
    for suffix in ("a", "repeat"):
        run = tmp_path / ("corpus30-xed-" + suffix)
        run.mkdir()
        (run / "ledger.json").write_text(json.dumps([{"task": "task-1", "status": "pass"}]))
    status = tmp_path / "status.json"
    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPTS / "corpus30-summary.py"),
            "--evidence-root",
            str(tmp_path),
            "--status-output",
            str(status),
        ],
        capture_output=True,
        text=True,
        timeout=5,
    )
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["passed_distinct"] == 1
    report = json.loads(status.read_text())
    assert report == json.loads((tmp_path / "corpus30-aggregate.json").read_text())
    assert report["tasks"][0]["attempts"] == 2
    assert report["gate_met"] is False


def test_evidence_checker_configured_root_date_and_exact_identity(tmp_path):
    for suffix in (
        "guardian1",
        "causal-baseline",
        "causal-fixed1",
        "guardian-fixed1",
        "guardian-fixed2",
        "guardian-fixed3",
    ):
        root = tmp_path / ("wayland-r5-" + suffix + "-20300102")
        root.mkdir()
        cid = "a" * 64
        (root / "container.cid").write_text(cid)
        (root / "owned-cgroup.json").write_text(
            json.dumps({"group": "/docker/" + cid, "path": str(tmp_path / "absent-owned-cgroup")})
        )
        for file in ("census-identities.json", "owned-identities.json", "census-errors.json"):
            (root / file).write_text("[]")
        (root / "artifact-inventory.json").write_text("{}")
    command = [
        sys.executable,
        str(SCRIPTS / "wayland-evidence-check.py"),
        "--evidence-root",
        str(tmp_path),
        "--run-date",
        "20300102",
    ]
    result = subprocess.run(command, capture_output=True, text=True, timeout=5)
    assert result.returncode == 0, result.stderr
    assert len(json.loads(result.stdout)["runs"]) == 6
    (root / "container.cid").write_text("b" * 64)
    rejected = subprocess.run(command, capture_output=True, text=True, timeout=5)
    assert rejected.returncode != 0
    assert "does not match exact owned Docker ID" in rejected.stderr
    command[-1] = "../../escape"
    rejected = subprocess.run(command, capture_output=True, text=True, timeout=5)
    assert rejected.returncode == 2
    assert "must be YYYYMMDD" in rejected.stderr


def test_token_rewrite_is_unique_and_preserves_execution(monkeypatch):
    helper = load("fixture_source.py", monkeypatch)
    source = 'value = [\n    "a",\n    "b",\n]\n'
    rewritten = helper.replace_code(source, "'a', 'b',", "'a', 'c',")
    scope = {}
    exec(rewritten, scope)
    assert scope["value"] == ["a", "c"]
    for bad in ("'missing'", "'a', 'missing'"):
        with pytest.raises(RuntimeError, match="reviewed_runner_anchor_changed"):
            helper.replace_code(source, bad, "'c'")
    with pytest.raises(RuntimeError):
        helper.replace_code("value = ['a', 'a']", "'a'", "'c'")
    with pytest.raises(ValueError):
        helper.replace_code(source, "", "'c'")


@pytest.mark.parametrize("name", ["attached-apps-r6.py", "private-main-session-r6.py"])
def test_formatted_fixture_builder_emits_equivalent_isolated_argv(tmp_path, monkeypatch, name):
    module = load(name, monkeypatch)
    output = tmp_path / "output"
    output.mkdir()
    monkeypatch.setattr(module.tempfile, "mkdtemp", lambda **_: str(output))
    monkeypatch.setattr(module, "Reaper", lambda: SimpleNamespace(close=lambda: {"complete": True}))

    class Constructed(BaseException):
        pass

    def run(argv, **kwargs):
        if argv[:3] == ["sudo", "-n", "install"]:
            for value in argv[10:]:
                Path(value).mkdir(parents=True, exist_ok=True)
            return SimpleNamespace(returncode=0)
        raise Constructed

    monkeypatch.setattr(module.subprocess, "run", run)
    monkeypatch.setattr(
        module.subprocess, "Popen", lambda *a, **kw: (_ for _ in ()).throw(Constructed)
    )
    with pytest.raises(Constructed):
        if name == "attached-apps-r6.py":
            module.outer(SimpleNamespace(execute_isolated=True, task="writer"))
        else:
            module.outer()
    generated = output / "tree/scripts/computer-feasibility/x11-run.py"
    # Execute command construction only, stopping BEFORE any subprocess,
    # process census or service operation. No GUI is started.
    syntax = ast.parse(generated.read_text())
    prefix = []
    for node in syntax.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "group" for target in node.targets
        ):
            break
        prefix.append(node)
    scope = {"__file__": str(generated)}
    monkeypatch.setattr(sys, "argv", [str(generated), "--execute-isolated", "--crossuid-guardian"])
    exec(compile(ast.Module(body=prefix, type_ignores=[]), "<constructed-fixture>", "exec"), scope)
    argv, props = scope["sandbox"], scope["props"]
    assert "--unshare-net" in argv and "--unshare-pid" in argv
    assert "--clearenv" in argv and "--die-with-parent" in argv
    assert "ProtectHome=yes" in props and "PrivateNetwork=yes" in props
    assert "MemoryMax=2G" in props
    assert f"BindPaths={output / 'workspace'}:/r6-output" in props
    at = argv.index("/r6-output")
    assert argv[at - 1 : at + 2] == ["--bind", "/r6-output", "/workspace"]
    assert scope["env"]["DISPLAY"] == ":177"
    if name == "attached-apps-r6.py":
        assert "RuntimeMaxSec=240" in props
        assert scope["env"]["SAL_USE_VCLPLUGIN"] == "gtk3"
        at = argv.index("/etc/libreoffice")
        assert argv[at - 1 : at + 2] == ["--ro-bind", "/etc/libreoffice", "/etc/libreoffice"]
    else:
        assert "RuntimeMaxSec=300" in props
        assert "CAP_FOWNER" in argv
        assert any("CAP_FOWNER" in prop for prop in props)
        assert "/code/scripts/computer-feasibility" in argv
        at = argv.index("/r6-output/tmp")
        assert argv[at - 1 : at + 2] == ["--bind", "/r6-output/tmp", "/tmp"]
