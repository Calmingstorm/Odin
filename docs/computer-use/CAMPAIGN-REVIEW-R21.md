# Computer-use campaign review R21

Branch-only defect review of the campaign beginning at `cdb92bdf`. No new
interaction lane, compositor support, lifetime extension, automatic replay or
weaker completion/response guard is included. Native experiments use disposable
displays, buses and application profiles, never an operator's existing desktop.

## Priority findings

1. **Field adoption, not merely field text.** Native EditableText can change a
   widget buffer without changing the application's adopted value. Matching text
   now reports `executed`, `text_matches: true`, verification unavailable and
   `application_adoption: unproven`; differing text remains `not_satisfied`.
   Both the private worker and shared effect classifier stop claiming verified
   application adoption. There is deliberately no generic Enter/default-button
   activation or unobserved focus transfer. **This fixes false verification, not
   generic widget commit.** Behavioral tests model a deferred field whose reopen
   restores its old adopted value, plus an explicit-commit positive control.
2. **Long-stroke pacing.** Attached X11 accumulated native guard/round-trip cost
   on top of every requested segment delay. Absolute polyline pacing removes that
   accumulation. Relative click spacing, every native guard, the 1.75-second
   dispatch deadline and two-second lease remain unchanged. A real native
   18-point/0.8-second path under 35 ms per-wait scheduling pressure expired at
   32/37 steps before the fix and completed 37/37 in three consecutive runs after
   it. Both shared and independent XTEST were exercised. A heavier 120 ms delay
   still produces honest partial execution; a 256-point over-budget plan refuses
   before input. No dropped vertices, extended deadline or automatic replay.
3. **Identity replacement inside sequences.** Removed the unconditional refusal.
   Each original-view handle must reconcile uniquely to the same native node,
   root, ancestry and complete metadata in the current capture. It can be
   dispatched within a sequence, but A1's unproven adoption correctly stops
   further steps. This is **not** a claim that a multi-field application commit
   sequence now succeeds.
4. **Unrelated pixels and identity operations.** Native identity replacement no
   longer requires a whole-frame pixel hash match in the controller or private
   worker. Exact target text, role, state, bounds, native ancestry, focus, source
   geometry and lifecycle checks remain. Single and sequence tests reject changed
   or ambiguous identities and unseen/stale frames. No manual crop is required
   merely to exclude unrelated raster changes. Full accessibility output remains
   verbose; a new paging/filtering interface was not built in this bug-fix round.

The first isolated Krita follow-up produced a native window but no AT-SPI
application children. That attempt did not mutate a native field or establish
reopen/adoption behavior. Its failure is not disguised as successful native
qualification. A1's deferred-value regression is behavioral, not a new real-Krita
adoption certificate.

## Additional definitive defects and evidence

