# Changelog

All notable changes to Odin are recorded here, written for operators rather than
from commit subjects. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Each GitHub release body is the matching section of this file.

## [Unreleased]

### Changed

- Outbound webhooks may target private and homelab addresses, while cloud-metadata
  destinations remain blocked. Redirects and DNS are validated at delivery, and
  webhook signatures are never forwarded to another origin.
- MCP calls keep the first response for a request ID on all transports; later
  responses are ignored with a payload-free warning. The handshake remains strict.
- The completion judge no longer imposes a 128-token output cap. Native Codex
  requests are unchanged; compatible and Ollama reasoning judges can use their
  normal output budget. Empty or ambiguous judge answers are logged as warnings.
- Knowledge ingestion splits unusually long words into bounded chunks. Existing
  documents are unchanged until re-ingested.

### Fixed

- Outbound webhook edits made in the API or WebUI persist across restarts and
  report their durable state. Configured per-target TLS verification and secret
  scrubbing settings now apply at startup.
- Malformed permission overrides and API token records survive unrelated writes,
  with operator-visible diagnostics; existing effective tiers and token access
  are not changed by the migration.
- Trusted-proxy forwarding validates IP addresses, supports CIDR trust ranges,
  and walks the forwarded chain from the nearest proxy to prevent rate-limit
  bucket spoofing and inaccurate audit IPs.
- Concurrent knowledge ingests no longer bypass duplicate checks or add
  spurious versions, and colliding chunk ID prefixes cannot overwrite chunks
  belonging to another source, including on version restore.
- Usage coverage recovers from transient scan failures and detects oversized
  unfinished trajectory rows instead of stalling later records silently.
- Plan execution skips failed dependencies transitively, enforces step deadlines
  and cancels shell process groups, reports continued failures honestly, and
  returns validation errors for malformed plans. Boolean settings reject
  ambiguous strings rather than treating `"false"` as true.
- Computer-use audit and System Logs retain specific fixed refusal reasons
  instead of collapsing them to a generic rejection; desktop input and receipts
  are unchanged.

### Removed

- Removed the Slack integration, its configuration fields, API routes and WebUI
  controls. Existing `slack:` configuration sections are ignored for upgrade
  compatibility; generic Slack-token redaction remains active.

## [4.6.0] - 2026-09-23

### Added

- Package upgrades now surface a versioned, mode-0600 configuration proposal and
  a private diff command without printing potentially secret YAML into install
  logs. Existing operator configuration is never rewritten.
- Release publishing now verifies the pinned nfpm package and requires a
  disposable-container `.deb` installation smoke before artifact upload.

### Changed

- Fresh installations select `gpt-6-sol` for main chat and `gpt-6-luna` for
  auxiliary work. Agents use an explicit per-spawn choice or configured agent
  model policy, with `gpt-6-sol` as the final fallback when no policy supplies
  a model.
  Existing unpinned installations retain their previous model defaults. Retired
  `gpt-5.5` and `gpt-5.3-codex-spark` selections migrate to `gpt-6-sol`.
- Agent spawn descriptions now rank GPT-6 Astra, Sol and Luna ahead of the
  previous generation and state the operator-approved tier guidance.
- Paused recurring schedules resume at the next defined interval, not by
  replaying a missed interval immediately.
- Knowledge re-ingestion distinguishes unchanged content and already-stored
  duplicates from storage failures.
- After tool use, a tool-less agent answer is checked for task completion. An
  incomplete answer gets up to three continuation nudges across the run; the
  next reply is accepted without another judge call. An answer still incomplete
  at the iteration cap fails rather than falsely completing. Classifier outages
  fail open. The completion judge runs on the auxiliary model for chat and agents.
- One-time schedules whose run time passes while paused are quarantined instead
  of firing when unpaused; setting a new run time re-arms them.
- X11 computer sessions can explicitly focus an application with
  `computer_act operation=focus`.
- Computer-use tools offer `inventory_targets` and its target fields only for
  an existing Hyprland session; other backends no longer advertise it.
- The computer-use tool description and operator guide state the
  alternate-input policy: a separately authorized input path may be evaluated
  when computer use is unavailable, but never used to route around an active
  safety guard or an unknown release.

### Fixed

- Force-revoking a host terminates its managed local processes; a process
  denied after startup is terminated or reported as an unverified outcome.
  Managed stdin follows host-specific strict command policy.
- Concurrent session-vector and FTS writes are serialized and rolled back on
  failure; trajectory reads no longer load entire daily partitions for
  bounded results.
- Package installation tightens the durable configuration file to mode 0600;
  the fresh template now matches the 12-hour WebUI session schema default.
