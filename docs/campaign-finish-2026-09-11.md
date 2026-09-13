# Campaign finishing scope, 2026-09-11

PR #356 remains one branch; no deployment, master merge, release or manual
pipeline dispatch is authorized. A normal PR synchronization must run hosted CI.

## Implemented versus deferred

- A implements transient WebUI-first onboarding, installation-bound state,
  loopback bootstrap, live credential policy, supervised Discord attachment,
  and connected-only scheduling admission/dispatch (including HTTP webhooks).
  Tests use isolated transports, not a real external device authorization or
  gateway. Full capability requires successful authorization and gateway ready;
  merely submitting an invalid token does not manufacture a connection.
- B implements validated Hyprland rediscovery, instance-scoped endpoints,
  managed plugin activation checks, target inventory, quiet focus recovery,
  immutable startup grants, and one authenticated query for a retained release
  receipt after a lost ACK. It does not replay input.
- B still **does not implement or qualify full task-continuous compositor
  restart recovery, automatic durable output-grant handoffs, or reconnectable
  native ownership-ledger reconciliation**. Store handoff APIs are foundation,
  not a shipped automatic handoff capability. End-to-end receiver qualification
  is deferred; the companion remains `runtime_qualified: false`. No native
  desktop operations are part of this finishing round.
- C now retires **spark only**: remove its budget row and reject the exact
  trimmed slug in main/agent configuration, budget overrides/resolution, and
  shared outbound validation. Existing configs fail clearly and require an
  explicit replacement, with no silent migration. 5.5, 5.4 and 5.4-mini remain.
  The v3.98.0 image-default migration's 5.5 source value is preserved/commented.

## Slash commands in bot DMs

Choose one global set of `/stop`, `/steer`, `/status`, `/usage`, and `/reload`.
The last only refreshes context/caches, not service configuration or a restart;
its existing allowed-user authorization is unchanged. All commands retain the
user-ID allowlist; steering additionally requires the turn requester or an
Odin admin. No guild/member object is required. Empty allowlists retain their
existing allow-all meaning, not a new DM privilege rule.

Set interaction contexts to guild and bot DM, installation context to guild.
No user-install expansion or commands in unrelated private/group channels.
Discord documents bot-DM availability for users sharing a guild with the bot.

On ready/resume/join, clear and bulk-sync each known guild to empty before
initial global publication. Failed guild cleanup is retried and defers that
publication; successful scopes are remembered until transport replacement.
Global `tree.sync()` bulk-overwrites the exact desired set, removing obsolete
commands rather than additive `copy_global_to` merging. No guild copies are
created. Guilds unavailable to the bot cannot be reconciled until it rejoins;
client-side caches cannot be made atomically consistent across API scopes.

Source verification: discord.py 2.7.1 `CommandTree.sync` calls
`bulk_upsert_global_commands` with the complete local payload. Its guild form
does the same for that guild. Tests exercise this real serialization/sync path
with a fake HTTP receiver, plus callback authorization with DM-shaped users.

Discord's current application-command documentation describes global command
read-repair: invoking an outdated version rejects it and triggers a reload.
It explicitly calls guild updates instant, but provides no guaranteed global
propagation duration. Do not repeat the obsolete one-hour claim or promise
instant client menu refresh. Live propagation measurement requires a later
authorized deployment; none is claimed here.

Reference checked 2026-09-11:
https://docs.discord.com/developers/interactions/application-commands

## Validation accounting

PR notes must name the exact tested commit and separate local results from
hosted checks. The four previously untracked final-coverage test files predate
this finishing round; they were inspected, repaired where needed, and retained.

The committed coverage gate ratchets each file's missed lines and percentage,
with 85%/90% thresholds for new core/security files. Aggregate coverage is
reported, not gated by that script. The requested 92.8% aggregate comparison
is also reported independently; neither the baseline nor exclusions are relaxed.

All X11 runtime modules must remain byte-identical to campaign base `ef119814`.
This finishing round changes no shared computer runtime code.
