# R23 shared-X11 release qualification

## Resolution and limits

The qualification gap is resolved by narrowing claims, **not** by establishing a
new server-side guarantee. Cooperative cancellation/controller EOF and injector
failure can be handled by a surviving guardian. Abrupt death of the sole shared
guardian loses its input ledger. The native consequence is untested, and there
is no proven universal server-side held-input release guarantee on that path.

No desktop, X server, input injection, destructive failure experiment, deployment,
service restart, UI change, admission change or completion-classifier change was
used for this work. This is not native crash qualification or overall release
approval. B1/B2 and integrated release gates are separate work.

## Audited surfaces

| Surface | Finding and disposition |
| --- | --- |
| All three tool definitions and their property descriptions in `src/tools/defs/computer.py` | Session release wording and action/sequence continuation wording now distinguish confirmed cleanup from abrupt shared-guardian loss. Observe has no release guarantee and is unchanged. |
| `BackendCapabilities.public()` in `models.py` | A shared attached X11 `owned_input_release=verified` now carries explicit surviving-guardian and unproven-abrupt-loss limitations. The verified value and admission semantics are unchanged. No caveat is applied to isolated, independent or Wayland paths. |
| `X11AttachedBackend.input_limits` | Static shared-X11 release and abrupt sole-ledger-loss qualifications accompany runtime status/start/observation limits. |
| `x11_guardian.py`, `x11_attached.py`, `x11_session_lifecycle.py`, recovery and effects receipts | Existing missing/nonzero/malformed guardian-receipt handling already marks release unverified. `no_inflight_input` is a worker-dispatch fence, not server-held-state proof; its source comment and operator explanation now state this. No cleanup boolean or classifier was weakened. |
| `OPERATOR.md`, `RECOVERY.md`, `CONTRACT.md`, `LOCAL-DEPLOY-TESTING.md`, `computer-sequences.md` | Explicit cooperative/acknowledged versus abrupt sole-ledger-loss boundary; no universal server-side guarantee, no replay, no live-desktop crash experiments. |
| `DECISIONS.md`, `R16-COEXISTENCE-ASSESSMENT.md` | Historical broad lease/release wording qualified; a possible held-state consequence is not represented as a measured abrupt-guardian-death result. |
| Other X11 historical evidence and cleanup documents | Existing helper-failure measurements, process-absence limits, and uncatchable-owner-loss exclusions are not evidence of a universal guardian-death guarantee. Historical measured results were not rewritten as new tests. |
| README, computer-use index, static tool-reference index, UI source claim search | No unconditional shared-X11 worker-death release claim found. Existing operator/recovery links remain. UI untouched. |
| Generated `docs/reference/tools.md` | Regenerated and checked. Byte-identical because the static generator explicitly excludes the three dynamic computer tools and links to the updated operator reference. |

## Safe regression evidence

`tests/test_computer_shared_release_claims_r23.py` adds 11 tests. Native subprocess
creation is denied by default; individual cases substitute inert in-memory
transports. A negative return code is a fixture, never a signal sent to a process.

- Stub EOF after guardian loss, malformed reply and nonzero exit despite a partial
  positive receipt all retain unknown input and quarantined cleanup. Repeated
  detach and an unchanged hierarchy cannot manufacture release.
- Acknowledged shared release retains clean detach; acknowledged failed release
  stays quarantined even with `no_inflight_input=true`. No native kill/terminate
  recovery is attempted in the loss cases.
- Same-boot process absence with shared input enabled still yields
  `owned_input_release_unproven`.
- Tool/runtime caveats are present; verified capability remains verified with
  explicit shared-X11 limitations, without attributing them to other paths.

Final focused suite: **334 passed**, including adapter, guardian, cleanup/store,
recovery, admission and sequence regressions. Baseline `42452265` in an isolated
source archive ran the same 323 existing tests: **323 passed**. Four-module focused
coverage improved from **1156/1713** statements to **1161/1715** statements, with no
per-module drop. This is focused coverage, not a full-suite coverage claim.

Ruff check and format-check passed for all five changed Python files. Generated
tool-reference drift check and `git diff --check` passed. Integrated full local
CI is the parent task's gate; no hosted CI or push was performed here.
