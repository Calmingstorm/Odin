"""Portable runner regressions, with explicit case-insensitive lookup emulation.

The Linux fixture uses real files, inodes, directory FDs, private staging and
renameat2 no-replace operations. Only pathname lookup is case-folded, matching
the relevant APFS behavior. It is not a substitute for native APFS testing.
"""
import ast
import builtins
import ctypes
import errno
import os
from pathlib import Path

import pytest

from src.tools import apply_patch as patcher


def move_plan(source_name="casetest.txt"):
    return patcher.parse_patch(
        "*** Begin Patch\n*** Update File: " + source_name + "\n"
        "*** Move to: CaseTest.txt\n@@\n-case ok\n+case renamed\n*** End Patch\n"
    )


@pytest.fixture
def case_insensitive(monkeypatch):
    """Fold relative dir-FD lookups, without making separate hard links aliases."""
    real_stat, real_open, real_unlink = os.stat, os.open, os.unlink
    real_rename = patcher._rename_noreplace

    def lookup(name, directory):
        if directory is not None and isinstance(name, str) and "/" not in name:
            matches = [
                entry for entry in os.listdir(directory) if entry.casefold() == name.casefold()
            ]
            assert len(matches) <= 1, "fixture itself created a case-insensitive collision"
            if matches:
                return matches[0]
        return name

    def folded_stat(name, *args, dir_fd=None, **kwargs):
        return real_stat(lookup(name, dir_fd), *args, dir_fd=dir_fd, **kwargs)

    def folded_open(name, flags, mode=0o777, *, dir_fd=None):
        resolved = lookup(name, dir_fd)
        if flags & os.O_EXCL and resolved != name:
            raise FileExistsError(errno.EEXIST, "fixture case-insensitive collision", name)
        return real_open(resolved, flags, mode, dir_fd=dir_fd)

    def folded_unlink(name, *, dir_fd=None):
        return real_unlink(lookup(name, dir_fd), dir_fd=dir_fd)

    def folded_rename(source, destination, *, src_dir_fd, dst_dir_fd):
        # Preserve no-overwrite even though Linux itself is case sensitive.
        resolved_destination = lookup(destination, dst_dir_fd)
        if patcher._entry_info(dst_dir_fd, destination) is not None:
            raise FileExistsError(errno.EEXIST, "fixture destination exists", destination)
        real_rename(
            lookup(source, src_dir_fd), resolved_destination,
            src_dir_fd=src_dir_fd, dst_dir_fd=dst_dir_fd,
        )

    monkeypatch.setattr(os, "stat", folded_stat)
    monkeypatch.setattr(os, "open", folded_open)
    monkeypatch.setattr(os, "unlink", folded_unlink)
    return folded_rename


@pytest.mark.parametrize("source_name", ["casetest.txt", "CASETEST.txt"])
def test_case_only_move_on_case_insensitive_lookup(tmp_path, case_insensitive, source_name):
    source = tmp_path / "casetest.txt"
    source.write_text("case ok\n")
    source.chmod(0o640)
    assert patcher.apply_plan(
        str(tmp_path), move_plan(source_name), rename_noreplace=case_insensitive
    ) == [
        source_name + " -> CaseTest.txt"
    ]
    assert os.listdir(tmp_path) == ["CaseTest.txt"]
    assert (tmp_path / "CaseTest.txt").read_text() == "case renamed\n"
    assert (tmp_path / "CaseTest.txt").stat().st_mode & 0o777 == 0o640


