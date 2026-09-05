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
