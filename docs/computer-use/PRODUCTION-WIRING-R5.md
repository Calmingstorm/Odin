# Production lifecycle wiring R5

Implemented on PR350 development branch. No deployment, enablement, main-session
interaction, restart, merge or pipeline in this increment.

## Composition and admission

ComputerLifecycle is the singleton bot component, dispatcher owner, executor
reserved-name policy and dedicated API mutation owner. Disabled boot constructs
only that inert owner: no integration/controller/store/platform imports, state
directory, janitor, authority watcher, GUI dependency check or desktop process.
Tool-loop lookup returns None and configured-only definitions remain absent.
Routes remain registered for authenticated admins to inspect disabled state and
enable it. Other tools, mixed batches and tool ordering keep ordinary authority.

The async setup hook adopts configured enabled state. Startup errors hide computer
tools without preventing unrelated bot startup. Configured/effective divergence is
visible. Shutdown revokes computer authority before provider/model teardown;
unverified cleanup blocks in-place re-exec. Presence of a lifecycle is not proof of
backend readiness or successful input.

## Operator provisioning and use

Provision a service-owned mode0700 absolute computer.storage_dir outside the live
install, without symlink components. Default: /var/lib/odin/computer. Enabling never
creates that root, sudo-repairs it, discovers a display, changes accessibility or
launches a GUI. Isolated use requires the fixed installed executables and authorized
systemd/bwrap launcher. Structural preflight is not the actual containment check;
the latter still runs when the desktop session starts.

Restart-only operator settings, never model arguments:

* environment: isolated (default) or existing_session.
* platform: x11 (default). Wayland is explicitly refused until a production adapter
  and target safety gates pass. Feasibility results alone do not activate it.
* display: blank by default; explicit local :N for attached X11.
* xauthority: blank or explicitly provisioned absolute path.
* monitor_names: bounded unique granted monitor names for attached X11.
* storage_dir and runtime_sudo: provisioned storage/launcher policy.

Settings are deep-copied at process construction, even when disabled, and pinned
across every toggle. Changed desired settings cannot silently retarget a desktop.
Generic PUT /api/config rejects computer settings. Provision restart-only values
offline using the separately authorized restart/deploy process.

System > Computer is registered in the actual System tab/navigation list and
linked from the generic Config computer section. Its admin controls call
POST /api/computer/enabled with one boolean, then
read status back. Status includes configured_enabled, runtime_enabled, generation,
restart_required and session capability evidence. No session means input support
Unknown. Capture-only or failed lifecycle evidence never becomes enabled input
merely because the feature is on. No evidence is fetched on page expansion.

Foreground browser chat binds the middleware-authenticated managed browser session,
not a caller's conversation-continuity ID. Raw API automation and /api/execute do
not receive desktop grants. WebSocket uses its live session/credential validator.
Expiry, credential deletion, permission/scope change and socket loss invalidate
admission. An independent250ms authority watcher requests owned cleanup during
model waits. Controller calls the live manager authorization hook at awaited action
boundaries. Other tools are not restricted by this computer-only authority.

Stop/pause are separate requests, not queued behind observation or model waits.
Controller checks owner/host and can stop a user's Discord-origin task from their
authenticated WebUI. Screenshots/exports require explicit authenticated requests.
Operator timestamps are labelled request-start lower bounds, not source clocks.

## Transactions and retention

Enable preflights collisions, storage and structural dependencies. Persistence uses
the shared leaf-scoped config transaction; config/catalog publication settles even
if the request is cancelled. Unchanged placeholders/comments survive. Disable
revokes first; failed persistence never restores input. Configured=true/runtime=false
is reported honestly until repaired. Cleanup failure retains the controller/store
and blocks reenable. Old foreground grants cannot target a replacement generation.
Disable waits for bounded in-flight operations before closing storage.

An admitted enable transaction is cancellation-settled, not revocation-transactional.
If the browser credential is revoked after admission while the config lock is
queued, the admitted enable may still persist, but the HTTP response is denied.
This creates no desktop or input authority; the revoked credential cannot observe,
act or retrieve evidence. Do not describe revocation as rollback of an already
admitted configuration transaction or claim already-written network bytes can be
recalled. Independent HTTP-to-manager-to-controller tests cover recovery and
credential/scope revocation, including response preparation/body boundaries.

An enabled-only janitor prunes on adoption and every1second; reads enforce exact
expiry. Clean disable/shutdown purge remaining evidence bytes before closing state.
Receipts/session records remain. Disabled boot does not inspect historical state.
After an unclean process death, external retention cleanup remains operator-owned
until enabled startup: this code cannot delete bytes while no process is running.
Recovered quarantine is never silently dismissed as complete cleanup.

## Recorded validation

**809 passed,26 warnings,9.91seconds**, exit0, in the focused combined suite:
/tmp/odin-production-r5-final-regression.log. Includes24 new lifecycle/browser-
binding cases plus existing ordinary-turn/dispatch/integration, Web chat/API, real
bot composition, MCP lifecycle, WebSocket authorization, computer API/catalog and
apply-registry tests. Real stores and harmless stub backends, not main-session
input evidence. The frozen full suite belongs to parent review.

Isolated operator browser harness passed: enable/disable readback, keyboard/touch,
stop during blocked observation/toggle, no automatic pixels, stale-result rejection
and explicit exports. /tmp/odin-production-r5-browser.log. UI dist rebuild remains
parent-owned. Focused Ruff passed; mypy found no issues in8 wiring/API source files;
git diff --check passed.

Independent remaining gates: actual platform/GUI task acceptance, cross-turn paused
work semantics, crash-workload reconciliation and final immutable full-suite release
validation. Do not infer these from working lifecycle wiring.
