# Changelog

All notable changes to Odin are recorded here, written for operators rather than
from commit subjects. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Each GitHub release body is the matching section of this file.

## [Unreleased]

## [4.2.1] - 2026-09-21

### Fixed

- **Page-switching on scheduled report embeds works again.** The 4.1.0 cleanup that
  retired the generic Discord trigger cogs removed the only `on_raw_reaction_add`
  listener along with them, so control reactions on a paginated report were received
  by nothing. Reports still rendered, pagination state still persisted and the
  control reactions were still added — the pages simply never changed, and no error
  was logged. Pagination is now served by a dedicated listener rather than the
  retired generic trigger system, with a regression test that fails if nothing routes
  a reaction to the pagination service.


## [4.2.0] - 2026-09-20

Any OpenAI-compatible endpoint can now serve Odin, and agents can run on models
from different providers than the main thread. The Kimi-specific provider became
a generic compatible client, OpenRouter became a first-class preset with real
catalogue and routing support, and a neutral reasoning scale lets one control
drive effort across endpoints that each speak a different dialect.

### Added

- **Any OpenAI-compatible endpoint as a provider.** Supply a base URL, key and
  model; presets exist for DeepSeek, GLM/Z.AI, Qwen, DashScope, OpenAI, Moonshot
  and OpenRouter, and a custom endpoint works without one.
- **OpenRouter as a first-class preset**: browse the catalogue in the WebUI,
  derive a conservative per-model context profile from the endpoints that can
  actually serve it, pin a model to a specific provider, and rank routing
  preference while keeping vendor fallback.
- **Agent auto-model allowlist.** Choose exactly which models agents may select,
  in preference order, each with its own reasoning default. An empty allowlist
  keeps the previous behaviour.
- **Model selection hints.** Operator-written guidance for each allowlisted
  model, shown to Odin when it picks one, alongside measured facts (context,
  output ceiling, reasoning control).
- **A neutral reasoning scale** — `none`, `low`, `medium`, `high`, `xhigh`,
  `max` — translated to each endpoint's native vocabulary, so one control works
  across providers. Codex receives these natively; other endpoints receive their
  nearest supported equivalent.
- `openai_compatible.reasoning_effort` so a compatible **primary** model has a
  reasoning control, matching what agents already had.
- `ollama.num_ctx`, operator-visible, so prompts are no longer silently truncated
  to Ollama's default window.

### Changed

- **Per-model output caps.** Compatible requests derive their output budget from
  the model's profile instead of one global `max_tokens`, bounded at 32,768. The
  compatible **Max Tokens** field is gone from the WebUI because it no longer
  governs the request.
- **Iteration budgets by provider.** Codex agents keep 120 ordinary iterations;
  compatible agents receive the configured hard ceiling, because models that emit
  one short step per turn should not lose most of their budget to that style.
- `allow_fallbacks` now follows OpenRouter's own default of enabled, so a
  transient rate limit no longer kills an agent. An explicit per-model pin still
  forces fallbacks off.
- The LLM Config page refreshes while open, without overwriting a field you are
  editing, an open dialog, or an unsaved draft.
- Credential fields opt out of browser autofill and keep their styling if a
  browser ignores that.

### Fixed

- A truncated response is no longer reported as a completed agent. `finish_reason`
  of `length`, and a reply with neither text nor tool calls, now fail honestly and
  get one retry rather than presenting as an empty success.
- A Codex generation that consumes the iteration wall gets one fresh bounded
  retry instead of ending the agent.
- An unconfigured `temperature` is no longer sent, which had made every OpenAI
  reasoning model unroutable through OpenRouter's parameter filtering.
- `DeepSeekClient` accepts the per-model output cap argument; previously every
  request through the DeepSeek preset raised `TypeError`.
- Neutral reasoning no longer raises when an endpoint declares a vocabulary
  outside the Codex ladder.
- Profile derivation honours per-model pins, and reports limits from one real
  endpoint rather than combining the smallest context of one with the smallest
  output of another.
- Agent eligibility reserves the effective request cap instead of a model's
  theoretical maximum, which had excluded capable models.
