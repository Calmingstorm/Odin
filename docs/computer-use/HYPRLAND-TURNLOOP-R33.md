# Hyprland normal foreground turns: R33

## What changed

R32 already contained the explicit production selector. Its successful live
drawing used a separately configured supervised driver because the installation's
normal runtime target was not configured. R33 does not disguise this distinction
as a missing backend or silently persist a target. The operator must provision
the approved local identity/output using the existing restart-pinned settings.

The ordinary route is:

1. The enabled native catalog offers `computer_session`, `computer_observe`, and
   `computer_act` in an authenticated foreground turn.
2. Lifecycle/integration selects the explicitly configured native backend.
3. Startup pins the approved compositor executable/process and SO_PEERCRED peers,
   binds the explicit output and scope companion, and starts the native guardian.
4. Controller observations pass the normal native-image delivery boundary.
5. Actions use delivered-frame authority, persistent action IDs, native grounding,
   independent input leases and absolute 250 ms scope deadlines. Post-action
   pixels become actionable only through the same delivery gate.

Concrete integration repairs:

- **Partial-start identity:** backend family is available before native startup,
  while input safety remains unknown/pending. Confirmed failed-start cleanup no
  longer becomes false quarantine; missing ACK retains the native RELEASE-ALL
  recovery route rather than rejecting its backend identity.
- **Durable qualifications:** single, batch, per-step, rejected and unknown
  Hyprland receipts retain typed `input_safety`, including best-effort release,
  receiver-proof absence, hard-guardian-kill and same-button-overlap residuals,
  application limits and recovery guidance. These fields survive replay and
  image-format fallback. Trusted immutable capabilities outlive concurrent close
  for receipt settlement; retaining metadata does not retain input authority.
- **Truthful checkpoint failures:** acknowledged input remains acknowledged when
  controller post-capture fails, but the missing checkpoint is not reported as
  verified and grants no new observation authority.
- **Normal model guidance:** session/tool/capability output discloses bounded
  native-top-level scope, no XWayland or ambiguous modal surfaces, and best-effort
  release. Native focus versus explicit pixel field targeting is reported.

Emergency RELEASE-ALL keeps the old session permanently fenced. The explicit
continuation is **confirmed release, close, new session consent, new observation**,
not automatic resume or replay. The operator API remains reachable for a retained
session; the standalone recovery command remains the controller-loss path.

## Additive boundary

No changes to X11 runtime, GNOME/KWin portal runtime, compositor registry/refusal
rules, selector, configuration schema, provisioning, install-root selection,
packaging, native C/C++ input code, or UI source. Shared controller changes add
Hyprland-only receipt metadata/verification handling. Other backend receipt
classification is unchanged. No desktop, service or compositor changes are part
of this round.

Operator instructions: [native Hyprland setup and recovery](HYPRLAND-OPERATOR-R32.md).

## Evidence and its limits

The normal-turn regression tests use the real lifecycle default factory,
integration, controller, native dispatcher, turn-loop image processing and
Hyprland backend methods. Only native OS transports are synthetic. They reproduced
the partial-start cleanup/recovery, lost disclosure and false checkpoint-verdict
defects before the fixes.

Additional tests join that ordinary foreground route to the **real Python guardian
and compiled C helper** against disposable AF_UNIX peers. Both Discord and web
adapter variants send a four-point stroke, observe every intermediate native
coordinate and following frame, renew scope, deliver the changed next image, use
it for another action, reject replay, and acknowledge release/child exit.
Capture pixels, scope snapshots, installation trust and preliminary probes are
synthetic. These are not real compositor or application receiver tests.

At code head `b8f11586`:

- Computer/native no-regression matrix: **3,766 passed**, 176 warnings, exit 0.
- Focused new R33 normal-turn/receipt/native-wire modules: **34 passed**.
- Lint: zero new findings. Types: zero new findings, two existing baseline findings.
- Configuration apply classification: zero findings.
- WebUI checks/build and computer operator browser check passed; rebuilt dist
  has no diff. Pages build passed with dead-link checking enabled.
- Required Chromium network/turn-state checks: **six passed**.
- Tool/API references regenerated and checked, no generated diff because computer
  tools are dynamically registered outside the static tool table; operator docs
  carry the updated contract.
- Independent final source review: no remaining blocker, with live acceptance
  explicitly excluded from that review.

An earlier full instrumented run completed with **15,931 passed**, five skipped,
zero coverage-gate findings and 92.6% total coverage. Later test/concurrency fixes
landed during that run, so it is **not the final frozen-head certificate**. The
final frozen-head full suite and hosted CI outcomes are recorded in the PR handoff
only after their terminal results. No coverage baseline or threshold was relaxed.

The preceding hosted R32 coverage run exposed a separate test assumption: a 10 ms
foreground timeout can expire while writing the start audit, before executor
entry. The fixture now synchronizes running-dispatch cancellation while retaining
real timeout semantics; a separate test preserves unmodified production timeout
behavior during blocked audit persistence. Production timeout behavior is unchanged.

## Live acceptance remains the operator's next gate

After a config/data-protected branch deployment, run an ordinary API-turn drawing
on the explicitly provisioned Hyprland session, not the qualification driver.
Inspect actual artwork, post-action views, native cleanup and preserved user work.
Then perform the independent X11 Krita no-regression draw on its own installation.
Record GUI input, captures, recovery, elapsed time and verified completion.

This report contains no claim that either R33 live draw has occurred. Pipeline
approval remains conditional on those two live outcomes and green quality gates.
