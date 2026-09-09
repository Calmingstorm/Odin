# Main chat steering

`/steer <message>` queues a human correction for the **currently running main
chat turn in the invoking Discord channel or thread**. It does not start a new
turn, steer a background agent/loop, or wait for the channel's conversation lock.

The immediate, ephemeral receipt is:

> Message queued (sequence N; not yet consumed).

This attests only to in-memory enqueueing. It is not an execution, consumption,
or durable-delivery acknowledgement. The command becomes available through the
existing Discord command-tree sync when this code is deployed normally.

## Admission and ownership

- The existing slash-command allowed-user gate applies. Bot users are refused.
- Only the running turn's original requester or a currently configured admin
  may steer it. Being an allowed user is not authority to drive someone else's
  privileged tool execution.
- Steering does not replace the original requester, tool permissions, host
  scope, or API tool allowlist.
- Blank input and recognizable credentials are rejected without echoing the
  submitted message. Slash options use the same secret detector as intake.
- Each message is limited to 4,000 characters, with at most 128 queued messages
  per turn. The latter bounds both pending input and queued/consumed metadata.
- Missing, stopping, or finishing turns reject steering. Nothing is saved for
  the next request in the channel.

`ChannelStateRegistry` owns a `ChatTurnInbox` under `(channel_id, request_id)`,
the same ownership key used by stop waiters. Owner lookup, authorization,
sequence assignment and `put_nowait` are one synchronous operation. The turn
holds the exact same Queue, Event and sequence/event metadata, not copies.
Replacing or clearing an old owner closes only that owner's mailbox.

## Consumption boundaries

Only `_ChatTurn.drain_inbox()` mutates the model transcript. It drains FIFO with
`get_nowait`, appends a separate `role=user` message tagged
`provenance=human_steer`, records consumption, and clears the inbox Event.
The visible prefix includes the authenticated sender's numeric user ID; user
text cannot manufacture structural provenance.

Drain checkpoints are:

1. Entry to the iteration runner and the start of each generation.
2. Before accepting a text-only final answer.
3. After a complete tool batch and its existing WI-4 checkpoint.
4. After the asynchronous completion classifier, before using its verdict.

Consumed directives use the existing WI-5 checkpoint before the next generation.
They do not extend the resumability TTL, create tool intents, or count as tool
progress. A correction arriving during text generation/classification suppresses
the stale final answer/verdict and gets another iteration within the existing
cap. A final-iteration correction produces an explicit budget-exhausted error,
not a claim that it was acted on.

Post-tool steering replans before the old plan's wait judgment or skill handoff.
It clears that skipped judgment's pending phase, without resetting fingerprints,
the one-shot warned flag, validation requirements, or continuation budgets.
The completion classifier sees the original task plus consumed corrections.
Soft and emergency compression preserve human directives by the same structural
rules already used for agent-parent instructions.

Normal finalization closes steering admission synchronously before the terminal
trajectory save can yield. `/stop` and active-request cleanup retain their
existing timing. Error, stuck and suspension paths likewise close admission
before their terminal persistence awaits. All exit paths close the request's
mailbox. Already-queued input may still be lost when those safety exits win.

## Important limits

- This is cooperative steering, **not cancellation**. It does not interrupt an
  in-flight generation, ordinary tool, or `wait_for_agents` call. Tool calls
  returned by the current generation may still execute before the post-batch
  checkpoint. Use `/stop` for cancellation; steering does not undo effects.
- Pending Queue/Event state is process-local, classified as reconstructed in
  the checkpoint codec. Stop, error, suspension or process loss can discard
  queued-but-unconsumed messages. There is no automatic replay into another
  request.
- Consumed messages are in the checkpoint transcript when WI-5 succeeds.
  Resume creates a fresh mailbox and seeds sequence numbers from those messages.
  No checkpoint schema-version change or new pending-message delivery guarantee
  is introduced.
- Existing safety/error/stuck-loop termination still wins. A queued receipt is
  deliberately not a promise of a future generation.

## No-steer invariant and campaign gates

An empty `drain_inbox()` returns false without mutating messages, events,
timestamps or budgets. New persistence awaits and retries are conditional on
actual consumption. No watcher, timer, task, event waiter, new generation,
guard reset, provider-policy change, or tool-execution change is installed for
an unsteered turn. The existing completion-classifier arguments and ordinary
final response remain unchanged. The mailbox itself is only process-local
bookkeeping.

The original implementation commit did not establish these gates. The
checkpoint test pass now exercises the following with isolated test data and
fake provider/tool effects (no live Discord or operational mutation):

- unsteered trace/return/guard/checkpoint parity, including error and resume;
- FIFO and exact-once drain, counter/event state, empty-drain no-op;
- requester/admin/credential/size/count admission and ephemeral queue-only ack;
- old/new request isolation, late cleanup, late binding and terminal-save races;
- corrections during generation, classifier, tool batch and final iteration;
- complete native call/result pairing, no stale handoff or pending wait judgment;
- consumed-directive compression and checkpoint/resume sequence continuity;
- stop/suspension/failure dropping pending messages without replay.

### Established checkpoint evidence

- `tests/test_chat_steering_admission.py`: FIFO/exact-once and empty no-op;
  requester/admin/allowed-user/bot/credential/size/total-turn count boundaries;
  ephemeral queue-only receipts; old/new ownership, late bind and late cleanup.
- `tests/test_chat_steering_runtime.py`: actual `_run_chat_iterations` with
  event barriers during generation, classification, tools, WI-4/WI-5 and
  terminal persistence. Pins complete native call/result ordering, discarded
  stale classifier judgments/handoffs, cleared pending wait judgment with
  fingerprints and warned budget retained, original requester dispatch,
  operational-validation enforcement, final-iteration explicit error and
  failed WI-5 blocking another generation. Stop/cancellation/suspension/failure
  close admission and never replay pending directives into a resumed mailbox.
- `tests/test_chat_steering_parity.py`: deterministic runtime trace/return,
  classifier arguments, guards and checkpoint goldens captured by executing
  pre-steering `4ecb63b0`; includes error and restored iteration entry. Goldens
  need no historical Git objects in shallow CI clones. The terminal admission
  close is synchronous bookkeeping; ordinary trace and awaits remain unchanged.
- `tests/test_chat_steering_resume.py`: structural soft/emergency compression,
  actual codec snapshot/restore excluding pending queues, `run_resumed`
  sequence continuity and persisted cleared wait-judgment state.

The focused checkpoint invocation passed **186 tests** across the four new
steering files and existing recovery, typing-resilience, context-budget,
checkpoint-codec and slash-command files. Existing recovery/typing fixtures now
construct real `_ChatTurn` and `ChannelStateRegistry` objects instead of stale
partial namespaces; their behavioral assertions are unchanged. Relevant source
and changed-test lint is checked separately. These are focused runtime and
codec gates, not a claim of full-suite coverage, GitHub CI, deployment health,
real-provider delivery, or successful persistence under a production outage.
