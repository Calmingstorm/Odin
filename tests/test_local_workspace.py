"""Local command workspace: the 2026-07-27 wipe mechanism, closed.

The incident: an AE2 jar whose internal layout is ``data/`` was extracted and
then cleaned up with ``rm -rf data``. Local user commands inherited the
service's working directory (the install root), so that relative path resolved
to ``/opt/odin/data`` and deleted Odin's live state.

Aaron's acceptance bar is explicit: the *exact* three-command workflow must
still succeed — extract, read, clean up — while the install is untouched. So
the headline test replays those three commands for real, in a pytest-owned
temporary fixture.

Safety of that replay is structural, not conventional. The fixture arranges
things so a REGRESSION is what gets destroyed: the test process's own cwd is
set to the fake install, so if the plumbing ever stopped passing ``cwd=``, the
relative ``rm -rf data`` would delete the fixture's sentinel and the assertion
would fail loudly. Every path involved is under ``tmp_path``, and the test
asserts that before any deletion runs.
"""

from __future__ import annotations

import zipfile
from pathlib import Path

import pytest

from src.tools.process_manager import ProcessRegistry
from src.tools.ssh import run_local_command
from src.tools.workspace import WorkspaceError, resolve_workspace, workspace_env


@pytest.fixture
def fake_install(tmp_path: Path) -> Path:
    """A stand-in for /opt/odin, complete with the data dir that got wiped."""
    install = tmp_path / "fake-install"
    (install / "data").mkdir(parents=True)
    (install / "data" / "sentinel").write_text("live odin state", encoding="utf-8")
    return install


@pytest.fixture
def workspace(tmp_path: Path) -> Path:
    ws = tmp_path / "workspace"
    ws.mkdir(mode=0o700)
    return ws


@pytest.fixture
def ae2_jar(tmp_path: Path) -> Path:
    """A jar shaped like the real one: its internal layout starts with data/."""
    jar = tmp_path / "appliedenergistics2-19.2.17.jar"
    with zipfile.ZipFile(jar, "w") as zf:
        zf.writestr(
            "data/ae2/recipe/network/blocks/pattern_providers_interface.json",
            '{"type": "ae2:shaped"}',
        )
        zf.writestr("data/ae2/recipe/network/crafting/cpu_crafting_unit.json", "{}")
    return jar


# --- validation: fail closed -------------------------------------------------


def test_valid_workspace_resolves(workspace: Path, fake_install: Path) -> None:
    resolved = resolve_workspace(str(workspace), install_root=str(fake_install))
    assert resolved == workspace.resolve()


@pytest.mark.parametrize("value", ["", "   ", "relative/path", "~/tilde-but-relative"])
def test_rejects_non_absolute_or_empty(value: str, fake_install: Path) -> None:
    with pytest.raises(WorkspaceError):
        resolve_workspace(value, install_root=str(fake_install))


def test_rejects_missing_directory(tmp_path: Path, fake_install: Path) -> None:
    with pytest.raises(WorkspaceError, match="does not exist"):
        resolve_workspace(str(tmp_path / "nope"), install_root=str(fake_install))


def test_rejects_file_masquerading_as_directory(tmp_path: Path, fake_install: Path) -> None:
    target = tmp_path / "afile"
    target.write_text("x", encoding="utf-8")
    with pytest.raises(WorkspaceError, match="not a directory"):
        resolve_workspace(str(target), install_root=str(fake_install))


def test_rejects_symlink(tmp_path: Path, workspace: Path, fake_install: Path) -> None:
    """A symlink could be repointed later, silently moving every command's cwd."""
    link = tmp_path / "link-to-workspace"
    link.symlink_to(workspace)
    with pytest.raises(WorkspaceError, match="symlink"):
        resolve_workspace(str(link), install_root=str(fake_install))


def test_rejects_workspace_inside_install(fake_install: Path) -> None:
    """The whole point is to be outside the install — inside would reopen it."""
    inside = fake_install / "scratch"
    inside.mkdir(mode=0o700)
    with pytest.raises(WorkspaceError, match="outside"):
        resolve_workspace(str(inside), install_root=str(fake_install))


