"""OS-specific validation probes, executed only with local harmless fixtures."""

from __future__ import annotations

import asyncio
import json
import os
import shlex
import shutil
import socket
import subprocess
from pathlib import Path

import pytest

from src.tools.post_validation import Check, _build_command, _evaluate, run_bundle


def _stub(tmp_path: Path, name: str, script: str) -> dict[str, str]:
    binary = tmp_path / name
    binary.write_text("#!/bin/sh\n" + script)
    binary.chmod(0o755)
    return {**os.environ, "PATH": f"{tmp_path}:{os.environ['PATH']}"}


def _fixture_command(command: str, env) -> str:
    # Production intentionally pins Apple's log/perl paths. Linux fixtures
    # translate only the reader to the test-owned executable, never production.
    if env and "/usr/bin/log" in command:
        reader = shutil.which("log", path=env["PATH"])
        assert reader is not None
        argv = shlex.split(command)
        assert argv[:2] == ["sh", "-c"]
        argv[2] = argv[2].replace('/usr/bin/log "$@"', f'{shlex.quote(reader)} "$@"')
        command = shlex.join(argv)
    return command


def _probe(check: Check, host_os: str, env=None):
    proc = subprocess.run(
        ["/bin/sh", "-c", _fixture_command(_build_command(check, host_os), env)],
        text=True,
        capture_output=True,
        env=env,
        timeout=10,
    )
    output = proc.stdout + proc.stderr
    return _evaluate(check, proc.returncode, output, host_os), output


def _log_text(host_os: str, message: str) -> str:
    if host_os == "macos":
        return json.dumps({"eventMessage": message}) + '\n{"count":1,"finished":1}'
    return message


@pytest.mark.parametrize("host_os", ["linux", "", "legacy-platform"])
def test_linux_port_and_service_command_text_is_unchanged(host_os):
    assert _build_command(Check(type="port", target="127.0.0.1:8080"), host_os) == (
        "timeout 20 bash -c 'cat < /dev/null > \"/dev/tcp/$1/$2\"' _ "
        "127.0.0.1 8080 && echo OPEN || echo CLOSED"
    )
    assert _build_command(Check(type="service", target="fixture.service"), host_os) == (
        "systemctl is-active fixture.service 2>/dev/null || true"
    )


def test_macos_port_builder_retains_constant_bash_probe():
    assert _build_command(Check(type="port", target="8080"), "macos") == (
        "perl -e 'alarm shift @ARGV; exec @ARGV' 20 "
        "bash -c 'cat < /dev/null > \"/dev/tcp/$1/$2\"' _ "
        "127.0.0.1 8080 && echo OPEN || echo CLOSED"
    )


@pytest.mark.parametrize(
    "check",
    [
        Check(type="http", target="https://example.test"),
        Check(type="process", target="fixture"),
        Check(type="command", target="printf fixture"),
    ],
)
def test_os_independent_probe_command_text_is_unchanged(check):
    assert _build_command(check, "macos") == _build_command(check, "linux")


@pytest.mark.skipif(not shutil.which("perl"), reason="needs perl")
def test_macos_port_probe_open_and_closed_with_real_local_socket():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
        listener.listen(1)
        check = Check(type="port", target=str(port), timeout_seconds=2)
        assert _probe(check, "macos")[0][0] == "pass"
    assert _probe(check, "macos")[0][0] == "fail"


@pytest.mark.skipif(not shutil.which("perl"), reason="needs perl")
def test_macos_port_alarm_bounds_a_slow_bash_stub(tmp_path):
    env = _stub(tmp_path, "bash", "sleep 3\n")
    result, output = _probe(Check(type="port", target="8080", timeout_seconds=1), "macos", env)
    assert result[0] == "fail"
    assert "CLOSED" in output


@pytest.mark.parametrize(
    "target,domain",
    [
        ("com.example.fixture", "system/com.example.fixture"),
        ("system/com.example.fixture", "system/com.example.fixture"),
        ("gui/501/com.example.fixture", "gui/501/com.example.fixture"),
        ("com.example.fixture notes", "system/com.example.fixture notes"),
    ],
)
def test_macos_launchctl_builder_and_running_state(tmp_path, target, domain):
    args = tmp_path / "launchctl-args"
    env = _stub(
        tmp_path,
        "launchctl",
        f"printf '%s\\n' \"$@\" > {shlex.quote(str(args))}\n"
        "printf 'fixture = {\\n\\tstate = running\\n}\\n'\n",
    )
    check = Check(type="service", target=target)
    assert shlex.split(_build_command(check, "macos"))[-1] == domain
    result, output = _probe(check, "macos", env)
    assert args.read_text().splitlines() == ["print", domain]
    assert result == ("pass", "")
    assert output.strip() == "running"


