from __future__ import annotations

import asyncio
import getpass
import shutil
import socket
import subprocess
import tempfile
import time
from pathlib import Path

import pytest

from src.tools.ssh import read_binary_file, run_ssh_command
from src.tools.ssh_options import known_hosts_option
from src.tools.ssh_pool import SSHConnectionPool


def test_ordinary_known_hosts_option_is_unchanged():
    assert known_hosts_option("/tmp/known_hosts") == "UserKnownHostsFile=/tmp/known_hosts"


@pytest.mark.parametrize("path", ["a\nb", "a\rb", "a\x00b"])
def test_known_hosts_option_refuses_line_breaks_and_nul(path):
    with pytest.raises(ValueError, match="NUL or line breaks"):
        known_hosts_option(path)


@pytest.fixture
def private_ssh_server(tmp_path):
    """An owned, non-root sshd on loopback, with disposable test keys only."""
    sshd = shutil.which("sshd") or "/usr/sbin/sshd"
    if not Path(sshd).is_file() or not shutil.which("ssh-keygen") or not shutil.which("ssh"):
        pytest.skip("OpenSSH client/server executables are unavailable")
    for name in ("host", "client"):
        subprocess.run(
            ["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(tmp_path / name)],
            check=True, capture_output=True,
        )
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    config = tmp_path / "sshd_config"
    config.write_text(
        f"Port {port}\nListenAddress 127.0.0.1\n"
        f"HostKey {tmp_path / 'host'}\nPidFile {tmp_path / 'sshd.pid'}\n"
        f"AuthorizedKeysFile {tmp_path / 'client.pub'}\n"
        "UsePAM no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\n"
        "StrictModes no\nLogLevel ERROR\n",
        encoding="utf-8",
    )
    log_path = tmp_path / "sshd.log"
    with log_path.open("wb") as log:
        proc = subprocess.Popen([sshd, "-D", "-e", "-f", str(config)], stdout=log, stderr=log)
        try:
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                if proc.poll() is not None:
                    pytest.fail(f"Private sshd failed: {log_path.read_text()}")
                try:
                    with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                        break
                except OSError:
                    time.sleep(0.02)
            else:
                pytest.fail("Private sshd did not listen")
            yield port, tmp_path / "client", (tmp_path / "host.pub").read_text()
        finally:
            if proc.poll() is None:
                proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)


@pytest.mark.parametrize(
    "name", ["odin data", "odin\tdata", 'odin "data"', "odin\\data", "odin'data"]
)
async def test_real_ssh_uses_exact_one_known_hosts_file(private_ssh_server, tmp_path, name):
    port, private, host_key = private_ssh_server
    directory = tmp_path / name
    directory.mkdir()
    trust = directory / "known_hosts"
    trust.write_text(f"[127.0.0.1]:{port} {host_key}", encoding="utf-8")
    # A real host-key exchange proves which path OpenSSH opened; ssh -G alone
    # cannot distinguish one quoted filename from two unquoted filenames.
    code, output = await run_ssh_command(
        "127.0.0.1", "printf odin-ssh-trust", str(private), str(trust),
        ssh_user=getpass.getuser(), port=port, max_retries=0,
    )
    assert (code, output) == (0, "odin-ssh-trust")
    if name == "odin data":
        broken = await asyncio.create_subprocess_exec(
            "ssh", "-F", "/dev/null", "-i", str(private),
            "-o", f"UserKnownHostsFile={trust}", "-o", "GlobalKnownHostsFile=/dev/null",
            "-o", "StrictHostKeyChecking=yes", "-o", "BatchMode=yes",
            "-p", str(port), f"{getpass.getuser()}@127.0.0.1", "true",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
        )
        broken_output, _ = await asyncio.wait_for(broken.communicate(), 10)
        assert broken.returncode == 255
        assert b"Host key verification failed" in broken_output


async def test_pooled_and_binary_ssh_use_whitespace_trust(
    private_ssh_server, tmp_path, monkeypatch
):
    port, private, host_key = private_ssh_server
    trust_dir = tmp_path / "odin data"
    trust_dir.mkdir()
    trust = trust_dir / "known_hosts"
    trust.write_text(f"[127.0.0.1]:{port} {host_key}", encoding="utf-8")
    user = getpass.getuser()
    # xdist's fixture path is too long for UNIX-domain ControlPath sockets.
    # Keep this owned socket directory short without weakening trust filenames.
    with tempfile.TemporaryDirectory(prefix="odin-kh-") as socket_dir:
        pool = SSHConnectionPool(socket_dir=socket_dir)
        try:
            code, output = await run_ssh_command(
                "127.0.0.1", "printf odin-pooled-trust", str(private), str(trust),
                ssh_user=user, port=port, pool=pool, max_retries=0,
            )
            assert (code, output) == (0, "odin-pooled-trust")
            assert pool.is_connected("127.0.0.1", user)
        finally:
            await pool.close_all()
    sample = tmp_path / "sample.bin"
    sample.write_bytes(b"odin binary trust\x00\xff")
    # Avoid the local-address fast path without connecting anywhere new.
    monkeypatch.setattr("src.tools.ssh.is_local_address", lambda _address: False)
    payload, error = await read_binary_file(
        "127.0.0.1", str(sample), max_bytes=100, ssh_key_path=str(private),
        known_hosts_path=str(trust), ssh_user=user, port=port,
    )
    assert error == ""
    assert payload == sample.read_bytes()
