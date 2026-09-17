# X11 Krita recovery analysis, 2026-09-16

## Observed evidence

The live branch run used X11 existing-session input against Krita. The first batch
(`house-tree-sun`) retained a clean batch receipt with
`reason=sequence_visual_target_changed`, `execution.released=true`, and one of six
steps settled. The model did the correct master-era thing: it consumed the fresh
returned frame and planned different action IDs.

The second batch (`remaining-scene`) reached `tree-new`. Its retained raw guardian
shape was:

```text
status=unknown
reason=input_dispatch_expired
injected=true
released=true
overlap_uncertain=false
diagnostics.phase=dispatch
diagnostics.release=confirmed
diagnostics.steps_planned=35
diagnostics.steps_completed=1
shared_pointer=true
shared_keyboard=true
persistent_input_devices=false
owned_devices=not_created
```

Normalization correctly changed a released partial effect to
`effect_unknown_reconcile_no_replay`, retained the 35/1 counts and
`next_action=observe_and_reconcile`, but also copied `terminal=true` into
`verification`. That happened because `safety_terminal()` treats the guardian's raw
`status=unknown` as release uncertainty even when the same X11 receipt contains its
affirmative release and drained-ledger facts. `failure_guidance()` then had to return
`operator_intervention_required`. The final session cleanup independently retained
`complete=true`, `released=true`, and `no_inflight_input=true`. The guardian's
1.75-second deadline and adaptive step timing are unchanged from master; this
dispatch expiry was an expected bounded interruption, not a new deadline failure.
The sampled `step_seconds` value itself is not retained: guardian diagnostics emit
only phase, planned/completed counts, release, and reason. The 35-step plan is
consistent with one initial move, button down, 16 paced wait/move pairs, and button
up. `steps_completed=1` therefore records the initial move ACK before expiry.

## Fix and safety boundary

Normalization now recognizes only this complete X11 guardian signature as a clean
partial-dispatch boundary. It does not promote the action to success and does not
permit replay. It leaves the normalized receipt interrupted and requests fresh
observation/reconciliation. Any missing X11 identity fact, unknown release, overlap,
held input, nested terminal evidence, ownership/focus/scope failure, or Wayland-shaped
receipt remains terminal. No guardian deadline, controller gate, ownership check,
focus check, or Wayland/Hyprland path changed.

Regression tests use the retained 35-planned/1-completed receipt shape and pin both
the recoverable result and negative variants. Before the fix, the positive test
failed because normalized verification contained `terminal=true`; after the fix it
requests `observe_and_reconcile` with `replay_permitted=false`.
