# R5 acceptance corpus Drawing tasks 16 through 30

## Pre-execution plan

Each numbered task is a separate fresh isolated native-controller sandbox. All
images are GUI-authored and GUI-saved, exported read-only, and independently
decoded by Pillow against the following predefined semantic predicates. All
successful tasks must then create New Blank Image, verify a white intermediate
canvas, close the actual saved tab, open its disk path in Drawing's chooser, and
match every decoded RGB canvas byte. No current screenshot is used as a golden
semantic baseline. Repeats retain the same task ID and all failure evidence.

| ID | Distinct workflow | Planned success predicate |
|---|---|---|
|16|Pencil connected zigzag|Ink at all three prescribed segments; distant region white|
|17|Straight-line tool|Continuous diagonal red line with white off-diagonal interior|
|18|Rectangle outline|Four red edge centers, white center and outside|
|19|Oval outline|Four red cardinal points; corners and center white|
|20|Rounded rectangle|Red edge centers, rounded empty corners and white center|
|21|Closed polygon triangle|Three red edges; white center and bounding-box corner|
|22|Main-color filled rectangle|Solid red interior and white outside|
|23|Horizontal gradient rectangle|Red-to-secondary gradient with unequal separated interior colors|
|24|Eraser correction|A white erased gap through ink, surviving ink on both sides|
|25|Highlighter|Translucent colored horizontal band, lighter than opaque red|
|26|Text insertion|Rasterized explicit CORPUS label in target ROI, OCR text match|
|27|Undo|First line remains, separate second line completely absent after Undo|
|28|Redo|Second line restored after Undo then Redo, both lines visible|
|29|Rectangular selection move|Source motif absent at source and present at offset destination|
|30|Dashed line|Repeated red/white intervals on intended horizontal line|

Native discovery is retained separately and is not a counted acceptance task.
Installed Drawing source provides tool ordering and menu labels; actual captured
native screenshots plus OCR establish pixel targets where AT-SPI is unavailable.
No direct application API, fake backend, XTest bypass, host drawing, or document
preseeding is permitted. Unknown input ends the attempt without replay.

## Implementation and results

Result: **13/15 distinct Drawing tasks passed**, two failed. Script:
`scripts/computer-feasibility/corpus30-drawing.py`.
Evidence prefix: `/home/odin/corpus30-drawing-*`. Progress:
`/tmp/corpus30-drawing-status.txt`. CLI: `--evidence PATH --cases 1,2,...,15`.
Cases map to corpus IDs by adding15. Exact unit/driver/supervisor identities are
recorded in each `events.jsonl`; cleanup is followed by exact validation.

### Accepted evidence

Directory pattern: `/home/odin/corpus30-drawing-batch-LETTER/case-NN`, NN=ID-15.
Each has `ledger.json`, `events.jsonl`, `drawing-ID.png`, `new-blank.png`,
`closed-saved-tab.png`, and `reopened.png`.

|IDs|Batch|Result|
|---|---|---|
|16,17,18,19,22,23|a|6 passes|
|20,27|b|2 passes|
|21,28|c|2 passes|
|30|d|1 pass|
|24,25|e|2 passes|
|26,29|e latest|2 failures, not accepted|

Aggregate exact ledger: `/home/odin/corpus30-drawing-audit.json`. It includes all34
fixture identities, every retained attempt, accepted artifacts' SHA256 and decoded
RGB SHA256, and per-task paths. Independent audit passed for all13: PNG integrity,
1000x600 dimensions, predefined semantics, blank intermediate, full decoded reopened
canvas equality at `(40,47)`. Repeats count only once. This is deterministic fixed
profile native GUI evidence, not general-purpose model agent competence.

### Retained failures and corrections

-26 text: CORPUS reached native text popover, but OCR could not identify Insert here;
  stopped without guessing. Not a saved/reopened text success.
-29 selection: move occurred but source-region whiteness failed, including after
  Default color GUI selection. Not accepted.
-20 initial rounded-corner predicate overlapped curve. Exact1px corner predicate
  declared before fresh successful retry, unchanged intended geometry.
-21 already-active Polygon left popover open. Explicit Escape dismissed that known
  popover; fresh retry succeeded.
-24/25/26 early tool-size focus incorrect: Ctrl+A selected canvas. Unsupported
  double_click rejected. Final size adjustment uses observed native plus button.
-28 Ctrl+Y inert in Drawing; actual header Redo button succeeded fresh.
-30 batch-b and24 batch-d returned input_outcome_unknown (private pixels changed).
  Attempts ended immediately. Never replayed on the same grant.

Negative-oracle testing found oval accepted by rectangle edge-center predicate.
Added explicit red rectangle corners, strengthening the original intended geometry,
then reran all13 accepted artifacts successfully. All15 predicates rejected blank
images; seven cross-task wrong-geometry checks passed: **22 negative contracts**.
These are executed assertion checks, not pytest suite claims.

### Cleanup and scope

All34 isolated fixtures operator-cancelled and controller-closed. Exact recorded
driver/supervisor PIDs absent, every exact unit MainPID0, every cgroup absent.
Per-batch validate_action bundles passed; aggregate audit independently rechecked
all34. An initial too-long validation target parse error was corrected with split
checks and passed. Exact identities are in the aggregate audit.

Managed batch processes: a3571100,b3600635,c3627239,d3640217,e3652778. Each finished
exit1 because its ledger retains real failures; row-level passes independently
audited. Logs: `/home/odin/corpus30-drawing-batch-LETTER.log`. Discovery1..4 separate
non-counted probes. No further fixtures remain running.

No dependencies installed. No runtime/controller changes, live configuration,
deployment, commits, pushes, or :0 access. Only this report and new script authored
in repository. Ruff actually reported34 formatting/import findings before final
assertion addition; **no clean-lint claim**. Script imports and executes; independent
13 artifact audits and22 negative contracts passed. No full-suite claim.
