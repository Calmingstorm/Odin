# PR350 final consolidation, 2026-09-07

**Superseded by R8:** this records the earlier X11-only handoff and its gate
failures. The subsequent explicit Wayland requirement is implemented and measured
in R8. Read WAYLAND-OPERATOR-R8.md and REVIEW-CHECKPOINT-R8.md for current status.
The blanket refusal below is historical; previous coverage failures remain recorded.

> This is the earlier consolidation checkpoint, not R11 release readiness.
> Historical app restrictions and suite/coverage results below apply to that
> checkpoint only. See OPERATOR.md for the pending R11 implementation contract.

**Historical scope frozen. Remains draft for review and operator-owned local deployment
decision. No deployment, restart, merge, tag or GitHub/release pipeline.**

This pass changes documentation only. All runtime code, tests, scripts, dependencies
and committed WebUI assets remain identical to `9ec4460`, the last implementation
revision. Validation below was freshly run from development at `84117c2`; only
documentation follows. It is not live deployment acceptance.

## Fresh-operator walkthrough

Read all of LOCAL-DEPLOY-TESTING.md and cross-checked configuration, tools, runtime,
operator UI, ownership, vision admission and export behavior. Independent read-only
review `606bd7c1` identified the same key first-use gaps. The handoff now explains:

- Existing-session target B is for the user's actual screen; target A is isolated.
  No feasibility driver belongs in ordinary deployment/setup.
- All runtime assets and matching `ui/dist` must be in the deployed artifact.
  The sandbox runtime path is a transient mount alias, not a host install task.
- Both isolated apps are preflight dependencies, but an attached task does not
  require that entire isolated stack. Service and system Python are distinct.
- Actual service UID, private storage, display grants, foreground tool permissions,
  native-image transport and application readiness are independent checks.
- The inspector selects its authenticated owner's latest local session. A different
  administrator/Discord identity does not automatically inspect that same task.
- Measured monitor names, existing explicit X-server access versus Xauthority,
  and the fact that the example display/connector are not a deployment configuration.
- Isolated GUI save must target `/workspace/exports/<basename>`. Export is prepared
  before the task ends. The inspector does not rediscover a chat-prepared artifact;
  that path requires its receipt and authenticated download route. Attached export
  is unavailable despite the shared form. No automatic Discord attachment exists.
- Current R7 scope supersedes earlier reports without erasing historical failures.

Both exact YAML examples passed `ComputerUseConfig` parsing; all 20 relative links
resolved and all six named runtime assets exist in source. These checks did not
construct a computer runtime or modify live configuration.

## Current offering

- Default-off: ordinary tool rights are unchanged. Three optional computer tools
  operate in authorized foreground turns; no conversation lock or persistent mode.
- Isolated X11: Xed and Drawing. Native-model Xed save/close/reopen demonstrated;
  deterministic Drawing save/reopen and 27/30 distinct corpus tasks recorded.
- Existing-session native X11: focused Xed, Inkscape drawing/save, and narrowly
  keyboard-only Writer note/paragraph/bold/ODT save. Inkscape has actual-model house
  evidence; Writer qualification is a deterministic isolated fixture, not general
  Writer support. The operator opens/focuses apps and attached apps remain open.
- Refused: production Wayland, arbitrary apps/browsers/terminals/games, security
  prompts, Odin control-plane input, Calc/Draw/generic Office, Writer pointer/menu
  and open/new/close/reopen workflows. Attached Drawing is capture-only. Inkscape
  close/reopen is unqualified. No unattended or independent-pointer promise.
- Shared focus/pointer, printable ASCII, short input leases, strict fresh grounding,
  owned-only release and no replay of uncertain actions remain explicit limitations.

The PR also contains the already requested local command-subtree reaping repair.
It does not cure historical live zombies or cover every direct browser/native
launch. The measured minimal-command median overhead was about 36 ms, not zero.

## Fresh validation: not an all-gates-green claim

