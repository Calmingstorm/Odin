# R8 stock Wayland lifecycle qualification

2026-09-07. **Stock Debian 13 Mutter 48.7 passed all six real held-input
lifecycle cases in native-headless AND nested-X11 configurations.** Both complete
application/outer commands exited zero. This supersedes the claim that a custom
one-line rebuild is the only known working compositor. It does not establish a
complete production Python backend, a supported application task or deploy readiness.

## Exact tested artifacts

Unmodified signed Debian distribution packages installed in a new Docker image,
not rebuilt Mutter libraries:

* GNOME Shell `48.7-0+deb13u2`; libmutter-16-0 `48.7-0+deb13u1`.
* libei/libeis `1.3.901-1`; portal `1.20.3+ds-1`; GNOME portal `48.0-2`.
* PipeWire `1.4.2-1`, WirePlumber `0.5.8-2`, GTK3 `3.24.49-3`.
* Stock dependency image `19330966a7bcdec091bfb4b3d245b54f9a491d8d10b9dd7d46ce638704b406f9`.
* Tested input image `fc21f73a18e858112df42a12549dd33862b72d215253d59ca32e75716f1c4504`,
  tag `localhost/odin-wayland-input:r8b`.
* Actual process-mapped libmutter-16.so SHA256:
  `1a4c9a0559b182e8ebb9b0e306193f6a07086f34f52638b9b2b3af8bd588f19f`.
* Actual process-mapped GNOME executable SHA256:
  `9eee6be62162c9477a705aa07151669a64f117e45152441e131e7bb56dc20660`.
* Production guardian source copied from runtime agent's worktree, SHA256
  `d8b4c86e6bf196e866be916e9243dd4e9c2d784e394b9efd524030626457045e`;
  ordinary executable `ed6f97b3c632e5d73f9dd69039f95a3d3aaa5875279eb693c3374371eb6f4fb1`.
  Later runtime J-chord changes are not covered by these runs.
* Opt-in read-only scope extension source
  `5968f6ca46af7627b851d00e48c75893e9089e5526319b50bf069522d67c5e4f`.
  Real GNOME Identity reported `MetaBackendNative` in native6. Extension loading
  changes Shell behavior but does not patch Mutter or its release implementation.

Native invocation was `gnome-shell --wayland --headless --no-x11 --virtual-monitor
800x600`; nested invocation `--wayland --nested --no-x11` under private Xvfb :77.
Both targeted native Wayland GTK applications, not Xwayland. Native headless uses
the native virtual-input backend, but has no physical libinput devices. It is not
a real-hardware coexistence result or a blanket eligibility assertion about all
GNOME48 installations. Version text alone is insufficient; process, mapped build,
backend and fresh runtime evidence must match.

## Real observations

Six modes in each run: orderly release; actual controller-process EOF with portal
owner alive; cancel followed by queued late H command; independent 2000ms lease;
actual sole-EI-owner `_exit` through separately compiled fixture-only F command;
genuine portal Session.Close while held. `steal_fds()` and parent close ensure the
last-owner test has no retained EI duplicate. Target applications are never killed
to demonstrate recovery. No alternate pointer release is sent before observation.

Every case required fresh focused GTK Shift_L + button1 down with independently
simulated Control_R held, then actual key/button release callbacks, empty owned
ledger and cached GDK mask4, preserving Control_R until the simulator deliberately
released it. GDK masks are cached application state, not authoritative compositor
state. Callback evidence is mandatory. Sender `release_sent` alone proves nothing.
Lease exit2 and portal-loss exit3 correctly remain action-unknown outcomes, even
though compositor/application release passed. Queued cancel input did not create
a second held receipt. Original portal acquisition harness was reused; the new
production Python portal/broker/controller composition was NOT executed here.