def test_rejects_workspace_inside_data_root(tmp_path: Path, fake_install: Path) -> None:
    data_ws = fake_install / "data" / "ws"
    data_ws.mkdir(mode=0o700)
    with pytest.raises(WorkspaceError, match="outside"):
        resolve_workspace(
            str(data_ws), install_root=str(fake_install), data_root=str(fake_install / "data")
        )


def test_rejects_group_or_world_accessible(tmp_path: Path, fake_install: Path) -> None:
    loose = tmp_path / "loose"
    loose.mkdir(mode=0o755)
    with pytest.raises(WorkspaceError, match="group/world"):
        resolve_workspace(str(loose), install_root=str(fake_install))


def test_env_normalizes_pwd_and_oldpwd(workspace: Path) -> None:
    """cwd= alone leaves an inherited OLDPWD pointing at the install, so a bare
    `cd -` walks straight back in. Both must be normalized."""
    env = workspace_env(workspace, base={"OLDPWD": "/opt/odin", "PWD": "/opt/odin"})
    assert env["PWD"] == str(workspace)
    assert env["OLDPWD"] == str(workspace)


# --- the acceptance bar: Aaron's exact workflow ------------------------------


@pytest.mark.parametrize("streamed", [False, True], ids=["buffered", "streaming"])
async def test_incident_workflow_succeeds_without_touching_install(
    fake_install: Path,
    workspace: Path,
    ae2_jar: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    streamed: bool,
) -> None:
    """The 2026-07-27 command sequence, replayed as three separate commands.

    Extract, read, clean up — all must SUCCEED (Aaron's bar: don't prevent him
    from doing what he was trying to do), while the install's data survives.
    """
    # The test process stands in the fake install: if cwd= plumbing regressed,
    # the relative rm below could only destroy this fixture, never real data.
    monkeypatch.chdir(fake_install)
    assert Path.cwd() == fake_install.resolve()
    assert tmp_path in fake_install.parents or fake_install.is_relative_to(tmp_path)

    ws = str(resolve_workspace(str(workspace), install_root=str(fake_install)))
    collected: list[str] = []
    cb = (lambda line: collected.append(line)) if streamed else None

    # 1. extract, exactly as he did — relative `data/...` out of the jar
    code, out = await run_local_command(
        f"jar xf {ae2_jar} data/ae2/recipe/network/blocks/pattern_providers_interface.json"
        f" || unzip -o {ae2_jar} 'data/ae2/recipe/network/blocks/*' > /dev/null",
        timeout=30,
        on_output=cb,
        cwd=ws,
    )
    assert code == 0, out
    extracted = workspace / "data/ae2/recipe/network/blocks/pattern_providers_interface.json"
    assert extracted.exists(), "extraction must land in the workspace"
    assert not (fake_install / "data" / "ae2").exists(), "must not touch the install"

    # 2. read it back — the actual research task
    code, out = await run_local_command(
        "cat data/ae2/recipe/network/blocks/pattern_providers_interface.json",
        timeout=30,
        cwd=ws,
    )
    assert code == 0
    assert "ae2:shaped" in out

    # 3. clean up after himself — THE command that caused the incident.
    # Bounded by construction: cwd is asserted inside tmp_path above.
    assert Path(ws).is_relative_to(tmp_path)
    code, _ = await run_local_command("rm -rf data", timeout=30, cwd=ws)
    assert code == 0

    assert not (workspace / "data").exists(), "cleanup must work in the workspace"
    # The whole point:
    assert (fake_install / "data" / "sentinel").read_text(encoding="utf-8") == "live odin state"


