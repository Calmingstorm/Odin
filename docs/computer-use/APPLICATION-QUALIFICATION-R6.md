# R6 private native application qualification

**Partial: real GUI-created and saved Writer ODT and Inkscape SVG. Actual disk
close/reopen acceptance remains incomplete.** No main-session or ordinary-profile
readiness is claimed.

New helper: `scripts/computer-feasibility/attached-apps-r6.py`. Invoke with
`--execute-isolated --task writer` or `inkscape`. Reviewed R5 cross-UID launcher
provides a disposable transient cgroup, private PID/mount/network namespaces,
Xvfb :177, uid65534 app HOME and private bus. Inner and outer local subreapers
use owned-child ancestry, exact pidfds and explicit waits. No :0, live config,
credentials, deploy, branch, commit or restart was used.

Task input uses actual production controller observe, native image validation,
delivery validation and one-use act. No shell or app API generates documents.
Unknown outcomes abort without replay. Fresh disposable profiles disable startup
tips/welcome and GTK cursor blinking. This limits the qualification scope.

## Positive evidence

- `/tmp/attached-apps-r6-lzqi9grq`: Writer saved ODT,9386bytes, ZIP integrity and
  expected `R6 private note.` content verified; SHA256
  `7a6c83f31995fd032924ceadc2ff343a30fa38b643729c4727b6dcdd8c26b867`.
- `/tmp/attached-apps-r6-d80y9v0m`: Writer two-paragraph note, bold second paragraph
  GUI actions; saved ODT and first paragraph verified. Formatting needs additional
  XML verification before claiming semantic formatting success.
- `/tmp/attached-apps-r6-0opl_g50`: Inkscape rectangle and ellipse made by real r/e
  shortcuts and bounded drags; SVG GUI-saved with both shapes read back.
- Repeated successful SVG saves: `/tmp/attached-apps-r6-5iqullt9` and
  `/tmp/attached-apps-r6-xjzhhi78`. Last opens File menu, whose OCR places Close at
  x32,y465. Close was NOT invoked; saved files were NOT reopened.

All above exited0. Files are `workspace/home/result.odt` or `result.svg` beneath
the evidence roots. `runner.log` contains native receipts, window census and R5
host process ledger. `outer.json` and `workspace/inner.json` contain local cleanup.
Inspected completed ledgers report zero surviving sampled identities including
zombies, no cgroup, no census errors, and local remaining children0.

## Preserved failures and limits

- `5706f_ov`: bind root chmod permission; fixed root-owned disposable workspace.
- `fqov0741`: storage_not_private; fixed private store parent, not store policy.
- `agyuml4u`: LO startup Tip of the Day denied; only new profile disables it.
- `6eilbx8h`: long multiline typing unknown, no replay; subsequent ASCII text and
  separate Return operations used.
- `cj_2krkm`, `hkwrkyv3`: generic LO backend predispatch visual_target_changed.
  Consecutive saved observations in hkwrkyv3 were identical, so they do not prove
  caret-only changes in intervening verification. Installed GTK3 plus private
  cursor-blink=false correlated with stable success; no production guard bypass.
- `5uc2yx72`: installed Inkscape1.2.2 rejects --new-instance; plain isolated launch.
- `9wdwas_u`: welcome modal denied; new private preferences disable boot welcome.
- `brknoo6k`, `7lpyw_61`: shapes passed but Save unknown due exact dialog title
  `Select file to save to`. Profile agent added Inkscape-only title; fresh passes
  followed. Class org.inkscape.Inkscape/Inkscape, dialog type, main transient.
- Writer GTK Save actual title `Save`, class soffice/Soffice, dialog main transient.

Calc/Draw remain unqualified. Calc draft now uses separate Tab/Return, not embedded
control characters, but was not executed. Native-model and main-session work are
separate evidence owned by other agents. New static harness tests are in
`tests/test_attached_apps_r6_harness.py`; results must be recorded separately.

## Independent follow-up verification

