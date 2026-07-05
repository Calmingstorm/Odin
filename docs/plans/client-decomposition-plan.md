# RFC-001: Decomposition of `src/discord/client.py`

| | |
|---|---|
| **Status** | **APPROVED** (R1) — Odin approved as campaign plan of record, 2026-07-04. Implementation NOT started; each phase requires Aaron's per-phase approval, then branch → PR → Odin review |
| **Author** | Claude (on behalf of Aaron / Calmingstorm) |
| **Reviewer** | Odin |
| **Date** | 2026-07-04 |
| **Baseline** | `master` @ `081e231` (v3.44.1) |
| **Scope** | `src/discord/client.py` (5,790 lines) and its test surface |

---

## 1. Executive summary

`src/discord/client.py` is a 5,790-line module containing one god class (`OdinBot`, 111 direct methods/properties by AST; 151 function definitions module-wide including nested closures and module-level helpers) that owns message intake, two hand-duplicated tool loops, prompt assembly, LLM provider management, ~45 Discord-native tool handlers, scheduler callbacks, agent delegation, response delivery, lifecycle, and ~25 mutable state dictionaries. Project history confirms it is the primary bug source, and Odin's own prior analysis (recorded in `tool_loop_helpers.py`'s docstring) called the tool loop "the single worst structural problem," blocked on the absence of an end-to-end harness.

This RFC proposes an **11-phase strangler-fig decomposition** — one reviewable PR per phase — that:

1. Builds the missing **characterization-test harness first** (Phase 0), pinning current behavior including guard ordering, so every later move is provably behavior-neutral.
2. Extracts responsibilities into ~15 focused modules with **constructor-injected dependencies**, in risk order (composition root and state registry first, the two tool loops last).
3. Preserves the **entire external attribute/method contract** of `OdinBot` via a delegating facade — required because `web/api.py` reads/writes 54 distinct attributes including private ones.
4. Deletes the ~490-line duplicated autonomous-loop pipeline by re-basing it on the extracted chat tool-loop runner, with every intentional chat/loop behavioral asymmetry explicitly enumerated and test-pinned.
5. Ends with `client.py` as a thin Discord adapter (target ≤ ~900 lines), every extracted module unit-testable without a Discord gateway connection.

No behavior changes. No guard, classifier, or response-guard weakening (hard rule). Each phase leaves the full suite green and is independently deployable and revertable.

---

## 2. Problem statement

Measured on the baseline commit:

- `client.py` is **5,790 lines**; the next-largest module in the package is 688 (`response_guards.py`). `OdinBot.__init__` alone is 455 lines; `_process_with_tools` is 855; `close()` is 219; `_handle_message_inner` is 261; `_run_loop_iteration` is 310. (Method lengths AST-measured, reviewer-verified.)
- **Two parallel tool-execution pipelines** are maintained by hand: `_process_with_tools` (chat, lines 2768–3623) and `_run_loop_iteration` + `_dispatch_loop_tool_inner` (autonomous loops, lines 4698–5214). Their comments cross-reference each other to stay in sync ("matches `_process_with_tools` format", "Mirrors the Discord-native tool dispatch in `_process_with_tools`", "The sibling loop already uses this stricter form"). Every dispatch or safety fix must be applied twice; v3.44.x fixes repeatedly touched both.
- **Two parallel ~45-branch if/elif dispatch tables** for Discord-native tools (chat: lines 3226–3402; loop: `_dispatch_loop_tool_inner`).
- **~25 mutable state fields** (per-channel locks, cancel events, pending files, buffers, caches, recent actions) are mutated from intake, both loops, delivery, handlers, slash commands, and the web API, with an 84-line cross-cutting janitor (`_cleanup_stale_caches`) that knows about all of them.
- The project's own failure-mode record: *"`client.py` monolith (5.8K lines) — most bugs trace here."*
- Review leverage is degraded: every PR that touches the file asks the reviewer to reason about a 5,790-line shared-state context.

Prior mitigation attempts were real but small: `response_guards.py`, `background_task.py`, `attachments.py`, `voice.py` were extracted, and `tool_loop_helpers.py` (84 lines of pure functions) explicitly documents that further decomposition was deferred **because no end-to-end harness existed**. This RFC is that harness plus the deferred decomposition.

---

## 3. Goals and non-goals

### Goals
1. `client.py` becomes a thin Discord adapter: event handlers, cog/extension loading, and a stable facade. Target ≤ ~900 lines.
2. Every extracted module has a single responsibility, explicit constructor dependencies, and unit tests that run without a Discord connection or live LLM.
3. One tool-execution pipeline, parameterized by policy (chat vs. loop), instead of two hand-synced copies.
4. One Discord-native tool dispatch registry instead of two if/elif chains.
5. Behavior preservation, proven by a characterization suite written before any production change.
6. The external contract (everything `web/api.py`, `health/checker.py`, `web/chat.py`, `__main__.py`, cogs, and tests touch) remains valid throughout.

### Non-goals (explicitly out of scope for this campaign)
- **No behavior changes** — no guard tuning, no new features, no bug fixes riding along (any bug found gets its own issue/PR).
- **No framework-independence rewrite** — the pipeline stays `discord.Message`-shaped (formalized as a duck-type Protocol); we do not port to a hexagonal core in this campaign (see §11 Alternatives).
- **No migration of `web/api.py` off the facade** — it keeps using `bot.<attr>`; migrating it to direct component access is a candidate follow-up campaign.
- **No changes to `ToolExecutor`, `SessionManager`, `Scheduler`, or other subsystems** — they are already separate modules with no bot reference; this campaign only touches how `client.py` orchestrates them.
- **No renames of externally-referenced attributes/methods** — even ugly ones (`_knowledge_store` vs `knowledge` naming drift is documented, not fixed).

---

## 4. Current-state analysis

### 4.1 Responsibility clusters in `OdinBot` (111 direct methods, by baseline line ranges)

