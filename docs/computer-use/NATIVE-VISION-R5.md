# R5 native pixel transport evidence

## Artifacts and scope

* `src/computer/capabilities.py`: source-only native transport admission canary.
* `tests/test_computer_native_vision_r5.py`: synthetic raster, source-local crop,
  frame retirement, final serialized HTTP bytes and checkpoint regression tests.
* Existing `vision.py` and `render.py` retain their bounded raster/PNG behavior.

No real screen was captured, loaded, viewed or posted. No display was opened.
No credentials or live configuration were read. No live-install files changed.
All HTTP in these tests is an ephemeral loopback test server using dummy auth;
the real client and aiohttp serializer send the body through a real socket, and
the server returns a synthetic SSE response. The server is cleaned up on exit.
This is **not upstream provider acceptance or visual reasoning evidence**.

## Admission recommendation

Model-name membership is neither native transport nor model vision evidence.
`native_transport_evidence(serving)` accepts only the supported concrete client
and provider, a nonempty active-model snapshot, and a successful native converter
canary. The canary is a valid generated red/green PNG. It verifies native
`input_image` content, exact image bytes, paired tool call/result IDs, and no
duplicate pixels in text. A converter regression fails closed with a static,
pixel-free error. No desktop, Pillow, network or credential access is needed.
Future model names are not rejected merely because a static list is old.

The returned evidence explicitly says `provider_acceptance="unverified"`.
It must not be relabeled a remotely verified model capability. A real model can
still reject an image. The integration owner should replace `require_vision`'s
static list with this transport check, keep final native-frame preservation
checks, pin the active serving snapshot/per-request model, and ensure a rejected
visual generation never enables input or retries through a text-only fallback.
Nonvisual stop/status/close must remain available when admission fails.

If stronger pre-admission model evidence is required, perform a bounded harmless
image probe with that exact provider, endpoint, model and account policy, record
the acceptance evidence separately, expire it on serving changes, and do not
substitute a prefix wildcard or generic client interface for that evidence.

## Observed serialized-request proof

Tests exercise the actual `chat_with_tools`, Responses conversion, aiohttp JSON
serialization, local HTTP delivery and stream reader for configured
`gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-6-astra`, plus the per-request override from
`gpt-5.5` to `gpt-5.6-sol`. The received raw body, not a dictionary captured before
HTTP serialization, is decoded and checked for:

* Exact current model/provenance and `store=false`.
* One current overview and latest same-capture detail crop as native image URLs.
* Retired old overview and superseded detail pixels absent, with call/result
  correlation unchanged. Original transcript objects are not mutated.
* Untagged legacy image preserved separately, not consumed by computer pruning.
* Decoded PNG byte/pixel bounds and independently decoded red/green contents.
* A native-size crop mapping `(0, 0)` to source `(40, 4)` without global origins.
* No pixel string in text, metadata or checkpoint storage. R5 independent review
  found generic blob externalization escaped computer evidence expiry. The parent
  corrected this: tagged desktop frames are retired before blob writes, and old
  tagged blob references are retired without loading on resume. Untagged legacy
  images still externalize and restore normally. Tool/result pairs are unchanged;
  delivery authority defaults to denied and fresh observation is required on resume.

The existing renderer suite additionally covers 1080p/1440p/4K/wide source
allocation, exact rotated/cropped pixel sampling, byte-cap retries and rejection.
The existing foreground test verifies `analyze_image` native delivery without
pixel audit leakage; agent regression tests verify image markers are rejected
without stringification while preserving tool/result correlation.

## Recorded validation

From `/home/odin/odin-dev` only:

`pytest -q tests/test_computer_native_vision_r5.py tests/test_computer_vision.py
tests/test_computer_render.py tests/test_agent_image_safety.py
tests/test_turn_checkpoint_codec.py`: **202 passed**, one pre-existing Python
`audioop` deprecation warning. Initial new-test run had four fixture failures
from using nonexistent `AffineTransform.apply`; corrected to `map_point` and
reran successfully. This is a focused-suite result, not full-repository validation.
Targeted Ruff for the two new Python files, capability-module import validation,
and `git diff --check` also passed. No packages were installed. No commit or push
was performed; other concurrent R5 edits are not attributed to this work.

Remaining gates: upstream image acceptance and actual grounded GUI task success
are not proven by these transport tests. Integration wiring and action authority
remain the parent task's responsibility.

Parent integration now uses this canary instead of the stale name list, with a
regression proving a valid current-model converter passes and a dropped native
image fails. The current-model case was also added to the serialized HTTP proof.
This changes transport admission, not the unverified upstream-acceptance claim.

Privacy regression coverage additionally uses real checkpoint entry points and
asserts no blob writer calls for computer-only pixels, no blob reader calls for
old tagged references, unchanged legacy-image round trips and unchanged input
objects. This fixes new copies and use of old references, not deletion of any
historical deployment blobs; no live data or configuration was touched.

## Parent actual upstream synthetic-image smoke

`scripts/computer-feasibility/vision-smoke.py` adds a separate explicit, bounded
live probe. It uses the development client, an existing credential in read-only
mode (no refresh, copy, write or printing), generated pixels only and a single
request. No screenshot, desktop connection or live configuration change occurs.

Observed 2026-09-07 around03:17UTC: current configured model family `gpt-6-astra`
returned the correct six-color row-major array for a newly randomized six-tile
480x320PNG. The expected color order was not in the prompt or frame metadata.
Native PNG SHA256 `be1124be6505fe3919612a39b36521e17d09e1877644d3f80ea58c9639c8f6b3`.
Actual aiohttp serialized-request trace verified one native image, no duplicate
pixel text, `store=false`,2275body bytes. Response2.928seconds, process exit0.

This establishes one actual image-acceptance and visual-answer sample for that
endpoint/account/model at that time, beyond the earlier loopback serializer tests.
It is not evidence of GUI task competence, universal model support, or future
availability. The production capability canary therefore still truthfully reports
upstream acceptance as unverified per request; input never gets permission from
this historical sample. No credentials or upstream response body are retained.
