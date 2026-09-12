"""Shipping parser/exchange, compiled without devices; see fixture README."""

import hashlib
import json
import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests/fixtures/hyprland-scope/companion-status-2026-09-12.json"
SHA256 = "8957510daddea885dc5c931f8c28ab8fb82e4ae7a78e3441e58333e61888fd2c"
UINT64_MAX = 2**64 - 1


@pytest.fixture(scope="module")
def native_parser(tmp_path_factory):
    directory = tmp_path_factory.mktemp("native-scope-parser-r45")
    source = Path(os.environ.get(
        "ODIN_GUARDIAN_PARSER_SOURCE", ROOT / "assets/hyprland-input/guardian.c"
    )).read_text()
    helpers = source[source.index("struct scope_reply {"):source.index("static bool scope_call(")]
    # Production parser/exchange, replacing only transport system calls.
    harness = r'''
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <poll.h>
#include <sys/socket.h>
struct guardian { int scope_fd; bool begun; uint64_t scope_deadline, lease; };
static uint64_t now_us(void) { return 1000000; }
static const char *wire;
static size_t wire_size, wire_offset, wire_chunk;
static int test_poll(struct pollfd *fd, nfds_t n, int timeout) {
    if (n != 1 || timeout != 2) abort();
    fd->revents = fd->events; return 1;
}
static ssize_t test_send(int fd, const void *data, size_t n, int flags) {
    (void)fd; (void)data; (void)flags; return (ssize_t)n;
}
static ssize_t test_recv(int fd, void *data, size_t n, int flags) {
    (void)fd; (void)flags;
    if (n > wire_size - wire_offset) n = wire_size - wire_offset;
    if (wire_chunk && n > wire_chunk) n = wire_chunk;
    memcpy(data, wire + wire_offset, n); wire_offset += n; return (ssize_t)n;
}
#define poll test_poll
#define send test_send
#define recv test_recv
'''
    harness += helpers
    harness += r'''
int main(int argc, char **argv) {
    if (argc != 3) return 2;
    char input[16384]; size_t size = fread(input, 1, sizeof input, stdin);
    if (ferror(stdin) || size == sizeof input) return 3;
    /* Exact allocation exposes reads past the terminating NUL to ASan. */
    char *text = malloc(size + 1); if (!text) return 4;
    memcpy(text, input, size); text[size] = 0;
    struct scope_reply r = {0}; bool accepted;
    if (!strcmp(argv[1], "parse")) accepted = parse_reply(text, &r);
    else if (!strcmp(argv[1], "wire")) {
        struct guardian g = {.scope_fd = 1};
        wire = text; wire_size = size; wire_chunk = (size_t)strtoul(argv[2], NULL, 10);
        accepted = scope_exchange(&g, "{\"op\":\"status\"}\n", &r);
    } else { free(text); return 5; }
    if (!accepted) puts("{\"accepted\":false}");
    else printf("{\"accepted\":true,\"ok\":%d,\"have_ok\":%d,"
                "\"armed\":%d,\"have_armed\":%d,\"keys\":%llu,\"have_keys\":%d,"
                "\"buttons\":%llu,\"have_buttons\":%d,\"rejected\":%llu,\"have_rejected\":%d,"
                "\"release_acknowledged\":%d,\"release_status_v1\":%d,\"error\":\"%s\"}\n",
                r.ok, r.have_ok, r.armed, r.have_armed, (unsigned long long)r.keys, r.have_keys,
                (unsigned long long)r.buttons, r.have_buttons, (unsigned long long)r.rejected,
                r.have_rejected, r.release_acknowledged, r.release_status_v1,
                r.error ? r.error : "");
    free(text); return 0;
}
'''
    path = directory / "parser.c"
    path.write_text(harness)
    binary = directory / "parser"
    flags = ["-std=c11", "-Wall", "-Wextra", "-Werror"]
    if os.environ.get("ODIN_GUARDIAN_PARSER_SANITIZE") == "1":
        flags += ["-fsanitize=address,undefined", "-fno-omit-frame-pointer", "-g", "-no-pie"]
    subprocess.run(["cc", *flags, str(path), "-o", str(binary)], check=True, timeout=30)

    def run(reply, *, wire=False, chunk=0):
        if isinstance(reply, str):
            reply = reply.encode()
        result = subprocess.run(
            [str(binary), "wire" if wire else "parse", str(chunk)], input=reply,
            capture_output=True, check=True, timeout=5,
        )
        assert not result.stderr, result.stderr.decode(errors="replace")
        return json.loads(result.stdout)

    return run


def object_bytes(fields):
    """Preserve ordered duplicate names and invalid values."""
    return "{" + ",".join(json.dumps(name) + ":" + value for name, value in fields) + "}\n"