- Auto-resumed turns balance Discord presence, and aborted tool streams are
  settled rather than leaving permanent active records.
- Tool timeout edits persist before updating live settings, apply to new calls
  only, and failures count toward tool-call attempts. Auxiliary fallback usage
  is recorded after the fallback actually executes.
- Bad persisted schedule timestamps quarantine only their own record. Skipped
  overlapping manual runs no longer claim to have run. Grafana remediation
  and cooldown state is periodically pruned after its semantic expiry.
- The Logs page Tool Activity preset now filters to tool records; overlapping
  search responses cannot replace newer results. Session checkbox keyboard
  selection no longer toggles the containing row.
- The Logs page Warnings+ preset shows WARNING, ERROR and CRITICAL records
  instead of WARNING only.
- Computer-use results and audit records carry the verified input outcome
  (`not_dispatched`, `released_verified` or `release_unknown`) separately from
  the failure reason. An action refused before any input is sent, such as one
  citing a superseded observation, now reports that nothing was dispatched and
  is safe to retry; RELEASE-ALL and operator intervention are reserved for an
  unverified release or an unknown outcome.

### Removed

- Removed the seven legacy Discord prefix-command cogs and disabled `!` prefix
  parsing. Scheduled-report reaction pagination remains registered.

## [4.5.0] - 2026-09-22

### Added

- Native Codex `gpt-6-sol` and `gpt-6-luna` selection for main, auxiliary, and
  agent models, including spawn catalogue guidance. Both accept all six reasoning
  efforts and use measured 921,799-token input-budget floors. Existing defaults
  are unchanged; selectors order GPT-6 Astra/Sol/Luna before the 5.6 family.

### Changed

- Discord page: the gateway card shows a state badge, and the token field follows
  the same pattern as the LLM credentials: a Configured pill, press Enter to
  replace, and a note saying whether the token uses the preferred environment
  storage or legacy storage. Global defaults render as compact aligned rows.
- `GET /api/discord/connection` adds `credential_usable` and
  `credential_preferred_storage`; the existing fields are unchanged for older
  clients. A refused connect now reads "no usable Discord credential".

### Fixed

- The Discord page's Runtime status always read "unknown" because it read the
  wrong response field. It now shows Connected, Connecting, Disconnected or
  Unavailable.
- An install whose working Discord token sat in legacy storage could not press
  Connect and was told no usable credential existed. Connect is now enabled by a
  usable token, and the page reports the storage format separately.

## [4.4.0] - 2026-09-21

### Added

- **Agents report what a generation is actually doing, not just that it is running.** A
  running agent now carries normalized progress telemetry: logical phase, physical request
  attempt and retry count, elapsed generation time, time since the last wire event, time since
  the last *substantive* delta, accumulated response size, tool-call counts, and how much
  partial work a retry discarded. `wait_for_agents` and `list_agents` both surface it, for
  example `generating for 85s; attempt 1; wire 0s ago; substantive 0s ago`. The separation of
  wire activity from substantive output is the point: a stream kept alive by keepalives while
  producing nothing is no longer indistinguishable from one making progress. The telemetry is
  machine-owned and agent-only - it never appends to an agent conversation, consumes an
  iteration, alters a response, exposes partial reasoning, or ends a turn, and the main chat
  path is unchanged.
- **Reasoning-token counts are captured** from compatible endpoints that report them, as a
  subset of output tokens rather than additional billed output.

### Changed

- **Compatible endpoints are now streamed.** `chat()` and `chat_with_tools()` share one SSE
  transport and accumulator. Delivery is still atomic - the response is streamed internally and
  returned only once terminal - so nothing about how a turn arrives has changed. Requests carry
  `stream_options.include_usage`, so usage, cache-token details and cost survive. A premature
  end of stream, a malformed terminal error, or a lost connection after partial data never
  returns that partial response as a completed turn.
- **UPGRADE NOTE: `openai_compatible.timeout` is migrated to two explicit fields.** A single
  ambiguous total is replaced by `request_timeout_seconds` (default 3600) and
  `stream_stall_timeout_seconds` (default 180), matching the shape the Codex transport has
  always used. An existing bare `timeout` becomes the stream-stall value while the total widens
  to 3600, and the migration is logged at startup stating exactly what it did. The rewrite is
  leaf-scoped and atomic: comments, placeholders, permissions, symlinks and unrelated keys are
  preserved, explicit new fields always win, and a concurrent newer edit is never overwritten.
  It runs once and is idempotent across restarts. No operator action is required.
- **An endpoint that cannot stream now fails qualification with a clear error** instead of
  silently falling back to a blind non-streaming request. The reload probe exercises the
  streaming path itself, so it cannot bless an endpoint whose production transport would not
  work.
