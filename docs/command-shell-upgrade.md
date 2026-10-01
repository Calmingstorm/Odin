# Local command shell upgrade (v4.12.0)

`tools.command_shell` applies only to opted-in raw local model/skill commands:
`auto` (default) selects available bash, `bash` refuses before dispatch if
unavailable, and `sh` retains `/bin/sh -c`. Code-built internal commands always
stay `/bin/sh`, without shell annotations, independent of this setting.
The instant compatibility rollback is `tools.command_shell: sh`. Changes affect
new dispatches only. Each background record stores the resolved shell and path;
restored pre-upgrade records correctly default to sh. Cleanup never discovers a
shell or reads the current shell setting. Raw-command discovery is repeated at
dispatch on the actual local target, not cached under a mutable host alias.

Bash starts non-login/non-interactive with `--norc --noprofile -c`. Only this
invocation loses `BASH_ENV`, `ENV`, `SHELLOPTS`, `BASHOPTS` and exported bash
function entries; ordinary environment variables survive. No option defaults,
rewrites, syntax guesses, cross-shell retries or remote changes are introduced.
Explicit `run_script` interpreters are unchanged; its local wrapper and all
fixed internal probes stay POSIX.

## Behaviour changes from dash to bash

- `echo` no longer interprets backslash escapes by default, and `echo -e` is
  honoured. Use `printf` when escapes matter.
- Unquoted `{a,b}` and `{1..N}` expand into multiple words.
- `$'…'` decodes ANSI-C escapes.
- Glob match order follows the locale (for example `LANG=en_US.UTF-8`), not
  raw byte order.
- `$?` after a failed builtin can differ: failed `cd` returns 2 under dash
  and 1 under bash.
- Error messages use `bash: line 1:` rather than `/bin/sh: 1:`.
- `tools.command_shell: sh` remains the immediate rollback.

## Exact opt-in boundary (B3 scope correction)

Only raw model/skill command text opts into this setting: local `run_command`,
`run_command_multi`, new local `manage_process` starts, `validate_action`
`type=command`, and skill `run_on_host`. Workflows, delegated steps, scheduled
checks, loops and agents inherit it through those tools, not through a universal
runner switch. A workspace does not imply a configurable shell.

The shared executor, local runner and supervisor default to `/bin/sh` without
reading live shell config or discovering bash. All code-built commands retain
their POSIX shell and byte-identical stdout: `read_file`, `apply_patch`, the
`run_script` wrapper, host/local `http_probe`, non-command validation probes and
internal helpers. Explicit script interpreters still execute exactly as selected.
Internal transports never append command-shell presentation annotations.

Runner call-site audit: SystemTools opts in only its two raw command handlers;
its script wrapper does not. ValidationTools receives an independent opt-in
flag from `run_bundle` only for command checks. SkillContext uses admitted
`run_command`; its transport-only compatibility branch opts in explicitly.
FilesDocsTools and BrowserWebTools do not opt in. Executor's audit/diff callback
and `_exec_remote_target` do not opt in. ProcessRegistry gets a live mode provider
only from the public process-tool registry wiring; its shared default is sh and
remote supervisor operations remain unchanged. All production calls to
`run_local_command` and `create_supervised_shell` are accounted for by these paths.

Real harmless-process scope tests read `/proc/$$/exe` before unaltered tool-built
commands and compare exact UTF-8 output against sh with `auto` and `bash` set.
They also poison raw-command config lookup to prove internal routes do not read
it. Framing, raw exit statuses, typed timeout provenance and verified ownership
settlement remain covered; blocked/destructive syntax remains classification-only.

## Exit wording and consumers

Ordinary failures keep `Command failed (exit N)` and their raw status, including
negative signal statuses. Successful command and skill result text stays byte-identical
to v4.11.0; effective shell appears only in dynamic contracts, process records and
the process API, never as a result footer or process-list column. Signal names
accompany negative statuses. Opted-in local timeout reports `Command timed out (exit N)`
with the **observed** raw leader status, which can be zero when a TERM handler
exits zero. Typed failure provenance still marks that timeout unsuccessful.
Internal transports retain exit 1 and `Command timed out after N seconds` on
timeout, plus the historical `Command failed` host wrapper where applicable.
`run_script` retains `Script failed (exit N)`; it is not opted in.
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
Comma expansion exceeding 32 candidates fails closed as critical. Numeric ranges
use bounded endpoint/policy-literal checks rather than enumeration; character
ranges in command positions retain interior alternatives to detect synthesized
commands. Harmless echo/printf/touch arguments use endpoints. This is conservative on all
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
or disconnects, with a two-second bound if the acknowledgement never arrives.
An acknowledgement never substitutes for empty-tree evidence;
loss before clean settlement still vetoes restart and shutdown. Pidfds/start IDs
and process-group ownership are unchanged. Descendant discovery tolerates a
process vanishing mid-scan (ENOENT/ESRCH, or a fresh stat proving it gone), then
rescans before settlement. Genuine ownership errors remain fail-closed. The
ordinary 20ms cadence is retained without the short-lived startup fast-poll.

Normal foreground completion returns at leader exit plus output EOF, just as in
v4.11.0. It does not terminate surviving descendants or await settlement. The
supervisor remains responsible for them asynchronously; timeout, cancellation
and shutdown still reap the exact owned tree. The bounded ACK is off the normal
foreground return path. Separate direct protocol tests cover delayed/missing
ACK, wrong ACK and owner disconnect after proven empty settlement. Main chat
and autonomous-agent catalogs share ToolCatalog's live shell decoration; static
offline reference generation stays host-independent.
Shell guidance lives only in dynamic tool contracts. The system prompt is
byte-identical to the pre-campaign master version; its size pins remain 5000.

After branch deployment, run a comparative harmless-fixture soak only, never
shadow-run operational commands. Compare stdout/stderr, raw exit and signals,
stdin, TERM/KILL escalation, cancellation, timeout and verified settlement.
Deployment and that live qualification are separate operator actions.
