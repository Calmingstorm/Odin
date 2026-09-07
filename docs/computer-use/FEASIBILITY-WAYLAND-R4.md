# Wayland R4: genuine sender EOF, release failure preserved

2026-09-07 01:44-01:48 UTC. **BLOCKED. Two graphical experiments out of the
authorized maximum two; one post-experiment corrective batch; stopped.** Both
complete experiment commands and container applications exited **1**, not success.
EOF now reaches actual held-input delivery. Shift release is measured, but button1
remains held in the receiver ledger and GDK cached seat mask after sender EOF,
including after genuine portal Close in experiment2. Same applications survive
and accept fresh simulated-human text in experiment2. Survival does not erase the
failed owned-input release gate. No production backend or eligibility is claimed.

## Authority, ownership and finite changes

Read R4 DECISIONS, the complete FEASIBILITY-WAYLAND-R2.md including its corrected
run, and all eleven existing wayland-* files before changes. Existing checkout
`/home/odin/odin-dev`, branch `feat/isolated-computer-use`. Own changes only:

- `scripts/computer-feasibility/wayland-portal.py`
- `scripts/computer-feasibility/wayland-lifecycle.py`
- `scripts/computer-feasibility/wayland-telemetry-test.py`
- this new report.

No commits, push, master, CI, deployment, restart, live-install edits/tests, host
desktop/session/bus/device access, :0, Podman, broad kill or prune. Other agents'
checkout changes are not part of this evidence. Scope is a diagnostic fixture,
not a production release supervisor.

### Preflight fixture correction

1. The old `Gio.UnixFDList.get()` returned a duplicated FD while its list retained
   the original socket. Closing only the returned parent FD was insufficient to
   establish the sender as the last EIS-FD owner. Use checked-index `steal_fds()`,
   close any unselected descriptors, transfer only the selected FD to the child,
   then close the parent's copy. Both live runs logged `fd_list_remaining=0` and
   `parent_returned_fd_closed=true`. No explicit release is sent in the EOF C path:
   after the driver's verified-held gate it logs immediately before `_exit(0)`.
2. Alt+Tab had left simulator-owned Alt_L in the focused-entry event ledger, even
   though the GDK seat mask was0. Do not clear that ledger, infer a release from
   focus, or weaken the clean gate. Only when fresh active/toplevel/entry focus,
   exactly Alt_L alone, empty buttons and mask0 agree, the private simulated
   operator sends a new Alt_L press/release. Require its actual fresh KEY_RELEASE
   event, then the original all-empty clean gate. This is safe only because this
   fixture owns the entire simulator; not a recipe for releasing an operator's
   real Alt key. Regression tests reject extra keys, held modifiers/buttons and
   missing focus and assert the input sample is not mutated.

The receiver implementation and C sender were unchanged. The ledger is still an
event ledger, not a physical or authoritative compositor key-state query.

### One corrective batch after experiment1

The unchanged strict1.3-second release check failed with button1 still held.
Experiment1 immediately terminated its portal parent, preventing same-app EOF
postconditions and genuine Close acknowledgement. The single corrective batch
made that failure a recorded, **terminal failure result**, but allowed bounded
diagnostic observation through the portal's existing two-second post-sender wait
and genuine Close. It then types into the existing receiver and gedit without
another pointer click/release. No synthetic button cleanup, mask relaxation or
replacement app. `lifecycle-failures.json`, `owned_release_pass=false`, and a final
raised exception ensure survival cannot convert the failed release into success.
No additional runtime corrections or experiments followed experiment2.

## Isolation and dependencies

Existing Docker `--init` fixture only: unique exact container names/ownership
labels, foreground attach waited by shell, private PID/IPC/cgroup namespaces,
UID/GID1003, network none, cap-drop ALL, no-new-privileges, read-only root,
1GiB memory/swap cap, one CPU,128 PID cap, private512MiB /tmp. Exactly two binds:
read-only harness and fresh owned evidence directory. Inspect records show no
forwarded devices. Private Xvfb :77 simulates the operator; GNOME runs nested
Wayland `--no-x11` with private buses. Consent uses genuine portal UI controls;
XTEST/AT-SPI are only simulated human tools, not product fallback input.

No host or contained packages installed, no build or image/tag modification.
Retained operator image unchanged:
`sha256:d3ff82442f0abf8d4dc78ddf430ba6988b4e01ab0c52cadda04a73f5ae96fb8e`.
No dependency/image reversal needed. Reversing this source increment means
reverting only these three harness-file changes and this report, not unrelated
working-tree changes. Evidence intentionally retained.

