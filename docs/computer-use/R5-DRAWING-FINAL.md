# R5 Drawing: complete disk-reopen task and recovery evidence

## Result

One distinct Drawing task now passes end to end, reproduced in two fresh owned
sandboxes. These are repeatability runs of the SAME task, not two task-denominator
successes. No 27/30 or full30 corpus claim. Final evidence:

- `/home/odin/drawing-final-r5-confirm/events.jsonl`, `ledger.json`
- `/home/odin/drawing-final-r5-confirm/drawing-03.png`
- private `new-blank.png`, `closed-saved-tab.png`, `current.png`
- first complete run `/home/odin/drawing-final-r5-final`
- progress `/tmp/drawing-final-r5-status.txt`

All task input passed through actual controller observe, native frame serialization,
delivery validation and strict grounded act. GUI created three distinct connected
red strokes, saved PNG, created a blank document through New Image/New Blank Image,
closed the previously saved tab using its observed close icon, opened the actual
export path in the GUI chooser, and compared every decoded canvas RGB byte.
The saved document was NOT left open. A prior deliberate close-less probe produced
Drawing's `The file drawing-01.png is already opened` / `Open again` modal and failed;
that evidence demonstrates why New alone was insufficient. We did not admit that
later Information modal or extend the startup permission to it.

Final run task wall time46.36s. PNG1000x600,10734bytes,2321ink pixels. PNG SHA256:
`983eac9fb43528dd6a9cbe0cbec16eaf7bc62f1f209fdb72221efa53dddb92f5`.
Decoded RGB SHA256:
`1698fd89eddca61466855a4ab3b9c3985389dad46d719a14493f3f42d97c49f6`.
Exact reopened screenshot crop `(40,47)..(1040,647)` equals the full decoded PNG.
Independent Pillow verification outside the controller also checked PNG integrity,
size, complete RGB equality, and blank intermediate ROI; independent OCR of the
closed screenshot reads `Unsaved file` without the saved filename. Final repeated
run produced the identical PNG hash and pixel comparison.

## Actual failure diagnosis and narrowly scoped repair

Historical `/home/odin/gui-corpus-r5-drawing-b/events.jsonl` has the SAME modal token,
source revision and native startup window across safe->unrecognized transition.
Private AT-SPI descendants shrink from Information/No/Yes to Information/fillers,
losing both buttons. This is an incomplete accessibility traversal, not a newly
authorized dialog. The native status can still say `available` with partial nodes.
Current private diagnostics are recorded with window identity, accessibility status,
detail, roots and nodes (no screenshot bytes in the JSON).

`primitives.py` now retains startup approval only after full bounded Information +
exact No/Yes button proof, for the exact window/PID/process identity, exact raw
capture SHA256, same-process transient, same root, and an accessible-label/text/role
subset with no new content. Empty nodes, changed pixels, new labels, foreign or
changed identity remain unknown. Password/security/permission/terminal labels or
text remain denied. Approval and startup identity are cleared on nonmodal capture.
This is not a title-only permission or a general modal bypass. Fresh one-use
observations, source revision, private pixel recheck and modal token remain required.
Parent's `ctrl+shift+s` allowlist entry was preserved.

The final stability probe took9 successive startup observations and then additional
fresh act observations: all safe. That run happened to retain all9 nodes, so it
does NOT independently reproduce the historical missing-descendant transition.
The exact-raster partial-descendant path is additionally covered by synthetic tests.

## Recovery and negative evidence

- Operator pause after drawing: generation1->2,3.29ms. Model observation while
  paused denied `grant_revoked`. Owner resume generation3, remaining task completed.
- GUI Save chooser opened, Escape cancelled, canvas retained; subsequent Save and
  actual close/reopen succeeded. No replay of uncertain input.
- `/home/odin/drawing-final-r5-recovery`: missing modal token denied
  `unexpected_modal` before native input; controller then revoked grant. This is a
  correct negative result, NOT a successful same-grant recovery. New approved
  sandbox was used for successful recovery task. `/complete` is an earlier harness
  failure that expected a returned status rather than ComputerError; retained.
- `/closeprobe`: later already-open Information modal stayed unknown; no bypass.
-12 new synthetic regression cases cover exact-raster partial approval and changed
  pixels/window/process/foreign transient/new label/password/terminal/security text/
  empty nodes/unapproved state/dismissed-startup reuse negatives.

Recorded test command in dev checkout:
`.venv/bin/pytest -q tests/test_computer_drawing_modal_r5.py tests/test_computer_native_gui_r5.py tests/test_computer_runtime_grounding_r4.py`
Result85passed. Ruff on primitives and new test: passed. Scoped diff-check: passed.
Not a full-suite claim.

## Other retained failures and scope

`/probe`: GUI save worked but Ctrl+N creates a new top-level window; native postcapture
window transition failed target proof and controller returned input_outcome_unknown.
`/menu`: x30 toolbar coordinate opened Open chooser, not new menu; no menu item found.
`/newtab`: correct x95 New Image menu displayed, but main Drawing AT-SPI root was
unavailable; fresh pixel-observed menu item x77,y83 used in subsequent helper.
No native policy changes were made for that accessibility unavailability.

This helper is fixed-profile deterministic GUI evidence, not a model-driven general
computer-use agent. New/close coordinates are evidenced for the single task sandbox.
Do NOT run count30 repeated drawings and treat offsets as independent tasks. Parent
owns meaningful task corpus expansion, controller/auth and attached-session work.

Owned source changes only: `src/computer/runtime/primitives.py`, corpus helper,
`tests/test_computer_drawing_modal_r5.py`, this report. No commits/push/deploy, no
live `/opt/odin` config, no :0 or operator desktop, no posted screenshots.

## Cleanup

All8 fresh fixtures were controller-cancelled and closed. Exact driver/supervisor
absence, MainPID0 and cgroup absence verified with validate_action for each:

| Run | driver / supervisor | unit suffix |
|---|---|---|
| probe |3543265/3543266|3c216e96ffacf923f27a9a4988811224|
| menu |3545573/3545574|4881835175e891196cb596bae68770e5|
| newtab |3547483/3547486|24bacd87febf595f485b89abfb1d25a9|
| closeprobe |3549146/3549147|00bb8d10d0b78649f6e18a36a18f1516|
| complete |3551749/3551750|8be29c4b14d68d80a30adb7553c9015d|
| recovery |3552299/3552301|fa77d2c0afb44ce3cd33adb7790d5838|
| final |3552622/3552623|393a9678df14b5a0b40d2ed4898d8054|
| confirm |3555306/3555307|39226365750ff04b85de3948ae165478|

Unit names have `odin-cu-` prefix and `.service` suffix. No owned fixture left running.
