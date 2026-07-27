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
import stat
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


@pytest.mark.parametrize("value", ["", "   ", "relative/path", "./also/relative"])
def test_rejects_non_absolute_or_empty(value: str, fake_install: Path) -> None:
    with pytest.raises(WorkspaceError):
        resolve_workspace(value, protected_roots=[str(fake_install)])


def test_rejects_uncreatable_directory(tmp_path: Path, fake_install: Path) -> None:
    """A missing workspace whose PARENT also does not exist cannot be
    self-provisioned, so it fails closed. (A missing workspace with a writable
    parent is created instead — see the upgrade-seamlessness tests.)"""
    with pytest.raises(WorkspaceError, match="could not be created"):
        resolve_workspace(
            str(tmp_path / "no-parent" / "nope"), protected_roots=[str(fake_install)]
        )


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


def test_discord_execution_path_excludes_the_legacy_dag_surfaces(
    workspace: Path, fake_install: Path
) -> None:
    """The legacy `src/odin/tools/{shell,process}.py` surfaces spawn subprocesses
    that inherit the application cwd, so if the Discord path adopted them the
    2026-07-27 mechanism reopens behind this fix.

    Round-2 rewrote this from a grep; round 3 showed it was still vacuous —
    `__new__` creates no handler owners, so the loop inspected nothing, and it
    reloaded the executor rather than the Discord tool-loop path. This builds a
    REAL executor and inspects every resolved owner's module, then imports the
    Discord path in a CLEAN interpreter and proves neither legacy module loads.
    """
    import subprocess
    import sys

    from src.tools.executor import EXECUTOR_HANDLERS

    executor = _executor_with_workspace(workspace, fake_install)

    inspected: list[str] = []
    for tool_name, (owner_key, attr) in EXECUTOR_HANDLERS.items():
        # _handler_owners is the real late-bound registry (RFC-004); owner_key
        # is a registry key like "system", not an attribute name.
        owner = executor._handler_owners.get(owner_key)
        assert owner is not None, f"{tool_name}: handler owner {owner_key!r} did not resolve"
        module = type(owner).__module__
        inspected.append(module)
        assert not module.startswith("src.odin.tools"), (
            f"{tool_name} is served by legacy module {module}.{attr}"
        )
    assert inspected, "no handler owners were inspected — the check would be vacuous"

    # A clean interpreter: importing the Discord execution path must not pull
    # the legacy surfaces in, transitively or otherwise.
    probe = (
        "import sys; import src.discord.tool_loop; "
        "leaked=[m for m in ('src.odin.tools.shell','src.odin.tools.process') "
        "if m in sys.modules]; print(','.join(leaked))"
    )
    result = subprocess.run(
        [sys.executable, "-c", probe],
        capture_output=True, text=True, timeout=120,
        cwd=str(Path(__file__).resolve().parents[1]),
    )
    assert result.returncode == 0, result.stderr[-500:]
    leaked = result.stdout.strip()
    assert leaked == "", (
        f"the Discord tool-loop path imports {leaked}; those surfaces inherit "
        "the application cwd and would reopen the wipe mechanism"
    )



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
    # A RESOLVER, not a frozen string: each spawn re-verifies the workspace's
    # mutable filesystem invariants (PR #239 round-3).
    assert callable(registry._workspace)
    assert registry._resolve_workspace() == str(workspace.resolve())

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
    executor = _executor_with_workspace(tmp_path / "no-parent" / "ws", fake_install)
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


