# Local command shell upgrade (v4.12.0)

`tools.command_shell` is local-only: `auto` (default) selects available bash,
`bash` refuses before dispatch if unavailable, and `sh` retains `/bin/sh -c`.
The instant compatibility rollback is `tools.command_shell: sh`. Changes affect
new dispatches only. Each background record stores the resolved shell and path;
restored pre-upgrade records correctly default to sh. Cleanup never discovers a
shell or reads the current shell setting. Discovery is repeated at dispatch on
the actual local target, not cached under a mutable host alias.

Bash starts non-login/non-interactive with `--norc --noprofile -c`. Only this
invocation loses `BASH_ENV`, `ENV`, `SHELLOPTS`, `BASHOPTS` and exported bash
function entries; ordinary environment variables survive. No option defaults,
rewrites, syntax guesses, cross-shell retries or remote changes are introduced.
Explicit `run_script` interpreters and fixed `sh` probes remain explicit.

## Exit wording and consumers

Ordinary failures keep `Command failed (exit N)` and their raw status, including
negative signal statuses. Local results report effective shell; signal names
accompany negative statuses. Timeout now reports `Command timed out (exit N)`
with the **observed** raw leader status, which can be zero when a TERM handler
exits zero. Typed failure provenance still marks that timeout unsuccessful.
Cancellation propagates after owned cleanup; managed jobs preserve separate
`termination_reason` and `cleanup_verified` fields. Neither leader exit nor a
raw status proves descendants were cleaned.

Audited consumers: executor tuple/result handling, result validator, recovery
timeout classifier, tool-text failure labels, multi-host aggregation,
background-task error recognition, scheduled execution and workflow conditions.
Ordinary `Command failed` substring conditions still match ordinary failures.
Timeout conditions should match `timed out`; they must no longer interpret a
timeout as an ordinary command failure. Conditions inspect literal output
substrings, including command-provided output, and are not outcome evidence.
Post-validation receives raw output/status, not model-facing shell annotations.

Governor tests are classification-only. Literal comma and character-range brace
forms are classified without a shell, and critical process-substitution bodies
are recognized. Quoted brace literals do not spend the expansion budget.
Unquoted expansion exceeding 32 candidates fails closed as critical rather than
discarding dangerous branches. This is intentionally conservative on all
transports: the regex classifier is not a complete shell interpreter. Computed
commands and arbitrary shell obfuscation remain outside its guarantees.

## Read-only automation inventory

Coordinator inspection found three schedules: two reminders without commands,
and the daily New Eden Killstream check targeting remote `server`, running
`/opt/eve-intel-toy/.venv/bin/eve-stream-report --database /var/lib/eve-intel/eve-stream.sqlite3 --hours 24 --discord-report`.
No persisted workflow steps were present. No inventory command was executed.

Ten existing skill templates were inspected. `curseforge_manage` and
`dynamic_odyssey_release` contain localhost sudo helper calls with quoted
arguments. `cyberpower_ups` has local/configurable POSIX `||` and `2>&1` fallbacks.
`amp_manage` has local Python heredocs/socket checks, SSH tunnel setup, and
remote sudo AMP/probe pipelines (`ss`, `sed`, `tail`, `find`, `sort`, `head`).
`minecraft_control` has local/configurable quoted curl arguments.
`mc_modpack_update` has remote/configurable quoted CLI calls. The remaining
Cloudflare, photo-editing, Linode and webcam templates contain no `run_on_host`
literals. No dash-specific constructs or bash-only syntax were found in these
persisted templates. Dynamic runtime inputs are not exhaustively covered.
Credential values were not included in this inventory or its output.

## Ownership qualification

The real sh/bash matrix exposed a pre-existing rapid-exit control-socket race:
the worker flushed verified-empty settlement then closed while the registry's
exit watcher sent termination, causing BrokenPipe on the shared stream before
buffered settlement could be consumed. The worker now holds its already-empty
ownership channel until the parent acknowledges **consumed clean settlement**
or disconnects. An acknowledgement never substitutes for empty-tree evidence;
loss before clean settlement still vetoes restart and shutdown. Startup,
pidfds/start IDs, process-group ownership and descendant scans are unchanged.

Foreground success now waits for the same verified settlement used by timeout
cleanup, in both shell modes. Previously a foreground leader could return before
the owner consumed clean settlement, allowing event-loop teardown to abandon
the monitor. This is an intentional truthfulness fix, not a sh option change.
Raw stdout/status remain unchanged. Separate direct protocol tests cover delayed
ACK, wrong ACK and owner disconnect after proven empty settlement. Main chat
and autonomous-agent catalogs share ToolCatalog's live shell decoration; static
offline reference generation stays host-independent.

After branch deployment, run a comparative harmless-fixture soak only, never
shadow-run operational commands. Compare stdout/stderr, raw exit and signals,
stdin, TERM/KILL escalation, cancellation, timeout and verified settlement.
Deployment and that live qualification are separate operator actions.
