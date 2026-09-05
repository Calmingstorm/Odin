# Agent catalog and result delivery

The live `spawn_agent` catalog reads the same current configuration as spawn
admission: `agents.max_concurrent_agents` and `agents.max_lifetime_seconds`.
The lifetime shown is the limit for **new agents**, not a retrospective change
to already running workers. Successful Config Center publication invalidates
the catalog; failed persistence leaves the old configuration and catalog intact.

## Complete results

`get_agent_results` defaults to a **4,000 UTF-8 byte ceiling**, with a caller
maximum of 8,000 bytes. It can return fewer bytes to keep its complete serialized
JSON envelope inside the shared delivery budget. Escaping, labels, tool metadata,
byte counts and the cursor are included in that budget. Optional tool metadata
has a separate allowance and reports `tools_omitted` accurately.

Read `preview`, then call `get_agent_results` with the same `agent_id` and the
returned `cursor` until `truncated=false`. Each continuation starts at the
previous page's `end`. Cursors identify the immutable, fully secret-scrubbed
result/error body; authorization is checked independently on every request.
`original_bytes`, `result_bytes`, and `error_bytes` describe that safe body.
`source_original_bytes` preserves the pre-scrub source total. A page never skips
bytes to compensate for serialization overhead, and a nonterminal result page
always advances by at least one complete code point. An envelope that cannot fit
fails explicitly instead of returning a non-advancing continuation.

## Waiting is a snapshot, not a full-result download

`wait_for_agents` waits until the requested agents finish, the timeout expires,
or a parent message interrupts the invocation. It includes every accepted ID,
status and iteration count, with **up to 800 UTF-8 bytes** of preview per agent.
The aggregate budget can reduce this ceiling fairly across the batch. Follow
each row's `get_agent_results agent_id=... cursor=...` for complete output.

The minimal status roster, bounded labels and possible interruption metadata
are reserved before waiting. An oversized batch is rejected with instructions
to split `agent_ids`; it is never silently shortened. This delivery admission
bound is independent of concurrent-agent capacity, since completed results can
outlive the live registry. Repeated IDs are treated as one requested agent.

When a parent message interrupts a wait, children continue. That notice appears
in the visible result and the structured audit metadata even when a live
`not_found` snapshot is replaced by its durable result. Authorization is checked
again after waiting so a revoked reader does not receive the saved preview.

## Recovering large tool output

The ordinary delivery budget remains **12,000 characters**. The
`tools.tool_output_max_chars` setting changes the shared cap (restart required);
it is not inferred from model context size. Retained pages budget the complete
serialized envelope, including JSON escaping, metadata and continuation.
`read_file` retains its independent contiguous, framed-file contract.

Large command, browser, URL, PDF, and other tool outputs are captured before
legacy source-formatting cuts. A successful retained preview has a labelled
head and tail. The tail is context only: the continuation starts **after the
head**, not after the tail. Call `get_tool_output` with the returned `cursor` and
follow subsequent cursors to retrieve contiguous head-only pages. Retrieval
reads the original evidence; it never reruns the command, query, or interaction.
Status is recorded separately from preview text, including failed operations.

General tool-output cursors use Unicode code-point offsets, explicitly named by
`offset_unit`. The envelope also reports the full UTF-8 byte count. Agent and
process cursors retain their own documented UTF-8-byte contracts; cursors are
opaque to callers and should not be interchanged between tools.

Search results retain their original ranking snapshot. Pages prefer whole
matches and report `showing X of Y returned matches; Z deferred`. A single match
larger than a page is returned in bounded, advancing fragments rather than
blocking pagination or rerunning the search. Ordinary short search formatting
is unchanged.

Retained output is secret-scrubbed before immutable storage. General snapshots
have a **fixed 24-hour TTL**, advertised as `expires_at`; reads do not extend it.
The default quotas are **4 MiB per result** and **64 MiB aggregate retained
body bytes**. Retention failure, quota exhaustion, and expiration are explicit:
no cursor promises evidence that was never saved. Snapshot storage survives
turn completion and restart. Authorization is independent of cursor possession
and rechecked before returning the body.

Emergency context compression removes previews before retrieval instructions.
It preserves a minimal pointer to the removed page's start (or restarts the
dedicated read-only agent/process retrieval). If even the pointer cannot fit,
the existing context admission failure remains explicit rather than slicing
JSON or pretending a lost preview is complete. Nothing automatically drains
retained evidence back into model context.
