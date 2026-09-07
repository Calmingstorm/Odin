# Local deploy and operator testing (PR350)

This is a manual handoff, not a deployment record. Aaron deploys the reviewed
revision and authorizes any service restart externally. Nothing in this runbook
automatically deploys, edits live configuration, enables input, or runs a pipeline.
The development driver has passed a scratch Xed save on the actual main session
with exact before/after restoration; see R5-MAIN-SESSION.md. This does not establish
that the externally deployed service works. Deployment QA remains operator-owned.
R6 additionally completed main-session Inkscape drawing/save, but both scratch
CLI runs reported restoration failures; parent restored the complete baseline.
Those historical failures remain recorded in MAIN-SESSION-R6.md. Aaron confirmed
the wake/topology incident is his longstanding Cinnamon issue, not an Odin defect.
R7 separates production owned-resource cleanup from the opt-in scratch harness's
stricter exact-baseline restoration. See the R7 evidence before repeating a test.

## First increment and evidence boundary

Computer use is **disabled by default**. It adds `computer_session`,
`computer_observe`, and `computer_act` to ordinary authorized foreground turns.
All usual tools remain available under their existing permissions, including
during, after, or following failure of a computer task. This is not a chat mode.

| Surface | Supported scope and limitations |
| --- | --- |
| Isolated X11 | Fixed Drawing and Xed profiles in an owned disposable desktop. Native-model Xed save/close/reopen was demonstrated; Drawing save/reopen and the 30-task corpus use deterministic native GUI drivers. |
| Corpus | **27/30 distinct isolated tasks**: Xed 14/15, Drawing 13/15. Unicode/tab fidelity, text annotation and selection move failed. This is not a 90% general model success rate. |
| Existing X11 | Explicitly granted monitor capture; input to focused, identity-verified installed native Xed, Inkscape, and Writer. The operator opens/focuses the app; Odin does not launch or close attached applications. Profile eligibility is not task qualification. |
| Qualified work | Inkscape: actual model drew and GUI-saved a recognizable three-part house as vector SVG; independent shape, raster and visual review passed in R6. Writer: R7 deterministic GUI keyboard-only short note, paragraph break, bold formatting and ODT save passed. See application reports for exact fixture conditions and limits. |
| Not offered | Calc/Draw and the old generic `libreoffice` profile are refused, not aliases. Writer open/new document, close/reopen and pointer/menu actions are refused. Browsers, terminals, games, arbitrary apps, macros and application extensions are not input targets. Inkscape disk-close/reopen is not qualified. |
| Attached Drawing | Capture-only. Interpreter/script argv cannot establish trusted executed-script identity, so Drawing input is refused. Isolated Drawing is unaffected. |
| Shared input | Pointer and focus are shared, not independent. The pointer stays where input moved it. Busy input is refused; same-key overlap and racing synthetic clients are not safely separable. Stop is not a hard real-time server-hang guarantee. |
| Attached text | Printable ASCII using the existing keymap only. Send Return and Tab as separate key actions, not embedded text. No clipboard/keymap changes; do not promise Unicode fidelity. |
| Application boundary | No arbitrary apps, terminals, security/password dialogs, or Odin WebUI control. Unknown focus/modal/source evidence denies input. |
| Wayland | Refused in production. Tested stock Mutter 46.2 used `key` instead of `button` in its button-release bit test; upstream one-line fix `4ae305f19e391edda1aab0f9a9c47b01062f6330` repaired the nested experiment, not production eligibility. No compositor fix or Wayland adapter is activated here. |

