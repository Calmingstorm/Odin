# Configuration Center — campaign plan of record

**Status:** R0 (settled design; implementation in progress on `feat/config-center`)
**Baseline:** master `43738fe` (v3.72.0)
**Origin:** operator report that Settings > Config is dated, unintuitive, and largely not live.
Two independent audits (Claude: code audit of every section's consumers; Odin: rendered-UI
evidence at 1440/390 plus his own source audit) were cross-validated in both directions. Neither
audit was refuted; scope corrections from the cross-exam are folded in below.

## 1. Problem

`PUT /api/config` validates a merged model, rebinds `bot.config`, invalidates the tool catalog, and
writes the file. Nothing else. Whether an edit takes effect depends entirely on whether each
consumer re-reads `bot.config` at call time or captured config at construction:

- built in `wiring.build_services(config)` → boot snapshot → **restart required**;
- built in `wiring.build_components(bot, services)` with `get_config=lambda: bot.config` → **live**.

The UI reports `Config saved successfully` in every case, including when the change is inert,
restart-bound, owned by a dedicated endpoint, or failed to persist at all.

Of 35 sections / 228 leaf fields: 6 fully live, 10 partially live (with split-brain traps), ~15
restart-only with no indication, 4 dormant. There is no restart affordance, no pending-restart
state, and no per-field liveness information in the UI, the API, or the docs.

Cross-validated defect inventory (IDs used throughout this plan): see
`/home/odin/reviews/config-page-consolidated.md` §2 and the per-feature settlement in
`config-campaign-design-settlement.md`. Highlights:

- **B1** generic save resolves `${VAR}` placeholders into config.yml (plaintext secrets on disk).
- **B2** sensitive gates are inconsistent in both directions: write-side blocking never recurses
  lists (`web.api_tokens[].token`, `outbound_webhooks.targets[].secret` bypass the 403); read-side
  redaction masks only string values, so secret-bearing maps (`slack.webhook_urls`, MCP
  `headers`/`env`) leak through `GET /api/config` **and into config-change audit diffs**.
- **O1** persistence failure — or a missing config file — still returns 200 "saved".
- **O2** generic writer is non-atomic and destroys comments/ordering.
- **O7** no lock or revision shared between the generic, LLM, and personality writers.
- **B3** `bot.health_server` is never assigned → Slack/Grafana admin surface disconnected
  (status endpoints report `enabled:false`; mutation routes 503).
- **B4** `PUT /api/tools/timeouts` mutates `bot.config.tools` in place and is permanently broken by
  the first generic config save (object identity).
- **B5/B6** email and issue_tracker: enabling advertises tools whose runtime refuses or is absent.
- **B7** codex model split-brain: agents pick up a generic model change, chat/loops do not.
- **B8** personality presets added generically are never registered (silently render as Odin).
- **B9** `recovery_policy_source` closes over the boot config while claiming live replacement.
- **B11** personality writers use an unset `request.app._config_path` → CWD-relative write.
- **B13/B14/B15** display-vs-request effort mismatch; observability read paths vs hardcoded
  writers; `timezone` split between prompts (live) and `parse_time` (boot module global).

## 2. Constraints (operator-set; binding)

- **C1 — no breakage on update.** Existing installs upgrade cleanly. Both config styles
  (`${VAR}` placeholders and literal values) round-trip. Legacy `GET`/`PUT /api/config` request and
  response *shapes* stay stable; richer results arrive through new endpoints.
- **C2 — no functionality or capability loss.** Every capability reachable today stays reachable.
  Where a path is deliberately closed (secret writes through generic PUT), an equivalent dedicated
  path ships **in the same release**.
- **C3 — intuitive.** The reflection-dump renderer is retired in favour of a real configuration
  product: searchable, labelled, typed controls, honest state.
- **C4 — maximize live-in-place.** Convert snapshot consumers to live application wherever it can
  be done safely; classify honestly where it cannot.
