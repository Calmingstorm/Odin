# Real model isolated GUI acceptance, R5

## Final result: actual production definitions

2026-09-07: `scripts/computer-feasibility/model-gui-smoke.py` completed a real
model task through `ComputerIntegration.foreground`, `NativeToolDispatcher`,
the actual controller and isolated Xed backend. Production service was not
booted. Main desktop, live configuration, and deployment were not modified.
No screenshot was posted. Credentials were not printed, refreshed, or copied.

Final evidence: `${EVIDENCE_ROOT}/model-gui-r5-xed-07/`. Managed job exited0
after **84.687 seconds, 11 model requests**. This run uses **unchanged actual
`computer_definitions()`**, including the parent's explicit `strict=False`
production transport fix. The harness-only union schema used in earlier
experiments has been removed completely.

Every actual serialized request contained one native PNG matching the latest
delivery-validated frame digest, exactly the three computer tools, and explicit
strict=false on all three tools. Wire audit retains counts, digests, byte
lengths and store=false, never wire pixels or credentials.

The model typed a unique multiline note, opened Save, typed its path, clicked
Save at `(1230,937)`, closed the saved tab at `(207,102)`, created a blank
document, opened Open, clicked its selected file at `(1233,937)`, inspected the
loaded pixels and requested export. Coordinates were model-selected, not
supplied by the harness. One close action was rejected before injection with
`visual_target_changed`, uncertain=false. A new observation and new model
decision followed. No uncertain action was replayed.

Independent readback exactly matched expected UTF-8:

- `native-note-67178e8141.txt`, **86 bytes**, three lines and one final newline.
- SHA256 `d2116ae57d74d7f4d6543a3c85a6f2b5098e0f7b23dbb36795cee1f4e569e794`.
- Separate `cmp expected.txt exported.txt` passed through validate_action.

Native private raster artifacts under `computer/evidence/`:

- `683ede0652e64bec9ea81282308b511e`: saved tab closed, no document.
- `b29e754928424a44be5596abdeacd04b`: new blank document.
- `cf76385b58a54831b3ffa290d85f8014`: freshly loaded note.

Independent local OCR of the last artifact read the note title, three lines,
and Xed's **Loading file '/workspace/exports/...'** status. OCR misread some
identifier characters; exact contents come from exported bytes, not OCR.
The model subsequently received fresh post-load pixels and reported completion.
Thus this is actual close/reopen evidence, not just activation of an old tab.

## Authority and limits

The fixture principal uses actual PermissionManager, HostAccessManager and
ToolExecutor.check_permission with an explicitly local fixture admin entry.
No authorization predicates are patched. Foreground grants, dispatch, vision
admission and validate_delivery execute normally. This does not test Discord
login. The model receives native pixels plus normal accessibility/provenance
metadata, not a pixels-only ablation. Only three computer tools are offered.
Arguments are dispatched verbatim, never normalized or rewritten. The harness
starts/closes its own isolated session and observes after known actions; it
does not supply click coordinates or a precomputed GUI plan.

Per run: <=28 requests, <=90s/request, <=570s total plus20s cleanup; provider
retries disabled. Unknown outcome aborts. At most2 known changed-target
rejections permit fresh observation/model decision. Runtime leases unchanged.
ReadOnlyAuth comes from vision-smoke.py and forbids refresh/save.

## Preserved failures and exploratory runs

Directories `${EVIDENCE_ROOT}/model-gui-r5-xed-01` through `-07` remain intact:

| Run | Requests | Outcome |
| --- | ---: | --- |
| 01 | 12 | Invalid optional fields; exact driver interrupted, finally-cleanup ran |
| 02 | 1 | Same failure even explicitly instructed to omit unrelated fields |
| 03 | 5 | Harness union schema; stopped on known changed-target rejection |
| 04 | 9 | Save/open/export, exact check failed: extra newline, 87 vs86 bytes |
| 05 | 10 | Exact export, but Open only activated existing tab: weak reopen proof |
| 06 | 11 | Exact export plus closed/blank/fresh reopen, harness union schema |
| 07 | 11 | Exact export plus fresh reopen, actual production flat schema |

Before the parent's transport fix, every type call contained unrelated key,
duration, points, x/y, blank expected_modal and expect.x/y. Controller correctly
rejected invalid_arguments; omission instructions did not help (events02).
Implicit strict-schema normalization is a plausible provider explanation, not
proof of provider internals. The explicit production strict=false fix stopped
that behavior in run07, with actual final wire evidence. No source workaround
or harness-specialized tool schema remains.

Xed adds a final newline on saving. After run04, instruction tells the model to
type three lines without a trailing newline, preserving the expected saved
byte contract. No host-side application file rewriting occurs. GUI receipts
measure only raster change and are not used as saved-artifact proof.

All seven exact units/cgroups/supervisors/drivers were independently checked gone
using validate_action. Final unit
`odin-cu-9062f37a257e1180897861387d5db5bc.service`, supervisor PID3529813:
inactive, exact cgroup absent, driver and supervisor absent. Controller retains
no live sessions. Supervisor returncode1 is recorded honestly; cleanup proof is
the independent unit/cgroup/process checks, not a claimed zero supervisor exit.

Targeted tests `tests/test_computer_model_gui_smoke_r5.py`: **5 passed**.
Targeted ruff passed. Tests cover wire image digest/tool scope, duplicate text
pixels, explicit production non-strict flags, and retained tool correlation
after old-frame retirement. No full-suite claim. No commits or push by this agent.
