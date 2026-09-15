# Native Hyprland on-demand assistance (R32)

This opt-in route is **Hyprland only**. Defaults remain isolated X11;
`wayland_backend: portal` retains GNOME/KWin implementations and their existing
qualification/refusal rules. Native Hyprland never falls back to a portal,
default output, ambient desktop or unapproved compositor.

## Accepted residuals, not universal guarantees

Native Hyprland input is **best-effort**. Hard guardian SIGKILL can leave owned
input held. Releasing Odin's button can clobber the physical user's simultaneous
same-button hold. Graceful exit, controller death, transport loss and expiry use
cooperative owned-release paths; their ACK is not receiver-side verification.
Missing ACKs remain unconfirmed/quarantined. The capability is
`owned_input_release: hyprland_best_effort`, not `verified`. These residuals do
not weaken or reclassify other backends.

Keep the owner or designated operator reachable with an independent stop path.
Use the KVM lab for planned held-input/compositor fault qualification; an explicitly
owner-approved supervised workstation test is not categorically excluded. Protect
unrelated user work, identify disposable test documents, and signal only recorded
test-owned PIDs/start ticks. See the corrected safety and venue requirements in
`docs/computer-use/HYPRLAND-RECOVERY-QUALIFICATION-PLAN.md` in the source checkout.
Installing helpers, loading a plugin, enabling computer use and selecting an
output are not themselves task consent or authorization for fault injection.

## Build and install once; automatically load on first use

Use the optional native build/install flow documented below. On the target
distribution, install the C/C++ toolchain, `pkg-config`, Wayland development
headers and scanner, xkbcommon development headers, json-c development headers,
and the exact matching Hyprland development headers. Build from the checkout:

```sh
sh scripts/build-hyprland-input.sh "$PWD/build/hyprland"
```

This builds the guardian, capture helper, plugin and build identity without
connecting to a desktop or activating anything. `--guardian-only` builds only
the input client for isolated wire tests and does not produce an installable
full bundle. Compile the
in-process plugin against the **exact target Hyprland headers/commit and dependency
ABI**, not merely a similarly numbered release. Keep approved build metadata
with the output. Successful compilation is not live input qualification.

The optional helper installation contains:

* `/usr/local/libexec/odin-hyprland-input`
* `/usr/local/libexec/odin-hyprland-capture`
* `/usr/local/lib/odin/odin-hyprland-scope-<ELF-SHA256>.so` (immutable load path)
* Source installer only: `/usr/local/lib/odin/odin-hyprland-scope.so`
  (compatibility symlink, **not** the recommended load path)

No activation hook runs during package installation. On first native inventory or
session start, Odin loads the approved plugin by default. Hyprland is not a headless base dependency.
Source installs need native helpers as well as the Python package;
`pip install '.[computer]'` alone cannot build a compositor-ABI plugin.
See [PACKAGING.md](PACKAGING.md) for authentication, service and storage policy.

After building into `build/hyprland`, verify all three artifacts and
`build-identity.json` against the intended target build, then install inert files:

```sh
sudo sh packaging/install-hyprland-helpers.sh "$PWD/build/hyprland"
```

For package staging rather than a real install:

```sh
DESTDIR="$PWD/build/hyprland-stage" sh packaging/install-hyprland-helpers.sh "$PWD/build/hyprland"
```

The installer requires all artifacts before creating destination directories and
does not run them. Real installation should be administrator-owned; no helper or
plugin may be group/world-writable. Never run the staging directory as a session.
For an optional `.deb`/RPM, `packaging/nfpm-hyprland.yml` consumes the same
`build/hyprland` outputs. Set `VERSION` and `HYPRLAND_DEPENDENCY` to the exact
target distribution's package-version constraint before invoking nFPM:

```sh
export SCOPE_PLUGIN_FILENAME=$(python3 -c 'import json; print(json.load(open("build/hyprland/build-identity.json"))["plugin_filename"])')
nfpm package --config packaging/nfpm-hyprland.yml --packager deb --target build/
```

Do not publish a generic plugin package that silently accepts an unmatched
Hyprland ABI. Build identity is required even for source installation.

With the schema-2 manifest installed, `hyprland_managed_activation: true` (the
default) loads the verified plugin on the first native inventory/session request.
No manual command is needed after each boot. Existing explicit manual opt-outs
remain manual. Only for that deliberate manual mode, the owner can load the exact
matching plugin in the chosen Hyprland session:

```sh
plugin=$(python3 -c 'import json; print(json.load(open("/usr/local/share/doc/odin-hyprland/build-identity.json"))["plugin_filename"])')
hyprctl plugin load "/usr/local/lib/odin/$plugin"
```

Loading is transient, not a persistent `hyprland.conf` edit. Odin inspects first,
loads only when the exact approved image is absent, and verifies the mapped image
and executing build ID. It does not unload/reload per action. Never rewrite the
user's compositor config. Auto discovery refreshes reboot-scoped identifiers for
a fresh session without hand-editing PID/signature/socket names. This is not a
promise to resume a pre-reboot session or recover held input. See
`docs/computer-use/HYPRLAND-AUTOLOAD-TRUST.md` in the source checkout for the
complete trust contract. On upgrade, rebuild and provision the schema-2 manifest
with its matching artifact once; schema-1 manifests are not implicitly promoted.
Do not flip recovery metadata to permit loading.

