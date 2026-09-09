# R38: reproduced ARM refusal and corrected input-state gate

## Named predicate, directly reproduced

On the authorized Hyprland target, the unchanged R37 native guardian and Python
backend rejected a freshly observed, manually inspected Pinta palette click:

- `command=begin`, `scope_operation=arm`, **`scope_error=human-input-held`**
- `steps_planned=0`, `steps_completed=0`, `input_was_sent=false`
- `release_sent=true`, `release_acknowledged=true`
- cooperative stop reaped the guardian and closed owned connections

The service journal already contained the same named refusal for the operator's
earlier click. Its provenance-only pending SQLite row was the initial action
reservation, **not** the native terminal receipt.

The supervised reproduction used the existing backend driver with its original
process/output pin, manual image inspection, fresh capture/binding/pixel checks
and no replay. One observe request, three captures (including revalidation), one
attempted click, zero injected input events, zero recovery operations, 55.33 s
through cleanup. The inspected selected canvas was blank; no drawing or document
operation was sent.

## Actual cause

The companion used `CInputManager::getKeysFromAllKBs().empty()` to decide whether
a human held a key. Despite its name, in the pinned Hyprland source that method
returns `m_pressed`, the **seat-output ledger**. `onKeyboardKey` updates that
ledger only on the forwarded, non-IME output path, after keybind filtering.
It is not the current per-device input state.

Read-only measurements on the still-running compositor found:

- seat-output ledger: one key, `KEY_LEFTMETA` (125)
- every one of 11 live `IKeyboard` pressed-key ledgers: empty
- all 27 evdev devices' `EVIOCGKEY` snapshots: empty, including the existing
  non-Odin virtual device
- compositor held-button list: empty
- companion owned keys/buttons: zero; `armed=false`, `failed=false`

The compositor measurements used bounded read-only `process_vm_readv`, with
addresses/layout grounded in the running executable's symbols/disassembly.
No debugger attachment, target function call, process suspension, memory write,
key release or compositor reload was used. One initial control-block layout
assertion failed closed; corrected reads used the measured smart-pointer layout.
The code shipped here does **not** use memory offsets or process inspection.

The precise historical event that left the seat Meta entry stale is not proven.
The current divergence and the incorrect gate are proven; attributing that
historical event to a particular human action or old Odin command would be a guess.

## Perturbation check

R36 was **not behavior-neutral**: it batched due click events, moved completion
into that dispatch loop, tightened reply acceptance at the existing timeout
boundary, and retained the scope stream after a complete negative reply. R37
also made the native `error` field strictly string-typed.

To separate those changes from this failure, an unmodified pre-R36 guardian from
`41f6d501` was built separately. Both that binary and the installed R37 binary ran
against the same unchanged compositor/plugin. Each received only a fresh scope
bind and ARM, never an action command. Private syscall traces recorded the actual
compositor reply **`human-input-held` for both**. Both planned/sent zero events.

The old binary lost its release acknowledgement after closing the negative-reply
stream; R37 retained it. Independent companion status and device inventory were
clean after both. These two arm-only probes are additional lifecycle operations,
not additional GUI inputs. They prove the named refusal is reproducible without
R36/R37's dispatch changes; they do not prove those changes neutral in all cases.

## Fix

1. Use one compositor-thread `inputHeld()` predicate at **all three sites**:
   ARM, owned positioning, and the exact-target pointer-focus exception. Check
   current `IKeyboard::getPressed()` over the supported Linux evdev key domain,
   including physical, virtual, disabled and non-forwarding devices. Missing
   inventories/null devices refuse. Keep the held-button gate and all owned
   key/button/modifier, focus, geometry, provenance and lease checks.
2. Do not clear or rewrite the seat-output ledger, send foreign releases, ignore
   actual held Meta, or retry an input. Unsupported values above `KEY_MAX` found
   in the output ledger still refuse. This is not qualification for arbitrary
   malformed uint32 virtual-key protocol values: the pinned public device API
   has no whole-vector accessor. A future upstream `hasPressedKeys()` API would
   remove that supported-key-domain limitation.
3. Fix the R37 persistence regression: explicitly admit and strictly validate
   the bounded `native_failure` schema. Previously the store rejected that field
   with `invalid_receipt`, leaving the initial reservation pending.
4. Execute required controller stop in `finally` if failure-receipt settlement
   itself fails. A storage failure still surfaces; it cannot skip cleanup or
   authorize replay. Native evidence does not promote conservative execution or
   quarantine conclusions.

## Verification and handoff

- Exact ABI native guardian/capture/companion build passed with production
  `-Wall -Wextra -Werror` flags on the target, in a separate candidate directory.
- End-of-phase focused tests: **104 passed** (native predicate, all-key range,
  pointer entry/frames, provenance, real SQLite failure schema, normal-turn
  receipt/stop/no-replay, injected storage failure, existing turn/store cases).
- X11 attached/controller/guardian/cleanup regression subset: **128 passed**.
- Changed-file lint and `git diff --check` passed. No full suite or hosted CI
  claimed. One earlier broader test command named an absent test file, collected
  nothing, and was corrected before these successful results.
- No production checkout, config/data write, service restart, plugin load/unload,
  foreign-input release, or local desktop input. Existing production checkout
  remains R37. Service/compositor/application PIDs remained unchanged; final
  inventory contained no Odin virtual devices.

**Deployment now requires the rebuilt scope companion**, not just the input
binary/Python. Use the existing immutable versioned plugin procedure and verify
the executing build identity. Never overwrite/reload the same path and assume
the mapped code changed. Deploy Python/store/controller together. Guardian source
and X11 runtime source did not change in this round.

The corrected plugin was **compiled, not loaded**. Live successful clicks after
the fix remain the operator's deployment/acceptance gate. This report does not
claim that a failed click is a completed GUI task.
