"""Wire-level regressions for HTTP and health probes; all servers are loopback fixtures."""

from __future__ import annotations

import asyncio
import os
import secrets
import shlex
import shutil
import socket
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from src.tools.http_probe_ops import MAX_BODY_SIZE, build_http_probe_command
from src.tools.post_validation import Check, _build_command, _evaluate, run_bundle
from src.tools.risk_classifier import CommandGovernor


@pytest.fixture
def http_server():
    requests = []

    class Handler(BaseHTTPRequestHandler):
        def _receive(self):
            length = int(self.headers.get("Content-Length") or 0)
            requests.append((self.command, self.rfile.read(length)))
            self.send_response(200)
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_POST(self):  # noqa: N802 - stdlib handler contract
            self._receive()

        def do_PUT(self):  # noqa: N802 - stdlib handler contract
            self._receive()

        def do_PATCH(self):  # noqa: N802 - stdlib handler contract
            self._receive()

        def do_GET(self):  # noqa: N802 - stdlib handler contract
            if self.path == "/redirect":
                self.send_response(302)
                self.send_header("Location", "/404")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            if self.path == "/stall":
                self.send_response(404)
                self.send_header("Content-Length", "1024")
                self.end_headers()
                self.wfile.write(b"x")
                self.wfile.flush()
                time.sleep(2)
                return
            code = int(self.path.strip("/"))
            self.send_response(code)
            self.send_header("Content-Length", "0")
            self.end_headers()

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}", requests
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


@pytest.mark.skipif(not shutil.which("curl"), reason="needs curl")
@pytest.mark.parametrize("method", ["POST", "PUT", "PATCH"])
@pytest.mark.parametrize("kind", ["file", "missing", "stdin", "mention", "bare", "oversized"])
def test_at_leading_body_sent_literally(http_server, tmp_path, method, kind):
    url, received = http_server
    file = tmp_path / "data.txt"
    file.write_bytes(b"private fixture contents\n")
    huge = tmp_path / "huge.txt"
    huge.write_bytes(b"x" * (MAX_BODY_SIZE * 4))
    body = {
        "file": f"@{file}",
        "missing": f"@{tmp_path / 'missing'}",
        "stdin": "@-",
        "mention": "@here deploy done",
        "bare": "@",
        "oversized": f"@{huge}",
    }[kind]
    command = build_http_probe_command({"url": url, "method": method, "body": body})
    subprocess.run(
        ["/bin/sh", "-c", command],
        stdin=subprocess.DEVNULL,
        capture_output=True,
        check=True,
        timeout=15,
    )
    assert received == [(method, body.encode())]


@pytest.mark.skipif(not shutil.which("curl"), reason="needs curl")
@pytest.mark.parametrize(
    "body",
    ["line1\nline2\n", "héllo ✓", "a=b@c", "x" * MAX_BODY_SIZE],
    ids=["multiline", "utf8", "inner-at", "at-limit"],
)
def test_other_probe_bodies_unchanged(http_server, body):
    url, received = http_server
    command = build_http_probe_command({"url": url, "method": "POST", "body": body})
    assert "-d" in shlex.split(command)
    subprocess.run(["/bin/sh", "-c", command], capture_output=True, check=True, timeout=15)
    assert received == [("POST", body.encode())]


def test_header_file_interpretation_rejected():
    with pytest.raises(ValueError, match="header name"):
        build_http_probe_command({"url": "https://example.test", "headers": {"@/tmp/a": "v"}})


def test_fixed_shape_process_and_log_probes_keep_governor_approval():
    governor = CommandGovernor()
    for check in (
        Check(type="process", target="fixture"),
        Check(type="process", target="-fixture"),
        Check(type="log_absent", target="unit=fixture.service:ERROR"),
        Check(type="log_present", target="-fixture"),
    ):
        assert governor.check(_build_command(check)).allowed


def _shell_check(check: Check, *, env=None):
    proc = subprocess.run(
        ["/bin/sh", "-c", _build_command(check)],
        capture_output=True,
        text=True,
        env=env,
        timeout=15,
    )
    return _evaluate(check, proc.returncode, proc.stdout + proc.stderr)


@pytest.mark.skipif(not shutil.which("pgrep"), reason="needs pgrep")
def test_absent_process_is_not_its_own_probe():
    token = "odin-absent-" + secrets.token_hex(12)
    assert _shell_check(Check(type="process", target=token))[0] == "fail"