| Cluster | Lines | ~LOC | Contents |
|---|---|---|---|
| Module-level helpers | 94–225 | 130 | `_scrub_tool_input_for_storage`, `_LoopMessageProxy`/`_LoopAuthorProxy`, `scrub_response_secrets`, `truncate_tool_output`, `combine_bot_messages` |
| Construction (composition root) | 227–681 | 455 | `__init__`: constructs ~30 subsystems + ~25 state fields, then builds prompt, registers commands |
| LLM provider management | 682–872 | 190 | `llm_client` property, `_wire_llm_callbacks`, reload codex/ollama/kimi (×2 each), `switch_llm_provider`, `codex`/`knowledge` properties |
| Prompt & context assembly | 873–1345 | 470 | `_build_system_prompt`, `_build_chat_system_prompt`, `_merged_tool_definitions`, caches (`_get_cached_hosts/skills_text/memory`), `_get_reflector_section`, `_invalidate_prompt_caches`, cache janitor (`_cleanup_stale_caches`, `_maybe_cleanup_caches`), `_track_recent_action`, observability helpers (`_record_user_content`, `_new_context_trace`), schedule validation (`_validate_schedule_payload`, `_extract_tool_input_from_steps`), `_invoke_skill_missing_required`, startup logging |
| Slash commands & gating | 1371–1489 | 120 | `_register_commands` (6 slash commands), `_is_cancelled/_is_allowed_user/_is_allowed_channel/_check_for_secrets`, `_resolve_prefix` |
| Guarded LLM call & reflection glue | 1490–1703 | 215 | `_codex_call` (lock + subsystem guard + model router + cost tracker), reflection triggers (`_should_reflect_on_operation`, `_maybe_loop_reflect`, `_operational_reflection`), `_save_turn_trajectory`, `_emit_lifecycle_event` |
| Lifecycle | 1704–2048 | 345 | `setup_hook`, `close` (219 lines of teardown), `_set_status`, `on_ready`, `_backfill_archives`, `on_voice_state_update` |
| Message intake | 2049–2422 | 375 | `on_message` (249 lines: secret scrub → cogs → bot gates → allowlists → channel config → mention gate → dedup → bot-message buffering → attachments → voice commands), `_process_attachments`, `_on_voice_transcription`, `_handle_message` (lock + thread-context inheritance) |
| Pipeline orchestration | 2423–2767 | 345 | `_handle_message_inner` (guest route vs tool route, handoff, history persistence, error sanitization, reflection dispatch, delivery), `_classify_completion` + `_parse_classifier_response` + classifier prompt |
| Chat tool loop | 2768–3649 | 880 | `_process_with_tools` (855 lines: preamble, RBAC/tier/token tool filtering, iteration loop, context compression, typing, stuck-loop tracking, 6-guard cascade, completion classifier, continuation budget, ~45-branch native dispatch, parallel execution w/ timeouts, audit, trajectory, validation enforcement, vision injection, skill handoff, `/stop` cancellation, cap handling), `_ensure_failure_visible`, `_detect_image_type` |
| Discord-native tool handlers | 3650–4037, 5215–5459 | 630 | 22 `_handle_*` methods: purge, browser_screenshot, generate_file, post_file, schedule CRUD, parse_time, search_history, knowledge CRUD, set_permission, search_audit, read_channel, add_reaction, create_poll, analyze_image, generate_image |
| Scheduler & monitor callbacks | 4038–4148, 5460–5688 | 340 | `_on_scheduled_digest`, `_format_digest_raw`, `_resolve_mentions`, `_on_monitor_alert`, `_execute_scheduled_tool`, `_run_scheduled_workflow`, `_on_schedule_failure`, `_on_scheduled_task` |
| Delegation & agents | 4149–4697 | 550 | `_handle_delegate_task`, task list/cancel, loop start/stop/list, `_handle_spawn_agent` (119), agent send/list/kill/results/wait, `_handle_spawn_loop_agents`, `_collect_loop_agents`, `_collect_agent_result` |
| Autonomous loop pipeline | 4698–5214 | 515 | `_run_loop_iteration` (310 — duplicate of chat loop minus guards), `_dispatch_loop_tool` + `_dispatch_loop_tool_inner` (177 — duplicate dispatch table) |
| Delivery | 5689–5790 | 100 | `_send_with_retry`, `_send_chunked` (code-fence-aware chunking, file fallback, pending-file attachment) |

### 4.2 Mutable state inventory (the coupling core)

Set in `__init__` and mutated across clusters:

| State | Type | Mutated by |
|---|---|---|
| `_channel_locks` | dict[str, Lock] | `_handle_message`, janitor |
| `_cancel_events`, `_active_request_by_channel` | dicts | `/stop` command, chat loop, janitor |
| `_pending_files` | dict[str, list] | skill handlers, export_skill, delivery, error paths, janitor |
| `_processed_messages` | OrderedDict | `on_message` dedup |
| `_bot_msg_buffer`, `_bot_msg_tasks` | dicts | `on_message` bot buffering |
| `_recent_actions`, `_last_op_details` | dicts | chat loop, prompt builder, reflection dispatch, janitor |
| `_background_tasks` | dict | delegate_task handlers |
| `_cached_merged_tools`, `_cached_skills_text`, `_cached_hosts`, `_memory_cache` | caches | skill CRUD (both loops), config reload, **`web/api.py` writes** |
| `_system_prompt` | str | `__init__`, `/reload`, skill CRUD, **`web/api.py` writes** |
| `_llm_provider_lock`, `_llm_active_requests`, `_llm_switching` | lock/counters | `_codex_call`, reloads, switch |
| Late-bound (NOT set in `__init__`) | — | `startup_report` (setup_hook), `_web_channel_locks` (created by `web/chat.py`!), `mcp_manager`, `_codex_auth_pool`, `_issue_tracker_client`, `compression_stats`, `health_server` (web layer) |

Two subtleties that constrain the design:
- **`hasattr` semantics are load-bearing.** Code paths use `hasattr(self, "reflector")`, `getattr(config, ...)` defensively; `health/checker.py` reads everything via `getattr`. The facade must not pre-create attributes that are conditionally absent today, and must keep late-bound attributes settable.
- **The chat loop mutates its own system prompt mid-flight** (skill CRUD → cache invalidation → `nonlocal system_prompt` rebuild at lines 3278–3309, mirrored in the loop dispatch at 4874–4880). Extraction must carry this signal explicitly.

### 4.3 The duplicated pipeline, and its intentional asymmetries

`_run_loop_iteration` docstring: *"Simplified version of `_process_with_tools` for autonomous loops."* The duplication is near-total (LLM call → tool dispatch → parallel execution → audit → trajectory → scrub/truncate → iterate), but the differences are **intentional behavior**, not accidents. Any unification must preserve them:

| Dimension | Chat loop (`_process_with_tools`) | Autonomous loop (`_run_loop_iteration`) |
|---|---|---|
| LLM entry | `_codex_call` (provider lock, subsystem guard, model router, cost tracker) | **raw `self.llm_client.chat_with_tools`** — no gateway wiring |
| Response guards (fabrication/promise/unavail/hedging/code-hedging/premature-failure) | Full cascade, one retry each | **None** |
| Completion classifier + continuations | Yes (≤3 continuations) | **No** |
| Stuck-loop tracker | Yes (warn → terminate) | **No** |
| Request preamble / history separator | Yes | No (prev-context synthetic exchange instead) |
| Context compression | Yes | No |
| Typing indicator, status updates | Yes | No |
| `/stop` cancellation checks | Yes (4 checkpoints) | No (LoopManager owns lifecycle) |
| Validation enforcement (`[AUTO-VALIDATE]`) | Yes | No |
| Vision block injection | Yes | analyze_image collapsed to text |
| Audit events | `tool_start`/`tool_end` + `log_execution` | `loop_tool` + `log_execution` |
| Iteration cap | `max_tool_iterations_chat`, error text mentions chat cap | `max_tool_iterations_loop`, cap → `_finish(is_error=True, failure_class="cancelled")` |
| Trajectory source | `"discord"` | `"loop"`, gated by `observability.loop_trace` |
| Reflection | `_operational_reflection` (fire-and-forget, post-turn) | `_maybe_loop_reflect` (gated by `LoopReflectionGate`) |
| CircuitOpenError | wait-and-retry once inside the loop | **re-raised** to LoopManager |
| Return contract | 5-tuple `(text, already_sent, is_error, tools_used, handoff)` to pipeline / web chat | plain text via `_finish(...)`, carrying loop failure metadata (`is_error`, `failure_class`, `error_text`) to LoopManager |
| `/stop` + active-request bookkeeping | sets/clears `_active_request_by_channel` (own request id only) | none — LoopManager owns lifecycle |
| Recent-operation details | updates `_last_op_details[channel]` consumed by post-turn reflection | accumulates local `_loop_details` for the loop-reflection gate |
| Presence / per-tool status labels | `_set_status(_TOOL_STATUS_LABELS…)` per tool | no presence/status side effects |
| `analyze_image` result shape | dict → pending vision block injected into the **next LLM turn** (shape invariant) | dict collapsed to text `[Image loaded: …]` |
| Trace mismatch warnings & error recovery | `TOOL_RESULT_CONTINUATION_MISMATCH` on chat trace; guard/classifier drive recovery | loop-specific mismatch warnings; a recovered mid-iteration tool error keeps the turn a success while passing failure detail to reflection |

This table becomes a test fixture in Phase 0 and the acceptance checklist in Phase 8.

### 4.4 External contract (measured, not assumed)