@pytest.mark.parametrize("target", ["gui/com.example.fixture", "system/", "user/501/fixture"])
def test_macos_invalid_launchd_domain_is_not_a_probe(target):
    assert _build_command(Check(type="service", target=target), "macos") is None


@pytest.mark.parametrize(
    "state,expected,compare,status",
    [
        ("waiting", None, None, "fail"),
        ("waiting", "waiting", None, "pass"),
        ("running", "running", None, "pass"),
        ("running", ["active", "waiting"], "status_in", "pass"),
        ("waiting", ["active"], "status_in", "fail"),
    ],
)
def test_macos_service_expected_states(tmp_path, state, expected, compare, status):
    env = _stub(tmp_path, "launchctl", f"printf '  state = {state}\\n'\n")
    check = Check(type="service", target="fixture", expected=expected, compare=compare)
    assert _probe(check, "macos", env)[0][0] == status


@pytest.mark.parametrize(
    "script", ["echo 'fixture unavailable' >&2\nexit 3\n", "echo 'fixture = {}'\n"]
)
def test_macos_service_query_failure_or_missing_state_is_error(tmp_path, script):
    env = _stub(tmp_path, "launchctl", script)
    result, output = _probe(Check(type="service", target="fixture"), "macos", env)
    assert result[0] == "error"
    assert output.startswith("SERVICE_CHECK_ERROR")


@pytest.mark.parametrize("target", ["fixture", "unit=com.example.fixture:fixture"])
def test_macos_log_builder_scopes_named_units_and_runs_one_query(tmp_path, target):
    args = tmp_path / "log-args"
    env = _stub(
        tmp_path,
        "log",
        f"printf '%s\\n' \"$@\" > {shlex.quote(str(args))}\n"
        f"printf '%s\\n' {shlex.quote(_log_text('macos', 'fixture matched evidence'))}\n",
    )
    check = Check(type="log_present", target=target, window_seconds=45)
    command = _build_command(check, "macos")
    assert "journalctl" not in command
    assert "--style ndjson" in command
    assert "/usr/bin/log " in command
    assert "/usr/bin/perl -MJSON::PP " in command
    result, output = _probe(check, "macos", env)
    expected = ["show", "--last", "45s", "--style", "ndjson"]
    if target.startswith("unit="):
        expected += [
            "--predicate",
            'process == "com.example.fixture" OR subsystem == "com.example.fixture"',
        ]
    assert args.read_text().splitlines() == expected
    assert result == ("pass", "")
    assert output == "fixture matched evidence\nLOG_READ_OK\n"


# Compact fixture copied from the native review, plus its NDJSON equivalent.
# The reader models the producer's requested style, so these assertions also
# run unchanged against the separately extracted pre-fix module.
_COMPACT_HEADER = "Timestamp               Ty Process[PID:TID]"
_COMPACT_ENTRY = (
    "2026-10-14 16:00:37.908 E  sshd-session[17593:8c9d7] "
    "[com.apple.network.libinfo:si_destination_compare] send failed: Invalid argument"
)
_NDJSON_EVENT = {
    "timestamp": "2026-10-14 16:00:37.908-0400",
    "messageType": "Error",
    "processID": 17593,
    "threadID": 576983,
    "processImagePath": "/usr/libexec/sshd-session",
    "subsystem": "com.apple.network.libinfo",
    "category": "si_destination_compare",
    "eventMessage": "send failed: Invalid argument",
}


