# RFC-006: Test-Coverage Campaign (ratchet gate + prioritized waves)

Status: R1 — APPROVED, plan of record (Odin re-review 2026-07-07: final blocker = P2 target mismatch, fixed to openai_codex 61→85; §7 wording modernized to the missed-count model).
Campaign branch: `coverage/rfc006` (created after plan approval).
Predecessors: RFC-005 (type-safety ratchet) is the template — a fail-closed CI ratchet plus incremental waves, security/high-value first. Unlike RFC-005, coverage waves add TESTS, not annotations: they can and will surface real bugs. Bug **fixes** are out-of-band (§5).

## 1. Motivation

Measured 2026-07-06 (master @ `16ec441`): **67% line coverage** — 27,283 statements, 9,057 unexercised. The gaps are not uniform, and their shape is the whole argument:

- **Security code is under-tested**: `permissions/token_manager.py` 23%, `permissions/host_access.py` 39%, `web/api/security.py` 17%. Authorization logic is exactly where an untested branch is most expensive.
- **`web/` handler bodies run only in production**: the route-parity contract pins that 183 endpoints exist in order, but many handler bodies (llm_admin 20%, codex_admin 10%, config_admin 23%, agents_loops 21%, skills_api 21%) have never been driven by a test. The five TS bugs (v3.52.0) all lived in exactly this kind of never-walked path.
- **A few large single-file wins**: `tools/skill_manager.py` 28% (511 missed), `tools/handlers/state.py` 21% (239 missed).
- **Legitimately-hard-to-test surfaces stay low by design**: Discord cogs/views (prefix-command UI), `voice.py` (hardware), `browser.py`/`comfyui.py` (optional-extra external services), `packaging/validate.py` (CI-context). These are explicitly OUT of the target denominator (§3).

The pattern: code that has been through a campaign or soak-fix carries its tests (notifications 96%, config 90%, audit 88%, agents 87%); pre-discipline code does not. This campaign closes that gap where it matters and installs a ratchet so it can never silently reopen.

## 2. Targets (proposed — Odin/Aaron to calibrate)

Coverage % as a single number is a blunt instrument, so targets are stated per-scope:

- **Security modules to ≥90%** (`permissions/*` AND `web/api/security.py` — B2: the crown-jewel bucket is consistent; "if auth code is annoying to test, good, that is the point").
- **LLM credential paths to ≥85%** (`codex_auth.py`, `openai_codex.py`) — security-adjacent and historically dangerous.
- **Core-layer to ≥85%** (everything except the §3 exclusions); new gated files must land ≥85 unless explicitly classified otherwise.
- **Overall repo — REPORT ONLY, never gated**: expected to rise from 67% into the high-70s/low-80s as the waves land; the ratchet, not a magic number, is the durable deliverable. Explicitly NOT 95% globally — "that road ends in tests that assert mocks did what mocks were told to do."

Explicitly NOT chasing 95%: the last 10% is cosmetic-UI and hardware paths whose tests cost more than they protect. "As far as we can" = as far as it stays valuable.

## 3. Coverage denominator (what "core" means)

The ratchet and the core target EXCLUDE these hard-to-unit-test surfaces (measured separately, never gated to zero-drop because their coverage is legitimately low):
`src/discord/cogs/**`, `src/discord/views/**`, `src/discord/voice.py`, `src/tools/browser.py`, `src/tools/comfyui.py`, `src/packaging/validate.py`, `src/discord/helpers/error_handler.py`, `src/web/middleware.py`, `src/**/__main__.py`. Rationale per file recorded in the gate config. Excluding them is honest scoping, not hiding — they're reported, just not gated.

## 4. The ratchet (P0 deliverable)