- **C5 — dormant config is preserved, never removed, never auto-activated.** Unwired features
  become genuinely enable-able and configurable from the WebUI, shown plainly as *Disabled* when
  off. A legacy `enabled: true` never activates a newly wired feature on upgrade; activation is
  always an explicit operator action.

Delivery fence for the whole campaign: **branch and PRs only — no deploy to `/opt/odin`, no release
pipeline, no version bump, no website update** until the operator says otherwise.

## 3. Settled decisions

### D-A — `GET /api/config` secret masking (delegated to Claude+Odin; settled: proceed)

Complete server-side masking. Current behaviour is a read-side disclosure, not an API feature.
The WebUI submits diffs and never round-trips the response, so masking cannot corrupt a save.

Named breakage class, accepted deliberately: an external script that reads a secret out of
`GET /api/config`, or PUTs a whole fetched document back, will see an opaque sentinel and (for
sensitive paths) a rejection. That is the unsafe pattern being removed; preserving it preserves the
vulnerability. Everything else keeps working.

Compatibility boundary:

1. Legacy response **structure and field types stay stable** — sensitive scalars remain strings and
   become a stable opaque sentinel; secret maps keep their keys with masked values; secret-bearing
   list/object containers keep shape with every secret leaf masked. No new metadata objects in the
   legacy response.
2. Secret *state* is exposed only through the new metadata endpoint: `configured: true|false`,
   coarse provenance (`environment` / `config_file` / `secret_store` / `unset`), optional safe
   label and last-update time. Never the value, hash, prefix, suffix, or length.
3. Sensitivity is derived from the server registry (§4); key-name heuristics remain only as defence
   in depth. Arbitrary-value containers (MCP `headers`/`env`) are opaque unless a child is
   explicitly classified safe.
4. Generic PUT rejects sentinels and every registry-classified sensitive path, recursing dicts,
   lists, and nested models. **C2 rider:** each path newly rejected here gains a dedicated
   set/clear route in the same release — rejection without a replacement path would be capability
   loss. This closes the write-side half of B2, which today lets `web.api_tokens[].token` and
   `outbound_webhooks.targets[].secret` through.
5. `configured` never implies `usable`: feature status separately reports desired, configured,
   effective, and healthy.

Gates: canary secrets at every shape (scalar/list/map/container) must never appear in API
responses, audit diffs, logs, exports, validation errors, or UI state; an untouched write-only
field never enters the WebUI diff; release notes retire secret retrieval via `/api/config`.

### D-B — explicit activation contract (C5)

A dormant `enabled: true` in an existing file is never authority to start a process, contact a
network service, listen for Discord events, or expose a mutating tool merely because a release
finally wired the field.

**State model** per activation-owned feature: `Disabled` · `Configured, activation required` ·
`Activating` · `Active` · `Partially active/degraded` (e.g. per-MCP-server) · `Apply failed`
(desired persisted, effective unchanged, redacted error visible) · `Pending readiness` (valid but
awaiting the Discord/cog/scheduler boundary).

**Activation receipt** — a non-secret durable record (feature/resource identity, safety-policy
version, config revision, actor, timestamp) stored outside the legacy config shape. No receipt ⇒ no
activation. A safety-policy version bump requires re-acknowledgement without discarding config.

**Safe asymmetry:** generic `PUT /api/config` may save desired settings for a dormant feature but
can never activate it; `enabled: false` always disables immediately. Legacy PUT behaviour is
preserved without allowing accidental activation.

**Activation transaction:** draft (write-only secrets via dedicated flows) → `plan` (schema,
revision/ETag, dependencies, permissions, endpoint/process policy, blast radius — no runtime
publication) → explicit operator confirmation against a feature-specific impact summary → atomic
persistence under the one config lock → stage resources off-path with bounded health/discovery
checks → atomic swap of the effective runtime reference → publish catalog/routes/listeners **after**
the runtime exists → drain and close old resources. Failed staging tears down completely: no
catalog entry, listener, process, or client survives; desired state may remain for correction but
status says activation failed. Disable removes offer/dispatch paths first, refuses new work, then
drains bounded in-flight work and closes resources.