@pytest.mark.parametrize(
    "populated,pattern,absent",
    [
        (False, ".", True),
        (False, ".*", True),
        (False, "Timestamp", True),
        (False, "Process|PID", True),
        (False, "count|finished", True),
        (True, "^send failed: Invalid argument$", False),
        (True, "sshd-session|17593|8c9d7", True),
        (True, "2026-10-14|com.apple.network.libinfo|si_destination_compare", True),
    ],
)
@pytest.mark.parametrize("ctype", ["log_absent", "log_present"])
def test_macos_log_matches_only_event_message(tmp_path, populated, pattern, absent, ctype):
    args = tmp_path / "query-count"
    compact = _COMPACT_HEADER + ("\n" + _COMPACT_ENTRY if populated else "")
    ndjson = (json.dumps(_NDJSON_EVENT) + "\n" if populated else "") + json.dumps(
        {"count": int(populated), "finished": 1}
    )
    env = _stub(
        tmp_path,
        "log",
        f"echo query >> {shlex.quote(str(args))}\n"
        'case " $* " in\n'
        f"  *\" --style compact \"*) printf '%s\\n' {shlex.quote(compact)};;\n"
        f"  *\" --style ndjson \"*) printf '%s\\n' {shlex.quote(ndjson)};;\n"
        "  *) exit 64;;\nesac\n",
    )
    env["TMPDIR"] = str(tmp_path)
    result, output = _probe(Check(type=ctype, target=f"unit=sshd-session:{pattern}"), "macos", env)
    assert result[0] == ("pass" if absent == (ctype == "log_absent") else "fail")
    assert output == ("" if absent else _NDJSON_EVENT["eventMessage"] + "\n") + "LOG_READ_OK\n"
    assert args.read_text().splitlines() == ["query"]
    assert not list(tmp_path.glob("odin-log-check.*"))


@pytest.mark.parametrize(
    "record",
    [
        "not json",
        "[]",
        "null",
        "{}",
        '{"otherMessage":"fixture"}',
        '{"eventMessage":null}',
        '{"eventMessage":123}',
        '{"eventMessage":true}',
        '{"eventMessage":[]}',
        '{"eventMessage":{}}',
        '{"count":0}',
        '{"count":0,"finished":0}',
        '{"count":-1,"finished":1}',
        '{"count":"0","finished":1}',
        '{"count":0,"finished":"1"}',
    ],
)
@pytest.mark.parametrize("ctype", ["log_absent", "log_present"])
def test_macos_log_invalid_ndjson_never_becomes_evidence(tmp_path, record, ctype):
    # Even a matching message already extracted must not escape a later error.
    data = json.dumps({"eventMessage": "fixture private evidence"}) + "\n" + record
    data += '\n{"count":1,"finished":1}'
    env = _stub(tmp_path, "log", f"printf '%s\\n' {shlex.quote(data)}\n")
    env["TMPDIR"] = str(tmp_path)
    result, output = _probe(Check(type=ctype, target="fixture"), "macos", env)
    assert result[0] == "error"
    assert output == "LOG_CHECK_ERROR invalid log ndjson\n"
    assert not list(tmp_path.glob("odin-log-check.*"))


@pytest.mark.parametrize(
    "data",
    ["", '{"eventMessage":"fixture"}', '{"count":0,"finished":1}\n{"eventMessage":"fixture"}'],
)
def test_macos_log_missing_or_nonfinal_summary_fails_closed(tmp_path, data):
    env = _stub(tmp_path, "log", f"printf '%s' {shlex.quote(data)}\n")
    result, output = _probe(Check(type="log_absent", target="fixture"), "macos", env)
    assert result[0] == "error"
    assert output == "LOG_CHECK_ERROR invalid log ndjson\n"


def test_macos_log_extractor_failure_discards_partial_output(tmp_path):
    # Explicit test-only replacement also proves failed extraction is distinct
    # from valid NDJSON with no matching messages, without a production override.
    env = _stub(tmp_path, "log", 'echo \'{"count":0,"finished":1}\'\n')
    _stub(
        tmp_path, "perl", "echo 'fixture leaked extraction'\necho 'extractor failed' >&2\nexit 71\n"
    )
    env["TMPDIR"] = str(tmp_path)
    check = Check(type="log_absent", target="fixture")
    command = shlex.split(_fixture_command(_build_command(check, "macos"), env))
    command[2] = command[2].replace("/usr/bin/perl", shlex.quote(str(tmp_path / "perl")))
    proc = subprocess.run(command, env=env, text=True, capture_output=True, timeout=10)
    assert _evaluate(check, proc.returncode, proc.stdout + proc.stderr, "macos")[0] == "error"
    assert proc.stdout == "LOG_CHECK_ERROR invalid log ndjson\n"
    assert proc.stderr == ""
    assert not list(tmp_path.glob("odin-log-check.*"))


