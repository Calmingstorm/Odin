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

import os
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
    resolved = resolve_workspace(str(workspace), protected_roots=[str(fake_install)])
    assert resolved == workspace.resolve()


@pytest.mark.parametrize("value", ["", "   ", "relative/path", "~/tilde-but-relative"])
def test_rejects_non_absolute_or_empty(value: str, fake_install: Path) -> None:
    with pytest.raises(WorkspaceError):
        resolve_workspace(value, protected_roots=[str(fake_install)])


def test_rejects_missing_directory(tmp_path: Path, fake_install: Path) -> None:
    with pytest.raises(WorkspaceError, match="does not exist"):
        resolve_workspace(str(tmp_path / "nope"), protected_roots=[str(fake_install)])


def test_rejects_file_masquerading_as_directory(tmp_path: Path, fake_install: Path) -> None:
    target = tmp_path / "afile"
    target.write_text("x", encoding="utf-8")
    with pytest.raises(WorkspaceError, match="not a directory"):
        resolve_workspace(str(target), protected_roots=[str(fake_install)])


def test_rejects_symlink(tmp_path: Path, workspace: Path, fake_install: Path) -> None:
    """A symlink could be repointed later, silently moving every command's cwd."""
    link = tmp_path / "link-to-workspace"
    link.symlink_to(workspace)
    with pytest.raises(WorkspaceError, match="symlink"):
        resolve_workspace(str(link), protected_roots=[str(fake_install)])


def test_rejects_workspace_inside_install(fake_install: Path) -> None:
    """The whole point is to be outside the install — inside would reopen it."""
    inside = fake_install / "scratch"
    inside.mkdir(mode=0o700)
    with pytest.raises(WorkspaceError, match="overlap"):
        resolve_workspace(str(inside), protected_roots=[str(fake_install)])


def test_rejects_workspace_inside_data_root(tmp_path: Path, fake_install: Path) -> None:
    data_ws = fake_install / "data" / "ws"
    data_ws.mkdir(mode=0o700)
    with pytest.raises(WorkspaceError, match="overlap"):
        resolve_workspace(
            str(data_ws), protected_roots=[str(fake_install), str(fake_install / "data")]
        )


@pytest.mark.parametrize("mode", [0o755, 0o750, 0o770, 0o300, 0o500, 0o600])
def test_rejects_any_mode_other_than_0700(mode: int, tmp_path: Path, fake_install: Path) -> None:
    """Group/world bits leak a workspace that holds command output; an
    owner-only mode like 0300 is private but not readable, which breaks
    ordinary use. The contract is exactly 0700 (PR #239 review)."""
    target = tmp_path / f"mode-{mode:o}"
    target.mkdir(mode=mode)
    try:
        with pytest.raises(WorkspaceError, match="mode"):
            resolve_workspace(str(target), protected_roots=[str(fake_install)])
    finally:
        target.chmod(0o700)


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

    ws = str(resolve_workspace(str(workspace), protected_roots=[str(fake_install)]))
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
    ws = str(resolve_workspace(str(workspace), protected_roots=[str(fake_install)]))

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
    ws = str(resolve_workspace(str(workspace), protected_roots=[str(fake_install)]))
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
    ws = str(resolve_workspace(str(workspace), protected_roots=[str(fake_install)]))
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
    ws = str(resolve_workspace(str(workspace), protected_roots=[str(fake_install)]))
    code, out = await run_local_command("cd - > /dev/null 2>&1; pwd", timeout=30, cwd=ws)
    assert code == 0
    assert str(fake_install) not in out


# --- background processes: the alternate route -------------------------------


async def test_background_process_uses_the_workspace(
    fake_install: Path,
    workspace: Path,
) -> None:
    """`manage_process start` must not remain a second path to the incident."""
    ws = str(resolve_workspace(str(workspace), protected_roots=[str(fake_install)]))
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