Only 9 files in `src/` touch a bot instance. Ranked by distinct attributes:

1. **`web/api.py` — ~54 distinct attributes, 213 references. The de-facto facade.** Reads most public subsystems (`config`, `sessions`, `scheduler`, `tool_executor`, `loop_manager`, `audit`, `agent_manager`, `reflector`, `skill_manager`, `permissions`, provider clients, `cost_tracker`, `subsystem_guard`, trajectory savers, `api_token_manager`, `host_access_manager`, `channel_config`, `context_loader`, `infra_watcher`, `outbound_webhook_dispatcher`, `model_router`, `startup_report`, `mcp_manager`, …) **and private internals** (`_embedder`, `_system_prompt`, `_cached_merged_tools`, `_cached_skills_text`, `_start_time`, `_codex_auth_pool`, `_issue_tracker_client`, `_llm_provider_lock`). Calls private methods: `_build_system_prompt`, `_invalidate_prompt_caches`, `_merged_tool_definitions`, `_run_loop_iteration`, `_reload_*_inner`. **Writes from outside:** `bot.config` (hot reload), `bot._system_prompt`, `bot._cached_merged_tools = None`, `bot._cached_skills_text = None` (~7 sites).
2. `health/checker.py` — 14 attrs, all via `getattr`; uses the **`knowledge`** and **`codex`** property aliases.
3. `__main__.py` — lifecycle: `start/close/is_ready/latency/get_channel` + defensive teardown of `scheduler`, `voice_manager`, `browser_manager`, `sessions`, `cost_tracker`, `trajectory_saver`, `loop_manager`, `infra_watcher`.
4. `web/chat.py` — calls `_build_system_prompt`, `_new_context_trace`, `_process_with_tools`, `_set_status`; reads `sessions`, `codex_client`; **creates `bot._web_channel_locks`**.
5. `monitoring/resource_usage.py` (4, via getattr), `health/server.py` (3), `web/websocket.py` (holds ref only), cogs (discord.py-native surface only).

Notably: `src/tools/`, `src/scheduler/`, `src/learning/`, `src/agents/` hold **no** bot reference — they already receive components. Decomposition inside the discord package cannot break them.

### 4.5 Test landscape (what the harness must replace/extend)

- **No shared bot fixture and no shared fake LLM exist.** Each test file builds its own `_make_bot()` and its own scripted `chat_with_tools` fake. `tests/conftest.py` provides only `odin_config` (a real pydantic `Config`) plus generic mocks.
- Tests call private methods directly (`bot._process_with_tools(...)` — `test_executor_integration_smoke.py:360`; `bot._codex_call(...)`:506; `bot._dispatch_loop_tool(...)`:588; `_run_loop_iteration` rebound onto a fake — `test_trajectory_completeness.py:329`). Moving/renaming these breaks call sites directly → the facade must also preserve **method** names tests use, or the phase updates those tests in the same PR.
- **`inspect.getsource` structural assertions** exist (`on_message`, `_handle_spawn_agent`, others in `test_executor_integration_smoke.py`, `test_trajectory_completeness.py`, `test_round30_reviewer.py`). These fail on any refactor even with identical behavior. Phase 0 defines the replacement policy (§8.4).
- Seam caveat: chat-loop tests patch `bot.codex_client.chat_with_tools`; loop tests fake `self.llm_client`. Both seams must keep working until tests are migrated to the shared fake.
- Closest existing prior art to build on: `test_trajectory_completeness.py`'s scripted-`LLMResponse` pattern, and `test_web_chat.py`'s fake `WebMessage`/`WebChannel`/`WebAuthor` discord objects.

### 4.6 Prior art already in the repo

The extraction idiom is established: `response_guards.py` (pure detectors + message constants), `tool_loop_helpers.py` (pure functions, 1:1 inline replacements), `background_task.py`/`attachments.py`/`voice.py` (classes with injected callbacks). This RFC continues that idiom rather than inventing a new one. `tool_loop_helpers.py`'s docstring records the standing verdict and the prerequisite: *"a full decomposition is too risky without an end-to-end harness."* Phase 0 is that harness.

---

## 5. Guiding principles

