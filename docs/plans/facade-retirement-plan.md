# RFC-002: Facade Retirement — Completing the Client Decomposition

**Status:** DRAFT — awaiting Odin review
**Author:** Claude (with Aaron's directive)
**Reviewer:** Odin
**Depends on:** RFC-001 (client decomposition, shipped v3.45.0)
**Branch:** `refactor/facade-retirement` (isolated; no master merge without explicit sign-off)

## 1. Motivation

RFC-001 decomposed the 5,790-line `client.py` monolith into 14 focused modules, deliberately preserving the OdinBot **interface** as a compatibility facade (Appendix B contract). Three debts were scoped out on purpose and are now due:

1. **The facade itself.** `client.py` (1,267 lines) is ~60% pure delegates and property shims: ~80 one-line delegate methods, ~10 property pairs, 6 dict aliases. They exist because `src/web/api.py` reads/writes 36 distinct bot attributes (incl. privates), `src/web/chat.py` 7, `slash_commands.py` 15, and the native dispatch table resolves handlers on the bot. The god-object's *interface* survives even though its implementation moved out.
2. **Host coupling.** Five extracted classes still take the whole bot as `host`: `ToolLoopRunner` (28 distinct bot attrs), `MessageIntake`/`MessagePipeline` (29), `AgentTaskTools` (19), `ScheduledEventHandlers` (13), `TurnRecorder` (6). RFC-001 called this "the honest statement of today's coupling — a stepping stone." The end-state pattern (narrow constructor deps) is already proven by `PromptBuilder`, `LLMGateway`, `ResponseDelivery`, `CompletionClassifier`, `ChannelStateRegistry`, and the four tool-domain classes.
3. **The deferred seam-carve.** `tool_loop.py`'s `run()` is 800 lines (158–957); `run_autonomous()` 348; the `_run_tool` closure alone 163. RFC-001 R5/R8 deferred carving until the terrain stabilized. It has.

Non-goals: **zero behavior change**, no endpoint schema changes, no new features, no new LoopPolicy dimensions (§4.3 asymmetries stay pinned), pre-existing lint debt untouched, no weakening of response guards / completion classifier / anti-hedging (hard rule), no master merge without Aaron's sign-off.

## 2. Current-state inventory (measured 2026-07-05, master @ 2e40c47)

**Consumers of the bot facade:**

| Consumer | Distinct attrs | Notable |
|---|---|---|
| `src/web/api.py` (4,155 ln) | 36 | writes `config`, `_system_prompt`, `_cached_merged_tools` ×8, `_cached_skills_text` ×5 |
| `src/web/chat.py` (288 ln) | 7 | `_process_with_tools`, lazily creates `bot._web_channel_locks` |
| `src/health/server.py` | 1 | `bot.audit` only |
| `src/discord/slash_commands.py` | 15 | `_system_prompt`, `_cancel_events`, provider clients |
| `src/__main__.py` | ~8 | all getattr-guarded, all public flat names — **unaffected** |
| cogs / views / voice / helpers | 0 non-discord | genuine `discord.Client` surface only — **unaffected** |

**Test exposure of facade names** (grep, whole suite): ~120 total uses across ~25 files. Largest: `bot.knowledge` 72 uses/4 files, `bot._handle_message` 30/2 (both characterization files owned by this campaign), `bot.codex` 24/2, `bot.codex_client` 16/6, `bot._process_with_tools` 13/4. Everything else ≤8 uses. Full deletion is tractable; no compatibility properties need survive for test-suite reasons.

**Runtime-mutated state** (constrains the design — these must stay live-readable):
- `bot.config` — replaced wholesale by `PUT /api/config`. Stays a bot attr; all components already read it via `get_config` providers.
- `bot._system_prompt` — rebuilt by 3 api.py sites after config/context changes. Moves into `PromptBuilder` as owned state with a `rebuild_default()` API.
- `_cached_merged_tools` / `_cached_skills_text` — nulled at 13 api.py sites. Already property shims over `ToolCatalog.cached` / `PromptBuilder.cached_skills_text`; sites collapse to `invalidate()` calls.
- `codex_client`/`ollama_client`/`kimi_client` — replaced by live reloads. Already gateway-owned; property shims die, spellings become `bot.llm_gateway.<client>`.
- `bot._web_channel_locks` — web-owned state parked on the bot. Moves to aiohttp app state.

**Late-import circularity to dissolve:** `tool_loop.py` and `intake_pipeline.py` late-import `_ALLOWED_WEBHOOK_IDS`, `_EMPTY_RESPONSE_FALLBACK`, `_scrub_tool_input_for_storage` from `client.py`. `client.py` also carries duplicate copies of `combine_bot_messages`/`truncate_tool_output`/`scrub_response_secrets` whose canonical homes are `response_guards.py` (only the re-export contract keeps them alive).

## 3. Target architecture

### 3.1 Two-stage composition (wiring.py)

```
build_services(config)        -> BotServices    (exists; bot-independent, unchanged)
build_components(bot, services) -> BotComponents (NEW; bot-coupled assembly, moved out of OdinBot.__init__)
```

`BotComponents` (dataclass): `llm_gateway`, `prompt_builder`, `tool_catalog`, `channel_state`, `delivery`, `completion_classifier`, `turn_recorder`, `native_tools`, `scheduling_tools`, `knowledge_tools`, `channel_ops_tools`, `media_tools`, `agent_task_tools`, `tool_loop` (runner), `scheduled_events`, `intake`, `pipeline`, `housekeeping`. Construction order resolves the one cycle (runner → native_tools → agents_tasks → runner) the same way dispatch already works: **late binding via provider callables**, never back-references to the bot.

The bot needs to supply only: `get_config` (live root), `change_presence`, `get_channel`, `guilds`, `user`, `process_commands`, `voice_manager`, and the discord.Message-independent services. That is the complete honest list of what "bot-coupled" means.

### 3.2 Public surface of OdinBot after retirement

**Keeps (documented, contract-tested):**
- discord.py inherited surface + lifecycle hooks (`setup_hook`, `on_ready`, `on_message`, `on_voice_state_update`, `close`) and their private helpers that do real work (`_backfill_archives`, `_on_voice_transcription`, `_on_monitor_alert` target, `_resolve_prefix`, `_log_startup_config`).
- `config` (live root), `start_time` (was `_start_time`).
- `services: BotServices` + the existing **flat subsystem handles** (sessions, scheduler, tool_executor, skill_manager, loop_manager, audit, agent_manager, reflector, channel_config, channel_logger, context_loader, infra_watcher, voice_manager, browser_manager, permissions, host_access_manager, api_token_manager, cost_tracker, subsystem_guard, audit_signer, diff_tracker, model_router, context_compressor, prefix_tracker, auxiliary_llm_client, outbound_webhook_dispatcher, trajectory_saver, agent_trajectory_saver, loop_agent_bridge, loop_reflection_gate*, knowledge_store*, embedder*, vector_store*, fts_index*, stuck_loop_tracker_cls, classify_command_risk, classify_tool_risk). Starred = renamed public from `_`-private. Rationale: these are plain composition handles, zero logic — the god-object problem was delegates + hidden state + logic, not the existence of handles. Deleting them buys nothing and breaks thousands of legitimate spellings.
- **Public component handles** (from §3.1): `llm_gateway`, `prompt_builder`, `tool_catalog`, `channel_state`, `delivery`, `turn_recorder`, `completion_classifier`, `native_tools`, `tool_loop`, `intake`, `pipeline`, `scheduled_events`, `agent_task_tools`, the four tool-domain handles, `housekeeping`.
- Late-bound (absent at construction, unchanged semantics): `startup_report`, `health_server`, `process_registry`, `mcp_manager`, `compression_stats`, `_codex_auth_pool`, `_issue_tracker_client`. (`_web_channel_locks` leaves this list — becomes app state.)

**Deletes — full disposition table:**

| Facade name(s) on bot | New spelling |
|---|---|
| `llm_client` property | `bot.llm_gateway.active_client` |
| `codex_client`/`ollama_client`/`kimi_client` property pairs, `codex` property pair, `_llm_provider_lock` | `bot.llm_gateway.codex_client` etc., `bot.llm_gateway.provider_lock` |
| `reload_codex_auth`, `reload_ollama`, `reload_kimi`, `_reload_*_inner` ×3, `switch_llm_provider`, `_wire_llm_callbacks`, `_wire_codex_callbacks`, `_codex_call` | `bot.llm_gateway.reload_codex()` / `.reload_ollama()` / `.reload_kimi()` / `.*_inner()` / `.switch_provider()` / `.wire_callbacks()` / `.call_with_tools()` |
| `knowledge` property pair, `_knowledge_store`, `_embedder`, `_vector_store`, `_fts_index`, `_memory_path` | public `knowledge_store`, `embedder`, `vector_store`, `fts_index`; `memory_path` via services |
| `_build_system_prompt`, `_build_chat_system_prompt`, `_system_prompt`, `_cached_skills_text` pair, `_invalidate_prompt_caches` | `bot.prompt_builder.build_full_prompt()` / `.build_chat_prompt()` / `.default_prompt` + `.rebuild_default()` / `.cached_skills_text` / `.invalidate()` + `bot.tool_catalog.invalidate()` |
| `_merged_tool_definitions`, `_cached_merged_tools` pair | `bot.tool_catalog.merged_definitions()` / `.cached` |
| `_channel_locks`, `_cancel_events`, `_pending_files`, `_recent_actions`, `_last_op_details`, `_background_tasks` aliases; `_is_cancelled`, `_track_recent_action` | `bot.channel_state.<dict>`; `bot.channel_state.is_cancelled()`, `.track_action(...)` (formatting moves in) |
| `_set_status`, `_send_with_retry`, `_send_chunked`, `_TOOL_STATUS_LABELS` | `bot.delivery.set_status()` / `.send_with_retry()` / `.send_chunked()`; labels dict moves to `delivery.py` |
| `_record_user_content`, `_new_context_trace`, `_save_turn_trajectory`, `_emit_lifecycle_event`, `_operational_reflection`, `_should_reflect_on_operation`, `_maybe_loop_reflect` | `bot.turn_recorder.<method>` (public method names) |
| `_classify_completion`, `_parse_classifier_response`, `_CLASSIFIER_SYSTEM_PROMPT` class attr | `bot.completion_classifier.classify()` / `CompletionClassifier.parse_response` / `completion.CLASSIFIER_SYSTEM_PROMPT` |
| `_process_with_tools`, `_run_loop_iteration`, `_dispatch_loop_tool`, `_dispatch_loop_tool_inner`, `_ensure_failure_visible` | `bot.tool_loop.run()` / `.run_autonomous()` / `.dispatch_loop_tool()` / `.dispatch_loop_tool_inner()`; `tool_loop_helpers.ensure_failure_visible` |
| ~40 `_handle_*` delegates, `_validate_schedule_payload`, `_detect_image_type`, `_collect_agent_result`, `_invoke_skill_missing_required` | dispatch table binds domain owners directly (§4 P5); non-dispatch callers spell the domain object |
| `_handle_message`, `_handle_message_inner`, `_process_attachments`, `_check_for_secrets`, `_is_allowed_user`, `_is_allowed_channel`, `_maybe_cleanup_caches`, `_cleanup_stale_caches` | `bot.pipeline.run()` / `._run_inner()`; attachments/gating helpers move into `intake_pipeline.py`; cleanup moves to new `housekeeping.py` |
| `_execute_scheduled_tool`, `_run_scheduled_workflow`, `_on_scheduled_task`, `_on_schedule_failure`, `_on_scheduled_digest`, `_format_digest_raw`, `_resolve_mentions`, `_on_monitor_alert` | `bot.scheduled_events.<method>` (scheduler start wires component methods directly) |
| module dups `combine_bot_messages`, `truncate_tool_output`, `scrub_response_secrets`; `_scrub_tool_input_for_storage`, `_EMPTY_RESPONSE_FALLBACK`, `_ALLOWED_WEBHOOK_IDS` + `_init_allowed_webhook_ids`, `SECRET_SCRUB_PATTERNS` | canonical `response_guards.py` copies (consumers re-import); storage-scrub + fallback + webhook allowlist move to `tool_loop_helpers.py` (pure, import-cycle-free); secret patterns move with `_check_for_secrets` into intake |

### 3.3 Narrow-dependency rules (item B)

- ≤6 dependencies → named keyword args (pattern: `KnowledgeTools`). >6 → a frozen per-module `*Deps` dataclass constructed in `build_components` (documents the true surface; no `**kwargs`, no service locator — passing `services` or `bot` into a component is banned).
- **Live state is always a provider callable**: `get_config`, `get_knowledge_store` (already conventions). Gateway/clients: inject the *gateway* (stable object owning swappable clients) — never a captured client.
- Cross-component calls that would cycle (agents_tasks → runner, scheduled_events → runner/agents) inject **provider callables** (`get_tool_loop: Callable[[], ToolLoopRunner]`) resolved at call time.
- Patch seams: tests patch the *owning component* (`bot.media_tools._handle_analyze_image = fake`), late-bound by the dispatch table at call time exactly as today's bot-attr resolution works.

### 3.4 Seam-carve of `tool_loop.py` (item C)

Mechanical, behavior-identical. Per-turn mutable closure state moves into dataclasses:

```
@dataclass class _ChatTurn:   # message, policy, trace, system_prompt (mutable),
    ...                       # tools, messages, tools_used, pending_image_blocks,
                              # validation state, trajectory, op_details, cancel, ids
@dataclass class _LoopTurn:   # the run_autonomous equivalents
```

`run()` becomes an orchestrator (≤ ~150 lines): `_prepare_chat_turn` → loop { `_maybe_compress` → `_call_llm_guarded` → `_record_iteration` / `_check_stuck` → text-only? `_finalize_or_retry` (guard cascade + classifier, order pinned) : `_execute_tool_calls` (was `_run_tool`/`_run_tool_with_timeout` closures, now methods on the runner taking the turn state) → `_post_iteration` (op-details, trajectory results, validation + vision injection, handoff check) } → `_finalize_cap_hit`. `run_autonomous()` gets the same treatment with its own phase methods — **no forced sharing beyond what is byte-identical today** (`build_assistant_content`, parse-error bounce, image-block normalize, failure-visibility). The guard cascade order, policy asymmetries, and every retry message stay pinned by the existing characterization suite. No method > ~160 lines afterward.

## 4. Phases (one PR each into `refactor/facade-retirement`; every PR Odin-reviewed before merge)

| Phase | Scope | Key gates |
|---|---|---|
| **P1** | Seam-carve `tool_loop.py` (§3.4). Move `ensure_failure_visible`, `_scrub_tool_input_for_storage`, `_EMPTY_RESPONSE_FALLBACK`, webhook-allowlist global+init to `tool_loop_helpers.py` (compat re-exports stay until P7; `background_task.py` import migrated now). Kills the client late-imports. | characterization suite byte-green; no method >160 ln; lint zero-new |
| **P2** | `build_components(bot, services)` in wiring.py; component construction leaves `OdinBot.__init__`; components get **public names** on the bot; old `_`-names kept as aliases until P7. `ChannelStateRegistry` construction moves to `build_services`. | facade contract still green (aliases); construction order pinned by test |
| **P3** | Narrow deps: `TurnRecorder` (6 kwargs), `ScheduledEventHandlers` (Deps dataclass), `AgentTaskTools` (Deps + `get_tool_loop` provider). Their internal `bot.X` spellings become dep spellings. | per-module: grep proves zero `host`/`bot` refs remain in the class |
| **P4** | Narrow deps: `ToolLoopRunner` (`ToolLoopDeps`), `MessageIntake`/`MessagePipeline` (Deps). Move `_process_attachments`, `_check_for_secrets` + patterns, `_is_allowed_user/_channel` into intake; new `housekeeping.py` (cache janitor) with narrow deps; `_track_recent_action` formatting into `ChannelStateRegistry`. | same grep gate; characterization green |
| **P5** | Dispatch owner-binding: registry entries become `(owner_key, attr, shape)` resolved against components late; `register_native_handlers` maps each tool to its domain owner; `_invoke_skill_missing_required` moves into the registry (reads skill_manager). Bot `_handle_*` delegates become dead. | both pipelines' dispatch characterization green; patch-seam tests retargeted |
| **P6** | Web/slash/main migration: api.py + chat.py + health/server.py + slash_commands.py spellings per §3.2 table; `_web_channel_locks` → aiohttp app state; api.py prompt-rebuild sites → `prompt_builder.rebuild_default()`; the 13 cache-null sites → `invalidate()`. | full web/endpoint test files green; grep: **zero `bot._` in src/web + src/health**; UI dist untouched |
| **P7** | Facade deletion (every table row in §3.2), `_`-alias removal, duplicate module functions removed, `shutdown_services` spellings updated (**live clients via gateway — services refs would be stale**), contract rewrite: `test_facade_contract.py` → positive = §3.2 keeps; negative source-scan extends to ALL retired names across `src/` and `tests/` (allowed: client.py, wiring.py, this campaign's own files). Remaining ~120 test-spelling migrations. | full suite green; client.py ≤ ~600 ln with zero pure delegates; negative scan green |
| **P8** | Docs (`odin-architecture` memory, CONTRIBUTING pointer if needed), metrics in this RFC's Results section; **local deploy to /opt/odin** (usual skip-worktree dance), soak: Odin self-test battery + my log audit; findings → fix PRs. | service healthy under real traffic; soak report |

Rollback: every phase is a merge commit on the campaign branch; `git revert -m1` any phase cleanly. The branch never touches master.

## 5. Risk register

| Risk | Mitigation |
|---|---|
| Live-reload staleness (captured client/config refs) | provider-callable rule (§3.3); P7 gate greps components for `self\.(config|codex_client)\b =` captures; existing reload tests |
| `shutdown_services` reading dead names | updated in the SAME PR that deletes (P7); graceful-shutdown test exercises it |
| Web behavior drift | api/chat/websocket endpoint tests are the harness (they exist and are green today); zero schema changes; P6 is spelling-only |
| Patch-seam breakage in the wider suite | owner-level late binding preserves seams; per-phase full-suite runs; the ~120 known spellings migrated deliberately, stragglers surface as failures not silent passes |
| Hidden consumers of a "dead" delegate | P7 deletion is grep-driven: every deleted name must show zero refs outside allowed files *before* removal |
| `_web_channel_locks` scope change (bot→app) | one app per bot per process today; the lock's purpose (serialize per-channel web chat) is app-scoped by nature; characterization test updated intentionally |
| Circularity regressions | import-graph smoke (`import src.discord.client` etc.) per phase; late imports banned in new code except documented cycle-breakers |

## 6. Success criteria

1. Zero pure-delegate methods and zero property shims on OdinBot; `client.py` ≤ ~600 lines, all real logic.
2. `grep -rn "bot\._" src/web src/health` → empty; slash_commands uses public components only.
3. Every extracted class constructor names its true dependencies; `grep "def __init__(self, host)"` in src/discord → empty.
4. No method in `tool_loop.py` > ~160 lines; both entry points read as phase orchestrators.
5. Full suite green (≥6,056 tests), characterization green throughout, ruff finding-set diff vs baseline = zero new.
6. Soak on /opt/odin: healthy chat + loop + web traffic, no new log errors attributable to the campaign.

## 7. Revision log

- R0 (2026-07-05): initial draft for Odin review.
