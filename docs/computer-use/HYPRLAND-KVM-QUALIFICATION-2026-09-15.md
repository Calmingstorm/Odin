# KVM qualification campaign, 2026-09-15

## Decision

**Fresh-session managed autoload and automatic discovery across an actual guest
reboot passed in the bounded Python controller fixture.** The four full recovery
capabilities are **not collectively qualified**. Several real positive paths and
required refusals now have receiver-backed evidence; missing matrix cases are not
silently promoted. Production `runtime_qualified` and receiver-verification flags
remain false. No production deployment or workstation access occurred.

The candidate began at `848de637e83eac9e0fbaef2bfbd8d259babf40b9`. The first real
autoload attempt failed on both boots. This commit includes the resulting Python
repairs and test drivers; results below must not be attributed to the unmodified
base. The native tuple was unchanged by the Python repairs.

## Venue, identity and evidence

Only the disposable KVM guest was used: six vCPUs, 8 GiB guest RAM, software-rendered
virtio display, no host DRM/input/display socket passthrough. The QEMU unit denied
host GPU/input nodes and the production installation. A pre-run qcow2 snapshot was
retained. Guest SSH was the independent stop path. Faults affected only identified
guest test processes; the host desktop and powered-off external machine were not
used. Root controller execution retained the existing mapped-image verifier;
the expected compositor and receiver UID was 1000.

Exact native tuple:

| Component | Identity |
| --- | --- |
| Hyprland | 0.55.2, `39d7e209c79d451efab1b21151d5938289da838d` |
| Hyprland executable SHA-256 | `bfb6a200300e09b5929130d831c815242ec87ce98531ea25993a921aa9e2472b` |
| Plugin SHA-256 | `5ec8ca0e48bb403b01baef42c9a72dc192a602437c1c56ce25a7b30685603af2` |
| Companion build ID | `56eaa01959d6a4fe4b6dec1a896965a338ba6cdac846358b5bf00c3a1bde96e6` |
| Guardian SHA-256 | `f89600182181028e428b7b7d74a8d0678d7b73795b791d53b33ae33a851fe580` |
| Capture SHA-256 | `4fb6fd308a0af8dfc21bf11b87b26c91f03aeff34e036d11e9607bf64c63d096` |

Private operator evidence root:
`/mnt/storage/hyprland-lab/qualification-20260915T141156Z/`.
In the tables, **C** means `autoload/controller-live/`, **N** means
`autoload/final-guest-evidence/`, relative to that root. These local evidence files
are not bundled in the public repository. Private capability descriptors remain
in the guest and were excluded from evidence transfer. Public reports redact them.
`autoload/mapped-tuple.txt` includes mapped inode/device and a hash through
`/proc/<pid>/map_files`, not just an on-disk compatibility alias.

## Results by requested capability

| Requested capability | Observed result | Remaining qualification limits |
| --- | --- | --- |
| Task lineage and same-incarnation recovery | **Bounded idle recovery PASS**, C `controller-idle3`: guardian stdin EOF, then real internal controller recovery, 139.5 ms, exact original compositor/plugin/window, generation and consent advance, durable parent-linked grant, fresh pixels and a second receiver click | Explicit internal recovery entry, not natural fault detection. Descriptive task hints, interrupted unknown-release actions, all stale identifiers, cancellation and sequence races not fully exercised |
| Automatic durable output-grant handoff | **Bounded scale-1 handoff PASS**, C `controller-handoff2`: same native window from `Virtual-1` to `QUAL-2`, immutable successor grant, fresh source/pixels and receiver click; about 145 ms | Internal entry, not natural-trigger qualification. Old coordinates could still hit the broad receiver, so the stronger visible-miss requirement is unproved. Scale-2 attempt failed closed. Hotplug/rotation/negative-origin/race matrix incomplete |
| Persisted-descriptor owner takeover, release-only | **Native-provider prerequisite PASS**, C `final-takeover-normal2` and `final-takeover-lost2`, both exit 0: separate original owner, fsynced v2 descriptor, living-owner and bad-authority refusal, retained pidfd exit, eligible successor, durable intent before dispatch, query after unread adoption ACK, release and exact-client retirement | Does not exercise ComputerStore/controller crash rehydration or stop during takeover. Button receiver evidence is not source attribution or held-modifier qualification |
| Incarnation-bound retirement after failed cleanup | **NOT QUALIFIED**. Exact-client retirement after successful reconciliation passed in owner/takeover cases. C `controller-exit2` passed the expected compositor-exit refusal | Clean retirement is not failed/unknown-cleanup retirement. No positive sticky-unknown case. Cross-compositor absence producer/verifier is missing implementation, not missing hardware |
| Plugin autoload + discovery after reboot | **PASS**, C `final-autoload` and `final-reboot`, both exit 0, frozen source, identical config, plugin absent before inventory and loaded automatically afterward, changed boot/PID/start ticks/signature, stale old selection refused, fresh receiver down/up and clean close | Real Python controller/provider fixture; its local authorization callback is not WebUI login/session-auth qualification. No Discord credential or external account was used |

The idle and handoff fixtures call `_quarantine_hyprland` explicitly. They execute
real durable/controller/backend/native code without faking positive replies, but
do not qualify how an ordinary model turn detects and enters that recovery path.
The stale-observation attempts fail at `stale_generation`; they do not independently
test each stale field under otherwise-current metadata. Handoff produced pointer
motion during relocation: only **no extra button events**, not no receiver events,
is supported.

### Native fault prerequisites and refusal boundaries

- **Held input and normal release:** N `recovery-normal`, exit 0. Receiver down
  precedes the guardian SIGSTOP; receiver up follows explicit owner reconciliation.
  Empty-ledger ACK, exact-client retirement and no later button delivery are
  separately recorded.