1. **Characterize before you move.** No production change lands before the behavior it touches is pinned by a test that survives the move.
2. **Strangler fig, not big bang.** One phase = one PR = one reviewable concern. Every phase leaves master releasable.
3. **Move-only vs. reshape, separated.** Within a phase, mechanical relocation (cut/paste + import fixes) and structural change (signature/DI changes) are separate commits, so the diff reviews as a move plus a small delta.
4. **Constructor injection, no service locator.** Extracted classes receive exactly the dependencies they use, by constructor. Nothing new reaches back into the bot god-object. (`message`-shaped objects are passed per-call, as today.)
5. **Stable facade.** `OdinBot` keeps every externally-referenced attribute and method as a real attribute or delegating property — including write paths and `hasattr` semantics (Appendix B is the contract; a facade contract test enforces it).
6. **Behavior identical, byte-identical where cheap.** Prompt text, message-list shapes, audit event fields, error strings, scrub/truncate behavior, and guard **ordering** are pinned. Known asymmetries (§4.3) are preserved, not "fixed."
7. **Hard rules honored structurally.** Anti-hedging guards, completion classifier, and response guards move only as opaque units; their logic and thresholds are untouched (repo hard rule #5). The guard cascade order — fabrication → promise → tool-unavailable → hedging → code-hedging → premature-failure → completion classifier — is pinned by a dedicated test.
8. **Every phase ends green.** Full suite (`pytest -q`, ~5,905 + new), `ruff check`, and the characterization suite unchanged (except explicitly-listed test migrations declared in the PR description).
9. **One phase in flight at a time.** Reduces rebase pain for parallel feature work and keeps Odin's review context small.

---

## 6. Target architecture

### 6.1 Module map (all new modules under `src/discord/` unless noted)

| Module | Class(es) | Responsibility | Est. LOC | Sourced from (baseline lines) |
|---|---|---|---|---|
| `wiring.py` | `BotServices` (typed dataclass), `build_services(config) → BotServices`, `shutdown_services(services)` | Composition root: construct/teardown the ~30 subsystems in dependency order | ~550 | 227–681, 1745–1963 |
| `channel_state.py` | `ChannelStateRegistry` | Owns the per-channel dicts (locks, cancel events, active request, pending files, processed-message dedup, bot buffers, recent actions, last op details) + their housekeeping | ~250 | scattered `__init__` fields, 1246–1342 |
| `prompts.py` | `PromptBuilder` | Full + chat system prompts; memory/hosts/skills caches; reflector section; invalidation | ~280 | 873–1245 (minus catalog), 981–988 |
| `tool_catalog.py` | `ToolCatalog` | Merged builtin+skill tool definitions, backend gating, cache + invalidation on skill CRUD | ~90 | 1216–1244 |
| `llm_gateway.py` | `LLMGateway` | Active-provider resolution; provider lock/switch/reloads; guarded `call_with_tools` (subsystem guard, model router, aux client, cost tracker); compaction/reflection callback wiring | ~330 | 682–872, 1490–1568 |
| `native_tools/` (package: `registry.py`, `scheduling.py`, `knowledge.py`, `agents_tasks.py`, `media.py`, `channel_ops.py`, `skills.py`) | `NativeToolDispatcher` + per-domain handler classes | The single dispatch registry for Discord-native tools; replaces both if/elif chains. Returns `(result, effects)` where effects carry the prompt-rebuild signal | ~900 total | 3226–3402, 3650–4037, 4149–4697, 5215–5459, 5037–5214, 1006–1074 |
| `delivery.py` | `ResponseDelivery` | `send_with_retry`, code-fence-aware chunking, long-response file fallback, pending-file attachment, presence/status | ~180 | 5689–5790, 1964–1983 |
| `completion.py` | `CompletionClassifier` | Classifier prompt (verbatim), `classify`, `parse_response`, start_loop short-circuit. **Boundary note (reviewer):** this is tool-loop policy machinery, not a general completion service — it stays private to `tool_loop.py` and must not grow into a second LLM gateway | ~120 | 2661–2766 |
| `tool_loop.py` | `ToolLoopRunner`, `LoopPolicy` | THE tool-execution pipeline: iteration loop, guard cascade application, stuck tracking, continuation budget, RBAC gate, parallel execution + timeouts, audit, trajectory, validation, vision injection, handoff, cancellation — parameterized by `LoopPolicy(chat)` / `LoopPolicy(autonomous)` per the §4.3 table | ~700 | 2768–3649 (P7), 4698–5214 (P8) |
| `intake.py` | `MessageIntake` | The `on_message` gating chain as named steps; bot-message buffering; attachment processing hook; voice-command shortcuts | ~330 | 2049–2347 |
| `pipeline.py` | `MessagePipeline` | Per-channel lock + thread inheritance; guest vs tool routing; skill handoff; history persistence + error sanitization; reflection dispatch; delivery invocation | ~350 | 2375–2660 |
| `scheduled_events.py` | `ScheduledEventHandlers` | Scheduler/digest/monitor callbacks, scheduled tool/workflow execution, mention resolution | ~380 | 4038–4148, 5460–5688 |
| `slash_commands.py` | `register_commands(bot, services)` | The 6 slash commands | ~110 | 1371–1461 |
| `turn_recorder.py` | `TurnRecorder`, `ReflectionDispatcher` | Trajectory create/save, context-trace creation, user-content recording, recent-action tracking, reflection triggers (chat + loop) | ~260 | 930–966, 1343–1370, 1579–1703 |
| *(existing)* `tool_loop_helpers.py`, `response_guards.py`, `background_task.py`, `attachments.py`, `voice.py` | — | Unchanged; detectors/messages stay the single source of truth | — | — |
| *(shrinks)* `client.py` | `OdinBot` | Discord adapter: intents, event handlers (3–10 lines each), cog loading, `setup_hook`/`on_ready`, facade properties (Appendix B), module-level helpers that must stay importable | ≤ ~900 | remainder |

### 6.2 Dependency direction

```
                       discord.py events
                              │
   ┌──────────────────────── OdinBot (adapter + facade) ────────────────────────┐
   │                                                                            │
   ▼                                                                            ▼
MessageIntake ──▶ MessagePipeline ──▶ ToolLoopRunner ◀── LoopManager callback   ScheduledEventHandlers
                        │              │  │  │  │                                      │
                        ▼              ▼  ▼  ▼  ▼                                      ▼
                 ResponseDelivery   LLMGateway  NativeToolDispatcher ──▶ (scheduler, sessions,
                        │              │        CompletionClassifier      skills, agents, knowledge…)
                        ▼              ▼        response_guards (existing)
                 ChannelStateRegistry  providers
                        ▲
   PromptBuilder ── ToolCatalog ── TurnRecorder ── wiring.BotServices (constructs everything)
```

Rules: arrows point downward only (adapter → orchestration → services); no extracted module imports `client.py`; only `client.py` and `wiring.py` know the whole object graph. `web/api.py` keeps talking to the facade.

### 6.3 Key interface sketches (signatures only — final shapes may be adjusted in-phase with reviewer sign-off)

```python
# wiring.py
@dataclass
class BotServices:
    config: Config
    sessions: SessionManager
    tool_executor: ToolExecutor
    skill_manager: SkillManager
    scheduler: Scheduler
    audit: AuditLogger
    permissions: PermissionManager
    host_access_manager: HostAccessManager
    reflector: ConversationReflector
    agent_manager: AgentManager
    loop_manager: LoopManager
    # ... every subsystem currently built in __init__, typed, in construction order
def build_services(config: Config) -> BotServices: ...
async def shutdown_services(services: BotServices, *, log: Logger) -> None: ...

# channel_state.py
class ChannelStateRegistry:
    def lock_for(self, channel_id: str) -> asyncio.Lock: ...
    def cancel_event(self, channel_id: str) -> asyncio.Event: ...
    def set_active_request(self, channel_id: str, req_id: str) -> None: ...
    def clear_active(self, channel_id: str, req_id: str) -> None: ...
    def add_pending_file(self, channel_id: str, data: bytes, filename: str) -> None: ...
    def pop_pending_files(self, channel_id: str) -> list[tuple[bytes, str]]: ...
    def seen_message(self, message_id: int) -> bool: ...          # dedup, bounded
    def track_recent_action(self, channel_id: str, entry: str) -> None: ...
    def recent_actions(self, channel_id: str) -> list[str]: ...
    def run_housekeeping(self, *, active_channels: set[str]) -> None: ...

# llm_gateway.py
class LLMGateway:
    @property
    def active_client(self): ...                                   # today's llm_client
    async def call_with_tools(self, *, messages, system, tools,
                              user_message="", user_id="", channel_id="",
                              tools_used=None, **kwargs) -> LLMResponse: ...  # today's _codex_call
    async def reload_codex(self) -> dict: ...
    async def reload_ollama(self) -> dict: ...
    async def reload_kimi(self) -> dict: ...
    async def switch_provider(self, provider: str) -> dict: ...
    def wire_callbacks(self) -> None: ...

# native_tools/registry.py
@dataclass
class NativeToolEffects:
    rebuild_system_prompt: bool = False        # replaces the `nonlocal system_prompt` mutation
    pending_image_block: dict | None = None    # analyze_image vision injection
class NativeToolDispatcher:
    def handles(self, tool_name: str) -> bool: ...
    async def dispatch(self, tool_name: str, tool_input: dict, *,
                       message: MessageLike, user_id: str) -> tuple[str | ToolResult, NativeToolEffects]: ...

# tool_loop.py
@dataclass(frozen=True)
class LoopPolicy:            # values per the §4.3 asymmetry table
    guards: bool
    completion_classifier: bool
    stuck_tracking: bool
    preamble: bool
    context_compression: bool
    typing_indicator: bool
    cancellation: bool
    validation_enforcement: bool
    vision_injection: bool
    llm_via_gateway: bool    # chat=True, autonomous=False (preserved asymmetry)
    audit_event_style: Literal["chat", "loop"]
    iteration_cap_key: Literal["chat", "loop"]
    trajectory_source: str
CHAT_POLICY: LoopPolicy
AUTONOMOUS_POLICY: LoopPolicy
class ToolLoopRunner:
    async def run(self, *, message: MessageLike, history: list[dict],
                  system_prompt: str, policy: LoopPolicy,
                  trace=None) -> ToolLoopResult: ...   # (text, already_sent, is_error, tools_used, handoff)

# MessageLike: typing.Protocol documenting the duck-type contract that
# discord.Message, _LoopMessageProxy, VoiceMessageProxy, and web WebMessage
# already satisfy (author.id/display_name/bot, channel.id/send/typing,
# id, webhook_id, content, attachments?).
```

### 6.4 The facade after decomposition

`OdinBot` retains, as thin delegators: every subsystem attribute (assigned from `BotServices` — flat attributes, so `getattr`/`hasattr` behavior is unchanged), the `codex`/`knowledge` properties with setters, provider reload/switch methods, `_build_system_prompt`, `_merged_tool_definitions`, `_invalidate_prompt_caches`, `_new_context_trace`, `_set_status`, `_process_with_tools`, `_run_loop_iteration`, `_codex_call`, `_dispatch_loop_tool`, and property-with-setter shims for `_system_prompt`, `_cached_merged_tools`, `_cached_skills_text` (because `web/api.py` writes them). Late-bound attributes (`startup_report`, `_web_channel_locks`, `mcp_manager`, …) remain late-bound. Appendix B is the normative list; a facade contract test asserts it.

---

## 7. Migration phases

Each phase: **one PR**, full suite + characterization green, ruff clean, Odin review, squash-merge, independently revertable (`git revert` of the merge). Estimated diff sizes exclude generated churn (import blocks).

| Phase | Title | Contents | Risk | Est. diff |
|---|---|---|---|---|
| **P0** | Characterization harness | Tests only, no `src/` change. §8 in full: shared fakes (`FakeLLM`, fake discord objects, `make_bot`), ~35 golden-flow scenarios, guard-order pin, asymmetry-table pins, facade contract test, getsource-replacement policy | None to prod | +1,500–2,000 test LOC |
| **P1** | Composition root | `wiring.py`: `BotServices` + `build_services` + `shutdown_services`. `__init__` 455→~80 (intents, super().__init__, services attach, prompt build, command registration); `close()` delegates teardown. Pure move | Low | ~1,100 moved |
| **P2** | Channel state registry | `channel_state.py`; the 8 per-channel dicts + `_cleanup_stale_caches`/`_maybe_cleanup_caches` become `ChannelStateRegistry` + `run_housekeeping`; call sites re-pointed mechanically. Facade keeps old attr names delegating to the registry (tests/api read some) | Low-med (many call sites, all mechanical) | ~600 |
| **P3** | Prompt builder + tool catalog | `prompts.py`, `tool_catalog.py`; facade property-with-setter shims for `_system_prompt`/`_cached_*`; `_build_system_prompt`/`_build_chat_system_prompt`/`_merged_tool_definitions` delegate | Low | ~700 |
| **P4** | LLM gateway | `llm_gateway.py`; `_codex_call` → `gateway.call_with_tools` (facade method retained); reloads/switch/wire_callbacks move; provider lock/counters live in gateway; `llm_client` property delegates | Med (lock semantics — move-only, no logic change) | ~600 |
| **P5** | Native tool dispatch registry | `native_tools/` package; all `_handle_*` handler bodies move into domain classes; **both** if/elif chains replaced by `NativeToolDispatcher`; `nonlocal system_prompt` → `NativeToolEffects.rebuild_system_prompt`; skill-CRUD cache invalidation centralized in dispatcher. **Two commits mandatory:** (1) move handlers + registry, zero behavior change; (2) swap chat + loop dispatch to the registry. **Declared escape hatch:** if the diff exceeds reviewable size, split into P5a (registry + chat dispatch swap) and P5b (loop dispatch parity) | Med-high (largest semantic surface — reviewer-flagged sleeper risk: prompt rebuild, pending files, image effects, skill callbacks, ToolResult failure visibility) | ~1,600 (mostly moves) |
| **P6** | Delivery | `delivery.py`; `_send_with_retry`/`_send_chunked`/status; pending files via `ChannelStateRegistry` | Low | ~300 |
| **P7** | ToolLoopRunner (chat) | `tool_loop.py` + `completion.py`; `_process_with_tools` becomes `runner.run(policy=CHAT_POLICY)` behind the facade; the 855-line coroutine decomposes into ~10 named methods (setup, filter_tools, iterate, call_llm, apply_guards, execute_calls, record_iteration, handle_validation, finalize) | **High** — mitigated by P0 pins + P5 having already extracted dispatch | ~1,100 |
| **P8** | Autonomous-loop unification | `_run_loop_iteration` reimplemented as `runner.run(policy=AUTONOMOUS_POLICY)`; `_dispatch_loop_tool_inner` deleted (registry already serves both since P5); ~490 duplicated lines deleted. Acceptance = every §4.3 row demonstrated by a passing pinned test. **Scope constraint (review condition):** policy wiring + duplicate deletion ONLY — no handler moves, no guard changes, no gateway changes, no drive-by cleanup | **High** — the one phase with real semantic-drift risk; extra review depth requested | ~900 (net −400) |
| **P9** | Intake + pipeline | `intake.py` + `pipeline.py`; `on_message` → gating chain (named predicate methods, order pinned by P0); `_handle_message`/`_handle_message_inner` → `MessagePipeline`; `OdinBot.on_message` becomes ~10 lines | Med | ~900 |
| **P10** | Scheduled events, slash commands, final sweep | `scheduled_events.py`, `slash_commands.py`, `turn_recorder.py` consolidation; dead-code removal; `client.py` final ≤ ~900 lines; docs: `CONTRIBUTING.md` pointer, architecture-memory update; final metrics report vs §10 | Low | ~800 |

**Ordering rationale.** P1–P6 are low-to-medium-risk moves that shrink the blast radius and build the injection points; the two genuinely risky phases (P7, P8) land on a fully-pinned harness with dispatch already externalized; orchestration (P9) extracts last because it depends on delivery, runner, and state registry as injectables; P10 is cleanup. Dependencies: P2 requires P1; P5 requires P2 (pending files) and P3 (catalog invalidation); P7 requires P4+P5+P6; P8 requires P7; P9 requires P6+P7.

**Execution model (R2, per Aaron 2026-07-04 — supersedes the per-phase release mapping below).** The campaign runs on a long-lived integration branch **`refactor/client-decomposition`** cut from master `081e231`. Each phase is a PR from a phase branch (`refactor/client-p<N>-<slug>`) **into the campaign branch**; Odin reviews every phase PR before it merges (hard rule unchanged). **Master is not touched and the release pipeline is not run during the campaign.** After P10, the completed branch is deployed to a local test instance retaining all live data (Codex auth, API tokens, `memory.json`, `learned.json`, knowledge store — standard deploy discipline) and soak-tested extensively with Odin running under the new code; only after that soak does Aaron decide on the final master merge + release pipeline. To prevent drift, master hotfixes landed mid-campaign are merged master → campaign branch as they occur.

*(Original per-phase release mapping, retained for reference but inactive under R2:)* Phases are releasable individually (patch bumps); suggested cadence was deploy after P1–P2, P5, P7, P8, P10, observing audit/trajectory output after each. Any phase can pause the campaign indefinitely without leaving debt: every intermediate state is a coherent, shippable architecture — this property still holds on the campaign branch.

---

## 8. Testing strategy

### 8.1 Phase 0 harness components (all shared, in `tests/`)

1. **`tests/fakes/llm.py` — `FakeLLM`**: scripted sequence of `LLMResponse` objects (text / tool_calls / parse_error / token counts), records every `chat_with_tools`/`chat` invocation (messages, system, tools) for shape assertions. Installable at **both** existing seams (`bot.codex_client` and the `llm_client` property path) until tests migrate.
2. **`tests/fakes/discord_objects.py`**: `FakeMessage`/`FakeChannel`/`FakeAuthor`/`FakeThread` (promotion of the `test_web_chat.py` pattern), satisfying the `MessageLike` Protocol; records `send`/`reply`/`typing` calls.
3. **`tests/fakes/bot_factory.py` — `make_bot(config_overrides, *, fake_llm)`**: the one blessed way to build a real `OdinBot` for tests (today re-implemented per file).
4. **Golden-flow characterization tests** (~35 scenarios): plain chat reply; single tool → final text; multi-tool parallel execution; multi-iteration with tool results fed back; **exact message-list shape** per iteration (preamble placement, assistant tool_use blocks, tool_result pairing); each of the 6 guards firing and retiring (order pinned); completion classifier INCOMPLETE → continuation (≤3); validation `[AUTO-VALIDATE]` injection + enforcement + retry cap; stuck-loop warn → terminate; `/stop` at each checkpoint; iteration-cap exit text; LLM API error path; CircuitOpenError wait-retry; RBAC denial result; skill handoff; skill-CRUD system-prompt rebuild; vision injection; guest chat route; thread context inheritance; secret scrub (both on_message sites); bot-message buffering + mention gate; error-path history sanitization; session persistence on success/error; autonomous-loop iteration (natural finish, cap-hit error, tool error recovery, reflection gating); scheduled check/workflow/reminder/digest; delivery chunking (fences, long-line pre-split, >4× file fallback, pending-file attach); `_send_with_retry` retry/backoff. **Added per Odin review (R1):** parse-error tool call (provider JSON-parse failure → "tool was NOT executed" bounce) in **both** chat and loop paths; `ToolResult(ok=False)` failure-visibility wrapping preserved verbatim in both paths; `invoke_skill` with missing required input fields; skill-CRUD prompt rebuild in **both** paths; pending-file delivery after `export_skill`/`generate_file` including janitor cleanup of leaked files; loop-path `CircuitOpenError` **re-raise** (vs chat wait-retry) specifically; cancellation clears `_active_request_by_channel` only for its **own** request id; scheduled-workflow `on_failure: continue` semantics; web-chat route through `_process_with_tools` (the facade's highest-value consumer — historically where "works in Discord, broke in WebUI" hides).
5. **Facade contract test**: asserts every Appendix B name exists (attribute, property, or method; settable where marked) on a constructed bot — the tripwire for accidental external breakage.
6. **Asymmetry pins**: one test per §4.3 row that can drift silently (e.g. "autonomous loop performs no guard retries", "loop cap returns is_error=True with failure_class=cancelled", "loop LLM call bypasses cost tracking").

### 8.2 Per-phase testing
- Move phases (P1–P6, P9–P10): characterization suite must pass **unmodified**. New unit tests accompany each extracted class (constructor-injected fakes, no Discord).
- P7/P8: characterization suite passes unmodified; new unit tests for `ToolLoopRunner` cover each policy flag both ways; P8 additionally demonstrates the full asymmetry table.
- Coverage gate: each new module ≥ 85% line coverage at introduction (soft, reviewer discretion).

### 8.3 What characterization pins deliberately do NOT cover
Timing-sensitive behavior (bot-buffer 2s delay uses fake-clock/short-delay injection), real Discord API semantics, real LLM output. These stay integration-tested by the existing live deployment discipline.

### 8.4 `inspect.getsource` assertion policy
Structural source assertions are replaced **in the same PR that moves the asserted code**, with a behavioral equivalent from the P0 suite (e.g. "on_message calls process_commands after scrub" → a FakeMessage-driven ordering test). Each replacement is listed in the PR description. No getsource assertion is deleted without a named replacement.

---

## 9. Risk register

| # | Risk | Phase | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R1 | Hidden state coupling missed in a move (a method reads a dict another cluster mutates) | P2–P9 | Med | Prod bug | ChannelStateRegistry extracted early; per-move grep audit of every touched attribute; characterization shapes |
| R2 | `web/api.py` breakage via private attr/method (incl. its **writes**) | P3, P4, P7 | Med | WebUI/API outage | Facade property-with-setter shims; facade contract test; grep `bot\.` in web/ per phase |
| R3 | Guard/classifier behavior drift (hard-rule violation) | P7 | Low | Trust/safety regression | Guards move as opaque imports (already in `response_guards.py`); order + retry-once semantics pinned; no threshold edits permitted in campaign |
| R4 | Chat/loop unification silently changes loop behavior | P8 | Med-high | Autonomous-loop regressions | §4.3 table = acceptance checklist; per-row pinned tests; deepest-review request to Odin; deploy alone + observe |
| R5 | asyncio semantics change (CancelledError cleanup, gather, typing CM, fire_and_forget lifetimes, `nonlocal` → effects) | P7–P9 | Med | Hangs/leaks | Move-only commits keep exact structures; dedicated cancellation tests at each checkpoint; effects object is same-iteration, same-ordering |
| R6 | Test-suite churn explodes PR size (tests import privates) | all | High (known) | Review fatigue | P0 shared fixtures land first; per-phase test migration is enumerated in PR body; facade keeps method names so most tests keep passing untouched |
| R7 | Parallel feature work conflicts with a phase in flight | all | Med | Rebase pain | One phase in flight; phases sized to merge within a day or two of opening; feature PRs touching client.py rebase after |
| R8 | Reviewer bandwidth (Odin reviews every PR) | all | Med | Schedule slip | Phases are single-concern; move-only commits reviewable as renames; this RFC pre-agrees the shape so per-PR review is delta-only |
| R9 | Deploy regression not caught by suite | after deploys | Low | Prod incident | Existing discipline: deploy → diff 3 files → drive real Discord + WebUI flows; audit.jsonl + trajectories checked after each phased deploy |
| R10 | Campaign stalls mid-way | any | Low | Half-done state | Every phase is a coherent stopping point; no phase leaves dual implementations behind (P5 swaps both dispatch sites in one PR; P8 deletes the duplicate loop in the same PR that re-bases it) |

---

## 10. Success metrics / Definition of Done

Campaign-level (measured at P10, reported against baseline `081e231`):
1. `src/discord/client.py` ≤ ~900 lines (baseline 5,790); no method > ~120 lines remains in it.
2. No new module exceeds ~900 lines; every new class constructible in a unit test with fakes only (no gateway, no LLM, no filesystem beyond tmp).
3. Exactly **one** tool-execution pipeline and **one** native-tool dispatch table exist (`grep`-provable: no `elif tool_name ==` chains outside `native_tools/registry.py`).
4. The ~490-line autonomous-loop duplicate is deleted; net repo LOC delta for src/ ≈ +300 or better (moves + interfaces − duplication).
5. Facade contract test green; `web/api.py`, `web/chat.py`, `health/checker.py`, `__main__.py`, cogs unmodified throughout (except if a phase PR explicitly includes a mechanical import fix, called out in its description).
6. Test count strictly ≥ baseline 5,905 + P0 additions; characterization suite unmodified from P0 through P10 except the declared getsource replacements and per-phase migrations enumerated in PR bodies.
7. Full suite runtime within +10% of baseline (guards against fixture bloat).
8. Zero live regressions attributable to the campaign after each phased deploy (audit + trajectory review, real-flow smoke).
9. Docs updated: `CONTRIBUTING.md` module-map pointer, this RFC marked COMPLETED with final numbers, architecture memory updated.

Per-phase DoD: suite + ruff + characterization green; PR body lists moved symbols, migrated tests, and replaced getsource assertions; Odin approval; squash-merge; revert path stated.

---

## 11. Alternatives considered

1. **Big-bang rewrite of client.py** — Rejected. Unreviewable diff (5.8K lines in flight), guaranteed guard-behavior drift, violates the PR-review process that exists precisely because unreviewed changes shipped bugs.
2. **Hexagonal/framework-free core first** (abstract away `discord.Message` everywhere) — Rejected for this campaign. The duck-type boundary already exists and works (`_LoopMessageProxy`, `VoiceMessageProxy`, web `WebMessage`); a full port roughly doubles the churn for zero user-visible value and multiplies R3/R5. Formalizing `MessageLike` as a Protocol captures 80% of the benefit; a true port remains available later precisely because this campaign shrinks the surface.
3. **Continue nibbling with pure-function helpers** (the `tool_loop_helpers.py` path) — Rejected as the only strategy. Two campaigns of it produced 84 lines while the file grew past 5,700; it cannot touch the duplication or the state coupling, which is where the bugs live.
4. **Decompose by moving whole clusters to other existing packages** (e.g. scheduler callbacks into `src/scheduler/`) — Rejected. Those packages are deliberately bot-free (§4.4); moving Discord-flavored orchestration into them would invert the current clean dependency direction.
5. **Do nothing** — Rejected by the standing failure-mode record and by the reviewer's own prior verdict.

---

## 12. Rollout & governance

- **Approval gates.** This RFC needs Odin's review (this request) and Aaron's direction approval. Then **each phase separately** goes through the normal per-file-change-list approval with Aaron before any code is written, followed by branch → PR (into the campaign branch, per R2) → Odin review → merge. RFC approval is not approval to code.
- **Branch/PR conventions.** Branches `refactor/client-p<N>-<slug>`; PR titles `refactor(client): P<N> — <title>`; PR body links this RFC section, lists moved symbols, migrated tests, replaced getsource assertions, and the revert command. No `Co-Authored-By` lines. Public-repo hygiene applies to all text.
- **Cadence.** One phase in flight; target one phase per working session. Deploys per §7 release mapping with post-deploy verification per house rules.
- **Change control on this doc.** Material deviations discovered mid-phase (a hidden coupling, a needed signature change) are recorded as an amendment section in this file **before** the deviating PR merges, so the RFC stays the source of truth.
- **Out-of-scope findings.** Any live bug found while characterizing (P0 is the likeliest place) is filed as its own issue and fixed in its own PR — never folded into a move phase.

---

## Appendix A — Method-to-module mapping (all `OdinBot` methods + module-level defs)

Legend: target modules are §6.1 names. "facade" = a delegating stub remains on `OdinBot`.

| Baseline lines | Symbol(s) | Target |
|---|---|---|
| 94–104 | `_scrub_tool_input_for_storage` | `turn_recorder.py` (re-exported from `client.py` for compat) |
| 107–131 | `_LoopMessageProxy`, `_LoopAuthorProxy` | `tool_loop.py` (used by autonomous policy; re-exported) |
| 133–153 | `_RESPONSE_EXTRA_PATTERNS`, `scrub_response_secrets` | `delivery.py` (re-exported — `__main__.py` imports it) |
| 174–190 | `truncate_tool_output` | `tool_loop.py` (re-exported — tests import it) |
| 193–223 | `combine_bot_messages` | `intake.py` (re-exported — tests import it) |
| 227–681 | `__init__` (subsystem construction + state fields) | `wiring.py` (`build_services`); state fields → `channel_state.py`; residual ~80-line `__init__` stays |
| 682–716 | `llm_client` property, `_wire_llm_callbacks`, `_wire_codex_callbacks` | `llm_gateway.py` + facade property |
| 720–847 | `_reload_codex_inner`, `reload_codex_auth`, `_reload_ollama_inner`, `reload_ollama`, `_reload_kimi_inner`, `reload_kimi`, `switch_llm_provider` | `llm_gateway.py` + facade methods (api.py calls all of them) |
| 855–871 | `codex` / `knowledge` properties (+setters) | stay on facade (delegate to services) |
| 873–878 | `_init_allowed_webhook_ids` | `intake.py` (owns the webhook-allowlist gate) |
| 880–894 | `_log_startup_config` | `wiring.py` |
| 896–928 | `_get_cached_hosts`, `_get_cached_skills_text`, `_get_cached_memory` | `prompts.py` |
| 930–965 | `_record_user_content`, `_new_context_trace` | `turn_recorder.py` + facade for `_new_context_trace` (web/chat calls it) |
| 967–987 | `_get_reflector_section`, `_invalidate_prompt_caches` | `prompts.py` + facade for `_invalidate_prompt_caches` (api.py calls it) |
| 989–1004 | `_invoke_skill_missing_required` | `native_tools/skills.py` |
| 1006–1074 | `_validate_schedule_payload`, `_extract_tool_input_from_steps` | `native_tools/scheduling.py` |
| 1076–1214 | `_build_system_prompt`, `_build_chat_system_prompt` | `prompts.py` + facade (api.py, web/chat call them) |
| 1216–1244 | `_merged_tool_definitions` | `tool_catalog.py` + facade (api.py calls it) |
| 1246–1341 | `_cleanup_stale_caches`, `_maybe_cleanup_caches` | `channel_state.py` (`run_housekeeping`) |
| 1343–1369 | `_track_recent_action` | `channel_state.py` (storage) + `turn_recorder.py` (formatting) |
| 1371–1460 | `_register_commands` | `slash_commands.py` |
| 1462–1477 | `_is_cancelled`, `_is_allowed_user`, `_is_allowed_channel`, `_check_for_secrets` | `intake.py` (gating) / `channel_state.py` (`_is_cancelled`) |
| 1483–1488 | `_resolve_prefix` | stays (commands.Bot contract) |
| 1490–1568 | `_codex_call` | `llm_gateway.py` (`call_with_tools`) + facade (tests call it) |
| 1572–1663 | `_REFLECT_*` consts, `_should_reflect_on_operation`, `_maybe_loop_reflect`, `_operational_reflection` | `turn_recorder.py` (`ReflectionDispatcher`) |
| 1665–1689 | `_save_turn_trajectory` | `turn_recorder.py` |
| 1691–1702 | `_emit_lifecycle_event` | `turn_recorder.py` (dispatcher injected) |
| 1704–1743 | `setup_hook` | stays (delegates diagnostics/chain-init to wiring helpers) |
| 1745–1963 | `close` | stays as ~20 lines delegating to `wiring.shutdown_services` |
| 1964–1982 | `_set_status` | `delivery.py` + facade (web/chat calls it) |
| 1984–2004 | `on_ready` | stays |
| 2006–2021 | `_backfill_archives` | `wiring.py` (startup task) |
| 2023–2047 | `on_voice_state_update` | stays (delegates to voice manager) |
| 2049–2296 | `on_message` | stays as thin handler → `intake.py` chain |
| 2298–2346 | `_process_attachments` | `intake.py` |
| 2348–2373 | `_on_voice_transcription` | `intake.py` (voice entry) |
| 2375–2421 | `_handle_message` | `pipeline.py` (lock + thread inheritance) |
| 2423–2659 | `_handle_message_inner` | `pipeline.py` |
| 2661–2766 | `_CLASSIFIER_SYSTEM_PROMPT`, `_classify_completion`, `_parse_classifier_response` | `completion.py` |
| 2768–3622 | `_process_with_tools` | `tool_loop.py` (`ToolLoopRunner`, CHAT_POLICY) + facade (web/chat + tests call it) |
| 3624–3648 | `_ensure_failure_visible`, `_detect_image_type` | `tool_loop.py` / `native_tools/media.py` |
| 3650–3688 | `_handle_purge`, `_handle_browser_screenshot`, `_handle_generate_file` | `native_tools/channel_ops.py` / `media.py` |
| 3690–3764 | `_handle_post_file` | `native_tools/media.py` |
| 3766–3876 | schedule CRUD handlers + `_handle_parse_time` | `native_tools/scheduling.py` |
| 3878–3987 | history/knowledge handlers | `native_tools/knowledge.py` |
| 3989–3999 | `_handle_set_permission` | `native_tools/channel_ops.py` |
| 4001–4036 | `_handle_search_audit` | `native_tools/knowledge.py` |
| 4038–4123 | `_on_scheduled_digest`, `_format_digest_raw`, `_resolve_mentions` | `scheduled_events.py` |
| 4125–4147 | `_on_monitor_alert` | `scheduled_events.py` |
| 4149–4342 | delegate/tasks/loops handlers | `native_tools/agents_tasks.py` |
| 4344–4696 | spawn/collect agent handlers | `native_tools/agents_tasks.py` |
| 4698–5007 | `_run_loop_iteration` | deleted in P8; facade method delegates to runner (api.py calls it) |
| 5009–5213 | `_dispatch_loop_tool`, `_dispatch_loop_tool_inner` | P5: registry; P8: inner deleted; `_dispatch_loop_tool` facade retained (tests call it) |
| 5215–5334 | `_handle_read_channel`, `_handle_add_reaction`, `_handle_create_poll` | `native_tools/channel_ops.py` |
| 5336–5458 | `_handle_analyze_image`, `_handle_generate_image` | `native_tools/media.py` |
| 5460–5687 | `_execute_scheduled_tool`, `_run_scheduled_workflow`, `_on_schedule_failure`, `_on_scheduled_task` | `scheduled_events.py` |
| 5689–5790 | `_send_with_retry`, `_send_chunked` | `delivery.py` |

## Appendix B — Facade contract (must exist on `OdinBot` throughout)

**Subsystem attributes** (flat, preserving `getattr`/`hasattr` semantics): `config`*, `sessions`, `scheduler`, `tool_executor`, `skill_manager`, `loop_manager`, `audit`, `agent_manager`, `reflector`, `channel_config`, `channel_logger`, `context_loader`, `infra_watcher`, `voice_manager`, `browser_manager`, `permissions`, `host_access_manager`, `api_token_manager`, `cost_tracker`, `subsystem_guard`, `audit_signer`, `diff_tracker`, `model_router`, `context_compressor`, `prefix_tracker`, `auxiliary_llm_client`, `outbound_webhook_dispatcher`, `trajectory_saver`, `agent_trajectory_saver`, `loop_agent_bridge`, `codex_client`*, `ollama_client`*, `kimi_client`*, `stuck_loop_tracker_cls`, `classify_command_risk`, `classify_tool_risk`.
**Properties:** `llm_client`, `codex` (get+set), `knowledge` (get+set).
**Private attrs consumed externally** (property-with-setter where written*): `_system_prompt`*, `_cached_merged_tools`*, `_cached_skills_text`*, `_embedder`, `_knowledge_store`, `_start_time`, `_llm_provider_lock`, `_memory_path`, `_recent_actions` (tests), `_pending_files` (tests), `_channel_locks` (tests), `_cancel_events` (tests), `_last_op_details` (tests).
**Late-bound (must remain absent until set):** `startup_report`, `_web_channel_locks`, `mcp_manager`, `_codex_auth_pool`, `_issue_tracker_client`, `compression_stats`, `health_server`.
**Methods:** `reload_codex_auth`, `reload_ollama`, `reload_kimi`, `switch_llm_provider`, `_reload_codex_inner`, `_reload_ollama_inner`, `_reload_kimi_inner`, `_build_system_prompt`, `_build_chat_system_prompt`, `_invalidate_prompt_caches`, `_merged_tool_definitions`, `_new_context_trace`, `_set_status`, `_process_with_tools`, `_run_loop_iteration`, `_codex_call`, `_dispatch_loop_tool`, `_emit_lifecycle_event`, `_classify_completion` (+ `_CLASSIFIER_SYSTEM_PROMPT` class attr — tests), `_is_allowed_user`, `_is_cancelled`.
**Module-level re-exports from `client.py`:** `OdinBot`, `INITIAL_EXTENSIONS`, `scrub_response_secrets`, `truncate_tool_output`, `combine_bot_messages`, `DISCORD_MAX_LEN`.

**Internal-only (negative contract):** zero external references on baseline (grep-verified) — `_active_request_by_channel`, `_processed_messages`, `_processed_messages_max`, `_bot_msg_buffer`, `_bot_msg_tasks`, `_bot_msg_buffer_delay`, `_bot_msg_buffer_max`, `_cached_hosts`, `_memory_cache`, `_memory_cache_ttl`, `_llm_active_requests`, `_llm_switching`. These move behind `ChannelStateRegistry` / `LLMGateway` / `PromptBuilder` with **no** facade shims. P0 adds a grep-backed contract test asserting no code outside the discord package references them, so nothing starts reaching into them while the corpse is open.

*(Starred = written from outside; see §4.4.)*

---

## Review checklist for Odin

1. §4 — anything factually wrong vs. current master? (Line refs are against `081e231`.)
2. §4.3 — is the asymmetry table complete? Any chat/loop difference missing that unification could silently erase?
3. §6 — module boundaries and dependency direction: would you cut anywhere differently?
4. §7 — phase ordering/sizing: anything you'd split, merge, or resequence? Is P8 acceptable as a single PR?
5. Appendix B — anything you know reaches into `OdinBot` that isn't listed?
6. §8 — is the characterization scenario list missing a flow you'd want pinned before we touch the loop?
7. Verdict: **approve as-is / approve with changes (list them) / revise and resubmit**.

*This is a plan review only — do not implement, branch, or open PRs for any part of this yet.*

---

## Revision log

- **R1 (2026-07-04)** — Odin review verdict: **approve with changes**; all requested changes applied:
  - Corrected method-count headline to AST-measured values (111 direct `OdinBot` methods / 151 module-wide defs) and adopted reviewer-verified method lengths (855 / 310 / 177 / 84). Both independently re-verified before amending.
  - Added 6 asymmetry rows to §4.3 (return contract, `/stop` bookkeeping, op-details, status labels, `analyze_image` shape invariant, trace/recovery semantics).
  - §6.1: `completion.py` boundary note (tool-loop policy machinery, not a second gateway).
  - §7: P5 two-commit structure + declared P5a/P5b escape hatch; P8 scope constraint (policy wiring + duplicate deletion only).
  - §8.1: 9 additional characterization scenarios.
  - Appendix B: internal-only negative contract (12 names, grep-verified zero external refs) + grep-backed contract test in P0.
  - getsource replacement policy retained unchanged (reviewer: "correct — keep it").
- **Approval (2026-07-04)** — Odin re-reviewed R1 and **approved** the doc as the campaign plan of record: *"No remaining plan-level blockers. Next step is Phase 0 as its own PR, with the characterization harness doing the heavy lifting before anyone starts carving into the corpse."*
- **R2 (2026-07-04)** — Execution model set by Aaron (direction approval): long-lived campaign branch `refactor/client-decomposition`; phase PRs merge into it with Odin review each; **no master merge, no release pipeline, no live deploy during the campaign**; post-P10 local soak test with all live data retained, then the pipeline decision. §7 execution-model paragraph updated; original per-phase release mapping retained inactive.
- **R4 (2026-07-04)** — P5b delivered 4 of 5 handler domains (scheduling, knowledge, channel-ops, media — 31 of the 46 handled tools). The **agents/tasks/loops domain is deferred to a P5c rider after P8**: its handlers close over the loop pipeline itself (`_handle_start_loop` → `_run_loop_iteration`, `delegate_task` → `llm_client`, spawn/collect → trajectory + lifecycle plumbing), which P7/P8 restructure — moving them first would mean moving them twice across the campaign's riskiest phases. Dispatch is unaffected (the table resolves them late on the host either way).
- **R3 (2026-07-04)** — P5 executed via the declared escape hatch, **restructured**: P5a = the single `NativeToolDispatcher` table + BOTH chain swaps + `NativeToolEffects` + centralized skill-CRUD invalidation, with handler bodies remaining OdinBot methods registered by attribute name (late-bound at dispatch, preserving the historical `self._handle_X` lookup semantics and the test patch seam). P5b = mechanical relocation of handler bodies into `native_tools/` domain modules behind the same attribute names, dispatch untouched. Rationale: the semantic risk Odin flagged lives entirely in the swap; landing it first with the characterization suite green isolates that risk from the 1,200-line body move. The original "two commits in one PR" mandate maps onto the two PRs. Additional P5a decisions: RBAC checks stay in the callers verbatim (dispatcher does not re-check); executor fallthrough stays caller-side (chat needs the structured ToolResult, the loop wraps it); skill file delivery is a dispatch-time policy (`send` = chat, `stage` = loop, `export_skill` stages in both — matching baseline).