| Trigger | Native key/button release ms | Nested key/button release ms |
|---|---:|---:|
| Orderly | 0.584 / 0.709 | 0.651 / 0.775 |
| Controller EOF | 0.460 / 0.552 | 0.621 / 0.735 |
| Cancel + late input | 0.499 / 0.605 | 0.523 / 0.642 |
| Lease expiry | 0.769 / 0.967 | 0.791 / 0.943 |
| Sole EI owner loss | 0.834 / 0.956 | 0.972 / 0.597 |
| Portal Close | 2.582 / 2.690 | 2.899 / 3.019 |

Times are local monotonic receiver callback latency from sender pre-action or
portal pre-Close, not kernel EOF timestamps or guaranteed real-time bounds.
Native receiver234 and gedit259, nested receiver239 and gedit249, existed before
the six attachments. Same receiver and editor accepted fresh input after every
Close. Each same editor has eight verified markers: before, six after, final.
**Gedit is a lifecycle witness, not an offered production application profile.**
No Inkscape/Writer GUI saved artifact or full production task is claimed.

## Genuine consent and simulator limits

Stock GTK4 portal exposes a check row with no AT-SPI action/grabFocus, so old
GTK3 fixture approval failed. The R8 operator uses bounded keyboard Tab traversal,
checks actual focused checkbox, presses Space, verifies checked state, focuses
Share and presses Return. The tested portal still supplies genuine responses,
PipeWire frames and EIS FDs; no permission-store edit or fake grant occurs.
For bootstrap ONLY, private Mutter NotifyKeyboardKeysym simulates a human in the
disposable native compositor. Later separate granted portal Notify session handles
simulated-human typing/motion; it never calls ConnectToEIS. Product input remains
the ordinary EIS guardian. This test simulator must never ship as an input fallback.

## Every graphical attempt and cleanup

All evidence roots are `/home/odin/tmp/wayland-r8-<name>-20260907`; outer logs are
`/home/odin/tmp/wayland-r8-<name>-driver.log`. The first five failures happened
before the tested guardian held input and are not lifecycle successes.

| Name | Result | Exact Docker ID |
|---|---|---|
| native1 | exit1, 128-PID ceiling exhausted by stock helpers | `6001e2a19cc411a460e1608107c2c1b49d1ebc303df3cd28d1540a4caa281825` |
| native2 | exit1, GTK4 checkbox has no AT-SPI action | `c75f36e64375a81220e3786bc6404a1f76318f56e2726bc76798efe8558679a3` |
| native3 | exit1, checkbox row and descendant both visible | `a2cade1d16525cbd0be23547fe1264ab7ccb6ac0bce2daebe537040655c19973` |
| native4 | exit1, GTK4 grabFocus unavailable | `15fe08e67e1c69db4015deea52d0ff323f959e4144909c330787c2136af17d99` |
| native5 | exit1, backend startup race caused missing RD interface | `7a4f511a007e6bff9bbe88ad191fc0a0490e6126c828fa267657831e357ed28a` |
| native6 | exit0, 6/6 + same-app fresh input | `74c936ae1cd4b01edfcda1c185017346b1e9407d9ae041e1db033ad8e38ff028` |
| nested1 | exit0, 6/6 + same-app fresh input | `1881f2c2e2e63994f2f990e94f4491db193f102cc656932ed0eff57c0c0ebfe9` |

Every outer cleanup recorded `cleanup_failure=0`: daemon identity-bound unique
name/label, exact cgroup path,20ms sampled PID/start census, explicit foreground
attach/census waits, Docker stop/remove, complete final host scans, no surviving
owned process/cgroup and no new global helper. Historical zombies were untouched.
Census is sampled, not a complete process birth trace. Docker --init reaps namespace
children. Runtime checks native5/native6/nested1 passed; earlier live checks ran
after fast failure and correctly FAILED rather than proving health.