Recorded static harness run: **4 tests passed**, launched under standalone owned
supervisor; `/tmp/r6-qual-tests-owned.json` reports cleanup_ok=true and exit0.
Shared-tree `git diff --check` passed; validate_action confirmed no :177 Xvfb
process and checked the named completed fixture cgroup absent.

Independent ODF ZIP/XML parsing of d80y9v0m confirmed exactly two paragraphs:
`R6 private note.` and `Save verified.`, and a bold text style in content.xml.
ODT9735bytes, SHA256
`039b5c27910d40b227cac85c27a13026bb24ded0c2fa4ca3ae6effeff2c22097`.

Independent SVG XML parsing of 0opl_g50 found exactly a rectangle and ellipse,
with nonzero dimensions; SVG1583bytes, SHA256
`149ccdd3b10c29b4e1a9262dbe9cc5be0d30d3bdf30e57d5259cf9a2c9546020`.
Independent rsvg-convert rendering succeeded to `/tmp/r6-shapes-independent.png`.
The rectangle extends partly outside the SVG page (negative x/y); this is not a
polished drawing or correct-layout claim. Raster coverage measurement remains
separate from successful renderer exit. Disk reopen remains unverified.

## Frozen-runtime Writer follow-up (0ec10ff, 2026-09-07)

**BLOCKED, not end-to-end qualified.** Runtime source was not edited. Writer now
uses GTK3 normal blinking caret (`gtk-cursor-blink=true`, 1200ms), while other
tasks retain the historical nonblinking fixture setting. Existing four static
tests were not edited while the parent full suite was running.

Two finite root-owned supervisor runs each successfully typed and GUI-saved the
exact two-paragraph ODT with second paragraph bold under the normal caret:

- `/tmp/attached-apps-r6-r8pia_uj`, ODT9734bytes, SHA256
  `d52480c3eea85adff74e48543facd11d7828f22135477e50f74f6fb7d9dea44a`.
  First close-menu attempt was a harness error: Left switched the already-open
  File menu to Help. No Close action was attempted. That unnecessary key was
  removed, preserving the failed evidence.
- `/tmp/attached-apps-r6-6d2xxu0o`, ODT9734bytes, SHA256
  `af34f95c506f1d917c95ddc8d0661911a44a5c34bfdc6afc442d9d52f81355b1`.
  Cropped screenshot OCR found exactly one visible File > Close at (45,167).
  Its production click receipt was **unknown**, `injected=true`, `released=true`,
  reason `input_scope_or_native_failed`, release30.005ms. Controller action was
  unknown and the harness immediately aborted without replay. The immediate
  census still showed the original result.odt window. No close/reopen claim.
  This native runtime boundary needs parent investigation; no guard was bypassed.

Independent ZIP/XML verification succeeded for both artifacts: exactly
`R6 private note.` and `Save verified.` paragraphs, with the latter text inheriting
bold from paragraph style P2. The first verifier incorrectly expected a bold text
span and failed; the corrected verifier inspected actual paragraph-style
inheritance and passed. Its empty trailing normal-style span contains no text.
No reopened-frame pixel verification is possible because reopen was not reached.

Cleanup was independently checked after both failures: supervisor reports
`/tmp/writer-reopen-r6-owned-{1,2}.json` each show primary exit1, cleanup_ok=true;
inner and outer remaining children0. Exact unit/cgroups
`odin-xi2-feasibility-aca5a1fab90d45f4bdbefffe74fdcb37.service` (152 sampled
identities) and `odin-xi2-feasibility-1d42e614478041a7b5806f86173ea29d.service`
(142 sampled identities) are gone, every sampled original PID/start identity is
absent, no surviving zombies or census errors. No desktop or live service touched.

The harness contains an as-yet unexecuted post-Close path: asserts old window
disappeared, opens through GUI ctrl+o/chooser, asserts a different document XID,
performs harmless ctrl+Home/ctrl+End, and verifies ZIP/text/style plus retained
pixels. This path is **not evidence of success** until the native blocker is fixed
and a complete fresh run passes. Work stopped at the requested runtime boundary.
