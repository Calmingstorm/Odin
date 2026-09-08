# R21: empirical install and upgrade review

## Scope and definitive correction

Reviewed all main-package/companion manifests, maintainer hooks, service unit,
native-helper builder, release build recipe, Python package/extras/assets and
the fixed isolated runtime's executable/library/service requirements. No missing
main-package dependency or postinstall provisioning defect was reproduced on
Debian 13. No desktop feature, production policy or hosted pipeline was changed.

One smoke correctness defect was fixed: `! command -v ...` under `set -e` does
not terminate when an unwanted command exists, because negated commands are
exempt from errexit. Explicit failure now enforces headless absence, absence of
Xvfb before a legacy upgrade, and the no-implicit-GNOME-install assertion. The
regression test actually executes Bash with a present and an absent command and
checks exit status and whether execution incorrectly continues.

The previous desktop smoke checked imports and executable presence but did not
exercise the native stack. It now launches the installed Drawing worker with the
unchanged bubblewrap argument profile, obtains a nonblank native raster and AT-SPI
tree, verifies private namespaces/UID/no visible host home or devices, and checks
input release. It repeats after reinstall. Only the outer systemd launch is
substituted by the disposable container; no runtime security check is bypassed.

## Starting-source empirical evidence

Source: `cdb92bdf3e624209f4eff9bd5b68a9ea2a38c25b`. Local nfpm 2.46.0 archive
was verified against its published SHA256 before use. The repository's Debian 13
builder compiled the precompiled guardian; its no-argument execution returned 64.
No package hook compiled native code. The package was fully extracted and the
guardian's ELF dependencies were inspected: libei.so.1, libxkbcommon.so.0 and
libc.so.6; BIND_NOW and PIE were present.

* Initial `.deb` SHA256:
  `8ef66dc9d2ae19872ebfac730b093e1f77bd1ef9b93cad61c76e4079c693bcf0`.
* Guardian SHA256:
  `ef7c74b41c109aa6b5f4c9bf94881a65bee901acda9ca9050e0d8952bf313e42`.
* Legacy fixture SHA256:
  `b9817e594bc07704edef685f341db1d2e127848712144c374c4f009394dcae8c`.
  This is the retained 3.94.99 pre-computer packaging fixture described in R9,
  not a claimed published release.

Four empty Debian 13 containers completed with exit 0: original-harness fresh
install/reinstall, original-harness legacy upgrade/reinstall, native-harness fresh
install/reinstall, and native-harness legacy upgrade/reinstall. `ODIN_LEGACY_PACKAGE`
selected the actual old `.deb`; new recommendations were resolved by APT during
the upgrade. These are not merely reinstalling already-provisioned dependencies.

Both native runs emitted two successful runtime receipts, one before and one
after reinstall: 3,686,400 native raster bytes (1280×960 RGB), nine accessible
application nodes, and confirmed input release. This exercises bwrap, Xvfb,
D-Bus/AT-SPI activation, Openbox, Xlib capture and xdotool window/input-release
operations. The fresh and upgrade hooks preserved configuration/receipt state,
private state ownership and recorded prior-running service intent. A separate
validation bundle confirmed both container exit codes and both pairs of receipts.

## Limits and honest failures

Default Docker seccomp/AppArmor refused nested user namespaces; allowing those
alone still refused mounting private proc because Docker masked system paths.
The successful disposable runs used seccomp/AppArmor/systempaths unconfined,
without privileged mode, host desktop/bus sockets or devices. The inner runtime
bubblewrap restrictions were unchanged. The initial refusals are environment
limitations, not successful runtime proofs and not packaging bugs.

Systemctl is an inert recording stub. These tests prove installation, hook
intent and installed native-runtime behavior, **not** real service activation or
systemd transient-unit lifecycle. Guardian launch/ELF resolution/usage rejection
are verified; portal/EIS input and real GNOME/KWin desktops are not requalified.
Xed remains unavailable in this Debian repository; Drawing is the tested profile.
Headless mode was not rerun in this round. Existing package contract tests remain
separate from empirical desktop tests.

Focused tests: 14 passed. Ruff check and format passed for the new Python smoke
and shell-behavior regression test; shell syntax and diff-check passed. Whole-tree
CI/coverage certification belongs to the parent campaign's frozen integrated
source, not these focused tests. No coverage or full-suite claim is inferred.

The source package above precedes the review integrations and documentation/harness
changes. A final frozen-source rebuild and both empirical paths remain required;
these hashes must not be attributed to later source. No master merge, push,
hosted pipeline, deployment, live service restart or operator-desktop action ran.