Private cross-UID X11 testing demonstrated actual native Xed actions and owned
release through a distinct sudo wrapper. Its root-controller fixture does not
prove a particular unprivileged service's sudo/PAM policy or physical-input safety.
Capture permission is monitor-wide, not an application-only privacy boundary.
Use short typing chunks and short explicit file paths: the independently enforced
native input lease is two seconds, not permission to finish arbitrarily long text.
Pointer actions still require identical raster grounding before dispatch. Attached
X11 typing/key actions instead require the same freshly verified native
process/window/focus/modal/source binding, so a blinking caret alone does not
prevent typing. This intentionally cannot guarantee that an internal widget,
selection or document content remained unchanged; shared focus is an accepted
limitation. Refresh observations and decide anew, never replay an unknown action. These
limits are operationally significant, not just theoretical caveats.

## 1. Provision offline, before the manual restart

1. Review the selected PR revision and its release evidence. Package the matching
   Python runtime assets and WebUI through the normal externally owned deployment
   process. Do not test inside the live install or treat a checkout SHA as proof
   of the running version. Retain the previous release/configuration for rollback.
2. Provision `/var/lib/odin/computer` (or another absolute directory outside the
   live install), owned by the **service UID**, mode **0700**, with no symlink
   components. For a root-run service this means root-owned, not desktop-user-owned.
   Enable does not create or sudo-repair this root. It contains durable session,
   receipt and private evidence data; do not make it web-served or shared.
3. Install the optional `computer` Python extra into the service environment:
   current `pyproject.toml` specifies `Pillow>=12.3,<13` and Linux
   `python-xlib>=0.33,<1`; `all` includes this extra. These packages alone neither
   enable input nor install the system desktop dependencies.
4. Provision system packages deliberately. Debian/Ubuntu names include `systemd`,
   `sudo`, `bubblewrap`, `xvfb`, `dbus`, `xdotool`, `openbox`, `drawing`, `xed`,
   `python3`, `python3-xlib`, `python3-gi`, `gir1.2-atspi-2.0`, `at-spi2-core`,
   GTK 3/ATK bridge libraries, `fontconfig` and usable fonts. Attached X11 also
   needs `libx11-6`, `libxi6`, `libxtst6`, an X server with XTEST/XInput/XRes 1.2,
   and `x11-xserver-utils` for operator RandR measurement. Resolve package names
   for the distribution; this list is not an installer or permission grant.
5. Verify both interpreter environments. Isolated workers run fixed
   `/usr/bin/python3 -I` under the sandbox's read-only `/usr`, **not the service
   venv**; system Python must import Xlib and GI/Atspi for the tested native stack.
   Attached workers use the service interpreter, which must import its installed
   computer dependencies. Venv installation alone cannot repair system-worker
   imports. Keep the installed runtime/interpreter trusted and non-user-writable.
6. Verify authorization for fixed systemd transient units and bwrap namespaces,
   resource limits and private mounts. Structural preflight checks executables;
   actual session startup checks containment. `runtime_sudo: true` is an explicit
   operator choice for noninteractive sudo, **never an automatic fallback**.
   It may be needed for launch privileges or cross-UID `/proc` inspection. Review
   least-privilege policy with the actual service UID; do not grant blanket sudo
   or relax desktop, namespace, accessibility or security settings to force a pass.

## 2. Choose exactly one restart-pinned target

These are alternative `computer` blocks, not two selectable live profiles.
Environment, platform, display, Xauthority, monitor grant, storage and sudo policy
are snapshotted at process construction, even when disabled. Switching targets
requires offline configuration and another explicitly authorized manual restart.
Generic Config PUT cannot change computer settings. Only enabled/disabled toggles
are live in **System > Computer**.

### A. Isolated first test

```yaml
computer:
  enabled: false
  storage_dir: /var/lib/odin/computer
  runtime_sudo: false  # Set true only under an explicitly provisioned policy.
  environment: isolated
  platform: x11
  display: ""         # Private display is fixed by the owned sandbox.
  xauthority: ""
  monitor_names: []
```

### B. Existing-session X11 test