@pytest.mark.parametrize(
    "failure_point",
    ["before_recovery", "recovery", "before_publish", "after_publish", "later_file"],
)
@pytest.mark.parametrize("source_name,destination_name", [
    ("casetest.txt", "CaseTest.txt"),
    ("CASETEST.txt", "CaseTest.txt"),
    ("CASETEST.txt", "casetest.txt"),
])
def test_case_only_move_rolls_back_exact_original_spelling(
    tmp_path, case_insensitive, failure_point, source_name, destination_name,
):
    (tmp_path / "casetest.txt").write_text("case ok\n")
    (tmp_path / "casetest.txt").chmod(0o640)
    plan = move_plan(source_name)
    plan["operations"][0]["move_to"] = destination_name
    if failure_point == "later_file":
        plan["operations"].extend(patcher.parse_patch(
            "*** Begin Patch\n*** Add File: later.txt\n+later\n*** End Patch\n"
        )["operations"])
    injected = False

    def fail_once(source, destination, **kwargs):
        nonlocal injected
        hit = not injected and (
            (
                failure_point in {"before_recovery", "recovery"}
                and destination.startswith(".odin-patch-recovery-")
            )
            or (
                failure_point in {"before_publish", "after_publish"}
                and destination == destination_name
            )
            or (failure_point == "later_file" and destination == "later.txt")
        )
        if hit:
            injected = True
            if failure_point not in {"before_recovery", "before_publish"}:
                case_insensitive(source, destination, **kwargs)
            raise OSError("fixture commit interruption")
        case_insensitive(source, destination, **kwargs)

    with pytest.raises(patcher.PatchError, match="rollback completed"):
        patcher.apply_plan(str(tmp_path), plan, rename_noreplace=fail_once)
    assert injected
    assert os.listdir(tmp_path) == ["casetest.txt"]
    assert (tmp_path / "casetest.txt").read_text() == "case ok\n"
    assert (tmp_path / "casetest.txt").stat().st_mode & 0o777 == 0o640


def test_alias_source_move_to_exact_original_is_same_entry(tmp_path, case_insensitive):
    (tmp_path / "casetest.txt").write_text("case ok\n")
    plan = move_plan("CASETEST.txt")
    plan["operations"][0]["move_to"] = "casetest.txt"
    assert patcher.apply_plan(str(tmp_path), plan, rename_noreplace=case_insensitive) == [
        "CASETEST.txt -> casetest.txt"
    ]
    assert os.listdir(tmp_path) == ["casetest.txt"]
    assert (tmp_path / "casetest.txt").read_text() == "case renamed\n"


@pytest.mark.parametrize("source_name", ["a.txt", "A.txt"])
@pytest.mark.parametrize("destination_name", ["b.txt", "B.txt", "a.TXT"])
def test_hardlink_destination_alias_is_refused_before_staging(
    tmp_path, case_insensitive, monkeypatch, source_name, destination_name,
):
    source = tmp_path / "a.txt"
    source.write_text("case ok\n")
    source.chmod(0o640)
    os.link(source, tmp_path / "B.txt")
    original_inode = source.stat().st_ino
    plan = move_plan(source_name)
    plan["operations"][0]["move_to"] = destination_name
    plan["operations"][:0] = patcher.parse_patch(
        "*** Begin Patch\n*** Add File: absent/child.txt\n+new\n*** End Patch\n"
    )["operations"]
    effects = []
    real_stage = patcher._private_temp

    def track_stage(*args, **kwargs):
        effects.append("stage")
        return real_stage(*args, **kwargs)

    def track_rename(*args, **kwargs):
        effects.append("rename")
        return case_insensitive(*args, **kwargs)

    monkeypatch.setattr(patcher, "_private_temp", track_stage)
    with pytest.raises(patcher.PatchError) as failure:
        patcher.apply_plan(str(tmp_path), plan, rename_noreplace=track_rename)
    assert str(failure.value) == "Move to target already exists: " + destination_name
    assert effects == []
    assert sorted(os.listdir(tmp_path)) == ["B.txt", "a.txt"]
    assert source.read_text() == (tmp_path / "B.txt").read_text() == "case ok\n"
    assert source.stat().st_ino == (tmp_path / "B.txt").stat().st_ino == original_inode
    assert source.stat().st_mode & 0o777 == 0o640


@pytest.mark.parametrize("source_name", ["a.txt", "A.txt"])
@pytest.mark.parametrize("destination_name", ["b.txt", "a.TXT"])
def test_hardlink_destination_alias_introduced_during_staging_is_refused(
    tmp_path, case_insensitive, monkeypatch, source_name, destination_name,
):
    source = tmp_path / "a.txt"
    source.write_text("case ok\n")
    source.chmod(0o640)
    plan = move_plan(source_name)
    plan["operations"][0]["move_to"] = destination_name
    real_available = patcher._move_destination_available
    checks = []
    effects = []

    def introduce_hardlink(source_endpoint, destination, snapshot, **kwargs):
        checks.append(kwargs.get("capture_original_name", False))
        if len(checks) == 2:
            if destination_name == "a.TXT":
                assert source_endpoint["name"] == "a.txt"
            # After private staging and source revalidation, before destination
            # revalidation. A link changes ctime, so injecting earlier would
            # merely exercise the existing source-fingerprint check.
            assert any(name.startswith(".odin-patch-stage-") for name in os.listdir(tmp_path))
            os.link(source, tmp_path / "B.txt")
        return real_available(source_endpoint, destination, snapshot, **kwargs)

    def track_rename(*args, **kwargs):
        effects.append("rename")
        return case_insensitive(*args, **kwargs)

    monkeypatch.setattr(patcher, "_move_destination_available", introduce_hardlink)
    with pytest.raises(patcher.PatchError) as failure:
        patcher.apply_plan(str(tmp_path), plan, rename_noreplace=track_rename)
    assert str(failure.value) == "destination changed while staging: " + destination_name
    assert checks == [True, False]
    assert effects == []
    assert sorted(os.listdir(tmp_path)) == ["B.txt", "a.txt"]
    assert source.read_text() == (tmp_path / "B.txt").read_text() == "case ok\n"
    assert source.stat().st_ino == (tmp_path / "B.txt").stat().st_ino
    assert source.stat().st_mode & 0o777 == 0o640