@pytest.mark.skipif(not shutil.which("pgrep"), reason="needs pgrep")
def test_running_process_and_bad_pattern(tmp_path):
    token = str(secrets.randbelow(10**12)).zfill(12)
    fixture = subprocess.Popen(["sleep", f"30.{token}"], stdin=subprocess.DEVNULL)
    try:
        assert _shell_check(Check(type="process", target=token))[0] == "pass"
    finally:
        fixture.kill()
        fixture.wait()
    assert _shell_check(Check(type="process", target="odin("))[0] == "error"
    for name in ("sh", "grep"):
        (tmp_path / name).symlink_to(shutil.which(name))
    assert (
        _shell_check(Check(type="process", target=token), env={"PATH": str(tmp_path)})[0] == "error"
    )


@pytest.mark.skipif(not shutil.which("pgrep"), reason="needs pgrep")
def test_process_pattern_cannot_escape_the_shell(tmp_path):
    marker = tmp_path / "executed"
    check = Check(type="process", target=f"x'; touch {marker}; echo 'odin-absent")
    assert _shell_check(check)[0] == "fail"
    assert not marker.exists()


@pytest.mark.skipif(not shutil.which("pgrep"), reason="needs pgrep")
def test_matching_ancestor_remains_visible():
    token = "odin-ancestor-" + secrets.token_hex(10)
    check = Check(type="process", target=token)
    # The command is in the environment, not the ancestor's argv.
    runner = (
        "import os, subprocess; "
        "proc = subprocess.run(['/bin/sh', '-c', os.environ['ODIN_CHECK_CMD']], "
        "capture_output=True, text=True); print(proc.stdout + proc.stderr)"
    )
    proc = subprocess.run(
        [sys.executable, "-c", runner, token],
        env={**os.environ, "ODIN_CHECK_CMD": _build_command(check)},
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert _evaluate(check, proc.returncode, proc.stdout)[0] == "pass"


@pytest.mark.skipif(not shutil.which("pgrep"), reason="needs pgrep")
async def test_sibling_cannot_make_absent_process_pass():
    token = "odin-absent-" + secrets.token_hex(12)

    async def exec_real(
        addr, command, user, *, timeout, use_workspace=False, use_command_shell=False,
    ):
        proc = await asyncio.create_subprocess_exec(
            "/bin/sh",
            "-c",
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        output, _ = await proc.communicate()
        return proc.returncode, output.decode()

    report = await run_bundle(
        [
            {"type": "command", "target": f"sleep 1; echo {token}"},
            {"type": "process", "target": token},
        ],
        bundle_name="fixture",
        default_host="localhost",
        resolve_host=lambda _: ("127.0.0.1", "fixture", "linux"),
        exec_command=exec_real,
    )
    assert [c.status for c in report.checks] == ["pass", "fail"]


async def test_process_checks_run_separately_from_other_checks():
    inflight = {"process": 0, "other": 0}
    overlaps = []

    async def fake_exec(
        addr, command, user, *, timeout, use_workspace=False, use_command_shell=False,
    ):
        kind = "process" if "pgrep" in command else "other"
        other = "other" if kind == "process" else "process"
        inflight[kind] += 1
        if inflight[other]:
            overlaps.append(kind)
        await asyncio.sleep(0.02)
        inflight[kind] -= 1
        return 0, "PRESENT" if kind == "process" else "200"

    report = await run_bundle(
        [
            {"type": "http", "target": "https://fixture.test/a"},
            {"type": "process", "target": "fixture"},
            {"type": "http", "target": "https://fixture.test/b"},
        ],
        bundle_name="fixture",
        default_host="localhost",
        resolve_host=lambda _: ("127.0.0.1", "fixture", "linux"),
        exec_command=fake_exec,
    )
    assert overlaps == []
    assert [c.type for c in report.checks] == ["http", "process", "http"]
    assert report.verdict == "pass"


@pytest.mark.parametrize(
    "output,status",
    [
        ("PRESENT", "pass"),
        ("ABSENT", "fail"),
        ("PROCESS_CHECK_ERROR pgrep exit 2\nABSENT", "error"),
        ("ssh: connection refused", "error"),
        ("", "error"),
    ],
)
def test_process_requires_exact_result_line(output, status):
    assert _evaluate(Check(type="process", target="nginx"), 0, output)[0] == status


def _fake_journal(tmp_path, *, notice="", body="", code=0):
    binary = tmp_path / "journalctl"
    binary.write_text(
        "#!/bin/sh\n"
        'case " $* " in *" -q "*) q=1;; *) q=;; esac\n'
        f"[ -n \"$q\" ] || printf '%s\\n' {shlex.quote(notice)} >&2\n"
        f"[ -n \"$q\" ] || [ -n {shlex.quote(body)} ] || echo '-- No entries --'\n"
        f"[ -z {shlex.quote(body)} ] || printf '%s\\n' {shlex.quote(body)}\n"
        f"exit {code}\n"
    )
    binary.chmod(0o755)
    return {**os.environ, "PATH": f"{tmp_path}:{os.environ['PATH']}"}


@pytest.mark.parametrize("target", ["unit=fixture.service:FIXTUREERROR", "FIXTUREERROR"])
@pytest.mark.parametrize("ctype", ["log_absent", "log_present"])
@pytest.mark.parametrize(
    "notice,code",
    [
        ("no journal access", 73),
        ("No journal files were opened due to insufficient permissions.", 1),
        ("Hint: You are currently not seeing messages from other users and the system.", 0),
        ("No journal files were found.", 0),
    ],
)
def test_unread_journal_is_error(tmp_path, target, ctype, notice, code):
    env = _fake_journal(tmp_path, notice=notice, code=code)
    assert _shell_check(Check(type=ctype, target=target), env=env)[0] == "error"


def test_invalid_log_pattern_and_journal_metadata(tmp_path):
    env = _fake_journal(tmp_path, body="fixture: FIXTUREERROR")
    for ctype in ("log_absent", "log_present"):
        assert _shell_check(Check(type=ctype, target="FIXTURE(ERROR"), env=env)[0] == "error"
    (tmp_path / "journalctl").unlink()
    empty_env = _fake_journal(tmp_path)
    assert _shell_check(Check(type="log_present", target="entries"), env=empty_env)[0] == "fail"
    assert _shell_check(Check(type="log_absent", target="entries"), env=empty_env)[0] == "pass"


def test_missing_journalctl_is_error(tmp_path):
    for tool in ("sh", "grep", "head", "tail"):
        (tmp_path / tool).symlink_to(shutil.which(tool))
    for ctype in ("log_absent", "log_present"):
        assert (
            _shell_check(Check(type=ctype, target="fixture"), env={"PATH": str(tmp_path)})[0]
            == "error"
        )


def test_partial_visibility_keeps_positive_evidence_but_never_proves_absence(tmp_path):
    notice = "Hint: You are currently not seeing messages from other users and the system."
    env = _fake_journal(tmp_path, notice=notice, body="fixture: FIXTUREERROR")
    assert _shell_check(Check(type="log_present", target="FIXTUREERROR"), env=env)[0] == "pass"
    assert _shell_check(Check(type="log_absent", target="FIXTUREERROR"), env=env)[0] == "fail"
    assert _shell_check(Check(type="log_absent", target="MISSING"), env=env)[0] == "error"


async def test_log_observed_text_contains_only_matched_lines(tmp_path):
    env = _fake_journal(tmp_path, body="fixture: FIXTUREERROR")

    async def exec_real(
        addr, command, user, *, timeout, use_workspace=False, use_command_shell=False,
    ):
        proc = await asyncio.create_subprocess_exec(
            "/bin/sh",
            "-c",
            command,
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        output, _ = await proc.communicate()
        return proc.returncode, output.decode()

    report = await run_bundle(
        [{"type": "log_absent", "target": "FIXTUREERROR"}],
        bundle_name="fixture",
        default_host="localhost",
        resolve_host=lambda _: ("127.0.0.1", "fixture", "linux"),
        exec_command=exec_real,
    )
    assert report.checks[0].status == "fail"
    assert report.checks[0].observed == "fixture: FIXTUREERROR"


@pytest.mark.parametrize("ctype,expected", [("log_absent", "fail"), ("log_present", "pass")])
def test_readable_journal_still_matches(tmp_path, ctype, expected):
    env = _fake_journal(tmp_path, body="fixture: FIXTUREERROR")
    assert _shell_check(Check(type=ctype, target="FIXTUREERROR"), env=env)[0] == expected


@pytest.mark.parametrize("unit", ["", "unit=odin:"])
@pytest.mark.parametrize("pattern", ["BATTERY-NONEXISTENT-9f2c", "Startup diagnostics"])
def test_log_probe_ignores_own_invocation_for_absent_and_present(tmp_path, unit, pattern):
    # Actual journalctl -u odin -q -o cat output uses comma milliseconds:
    # 2026-09-27 23:21:56,515 [INFO] odin.discord: Tool call: validate_action({'checks': ...
    # Without filtering, it proves presence and disproves absence.
    invocation = (
        "2026-09-27 23:21:56,515 [INFO] odin.discord: "
        "Tool call: validate_action({'checks': [{'type': 'log_absent', "
        f"'target': 'unit=odin:{pattern}'}}]}})"
    )
    env = _fake_journal(tmp_path, body=invocation)
    assert _shell_check(Check(type="log_absent", target=f"{unit}{pattern}"), env=env)[0] == "pass"
    assert _shell_check(Check(type="log_present", target=f"{unit}{pattern}"), env=env)[0] == "fail"


@pytest.mark.parametrize("unit", ["", "unit=odin:"])
def test_log_probe_preserves_genuine_messages_even_with_invocation_text(tmp_path, unit):
    invocation = (
        "2026-09-28 12:00:00 [INFO] odin.discord: "
        "Tool call: validate_action({'target': 'unit=odin:Startup diagnostics'})"
    )
    real_message = "2026-09-28 12:00:01 [INFO] odin.discord: Startup diagnostics completed"
    quoted_message = (
        "2026-09-28 12:00:02 [INFO] odin.service: "
        "User wrote Tool call: validate_action(Startup diagnostics)"
    )
    env = _fake_journal(tmp_path, body="\n".join((invocation, real_message, quoted_message)))
    check = Check(type="log_present", target=f"{unit}Startup diagnostics")
    assert _shell_check(check, env=env)[0] == "pass"
    check = Check(type="log_absent", target=f"{unit}Startup diagnostics")
    assert _shell_check(check, env=env)[0] == "fail"

    # Quoting the invocation is still a real log message, not an Odin call.
    env = _fake_journal(tmp_path, body=quoted_message)
    assert _shell_check(check, env=env)[0] == "fail"


def test_log_probe_filters_before_limiting_matches(tmp_path):
    invocations = "\n".join(
        "2026-09-28 12:00:00,123 [INFO] odin.discord: "
        f"Tool call: validate_action({{'target': 'unit=odin:Startup diagnostics', "
        f"'attempt': {i}}})"
        for i in range(25)
    )
    env = _fake_journal(tmp_path, body=f"{invocations}\nStartup diagnostics completed")
    check = Check(type="log_present", target="Startup diagnostics")
    assert _shell_check(check, env=env)[0] == "pass"
    check = Check(type="log_absent", target="Startup diagnostics")
    assert _shell_check(check, env=env)[0] == "fail"


@pytest.mark.parametrize(
    "ctype,output,expected",
    [
        ("log_absent", "", "error"),
        ("log_present", "", "error"),
        ("log_absent", "LOG_READ_OK", "pass"),
        ("log_present", "LOG_READ_OK", "fail"),
        ("log_absent", "LOG_READ_PARTIAL", "error"),
        ("log_present", "match\nLOG_READ_PARTIAL", "pass"),
        ("log_absent", "LOG_CHECK_ERROR journalctl exit 1\nLOG_READ_OK", "error"),
    ],
)
def test_log_requires_visibility_sentinel(ctype, output, expected):
    assert _evaluate(Check(type=ctype, target="match"), 0, output)[0] == expected


@pytest.mark.skipif(not shutil.which("curl"), reason="needs curl")
@pytest.mark.parametrize(
    "path,expected",
    [
        ("404", 404),
        ("404", [404, 410]),
        ("500", 500),
        ("503", [503]),
        ("redirect", 404),
    ],
)
def test_expected_http_errors_pass(http_server, path, expected):
    url, _ = http_server
    assert _shell_check(Check(type="http", target=f"{url}/{path}", expected=expected))[0] == "pass"


@pytest.mark.skipif(not shutil.which("curl"), reason="needs curl")
def test_http_equals_error_status_and_default_success(http_server):
    url, _ = http_server
    assert (
        _shell_check(Check(type="http", target=f"{url}/404", expected=404, compare="equals"))[0]
        == "pass"
    )
    assert _shell_check(Check(type="http", target=f"{url}/200"))[0] == "pass"


@pytest.mark.skipif(not shutil.which("curl"), reason="needs curl")
@pytest.mark.parametrize("code", [404, 500])
def test_unexpected_http_error_still_fails_with_code(http_server, code):
    url, _ = http_server
    status, detail = _shell_check(Check(type="http", target=f"{url}/{code}"))
    assert status == "fail" and detail.endswith(f"got {code}")


@pytest.mark.skipif(not shutil.which("curl"), reason="needs curl")
def test_http_transport_failure_after_headers_never_passes(http_server):
    url, _ = http_server
    status, detail = _shell_check(
        Check(type="http", target=f"{url}/stall", expected=404, timeout_seconds=1)
    )
    assert status == "fail" and detail.startswith("curl failed (exit 28)")


@pytest.mark.skipif(not shutil.which("curl"), reason="needs curl")
def test_http_connection_refused_never_passes():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    status, detail = _shell_check(
        Check(type="http", target=f"http://127.0.0.1:{port}/", expected=404)
    )
    assert status == "fail" and detail.startswith("curl failed (exit 7)")


@pytest.mark.parametrize(
    "output,status",
    [
        ("404", "pass"),
        ("FAILED_28", "fail"),
        ("curl: (7) refused\n000FAILED_7", "fail"),
        ("curl: (28) timeout\n404FAILED_28", "fail"),
    ],
)
def test_http_failure_marker_wins_over_received_code(output, status):
    got, detail = _evaluate(Check(type="http", target="fixture", expected=404), 0, output)
    assert got == status
    if "FAILED_" in output:
        assert detail.startswith("curl failed (exit ")
