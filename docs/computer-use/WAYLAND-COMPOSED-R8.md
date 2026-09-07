# R8 production Wayland composition, running qualification record

2026-09-07. This record is separate from the already completed stock 12/12
lifecycle survey. The target is actual `WaylandRuntimeBackend` composition with
`WaylandPortalSession`, authenticated scope extension, current J-chord guardian,
and `GnomeSameStackQualifier`. **No completed application task yet at this commit.**

## Task and isolation

The simulated operator opens an existing, empty SVG at
`/tmp/work/r8-composed-scratch.svg`. Its initial contents contain no shape.
The intended task is to use production input to select the rectangle tool, draw
a rectangle, deselect and Ctrl+S the existing scratch file. This avoids a
save-as dialog, which the production scope explicitly refuses. It does not
qualify file-picker input, new/open/close/reopen or arbitrary Inkscape tasks.

The disposable target is Debian 13 GNOME Shell 48.7 native-headless at 1280x900,
UID1003, no host displays/buses/devices, no network, private IPC/PID/cgroup,
read-only root, no capabilities, no-new-privileges, 2GiB memory/no extra swap,
3 CPUs, 512 PID ceiling, 768MiB /tmp. Docker uses `--init`; outer harness uses
the existing exact label/name/cgroup/PID-start census and a standalone R6
subreaper. No live service/deploy/restart, no host desktop changes, no push.

Inner production bwrap requires **container-only** seccomp, AppArmor and
systempaths `unconfined` settings so unprivileged nested user namespaces/private
/proc can work. These are explicit isolation concessions, not host security
configuration changes. No production qualifier is bypassed or replaced with
JSON fixtures. The original R8 private operator simulator presses the real
visible GTK portal controls. It is not used for any application edit.

Additional packages in the image: Inkscape 1.4-6, python3-dbus-next 0.2.3-4,
python3-pil 11.1.0-5+deb13u4 and their dependencies; bubblewrap was already
installed in the stock image. `gcc -Wall -Wextra -Werror` compiles the current
production guardian, including the J chord path. Import validation executes
inside each assembled image. No host package installation.

## Recorded attempts, without rewriting failures

Evidence roots `/home/odin/tmp/r8-composed-<name>-20260907`; corresponding outer
logs `/home/odin/tmp/r8-composed-<name>-driver.log`, ownership receipts
`/home/odin/tmp/r8-composed-<name>-owned.json`.

| Attempt | Image | Actual outcome |
|---|---|---|
| native1 | r8a | Portal+EIS+scope identity+guardian established. Real qualifier refused `private_compositor_vendor_stack_mismatch`. No app input. |
| native2 | r8b | Final corrected selector: genuine qualifier eligible, fresh PipeWire capture; focused=false and task refused before input. Initial diagnostic mistakenly used raw grant props, reported source unavailable. |
| native3 | r8b | Same eligible result. Correct diagnostic uses authenticated capture metadata; actual production Snapshot returns `wayland_scope_unavailable`. No app input. |
| native4 | r8c | Parent runtime7c4437f fixes included. Eligible+capture pass. Separate read-only private diagnostic proves scope rejects an empty banner bin. No app input. |

Each of these is an **exit1 application failure**, not a successful task. Native1
identified a true integration mismatch: probe case-insensitive `libGL` regexp
also selected lowercase libglib while real runtime used case-sensitive basename
prefixes. Probe agent corrected its selector to the runtime predicate, including
regression coverage, in final probe commit4e71e05. Supplied expected mappings
still undergo exact object/hash checks; no qualification evidence was forged.

Native4's diagnostic is an independent fixture-only extension with no D-Bus
export, input or gate mutation. In a stable normal native Inkscape window:
`mode=user`, `overview=false`, `animation=false`, `modal=0`, `stage=null`,
`bannerBinVisible=true`, `banner=false` (actual `_banner` is null). Only Inkscape
remains in window stacking. GNOME's empty container visibility incorrectly trips
the production gate. Parent has the diagnosis for an authoritative narrow fix.

Image manifests and actual source/guardian SHA256 inventories are in each root.
Native4 uses the current parent runtime snapshot, not only the initial runtime
agent commit. Native1-3 used the original runtime snapshot. These differences
must remain attached to the corresponding results.

## Evidence verifier

`r8-composed-evidence.py` requires actual eligible same-stack startup, all four
production GUI action receipts, completed runtime cleanup, a GUI-saved SVG with
a nonzero rectangle and matching recorded SHA256, a decodable final screenshot,
and no exact-owned process/cgroup or new helper residuals. It refuses any logged
failure. Unit data are labelled fixtures and are never supplied to the qualifier.

First verifier suite: **8 passed**, 0.42s, command exit0 and standalone supervisor
cleanup true. Log `/home/odin/tmp/r8-composed-unit1.log`, receipt
`/home/odin/tmp/r8-composed-unit1-owned.json`. This is verifier testing only,
not successful application proof.
