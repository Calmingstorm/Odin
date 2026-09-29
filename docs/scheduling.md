# Schedules & webhooks

Schedules can run checks, multi-step workflows, reminders, digests and HTTP
webhook actions. An inbound webhook can also trigger a schedule. These are two
different paths: an outbound notifier is a separate subsystem, not covered here.

## Who scheduled work runs as

Discord-created schedules run as their creator. System schedules created through
the WebUI, REST API or a skill without a requester run as `scheduler` with the
admin tool tier. Host access is *still enforced*: a Host Access entry named
`scheduler` supplies its allowed hosts and default host, if present; otherwise
the Default Policy applies. To create that entry (the WebUI Add user picker only
accepts numeric Discord IDs), use `PUT /api/host-access/user/scheduler` with
`{"allowed_hosts":["your-host"],"default_host":""}`. It then appears on
System → Host Access. Widening the Default Policy grants access to every
unlisted user, not just system schedules. Digests report denied or failed host
probes as collection failures; if every probe fails, the digest run fails.

## Interrupted one-time runs

A side-effecting one-time `check`, `workflow` or `webhook` run is marked as
started **before** the first effect. If Odin stops during the run, or cannot
save its completion, the schedule becomes paused and **inert** on restart or
the next scheduler tick. It is not automatically run again from step one.
The reason is shown in the schedule listing, REST response and WebUI. Check
what already happened, then set a **new `run_at`** to re-arm it. Merely
unpausing it is refused. A run that never began, including a queued run,
remains eligible; a normally recorded failure still follows its configured
retry behaviour. One-time reminders and digests have no start marker and
still replay after an interruption; recurring and trigger schedules retain
their existing cadence. An interruption may happen after a marker is saved
but before an effect starts. Quarantine chooses safety over automatic replay.

## Scheduled webhook actions

- Each run sends one request through a shared aiohttp session. Methods are
  `GET`, `POST` (default), `PUT`, `PATCH`, `DELETE` and `HEAD`; the WebUI does
  not offer `HEAD`. A dict or list body is sent as JSON, any other body as
  text. JSON-looking text entered in the WebUI is sent as text unless you set
  its `Content-Type` header.
- The total timeout defaults to 30 seconds and can be set up to 300 seconds.
  Redirects are followed, up to ten. The request does not need an active
  Discord connection.
- With `expected_status_codes` **omitted or empty (`[]`)**, *any* HTTP
  response counts as success, even 4xx or 5xx. If specified, a status outside
  the list fails with `Webhook returned status X, expected one of […]`.
  DNS, connection, TLS, timeout and redirect failures also fail. An undecodable
  response body (using its declared charset, UTF-8 by default) can mark an
  already-delivered request as failed.
- History records success or failure, duration and a failure error (up to 500
  characters), along with `last_error` and `consecutive_failures`. Neither
  the response status nor body is stored; success status is logged.
- Retries default to **off** (`max_retries: 0`). REST can set the retry count;
  the WebUI cannot. Delays are `retry_backoff_seconds` (default 60) times
  `2^(attempt−1)`, capped at 3600 seconds. A retry sends the **entire** request
  again. Delivery is at least once; Odin provides no idempotency key. A cron
  slot missed during a pending retry runs once immediately afterward, then
  normal cadence resumes.
- A successful one-time webhook is removed. On a recorded final failure, it
  remains without `next_run` until a manual run or a new `run_at`. If its
  completion was **not recorded** after starting, it instead becomes inert
  under the interrupted-run rule above. Verify external effects before
  re-arming it.
- Every third consecutive failure sends a Discord alert, provided a channel
  and connection are available. A manual run returns `{"status":"success"}`
  or `{"status":"failure","error":"…"}`. Overlapping runs of the same
  schedule are dropped.

## Inbound webhooks

Endpoints are `/webhook/gitea`, `/webhook/github`, `/webhook/gitlab`
and `/webhook/generic`, registered only with
`webhook.enabled`. Gitea and GitHub use HMAC authentication; GitLab
and generic use a shared token. Authentication fails closed with 403 when
no secret is configured. Invalid JSON receives 400. The body limit is
10 MiB, and there is no per-endpoint rate limit.

Processing order: parse the request, run matching schedules **to completion**, then post the channel notification
and respond. A slow action can outlast the sender's timeout; the sender may
retry while Odin is still working. Each schedule fires at most once per delivery.

The HTTP response describes **the notification only**, not whether triggered
actions succeeded: 200 `{"status":"delivered"}` means notification posted;
500 means no channel was configured or sending failed; 503 means the bot was
not ready to send. Schedules already fired even if this final delivery fails.
Trigger machinery errors are logged without changing the response; individual
action failures appear in that schedule's history. A sender retrying after a
5xx can repeat the effects. Redeliveries are not deduplicated. While Discord
is disconnected, non-webhook triggered schedules and paused schedules are
skipped rather than queued.
