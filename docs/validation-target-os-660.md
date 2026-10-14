# Validation target OS binding (#660)

`validate_action` now binds each check to an immutable `HostLease` before
constructing its command. The binding supplies the executing target's declared
OS to both `_build_command` and `_evaluate`. A task-local context carries that
same lease into the timeout-wrapped command callback. The governor still sees
the effective alias, and execution still passes the exact target to transport
behind the lease's force-revoke fence.

The lease spans command construction, admission, transport and evaluation. It
is released on invalid targets, refusals, exceptions, timeouts, revocation and
cancellation. Acquisition occurs inside the bundle semaphore and after grace;
waiting checks do not pin a generation prematurely. A host publication cannot
mix the old OS with a replacement address, even for concurrent checks sharing
an alias. OS metadata is never read from a separate mutable configuration copy.

Linux probe strings and evaluation are unchanged. Raw `command` checks keep
their existing workspace and command-shell opt-ins; fixed-shape probes do not
gain either behavior. No tool schema, live host configuration or transport
implementation changed.

## Caller audit

Repository-wide searches for `run_bundle` and `_build_command` found:

- **Production `run_bundle`:** `ValidationTools._handle_validate_action` is the
  only caller. It is fixed with the per-check binding. The fallback tuple
  resolver remains supported for standalone callers without dynamic targets.
- **Production `_build_command`:** `run_bundle._run_one` is the only caller. It
  uses the OS yielded by the binding, or by the standalone tuple resolver.
- **`tests/test_post_validation.py`:** standalone Linux builder/bundle tests
  use explicit immutable fixture tuples. No runtime inventory gap.
- **`tests/test_post_validation_host_probes.py`:** explicit macOS/Linux builder
  and bundle fixtures already carry the intended OS. No fix needed.
- **`tests/test_campaign_a_validation.py`:** direct builders exercise local
  Linux probes; bundle fixtures declare Linux. No fix needed.
- **`tests/test_campaign_execution_validation.py`:** the direct bundle fixture
  declares Linux for OS-independent command checks. No fix needed.
- **`tests/test_next_level_pipeline_integration.py`:** the direct bundle
  fixture declares Linux for mixed HTTP/port/service checks. No fix needed.
- **`tests/test_hosts_executor_leases.py`:** its fake bundle intercepted the
  old alias-only seam. Updated to enter the binding and assert the Linux OS;
  unbound callbacks now fail closed.
- **`tests/test_validation_tool_host_os.py`:** new real `ToolExecutor.execute`
  regressions use inert transport, exact Linux command assertions, macOS probe
  and evaluation checks, mixed hosts, defaults, dynamic publications and all
  lease cleanup paths. Direct `_build_command` calls only express the expected
  OS-specific probe; the tests exercise the production handler, not a substitute
  resolver.

No other production or script caller was found. The original red run on
master `6c7ef1cc1b39a10c720310574a1eabd8d5a6b093` recorded 13 failures and 8 passing
controls before implementation. The final unchanged 34-case regression file
records **15 failed, 19 passed** on that base and **34 passed** with the fix.

These tests prove tool routing and target-generation consistency with inert
transport, not that a native macOS host executed the probes. Native probe
behavior was covered separately by the existing #655 work.
