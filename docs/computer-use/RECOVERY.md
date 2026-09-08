# Computer use: stop, recovery and privacy

Read [OPERATOR.md](OPERATOR.md) before use and [PACKAGING.md](PACKAGING.md) before
service start or exposure. Authentication, consent and private storage are separate.

Use **Pause / revoke input** on unexpected input or focus, **Stop** to finish, and
administrator **Disable computer use** as the global control. Read back runtime
revocation and cleanup, not just the saved enablement boolean. Stop releases owned
input and drains/reaps workers while preserving the user's applications. It does
not undo edits, restore display layout or close documents. Export isolated files
before ending the task and destroying its sandbox.

Input leases bound ordinary loss handling, not hard real-time recovery from a
permanently blocked display server. Timeout means quarantine, not success.
Production attached X11 uses shared core input and creates no extra masters.
Stop drains owned input and verifies the final core hierarchy against its starting
identity. A pre-existing reserved Odin master blocks admission: this version must
not bless stranded devices from an earlier version. `retained_inactive` is never
clean attached cleanup. Persistent devices are isolated-only. Do not run manual
name-based device deletion or held-input crash experiments in a user's session.
The isolated native-removal qualification path remains unqualified for preserving
ordinary applications; its clean hierarchy result alone is not safe desktop
detach. Quarantine is a failure report, not proof that human input is restored.

| Observation | Operator response |
| --- | --- |
| Unknown action or lost reply | Never replay, even if nothing appears changed. Stop, inspect status/document and decide on a new task. |
| Topology/scale change, sleep or capture loss | Restore the intended layout with normal desktop controls, wait for stability and request fresh observation/consent. Never reuse old coordinates. |
| Clean owned cleanup but displaced windows | Preserve work and repair layout manually. Cleanup cannot reconstruct old window identities. |
| Quarantined cleanup | Leave automation disabled and retain receipts. Reconcile recorded workload is read-only, not proof of release. Investigate only exact recorded owned identities. |
| Blocked X server or uncatchable guardian death | No proven universal non-disruptive recovery exists. Protect unsaved work; seek separately authorized maintenance. |
| Permission/scope/portal/probe refusal | Fix the stated prerequisite under explicit authorization. Never bypass with shell input or relaxed desktop security. |

For persisted quarantine, **System > Computer** remains available even when input
is disabled. Use the displayed **session generation**, not the subsystem's
configuration generation. `POST /api/computer/recover` accepts `session_id` and
integer `generation`, and performs owner-scoped automatic absence verification.
It does not infer input release from process absence. `acknowledge_legacy` accepts
the same fields plus the exact acknowledgment below, but only for records with
no runtime identity; it cannot reconcile a modern descriptor.
The inspector selects `acknowledge_legacy` when the reported recovery reason is
`legacy_runtime_identity_missing`; otherwise its acknowledgment control uses
`reconcile`. Both paths preserve unverified cleanup and require explicit operator
attestation. Leaving the inspector retires its pending status read, so returning
can check current state without waiting for an old request. It never replays a
mutation or captures a frame automatically.

An authenticated administrator authorized for the target host can explicitly
reconcile a stranded **existing-session** record using the
**Acknowledge unverified cleanup** control or
`POST /api/computer/reconcile`. First independently confirm no held
keys/buttons, no stranded owned masters, physical devices on their normal core
masters, and no remaining computer workers/guardians. Protect unsaved documents.
The request fields are `session_id`, integer `generation`, and `acknowledgment`
equal to `ACKNOWLEDGE UNVERIFIED CLEANUP <session_id>` with the actual ID substituted.

This path refuses active/paused sessions, live controller adapters, isolated
workloads, missing runtime identity, stale generations, surviving recorded
processes/groups, and unavailable inspection. It can reconcile a foreign owner's
stranded singleton without granting access to that owner's captures or documents.
Historical pending launches may have unrecorded children and old descriptors do
not identify the display: the operator's independent inspection is essential.
No automatic restart/boot-sweep override is inferred from process disappearance.

Reconciliation closes the admission blocker with a durable
`operator_acknowledged_unverified` record and **complete=false**. Original failed
cleanup, unknown actions and runtime identity remain intact. This is an explicit
operator attestation, not manufactured verified release or replay permission.
Request a new session and a fresh delivered observation before any further input.

Evidence TTL is 24 hours, distinct from short-lived action grounding. Clean
disable/shutdown purges evidence bytes but retains receipts/session records.
Unclean death can leave bytes: disabled boot intentionally does not inspect old
storage, so external retention cleanup is operator-owned until enabled startup.
Downloaded copies need a separate retention policy. Do not publish screenshots,
credentials or private documents in support reports.

For rollback, Disable first and confirm revocation/cleanup. Preserve receipts and
the previous configuration/release. An authorized operator can restore the service
release and verify health independently. Never restart the graphical session,
broadly kill processes or delete receipts to manufacture a clean result.