`scripts/ci/coverage_gate.py`, modeled on `type_gate.py`. **Gate shape per R1 B1 (Odin's amendment — adopted verbatim):**
- **Primary ratchet: per-file MISSED-line-count CEILING** — for every gated file in the committed baseline: `missing <= baseline_missing` (epsilon 0). Punishes adding untested code; does not punish deleting dead uncovered code; can't be masked by newly covered lines elsewhere in the same file.
- **Secondary guard: per-file percent non-regression** — `percent >= baseline_percent - 0.25` (noise epsilon only).
- **New gated files** must meet the configured threshold (≥85 core / ≥90 security bucket) or be explicitly exempted in config with a reason.
- **Deleted/renamed/split files are SURFACED, never silently passed** — the gate lists baseline entries with no matching file and fails until the baseline is deliberately updated.
- **Baseline updates are ceremony**: a distinct `--update-baseline` mode producing a reviewed artifact; the update PR shows a before/after table (improved / unchanged / decreased-with-justification). The baseline never quietly decreases.
- **Total percent: reported, never gated.**
- Baseline record per file: `{path, statements, covered, missing, percent}` in `coverage-baseline.json`.
- New `coverage-no-drop` CI job beside `types-no-new`/`lint-no-new`.
- **P0 includes gate SELF-TESTS (R1 B3)** — the gate must not be the first untested security-critical thing: missing coverage.json fails closed; coverage-run failure fails closed; exclusion patterns match exactly as configured; new gated file below threshold fails; increased missing count fails; unchanged missing count passes regardless of total movement; baseline cannot be updated downward outside the deliberate mode; renamed/deleted files are surfaced.

## 5. Bug protocol (Aaron's gate — same as RFC-005 §5)

Writing tests against never-walked code WILL surface real bugs (this is a feature). Any test that reveals incorrect behavior is NOT quietly worked around: the bug is ledgered (`docs/plans/coverage-findings.md`, stable `COV-NNNN` ids), the test is written to pin the CORRECT behavior and marked `pytest.mark.xfail(strict=True, reason="COV-NNNN ...")` until fixed (STRICT always — "non-strict xfail is where bugs go to retire with benefits"); coverage contributed by xfailed tests is acceptable and ledgered, and the batch goes to Aaron. His verdict fix/defer/won't-fix; approved fixes ride as their own reviewed PRs, never inside a coverage wave. Tests must exercise REAL behavior — never assert trivial truths to pump the number (Aaron's build-loop rule: no asserting file contents/existence; drive actual code paths).

## 6. Phases (each = one PR into the campaign branch, Odin-reviewed, CI-gated)

Resequenced per R1 (LLM credential paths promoted — security-adjacent and historically dangerous; web admin split — "too broad as one PR… before it becomes one giant 'trust me bro' coverage blob"):

- **P0** — `coverage_gate.py` + gate SELF-TESTS + committed baseline + `coverage-no-drop` CI job + findings ledger + this plan.
- **P1 — Security** (`permissions/token_manager.py` 23→90, `host_access.py` 39→90, `manager.py` 81→95, `web/api/security.py` 17→**90**). Fixed as first.
- **P2 — LLM auth/provider credential paths** (`codex_auth.py` 54→85, `openai_codex.py` 61→85 — rotation/failover, mocked transport).
- **P3 — High-value core singles** (`tools/skill_manager.py` 28→75, `tools/handlers/state.py` 21→85).
- **P4a — Web admin API, admin half** (`config_admin`, `llm_admin`, `codex_admin`) — through the aiohttp test client, real route layer, faked boundaries.
- **P4b — Web admin API, rest** (`skills_api`, `knowledge_mem`, `agents_loops`, `observability`, `websocket`, `integrations`).
- **P5 — Discord native tools / task surfaces** (`native_tools/agents_tasks.py`, media.py, knowledge.py, channel_ops.py; `background_task.py`, `scheduled_events.py`, `llm_gateway.py`).
- **R2** — results appended here; final numbers, ledger disposition, whether a stricter target is worth a follow-up.

No wall-clock pressure; the gate protects from P0 on.

## 6a. R1 amendment log (Odin plan review, 2026-07-07)

Required amendments, all adopted: **B1** ratchet redesigned to per-file missed-count ceiling (ε=0) + per-file percent non-regression (ε=0.25) + total report-only; deleted/renamed surfaced; baseline ceremony (§4). **B2** `web/api/security.py` target raised to ≥90, consistently in the crown-jewel bucket (§2/§6). **B3** P0 gate self-tests specified (§4). Advisories adopted: strict xfail w/ COV-id reasons; xfail coverage ledgered; baseline-update before/after table; per-exclusion reasons enforced in config; web handlers driven through the real route layer via aiohttp test client; mock boundaries only, never the unit under test.

## 7. Risks / discipline

- **Coverage theater**: the §5 real-behavior rule + Odin review of every test are the guard. A test that would pass against a `pass` body is rejected.
- **Flaky/slow additions**: the suite is 63s today; new tests must stay fast and deterministic (mock transport/clock, no real sleeps/network). Budget: keep full suite under ~2 min.
- **Mock-drift false confidence**: prefer driving real code with faked *boundaries* (transport, filesystem via tmp_path, discord objects) over mocking the unit under test — the TS week proved fakes shaped like the wrong contract validate bugs.
- **Baseline churn**: missed-count ceilings are ε=0; percent non-regression uses ε=0.25 only for noise. Refactor/rename churn is handled by explicit baseline ceremony, not silent tuning.

## 8. Revert

The gate is one CI job + one script + one baseline file; tests are purely additive. Remove the job and nothing else is affected. No deploy dependency.