- **Unread release ACK:** N `recovery-lost`, exit 0. One mutation, then query using
  the same command identity; one receiver down/up pair. Not controller-restart proof.
- **Cooperative SIGTERM during stroke:** N `sigterm-independent` records down before
  the interruption and up afterward. It is bounded cancellation evidence, not the
  full recovery matrix.
- **Compositor exit:** C `controller-exit2`, exit 0. Exact PID/start ticks checked
  before SIGTERM. Backend reports `fresh_target_required`; original pidfd exit and
  local closure are true. Controller remains quarantined/operator-required.
  `released=false`, `resources_retired=false`, `retirement_basis=unproven` remain
  correct. No automatic replacement-window adoption or receiver-release claim.
- **Takeover after unread adoption ACK:** C `final-takeover-lost2` retains the
  command and persists the confirmed successor before release. The query does not
  resend adoption. Both final takeover runs retain the static bad-authority refusal
  without disclosing the capability.

Native owner/takeover guardians exit **1** after deliberate exact-client retirement
and report input-path loss. Driver exit 0 means its expected test observations
passed, not that the interrupted guardian action succeeded. Owner cleanup ACK,
receiver up, retirement, local closure and original action outcome remain distinct.

## Defects found and repaired

1. The adapter requested fictional `j/plugins` and `j/odin-plugin-status` replies.
   The pinned compositor actually provides `j/plugin list` registration metadata,
   with no paths. The repair joins registrations with pinned kernel mappings,
   retains exact mapped-image hashing, and reads companion identity from the
   authenticated incarnation-scoped native endpoint. Load grammar is
   `/plugin load <approved-path>`; uncertain loads are not replayed in-process.
2. A stale compositor directory with a missing command socket discarded the
   entire runtime inventory. Only `FileNotFoundError` now skips that candidate;
   permission/other I/O failures continue to fail closed.
3. Independent review found whole-file ASCII decoding of `/proc/maps` would reject
   unrelated non-ASCII filenames. Both readers now preserve filesystem path bytes;
   ambiguous escaped/deleted candidate mappings remain refused.

Artifact ownership, no-symlink, immutable digest, peer identity, compositor pins,
native epoch checks and recovery gates were not relaxed. No CI gates or baselines
were modified. Harness-only repairs covered fixture storage permissions, observed
modal/postcondition fields, pixel-derived click grounding, guest hostname fences,
private descriptor persistence and hashing-to-mapping identity consistency.

## Failed and missing evidence

Failed attempts are retained rather than overwritten: original two-boot autoload
failures; early controller fixture errors; scale-2 handoff refusal; takeover socket,
environment and fixture errors. The parent final takeover attempt without a
Hyprland instance environment failed before action, then a new run supplied the
explicit native-harness environment. This is not part of automatic discovery.

The complete old narrow corpus still **fails its stale-case exit-code assertion**:
native evidence says `stale-snapshot`, zero submitted input, but guardian exit is 0
where that harness expects 1. The assertion was not weakened and the corpus is
not reported green. A successful independent SIGTERM case does not erase it.

Missing full gates include natural recovery triggers, descriptive task succession
after external cleanup/attestation, controller DB takeover, stop-at-every-await,
late callbacks, held modifiers, simultaneous human same-button conflict, the
complete identity/refusal matrix, stronger coordinate-disambiguation, and positive
retirement after failed cleanup. Aggregate qualification remains false.

## Provenance, review and validation

Final startup pair source is frozen under `autoload/final-tested-source/`, with
per-run `source-hashes.json`, actual process exits and finalizer evidence. Earlier
idle/handoff experiments did not freeze every intermediate harness revision; the
final driver retains those sequences with additional provenance instrumentation.
Do not reinterpret those earlier runs as executed from unmodified base source.

Final takeover driver SHA-256:
`92a972de34e284cccb3a75dcf102f03d656476d43d6ca7a1ac8a11cf12344f8a`.
Its recovery helper SHA-256:
`1748fa459c4e0846d41a9564b7eaa085250a370fc312ce9e6dbae7d254a31086`.
Host and executed guest copies matched. Runtime reviewer `runtime-evidence-review`
independently examined the original successful scenarios and identified the limits
above. Reviewer `final-evidence-check` independently passed the bounded final
autoload, reboot, compositor-exit refusal and two final takeover scenarios. All
five recorded source hashes in the final startup/exit runs match this worktree.
The native scope log is not a complete adoption RPC transcript: mutation/query
counts are supported by executed source and offline tests, while receiver events
independently establish one down/up pair and no later button delivery.

Local base full suite: **20,177 passed, 29 skipped**. Repaired instrumented suite:
**20,259 passed, 29 skipped**, coverage gate findings **0**, 92.8% reported coverage.
Later harness-only tests were also run separately; hosted CI on the final commit is
the final whole-tree verdict, reported with the handoff SHA. Existing warnings,
including asynchronous shutdown warnings, were not suppressed. Lint and type
ratchets reported no new findings. X11 runtime files remain unchanged from base.

Before shutdown the guest had no receiver/guardian processes, native keys/buttons
were zero and the plugin was disarmed. Guest poweroff completed; QEMU exited and
the pre-run snapshot remains. Evidence: `final-guest-state.txt` and host validation.

## What really requires other hardware

None of these logical recovery protocols inherently needs a physical GPU. This
guest successfully ran the pinned compositor, mapped plugin, native receiver,
multiple virtual outputs and reboot faults. Physical GPU/driver scanout quirks,
real connector/EDID hotplug, monitor power and physical HID/firmware interaction
remain outside the lab tuple. Missing orchestration tests or native proof code are
not hardware limitations.
