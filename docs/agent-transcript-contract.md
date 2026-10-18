# Agent transcript and control contract

Agent generations retain ordered native tool calls and exactly one paired result
per accepted call. Provider IDs survive replay; absent IDs are assigned once,
duplicate IDs and malformed arguments get paired errors without execution.
Correlation is **not** exactly-once execution or permission to retry a mutation.

Replay inputs are immutable. Stored telemetry uses its existing redaction rules,
with additive call `id`, result `tool_use_id`, structured status and uncertainty.
`llm_text`, tool `result`, and final `result` remain strings. Historical rows do
not need IDs. Legacy string and mixed transcripts remain compressible without
inventing missing historical calls. Oversized immutable newest calls may remain
explicitly unfit; compression cannot silently change executed arguments.

Parent messages are queued with a sequence; consumption is recorded separately.
They wake native child waits via trusted execution context, not tool arguments.
An interrupted wait returns every requested child snapshot, retaining terminal
observations, and never cancels children. Other tools finish before a correction
is consumed. Calls prevented by queued corrections are recorded not executed.
Finalization checks the inbox; an exhausted budget cannot accept a superseded
answer as success.

Activity reports phase, phase start/deadline, real last progress, inbox count and
last consumed sequence. No timer manufactures progress. A long bounded child
wait is not idle; overdue deadlines and genuinely idle ready workers remain
detectable. A private identical-call **and** identical-result guard gives one
warning after three unchanged cycles, then terminates truthfully if unchanged.
It is a backstop, not the transcript fix; changing results reset the streak.
Effect-free observation waits (`wait_for_agents`) never count toward the streak:
a child inside one long iteration renders the same snapshot on every wait.

## Upward reports

`report_to_parent(message)` lets a spawned agent queue an interim report for
whoever actually spawned it. It is agent-only: defined outside the static
catalog and added to every spawned agent's catalog at every depth, never to the
main turn, loops, schedules or skills. Dispatch refuses any caller that is not a
spawned agent's own tool cycle; the sender comes from that trusted, task-fenced
context, never from tool input or audit attribution. `tools.disabled_tools` can
disable it, and no skill or MCP tool can take its name.

The receiver is fixed at spawn from the actual invoker, never from `parent_id`
or `turn_id` inheritance: an agent's own tool cycle means that agent; a chat or
API turn means its `(channel_id, request_id)` owner; a schedule or loop (message
id 0) means none. There is no forwarding to a grandparent, a later turn or the
channel. A same-process resume of the same request binds a fresh mailbox
incarnation that surviving agents report into; sends during the gap are refused.

Admission is synchronous, in order: a non-agent caller, an empty or
whitespace-only body, a body over 12,000 code points, no receiver, a stopping or
closed receiver, then secret scrubbing of label and body and refusal if the
scrubbed text pending in that mailbox would pass 60,000 code points (each report
costs at least 1). Nothing is truncated. Refusals are typed failures whose
receipt says to keep working and put the content in the final result; a queued
receipt confirms queuing only. Admission identity is (recipient, mailbox
incarnation, mailbox sequence). An unknown outcome is never retried.

Reports drain on their own only at the receiver's loop head. Wherever a parent
message or human steer is consumed, pending reports ride just ahead of it, so a
correction is always the latest instruction; reports never trigger a drain
anywhere else. Each drain appends ONE `role=user` message with
`provenance=agent_report`: a fixed header marking agent-produced evidence, then
one `json.dumps(..., ensure_ascii=False)` object per report (with U+0085,
U+2028 and U+2029 escaped too), and ordered structural `report_items` metadata.
They never interrupt a generation, a tool call or `wait_for_agents`, never
suppress or delay a final answer, never add or consume iterations, never reset
completion state and never update activity, telemetry or stuck fingerprints.
Compression may summarize or drop them; only parent and human directives stay
protected. The completion judges ignore them. Replies use `send_to_agent`,
whose correction semantics are unchanged.

A stop request refuses new reports. Every terminal agent transition and every
chat-turn close (finish, /stop, error, suspension, replacement, shutdown)
closes the mailbox and discards what is pending. Nothing is durable before
consumption; consumed reports live in the transcript and checkpoint. Each
mailbox keeps its last 1,024 lifecycle records (queued, consumed, closed) plus
totals and a dropped count; agent receivers export them in their trajectory.
The sender's call audits once through the normal wrapper, carrying the
recipient, mailbox incarnation and sequence.

## Deployment and validation

Deployment requires a separately authorized **drain of in-flight agents**.
These tasks are in memory, not resumable from trajectories. Source replacement
does not upgrade running coroutines; restart does not migrate them. There is no
seamless-resumption claim. Legacy transcript support is compatibility, not a
license to deploy over active work.

Hermetic tests drive manager → both iteration callbacks → Responses/Kimi/Ollama
conversion, assert a single execution, and cover repeated tool names, malformed
arguments, mixed compression, partial cancellation, parent controls and the
repetition guard. Provider live smoke belongs after review and authorization.
Chat execution, chat stuck-loop policy, parallel agent tools, auth and config
knobs are unchanged.
