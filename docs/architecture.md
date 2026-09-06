# Architecture

Odin separates conversation handling, model generations, tool execution, and
durable evidence. This page describes the **source architecture**, not a running
installation or its selected model, accounts, hosts, or extensions.

Source baseline: [`9411b73ae63ce959295fa9968f63d92c129b8578`][baseline].
All source links below are pinned to that revision.

## Follow one request

```text
Discord message
  -> MessageIntake: scrub, admit, deduplicate, collect attachments
  -> MessagePipeline: channel lock, session history, prompt, route
       -> chat-only completion (guest)
       -> ToolLoopRunner (tool-enabled request)
            -> capture serving identity + context budget
            -> generate -> accept tool calls -> dispatch
                 -> Discord-native domain handler
                 -> MCP dispatch
                 -> ToolExecutor -> domain handler -> local/remote operation
            <- paired tool results + retained-output pointers
            -> next generation or finalization
  -> scrub response, persist bounded session history
  -> ResponseDelivery: reply/chunks/attachments

Alongside execution:
  audit + trajectories     observations and diagnostics
  durable turn state       checkpoints and side-effect ledger
  retained output          retrievable evidence, not execution authority
```

1. **Intake is not execution.** `MessageIntake.handle` logs redacted channel
   content, ignores self-messages, handles detected credentials before prefix
   commands, applies user/channel and mention policy, and deduplicates admitted
   messages. Prefix-command authorization is separate from executor admission.
   See [`src/discord/intake_pipeline.py`][intake].
2. **The pipeline owns the conversation boundary.** A per-channel lock serializes
   requests; new threads may inherit parent context. The pipeline appends the
   user message, routes guests to chat without tools, and assembles the prompt
   and task history for tool-enabled requests. Explicit resume is checked before
   fresh prompt/history assembly. See [pipeline admission][pipeline] and
   [tool-loop invocation][pipeline-loop].
3. **The tool loop owns iterative work.** Each generation captures a serving
   identity and budget snapshot, applies context handling, calls the model, and
   either finalizes or appends structured assistant tool calls and executes them.
   Cancellation, stuck-work checks, and iteration caps are part of the loop,
   not assumptions delegated to the model. See
   [`src/discord/tool_loop.py`][iterations].
4. **Dispatch is an authorization boundary.** The loop checks requester
   permissions before native, MCP, or executor routing. It records the durable
   transition before an external effect, distinguishes failures from uncertain
   outcomes, retains large output, audits the outcome, and settles the operation
   with a correlated `tool_result`. See [dispatch and settlement][dispatch].
5. **Delivery and memory are different products.** The pipeline scrubs the final
   response and saves bounded history or a sanitized error marker. Delivery uses
   retrying replies, code-fence-aware chunks, and a file fallback for very long
   responses. A saved session is not a copy of every byte delivered to the user.
   See [pipeline completion][pipeline-completion] and
   [`src/discord/delivery.py`][delivery].

## Composition: two stages, explicit owners

[`src/discord/wiring.py`][services] is the composition root.
`build_services(config)` constructs bot-independent services in dependency order:
agent and loop managers, trajectory infrastructure, context/search/session
services, authorization, execution, and the other shared services collected in
`BotServices`. The order is intentional: consumers must receive the same service
objects, not convenient replacement instances.

[`build_components(bot, services)`][components] constructs the bot-coupled layer:
the LLM gateway, prompt builder, tool catalog, native dispatcher, delivery,
recorder, tool loop, and pipeline components. Live roots use provider callables
such as `lambda: bot.config`, because publication can replace the configuration
object. Capturing the boot object would leave a consumer stale.

There is one explicit construction cycle: agent/task handlers need the tool loop,
while the tool loop needs the native dispatcher. Wiring creates the dispatcher,
then the loop, then the agent/task owner, attaches that owner, and only then
registers native handlers. See [late owner attachment][agent-wiring].

## Tool definitions are not tool dispatch

| Layer | Responsibility |
| --- | --- |
| [`src/tools/registry.py`][registry] | Concatenates definition modules in exact order, builds the name map, rejects duplicate names, and decorates served descriptions with affordances. |
| [`src/discord/tool_catalog.py`][catalog] | Builds the available catalog from built-ins, extensions, and published MCP definitions; applies disabled/backend visibility policy and reserves built-in names against shadowing. |
| [`src/tools/executor.py`][executor-table] | Maps executor-routed names to domain owners. Handler lookup is late-bound at call time, preserving owner-level test seams. |
| [`src/discord/native_tools/registry.py`][native] | Shares one native dispatch table between chat and loop paths; native handlers receive Discord-aware context. |

The executor additionally enforces tool scope, disabled-tool policy, requester
permission, host acquisition, timeout handling, risk assessment, and structured
results. Its [dispatch implementation][executor] is the enforcement path;
showing or hiding a tool in a prompt is not authorization. Native dispatch also
checks disabled-tool policy, while its callers supply the RBAC gate.

The generated [tool reference](./reference/tools.md) describes the built-in
definitions. It is not an inventory of extensions installed by an operator.

