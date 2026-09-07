# R11 consolidated product round

Both binding documents were read through EOF before changes. Existing branch
history, thresholds, baseline and default-off/lifecycle boundaries were preserved.
No deployment, service restart, master merge or pipeline ran.

## Baseline recovered rather than assumed

The previously interrupted R10 coverage job completed at `ab03f51`:
14,144 passed, 5 skipped; 92.7% total, zero coverage-gate findings. The owned
supervisor reported completion, exit 0 and no residuals. Artifacts:
`/tmp/cu-r10-final-provisioned.{log,json}` and corresponding owned report.
Existing asyncio/deprecation warnings were not concealed.

## Nine items

1. Attached sessions start without app. Historical stored app values do not gate
   input. Process/XRes/UID/start/inode/argv-digest stability remains measured
   provenance, projected without raw argv/full paths into durable action receipts.
   Trusted-executable ownership is evidence, not application admission. The narrow
   denied window classes remain enforced. Isolated launches keep fixed profiles.
2. Ordinary dialogs, file pickers, document lifecycle and popup item selection
   are supported. A late audit found that merely opening/dismissing a menu was
   insufficient: X11 separate-root popups and KWin native popup ancestry were
   corrected and actually exercised, without removing hit-test/security boundaries.
3. Added scroll, double/right/middle click, polyline, generic modifier/keysym
   grammar, layout-resolved Unicode, newline/Tab and source-pixel observation crops.
   Exact render transforms are tested through the controller, including 4K and
   ultrawide crops. Unsupported characters return bounded indexed no-input evidence.
   Clipboard/IME fallback is not implemented; native input/text bounds remain.
4. Persistent XI2 master pair reused for X-server lifetime, never removed. Shared
   core-XTEST remains the fallback only after a failed creation with proven absent
   owned endpoints. Startup/action/helper device identity is pinned. Review caught
   retained-pair fallback, master/slave keymap mismatch and delayed dispatch after
   blocking preparation; all three have real disposable regressions and fixes.
   Independent pointer hit-testing now uses its exact native client. Widget focus
   remains shared, and simultaneous death of all release owners is not certified.
5. Registry plus actual GNOME/KWin portal and authenticated scope adapters.
   Stock Fedora43/Rawhide KWin6.7.4 delivered ordinary input but failed mandatory
   held-button/Shift release after sole-sender EOF, so they remain precisely
   refused. The exact-ABI KWin plugin compiled, loaded, supplied authenticated
   app/popup scope and unloaded in disposable sessions. No full KDE production
   controller input completion is claimed. wlroots/Sway and unqualified Hyprland
   paths have named refusals. GNOME48.7 prior lifecycle qualification stands.
6. Product descriptions/operator docs use generic user/session terminology.
7. Main package installs only OPERATOR, PACKAGING and RECOVERY operator docs.
   KWin companion source shipping is explicit and excludes engineering evidence.
8. Remote feasibility is documented against actual attached transport/import and
   PID ownership dependencies. It is not an argv-only SSH swap; not built here.
9. Retained X11 RandR event epochs reject A-B-A changes; DPMS sleep returns no
   fabricated frame. Wayland portal closure/CAPS changes revoke input. Capture
   and dispatch revalidate current bindings. Hardware sleep/wake remains unqualified.

## Recorded validation

- Whole coverage-instrumented suite: **14,485 passed, 9 skipped**, 937 warnings,
  744.79 seconds, owned supervisor exit 0 and cleanup complete. This snapshot
  preceded the final popup fixes. `/tmp/cu-r11-verified.{log,json}`.
- After popup fixes, entire computer suite: **2,447 passed**, coverage appended
  to that whole-suite run; owned supervisor exit 0, no residuals.
  `/tmp/cu-r11-postmenu.{log,json}`.
- Final coverage gate: **327 gated files, 92.7% total, zero findings**. No baseline,
  threshold or exclusion changes. In-process fake native-boundary tests cover
  actual Python lifecycle paths; native subprocess evidence remains separate.
- Type gate zero findings against `ab03f51`; lint zero new findings; apply registry
  zero findings. Diff-check clean. UI full npm check, browser operator test and
  committed dist rebuild passed; only existing bundle-size warning.
- Parent rerun of full controller/native/Xed task passed 15 actions. Later actual
  popup-selection task passed twice, 16 actions, exact saved/reopened UTF-8 file,
  unchanged core cursor, no owned held input, preserved app and automatic cleanup.
- Native guardian rebuilt with production hardened flags in the existing Debian13
  builder. Package built and inspected, including root-owned executable and exactly
  three installed operator docs. R9 APT install/upgrade evidence is historical;
  this round's artifact inspection is not a repeated APT or deployed-service test.

Earlier failures are retained in logs. No claim that the final popup source ran
through the whole non-computer suite a second time; its complete subsystem and
coverage/type/lint gates were rerun instead.

## Honest installation and operational limits

X11 mapping introspection dependencies are package Recommends. KWin private ABI
requires a matching companion binary: source and nfpm recipe are present, no
distro-specific companion was published. This is not zero-manual-step KDE readiness.
Plugin activation and portal consent remain explicit.

No real workstation display was accessed for this round's GUI work. Tests used
owned isolated displays/containers; no Cinnamon workaround was added. Production
service stayed active, PID 3254906, zero restarts. Final observed zombie census
was 631 system-wide / 543 odin-owned, versus initial 484 / 396: it grew during
agent subprocess experiments. This is not reported as clean. Dead adopted
children cannot be reaped from outside the live parent; no restart/injection was
used to conceal them. Parent full-suite/build/E2E workloads used exclusive
subreapers and verified no residual descendants. All R11 test containers stopped.

PR remains draft for external review and deployment testing. Installed packages
and source support do not constitute permission to enable or control a desktop.