Enable/disable endpoints: admin-gated, CSRF-protected, revision-bound, idempotent, replay-resistant,
audited with secrets omitted; a short-lived plan token binds confirmation to the exact reviewed
revision.

**Release/acceptance rule:** no Enable action is exposed for a feature until its complete chain
exists — persistence, receipt, runtime construction, every consumer, catalog/listener publication,
disable/drain, shutdown, status, audit, secret handling, failure rollback. "The manager exists" or
"the toggle saves" is not wired.

### D-C — one writer, one apply layer, desired vs effective

- **One writer.** Generalize the proven `llm_admin._persist_llm_sections_sync` pattern
  (`src/web/api/llm_admin.py:99-216`) into a shared helper: active-path enforced, ruamel round-trip
  (comments, ordering, style, `${VAR}` placeholders, file mode preserved), **patch only submitted
  leaves** (never regenerate from `model_dump()`), atomic (mkstemp → fsync → `os.replace` → dir
  fsync), loud failure, and one lock serializing *all* config writers (generic, LLM, personality).
  Closes B1, B10, B11, O1, O2, O7 structurally.
- **One apply layer.** Generic and dedicated writes dispatch through the same per-field apply
  handlers. `llm_provider` writes delegate to `switch_provider()`; personality writes to its
  registration/rebuild path. Ownership, not duplication.
- **Desired vs effective.** `bot.config` stops being simultaneously the persisted document, runtime
  truth, apply transaction, UI schema, and restart ledger. Track desired/persisted value,
  runtime-effective value, boot snapshot for restart-owned consumers, and last apply outcome.
  Restart-class saves persist and mark pending **without** injecting into live readers. The
  pending-restart banner lists only fields whose desired ≠ effective and whose classification says
  a restart resolves it (never a raw boot-diff — live-applied fields legitimately differ from boot).

## 4. The field/apply registry (foundation)

Server-side, CI-enforced, authoritative for the API and the UI:

```
FieldSpec(path)                 # supports wildcard segments for dict/list entries
  owner            # canonical page: config | llm | personality | discord | secrets | <feature>
  label, description, unit, examples
  type/enum/constraints         # derived from pydantic where possible, never hand-duplicated
  default
  sensitivity      # public | sensitive (opaque) | secret_container
  secret_route     # dedicated set/clear endpoint when sensitivity != public
  apply_mode       # live_read | live_apply | live_for_new_work | restart | activation_required
                   # | legacy_control | dormant
  apply_handler    # callable owning the runtime transition
  consumers        # per-consumer caveats for mixed fields
  restart_reason   # required when apply_mode == restart
  activation_policy# required when apply_mode in {activation_required, dormant}
```

CI gate fails when a schema leaf is unclassified or a classified path no longer exists — the same
ratchet discipline as the lint/type/coverage gates. The UI derives widgets, validation, enums, and
sensitivity from a sanitized projection of this registry, deleting all three hand-maintained
front-end lists (`SENSITIVE_KEYS`, `ENUM_FIELDS`, `VALIDATION_RULES`).

New endpoints (legacy `GET`/`PUT /api/config` shapes untouched, per C1):

- `GET  /api/config/meta` — sanitized registry projection + per-field desired/effective/apply state.
- `POST /api/config/plan` — dry-run: validation, apply classification, blast radius, plan token.
- `GET  /api/config/status` — configuration health: applied / pending-restart / dormant / invalid
  counts, unsafe overrides, desired-vs-effective drift.
- feature activation + secret set/clear routes (per §5), admin-gated and revision-bound.

## 5. Per-feature settlement (C5 set — all become enable-able from the WebUI)