Versions from both actual session logs: GNOME Shell46.0, Mutter46.2,
portal1.18.4/GNOME backend46.2, libei/libeis1.2.1, PipeWire1.0.5,
WirePlumber0.4.17, GTK3.24.41. Exact Ubuntu revisions are recorded in session.log.

## Every graphical attempt

Commands, from the development checkout:

```text
bash scripts/computer-feasibility/wayland-lab.sh experiment-lifecycle --parent-authorized-after-contract-correction /home/odin/tmp/wayland-r4-eof-1-20260907
bash scripts/computer-feasibility/wayland-lab.sh experiment-lifecycle --parent-authorized-after-contract-correction /home/odin/tmp/wayland-r4-eof-2-20260907
```

Outer stdout/stderr retained as `/home/odin/tmp/wayland-r4-eof-{1,2}-driver.log`.
Both outer processes exited1; both cleanup logs say
`original_exit=1 cleanup_failure=0`. OOMKilled=false in both inspect records.

| Attempt | Actual container interval UTC | Exact name | Container ID |
| --- | --- | --- | --- |
| 1 | 01:44:53.056-01:45:16.515 | odin-wayland-r2-20260907T014452-3433224 | ec6a8904eaa8771dd9b927b82fd9f38dd5f3eb1d5bf8356dba0fb64928e547e6 |
| 2 | 01:47:27.979-01:47:56.899 | odin-wayland-r2-20260907T014727-3434674 | 9300b12f36912518fef066a30476474f2e2a6d6736e48bfb46b154be92cf5325 |

Each experiment reached orderly and EOF, with actual human Control_R delivered
before the owned Shift_L/button1. The simulator additionally delivered Control_L;
this is not a pristine single-physical-key human stream. Both Ctrl ledger values
remained until deliberate simulated-human keyup. Held sample mask261 means
SHIFT1 + CONTROL4 + BUTTON1(256). Same-widget focus overlap is accepted and
observed, never claimed independent.

Denominators: four genuine consent/Start grants, four frames, four negotiated
senders, four delivered-owned-held samples, two orderly release passes, **zero of
two EOF full owned-release passes**. Same-app post-orderly markers2/2;
post-EOF marker verification attempted1/2 and passed1/1 in that attempted subset.
Do not report post-EOF survival2/2 or complete lifecycle success.

## Receiver measurements versus sender/context timing

Times below are measured application callback/sample delays from the sender's
pre-action monotonic log, not guaranteed release bounds or kernel EOF timestamps.

| Attempt/mode | Sender pre-action monotonic seconds | Shift release callback | Button1 release callback | First clear-owned sample with Ctrl retained |
| --- | ---: | ---: | ---: | ---: |
| 1 orderly | 3898188.667524 | 0.684ms | 0.813ms | 97.092ms |
| 1 EOF | 3898197.481726 | 1.005ms | absent | absent |
| 2 orderly | 3898343.469490 | 0.607ms | 0.738ms | 52.951ms |
| 2 EOF | 3898352.374561 | 0.699ms | absent | absent |

EOF parent-observed child exit was3898197.482070191 and3898352.374831786,
respectively. These are later parent `communicate()` observations, not delivery.
Attempt1 last focused pre-human-keyup sample still had mask260, keys both Ctrl,
buttons[1] at **1317.242ms** after sender pre-EOF. The EOF portal parent was then
terminated by failure handling; no `owned_session_closed` acknowledgement.

Attempt2 genuine Session.Close acknowledged3898354.376849763, **2002.289ms**
after sender pre-EOF. Focused sample at3898354.666132421 still had mask260 and
button1, **2291.571ms** after pre-EOF and **289.283ms after Close acknowledgement**.
After deliberate human Ctrl release, state256/button1 persisted while fresh text
`aftercloseeof` arrived at3898355.369135193, **2994.574ms** after pre-EOF. No later
button-release callback occurred anywhere in this receiver log. Later focus-loss
samples cannot prove the physical/compositor state is unchanged; retain that limit.

Attempt2 receiver PID142 contained `aftercloseorderlyaftercloseeof` after Close.
The same pre-attach gedit PID150 contained
`beforeattachmarkerafterorderlymarkeraftereofmarker`, and then accepted
`realapplicationhumanmarker`. No replacement editor was launched. Attempt1 had
receiver143 and gedit151; only orderly postconditions completed. Attempt2 AT-SPI
logged hash-table warnings during traversal but returned actual focused editor
frame/document evidence and markers. Warnings remain in evidence, not hidden.