Containment: UID1003, private PID/IPC/cgroup, no network, no capabilities,
no-new-privileges, read-only root,1GiB memory/no extra swap,1CPU,256PID ceiling
after native1,512MiB private tmp. Only read-only harness and new evidence bind;
no host display/bus/device/home socket, no DISPLAY :0. Artifacts/images intentionally
remain. No host packages, live service configuration, deploy/restart or push.
The new image installs libxkbcommon-dev to compile Odin only. First input image
build failed missing that .pc dependency; corrected build succeeded. Existing R5
analyzer initially failed on the new identity row lacking kind; R8 strict analyzer
handles this separately, without altering raw logs or weakening six-case assertions.

## Safe session-start probe design reviewed independently

Never inject held-owner-loss faults into the real user's desktop to learn whether
it is broken. Before input admission, obtain trusted active compositor owner,
PID/start/boot and mapped-library identity, actual backend class and granted source.
Run held-down/owner-loss/release in an isolated same-installed-stack compositor
with separate namespaces, private buses/sockets, bounded resources and exact
cleanup. Require independent receiver held AND release callbacks and the same
receiver's fresh subsequent input. An orderly live down/up is not EOF-defect proof.
Private proof markers must be bound to launcher-owned namespace identity, not a
user-editable JSON allowlist. Duplicate EI FDs invalidate sole-owner EOF evidence.
Unknown/broken results must refuse input with exact reason and remediation;
known old nested Mutter bug calls for upgrading the affected build, not restarting
someone's desktop or applying global releases. Native-headless evidence does not
measure physical-device concurrency, GPU/hardware hangs or every backend option.
Do not translate an old nested-X11 defect into unmeasured native failure.

These assets provide measured stock evidence and reproducible fixtures. Parent
integration still must demonstrate runtime session-start qualifier + broker +
scope + newest guardian and a genuinely supported application GUI task.

## Recorded validation and reproduction

Final focused suite: **26 passed,9 subtests passed,6.73s**, primary exit0,
owned-supervisor cleanup true, complete census, no residuals/signals. Log
`/home/odin/tmp/wayland-r8-final-tests.log`, ownership receipt
`/home/odin/tmp/wayland-r8-final-tests-owned.json`. This ran the four new R8 pure
evidence tests plus inherited census, telemetry and Docker-stub cleanup tests,
using `/home/odin/odin-dev/.venv/bin/python -B` from the qualification worktree.
All R8 Python ASTs parsed, both shell scripts passed bash -n, committed diff
whitespace and clean-worktree checks passed. Final validate_action
`wayland_R8_final_stock_qualification` passed4/4, including current recorded
process/cgroup absence and independent12-case assertions. No full suite/lint or
general GUI qualification claim.

Build `wayland-r8-stock.Containerfile` as `localhost/odin-wayland-stock:r8`, then
build `wayland-r8-input.Containerfile` with explicit named context
`--build-context runtime=/home/odin/reviews/computer-use-r8-wayland` and the
intended reviewed source revision. New builds can contain a newer guardian than
the hashes above and must be labelled separately. Actual measured commands were:

```text
bash scripts/computer-feasibility/wayland-r8-lab.sh --isolated-stock-qualification native-headless localhost/odin-wayland-input:r8b /home/odin/tmp/wayland-r8-native6-20260907
bash scripts/computer-feasibility/wayland-r8-lab.sh --isolated-stock-qualification nested-x11 localhost/odin-wayland-input:r8b /home/odin/tmp/wayland-r8-nested1-20260907
python3 scripts/computer-feasibility/wayland-r8-evidence.py /home/odin/tmp/wayland-r8-native6-20260907
python3 scripts/computer-feasibility/wayland-r8-evidence.py /home/odin/tmp/wayland-r8-nested1-20260907
```

Reproduction requires **new evidence directories**, not the retained ones. All
image/evidence removal is optional, exact-identity removal after confirming no
references; never prune. Do not run the fixture on a real desktop or transplant
its simulated-operator bypass into production input.
