# Computer-use package installation handoff

> **Before service start or network exposure, configure API authentication.**
> With empty `web.api_token`, no `web.api_tokens` entries and no managed tokens,
> the general API authentication gate is disabled and routes relying on it are
> unauthenticated. Set a strong, private `web.api_token` to secure the installation;
> restrict the listening address and use TLS and access controls for remote access.
> Desktop observation and stored evidence make this review especially important.
> Computer routes have an additional authenticated-admin requirement, but that
> does not secure other routes in a tokenless installation. Desktop consent and
> private evidence-directory permissions are not substitutes for API authentication.

This describes the current packaging contract. R9 exercised actual APT/dpkg/pip
fresh installs and upgrades in disposable Debian 13 containers, with service
operations recorded rather than executed. The repository's PACKAGING-R9.md retains that evidence.
Historical desktop qualification is separate from testing the `.deb`.
See [OPERATOR.md](OPERATOR.md) for setup and safe first use, and
[RECOVERY.md](RECOVERY.md) for stop, privacy and recovery. Engineering records
remain in the source repository, not in the installed operator documentation.

## One package, optional desktop dependencies

The amd64 `odin` `.deb` contains the application, runtime assets, documentation,
the precompiled root-owned mode-0755 guardian at
`/usr/libexec/odin-computer-wayland-input`, and the matching GNOME scope extension
under `/usr/share/gnome-shell/extensions/odin-scope@calmingstorm.net/`.
The extension is installed as inert system files, **not enabled**.
The installed handoff lives at `/usr/share/doc/odin/computer-use/PACKAGING.md`.

Use APT for a downloaded package: `sudo apt install ./odin_VERSION_amd64.deb`
(replace VERSION with the downloaded version). Direct `dpkg -i` unpacks/configures
but does not resolve dependencies; it is not the recommended installation path.
Review APT's proposed transaction before accepting it.

* **Depends:** Python 3.11+, python3-venv, openssh-client, systemd and sudo.
* **Recommends:** Python pip, the optional computer OS tools/libraries and native
  applications, including bubblewrap, Xvfb, D-Bus, xdotool, Openbox, system
  Xlib/GI/AT-SPI/GTK, fonts, X11 libraries, Drawing, Xed, Inkscape, Writer,
  libei and GStreamer/PipeWire support. APT normally installs available
  recommendations; not every distribution supplies every recommended package.
* **Suggests only:** GNOME Shell and the desktop/ GNOME portal packages. An Odin
  install or upgrade must not implicitly install or replace a desktop compositor
  or select a portal backend. Choose and provision the target desktop separately.

Recommendations have transitive dependencies: the measured normal Debian 13
transaction also brought PipeWire/WirePlumber audio components, dictionaries and
application tooling. It did not install GNOME Shell. Review the whole APT plan,
particularly on a workstation with an existing audio stack.

Headless operators can use
`sudo apt install --no-install-recommends ./odin_VERSION_amd64.deb`.
The base service does not require computer OS recommendations. Optional desktop
features will refuse missing requirements rather than install them at runtime.
The post-install Python dependency step still requires access to its configured
package sources; this is not a fully offline bundle.

## What installation and upgrades do

On both fresh installation and upgrade, postinstall installs the application with
the `pdf` and `computer` Python extras into the service venv, then checks imports.
It provisions `/var/lib/odin/computer` owned by the service account, mode **0700**,
rejecting symlink or non-directory components before provisioning. Existing
receipts are retained. The computer Enable control does not create or repair this
private evidence root. System Python dependencies remain distinct from the venv.

Fresh installation leaves computer use disabled by default. The base Odin service
is enabled but not started until the operator completes setup. Ordinary upgrades
preserve configuration, computer enablement, data and prior service state: an
already-running service is restarted; an inactive one remains inactive. No computer
task, desktop capture, input action, extension activation, session-bus connection,
desktop-setting change or login/session restart is automatically requested by
package installation. Preserving enabled configuration is not a new task grant.

The existing base installer grants the service account passwordless sudo. Review
and restrict that policy for the deployment; it is not desktop consent and does
not authorize silently bypassing a computer refusal.

## What remains an explicit security choice

The operator must select the target, provision authorized display/monitor access
for X11 or the exact target UID/local Unix session bus for Wayland, review service
privileges, and enable computer use. For Wayland, the operator must activate the
trusted scope extension in the chosen GNOME session and approve the real portal
monitor-sharing/remote-interaction prompt for each task. The package never enables
the extension, edits desktop security/accessibility settings, or restarts a login
session. If discovery of new extension files needs a new login on that desktop,
the operator decides when. Installing files is not authorizing their execution.

Foreground tool/host permissions, native-image transport, application identity,
and runtime qualification still apply. This is not a zero-click desktop setup.

## Distribution and profile boundaries

**Historical R8 Wayland qualification used Debian 13, GNOME Shell/Mutter 48.7.**
That result covers recorded fixtures, not every desktop, application or action.
It is separate from R9 package checks and the R11 general attached-application
implementation contract. Check runtime capability and release validation evidence.
The guardian requires **libei >= 1.3.901**, reflected in the APT recommendation.
Stock Ubuntu 24.04's older libei does not satisfy that requirement; Mint/Ubuntu
availability varies with the base release and repositories. Missing or too-old
libei is a specific missing dependency, **not evidence of a compositor defect**.
Do not replace a desktop or add unreviewed repositories to force acceptance.
Existing-session X11 remains a separate option on a suitably provisioned stack.

Xed is unavailable in some distribution repositories. Isolated Enable preflight
checks common executables, and task start checks the selected Drawing or Xed
profile. Missing Xed does **not** block Drawing. Availability of a recommended app
does not qualify every workflow. Fixed launch profiles belong to the isolated
tier, not to the general attached-application product contract.

## Source deployments and release builds

A source checkout or wheel install does not run `.deb` maintainer hooks. Manually
provision the service environment, state root, OS dependencies and matching trusted
helper/extension assets using [OPERATOR.md](OPERATOR.md). The wheel explicitly
includes `src.computer.runtime` assets and `assets/services/*`; this is not a claim
that pip installs `/usr/libexec` or activates GNOME extensions.

The release workflow is configured to build the matching native guardian in a
Debian 13 builder container using `packaging/build-computer-helper.sh`, then put
it in the same `.deb` through `packaging/nfpm.yml`. Compilation is release-build
work, never a maintainer-hook or runtime operation. The same builder and nfpm
configuration were exercised locally in R9; no GitHub/release pipeline ran.
Container package checks establish artifact contents, ownership, dependency
resolution and hook behavior, not a running deployed service's health. Desktop
acceptance still requires its own explicitly authorized test. The scratch-only
`packaging/smoke-computer-install.sh` records systemctl calls inside a disposable
container; it must never run on a real install. Its opt-in and empty-root checks
are safety guards, not permission to run it inside an arbitrary production container.
