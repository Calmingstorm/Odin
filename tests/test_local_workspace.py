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

import json
import os
import stat
import subprocess
import sys
import threading
import time
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from src.config.schema import ToolsConfig
from src.tools.executor import ToolExecutor
from src.tools.process_manager import ProcessRegistry
from src.tools.ssh import run_local_command
from src.tools.workspace import (
    WorkspaceError,
    provision_workspace,
    resolve_workspace,
    workspace_env,
)


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
    from src.config.schema import ToolHost, ToolsConfig
    from src.tools.executor import ToolExecutor

    config = ToolsConfig(
        local_working_dir=str(workspace),
        # A resolvable localhost so tests drive the PRODUCTION dispatch route
        # rather than the shared _exec_command primitive.
        hosts={"localhost": ToolHost(address="127.0.0.1")},
    )
    executor = ToolExecutor(config=config)
    # Protected roots are normally derived from the running app; point them at
    # the fixture so the test exercises real validation against a fake install.
    executor._protected_roots = lambda: [str(protected)]  # type: ignore[method-assign]
    return executor


async def _run_command(executor, command: str) -> tuple[int, str]:
    """Drive the REAL run_command tool, end to end.

    Deliberately not `_exec_command`: since round 8 the workspace is opt-in at
    the call site, because that shared primitive also backs git_ops, docker,
    terraform, kubectl, claude_code and PDF host reads, whose cwd semantics
    must not change. Testing the primitive would therefore no longer prove
    that the tool Odin actually calls gets the workspace — removing
    `use_workspace=True` from the run_command handler has to fail these tests.
    """
    result = await executor.execute("run_command", {"command": command, "host": "localhost"})
    return (0 if result.ok else 1), str(result.output)


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

    code, out = await _run_command(
        executor,
        f"jar xf {ae2_jar} data/ae2/recipe/network/blocks/pattern_providers_interface.json"
        f" || unzip -o {ae2_jar} 'data/ae2/recipe/network/blocks/*' > /dev/null",
    )
    assert code == 0, out
    assert (workspace / "data/ae2/recipe/network/blocks").exists()
    assert not (fake_install / "data" / "ae2").exists()

    code, out = await _run_command(
        executor, "cat data/ae2/recipe/network/blocks/pattern_providers_interface.json"
    )
    assert code == 0 and "ae2:shaped" in out

    assert Path(str(workspace)).is_relative_to(tmp_path)  # bounded before deleting
    code, _ = await _run_command(executor, "rm -rf data")
    assert code == 0
    assert not (workspace / "data").exists(), "cleanup must work"
    assert (fake_install / "data" / "sentinel").read_text(encoding="utf-8") == "live odin state"


async def test_executor_pwd_is_the_workspace(fake_install: Path, workspace: Path) -> None:
    executor = _executor_with_workspace(workspace, fake_install)
    code, out = await _run_command(executor, "pwd")
    assert code == 0
    assert out.strip() == str(workspace.resolve())


async def test_executor_explicit_cd_into_install_still_works(
    fake_install: Path, workspace: Path
) -> None:
    """Aaron's bar: deliberately working inside his own install is untouched."""
    executor = _executor_with_workspace(workspace, fake_install)
    code, out = await _run_command(executor, f"cd {fake_install} && cat data/sentinel")
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
        await executor._exec_command(
            "localhost", "echo should-not-run", timeout=10, use_workspace=True
        )


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
        await executor._exec_command(
            "localhost", "echo should-not-run", timeout=10, use_workspace=True
        )


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

    code, out = await _run_command(executor, "pwd")
    assert code == 0 and out.strip() == str(workspace.resolve())

    # Swap the validated directory for a symlink pointing into the install.
    workspace.rmdir()
    workspace.symlink_to(fake_install)
    with pytest.raises(WorkspaceError):
        await executor._exec_command(
            "localhost", "cat data/sentinel", timeout=30, use_workspace=True
        )


async def test_mode_change_after_first_command_is_caught(
    fake_install: Path, workspace: Path
) -> None:
    """A post-validation chmod must not be ignored either."""
    executor = _executor_with_workspace(workspace, fake_install)
    assert (await _run_command(executor, "pwd"))[0] == 0
    workspace.chmod(0o755)
    try:
        with pytest.raises(WorkspaceError, match="mode"):
            await executor._exec_command(
                "localhost", "pwd", timeout=30, use_workspace=True
            )
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


def _metrics_after_refresh(executor, timeout: float = 5.0) -> dict[str, float]:
    """Scrape, wait for the off-thread usage walk, scrape again.

    Usage is refreshed in the background since round 10 — /metrics is served on
    the event loop and this directory never prunes, so the walk must not run on
    the calling thread. Tests that assert on usage therefore have to let the
    refresh land.
    """
    executor.get_workspace_metrics()
    deadline = time.monotonic() + timeout
    while executor._workspace_usage_cache is None and time.monotonic() < deadline:
        time.sleep(0.02)
    return executor.get_workspace_metrics()


def test_workspace_metrics_report_usage(workspace: Path, fake_install: Path) -> None:
    """No automatic pruning was always paired with observability, so growth is
    alertable and cleanup stays an explicit operator action."""
    executor = _executor_with_workspace(workspace, fake_install)
    (workspace / "artifact.bin").write_bytes(b"x" * 2048)
    (workspace / "nested").mkdir()
    (workspace / "nested" / "more.txt").write_text("hello", encoding="utf-8")

    metrics = _metrics_after_refresh(executor)
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
    _metrics_after_refresh(executor)  # let the background usage walk land
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

    metrics = _metrics_after_refresh(executor)  # usage lands before we break statfs
    assert metrics["bytes"] == 3 and metrics["files"] == 1

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