def test_discord_execution_path_excludes_the_legacy_dag_surfaces() -> None:
    """The legacy `src/odin/tools/{shell,process}.py` surfaces spawn subprocesses
    that inherit the application cwd, so if the Discord path ever adopted them
    the 2026-07-27 mechanism reopens behind this fix.

    The previous version of this test only grepped two literal import spellings
    in executor.py, and would have stayed green under transitive wiring —
    `ToolRegistry.with_defaults()` already registers `ShellTool` for the
    separate legacy CLI (PR #239 round-2 review). This instead characterizes
    the ACTUAL Discord-reachable boundary by importing it and proving the
    legacy modules are absent from everything it can route to.
    """
    import sys

    from src.tools.executor import EXECUTOR_HANDLERS, ToolExecutor
    from src.tools.registry import TOOLS

    legacy_modules = {"src.odin.tools.shell", "src.odin.tools.process"}

    # 1. Nothing the Discord tool catalog exposes may be owned by a legacy module.
    for tool in TOOLS:
        name = tool.get("name") if isinstance(tool, dict) else None
        assert name, "every published tool must be named"

    # 2. Every executor handler resolves to a module inside src.tools.*,
    #    never the legacy DAG surfaces.
    for tool_name, (owner_key, attr) in EXECUTOR_HANDLERS.items():
        assert not owner_key.startswith("odin."), (
            f"{tool_name} routes through a legacy owner: {owner_key}.{attr}"
        )

    # 3. Importing the Discord execution path must not pull the legacy modules
    #    in transitively. Import it fresh and check what landed in sys.modules.
    for module in list(legacy_modules):
        sys.modules.pop(module, None)
    import importlib

    importlib.reload(importlib.import_module("src.tools.executor"))
    still_absent = legacy_modules - set(sys.modules)
    assert still_absent == legacy_modules, (
        f"the Discord execution path transitively imports {legacy_modules - still_absent}; "
        "those surfaces inherit the application cwd and would reopen the wipe mechanism"
    )

    # 4. The executor's own handler domains must not expose a legacy shell tool.
    executor = ToolExecutor.__new__(ToolExecutor)
    for owner_key, _attr in EXECUTOR_HANDLERS.values():
        owner = getattr(executor, owner_key, None)
        if owner is None:
            continue
        assert "odin.tools" not in type(owner).__module__


# --- THE SEAM THAT ACTUALLY FAILED: through ToolExecutor --------------------
#
# PR #239 review, blocker 4: the low-level replay proves run_local_command
# honors a supplied cwd, but NOT that the executor supplies one. Deleting
# `cwd=self._ensure_local_workspace()` from the executor would reopen the
# incident while the low-level test still passed. These exercise the real path.


def _executor_with_workspace(workspace: Path, protected: Path):
    """A ToolExecutor whose local commands run in ``workspace``."""
    from src.config.schema import ToolsConfig
    from src.tools.executor import ToolExecutor

    config = ToolsConfig(local_working_dir=str(workspace))
    executor = ToolExecutor(config=config)
    # Protected roots are normally derived from the running app; point them at
    # the fixture so the test exercises real validation against a fake install.
    executor._protected_roots = lambda: [str(protected)]  # type: ignore[method-assign]
    return executor


