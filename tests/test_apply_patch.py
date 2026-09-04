from __future__ import annotations

import os
from pathlib import Path

import pytest

from src.config.schema import ToolHost, ToolsConfig
from src.tools.apply_patch import PatchError, PatchRollbackError, apply_plan, parse_patch
from src.tools.executor import ToolExecutor


def _patch(body: str) -> str:
    return f"*** Begin Patch\n{body}\n*** End Patch\n"


def test_parse_combined_envelope_and_relative_paths():
    plan = parse_patch(
        _patch(
            "*** Add File: added.txt\n+new\n"
            "*** Update File: old.txt\n*** Move to: moved.txt\n"
            "@@ anchor\n anchor\n-before\n+after\n"
            "*** Delete File: gone.txt"
        )
    )
    assert [op["action"] for op in plan["operations"]] == ["add", "update", "delete"]
    assert plan["operations"][1]["move_to"] == "moved.txt"


@pytest.mark.parametrize(
    "text,match",
    [
        ("noise\n" + _patch("*** Add File: a\n+x"), "exactly framed"),
        (_patch("*** Add File: /abs\n+x"), "normalized relative"),
        (_patch("*** Add File: ../escape\n+x"), "stay beneath root"),
        (_patch("*** Add File: a\nnot-prefixed"), r"start with '\+'"),
        (_patch("*** Delete File: a\n+body"), "no body"),
        (_patch("*** Update File: a\n@@\n same"), "patch line 3 contains no"),
        (_patch("*** Update File: a\n@@\n-old\n+new\n*** Delete File: a"), "more than once"),
    ],
)
def test_parser_rejects_invalid_whole_envelope(text, match):
    with pytest.raises(PatchError, match=match):
        parse_patch(text)


def test_context_mismatch_leaves_all_files_untouched(tmp_path):
    first = tmp_path / "first.txt"
    second = tmp_path / "second.txt"
    first.write_text("old\n")
    second.write_text("actual\n")
    plan = parse_patch(
        _patch(
            "*** Update File: first.txt\n@@\n-old\n+new\n"
            "*** Update File: second.txt\n@@\n-expected\n+replacement"
        )
    )
    with pytest.raises(PatchError, match="context mismatch"):
        apply_plan(str(tmp_path), plan)
    assert first.read_text() == "old\n"
    assert second.read_text() == "actual\n"
    assert not list(tmp_path.glob(".odin-patch-*"))


def test_apply_add_update_move_delete_transaction(tmp_path):
    (tmp_path / "update.txt").write_text("one\ntwo\nthree\n")
    (tmp_path / "move.txt").write_text("anchor\nold\n")
    (tmp_path / "delete.txt").write_text("gone\n")
    plan = parse_patch(
        _patch(
            "*** Add File: add.txt\n+added\n"
            "*** Update File: update.txt\n@@\n one\n-two\n+TWO\n three\n"
            "*** Update File: move.txt\n*** Move to: moved.txt\n@@ anchor\n anchor\n-old\n+new\n"
            "*** Delete File: delete.txt"
        )
    )
    changed = apply_plan(str(tmp_path), plan)
    assert changed == ["add.txt", "update.txt", "move.txt -> moved.txt", "delete.txt"]
    assert (tmp_path / "add.txt").read_text() == "added\n"
    assert (tmp_path / "update.txt").read_text() == "one\nTWO\nthree\n"
    assert not (tmp_path / "move.txt").exists()
    assert (tmp_path / "moved.txt").read_text() == "anchor\nnew\n"
    assert not (tmp_path / "delete.txt").exists()
    assert not list(tmp_path.glob(".odin-patch-*"))


def test_add_creates_missing_parent_chain_without_replacing_existing_directories(tmp_path):
    existing = tmp_path / "existing"
    existing.mkdir()
    before = existing.stat()
    plan = parse_patch(
        _patch(
            "*** Add File: existing/new/deep/file.txt\n+created\n"
            "*** Add File: other/tree/second.txt\n+also-created"
        )
    )

    assert apply_plan(str(tmp_path), plan) == [
        "existing/new/deep/file.txt",
        "other/tree/second.txt",
    ]
    assert (existing / "new" / "deep" / "file.txt").read_text() == "created\n"
    assert (tmp_path / "other" / "tree" / "second.txt").read_text() == "also-created\n"
    after = existing.stat()
    assert (after.st_dev, after.st_ino) == (before.st_dev, before.st_ino)


def test_move_creates_missing_destination_parents(tmp_path):
    source = tmp_path / "source.txt"
    source.write_text("old\n")
    plan = parse_patch(
        _patch(
            "*** Update File: source.txt\n"
            "*** Move to: nested/destination/moved.txt\n"
            "@@\n-old\n+new"
        )
    )

    assert apply_plan(str(tmp_path), plan) == [
        "source.txt -> nested/destination/moved.txt"
    ]
    assert not source.exists()
    assert (tmp_path / "nested" / "destination" / "moved.txt").read_text() == "new\n"


