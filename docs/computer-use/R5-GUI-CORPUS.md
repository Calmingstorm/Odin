# Deterministic GUI corpus handoff (partial, no acceptance claim)

Owned script: `scripts/computer-feasibility/gui-task-corpus.py`. No runtime edits,
controller edits, live install edits, deployment, commits or pushes by this worker.
All operations use real isolated controller observation, native image serialization,
delivery validation, then strict operation-shaped act. A logging backend subclass
only records native receipts/errors. Unknown/unavailable input aborts, never replays.
Save is followed by bounded read-only export polling; expected UTF-8 is exact.
Actions wait for two equal fresh captures to avoid transient pixels, not retry input.

## Final state, all fixtures stopped

Managed process **3526385**, driver **3526387**, supervisor **3526389**, unit
`odin-cu-32cc92f825748c704243df1a5f1a636e.service` completed Xed tasks04..10.
Evidence `/home/odin/gui-corpus-r5-xed-h`, stdout `/tmp/gui-corpus-xed-h.log`.
Bounded timeout1100seconds; controller1200seconds/200actions. Tasks04..10 all
passed exact saved and GUI-reselected content. Runtime271seconds, exit0.
Operator pause task07 succeeded generation1->2->3, pause3.4ms, model observation
while paused denied, appended recovery sentence and exact export passed.
Exact driver/supervisor `/proc` absence, unit MainPID0 and cgroup absent passed
validate_action after exit. No worker-owned fixtures remain running.

## Important qualification

Runs g/h kept original saved tab open: Open selected that tab. Exact text edits,
save and readback are real, but this DOES NOT prove fresh disk reopen. Their ledger
`pass` entries are qualified subtask successes, not complete acceptance successes.
Latest script adds close of observed page tab before reopening, but this addition
is NOT yet run and page-tab accessibility matching may need adjustment. Model agent
proved tab close via screenshot(202,102) in its single-tab fixture; don't reuse that
coordinate for arbitrary accumulated tabs. Parent owns independent model acceptance.

## Failures retained

All evidence directories `/home/odin/gui-corpus-r5-*`, each events.jsonl and ledger.
Xed a/b: ctrl+shift+s accepted public schema but rejected native KEYS, unknown.
Xed c: actual File-menu coordinate(18,29) refused by native finite app bounds.
Xed d: harness incorrectly treated raster not_satisfied as task failure on already
selected field; corrected to use independent exported bytes for semantic success.
Xed e: private pixels changed before input, fail closed; corrected harness waits
for stable fresh captures. Xed f: Open Files is a nonmodal chooser, harness falsely
waited for modal; now checks actual file-chooser nodes and clicks observed Open.
Xed g: tasks01/02 exact text succeeded; task03 selection replace+single Undo did not
restore expected document, caught by readback;04..10 blocked in that session.
Drawing a: actual GUI PNG1000x60010742bytes SHA256
`d72f8d668dd86b1d7d98902baee6ccab41628c53bd1bd47c27edc7be7f82a6dc`.
Independent Pillow decode shows596980white pixels,1832solid red pixels and
antialiasing: harness expected black, so failed before reopen. Corrected ink metric
in latest script, not rerun. Drawing b: startup Information modal became unsafe
on fresh observation; stopped without input. Do not override classifier.

All Xed a..h and Drawing a/b exact driver+supervisor+unit+cgroup cleanup passed
validate_action. No real desktop/:0 access.

Final task denominator: planned30 but only10 distinct Xed variants and1 Drawing
variant actually attempted.9/10 Xed edit/save/reselection subtasks passed,1 failed
(selection-replace Undo grouping).0 complete fresh-reopen task passes established.
Drawing produced inked PNG but0 complete drawing tasks passed. Other planned tasks
not run. Historical preflight attempts remain in their ledgers, not erased or counted
as new distinct tasks. This is a concrete blocked corpus, not27/30 acceptance.

## Remaining work

The27/30 task gate is NOT met. Current script has10 distinct Xed variants, Drawing
variant paths with save/new/reopen/full decoded canvas equality, but Drawing actual
reopen equality never reached. Do not inflate repeated shifted drawings into a
meaningful30-task corpus. Latest drawing implementation searches an exact full
1000x600 RGB crop within1280x960 observation; screenshots are private.
Need run fixed close-tab note path, diagnose safe Drawing startup transition through
runtime owner, then meaningful remaining tasks. Exit0 currently means clean runner
shutdown, NOT all tasks passed; ledger is authoritative. Every failure retained.
Progress summary `/tmp/gui-corpus-r5-status.txt` updates after each passed task.
