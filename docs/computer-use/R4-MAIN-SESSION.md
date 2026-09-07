# R4: real-session capture, not input acceptance

2026-09-07 UTC. Aaron explicitly authorized harmless main-session testing for
this overnight window through Claudia. Decision R4 was committed before changes.
No deployment, live-install edits, restart, pipeline or standing authorization.

## What actually ran

Read-only topology and display-state probes, followed by one bounded Python
process using new `runtime/x11_capture.py`. It made individual monitor GetImage
requests, decoded each into packed RGB, and passed the pixels through the actual
bounded renderer. An independent Pillow decode checked dimensions and nonuniform
pixel extrema. No image was written to disk, posted, or submitted to a model.

The display was already on. No wake, focus, pointer, keyboard, device, clipboard,
accessibility, window-manager, application, or settings mutation was performed.
No terminal or Odin WebUI interaction. No pre-existing app content was inspected
as text, modified, saved or closed.

**The current topology has FOUR monitors**, not the historical three-monitor
fixture. Root extent is 7920 by 2520. Primary is 3440 by 1440 at (1920, 0), with
the previously reported 1920 by 1080 at (2701, 1440), 2560 by 1440 at (5360, 0),
and 1920 by 1080 at (0, 213). Native placement is backend-private, not a public
action coordinate system. This corrects current-state knowledge without changing
the value of the earlier synthetic test geometry.

| Source raster | Delivered PNG raster | PNG bytes | Capture + render seconds |
|---|---|---|---|
| 3440 x 1440 | 1600 x 670 | 676421 | 0.880 |
| 1920 x 1080 | 1600 x 900 | 810272 | 0.540 |
| 2560 x 1440 | 1600 x 900 | 870107 | 0.580 |
| 1920 x 1080 | 1600 x 900 | 810271 | 0.537 |

All four decode checks passed and none was a uniform blank. Nonuniform pixels
are not a semantic image-quality verdict or proof of model understanding.

Before/after equality checks passed for pointer position and held-state mask,
keyboard focus, active window, current workspace, full client list, input-device
inventory, xset settings and topology. Because nothing changed, no restoration
input was necessary. The connection closed normally. The process had an external
45-second timeout and two-second kill grace. Read-only capture has no held input
to release; this does not exercise an input lease.

## Implementation boundary

The new module is an explicitly enabled, backend-internal capture primitive. It
does not discover a display, use environment fallback, create devices, inject
input, change focus, wake monitors or alter settings. No public tool or production
factory constructs it. It must be used under an external bounded process owner;
python-xlib synchronous round trips do not provide a cancellation deadline.

GetImage allocations are checked before dispatch, including native stride and
simultaneous reply/RGB copies. No root-span allocation followed by cropping. Each
source fits the budget; the actual complete root span is correctly refused by
the same native allocation budget. Common TrueColor 24/32-bit packed formats are
decoded explicitly with endian/padding checks; unsupported visuals fail closed.
Monitor rectangles and config epochs are checked before and after capture and
after rendering. Every capture receives a new opaque identity and **no input
mapping or input scope**, avoiding a false claim of complete source lifecycle
tracking or input eligibility. This is not a Wayland fallback or portal bypass.

Focused deterministic tests initially: **34 passed**. They cover pixel decoding,
real monitor sizes and 4K, root-span refusal, mid-capture/render topology changes,
same-sized replacement, bounds, revoked/disabled behavior, and lazy dependencies.
Final review/test results are appended after reconciliation.

## Why main-session input was not attempted

Independent review of the existing 12/12 private XI2 corpus confirmed that it
proved owned release with **enabled retained devices**, not leave-as-found detach.
Removing those devices previously caused a GTK XI_BadDevice application exit.
Watchdog loss while held, cross-connection press/release ordering, arbitrary-key
state proof and generation-safe device adoption remain production gaps.

Overnight permission does not make those technical gaps disappear. No XI2 master
was created, removed or disabled on the real session. The minimum credible future
design is a separately supervised, generation-fenced owner with ordered injection
and an independently recoverable exact keycode/device ledger. Persistent enabled
devices would need an explicit, truthful lifecycle contract, not relabeling them
inactive or silently leaving them in Aaron's session. That contract was NOT
activated by this increment. Safe capture testing is useful progress; calling it
assisted input would be false.

## Dependencies and failed preflight commands

The computer optional extra now declares python-xlib >=0.33,<1 on Linux alongside
Pillow; import remains lazy. No host package was installed. Initial real capture
used the already-installed system python-xlib/Pillow, not the live bot environment.
Development-venv installation/version evidence is recorded separately if used.

Installed **python-xlib 0.33 only in `/home/odin/odin-dev/.venv`**, using the
existing uv tool (this venv has no pip executable). No global, system or live-bot
package changed. Reversal: `uv pip uninstall --python .venv/bin/python python-xlib`
from the development clone, provided no later development work depends on it.

## Independent review and corrected final capture

Review found two P2 correctness gaps, both fixed: X11 four-byte reply padding is
distinct from scanline padding, and topology snapshots must retain screen-change
and monitor timestamps, not just resource config timestamps. Native payload
handling now budgets/checks the padded reply before slicing; multi-request
topology snapshots are bracketed and retain all three timestamps. Added focused
connection-level padding, ABA-change and mid-snapshot tests. Also excluded private
image bytes from BackendObservation's generated repr. **39 tests and focused
ruff passed** after fixes.

A second, final bounded real-session capture used the development venv and fixed
code. All four sources again decoded as nonuniform bounded PNGs. Times:
0.768 / 0.524 / 0.574 / 0.530 seconds. All eight before/after state comparisons
again matched. No screenshot was persisted, posted or sent to a model, and no
input was sent. Total real capture experiments: **2, both capture-only**.

A combined contract run also found one inherited adapter mock missing the new
source_revision field while the runtime agent was implementing that contract;
94 other tests passed. This was handed to that increment's owner, not dismissed
as proof of a clean combined tree. Final combined validation belongs in R4's
checkpoint rather than being inferred from this capture-only suite.

Two preliminary inspection commands failed before any capture: brace expansion
was unavailable in the single-command shell; an unnecessary runuser invocation
failed because the effective user is already odin. The authorized noninteractive
sudo equivalent confirmed display access. Neither failure altered session state.
