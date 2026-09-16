# PR 356 computer-use review follow-up

Base: `32a0e8ed`. Scope: F6, F7, F13, F14, F15, F16, F21 in the
2026-09-15 whole-branch review. No live desktop input, external-host access,
deployment, service restart, native rebuild, or gate/configuration relaxation.

| Finding | Verdict and change |
| --- | --- |
| F6 | Deployment mismatch confirmed. Keep requested default managed activation enabled and root-only verification intact. Return an explicit root-required diagnostic, document that desktop UID and `runtime_sudo` do not satisfy the in-process verifier, and describe the separately provisioned privileged deployment. Stock `User=odin` service support is not claimed. |
| F7 | Normalize only null and blank strings in the five new optional start fields. Preserve zero/false, malformed selection, and incomplete populated recovery-pair rejection. X11 fixture tests cover the call shape without live input. |
| F13 | Add the local-only release limitation to both lifecycle/action tool descriptions and the regenerated reference. Add separate full-definition parity pins because computer tools are outside the static registry parity set. No release policy change. |
| F14 | Synthetic historical schema-v0 recovery row upgrades and reopens under current validation without logical rewrite. The actual external store remains untested and deferred; the target is OFF and was not accessed. Validators remain strict. |
| F15 | Move closed-local settlement outside the committed transaction's rollback handler; read the other early-return result before committing as well. Regression proves the settlement exception remains visible, with no active outer transaction and durable closed state. |
| F16 | Explicit X11 capture-failure regression proves old observations and delivered-observation authority are cleared. Runtime behavior unchanged. |
| F21 | Document the literal backslash-zero topology/inventory separator. Decline the cosmetic native-source change: changing the audited native image or digest would require explicit parity/qualification work. |

Validation is fixture/unit testing, not production or native-compositor
qualification. The focused combined suite covers plugin discovery, diagnostics,
tool contracts/reference, selection, X11 capture, store reopen, settlement,
recovery, and release outcomes. Changed Python files pass Ruff; the generated
reference and `git diff --check` are clean. No CI, lint, type, or gate configuration
was modified.