def test_created_parent_directories_roll_back_after_later_commit_failure(tmp_path):
    from src.tools.apply_patch import _rename_noreplace

    existing = tmp_path / "existing"
    existing.mkdir()
    survivor = existing / "survivor.txt"
    survivor.write_text("untouched\n")
    publishes = 0

    def fail_second_file_publish(source, destination, **kwargs):
        nonlocal publishes
        if str(source).startswith(".odin-patch-stage-"):
            publishes += 1
            if publishes == 2:
                raise OSError("injected later operation failure")
        _rename_noreplace(source, destination, **kwargs)

    plan = parse_patch(
        _patch(
            "*** Add File: existing/new/deep/first.txt\n+first\n"
            "*** Add File: another/new/second.txt\n+second"
        )
    )
    with pytest.raises(PatchError, match="rollback completed"):
        apply_plan(str(tmp_path), plan, rename_noreplace=fail_second_file_publish)

    assert survivor.read_text() == "untouched\n"
    assert sorted(path.name for path in tmp_path.iterdir()) == ["existing"]
    assert not (existing / "new").exists()
    assert not list(tmp_path.rglob(".odin-patch-*"))


def test_failure_after_parent_publish_rolls_back_the_published_directory(tmp_path):
    from src.tools.apply_patch import _rename_noreplace

    raised = False

    def publish_parent_then_raise(source, destination, **kwargs):
        nonlocal raised
        _rename_noreplace(source, destination, **kwargs)
        if str(source).startswith(".odin-patch-dir-") and not raised:
            raised = True
            raise OSError("injected post-effect parent publish failure")

    plan = parse_patch(_patch("*** Add File: created/nested/file.txt\n+content"))
    with pytest.raises(OSError, match="post-effect parent publish failure"):
        apply_plan(str(tmp_path), plan, rename_noreplace=publish_parent_then_raise)

    assert raised is True
    assert list(tmp_path.iterdir()) == []


def test_parent_moved_away_after_publish_is_reported_as_rollback_failure(tmp_path):
    from src.tools.apply_patch import _rename_noreplace

    root = tmp_path / "root"
    root.mkdir()
    detached = tmp_path / "detached"
    moved = False

    def move_published_parent_then_raise(source, destination, **kwargs):
        nonlocal moved
        _rename_noreplace(source, destination, **kwargs)
        if str(source).startswith(".odin-patch-dir-") and not moved:
            (root / str(destination)).rename(detached)
            moved = True
            raise OSError("injected detached parent failure")

    plan = parse_patch(_patch("*** Add File: created/file.txt\n+content"))
    with pytest.raises(PatchRollbackError, match="moved away from its planned path"):
        apply_plan(str(root), plan, rename_noreplace=move_published_parent_then_raise)

    assert moved is True
    assert not (root / "created").exists()
    assert detached.is_dir()
    detached.rmdir()


def test_concurrent_parent_creator_is_never_owned_or_removed_by_patch(tmp_path):
    from src.tools.apply_patch import _rename_noreplace

    concurrent_fd: int | None = None

    def create_destination_before_parent_publish(source, destination, **kwargs):
        nonlocal concurrent_fd
        if str(source).startswith(".odin-patch-dir-") and concurrent_fd is None:
            os.mkdir(destination, dir_fd=kwargs["dst_dir_fd"])
            concurrent_fd = os.open(
                destination,
                os.O_RDONLY | os.O_DIRECTORY,
                dir_fd=kwargs["dst_dir_fd"],
            )
        _rename_noreplace(source, destination, **kwargs)

    plan = parse_patch(_patch("*** Add File: concurrent/nested/file.txt\n+content"))
    try:
        apply_plan(str(tmp_path), plan, rename_noreplace=create_destination_before_parent_publish)
        assert concurrent_fd is not None
        concurrent = os.fstat(concurrent_fd)
        current = (tmp_path / "concurrent").stat()
        assert (current.st_dev, current.st_ino) == (concurrent.st_dev, concurrent.st_ino)
        assert (tmp_path / "concurrent" / "nested" / "file.txt").read_text() == "content\n"
    finally:
        if concurrent_fd is not None:
            os.close(concurrent_fd)


def test_directory_rollback_preserves_external_nonempty_content(tmp_path):
    from src.tools.apply_patch import _rename_noreplace

    external = tmp_path / "created" / "external.txt"
    injected = False

    def inject_external_file_then_fail(source, destination, **kwargs):
        nonlocal injected
        if str(source).startswith(".odin-patch-stage-") and not injected:
            external.write_text("not-owned-by-patch\n")
            injected = True
            raise OSError("injected publish failure")
        _rename_noreplace(source, destination, **kwargs)

    plan = parse_patch(_patch("*** Add File: created/nested/file.txt\n+content"))
    with pytest.raises(PatchRollbackError, match="Directory not empty"):
        apply_plan(str(tmp_path), plan, rename_noreplace=inject_external_file_then_fail)

    assert external.read_text() == "not-owned-by-patch\n"
    assert not (tmp_path / "created" / "nested").exists()


