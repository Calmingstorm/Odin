"""Real bounded-tail and incremental-cursor tests against disposable files."""
import asyncio
import os
import threading
import tracemalloc

import pytest

from src.web import websocket


@pytest.mark.parametrize("content,expected", [
    (b"", []),
    (b"unfinished", []),
    (b"first\n", ["first"]),
    (b"first\nsecond\n", ["first", "second"]),
    (b"first\nsecond", ["first"]),
    (b"first\r\nsecond\r\n", ["first", "second"]),
    (b"first\n\nlast\n", ["first", "", "last"]),
])
def test_tail_empty_short_partial_and_crlf(tmp_path, content, expected):
    path = tmp_path / "audit.jsonl"
    path.write_bytes(content)
    lines, cursor, _ = websocket._read_log_tail(path)
    assert lines == expected
    assert cursor == content.rfind(b"\n") + 1


def test_tail_matches_full_read_with_utf8_across_blocks(tmp_path):
    path = tmp_path / "audit.jsonl"
    content = "".join(f'{n}: café 星 {"x" * 997}\n' for n in range(200))
    path.write_text(content, encoding="utf-8")
    expected = path.read_text(encoding="utf-8").split("\n")[:-1][-50:]
    assert websocket._read_log_tail(path)[0] == expected


def test_partial_tail_is_discarded_with_bounded_memory(tmp_path):
    path = tmp_path / "audit.jsonl"
    with path.open("wb") as handle:
        handle.write(b"first\nsecond\n")
        for _ in range(128):
            handle.write(b"x" * 65536)
    tracemalloc.start()
    try:
        lines, cursor, _ = websocket._read_log_tail(path)
        _, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    assert lines == ["first", "second"]
    assert cursor == len(b"first\nsecond\n")
    assert peak < 16 * websocket._LOG_READ_BLOCK


def test_read_log_tail_returns_last_50_complete_records_and_cursor(tmp_path):
    path = tmp_path / "audit.jsonl"
    path.write_bytes(
        b"".join(f"record-{n:03}\n".encode() for n in range(80))
        + b"unfinished final record"
    )
    lines, cursor, identity = websocket._read_log_tail(path)

    assert lines == [f"record-{n:03}" for n in range(30, 80)]
    assert cursor == len(b"".join(f"record-{n:03}\n".encode() for n in range(80)))
    stat = path.stat()
    assert identity == (stat.st_dev, stat.st_ino)
    assert cursor < stat.st_size


def test_read_log_tail_reads_backwards_in_bounded_8192_byte_blocks(tmp_path, monkeypatch):
    path = tmp_path / "large.jsonl"
    path.write_bytes((b"x" * 13000 + b"\n") * 2000 + b"partial")
    real_open = type(path).open
    read_sizes = []

    class ReadSpy:
        def __init__(self, handle):
            self.handle = handle

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return self.handle.__exit__(*args)

        def fileno(self):
            return self.handle.fileno()

        def seek(self, position):
            return self.handle.seek(position)

        def read(self, size=-1):
            read_sizes.append(size)
            return self.handle.read(size)

    monkeypatch.setattr(
        type(path), "open", lambda self, *a, **kw: ReadSpy(real_open(self, *a, **kw)),
    )
    lines, cursor, _identity = websocket._read_log_tail(path)

    assert len(lines) == 50
    assert all(line == "x" * 13000 for line in lines)
    assert read_sizes and all(0 < size <= 8192 for size in read_sizes)
    assert len(read_sizes) <= 82  # 51 records of 13001 bytes need at most 82 blocks.
    assert cursor == path.stat().st_size - len(b"partial")


def test_read_log_updates_retains_incomplete_record_cursor(tmp_path):
    path = tmp_path / "audit.jsonl"
    path.write_bytes(b"first\npartial")
    _lines, cursor, identity = websocket._read_log_tail(path)
    assert cursor == len(b"first\n")

    with path.open("ab") as handle:
        handle.write(b" finished\nsecond\n")
    lines, cursor, updated_identity = websocket._read_log_updates(path, cursor, identity)
    assert lines == ["partial finished", "second"]
    assert cursor == path.stat().st_size
    assert updated_identity == identity


@pytest.mark.parametrize("replacement_size", [None, 40])
def test_read_log_updates_detects_inode_rotation_even_same_or_larger_size(
    tmp_path, replacement_size,
):
    path = tmp_path / "audit.jsonl"
    path.write_bytes(b"old record\n")
    old_identity = websocket._read_log_tail(path)[2]
    old_cursor = path.stat().st_size
    rotated = tmp_path / "rotated"
    content = (b"new record\n" if replacement_size is None
               else b"replacement record that is longer\n")
    assert len(content) >= old_cursor
    rotated.write_bytes(content)
    os.replace(rotated, path)

    lines, cursor, identity = websocket._read_log_updates(path, old_cursor, old_identity)

    assert lines == [content.decode().rstrip("\n")]
    assert cursor == len(content)
    assert identity != old_identity


def test_read_log_updates_detects_truncation(tmp_path):
    path = tmp_path / "audit.jsonl"
    path.write_bytes(b"first record\nsecond record\n")
    _lines, cursor, identity = websocket._read_log_tail(path)
    assert cursor == path.stat().st_size
    path.write_bytes(b"short\n")

    lines, cursor, new_identity = websocket._read_log_updates(path, cursor, identity)

    assert lines == ["short"]
    assert cursor == len(b"short\n")
    assert new_identity == identity


@pytest.mark.asyncio
async def test_tail_logs_runs_file_reads_off_event_loop_thread(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    data = tmp_path / "data"
    data.mkdir()
    (data / "audit.jsonl").write_text("initial record\n")
    manager = websocket.WebSocketManager(None)

    class Socket:
        closed = False

        def __init__(self):
            self.sent = []

        async def send_json(self, payload):
            self.sent.append(payload)

    ws = Socket()
    manager._log_subscribers.add(ws)
    loop_thread = threading.get_ident()
    worker_threads = []
    original_to_thread = asyncio.to_thread

    async def record_worker(func, *args, **kwargs):
        def invoke():
            worker_threads.append(threading.get_ident())
            return func(*args, **kwargs)
        return await original_to_thread(invoke)

    async def stop_after_tail(_delay):
        manager._log_subscribers.discard(ws)

    monkeypatch.setattr(websocket.asyncio, "to_thread", record_worker)
    monkeypatch.setattr(websocket.asyncio, "sleep", stop_after_tail)
    await manager._tail_logs(ws)

    assert ws.sent == [{"type": "log", "line": "initial record"}]
    assert worker_threads and all(thread_id != loop_thread for thread_id in worker_threads)
