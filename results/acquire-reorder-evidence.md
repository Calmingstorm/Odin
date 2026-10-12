# P1 acquire/reorder identity correction

## Scope and artifact

Worktree: `/home/odin/worktrees/v414-accounts`.
Branch: `work/v414-accounts`, based on `ab74356fcc8be8706c7a5926809c5ea9187dc8ec`.
Independent finding: reviewer `4592b247`, full result read before implementation.
The implementation is in `src/llm/codex_auth.py`; the regression artifact is
`tests/test_codex_acquire_reload_identity.py`. The provider has only a comment
correction describing the ownership lease.

## Observed defect and correction

The retained refresh-chain auth can move from slot 0 to slot 1 during acquisition.
Returning its pre-await numeric index makes the token/account tuple inconsistent
and downstream failure marking or reactive refresh target B instead of A.

All three acquisition returns (manual, main and last-chance fallback) now resolve
the same auth's current slot under the pool lock after token acquisition. An auth
removed/replaced while awaiting cannot produce a successful stale tuple.

The returned index is an int-compatible request ownership lease carrying pool and
auth object identity. Existing provider and image callers preserve this value;
mark_limited, mark_auth_failed, force_refresh and token_for resolve the lease under
the pool lock. A later reorder follows the same auth, while removal, changed
authorization and remove/re-add invalidate it. force_refresh and token_for also
re-check membership after their own awaits. Plain int inputs retain current-slot
operator semantics; negative indexes now fail closed in these consumers.

The lease's integer value describes the slot AT acquisition; after a later reload,
use the lease through the pool methods, not direct list indexing or int(index).
Converting/serializing it to an integer intentionally discards request ownership.
There is no production caller conversion in the inspected call paths.

No changes were made to refresh-chain handoff, save guards or publication hooks.

## Event-controlled evidence

47 new parameterized cases cover:

- Expiry-driven OAuth paused during sync/async reorder, for main, manual and
  explicit fallback acquisition. Returned bearer, account ID and current slot
  agree, and exactly one refresh token is consumed.
- A subsequent reorder after acquisition: failure marking benches only A,
  reactive refresh consumes A's successor refresh token and retry lookup stays A.
- Removal, different account replacement, same-account authorization replacement
  and remove/re-add: old leases never mark/refresh/retrieve the new slot owner.
- Successful token-await completion from a retired auth is rejected in all
  acquisition paths, independently of the refresh save guard.
- Removal during force_refresh/token_for awaits rejects completion.
- Real CodexChatClient request held awaiting upstream response during reload:
  401 refresh/retry stays A; 429 benches A and retries healthy B.
- A lease from another pool cannot target its numerically identical slot.

Differential execution loaded `ab74356:src/llm/codex_auth.py` in a disposable test
process via git show (without editing the worktree). All six acquire-during-reorder
cases failed exactly at `(A successor, A, 0)` versus required slot 1. The fixed
implementation passes these cases.

## Validation

Final focused command (Python: `/home/odin/odin-dev/.venv/bin/python`):

```text
python -m pytest -q
  tests/test_codex_acquire_reload_identity.py
  tests/test_codex_refresh_chain_reload.py
  tests/test_codex_account_mutation_regressions.py
  tests/test_codex_account_quota_recovery.py
  tests/test_codex_credential_writes.py
  tests/test_codex_auth.py
  tests/test_codex_auth_rotation.py
  tests/test_codex_limit_aware.py
  tests/test_codex_reliability.py
252 passed, 1 warning in 15.05s
```

The warning is discord's existing audioop deprecation. A preliminary provider
test assertion used header spelling `ChatGPT-Account-ID` instead of the actual
dict key `ChatGPT-Account-Id`; corrected before final successful run.

`python -m mypy --follow-imports=silent src/llm/codex_auth.py`: no issues.
`git diff --check`: clean.

Independent read-only reviewer `910c9774`: approved, no correctness blockers;
ran 99 focused new/refresh-chain/mutation tests plus 26 existing pool tests, and
independent foreign-pool/retirement probes. Suggested foreign-pool coverage was
subsequently added as the 47th new case.

No full suite, external OAuth, live credentials, other worktree changes, push,
deployment or service operation. Parent integration and full-suite validation
remain separate. This report is evidence of the targeted fix, not a claim of
whole-release acceptance.
