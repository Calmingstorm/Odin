"""Retained audit evidence failures must disclose incomplete coverage."""
import io
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

from src.observability import aggregates


def record():
    return (json.dumps({
        "timestamp": (datetime.now(UTC) - timedelta(minutes=1)).replace(tzinfo=None).isoformat(),
        "failure": {"class": "TIMEOUT"}, "tool_name": "run_command",
    }) + "\n").encode()


def test_retained_hardlink_is_not_counted_twice_and_unreadable_generation_is_disclosed(
    tmp_path, monkeypatch
):
    path = tmp_path / "audit.jsonl"
    path.write_bytes(record())
    (tmp_path / "audit.jsonl.1").hardlink_to(path)
    blocked = tmp_path / "audit.jsonl.2"
    blocked.write_bytes(record())
    original = Path.open
    handles = []

    def open_generation(candidate, *args, **kwargs):
        if candidate == blocked:
            raise PermissionError("fixture retained generation denied")
        handle = original(candidate, *args, **kwargs)
        handles.append(handle)
        return handle

    monkeypatch.setattr(Path, "open", open_generation)
    result = aggregates.failure_aggregates(str(path))
    assert result["classified"] == 1
    assert result["by_class"] == {"TIMEOUT": {"count": 1, "top_tools": {"run_command": 1}}}
    assert result["coverage"] == {
        "scope": "retained_audit_generations", "generations": 1,
        "tail_truncated": False, "read_errors": 1, "complete_retained_scan": False,
    }
    assert len(handles) == 2
    assert all(handle.closed for handle in handles)


class UnreadableSnapshot(io.BytesIO):
    def readline(self, size=-1):
        raise OSError("fixture captured descriptor read failed")


def test_borrowed_snapshot_reports_read_failure_keeps_healthy_evidence_and_ownership():
    good = io.BytesIO(b"[]\n" + record())
    broken = UnreadableSnapshot(record())
    short = io.BytesIO(b"")
    snapshot = [
        (good, SimpleNamespace(st_size=len(good.getvalue()))),
        (broken, SimpleNamespace(st_size=len(broken.getvalue()))),
        (short, SimpleNamespace(st_size=99)),
    ]
    result = aggregates.failure_aggregates("unused", snapshot=snapshot)
    assert result["classified"] == 1
    assert result["coverage"]["read_errors"] == 1
    assert not result["coverage"]["complete_retained_scan"]
    assert result["coverage"]["generations"] == 3
    assert not any(handle.closed for handle, _ in snapshot)
    for handle, _ in snapshot:
        handle.close()


def test_trajectory_read_failure_does_not_discard_other_days(tmp_path, monkeypatch, caplog):
    now = datetime.now(UTC)
    yesterday = now - timedelta(days=1)
    blocked = tmp_path / f"{yesterday.date().isoformat()}.jsonl"
    blocked.write_text("fixture unavailable")
    today = tmp_path / f"{now.date().isoformat()}.jsonl"
    today.write_text(json.dumps({"timestamp": now.isoformat(), "context_trace": {}}) + "\n")
    original = Path.open

    def read_file(candidate, *args, **kwargs):
        if candidate == blocked:
            raise OSError("fixture daily trace unavailable")
        return original(candidate, *args, **kwargs)

    monkeypatch.setattr(Path, "open", read_file)
    turns = list(aggregates._iter_trajectory_turns(tmp_path, yesterday, now))
    assert turns == [{"timestamp": now.isoformat(), "context_trace": {}}]
    assert "Could not read trajectory file" in caplog.text
