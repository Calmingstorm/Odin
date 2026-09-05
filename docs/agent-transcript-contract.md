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