def test_alias_source_spelling_is_not_guessed_between_hardlinks(tmp_path, case_insensitive):
    source = tmp_path / "casetest.txt"
    source.write_text("case ok\n")
    os.link(source, tmp_path / "other.txt")
    with pytest.raises(patcher.PatchError, match="Move to target already exists"):
        patcher.apply_plan(
            str(tmp_path), move_plan("CASETEST.txt"), rename_noreplace=case_insensitive
        )
    assert sorted(os.listdir(tmp_path)) == ["casetest.txt", "other.txt"]
    assert source.read_text() == "case ok\n"


def test_alias_source_disappearing_before_spelling_capture_is_refused(
    tmp_path, case_insensitive, monkeypatch,
):
    source = tmp_path / "casetest.txt"
    source.write_text("case ok\n")
    real_listdir = os.listdir
    calls = 0

    def remove_before_capture(directory):
        nonlocal calls
        if isinstance(directory, int):
            calls += 1
            # open(source), stat(destination), stat(destination) perform fixture
            # lookups first; the fourth listing is the spelling-capture check.
            if calls == 4:
                source.unlink()
        return real_listdir(directory)

    monkeypatch.setattr(os, "listdir", remove_before_capture)
    with pytest.raises(patcher.PatchError, match="Move to target already exists"):
        patcher.apply_plan(
            str(tmp_path), move_plan("CASETEST.txt"), rename_noreplace=case_insensitive
        )
    assert os.listdir(tmp_path) == []


def test_distinct_parent_hardlink_is_still_a_collision(tmp_path):
    source = tmp_path / "casetest.txt"
    source.write_text("case ok\n")
    (tmp_path / "other").mkdir()
    destination = tmp_path / "other" / "CaseTest.txt"
    os.link(source, destination)
    plan = move_plan()
    plan["operations"][0]["move_to"] = "other/CaseTest.txt"
    with pytest.raises(patcher.PatchError, match="Move to target already exists"):
        patcher.apply_plan(str(tmp_path), plan)
    assert source.read_text() == destination.read_text() == "case ok\n"
    assert os.listdir(tmp_path / "other") == ["CaseTest.txt"]


@pytest.mark.parametrize("source_name", ["casetest.txt", "CASETEST.txt"])
def test_case_only_move_does_not_overwrite_racing_destination(
    tmp_path, case_insensitive, source_name,
):
    (tmp_path / "casetest.txt").write_text("case ok\n")
    inserted = False

    def introduce_destination(source, destination, **kwargs):
        nonlocal inserted
        if destination == "CaseTest.txt" and not inserted:
            inserted = True
            fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                         0o640, dir_fd=kwargs["dst_dir_fd"])
            os.write(fd, b"concurrent content\n")
            os.close(fd)
        case_insensitive(source, destination, **kwargs)

    with pytest.raises(patcher.PatchRollbackError) as failure:
        patcher.apply_plan(
            str(tmp_path), move_plan(source_name), rename_noreplace=introduce_destination
        )
    assert (tmp_path / "CaseTest.txt").read_text() == "concurrent content\n"
    assert (tmp_path / "CaseTest.txt").stat().st_mode & 0o777 == 0o640
    artifacts = failure.value.recovery_artifacts
    assert len(artifacts) == 2
    assert {Path(path).read_text() for path in artifacts} == {"case ok\n", "case renamed\n"}
    assert all(Path(path).stat().st_mode & 0o777 == 0o600 for path in artifacts)


