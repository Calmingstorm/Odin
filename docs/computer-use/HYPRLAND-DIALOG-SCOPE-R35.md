# Hyprland own-dialog scope parity (R35)

## Corrected boundaries

The previous companion rejected every xdg parent and required pointer focus to
equal keyboard focus before even observing a dialog. The Python backend also
lacked a persistent original-application identity pin. This round admits native
same-process dialogs while tightening unrelated-process rejection.

- Native PID/UID comes from `wl_client_get_credentials`, never app class or title.
- Every xdg ancestor must have the same credentials; missing ancestry, cycles and
  excessive depth refuse. pidfd liveness and ancestry are rechecked for leases.
- Original application process/executable identity and granted output remain
  pinned over observation invalidation and pause/resume.
- Input remains bound to the exact delivered surface, revision, geometry and
  source. A new dialog needs new delivered observation authority. No batch rebind.
- A synchronous owned absolute positioning operation may enter only the already
  observed keyboard target with no owned or physical held inputs. Button/axis and
  other focus-change fences remain in place.
- Native window addresses can be reused. They do not suppress modal evidence.
  Floating original windows remain conservative dialog candidates.

## Live finding beyond the initial fix

Delayed dialog observation succeeded, but an immediate post-action observation
still failed during compositor animation. Fractional geometry previously shared
a generic failure with invalid geometry. The companion now emits a narrowly
authenticated negative result for fractional **window** geometry only, after
provenance, containment, environment and lifetime checks. This response contains
no scope token and cannot authorize input.

Observation-only settling verifies original process/compositor/output on every
transient. Retry initiation is bounded to one second, at most 51 attempts with
20 ms spacing; total capture completion is bounded to five seconds. The initial
one-second total capture deadline was rejected in live testing because it also
cancelled otherwise valid raster work. Existing three-second native transfer,
fresh capture proofs and 250 ms input scope leases remain intact. Strict input
predispatch and watchdog paths never use settling or replay injection.

## Verification recorded before deployment

On the authorized target, candidate `aa466cbd` and the matching native companion:

- Opened Pinta's color dialog and obtained the immediate follow-up observation.
- Clicked its observed Cancel button, including pointer entry from outside the
  dialog, and obtained the immediate canvas observation.
- Opened New Image, observed it immediately, clicked Cancel and immediately
  observed the original canvas again. Earlier candidate also verified `Ctrl+N`.
- Both dialogs retain `safe_application` classification despite class changing
  from the Pinta main window to `dotnet`.
- An unrelated native browser was rejected by the candidate backend with
  `hyprland_original_application_changed`, not by the harness's extra process pin.
- No drawing, document creation, save, color change, or original-document close.
  Both existing document tabs and the selected canvas were visually preserved.

The final immediate round used four injected clicks, six observation requests,
39 capture attempts (including discarded animation attempts and revalidation),
one pre-input changed-pixel refusal and explicit fresh observation, zero input
replay or release-recovery operations, and 331.43 seconds of supervised elapsed
time. This is a qualification harness measurement, not an optimized task benchmark.
Earlier harness mistakes and candidate failures remain in the private evidence;
they are not counted as successful qualification.

All harness sessions closed with cooperative release ACK and reaped guardian.
The companion reported zero owned keys/buttons. This is still Hyprland
best-effort release, not universal receiver-release or hard-kill qualification.

The live harness exercises the candidate backend with explicit manual image
delivery and native transports. It is **not** the WebUI normal-turn acceptance
draw. Separate automated controller/turn tests cover fresh image delivery,
expected-modal continuation, no replay and batch interruption. Native extracted
warp/focus tests cover the coupled positioning branch, wrong destinations,
owned/physical holds, reentry and cleanup requests. X11 runtime source is unchanged.

Final frozen-head quality gates and protected deployment are recorded in the PR
handoff only after completion. The acceptance drawing remains with the operator.