def future_fields(n=70):
    values = ["true", "false", "0", str(UINT64_MAX), '"future"']
    return [(f"future{i}", values[i % len(values)]) for i in range(n)]


def test_real_fixture_provenance():
    raw = FIXTURE.read_bytes()
    assert len(raw) == 675 and raw.endswith(b"}\n")
    assert hashlib.sha256(raw).hexdigest() == SHA256
    fields = json.loads(raw, object_pairs_hook=list)
    assert len(fields) == len({name for name, _ in fields}) == 25
    assert fields[-1] == ("pointer_popup_depth", 0)


@pytest.mark.parametrize("wire,chunk", [(False, 0), (True, 0), (True, 1), (True, 37)])
def test_real_25_field_reply_accepted(native_parser, wire, chunk):
    result = native_parser(FIXTURE.read_bytes(), wire=wire, chunk=chunk)
    assert result == {
        "accepted": True, "ok": 1, "have_ok": 1, "armed": 0, "have_armed": 1,
        "keys": 0, "have_keys": 1, "buttons": 0, "have_buttons": 1,
        "rejected": 0, "have_rejected": 1, "release_acknowledged": 1,
        "release_status_v1": 1, "error": "",
    }


@pytest.mark.parametrize("removed", ["pointer_popup_depth", "legacy_endpoint_status"])
def test_historical_24_field_controls(native_parser, removed):
    # Synthetic controls, unlike the real fixture above.
    fields = json.loads(FIXTURE.read_bytes())
    del fields[removed]
    assert len(fields) == 24
    assert native_parser(json.dumps(fields))["accepted"]


@pytest.mark.parametrize("wire", [False, True])
def test_future_scalars_and_known_fields_after_64(native_parser, wire):
    fields = future_fields() + [
        ("ok", "false"), ("armed", "true"), ("keys", "248"), ("buttons", "8"),
        ("rejected", str(UINT64_MAX)), ("release_acknowledged", "true"),
        ("release_status_v1", "false"), ("error", '"human-input-held"'),
    ]
    reply = object_bytes(fields)
    assert len(reply) < 4096 and len(fields) > 64
    result = native_parser(reply, wire=wire)
    assert result == {
        "accepted": True, "ok": 0, "have_ok": 1, "armed": 1, "have_armed": 1,
        "keys": 248, "have_keys": 1, "buttons": 8, "have_buttons": 1,
        "rejected": UINT64_MAX, "have_rejected": 1, "release_acknowledged": 1,
        "release_status_v1": 0, "error": "human-input-held",
    }


@pytest.mark.parametrize("name,value", [
    ("future_duplicate", "true"), ("", "0"), ("x" * 63, '"a"'),
    ("ok", "true"), ("armed", "false"), ("keys", "0"), ("buttons", "0"),
    ("rejected", "0"), ("release_acknowledged", "false"),
    ("release_status_v1", "true"), ("error", '"invalid-json"'),
])
@pytest.mark.parametrize("first_late", [False, True])
def test_duplicates_beyond_24_and_64(native_parser, name, value, first_late):
    prefix = [] if name == "ok" else [("ok", "true")]
    if first_late:
        fields = prefix + future_fields() + [(name, value), (name, value)]
    else:
        fields = prefix + [(name, value)] + future_fields() + [(name, value)]
    reply = object_bytes(fields)
    assert len(reply) < 4096
    assert not native_parser(reply)["accepted"]


def test_duplicate_identity_is_exact_not_prefix_or_value(native_parser):
    fields = future_fields() + [
        ("", "0"), ("a", '"ok"'), ("ab", '"a"'), ("abc", '"ab"'),
        ("okx", "true"), ("ok", "true"), ("x" * 63, "0"), ("x", "0"),
    ]
    assert native_parser(object_bytes(fields))["accepted"]
    assert native_parser(object_bytes(list(reversed(fields))))["accepted"]


@pytest.mark.parametrize("name", ["ok", "armed", "release_acknowledged", "release_status_v1"])
@pytest.mark.parametrize("value", ["0", "1", '"true"', "-1", "null"])
def test_known_booleans_still_require_boolean(native_parser, name, value):
    fields = [] if name == "ok" else [("ok", "true")]
    assert not native_parser(object_bytes(fields + future_fields() + [(name, value)]))["accepted"]


