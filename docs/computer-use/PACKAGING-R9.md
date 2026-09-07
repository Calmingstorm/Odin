# R9: automatic package provisioning without automatic desktop authority

## Decision and delivered changes

The base `.deb` now installs `[pdf,computer]` on fresh install and upgrade, checks
Pillow/Xlib/dbus-next imports and creates `/var/lib/odin/computer` as service-owned
0700. Static symlink/non-directory components fail before provisioning. Existing
configuration, enablement and receipts are preserved. Missing computer dependencies
must not be silently left as hand-written operator setup.

* **Depends:** existing Python/venv/SSH plus systemd and sudo, which the existing
  package hooks already require. They are not a desktop environment.
* **Recommends:** optional native desktop tools, system-Python GI/Xlib/AT-SPI,
  fonts/media/X11/EI libraries and the offered applications. Ordinary APT install
  resolves these; `--no-install-recommends` keeps the headless base install viable.
  Transitive recommendations include PipeWire/WirePlumber audio components and
  application tooling. The operator must review APT's actual transaction.
* **Suggests:** GNOME Shell and portal backends. Installing Odin never selects
  a compositor or implicitly changes the user's desktop environment.
* A matching precompiled native Wayland guardian is inside the **same** `.deb`,
  root-owned 0755 at `/usr/libexec/odin-computer-wayland-input`. No separate manual
  compile or companion download. Runtime libraries are recommendations because
  the optional binary is never invoked on an unconfigured/headless installation.
* Matching GNOME extension files install system-wide but remain **disabled**.
  Existing opt-in activation is preserved; hooks never enable/reload Shell or
  modify session settings. User-local extension copies can shadow system files;
  the handoff calls this out.
* Release build configuration compiles in a Debian 13 container before nfpm runs.
  No compiler is invoked by a package hook or running service. Python wheels now
  explicitly include the runtime assets, including the accessibility service.
* Isolated preflight checks common dependencies at Enable and the **chosen** app
  at start. Debian's missing Xed no longer disables installed Drawing. No app
  substitution, new profile, or weakening of input eligibility.

Dependency installation is automatic; screen access is not. Target/monitor/bus/UID
selection, computer enablement, extension activation and portal consent remain
explicit security choices. Qualified application/compositor scope is unchanged.
Ubuntu 24.04 libei1.2.1 cannot satisfy the guardian's libei>=1.3.901 requirement;
that is a dependency limitation, not a diagnosis of Mutter's release defect.

## Recorded package execution

Local nfpm2.46.0 was downloaded into a scratch directory with its release checksum
verified. `packaging/computer-builder.Containerfile` built against stock Debian13
libraries; the unchanged qualified C source compiled successfully, rejected an
argument-free invocation with64 and required no input connection. ELF inspection:
libei.so.1, libxkbcommon.so.0, libc.so.6; maximum GLIBC symbol2.34, XKB V_0.5.0.

The real `.deb` was installed with APT in new empty Debian13 containers. Real
package dependency resolution, account/filesystem operations, pip installation,
wheel asset imports and dpkg hooks ran. Only systemctl was replaced inside those
containers with an inert recording stub; no service, desktop or input was started.

1. **Headless fresh install + reinstall:** passed. Computer venv imports worked,
   private state700:odin, guardian755:root:root, extension/docs present. No Xvfb,
   bwrap, xdotool, Openbox, Inkscape or GNOME Shell. Existing receipt/config and
   recorded service intent survived reinstall.
2. **Default recommendations fresh install + reinstall:** passed. Drawing,
   Inkscape, Writer, Xvfb/bwrap/xdotool/Openbox and system GI/Xlib dependencies were
   installed automatically. System GTK/Atspi/Gst/GstApp imported; guardian linked
   and returned64 without an EI fd. GNOME Shell was not installed. Xed remained
   unavailable in the tested Debian repository; selected-profile tests cover it.
