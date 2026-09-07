# R6 actual main-session Inkscape evidence, 2026-09-07

Only the parent executed the operator-authorized main-session tests. No agent
accessed that display. Both runs used a new native Inkscape process, private HOME,
non-activating session bus, root standalone subreaper, exact XRes identity checks,
production controller/backend and bounded input guardian. Existing applications
received no keystrokes or document operations. No screenshots were posted.

## Private qualification before main input

The exact main CLI task passed twice in an isolated PID/network/mount namespace
with Xvfb/Openbox and UID1000. Final private evidence:
`/tmp/private-main-r6-wdmi5xql`, harness SHA256
`8dd2ddac74c7b8a88399260cd9121b9531460c5fc81b6831fcaad2622e4743a5`.
Ten production-controller actions verified, GUI-saved positive-size rectangle
and ellipse, exact metadata equality, screenshots/profile removed, and zero
surviving recorded processes/cgroup. Xauthority enforcement was measured.
Private-only Xvfb/empty-baseline adapters do not relax main topology guards.

## First main run: task succeeded; power restoration required follow-up

Evidence `/tmp/cu-r6-1wtyi61r`. On the actual DP-4 primary, ten actions verified:
select rectangle, drag, deselect, select ellipse, drag, deselect, Save As, select
filename, type a new scratch path, save. Independent SVG parse found exactly one
positive-size rectangle and ellipse. Artifact SHA256
`9c6c362fb727eccd18a2f1a1d8fae0289fbf65e0f1df294f0b2fcb4c2ddac5ab`.
The artifact and all captured pixels were purged during cleanup.

The CLI returned **1**, not a pass: its initial DPMS state was Off and input woke
the monitors to On. RandR and full window/input metadata matched exactly; only
power differed. Parent restored the recorded Off state and independently captured
`after-power-restoration.json`, whose JSON value equals the original baseline.
Canonical hashes match. A raw byte comparison initially failed solely because
integer window keys had been stringified and sorted lexically; semantic equality
and canonical sorting, not that failed byte assertion, establish restoration.

The scratch harness then gained narrowly scoped recorded-power restoration and
unit tests. This changes no persistent DPMS settings. It is not production input
behavior or a claim that every display handles sleep/wake without topology events.

## Second main run: refused drag; full restoration completed manually

Evidence `/tmp/cu-r6-ke2bkzsh`. First keyboard shortcut verified; the drag returned
unavailable. The task stopped without retrying uncertain input. No SVG was saved.
Scratch processes and evidence were cleaned; the CLI returned **1**.

During this run the desktop topology changed: DP-2 remained connected but became
disabled, the remaining monitors rearranged, and the window manager moved some
hidden clients. This is observed state, **not a proven causal attribution** to
the compositor, monitor sleep or the input operation. The harness correctly
reported failed restoration rather than rewriting its baseline.

Parent performed only baseline-directed recovery:

1. Temporarily woke outputs for inspection. Reapplied recorded exact mode IDs,
   positions, rotation, primary and framebuffer dimensions for all four monitors.
2. All original client geometry returned except one hidden game client displaced
   by one pixel horizontally. After exact PID/start/XRes/state checks, restored
   that recorded position only. It remained hidden, unchanged size, and received
   no input, activation or document operations.
3. Restored the exact original window-manager idle focus, revert mode and pointer.
4. Restored original monitor Off state and captured `final-restored.json`.

**Final full JSON equality passed**: topology, all original windows and identities,
states, stacking, workspace, pointer, held-key/button state, focus and power match
the before snapshot. Canonical hashes independently matched. Final validation
passed; scratch HOME/evidence absent, supervisor residuals empty, live Odin still
PID3254906. No logout, restart, live code change or broad process cleanup occurred.

## Honest qualification boundary

The actual main session completed an Inkscape drawing/save task, not only Xed
typing. Neither main CLI run was an all-stages unattended pass. The second exposed
an operational sleep/topology limitation, so do not rerun unattended scratch tests
or claim automatic leave-as-found recovery for arbitrary display transitions.
For operator deploy testing, use an awake stable topology with Aaron present,
start with a new scratch document, stop on a changed-source refusal and inspect
the desktop. Existing work must never be used as test material. No further main
input was performed after baseline recovery.
