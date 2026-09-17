"""Pins for grouping and local/CI command parity, not a wall-clock benchmark."""

import subprocess
import tomllib
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml

from tests.parallel_policy import resource_modules

ROOT = Path(__file__).resolve().parents[1]


def test_resource_group_includes_imported_fixture_users_and_admission():
    grouped = resource_modules(ROOT)
    for name in (
        "test_process_manager.py", "test_process_zero_offset.py",
        "test_process_tree_reaping.py", "test_main_exit_codes.py",
        "test_remote_process_streaming.py", "test_resume_admission.py",
        "test_computer_task_ownership_r19.py",
        "test_computer_dispatch_native_r19.py",
    ):
        assert ROOT / "tests" / name in grouped, name
    assert ROOT / "tests" / "test_coverage_gate.py" in grouped
    assert ROOT / "tests" / "test_cost_tracker.py" not in grouped


def test_grouping_follows_transitive_fixture_imports(tmp_path):
    tests = tmp_path / "tests"
    tests.mkdir()
    (tests / "helper.py").write_text("import subprocess\n")
    (tests / "middle.py").write_text("from tests.helper import thing\n")
    (tests / "test_leaf.py").write_text("from .middle import fixture\n")
    (tests / "test_pure.py").write_text("x = 1\n")
    grouped = resource_modules(tmp_path)
    assert tests / "test_leaf.py" in grouped
    assert tests / "test_pure.py" not in grouped


def test_ci_uses_make_targets_and_bounded_workers():
    workflow = yaml.safe_load((ROOT / ".github/workflows/test.yml").read_text())
    jobs = workflow["jobs"]
    assert jobs["tests"]["timeout-minutes"] == 30
    for job, target in (("tests", "test"), ("coverage-no-drop", "test-cov")):
        assert jobs[job]["steps"][-1]["run"] == f"make {target}"
    assert jobs["coverage-no-drop"]["steps"][-1]["env"]["COVERAGE_CORE"] == "sysmon"
    commands = subprocess.check_output(
        ["make", "-n", "test", "test-cov"], cwd=ROOT, text=True,
    )
    assert "-n 6 --dist loadgroup --durations=25" in commands
    assert "COVERAGE_CORE=sysmon" in commands
    assert "-n auto" not in commands
    deps = tomllib.loads((ROOT / "pyproject.toml").read_text())
    assert "pytest-xdist==3.8.0" in deps["project"]["optional-dependencies"]["dev"]


def test_native_proofs_run_last_but_keep_process_group():
    from tests.conftest import pytest_collection_modifyitems

    marks = []
    native = SimpleNamespace(
        path=ROOT / "tests/test_computer_dispatch_native_r19.py",
        add_marker=marks.append,
    )
    pure = SimpleNamespace(path=ROOT / "tests/test_cost_tracker.py", add_marker=marks.append)
    items = [native, pure]
    pytest_collection_modifyitems(SimpleNamespace(rootpath=ROOT), items)
    assert items == [pure, native]
    assert [mark.args for mark in marks] == [("process-and-timing",)]


def test_native_lock_excludes_second_open_and_releases():
    import fcntl
    import os

    from tests.conftest import _native_display_runner_lock

    request = SimpleNamespace(node=SimpleNamespace(
        path=Path("test_computer_dispatch_native_r19.py"),
    ))
    fixture = _native_display_runner_lock.__wrapped__(request)
    next(fixture)
    fd = os.open(f"/tmp/odin-native-test-{os.getuid()}.lock", os.O_RDWR | os.O_NOFOLLOW)
    try:
        with pytest.raises(BlockingIOError):
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fixture.close()
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    finally:
        fixture.close()
        os.close(fd)
