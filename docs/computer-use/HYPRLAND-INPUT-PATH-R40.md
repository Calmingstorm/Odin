# R40: popup scope refusal, not virtual-device lifetime expiry

## Observed failure

The R40 request reported sustained-use `wayland_guardian_input_path_lost` after
several successful actions. The raw Clippy journal at 2026-09-08 22:38:39 UTC
instead records `scope-evidence-expired`, three planned/locally queued events,
`input_was_sent=true`, and explicit release sent and acknowledged. The generic
Python error is not proof of a Wayland socket or virtual device disappearing.

The stored pre-failure view shows Pinta's fill-style menu, with `Nur Füllung`
under the requested point (319, 116). The failed action did not paint the hood.
Its following sequence steps were not dispatched.

## Direct reproduction against the unchanged R39 plugin

Three explicitly inspected, individually grounded diagnostic clicks were made
on Clippy, each in a fresh manually supervised backend session. The original
production guardian reproduced the failure on its **first action**, with the
same three locally queued events, confirmed release and scope failure. This
rules out a required ninth/sixteenth-action threshold for this reproduction.

Two scratch-only diagnostic guardians isolated the compositor's raw scope
replies. The final probe added a Wayland synchronization and read-only scope
status request immediately after the absolute motion, before either button
request. It did not modify the plugin, lease, input gate or release policy.

Raw status sequence, compositor local clock (UTC+02):

| Time | Native reason | Accepted | Rejected | Armed |
| --- | --- | ---: | ---: | --- |
| 00:55:56.160080 | armed | 29 | 9 | true |
| 00:55:56.160985 | warp-focus-postcondition-refused | 30 | 10 | false |
| 00:55:56.161188 | scope-expired-or-changed | 30 | 12 | false |

The warp refusal is **0.905 ms after ARM**, not a keepalive or idle timeout.
The subsequent two button requests are refused because scope has already been
revoked. Cleanup confirms zero owned keys/buttons and release acknowledgement.
No Wayland reconnect or input replay was used as recovery.

The native guardian counts locally queued protocol requests, not compositor
acceptance. Its rejection-counter check deliberately fails the action. Python
then closes the owner and labels the dispatch exception
`wayland_guardian_input_path_lost`. That label collapsed the cause into its
consequence. No timing change or lease extension is justified by this evidence.

## Scope correction

The previous plugin required the pointer's actual destination to equal the
bound root toplevel surface. A native popup is a different Wayland surface even
when it is Pinta's own visible menu. Root-only warp postconditions and subsequent
button/axis/motion checks therefore rejected the menu target.

The correction is in the **scope plugin and its provenance helper**. It admits
only live, mapped native `xdg_popup` ancestry ending at the exact observed root,
with the same `wl_client`, consistent back-links, bounded acyclic ancestry and
unchanged geometry. It does not admit arbitrary same-client toplevels,
subsurfaces, foreign clients or out-of-window coordinates. Exact pointer focus,
original root/window/process/output identity, scope deadlines and owned release
remain enforced. A surface transfer still requires the existing one-shot owned
warp with no held input. Partial work is never replayed.

Sticky map/unmap/destroy/reposition/dismissal and geometry-change watchers
invalidate the observation revision, including existing unmapped popup objects.
Lifecycle watching is deliberately broader than admission within the root's
bounded `xdg_wm_base` collection; it does not grant unrelated popups input.
Other `xdg_wm_base` bindings and collections over 256 surfaces fail closed.
The maximum ancestry is 33 nodes. Popup areas beyond the root rectangle remain
unsupported. Independent review caught and corrected the unmapped-popup watcher
gap before deployment.

The production guardian, X11, libei, locks and Python dispatch are unchanged.
The scratch diagnostic binary was removed after the reproduction. It is not a
shipping artifact. The broader generic exception-label issue is not represented
as fixed by this scope-only change.

## Evidence and boundaries

Final focused validation: **226 passed, zero failed/skipped**. This includes the
real native wire binary against isolated socket peers, the extracted coupled
warp/focus harness (including observed popup entry), ancestry and lifecycle
contracts, and X11 regression tests. Initial extracted harnesses required stub
updates for the new destination API; their original negative cases remain.
The lifecycle listener checks are source contracts, not a live map/unmap race
test. Full production native bundle compilation passed with warnings as errors.

Final companion build ID:
`2923222a45c7926e0d56e99a6103fa62b2f1482ccbc75344814afc20c058a906`.
Versioned plugin SHA-256:
`ec1b43590be18ca37ecf738770fcc2eef1004213423464143f9d2c9ab96a1592`.
The build manifest retains `runtime_qualified=false`; live acceptance is separate.

Private evidence: localhost `/tmp/odin-r40-evidence`; Clippy
`/home/Uncraftbar/odin-r40-{reproduce,diagnostic,warp-diagnostic}`.
Raw wire files contain scope tokens and must not be published. The table above
is the bounded sanitized status evidence, not raw wire content.

Diagnostic accounting: **3 manually grounded click attempts, 3 observations,
9 native captures, no recovery/replay calls**. Individual session elapsed times
were 41.446 s, 64.019 s and 64.508 s. All three closed cooperatively with release
acknowledged. Pinta, compositor and live service PIDs were unchanged throughout
diagnosis; zero orphaned Odin devices remained.

This report does not claim the original avatar drawing completed, arbitrary
popup/application qualification, or a successful sustained live acceptance run.
Claudia owns the post-deployment reconciliation and acceptance test.
