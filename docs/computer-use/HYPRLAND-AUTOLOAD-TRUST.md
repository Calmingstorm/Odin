# Hyprland automatic plugin loading: build trust, not recovery qualification

This contract concerns a **fresh session after boot**. It does not resume an old
task, reconcile held input, or qualify any of the four recovery capabilities in
[the recovery lab plan](HYPRLAND-RECOVERY-QUALIFICATION-PLAN.md).

The source build emits a schema-2 `build-identity.json` with explicit
`auto_management_approved: true`. This approves managed loading of that exact
build, not its behavior after faults. `runtime_qualified` and the optional
`runtime_qualification_scope` describe separately recorded bounded recovery
evidence. The load approval object does not expose or consume either field as
authority, and no recovery capability changes as a consequence of loading.
The separate retirement runtime checks an exact qualified native tuple, including
the live guardian image digest. An approved but unqualified build still loads;
it does not inherit the retirement capability. The build script similarly emits
qualified metadata only for an exact entry in `runtime-qualified-tuples.txt`.

## What actually gates loading

Successful compilation alone does not admit a scratch artifact. Provisioning must
install the manifest and ELF under root-owned, non-group/world-writable paths,
without symlinks in either path. The loader then requires all of:

- schema 2 and the literal boolean `auto_management_approved: true`;
- the exact content-addressed `odin-hyprland-scope-<sha256>.so` filename and digest;
- the manifest's Hyprland version/commit matching the authenticated compositor;
- immutable artifact verification before loading;
- the exact mapped ELF inode and hash in the pinned compositor;
- its instance endpoint reporting the matching companion build ID.

The existing installed layout is supported without a packaging change:
`/usr/local/share/doc/odin-hyprland/build-identity.json` resolves the named ELF only
under `/usr/local/lib/odin`. Other explicitly selected manifests resolve a sibling
ELF, subject to the same trust checks. Managed activation still enforces the
production `/usr/local/lib/odin` artifact root; sibling scratch manifests are not
a bypass. JSON cannot supply another artifact path. The compatibility ELF alias
is not an approved content-addressed artifact.

The manager inspects before loading. An already loaded exact artifact is verified
without another load command. A lost load ACK causes an inventory query, not a
blind resend. Readiness still fails if mapped-image or companion identity cannot
be proved. Native target selection, current consent and fresh observation are
separate requirements; auto-loading does not grant input authority.

The pinned Hyprland 0.55.2 command protocol is `j/plugin list`, whose response is
an array of registration metadata, not filesystem paths. The adapter joins that
registration with the pinned process's actual `maps`/`map_files` identities;
neither a plugin name nor a `dlopen` handle supplies path authority. Loading uses
`/plugin load <approved-path>`. Executing companion identity is read from the
authenticated, incarnation-derived native scope endpoint, not a fictional
HyprCtl status command. Root mapped-image inspection is required even when the
configured compositor UID is an ordinary desktop user.

An unconfirmed load remains fenced against replay within the running manager
process, including later manager instances. This is not a durable load-attempt
journal across an Odin process restart. After compositor replacement, discovery
ignores an old instance directory only when its command socket is absent;
permission and other inspection errors still fail closed.

Schema-1 manifests are intentionally not silently promoted: their recovery boolean
did not explicitly attest build auto-management. Rebuild and provision the schema-2
manifest alongside its matching artifact through the normal reviewed deployment
flow. Do not flip `runtime_qualified` to repair loading. A build command does not
install, load, or contact a desktop, and this change does not deploy anything.

Fresh-install configuration uses auto discovery and managed activation. Explicit
manual opt-out remains available with `hyprland_managed_activation: false`.
The guest qualification drivers under `scripts/computer-feasibility/` collect
bounded evidence separately. They introduce no production qualification override.

## Controller identity and packaged-service limits

Managed activation runs **inside the Odin controller process**. Its mapped-image
verifier requires effective UID 0, including when the compositor runs under the
same desktop UID as Odin. Running Odin as that ordinary desktop user does not
satisfy this requirement. `computer.runtime_sudo` only provisions other runtime
launchers; it does not elevate Hyprland discovery or this in-process verifier.
There is no privileged Hyprland verification broker in this implementation.

The packaged `User=odin` service therefore does **not** support managed activation
as shipped. The supported managed-loading deployment is an explicitly provisioned
root controller with permission to inspect the pinned compositor's `/proc` maps
and `map_files`, a configured desktop `wayland_uid`, and the approved root-owned
compositor, manifest, and content-addressed plugin described above. Root alone
does not bypass procfs restrictions, build trust, consent, or target selection.
The qualification drivers use this privileged deployment, not the packaged
service. Do not silently change the service user or broaden sudo policy to repair
a desktop task.

`hyprland_plugin_root_required` means the controller is not effective UID 0.
Cross-UID discovery can fail earlier as `hyprland_discovery_not_found` when procfs
inspection is denied. Check the configured controller identity and procfs access,
not just the desktop UID. An operator must either separately authorize and
provision the privileged deployment, or explicitly select manual loading with
`hyprland_managed_activation: false` and provision the companion independently.
Manual mode does not fix discovery permissions or qualify an untested deployment;
it remains subject to native identity, scope, and input admission checks.

The default remains **true** to preserve the requested automatic-loading policy.
An unsupported controller identity fails closed; Odin never silently downgrades
managed loading to manual mode or weakens mapped-image verification.

## Native topology digest compatibility

The current native topology and inventory digest preimages use the literal
two-character separator `\0` (backslash and zero), not a NUL byte. These are
opaque equality tokens, not a serialized field format consumed by Python. This
documents the existing behavior; it does not change the audited plugin source,
image, or qualified digest tuple. Changing the separator would require a new
native build and explicit parity/qualification work, not a cosmetic correction.