| Defect | Correction and behavioral evidence |
| --- | --- |
| Partial dispatch could borrow success from changed pixels or pointer position | The shared classifier rejects contradictory planned/completed counters, native failure reasons and unknown release diagnostics. `test_computer_dispatch_truth_r21.py` exercises the real classifier and preserves no-replay/release facts. |
| Final owned-master constructor census escaped cleanup | `SessionXTest` now closes handles and invokes its exact-owned startup cleanup on final census failure. Native fault injection proves topology returns to the pre-create baseline. |
| Sequence aggregate invented `injected: true` for unknown dispatch | Tri-state aggregation distinguishes confirmed injection, confirmed no injection and unknown. Unknown attempted-step receipts remain unknown after durable replay. |
| Region verification overwrote failed native application evidence | Local raster comparison now requires confirmed injection/release and matching native application evidence. Five regression failures before the fix, including a controller dispatch/recapture case; seven cases pass afterward. |
| Inspector sent legacy acknowledgment to descriptor-only recovery route | It now selects the existing `acknowledge_legacy` route for missing-runtime-identity records. Browser regression exercises actual UI interaction and preserves unverified cleanup wording. |
| Hung status request blocked a kept-alive inspector after navigation | Leaving retires/aborts the owned request; reactivation obtains fresh status and ignores the retired response. Browser regression uses a deliberately withheld response. |
| Private desktop text reached terminal audit and live fan-out | Computer audit output is now a bounded content-free tool outcome; exception output is restricted to internal codes. Actual persisted audit and callbacks contain no synthetic private document sentence; model evidence, call attribution and one terminal record remain. Audit outcome is tool status, not semantic application verification. |
| Package smoke's negated command checks did not assert absence | Explicit failing assertions replace `! command -v` under errexit. Executed Bash regressions prove a present forbidden command stops the script and a missing command continues. |
| Store construction failures leaked directory FD/SQLite connection | Constructor cleanup covers connection and schema initialization failures. Tests use actual descriptors/connections and verify closure. |
| Cancelled unit-control probe left its child running | Supervisor finalization kills/reaps the exact owned child on cancellation and error, not only timeout. A disposable real process is absent afterward. |
| Authority-watcher failure hid tools without revoking the controller | Failure also disables the retained controller and attempts cleanup. Tests verify revocation even when the cleanup attempt itself raises. |
| GNOME/KWin scope connection could lose ownership during authentication/Hello | The bus is retained before awaiting connection; cancellation/failure finalizes owned socket/stream/readers. Real private Unix endpoint and D-Bus daemon tests verify EOF, closed descriptors and removed loop readers. |
| Stop during post-start authorization could be overwritten by activation | Generation/state is checked after asynchronous authorization. Gated concurrent-stop regression cannot resurrect the session. |
| Post-resume authorization/capture failure left resumed backend authority | Cleanup now covers the complete resume transition. Denial, cancellation and capture failure all stop/revoke the backend. |
| Pause returned a stale paused grant after concurrent stop | It returns the current persisted grant. Gated pause/stop regression reports the actual cancelled generation. |
| Repeated qualifier cancellation skipped pidfd closure or returned before cleanup | Cleanup is owned and settled before releasing the descriptor and preserving cancellation. Real descriptor and repeated-cancellation regressions verify ordering and closure. |
| GStreamer NULL-state failure was treated as successful capture cleanup | FAILURE becomes a recorded cleanup error; descriptor cleanup remains unconditional. A successful frame followed by failed pipeline teardown cannot report success. |
| EIS socket-construction failure leaked the transferred descriptor | Failed construction closes the raw owned FD; real ENOTSOCK/EBADF regression confirms it. |
| Previous X11 topology watcher census could certify a later detach | Every new watcher clears previous evidence; a failed current census invalidates previous success. Pause/resume/failed-current-census tests remain quarantined and unverified. |
| Legacy X11 STRING titles/classes were decoded as UTF-8 | Declared STRING uses strict Latin-1, UTF8_STRING uses strict UTF-8; modern title type and malformed/unsupported inputs still fail closed. Protocol behavior tests cover each. |
| Normal native modal=False bypassed focus settling | Existing bounded settling accepts False as well as absent modality. Sequence checkpoints still surface sampled excursions; modal changes still interrupt. |

These corrections are deliberately local. A bounded review cannot establish that
no other defect exists.

## Review coverage

The parent and isolated reviewers covered core controller/session/sequence/store/
manager/integration/admission/policy paths; geometry, models, provenance, effects,
rendering, vision and action schemas; native accessibility discovery/restoration/
dispatch/readback; X11 application scope, attached workers, topology, native input
and cleanup; isolated worker/profile/protocol/supervisor/export provisioning;
Wayland backend, scope, compositor identity, portal, qualifier and guardian
lifecycle; web APIs/bindings, Computer UI/configuration, audit/log deduplication;
and package manifests, hooks, helper build and smoke procedures.

An independent read-only review traced foreground object identity, native frame
transport, controller delivery, final model-request frame protection and checkpoint
retirement. It found no additional definitive defect. Captured-but-undelivered
frames still cannot authorize input, and replayed receipts never issue new pixels.

## Install/upgrade and quality status

Starting-source empirical package evidence and limitations are recorded in
[PACKAGING-R21.md](PACKAGING-R21.md). The improved smoke exercises the installed
native worker, not merely executable presence. Systemctl is a recording stub, so
neither real service activation nor real Wayland portal input is certified by it.

The frozen integrated runtime for the final gates is
`67b764b5e0a6c407fae6b863d605b7ea6d81725c`. Full-suite coverage, local CI-equivalent
checks and exact-source package reruns are pending at this report checkpoint.
Focused tests are not substituted for those final results. The coverage baseline
is unchanged. Both reference generators were run; their generated files were
unchanged. UI changes include a rebuilt distribution in the same commit.

## Deliberately not built

* A new accessibility paging/filtering API or new element-action vocabulary.
* Toolkit-specific commit automation, implicit dialog acceptance or generic
  application-adoption inference. These need separately grounded effects and
  evidence, not a text-equality shortcut.
* New pointer modes, remote desktop transport, compositor lanes or session renewal.
* Any automatic replay, relaxed lifecycle gate, completion classifier workaround,
  response-guard change or unrelated refactor.

No master merge, hosted pipeline, deployment or live-service restart is part of
this round. Existing desktop applications and documents were not targeted.
