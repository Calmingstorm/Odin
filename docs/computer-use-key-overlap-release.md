# Shared X11 key-overlap release boundary

Slice 5, based on `6fb8e577`. This change is prospective only. It does not
reconcile, clear or resume an existing quarantined session, including Live6fb8e577.

## Observed source path

The X11 guardian and injector are Python, using ctypes Xlib/XInput/XTEST calls.
`assets/wayland_owned_input.c` is not on this X11 release path.

`ExistingXTest` opens the existing **shared** Virtual core XTEST pointer and
keyboard slaves. These are not session-owned injection devices. Multiple XTEST
clients can use them, and their raw event source IDs do not identify which
client injected an event. Physical seat sources remain separate. A master/core
pointer or keyboard query cannot substitute for the synthetic slave queries.

The potential-down ledger is populated before dispatch. Its entries mean that
Odin may have dispatched a down, not that every down observed on a shared device
belongs to Odin. After the injector helper is fenced, release sends only the
ledger's key/button ups to the original synthetic slaves. It never repairs
physical device state and never sends blanket releases.

## Narrow case admitted

Only an interrupted shared-mode guardian with reason `human_input_overlap` may
report the new release proof, and only when all of these hold:

* The planned native steps contain only move, button and wait operations. No
  synthetic key, modifier, text or semantic action is admitted.
* At least one non-XTEST key edge or key hold was observed. No non-key edge or
  physical button hold has been observed in the key/button transition stream.
  Same-button overlap remains excluded. `key_only_overlap` describes that stream,
  which intentionally omits pointer motion. It is not a claim of physical quiet;
  concurrent pointer movement can alter the already-uncertain application effect.
* The exact helper was fenced. Ledger-only release succeeded, with an empty
  potential-down ledger. Missing ACKs are not treated as absence of dispatch.
* Fresh `XQueryDeviceState` reads of **both original shared XTEST slaves** report
  no key/button bits down. Complete expected state classes and exact original
  topology are required before and after those queries.
* The post-query event drain, fresh physical held-state query and final event
  drain contain no button overlap. Any state query, cookie loss, raw queue
  overflow, mapping or topology failure disqualifies the exception.

Raw edge subscription is established before the initial census and before any
dispatch. Native queries run under the existing checked XSync boundary. The
post-query drain therefore catches short button taps before that boundary even
if the subsequent held-state query sees an all-up physical pointer. The extra
drain after the physical query also includes edges queued during that query.
These are bounded server observations, not a freeze of the human or other
clients. Input after the final boundary requires the normal fresh admission
checks on the next action. No all-time physical quiet or exclusive XTEST client
ownership is asserted.

## Meaning and limitations

The proof means the helper is fenced, Odin's ledger is drained, and the original
shared synthetic endpoints were observed all-up. It does **not** prove core or
application state, delivered-event effects, physical release, or correct drawing
semantics. A still-held human Shift remains untouched. The drawing may already
be changed, incomplete or wrong.

The guardian keeps `status=unknown` and `overlap_uncertain=true`, but reports
`released=true` with a strict bounded `overlap_release_proof`. The effects gate
accepts only the exact shape and literal boolean facts, and still rejects any
negative safety evidence. The persisted controller receipt is `interrupted`,
recoverable, and prohibits replay. Existing image integration transports that
clean interruption as `not_satisfied`, with `native_status=interrupted`; it
requires inspection of the new frame and its delivery gate. Reusing an action
ID returns the original receipt without input.

No proof is available after a missing guardian receipt, failed helper fence,
failed release/query, changed native endpoint, physical button overlap,
synthetic key gesture or ambiguous/lost event evidence. Those cases keep the
existing unknown-release/quarantine guard. Operator queries after the original
incident are historical evidence only and are not consumed as release authority.

## Validation scope

`tests/test_computer_x11_key_overlap_release.py` uses fake guardians, fake native
ctypes tables and fake backend workers only. It includes release/error/overlap
counterexamples, strict receipt booleans, controller retention, actual attached
backend classification and image-integration no-replay behavior. No live input,
device queries, quarantine cleanup, deployment or service changes were performed.