Before provisioning this alternative, the operator explicitly identifies the
local X11 display and an authorized Xauthority path. In that authorized session,
measure topology with `xrandr --listmonitors` and `xrandr --query`; use exact
monitor names from the measurement, not guessed connector names, hostnames or a
desktop-wide bounding rectangle. Review which pixels each granted monitor exposes.
No cookie contents belong in config, logs, chat or this document. Blank authority
means `/dev/null`, not automatic ambient-cookie discovery.

```yaml
computer:
  enabled: false
  storage_dir: /var/lib/odin/computer
  runtime_sudo: false  # Deliberately provision if cross-UID inspection requires it.
  environment: existing_session
  platform: x11
  display: ":1"        # Illustrative only: replace with the measured local display.
  xauthority: /run/desktop-grant/Xauthority  # Operator-provisioned private file.
  monitor_names: [DP-1]  # Illustrative only: replace with exact granted RandR names.
```

Use the operator's new scratch document for initial deploy testing. A changed
topology invalidates old action coordinates: Stop and start a fresh authorized task
after the new layout settles. Cleanup must not depend on successfully capturing
the changed display. Production Stop never rewrites the operator's display layout,
moves the shared pointer back, wakes/sleeps monitors, or closes their applications.
That is deliberately different from an explicitly exclusive developer scratch
test which promises to restore its recorded baseline. Hotplug/replacement still
requires new consent/start; the runtime must not guess a new input transform.

## 3. Manual deploy QA

1. Aaron performs the approved deployment/restart through the external process.
   Independently check service health and running-version evidence. Keep computer
   disabled initially; confirm ordinary chat and usual tools still work.
2. Sign into the WebUI as an authorized administrator and open **System > Computer**.
   Check **Configured**, **Runtime lifecycle**, generation and restart-required
   settings separately. Configured=true is intent, runtime=true is lifecycle
   adoption, and neither proves input readiness. With no session, input is Unknown.
3. Select **Enable computer use**, then read status back. Resolve preflight failures
   offline rather than repeatedly toggling. Enabling must not launch an application
   or capture the desktop. Opening/refreshing the inspector fetches no screenshot.
4. Start a new foreground scratch task through authorized chat. For isolated mode,
   request a new Xed profile. For attached mode, first explicitly authorize this
   bounded task, manually open a **new blank native Xed, Inkscape or Writer window**, place it wholly
   inside a granted monitor and focus its editor. Keep unrelated/private windows
   off the captured monitor. Do not use an existing unsaved document.
5. Example request: “Use only this new scratch Xed document. Type `Local QA note`,
   then press Return separately and type `Second line`. Do not save, close other
   windows, use other apps, or retry uncertain input. Stop after verifying.”
   Ask for a fresh observation and inspect actual session/input capability before
   acting. A capture-only result is not a failed action to bypass.
6. Watch the scratch document and compare the exact text and line break. Request
   **Observe / view frame** only when needed. A visual-change receipt proves pixels
   changed, not correct text or a saved file. For isolated save QA, explicitly request
   GUI save to a new workspace basename, close the saved tab, create blank, reopen,
   then **Prepare export / Download** and independently compare bytes. Attached
   workspace export is unavailable; inspect the scratch document directly.
7. Inspect full tool-result/action receipts in the task conversation, not just the
   inspector's last-action summary. Ask for `computer_session` status for the full
   cleanup receipt after Stop. Distinguish executed, verified, not_satisfied,
   unavailable and unknown; record failures without upgrading them to success.
8. Exercise **Pause / revoke input**, confirm revocation, then explicitly request
   owner-authorized resume with renewed generation and fresh observation **while
   the originating foreground task is still alive**. Finishing that turn closes
   paused sessions too; a later message starts a new task, not a cross-turn resume.
   Attached applications remain open, but isolated work must be exported before
   ending its task. This does not restrict ordinary tools in either turn. Use
   **Stop** to finish or immediately on unexpected focus/input. Both controls are
   independent of model/observation waits. Attached Stop must leave Xed and the
   desktop alive; isolated Stop may remove its owned sandbox. Confirm cleanup,
   then manually handle only the scratch document. Closing Writer is the operator's
   job, not an unfinished runtime cleanup stage. Do not simulate crashes or
   held-key faults in the operator's desktop as a routine QA step.