## Providers, generation identity, and the Codex auth pool

The [`LLMProvider` interface][provider] offers plain `chat`, structured
`chat_with_tools`, and lifecycle cleanup. [`LLMGateway`][gateway] owns provider
selection and guarded calls, including usage and subsystem-health wiring.
Provider changes invalidate the tool catalog; when persistence is supplied,
the switch restores the previous selection on persistence failure under the
same provider lock.

A logical generation captures the actual client/model/effort identity together
with its budget; retries must not silently switch to whatever configuration
became current during an await. [Client lifecycle leases][client-lifecycle]
prevent newly admitted work from using a retired client and let existing work
drain before closing it. These are source capabilities, not a claim about which
backend an installation is using.

The optional Codex integration has a dedicated [`CodexAuthPool`][auth-pool]:

- It supports one or multiple credential sets and owns shared account-scoped
  quota tracking.
- Account refresh is serialized per account; rotated credentials are propagated
  back to canonical storage. Reload reconciles newer credentials for the same
  account rather than overwriting them with stale copies.
- Acquisition pins an account index to the request. Refresh runs outside the
  pool lock so one slow refresh does not serialize unrelated requests.
- Rate-limit and authentication failures are marked against the account that
  served the request, with rotation/backoff and typed errors on exhaustion.

See [acquisition][auth-acquire], [failure marking][auth-failures], and
[per-account refresh locking][auth-refresh]. No credential values or configured
account identities are needed to understand this boundary.

## Agents: execution lifetime versus retained results

[`AgentManager`][agents] owns spawn admission, parent/child relationships,
in-memory worker state, messages, and cleanup. Concurrent admission reads current
configuration; admitted trees retain their own depth/child limits. A lifetime
spawn counter prevents cleanup from resetting a tree's budget.

The transcript contract preserves ordered native calls and one paired result
per accepted call. Missing IDs are assigned once; duplicate IDs and malformed
arguments produce paired errors, not execution with invented defaults. Replay
inputs are copied at acceptance. **Correlation does not mean exactly-once
execution or permission to repeat a mutation.** See
[`src/llm/tool_history.py`][tool-history] and the
[agent transcript contract][transcript-contract].

[`src/agents/tool_cycle.py`][agent-cycle] executes a generation's calls
sequentially, bounds tool waits by remaining lifetime, and records partial
outcomes when cancelled. Parent messages interrupt child waits without cancelling
the children; other tools reach a safe boundary before consuming corrections.

Final results are separate from live workers. [`src/agents/results.py`][results]
publishes durable snapshots and pages a scrubbed immutable body on UTF-8
boundaries. `wait_for_agents` returns bounded status previews; use
`get_agent_results` continuations for complete results. Result storage can outlive
registry cleanup, but trajectories and saved results do **not** resume a running
agent after process restart. See [result delivery][result-contract].

## Sessions and context budgets

[`SessionManager.get_task_history`][sessions] compacts when needed, retains recent
messages, relevance-filters older candidates, prepends summaries as read-only
context, and applies the configured history send budget. Historical instructions
are explicitly marked as completed context, not new work.

That session budget is distinct from the model-generation budget in
[`src/llm/context_budget.py`][budgets]. The resolver combines capability floors or
overrides, observed capacity clamps, utilization policy, a fixed non-history
envelope reserve, and workload density into a frozen `ContextBudgetSnapshot`.
Soft compaction uses the working policy budget; predictive admission uses the
effective capacity budget. Rescue targets never enlarge context. Character/token
density is an estimate that can be calibrated downward, not proof that a payload
fits. A new configuration or observation affects the next generation, not a
retry halfway through the current one.

## Durable turns and recovery

[`src/turn_state/store.py`][turn-store] keeps checkpoints and the side-effect
ledger in one SQLite database, with content-addressed payload blobs alongside
it. This is deliberately separate from sessions, audit logs, and disposable
execution workspaces. Writes are fenced by turn generation, revision, and lease;
a stale owner must stop. Once a turn is durable, a persistence failure halts
further generation or mutation rather than silently dropping back to an
uncheckpointed path.

[`src/llm/recovery.py`][recovery] supplies shared deadline-based generation retry
policy. It retries typed capacity/transport failures with bounded backoff and
model-scoped breaker admission, but fast-fails authentication, invalid-request,
and exhausted-rate-limit errors. The recovery deadline bounds waiting between
attempts; a healthy in-flight generation has its own transport limits.

[`TurnResumeManager`][resume] rechecks the original request and current
authorization before resuming suspended chat work. In-process auto-resume also
requires the session not to have advanced. After restart, resume is explicit.
Ledger repair supplies stored results or explicit uncertainty for unmatched tool
calls; it does not automatically execute them again. Unresolved external effects
block automatic continuation.

## Managed hosts: desired state, runtime identity, access

[`HostRegistry`][hosts] publishes an immutable runtime view of the inventory in
`config.yml`. An operation acquires a lease on one exact host generation.
Ordinary edit/disable/remove denies new work while existing leases drain;
force-revoke cancels matching leases and may leave an external outcome unknown.