> The apply-mode column below is the **target** each feature is being moved to,
> not what the code does today. Present behaviour lives in
> `src/config/apply_registry.py`, which is leaf-level and CI-gated; where the
> two differ, the registry is the fact and this table is the intent. Example:
> `agents.max_children_per_agent` is `activation_required` in the registry
> because no spawn path reads it at all, and reaches the `live_for_new_work`
> below only once the one-time apply described here exists.

Post-campaign apply classes; none requires a restart provided controllers and dormant holders are
constructed at ordinary startup. Where staging and atomic swap cannot be guaranteed, the registry
must classify the field `restart` rather than impersonate liveness.

| Feature | Class | Boundary / key gates |
|---|---|---|
| **MCP** | `live_apply` | Global capability + **per-server** activation; global Enable creates no connections. Catalog merges only connected/healthy servers; dispatch runs the standard permission/timeout/audit/durability/scrub path across chat, agents, loops, scheduler, and delegated work. Stdio: absolute resolved executable, no shell (already `create_subprocess_exec`), executable allow policy + owner/mode checks, **minimal allowlisted child environment** (today `merged_env = {**os.environ, **self.env}` at `mcp_client.py:130` — and `env=None` inherits too, so the child unconditionally receives Odin's full service environment including unrelated credentials), process-group containment, bounded startup/call/shutdown, descendant cleanup, output/frame limits. HTTP: HTTPS default, per-hop SSRF validation with pinned resolved addresses (DNS-rebinding), mandatory TLS verification, write-only headers, size/depth limits. Discovered tool descriptions/schemas are untrusted: cap count/size/depth, namespace, reject collisions; default admin-only/interactive-only exposure with explicit per-server or per-tool permission for autonomous contexts. |
| **Message triggers** | `live_apply` | Bind the loaded cog to the canonical scheduler + an immutable effective snapshot, refreshed by one apply handler; `Pending readiness` before Discord is ready. Empty allowlists mean **all** today (`message_triggers.py:57,67`) — the activation dialog renders that as an explicit wildcard requiring separate "All channels"/"All users" acknowledgement. Default-deny DMs, bot/webhook authors, unscoped guilds. Preview every matching scheduled `discord_message` trigger before Enable. Dedupe, rate limits, cooldowns, bounded regex. Activation enables the event source only — it never creates schedules. |
| **Reaction triggers** | `live_apply` | Same scheduler binding, scope rules, preview, dedupe, cooldown. Strengthen from ignoring only Odin's own reactions (`reaction_triggers.py:89`) to rejecting all bot identities by default. Normalize custom-emoji IDs/names and Unicode in the preview. Independent receipt from message triggers. |
| **Issue tracker** | `live_apply` | One `IssueTrackerRuntime` holder feeding **both** consumers (`/api/issues/*` and the executor tool handler) — removes today's bot-client vs executor-client trap. Catalog visibility requires an effective healthy client, not `config.enabled`. Provider-specific required fields, write-only token, HTTPS/SSRF/rebinding controls for self-hosted Jira, bounded read-only Test Connection, review states that the tool can create/comment/transition external issues, prefer split read/write permission policy. Provider/URL/token change stages and tests a new client before swap; failure retains the old client and reports drift. |
| **`graceful_degradation.enabled`** | `live_apply` | Define precisely: enabled ⇒ guard may short-circuit an unavailable subsystem; disabled ⇒ health still recorded, calls not blocked. Thresholds become validated live setters; counters preserved. **Compat:** a stored `false` is ignored today (guard is unconditional — `wiring.py:387` "Always on"), so upgrades show *Stored disabled / effective enabled — explicit adoption required*; applying disabled warns that failures will keep reaching unhealthy providers. |
| **`agents.max_children_per_agent`** | `live_for_new_work` | Snapshot onto each newly spawned parent; running trees keep their limit. Legacy values stay unapplied (effective 3, `manager.py:39`) until a one-time **Apply configured limit**; enforce a hard maximum and show worst-case tree breadth against `max_nesting_depth` before confirming. |
| **`context.max_system_prompt_tokens`** | `live_for_new_work` | Ceiling for the assembled system prompt with mandatory core sections reserved first; if the core exceeds the ceiling, **reject the setting** rather than truncate. Deterministic allocation across optional sources, truncation only at documented boundaries, omissions surfaced in prompt-budget observability. Legacy installs stay uncapped until **Apply prompt budget**; panel previews current usage, mandatory floor, and what would be omitted. |
| **`usage.directory`** | `live_apply` (target) | Today it writes nothing (CostTracker is memory-only) but *is* a boot-captured workspace protected root. Add explicit **Enable durable usage history**, default off for legacy installs: validate ownership/permissions/space, create a bounded store, snapshot in-memory aggregates, swap CostTracker persistence, update protected roots. Directory change stages a new store, flushes/copies bounded state, swaps, keeps the old path protected until no writer holds it. Failure keeps in-memory tracking. Never write to a filesystem path merely because an old config names one. |
| **`slack.forward_alerts`** | `live_apply` | Requires defining "alert": a normalized internal alert stream (initially Grafana alerts + health/subsystem transitions) that the Slack notifier subscribes to — **not** an alias for `forward_webhooks`. Source filters, dedupe/cooldown, rate limits, scrubbing. The stored default `true` is inert today and stays inert without a receipt; prerequisites are an effective notifier and a tested destination. |
| **`grafana_alerts.enabled`** | `live_apply` | Pre-register inert webhook handlers at startup so toggling needs no route mutation; disabled fails closed explicitly. Hierarchy: `webhook.enabled` = ingress capability; `grafana_alerts.enabled` = parsing/notification/trigger/rule evaluation; `auto_remediate` = separate high-risk arming with its own confirmation (matching rules, channel, modes, iteration and concurrency ceilings). **Compat:** `/webhook/grafana` is registered under `webhook.enabled` today (`health/server.py:545`) while `grafana_alerts.enabled` is never read, so working installs must show *Active under legacy webhook control* until the operator adopts explicit control — preserving behaviour is not auto-activation. |
| **Outbound webhooks** (`scrub_secrets`, `verify_ssl`) | `live_apply` | Unify config persistence with runtime CRUD (today the API mutates only the dispatcher and boot wiring drops both safety flags at `wiring.py:493-499`); stable target IDs without migrating untouched legacy lists. **Safe-activation rule:** on upgrade every legacy target's effective `scrub_secrets`/`verify_ssl` remain `true` regardless of stored `false`, until that *specific* target is reviewed and saved with a safety-override receipt. No bulk trust action; unrelated edits never activate stored unsafe values; `scrub_secrets=false` warns about credential disclosure per subscribed event class; `verify_ssl=false` needs a separate high-risk acknowledgement (labelled not-applicable for HTTP). Clearing an override returns immediately to the safe value. URL safety enforced on create, edit, test, **and every dispatch** (resolution + redirects) so a registered target cannot later rebind to localhost or metadata. |

## 6. UI design (C3)

Retire the reflection dump. The page becomes an operator settings workspace:

- **Navigation:** category rail with counts (modified, pending restart, invalid, dormant); search
  across labels, raw paths, descriptions, aliases; sections collapsed by default with remembered
  state; raw paths shown as secondary technical detail, not primary labels.
- **Configuration health header:** applied / pending restart / dormant configured / invalid /
  persistence error / drift — each filterable. Unsafe effective overrides surface here.
- **Single ownership:** LLM and Personality become summary cards linking to their dedicated pages
  (no duplicate weaker editors). Discord global defaults are labelled as such with a precedence
  explanation and a link to per-guild/channel overrides. Secrets route to their dedicated flows.
- **Editing:** section-level drafts, not a 228-field global form; a global review tray groups
  changes by apply class and is the commit gate; per-field server validation mapped back to the
  field; typed editors from metadata — host rows with connection test, chips for ID allowlists,
  cards/tables for webhook targets and Grafana rules, fieldsets for retry/pool/governor, real row
  editors for object arrays. Raw JSON survives only as a labelled expert escape hatch with live
  parse/schema errors (never silent discard, closing O6). Browser `prompt()` is removed.
- **Liveness badges** per field: *Applies immediately* · *Reloads live* · *Applies to new work* ·
  *Restart required* · *Activation required* · *Managed in X* · *Not wired*. Mixed fields show
  per-consumer detail ("new agents: immediate; tool executor: restart").
- **Feature panels** (per D-B): header with effective/desired state, apply class, health, last
  apply/test; plain-language "what enabling causes"; Configure area with typed editors and
  write-only secret controls; Safety & access area; Activity area (resources, recent events,
  failures, audit links); separate **Save settings**, **Test**, **Enable**, **Disable** actions —
  saving never arms a dormant feature.
- **Mobile:** one subpanel at a time, sticky bottom bar (Cancel · Review · Save) with Undo/Redo in
  overflow, no clipped actions (closes B12), tab-strip overflow affordance, persistent
  pending-restart banner.

## 7. Work partition

One author + one reviewer per work item; never both of us in the same code
(`feedback_delegation_overlap`). Every PR is cross-reviewed before merge.

| Lane | Owner | Reviewer | Scope |
|---|---|---|---|
| **S1** correctness & security | Claude | Odin | Shared writer, recursive redaction/blocking + sentinel rejection, truthful persistence failure, `health_server` backlink, `/api/tools/timeouts` ownership, recovery closure, personality `active_config_path()` |
| **S2** registry & metadata | Claude | Odin | Field/apply registry, CI classification gate, `/api/config/meta`, `/api/config/plan`, `/api/config/status` |
| **S3** apply layer & liveness | Claude | Odin | Unified apply dispatch, desired-vs-effective state, snapshot→live conversions (timezone parser, prompt caches/presets, executor timeout ownership, permissions tiers, logging level, learning caps, email behaviour), restart endpoint + pending model |
| **U1** page shell & IA | Odin | Claude | Category rail, search, health header, collapsed sections, section drafts, review tray, mobile action model |
| **U2** typed editors & badges | Odin | Claude | Metadata-driven widgets, host/chip/target/rule editors, liveness badges, JSON escape hatch, removal of the three hand-maintained front-end lists |
| **F1** MCP wiring & activation | Odin | Claude | Manager lifecycle, catalog merge, dispatch across all contexts, stdio/HTTP safety gates, per-server activation, panel |
| **F2** triggers + issue tracker | Claude | Odin | Cog binding + live refresh, scope acknowledgement, `IssueTrackerRuntime`, health-gated catalog visibility, panels |
| **F3** dormant flags | Claude | Odin | graceful_degradation, agent child limit, prompt budget, usage persistence, slack alert stream, grafana control hierarchy, outbound-webhook safe activation |
| **X1** secret flows | Claude | Odin | Set/clear routes, provenance, canary gates (rides S1/S2) |

Sequencing: S1 and U1 start in parallel (U1 builds against the §4 contract). S2 lands before U2
switches from fixture to live metadata. S3 precedes F-lane activation work, which depends on the
apply/receipt machinery. Docs and the generated liveness column ride the lane that owns each field.

## 8. Gates

Standard repo gates on every PR (suite, ruff, mypy, coverage ratchet, `npm run check` including the
template and binding validators for any `ui/` change, with `ui/dist` committed alongside source),
plus campaign-specific gates: the registry classification gate; secret canary tests at every shape
across API responses, audit diffs, logs, exports, and errors; round-trip persistence tests proving
comments/placeholders/mode survive and that both config styles are preserved; activation tests
proving a legacy `enabled: true` never activates without a receipt; and rollback tests proving a
failed activation leaves no catalog entry, listener, process, or client behind.