## Recovery, privacy and rollback

### What cleanup does automatically, and what it cannot reconstruct

Normal attached Stop/cancellation owns its worker lifetime independently of the
caller and screenshot. It closes input authority, drains release receipts and
reaps workers without waiting for an awake/stable display. The input lease stays
two seconds; attached cleanup has a nine-second drain inside a ten-second controller
budget. A timeout is quarantined, not success. Unknown actions are never replayed.
See [RUNTIME-CLEANUP-R7.md](RUNTIME-CLEANUP-R7.md).

The developer-only scratch harness now orders topology, windows, focus/pointer,
power and exact verification after verified input/process teardown. Private actual
RandR recovery passed; physical DPMS cannot be established by Xvfb or Xephyr.
**The R7 main-session hardware wake check still required manual baseline recovery.**
Production owned cleanup and power restoration passed, but changed output metadata
and recreated desktop XIDs correctly blocked exact-baseline restoration. It is not
an automatic Cinnamon repair and is not being claimed fully unattended.
See [MAIN-SESSION-R7.md](MAIN-SESSION-R7.md) and
[RECOVERY-QUALIFICATION-R7.md](RECOVERY-QUALIFICATION-R7.md).

| Situation | Aaron's required action |
| --- | --- |
| Normal completed/failed task with `cleanup.complete=true` | No resource cleanup needed. Keep intended document edits; handle document close/reopen yourself when that workflow is not offered. |
| Monitor sleep, capture loss or changed layout but clean owned cleanup | Do not replay. Wake normally if needed, inspect the intended layout and start a freshly authorized task after it settles. |
| This machine's wake incident changes output metadata or recreates desktop surfaces | Stop/Disable. Restore the intended layout through normal display controls; inspect displaced windows. Exact old native identities cannot be reconstructed. No Odin/Cinnamon restart or guessed topology command is required or authorized by this runbook. |
| Cleanup still quarantined after its bounded drain | Leave automation disabled, retain receipts, inspect exact owned processes, then Stop/status again after owners settle. Reconcile recorded workload is read-only, not proof of input release. |
| Permanently blocked X server, replaced input endpoint or uncatchable release-guardian death | There is no proven non-disruptive automated recovery. Protect unsaved work and seek separately authorized external maintenance. Never delete receipts, kill the graphical session or send global releases to manufacture success. |
| Developer scratch worker lost or a restoration stage failed | Read its `handoff.json`, `supervisor.json`, `before.json` and `after.json`. Recover only verified baseline state; process absence does not prove desktop restoration. |

- Lost response or unknown input: **never replay the action**, even if no visible
  change is apparent. Pause/Stop and refresh status. For quarantined sessions use
  **Reconcile recorded workload**; this inspects recorded identities only, sends
  no input, kills no applications and does not replay work. Exact process absence
  alone does not prove release after an input-enabled crash.
- Modern identity-bearing unknown cleanup has **no override**. Keep it quarantined
  and obtain external operator investigation. Legacy records without runtime
  identity have a separate authenticated acknowledgment path; the explicit
  `ACKNOWLEDGE UNVERIFIED CLEANUP <session_id>` attestation archives uncertainty as
  `operator_acknowledged_unverified`, never verified cleanup or replay permission.
- Evidence TTL is **24 hours**, distinct from short-lived action grounding. Reads
  enforce expiry; the enabled janitor prunes on adoption and every second. Clean
  disable/shutdown purges evidence bytes while retaining receipts/session records.
  Unclean death can leave bytes: disabled boot intentionally does not inspect old
  storage, so external retention cleanup is operator-owned until enabled startup.
  Explicitly downloaded copies need their own retention policy. No auto-posting.
