# MCP Wiring Campaign — Plan of Record

Status: campaign in progress on `feat/mcp-wiring`. Catalog exposure is P3's
content: from the P3 head onward, a configured + enabled + connected server's
validated tools merge into the model catalog under the publication predicate
(before P3 the merge did not exist, so exposure was impossible by
construction). The operative campaign gate is deployment: **nothing reaches
master or any live install until every phase is integrated and the
five-server soak passes under explicit authorization.** Management routes
stay inert until P4; configured servers are restart-bound until then.

## Goal

MCP servers manageable via the WebUI; standard/universal protocol
acceptance; a connected server's tools appear as first-class tools. The
honest v1 claim: **dual-era MCP core-tools interoperability** — supports
current 2026 MCP and deployed legacy MCP for *tools* over stdio and
Streamable HTTP, with static authentication. Not every optional feature or
authorization mode (see Non-goals).

## Publication invariant

Four states: **Configured → Enabled → Connected → Published.** A tool is
published iff:

```text
global enabled
AND server enabled
AND current config generation connected
AND successful complete tools/list
AND tool passed validation/provider compatibility
```

Disabled, removed, failed, disconnected, stale-generation, or blocked
servers publish ZERO tools. Every state transition invalidates the tool
catalog synchronously: **no model request assembled after the transition
may contain the removed tool.** Over-limit servers are BLOCKED (publish
nothing, report why) — the first N are never silently chosen.

## Protocol matrix (normative — `src/tools/mcp/protocol.py` is its executable form)

Supported protocol revisions, exact set, preference order newest-first:

| Revision     | Era    | stdio | Streamable HTTP | Notes |
|--------------|--------|-------|-----------------|-------|
| `2026-07-28` | Modern | ✓     | ✓               | stateless; `server/discover`; per-request `_meta`; required `resultType`; `Mcp-Method`/`Mcp-Name` headers; `x-mcp-header` mirroring |
| `2025-11-25` | Legacy | ✓     | ✓               | initialize handshake; optional sessions |
| `2025-06-18` | Legacy | ✓     | ✓               | + `MCP-Protocol-Version` header |
| `2025-03-26` | Legacy | ✓     | ✓               | + receive-side JSON-RPC batch arrays |
| `2024-11-05` | Legacy | ✓     | ✗               | HTTP shape was the deprecated HTTP+SSE dual endpoint — out of scope |

An unknown counteroffer or advertised version is never accepted.

**Era detection** (a property of the server; re-probed on every connect):

- stdio: probe `server/discover` with the preferred modern version.
  `DiscoverResult` ⇒ modern-era evidence → version selection. Recognized
  modern error (`-32020`/`-32021`/`-32022`) ⇒ modern → selection from its
  advertised list. Any other error or bounded timeout ⇒ legacy `initialize`
  fallback. Fallback is never keyed to one error code.
- HTTP: the same probe as a POST. Only an **HTTP 400 with an
  empty/unrecognized body** (or a plain method-not-found for the probe)
  falls back to legacy. `401`/`403`/`429`/`5xx`/network failures establish
  NO era — the connect fails retryable.
- Modern version selection: validate `supportedVersions`, intersect with
  the exact modern allowlist, choose deterministically. A modern-era server
  advertising only legacy revisions is **modern-incompatible** (honest
  error) — never modern metadata under a legacy version, never an
  `initialize` fallback after modern-era evidence.

**resultType:** required under a negotiated `2026-07-28` — `complete`
passes; `input_required` is an explicit unsupported outcome (MRTR deferred),
never replayed; missing/unknown = protocol violation. Treat-missing-as-
complete applies only to negotiated-legacy responses.

**Sessions (legacy Streamable HTTP): OPTIONAL.** Echo `Mcp-Session-Id`,
apply 404-session recovery, and DELETE on disconnect only when the server
minted one.

**Cancellation:** modern stdio and legacy (both transports) send
`notifications/cancelled`; modern HTTP aborts that request's SSE response
stream (closing a LEGACY SSE stream is explicitly not cancellation).
`initialize` is never cancelled; late responses after cancellation are
ignored.

