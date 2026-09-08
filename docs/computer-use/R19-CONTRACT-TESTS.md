# R19 contract reconciliation and boundary coverage

Pure-fake tests only. No display, desktop, deployment or pipeline qualification
is claimed by this report. Campaign base: `4c422769`.

## Reconciled contracts

- Private primitive fixtures provide a proven keyboard plan with canonical
  `Control_L` naming. Release ordering, cancellation, uncertain effects and
  cleanup failure assertions remain strict.
- AT-SPI fixtures expose the current focused-state and bounded-text interfaces,
  including character count. Frame geometry is queried on the bound adapter
  instance. Reference identity, ancestry and changed-target tests remain intact.
- Attached capture fixtures accept and assert the exact native verification
  scope supplied after dispatch, instead of accidentally throwing during the
  postcondition read. The frame remains consumed after dispatch.
- Generic computer configuration first enforces administrator identity. Admin
  requests cannot set `enabled` through the provisioning route, and non-object
  computer payloads are rejected without publishing configuration or activating
  the lifecycle. Nullable metadata is pinned in the complete field contract.
- The execution-route inventory classifies the actual accessibility-status
  probes: fixed read-only argv, bounded reads, minimal environment and operator
  identity, not arbitrary shell or workspace command execution.

## New behavior tests

`test_computer_action_boundaries_r19.py` and
`test_computer_pixel_guards_r19.py` add **91 tests**. They cover malformed or forged
receipts, typed source bindings, mapped target bounds, unique readable accessible
targets, safe modal identity, full pixel-region bounds, private physical/XKB
state interference, all-or-nothing preflight, failed-release ledger retention,
and descriptive task hints that never authorize input. Raster and pointer
verification retain their explicitly limited scopes.

## Recorded validation

The two new suites, seven owned legacy suites, and the existing isolated-pixel
suite completed together: **500 passed, 2 warnings** in 15.98 seconds. Warnings
were the existing Python `audioop` deprecation and aiohttp `NotAppKeyWarning`.

| Module | Focused statement coverage |
| --- | ---: |
| `actions.py` | 100% (63/63) |
| `gui_actions.py` | 88.72% (173/195) |
| `runtime/isolated_pixels.py` | 100% (131/131) |
| `runtime/pixel_fields.py` | 100% (17/17) |
| `task_context.py` | 100% (43/43) |

Ruff check and format check passed for all nine changed test files; diff-check
passed. Existing owned test files were formatted as part of the round's hygiene
requirement. No source implementation or coverage baseline was changed. These
are focused results, not a claim that the full repository quality gate passed.