### Source, clock, capture and attribution limits

Receiver typed GDK event callbacks report local Python `time.monotonic()` receive
time. C `ei_now()` logs microseconds on the same Linux monotonic clock domain;
container has no separate time namespace. There is no measured compositor/kernel
EOF timestamp, transport timestamp calibration, or scheduling-latency bound.
`event.state` is pre-transition metadata. Key/button sets are an event ledger.
The recurring mask source is
`Gdk.Window.get_device_position(default_seat.pointer)` and may be cached
compositor-delivered state. No independent compositor seat query, physical device
attribution or global noninterference guarantee. Device names `Core Keyboard` and
`Core Pointer` do not identify a physical human device. Release failures therefore
mean the tested application did not observe required release, not a universal
claim about every compositor version or every application's state.

Attempt1:167 samples/73 events/zero telemetry errors, maximum observed interval
160.065ms. Attempt2:223 samples/104 events/zero errors, max110.491ms. Nominal sample
period100ms. Callback timing is separate from polling time. The driver reports
gate-to-observed delay separately; it must not be substituted for sender-to-event.

RemoteDesktop v2 device mask3 and ScreenCast v5 granted source800x600 origin0,0.
Each sender negotiated a matching absolute region mapping ID, scale1. Four real
GStreamer RGB800x600 samples,1,440,000 bytes each, were acquired. Recorded PTS values
have not been related to capture/source clock or frame age. Frame pixels were not
saved/visually inspected. No multimonitor, scaling, rotation or atomic
capture-to-input correspondence demonstrated; focus is independently observed
by GTK/AT-SPI before actions, not inferred from a frame.

## Tests, validation, cleanup and retained evidence

Before experiment1:8 pure telemetry/ownership regressions and10 inherited
Docker-stub/process-ledger tests passed. Before experiment2, same8+10 passed again.
**Four suite commands,36 test executions,18 distinct tests.** Logs:
`/home/odin/tmp/wayland-r4-{telemetry-tests,lab-tests}.log` and
`wayland-r4-corrected-{telemetry-tests,lab-tests}.log`. Python imports exercised by
pure tests, shell syntax check and owned scoped diff whitespace passed. No full
repository test suite, CI, product-backend, compositor implementation or exhaustive
lifecycle-matrix test was run. The failed experiment2 command directly verifies
the diagnostic branch did not turn failure into success.

Runtime validate_action bundles attempt1 and attempt2 each passed1/1 for exact
running/init/UID/network/read-only/memory/PIDs. Cleanup bundles were deliberately
**DEGRADED3/4** and **DEGRADED4/5**, only historical-zombie warning checks failed.
Both exact containers absent. Recorded host PID+start identities11 and22 absent;
complete scans with zero errors, no new helpers. Host-global zombies118 before
and118 after each experiment. Historical live-Odin-parented zombies left untouched;
no host-wide zombie-free claim. Supervisors/foreground starts3433223/3433224 and
3434673/3434674 absent at validation. Docker PID1 `--init` reaped private workloads.

Attempt1 additional mid-run `docker top` failed because the exact container had
already exited/been removed; its11 identities come from startup, not exhaustive
lifetime coverage. Attempt2 captured startup plus mid-run22 identities. Both final
top calls were unavailable after container exit. Empty container inventory alone
is not the cleanup proof, and snapshots are not process-lifetime event tracing.
No signalled unrelated processes, broad cleanup, desktop cleanup or image removal.

Each evidence directory retains raw portal/receiver/session/component/consent
logs, inspect records, process inventories, cleanup logs, `r4-analysis.json` with
calculated measurements, and `artifact-inventory.json` containing SHA256/byte
inventory excluding itself. Attempt2 also retains driver/failure JSON. These
artifacts and previous failed R2/R3 evidence remain intentionally available.

## Remaining blocker and stop decision

The Alt key-state fixture defect and parent-held EIS-FD defect are corrected and
tested. Genuine EOF is now measured rather than inferred. It exposed a repeatable
**application-observed held-button release failure2/2**, even after portal Close
in the one extended diagnostic. Application survival1/1 is useful but insufficient.
No further graphical run or correction is authorized in this finite increment.
Next separately authorized investigation would need trustworthy compositor-side
button-state/owned-device lifecycle evidence or an independently supervised,
bounded owned-button release mechanism without touching human holds. This is
not trivial production-backend work and was not attempted.