- Saving OpenAI-compatible configuration works: `openrouter` and `model_profiles`
  serialize correctly, a failed client reload rolls back instead of reporting
  success, thinking mode persists, and a null `preset` no longer becomes the
  string `'None'` and block startup.
- The preset-to-dialect mapping lives in one place; one of its four copies had
  drifted and silently dropped reasoning control for DashScope.
- Health and startup diagnostics report the model actually serving rather than a
  configured fallback field.
- The OpenRouter catalogue route tolerates incomplete records instead of
  returning HTTP 500.

### Removed

- The Kimi-specific provider section, superseded by the generic compatible client.
  Existing `kimi:` configuration continues to load and is served by it.

### Upgrade notes

No action required. An existing `config.yml` loads unchanged; `ollama.num_ctx`
and `openai_compatible.reasoning_effort` take defaults. An install configured
only for Codex behaves exactly as before — the spawn surface, tool list and
effort tiers are byte-identical to 4.1.0.


### Added

- OpenAI-compatible endpoints can serve main, auxiliary, and agent generations
  independently of Codex chat. Agent Auto policy is a runtime-enforced ordered
  allowlist, and incompatible or under-budget models are not advertised.
- OpenRouter is a deliberate compatible-endpoint special case with catalogue
  profile auto-fill, authenticated per-route performance facts, per-model
  provider pinning, unified reasoning effort, real provider-reported cost, and
  measured cache-hit attribution by served upstream provider.

### Changed

- The LLM page uses one searchable grouped model catalogue and an OpenRouter
  list builder. Provider selection compares input/cache price, throughput,
  p50/p99 latency, quantization, tool support, and Odin's measured cache ratio
  instead of pretending the cheapest route is necessarily suitable for agents.

## [4.1.0] - 2026-09-18

A cleanup campaign: honest tool metadata, a timeout wall that finally honours
per-tool budgets, seven retired tools, and two authorization defects fixed.
Existing installations start unchanged — every removed configuration section is
tolerated silently and never rewritten — but capabilities are genuinely removed,
so read the upgrade notes.

### Upgrade notes

- **ComfyUI image generation is removed.** Only native OpenAI image generation
  remains, and it requires the Codex provider. `generate_image` no longer accepts
  `size`, `negative` or `model`: the native route selects its own dimensions and
  cannot honour those requests. Installations that generated exact-size images,
  used negative prompts, or selected a checkpoint lose those abilities. Existing
  `comfyui:` and `image.backend` configuration loads silently and is ignored.
- **Seven built-in tools are removed**: `git_ops`, `docker_ops`, `kubectl`,
  `terraform_ops`, `issue_tracker`, `spawn_loop_agents` and `collect_loop_agents`.
  The tool catalog is now 67 tools (20 core). Shell retains the underlying
  capability for the infrastructure wrappers; `issue_tracker` was unreachable in
  any case because no client was ever constructed.
- **Discord message and reaction schedule triggers are removed.** They were never
  delivered — nothing dispatched those events — while `schedule_task` advertised
  them and the scheduler accepted them, so a schedule could be created, report
  success and never fire. Stored schedules using them now load **paused and
  inert** with a stated reason rather than failing; give them valid timing to
  resume. Legacy `reaction_triggers:` and `message_triggers:` configuration loads
  silently.
- **Removing `git_ops` removes its push protections** — freshness preflight,
  exact source and destination binding, and a lease bound to the observed remote
  SHA. A command governor rule now blocks unconditional force pushes from the
  shell, but it is bounded shell recognition and does not reproduce those
  guarantees.

### Added

- A command governor rule blocking unconditional Git force pushes: `--force`,
  `-f`, bundled short flags and force-prefixed refspecs are refused, while
  `--force-with-lease` and `--force-if-includes` are not mistaken for them.
- Affordance metadata for `get_tool_output` and the three `computer_*` tools,
  which previously carried no footer at all, plus catalog decoration so
  dynamically appended computer definitions receive one.
- Corrupt authorization stores are preserved to timestamped sidecar backups
  instead of being overwritten.

### Changed

- **Tool affordance metadata is corrected across 36 entries.** The footers an
  assistant reads now match what the tools do. Notably `http_probe` and
  `validate_action` no longer claim `risk=none` while accepting arbitrary
  commands, the skill tools no longer claim `risk=medium` while loading caller
  Python, and tools that launch supervised work are classified by the work set in
  motion rather than by how quickly the call returns.
