# Cross-compositor retirement: final KVM evidence, 2026-09-15

## Exact-tuple hardening addendum

The earlier final tuple below was superseded by the final exact-tuple campaign.
The retained, public-safe evidence is
`/mnt/storage/hyprland-lab/cross-retirement-20260915T155653Z/exact-final2-public.tar.gz`
(SHA-256 `47547263837b2fa63d5dd40ca27f5fd52c58118089ca68ddda91254a0240189a`).
Private databases and capability/owner-descriptor material are excluded.

The final shipping-default guest driver exited **0** without `--provisional`.
It enforced this exact native qualification tuple:

| Artifact | SHA-256 / identity |
| --- | --- |
| Hyprland executable | `bfb6a200300e09b5929130d831c815242ec87ce98531ea25993a921aa9e2472b` |
| Plugin | `51330a77e1fd88a8862bbd5930ed3651c0fa3adba9173fdb8eeb13de27f27a55` |
| Companion build ID | `943217433d52f0b5a4fd92f4bce6f41bc37a73cefee32813acff3c1a4c3d8fdb` |
| Guardian | `f89600182181028e428b7b7d74a8d0678d7b73795b791d53b33ae33a851fe580` |
| Capture | `4fb6fd308a0af8dfc21bf11b87b26c91f03aeff34e036d11e9607bf64c63d096` |

`exact-final2` proved the narrow same-boot retained-original-witness case:
held input was issued before compositor death; guardian release then became
unknown (`input-path-lost`, no release submission or acknowledgement); the
original resources retired through real native resource-absence evidence;
`runtime_qualified=true`; durable state became `fresh_target_required`; old
observation/action authority refused; and the independently authenticated new
receiver had zero button events. Direct native proof verified exactly once;
the predeath, changed-successor, and missing-local-closure negative paths all
refused. Recovery took `0.5891971420001028` seconds.

The first exact-final run correctly refused because the typed witness had not
yet propagated its exact qualification to the live coordinator. It is retained
as `exact-final1`, not claimed as success. The narrowly scoped backend
propagation repair produced the final `exact-final2` pass. Final source evidence
contains 14 files and was compared against the frozen worktree with **zero
hash mismatches**. The guest then powered off cleanly: QEMU `Result=success`,
main exit 0, inactive/dead, and its local SSH forward was absent. No host
desktop, external host, or production deployment was touched.

## Decision and scope

**PASS for `same-boot-retained-original-witness-v1`.** Final native artifact rebuilt
after the bounded qualification flag change; final controller run used shipping
defaults without `--provisional`. Includes the scope-job drain closure repair.
This is a disposable KVM qualification fixture, not a production deployment.

The fixture invokes a real guardian held stroke, then explicitly enters the real
controller recovery method. It is not natural fault-detection qualification and
does not test persistence of an original controller action row. Unknown cleanup
is real native/local failure after compositor death, not an artificially marked
native sticky-unknown ledger.

## Final tuple

| Artifact | SHA-256 / identity |
| --- | --- |
| Hyprland | 0.55.2, commit `39d7e209c79d451efab1b21151d5938289da838d` |
| Hyprland executable | `bfb6a200300e09b5929130d831c815242ec87ce98531ea25993a921aa9e2472b` |
| Plugin | `ab0e752b2738166f2f8ce74a7781801ed8d86aa40f539e16cc42c88daaf37ee3` |
| Companion build ID | `4ea087854f6f5a49a05db221cbcf35786c43545927bc164f82079c5e175d9471` |
| Guardian | `f89600182181028e428b7b7d74a8d0678d7b73795b791d53b33ae33a851fe580` |
| Capture | `4fb6fd308a0af8dfc21bf11b87b26c91f03aeff34e036d11e9607bf64c63d096` |
| Guest compiler wrapper | `d01f5c174f032609ad907fc0b743e0096cdd9afc6d5222aeac1493875bd09b9f` |

Manifest: schema 2, `runtime_qualified=true`, qualification scope
`same-boot-retained-original-witness-v1`. Managed activation retained mapped-image
authentication and native approved-build matching. No identity guard was replaced.

Clang 19/libc++ uses the pre-existing guest-only wrapper. It omits Clang's unsupported
GCC `-fno-gnu-unique` argument and demotes four pre-recorded warning classes. The
17 warnings include external headers and plugin public API C-linkage return types.
Final ELF has no GNU UNIQUE symbols. This is not a claim that the default packaging
command builds portably unchanged; no production `-Werror` gate was weakened.

## Evidence