@pytest.mark.parametrize("blank", ["", "   ", "\t\n"])
def test_blank_workspace_normalizes_to_the_default_at_the_boundary(blank: str) -> None:
    """The field accepts free strings and can be blanked through PUT /api/config.

    Round-7 regression. Left un-normalized, a blank value made the self-update
    preflight validate the DEFAULT and approve, while the restarted process
    loaded the blank value and failed closed on every local command. Normalizing
    here means every consumer — preflight, startup migration, executor — reads
    the identical path.
    """
    assert ToolsConfig(local_working_dir=blank).local_working_dir == "/var/lib/odin-workspace"


def test_configured_workspace_is_stripped_not_reinterpreted() -> None:
    """Normalization must not silently relocate a real configured path."""
    assert ToolsConfig(local_working_dir="  /srv/ws  ").local_working_dir == "/srv/ws"


def test_preflight_validates_the_exact_live_value_never_a_substitute() -> None:
    """A present-but-blank live value must be REFUSED, not replaced.

    The schema normalizes blank away, so reaching the preflight with one means
    the live config is not a validated ToolsConfig — precisely when substituting
    a plausible default is least safe, because the restarted process will use
    the real value and fail closed (PR #239 round-7 review, reproduced).
    """
    from src.web.api.self_update import _ensure_local_workspace_for_update

    bot = SimpleNamespace(config=SimpleNamespace(tools=SimpleNamespace(local_working_dir="   ")))
    error = _ensure_local_workspace_for_update(bot, None)
    assert error is not None and "empty" in error


