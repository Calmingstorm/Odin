# R29: isolated Hyprland identity and native capture foundation

This is an **unwired foundation, not an admitted backend**. The existing
`wayland_identity.compositor_adapter()` refusal for Hyprland and the current
GNOME/KWin/X11 runtime remain unchanged. Full input qualification is a separate
Phase 3 gate. Capture success cannot satisfy that gate. If safe release requires
a compositor core patch, stop integration and seek the operator's decision.

## Source review and design boundaries

The existing `wayland_backend.py` obtains capture through `WaylandPortalSession`
and shares authenticated scope/identity with the GNOME and KWin input guardian.
Reusing that portal path would violate R29's explicit-output requirement.
`wayland_identity.py` currently rejects Hyprland before admission and establishes
identity using native peer/process and mapped-file evidence for its existing
adapters. New Hyprland modules must not weaken or change those adapters.

The foundation therefore consists of separate Python identity/capture APIs and a
small source-built native screencopy helper. It does not discover the current
desktop, alter environment/configuration, enable a companion, add an install
side effect, or register a backend. Tests use fake peers or isolated native
fixtures, never the host desktop.

## Intended trust and resource contract

* Connect only to caller-supplied absolute Unix socket paths. Compare Linux
  `SO_PEERCRED` on both Wayland and IPC with one expected UID and compositor
  PID. Pin process start ticks and boot identity; recheck around requests and
  captures. An IPC pathname or instance environment variable is not identity.
* Executable approval is explicit: exact resolved path, file ownership/mode,
  bounded SHA-256 measurement of `/proc/PID/exe`, exact expected digest, and an
  approved version/commit reply on the authenticated IPC socket. Process reuse,
  executable replacement, unknown versions, errors and ambiguous replies fail.
  This is recognition only, not proof of an input-release guarantee.
* Native capture receives an inherited authenticated Wayland connection FD.
  No environment display lookup or portal fallback exists. It selects exactly
  one named, explicitly consented `wl_output`, using version-4 output names and
  version-3 screencopy. Missing/ambiguous names or geometry/transform changes
  reject the operation. No global-desktop capture or arbitrary output fallback.
* Explicit output metadata includes physical dimensions, transform, logical
  origin and logical size. Pixel-to-source mapping is output-local. Global
  logical origin is metadata only, never an input coordinate authority.
* Lock status must be explicitly unlocked in a fresh, qualified compositor-loop
  scope proof. Missing/unknown/locked status fails shut. Ordinary IPC monitor
  JSON cannot supply this proof. A future integrated backend must fence consent
  revocation, lock, topology and scope changes across capture and delivery; these
  standalone foundations do not implement that supervisor.
* Buffers have bounded dimensions, pixels, stride and total allocation. The
  native helper's independent monotonic timer bounds even library dispatch and
  blocked writes. Python exchanges use the remaining overall monotonic budget.
  Frame data is not released to callers until native protocol `ready`, final
  synchronization, local proxy cleanup and connection shutdown. This is **not
  an acknowledgment of compositor-side resource release**: a malicious server
  could retain its own mapping. Cancellation terminates and reaps the owned
  helper. No named files containing captured pixels are created (anonymous
  sealed-size memfd shared memory is used).

## Integration prerequisites, intentionally unsatisfied here

The lead must establish the Phase 3 release safety result, authenticated
compositor-loop scope protocol, supervised explicit consent lifecycle, input
guardian and source-revision fences before admitting Hyprland. A locked or
revoked frame must never reach the model. The source helper is not installed or
run by importing the Python module. Source installation/activation must remain
explicit and separate from package installation.

## Source evidence and wire contract

The reviewed Hyprland source revision was
`39d7e209c79d451efab1b21151d5938289da838d`. Its
`src/protocols/Screencopy.cpp` binds the requested `wl_output` resource to the
monitor session, advertises the native frame buffer dimensions and sends
`buffer_done` at v3. `src/managers/screenshare/ScreenshareSession.cpp` uses the
monitor's physical pixel size for whole-monitor frames. Version approval uses
the exact `version` and `commit` fields from authenticated `j/version`, as
emitted by `src/helpers/SystemInfo.cpp`. Other builds require their own explicit
approval and qualification; this source review is not blanket support.

The helper takes `FD PID UID OUTPUT WIDTH HEIGHT TRANSFORM TIMEOUT_MS`. It never
opens a display socket itself. It emits a 32-byte little-endian header:
`ODINSC01`, then six uint32 values: width, height, width*4 stride, format=1,
flags=0, payload byte count. Payload is packed top-down B,G,R,255. It accepts
only XRGB8888/ARGB8888 shared-memory offers, normalizes Y-invert and rejects
unexpected geometry or protocol ordering. The Python layer validates the
header before payload allocation and requires exact payload length plus exit
status zero. Native storage is limited to 128 MiB including one row scratch;
Python deliberately applies a more conservative 128 MiB two-raster budget.

Native output matching proves exact name, current physical mode and transform,
not initial logical origin or fractional scale. Logical topology in
`ExplicitOutput` must come from the future qualified scope provider. Transform
mapping covers all eight Wayland transforms using native pixel centers and
returns **output-local** logical coordinates. It does not grant input authority
or normalize the raster orientation for existing rendering APIs.

## Build and isolated checks

Run `sh scripts/build-hyprland-capture.sh /absolute/private/build-directory` to
compile from the local source and vendored protocol using `wayland-scanner`, a
C compiler and `wayland-client >= 1.20`. This only builds; it does not install,
activate, contact any display, or download dependencies. No install hooks or
runtime configuration changes are included.

`tests/test_computer_hyprland_foundation_r29.py` checks process/executable pins,
real kernel peer credentials on fake local sockets, strict version reply
parsing, all eight local transforms, bounds, stale/unknown/locked scope,
consent/topology fencing and fake-helper failure/cancellation/pipe flooding.
`tests/fixtures/hyprland_native_capture_check.py` exercises the compiled helper
against an isolated socketpair Wayland wire server, including native protocol
ordering, allocation bounds and missing release notifications. Neither test
suite connects to an actual desktop compositor. These are foundation tests,
not live backend qualification or the Phase 3 held-input-release gate.

Recorded foundation validation: 68 new Python tests and 96 selected existing
GNOME/KWin/X11 identity/runtime tests passed (164 total); native compilation
passed with `-Werror -Wconversion -Wshadow`; all 25 native wire cases passed
both normally and under Valgrind with definite leaks treated as errors. The
first Valgrind run during development found local proxy leaks; explicit proxy
cleanup was added and the complete native check rerun passed. These counts do
not claim a full repository suite or actual Hyprland runtime qualification.