3. **Legacy package to R9 upgrade:** passed. The fixture used the actual pre-R9
   package configuration/hooks at1eada6e with a lower fixture version, not a claimed
   published release. Started without computer state or Xvfb; APT upgrade installed
   the new recommendations, created private state and installed Python extras,
   while preserving config and the recorded prior-running service state. A further
   reinstall retained evidence and correctly consumed the saved restart marker.
4. **Wheel build:** passed via isolated uv build environment; archive includes all
   runtime assets and `assets/services/org.a11y.Bus.service`. No host pip/setuptools
   install was needed and no host system package was installed for R9.

Acceptance receipts are retained under `/home/odin/tmp/`:
`computer-package-r9-headless4.json`, `computer-package-r9-desktop2.json`,
`computer-package-r9-legacy-upgrade3.json`, `computer-package-r9-wheel.json` and
`computer-package-r9-compile3.json`. Each reports cleanup_ok=true and no residuals.
The exercised package SHA256 was
`472f5fb6810d35dd01a394e11a90bfb6d84473b03743df27333dbdea68a93503`.
Later documentation/type-annotation-only changes are not silently attributed to
that artifact. The binary SHA256 was
`2c75e621fcaae08f54a72651da46ccbd9af4f90cb6e8e670b6596fb4189a5ce8`.

## Failures and corrections, not erased

* Initial build used the wrong fixture UID, then added fortify flags exposed
  warn-unused-result in the already-qualified C receipts. Used the actual build
  UID and removed that newly added flag, preserving the qualified C source and
  all `-Wall -Wextra -Werror` checks. PIE, stack protector and RELRO/NOW remain.
* Initial container harness stubbed only PATH; dpkg used its sanitized path.
  Corrected the **container-only** systemctl diversion. Debian slim excludes docs;
  the harness explicitly includes Odin's docs for the assertion. No package failure
  was hidden by weakening an assertion.
* Legacy fixture required sudo, an undeclared old prerequisite now fixed by Depends.
  Its first construction used symlinks which nfpm correctly preserved, leaving
  metadata unresolved inside the container. Rebuilt the fixture from regular
  `git archive` files. Actual legacy-to-new upgrade then passed.
* Type gate caught a fixed-length tuple inference in selected-profile preflight.
  Explicit variable-length tuple annotation corrected it; no behavior changed.

## Validation and boundaries

Ordinary full suite: **13,518 passed,5 skipped**,576.60seconds. Final focused
package/lifecycle checks passed after the annotation correction. Lint0new, type
2baseline/2head0new, configuration registry0findings, shell syntax and diff-check
passed. Independent read-only review established no new concrete packaging blocker.
The unchanged prior async teardown warnings remain. Coverage-instrumented suite,
coverage ratchet and GitHub CI were not rerun; earlier coverage debt is still open.
No GUI/browser code changed; R8 qualification is not misrepresented as new GUI QA.

The smoke uses stubbed systemctl, so it proves **installation and hook intent**,
not the externally deployed service's operational health or user-specific desktop
permissions. No deploy, real service restart, merge, tag or pipeline occurred.
No observation/input/settings operation targeted Aaron's desktop.

All test containers and supervised workloads were cleaned up. Live service remained
PID3254906,NRestarts0,active. Census is consistently system-wide vs UID-specific:
initial437total/350odin/70root/17calmingstorm; final440total/353odin/70root/17calmingstorm.
The three new dead odin-owned children are one `gh` and two `dpkg-deb`, parented to
the unchanged live service. The dpkg pair followed an unsupervised listing cut
short by a pipe. They are reported, not cleared by restart/injection or attributed
to other users. Container/test supervisors themselves report no residuals.

Retained scratch tools/artifacts: `/home/odin/tmp/computer-r9-tools`, legacy fixture
trees, local ignored `build/`/`dist/`, and Docker image
`odin-computer-package-builder:r9`. No runtime/deploy files were modified.