def test_macos_log_message_file_creation_failure_cleans_query_files(tmp_path):
    env = _stub(tmp_path, "log", 'echo \'{"count":0,"finished":1}\'\n')
    count = tmp_path / "mktemp-count"
    real_mktemp = shutil.which("mktemp")
    env = _stub(
        tmp_path,
        "mktemp",
        f"echo call >> {shlex.quote(str(count))}\n"
        f'if [ "$(wc -l < {shlex.quote(str(count))})" -eq 3 ]; then exit 1; fi\n'
        f'exec {shlex.quote(real_mktemp)} "$@"\n',
    )
    env["TMPDIR"] = str(tmp_path)
    result, output = _probe(Check(type="log_absent", target="fixture"), "macos", env)
    assert result[0] == "error"
    assert output == "LOG_CHECK_ERROR could not create private message file\n"
    assert len(count.read_text().splitlines()) == 3
    assert not list(tmp_path.glob("odin-log-check.*"))


def test_macos_log_unicode_multiline_messages_and_invocation_filter(tmp_path):
    invocation = (
        "2026-10-14 16:00:37,908 [INFO] odin.discord: Tool call: validate_action({"
        '"target":"fixture private invocation"})'
    )
    message = "fixture café\nfixture second line"
    data = "\n".join(json.dumps({"eventMessage": value}) for value in [invocation, message])
    data += '\n{"count":2,"finished":1}'
    env = _stub(tmp_path, "log", f"printf '%s\\n' {shlex.quote(data)}\n")
    result, output = _probe(Check(type="log_present", target="fixture"), "macos", env)
    assert result == ("pass", "")
    assert output == message + "\nLOG_READ_OK\n"


def test_macos_log_predicate_literal_is_json_escaped():
    unit = 'fixture "notes" \\ sample'
    command = _build_command(Check(type="log_absent", target=f"unit={unit}:fixture"), "macos")
    literal = json.dumps(unit, ensure_ascii=False)
    assert shlex.split(command)[-3] == f"process == {literal} OR subsystem == {literal}"


@pytest.mark.parametrize("host_os,reader", [("linux", "journalctl"), ("macos", "log")])
@pytest.mark.parametrize("ctype", ["log_absent", "log_present"])
def test_failed_log_data_query_never_reports_success(tmp_path, host_os, reader, ctype):
    # Reproduce #656: the old -n 1 visibility query succeeded, while the
    # evidence-producing query failed. The fixed probe calls only the latter.
    args = tmp_path / "query-count"
    private = tmp_path / "private-check"
    env = _stub(
        tmp_path,
        reader,
        f"printf 'query\\n' >> {shlex.quote(str(args))}\n"
        'case " $* " in *" -n 1 "*) exit 0;; esac\n'
        f"find {shlex.quote(str(tmp_path))} -name 'odin-log-check.*' -perm 600 "
        f"> {shlex.quote(str(private))}\n"
        "echo 'fixture partial output'\n"
        "printf 'fixture data query failed: %0300d\\n' 0 >&2\n"
        "exit 73\n",
    )
    env["TMPDIR"] = str(tmp_path)
    result, output = _probe(Check(type=ctype, target="fixture"), host_os, env)
    assert result[0] == "error"
    assert args.read_text().splitlines() == ["query"]
    assert output.startswith(f"LOG_CHECK_ERROR {reader} exit 73\n")
    assert len(output.splitlines()[1]) <= 200
    assert "LOG_READ_OK" not in output
    assert "LOG_READ_PARTIAL" not in output
    assert len(private.read_text().splitlines()) == 2
    assert not list(tmp_path.glob("odin-log-check.*"))


@pytest.mark.parametrize("host_os,reader", [("linux", "journalctl"), ("macos", "log")])
def test_successful_query_private_file_is_removed_and_empty_absence_passes(
    tmp_path,
    host_os,
    reader,
):
    args = tmp_path / "query-count"
    summary = '{"count":0,"finished":1}' if host_os == "macos" else ""
    env = _stub(
        tmp_path,
        reader,
        f"echo query >> {shlex.quote(str(args))}\nprintf '%s' {shlex.quote(summary)}\n",
    )
    env["TMPDIR"] = str(tmp_path)
    assert _probe(Check(type="log_absent", target="fixture"), host_os, env)[0][0] == "pass"
    assert args.read_text().splitlines() == ["query"]
    assert not list(tmp_path.glob("odin-log-check.*"))


