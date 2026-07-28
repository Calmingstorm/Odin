"""Binary payloads must not travel the text pipeline.

analyze_pdf and analyze_image pulled host files as base64 through
``_exec_command``, whose output is truncated at ``MAX_OUTPUT_CHARS`` (16,000).
Base64 crosses that at roughly 12,000 source bytes, so any ordinary PDF or
image read from a managed host arrived truncated and failed to decode —
"Incorrect padding". Found by adversarial review of v3.65.1 and reproduced with
a valid 20,853-byte PDF.
"""

from __future__ import annotations

import os

import pytest

from src.tools.ssh import MAX_OUTPUT_CHARS, read_binary_file


async def test_reads_a_payload_larger_than_the_text_transport(tmp_path):
    """The exact defect: bigger than base64-over-stdout could carry."""
    payload = os.urandom(20_853)
    target = tmp_path / "big.bin"
    target.write_bytes(payload)

    data, error = await read_binary_file("127.0.0.1", str(target), max_bytes=10_000_000)

    assert error == ""
    assert data == payload, "the payload must arrive byte-for-byte"
    assert len(payload) * 4 // 3 > MAX_OUTPUT_CHARS, (
        "fixture must exceed what the old text transport could carry"
    )


async def test_binary_content_survives_intact(tmp_path):
    """Bytes that are not valid UTF-8 must not be mangled — the text path
    decoded with errors='replace', which silently corrupts binary."""
    payload = bytes(range(256)) * 8
    target = tmp_path / "raw.bin"
    target.write_bytes(payload)

    data, error = await read_binary_file("127.0.0.1", str(target), max_bytes=100_000)

    assert error == ""
    assert data == payload


async def test_oversize_is_an_explicit_error_not_a_truncation(tmp_path):
    """A partial binary is indistinguishable from a corrupt one, so the limit
    must produce an error rather than a short read."""
    target = tmp_path / "big.bin"
    target.write_bytes(b"x" * 5000)

    data, error = await read_binary_file("127.0.0.1", str(target), max_bytes=1000)

    assert data is None
    assert "over the" in error and "1000" in error


async def test_missing_file_reports_cleanly(tmp_path):
    data, error = await read_binary_file(
        "127.0.0.1", str(tmp_path / "nope"), max_bytes=1000
    )
    assert data is None
    assert "cannot stat" in error


@pytest.mark.parametrize("size", [0, 1, 4095, 4096, 4097])
async def test_boundary_sizes_round_trip(tmp_path, size):
    payload = os.urandom(size)
    target = tmp_path / f"f{size}.bin"
    target.write_bytes(payload)

    data, error = await read_binary_file("127.0.0.1", str(target), max_bytes=1_000_000)

    assert error == ""
    assert data == payload


# --- the remote branch -------------------------------------------------------


async def _fake_proc(stdout: bytes, stderr: bytes = b"", returncode: int = 0):
    class _P:
        def __init__(self):
            self.returncode = returncode

        async def communicate(self):
            return stdout, stderr

        def kill(self):  # pragma: no cover - only used by the timeout path
            pass

    return _P()


async def test_remote_read_returns_raw_bytes(monkeypatch):
    """The remote path must capture stdout as BYTES — the text pipeline
    decoded with errors='replace', which corrupts binary."""
    import src.tools.ssh as ssh_module

    payload = bytes(range(256))
    captured: dict = {}

    async def _exec(*args, **kwargs):
        captured["argv"] = args
        return await _fake_proc(payload)

    monkeypatch.setattr(ssh_module.asyncio, "create_subprocess_exec", _exec)
    data, error = await read_binary_file(
        "example.host", "/tmp/f.bin", max_bytes=1_000_000,
        ssh_key_path="/k", known_hosts_path="/kh",
    )
    assert error == "" and data == payload
    argv = captured["argv"]
    assert argv[0] == "ssh"
    # `--` stops option parsing so a path beginning with '-' cannot become a flag.
    assert any("cat -- " in str(a) for a in argv), argv


async def test_remote_oversize_is_rejected(monkeypatch):
    import src.tools.ssh as ssh_module

    async def _exec(*args, **kwargs):
        return await _fake_proc(b"x" * 5000)

    monkeypatch.setattr(ssh_module.asyncio, "create_subprocess_exec", _exec)
    data, error = await read_binary_file(
        "example.host", "/tmp/f.bin", max_bytes=100,
        ssh_key_path="/k", known_hosts_path="/kh",
    )
    assert data is None and "over the" in error


async def test_remote_failure_reports_stderr(monkeypatch):
    import src.tools.ssh as ssh_module

    async def _exec(*args, **kwargs):
        return await _fake_proc(b"", b"cat: /nope: No such file", returncode=1)

    monkeypatch.setattr(ssh_module.asyncio, "create_subprocess_exec", _exec)
    data, error = await read_binary_file(
        "example.host", "/nope", max_bytes=1000,
        ssh_key_path="/k", known_hosts_path="/kh",
    )
    assert data is None and "No such file" in error


async def test_remote_timeout_is_reported(monkeypatch):
    import asyncio as _asyncio

    import src.tools.ssh as ssh_module

    async def _exec(*args, **kwargs):
        class _Hanging:
            returncode = None

            async def communicate(self):  # pragma: no cover - never completes
                await _asyncio.sleep(3600)

            def kill(self):
                pass

        return _Hanging()

    async def _timeout(coro, *args, **kwargs):
        # Close the coroutine we are abandoning, or Python warns that it was
        # never awaited — noise I have flagged in others' work and will not add.
        coro.close()
        raise TimeoutError

    monkeypatch.setattr(ssh_module.asyncio, "create_subprocess_exec", _exec)
    monkeypatch.setattr(ssh_module.asyncio, "wait_for", _timeout)
    data, error = await read_binary_file(
        "example.host", "/tmp/f.bin", max_bytes=1000, timeout=1,
        ssh_key_path="/k", known_hosts_path="/kh",
    )
    assert data is None and "timed out" in error
    assert _asyncio is not None


async def test_remote_ssh_launch_failure(monkeypatch):
    import src.tools.ssh as ssh_module

    async def _exec(*args, **kwargs):
        raise OSError("ssh missing")

    monkeypatch.setattr(ssh_module.asyncio, "create_subprocess_exec", _exec)
    data, error = await read_binary_file(
        "example.host", "/tmp/f.bin", max_bytes=1000,
        ssh_key_path="/k", known_hosts_path="/kh",
    )
    assert data is None and "ssh failed" in error


async def test_file_growing_between_stat_and_read_is_rejected(tmp_path, monkeypatch):
    """The size check and the read are not atomic: a file that grows in between
    must still be rejected rather than returning a partial payload."""
    import src.tools.ssh as ssh_module

    target = tmp_path / "grows.bin"
    target.write_bytes(b"x" * 10)
    monkeypatch.setattr(ssh_module.os.path, "getsize", lambda _p: 10)
    target.write_bytes(b"x" * 500)

    data, error = await read_binary_file("127.0.0.1", str(target), max_bytes=100)

    assert data is None
    assert "exceeds" in error or "over the" in error