@pytest.mark.parametrize("name,upper", [("keys", 248), ("buttons", 8), ("rejected", UINT64_MAX)])
@pytest.mark.parametrize("kind", [
    "zero", "upper", "overflow", "negative", "string", "boolean", "float", "leading-zero",
])
def test_known_numeric_type_and_bounds(native_parser, name, upper, kind):
    values = {
        "zero": "0", "upper": str(upper), "overflow": str(upper + 1), "negative": "-1",
        "string": '"0"', "boolean": "false", "float": "0.0", "leading-zero": "00",
    }
    fields = [("ok", "true")] + future_fields() + [(name, values[kind])]
    result = native_parser(object_bytes(fields))
    assert result["accepted"] == (kind in {"zero", "upper"})
    if result["accepted"]:
        assert result[name] == (0 if kind == "zero" else upper)
        assert result["have_" + name]


@pytest.mark.parametrize("value,expected", [
    ('"invalid-json"', "invalid-json"), ('"human-input-held"', "human-input-held"),
    ('"peer-prose-not-echoed"', "unrecognized-scope-error"),
    ('"' + 'x' * 511 + '"', "unrecognized-scope-error"),
    ('"' + 'x' * 512 + '"', None), ("-1", None), ("0", None), ("true", None),
])
def test_error_vocabulary_type_and_string_limit(native_parser, value, expected):
    reply = object_bytes([("ok", "false")] + future_fields() + [("error", value)])
    result = native_parser(reply)
    assert result["accepted"] == (expected is not None)
    if expected is not None:
        assert result["error"] == expected and not result["ok"]


@pytest.mark.parametrize("member", [
    '"nested":{}', '"nested":[]', '"nested":{"ok":true}', '"nested":[0]',
    '"escaped\\nname":0', '"escaped":"a\\nb"', '"escaped":"a\\u0041b"',
    '"nonascii":"é"', '"nonasciié":0', '"control":"a\tb"', '"control\n":0',
    '"' + 'x' * 64 + '":0', '"too_long":"' + 'x' * 512 + '"',
    '"null":null', '"negative":-1', '"huge":18446744073709551616',
    '"number":01', '"number":+1', '"number":1.0', '"number":1e3',
    '"bool":True', '"bool":falsehood', '"bool":true0',
])
def test_unknown_fields_keep_scalar_grammar_and_bounds(native_parser, member):
    prefix = object_bytes([("ok", "true")] + future_fields()).rstrip()[:-1]
    assert not native_parser(prefix + "," + member + "}\n")["accepted"]


@pytest.mark.parametrize("reply", [
    "", " ", "{", "{}", '{"ok"', '{"ok":', '{"ok":true', '{"ok":true,}',
    '{"ok" true}', '{"ok":true "a":0}', '{"ok":true,,"a":0}',
    '{"ok":true}garbage', '{"ok":true}\n{"ok":true}\n',
    '[{"ok":true}]', '{ok:true}', '{"ok":true,"unfinished":"',
    '{"ok":true,"unfinished',
])
def test_malformed_and_unframed_replies_refused(native_parser, reply):
    assert not native_parser(reply)["accepted"]


def test_all_truncated_real_fixture_prefixes_refused(native_parser):
    raw = FIXTURE.read_bytes()
    # Full object minus newline is valid parser input, not a truncation.
    for end in range(len(raw) - 1):
        assert not native_parser(raw[:end])["accepted"], end


def test_maximum_short_unique_fields_within_wire(native_parser):
    # Hundreds of members, including prefix-related names, without arbitrary
    # 24/64/256-field caps. Stop at the existing 4095-byte transport limit.
    alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    candidates = [""] + list(alphabet) + [a + b for a in alphabet for b in alphabet]
    fields = [("ok", "true")]
    for name in candidates:
        if name == "ok":
            continue
        trial = object_bytes(fields + [(name, "0")])
        if len(trial) >= 4096:
            break
        fields.append((name, "0"))
    assert len(fields) > 500
    reply = object_bytes(fields)
    assert native_parser(reply, wire=True)["accepted"]
    fields[-1] = fields[-2]
    assert not native_parser(object_bytes(fields), wire=True)["accepted"]


@pytest.mark.parametrize("size,accepted", [
    (4094, True), (4095, True), (4096, False), (8192, False),
])
@pytest.mark.parametrize("wire", [False, True])
def test_response_byte_bound(native_parser, size, accepted, wire):
    base = object_bytes([("ok", "true")] + future_fields())
    reply = base[:-1] + " " * (size - len(base)) + "\n"
    assert len(reply) == size
    assert native_parser(reply, wire=wire)["accepted"] == accepted


@pytest.mark.parametrize("reply", [
    b'{"ok":true}', b'{"ok":true}\x00\n', b'{"ok":true}\ntrailing',
    b'{"ok":true}\n{"ok":true}\n', b'\n{"ok":true}',
])
def test_wire_framing_and_nul_refusal_unchanged(native_parser, reply):
    assert not native_parser(reply, wire=True)["accepted"]
