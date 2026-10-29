# Changelog

All notable changes to Odin are recorded here, written for operators rather than
from commit subjects. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Each GitHub release body is the matching section of this file.

## [Unreleased]

### Added
- **`wait_for_agents` can return when the first agent finishes (#746).** The new optional `return_when: "any"`
  returns the whole roster as soon as any listed agent has finished, so a parent can act on the first result
  while the others keep running. An agent that finished earlier counts, including one whose result is only on
  disk now, so the description tells the model to leave out the IDs it has already handled. Nothing is
  cancelled, and a parent message still interrupts the wait first. Omitted, `return_when` is `"all"`, as
  before.
- **A Discord reply now carries the message it replies to (#745).** Before, a reply to an old message reached
  Odin with no sign of what it pointed at. Now, when a person replies to an earlier message, Odin also gets that
  message, quoted and labelled as history:
  - its author (marked when it is Odin's own), when it was sent, its text and its embed text (title,
    description and fields);
  - the files it carried (name, size and a link that may expire);
  - its still images, under the same `attachments.image_max_bytes` limit as the reply's own images, counted on
    the bytes as they arrive.
  - The quoted message is history, not a new request. It is quoted line by line between explicit start and end
    markers, and a credential in it is masked; it never gets the new reply deleted.
  - Only a person's direct reply in the same channel is resolved. Bot and webhook messages, forwards and a bare
    `continue`/`resume` command (which still resumes preserved work) are handled as before.
  - A replied-to message that was deleted, or can't be loaded within 10 seconds, is named as such and the reply
    goes ahead; an image still loading at that point is named as not shown.
  - A reply with no text of its own (just the mention) now gets an answer about the message it points at; before,
    it was ignored.
  - The completion check judges a reply against its whole request, quoted message included. Trajectories record
    the quoted history (`reply_context`, `reply_turn`) under the same `observability` settings and secret
    scrubbing as the request text. Every other turn's inputs are unchanged.
  - `discord.reply_context` (default `true`, also on the WebUI Discord page) turns it off, which handles replies
    exactly as before.
- **The WebUI Chat page can stop and correct a running turn, and shows what it is doing (#744).** Before, the
  message box was disabled during a turn and the page showed rotating phrases, and nothing in the WebUI or the API
  could stop a web turn (on an install without Discord, only a restart could).
  - **Stop** stops the running turn the way Discord `/stop` does: after the tool call in progress settles. The
    page shows it stopping, then the turn's own answer.
  - While a turn runs, Enter sends what you type as a correction (a steer), shown as its own bubble with its
    receipt: waiting for the next step, used, not used, or not sent.
  - The status line names the turn's own tool call in progress (for example "Running run_command · 14 s"), or
    "Thinking". It never shows a tool's input or result, and agents' calls aren't shown.
  - New route `POST /api/chat/stop` (self-service, like `/api/chat/steer`): `session_id`, `channel_id` (admins),
    `message_id` and `wait_seconds` (default 10). A non-admin may stop only a web turn it started, with the same
    token policy. Both routes take an optional `message_id` that acts only on the turn that question started;
    without it they behave as before.
  - A web turn's owner gets `chat_control` (stop and correction receipts) and `chat_status` (tool start and end)
    messages on their WebUI sockets.
- **The WebUI Chat page can attach files and images to a message (#747).** Before, the WebUI and the REST chat took
  text only.
  - Attach by the paperclip, by pasting a screenshot, or by dropping files on the message box. Each file uploads at
    once, shows its progress, and can be removed. A message may be files only.
  - The files go through the same processing as a Discord message's: images become vision input for that turn,
    text files and PDFs are read in, archives are listed, and other files are saved with their path. The
    `attachments.*` limits apply as they do on Discord.
  - New route `POST /api/chat/uploads` (multipart, one file per request; self-service). `/api/chat` and the
    WebSocket chat take an optional `attachments` list of the returned ids; `/api/execute` takes none.
  - Limits on this new upload path: 50 MiB per file, 10 files per message, at most 100 files and 500 MiB staged
    per identity and 1,000 files and 1 GiB in all, and 15 minutes per upload. A full store refuses new uploads.
  - Staged files live in `data/web-uploads/` (0600, server-chosen names). A question's files are deleted once
    processed, and unused ones after 24 hours. **Upgrade note:** if you back up the data directory, exclude
    `data/web-uploads/`.
  - A file is never attached to a correction sent during a running turn; it waits for your next message.

### Changed
- **`wait_for_agents` shows fuller results (#746).** Each agent's preview now uses as much of the existing
  `tools.tool_output_max_chars` budget as the roster leaves, up to 8,000 bytes per agent, instead of stopping
  at 800. A result that fits arrives whole, without a follow-up `get_agent_results` call. The roster still
  shares one budget equally (short results leave room for longer ones), and `get_agent_results` still pages
  through anything longer. Wait results are therefore larger than before; the tool output budget itself is
  unchanged.
- A `wait_for_agents` call that returns early because of `return_when: "any"` no longer logs a timeout warning.

## [4.25.0] - 2026-10-26

A new Codex model, `gpt-6.1-terra`: capable, slightly less capable than `gpt-6.1-sol`, and cheaper.

### Added
- **`gpt-6.1-terra` is a supported Codex model.** It sits between `gpt-6.1-sol` and `gpt-6-sol` everywhere models
  are listed: the WebUI Model, Agent Model and Auxiliary selects, the model catalogue, and the agent catalogue.
  - It accepts all six reasoning efforts, `none` through `max`. (`gpt-6.1-sol` rejects `none`.)
  - Its measured usable-input floor is 921,847 tokens (probed 2026-10-26), the same class as `gpt-6.1-sol`.
  - The agent catalogue describes it as "capable model, slightly less capable than gpt-6.1-sol but cheaper; use
    for cost-sensitive coding and agentic work, escalating to gpt-6.1-sol for harder problems". An operator hint
    for it replaces that text, as for every model.

### Changed
- **Installs whose agent model is `auto` with an empty allowlist can now pick `gpt-6.1-terra`** for spawned
  agents, because that default candidate list now includes it.
  - Upgrade note: an explicit `agents.auto_model_allowlist` is your policy and is not changed; add
    `gpt-6.1-terra` to it yourself to let agents use it.
  - Fresh-install defaults are unchanged: main `gpt-6.1-sol`, auxiliary `gpt-6-luna`; agent selection remains
    `auto`.

## [4.24.1] - 2026-10-23

The WebUI Chat page keeps the newest message in view.

### Fixed
- **The WebUI Chat page keeps the newest message in view (#738).** A reply whose image loaded after the reply was
  shown (a posted file such as a phone photo, a screenshot, an inline image link) left the end of the chat out of
  view. Every new message also pulled the page to the bottom, even while you were reading earlier messages.
  - While you are at the bottom, Chat now follows new messages and content that grows: an image finishing loading,
    or the window or a phone keyboard resizing the list.
  - Once you scroll up, it stays where you are until you scroll back to the bottom or send a message.
  - Its automatic jumps are instant rather than animated, as on the Logs page.

## [4.24.0] - 2026-10-23

`post_file` can post a file a tool returned, such as a photo from a phone MCP server.

### Added
- **`post_file` can post a file a tool returned.** A new `attachment` field takes a retained file's cursor (the
  one its attachment-manifest entry gives, ending in `:0`) in place of `host` and `path`. That covers an MCP
  result's file, such as a photo from a phone MCP server, and a retained Discord upload.
  - Binary pages show a `post` hint when it fits; their byte ranges are unchanged. Manifests and the
    `[output retention]` line are unchanged.
  - The file needs the same permissions as reading it with `get_tool_output`, plus `post_file`.
  - The bytes are posted unchanged under a derived name, after their SHA-256 is checked.
  - Before, such a file could only be read back as base64 pages, and posting it took a script against the output
    store.

### Changed
- **`post_file`'s `host` and `path` are no longer listed as required**, because an attachment post has neither.
  Host and path posting is unchanged: without `attachment`, `post_file` behaves exactly as before and never opens
  the output store. A call that gives both sources, or neither, gets an error and posts nothing.
- A web or API chat whose reply has already been sent can't receive a retained file. Posting one there is refused
  before anything is sent. Background tasks still can't post files.

## [4.23.0] - 2026-10-23

Fixes for the five issues left open after 4.22.0 (#730-#734), and one more found in their review.

### Added

- **Chat messages have stored ids.** `POST /api/chat` and the WebSocket `chat`
  message accept an optional `message_id`, the caller's id for its question
  (1-64 letters, digits, `_` or `-`). An invalid one is refused (HTTP 400, or
  `chat_error` on the socket), and one already used in that chat is refused
  before anything runs (HTTP 409, or `chat_error`). Without one, the question
  gets an id. Replies, including the 502 answer of a turn that ended in an
  error, carry `question_id` and `reply_id`: the stored ids of the question
  and of the reply or its stored error marker, each only while it is stored.
  `GET /api/sessions/{id}` returns each message's `message_id` (`null` for
  messages stored before this release; a Discord session's ids are its
  Discord message ids). The WebUI Chat page uses them (#730, #731).

### Changed

- **A managed host that stops answering ends its calls in about a minute.**
  Odin's SSH connections sent no keep-alive, so a host that went to sleep or
  dropped off the network mid-command held the call until its tool timeout
  (900 s for `run_command`, 300 s for `read_file` and `apply_patch`), and a
  pooled connection to it held the next call too. SSH now sends a keep-alive
  every 15 seconds and ends the connection after three go unanswered, about
  45-60 seconds of silence. Any data from the host resets the count, so long
  quiet commands keep their connection. A call ended this way reports that its
  outcome is unknown, as a timed-out call did, and is never sent again; a call
  through a pooled connection also says the connection was lost. The next call
  opens a new connection, which fails within its 10-second connect timeout
  while the host is still away (#733).

### Fixed

- **A Codex pool reload that cannot write keeps the accounts as they were.**
  A refreshed sign-in whose save fails (a full disk) is kept in memory until a
  save succeeds, since the refresh token it replaced is spent. A pool reload
  (an account edit, another account's removal) that itself failed to write
  while the disk was still full dropped that account's in-memory state, and
  the next reload rebuilt it from the spent token, so the account failed until
  it was signed in again. A reload now writes its files before it changes
  anything in memory, the credentials file last; a reload that fails leaves the
  accounts, the chosen account and the unsaved sign-in as they were, and puts
  back the account files it had already changed. Removing an account writes the credentials
  file before the reload, so when that reload fails, the removal is now undone
  and reported (HTTP 500, "the account was not removed") rather than leaving
  the file and the kept accounts out of step (#732).
- **Removing a Codex account no longer loses a later account's newest
  sign-in.** When an account's refreshed sign-in reached its own file but not
  the shared credentials file (that second write failed), removing or
  reordering an account listed before it moved it to another slot. The reload
  then read the older sign-in from the shared file and overwrote the file
  holding the newer one, so the next refresh used a spent token and the
  account failed until it was signed in again. The reload now carries the
  account's newer sign-in to its new slot and into the shared file. A record
  edited or re-authorized in the file still wins.
- **The Chat page shows a message sent while the history loads once.** A turn
  sent and answered while the page's history request was still running could
  appear twice: once from the stored history and once as sent. The page now
  matches the two by the turn's stored ids, never by text (the same text can
  be sent twice), wherever the history and the reply arrive in time (#730).
- **A reply's files and tools stay on the Chat page across visits.** The
  stored history keeps a reply's text only, so its files and tool list were
  shown only until the page was left, and a reply received while away kept
  them for one history load. The page now holds them, by the reply's stored
  id, for the rest of the sign-in, so every later visit and load shows them on
  that reply (and on no other reply with the same text). A stored error
  marker shows the error that was shown. A full browser reload, or another
  browser, still shows the text only, as before. The page keeps the newest 50
  such replies and up to 64 MiB of their file data, oldest first, always
  keeping the newest. What the page keeps between visits (a turn still
  running, a reply received while away, these details) now belongs to the
  sign-in: signing out, an expired session or another sign-in starts it over
  (#731).
- **A failed `run_script` test gets a stale-branch note about the right
  repository.** The branch check read only the script's first 120 characters,
  so a leading `cd` into a long folder path was lost and git ran in the
  workspace; a workspace clone behind its upstream then put a false note on the
  result. The check now reads the whole script (#734).

## [4.22.0] - 2026-10-22

Fixes from the 2026-10-22 code review (GitHub issues #674-#728; 25 of the 55
filed issues were confirmed and are fixed here, the rest were closed).

### Changed

- **Reminders and webhooks start on time beside running work.** The scheduler
  ran every due schedule one after another, so a long `check` or a `workflow`
  waiting on its agent held every other schedule: a reminder due with or after
  it fired only when it ended. Due schedules now run in lanes by kind
  (reminders, webhooks, and work: checks, workflows and digests). Each lane
  runs one scheduled run at a time, earliest due first, and no lane waits for
  another. The scheduler still never starts two pieces of work side by side,
  so its workflows do not compete with each other for agent slots; manual
  (Run now) and trigger runs stay outside the lanes, as before. A schedule that
  waits for its lane is not reserved meanwhile; it starts as soon as the
  running one ends, and the log says once that it is waiting. A recurring schedule whose run outlasts its
  interval still runs again as soon as that run ends, and a schedule changed
  while it waits runs once, as changed (#708).
- **Housekeeping also runs on a timer.** The periodic pass (agent health
  checks, turn-state sweeps, workspace and cache cleanup, channel-log
  indexing) ran only after a successful Discord reply. An install used only
  through the WebUI or the API never ran it, and a quiet Discord install
  skipped it. A timer now checks the same throttle, so the pass runs at most
  once per cleanup interval, as before (#715).
- **Loops and background tasks started in a WebUI or API chat post into that
  chat.** Their posts went to the starting turn's capture list, which nothing
  reads once the turn has answered; a loop's first iteration, which runs at
  once, was lost the same way while that turn was still running. They are
  now posted to the chat from the start (files sent while the starting turn
  still runs go with its reply, as before) and stored with the chat,
  shown in the WebUI Chat page (live when it is open, marked "later post"),
  returned by `GET /api/sessions/{id}` as `posts`, and read by `read_channel`
  in that chat, like posts in a Discord channel. They are saved within a few
  seconds of arriving, without waiting for the next turn. They never enter
  the conversation history, the prompt or compaction. Restarting such a loop
  now works instead of answering 404. A stateless `/api/execute` request
  keeps no chat, so later posts from whatever it started are dropped, as
  before, and such a loop still cannot be restarted (#706).

### Fixed

- **Web and API chat work when the main model is not Codex.** With an
  OpenAI-compatible or Ollama main model and the Codex provider disabled,
  every `/api/chat`, `/api/execute` and WebUI chat answered "No LLM backend
  available." Web chat now checks the serving client, as Discord does (#705).
- **`create_skill` no longer deletes a skill file that failed to load.**
  Creating a skill with the name of a file that failed to load overwrote that
  file, and deleted it when the new code did not load either. A rejected
  candidate now puts the original file back, and a file that holds another
  loaded skill is never overwritten (#674).
- **Patching a hard-linked file no longer changes the other link's
  permissions.** `apply_patch` made the original file private while it waited
  in its recovery slot and never gave it its mode back after a successful
  patch, so another hard link to it was left at 0600 (#677).
- **One stalled WebUI page no longer holds up tool calls.** Audit and
  tool-stream events were sent to WebUI subscribers while the tool call
  waited, and a page that stopped reading (a sleeping laptop, a background
  phone tab) held every audited tool call until the connection timed out.
  Events now go out in the background; a page too slow to keep up misses live
  updates instead (#709).
- **A failed tool batch waits for its other calls.** When one call in a batch
  of parallel tool calls failed on purpose (a ledger write failure fails the
  turn closed), the turn ended while the other calls still ran: `/stop` no
  longer reached them and the restart check saw no active turn. The failure
  now waits until every call of the batch has settled (#723).
- **`/stop` and steering keep working after a chat's session is cleared.**
  Clearing or resetting a conversation while Odin was working in it (from the
  WebUI, the API or `purge_messages`) made the next housekeeping pass drop the
  running turn's registration (#707).
- **The "branch may be stale" note checks the test's own repository.** After a
  failed test command, Odin ran its git check in his own working directory
  (the install checkout) instead of where the test ran, fetched there, and
  reported that checkout's state. It now runs in the test's directory (a
  leading `cd DIR &&`, else where the command ran), compares against the
  branch's configured upstream, and stays within its 15-second budget. A
  `cd` target that the shell expands (`$VAR`, `~`, globs, and `$...` or
  backticks even inside double quotes) is not re-run: the check then uses
  the directory the command ran in (#699).
- **A first install that fails partway retries as a fresh install.** The
  package copied `config.yml` before installing dependencies; if that failed,
  the retry took the install for an upgrade, so setup never started and the
  service was not enabled (#698).
- **Scheduled webhooks follow the outbound-webhook destination rules.**
  Private and homelab addresses stay allowed; cloud-metadata and link-local
  addresses are refused for the configured URL, every redirect hop and every
  resolved address, as for outbound webhooks (#724).
- **Rotated Codex credentials survive a failed write.** If saving refreshed
  credentials failed (a full disk), the new single-use refresh token was lost
  and the next refresh sent the consumed one, so the account needed a new
  login. The new credentials now stay in memory, also across a reload of the
  account pool, and are saved on the next request (#714).
- **`search_history` searches archived conversations newest first.** It took
  them in file-name order, so archives of API identities and higher channel
  ids came first whatever their age (#713).
- **A document sharing one chunk with a source that repeats it is stored.**
  The near-duplicate check counted stored copies of a chunk, so a source that
  repeated a chunk made an unrelated document look like a 90% duplicate
  (#710).
- **Session exports include every summary segment.** Exports carried only the
  legacy summary field, which compaction empties (#711).
- **Native tools accept null or blank optional numbers.** With
  OpenAI-compatible and Ollama models, a null or blank `limit`, `count` or
  `duration_hours` raised `TypeError`; it now means the default, and a value
  that is not a number gets a clear error (#716).
- **Email with an unknown charset label can be read.** An unknown label (such
  as `unknown-8bit`) failed the message and its whole listing; such text is
  now read as UTF-8 (#688).
- **Image-only PDFs get the no-text guidance.** A scanned PDF returned empty
  page headings instead of the existing "no extractable text" message (#701).
- **The Sessions page labels API conversations correctly.** A conversation
  started through `/api/chat` without `session_id` was listed and filtered as
  Discord (#719).
- **A loop's detail view no longer reads the whole trajectory history.** Each
  poll scanned every daily trajectory file for a loop with few rows; it now
  stops at files older than the loop (#720).
- **Channel-log indexing no longer re-reads each log from the start.** Every
  housekeeping pass parsed every line of every channel log to find its place,
  blocking Odin for most of a second on a long history (#726).
- **A message's saved attachments stay until its turn ends.** With a short
  `attachments.retention_hours` (0 is allowed), a cleanup pass during a turn
  could delete the files that turn was reading: another channel's reply
  triggered the pass, and now so can the housekeeping timer. Cleanup now
  skips the workspace of every message still being handled (#715).
- **WebUI Memory page:** Refresh shows current values, and an open scope keeps
  its entries after Add or a bulk delete (#692).
- **WebUI Chat page:** leaving Chat during a long turn and coming back shows
  the turn as running and then its answer, once and with its files (#695).
- **README:** the Quick start shows the guided setup, and Odin Desktop's
  platforms include macOS (#728).

## [4.21.1] - 2026-10-21

### Fixed

- **A malformed reply is no longer a silent loop's quiet answer.** Since
  4.21.0, a silent loop takes a reply that finished normally with no text as
  the iteration's answer. With an OpenAI-compatible provider or Ollama, a reply
  whose `tool_calls` field was malformed but empty (`{}`, `false`, `0` or `""`,
  streamed or not) was taken as one too. It is now an empty reply and is
  retried, as before 4.21.0. A missing or null `tool_calls` field, or an empty
  list, still means a reply without tool calls. Replies with text are
  unchanged, and Codex replies are not affected.
- **An Ollama reply with null content no longer fails with a Python error.**
  A finished Ollama reply whose `content` was null failed with
  `AttributeError` before Odin could check it. It now counts as a reply
  without text: a silent loop takes it as a quiet answer, and every other
  caller gets the usual empty-reply handling. Content that is not text also
  counts as no text, but it is never taken as a quiet answer. An Ollama reply
  whose `tool_calls` field is null or `false` no longer fails this way either.
- **The 4.21.0 notes overstated `/stop`.** `/stop` does not cut short a
  command that its own turn is already running: the stop still waits until
  that command finishes or reaches its time limit, and then cancels the agents
  the turn started, with their remote commands. The 4.21.0 notes now say so.

## [4.21.0] - 2026-10-21

### Changed

- **A remote foreground command now stops when its call does.** On a remote
  host, `run_command`, `run_script`, `run_command_multi` and `validate_action`
  checks stopped only the local `ssh` client when the call was cancelled
  (`kill_agent`, an agent killed from the WebUI, or the agents of a turn
  stopped with `/stop`), timed out, or Odin stopped. The SSH
  channel has no terminal, so the remote command got no hangup and ran on: in
  a live test, a killed agent's `sleep` kept running on the host. These
  commands now run under a small Python coordinator on the host that owns the
  command's process group. When the channel closes before the command has
  finished, the group gets TERM, then KILL after 3 seconds. Output, quoting and
  exit codes are unchanged, except that a command killed by a signal now exits
  with 128 plus the signal number, as in a shell, where `ssh` reported 255.
  Local commands were already stopped this way.
  - A command has finished once it has exited and its output has closed.
    Background work it started with its output sent elsewhere
    (`nohup job >/dev/null 2>&1 &`) keeps running, as before.
  - The host needs `python3` (3.6 or later, as remote background jobs already
    do). Without it the command runs as before, without this cleanup, after a
    one-line `odin: python3 is not available on this host ...` notice in its
    output. On macOS, `/usr/bin/python3` counts only when the developer tools
    are installed.
  - The command still runs under the account's login shell. That shell's
    non-interactive startup files (such as `~/.zshenv`) now run once more.
  - `run_script` also removes its temporary script file when the script is
    stopped with TERM, HUP or INT.
  - `/stop` does not cut short a command that its own turn is already
    running. As before, the stop waits until that command finishes or reaches
    its time limit, and then cancels the agents the turn started, with their
    remote commands.
- **A remote command that may have started is never sent twice.** The same
  commands were sent again after a timeout or a connection error (exit status
  255), which could start a second copy while the first was still running.
  Now only the setup of a shared SSH connection is retried, because nothing
  has been sent at that point. Once the command has been handed to `ssh`, a
  timeout or an exit status of 255 is returned as is and marked as an
  uncertain outcome, because the command may have run. Without connection
  sharing, a command gets a single attempt. Other SSH operations, such as
  file reads and patches, keep their retries.

### Fixed

- **A silent loop's quiet iteration is no longer retried or counted as a
  model failure.** A silent loop answers an iteration with nothing to report
  by replying with nothing. Every provider treated that empty reply as a
  failed request: the Codex client sent it two more times and recorded a
  failure on the model's circuit breaker. For silent loops only, a reply that
  finished normally with no text is now the iteration's answer on its first
  request, and it counts as a success. A refusal, a filtered or truncated
  finish, an unfinished stream, a malformed reply or a pending tool call is
  still not accepted. Text written earlier in the iteration, before a tool
  call, stays in the trajectory and is not reported as the answer. Chat,
  agents and notify loops keep the old handling of an empty reply.
- **`read_channel` works in web and API chats.** It failed there with an
  error, because a web chat has no Discord history. In a web or API chat,
  `read_channel` without a `channel_id`, or with the chat's own ID, now reads
  that chat's stored conversation: the last `limit` messages (10 by default,
  up to 100), oldest first, with UTC times. The result says that this is not
  live channel history and, when older messages were compacted into a
  summary, that the summary is not reproduced. A loop or agent started from
  that chat reads the same
  conversation. A numeric Discord channel ID is read as before, and Discord
  chats are unchanged.

### Known limitations

- The coordinator cannot stop processes that leave the command's process
  group or session (`setsid`, daemons), and nothing stops the command if the
  coordinator itself is killed with SIGKILL or the host fails. During a
  network partition, the cleanup waits until the host's `sshd` notices that
  the channel has closed.

No configuration change or migration.

## [4.20.0] - 2026-10-20

### Changed

- **Killing an agent now stops the background jobs it started.** `kill_agent`
  used to cancel the agent and leave its `manage_process` jobs running: in a
  live test, a killed agent's `sleep 300` kept running until its parent found
  and killed it. Killing agents with `kill_agent`, from the WebUI or through
  `/stop`'s turn cascade now fences them at once:
  - their new starts are refused, and a start still settling is stopped as
    soon as it registers;
  - their running jobs, and finished ones whose cleanup was never verified,
    are stopped through the normal kill path;
  - `kill_agent` reports what was stopped, what was still starting and what
    could not be confirmed. A remote job whose process group alone was verified
    empty keeps its `containment=process_group_only` caveat. The cleanup keeps
    running past that report; the WebUI and `/stop` log its outcome instead.

  Unchanged on purpose: an agent that completes, fails or times out does not
  stop its established jobs, so services an agent was asked to start keep
  running. A start whose call is cancelled before it settles (for example by a
  tool deadline) is cleaned up when it settles, since nothing will receive its
  reply.
- **An agent's remote start that may still be running stays owned until a
  teardown is proven.** Such a start lost its settlement and its teardown could
  not be verified. It keeps its host lease and a concurrency slot, and killing
  the agent or force-revoking the host retries the teardown. An in-place
  restart (WebUI self-update, setup wizard) is refused while such a start is
  unverified or an agent's start is still settling.
- **`search_audit` returns one result per tool call.** Every chat tool call
  writes a call record plus start and end events, and each was listed as its
  own row, so every call came with two phantom `by ? (denied, 0ms)` rows.
  - Records are grouped by call before filtering and the limit, and the limit
    counts calls.
  - Any record of a call can satisfy a filter, so every call the old search
    found is still found.
  - Lines show approval and outcome separately, and say when a keyword
    matched only the result text.
  - The `status` filter now matches, with the outcome names (`succeeded`,
    `failed`, `denied`, ...) and the aliases `error` and `success`.

  Raw `audit.search`, `GET /api/audit` and the WebUI audit view are unchanged.
- **A remote background start makes one direct SSH attempt**, with connection
  sharing off. Other process operations keep their retries. See the
  unreachable-host fix below.
- **The Discord typing indicator runs in the background.** A turn waited for
  the typing request twice per step, before the model call and before the tool
  batch: about 150 ms per tool batch, and up to a second when Discord was slow
  (170 such timeouts in October). One background keeper per turn now refreshes
  the indicator every 8 seconds and logs a failure once. Web and API turns,
  guest chat and loops are unchanged.

### Fixed

- **Raw `read_file` works on hosts whose login shell is zsh**, the macOS
  default. The raw transport set `$status`, which is read-only in zsh, so every
  raw read there failed with `read-only variable: status`.
- **A daily job at a fixed time runs once on the night clocks fall back.**
  After a 01:30 EDT run on 2026-11-01, the next run was computed as 01:30 EST,
  an hour later, so the job ran twice. As in cron, a job whose minute and hour
  fields start with a digit now skips the repeated copy of a time it already
  ran at, even when a later list element is a wildcard (`0,*/5 1 * * *`). A job
  whose minute or hour field starts with `*` (`*/15 * * * *`) still runs in both
  copies of the hour, and the spring-forward change is unchanged.
- **A remote start on an unreachable host fails fast and says nothing was
  started.** Starting a job on a sleeping laptop took about 81 seconds and
  ended `outcome unknown`: the start's last connect error proved nothing, and
  its teardown then waited on the dead host. When the single attempt reports
  only connect or name-resolution failures, the start now fails with `could
  not connect ... nothing was started, so retrying is safe`, and no teardown
  runs. Every other failure is still `outcome_unknown` with a teardown. This
  also removes the risk of a retried start running a job twice.
- **Hybrid knowledge search prefers an exact keyword match in a tie.** A word
  found in only one document came back second, behind an unrelated document:
  the semantic and keyword results tied on the fused score, and the semantic
  one was merged first. Exact ties now go to the keyword result, and knowledge
  results say how they matched (`similarity: 0.66`, `keyword match`, or both)
  instead of showing the fused score. Fused scores and payloads are otherwise
  unchanged. When a limit cuts through a tie, the keyword result is the one
  kept, so the returned set can differ from before.
- **`search_history` respects `limit`.** Session summary and segment matches
  were added without checking it (101 results for `limit: 3`). A blank query is
  now rejected like a missing one.
- **`manage_process` polls offer a continuation only when output was actually
  cut.** A preview that had already shown every retained byte still said
  `truncated=true` and offered a cursor back to the start (647 polls of
  finished jobs in October).
- **`apply_patch` keeps line endings right at the end of a file.** Lines added
  to an empty file got no final newline, and lines appended after an
  unterminated last line were glued onto it (`two` + `three` became
  `twothree`). Existing LF, CRLF and no-final-newline endings are kept byte for
  byte.
- **`read_file` rejects a directory.** Reading a directory, or a symlink to
  one, reported a successful empty range. It now fails with `<path> is a
  directory, not a file.` In numbered mode, gawk's warning about invalid
  multibyte data no longer lands inside the first line of the result.

### Known limitations

- `search_audit` identifies a call by its call ID, which has no generation.
  After a crash and resume, a provider can reuse a call ID, and the two
  executions can then show as one result.
- While `search_audit` scans, a call that is still open (no start record read
  yet) keeps its records in memory; only completed matches are bounded by the
  limit.
- A fixed-time cron job with a year-limited expression in a local time zone
  still falls back to UTC when croniter cannot find a next run.

No configuration change or migration.

## [4.19.2] - 2026-10-19

### Fixed

- **A local command that finished while Odin was busy no longer comes back as
  "Local command supervisor ownership lost".** Every local command runs under a
  small helper process that confirms the command and everything it started have
  exited. The helper reports that, waits up to two seconds for Odin's
  acknowledgement, then exits. When Odin's event loop was busy for longer than
  that (a slow maintenance pass, a large output being stored, heavy load), the
  acknowledgement came too late, and the finished command was reported as a
  failure with an uncertain outcome, although its output and exit code had
  arrived. This was 85% of the "ownership lost" tool failures that could be
  traced in a month of real use. `run_command`, `read_file`, `run_script` and
  the other foreground local commands now return the real output and exit code
  in that case.
  - Unchanged on purpose: the cleanup is still recorded as unverified (the
    warning, the in-place restart veto and the retained ownership all stay), so
    this is not a claim that cleanup was confirmed. Every other failure (a
    command or helper timeout, a protocol or helper error, cancellation) is
    reported exactly as before, and background processes (`manage_process`)
    behave as before.
  - The warning now names the failing stage, for example
    `Local supervisor settlement failed at ack (ConnectionResetError)`; the
    other stages are `worker wait` and `protocol`.

### Changed

- **The channel-history maintenance pass is about two seconds shorter.** About
  every five minutes of Discord activity, Odin checks his searchable channel
  history for inconsistencies, on the event loop, just before a reply is sent.
  One of those checks scanned the whole search table once per channel, which
  took about two seconds on an install with 76 channels and 117,000 indexed
  messages and grows with history. It now runs once per pass and finds exactly
  the same problems in rows written by the indexer itself, the only writer of
  that table in normal operation. If anything else adds a row during a pass,
  in a channel that has a log file, the next pass can detect it; whether it is
  then repaired follows the same rules as before. The other checks, the repair
  path and how often the pass runs are unchanged; if the combined check cannot
  run, the pass falls back to the per-channel checks.
- **Each maintenance pass logs one timing line**, for example
  `Housekeeping pass 12: 1.31s total; channel indexing 1.10s (indexed_count=0); turn-state sweeps 0.13s`.
  It contains no channel IDs or message content.

### Known limitations

- After a late acknowledgement, the command's cleanup is still recorded as
  unverified: its ownership record is kept until Odin stops, an in-place
  restart (WebUI self-update, setup wizard) is vetoed until then, and a
  background process (`manage_process`) affected this way still shows
  `unknown`.
- A background process whose exit was watched early and whose cleanup is
  unverified gets no finished time, so its retained output does not expire on
  schedule. This predates 4.19.2.
- Settlement failures at the worker-wait stage, and ACK-drain timeouts, are not
  covered by this fix. Earlier logs did not record the stage, so the past
  timeout warnings cannot all be called false failures.
- Other synchronous work can still hold the event loop: the turn-state
  retention sweeps (several seconds with a cold disk cache), storing very large
  tool outputs, and skills that run long in-process. This release fixes the
  reported result and shortens the maintenance pass; it does not guarantee the
  acknowledgement arrives within the helper's two-second wait.
- There is no event-loop stall monitor yet.
- `manage_process` still cannot stop a job whose processes run as another user
  (for example started with `sudo -u`); such a job stays `unknown`.

No configuration change or migration.

## [4.19.1] - 2026-10-18

### Changed

- **A full tool-output store now makes room instead of refusing new output.**
  Odin keeps a full copy of each large tool result for up to 24 hours, so he
  can page through it with `get_tool_output` after seeing its start and end.
  The store holds 64 MiB in total. Before, once it was full, every new large
  result lost its middle for good ("no continuation exists") while older
  results waited out their 24 hours; one busy day of agent work hit this 390
  times. Now, when a new result needs room, the oldest results expire early,
  oldest first, and only as far as the new one needs.
  - The cost: a result can become unreadable before its advertised
    `expires_at` when newer output needs the room, and reading it then says
    it expired, as before. `expires_at` is now the latest time a result stays
    readable, and `get_tool_output`'s description says "up to 24 hours".
  - A file bundle (MCP media and attachments) always leaves together with its
    manifest. While a result's files and text are being delivered together,
    the files are held, so neither that result's own text nor other work can
    evict them before the reply is out.
  - Unchanged: the 4 MiB per-result and 64 MiB total limits, the 24-hour
    maximum, reads never extending retention, and the refusal of a result
    that can never fit. No configuration change or migration; the existing
    store is used as is.

### Fixed

- **`apply_patch` says where an ambiguous context matched.** When a hunk's
  unchanged lines match in more than one place, the patch is still refused
  and nothing is written, but the error now lists up to five matching line
  numbers (as the file stands before the patch), each with the nearest
  less-indented line above it, quoted exactly, for orientation. The advice
  now fits which search was ambiguous: an `@@` anchor line that itself
  repeats, the context after a single anchor (that search runs to the end of
  the file), or an anchor chain, including one place reached through more
  than one chain. It also says that an `@@` anchor must equal one whole line,
  without tabs or other control characters. In 18 days of real use, 426
  patches hit this error and about 45% needed more than one more try.

## [4.19.0] - 2026-10-18

### Added

- **Spawned agents can report back while they work.** A new agent-only tool,
  `report_to_parent`, lets an agent queue an interim report for whoever spawned
  it: its parent agent, or the conversation (Discord, WebUI or API turn) that
  started it. The agent gets a receipt at once and keeps working; the receipt
  confirms queuing, not reading. A queued report never wakes the recipient's
  waits or interrupts its work. It is delivered at the recipient's next
  eligible step, in one message marked as agent-produced evidence, not
  instructions. The recipient can answer with `send_to_agent`, and final
  results stay the complete record.
  - Only spawned agents get the tool, at every depth. The main conversation,
    loops, schedules and skills never do, and no skill or MCP tool can take its
    name. `tools.disabled_tools` can turn it off.
  - Empty or whitespace-only reports and reports over 12,000 characters are
    refused. Reports are also refused when there is no recipient (a schedule
    or loop started the agent), when the recipient is stopping or closed, or
    when accepting the report would put the reports waiting there over 60,000
    characters after secret scrubbing. Refusals say why, and agents keep
    needed findings in their final result. Reports are refused, never
    truncated.
  - Waiting reports are held in memory. They are discarded, unread, when the
    recipient finishes, stops, is suspended or replaced, or Odin restarts, and
    they are never replayed. The sender's audit log and trajectory keep the
    report text either way. A report that is read joins the recipient's
    transcript and its normal checkpoint and compression handling. Each
    mailbox keeps its last 1,024 lifecycle records, which agents' trajectories
    include.
  - The WebUI Agents page shows each agent's pending child reports, and the
    audit log records each report's outcome, recipient and sequence.

### Changed

- **`spawn_agent` and `send_to_agent` name the report tool.** `spawn_agent` now
  ends: "When you want interim reports, tell spawned agents to use their
  agent-only report_to_parent tool, not send_to_agent. Reports may arrive at
  later steps without waking waits or interrupting work; reply with
  send_to_agent only if needed. Still collect final results." `send_to_agent`
  adds: "For interim reports to your spawner, use report_to_parent, not this
  tool." Upgrade note: the tool descriptions changed, so each existing
  conversation's next request misses the prompt cache once.
- **Upgrade: finish in-flight agents first.** Running agents and their waiting
  reports live in memory, and a restart does not resume them from saved
  trajectories (a package upgrade restarts Odin if it is running). Before
  upgrading, let agents finish and collect their results.

### Fixed

- **Calls an agent holds back now say why.** When a parent message, a stop or
  the lifetime limit comes before an agent's queued calls start, those calls
  are held back. All of them read "Error (not_executed): Not executed: agent
  stopped or parent correction queued before dispatch.", so agents that should
  carry on read that they might be stopped, and some reported blockers instead
  of retrying. Each held-back call now names its cause. The one an agent
  actually reads says a message from its parent arrived first, that the call
  neither failed nor was stopped, and to reissue it only if it still fits that
  message. In a live test, agents reissued 5 of 6 held-back calls at once and
  adjusted the sixth to the new instruction (before: 2 of 21), and none reported
  a blocker.
- **Agents, loops and schedules act as their real requester.** Inside agents,
  autonomous loops and scheduled runs, tools that read the requester turned
  every non-numeric identity, meaning API tokens and WebUI logins, into user
  `0`. Discord users were not affected. For API and WebUI identities:
  - `post_file`, and `analyze_image` with a host, checked host access for `0`
    (the install's default policy) instead of the requester's own;
  - agents, `delegate_task` jobs, loops and schedules started from there were
    registered to `0`, so their permission checks, host access, audit records
    and result ownership used `0`.

  They now use the real requester. Who it affects: installs where API tokens or
  WebUI logins use agents, loops or schedules. Depending on the install's
  default policy, that work could reach hosts or tools its requester could not,
  or be refused ones it could. Upgrade note: work registered to `0` before the
  upgrade, such as a schedule created inside an agent, keeps that owner;
  recreate it to run as its requester.

## [4.18.2] - 2026-10-16

### Fixed

- **The LLM page shows "Limit reached" whenever routing benches an account for
  its quota.** When the server names the window that reached its limit
  (`x-codex-rate-limit-reached-type`), routing treats that window as limited
  until its reset, also when its percentage reads lower. The page showed the
  window as healthy, and since 4.18.1 without "Quota check failed" either. Now:
  - that window shows "Limit reached";
  - a reached-limit signal with no window shows "Limit reached" instead of "—";
  - a 429 that its quota doesn't explain (for example, a type naming a window the
    reply didn't report) shows "Quota check failed" again.

  `/api/codex/status` gains `limited_windows`, and its `limit_reached` follows
  the same reading as routing (#666).
- **A stale sign-in no longer leaves "Quota check failed" after a restart.** The
  idle quota check now refreshes a rejected access token once, the way requests
  do, and checks again. It no longer records "HTTP 401" until its next run.

## [4.18.1] - 2026-10-16

### Fixed

- **A turn resumed after a reset keeps its own cache ID.** 4.18.0 gave every
  chat turn its channel session's current ID, including a preserved turn
  resumed after the conversation was reset, so the old turn's requests joined
  the new conversation's cache. A turn now keeps the ID it started with for
  its whole life, including the reply a skill hands off after an explicit
  `resume`. A turn resumed after a restart, when that ID is gone, gets its own
  new one, never the channel's current ID; a resume resolves its ID once, so
  other turns running meanwhile cannot change it.
- **An account at its usage limit no longer shows "Quota check failed".** The
  idle quota check counted the 429 that an exhausted account answers with as a
  failed check, so the LLM page showed "Quota check failed" under "Limit
  reached · Resets …". A 429 whose own quota headers show an exhausted window,
  or name the reached limit, now counts as a successful check; a 429 they
  don't explain still shows as a failure.

## [4.18.0] - 2026-10-16

### Changed

- **Codex requests now reuse the prompt cache.** Each conversation sends its
  own random ID (a UUID Odin generates) as the `session_id` header and as
  `prompt_cache_key`, so the ChatGPT backend keeps that conversation's cached
  prompt on one machine. Before this, Odin sent no such ID, and most
  follow-up requests inside a turn re-read the whole prompt: on one busy
  install, 27% of a week's Codex input came from the cache, and in a
  controlled test no follow-up request reused any of the previous prompt.
  With the ID, every follow-up request reused all of it (90% of follow-up
  input cached; 91% was the maximum possible). Cached input is read faster,
  and OpenAI's Codex credit rate card bills it at a twentieth of the uncached
  rate (GPT-6.1 Sol); OpenAI doesn't publish how included plan limits count it.
  - Chat turns use one ID per channel session, from history compaction before
    the turn to the reply after a skill hands off, and guest chats too.
    Resetting a session starts a new ID; a single-use API request's ID ends
    with it; IDs are kept in memory, so a restart starts new ones too.
  - Each spawned agent, autonomous loop and delegated background task has its
    own ID for its whole run, as does each background reflection. Requests made
    inside a turn, agent or loop, such as the completion judge, use its ID.
  - Image generation and the idle quota check send no ID.
- **Odin names himself on Codex requests.** Every request to the ChatGPT
  backend, including image generation and the quota check, now sends
  `originator: odin` and `User-Agent: odin (<os>; <arch>)` instead of no
  originator and the HTTP library's default user agent. The browser sign-in
  link now says `originator=odin` instead of `pi`. Device-code sign-in is
  unchanged.

## [4.17.0] - 2026-10-16

### Added

- **Spawned agents see images.** An agent that calls `analyze_image` now gets
  the picture as a real image, the way Odin's own turn does, through the path
  MCP images already take in agents. Until now an agent got an
  `unsupported_agent_image` error; before that, the picture reached it as
  base64 text, which a model cannot see and which filled its context.
  - The image reaches the model as a labelled image message. It never enters
    tool result text, trajectories, audit records or stored agent results.
  - An agent on a provider without vision sends the image as chat does. If the
    provider rejects it, the request fails with the provider's own error;
    there is no text fallback.
  - Computer-use tools stay unavailable to agents, as before: they need a
    grant agents don't hold. An agent can still capture the screen with a
    command and look at the file.

### Changed

- **Agents drop images only where a request would otherwise fail.** Images
  the model has already seen are replaced, oldest first, by a one-line note.
  - Triggers:
    - the context budget predicts the request won't fit and dropping seen
      images alone makes it fit;
    - the provider reports a context overflow that no text compaction step
      can shrink;
    - a Codex request would exceed OpenAI's documented 512 MB limit.
  - Order: for a provider context overflow, text compaction that can shrink
    the request comes before any image is dropped. For the request size
    limit, seen images go first, then text compaction, then unseen images.
  - Images the model hasn't seen yet are withheld, with an explicit note and
    without re-running the tool, only when nothing else lets the request fit.
  - While a request is being fitted (predictive or after an overflow), text
    compaction that summarizes image-bearing steps counts as dropping those
    images, and a request that only fit after dropping images records no new
    character ceiling or context-window evidence.
- **Codex request size.** An agent measures each Codex request where it
  assembles it, with the prompt and tools it really sends, against OpenAI's
  documented 512 MB request limit. A request over it is never sent: it is
  fitted as above, or the iteration fails with "Request exceeds the
  provider's size limit even without images". No limit is known for other
  providers, so none is applied to them.
- **The agent repetition check counts pixels.** Looking at a file again after
  its image changed is progress, not a repeated call.

### Fixed

- **A malformed image result becomes a short error, not text.** On the
  agent, autonomous-loop and scheduled-task path, an image result that cannot
  be delivered becomes a `malformed_image_result` error before any text
  delivery or audit, and never echoes the bad data. The main chat path keeps
  its existing handling.
- **Scheduled tool steps that return images** post their text plus
  `[N image(s) omitted from text output.]` instead of base64. Typed results
  keep their status and metadata.

### Upgrade notes

- No configuration changes.

## [4.16.0] - 2026-10-15

### Added

- **Steer a running chat turn over the API: `POST /api/chat/steer`.** It
  queues a correction for the caller's own running `/api/chat` turn: the
  identity's conversation, or the one named by `session_id`. The turn takes it
  at its next checkpoint, exactly as with Discord `/steer`, and the same rules
  apply: credentials are refused without echo, 4,000 characters, 128 messages
  per turn, nothing while the turn is stopping. Any token may steer its own
  turns, but only with the same tier, tool allowlist and host scope as the
  token the turn runs with: a narrower token that shares the user ID is
  refused (403). An admin token may steer any running turn, and may name a
  `channel_id` to reach one, a Discord channel's included. `wait_seconds` (up
  to 60) waits for the outcome: consumed, or the turn ended first.
  - Responses: 202 queued, 200 with the outcome, 409 when nothing is running
    to steer, 400 for bad input, 403 for `channel_id` without an admin token.
  - `/api/execute` turns, which the `odin` command-line client uses, are
    stateless and can't be steered.
  - See `docs/chat-steering.md`.

### Fixed

- **Background-process commands no longer pick up stray text.** Odin sends
  `manage_process` to the model with a separate shape per action, so a start
  ends right after its command. Before, the command was followed by six
  required empty fields. A model done with the command could not stop there,
  so a stray word, a period, or even a second command ended up inside it.
  Odin usually caught it and ran the command again.
  - Measured on the live endpoint with Odin's request shape: stray text on 14
    of 60 gpt-6-astra (medium) and 4 of 20 gpt-6.1-sol (xhigh) process starts
    before, and on 0 of 60 and 0 of 20 after.
  - What the model fills in changed, not what the tool accepts. Arguments,
    audit entries and history are unchanged.
  - Each request carries about 3,000 more characters of tool definitions.
- **Concurrent reads on shared SQLite connections.** The search index, the
  session archive store, the knowledge store and the turn-state store each
  share one connection across worker threads, and only their writes were
  serialized. Overlapping reads could fail with `InterfaceError: bad parameter
  or other API misuse`, or quietly return wrong answers:
  - the knowledge list came back empty while a document was being saved, and a
    saved document could fail its durability check;
  - an indexed session archive read back as missing;
  - a saved checkpoint read back as missing, so resuming an interrupted turn
    could fail;
  - search-index lookups failed during archive backfills.

  The search index, session archive and knowledge stores now hold their lock
  for every use of the connection, reads included. A write can hold it for a
  while, so the health and resource-usage pages, the `list_knowledge` tool,
  background tasks and imports now read the knowledge store from a worker
  thread instead of the event loop. The turn-state store turns off its
  statement cache (python/cpython#118172), which is what broke its concurrent
  reads.

## [4.15.1] - 2026-10-14

### Fixed

- **`validate_action` now uses the macOS checks for hosts declared `os: macos`.**
  v4.15.0 added macOS port, service and log probes, but the tool never passed
  the target's declared OS to them. Every host got the Linux probes and the
  Linux evaluation, so on a Mac a running launchd job failed its service check
  and log checks errored (`journalctl` not found). Each check now binds one host
  lease before its command is built. The declared OS of the target that runs
  the probe chooses both the probe and its evaluation, even while the host is
  re-enrolled. Linux hosts are unchanged. (#660)

## [4.15.0] - 2026-10-14

### Upgrade notes

- **Hosts declared `os: macos` get macOS validation probes.** `validate_action`
  chooses its probes by the target host's declared OS, not Odin's own:
  - port checks bound the same Bash `/dev/tcp` probe with Perl's `alarm`, so a
    stock Mac needs no GNU coreutils;
  - service checks use `launchctl print`: a bare label means `system/<label>`,
    and `gui/<uid>/<label>` names a user's job. The default expectation
    `active` reads as launchd's `running`. A job launchd doesn't know is an
    error, not a stopped service;
  - log checks read the unified log (`log show`) and match message text only,
    never its header, timestamps or process prefixes.

  Linux hosts' port, service and process probes are byte-for-byte unchanged.
- **Linux log checks read the journal once.** Their output and exit status now
  come from a single `journalctl` query, captured in private temporary files. A
  read that fails is reported as an error instead of an empty match, so a
  `log_absent` check can no longer pass on a journal it couldn't read.
- **File transports use `chmod -- 600 FILES`** (raw `read_file` and both
  `apply_patch` transports). It means the same on GNU and works on BSD and macOS
  `chmod`, which stopped at the previous order.

### Added

- **`apply_patch` on macOS hosts.** The remote runner supports Python 3.9 and
  newer, including Apple's `/usr/bin/python3`, and uses `renameatx_np(RENAME_EXCL)`
  for its atomic no-replace rename on macOS. Linux keeps `renameat2`
  (`RENAME_NOREPLACE`) exactly as before. A filesystem without a native no-replace
  rename still refuses; there is no unsafe fallback.
- `docs/managed-host-platforms.md` describes what each platform's probes and
  transports require.

### Fixed

- **Case-only moves on case-insensitive volumes** (APFS, for example) apply
  instead of refusing as a collision. A different file, or a hard link to the
  source under another name, still refuses before any change. Rollback restores
  the source's actual spelling. (#657)
- **Trust files whose paths contain spaces, quotes or backslashes** reach OpenSSH
  as one file, for one-shot commands, pooled connections, binary reads and host
  enrollment. Ordinary paths keep their exact option text. (#655)
- **A failed host test no longer reports a platform it never observed**, and an
  abandoned enrollment candidate's temporary trust file is removed when the
  candidate is discarded or expires. Trust that a host or another pending
  candidate still uses is never removed. (#658)
- **Log checks no longer lose the journal query's status** (#656), as described
  under Upgrade notes.

## [4.14.0] - 2026-10-11

### Upgrade notes

- **Numeric settings are checked when saved.** Integer settings reject booleans,
  fractional values and numeric strings; numeric settings have explicit bounds.
  Existing configuration files still load through startup compatibility, with a
  warning for legacy values outside the new constraints and no automatic rewrite.
  Correct those values before saving the whole configuration.
- **Ordinary file deletes no longer inherit false HIGH labels from path names or
  later commands.** On strict hosts this also removes the corresponding false
  HIGH-risk denial. Genuine recursive/forced deletes and structural risk floors
  remain protected.
- **Native tool failures are now recorded as failures**, rather than successful
  calls containing an error message. Consumers of audit and task outcomes will
  see the corrected status. The message text is unchanged; one that doesn't
  already start with an error prefix now reaches the model marked
  `Error (tool reported failure):`.

### Added

- **`manage_list` can delete a list.** `delete` removes the list itself and refuses
  unknown lists. `clear` still empties a list without deleting it, and personal-list
  ownership checks still apply. Deleting the last migrated list does not resurrect
  the old grocery data.

### Changed

- **History search identifies where each hit came from**, with a channel name and
  ID or a DM label, and excludes the exact request that invoked the search before
  applying result limits. New session records retain channel and message identity;
  old uncached channels without saved metadata show an honest unknown-name label.
- **Knowledge full-text reconciliation is linear rather than quadratic.** It uses
  the existing index inventory, inserts missing chunks in one transaction, falls
  back to individual writes after a failed batch, and verifies the writes against
  a fresh inventory.

### Fixed

- **Session pruning preserves the archive restore would choose**, even when file
  modification times tie or disagree with archive timestamps.
- **Native image, file, knowledge, scheduling, agent and channel handlers preserve
  failure outcomes.** Valid empty results remain successful.
- **Knowledge search keeps working when embeddings fail.** Full-text hits remain
  available, with one warning per store; invalid queries and cancellation are not
  swallowed.
- **The governor recognizes recursive and force options only within the relevant
  `rm` command**, stops option scanning at `--`, and still recognizes GNU options
  after operands.
- **Aborted background tasks record their unexecuted remaining steps as skipped**,
  keeping progress counts, task details and terminal summaries consistent.
- **`fetch_url` retries once with a plain user agent on HTTP 403 or 406**, through
  the same guarded transport. Other responses do not trigger this retry.
- **Credential reloads replace stale account caches and quota state without a
  restart.** Removing, re-adding or replacing an account clears its old quota-check
  failure and snapshot. A successful reply clears only the serving account's
  failure, even if pool slots moved; a 429 or another account's success does not.
- **Native Hyprland loss tests build their own temporary guardian**, rather than
  requiring a leftover binary in `/tmp`. Clean CI retains real native coverage.

## [4.13.0] - 2026-10-01

### Upgrade notes

- **The command governor rates more dangerous command forms critical.** It now recognizes more forms of remote-script
  execution, uploads of sensitive local files to outside hosts, and requests to cloud instance-metadata endpoints.
  Installs with `governor.admin_can_override: true` still let admins run them, with the existing warning and audit
  label. On other installs, and for non-admin users, they are blocked. No command is rated or blocked lower than in
  4.12.0, and ordinary private and LAN uploads are unaffected.
- **`/api/processes` entries gain two fields:** `effective_shell` and `termination_reason`. Both are always present
  and are null when the value was not recorded. A normal exit has no termination reason. The change is additive.

### Added

- **Skills page: an Enable/Disable control on every skill card.**
  - The card shows whether a skill is enabled or disabled.
  - A disabled skill keeps View Code and Edit, and Test stays disabled until it is enabled again.
  - The change takes effect immediately in the tool catalog and the prompt.
- **Skills that fail to load can be deleted from the WebUI.** Their card shows the load error once, with a Delete
  button and no code or test controls. The model-facing `delete_skill` tool is unchanged.
- **The Processes page and API show each job's shell and, when recorded, how it ended.** `manage_process` poll output
  includes the shell when it is known.

### Changed

- **Codex tool-call history replays the model's own arguments.**
  - Within a turn, Odin sends back the exact argument text the model emitted for its earlier tool calls, instead of
    the normalized form. Before, the model could see its own calls contradict the tool schema (for example
    `http_probe` headers sent as a list and replayed as a map) and retry them.
  - The text is held in memory only (up to 256 KiB per call) and is never stored.
  - Execution, audit, storage and other providers are unchanged. A turn resumed after a restart replays the
    normalized form, as before.
- **Command classification is structural as well as textual.** The audit label and the enforcement decision come from
  the same assessment. Repeated classifications of the same command are cached, and large commands classify faster
  than in 4.12.0.
- **Tool calls returned together are ordered as the model emitted them.**

### Fixed

- **`apply_patch` no longer fails with "Argument list too long" on larger patches.**
  - Before, roughly 40–48 KiB of patch text exceeded Linux's per-argument limit, locally and on remote hosts.
  - A command over that limit is now sent compressed and unpacked by the host's `python3`.
  - A command that is still too large is refused before it runs, with nothing written.
  - Smaller patches send exactly the same command as before.
- **Skills page:** a failed skill's error no longer appears twice, and the View Code button only shows when there is
  code.

## [4.12.0] - 2026-10-01

### Upgrade notes

- **Local commands now run under bash by default.** The new `tools.command_shell` setting (`auto`, `bash` or `sh`,
  default `auto`) runs raw model- and skill-written local commands under bash when it is installed. Set
  `tools.command_shell: sh` to return to `/bin/sh` at once; new commands pick up the change without a restart. Review
  persisted automation (schedules, workflow steps, skill `run_on_host` literals) for dash-specific syntax before
  upgrading. Details are under Changed.
- **The usage store migrates from schema 3 to 4 on first start, one way.** Rolling back to 4.11.0 or earlier switches
  usage statistics off (the store itself is left untouched) until you upgrade again. Back up `data/usage/` before
  upgrading if you may roll back.
- **Open-file headroom.** The packaged `odin.service` already sets `LimitNOFILE=65536`; installs that run Odin from
  their own unit should use equivalent headroom, for example in a drop-in. New in this release, the `open_files`
  health component reports descriptor use against the soft limit and warns above 70%.
- **The system prompt lists only usable skills.** Disabled skills and skill files that fail to load are no longer
  listed in the prompt. `list_skills`, `/api/skills` and the WebUI still show every skill with its status.

### Added

- **"Stay logged in" survives restarts.** Ticked WebUI sessions can survive restarts for up to 30 days, subject to the
  configured inactivity timeout. The private session records (`data/web_sessions.json` and a key file, both 0600)
  store hashed session ids, identity and source metadata, timestamps, and either an HMAC credential digest or a
  dynamic-token issuer fingerprint; no bearer credentials are stored. Unticked sessions stay in memory only, and token
  rotation, revocation or logout still end sessions.
- **Browser waits are configurable per call.** `browser_click`, `browser_fill` and `browser_read_page` accept an
  optional `wait_timeout_seconds` (default 10 seconds), clamped to the new `browser.max_wait_timeout_seconds` (default
  and hard maximum 60).
- **Reasoning tokens are recorded** for Codex and OpenAI-compatible providers when the provider reports them, in usage
  accounting and generation records, and shown beside output tokens on the Usage page. Generations recorded before the
  upgrade show as unknown.
- **Listings show what the model needs.** `list_skills` shows each skill's status (loaded, disabled or failed to load)
  (#631), and `list_agents` shows each agent's model and effort.
- **An `open_files` health component** (see Upgrade notes).

### Changed

- Raw local model/skill commands and new background jobs now default to deterministic, non-login
  bash when available (`tools.command_shell: auto`), otherwise sh. The effective local shell appears in
  the tool descriptions and is kept in background process records; successful command and skill output is unchanged,
  with no shell footer. Explicit `bash` refuses before dispatch if unavailable.
  Set `tools.command_shell: sh` for immediate compatibility rollback. New jobs
  alone use a changed setting; retained records and running-job cleanup keep
  their original shell. Remote execution and explicit script interpreters are
  unchanged. Code-built internal commands, file/patch transports, script wrappers,
  HTTP wrappers and non-command validation probes stay `/bin/sh` without shell
  annotations. Workflows, schedules, delegated tasks, loops and agents inherit
  the setting only through raw command tools. Review persisted automation for
  dash-specific syntax before upgrade.
- Under bash, `echo` no longer interprets backslash escapes by default and
  `echo -e` is honoured; use `printf` for escapes. Unquoted `{a,b}` and numeric ranges such as
  `{1..5}` expand, and `$'…'` decodes ANSI-C escapes. Glob match order follows the locale
  (for example `LANG=en_US.UTF-8`), not raw byte order. A failed builtin's `$?`
  can differ: failed `cd` returns 2 under dash and 1 under bash. Error wording
  uses `bash: line 1:` rather than `/bin/sh: 1:`. `tools.command_shell: sh`
  remains the compatibility rollback.
- The descriptions of `run_command`, `run_command_multi`, `manage_process` and `validate_action` name the effective
  local shell in one sentence. `manage_process` also says that remote background jobs run under `/bin/sh`, and the
  others that remote commands use the remote account's login shell.
- Local command failures report what happened. Timeouts read `Command timed out (exit N)`, with the signal and
  termination reason when known, and local `validate_action` command checks report `timed out after Ns`. Remote
  command wording is unchanged.
- `parse_time` accepts the named clocks `noon` and `midnight`, and a clock with a day-part phrase such as
  `8 tonight`, `this evening at 8` or `11 in the morning`, including supported day words and explicit zones
  (`8 tonight ET`). A day-part phrase alone does not choose a time. `midnight` means the end of the selected day, so
  `tomorrow at midnight` is 00:00 on the day after tomorrow. Contradictions such as `8am tonight` or
  `20:00 in the morning` are rejected; 4.11.0 accepted some of them with the wrong time.
- The `create_skill` description states the full module contract (a `SKILL_DEFINITION` dict and
  `async def execute(inp, context)`) with a minimal example, instead of pointing at template files that are not
  shipped (#630).

### Fixed

- WebUI tabs return to the sign-in screen when their session ends, for example after a restart, instead of staying on
  "Unauthorized/Offline" (#633).
- Retained process output no longer holds an open file descriptor per job for 24 hours (#634).
- Changing, regenerating or deleting one API token no longer signs out every other API-token WebUI session, a
  regression since 4.11.0. A token's own change still ends its sessions and closes its WebSockets.
- "Test skill" in the WebUI runs as the signed-in user, with that user's host access and tier. It previously ran with
  no identity, so every host call was refused.
- Live Tail reads only the end of the audit log, off the event loop, instead of reading the whole file on every
  Logs-page connect.
- Removing a host-access entry is audited with the actor, the user id and the previous entry. Removing an absent entry
  returns 404 and writes nothing.
- `web_search` timeouts say the search timed out and after how long, and no error renders an empty message.
- Loop history no longer repeats the iteration prefix (`Iteration 2: Iteration 2: …`).
- The local command supervisor no longer loses ownership of a job when a process vanishes during descendant
  discovery, and it detects exits immediately instead of on its next poll.
- The command governor recognizes more bash syntax, including ANSI-C quoting (`$'…'`), brace expansion and process
  substitution. It remains a conservative classifier, not a full shell interpreter.
- The WebUI skills page labels skill files that fail to load ("failed to load", with the error) and hides the controls
  that cannot work for them.
- Native keyboard-focus tests are deterministic (#632).

## [4.11.0] - 2026-09-30

### Fixed

- Successful SSH or executor recovery retries now
  report success while retaining uncertainty about earlier dispatches. Emergency
  input release clears an `unknown_release` fence when the guardian ledger says
  released, with fresh consent still required; native target-continuity loss
  remains quarantined. Verified-empty remote process groups report clean exit
  or kill with an explicit process-group-only containment caveat, not a blanket
  unknown outcome. Unchanged durable legacy PDF imports reuse their basename
  source; changed or unverifiable legacy content requires an explicit source
  choice because historical imports did not retain originating URLs. Removed
  `grafana_alerts` config is silently tolerated, secured HTTP exceptions are
  re-raised rather than returned, and overview docs link authoritative inventory
  sources instead of stale totals and list all four computer-use handoffs.
- Missing local process handles no longer count as proof that descendants have
  exited. Unsettled records retain their host authority and block clean shutdown;
  restored read-only evidence does not attempt to terminate an old execution.
  A group-empty scan also stays unproven until the leader has been reaped, so a
  reap timeout or cancellation cannot publish a premature cleanup verdict.
- Scheduler reservations are revalidated against current identity and pause
  state before execution; malformed trigger filters no longer block valid
  schedules. Empty trigger subscriptions are rejected. Retry timestamps reflect
  the retry, clock-only reminders handle both daylight-saving fall-back
  instants, invalid 12-hour values are rejected, and 24-hour clocks may precede
  the day text. `parse_time` accepts `AM`/`PM` in any case after a space (such as
  `2:30 PM`, which 4.9.1 and 4.10.0 rejected as a timezone abbreviation) and
  dotted `a.m.`/`p.m.` markers, and rejects a bare 24-hour clock followed by
  words it cannot interpret instead of ignoring them. Workflow conditions run after empty successful output, scheduled
  native errors remain failures, deferred host defaults follow each tool's
  contract, nested skill inputs are checked against the selected skill schema,
  and `update_schedule` exposes workflow condition/failure-policy fields.
- Provider-declared incomplete Codex and Ollama responses are marked incomplete
  and failed without discarding partial text or retrying it away; complete long
  replies remain unchanged. Empty native Ollama output is an error. DeepSeek
  overflow classification applies to production-created clients, schema
  sanitization preserves keyword-named parameters, and bounded auxiliary
  qualification accepts expected truncated/empty probe responses. Compatible
  and Ollama accounting uses response-scoped model/token facts; canonical model
  selection reaches covered requests, borrowed auxiliary wrappers survive
  reloads, and one settled half-open circuit-breaker probe is admitted at a
  time. OpenRouter fallback limits account for every permitted route.
- Codex credential publication uses exclusive private temporary files and
  completes partial writes before replacing the destination. Manual login
  merges accounts rather than replacing the pool; failed merged writes preserve
  existing accounts. Refresh, administration and quota checks are fenced against
  account deletion, reordering, re-authentication and reloads. Authentication
  failure rotates away from a manually selected account, and displayed account
  indexes continue to identify the intended valid record when malformed entries
  are present.
- Tool execution preserves outcome uncertainty after ambiguous dispatch, inner
  timeouts and later retries; output text cannot forge execution metadata.
  Typed tool failures survive native, deferred and validation routes, retry exit
  status remains authoritative, `max_retries=0` still makes the initial SSH
  attempt, and streaming handles long lines and reaps children when consumers
  fail. Validation regexes run with a deadline off the event loop; numeric zero
  compares correctly, refused probes are not reported as executed, invalid HTTP
  probes acquire no host lease, and truncation/risk metadata tracks delivery and
  shared action-aware classification.
- Skills persist activation before publication; editing disabled skills keeps
  them disabled, and edit/delete operations target the loaded artifact.
  Requirements honor installed versions and extras, accept valid compound PEP
  508 constraints and reject unsafe forms. Skill host commands and selected
  skill invocation pass inherited admission and current-scope checks; validation
  uses requester tier and effective host. `systemctl` global options no longer
  hide lifecycle verbs from risk classification. Unsupported generic
  `SkillContext` calls are refused, its helper documentation distinguishes
  synchronous from asynchronous methods, and authorized retained results keep
  the complete output.
- Scoped memory reads and deletes honor explicit personal/global scope while
  omitted scope retains its previous behavior. Empty compaction uses a
  deterministic nonempty fallback; history eligibility is applied before
  result limits, and cross-channel fallback selects globally newest eligible
  records. API execution sessions remain ephemeral, owned scoped searches are
  available to their owner, and foreign scopes are rejected. PDF imports use URL
  identity by default; knowledge summaries compare authoritative snapshots,
  duplicate identifiers remain lossless, rolling summaries are recognized by
  APIs and metrics, cold embedding initialization leaves the event loop
  responsive, and hybrid fusion keeps the best-ranked payload.
- Learned entries with matching keys remain isolated by owner; edits and use
  extend expiry. Audit search/statistics and failure aggregates include retained
  rotations with stable coverage metadata, complete captured files and correctly
  framed diffs. Prompt totals include learned context. Prefix metrics identify
  unmeasured values instead of claiming upstream cache hits. Startup diagnostics
  validate knowledge database integrity and recognize static and dynamic API
  credentials without disclosure; tokenless HTTP readiness no longer depends
  on an unconfigured Discord gateway. Usage ingestion releases its lock after
  database-open failures, and resource counts use the configured session path.
- Computer recovery preserves incident lineage through emergency release,
  validates and archives qualified absence evidence, and reconciles only owned
  private evidence orphans. Clean resume publishes current recovery authority;
  status exposes bounded native recovery guidance without private handles.
  Expired inventory proofs and settled terminal caches are retired safely.
  Proven pre-input refusals restore eligible observations without weakening
  held-input or unknown-release fences, and isolated X11 preflight requires
  privilege only when configured to use it.
- Background process admission includes pending starts and unresolved owned
  executions. Process lifetimes bind exact generations; persistence failures
  trigger cleanup without abandoning lifecycle ownership, local leader exit is
  not completion until descendants settle, and remote cleanup failures remain
  explicitly unknown. Verified-empty remote process groups settle with a
  process-group-only caveat, not a claim that escaped descendants ended.
  Completed remote evidence retains its bounded retrieval deadline even when
  execution cleanup remains unknown. Explicit local termination claims success
  only after owned cleanup is proved. Remote stdin reports accepted bytes after
  partial writes, and cancelled SSH master
  closure retains its ownership handle for retry. Host-key mismatch quarantine
  survives unrelated inventory publication, host management publication is
  serialized, and CA enrollment verifies signing authorities and endpoint
  principals. `apply_patch` preserves untouched text boundaries, rejects
  nonregular files without blocking on FIFO open, and closes snapshots on
  semantic rejection.
- HTTP browser sessions are bound to credential origin and generation, expire
  when the originating credential is revoked or rotated, and lose anonymous
  development authority when authentication is enabled. Invalid static token
  tiers are refused rather than treated as administrator. Supported WebSocket
  authentication carriers use consistent credential precedence, login handles
  malformed JSON shapes, security headers cover raised HTTP responses, expired
  sessions are retired, and reconnecting WebSockets remain subject to chat rate
  limits. Process termination reports acknowledged outcomes. Failed self-update
  paths restore operator files. Observed WebSocket credential revocation is
  terminal for that transport, even if an old credential is later restored;
  schema-aliased mapping fields survive partial configuration saves and reload.
- Autonomous loop failures count toward the configured consecutive-failure
  limit; terminal findings and natural completion timing are preserved. Outbound
  per-target admission is serialized and first events work on young hosts.
  Scheduled digest fallback stays within message limits, resume selects the
  requester's own preserved work, and buffered intake retains attachments.
  Authorized retrieval preserves complete truncated text/PDF evidence while
  retaining existing ownership, channel, quota and expiry fences. Generated
  images reject incomplete PNGs and report upload failures as failures.
- Incus deployment syntax and required UI assets, wheel model-hint data, CLI
  failure exit codes, browser dependencies in official install paths, and the
  Debian SSH-key default and safe default-only upgrades are corrected. Browser
  runtimes are provisioned and qualified without enabling new capabilities;
  custom SSH keys remain untouched. Compose now supports atomic config
  persistence and safely migrates an existing single-file config without
  overwriting a newer directory config, preserving setup state and listener
  consent during relocation. Portable `odin-server` and `odin-client` commands
  are provided for every package type with documented migration guidance;
  `odin` now runs the API client consistently on every install type and the
  server uses `odin-server`. Old server-style `odin` invocations with a config
  file, `-c`, `--config` or `--env-file` refuse to send a prompt, explain the
  new server command, and exit nonzero. Existing Python/source server scripts
  and units must switch to `odin-server`; Debian client usage is unchanged.
- Configuration migrations no longer require an adjacent write for no-op
  completion, and ceiling migration preserves a newer acknowledged edit.
  Retired Codex model migration now covers canonical agent selectors,
  allowlists and hints. Existing legacy model/effort pairs continue to load with
  a warning when invalid; saves validate the effective canonical selector.
  Partial config saves update submitted leaves only; deleting a mapping entry
  requires the explicit `{ "$delete": true }` marker, while JSON `null` remains
  a value. Provider enable routes parse booleans correctly. Nonpositive tool
  timeouts and negative archive caps are rejected on save and tolerated at
  startup with warnings and safe defaults; explicit zero archive retention
  still means retain nothing. Legacy Kimi timeout adaptation is bounded, and
  legacy configs with an absent provider keep their selected main model.
- The WebUI coalesces model-save intent, fences stale provider/MCP/operational
  page requests, keeps Discord identity fields consistent, and supports native
  keyboard activation of user selection. Skill source highlighting preserves
  original text. Paused Live Tail retains at most 2,000 raw records and reports
  drops; relative-time filters advance only while active. Live Tail uses bounded
  RE2 syntax, with unsupported lookaround/backreferences reported rather than
  silently accepted. Trace filtering precedes result limits, schedule forms can
  submit workflow steps, and missed terminal events become explicitly unknown
  history rather than fabricated running or successful results. Stream
  correlation uses unique backend registry IDs and full invocation attribution.
- Agent repetition detection hashes the full canonical scrubbed evidence before
  delivery, so changing envelope IDs, cursors or previews cannot bypass the
  guard. Cancellation before an agent coroutine starts is durably settled as a
  killed trajectory. The default Codex agent catalog honors authored model
  selection hints.
- Tool catalogs now hide browser and knowledge tools when their backends are
  disabled; email visibility follows executor-effective startup configuration,
  and dynamic computer tools participate in built-in disablement. MCP discovery
  isolates invalid header schemas to the affected tool, rejects terminal
  newlines in header values, and preserves structured results without repeating
  equivalent JSON summaries. SMTP acceptance is retained across QUIT cleanup
  failures, failed IMAP searches are not reported as empty results, and image
  validation decodes complete PNG data under size limits before delivery.
- Removed native monitoring references were audited through current source,
  tests and documentation tooling; generated API references remain to be
  regenerated after campaign integration. Generic internal resource/token/pool
  metrics and `/api/pools` remain; no native Prometheus formatter or endpoint is
  implied by this removal.

### Changed

- Upgrade notes:
  - `odin` is now the API client on every install type, and the server command is
    `odin-server`. Python, source and Compose scripts or units that started the
    server with `odin <config>`, `-c`, `--config` or `--env-file` must switch to
    `odin-server`; those old invocations now refuse, explain the new command and
    exit nonzero without sending a prompt. Debian installs and units that run
    `python -m src` are unaffected.
  - A static `web.api_tokens` entry whose `tier` is not `admin`, `user` or `guest`
    is now refused instead of being treated as an administrator. Correct the tier.
  - Browser sessions end when the API token that created them is revoked or
    regenerated.
  - Partial `PUT /api/config` saves change only submitted leaves. Deleting a
    mapping entry needs the explicit `{ "$delete": true }` marker.
  - SMTP and IMAP now verify certificates by default (see below).
- Documentation now describes setup-wizard restart behavior, supported
  WebSocket authentication, managed Hyprland first use, current provider/model
  capabilities, Codex refresh behavior, tool/loop iteration limits and retired
  model migration accurately. Stale inventory counts and removed monitoring
  claims were removed.
- SMTP and IMAP verify server certificates and hostnames by default; operators
  using self-signed mail servers must explicitly opt out. Accepted email is not
  misreported if QUIT cleanup fails, and IMAP search failures are not treated as
  proof of message absence.
- The WebUI prevents stale responses from replacing newer selections and
  operational state; live-tail retention/filtering is bounded, trace filtering
  precedes result limits, schedule forms submit workflow steps, and execution
  call correlation uses complete invocation identity. Host CA enrollment UI
  identifies the expected fingerprint as the signing CA fingerprint.

### Removed
- Removed native Grafana alert receiving, remediation, management routes and
  scheduler trigger publication, the unauthenticated Prometheus `/metrics`
  endpoint and its exporters, and `SkillContext.query_prometheus`. Existing
  configuration keys are tolerated and ignored; component checks remain on
  `/health`. Legacy removed-source schedules remain readable but inert.
  External operator-configured MCP integrations are unchanged. There was no
  native Loki integration to remove.

## [4.10.0] - 2026-09-29

### Added

- `gpt-6.1-sol` is available in native Codex selectors and agent catalogues
  between `gpt-6-astra` and `gpt-6-sol`. Its measured usable input budget is
  921,849 tokens; efforts `low` through `max` are supported, while `none` is
  rejected.

### Changed

- Fresh installs default the main Codex model to `gpt-6.1-sol` (including the
  configuration template and WebUI new-form fallback). Existing installs keep
  their persisted or compatibility-default model; auxiliary and agent defaults
  and retired-model migration remain unchanged.
- Agents that choose their own model now rank `gpt-6.1-sol` ahead of `gpt-6-sol`,
  which the agent catalogue describes as the balanced tier rather than the default.
- Upgrade note: to move an existing install onto the new model, pick `gpt-6.1-sol`
  as the main model on the WebUI LLM page, and add it to the agent auto-model
  allowlist if you use one. Choose any effort except `none`.

## [4.9.1] - 2026-09-28

### Fixed

- `parse_time` honours a timezone written at the end of the expression
  instead of silently ignoring it. IANA zones (for example
  `America/New_York` or `Europe/London`), `EST`/`ET` and "New York time"
  are supported. Ambiguous or unknown zones (for example `PST`) are
  rejected with a clear error instead of being interpreted in the bot
  timezone. Expressions without a zone still use the configured `timezone`.
- `validate_action` `log_absent` and `log_present` checks no longer match
  their own invocation. Odin logs every tool call, including the check's
  pattern, so a check against Odin's own log (or the whole journal) could
  pass or fail on that line alone. `log_present` could report an event that
  never happened, and `log_absent` could fail on a pattern that never
  occurred. The check now ignores its own tool-call line.

### Changed

- `generate_image` returns the posted image's Discord attachment URL, so the
  model can inspect or reuse the image it just made in the same turn (for
  example with `analyze_image`). Only HTTPS URLs on Discord's attachment CDN
  are returned.

## [4.9.0] - 2026-09-28

### Fixed

- Runaway Codex generations are fixed. Since 4.2.0 every Codex tool was sent
  with `strict: false`, and GPT-6 Sol and Luna (occasionally older models)
  could fail to finish a tool call's arguments: the model kept writing inside
  the call, often as whitespace or its own internal text in an extra argument
  key. The generation then streamed until OpenAI cut it at about 15 minutes
  or an agent's 900-second limit retried it, or it finished with a garbage
  argument key that was dispatched. Codex tool calls are constrained to their
  schemas again. In replays of real failing agent contexts the 4.8.0
  behaviour degenerated in 10 of 20 attempts and this release in 0 of 20.
- Codex models can no longer invent tool arguments (for example a `timeout`
  on `run_command`) that were accepted and silently ignored.

### Changed

- Codex tool calls use strict (schema-constrained) function calling again.
  Optional arguments stay optional: the model sends `null` for "not
  provided" and Odin removes it before the tool runs, while explicit `false`,
  `0` and empty strings are kept.
- Codex tool-call arguments are validated against the tool's schema before
  anything runs. An invalid call returns an ordinary tool error to the model
  and nothing is executed.
- `http_probe` headers are a list of `{name, value}` entries, and header
  names that differ only in case are rejected. Callers that pass a
  name-to-value object (stored schedules, workflows, skills) keep working.
- `validate_action` check `expected` values must be an integer, a string, or
  a list of integers or strings (for example `[200, 204]`).
- Webhook triggers for `schedule_task` and `update_schedule` accept exactly
  `source`, `event`, `repo` and `alert_name`, in any combination, matched
  together.
- For Codex models, the `tool_input` of schedules, workflow steps and
  delegated tasks, and the `input` of `invoke_skill`, are sent as JSON text.
  Odin decodes it once and validates it against the target tool before
  storing or running it; placeholders such as `{var.name}` are checked after
  substitution. Stored schedules and workflows keep their format, and other
  providers still send objects.
- Skills and MCP tools: an explicitly closed input schema
  (`"additionalProperties": false`) is called with structured strict
  arguments. An open schema (the JSON Schema default) is called with one
  JSON-text argument, which Odin decodes and validates against the original
  schema, so what the skill receives is unchanged. A schema Odin cannot adapt
  stays non-strict and is logged. Skill authors who want structured arguments
  can add `"additionalProperties": false` to their input schema.
- `computer_act` is sent to Codex as a closed wrapper around one operation.
  The full action contract is still checked before any input; constraints
  the strict schema cannot express are enforced by that check.
- Each tool's strictness is logged once per schema version, and a built-in
  tool that the server does not confirm as strict logs a warning.

### Upgrade notes

- No configuration changes. Existing schedules, workflows, skills and MCP
  servers keep working. OpenAI-compatible and Ollama providers are unchanged
  apart from the tool-schema updates above.

## [4.8.0] - 2026-09-26

### Changed

- The WebUI LLM page lists only enabled providers' models. With the compatible
  provider and Ollama disabled, the Main, Agent and Auxiliary selectors show
  plain Codex options without group headers or the catalogue search, and the
  Agent auto-selection allowlist stays available. A saved model from a
  disabled provider stays visible as one labelled `Configured: … (provider
  disabled)` option with a warning; disabling a provider that a role uses
  warns before saving and never changes configuration; allowlist entries of a
  disabled provider stay in the ranked list as `Excluded: provider disabled`
  with configured and effective counts. With providers enabled the page
  behaves as before.
- Compatible and OpenRouter models budget chat, loop and agent history against
  the output each request actually reserves (the profile's maximum output,
  capped at 32,768 tokens), the same figure agent eligibility already used.
  Long tool-using turns keep more history before summarizing (DeepSeek V4 at
  the default 75%: 491,520 to 761,856 working tokens), so those turns send
  more input tokens per request; models whose declared output nearly equals
  their context window no longer run with no history budget and no overflow
  rescue. An agent whose compatible provider rejects a payload already below
  the provider-reported window now compacts instead of re-sending it. Codex is
  unchanged. To retain the previous smaller compatible working set, lower
  `openai_compatible.context_utilization` (about 48 for DeepSeek V4's previous
  491,520 tokens).
- One-time check, workflow and webhook schedules interrupted by a restart are
  now paused as inert rather than run again from the beginning. Their reason
  is shown to operators; set a new `run_at` to re-arm after checking effects.
  Reminders and digests still replay, and recurring schedules are unchanged.
  No action is required on upgrade.
- Documented webhook success, partial-delivery and retry behaviour for
  scheduled webhook actions and inbound webhooks.
- History search finds archived conversation summaries again; the first start
  after upgrading indexes existing archives in the background. Expect the
  session and full-text databases to grow during this one-time migration.

### Fixed

- OpenRouter models listed from the cached catalogue on the LLM page show the
  server's availability and agent-eligibility verdict instead of always
  appearing available.
- Computer-use requests refused before any input (unknown source IDs, export
  on an attached desktop, Hyprland target discovery failures, and stale or
  unknown session references) now report `not_dispatched` with a safe next
  step instead of unknown-outcome RELEASE-ALL guidance. Such refusals no longer
  cancel a running session, including another session in the same channel.
  Successful computer calls are audited with a success reason code rather
  than `computer_rejected`.
- `email_send` reports recipients the mail server refused (To, CC or BCC)
  instead of claiming the message went to everyone; a partial send is reported,
  never retried.
- `email_read` no longer shows a text attachment as the message body, and its
  attachment list follows the MIME disposition (any capitalisation) instead of
  a text match.
- `http_probe` sends request bodies starting with `@` literally instead of
  uploading a file, and rejects header names starting with `@`. Such bodies
  require curl 7.43 or newer on the probing host.
- `validate_action` process checks no longer find their own command instead of
  the target process; a matching ancestor still counts. Missing `pgrep` and
  unusable patterns now report errors rather than false health.
- `validate_action` log checks report an error when the journal cannot be read
  or is only partly readable instead of claiming it is clean. Invalid patterns
  report errors and journalctl notices no longer count as log lines. Operators
  whose service user lacks journal access must grant it (for example via the
  `systemd-journal` group) before relying on these checks.
- `validate_action` HTTP checks accept explicitly expected 4xx/5xx statuses;
  connection failures and timeouts never count as a received status.
- The release workflow rejects tags that are not `vMAJOR.MINOR.PATCH` before
  touching package metadata, and passes a validated version to shell steps as
  data rather than embedding tag text in a command.
- Documentation and `scripts/monitor.sh` now point to standard output and the
  systemd journal rather than a log file Odin never writes. Fresh packages since
  v4.0.0 start immediately in loopback-only bootstrap mode; the computer-use
  handoff and install pages now say so.
- Logging in to the WebUI without **Stay logged in** now replaces an older
  saved login, so reloading after a restart retains the new session instead of
  returning to the login screen. A persistent login also clears the tab's old
  session-only credential.
- Compatible endpoints configured for GLM preserved thinking now count replayed
  reasoning when sizing context, so history is summarized before it overflows
  and overflow recovery no longer claims a fit while that reasoning is still
  sent; replayed reasoning is never shortened or edited.
- Verify integrity checks every retained rotated audit file, not only the active
  one, and lists each file's result (verified, predates signing, break at line N,
  unreadable, missing); files are streamed in a worker thread instead of read into
  memory.
- A tool that hit its time limit no longer lets the turn continue when its
  ledger record could not be saved; the turn stops with an error, as every
  other ledger write failure already does.
- Resuming interrupted work no longer leaves a tool call unanswered, or answers
  it with an earlier call's result, when a model provider reuses tool-call IDs
  across replies. Agents also accept IDs reused across separate replies while
  still refusing duplicates within one reply.
- Scheduled digests report disk and memory again. They run under the schedule's
  identity (the creator, or the `scheduler` system identity) and list hosts they
  cannot reach as collection failures.
- Grafana-triggered schedules with an alert name now match any alert in a
  notification, not just the first; each schedule still runs once per
  notification.
- Browser tool descriptions state that every call starts a fresh browser session:
  `browser_click` no longer suggests reading the clicked page with a later
  `browser_read_page`, `browser_fill` points to `submit=true`, and
  `browser_evaluate` notes that navigation it starts is not awaited. Browser
  behaviour is unchanged.
- Compressed tool history labels failed calls with a short reason (for example
  `run_command→ERR (blocked)`, `→ERR (timed out)` or `→ERR (disallowed host)`)
  instead of incorrectly marking these failures OK; Recent Actions marks
  failed calls ERROR. Successful calls with explicit outcome metadata remain OK.
- Long replies split around code blocks keep their formatting: text after a
  block no longer shows as code, no message ends with an empty code block, and
  a split with a long language tag no longer creates an over-limit message.
  Truncated workflow and loop posts close open code blocks before the marker.
- `parse_time` uses every part of an expression, including compound durations
  (`in 1 hour 30 minutes`), a day after a time (`5pm tomorrow`), a time after a
  weekday (`friday 3pm`), and `in 2 days at 9am`. Unused date or time words now
  return an error instead of silently scheduling the wrong time. Hours and
  minutes measure elapsed time across daylight-saving changes; days retain the
  local clock time.
- A cancelled knowledge, memory, list or learned write can no longer overwrite (or corrupt) a newer save that already succeeded.
- A failed knowledge ingest no longer leaves search hits for a document that was not stored or blocks that name; leftovers from earlier failures are removed at startup.
- Knowledge ingest reports failure when its version record cannot be saved, and re-ingesting the same content repairs a missing version snapshot.
- The Sessions page User ID filter now applies to every result source; summaries
  and index results that cannot be attributed are left out.

## [4.7.0] - 2026-09-24

### Added

- The System → Host Access page is redesigned. Each user row shows the Discord
  name, a Tier column, a compact host summary and the default host. An
  **Edit hosts** button on every row and on the Default Policy card opens a
  modal (full screen on phones) with search, a host checklist, an **All hosts**
  switch that also covers hosts added later, and a default-host picker that only
  offers allowed hosts. A search box filters the user list.
- Numeric Discord user IDs across the WebUI show the user's name and avatar,
  including users who no longer share a server with Odin (looked up by ID and
  cached through `GET /api/discord/users/{user_id}`).
- The Codex accounts table shows each account's quota windows as a bar that
  drains with usage, labelled with the remaining percentage and reset time. An
  idle-account check refreshes accounts that have not served a request recently.
- Malformed permission overrides can be repaired inline on Host Access with an
  explicitly chosen tier, and unusable API token entries can be removed from the
  API Tokens page. A removal is refused with 409 if the entry changed after it
  was displayed, and both actions are audited.

### Changed

- Codex failover is limit-aware: accounts known to be exhausted are skipped until
  their reported reset, and a 429 pauses an account until its reset. When every
  account is limited, the request still goes to the account whose limit resets
  first, and fresh quota data showing room clears a pause.
- Outbound webhooks may target private and homelab addresses, while cloud-metadata
  destinations remain blocked in every spelling. Redirects and DNS are validated
  at delivery, and webhook signatures are never forwarded to another origin.
- MCP calls keep the first response for a request ID on all transports; later
  responses are ignored with a payload-free warning. The handshake remains strict.
- The completion judge no longer imposes a 128-token output cap. Native Codex
  requests are unchanged; compatible and Ollama reasoning judges can use their
  normal output budget. Empty or ambiguous judge answers are logged as warnings.
- Knowledge ingestion splits unusually long words into bounded chunks. Existing
  documents are unchanged until re-ingested.

### Fixed

- Audit records for permission, token and host-access changes name the acting
  user instead of recording the WebUI session credential.
- Outbound webhook edits made in the API or WebUI persist across restarts. Each
  save changes only the affected entry in `config.yml`, keeps comments and
  `${VAR}` references, never writes resolved secrets, and refuses with 409 when
  the entry changed on disk. Configured per-target TLS verification and secret
  scrubbing settings now apply at startup.
- Basic-auth passwords in webhook URLs are masked in the webhook listing and in
  log lines, and the generic configuration route no longer accepts webhook
  targets.
- `/stop` removes its private deferred acknowledgement after Odin's public stop
  message is delivered, avoiding a duplicate private notification.
- Quota windows that report no duration are hidden and ignored by failover.
- Malformed permission overrides and API token records survive unrelated writes,
  with operator-visible diagnostics; existing effective tiers and token access
  are not changed.
- Trusted-proxy forwarding validates IP addresses, supports CIDR trust ranges,
  and walks the forwarded chain from the nearest proxy to prevent rate-limit
  bucket spoofing and inaccurate audit IPs.
- Concurrent knowledge ingests no longer bypass duplicate checks or add spurious
  versions; colliding chunk ID prefixes cannot overwrite chunks belonging to
  another source; whitespace-only paragraphs no longer produce empty chunks; and
  duplicate warnings are logged once.
- Usage coverage recovers from transient scan failures without a busy loop,
  detects oversized unfinished trajectory rows, and no longer drops rows at
  read-buffer boundaries.
- Computer-use audit and System Logs retain specific refusal reasons and input
  outcomes, including `target_changed_observe_again` and results that carry a
  screenshot, instead of collapsing them to a generic rejection.

### Removed

- Removed the System → Permissions page; per-user tiers are managed on Host
  Access. The permission API routes remain.
- Removed the unused standalone plan engine. The `python -m src.odin` plan
  runner is gone; remove any scripts or automation that invoke it when upgrading.
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