- Roll back by **Disable computer use first**, then verify runtime revocation and
  cleanup, not just the saved boolean. Persistence failure must not restore input;
  configured/runtime divergence or cleanup failure requires investigation before
  reenable. Only Aaron's external process may restore release/config and restart.
  Never restart the graphical session, broadly kill processes, or delete receipts
  to manufacture a clean result. This runbook contains no destructive cleanup.

## Authoritative review references

Read [PRODUCTION-WIRING-R5.md](PRODUCTION-WIRING-R5.md), [OPERATOR-R5.md](OPERATOR-R5.md)
and [CONTRACT.md](CONTRACT.md); later R5 platform evidence supersedes historical
capture-only conclusions. Actual evidence: [MODEL-GUI-R5.md](MODEL-GUI-R5.md),
[R5-DRAWING-FINAL.md](R5-DRAWING-FINAL.md), [R5-ACCEPTANCE-30.md](R5-ACCEPTANCE-30.md),
[R5-ACCEPTANCE-30-DRAWING.md](R5-ACCEPTANCE-30-DRAWING.md),
[FEASIBILITY-X11-R5.md](FEASIBILITY-X11-R5.md),
[FEASIBILITY-X11-R5-CROSSUID.md](FEASIBILITY-X11-R5-CROSSUID.md), and
[FEASIBILITY-WAYLAND-R5.md](FEASIBILITY-WAYLAND-R5.md).
Implementation authority: `src/config/schema.py`, `src/computer/manager.py`,
`src/computer/runtime/profile.py`, `src/computer/store.py`, `src/web/api/computer.py`.
Relevant regression files include `tests/test_computer_lifecycle_r5.py`,
`tests/test_computer_recovery_r5.py`, `tests/test_computer_x11_app_scope_r5.py`,
`tests/test_computer_model_gui_smoke_r5.py` and `tests/test_computer_corpus30_r5.py`.
These are pointers to recorded evidence, not new test or full-suite pass claims.

## R6 additions

The operator page lists application profiles separately from actual input
readiness, without probing processes or capturing a screen. For drawing, a useful
scratch request is: “In this new blank Inkscape document, draw a simple blue house
with an orange roof and white door. Save only to this new scratch filename. Do not
modify another window or overwrite a file.” For Writer, request a short note and
bold formatting, and inspect the document before saving. Use `app=writer`, not
the removed generic `libreoffice`. Writer is intentionally keyboard-only, with
Return, Escape, BackSpace, Delete, space, ctrl+a, ctrl+b, ctrl+s and ctrl+shift+s.
No click/drag/menu navigation or open/new/close/reopen workflow is offered. Open
and focus the intended new document yourself; close or reopen it yourself after
Odin detaches. Keep commands within the disclosed vocabulary and short ASCII chunks.

Read [APPLICATION-QUALIFICATION-R6.md](APPLICATION-QUALIFICATION-R6.md),
[APPLICATION-QUALIFICATION-R7.md](APPLICATION-QUALIFICATION-R7.md),
[MODEL-APPLICATION-R6.md](MODEL-APPLICATION-R6.md),
[KEYBOARD-GROUNDING-R6.md](KEYBOARD-GROUNDING-R6.md), and
[DEPENDENCIES-R6.md](DEPENDENCIES-R6.md). Native Inkscape and LibreOffice must be
installed through the operator's package manager. Alternate package locations,
Flatpak/Snap wrappers and interpreter launchers are not silently trusted.

The branch also fixes the diagnosed local shell-command reaping path. Read
[ZOMBIE-REAP-R6.md](ZOMBIE-REAP-R6.md): a dedicated subreaper owns each local
command subtree, preserving shell status separately from descendant cleanup.
Existing live zombies are not cleared by this source change. Direct browser/native
launches outside that command path remain a distinct ownership boundary. No
historical zombie should be manually reaped or the live service restarted merely
to make a count look better.