def test_add_parent_creation_refuses_symlink_components(tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()
    root = tmp_path / "root"
    root.mkdir()
    (root / "link").symlink_to(outside, target_is_directory=True)

    plan = parse_patch(_patch("*** Add File: link/new/deep.txt\n+content"))
    with pytest.raises(PatchError, match="symlink"):
        apply_plan(str(root), plan)
    assert list(outside.iterdir()) == []


def test_created_parent_swap_is_detected_and_does_not_write_outside_root(tmp_path):
    from src.tools.apply_patch import _rename_noreplace

    root = tmp_path / "root"
    root.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    swapped = False

    def swap_created_parent_before_file_publish(source, destination, **kwargs):
        nonlocal swapped
        if str(source).startswith(".odin-patch-stage-") and not swapped:
            created = root / "created"
            created.rename(root / "detached-created")
            created.symlink_to(outside, target_is_directory=True)
            swapped = True
        _rename_noreplace(source, destination, **kwargs)

    plan = parse_patch(_patch("*** Add File: created/deep/file.txt\n+content"))
    with pytest.raises(PatchRollbackError, match="replaced path"):
        apply_plan(str(root), plan, rename_noreplace=swap_created_parent_before_file_publish)

    assert list(outside.iterdir()) == []
    assert not (root / "detached-created" / "deep" / "file.txt").exists()
    assert (root / "created").is_symlink()


def test_directory_creation_guard_is_load_bearing(tmp_path):
    plan = parse_patch(_patch("*** Add File: missing/nested/file.txt\n+content"))
    apply_plan(str(tmp_path), plan)
    assert (tmp_path / "missing" / "nested" / "file.txt").read_text() == "content\n"


def test_staging_files_are_private_and_unpredictable(tmp_path):
    target = tmp_path / "a.txt"
    target.write_text("old\n")
    seen: list[tuple[str, int]] = []
    from src.tools.apply_patch import _rename_noreplace

    def inspect_rename(source, destination, **kwargs):
        source_info = os.stat(source, dir_fd=kwargs["src_dir_fd"], follow_symlinks=False)
        if str(source).startswith(".odin-patch-"):
            seen.append((str(source), source_info.st_mode & 0o777))
        _rename_noreplace(source, destination, **kwargs)

    apply_plan(
        str(tmp_path),
        parse_patch(_patch("*** Update File: a.txt\n@@\n-old\n+new")),
        rename_noreplace=inspect_rename,
    )
    assert seen and all(mode == 0o600 for _name, mode in seen)
    assert all(name.startswith(".odin-patch-") and len(name) > 40 for name, _ in seen)


def test_commit_failure_rolls_back_every_committed_path(tmp_path):
    first = tmp_path / "first.txt"
    second = tmp_path / "second.txt"
    first.write_text("old-one\n")
    second.write_text("old-two\n")
    from src.tools.apply_patch import _rename_noreplace

    publishes = 0

    def fail_second_publish(source, destination, **kwargs):
        nonlocal publishes
        if str(source).startswith(".odin-patch-stage-"):
            publishes += 1
            if publishes == 2:
                raise OSError("injected commit failure")
        _rename_noreplace(source, destination, **kwargs)

    plan = parse_patch(
        _patch(
            "*** Update File: first.txt\n@@\n-old-one\n+new-one\n"
            "*** Update File: second.txt\n@@\n-old-two\n+new-two"
        )
    )
    with pytest.raises(PatchError, match="rollback completed"):
        apply_plan(str(tmp_path), plan, rename_noreplace=fail_second_publish)
    assert first.read_text() == "old-one\n"
    assert second.read_text() == "old-two\n"
    assert not list(tmp_path.glob(".odin-patch-*"))


def test_rollback_failure_is_explicit_and_retains_private_artifact(tmp_path):
    first = tmp_path / "first.txt"
    second = tmp_path / "second.txt"
    first.write_text("old-one\n")
    second.write_text("old-two\n")
    from src.tools.apply_patch import _rename_noreplace

    publishes = 0

    def fail_commit_and_restore(source, destination, **kwargs):
        nonlocal publishes
        if str(source).startswith(".odin-patch-stage-"):
            publishes += 1
            if publishes == 2:
                raise OSError("injected commit failure")
        if str(source).startswith(".odin-patch-recovery-"):
            raise OSError("injected rollback failure")
        _rename_noreplace(source, destination, **kwargs)

    plan = parse_patch(
        _patch(
            "*** Update File: first.txt\n@@\n-old-one\n+new-one\n"
            "*** Update File: second.txt\n@@\n-old-two\n+new-two"
        )
    )
    with pytest.raises(PatchRollbackError) as caught:
        apply_plan(str(tmp_path), plan, rename_noreplace=fail_commit_and_restore)
    artifacts = [Path(path) for path in caught.value.recovery_artifacts]
    assert artifacts
    assert all(path.exists() and path.stat().st_mode & 0o777 == 0o600 for path in artifacts)
    for path in artifacts:
        path.unlink()


def test_symlink_component_refused(tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "x.txt").write_text("old\n")
    root = tmp_path / "root"
    root.mkdir()
    (root / "link").symlink_to(outside, target_is_directory=True)
    plan = parse_patch(_patch("*** Update File: link/x.txt\n@@\n-old\n+new"))
    with pytest.raises(PatchError, match="symlink"):
        apply_plan(str(root), plan)
    assert (outside / "x.txt").read_text() == "old\n"


def test_failure_after_source_move_restores_deleted_file(tmp_path):
    target = tmp_path / "deleted.txt"
    target.write_text("original\n")
    from src.tools.apply_patch import _rename_noreplace

    def move_then_raise(source, destination, **kwargs):
        _rename_noreplace(source, destination, **kwargs)
        if str(destination).startswith(".odin-patch-recovery-"):
            raise OSError("injected post-effect source move failure")

    plan = parse_patch(_patch("*** Delete File: deleted.txt"))
    with pytest.raises(PatchError, match="rollback completed"):
        apply_plan(str(tmp_path), plan, rename_noreplace=move_then_raise)
    assert target.read_text() == "original\n"
    assert not list(tmp_path.glob(".odin-patch-*"))


def test_failure_after_publish_restores_original(tmp_path):
    target = tmp_path / "updated.txt"
    target.write_text("old\n")
    from src.tools.apply_patch import _rename_noreplace

    def publish_then_raise(source, destination, **kwargs):
        _rename_noreplace(source, destination, **kwargs)
        if str(source).startswith(".odin-patch-stage-"):
            raise OSError("injected post-effect publish failure")

    plan = parse_patch(_patch("*** Update File: updated.txt\n@@\n-old\n+new"))
    with pytest.raises(PatchError, match="rollback completed"):
        apply_plan(str(tmp_path), plan, rename_noreplace=publish_then_raise)
    assert target.read_text() == "old\n"
    assert not list(tmp_path.glob(".odin-patch-*"))


def test_destination_created_during_commit_is_not_overwritten(tmp_path):
    destination = tmp_path / "created.txt"
    from src.tools.apply_patch import _rename_noreplace

    def race_publish(source, destination_name, **kwargs):
        if str(source).startswith(".odin-patch-stage-"):
            destination.write_text("concurrent\n")
        _rename_noreplace(source, destination_name, **kwargs)

    plan = parse_patch(_patch("*** Add File: created.txt\n+patch"))
    with pytest.raises(PatchError, match="rollback completed"):
        apply_plan(str(tmp_path), plan, rename_noreplace=race_publish)
    assert destination.read_text() == "concurrent\n"
    assert not list(tmp_path.glob(".odin-patch-*"))


def test_source_parent_swap_cannot_redirect_update_outside_root(tmp_path):
    root = tmp_path / "root"
    root.mkdir()
    held = root / "held"
    held.mkdir()
    (held / "a.txt").write_text("inside\n")
    outside = tmp_path / "outside"
    outside.mkdir()
    outside_target = outside / "a.txt"
    outside_target.write_text("outside\n")
    from src.tools.apply_patch import _rename_noreplace

    swapped = False

    def swap_parent_then_rename(source, destination, **kwargs):
        nonlocal swapped
        if not swapped and str(source).startswith(".odin-patch-stage-"):
            held.rename(root / "original-held")
            held.symlink_to(outside, target_is_directory=True)
            swapped = True
        _rename_noreplace(source, destination, **kwargs)

    plan = parse_patch(_patch("*** Update File: held/a.txt\n@@\n-inside\n+updated"))
    apply_plan(str(root), plan, rename_noreplace=swap_parent_then_rename)
    assert outside_target.read_text() == "outside\n"
    assert (root / "original-held" / "a.txt").read_text() == "updated\n"


@pytest.mark.asyncio
async def test_handler_uses_base64_private_staging_and_reports_success(tmp_path, monkeypatch):
    config = ToolsConfig(hosts={"local": ToolHost(address="127.0.0.1", ssh_user="root")})
    executor = ToolExecutor(config=config)
    root = tmp_path / "root"
    root.mkdir()
    patch = _patch("*** Add File: hello.txt\n+hello")
    result = await executor.execute(
        "apply_patch", {"host": "local", "root": str(root), "patch_text": patch}
    )
    assert result.ok is True
    assert (root / "hello.txt").read_text() == "hello\n"
    assert "Applied patch successfully" in result.output


@pytest.mark.asyncio
async def test_handler_rejects_context_mismatch_as_failure(tmp_path):
    config = ToolsConfig(hosts={"local": ToolHost(address="127.0.0.1", ssh_user="root")})
    executor = ToolExecutor(config=config)
    target = tmp_path / "a.txt"
    target.write_text("actual\n")
    result = await executor.execute(
        "apply_patch",
        {
            "host": "local",
            "root": str(tmp_path),
            "patch_text": _patch("*** Update File: a.txt\n@@\n-expected\n+new"),
        },
    )
    assert result.ok is False
    assert (
        "context mismatch in a.txt, hunk at patch line 3, anchors [<none>]"
        in result.output
    )
    assert target.read_text() == "actual\n"


def test_context_match_guard_is_load_bearing(tmp_path):
    target = tmp_path / "guard.txt"
    target.write_text("before\n")
    plan = parse_patch(_patch("*** Update File: guard.txt\n@@\n-not-before\n+after"))
    with pytest.raises(PatchError, match="context mismatch"):
        apply_plan(str(tmp_path), plan)
    assert target.read_text() == "before\n"


def test_ambiguous_context_is_refused(tmp_path):
    target = tmp_path / "guard.txt"
    target.write_text("repeat\nrepeat\n")
    plan = parse_patch(_patch("*** Update File: guard.txt\n@@\n-repeat\n+after"))
    with pytest.raises(PatchError, match="ambiguous"):
        apply_plan(str(tmp_path), plan)
    assert target.read_text() == "repeat\nrepeat\n"


@pytest.mark.parametrize(
    "source,body,expected",
    [
        (
            "actual\n",
            "*** Update File: located.txt\n@@ section\n-expected\n+new",
            "context mismatch in located.txt, hunk at patch line 3, anchors [@@ section]",
        ),
        (
            "section\nrepeat\nrepeat\n",
            "*** Update File: located.txt\n@@ section\n-repeat\n+new",
            (
                "context is ambiguous in located.txt, hunk at patch line 3, "
                "anchors [@@ section]"
            ),
        ),
    ],
)
def test_match_failures_name_patch_line_and_anchors(tmp_path, source, body, expected):
    target = tmp_path / "located.txt"
    target.write_text(source)
    with pytest.raises(PatchError, match="mismatch|ambiguous") as caught:
        apply_plan(str(tmp_path), parse_patch(_patch(body)))
    assert expected in str(caught.value)
    assert target.read_text() == source


def test_model_and_transported_match_error_locations_are_identical(tmp_path):
    target = tmp_path / "same-error.txt"
    target.write_text("actual\n")
    patch = _patch("*** Update File: same-error.txt\n@@ scope\n-expected\n+new")
    plan = parse_patch(patch)

    with pytest.raises(PatchError) as model_side:
        apply_plan(str(tmp_path), parse_patch(patch))
    with pytest.raises(PatchError) as transported:
        apply_plan(str(tmp_path), plan)

    assert str(model_side.value) == str(transported.value)
    assert "hunk at patch line 3, anchors [@@ scope]" in str(transported.value)
    assert target.read_text() == "actual\n"


def test_stacked_anchor_failure_names_every_anchor(tmp_path):
    target = tmp_path / "located.py"
    target.write_text("class Actual:\n    def method(self):\n        return 1\n")
    patch = _patch(
        "*** Update File: located.py\n"
        "@@ class Expected:\n"
        "@@     def method(self):\n"
        "-        return 1\n"
        "+        return 2"
    )
    with pytest.raises(PatchError, match="context mismatch") as caught:
        apply_plan(str(tmp_path), parse_patch(patch))
    assert (
        "located.py, hunk at patch line 3, anchors "
        "[@@ class Expected:, @@     def method(self):]"
    ) in str(caught.value)
    assert target.read_text() == "class Actual:\n    def method(self):\n        return 1\n"


def test_transported_plan_preserves_match_failure_location(tmp_path):
    target = tmp_path / "transported.txt"
    target.write_text("actual\n")
    plan = parse_patch(
        _patch("*** Update File: transported.txt\n@@ scope\n-expected\n+new")
    )
    assert plan["operations"][0]["hunks"][0]["patch_line"] == 3
    with pytest.raises(PatchError) as caught:
        apply_plan(str(tmp_path), plan)
    assert (
        "context mismatch in transported.txt, hunk at patch line 3, anchors [@@ scope]"
        in str(caught.value)
    )
    assert target.read_text() == "actual\n"


@pytest.mark.parametrize(
    "text,match",
    [
        ("*** Begin Patch\n*** End Patch\n", "exactly framed"),
        (_patch("*** Add File: a\\b\n+x"), "normalized relative"),
        (_patch("*** Add File: a/\n+x"), "normalized relative"),
        (_patch("*** Update File: a\nnot-a-hunk"), "expected an @@ hunk"),
        (_patch("*** Update File: a\n@@\nold\n+new"), "must start"),
    ],
)
def test_more_malformed_envelopes_are_refused(text, match):
    with pytest.raises(PatchError, match=match):
        parse_patch(text)


def test_patch_size_and_utf8_guards():
    from src.tools.apply_patch import MAX_PATCH_BYTES

    with pytest.raises(PatchError, match="byte limit"):
        parse_patch("x" * (MAX_PATCH_BYTES + 1))
    with pytest.raises(PatchError, match="UTF-8"):
        parse_patch("\ud800")
    with pytest.raises(PatchError, match="NUL-free"):
        parse_patch(_patch("*** Add File: a\n+x\x00y"))


def test_transport_plan_is_revalidated_before_filesystem_access(tmp_path):
    from src.tools.apply_patch import _validated_plan

    invalid = [
        None,
        {"version": 2, "operations": []},
        {"version": 1, "operations": []},
        {"version": 1, "operations": [None]},
        {"version": 1, "operations": [{"action": "delete", "path": "a", "extra": 1}]},
        {"version": 1, "operations": [{"action": "add", "path": "a", "content": 1}]},
        {
            "version": 1,
            "operations": [{"action": "update", "path": "a", "move_to": None, "hunks": []}],
        },
        {
            "version": 1,
            "operations": [
                {
                    "action": "update",
                    "path": "a",
                    "move_to": None,
                    "hunks": [{"anchor": 1, "lines": ["-x", "+y"]}],
                }
            ],
        },
        {
            "version": 1,
            "operations": [
                {
                    "action": "update",
                    "path": "a",
                    "move_to": None,
                    "hunks": [{"anchor": None, "lines": ["context"]}],
                }
            ],
        },
    ]
    for plan in invalid:
        with pytest.raises(PatchError):
            _validated_plan(plan)
    assert list(tmp_path.iterdir()) == []


def test_apply_rejects_bad_roots_missing_parents_and_non_files(tmp_path):
    plan = parse_patch(_patch("*** Add File: a.txt\n+x"))
    for root in (None, "relative", str(tmp_path / "missing")):
        with pytest.raises(PatchError, match="root"):
            apply_plan(root, plan)

    root_link = tmp_path / "root-link"
    root_link.symlink_to(tmp_path, target_is_directory=True)
    with pytest.raises(PatchError, match="root"):
        apply_plan(str(root_link), plan)

    apply_plan(str(tmp_path), parse_patch(_patch("*** Add File: missing/a\n+x")))
    assert (tmp_path / "missing" / "a").read_text() == "x\n"

    directory = tmp_path / "dir"
    directory.mkdir()
    with pytest.raises(PatchError, match="regular"):
        apply_plan(str(tmp_path), parse_patch(_patch("*** Update File: dir\n@@\n-x\n+y")))


def test_add_existing_move_destination_and_non_utf8_update_are_refused(tmp_path):
    existing = tmp_path / "existing.txt"
    existing.write_text("old\n")
    with pytest.raises(PatchError, match="already exists"):
        apply_plan(str(tmp_path), parse_patch(_patch("*** Add File: existing.txt\n+new")))

    source = tmp_path / "source.txt"
    source.write_text("old\n")
    destination = tmp_path / "destination.txt"
    destination.write_text("occupied\n")
    with pytest.raises(PatchError, match="already exists"):
        apply_plan(
            str(tmp_path),
            parse_patch(
                _patch("*** Update File: source.txt\n*** Move to: destination.txt\n@@\n-old\n+new")
            ),
        )

    binary = tmp_path / "binary.txt"
    binary.write_bytes(b"\xff")
    with pytest.raises(PatchError, match="UTF-8"):
        apply_plan(str(tmp_path), parse_patch(_patch("*** Update File: binary.txt\n@@\n-x\n+y")))


def test_update_preserves_no_final_newline_and_crlf(tmp_path):
    plain = tmp_path / "plain.txt"
    plain.write_bytes(b"old")
    apply_plan(str(tmp_path), parse_patch(_patch("*** Update File: plain.txt\n@@\n-old\n+new")))
    assert plain.read_bytes() == b"new"

    crlf = tmp_path / "crlf.txt"
    crlf.write_bytes(b"one\r\ntwo\r\n")
    apply_plan(
        str(tmp_path),
        parse_patch(_patch("*** Update File: crlf.txt\n@@\n one\n-two\n+TWO")),
    )
    assert crlf.read_bytes() == b"one\r\nTWO\r\n"


def test_same_plan_cannot_claim_move_destination_twice():
    with pytest.raises(PatchError, match="more than once"):
        parse_patch(_patch("*** Update File: a\n*** Move to: b\n@@\n-x\n+y\n*** Delete File: b"))


def test_rename_commit_fsyncs_each_affected_directory(tmp_path, monkeypatch):
    source_dir = tmp_path / "source"
    destination_dir = tmp_path / "destination"
    source_dir.mkdir()
    destination_dir.mkdir()
    source = source_dir / "move.txt"
    source.write_text("old\n")

    from src.tools.apply_patch import _rename_noreplace

    rename_fds: list[tuple[int, int, int, str, str]] = []
    fsync_calls: list[int] = []
    real_fsync = os.fsync

    def record_fsync(fd: int) -> None:
        fsync_calls.append(fd)
        real_fsync(fd)

    def record_rename(source_name, destination_name, **kwargs):
        _rename_noreplace(source_name, destination_name, **kwargs)
        src_fd = kwargs["src_dir_fd"]
        dst_fd = kwargs["dst_dir_fd"]
        rename_fds.append(
            (
                src_fd,
                dst_fd,
                len(fsync_calls),
                os.path.realpath(f"/proc/self/fd/{src_fd}"),
                os.path.realpath(f"/proc/self/fd/{dst_fd}"),
            )
        )

    monkeypatch.setattr(os, "fsync", record_fsync)
    apply_plan(
        str(tmp_path),
        parse_patch(
            _patch(
                "*** Update File: source/move.txt\n"
                "*** Move to: destination/moved.txt\n"
                "@@\n-old\n+new"
            )
        ),
        rename_noreplace=record_rename,
    )

    assert rename_fds
    for src_fd, dst_fd, before_fsync, _src_path, _dst_path in rename_fds:
        expected = [dst_fd] if src_fd == dst_fd else [dst_fd, src_fd]
        assert fsync_calls[before_fsync : before_fsync + len(expected)] == expected
    fsynced_dirs = {
        path
        for _src_fd, _dst_fd, _before_fsync, src_path, dst_path in rename_fds
        for path in (src_path, dst_path)
    }
    assert str(source_dir.resolve()) in fsynced_dirs
    assert str(destination_dir.resolve()) in fsynced_dirs


def test_missing_renameat2_fails_without_partial_effect(tmp_path, monkeypatch):
    import ctypes

    class LibcWithoutRenameAt2:
        pass

    monkeypatch.setattr(ctypes, "CDLL", lambda *_args, **_kwargs: LibcWithoutRenameAt2())
    target = tmp_path / "new.txt"
    with pytest.raises(
        PatchError,
        match=r"requires renameat2\(RENAME_NOREPLACE\) on the target host",
    ):
        apply_plan(
            str(tmp_path),
            parse_patch(_patch("*** Add File: new.txt\n+content")),
        )
    assert not target.exists()
    assert not list(tmp_path.glob(".odin-patch-*"))


# ---------------------------------------------------------------------------
# Ordered anchor chains ("@@ class X" / "@@ def y()") — the dialect the model
# is taught; previously the second @@ closed an empty hunk and was refused.
# ---------------------------------------------------------------------------

_TWO_CLASSES = (
    "class Alpha:\n"
    "    def method(self):\n"
    "        x = 1\n"
    "        return x\n"
    "\n"
    "class Beta:\n"
    "    def method(self):\n"
    "        x = 1\n"
    "        return x\n"
)

_STACKED = (
    "*** Update File: mod.py\n"
    "@@ class Beta:\n"
    "@@     def method(self):\n"
    "         x = 1\n"
    "-        return x\n"
    "+        return x + 1"
)


def test_parse_stacked_anchors_form_one_hunk_with_an_ordered_chain():
    plan = parse_patch(_patch(_STACKED))
    hunks = plan["operations"][0]["hunks"]
    assert len(hunks) == 1
    assert hunks[0]["anchors"] == ["class Beta:", "    def method(self):"]
    assert hunks[0]["lines"] == ["         x = 1", "-        return x", "+        return x + 1"]
    assert hunks[0]["patch_line"] == 3
    assert plan["version"] == 3


def test_stacked_anchors_pick_the_site_inside_the_named_class(tmp_path):
    (tmp_path / "mod.py").write_text(_TWO_CLASSES)
    apply_plan(str(tmp_path), parse_patch(_patch(_STACKED)))
    text = (tmp_path / "mod.py").read_text()
    assert text.count("return x + 1") == 1
    assert text.index("class Beta") < text.index("return x + 1")
    # Alpha's identical body is untouched
    assert text.split("class Beta")[0].count("return x\n") == 1


def test_single_anchor_keeps_the_strict_unique_rule(tmp_path):
    (tmp_path / "mod.py").write_text(_TWO_CLASSES)
    single = _STACKED.replace("@@ class Beta:\n", "")
    with pytest.raises(PatchError, match="ambiguous"):
        apply_plan(str(tmp_path), parse_patch(_patch(single)))
    assert (tmp_path / "mod.py").read_text() == _TWO_CLASSES


def test_missing_or_ambiguous_chain_refuses_without_mutation(tmp_path):
    (tmp_path / "mod.py").write_text(_TWO_CLASSES)
    missing = _STACKED.replace("@@     def method(self):", "@@     def absent(self):")
    with pytest.raises(PatchError, match="context mismatch"):
        apply_plan(str(tmp_path), parse_patch(_patch(missing)))
    # More than one complete monotonic anchor-chain + body match is ambiguous.
    ambiguous_first = _STACKED.replace(
        "@@ class Beta:\n@@     def method(self):",
        "@@     def method(self):\n@@         x = 1",
    )
    with pytest.raises(PatchError, match="ambiguous"):
        apply_plan(str(tmp_path), parse_patch(_patch(ambiguous_first)))
    assert (tmp_path / "mod.py").read_text() == _TWO_CLASSES


def test_chain_does_not_jump_from_first_nested_target_to_later_matching_body(tmp_path):
    original = (
        "class A:\n"
        "def f(self):\n"
        "    return other\n"
        "\n"
        "class B:\n"
        "def f(self):\n"
        "    return x\n"
    )
    target = tmp_path / "nested.py"
    target.write_text(original)
    patch = _patch(
        "*** Update File: nested.py\n"
        "@@ class A:\n"
        "@@ def f(self):\n"
        "-    return x\n"
        "+    return changed"
    )

    with pytest.raises(PatchError, match="ambiguous"):
        apply_plan(str(tmp_path), parse_patch(patch))
    assert target.read_text() == original


def test_chain_rejects_duplicate_complete_body_matches_without_mutation(tmp_path):
    original = (
        "class A:\n"
        "    def f(self):\n"
        "        return x\n"
        "        return x\n"
    )
    target = tmp_path / "duplicate.py"
    target.write_text(original)
    patch = _patch(
        "*** Update File: duplicate.py\n"
        "@@ class A:\n"
        "@@     def f(self):\n"
        "-        return x\n"
        "+        return changed"
    )

    with pytest.raises(PatchError, match="ambiguous"):
        apply_plan(str(tmp_path), parse_patch(patch))
    assert target.read_text() == original


def test_ordinary_hunks_stay_separate_and_bare_marker_opens_its_own_hunk():
    body = (
        "*** Update File: f.txt\n"
        "@@ one\n"
        " one\n-a\n+A\n"
        "@@\n"
        " two\n-b\n+B\n"
        "@@ three\n"
        "@@ four\n"
        "-c\n+C"
    )
    hunks = parse_patch(_patch(body))["operations"][0]["hunks"]
    assert [h["anchors"] for h in hunks] == [["one"], [], ["three", "four"]]


def test_empty_hunk_errors_name_the_patch_line():
    with pytest.raises(PatchError, match="hunk introduced at patch line 3 contains no"):
        parse_patch(_patch("*** Update File: a\n@@ x\n same"))
    with pytest.raises(PatchError, match="patch line 4 must start with"):
        parse_patch(_patch("*** Update File: a\n@@ x\nbad"))
    with pytest.raises(PatchError, match="empty @@ anchor at patch line 3"):
        parse_patch(_patch("*** Update File: a\n@@  \n-x\n+y"))
    too_many = "".join(f"@@ a{i}\n" for i in range(9)) + "-x\n+y"
    with pytest.raises(PatchError, match="more than 8 @@ anchors"):
        parse_patch(_patch("*** Update File: a\n" + too_many))
    with pytest.raises(PatchError, match="control character.*patch line 3"):
        parse_patch(_patch("*** Update File: a\n@@ anchor\tname\n-x\n+y"))


@pytest.mark.parametrize(
    "hunk",
    [
        {"anchor": "old-shape", "lines": ["-x", "+y"]},
        {"anchors": "not-a-list", "lines": ["-x", "+y"], "patch_line": 3},
        {"anchors": [""], "lines": ["-x", "+y"], "patch_line": 3},
        {"anchors": ["bad\x01"], "lines": ["-x", "+y"], "patch_line": 3},
        {"anchors": ["bad\tanchor"], "lines": ["-x", "+y"], "patch_line": 3},
        {
            "anchors": [f"a{i}" for i in range(9)],
            "lines": ["-x", "+y"],
            "patch_line": 3,
        },
        {"anchors": [], "lines": ["-x", "+y"], "patch_line": True},
        {"anchors": [], "lines": ["-x", "+y"], "patch_line": 0},
    ],
)
def test_transported_plan_validates_anchor_chains_independently(tmp_path, hunk):
    plan = {
        "version": 3,
        "operations": [{"action": "update", "path": "a.txt", "move_to": None, "hunks": [hunk]}],
    }
    (tmp_path / "a.txt").write_text("x\n")
    with pytest.raises(PatchError, match="invalid transported"):
        apply_plan(str(tmp_path), plan)
    assert (tmp_path / "a.txt").read_text() == "x\n"


def test_transported_plan_requires_the_current_version(tmp_path):
    plan = parse_patch(_patch("*** Add File: n.txt\n+n"))
    plan["version"] = 1
    with pytest.raises(PatchError, match="invalid transported patch plan"):
        apply_plan(str(tmp_path), plan)
