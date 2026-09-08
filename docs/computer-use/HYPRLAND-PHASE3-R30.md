# R30 Phase 3 live-session preflight: NO-GO before input

## Outcome

**Phase 3 remains INCOMPLETE / NO-GO. Phase 4 remains CLOSED.**

The operator-authorized real desktop resolves the missing-output problem from
R29. Read-only inspection confirmed the exact target Hyprland 0.55.2 commit
`39d7e209c79d451efab1b21151d5938289da838d`, matching Wayland/IPC peer credentials,
and two active, nonzero-sized outputs (1920x1080 and 2560x1440).

The mandatory live-test prerequisite is not met: every deliberately failing
case needs unconditional **owned-only** release independent of the component
being faulted, without changing other input or reloading the compositor.
The existing compiled fixtures do not provide that mechanism. Execution stopped
at this gate, before loading a plugin or creating any input device.

This is a **preflight abort**, not an executed native-test failure, not a passed
safety corpus, and not evidence that a Hyprland core modification is necessary.

## Concrete blockers

### 1. The fallback cannot certify owned-only cleanup

At the pinned upstream commit:

- `src/protocols/VirtualPointer.cpp:8-15,94-96` destroys a virtual pointer
  without a held-button release ledger. `src/managers/PointerManager.cpp:1108-1110`
  detaches its listeners, not its outstanding button contribution.
- `src/managers/input/InputManager.cpp:726-731` tracks buttons in an aggregate
  list and removes **all** occurrences of a code on release. A new virtual
  device sending a release is not an ownership-preserving fallback when a
  physical or other existing device holds the same button.
- `src/protocols/VirtualKeyboard.cpp:137-142` conditionally releases keys on
  close. The inspected live option was **false**. Changing it would violate
  this round's unchanged-configuration constraint and would not solve buttons.

In the candidate `hyprland-ledger-plugin.cpp:169-206`, cleanup erases ledger
entries before attempting native release, catches release failures and logs
them. An empty ledger is therefore not proof that release succeeded. Its
destructor then destroys the exact guardian `wl_client` at lines 125-135,
including after a failed drain. Keeping a duplicate client-side socket does
not preserve a usable resource after that server-side destruction.

A second helper calling the same candidate's `stop` is not independent cleanup
for exceptional unloading of that candidate. A separately qualified,
ownership-aware recovery mechanism is not present in these fixtures.

### 2. Loading the candidate violates the no-reload constraint

Pinned `src/plugins/PluginSystem.cpp:135` queues `Config::mgr()->reload()` after
successful plugin load. Lines 192-193 queue it again after unload. Avoiding an
explicit `hyprctl reload` command would not avoid these actual configuration
reloads. No plugins were loaded on the inspected session, and none were loaded
for this preflight.

### 3. The isolated harness is not safe to repoint at the desktop

- `hyprland-native-proof.py:129` writes the keyboard-close option.
- Its stock SIGKILL negative control expects a missing pointer release.
  Recovery at lines 200-206 sends a new press/release through a replacement
  client. This cannot certify physical-input preservation on a shared seat.
- The sender binds the first advertised output and uses fixed 800x600 extents;
  that is not explicit receiver/output targeting on this two-output desktop.
- `hyprland-lock-fixture.c:80-83` deliberately never unlocks. Its documented
  recovery is termination of the disposable compositor, forbidden here.
- The existing harness does not implement the full requested exceptional-unload,
  lock, physical-input-preservation and post-cleanup harmless-interaction corpus.
  Reaching its final JSON would not establish the requested GO.

The namespace assertions were not removed. None of these fixtures was launched
against the real desktop. The compiled ledger, sender and lock-fixture sources
on the target matched the branch copies by SHA-256; compilation is not live
qualification.

## Requested corpus accounting

| Case | Status | Receiver-observed release / later interaction |
| --- | --- | --- |
| Normal explicit release | Not run: cleanup prerequisite unmet | No evidence |
| Guardian SIGKILL | Not run: cleanup prerequisite unmet | No evidence |
| Exceptional plugin unload | Not run: cleanup and no-reload prerequisites unmet | No evidence |
| Focus / lock fencing | Not run: no safe lock fixture for a live desktop | No evidence |
| Physical-input preservation | Not run: no independent ownership-preserving recovery | No evidence |
| Scope / 250 ms expiry | Not run: cleanup prerequisite unmet | No evidence |

**Native cases executed: 0. GUI input events: 0. Plugin loads: 0. Lock requests: 0.**
No receiver was launched, so there is no receiver evidence or later harmless
interaction to report. Device inventory is not a held-state census; this report
does not claim that it proved the user's physical keys/buttons were all up.
No test-owned virtual device or held-input contribution was created.

## Preservation and next prerequisite

Inspection used read-only, peer-pinned compositor queries and host checks.
There was no deployment, service restart, compositor load/unload/reload,
configuration write, desktop manipulation, or write to live application data.
The pre-existing virtual input device was left alone. Existing checkout changes
were pre-existing, not attributed to this round.

Before native holds, establish an independently qualified owned-only cleanup
path and a live-safe receiver/lock harness. The plugin approach also requires
resolving its implicit configuration reloads against the no-reload constraint;
they must not be concealed as harmless IPC. Neither relaxing those constraints
nor modifying the compositor is authorized by this result. No Phase 4 deploy
or drawing test may proceed on the strength of this preflight.