def test_case_only_move_revalidates_destination_after_staging(
    tmp_path, case_insensitive, monkeypatch
):
    (tmp_path / "casetest.txt").write_text("case ok\n")
    real_stage = patcher._private_temp

    def replace_source_after_stage(*args, **kwargs):
        stage = real_stage(*args, **kwargs)
        (tmp_path / "casetest.txt").unlink()
        (tmp_path / "CaseTest.txt").write_text("concurrent source\n")
        return stage

    monkeypatch.setattr(patcher, "_private_temp", replace_source_after_stage)
    with pytest.raises(patcher.PatchError, match="source changed while staging"):
        patcher.apply_plan(str(tmp_path), move_plan(), rename_noreplace=case_insensitive)
    assert os.listdir(tmp_path) == ["CaseTest.txt"]
    assert (tmp_path / "CaseTest.txt").read_text() == "concurrent source\n"


@pytest.mark.parametrize("hard_link", [False, True])
def test_distinct_case_target_is_still_a_collision(tmp_path, hard_link):
    source = tmp_path / "casetest.txt"
    source.write_text("case ok\n")
    destination = tmp_path / "CaseTest.txt"
    if hard_link:
        os.link(source, destination)
    else:
        destination.write_text("existing content\n")
    with pytest.raises(patcher.PatchError, match="Move to target already exists"):
        patcher.apply_plan(str(tmp_path), move_plan())
    assert source.read_text() == "case ok\n"
    assert destination.read_text() == ("case ok\n" if hard_link else "existing content\n")
    assert sorted(os.listdir(tmp_path)) == ["CaseTest.txt", "casetest.txt"]


@pytest.mark.parametrize("platform,symbol,flag", [
    ("linux", "renameat2", 1), ("darwin", "renameatx_np", 0x4),
])
@pytest.mark.parametrize("error", [0, errno.EEXIST, errno.ENOTSUP, errno.EINVAL, errno.ENOSYS])
def test_native_no_replace_api_arguments_and_errors(monkeypatch, platform, symbol, flag, error):
    calls = []

    class NativeFunction:
        def __call__(self, *args):
            calls.append(args)
            ctypes.set_errno(error)
            return -1 if error else 0

    class Library:
        pass

    library = Library()
    function = NativeFunction()
    setattr(library, symbol, function)
    monkeypatch.setattr(patcher.sys, "platform", platform)
    monkeypatch.setattr(ctypes, "CDLL", lambda *_args, **_kwargs: library)
    if not error:
        patcher._rename_noreplace("source λ", "destination λ", src_dir_fd=11, dst_dir_fd=12)
    elif error == errno.EEXIST:
        with pytest.raises(FileExistsError):
            patcher._rename_noreplace("source λ", "destination λ", src_dir_fd=11, dst_dir_fd=12)
    else:
        with pytest.raises(patcher.PatchError, match="lacks the atomic no-replace rename"):
            patcher._rename_noreplace("source λ", "destination λ", src_dir_fd=11, dst_dir_fd=12)
    assert calls == [(11, os.fsencode("source λ"), 12, os.fsencode("destination λ"), flag)]
    assert function.argtypes == [ctypes.c_int, ctypes.c_char_p, ctypes.c_int,
                                 ctypes.c_char_p, ctypes.c_uint]
    assert function.restype is ctypes.c_int


def test_darwin_missing_native_symbol_refuses(monkeypatch):
    monkeypatch.setattr(patcher.sys, "platform", "darwin")
    monkeypatch.setattr(ctypes, "CDLL", lambda *_args, **_kwargs: object())
    with pytest.raises(patcher.PatchError, match=r"requires renameatx_np\(RENAME_EXCL\)"):
        patcher._rename_noreplace("source", "destination", src_dir_fd=11, dst_dir_fd=12)


def test_runner_python39_grammar_and_anchor_only_hunk(tmp_path, monkeypatch):
    ast.parse(Path(patcher.__file__).read_text(), feature_version=(3, 9))
    real_zip = builtins.zip

    def python39_zip(*iterables):
        return real_zip(*iterables)

    monkeypatch.setattr(builtins, "zip", python39_zip)
    target = tmp_path / "anchors.txt"
    target.write_text("section\nvalue\n")
    plan = patcher.parse_patch(
        "*** Begin Patch\n*** Update File: anchors.txt\n"
        "@@ section\n@@ value\n+inserted\n*** End Patch\n"
    )
    patcher.apply_plan(str(tmp_path), plan)
    assert target.read_text() == "section\ninserted\nvalue\n"