async def test_explicit_cd_into_install_still_works(
    fake_install: Path,
    workspace: Path,
) -> None:
    """Aaron's second bar: deliberately operating inside his own install — for
    reviews, tests, greps — must remain possible. The default moves; explicit
    intent is untouched."""
    ws = str(resolve_workspace(str(workspace), install_root=str(fake_install)))

    code, out = await run_local_command(f"cd {fake_install} && pwd", timeout=30, cwd=ws)
    assert code == 0
    assert out.strip() == str(fake_install)

    # and reading install files by relative path after an explicit cd
    code, out = await run_local_command(
        f"cd {fake_install} && cat data/sentinel", timeout=30, cwd=ws
    )
    assert code == 0
    assert "live odin state" in out


async def test_absolute_paths_are_unaffected(fake_install: Path, workspace: Path) -> None:
    ws = str(resolve_workspace(str(workspace), install_root=str(fake_install)))
    code, out = await run_local_command(f"cat {fake_install}/data/sentinel", timeout=30, cwd=ws)
    assert code == 0
    assert "live odin state" in out


async def test_relative_paths_persist_across_commands(
    fake_install: Path,
    workspace: Path,
) -> None:
    """The workspace is STABLE, not per-command: a file written relatively in
    one command must still be there for the next. A fresh temp dir per command
    would silently break two-step workflows."""
    ws = str(resolve_workspace(str(workspace), install_root=str(fake_install)))
    code, _ = await run_local_command("echo carried > note.txt", timeout=30, cwd=ws)
    assert code == 0
    code, out = await run_local_command("cat note.txt", timeout=30, cwd=ws)
    assert code == 0
    assert "carried" in out


async def test_cd_dash_cannot_return_to_the_install(
    fake_install: Path,
    workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """OLDPWD normalization: with an inherited OLDPWD the shell's `cd -` would
    hop straight back into the install."""
    monkeypatch.setenv("OLDPWD", str(fake_install))
    ws = str(resolve_workspace(str(workspace), install_root=str(fake_install)))
    code, out = await run_local_command("cd - > /dev/null 2>&1; pwd", timeout=30, cwd=ws)
    assert code == 0
    assert str(fake_install) not in out


# --- background processes: the alternate route -------------------------------


async def test_background_process_uses_the_workspace(
    fake_install: Path,
    workspace: Path,
) -> None:
    """`manage_process start` must not remain a second path to the incident."""
    ws = str(resolve_workspace(str(workspace), install_root=str(fake_install)))
    registry = ProcessRegistry(workspace=ws)
    result = await registry.start("localhost", "pwd; sleep 0.2")
    assert "Started" in result or "PID" in result
    import asyncio

    await asyncio.sleep(0.6)
    output = "".join("".join(info.output_buffer) for info in registry._processes.values())
    assert str(workspace) in output
    assert str(fake_install) not in output
    for info in registry._processes.values():
        if info.status == "running":
            await registry.kill(info.pid)


def test_registry_without_workspace_inherits_cwd() -> None:
    """Internal callers that legitimately need the application directory keep
    the old behaviour; the scoping is explicit rather than accidental."""
    assert ProcessRegistry()._workspace is None


# --- scoping: remote execution is untouched ----------------------------------


def test_remote_execution_signature_has_no_workspace() -> None:
    """The workspace is a LOCAL user-command concern. Remote SSH runs in the
    remote account's own home and must not be rewritten by this change."""
    import inspect

    from src.tools.ssh import run_ssh_command

    assert "cwd" not in inspect.signature(run_ssh_command).parameters


def test_legacy_dag_surfaces_are_classified() -> None:
    """src/odin/tools/{shell,process}.py also inherit cwd today. They are NOT on
    the Discord execution path, but if either is ever wired in without a
    workspace it silently reopens the 2026-07-27 mechanism. This pin exists so
    that wiring cannot happen quietly."""
    repo = Path(__file__).resolve().parents[1]
    for legacy in (repo / "src/odin/tools/shell.py", repo / "src/odin/tools/process.py"):
        if not legacy.exists():
            continue
        source = legacy.read_text(encoding="utf-8")
        assert "create_subprocess_shell" in source
        executor = (repo / "src/tools/executor.py").read_text(encoding="utf-8")
        assert "src.odin.tools.shell" not in executor
        assert "from ..odin.tools" not in executor