The existing installer's completion message still mentions explicit setup and
qualification. That legacy wording does not impose a recovery-qualification gate:
installation is inert, while the first-use loader follows the build-trust contract
above. Packaging behavior is unchanged by this runtime update.

### Loaded image identity and recovery

Do not overwrite a mapped plugin ELF or trust an on-disk checksum as evidence
of the executing image. Same-path unload/load can retain the old mapped
`(deleted)` ELF through dynamic-loader caching; GNU UNIQUE symbols can prevent
unloading. The build now uses `-fno-gnu-unique`, but this is not a guarantee
against every loader reference or plugin-global symbol interposition problem.
**Always use the immutable versioned filename from the manifest.** The source
installer preserves an existing matching versioned inode and atomically changes
only the compatibility symlink. Package builds ship only the versioned image.
Keep old images until the owner confirms they are no longer mapped.

`build-identity.json` records `companion_build_id` (SHA-256 over the build script,
plugin source and local deadline/provenance headers, including relative source names),
`plugin_sha256` (actual ELF bytes), and `plugin_filename`. The companion's flat
JSON `status` response reports `companion_build_id` from the **executing** code.
Compare that value with the manifest before qualification/admission. A missing
or mismatched value means stop, not “the new file must be loaded.” The source
ID does not attest compiler, headers or libraries; the ELF digest and exact ABI
pin are separate evidence. Schema-2 build approval and these identity checks gate
automatic loading. `runtime_qualified: false` remains recovery metadata, not a
load gate and not evidence that recovery-after-fault has been demonstrated.

During explicit owner-supervised recovery only: end input, verify owned release,
unload the old plugin using its actual loaded path, and load the new versioned
path once. Recheck executing build ID, cleanup status and required runtime
qualification. If identity remains stale or unloading is uncertain, stop and
arrange an owner-approved compositor restart; do not accumulate concurrent
plugin instances or repeatedly reload hoping the loader changes its mind.
Neither builds nor installation perform these steps. This is setup/recovery,
never per-action reload and never an automatic compositor restart.

## Provision the exact target

Use Computer operator > Computer provisioning. These settings are restart-required
and generation-pinned. Saving changes desired state only; saving/enabling never
contacts the compositor. Use the normal operator flow for an Odin restart.

| Setting | Operator-approved value |
| --- | --- |
| `computer.platform` | `wayland` |
| `computer.environment` | `existing_session` |
| `computer.wayland_backend` | `hyprland` |
| `computer.wayland_uid` | Desktop owner's numeric UID |
| `computer.hyprland_discovery_mode` | `auto` (default); explicit `pinned` remains available |
| `computer.hyprland_managed_activation` | `true` (default); `false` only for deliberate manual loading |
| `computer.hyprland_plugin_manifest` | Installed `/usr/local/share/doc/odin-hyprland/build-identity.json` by default |
| `computer.hyprland_runtime_dir` | Optional in auto mode; defaults to `/run/user/<UID>` |
| `computer.hyprland_wayland_display` | Required only in pinned mode; discovered in auto mode |
| `computer.hyprland_instance_signature` | Required only in pinned mode; discovered in auto mode |
| `computer.hyprland_output_name` | One explicitly consented native output |
| `computer.hyprland_compositor_pid` | Required only in pinned mode; discovered in auto mode |
| `computer.hyprland_compositor_executable` | Approved absolute executable path |
| `computer.hyprland_compositor_sha256` | Independently approved executable SHA-256 |
| `computer.hyprland_compositor_version` | Approved build version |
| `computer.hyprland_compositor_commit` | Approved 40-64 lowercase-hex build commit |
| `computer.hyprland_compositor_owner_uid` | Executable owner, normally root (0) |

Helper defaults are listed above. `hyprland_scope_socket` can be an explicit
absolute path; empty uses `<runtime_dir>/odin-hyprland-scope.sock`.
`wayland_bus_address` and the portal guardian path are unused here. Do not approve
whatever executable happens to own a socket. UID/PID/SO_PEERCRED, process lifetime,
executable identity and independently approved build must agree. Private target
metadata belongs in local configuration, not public logs, PRs or screenshots.

Capture uses native explicit-output screencopy-v3. Compositor-loop input scope
checks have a 250ms freshness budget. Locked/unknown state, unknown focus, changed
output/geometry and stale identity revoke or refuse input. A screenshot or ready
helper does not prove task success.

Native scope requires a wholly contained native Wayland top-level window on the
granted output. A session remains pinned to the original measured process lifetime
and executable identity. Same-process dialogs may change application class and
have an xdg parent, provided the compositor verifies the entire parent chain's
native client PID/UID. Different processes, foreign parents and XWayland refuse.
Floating windows are conservative safe-application dialog candidates, not proof
that a new dialog appeared. Use `visual_change`, inspect the next delivered view,
and supply its `expected_modal` when present. Open dialogs in a separate action,
not a batch which blindly continues inside unseen content.

