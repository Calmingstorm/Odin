# R4 isolated grounding increment

2026-09-07, `feat/isolated-computer-use`. Experimental private-X11 increment,
not a working-product or real-GUI acceptance claim.

## Owned changes

`src/computer/runtime/backend.py`, `worker.py`, `primitives.py`,
`tests/test_computer_runtime_grounding_r4.py`, and this document.
`accessibility.py` unchanged. Controller/public-policy changes belong to another
owner. No commits, pushes, packages, live Odin access or service changes by this
agent; only the explicitly bounded transient runtime fixtures were operated.

## Mapping, rendering and action evidence

Capture source is the fixed PRIVATE `:77` root, not the operator desktop or a
window crop. Explicit identity source/input mapping; clicks are additionally
confined to the observed owned application window. Delivered centers map through
render metadata then floor to X11 integer coordinates. Native IDs and global
origins are absent from neutral observations.

Source ID is opaque and stable for the single-use backend. Revision changes with
root size or the full observed window/process fingerprint, including position,
title, XID, PID, modal and process start identity. Stable captures retain revision
but get a new internal one-use token. Consent changes on resume. Pause/input/stop
discard bindings. Failed release quarantines future worker/adapter input.

Native allocation preflight before GDK: dimensions<=4096, conservative RGBA source
bytes<=16MiB. 1080p and2560x1440 fit, 4K does not fit this backend ceiling. Row stride
and packed format are validated. Packed transport cap16MiB; shared rendering caps
delivery at2,000,000pixels and2MiB PNG. Rendering uses `asyncio.to_thread` to avoid
blocking heartbeat. Freshness/revocation are rechecked after rendering. Sandbox
retains its existing1GiB RSS cap. Legacy metadata lacking mapping/revision remains
validated PNG capture-only, preserving the old unknown-mapping contract test.

Only explicit `click` with source/revision/consent, delivered integer `x,y` and
matching `expected={type:pointer_at,x,y}` is admitted. No keyboard, text or semantic
exposure. `_legacy_private_act` uses the same validator; worker uses grounded entry.
Immediately before input, worker recaptures native pixels and compares the observed
raster digest, closing the controller authorization-await gap identified in review.
This is still a snapshot check, not atomic framebuffer exclusion during input.

After release an independent pointer query, with window/process/focus/root checks,
returns actual coordinates, `method=pointer_query_after_release` and independently
derived `target_window_matches`. Injection alone never establishes verification.
Matching evidence proves POINTER LOCATION ONLY, not semantic click completion.
Unavailable evidence stays unavailable; uncertain input/release stays unknown.

## Actual runtime: 0/2 started successfully

Both existing-supervisor attempts used fixed `xed` profile and intended one harmless
click in a new blank editor body. Neither reached ready/capture/input. No third run.
An earlier unsupported-interpreter tool call was rejected before execution.

1. Direct: `RuntimeFailure: desktop connection lost; outcome unknown`.
   Unit `odin-cu-eb1af17f3131deee3997108f70da2ce4.service`, supervisor PID3436922,
   returncode0. Ordinary and sudo journal queries had no unit entries.
2. Noninteractive sudo: same failure. Unit
   `odin-cu-5fe3470b9a8f88fd5e8fcbb9ae320737.service`, supervisor PID3438162,
   returncode0. Privileged journal confirms startup then main exit status1/FAILURE.

Root causes beyond those observations are unestablished: supervisor stderr is
suppressed and no worker diagnostic was captured. No live pixels, toolkit event,
saved artifact or application-survival claim. `validate_action` cleanup passed2/2
and3/3 respectively: exact supervisor gone, unit MainPID0, second cgroup absent.
First cgroup independently observed absent too. Units inactive, empty ControlGroup.
Repeated stop calls measured0.012s/0.028s, NOT initial stop/input-release latency.

## Test evidence and remaining gates

Before review corrections: runtime grounding/primitives/imports107passed in1.03s.
After quarantine additions, plus R1 contracts and controller actions:203passed
in3.34s. Scoped Ruff and git diff-check passed then. Final review-correction checks
passed208 tests in3.47s for those five files; the new grounding file alone passed34
tests in0.80s. Scoped Ruff and diff-check again passed. No full-suite claim.

Persistent X11 event epochs are not implemented: same-identity ABA and focus/modal
away-and-back between snapshots remain gaps. No atomic widget-focus exclusion.
No keyboard/semantic grounding, real multi-monitor/session lifecycle, 4K capture,
crop API, saved/reopen corpus, or successful supervisor GUI run. Exact screenshot
matching may conservatively reject blinking caret content, not measurable because
both runtime launches failed. This is a reviewable increment, not finished support.
# Parent continuation after the bounded agent increment

