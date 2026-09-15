# Hyprland automatic plugin loading: build trust, not recovery qualification

This contract concerns a **fresh session after boot**. It does not resume an old
task, reconcile held input, or qualify any of the four recovery capabilities in
[the recovery lab plan](HYPRLAND-RECOVERY-QUALIFICATION-PLAN.md).

The source build emits a schema-2 `build-identity.json` with explicit
`auto_management_approved: true`. This approves managed loading of that exact
build, not its behavior after faults. `runtime_qualified: false` remains honest
build metadata. The load approval object does not expose or consume that field as
authority, and no recovery capability changes as a consequence of loading.

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