async def test_workspace_is_revalidated_before_every_command(
    fake_install: Path, workspace: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """PR #239 round-3 blocker 1, reproduced by Odin: caching the validated
    path meant fail-closed applied only to the FIRST command. Replacing the
    directory with a symlink into the install afterwards was accepted, and the
    second command read live data."""
    monkeypatch.chdir(fake_install)
    executor = _executor_with_workspace(workspace, fake_install)

    code, out = await executor._exec_command("localhost", "pwd", timeout=30)
    assert code == 0 and out.strip() == str(workspace.resolve())

    # Swap the validated directory for a symlink pointing into the install.
    workspace.rmdir()
    workspace.symlink_to(fake_install)
    with pytest.raises(WorkspaceError):
        await executor._exec_command("localhost", "cat data/sentinel", timeout=30)


async def test_mode_change_after_first_command_is_caught(
    fake_install: Path, workspace: Path
) -> None:
    """A post-validation chmod must not be ignored either."""
    executor = _executor_with_workspace(workspace, fake_install)
    assert (await executor._exec_command("localhost", "pwd", timeout=30))[0] == 0
    workspace.chmod(0o755)
    try:
        with pytest.raises(WorkspaceError, match="mode"):
            await executor._exec_command("localhost", "pwd", timeout=30)
    finally:
        workspace.chmod(0o700)


async def test_background_spawn_revalidates_too(
    fake_install: Path, workspace: Path
) -> None:
    """Verification must bind to background spawns as well, or manage_process
    becomes the surviving route past a swapped workspace."""
    executor = _executor_with_workspace(workspace, fake_install)
    registry = executor._ensure_process_registry()
    assert registry._resolve_workspace() == str(workspace.resolve())
    workspace.chmod(0o750)
    try:
        with pytest.raises(WorkspaceError):
            registry._resolve_workspace()
    finally:
        workspace.chmod(0o700)


def test_leaf_symlinked_data_paths_protect_the_target(tmp_path: Path) -> None:
    """PR #239 round-3 blocker 2, reproduced as UNSAFE_ACCEPTED: taking .parent
    BEFORE canonicalization protects the alias directory rather than the real
    data directory, so a workspace beside the true memory.json was accepted."""
    from src.config.schema import ToolsConfig
    from src.tools.executor import ToolExecutor

    live = tmp_path / "live-data"
    live.mkdir()
    (live / "memory.json").write_text("{}", encoding="utf-8")
    (live / "audit.jsonl").write_text("", encoding="utf-8")
    aliases = tmp_path / "aliases"
    aliases.mkdir()
    (aliases / "memory.json").symlink_to(live / "memory.json")
    (aliases / "audit.jsonl").symlink_to(live / "audit.jsonl")

    workspace = live / "workspace"          # beside the REAL data
    workspace.mkdir(mode=0o700)

    executor = ToolExecutor(
        config=ToolsConfig(
            local_working_dir=str(workspace),
            audit_log_path=str(aliases / "audit.jsonl"),
            trajectory_path=str(tmp_path / "elsewhere"),
        ),
        memory_path=str(aliases / "memory.json"),
    )
    roots = [Path(r).resolve() for r in executor._protected_roots()]
    assert live.resolve() in roots, "the symlink TARGET's directory must be protected"
    with pytest.raises(WorkspaceError, match="overlap"):
        executor._ensure_local_workspace()


# --- workspace growth metrics (the operational half of "no auto-prune") -----


def test_workspace_metrics_report_usage(workspace: Path, fake_install: Path) -> None:
    """No automatic pruning was always paired with observability, so growth is
    alertable and cleanup stays an explicit operator action."""
    executor = _executor_with_workspace(workspace, fake_install)
    (workspace / "artifact.bin").write_bytes(b"x" * 2048)
    (workspace / "nested").mkdir()
    (workspace / "nested" / "more.txt").write_text("hello", encoding="utf-8")

    metrics = executor.get_workspace_metrics()
    assert metrics["files"] == 2
    assert metrics["bytes"] >= 2048
    assert metrics["free_bytes"] > 0
    assert metrics["free_inodes"] > 0


def test_workspace_metrics_never_raise_on_an_invalid_workspace(
    tmp_path: Path, fake_install: Path
) -> None:
    """Metrics collection must not be able to break a command path."""
    executor = _executor_with_workspace(tmp_path / "no-parent" / "missing", fake_install)
    assert executor.get_workspace_metrics() == {}


def test_workspace_gauges_render_for_prometheus(
    workspace: Path, fake_install: Path
) -> None:
    from src.health.metrics import MetricsCollector

    executor = _executor_with_workspace(workspace, fake_install)
    (workspace / "f").write_bytes(b"12345")
    collector = MetricsCollector()
    collector.register_source("workspace", executor.get_workspace_metrics)
    rendered = collector.render()
    for name in (
        "odin_workspace_bytes",
        "odin_workspace_files",
        "odin_workspace_free_bytes",
        "odin_workspace_free_inodes",
    ):
        assert f"# TYPE {name} gauge" in rendered
        assert any(
            line.startswith(f"{name} ") for line in rendered.splitlines()
        ), f"{name} value line missing"


def test_workspace_gauges_tolerate_partial_and_failing_sources() -> None:
    """A partial dict renders what it has; a raising source is swallowed so the
    metrics endpoint cannot be taken down by workspace trouble."""
    from src.health.metrics import MetricsCollector

    partial = MetricsCollector()
    partial.register_source("workspace", lambda: {"bytes": 10.0})
    rendered = partial.render()
    assert "odin_workspace_bytes 10" in rendered
    assert "odin_workspace_free_inodes" not in rendered

    def _boom() -> dict[str, float]:
        raise OSError("filesystem unavailable")

    failing = MetricsCollector()
    failing.register_source("workspace", _boom)
    assert "odin_workspace_bytes" not in failing.render()

    empty = MetricsCollector()
    empty.register_source("workspace", dict)
    assert "odin_workspace_bytes" not in empty.render()


def test_blank_configured_data_paths_are_skipped(tmp_path: Path, workspace: Path) -> None:
    """A blank/whitespace data path contributes no protected root rather than
    protecting the process's current directory by accident."""
    from src.config.schema import ToolsConfig
    from src.tools.executor import ToolExecutor

    executor = ToolExecutor(
        config=ToolsConfig(
            local_working_dir=str(workspace),
            audit_log_path="   ",
            trajectory_path="",
        )
    )
    roots = [Path(r).resolve() for r in executor._protected_roots()]
    assert Path.cwd().resolve() not in roots or roots.count(Path.cwd().resolve()) <= 1
    assert roots, "the install root must still be protected"


def test_workspace_metrics_degrade_when_filesystem_stats_fail(
    workspace: Path, fake_install: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Free-space/inode probes are best-effort: if the filesystem refuses them
    the usage figures still report, because breaking metrics must never break
    a command path."""
    import shutil as _shutil

    executor = _executor_with_workspace(workspace, fake_install)
    (workspace / "f").write_bytes(b"abc")

    def _fail_usage(_path: object) -> object:
        raise OSError("statfs unavailable")

    def _fail_statvfs(_path: object) -> object:
        raise OSError("statvfs unavailable")

    monkeypatch.setattr(_shutil, "disk_usage", _fail_usage)
    monkeypatch.setattr(os, "statvfs", _fail_statvfs)

    metrics = executor.get_workspace_metrics()
    assert metrics["bytes"] == 3
    assert metrics["files"] == 1
    assert "free_bytes" not in metrics
    assert "free_inodes" not in metrics


# --- upgrade seamlessness: fresh installs AND updates ------------------------


def test_workspace_is_self_provisioned_when_the_parent_is_writable(
    tmp_path: Path, fake_install: Path
) -> None:
    """Upgrades must be seamless. A source checkout or a git-based self-update
    lands on new code whose systemd unit was never refreshed, so the runtime
    creates the workspace itself when it can — with the same 0700 contract a
    deployment-provisioned one satisfies."""
    target = tmp_path / "fresh-workspace"
    assert not target.exists()
    resolved = resolve_workspace(str(target), protected_roots=[str(fake_install)])
    assert resolved == target.resolve()
    assert target.is_dir()
    assert stat.S_IMODE(target.stat().st_mode) == 0o700, "must not inherit a loose umask"





def test_unwritable_parent_still_fails_closed_with_actionable_guidance(
    tmp_path: Path, fake_install: Path
) -> None:
    """When self-provisioning cannot work (root-owned /var/lib for a non-root
    service account), the error names the exact command to run rather than
    silently degrading."""
    with pytest.raises(WorkspaceError) as excinfo:
        resolve_workspace(
            str(tmp_path / "missing-parent" / "ws"),
            protected_roots=[str(fake_install)],
        )
    message = str(excinfo.value)
    assert "could not be created" in message
    assert "install -d -m 0700" in message, "the error must be actionable"


def test_creation_can_be_disabled_for_strict_callers(
    tmp_path: Path, fake_install: Path
) -> None:
    target = tmp_path / "never-created"
    with pytest.raises(WorkspaceError, match="could not be created"):
        resolve_workspace(
            str(target), protected_roots=[str(fake_install)], create_if_missing=False
        )
    assert not target.exists()


def test_every_upgrade_path_provisions_the_workspace() -> None:
    """Fresh installs AND updates must both land working, with no manual step:

    - .deb install/upgrade  -> postinstall creates it
    - any systemd start     -> StateDirectory= recreates it (covers restarts
                               after a self-update, even if postinstall never ran)
    - Docker                -> image directory + named volume
    - source / git self-update -> runtime self-provisioning (tested above)
    """
    repo = Path(__file__).resolve().parents[1]

    unit = (repo / "packaging/odin.service").read_text(encoding="utf-8")
    assert "StateDirectory=odin-workspace" in unit
    assert "StateDirectoryMode=0700" in unit

    postinstall = (repo / "packaging/postinstall.sh").read_text(encoding="utf-8")
    assert "/var/lib/odin-workspace" in postinstall and "chmod 0700" in postinstall

    dockerfile = (repo / "Dockerfile").read_text(encoding="utf-8")
    assert "/var/lib/odin-workspace" in dockerfile and "0700" in dockerfile

    compose = (repo / "docker-compose.yml").read_text(encoding="utf-8")
    assert "odin-workspace:/var/lib/odin-workspace" in compose, "named volume, not a bind"


# --- round 4: the paths that would have broken YOUR live install ------------


def test_self_provisioning_never_creates_inside_a_protected_root(
    fake_install: Path,
) -> None:
    """PR #239 round-4 blocker 4, reproduced by Odin: the mkdir ran BEFORE the
    overlap check, so an invalid workspace was created inside the very tree
    this protects and only then rejected. Fail-closed must not mean 'reject
    after modifying the place we promised not to touch'.

    (The previous assertion here was a tautology that passed either way.)
    """
    target = fake_install / "never-create-me"
    with pytest.raises(WorkspaceError, match="overlap"):
        resolve_workspace(str(target), protected_roots=[str(fake_install)])
    assert not target.exists(), "the directory must NOT have been created"


async def test_background_workspace_refusal_is_visible_as_an_error(
    fake_install: Path, workspace: Path
) -> None:
    """PR #239 round-4 blocker 3: a workspace refusal came back as a plain
    string that did not match the error-prefix contract, so the tool loop
    classified a refusal as a SUCCESSFUL start."""
    from src.tools.tool_text import _ERROR_RESULT_PREFIXES

    executor = _executor_with_workspace(workspace, fake_install)
    registry = executor._ensure_process_registry()
    workspace.chmod(0o755)
    try:
        result = await registry.start("localhost", "echo should-not-run")
    finally:
        workspace.chmod(0o700)
    assert result.startswith(_ERROR_RESULT_PREFIXES), (
        f"refusal must be visible as a failure, got: {result!r}"
    )
    assert "mode" in result, "the operator still needs the reason"


def test_incus_deployment_path_provisions_the_workspace() -> None:
    """PR #239 round-4 blocker 2: Incus is an executable deployment path and
    was missed — its unprivileged odin user cannot create /var/lib/odin-workspace."""
    repo = Path(__file__).resolve().parents[1]
    script = (repo / "scripts/incus-deploy.sh").read_text(encoding="utf-8")
    assert "/var/lib/odin-workspace" in script
    assert "chmod 0700 /var/lib/odin-workspace" in script
    assert "StateDirectory=odin-workspace" in script
    assert "StateDirectoryMode=0700" in script


# --- round 5: one authoritative provisioner, and the bootstrap it must survive


def _fake_bot(workspace: Path, install: Path):
    """A bot-shaped object exposing only what the preflight reads."""
    class _Tools:
        local_working_dir = str(workspace)
        audit_log_path = str(install / "data" / "audit.jsonl")
        trajectory_path = str(install / "data" / "trajectories")

    class _Config:
        tools = _Tools()

    class _Bot:
        config = _Config()

    return _Bot()


def test_provision_workspace_is_the_single_contract(tmp_path: Path, fake_install: Path) -> None:
    """provision_workspace creates AND fully validates, so no caller can accept
    a workspace the runtime would reject."""
    from src.tools.workspace import provision_workspace

    target = tmp_path / "ws"
    result = provision_workspace(str(target), protected_roots=[str(fake_install)])
    assert result == target.resolve()
    assert stat.S_IMODE(target.stat().st_mode) == 0o700


@pytest.mark.parametrize(
    "case",
    ["relative", "symlink", "inside_install", "wrong_owner"],
    ids=["relative-path", "workspace-symlink", "inside-install", "wrong-owner"],
)
def test_provisioner_rejects_everything_the_runtime_rejects(
    case: str, tmp_path: Path, fake_install: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """PR #239 round-5 blocker 2: the updater had a SECOND, weaker contract and
    accepted four things the runtime refuses. One implementation now serves
    both, so these cannot diverge again."""
    from src.tools.workspace import provision_workspace

    if case == "relative":
        monkeypatch.chdir(tmp_path)
        configured = "relative-ws"
    elif case == "symlink":
        real = tmp_path / "real"
        real.mkdir(mode=0o700)
        link = tmp_path / "link"
        link.symlink_to(real)
        configured = str(link)
    elif case == "inside_install":
        configured = str(fake_install / "ws")
    else:
        target = tmp_path / "owned-elsewhere"
        target.mkdir(mode=0o700)
        configured = str(target)

    kwargs = {"protected_roots": [str(fake_install)], "allow_sudo": False}
    if case == "wrong_owner":
        kwargs["owner_uid"] = os.getuid() + 4242

    with pytest.raises(WorkspaceError):
        provision_workspace(configured, **kwargs)

    if case == "inside_install":
        assert not (fake_install / "ws").exists(), "must not create inside the install"
    if case == "relative":
        assert not (tmp_path / "relative-ws").exists(), "must not create a relative workspace"


def test_startup_migration_provisions_before_commands_are_served() -> None:
    """PR #239 round-5 blocker 1 — the bootstrap paradox.

    The self-update preflight is NEW code, so the update that installs it is
    executed by the PREVIOUS release's handler, which has no preflight. Only a
    startup migration in the incoming code can bootstrap the workspace, because
    that runs after re-exec however the update arrived.
    """
    main_src = (Path(__file__).resolve().parents[1] / "src/__main__.py").read_text(
        encoding="utf-8"
    )
    assert "provision_workspace(" in main_src, "startup must provision the workspace"
    provision_at = main_src.index("provision_workspace(")
    bot_at = main_src.index("bot = OdinBot(config)")
    config_at = main_src.index("config = load_config(config_path)")
    assert config_at < provision_at < bot_at, (
        "provisioning must run after the real config loads and before the bot "
        "(and therefore command service) is constructed"
    )
    # Failure must not prevent Odin from starting and answering on Discord.
    assert "never block startup" in main_src or "not fatal" in main_src


def test_preflight_uses_the_live_config_not_a_reparsed_file(
    tmp_path: Path, fake_install: Path
) -> None:
    """The preflight must validate the path the RESTARTED process will use.
    Re-reading config.yml missed alternate config paths and environment
    substitution, and could provision a different directory entirely."""
    from src.web.api.self_update import _live_workspace_setting

    workspace = tmp_path / "live-ws"
    workspace.mkdir(mode=0o700)
    bot = _fake_bot(workspace, fake_install)
    assert _live_workspace_setting(bot) == str(workspace)


async def test_preflight_refuses_a_workspace_the_runtime_would_reject(
    fake_install: Path,
) -> None:
    """End-to-end: a workspace inside the install must be refused by the
    preflight, and nothing may be created."""
    from src.web.api.self_update import _ensure_local_workspace_for_update

    target = fake_install / "ws-inside"
    bot = _fake_bot(target, fake_install)
    message = _ensure_local_workspace_for_update(bot, str(fake_install))
    assert message is not None
    assert "overlap" in message
    assert "install -d -m 0700" in message
    assert not target.exists(), "a refused preflight must not create anything"


def test_preflight_falls_back_to_the_schema_default_without_a_bot(
    tmp_path: Path,
) -> None:
    """Called without a live bot (or with one that cannot answer), the setting
    still resolves to the schema default rather than guessing or crashing."""
    from src.config.schema import ToolsConfig
    from src.web.api.self_update import _live_workspace_setting

    class _Broken:
        @property
        def config(self):  # noqa: ANN201 - deliberately raises
            raise RuntimeError("bot not ready")

    assert _live_workspace_setting(None) == ToolsConfig().local_working_dir
    assert _live_workspace_setting(_Broken()) == ToolsConfig().local_working_dir


def test_preflight_skips_validation_when_nothing_is_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """With no configured workspace at all there is nothing to validate, and
    the update must not be blocked on a value that does not exist."""
    import src.web.api.self_update as su

    monkeypatch.setattr(su, "_live_workspace_setting", lambda _bot: "")
    assert su._ensure_local_workspace_for_update(None, None) is None