- Cost and latency may now be **omitted** for tools whose workload depends on the
  implementation they dispatch. An omitted dimension means unclassified — never
  free, instant or safe. The fallback for unknown tools assumes high risk.
- The Web listener exposure card reads durable authorization state, separates
  authorization from configured intent and the running socket, distinguishes
  pending from active exposure, and offers a reversible restrict-to-loopback path.

### Fixed

- **Per-tool timeouts are honoured on chat, autonomous loop, and agent paths.**
  Chat and loops previously used a single wall derived from
  `command_timeout_seconds`; agents received only the operator override map and
  therefore could not reach built-in budgets at all. The built-in 900-second
  budgets for `run_command` and `run_script` now reach every execution path, with
  the shared resolver's bounded recovery, dispatch, and settlement allowance.
- **Corrupt authorization stores no longer fail open or destroy the original.** A
  damaged `permissions.json` previously lost its overrides and fell back to the
  default tier, so a demoted user could read as an administrator; the next
  mutation then overwrote the corrupt file and the original was gone. Reads now
  degrade to the safest interpretation and mutations refuse with an explicit
  error.
- **A falsy requester identity no longer skips host access enforcement.** Host
  resolution and acquisition gated the check on a truthy requester, so work
  dispatched without one bypassed the fence entirely. Missing identity now fails
  closed; system work must present an explicit, host-scoped identity.

### Removed

- The ComfyUI image backend and its configuration.
- `git_ops`, `docker_ops`, `kubectl`, `terraform_ops`, `issue_tracker`,
  `spawn_loop_agents` and `collect_loop_agents`.
- The Discord message and reaction trigger cogs, their configuration sections,
  and the `discord_message` / `discord_reaction` schedule trigger sources.

## [4.0.0] - 2026-09-16

