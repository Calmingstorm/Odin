# Compatible streaming and agent progress

All compatible Chat Completions requests now use SSE, including ordinary chat,
tool calls, and the pre-swap reload qualification probe. Responses remain atomic
to callers. No partial text is delivered or executed before stream completion.
An endpoint must accept `stream: true` and `stream_options.include_usage: true`;
there is no silent non-streaming fallback.

## Timeouts and upgrades

`openai_compatible.request_timeout_seconds` defaults to 3600 (60–86400).
`openai_compatible.stream_stall_timeout_seconds` defaults to 180 (10–3600).
Connection establishment is bounded at 30 seconds. The stall bound measures
socket-read silence; provider keepalives keep the connection alive, not the
agent's substantive-progress clock. Agent iteration and lifetime limits remain
independent outer bounds and are not extended by these fields.

On upgrade, a legacy `openai_compatible.timeout` becomes the stream-stall bound,
and the whole-request backstop becomes 3600. Each explicit new field wins over
the corresponding migrated value. Migration validates before writing, uses the
existing atomic leaf-scoped config writer, preserves environment placeholders,
comments, permissions and symlink targets, and removes the ambiguous old leaf.
It logs the exact resulting values. If persistence is unavailable, the same
interpretation applies in memory and the rewrite is retried on the next load;
startup is not blocked solely because the file could not be rewritten.

API status, the LLM configuration page and provider reload use the explicit
fields. Legacy dedicated API submissions of `timeout` are interpreted using the
same mapping. The transport candidate must pass streaming qualification before
replacing the serving client.

## Agent-only progress

Agents optionally install a machine-owned observer on either transport. The
activity shown by `list_agents` and `wait_for_agents` distinguishes time since
the last wire event from time since the last substantive text, reasoning, or
tool-call delta. It also reports physical attempts and discarded partial-output
counts when available. No model text or reasoning is exposed in telemetry.
Keepalives are not substantive progress. These observations do not modify the
conversation, consume an iteration, end a turn, or interrupt a generation.
Main-turn requests install no observer and keep their existing atomic delivery.

## OpenRouter pin fallback

A per-model pin sets the preferred upstream. `allow_fallbacks: true` now permits
OpenRouter to leave that preference when unavailable; `false` makes it a hard
pin. The UI, schema and request policy use that same contract. Conservative
context profiles account for every possible fallback route when enabled.