[`HostEnrollmentManager`][enrollment] validates candidates and SSH trust before
they become targetable. The [host management API][host-api] stages a runtime
publication, persists desired configuration, then publishes the new registry
generation and clears cached host prompt information. Merely changing a
configuration object is not this complete control-plane transaction.

[`HostAccessManager`][host-access] separately stores per-user/default access
policy in `host_access.json` and resolves available aliases through the runtime
inventory provider. The policy store is not a second host inventory. Request
scope intersects access; knowing an alias is not permission to execute on it.

## Audit, trajectories, and output retention

[`AuditLogger`][audit] records execution identity, bounded scrubbed inputs and
result summaries, elapsed time, errors, and optional risk/diff metadata.
[`TurnRecorder`][recorder] handles trajectory/context-trace recording and
reflection/lifecycle hooks. These explain what happened; the durable turn ledger
governs replay safety. Neither replaces the other.

Large outputs should be retrieved, not regenerated merely because a preview was
short. The retention contracts are intentionally different:

| Evidence | Retrieval and lifetime |
| --- | --- |
| General tool output | `get_tool_output` reads immutable scrubbed snapshots with Unicode code-point cursors, a fixed 24-hour TTL, and default 4 MiB/result and 64 MiB aggregate quotas. Every read rechecks original owner/channel and current tool/host authority. |
| Agent results | `get_agent_results` uses immutable-body UTF-8-byte continuations. Durable results have no automatic deletion in this source revision; live worker cleanup is separate. |
| Process output | `manage_process poll` uses generation-bound byte pages of a bounded spool. Evidence is retained for 24 hours after observed exit; restored handles are read-only, not recovered execution authority. |

See [`src/tools/output_retention.py`][output-store],
[`src/tools/process_manager.py`][processes], and the detailed
[output delivery][output-contract] and [process retention][process-contract]
contracts. A cursor is a retrieval coordinate, never an authorization token.
Follow continuations until `truncated=false`; initial labelled tails are context,
not permission to skip the intervening evidence. Quota failure and expiration
must remain visible rather than promising a continuation that was never saved.

## Next steps

- [Built-in tools](./reference/tools.md)
- [HTTP API](./reference/api.md)
- [Contributing](./contributing.md)

[baseline]: https://github.com/Calmingstorm/Odin/commit/9411b73ae63ce959295fa9968f63d92c129b8578
[intake]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/discord/intake_pipeline.py#L145-L292
[pipeline]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/discord/intake_pipeline.py#L418-L610
[pipeline-loop]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/discord/intake_pipeline.py#L611-L663
[iterations]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/discord/tool_loop.py#L728-L853
[dispatch]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/discord/tool_loop.py#L2380-L2574
[pipeline-completion]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/discord/intake_pipeline.py#L754-L853
[delivery]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/discord/delivery.py#L134-L232
[services]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/discord/wiring.py#L1-L169
[components]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/discord/wiring.py#L640-L755
[agent-wiring]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/discord/wiring.py#L855-L900
[registry]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/tools/registry.py#L14-L84
[catalog]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/discord/tool_catalog.py#L24-L88
[executor-table]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/tools/executor.py#L147-L176
[executor]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/tools/executor.py#L708-L917
[native]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/discord/native_tools/registry.py#L60-L128
[provider]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/llm/provider.py#L14-L58
[gateway]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/discord/llm_gateway.py#L711-L825
[client-lifecycle]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/llm/client_lifecycle.py#L73-L126
[auth-pool]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/llm/codex_auth.py#L408-L514
[auth-acquire]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/llm/codex_auth.py#L587-L644
[auth-failures]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/llm/codex_auth.py#L664-L732
[auth-refresh]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/llm/codex_auth.py#L90-L154
[agents]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/agents/manager.py#L499-L630
[tool-history]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/llm/tool_history.py#L1-L68
[transcript-contract]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/docs/agent-transcript-contract.md#L1-L38
[agent-cycle]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/agents/tool_cycle.py#L32-L129
[results]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/agents/results.py#L1-L147
[result-contract]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/docs/agent-result-delivery.md#L9-L44
[sessions]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/sessions/manager.py#L709-L832
[budgets]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/llm/context_budget.py#L1-L145
[turn-store]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/turn_state/store.py#L1-L104
[recovery]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/llm/recovery.py#L1-L40
[resume]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/discord/turn_resume.py#L1-L208
[hosts]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/tools/hosts/registry.py#L1-L149
[enrollment]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/tools/hosts/control.py#L109-L216
[host-api]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/web/api/hosts.py#L160-L220
[host-access]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/permissions/host_access.py#L46-L145
[audit]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/audit/logger.py#L348-L425
[recorder]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/discord/turn_recorder.py#L1-L75
[output-store]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/tools/output_retention.py#L1-L131
[processes]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/src/tools/process_manager.py#L1-L7
[output-contract]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/docs/agent-result-delivery.md#L46-L150
[process-contract]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/docs/process-output-retention.md#L1-L61