The onboarding, connection-lifecycle, Hyprland-foundations and model-retirement
campaign (PR #356). Existing installations keep working unchanged; read the
upgrade notes first because several defaults and behaviours change.

### Upgrade notes

- **Pre-existing installations start unchanged.** Source checkouts with `0775`
  directories, symlinked data directories, a working-directory `.env`, and legacy
  API token stores (symlinked, `0644`, or holding an invalid entry beside valid
  ones) all keep working. Group-writable ancestors log one diagnostic per
  directory and startup continues. No permission change or policy file is needed.
- **Automatic learning is now opt-in.** Configurations that omit
  `learning.enabled` load it off. An explicit `learning.enabled: true` stays on
  until an administrator switches it off in **Capabilities → Learned**. The
  switch applies live and governs both lesson generation and learned-context
  injection. Stored entries are retained. Deliberate memory (`memory_manage`,
  `memory.json`) is not affected.
- **Installations with no usable Web/API credential bind loopback only**, even
  if `web.host` is broader. Authenticated installations keep their configured
  listener. Widening a restricted installation requires the authenticated
  listener-consent procedure and an operator restart.
- **Retired models.** `gpt-5.5` and `gpt-5.3-codex-spark` are no longer
  selectable. Persisted selections migrate in memory to `gpt-5.6-terra` with a
  warning (an old image `outer_model` pin migrates to `gpt-6-astra`); the YAML is
  not rewritten. Explicit runtime requests for a retired model are rejected.
- **Gateway failure now stops the service.** If the attached Discord gateway
  task unexpectedly ends, Odin clears readiness and exits with status 1 so the
  process supervisor restarts it, instead of idling HTTP-only.
- **Slash commands are one global set** (`/stop`, `/steer`, `/status`, `/usage`,
  `/reload`) available in guilds and in bot DMs. Legacy per-guild copies are
  cleared at startup; global publication proceeds even if a guild cleanup fails.
- **Scheduler:** pure outbound HTTP webhook actions run without Discord;
  Discord-delivered actions still require a connected gateway.
- **Fresh package installs** start a loopback bootstrap service and complete
  setup in the WebUI (`http://127.0.0.1:<port>/ui/`, or through an SSH tunnel).
- `discord.py` is pinned to 2.7.1.

### Added

- WebUI-first onboarding: transient bootstrap service, installation-bound
  initialization state kept private under `data/initialization/`, and the
  `GET /api/setup/status`, `POST /api/setup/complete` and
  `POST /api/setup/listener` routes with a Setup page.
- Supervised Discord attachment with a connection supervisor and the
  administrator-only `GET`/`POST /api/discord/connection` routes (status,
  connect, detach). See `docs/discord-connection-lifecycle.md`.
- Live **Automatic learning** toggle in Capabilities → Learned.
- Hyprland (Wayland) computer-use foundations: validated compositor
  rediscovery, instance-scoped endpoints, managed plugin activation checks with
  root-required diagnostics, target inventory, quiet focus recovery, immutable
  startup grants, retained release receipts after a lost acknowledgement, and a
  scoped cross-compositor retirement witness. Full task-continuous compositor
  restart recovery is not claimed.
- Computer-use error guidance and local recovery modules with truthful
  `executed` versus `verified` outcomes and cleanup receipts.
- Bounded quiet-process waits: an iteration that only polls `manage_process`
  for 30–120 seconds is exempt from the repetition guard until the job's
  original deadline. See `docs/bounded-process-waits.md`.
- `GET /api/schedules/status`, and channel-less HTTP schedule actions in the API
  and the Schedules page.
- Development verification guide (`docs/testing.md`); parallel test execution
  in CI with `make test` / `make test-cov`.

### Changed

- Discord message sends retry only proven connect-phase connector failures;
  ambiguous transport errors are not replayed, so replies are never duplicated.
- API routes are administrator-only by default except explicit self-service
  routes. Listener widening requires a freshly entered raw admin credential.
  Credential rotation, deletion, demotion or session expiry revokes WebSocket
  authority. Corruption of the dynamic token store denies dynamic credentials
  only; otherwise-valid static credentials keep working and there is never an
  anonymous fallback.
- Computer use on X11: optional session-start fields that are null or blank
  mean absent; lifecycle and action tool descriptions state that a local ledger
  release is not a compositor acknowledgement; a capture failure clears stale
  observations and delivery authority.
- Initialization storage supports existing data layouts with canonical pinning
  of symlinked parents; lock or migration-write failures no longer prevent HTTP
  startup; a verified legacy installation keeps its authenticated API while only
  new durable setup or listener decisions wait for repaired storage.
- Setup changes to timezone, hosts and browser settings report the restart they
  require instead of applying silently.

### Fixed

- Six startup and lifecycle defects introduced during the campaign: a launch
  configuration alias losing workspace protection, a stale ready callback
  reversing a newer disconnect, onboarding credential binding not durable for
  every accepted YAML, setup configuration and runtime consumers disagreeing,
  gateway retirement waiting through reconnect backoff, and overlapping
  scheduled runs leaking reservation metadata.
- Initialization state cache invalidation on completion, bind writes,
  replacement, chmod and deletion; a vanished pending record can no longer
  become a completed legacy install.
- First Discord attach on an unqualified `discord.py` layout now uses the
  public library startup path.
- Post-commit recovery settlement runs outside the rollback handler; weakly held
  per-loop locks keep strong references for active owners; an unreachable setup
  status response and two nonexistent web-config callbacks were removed.
- Hyprland integration repairs: native inventory response fields, selection
  identity and geometry schemas, focus-loss recovery, and the guardian parser.
- Computer use on X11: a stroke batch cut short by the guardian's dispatch
  deadline with a confirmed input release is again recoverable, so Odin
  observes fresh and continues instead of stopping for operator intervention.
  Partial actions stay interrupted and are never replayed; unknown-release,
  ownership, focus and wrong-target failures remain terminal.

### Removed

- `gpt-5.5` and `gpt-5.3-codex-spark` from selectable models and catalogues.
- Learned-context injection by default (now behind the opt-in switch).

### Security

- Loopback-only bootstrap until authenticated listener consent; one-shot admin
  credential for widening, revalidated under the configuration transaction.
- Token store parsing fails closed on corruption without enabling anonymous
  access; computer operator routes revalidate the admin identity after every
  awaited boundary.
