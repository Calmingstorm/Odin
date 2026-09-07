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
Persistent independent X11 devices under the R11 contract remain after detach by
design; presence alone is not a leak. Held input must still be released and worker
cleanup verified. Do not remove devices to tidy the display or simulate held-input
crashes in an active user's session.

| Observation | Operator response |
| --- | --- |
| Unknown action or lost reply | Never replay, even if nothing appears changed. Stop, inspect status/document and decide on a new task. |
| Topology/scale change, sleep or capture loss | Restore the intended layout with normal desktop controls, wait for stability and request fresh observation/consent. Never reuse old coordinates. |
| Clean owned cleanup but displaced windows | Preserve work and repair layout manually. Cleanup cannot reconstruct old window identities. |
| Quarantined cleanup | Leave automation disabled and retain receipts. Reconcile recorded workload is read-only, not proof of release. Investigate only exact recorded owned identities. |
| Blocked X server or uncatchable guardian death | No proven universal non-disruptive recovery exists. Protect unsaved work; seek separately authorized maintenance. |
| Permission/scope/portal/probe refusal | Fix the stated prerequisite under explicit authorization. Never bypass with shell input or relaxed desktop security. |

Modern identity-bearing unknown cleanup has no override. Legacy records without
runtime identity may have an authenticated acknowledgment path; acknowledgment
archives uncertainty as `operator_acknowledged_unverified`, never verified release
or replay permission. Process absence alone does not prove release after a crash.

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
