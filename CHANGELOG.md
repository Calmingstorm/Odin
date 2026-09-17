# Changelog

All notable changes to Odin are recorded here, written for operators rather than
from commit subjects. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Each GitHub release body is the matching section of this file.

## [Unreleased]

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