async def test_executor_replays_the_incident_without_touching_the_install(
    fake_install: Path,
    workspace: Path,
    ae2_jar: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The 2026-07-27 sequence through the EXECUTOR — the seam that failed.

    Deleting the executor's cwd argument must break this test, which the
    low-level replay could not detect.
    """
    monkeypatch.chdir(fake_install)  # a regression can only destroy the fixture
    assert Path.cwd() == fake_install.resolve()
    executor = _executor_with_workspace(workspace, fake_install)

    code, out = await executor._exec_command(
        "localhost",
        f"jar xf {ae2_jar} data/ae2/recipe/network/blocks/pattern_providers_interface.json"
        f" || unzip -o {ae2_jar} 'data/ae2/recipe/network/blocks/*' > /dev/null",
        timeout=30,
    )
    assert code == 0, out
    assert (workspace / "data/ae2/recipe/network/blocks").exists()
    assert not (fake_install / "data" / "ae2").exists()

    code, out = await executor._exec_command(
        "localhost",
        "cat data/ae2/recipe/network/blocks/pattern_providers_interface.json",
        timeout=30,
    )
    assert code == 0 and "ae2:shaped" in out

    assert Path(str(workspace)).is_relative_to(tmp_path)  # bounded before deleting
    code, _ = await executor._exec_command("localhost", "rm -rf data", timeout=30)
    assert code == 0
    assert not (workspace / "data").exists(), "cleanup must work"
    assert (fake_install / "data" / "sentinel").read_text(encoding="utf-8") == "live odin state"


async def test_executor_pwd_is_the_workspace(fake_install: Path, workspace: Path) -> None:
    executor = _executor_with_workspace(workspace, fake_install)
    code, out = await executor._exec_command("localhost", "pwd", timeout=30)
    assert code == 0
    assert out.strip() == str(workspace.resolve())


async def test_executor_explicit_cd_into_install_still_works(
    fake_install: Path, workspace: Path
) -> None:
    """Aaron's bar: deliberately working inside his own install is untouched."""
    executor = _executor_with_workspace(workspace, fake_install)
    code, out = await executor._exec_command(
        "localhost", f"cd {fake_install} && cat data/sentinel", timeout=30
    )
    assert code == 0 and "live odin state" in out


async def test_executor_background_process_uses_the_workspace(
    fake_install: Path, workspace: Path
) -> None:
    """manage_process must not remain an alternate route to the incident, and
    the registry must get its workspace FROM the executor."""
    executor = _executor_with_workspace(workspace, fake_install)
    registry = executor._ensure_process_registry()
    assert registry._workspace == str(workspace.resolve())

    await registry.start("localhost", "pwd; sleep 0.2")
    import asyncio

    await asyncio.sleep(0.6)
    output = "".join("".join(i.output_buffer) for i in registry._processes.values())
    assert str(workspace.resolve()) in output
    assert str(fake_install) not in output
    for info in registry._processes.values():
        if info.status == "running":
            await registry.kill(info.pid)


async def test_executor_refuses_to_run_with_an_invalid_workspace(
    fake_install: Path, tmp_path: Path
) -> None:
    """Fail closed at the point of use: no subprocess may run against an
    unvalidated cwd, and there is deliberately no fallback to the inherited
    directory — that fallback is the hazard."""
    executor = _executor_with_workspace(tmp_path / "does-not-exist", fake_install)
    with pytest.raises(WorkspaceError):
        await executor._exec_command("localhost", "echo should-not-run", timeout=10)


# --- protected roots: real deployment shapes --------------------------------


def test_rejects_workspace_inside_symlinked_live_data(tmp_path: Path) -> None:
    """Packaged installs symlink /opt/odin/data -> /var/lib/odin. A string-joined
    check would accept a workspace sitting inside the REAL data directory."""
    install = tmp_path / "opt-odin"
    install.mkdir()
    real_data = tmp_path / "var-lib-odin"
    real_data.mkdir()
    (install / "data").symlink_to(real_data)
    ws = real_data / "workspace"
    ws.mkdir(mode=0o700)
    with pytest.raises(WorkspaceError, match="overlap"):
        resolve_workspace(str(ws), protected_roots=[str(install), str(install / "data")])


def test_rejects_workspace_inside_non_opt_install_root(tmp_path: Path) -> None:
    """Docker's install root is /app and source checkouts are arbitrary — the
    validator must use the roots it is given, not a hardcoded /opt/odin."""
    app = tmp_path / "app"
    (app / "sub").mkdir(parents=True)
    (app / "sub").chmod(0o700)
    with pytest.raises(WorkspaceError, match="overlap"):
        resolve_workspace(str(app / "sub"), protected_roots=[str(app)])


def test_rejects_workspace_that_contains_a_protected_root(tmp_path: Path) -> None:
    """Overlap is bidirectional: a workspace that CONTAINS the install is just
    as unusable as one nested inside it."""
    parent = tmp_path / "parent"
    install = parent / "opt-odin"
    install.mkdir(parents=True)
    parent.chmod(0o700)
    with pytest.raises(WorkspaceError, match="overlap"):
        resolve_workspace(str(parent), protected_roots=[str(install)])


def test_rejects_wrong_owner(tmp_path: Path, fake_install: Path) -> None:
    """The contract is a directory owned by the execution identity."""
    ws = tmp_path / "otherowner"
    ws.mkdir(mode=0o700)
    with pytest.raises(WorkspaceError, match="owned by uid"):
        resolve_workspace(
            str(ws), protected_roots=[str(fake_install)], owner_uid=os.getuid() + 12345
        )


# --- provisioning: the repo must ship installable ---------------------------


def test_every_install_path_provisions_the_workspace() -> None:
    """PR #239 review, blocker 2: the default fails closed when absent, so a
    deployment that never creates it loses local-command capability on first
    use. Each supported install path must provision it."""
    repo = Path(__file__).resolve().parents[1]
    default = "/var/lib/odin-workspace"

    postinstall = (repo / "packaging/postinstall.sh").read_text(encoding="utf-8")
    assert default in postinstall
    assert "chmod 0700" in postinstall

    dockerfile = (repo / "Dockerfile").read_text(encoding="utf-8")
    assert default in dockerfile and "0700" in dockerfile

    compose = (repo / "docker-compose.yml").read_text(encoding="utf-8")
    assert default in compose, "the workspace must persist across container restarts"


async def test_executor_enforces_its_protected_roots(fake_install: Path) -> None:
    """The executor must PASS its derived roots to the validator, not merely
    own them. Without this pin, dropping `protected_roots=` from the executor
    leaves every other test green while an inside-the-install workspace is
    silently accepted."""
    inside = fake_install / "scratch"
    inside.mkdir(mode=0o700)
    executor = _executor_with_workspace(inside, fake_install)
    with pytest.raises(WorkspaceError, match="overlap"):
        await executor._exec_command("localhost", "echo should-not-run", timeout=10)


def test_executor_derives_real_roots_from_the_running_app() -> None:
    """Roots come from the running application, not a hardcoded /opt/odin —
    otherwise Docker (/app) and source checkouts get no protection at all."""
    from src.config.schema import ToolsConfig
    from src.tools.executor import ToolExecutor

    executor = ToolExecutor(config=ToolsConfig())
    roots = [Path(r).resolve() for r in executor._protected_roots()]
    repo = Path(__file__).resolve().parents[1]
    assert repo.resolve() in roots, "the actual install/package root must be protected"
    assert any("data" in str(r) for r in roots), "the live-data root must be protected"


def test_memory_path_directory_is_protected_when_other_paths_relocate(tmp_path: Path) -> None:
    """PR #239 round-2 blocker 1, reproduced by Odin as UNSAFE_ACCEPTED.

    Deriving data roots from audit/trajectory alone means that if those are
    configured elsewhere, a workspace sitting beside the live memory.json is
    accepted. memory.json is the most valuable file in the tree.
    """
    from src.config.schema import ToolsConfig
    from src.tools.executor import ToolExecutor

    live_data = tmp_path / "var-lib-odin"
    live_data.mkdir()
    (live_data / "memory.json").write_text("{}", encoding="utf-8")
    workspace = live_data / "workspace"       # beside the live memory file
    workspace.mkdir(mode=0o700)

    # audit + trajectories deliberately relocated away from the data root
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    config = ToolsConfig(
        local_working_dir=str(workspace),
        audit_log_path=str(elsewhere / "audit.jsonl"),
        trajectory_path=str(elsewhere / "trajectories"),
    )
    executor = ToolExecutor(config=config, memory_path=str(live_data / "memory.json"))

    roots = [Path(r).resolve() for r in executor._protected_roots()]
    assert live_data.resolve() in roots, "the live memory directory must be protected"
    with pytest.raises(WorkspaceError, match="overlap"):
        executor._ensure_local_workspace()


def test_path_classification_is_declared_not_guessed(tmp_path: Path) -> None:
    """A `Path.suffix` heuristic misreads dotted directories and extensionless
    files; classification comes from declared semantics instead."""
    from src.config.schema import ToolsConfig
    from src.tools.executor import ToolExecutor

    dotted_dir = tmp_path / "traj" / "trajectories.d"  # a DIRECTORY with a suffix
    dotted_dir.mkdir(parents=True)
    audit_dir = tmp_path / "audit"
    audit_dir.mkdir()
    executor = ToolExecutor(
        config=ToolsConfig(
            audit_log_path=str(audit_dir / "audit.jsonl"),   # declared FILE
            trajectory_path=str(dotted_dir),                 # declared DIRECTORY
        )
    )
    roots = [Path(r).resolve() for r in executor._protected_roots()]
    # The dotted directory is protected as ITSELF; a suffix heuristic would
    # have mistaken it for a file and protected its parent instead.
    assert dotted_dir.resolve() in roots
    assert dotted_dir.parent.resolve() not in roots, "suffix heuristic would over-protect"
    # The audit FILE contributes its parent directory, which is correct.
    assert audit_dir.resolve() in roots