- **Ordinary source edits no longer force an operational validation step.** `apply_patch` was
  treated as an operational mutation on every call, which injected a mandatory `validate_action`
  turn after each patch on the chat path. Measured over fifteen days that cost 1,848 calls, 98%
  of them occupying a dedicated model iteration, around 8.5% of all chat generations and roughly
  26 minutes of added latency per day - while about a quarter of the resulting checks fell in
  categories that had never once failed. Editing a file is not by itself an operational change.
  Operational command detection, `email_send`, and validation enforcement for genuine
  deployments and service changes are all unaffected, and `validate_action` remains available
  whenever it is actually warranted.
- **An OpenRouter provider pin now honours the fallback setting.** The "allow fallback away from
  the pin" control was overridden whenever a pin existed, so it had no effect in precisely the
  case it described. A pin can now prefer its provider while still falling back when that
  provider is unavailable.

### Fixed

- **Long compatible generations were being destroyed and silently retried.** The compatible
  transport applied its timeout as a whole-request total with no stall detection, so any
  generation needing longer than the configured window - routinely the case for a
  reasoning-heavy model over a large context - was cancelled, had all of its work discarded, and
  was retried from scratch up to four times. Nothing surfaced this to the caller, the agent, or
  the operator beyond one journal warning with an empty message. A single agent run lost 27 of
  44 minutes this way across four iterations while appearing merely slow. With streaming plus a
  stall bound, a generation producing 41,110 output tokens now completes without a single
  timeout.

## [4.3.0] - 2026-09-21

### Changed

- **An agent model must now be chosen explicitly when the agent model setting is
  `auto`.** `auto` means "choose per spawn", so `spawn_agent` marks `model` as required
  and no longer offers to fall back to a configured default. This is the behaviour
  change in this release: a caller that previously omitted the field now receives
  `model is required when agents.model is auto; choose an eligible model explicitly`.
  Nothing changes for the other two settings - a concrete agent model still runs exactly
  that model, and an unset (inherit) agent model still follows the main model. Operators
  who want inheritance should set a concrete model or leave the setting unset rather
  than `auto`. Existing scheduled workflows whose stored steps omit a model keep working:
  they resolve to an eligible candidate rather than failing.

### Fixed

- **The agent model allowlist could be bypassed completely by omitting the model.** The
  allowlist constrained only an explicit per-spawn selection. A spawn naming a
  non-allowlisted model was correctly refused, but a spawn naming no model at all skipped
  the check entirely and ran whatever the configuration resolved to. On an install whose
  allowlist held only fast, inexpensive models, agents could still run the main model on
  every spawn that left the field out - and the tool description actively invited that,
  ending with "Omit to use the configured agent model". The allowlist is now enforced on
  the resolved model, not just the requested one.
- **An inherited agent model read a configuration key that nothing had written since
  4.2.0.** Selecting the main model by model reference moved that choice to a new setting,
  but agent inheritance kept reading the older provider-scoped key. On any install whose
  operator changed the main model after upgrading, the two disagreed and agents silently
  inherited the stale value instead of the model actually in use. Both the schema and the
  runtime now resolve through one shared function.
- **A spawn could grant itself scheduled-workflow authority.** The marker distinguishing a
  scheduled dispatch was read from tool input, which the model supplies, so a spawn could
  include it and claim the higher scheduled iteration cap. Scheduled authority now comes
  from trusted execution context that a caller cannot forge.
- **Models from a disabled provider were still offered as agent candidates.** A disabled
  compatible or Ollama provider no longer contributes to the automatic candidate list.
- **A configuration that leaves no model able to run now says so.** When no candidate is
  available, `spawn_agent` is withheld from the catalogue and the reason is logged, rather
  than the tool being advertised with an unsatisfiable choice.
- **Configuration drift between spawn and execution is caught.** The eligibility check
  repeats when a generation is captured, so removing a model from the allowlist stops the
  next generation of an already-running agent from using it.

## [4.2.2] - 2026-09-21

### Fixed

- **The LLM configuration page no longer exhausts the API rate limit.** The live
  refresh added in 4.2.0 issued about ten requests every five seconds — roughly the
  entire 120-per-minute per-IP budget — so opening the agent model allowlist could
  return `rate limit exceeded`. It also re-fetched the OpenRouter catalogue (310 KB)
  and provider status (200 KB) on every tick. Polling now covers only live status and
  configuration, six requests every fifteen seconds; the model catalogues are
  near-static and load on mount and on an explicit refresh. The rate limit itself is
  unchanged — the page was wasteful, the limit was not wrong.


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
