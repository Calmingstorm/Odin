# R5 native GUI evidence

Owned native primitives/accessibility/worker and new native tests; backend observe
and act expansion explicitly delegated by gui-actions-r5. No commit/push/deploy,
real session access, package installation or live Odin restart.

Actual private runtime diagnosis established xdotool WINDOW may be the WM frame,
not the application child. Input and pointer proof now independently traverse the
native pointer tree and require the exact observed app in it, or proven descendant
ancestry. Sibling/foreign overlap is still denied. AT-SPI uses WM frame bounds and
GTK alert/file chooser roles; matching requires exact native frame ancestry plus
active/modal state and same process, not arbitrary approximate geometry.

Native click/type/key/polyline accept strict fields, fresh one-use observation,
revision/window/process identity and explicit matching modal token. Safe modal
classification permits initial owned Drawing Information/No/Yes transient and
known same-process file choosers; unrelated, security/password/terminal/Odin labels
remain denied. The startup transient identity is pinned before optional AT-SPI is
ready. Unknown/denied native classes map to public unrecognized, never permission.

Visual postconditions independently capture raw before/after SHA256 after release
and verify the same app process identity. They prove raster change only, not
document semantics. Click pointer evidence proves coordinates and target binding.
No text_equals claim. Multi-line input chains xdotool printable chunks and explicit
Return/Tab, rather than assuming xdotool type synthesizes LF. Private ephemeral
GTK settings disable caret blink/animation only within /workspace/home; an actual
adapter attempt failed strict pixel grounding before that correction.

Actual native and then backend tests succeeded: Xed pointer click, text, select-all;
Drawing explicit startup-modal Return then polyline with independently changed
pixels. Save As ellipsis/file chooser initially remained unrecognized and was
corrected. GUI save/export independently returned the exact typed note. Immediate
export initially failed because GTK save is asynchronous; after 0.3s readback
returned the file without replaying input. Latest multi-line actual readback:
`R5 adapter GUI test\nsecond line\nthird line\n`.

Drawing PNG save/reopen and full controller corpus remain the parent agent's work;
native results here do not establish that corpus. No acceptance-rate claim.

Cleanup: validate_action passed for first12 exact transient units, then9 additional
units and their recorded supervisor identities. Final multiline fixture recovered
from journal as odin-cu-bf2680c3573fa96953ec590c9d4b2617.service and independently
validated MainPID0/cgroup absent. Its supervisor PID was not retained. Temporary
private probes remain /tmp/native_gui_r5_probe.py and /tmp/native_gui_r5_adapter.py;
one private scratch screenshot /tmp/native-gui-save.png, no operator pixels.

Test caveat: newly added synthetic polyline used nonzero duration with frozen test
clock and hung one scoped test invocation for900s. Corrected test duration0, parent
notified its concurrent suite may need exact-process termination/re-run. Tests then
reached147pass/1fail: historical argv assertion expected unsplit LF text and needs
update for the intentional explicit-Return chain. Earlier145 tests passed before
LF correction. Final focused results belong to the parent integration report.
