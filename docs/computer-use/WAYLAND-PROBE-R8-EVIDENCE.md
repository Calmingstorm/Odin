# R8 production qualifier evidence, 2026-09-07

This is production qualifier/helper execution, not composed portal consent or
active-human-session fault injection. The fixture starts an owned compositor,
measures identity, then invokes the real qualifier. It does not mock libei or
feed JSON evidence to grant admission. The runner starts the second compositor
using the same installed files through bwrap.

* 11:25 UTC, stock Debian13 GNOME48.7 native: eligible with complete exact-stack,
  delivered-held, sole-sender EOF, release callbacks, same receiver fresh input,
  compositor survival and cleanup. Fixture exit0.
* 11:28 UTC, stock48.7 x11-nested: same complete pass. Fixture exit0. Earlier run
  expected refused but measured eligible, giving exit3; corrected and rerun.
* 11:28 UTC, baseline GNOME46.0 x11-nested: precise refusal
  `compositor_held_button_eof_release_failed`. GTK actually received button1 and
  Shift down. Shift released after sender exit, but button release never arrived;
  unchanged receiver sampled button1 held and mask256. Cleanup passed. Expected
  refusal fixture exit0.

Images: `localhost/odin-wayland-stock:r8` (19330966a7bc) and
`localhost/odin-wayland-mutter-baseline:r5`. Every run compares actual executable
and mapped library device/inode/hash, not names or version allowlists.

Fixture: `tests/fixtures/wayland_probe_runtime_fixture.py`. Docker had no network,
no devices, source-only read-only mount, pid384/memory2GB/CPU3 bounds. Unconfined
seccomp/AppArmor/systempaths enable inner unprivileged bwrap namespaces. No
human desktop paths or sockets were mounted. System Python, LP_NUM_THREADS2 and
OMP_NUM_THREADS1. Native/nested tests are separate; neither qualifies the other.

Unit/ABI/process tests: 64 passed in0.83s before the additional selector regression.
Includes real compiled ABI fake-lib tests (not GUI evidence), callback/ledger
tests, identity refusal, import, and a real separate-subprocess subreaper
double-fork cleanup test.

First composed-backend attempt uncovered a library-selector mismatch: the
probe's case-insensitive libGL regex also matched libglib; the actual runtime
identity predicate was case-sensitive. This was fixed to match runtime exactly,
and a regression test added. All explicitly supplied mappings still must match.
The final rerun and tests are recorded in tool evidence after this file's write.

Scoped Ruff currently has import-order and long-line style diagnostics; no lint
pass is claimed. See runbook for limitations and historical initial bwrap smoke
zombie before the outer supervisor existed. No service restart/injection.
