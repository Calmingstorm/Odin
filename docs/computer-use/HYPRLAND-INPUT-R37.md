# R37: preserve the actual native refusal

This is a diagnostic-loss correction, **not a verified click-reliability fix**.
No speculative retry, longer input lease, scope bypass, or quarantine change.

## Observed live evidence on 6eeca2ba

Read-only inspection of Clippy's SQLite receipts confirms the reported generic
`dispatch / input_release_unknown` receipt for `palette-blue`. That is controller
fallback evidence, not a native finding that the pointer disconnected.

The service journal at 2026-09-08 21:27:06 UTC retains stronger evidence:

- native terminal reason: `invalid-command`
- planned/completed events: **0 / 0**
- native `input_was_sent`: **false**
- native `release_sent` and `release_acknowledged`: **true**
- native diagnostics phase: `release`, release: `confirmed`

The stored session cleanup also reports released, stopped, complete and owned
Hyprland connections closed; receiver release remains unverified.

This contradicts interpreting the generic receipt as proof of pointer-path loss.
An arm refusal before action planning is the leading explanation, not proven:
the native command handler also collapses bind/renew/grammar failures into
`invalid-command`. Ambiguous scope-stream exchange failure poisons the socket,
whereas this terminal cleanup received a positive acknowledgement.

## Defects corrected

1. The native scope parser accepted but discarded the compositor's `error` field.
   It now keeps only an exact static allowlist (unknown values become a fixed
   marker), plus the arm/renew stage and bounded command category. Local expiry,
   transport failure, negative reply, invalid acknowledgement and rejected-input
   counters are distinguishable. Cleanup does not overwrite these fields.
2. The Hyprland wrapper now retains this sanitized native evidence on the
   exception and logs it. The controller persists a separately labelled
   `native_failure` object instead of discarding it. It does **not** promote the
   conservative execution receipt, loosen quarantine, or assert receiver proof.

X11, libei, input timing, dispatch ordering, plugin, leases and cleanup decisions
are unchanged. No auto-replay or automatic re-arm.

## Handoff

Rebuild/install `odin-hyprland-input` with `--guardian-only` and deploy the Python
checkout together. No plugin rebuild or reload is needed. On the next failure,
inspect `native_failure.command`, `scope_operation`, and `scope_error` in the
stored receipt (also in the journal). This identifies the predicate to fix
without guessing from the generic fallback again.

The guardian compiled locally with the production `-Wall -Wextra -Werror` build
flags; Python syntax compilation and `git diff --check` passed. No binary was run
against a compositor. A read-only peer review checked the patch; its malformed
diagnostic-type finding was corrected before push.

No test suite or CI run this round, per the fast-loop brief. Live retest belongs
to the deployment operator. No deployment, restart, desktop input, scope arming, config changes,
or database writes performed by Odin.
