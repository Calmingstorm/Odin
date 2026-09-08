# Session lifetime extension: proposal for operator review

**Proposal only. No new operation, route, configuration or lifetime is implemented
by this document. The existing 20-minute limit remains unchanged.**

Long, supervised drawing can exhaust the current wall-clock budget. Increasing a
global constant would also extend every unattended grant. Activity-based renewal
would let the assistant keep its own authority alive. Neither is the proposed fix.

## Proposed contract

Keep the present default and offer an explicit extension request, approved by the
authenticated human operator. A request is not approval and a model-supplied
`confirm` field is not human consent.

* An extension request binds the owner, host, session ID, session generation,
  consent generation, separate lifetime revision and requested additional time.
* Operator policy explicitly enables extensions and defines per-extension and
  cumulative limits. Numerical limits are a review decision, not a hidden new
  default. Disabled policy retains current behavior.
* Status exposes effective remaining time, expiry, lifetime revision, eligibility
  and pending request. A near-expiry warning should reach the operator before a
  request becomes urgent.
* Approval requires a currently authorized, active, unexpired session with valid
  native consent, verified release and no in-flight action or sequence. Busy is a
  retryable refusal, not a reason to interrupt a stroke or repeat GUI work.
* A compare-and-swap transaction updates expiry and lifetime revision. The live
  monotonic deadline and revision-aware watchdog must agree with durable state.
  Stop and revocation win races. Duplicate approval cannot grant time twice.
* Approval invalidates old observations and delivered-frame authority. Input
  resumes only after a fresh observation has actually been delivered.
* No extension revives an expired, quarantined, revoked or restarted session. It
  cannot outlive native portal/device consent or the authorized foreground turn.

Use a **separate lifetime revision** for time-only renewal. Incrementing native
consent generations as if renewal were pause/resume could reopen a portal or
revoke X11 devices unnecessarily. Changes to owner, scope, granted sources or
native consent still require the existing revocation/reconsent path.

## Limits that do not change

The action-count ceiling, short input leases, per-action and sequence deadlines,
capture freshness, delivered-grounding lifetime and no-replay receipts remain
independent. An extension is not permission for a longer blind sequence. Turn
completion still releases the session. This mechanism does not make background
agents or autonomous loops eligible for desktop input.

## Implementation couplings to resolve before approval

The persisted expiry and monotonic deadline currently begin before startup, while
the cleanup watchdog starts its full sleep after startup. Slow startup can delay
cleanup past the effective deadline, although input admission still rejects
expired work. A future implementation must schedule the watchdog from the actual
remaining budget rather than another full lifetime.

An active check also reads expiry from a grant snapshot. Updating SQLite alone
would leave stale snapshots rejecting authorized work. Old watchdog callbacks
must verify their lifetime revision, not cancel a renewed session. Define clock
movement behavior so neither wall-clock adjustments nor a partial update can
silently extend authority. A restart during renewal must fail closed without
erasing the approval history or claiming prior cleanup was verified.

## Required behavioral qualification

Exercise startup delay, expiry on either clock, extension versus Stop, duplicate
approval, stale generation/revision, permission or native-consent revocation,
in-flight rejection, old-watchdog races, restart during approval, and fresh-image
delivery after approval. Verify no reset of action counts and no replay of any
settled or interrupted action. This proposal is not a qualification claim.
