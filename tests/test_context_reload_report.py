"""ContextLoader reload report: loaded / removed / skipped are facts of the
same load, names are directory-relative, and load() keeps its string return."""
from __future__ import annotations

from src.context.loader import MAX_CONTEXT_FILE_BYTES, ContextLoader, ContextReloadReport


def test_load_returns_text_and_report_lists_effective_files(tmp_path):
    (tmp_path / "b.md").write_text("bravo")
    (tmp_path / "a.md").write_text("alpha")
    (tmp_path / "notes.txt").write_text("ignored")
    loader = ContextLoader(str(tmp_path))
    text = loader.load()
    assert isinstance(text, str) and "alpha" in text and "bravo" in text
    assert loader.loaded_files == ("a.md", "b.md")
    report = loader.reload()
    assert isinstance(report, ContextReloadReport)
    assert report.loaded == ("a.md", "b.md")
    assert report.removed == ()
    assert report.skipped == ()
    assert report.file_count == 2
    assert report.total_bytes == 10
    assert report.context_chars == len(loader.context)
    assert report.directory_exists is True
    assert all("/" not in name for name in report.loaded)


def test_reload_reports_removed_files(tmp_path):
    (tmp_path / "keep.md").write_text("k")
    (tmp_path / "gone.md").write_text("g")
    loader = ContextLoader(str(tmp_path))
    loader.load()
    (tmp_path / "gone.md").unlink()
    report = loader.reload()
    assert report.loaded == ("keep.md",)
    assert report.removed == ("gone.md",)
    assert "g" not in loader.context or loader.context == "# keep\n\nk"


def test_oversized_file_is_both_removed_and_skipped_with_reason(tmp_path):
    (tmp_path / "big.md").write_text("small for now")
    loader = ContextLoader(str(tmp_path))
    loader.load()
    (tmp_path / "big.md").write_text("x" * (MAX_CONTEXT_FILE_BYTES + 1))
    report = loader.reload()
    assert report.loaded == ()
    assert report.removed == ("big.md",)
    assert len(report.skipped) == 1
    name, reason = report.skipped[0]
    assert name == "big.md" and "per-file cap" in reason
    assert loader.context == ""


def test_missing_directory_reports_previous_files_as_removed(tmp_path):
    directory = tmp_path / "ctx"
    directory.mkdir()
    (directory / "one.md").write_text("1")
    loader = ContextLoader(str(directory))
    loader.load()
    (directory / "one.md").unlink()
    directory.rmdir()
    report = loader.reload()
    assert report.directory_exists is False
    assert report.loaded == () and report.removed == ("one.md",)
    assert loader.context == "" and loader.loaded_files == ()


def test_report_is_immutable_and_json_shaped(tmp_path):
    (tmp_path / "a.md").write_text("a")
    report = ContextLoader(str(tmp_path)).load_report()
    payload = report.to_dict()
    assert payload["loaded"] == ["a.md"] and payload["skipped"] == []
    import dataclasses

    import pytest

    with pytest.raises(dataclasses.FrozenInstanceError):
        report.loaded = ()  # type: ignore[misc]


def test_stat_and_read_failures_are_skipped_with_reasons(tmp_path, monkeypatch):
    from pathlib import Path

    (tmp_path / "ok.md").write_text("fine")
    (tmp_path / "nostat.md").write_text("x")
    (tmp_path / "noread.md").write_text("y")
    real_stat, real_read = Path.stat, Path.read_text

    def flaky_stat(self, *a, **k):
        if self.name == "nostat.md":
            raise PermissionError("stat denied")
        return real_stat(self, *a, **k)

    def flaky_read(self, *a, **k):
        if self.name == "noread.md":
            raise OSError("read denied")
        return real_read(self, *a, **k)

    monkeypatch.setattr(Path, "stat", flaky_stat)
    monkeypatch.setattr(Path, "read_text", flaky_read)
    report = ContextLoader(str(tmp_path)).load_report()
    assert report.loaded == ("ok.md",)
    assert dict(report.skipped) == {
        "nostat.md": "stat failed: PermissionError",
        "noread.md": "read failed: OSError",
    }
    assert report.total_bytes == 4


def test_total_cap_skips_every_remaining_file_with_the_cap_reason(tmp_path):
    from src.context.loader import MAX_CONTEXT_TOTAL_BYTES

    chunk = "x" * (MAX_CONTEXT_FILE_BYTES - 1024)
    for name in ("a.md", "b.md", "c.md", "d.md", "e.md", "f.md"):
        (tmp_path / name).write_text(chunk)
    report = ContextLoader(str(tmp_path)).load_report()
    assert 0 < report.total_bytes <= MAX_CONTEXT_TOTAL_BYTES
    assert report.loaded == ("a.md", "b.md", "c.md", "d.md")
    assert [name for name, _ in report.skipped] == ["e.md", "f.md"]
    assert all("total cap" in reason for _, reason in report.skipped)