Keyboard focus must match the observed target. The pointer may initially remain
outside a new dialog; only a hit-tested, no-held-input owned positioning operation
can enter that already observed keyboard target. Other focus transitions still
revoke held input. Button, axis and motion destinations remain target-fenced.

Window animation can produce fractional coordinates. Observation-only settling
waits for authenticated same-process/same-output geometry, without issuing an
input token for fractional geometry. Retry initiation is bounded to one second;
an already-started raster retains its normal completion allowance under a total
five-second ceiling. Predispatch checks and 250 ms input leases are unchanged.
Generic scope/identity failures are not retried, and input is never replayed.
Text and key chords use an owned US virtual keymap without changing the physical
keyboard layout; characters absent from that keymap are rejected before input.
Accessible-field identity is not advertised here; grounded pixel field replacement
and region targeting are available. These are capability limits, not a claim of
arbitrary-application qualification.

## Release owned input and recover

Use **Release owned input** in Computer operator for a retained session. The
administrator-only `POST /api/computer/release_owned_input` is separate from model
tools and the existing process-reconciliation `/recover` endpoint. Its body has
only status `session_id` and `session_generation` (sent as `generation`). It cannot
override target paths, output or trust. Normal authentication/session/host-scope
checks still apply when disabled.

Recovery fences input/capture before awaiting native cleanup, discards old
observations and pauses after a cooperative ACK. Unconfirmed release quarantines
the session. This emergency fence is deliberately permanent for that session:
**close it, then explicitly start a new session with renewed consent and observe
again before acting**. Do not call `resume` on an emergency-fenced session. Close
must report confirmed cleanup before the singleton can be used again. Ordinary
pause/resume remains available without emergency recovery.
`receiver_release_verified: false` is intentional even after a positive ACK.

If Odin/the controller is gone, run this standalone operator command from the
installed Python environment. It contacts the already loaded plugin, not the
dead guardian. It requires neither capture nor an unlocked/focused application.
Set variables from the **previously approved local target record**, not untrusted
discovery. `PYTHON` is the absolute installed Odin-environment interpreter:

```sh
"$PYTHON" -m src.computer.runtime.hyprland_scope --release-all \
  --socket "$APPROVED_SCOPE_SOCKET" --pid "$APPROVED_COMPOSITOR_PID" \
  --uid "$APPROVED_DESKTOP_UID" --executable "$APPROVED_EXECUTABLE" \
  --sha256 "$APPROVED_EXECUTABLE_SHA256" --version "$APPROVED_VERSION" \
  --commit "$APPROVED_COMMIT"
```

Run as the desktop owner or explicitly authorized local administrator. Exit 0
and `release_ack: true` mean cooperative acknowledgment, not receiver proof.
Exit 2/unconfirmed must not be treated as clean. Inspect the desktop. Never blindly
replay input, clear quarantine or repeatedly reload plugins. Existing reconciliation
acknowledgment is an attestation after independent inspection, not a release command.

## Qualification/deployment boundary

### Normal foreground turns

The configured route is the ordinary tool route, not a separate drawing driver:
`computer_session` → lifecycle/integration → controller → native Hyprland runtime.
`computer_observe` delivers explicit-output pixels through the normal native-image
transport. `computer_act` requires the delivered observation and uses the same
durable action IDs, scope fences and post-action image delivery as other backends.
Returned `input_safety` qualifies each persisted Hyprland action/sequence receipt:
cooperative release acknowledgement is best-effort and never receiver proof.
Replaying an action ID returns the receipt only, never new input or new pixels.

Set the explicit target fields above in the **installed runtime's configuration**
before qualification and use its supported config-protected restart flow. With
no `computer` section the existing default is still disabled isolated X11; a
successful separately configured driver does not configure normal turns. Neither
session start nor turn dispatch discovers an ambient target, loads a plugin,
changes compositor settings or falls back to a different desktop.

Backend identity is retained even if native startup fails. A clean failed startup
releases the singleton; missing acknowledgement remains quarantined and retains
the administrator's RELEASE-ALL route. A capture/scope failure after acknowledged
input preserves execution evidence, marks the new checkpoint unverified, and
requires explicit fresh observation instead of replay.

### Operator live acceptance

Unit/contract tests, native builds and API/browser checks are distinct from live
qualification. Announce build readiness first. The host operator then performs
a config-protected branch deploy with `config.yml` and `data/` backed up,
restored and verified intact. Only afterward run a regular-turn drawing task on
Hyprland through the API, inspect actual final artwork and cleanup, then run the
X11 Krita no-regression drawing on its separately configured installation. Record
total GUI input, captures, recovery, elapsed time and verified completion.
Installation does not authorize deployment or live input. Build/fixture success
does not establish either live acceptance result.
