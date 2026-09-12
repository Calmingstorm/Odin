# Guardian parser repair and isolated re-qualification

Authorized narrow repair on `feat/onboarding-wayland-autonomy`, pulled clean at
`c0e240f6c66f34b9cff4a8ceeda7f034c3e2c37d` on 2026-09-12. No deployment, master
merge, new PR, full suite or hosted gate was requested or performed.

## Repair and regression evidence

Only production change: `assets/hyprland-input/guardian.c`. The historical
24-entry duplicate-name table accidentally limited replies to 24 fields. The
campaign emitter now sends 25. Unknown flat scalar fields were already tolerated;
the repair preserves that policy rather than deleting emitter diagnostics or
introducing strict unknown-field rejection.

Duplicate tracking now stores uint16 offsets into the bounded immutable reply.
Its 818-entry capacity is derived from the unchanged 4096-byte response buffer:
even empty names and shortest scalars require at least `5*n + 1` bytes for an
n-member object. Every object fitting the wire fits the index. Table storage
increases by only 100 bytes, with no production allocation or recursion. The
parser also enforces the shared byte bound directly. Known-field typing, required
fields, scalar grammar, overflow/range checks, sanitized errors, framing,
authentication, leases, input-scope checks and cleanup predicates are unchanged.

The committed fixture is the exact original 675-byte, 25-field saved response,
not reconstructed JSON. Original-versus-fixture `cmp` passed; SHA256:
`8957510daddea885dc5c931f8c28ab8fb82e4ae7a78e3441e58333e61888fd2c`.
See `tests/fixtures/hyprland-scope/README.md` for provenance, proof of bounds and
reproduction commands.

Final targeted run, development worktree only: **237 passed in 6.97s**, no skips:

| Module under `tests/` | Passed |
| --- | ---: |
| `test_hyprland_scope_parser_r45.py` | 139 |
| `test_computer_hyprland_packaging_r32.py` | 12 |
| `test_hyprland_release_channel_r41.py` | 65 |
| `test_hyprland_input_wire_r32.py` | 12 |
| `test_hyprland_input_loss_campaign.py` | 7 |
| `test_hyprland_scope_deadline_r32.py` | 1 |
| `test_hyprland_input_held_r38.py` | 1 |

Native wire tests used the rebuilt guardian, not skipped optional binary fixtures.
The new parser module additionally passed **139 tests in 7.63s with ASan/UBSan**.
It tests real bytes through direct parse and whole/one-byte/37-byte exchanges,
late known/unknown duplicates, >64 future fields, >500 short unique fields,
malformed inputs, all 674 incomplete original prefixes, and exact byte limits.

The same tests against unmodified `c0e240f` produce the expected **four failures**
for real-response acceptance and **three passes** for provenance/two 24-field
controls. The exit code is 1, deliberately retained as red regression evidence.

An initial native-wire run had seven setup errors because one existing module
hardcodes `/tmp/odin-hyprland-native-loss-final/odin-hyprland-input` instead of
using the binary environment variable. Building the same source at that required
scratch location resolved setup without changing that test. The final run above
is separately recorded. Independent read-only review found no parser blocker.

## Real VM result: parser repaired, runtime still not qualified

Resumed the existing KVM guest with six vCPUs, 8 GiB RAM and plain software-backed
virtio-vga. Unchanged pinned Hyprland 0.55.2 and plugin, not a rebuilt tuple.
The guardian-only shipping build passed `-Werror`; the old binary was preserved.

Guardian source SHA256 used in both host and guest builds:
`2db8b7a1229558e7c8324c141474ee1b736f8b0f8c02e31def3f346779c6688f`.
Patched guest guardian SHA256:
`2998835b29607c7ef914f05268b5c728c473a9af0929872548e41159c66ddae7`.
Unchanged plugin SHA256:
`c7889865e9dd6554755147a1d616bc43938941f48384176d05920afa63f9c1dc`.

The old guardian control reproduced the original failure before ready/input,
with zero queued/submitted events. The patched guardian reached **ready, begun,
and three input events submitted**. Identity selection/focus and bracketed
1280x800 ODINSC01 capture passed in both runs.

The first positive click nevertheless failed. The native terminal was `closed`,
reason `scope-evidence-expired`, not `action_done`. Release was submitted and
acknowledged, but the receiver recorded **no pointer-button down/up pair**.
Companion counters changed from accepted=0/rejected=0 to accepted=1/rejected=3.
The corpus exited 2 and stopped without retry. Stale-snapshot refusal and held
SIGTERM cancellation were **not reached**. **`runtime_qualified` stays false.**

The rejected-counter delta itself triggers `scope-evidence-expired` in the
guardian, which is then classified as `scope_timeout`. That label does not prove
wall-clock expiry. The first rejecting guard is not identified by this evidence;
a pointer positioning/focus refusal remains a hypothesis. Later receiver teardown
overwrites status reason. The normal receiver exit is not evidence of a receiver
crash because harness cleanup intentionally stops it.

The harness's "positive release unconfirmed" label is conservative but does not
distinguish a native cleanup ACK from receiver release proof. Its stop was not
bypassed. Future corpus work should also require a matching cancellation cause
for SIGTERM, and a receiver-drain barrier for stale no-event assertions; those
cases were not reached here and were not changed. These are adjacent findings,
not repairs included in this change.

## Cleanup and boundaries

The guest compositor stopped gracefully and guest powered off at approximately
17:34 UTC, well before the 19:03 operational cutoff. No VM, guest compositor,
guardian or receiver remains running; loopback SSH port 22226 is closed. Offline
`qemu-img check` passed. Lab disk/artifacts remain under
`/mnt/storage/hyprland-lab/`, approximately 4.5 GiB allocated.

QEMU used a closed device policy, only KVM access, hidden host DRM/input paths,
no host graphics/display sockets, no display backend, no passthrough and no host
network/module changes. Aaron's same active seat0/tty7/:0 session remained intact.
No desktop connection/input, Incus mutation, `/opt/odin` access/change, deploy,
Odin restart or host reboot occurred. Ordinary CPU/RAM/I/O contention is not
claimed impossible.

Full report: `/mnt/storage/hyprland-lab/PARSER-REPAIR-REPORT.md`.
Raw logs, XML results, source/binary hashes, control/patched native and receiver
logs, host isolation and cleanup evidence:
`/mnt/storage/hyprland-lab/evidence/parser-repair-20260912/`.