The agent's two attempts and evidence above remain unchanged. The parent then
diagnosed launch failures rather than leaving the cause unestablished. Four
non-graphical transient preflights ran only true or a read-only containment probe:

1. f892343ee10c8fa0e77cd54d93677a57: bwrap0.9 requires explicit --unshare-user
   alongside --disable-userns. Exit1.
2. dff16f0579d717e277e294ee645ce614: new private proc mount denied. Exit1.
3. b77bcbc4c127325a4d1097bd580a39a6: removing the two outer masked-proc settings
   passed proc setup, then failed because /dev/shm was not a mount point. Exit1.
4. 5f633acee95cf73d413270c5835e2e95: explicit user namespace, readonly private proc
   and bounded mounted/readonly shm. Exit0, uid65534/private PID2, host home/display,
   physical inputs and /sys absent. No graphics or input in any of these four.

Each suffix is an exact `odin-cu-<suffix>.service` identity. Every preflight unit
had MainPID0 and absent cgroup afterward. Decision R4 records the safety rationale
before dependent production-profile edits. Other systemd and bwrap fences remain.

Additional scratch-worker attempts, ALL on private :77, never the main session:

| Unit suffix | Purpose | Observed result |
|---|---|---|
| 25425fef9a01222c476e94bd5bf7bda4 | Corrected profile, xed | Worker failed before ready |
| f5379d2a0e3ba89da8c74e37572c799c | Startup traceback | Private desktop primitives failed |
| 9d1cef81ec5d8e155e9bbab23aafb364 | Startup child stderr | Xvfb aborted in NVIDIA EGL/GLX initialization |
| bb5d76478039116f72aa4f3c0e4c6951 | Private GLX disabled | Worker exit139 before ready |
| 0b2c247ad595f84067db5f288ed75953 | Private faulthandler | Segfault at snapshot capture call, GI extensions loaded |
| ff92332398770355a082abea504adf94 | Protocol capture, xed | Ready, captured1280x960, click RPC unavailable |
| 19e87d0814a6a99fe6a72fdd3ed90b72 | Actual controller, Drawing | Ready and observed, action refused unexpected_modal |

Both successful startups reported uid/gid65534, no-new-privs1, capabilities0,
256MiB workspace and no host home/machine-ID/physical-input/graphics devices.
No successful click or artifact is claimed. The generic unavailable xed action
does not establish why it failed or whether any input was attempted; no retry was
made in that session. Drawing's controller refused before injection on its startup
modal. Refusal was not bypassed to manufacture a demo.

Source repairs: explicit user namespace and proc/shm mounts, private Xvfb GLX off
matching the already-proven XI2 fixture, precreated private socket directory, and
replacement of GI capture with per-call Python-Xlib protocol capture on fixed :77.
The observed segfault site justifies removing that path, not a claim of a proven
GI root cause or native-crash-free worker. The strict private24depth/32bit/LSB
TrueColor layout is checked before allocation. Unsupported layouts refuse.
16MiB is the SOURCE PAYLOAD cap, not total working memory; simultaneous protocol,
RGB/slice and immutable copies remain bounded under the existing1GiB cgroup.
Synchronous native calls still depend on outer RPC timeout/unit teardown for a
hard stop. This backend is never an existing-session cleanup implementation.

Scope totals: two initial failed runtime launches; four non-graphical preflights;
seven parent scratch-worker attempts, of which only the last two reached ready.
Every exact unit has MainPID0 and absent cgroup after cleanup. Explicit recorded
outer supervisors3444326/3445264/3446468/3446775 are absent. The parent did not
record a sampled census of every short-lived inner process in these later probes;
cgroup disappearance is the evidence, not an invented exhaustive PID ledger.
Historical service-owned zombies were not reaped, signalled or injected into.

No system package installed. System Python already supplied python-xlib. The
development venv gained python-xlib0.33 as recorded in R4-MAIN-SESSION.md. Production
packaging must provision the sandbox's system-Python dependencies explicitly;
installing a venv extra alone does not change /usr/bin/python3 inside the sandbox.

Final source review found no new confirmed P1/P2 in the finite reviewed scope,
but capture deadline, memory-copy and optional-system-dependency limitations remain.
At this parent checkpoint:567 focused computer tests passed, lint/type gates add
zero findings. Full-suite result belongs in the final R4 checkpoint.