@pytest.mark.parametrize("host_os,reader", [("linux", "journalctl"), ("macos", "log")])
def test_invalid_regex_does_not_query_logs(tmp_path, host_os, reader):
    args = tmp_path / "query-count"
    env = _stub(tmp_path, reader, f"echo query >> {shlex.quote(str(args))}\n")
    assert _probe(Check(type="log_absent", target="fixture("), host_os, env)[0][0] == "error"
    assert not args.exists()


@pytest.mark.parametrize("host_os,reader", [("linux", "journalctl"), ("macos", "log")])
def test_private_file_creation_failure_does_not_query_logs(tmp_path, host_os, reader):
    args = tmp_path / "query-count"
    env = _stub(tmp_path, reader, f"echo query >> {shlex.quote(str(args))}\n")
    env["TMPDIR"] = str(tmp_path / "missing-directory")
    result, output = _probe(Check(type="log_absent", target="fixture"), host_os, env)
    assert result[0] == "error"
    assert "LOG_CHECK_ERROR could not create private log file" in output
    assert "LOG_READ_OK" not in output
    assert not args.exists()


@pytest.mark.parametrize("host_os,reader", [("linux", "journalctl"), ("macos", "log")])
@pytest.mark.parametrize(
    "notice",
    ["No journal files were found", "insufficient permissions", "not seeing messages from"],
)
def test_real_log_text_is_not_classified_as_a_visibility_warning(tmp_path, host_os, reader, notice):
    env = _stub(tmp_path, reader, f"printf '%s\\n' {shlex.quote(_log_text(host_os, notice))}\n")
    result, output = _probe(Check(type="log_absent", target="missing fixture"), host_os, env)
    assert result[0] == "pass"
    assert output == "LOG_READ_OK\n"


@pytest.mark.parametrize("host_os,reader", [("linux", "journalctl"), ("macos", "log")])
def test_reader_diagnostics_are_not_matched_evidence(tmp_path, host_os, reader):
    summary = '{"count":0,"finished":1}' if host_os == "macos" else ""
    env = _stub(
        tmp_path,
        reader,
        f"printf '%s' {shlex.quote(summary)}\necho 'fixture warning' >&2\n",
    )
    result, output = _probe(Check(type="log_present", target="fixture"), host_os, env)
    assert result[0] == "fail"
    assert output == "LOG_READ_OK\n"


async def test_bundle_uses_each_resolved_target_os(tmp_path):
    env = _stub(tmp_path, "launchctl", "printf '  state = running\\n'\n")
    _stub(tmp_path, "systemctl", "echo active\n")
    _stub(
        tmp_path, "log", f"printf '%s\\n' {shlex.quote(_log_text('macos', 'fixture evidence'))}\n"
    )
    _stub(tmp_path, "journalctl", "echo 'fixture evidence'\n")
    seen = {}

    async def execute(address, command, ssh_user, **kwargs):
        seen.setdefault(address, []).append(command)
        proc = await asyncio.create_subprocess_exec(
            "/bin/sh",
            "-c",
            _fixture_command(command, env),
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        output, _ = await proc.communicate()
        return proc.returncode, output.decode()

    report = await run_bundle(
        [
            {"type": "service", "target": "fixture"},
            {"type": "service", "target": "fixture", "host": "linux-fixture"},
            {"type": "log_present", "target": "fixture"},
            {"type": "log_present", "target": "fixture", "host": "linux-fixture"},
        ],
        bundle_name="host-os-fixture",
        default_host="mac-fixture",
        resolve_host=lambda alias: (
            alias,
            "fixture",
            "macos" if alias == "mac-fixture" else "linux",
        ),
        exec_command=execute,
    )
    assert report.verdict == "pass"
    assert [check.observed for check in report.checks] == [
        "running",
        "active",
        "fixture evidence",
        "fixture evidence",
    ]
    assert any("launchctl" in command for command in seen["mac-fixture"])
    assert any("systemctl" in command for command in seen["linux-fixture"])
    assert any("reader=log;" in command for command in seen["mac-fixture"])
    assert any("reader=journalctl;" in command for command in seen["linux-fixture"])
