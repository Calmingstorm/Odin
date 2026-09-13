# Real companion status parser regression (2026-09-12)

## Provenance

`companion-status-2026-09-12.json` is the exact saved response from
`/mnt/storage/hyprland-lab/evidence/companion-status.json`, not a hand-written
or reserialized approximation. On 2026-09-12 the repair agent read the entire
file using `read_file(raw=true)` (one source line, `truncated=false`, 675 content
bytes), then added only the framed source content via `apply_patch`.
The metadata envelope was not copied.

- Length: **675 bytes**, including its single final LF.
- Top-level fields: **25**, all distinct.
- SHA-256 of original and committed fixture:
  `8957510daddea885dc5c931f8c28ab8fb82e4ae7a78e3441e58333e61888fd2c`.
- Captured compositor PID: 49244; revision: 19; final field:
  `pointer_popup_depth: 0`. These describe the historical disposable VM capture,
  not the current host or a reusable authorization token.

The test asserts the byte count, final LF, SHA, and distinct field count before
using the original bytes directly as native harness stdin. Only the separate
24-field control tests deserialize and reconstruct modified objects. Those
synthetic controls remove `pointer_popup_depth` or `legacy_endpoint_status`.

## Repair contract and bounds

The baseline is `c0e240f6c66f34b9cff4a8ceeda7f034c3e2c37d`. Its parser **already
tolerates unknown flat scalar fields**. The repair preserves that contract;
there is no new unknown-field relaxation or emitter schema reduction.

The old `char seen[24][64]` accidentally made a duplicate-name index a protocol
field-count limit. The new index stores exact field-name offsets into the
immutable response. A 4096-byte response buffer admits at most 4095 non-NUL
bytes. An empty name and shortest scalar need four bytes (`"":0`); commas and
braces make any n-member object at least `5*n + 1` bytes. Consequently
`floor((4096 - 2)/5) = 818` entries suffice for every admitted response, even
without counting the required LF. This is a byte-derived bound, not a guessed
future schema size. The parser enforces the same byte ceiling independently,
and `scope_exchange` uses the shared buffer constant. Wire LF/NUL framing and
all transport deadlines are otherwise unchanged.

The table occupies 818 * 2 = **1636 bytes**, versus 1536 before: 100 additional
table bytes, plus small scalar locals. No heap allocation, recursion, or
64-byte-per-field stack growth was introduced into production. A static
assertion ensures the response offsets fit uint16_t. Duplicate matching compares
the validated current name bytes and then the prior name's closing quote, so
prefixes are not equal. For safety, every prior name starts before the current
complete validated name: even if a prior name is shorter, reading the current
name's length from that earlier start stays inside the bounded response.
The worst-case number of pair comparisons is bounded by 818*817/2, each comparing
at most 63 bytes; there is no unbounded scan or hash collision assumption.

All existing constraints remain: unescaped ASCII names up to 63 bytes, string
values up to 511 bytes, only boolean/string/unsigned-integer flat values,
uint64 overflow rejection, required boolean `ok`, known boolean types,
keys <=248, buttons <=8, rejected <=UINT64_MAX, sanitized fixed error vocabulary,
duplicate rejection for both known and unknown names, malformed/nested/null/
negative/fraction/exponent/leading-zero refusal, and no trailing wire bytes or
embedded transport NUL. Direct `parse_reply` still accepts a complete JSON
object without LF; production `scope_exchange` requires the LF framing.

## Targeted reproduction

Run from the development worktree using its existing development venv. The
native tests compile extracted shipping C with `cc -std=c11 -Wall -Wextra
-Werror`. No Wayland connection, VM, desktop, input device, or running service
is involved. The exchange fixture replaces only poll/send/recv and freezes
time; it verifies bytes and fragmentation, not elapsed deadline behavior.
Existing release-channel tests separately retain deadline and stream-poisoning
checks.

```sh
.venv/bin/python -m pytest -q tests/test_hyprland_scope_parser_r45.py \
  tests/test_computer_hyprland_packaging_r32.py \
  tests/test_hyprland_release_channel_r41.py
ODIN_GUARDIAN_PARSER_SANITIZE=1 .venv/bin/python -m pytest -q \
  tests/test_hyprland_scope_parser_r45.py
```

Recorded repaired-source results on 2026-09-12: **216 passed in 3.49s** across
the three modules; **139 passed in 7.64s** for the parser module with AddressSanitizer
and UndefinedBehaviorSanitizer. No sanitizer stderr was accepted. The harness
allocates exact input-size-plus-NUL buffers so short malformed/truncated input
cannot hide an overread in a generously sized input array. The truncation test
also rejects all 674 incomplete prefixes of the real fixture.

Baseline reproduction against the unmodified source:

```sh
baseline=$(mktemp /tmp/guardian-parser-baseline-c0e240f6-XXXXXX.c)
git show c0e240f6c66f34b9cff4a8ceeda7f034c3e2c37d:assets/hyprland-input/guardian.c > "$baseline"
ODIN_GUARDIAN_PARSER_SOURCE="$baseline" .venv/bin/python -m pytest -q \
  tests/test_hyprland_scope_parser_r45.py \
  -k 'real_25_field_reply_accepted or historical_24_field_controls or real_fixture_provenance'
```

Recorded result: **4 failed, 3 passed, 132 deselected in 1.99s**, pytest exit 1.
All four failures are the real-response acceptance assertion returning
`{"accepted":false}`: direct parse, one-chunk exchange, one-byte fragments, and
37-byte fragments. Both 24-field controls and fixture integrity pass.
Baseline source SHA-256:
`49953f3bde24bf16736bf15c83c7650b7eb3025edf497bd44b530fc7bafbcfe0`.
This expected red run is regression evidence, not a passing validation run.

The new module additionally exercises >64 valid future scalar fields followed
by every known field, duplicate known/unknown names with first and/or repeated
occurrences after slot 64, empty names, both prefix orders, >500 short unique
members near the wire ceiling, a late duplicate there, exact 4095-byte
acceptance/4096-byte refusal, known numeric boundary pairs and types, error
sanitization/string limits, malformed grammar, nesting/escapes, and transport
framing/NUL rejection. This proves the parser repair, not receiver delivery,
held-input cancellation, or runtime qualification. Those require independent
live evidence and must not be inferred from these unit results.