**Outcome classification (drives the durability contract):**

| Condition | Outcome |
|---|---|
| result without `isError` | ok |
| `isError: true` / JSON-RPC error / validation rejection / failure before the request was written / explicit session rejection | failed (definite) |
| timeout / disconnect / stream loss after the request was written | **uncertain — never automatically replayed** |

Automatic retries are permitted for discovery/listing only. Session
recovery (re-initialize) is a lifecycle operation and never implies
reissuing the interrupted `tools/call`.

**Other client obligations:** `tools/list` pagination via `nextCursor`
(bounded pages, duplicate-cursor detection; a partial listing is a failed
listing); duplicate tool names = listing failure; `x-mcp-header` support is
mandatory on modern HTTP (validation per spec; an invalid annotation
excludes that tool); legacy server-initiated requests are answered `-32601`
on the correct channel (never dropped — a dropped request hangs the
server); `server/discover.instructions` and all server-authored text are
untrusted (UI-only, escaped and bounded — never injected into the system
prompt); tool descriptions published to the model are length-bounded and
control-character-stripped.

## Bounds

40 published tools per server and globally (over-limit ⇒ blocked, resolved
via per-server `tool_allowlist`); 128-char server/original-tool audit identifiers;
1,024-char model-facing descriptions;
32 KiB schema per tool / 256 KiB per server / depth 20 / 2,048 nodes;
32 list pages / 128 discovered tools; 4 MiB wire-result ceiling before the
standard 12 K model-facing result cap. Tool-list freshness: TTL-clamped
polling (60 s–10 min, ±10 % jitter, exponential failure backoff to 30 min,
single-flight, manual refresh; a failed refresh unpublishes).

## Runtime safety

stdio servers run in an owned process group with an allowlisted minimal
environment (PATH/HOME/locale/TERM/TMPDIR/USER + configured `env`) — never
the full service environment; stderr is drained continuously into a bounded
ring; shutdown escalates stdin-close → SIGTERM(group) → SIGKILL(group) with
a final descendant sweep. HTTP uses one cookie-isolated session per server,
never follows redirects, and never lets configured headers override managed
transport headers. All error text surfaced from servers is sanitized and
bounded.

## Phases

- **P1** `src/tools/mcp/` client package: protocol core, both transports,
  era detection, typed outcomes, bounds, fake-server test harness (both
  transports × both eras). The legacy `src/tools/mcp_client.py` module and
  its tests remain untouched dead code until P4 retires them.
- **P2** wiring/lifecycle: always-constructed control plane (status/CRUD
  work even when disabled — first-server bootstrap), async start from the
  bot lifecycle, reconnect supervision, config-generation fencing, bounded
  concurrent shutdown, health component.
- **P3** catalog merge + one shared dynamic-dispatch seam consumed by the
  chat loop, the autonomous/agent/scheduled loop path, and background
  tasks; freshness at request assembly (including per-iteration agent
  assembly); provider-safe published names; admin-only RBAC default; audit
  metadata (server, original name, generation, negotiated version, outcome
  class); secret-shaped argument scrubbing.
- **P4** persistence + routes: validate → persist (config transaction) →
  publish generation → unpublish superseded → reconcile; status route that
  always works; separate reconnect and refresh-tools operations; global
  enable mutation; secrets returned as key names only, mutated via
  set/remove patch ops.
- **P5** WebUI: dedicated Manage → MCP Servers panel (global switch, state
  vocabulary Disabled/Connecting/Connected/Stale/Error/Blocked, searchable
  tool lists, transport-aware editor, confirmations) + docs + config
  template.

## Non-goals (v1)

OAuth (interactive authorization is unsupported — static headers only);
MRTR/elicitation; sampling; roots; tasks extension; `subscriptions/listen`;
resources and prompts; the deprecated HTTP+SSE transport; model-facing
server CRUD tools (the WebUI is the only management surface).