| Check | Observed result |
| --- | --- |
| Ordinary full suite | **13,158 passed, 5 skipped, 931 warnings**, exit 0, 534.12 s |
| Lint gate vs d5fc7eb | 0 findings, 0 new |
| Type gate vs d5fc7eb | 0 new, 2 existing baseline findings |
| Config apply-registry | 0 findings |
| `npm run check` | Passed, including Live Logs/output-renderer browser checks and build |
| `npm run check:computer` | Passed, isolated headless browser with mocked APIs |
| Rebuilt `ui/dist` | Byte-identical to committed distribution |
| Diff whitespace | Passed |
| Coverage-instrumented full suite | **1 failed, 13,157 passed, 5 skipped, 932 warnings**, 598.31 s |
| Coverage report evaluation | **21 findings**, 89.9% aggregate (aggregate is not the gate) |
| GitHub CI | Not run; latest head has no checks, pipeline remains unauthorized |

The covered-suite failure was
`TestSelectiveProvenanceErasure.test_forged_or_erased_token_cannot_survive_teardown`
at `tests/test_process_manager.py:2102`: `_read_job_token(escaped)` returned `None`
instead of the forged fixture marker. The fixture publishes its PID before exec
and immediately tests the marker; this run did not establish the exact race/cause.
Three focused reruns **under coverage** passed unchanged (1.45/2.31/2.30 s).
That is evidence of intermittency, not clearance of the failed full-suite result.

The failed instrumented suite prevents a coverage gate pass. Diagnostic evaluation
of its emitted report additionally found three existing-file missed-line increases:
schema +3, Discord tool loop +3, config-admin API +1. Eighteen new files are below
the required 85% core threshold: computer controller, manager, runtime accessibility,
backend, exports, primitives, profile, protocol, recovery, supervisor, worker,
X11 attached/worker/capture/guardian/lifecycle, and local supervisor/worker.
Some real worker execution lives in separate interpreters and GUI fixtures; that
does not satisfy the unchanged repository coverage gate or authorize exclusions.
No threshold, baseline or test was changed to manufacture green.

Logs retained locally:

- `/tmp/cu-final-full-84117c2.log` and `-owned.json`;
- `/tmp/cu-final-gates-84117c2.log` and `-owned.json`;
- `/tmp/cu-final-coverage-tests-84117c2.log`,
  `/tmp/cu-final-coverage-84117c2.json`,
  `/tmp/cu-final-coverage-gate-84117c2.log` and
  `/tmp/cu-final-coverage-84117c2-owned.json`;
- `/tmp/cu-final-provenance-recheck.log` and `-owned.json`.

All four standalone test owners reported complete census, cleanup true, zero
residuals and no rescue signals, including the failed instrumented suite. Existing
async-generator/coroutine teardown diagnostics and the Vite large-chunk advisory
remain visible. No warning-free shutdown claim.

## Desktop and live service

Read-only, title-free/pixel-free census verified the final R7 desktop topology
and window ownership, with no Odin window. Focus, pointer and workspace matched;
no held keys/buttons. Monitor power state was preserved; no wake or input was
sent. No computer/feasibility units or scratch HOME/pixels remained from R7.

Live service health was unchanged: active without restart, HTTP200 and `status=ok`.
The historical service-owned zombie census was unchanged; it was neither reaped
nor cleared by restart. The source repair is not deployed. No immediate desktop
cleanup or live-service intervention was indicated by these checks.

The test machine's longstanding Cinnamon wake/topology incident is an environment limitation,
not a demonstrated Odin defect. Production owned cleanup passed during it; exact
scratch baseline restoration did not and required manual recovery. No Cinnamon
workaround was added. The handoff states the manual display/window checks and the
hard limit on reconstructing replaced resource identities.

**Disposition:** handoff and PR consolidated, no new capability work. Scoped local
operator testing is distinct from merge/release readiness. Coverage validation is
not green and must be resolved before claiming all gates pass. Stand down with the
PR still draft; the reviewer reviews and the operator controls deployment/release decisions.
