# R5 GUI work in progress

Controller/adapter integration is running actual isolated apps, not only stubs.
Evidence `${EVIDENCE_ROOT}/gui-r5-xed-02`: controller observe -> native image conversion
and delivery validation -> action. Typed note, GUI Save As (fresh safe modal token),
authenticated export136bytes, GUI reopen, pause/resume generation1->3, appended
recovery sentence through GUI, saved again. Native text typing dropped supplied
newlines, caught by independent exported file read. Child is fixing it; no exact
multiline-content success claimed yet. First earlier attempt at save returned
unknown, stopped cleanly; modal classifier fix is now working in the second run.

Drawing actual controller session `${EVIDENCE_ROOT}/gui-r5-drawing-01` now active,
recognized startup modal safely dismissed, three polyline drawing inputs and Save
requested. Artifact/reopen inspection pending. No27/30 claim yet.

96 deterministic tests passed for GUI R5/actions R4/freshness R1. Includes pending
before input, no replay, same-app safe modal acknowledgement, 90s model delay with
fresh5s revalidation, finish_turn despite revoked input authority, per-session stop
serialization, cross-channel same-owner WebUI evidence/stop. Operator methods
landed in controller. Source changes uncommitted per parent instruction.

No real desktop access or live Odin install changes. Historical failed first
fixture cleanup validated exact unit/cgroup/driver/supervisor gone.

## Final worker handoff

Drawing02 `${EVIDENCE_ROOT}/gui-r5-drawing-02` now produced actual GUI-created exported
`acceptance-drawing.png`:1000x600PNG,17166bytes. Independent PIL verify/decode:
5603dark pixels, bbox302,293..493,477. SHA256
`692bb8a3383bc1984f4415ccb91d814f5bec0f05e01b268031eed2e535759544`.
Reopen safely paused on actual GTK file chooser `Open a picture`. Exact-title
policy addition made afterward, still owned-transient/AT-SPI gated; rerun needed.
Driver3505818,supervisor3505820,unit410018264aa0ce52118caad0047d696c stopped.

Xed02 saved/reopened/paused/resumed/appended/saved197bytes. LF loss in first type
was caught by independent export read. Child fixed LF/Tab chaining and demonstrated
exact three-line export through adapter in R5-NATIVE-GUI; corrected multiline task
not rerun through controller by this worker. No27/30 or semantic-success claim.

Driver `scripts/computer-feasibility/controller-gui.py --app drawing|xed --evidence
<new-private-dir>` reads JSONL public actions, observes/native-image validates and
registers exact delivery before every act. Harness acknowledge_modal=true maps to
actual safe observed token, never classification. Exports copy authenticated GUI
artifacts only. Private current.png/nodes and events retained, not posted. This is
deterministic controller acceptance, not model-driven tool-loop acceptance.

Actions click/type/key/drag: text<=512, finite keys, drag2..256 integer pairs0..1s.
visual_change proves raster_change_only. Same-app title/modal transition may change
revision after independently measured input; new input still requires fresh obs.
Model grounding120s, fresh revalidation/use5s, full source/focus/modal/pixels checked.
Accessibility private. Operator APIs owner+host scoped cross-channel, no model
delivery authority. Per-session stop serialized; trusted finish_turn cleanup works
after input auth revocation. Existing-session start remains parent eligibility work.

Final focused135tests passed4.27s; scoped Ruff/diff-check passed. Broad run hung on
frozen-clock native drag; parent terminated exact pytest3499255, child corrected
fake duration0. Failed broad run is NOT suite-pass evidence. Parent owns full suite.