Private local root:
`/mnt/storage/hyprland-lab/cross-retirement-20260915T155653Z/`.
Final run `final2`, driver exit **0**, native build `native-build-final.log`, tuple
`final-build-tuple.txt`. `final2/source-hashes.json` matched the worktree with zero
drift at collection. Private databases, capabilities and owner descriptors were
excluded from host evidence transfer. Public evidence contains certificate digests,
not certificate authority.

1. Fresh original native receiver and real controller session/observation. Delivered
   receiver pixels ground a scale-1, unrotated, zero-origin 120ms stroke.
2. Receiver down is observed before exact-identity guardian SIGSTOP and original
   compositor SIGKILL. Guardian SIGCONT permits EOF handling and local reap.
3. Guardian reports `input-path-lost`, `input_was_sent=true`, `release_sent=false`,
   `release_acknowledged=false`, release unknown, local resource closure complete.
4. Guest compositor service restarts; resolver independently authenticates a new
   compositor identity in the same boot. The replacement does not testify about
   the old ledger.
5. Original-successor and missing-local-closure proof requests refuse. Direct real
   proof verifies once; second verification refuses. Preliminary predeath refusal
   uses the original as successor, so it does not independently isolate the living
   process guard. Offline tests carry that separate negative matrix.
6. A new receiver exists before explicit controller recovery and receives no button
   events. Real `_quarantine_hyprland(..., phase="unknown_release")` invokes the
   backend, coordinator, producer/verifier and store without positive reply mocks.
7. Recovery takes **0.673702116 seconds**. Result and durable status preserve:
   `resources_retired=true`, `retirement_basis=native_resource_absence`,
   `runtime_qualified=true`, `released=false`, `release_ack=false`,
   `unknown_release=true`, `receiver_release_verified=false`, and
   `original_outcome=outcome_unknown`.
8. Durable status is `fresh_target_required`; original session remains quarantined.
   Both old observation and old action refuse. New receiver still has zero button
   events. No old action is replayed and no new input authority is fabricated.

Final post-fault validation: **2/2 PASS**, guest compositor and QEMU healthy.
After evidence collection, the guest compositor stopped and guest powered off
gracefully at the parent's request. QEMU reported `Result=success`, exit 0,
inactive/dead; port22226 absent. Cleanup validation **3/3 PASS**. Both pre-campaign
snapshots remain. Final post-shutdown source comparison matched all 14 recorded
runtime/driver/native source hashes with zero drift.
Earlier provisional4 and provisional5 also pass; provisional5 adds direct proof
and single-use verification. Final1 also passed, then final2 repeated after parent
updated Python annotations, against the unchanged native tuple and shipping defaults.
Failed preparation attempts remain retained:
root storage under a lab-owned ancestor refused; root-opened inherited receiver
connection correctly failed native-UID candidate admission; immediate discovery
before compositor startup refused. Corrected fixture uses root-private evidence,
receiver-UID socket creation and settled compositor readiness.

## Safe reproduction venue

Only the existing disposable guest is authorized. Host resume instructions remain
`/mnt/storage/hyprland-lab/resume-guest.sh`: six vCPU, 8 GiB guest RAM, 11 GiB cgroup
cap, software virtio display, no host GPU/input/display socket passthrough; host
desktop and `/opt/odin` inaccessible. Guest SSH through local port22226 is the
independent stop path. Preserve an offline qcow2 snapshot before a new campaign.
Do not start a second QEMU process against the same disk or use a workstation.

Guest checkout: `/home/lab/qualification-cross-retirement-test-checkout`.
Build with `CC=clang-19`, `CXX=/home/lab/clang-libcxx-wrapper.sh`, prefix bin/library
and pkg-config paths under `/home/lab/lab-build/prefix`, using
`scripts/build-hyprland-input.sh` into an absolute scratch build directory. The
full pinned compositor/dependency build is unnecessary for a plugin-only change.

Guest-only `/usr/local/lib/odin` contains root-owned non-writable immutable plugin
filenames, guardian/capture and manifest. Stop only the guest test compositor when
replacing them; restart `odin-qualification-compositor.service`, wait for real
resolver readiness, then run the new driver as guest root with
`/home/lab/qualification-venv/bin/python`. Choose a new evidence directory under
`/root/cross-retirement-evidence`; do not reuse failed directories. Omit
`--provisional` for final shipping-default qualification. Preserve receiver and
failure logs; never transfer raw recovery capabilities.

This record establishes no controller-restart witness reconstruction, cross-boot
retirement, same-button human-source guarantee, arbitrary application qualification,
receiver-release proof, or automatic action replay.
