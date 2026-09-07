# R4 review checkpoint: real capture, guarded private clicks, honest blockers

Status: **reviewable, still not Stage6 complete and not deployable**. Same draft
PR350/branch. Source tested at `7ade066a898521dc5014c1c3ef576d7114249c13`.
This document changes no source after that immutable-source full-suite run.

## Main session

Aaron's overnight grant was used for **two capture-only experiments**, four
monitors each. The current topology includes a3440x1440 primary in addition to
the earlier three-monitor fixture, with a7920x2520 root extent. Every monitor
was captured separately, decoded and rendered within delivered pixel/byte caps.
Observed capture+render times were0.524-0.880seconds across the eight samples.

Both experiments verified unchanged pointer/held mask, focus, active window,
workspace, client list, devices, settings and topology. No input, wake, settings,
clipboard, file-save, existing-app or Odin WebUI interaction. Monitors were already
on. No real-session screenshot saved, posted or sent to a model. Native model
vision acceptance and main-session input acceptance are **not established**.
See R4-MAIN-SESSION.md for code, measurements, fixes and limits.

## New implementation and review fixes

- Explicit lazy read-only X11 monitor capture with pre-allocation format/stride/
  copy budgets, protocol padding, bracketed multi-timestamp topology snapshots,
  fresh opaque sources and empty input grants. No automatic display discovery.
- Private adapter source mapping/revisions and real bounded rendering. Narrow
  isolated click contract now has delivered-observation admission, fresh pixels,
  source/focus/modal fencing, durable pending before injection, action ceilings,
  no-replay receipts, cancellation/unknown-outcome handling and independent
  post-release pointer evidence. This only verifies pointer location/binding,
  never widget activation or the requested task's semantic outcome.
- Review caught and fixed a native failed pointer-window test being upgraded to
  success, plus the visual-change gap during final controller authorization.
  Native-to-adapter-to-controller regressions cover both. Residual hover/focus ABA
  and non-atomic visual-to-input races remain documented, not solved by a screenshot.
- Real startup work fixed explicit bwrap userns requirements, masked-proc mount
  incompatibility, missing shm mount, private NVIDIA GLX startup failure, and
  replaced the GI capture path after a measured worker segfault at capture.
  Read-only inner proc, disabled nested namespaces, capabilities0 and resource
  bounds remain. No host graphics driver or desktop setting was changed.

## Actual GUI and Wayland results

Private Xed now **starts and captures1280x960**, with containment checked. Its
attempted click returned unavailable; no successful action claim. Drawing starts
and observes, then the actual controller correctly refuses its startup modal.
Neither refusal was bypassed. The complete attempt ledger and exact teardown are
in R4-ISOLATED-GROUNDING.md, including every earlier failure and diagnostic probe.

Wayland fixture corrections established genuine last-owner EIS descriptor EOF.
Two orderly releases passed; **EOF complete release failed0/2**, with the owned
button still application-observed held, once even after portal Close. Same-app
survival/fresh typing passed1/1 attempted post-EOF check, which does not excuse
the release failure. See FEASIBILITY-WAYLAND-R4.md. No Wayland product backend
was enabled. Existing-session X11 input also remains unavailable: earlier12/12
proof retained ENABLED devices and does not prove leave-as-found detach or
watchdog-loss release safety. Main-session access is not a reason to ignore that.

## Validation and cleanup

- **Full local suite:12425 passed,5 skipped,843 warnings,589.33seconds**, zero
  test failures, source frozen at7ade066 throughout. Log:
  `/tmp/odin-computer-r4-7ade066-pytest.log`.
- Final focused computer suite:567passed. Wayland pure/shell suites:18distinct
  tests passed. Type gate vs d5fc7eb:2baseline findings,0new. Lint gate:0findings.
  Apply-registry gate:0findings. git diff --check clean.
- Computer operator browser harness, shared output renderer and existing Live
  logs browser checks passed. No UI source/dist changed. These are isolated
  browser tests, not real-session WebUI interaction or activated computer routes.
- Full suite retains known unawaited coroutine/pending async-shutdown diagnostics;
  this is not warning-free teardown. No claim of a new root cause.
- Final environment bundle5/5: no computer fixture cgroups, both exact Wayland
  containers absent, live Odin remains PID3254906 with NRestarts0, real topology
  still four monitors, source clean/immutable. Each runtime probe also validated
  its exact unit/cgroup and recorded supervisors. Parent's later probe ledger is
  not an exhaustive process-birth census. Historical service-owned zombies remain
  intentionally untouched, as Aaron instructed; no zombie-free host claim.

Only dependency installation: python-xlib0.33 in the development venv, reversible
as documented. No system/global/live-bot package installation, deploy, restart,
master merge, tag or CI/release pipeline. Commits carry skip-ci under that boundary.

## Next work, not silently activated

1. Resolve real private action refusal/modal startup with safe visible grounding,
   not weaker admission; add actual drawing/text/save-reopen and recovery corpus.
2. Engineer owned-input lifecycle with independent ordered release, exact device/
   keycode ledger, generation ownership and failure evidence on BOTH platforms.
3. Complete purpose-specific overview/detail selection, semantic grounding and
   source-clock provenance. Verify native pixels at the actual serialized model
   request in an authorized isolated task, not by adding a model name to a list.
4. Wire a lazy lifecycle owner into application startup/shutdown, native dispatcher,
   tool-loop lookup and API route registration, with transactional dedicated
   enable/disable and generation-pinned restart-only settings. Construction opens
   and recovers storage: disabled boot must remain inert. Production wiring is
   still absent; this checkpoint deliberately does not advertise a working tool.

Ordinary-turn/no-channel-restriction behavior and desktop-only refusal classes
remain unchanged. This branch advances toward useful computer use, but tests and
captured pixels are not a substitute for a completed GUI task.
