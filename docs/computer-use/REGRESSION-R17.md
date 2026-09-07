# R17 regression and accessibility handoff

## Diagnosis and fix

The new XKB key-plan admission rejected every nonzero locked modifier. A
read-only query of the affected display returned locked_mods=16 (Num Lock),
with no depressed/latched modifiers. Resolving ctrl+n on the original branch
raised unsupported_key without dispatching input. The corrected planner
returns [37, 57] on that same display, without changing its keyboard state.
Num/Caps locks are accounted for in actual keysym lookup and modifier proof;
unsupported symbol mappings and busy modifiers still refuse. Lock/group state
is pinned through dispatch rather than silently changing the user's locks.

The privileged worker handshake separately assumed every guardian would announce
an injector. A preflight refusal occurs before that injector exists. Its terminal
receipt was consumed as an invalid ready message, then EOF was parsed in its
place. This discarded injected=false/released=true evidence and escalated a safe
refusal into unknown release and quarantine. The reader now discriminates a
strict preflight terminal receipt from an injector identity, awaits guardian
exit and verified process disappearance, and preserves the terminal evidence.
Malformed, post-dispatch or release-unknown outcomes remain fail-closed. No
partial input is replayed and no cleanup success is synthesized.

## Accessibility

The operator indicator reads org.a11y.Status.IsEnabled at /org/a11y/bus on the
operator session bus, with activation disabled and bounded reads. It uses the
configured authority owner or an unambiguous active local logind session for
the exact configured X display. This covers explicit /dev/null + runtime_sudo
installations without querying the service account's unrelated bus.

Read-only validation returned enabled=true on the affected session. No setting
was toggled. Enabled does not certify editable application nodes.

An additional deployment blocker was found: python3-gi exists in the system
interpreter but not the application venv. Desktop accessibility workers can now
load GI from the fixed root-owned distro package directory without globally
enabling system site-packages or processing .pth files. The branch venv loaded
AT-SPI and connected to the existing accessibility bus successfully; no node
enumeration or input was performed for that check.

## Pixel replacement and targeting

Attached X11 adds explicit replace_field_pixels(region,text). It preflights the
whole key plan, grounds the field rectangle, clicks it, selects all and types,
checking exact native window/focus/pointer/geometry before subsequent presses.
It accepts only single-line text and visual expectations; empty text clears.
Receipts label the pixel path. Pixels cannot prove toolkit field identity or
exact contents. Inspect the returned view; never infer semantic readback.

The existing replace_field contract stays strictly AT-SPI identity plus same-node
text readback. It never silently turns into Ctrl+A. Region clicks remain the
explicit pixel element-targeting vocabulary. An unavailable semantic node does
not prohibit ordinary pixel interaction.

The explicit compound operation is also implemented in isolated X11 and
Wayland. Isolated X11 preflights native keycodes and owns a potential-down
ledger within its worker teardown boundary. Wayland preflights the complete
keymap plan, then requires a fresh authenticated focus permit before each
click/chord under the same nonrenewable two-second native lease. It requires
the rebuilt guardian's pixel_fields_v1 capability; an old binary cannot claim
support. All paths report pixel targeting and require visual readback.
Long values may exceed native dispatch budgets and refuse before clicking.

## Qualification boundary

UI distribution rebuilt. Python lint, targeted types, tool-reference generation,
and whitespace checks performed. End-phase testing added explicit Num Lock,
preflight handshake, unknown-release and pixel-plan regression coverage; the
focused integrated set passes 94 tests. Broad computer-suite runs were red: original
83eeca99 baseline 164 failed/2444 passed, initial patched run 172 failed/2443
passed. The eight additional failures exposed a missing durable targeting
receipt field and an unnecessarily changed mock call shape; both were corrected.
The baseline failures remain open, not waived or presented as green coverage.
Both broad runs used standalone subreapers and certified no residual processes.
No live input, settings changes, deployment, service restart or quarantine reset.
Live status still shows the previous deployment quarantined with input disabled.
The next deployed live test must prove first-chord dispatch, clean detach,
native editable handles where exported, and explicit pixel replacement.
