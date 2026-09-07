# Native model application acceptance, R6

## Scope and harness

`scripts/computer-feasibility/model-application-r6.py` is a bounded actual-model
acceptance driver. It uses the R5 foreground identity/permission pattern, real
`ComputerIntegration`, `NativeToolDispatcher`, controller, attached X11 backend,
and unchanged `computer_definitions()`. No verification or fixture helper is a
model tool. Every model call receives the latest native delivery-validated PNG;
the actual serialized-request audit checks its SHA256 and exactly the three
production tools with strict=false. Retired images do not remove tool correlation.

The task asks for a recognizable home icon using a blue rectangle, orange closed
Bezier triangle, and white rectangular door, followed by GUI Save to SVG and
inspection of final pixels. The harness gives requirements, not coordinates or a
GUI action plan. Model arguments are dispatched verbatim. Maximum48 requests,
90seconds each, 900seconds total, plus20seconds controller cleanup. At most2 known
changed-target rejections permit new observation/model decisions. Any uncertain
outcome aborts without replay. No automatic model retries or credential writes.

`model-application-fixture-r6.py` launches a disposable Xvfb display numbered100
or above, with a fresh Xauthority cookie, fresh private `/tmp` HOME, unprivileged
`nobody` Inkscape/openbox, and a private application session bus. It never accesses
`:0`, operator Xauthority, live desktop session, or live bot configuration. The
host-side model client has network/read-only credential access, unlike the fully
network-isolated deterministic fixture. This is not an application network
sandbox claim. The model has no shell/API authority. Run the fixture as root under
`owned-test-supervisor-r6.py`; direct children are explicitly waited, and the outer
standalone subreaper owns adopted descendants. Check both driver result and outer
supervisor cleanup report. No live deploy/restart/commit is performed.

`model_application_r6_verify.py` independently parses saved GUI-created SVG bytes,
requires real rectangles and a path, rejects entity declarations, scripts,
embedded raster content and external/reference links, and renders immutable SVG
bytes with `rsvg-convert`. It checks visible nonempty colored extent and home-icon
color-region arrangement: roof above body, door inside body meeting bottom. The
intended SVG is never shell-written or rewritten. Exact saved bytes and independent
PNG are retained privately only after verification. A screenshot or model claim
alone cannot pass this check. Human visual review remains separate from geometric
checks and is required before claiming the finished icon looks correct.

## Execution evidence

Final run **`/home/odin/model-application-r6-04` passed**, 2026-09-07.
Managed driver3736575 exited0; task168.055seconds,22 actual model requests,
zero rejections,21 model-selected actions. Actual serialized requests each carried
one native PNG matching the latest observation, strict=false production tools,
and store=false. No coordinates were provided by the harness. The model selected
zoom, drew two rectangles and a closed triangular Bezier path, set palette fills,
opened Save As, corrected the extension after inspecting the filename field,
clicked Save, received final native pixels, and reported SAVED_AND_VERIFIED.

Saved artifact `home-icon-6ea8656e4d.svg`,1738bytes,2rect+1path:
SHA256 `7d6c03fe20dd3146e5df2145c01f004f06ad293f9c9edd27b013a8a3f4d597e4`.
Original GUI file remains privately under
`/tmp/model-app-r6-bf4zqxc8/home/`; exact copy is `saved.svg` in the evidence
directory. The independent512x512 raster has46,237 colored pixels,17.638% coverage,
and verified roof/body/door layout. PNG SHA256:
`825a699f4b1acb68c8bb765a3b12e3b7f0963a69d707e2e2fe629c8d2b634de2`.
SVG inspection confirms blue `#0000ff` body, orange `#ff7f2a` roof path ending Z,
and white `#ffffff` door. Body and door bottoms coincide. The icon is centered
approximately on the page and remains on the default A4 canvas; it is not a
cropped production asset. No reopen was requested or claimed.

Parent visual review of `independent-render.png` confirmed a recognizable house:
orange triangular roof with symmetric overhang, blue body, and a centered white
door meeting the body's bottom edge. The drawing is not clipped. Generous empty
canvas remains; this is a successful simple GUI illustration, not a claim of
finished icon packaging or professional artwork.

`validate_action` bundle `model_application_r6_04_independent_acceptance` passed
5/5 checks: supervisor cleanup success and empty residual list; saved vector
shape/layout result; exact display socket and direct children gone; `cmp` against
the application's saved file;22 actual request wire contracts.
`/tmp/model-app-r6-owned-04.json`: primary0,cleanup_ok=true,residuals empty.
Direct children3736581/3736586/3736600/3736684 were explicitly waited and checked
gone. App/WM returncodes-15 reflect fixture teardown, not task failure. Outer
supervisor independently reaped adopted descendants. Private X178 socket gone.

### Preserved failures and fixture constraints

Runs01/02 each failed before sending a model request due to the initial credential
file having a different structural layout than the R5 read-only auth helper
expected. No credential writes/refresh, GUI actions, or retries occurred. Run02's
sanitized traceback identified the auth-loader boundary, without credential data.
A compatible existing read-only auth record was used for subsequent runs.

Run03 genuinely drew the icon with16 native-image model requests, then encountered
a known pre-input `visual_target_changed` rejection at the Save filename field.
After new observation, the model requested unsupported ctrl+l; the driver stopped
instead of rewriting arguments. No SVG save success claimed. All three failed
runs retain private evidence and outer cleanup_ok=true, no residual descendants.

Run04 uses a fresh disposable-only GTK setting `gtk-cursor-blink=false` and the
Inkscape boot-screen-disabled preference tested by the deterministic agent. These
are initialization preferences, never target artwork writes. It also explicitly
reminds the model that ctrl+l/function keys are unsupported. Production raster
guards were not bypassed or modified by this agent. This demonstration therefore
does not establish success with blinking carets enabled; broader keyboard
freshness behavior is separate work. No screenshots were posted.

Pure targeted tests: **17 passed**,12 R6 plus5 R5 regression checks, in0.74seconds
under the owned supervisor (`/tmp/model-r6-tests-owned-05.json`,cleanup_ok=true).
Coverage includes production definitions, main-session/unsupervised fixture
refusal, SVG active-content rejection, real shape/path requirements, nonempty
render, wrong-layout rejection and independent read-only artifact validation.
Warnings: existing audioop deprecation and Pillow getdata deprecation. No full
suite, release or deployment qualification is claimed by this harness.
