"""Pins for grouping and local/CI command parity, not a wall-clock benchmark."""

import subprocess
import tomllib
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml

from tests.parallel_policy import (
    DEFAULT_LANE_WEIGHT,
    NATIVE_DISPLAY_TESTS,
    NATIVE_SLACK_SECONDS,
    PROCESS_GROUP,
    PROCESS_LANES,
    lane_weights,
    process_lanes,
    resource_modules,
)

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
    lane = process_lanes(ROOT, resource_modules(ROOT))[native.path]
    assert lane.startswith(f"{PROCESS_GROUP}-")
    assert [mark.args for mark in marks] == [(lane,)]


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


def _lane_totals(lanes, weights):
    totals = {}
    for path, lane in lanes.items():
        key = path.relative_to(ROOT).as_posix()
        totals[lane] = totals.get(lane, 0.0) + weights.get(key, DEFAULT_LANE_WEIGHT)
    return totals


def test_every_grouped_module_gets_one_of_the_serial_lanes():
    grouped = resource_modules(ROOT)
    lanes = process_lanes(ROOT, grouped)
    assert set(lanes) == grouped
    names = {f"{PROCESS_GROUP}-{index}" for index in range(1, PROCESS_LANES + 1)}
    assert set(lanes.values()) == names


def test_lane_assignment_is_deterministic():
    grouped = resource_modules(ROOT)
    assert process_lanes(ROOT, grouped) == process_lanes(ROOT, set(sorted(grouped, reverse=True)))


def test_lanes_balance_measured_weight():
    grouped = resource_modules(ROOT)
    weights = lane_weights()
    regular = {p for p in grouped if p.name not in NATIVE_DISPLAY_TESTS}
    totals = _lane_totals(process_lanes(ROOT, regular, weights=weights), weights)
    heaviest_module = max(weights.get(p.relative_to(ROOT).as_posix(), 0.0) for p in regular)
    assert max(totals.values()) - min(totals.values()) <= heaviest_module


def test_native_proofs_share_the_heaviest_lane():
    grouped = resource_modules(ROOT)
    weights = lane_weights()
    lanes = process_lanes(ROOT, grouped, weights=weights)
    native = {lanes[p] for p in grouped if p.name in NATIVE_DISPLAY_TESTS}
    assert len(native) == 1
    regular = {p: lane for p, lane in lanes.items() if p.name not in NATIVE_DISPLAY_TESTS}
    totals = _lane_totals(regular, weights)
    native_lane = native.pop()
    others = [total for lane, total in totals.items() if lane != native_lane]
    # The proofs start only after every other lane's measured work has drained.
    assert totals[native_lane] >= max(others) + NATIVE_SLACK_SECONDS


def test_native_lane_takes_the_lightest_modules_until_it_outlasts_the_rest(tmp_path):
    tests = tmp_path / "tests"
    tests.mkdir()
    regular = [tests / f"test_proc_{index}.py" for index in range(6)]
    native = tests / "test_computer_dispatch_native_r19.py"
    for path in [*regular, native]:
        path.write_text("import subprocess\n")
    weights = {p.relative_to(tmp_path).as_posix(): 30.0 for p in regular}
    weights[native.relative_to(tmp_path).as_posix()] = 20.0
    lanes = process_lanes(tmp_path, {*regular, native}, weights=weights)
    totals = {}
    for path, lane in lanes.items():
        if path != native:
            totals[lane] = totals.get(lane, 0.0) + 30.0
    native_lane = lanes[native]
    others = [total for lane, total in totals.items() if lane != native_lane]
    assert totals[native_lane] == 120.0 and others == [30.0, 30.0]


def test_unmeasured_modules_use_the_default_weight(tmp_path):
    tests = tmp_path / "tests"
    tests.mkdir()
    names = [f"test_proc_{index}.py" for index in range(6)]
    for name in names:
        (tests / name).write_text("import subprocess\n")
    created = {tests / name for name in names}
    assert created <= resource_modules(tmp_path)
    lanes = process_lanes(tmp_path, created, weights={})
    assert set(lanes) == created
    counts = {}
    for lane in lanes.values():
        counts[lane] = counts.get(lane, 0) + 1
    assert sorted(counts.values()) == [2, 2, 2]


def test_weights_file_rejects_malformed_entries(tmp_path):
    path = tmp_path / "weights.json"
    path.write_text('{"tests/a.py": 2.5, "tests/b.py": "x", "tests/c.py": -1, "tests/d.py": true}')
    assert lane_weights(path) == {"tests/a.py": 2.5}
    path.write_text("[1, 2]")
    assert lane_weights(path) == {}
    assert lane_weights(tmp_path / "missing.json") == {}


def test_committed_weights_cover_every_grouped_module():
    keys = set(lane_weights())
    grouped = {p.relative_to(ROOT).as_posix() for p in resource_modules(ROOT)}
    assert grouped <= keys


def test_refresh_script_weighs_grouped_modules_from_junit(tmp_path):
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "refresh_process_group_weights",
        ROOT / "scripts" / "ci" / "refresh_process_group_weights.py",
    )
    refresh = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(refresh)
    tests = tmp_path / "tests"
    tests.mkdir()
    (tests / "test_proc.py").write_text("import subprocess\n")
    (tests / "helper_proc.py").write_text("import subprocess\n")
    (tests / "test_pure.py").write_text("x = 1\n")
    junit = tmp_path / "junit.xml"
    junit.write_text(
        '<testsuites><testsuite>'
        '<testcase classname="tests.test_proc" name="a" time="2.25"/>'
        '<testcase classname="tests.test_proc.TestCase" name="b" time="1.0"/>'
        '<testcase classname="tests.test_pure" name="c" time="9"/>'
        '</testsuite></testsuites>'
    )
    weights = refresh.build_weights(junit, tmp_path)
    assert weights == {"tests/helper_proc.py": 0.0, "tests/test_proc.py": 3.2}
    output = tmp_path / "weights.json"
    assert refresh.main([str(junit), "--root", str(tmp_path), "--output", str(output)]) == 0
    assert lane_weights(output) == weights
