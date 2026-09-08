# Computer-use build round R19

Campaign branch only. No master merge, tag, release, hosted pipeline, deployment
or service restart is part of this round. Local CI-equivalent checks are not a
claim that hosted CI ran. Real-session qualification requires the operator's
separate gated deployment. Disposable native fixtures never target an existing
user session.

## Defects and changes

1. **Qt accessibility discovery.** Nonvisual Offscreen roots no longer crash
   Component reads. Top-level selection uses same-process, visible, modality and
   exact native geometry evidence, with complete root enumeration before claiming
   uniqueness. Toolkit title suffix differences do not substitute for identity.
   Deferred breadth traversal retains reachable fields, deprioritizes hidden or
   resource/menu subtrees, and prioritizes visible controls within bounded work.
   The GI Text interface is invoked explicitly to avoid an Accessible accessor
   shadowing the text getter. Captures retain node/root/ancestry identity.
2. **Long-stroke dispatch.** The first move's measured latency included cold helper
   startup. Multiplying that one-time cost by all remaining vertices caused the
   observed 1/35-step refusal before the actual dispatch budget expired. A no-effect
   ready acknowledgement separates startup from per-step sampling, inside the
   existing nonrenewable lease. Dispatch and held-input limits are unchanged.
3. **Sequence completion.** Continuation vetoes no longer retroactively fail the
   final verified step. Attached keyboard raster policy agrees with ordinary
   actions while exact native focus/source binding remains mandatory. An expected
   final native dialog returns an inspectable view; no subsequent preplanned step
   enters a newly opened dialog.
4. **Stroke verification.** General raster change is no longer labeled semantic
   mark verification. Completed strokes report executed input plus localized,
   distributed path evidence. Bounded polyline batches can continue only with
   complete dispatch/release diagnostics, supported path evidence and unchanged
   original next anchors. Results require visual review. Missing evidence,
   partial dispatch and actual target changes still interrupt, without replay.
5. **GIMP dialog appearance.** GIMP's color dialog can lack a transient chain.
   Post-release verification accepts complete new-map evidence with matching
   native process/source/topology and a focused safe dialog/menu. This is not a
   relaxation of pre-input application scope.
6. **Cleanup certificates.** Shared-mode unsupported/not-applicable checks are
   null with bounded explanatory labels, rather than invented false values.
   Negative measurements invalidate completeness. The controller honors the
   persisted certificate before dropping its adapter. Wayland also requires its
   portal connection to close.
7. **Receipt size.** User-facing sequence results compact repeated successful
   evidence while preserving per-step IDs, status, failure diagnostics and visual
   review requirements. Complete durable records remain private and unchanged.
8. **Live Logs.** Explicitly correlated start/execution/end events produce one
   displayed row across tool families and execution routes. Unidentified historical
   records are not guessed together. Canonical output and failures survive, and
   original events remain inspectable. UI source and rebuilt distribution ship
   together.
9. **Interrupted tasks.** Cancelled primitives retain strong ownership until actual
   completion. Watchdogs are drained within a bounded window and cannot cancel
   themselves through their own stop worker. Cancellation-resistant coroutines
   remain diagnosed, not silently garbage-collected or claimed settled.
10. **Lifetime.** The default is unchanged. See
    [SESSION-LIFETIME-PROPOSAL.md](SESSION-LIFETIME-PROPOSAL.md) for explicit,
    human-approved renewal with separate lifetime revision, atomic expiry changes
    and renewed observation delivery. This is a proposal, not implemented input
    authority.

## Additional native integration findings

Real Krita exposed gaps that synthetic tree fixtures could not establish:

* Hidden dockers exhausted the old discovery budget before toolbar fields.
* Hundreds of redundant full native scope checks exhausted the one-second
  read-only discovery/stability budget. Per-node deadline checks now remain cheap;
  full scope checks bracket discovery and stability, and the final raster binding
  still must match. Input/guardian checks are unchanged.
* Replacement previously rediscovered every node under the short input lease.
  A private observed enumeration route now locates the candidate efficiently.
  The route is only a lookup hint: native identity, root identity, metadata,
  fingerprint, real ancestry, process and source bounds must still match before
  the effect. Tampered or equal-looking replacements are rejected.

## Behavioral evidence recorded so far

* Native disposable-Xvfb dispatch reproduces the old 17-point, 0.8-second failure
  and completes 35/35 steps in three runs after the fix. The receiver observes
  one press, all 16 held-motion vertices in order, and one release. This proves
  dispatch, not application brush semantics.
* An actual isolated GIMP color-dialog probe confirms the missing transient chain
  and successful new-map qualification. Controller integration is separately
  tested with inert native boundaries.
* Real isolated Krita controller operations have verified size `40.00` to `4.00`
  pixels and opacity `100` to `75` percent by identity with exact native readback.
  Remaining end-to-end qualification and final integrated gate results are
  recorded below when completed, not inferred from these partial checks.
* Fresh-delivery tests reject copied, unseen, stale, mismatched and replayed
  post-action frames. Partial action receipts cannot reissue input or images.
* Five-stroke receipt plus final image prompt remains below 8,000 UTF-8 bytes in
  the regression fixture. Real task payloads still depend on observed metadata.

## Quality accounting

The unchanged baseline round began with 171 failed tests, 14,660 passed and six
skipped. Its 16 coverage findings included wholly untested sequences. Whole-repo
Ruff found 322 issues, although the narrower existing CI lint gate passed.

The first consolidated gate completed at `ff04e9af` with 15,268 passed, 24 failed
and six skipped. Those failures exposed remaining legacy fixture/source-string
assumptions; each was repaired against executable behavior, not blanket weakened
expectations. Coverage had one remaining new-file finding at 84.54 percent in the
attached adapter. Additional behavior tests raised its focused union above the
unchanged 85-percent threshold. This first gate is **not** a passing certificate.

The coverage baseline and ratchet are unchanged. Public historical evidence paths
are symbolic and not shipped artifacts. Source/fixture formatting and generated
references were refreshed. No recognized credentials or coauthor trailers were
found by the bounded hygiene checks. Broad async shutdown warnings observed in the
full suite are not equivalent to the demonstrated computer-task ownership defect;
no global zero-warning claim is made.

Final full-suite/coverage results and real-session qualification remain pending
until explicitly recorded. Do not treat branch availability as deployment or
product qualification.
