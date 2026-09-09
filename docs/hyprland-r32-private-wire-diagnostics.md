# Private downstream pointer diagnostics (not a fix)

This patch instruments the shipping exact-ABI scope plugin. It does not load
anything, alter status schema, or claim Pinta received/painted the events.
The earlier inference that absent seat framing explained endpoint-only GTK
painting is not established: adding framing did not resolve the actual symptom.

## Invocation

Use the existing private scope socket and authenticated harness connections.
After obtaining a fresh snapshot, before guardian arm, request
`{"op":"diagnostics_begin","token":"<snapshot token>"}`. The same snapshot token
must be used by the guardian arm. Snapshot admission still expires after 250 ms;
do not pause for manual interaction between snapshot/begin/arm.

Run exactly the owned target invocation. Read using
`{"op":"diagnostics_read","token":"<same token>"}` from the private controller.
The guardian must not receive this nested response: its flat status parser is
unchanged. Read after disarm is supported. Clear using
`{"op":"diagnostics_clear","token":"<same token>"}`. A different subsequent arm
also clears the previous report. Keep raw output private, do not post it.

Only server EVENT direction, wl_pointer motion/button/frame opcodes, the bound
surface's client and pointer focus, and synchronous owned warp/button dispatch
are admitted. The warp guard spans both the original call and explicit frame.
Button guard spans the original call, including its existing frame. Cleanup
after lease/focus loss is deliberately not captured. Keys, requests, enter/leave,
axes, titles, other applications, and global coordinates are excluded.
Motion coordinates are surface-local. At most 256 events are retained, with
an explicit overflow flag; resource IDs distinguish multiple pointer resources.
No event arguments are inspected before traffic admission. The logger is
removed as the first State teardown action, before revoke/client destruction.

## Evidence interpretation

`dispatches` counts admitted owned hook invocations, even if no wire event was
emitted. Each event has dispatch index/source, resource, and monotonic timestamp;
motion/button include protocol time. This is a compositor marshal-side sequence,
not proof of socket flush, client dispatch, GTK event processing, or painting.
`receiver_proven` stays false. Correlate the sequence with separately consented,
target-only application-side receipt evidence and the resulting canvas before
assigning cause. Five motions/frames here with endpoint-only painting narrows the
failure downstream but does not by itself identify GTK or Pinta as the culprit.
