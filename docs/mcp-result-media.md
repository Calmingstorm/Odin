# MCP result images and files

MCP `tools/call` results preserve text and media separately. This is a delivery
change, not an audio-understanding feature or a new Discord upload path.

## Images and mixed content

- Inline `text` and `resource.text` render as real text in content order. Resource
  URIs remain descriptive; Odin does not fetch URLs or open server-supplied paths.
- Valid base64 `image.data` with a supported raster signature (PNG, JPEG, GIF,
  WebP, matching `analyze_image`) travels through `MCPToolOutcome.image_blocks`
  and `ToolResult.image_blocks`, then native image blocks on the next model turn.
  MIME is sniffed for vision rather than trusting the server's declaration.
  This is signature validation, not a complete image decode or a promise that
  a damaged image or a text-only model will understand the image.
- Discord/web/API chat, autonomous loops and spawned-agent cycles carry typed MCP
  images. Per-call labels and content-item indices associate mixed text/images,
  including when multiple calls finish concurrently. Labels and each call's
  images remain together in separate user messages through provider conversion.
- Existing native `__image_block__` plus `__prompt__` remains supported. The
  plural native form is `__image_blocks__` with `__text__` and optional `__prompt__`.
  MCP uses typed fields to retain its success/error/uncertain state, rather than
  returning an untyped marker and losing that metadata.
- Computer observations keep their independent foreground ownership/freshness
  gate. MCP media cannot repair computer evidence or authorize desktop input.
  Native marker refusal in agents is unchanged; typed MCP images are separate.
- Image bytes never enter `ToolResult.output`, `str`, `repr`, `as_dict`, tool
  audit summaries, or agent trajectory result records at MCP delivery. They use existing native
  vision message handling and, for durable chat, existing image externalization.

## Retrievable bytes

Every accepted binary content part has an opaque attachment: `resource.blob`,
`audio.data`, and also `image.data`. Keeping original images retrievable covers
text-only/background consumers and unsupported raster formats without inventing
vision support. Resources that contain image blobs are retained as files, not
implicitly promoted to vision.

The runtime delivery boundary writes decoded bytes to `output_blobs` in the
existing private tool-output SQLite store. Each result's files and a JSON
manifest are admitted atomically in one transaction. Initial results contain
one manifest cursor in an `[output retention]` suffix, never base64. Retrieve
that manifest with `get_tool_output` to get individual attachment metadata and
byte-retrieval cursors. Large manifests/text use ordinary text continuation.
Space for the manifest pointer is reserved independently of text retention:
quota failure cannot strand committed files behind a truncated manifest.
Context compression retains both text and manifest retrieval when present.
No public URL, host-path capability, filesystem
extraction, Discord attachment, transcription, or automatic execution is added.

`get_tool_output` accepts attachment cursors with the existing input schema:

- `kind: tool_attachment_page`, `encoding: base64`, `data_base64`.
- `offset_unit: bytes`; `start` inclusive and `end` exclusive refer to decoded
  bytes, not the base64 string. `limit` bounds returned base64 characters and
  the normal serialized delivery budget can reduce it further.
- MIME, original content-item index/type, total byte length and whole-file
  SHA-256 accompany every page. MIME is server-declared metadata, not file trust.
- Decode each page independently and concatenate **decoded bytes** in order.
  Check the whole-file length/hash when `truncated=false`. Do not concatenate
  padded base64 strings. Reads are repeatable, non-consuming and never rerun MCP.
- The existing text cursor contract remains code-point based and scrubbed.

## Bounds, privacy and failure behavior

- MCP's existing 4 MiB wire ceiling applies to the complete JSON body/SSE event,
  not merely to each individual content part. Strict base64 decoding rejects
  malformed input without echoing its payload.
- At most 64 binary parts are accepted per result; at most 16 supported images
  are injected into vision. Images past the vision limit remain retrievable
  within the binary-part limit. Excess parts and invalid data receive explicit
  delivery notices, not silent stubs. Request a smaller result from the server
  when these limits are reached; do not blindly replay effectful calls.
- Binary and scrubbed text retention share the existing 64 MiB global quota;
  each retained text item and each bundle's decoded bytes have a 4 MiB cap.
  Binary quota charges include the manifest and also reserve
  512 bytes per item for metadata, so zero-byte files cannot evade the quota.
  The TTL is 24 hours from capture,
  not extended by reads. Expired rows are pruned on retention/read operations.
  Empty files are supported. The database is mode 0600.
- Retrieval rechecks the original requester and delivery channel, originating
  tool permission, credential scope and any captured host bindings before loading
  the body. A cursor is not permission. `get_tool_output` must also be authorized
  before an attachment is retained. API execution uses its existing stable
  delivery-channel scope; agents inherit the originating scope.
- Binary bytes are **opaque and byte-faithful, not secret-scrubbed**. Text
  scrubbers would corrupt arbitrary binary files; base64 is not anonymization.
  Explicit `get_tool_output` reads return base64 as tool-result text, so those
  requested pages can appear in normal conversation/audit/trajectory retention;
  the attachment TTL does not erase copies a consumer already retrieved.
  Files can contain sensitive material. Only authorized consumers should
  retrieve them; they are not automatically posted publicly. Metadata/text
  still use ordinary output scrubbing. Native images follow the existing vision
  privacy/durability policy, which is distinct from the attachment-store TTL.
- Retention unavailable, denied or quota-exhausted rolls back the whole file
  bundle and produces an explicit failure reference with no cursor. It does not
  erase valid text/images or reclassify a
  settled server operation as uncertain. `isError` images/files retain the MCP
  failure outcome; no call is replayed to recover lost media.

## Campaign verification status

The 2026-09-09 checkpoint adds focused executable coverage for commit `4ecb63b0`:

- `tests/test_mcp_media_checkpoint.py`: real negotiated modern/legacy HTTP JSON
  and SSE mixed-image/text ingress, typed dispatch, `isError`, signature sniffing,
  corrupt/unsupported media, binary/image limits, aggregate wire ceilings,
  single-call/no-replay behavior, and payload-free textual/audit representations.
- `tests/test_mcp_media_surfaces_checkpoint.py`: chat (including the HTTP API),
  autonomous loops, and agent model continuations; multiple image-call groups;
  Codex/Ollama/Kimi provider conversion; legacy single-image delivery;
  independent computer freshness acceptance/rejection; native agent refusal;
  failure/uncertain outcomes and image/binary-free audit/trajectory result records.
- `tests/test_mcp_media_retention_checkpoint.py`: byte/hash/page reconstruction
  including empty files and repeatable reads; requester/channel/permission and
  credential/host-binding revocation before body loading; shared quota and
  metadata charging; atomic SQL failure rollback; manifest discoverability when
  text quota is exhausted; private database mode; restart and fixed TTL pruning;
  retention failure preserving the server outcome and vision evidence.

Checkpoint tests exposed and fixed expired-read pruning being rolled back on
error, and Kimi conversion silently discarding native image blocks. Existing
runtime-retention and legacy image characterization fixtures were updated to
the typed outcome / per-call image-message contract, not disabled.

These are focused local harness checks, not a full campaign acceptance claim.
The parent checkpoint owns full-suite, coverage, lint/type baseline and CI
gates. No deploy or real provider/model-vision acceptance is claimed. Raster
validation remains signature-only; explicit binary page retrieval can enter
ordinary transcript retention as documented above.
