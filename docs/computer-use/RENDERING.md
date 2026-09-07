# Bounded source-local raster rendering

`src/computer/render.py` is an **offline render helper**, not working capture,
a display backend, input mapping authority, consent UI, or Stage 6 evidence.
It follows R1 source-local geometry and R2/R3 authority decisions. Nothing here
discovers a display, opens a capture file, changes tool availability, or operates
the active workstation. Existing `analyze_image` and transport helpers are unchanged.

## API and capability

`source_allocation_bytes(width, height, mode)` validates the packed source layout
before a backend allocates it. `render_frame(pixels, source, mode=..., ...)` accepts
only immutable owned `bytes`, tightly packed 8-bit RGB/RGBA in top-to-bottom rows,
and one `SourceGeometry`. No arbitrary encoded-file decoder is exposed.
`renderer_available()` explicitly probes Pillow. Importing the module has no
optional dependency or display import side effects. Missing Pillow gives the
static `render_dependency_unavailable: Pillow required` error; no fallback capture.
The development venv had Pillow 12.3.0 during implementation. Packaging is handled
by the parent integration task, not silently installed or changed by this helper.

`RenderedFrame` contains PNG bytes (excluded from repr), exact `FrameMetadata`,
and the count of encode attempts. Use existing `observation_image(png, metadata)`
to validate/create native transport blocks; use `frame_summary` for pixel-free
audit, never log the original raster, PNG, or native block dictionary.

## Bounds and sampling

* Source packed bytes: at most **64 MiB**, independent of the delivered cap.
  Dimensions are strictly positive integers within `MAX_SOURCE_DIMENSION`.
  This is not a promise of 64 MiB total RSS. Backend native capture buffers,
  conversions, retained frames, process limits, and concurrency need separate bounds.
* Default delivered bounding box: 1600x1000, no enlargement. Every image remains
  at most **2,000,000 pixels and 2 MiB PNG**, including caller-specified boxes.
* Pillow is never given the source: direct center sampling builds only a bounded
  delivered bytearray (at most 8 MB), avoiding Pillow's 4-byte/pixel internal RGB
  source allocation. Delivered Pillow/encoder working buffers and coordinate lists
  are additional bounded intermediates. No full-source rotation or crop copy.
* The uniform rational scale is selected by at most 20 binary-search steps.
  Dimensions use metadata's half-up nearest rounding. Crop happens in source
  coordinates, then clockwise rotation (0/90/180/270), then resize. Each delivered
  center maps through the exact raster-edge transform; its floored source center
  coordinate selects a pixel. This is nearest-neighbor, not an antialiasing filter:
  small text may alias in overviews; request a native-size detail crop to read it.
* The requested raster rotation is explicit and does not automatically replay
  `SourceGeometry.rotation`. Capture adapters must normalize and describe their
  actual raster orientation correctly. Metadata is never a desktop-wide scale.
* The PNG sink refuses writes beyond 2 MiB. An oversized PNG triggers a halved
  scale and resampling from the original source, never repeated blur. At most
  **three encode attempts**; exhaustion is an explicit pixel-free failure.
  Extreme aspect ratios which round one axis to zero fail rather than falsifying
  a uniform transform. Normal 1080p/1440p/4K sources fit independent source bounds.
* A **single synthetic 7920x2520 RGB source** fits (59,875,200 bytes) and is tested.
  The same RGBA geometry exceeds 64 MiB and is explicitly rejected. It is NOT a
  license to stitch unrelated monitor grants into a shared action plane. Backends
  needing larger native formats must negotiate tiled/bounded capture separately.

## Remaining caller obligations

1. Authorize the specific source and foreground task before capture and rendering.
   Validate source revision, scope, consent generation, and session ownership again
   across await boundaries. Caller-supplied provenance is not validated authority.
2. Perform source allocation preflight **before capture**, not only after handing
   bytes to this helper. Bound native buffers, stride/format conversions, concurrency,
   retention and process resources. This helper cannot undo an upstream allocation.
3. Supply a trustworthy capture timestamp/clock basis and fresh immutable bytes.
   Render time is not capture time. Matching overview/detail must come from the
   same capture with identical binding, including raster rotation.
4. Keep input reach separate: source-pixel transforms do not grant source-local
   input mapping. No global origin or multi-monitor action surface is created.
5. Handle dependency/resource failures, evidence TTL/quota, privacy and provider
   capability admission. Deliver through `observation_image` and frame planning;
   maintain one current source overview plus one matching detail at most.
6. Integrate the helper into a separately verified capture backend only after the
   parent integration decision. This module does not activate any runtime path.

## Offline evidence

`tests/test_computer_render.py` checks actual four-color RGB/RGBA source overviews
and native-size crops at 1080p/1440p/4K/7920-wide, per-pixel exact rotated/cropped
sampling including rounded dimensions, random RGBA forcing byte-cap resampling,
source preflight and strict rejection, bounded retries/sink, optional imports,
and actual render output in final serialized native Codex/Ollama HTTP request
bodies (mocked transport, no network). This is real pixel rendering evidence,
not evidence of capture freshness, GUI operation, or a supported live backend.

Recorded development validation (2026-09-07): renderer suite **45 passed**;
targeted Ruff check for both new Python files passed; import/availability probe
passed; `git diff --check` passed. Combined renderer/vision suite: **152 passed,
1 failed** in the existing
`test_existing_foreground_dispatch_does_not_audit_pixels` assertion that a tagged
`analyze_image` fixture survives foreground history retirement. The renderer does
not change that existing path; the integration owner was notified. Excluding only
that test gives **152 passed, 1 deselected**. This is not a full-suite pass claim.

Parent reconciliation: the foreground compatibility test subsequently passed
unchanged, and the final focused `tests/test_computer*.py` run passed **413 tests**.
Packaging now declares `computer = ["Pillow>=12.3,<13"]`, includes it in the `all`
extra, and declares Pillow for development tests. Pillow12.3.0 was already present
in the project venv; no package was installed on the host for this increment.
The rendered-raster tests remain distinct from GUI task completion.
