# Local deploy and operator testing (PR350)

This is a manual handoff, not a deployment record. Aaron deploys the reviewed
revision and authorizes any service restart externally. Nothing in this runbook
automatically deploys, edits live configuration, enables input, or runs a pipeline.
The development driver has passed a scratch Xed save on the actual main session
with exact before/after restoration; see R5-MAIN-SESSION.md. This does not establish
that the externally deployed service works. Deployment QA remains operator-owned.

## First increment and evidence boundary

Computer use is **disabled by default**. It adds `computer_session`,
`computer_observe`, and `computer_act` to ordinary authorized foreground turns.
All usual tools remain available under their existing permissions, including
during, after, or following failure of a computer task. This is not a chat mode.

| Surface | Supported scope and limitations |
| --- | --- |
| Isolated X11 | Fixed Drawing and Xed profiles in an owned disposable desktop. Native-model Xed save/close/reopen was demonstrated; Drawing save/reopen and the 30-task corpus use deterministic native GUI drivers. |
| Corpus | **27/30 distinct isolated tasks**: Xed 14/15, Drawing 13/15. Unicode/tab fidelity, text annotation and selection move failed. This is not a 90% general model success rate. |
| Existing X11 | Explicitly granted monitor capture; input only to a focused, identity-verified installed native Xed and recognized same-process dialogs. The operator opens/focuses it; Odin does not launch or close attached applications. |
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
Busy or animated screens can invalidate exact raster grounding before dispatch;
refresh the observation and decide anew, never replay an unknown action. These
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

Do not change monitor topology during a task. Hotplug, replacement or mapping
changes require new consent/start; the runtime must not guess a new input transform.

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
   bounded task, manually open a **new blank native Xed window**, place it wholly
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
   then manually handle only the scratch document. Do not simulate crashes or
   held-key faults in the operator's desktop as a routine QA step.

## Recovery, privacy and rollback

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