def test_preflight_uses_the_schema_default_only_when_there_is_no_live_config(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """No reachable bot is the ONE case where the default is the honest answer."""
    import src.web.api.self_update as su
    from src.config.schema import ToolsConfig as _ToolsConfig

    class _Unreachable:
        @property
        def config(self):  # noqa: ANN201 - deliberately raises
            raise RuntimeError("bot not ready")

    assert su._live_workspace_setting(None) == _ToolsConfig().local_working_dir
    assert su._live_workspace_setting(_Unreachable()) == _ToolsConfig().local_working_dir


# --- Round 6: the entrypoint and the protected-root contract ------------------

_ENTRYPOINT_DRIVER = r"""
import json, os, re, runpy, sys
from pathlib import Path

repo, tmp, ws = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])

# Env vars the shipped template substitutes; values are irrelevant, presence is not.
template = (Path(repo) / "config.yml").read_text()
for name in set(re.findall(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}", template)):
    os.environ.setdefault(name, "test-value")

import yaml
# The config lives in its own directory: since round 9 the ACTIVE config
# file's directory is protected, and production keeps config.yml inside the
# install root (already protected) with the workspace elsewhere.
(tmp / "etc").mkdir(exist_ok=True)
cfg = tmp / "etc" / "config.yml"
parsed = yaml.safe_load(template)
parsed.setdefault("tools", {})["local_working_dir"] = str(ws)
cfg.write_text(yaml.safe_dump(parsed))

os.chdir(tmp)
observed = {}

class _StopStartup(Exception):
    pass

import src.discord.client as client_module

class _RecordingBot:
    def __init__(self, *a, **k):
        # THE assertion point: by the time anything that can run a command
        # exists, the workspace must already be there.
        observed["workspace_at_bot_construction"] = ws.is_dir()
        raise _StopStartup()

client_module.OdinBot = _RecordingBot
sys.argv = ["src", str(cfg)]
try:
    runpy.run_module("src", run_name="__main__")
except _StopStartup:
    observed["reached_bot_construction"] = True
except BaseException as exc:
    observed["error"] = f"{type(exc).__name__}: {exc}"

print("RESULT " + json.dumps(observed))
"""


def test_python_m_src_provisions_the_workspace_before_the_bot_exists(
    tmp_path: Path,
) -> None:
    """Executes the REAL entrypoint, as `python -m src` does.

    Round-6 regression. The startup migration sat above
    ``_command_protected_roots``'s ``def``, so running the module as
    ``__main__`` raised NameError mid-module; the migration's own nonfatal
    handler swallowed it and the workspace was never created — silently
    restoring the first-update bootstrap failure the migration exists to fix.

    A source-order comparison cannot see this: it is Python's execution order
    that matters, so this test runs the module for real in a subprocess and
    asserts the workspace exists at the moment the bot is constructed.
    """
    repo_root = Path(__file__).resolve().parents[1]
    workspace = tmp_path / "workspace"

    env = dict(os.environ)
    env["PYTHONPATH"] = str(repo_root)
    proc = subprocess.run(
        [sys.executable, "-c", _ENTRYPOINT_DRIVER, str(repo_root), str(tmp_path), str(workspace)],
        capture_output=True,
        text=True,
        cwd=str(tmp_path),
        env=env,
        timeout=180,
    )
    result_lines = [ln for ln in proc.stdout.splitlines() if ln.startswith("RESULT ")]
    assert result_lines, (
        f"driver produced no result.\nstdout:\n{proc.stdout}\nstderr:\n{proc.stderr}"
    )
    observed = json.loads(result_lines[-1][len("RESULT ") :])

    assert observed.get("error") is None, observed["error"]
    assert observed.get("reached_bot_construction") is True, observed
    assert observed.get("workspace_at_bot_construction") is True, (
        "the workspace did not exist when the bot was constructed — the startup "
        f"migration did not run: {observed}"
    )
    assert workspace.is_dir()
    assert stat.S_IMODE(workspace.stat().st_mode) == 0o700


def _relocated_data_layout(tmp_path: Path) -> dict[str, Path]:
    """The packaged shape that defeated the per-caller root derivations.

    install/data is a SYMLINK to the live-data directory (as /opt/odin/data ->
    /var/lib/odin is), audit and trajectories are configured somewhere else
    entirely, and the proposed workspace sits beside live memory.json.
    """
    install = tmp_path / "install"
    live = tmp_path / "var-lib-odin"
    elsewhere = tmp_path / "elsewhere"
    for directory in (install, live, elsewhere):
        directory.mkdir()
    (live / "memory.json").write_text("{}")
    (install / "data").symlink_to(live)
    return {
        "install": install,
        "live": live,
        "memory": live / "memory.json",
        "audit": elsewhere / "audit.jsonl",
        "trajectory": elsewhere / "trajectories",
        "workspace": live / "workspace",
    }


def test_executor_rejects_a_workspace_beside_relocated_live_memory(
    tmp_path: Path,
) -> None:
    """Executor arm of the shared-contract scenario."""
    layout = _relocated_data_layout(tmp_path)
    executor = ToolExecutor(
        ToolsConfig(
            local_working_dir=str(layout["workspace"]),
            audit_log_path=str(layout["audit"]),
            trajectory_path=str(layout["trajectory"]),
        ),
        memory_path=str(layout["memory"]),
    )
    with pytest.raises(WorkspaceError):
        executor._ensure_local_workspace()
    assert not layout["workspace"].exists()


def test_startup_migration_rejects_a_workspace_beside_relocated_live_memory(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Startup arm. Startup runs before wiring, so it protects the shared
    default memory path — which, from the install directory, resolves through
    the data symlink onto the real live-data root."""
    import src.__main__ as entrypoint

    layout = _relocated_data_layout(tmp_path)
    monkeypatch.chdir(layout["install"])

    config = SimpleNamespace(
        tools=SimpleNamespace(
            local_working_dir=str(layout["workspace"]),
            audit_log_path=str(layout["audit"]),
            trajectory_path=str(layout["trajectory"]),
        )
    )
    roots = entrypoint._command_protected_roots(config)
    assert str(layout["live"].resolve()) in roots

    with pytest.raises(WorkspaceError):
        provision_workspace(str(layout["workspace"]), protected_roots=roots)
    assert not layout["workspace"].exists()


def test_self_update_preflight_rejects_a_workspace_beside_relocated_live_memory(
    tmp_path: Path,
) -> None:
    """Updater arm — the one that previously said yes.

    It omitted live memory.json from its own root derivation, so with audit and
    trajectory paths relocated it CREATED the workspace inside the live-data
    directory, reported success, and handed over to an executor that refused
    every local command (PR #239 round-6 review, reproduced).
    """
    from src.web.api.self_update import _ensure_local_workspace_for_update

    layout = _relocated_data_layout(tmp_path)
    bot = SimpleNamespace(
        config=SimpleNamespace(
            tools=SimpleNamespace(
                local_working_dir=str(layout["workspace"]),
                audit_log_path=str(layout["audit"]),
                trajectory_path=str(layout["trajectory"]),
            )
        ),
        tool_executor=SimpleNamespace(_memory_path=Path(layout["memory"])),
    )

    error = _ensure_local_workspace_for_update(bot, str(layout["install"]))
    assert error is not None
    assert "overlap" in error
    assert not layout["workspace"].exists(), "preflight created a directory inside live data"


def test_all_three_callers_share_one_protected_root_derivation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The load-bearing property behind the three tests above: executor,
    startup, and the updater must agree about the live-data root. When they
    each derived their own, one accepted what another rejected."""
    import src.__main__ as entrypoint
    from src.web.api.self_update import _live_protected_roots

    layout = _relocated_data_layout(tmp_path)
    monkeypatch.chdir(layout["install"])
    live = str(layout["live"].resolve())

    executor = ToolExecutor(
        ToolsConfig(
            local_working_dir=str(layout["workspace"]),
            audit_log_path=str(layout["audit"]),
            trajectory_path=str(layout["trajectory"]),
        ),
        memory_path=str(layout["memory"]),
    )
    config = SimpleNamespace(tools=executor.config)
    bot = SimpleNamespace(
        config=config, tool_executor=SimpleNamespace(_memory_path=Path(layout["memory"]))
    )

    assert live in executor._protected_roots()
    assert live in entrypoint._command_protected_roots(config)
    assert live in _live_protected_roots(bot, str(layout["install"]))


# --- Round 8: the workspace must not leak into unrelated tools ---------------


async def test_git_ops_with_omitted_repo_keeps_process_cwd_semantics(
    tmp_path: Path, workspace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Round-8 blocker 1, reproduced by Odin as `fatal: not a git repository`.

    git_ops documents an omitted ``repo`` as ``"."`` — which has always meant
    the process cwd, i.e. Odin's own install repo. Applying the workspace
    unconditionally in the shared _exec_command primitive silently repointed
    that at a scratch directory and broke `git_ops status`. The same class hits
    docker build ``"."``, compose's implicit project directory, and terraform
    without ``working_dir``.
    """
    repo = tmp_path / "a-real-repo"
    repo.mkdir()
    for cmd in (["git", "init", "-q"], ["git", "config", "user.email", "t@t"],
                ["git", "config", "user.name", "t"]):
        subprocess.run(cmd, cwd=repo, check=True, capture_output=True)
    (repo / "tracked.txt").write_text("x", encoding="utf-8")
    monkeypatch.chdir(repo)

    executor = _executor_with_workspace(workspace, tmp_path / "unrelated-install")
    result = await executor.execute("git_ops", {"action": "status", "host": "localhost"})

    assert result.ok, result.output
    assert "not a git repository" not in str(result.output)
    assert "tracked.txt" in str(result.output)


async def test_an_unusable_workspace_does_not_disable_unrelated_tools(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The sharp version of the same contract.

    A workspace that fails validation must take down raw user commands ONLY.
    If it also took down git_ops/docker/terraform/kubectl, one bad directory
    would cost most of Odin's capability — far beyond the accepted mechanism.
    """
    repo = tmp_path / "repo"
    repo.mkdir()
    for cmd in (["git", "init", "-q"], ["git", "config", "user.email", "t@t"],
                ["git", "config", "user.name", "t"]):
        subprocess.run(cmd, cwd=repo, check=True, capture_output=True)
    monkeypatch.chdir(repo)

    protected = tmp_path / "install"
    protected.mkdir()
    # Overlaps the protected root: unusable by construction.
    executor = _executor_with_workspace(protected / "inside", protected)

    user_command = await executor.execute(
        "run_command", {"command": "echo should-not-run", "host": "localhost"}
    )
    assert not user_command.ok
    assert "should-not-run" not in str(user_command.output)

    git_status = await executor.execute("git_ops", {"action": "status", "host": "localhost"})
    assert git_status.ok, "an unusable workspace must not disable unrelated tools"


# --- Round 8: protected roots come from the FULL live configuration ---------


def _config_with(**overrides):
    """A real Config, so the derivation is exercised against production shape."""
    from src.config.schema import Config

    return Config(discord={"token": "test-token"}, **overrides)


def test_relocated_state_directory_is_protected(tmp_path: Path) -> None:
    """Round-8 blocker 2, reproduced by Odin with sessions.persist_directory
    EQUAL to the configured workspace and accepted by every caller."""
    from src.tools.workspace import command_protected_roots

    relocated = tmp_path / "relocated-sessions"
    config = _config_with(
        sessions={"persist_directory": str(relocated)},
        tools={"local_working_dir": str(relocated)},
    )
    roots = command_protected_roots(tmp_path / "install", config)
    assert str(relocated.resolve()) in roots

    with pytest.raises(WorkspaceError, match="overlap"):
        provision_workspace(str(relocated), protected_roots=roots)
    assert not relocated.exists()


def test_relocated_state_file_protects_its_directory(tmp_path: Path) -> None:
    """A relocated FILE protects the directory holding it — the workspace must
    not sit beside live permissions/credential state either."""
    from src.tools.workspace import command_protected_roots

    live = tmp_path / "relocated-state"
    live.mkdir()
    config = _config_with(permissions={"overrides_path": str(live / "permissions.json")})
    roots = command_protected_roots(tmp_path / "install", config)
    assert str(live.resolve()) in roots

    with pytest.raises(WorkspaceError, match="overlap"):
        provision_workspace(str(live / "workspace"), protected_roots=roots)
    assert not (live / "workspace").exists()


def test_overlap_with_relocated_state_is_rejected_in_both_directions(
    tmp_path: Path,
) -> None:
    """A workspace that CONTAINS live state is as unusable as one inside it."""
    from src.tools.workspace import command_protected_roots

    parent = tmp_path / "parent"
    (parent / "live-context").mkdir(parents=True)
    config = _config_with(context={"directory": str(parent / "live-context")})
    roots = command_protected_roots(tmp_path / "install", config)

    with pytest.raises(WorkspaceError, match="overlap"):
        provision_workspace(str(parent), protected_roots=roots)


def test_every_declared_state_path_is_covered(tmp_path: Path) -> None:
    """Each declared live-state path contributes a root, so relocating any one
    of them cannot silently drop it from protection."""
    from src.tools.workspace import _DECLARED_STATE_PATHS, command_protected_roots

    relocations = {
        "tools.audit_log_path": (tmp_path / "s-audit" / "audit.jsonl", tmp_path / "s-audit"),
        "tools.trajectory_path": (tmp_path / "s-traj", tmp_path / "s-traj"),
        "tools.ssh_key_path": (tmp_path / "s-ssh" / "id", tmp_path / "s-ssh"),
        "tools.ssh_known_hosts_path": (tmp_path / "s-kh" / "known", tmp_path / "s-kh"),
        "tools.ssh_pool.socket_dir": (tmp_path / "s-sock", tmp_path / "s-sock"),
        "context.directory": (tmp_path / "s-ctx", tmp_path / "s-ctx"),
        "sessions.persist_directory": (tmp_path / "s-sess", tmp_path / "s-sess"),
        "logging.directory": (tmp_path / "s-log", tmp_path / "s-log"),
        "usage.directory": (tmp_path / "s-usage", tmp_path / "s-usage"),
        "search.search_db_path": (tmp_path / "s-search" / "db", tmp_path / "s-search"),
        "permissions.overrides_path": (tmp_path / "s-perm" / "p.json", tmp_path / "s-perm"),
        "openai_codex.credentials_path": (tmp_path / "s-codex" / "c.json", tmp_path / "s-codex"),
        "attachments.temp_directory": (tmp_path / "s-att", tmp_path / "s-att"),
    }
    assert set(relocations) == {dotted for dotted, _ in _DECLARED_STATE_PATHS}, (
        "a declared state path has no relocation case — add one so protection "
        "cannot be dropped silently"
    )

    overrides: dict[str, dict] = {}
    for dotted, (value, _expected) in relocations.items():
        section, _, leaf = dotted.partition(".")
        node = overrides.setdefault(section, {})
        while "." in leaf:  # nested section, e.g. tools.ssh_pool.socket_dir
            head, _, leaf = leaf.partition(".")
            node = node.setdefault(head, {})
        node[leaf] = str(value)

    roots = command_protected_roots(tmp_path / "install", _config_with(**overrides))
    for dotted, (_value, expected) in relocations.items():
        assert str(expected.resolve()) in roots, f"{dotted} is not protected"


def test_reduced_derivation_is_a_subset_never_a_different_answer(tmp_path: Path) -> None:
    """Callers holding only a ToolsConfig (the __new__ patch seam, unit tests)
    must not disagree with the full derivation — they may only know less."""
    from src.config.schema import ToolsConfig
    from src.tools.workspace import command_protected_roots

    tools = ToolsConfig(
        audit_log_path=str(tmp_path / "a" / "audit.jsonl"),
        trajectory_path=str(tmp_path / "t"),
    )
    config = _config_with(tools=tools.model_dump())
    full = command_protected_roots(tmp_path / "install", config)
    reduced = command_protected_roots(tmp_path / "install", tools=tools)
    assert set(reduced) <= set(full)


def test_wiring_supplies_the_full_config_to_the_executor() -> None:
    """The reduced derivation must never be what production runs on."""
    import inspect

    from src.discord import wiring

    source = inspect.getsource(wiring.build_services)
    assert "app_config=config" in source, (
        "wiring must pass the full config to ToolExecutor, or production falls "
        "back to the reduced protected-root derivation"
    )


# --- Round 9: the last arbitrary-command route, and the live config file -----


async def test_skill_run_on_host_replays_the_incident_safely(
    fake_install: Path, workspace: Path, ae2_jar: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Round-9 blocker 1, reproduced by Odin: SkillContext.run_on_host is
    arbitrary command execution exposed to user-created skills, and it was
    still inheriting the process cwd — an alternate route straight back into
    the wipe. Remote hosts are unaffected; the workspace applies only after
    local-address resolution.
    """
    from src.tools.skill_context import SkillContext

    monkeypatch.chdir(fake_install)  # a regression can only destroy the fixture
    executor = _executor_with_workspace(workspace, fake_install)
    ctx = SkillContext.__new__(SkillContext)
    ctx._executor = executor

    await ctx.run_on_host("localhost", "mkdir -p data && touch data/from-skill")
    assert (workspace / "data" / "from-skill").exists()

    await ctx.run_on_host("localhost", "rm -rf data")
    assert not (workspace / "data").exists(), "the skill's own cleanup must work"
    assert (fake_install / "data" / "sentinel").read_text(encoding="utf-8") == "live odin state"


async def test_skill_run_on_host_fails_closed_on_an_invalid_workspace(
    fake_install: Path, tmp_path: Path
) -> None:
    """Same fail-closed contract as the other raw command routes."""
    from src.tools.skill_context import SkillContext

    executor = _executor_with_workspace(tmp_path / "no-parent" / "ws", fake_install)
    ctx = SkillContext.__new__(SkillContext)
    ctx._executor = executor
    with pytest.raises(WorkspaceError):
        await ctx.run_on_host("localhost", "echo should-not-run")


def test_active_config_file_directory_is_protected(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Round-9 blocker 2, reproduced by Odin with an alternate config whose
    parent WAS the configured workspace.

    Odin accepts `python -m src /arbitrary/path/odin.yml`. That file is runtime
    state, not a Config field, so the exhaustive-declaration test cannot cover
    it — and a bare relative command could delete the file needed to restart.
    """
    from src.config.schema import active_config_path, set_active_config_path
    from src.tools.workspace import command_protected_roots

    live = tmp_path / "live-config-and-workspace"
    live.mkdir()
    config_file = live / "odin-custom.yml"
    config_file.write_text("discord:\n  token: fake\n", encoding="utf-8")

    previous = active_config_path()
    set_active_config_path(config_file)
    try:
        roots = command_protected_roots(tmp_path / "install")
        assert str(live.resolve()) in roots

        with pytest.raises(WorkspaceError, match="overlap"):
            provision_workspace(str(live), protected_roots=roots)
        # ...and in the other direction: a workspace CONTAINING the config file.
        with pytest.raises(WorkspaceError, match="overlap"):
            provision_workspace(str(tmp_path), protected_roots=roots)
    finally:
        set_active_config_path(previous)


def test_active_config_symlink_protects_the_target_directory(
    tmp_path: Path,
) -> None:
    """The complete file path is resolved before taking .parent, so an aliased
    config cannot protect the alias directory instead of the real one."""
    from src.config.schema import active_config_path, set_active_config_path
    from src.tools.workspace import command_protected_roots

    real_dir = tmp_path / "real-config-dir"
    real_dir.mkdir()
    real_file = real_dir / "odin.yml"
    real_file.write_text("discord:\n  token: fake\n", encoding="utf-8")
    alias_dir = tmp_path / "aliases"
    alias_dir.mkdir()
    (alias_dir / "odin.yml").symlink_to(real_file)

    previous = active_config_path()
    set_active_config_path(alias_dir / "odin.yml")
    try:
        roots = command_protected_roots(tmp_path / "install")
        assert str(real_dir.resolve()) in roots
        with pytest.raises(WorkspaceError, match="overlap"):
            provision_workspace(str(real_dir / "ws"), protected_roots=roots)
    finally:
        set_active_config_path(previous)


def test_no_active_config_protects_nothing_extra(tmp_path: Path) -> None:
    """A process that never loaded a config has nothing to protect, and must
    not guess a path — guessing would reject legitimate workspaces."""
    from src.config.schema import active_config_path, set_active_config_path
    from src.tools.workspace import command_protected_roots

    previous = active_config_path()
    set_active_config_path(None)
    try:
        roots = command_protected_roots(tmp_path / "install")
        assert roots == [str((tmp_path / "install").resolve()), str(Path("./data").resolve())]
    finally:
        set_active_config_path(previous)


def test_repeated_scrapes_inside_the_ttl_do_not_re_walk(
    fake_install: Path, workspace: Path
) -> None:
    """A scrape loop must not walk continuously. /metrics is unauthenticated,
    and the workspace deliberately never prunes."""
    executor = _executor_with_workspace(workspace, fake_install)
    (workspace / "one").write_text("x" * 10, encoding="utf-8")

    walks = 0
    real_walk = os.walk

    def counting_walk(*args, **kwargs):
        nonlocal walks
        walks += 1
        return real_walk(*args, **kwargs)

    with patch("src.tools.executor.os.walk", counting_walk):
        _metrics_after_refresh(executor)
        assert walks == 1
        for _ in range(5):
            executor.get_workspace_metrics()
        assert walks == 1, "scrapes inside the TTL must reuse the cached walk"



# --- The complete set of local-execution routes, held closed -----------------

# Every module in src/ that spawns a local process, and why it does or does not
# use the command workspace. Odin's reviews found bypasses one at a time
# (round 9: SkillContext.run_on_host); this holds the whole surface closed, so
# a NEW spawn site has to be classified rather than silently inheriting the
# process cwd.
_SPAWN_PRIMITIVES = {
    "create_subprocess_shell",
    "create_subprocess_exec",
    "run",  # subprocess.run
    "Popen",
    "system",  # os.system
    # Process REPLACEMENT counts too: it is how the self-update restarts, and
    # it carries the cwd forward into the new image.
    "execv",
    "execve",
    "execvp",
    "execvpe",
    "execl",
    "execle",
    "execlp",
}

_CLASSIFIED_SPAWN_SITES: dict[str, str] = {
    # --- uses the workspace -------------------------------------------------
    "src/tools/ssh.py": "run_local_command — takes cwd from the caller; THE seam",
    "src/tools/process_manager.py": "background manage_process — resolves workspace per spawn",
    # --- deliberately does not ----------------------------------------------
    "src/discord/native_tools/media.py": "argv-form ssh to a REMOTE host; local cwd is irrelevant",
    "src/tools/ssh_pool.py": "argv-form ssh control-socket management, no user command text",
    "src/tools/mcp_client.py": "operator-configured MCP server process, not a user command",
    "src/tools/skill_manager.py": "argv-form `pip install <specs>`, no user-supplied relative path",
    "src/tools/workspace.py": "`sudo -n install -d` provisioning the workspace itself",
    "src/web/api/self_update.py": "argv-form git/gh during self-update, inside the install",
    "src/packaging/validate.py": "build-time packaging check, not a runtime path",
    "src/restart.py": "os.execve re-exec of Odin himself",
    # --- legacy CLI surface, unreachable from Discord (pinned separately) ----
    "src/odin/tools/shell.py": "legacy CLI ShellTool; excluded from the Discord tool loop",
    "src/odin/tools/process.py": "legacy CLI ProcessTool; excluded from the Discord tool loop",
}


def _modules_that_spawn_processes() -> set[str]:
    """Every src/ module calling a process-spawning primitive, by AST.

    AST rather than grep so comments, docstrings and this test's own tables
    cannot register as spawn sites.
    """
    import ast

    repo = Path(__file__).resolve().parents[1]
    found: set[str] = set()
    for path in sorted((repo / "src").rglob("*.py")):
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except SyntaxError:  # pragma: no cover - src must always parse
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            if not isinstance(func, ast.Attribute) or func.attr not in _SPAWN_PRIMITIVES:
                continue
            # `subprocess.run` / `os.system` / `asyncio.create_subprocess_*`
            # only — not arbitrary `.run(...)` methods on unrelated objects.
            owner = func.value
            owner_name = getattr(owner, "id", None) or getattr(owner, "attr", None)
            if func.attr in {"run", "Popen"} and owner_name != "subprocess":
                continue
            if func.attr == "system" and owner_name != "os":
                continue
            if func.attr.startswith("exec") and owner_name != "os":
                continue
            found.add(str(path.relative_to(repo)))
    return found


def test_every_local_execution_route_is_classified() -> None:
    """No unclassified way to run a local process may exist in src/.

    A new spawn site added later inherits Odin's process cwd by default —
    which is exactly the 2026-07-27 mechanism. This fails until it is either
    routed through the workspace or explicitly justified here.
    """
    actual = _modules_that_spawn_processes()
    declared = set(_CLASSIFIED_SPAWN_SITES)

    unclassified = actual - declared
    assert not unclassified, (
        "these modules spawn local processes but are not classified: "
        f"{sorted(unclassified)} — route them through the workspace or record why not"
    )

    stale = declared - actual
    assert not stale, f"no longer spawn processes; drop from the table: {sorted(stale)}"


def test_wiring_hardcoded_state_paths_are_all_covered(tmp_path: Path) -> None:
    """The third leg of the protected-root surface.

    Config-declared paths are held by the exhaustive table, and the active
    config file is handled as runtime state — but wiring also hardcodes a set
    of live-state paths (learned, channel config and logs, host access, skills,
    schedules, audit, API tokens). They are covered today because they sit
    beside memory.json under ./data, whose parent IS protected. This asserts
    that rather than assuming it, so relocating one out of ./data without
    declaring it fails here instead of silently losing protection.
    """
    import ast

    from src.tools.workspace import command_protected_roots

    repo = Path(__file__).resolve().parents[1]
    tree = ast.parse((repo / "src" / "discord" / "wiring.py").read_text(encoding="utf-8"))
    hardcoded = {
        node.value
        for node in ast.walk(tree)
        if isinstance(node, ast.Constant)
        and isinstance(node.value, str)
        and node.value.startswith("./data/")
    }
    assert len(hardcoded) >= 8, f"expected wiring's data paths, found {sorted(hardcoded)}"

    roots = [Path(r) for r in command_protected_roots(tmp_path / "install")]
    for raw in sorted(hardcoded):
        resolved = Path(raw).expanduser().resolve()
        covered = any(resolved == root or root in resolved.parents for root in roots)
        assert covered, (
            f"{raw} is live state that no protected root covers — declare it in "
            "_DECLARED_STATE_PATHS or keep it under the protected data directory"
        )


# --- Every _exec_command / _run_on_host CALLER classified --------------------

# The route-classification test above covers where processes are SPAWNED. This
# covers who ASKS for one, which is the axis Odin's round-10 review found twice
# (validate_action and write_file both reached the install cwd through the
# shared helpers). A call site is either a raw user-command route that opts
# into the workspace, or it must say why it does not.
_CLASSIFIED_COMMAND_CALLERS: dict[tuple[str, str], str] = {
    # --- opt in: arbitrary user-supplied command text -----------------------
    ("src/tools/handlers/system.py", "_handle_run_command"): "WORKSPACE",
    ("src/tools/handlers/system.py", "_handle_run_script"): "WORKSPACE",
    ("src/tools/handlers/system.py", "_run_one"): "WORKSPACE",  # run_command_multi
    ("src/tools/handlers/validation.py", "_exec"): "WORKSPACE",
    ("src/tools/skill_context.py", "run_on_host"): "WORKSPACE",
    # --- do not: fixed command shapes with caller-supplied absolute paths ----
    ("src/tools/handlers/devops.py", "_handle_git_ops"): "documented repo default is the cwd",
    ("src/tools/handlers/devops.py", "_handle_kubectl"): "fixed kubectl argv",
    ("src/tools/handlers/devops.py", "_handle_docker_ops"): "docker build context is caller-given",
    ("src/tools/handlers/devops.py", "_handle_terraform_ops"): "terraform working_dir is explicit",
    ("src/tools/handlers/coding.py", "_handle_claude_code"): "claude_code has its own cwd config",
    ("src/tools/handlers/browser_web.py", "_handle_http_probe"): "fixed curl argv",
    ("src/tools/handlers/files_docs.py", "_handle_read_file"): "reads a caller-given path",
    ("src/tools/handlers/files_docs.py", "_handle_write_file"): "absolute path enforced",
    ("src/tools/handlers/files_docs.py", "_handle_analyze_pdf"): "reads a caller-given path",
    ("src/discord/native_tools/media.py", "_handle_analyze_image"): "base64 of a given path",
    ("src/audit/diff_tracker.py", "capture_before"): "cat of a governed absolute path",
    # --- plumbing -----------------------------------------------------------
    ("src/tools/executor.py", "_run_on_host"): "the shared helper itself",
    ("src/tools/executor.py", "__init__"): "HandlerDeps lambdas forwarding **kwargs",
}


def _command_call_sites() -> dict[tuple[str, str], bool]:
    """(file, enclosing function) -> whether it passes use_workspace=True."""
    import ast

    repo = Path(__file__).resolve().parents[1]
    sites: dict[tuple[str, str], bool] = {}
    for path in sorted((repo / "src").rglob("*.py")):
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except SyntaxError:  # pragma: no cover
            continue
        parents: dict[ast.AST, ast.AST] = {}
        for node in ast.walk(tree):
            for child in ast.iter_child_nodes(node):
                parents[child] = node
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            if not isinstance(func, ast.Attribute):
                continue
            if func.attr not in {"_exec_command", "_run_on_host"}:
                continue
            enclosing = "<module>"
            walker: ast.AST | None = node
            while walker is not None:
                if isinstance(walker, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    enclosing = walker.name
                    break
                walker = parents.get(walker)
            opts_in = any(
                kw.arg == "use_workspace"
                and isinstance(kw.value, ast.Constant)
                and kw.value.value is True
                for kw in node.keywords
            )
            key = (str(path.relative_to(repo)), enclosing)
            sites[key] = sites.get(key, False) or opts_in
    return sites


def test_every_command_caller_is_classified() -> None:
    """Round-10 regression, both blockers of that shape at once.

    validate_action and write_file each reached Odin's install directory
    through these shared helpers because nobody had decided what they were.
    Adding a new call site now fails until it is classified, and flipping an
    existing one's opt-in fails too.
    """
    actual = _command_call_sites()
    declared = set(_CLASSIFIED_COMMAND_CALLERS)

    unclassified = set(actual) - declared
    assert not unclassified, (
        f"unclassified command call sites: {sorted(unclassified)} — decide whether "
        "each is a raw user-command route (use_workspace=True) or record why not"
    )
    stale = declared - set(actual)
    assert not stale, f"no longer call the helpers; drop from the table: {sorted(stale)}"

    for key, expected in _CLASSIFIED_COMMAND_CALLERS.items():
        should_opt_in = expected == "WORKSPACE"
        assert actual[key] is should_opt_in, (
            f"{key[0]}::{key[1]} use_workspace={actual[key]}, expected {should_opt_in} "
            f"({expected})"
        )


async def test_validate_action_command_check_runs_in_the_workspace(
    fake_install: Path, workspace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Round-10 blocker 1, reproduced by Odin through the real dispatch: a
    command check is user-supplied command text, so it can replay the same
    relative-path mechanism."""
    monkeypatch.chdir(fake_install)
    executor = _executor_with_workspace(workspace, fake_install)

    await executor.execute("validate_action", {
        "host": "localhost",
        "checks": [{"type": "command", "target": "touch from-validate"}],
    })
    assert (workspace / "from-validate").exists(), "the check ran in the workspace"
    assert not (fake_install / "from-validate").exists(), "and NOT in the install"


async def test_validate_action_fails_closed_on_an_invalid_workspace(
    fake_install: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Same fail-closed contract as every other raw command route."""
    monkeypatch.chdir(fake_install)
    executor = _executor_with_workspace(tmp_path / "no-parent" / "ws", fake_install)

    result = await executor.execute("validate_action", {
        "host": "localhost",
        "checks": [{"type": "command", "target": "touch should-not-run"}],
    })
    assert not (fake_install / "should-not-run").exists()
    assert not (workspace_leaked := (tmp_path / "should-not-run")).exists(), workspace_leaked
    assert result is not None


@pytest.mark.parametrize("relative", ["notes.md", "./notes.md", "data/notes.md"])
async def test_write_file_rejects_relative_paths(
    fake_install: Path, workspace: Path, monkeypatch: pytest.MonkeyPatch, relative: str
) -> None:
    """Round-10 blocker 4, reproduced by Odin: the schema documents an absolute
    path but nothing enforced it, so a relative one wrote into the install."""
    monkeypatch.chdir(fake_install)
    executor = _executor_with_workspace(workspace, fake_install)

    result = await executor.execute("write_file", {
        "host": "localhost", "path": relative, "content": "x",
    })
    assert not result.ok
    assert "absolute path" in str(result.output)
    assert not (fake_install / relative).exists(), "nothing may be written to the install"


async def test_write_file_still_accepts_absolute_paths(
    fake_install: Path, workspace: Path, tmp_path: Path
) -> None:
    """The documented capability is untouched."""
    executor = _executor_with_workspace(workspace, fake_install)
    target = tmp_path / "written.txt"
    result = await executor.execute("write_file", {
        "host": "localhost", "path": str(target), "content": "hello",
    })
    assert result.ok, result.output
    assert target.read_text(encoding="utf-8").strip() == "hello"


def test_aliased_config_protects_both_the_alias_and_the_target(tmp_path: Path) -> None:
    """Round-10 blocker 2, reproduced by Odin.

    set_active_config_path canonicalizes, but restart.reexec replays sys.argv —
    so the launch path is what the next process opens. Deleting the alias
    breaks the restart even though the target survives.
    """
    from src.config.schema import active_config_path, set_active_config_path
    from src.tools.workspace import command_protected_roots

    real_dir = tmp_path / "real"
    real_dir.mkdir()
    real_file = real_dir / "odin.yml"
    real_file.write_text("discord:\n  token: fake\n", encoding="utf-8")
    alias_dir = tmp_path / "alias"
    alias_dir.mkdir()
    (alias_dir / "odin.yml").symlink_to(real_file)

    previous = active_config_path()
    set_active_config_path(alias_dir / "odin.yml")
    try:
        roots = command_protected_roots(tmp_path / "install")
        assert str(real_dir.resolve()) in roots, "canonical target"
        assert str(alias_dir.resolve()) in roots, "launch path re-exec will reopen"
        with pytest.raises(WorkspaceError, match="overlap"):
            provision_workspace(str(alias_dir), protected_roots=roots)
    finally:
        set_active_config_path(previous)


def test_workspace_usage_is_never_walked_on_the_calling_thread(
    fake_install: Path, workspace: Path
) -> None:
    """Round-10 metrics correction: /metrics is served on the event loop, so
    the walk must happen off-thread, and free space must stay live even when
    usage is served from cache."""
    executor = _executor_with_workspace(workspace, fake_install)
    (workspace / "one").write_text("x" * 10, encoding="utf-8")

    calling_thread = threading.get_ident()
    walk_threads: list[int] = []
    real_walk = os.walk

    def recording_walk(*args, **kwargs):
        walk_threads.append(threading.get_ident())
        return real_walk(*args, **kwargs)

    with patch("src.tools.executor.os.walk", recording_walk):
        first = executor.get_workspace_metrics()
        # Free space is live from the very first scrape, with no walk yet.
        assert "free_bytes" in first and "free_inodes" in first
        deadline = time.monotonic() + 5
        while executor._workspace_usage_cache is None and time.monotonic() < deadline:
            time.sleep(0.02)

    assert walk_threads, "the refresh never ran"
    assert calling_thread not in walk_threads, "the walk must not block the caller"

    second = executor.get_workspace_metrics()
    assert second["files"] == 1 and second["bytes"] >= 10
    assert "free_bytes" in second and "free_inodes" in second, "cheap metrics stay live"


def test_workspace_usage_timestamp_is_recorded_on_completion(
    fake_install: Path, workspace: Path
) -> None:
    """Stamping at the START would make any walk longer than the TTL stale the
    instant it finished, so every scrape would launch another one."""
    executor = _executor_with_workspace(workspace, fake_install)
    started = time.monotonic()

    def slow_walk(*args, **kwargs):
        time.sleep(0.3)
        return iter(())

    with patch("src.tools.executor.os.walk", slow_walk):
        executor.get_workspace_metrics()
        deadline = time.monotonic() + 5
        while executor._workspace_usage_cache is None and time.monotonic() < deadline:
            time.sleep(0.02)

    stamped_at = executor._workspace_usage_cache[0]
    assert stamped_at >= started + 0.3, "the stamp must be taken after the walk finished"


def test_usage_refresh_is_single_flight(fake_install: Path, workspace: Path) -> None:
    """A slow walk must not have a second one piled on top by the next scrape."""
    executor = _executor_with_workspace(workspace, fake_install)
    executor._workspace_usage_refreshing = True  # a walk is already in flight

    started = []
    def _record(**kw):
        started.append(kw)
        return _NoThread()

    with patch("src.tools.executor.threading.Thread", _record):
        executor.get_workspace_metrics()
    assert not started, "a refresh was already running; a second must not start"


class _NoThread:
    def start(self) -> None:  # pragma: no cover - never reached when single-flight holds
        raise AssertionError("thread should not have been started")


def test_usage_refresh_is_inert_without_executor_state(workspace: Path) -> None:
    """The sanctioned __new__ patch seam builds executors without __init__, so
    the lock may not exist. Metrics must degrade, never raise."""
    from src.tools.executor import ToolExecutor as _Executor

    bare = _Executor.__new__(_Executor)
    bare._refresh_workspace_usage(workspace)  # must not raise
    assert getattr(bare, "_workspace_usage_cache", None) is None


def test_usage_refresh_survives_a_failing_walk(fake_install: Path, workspace: Path) -> None:
    """An unreadable workspace leaves usage unreported and, critically, clears
    the in-flight flag so later scrapes can still refresh."""
    executor = _executor_with_workspace(workspace, fake_install)

    def _boom(*_a, **_kw):
        raise OSError("walk refused")

    with patch("src.tools.executor.os.walk", _boom):
        executor.get_workspace_metrics()
        deadline = time.monotonic() + 5
        while executor._workspace_usage_refreshing and time.monotonic() < deadline:
            time.sleep(0.02)

    assert executor._workspace_usage_cache is None, "no usage numbers to report"
    assert executor._workspace_usage_refreshing is False, "the flag must not stick"

    # ...and a later scrape still refreshes normally.
    (workspace / "f").write_text("xyz", encoding="utf-8")
    assert _metrics_after_refresh(executor)["files"] == 1


def test_usage_refresh_skips_files_it_cannot_stat(
    fake_install: Path, workspace: Path
) -> None:
    """A file that vanishes mid-walk is counted but not sized, rather than
    aborting the whole scan."""
    executor = _executor_with_workspace(workspace, fake_install)
    (workspace / "gone").write_text("x" * 5, encoding="utf-8")

    def _refuse(*_a, **_kw):
        raise OSError("stat refused")

    with patch("src.tools.executor.os.lstat", _refuse):
        metrics = _metrics_after_refresh(executor)

    assert metrics["files"] == 1
    assert metrics["bytes"] == 0
