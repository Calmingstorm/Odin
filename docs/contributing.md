# Contributing

Start with the **[canonical contributing guide on GitHub][contributing]**.
It owns the project's principles and basic workflow; this page is a developer-hub
gateway, not a second copy of that policy.

The commands and implementation references below were checked against source
revision [`9411b73ae63ce959295fa9968f63d92c129b8578`][baseline]. For changes after
that revision, consult the current [test workflow][current-tests],
[WebUI workflow][current-ui], and [package scripts][current-package].

## Work in a development checkout

Use an isolated checkout and development environment, **not a running
installation's directory or runtime data**. Tests and helper scripts must not
resolve live configuration, credentials, or persistent state. Do not include
deployment data, private host details, credentials, or operator-installed
extensions in public patches or test output.

CI uses Python **3.12** for the Python jobs and Node.js **22** for the WebUI job.
Run the following from the repository root in your activated development
environment.

## Python suite

```bash
pip install -e ".[dev]"
pytest -q
```

This is the [CI suite invocation][suite]. The canonical guide also documents
`python3 -m pytest -q tests` for an explicit tests-directory run.

### Real-browser checks

The browser CI job installs the browser extra and Chromium, then requires the
network guard and committed turn-state render tests to run rather than silently
skip. On a development machine where Playwright may install its system
dependencies:

```bash
pip install -e ".[dev,browser]"
python -m playwright install --with-deps chromium
ODIN_REQUIRE_BROWSER_TESTS=1 ODIN_REQUIRE_TURN_STATE_RENDER=1 pytest -q \
  tests/test_browser_automation.py::test_real_public_page_loads_to_completion_through_request_guard \
  tests/test_browser_automation.py::test_real_browser_blocks_redirects_and_subresources_to_private_loopback \
  tests/test_webui_turn_state_render.py
```

Where system dependencies are already provisioned, the workflow uses
`python -m playwright install chromium` instead. See the
[browser job][browser-job] for the complete environment contract.

## WebUI checks and committed build

```bash
npm ci
npm run check
git diff --exit-code ui/dist
```

[`npm run check`][package] runs the template, binding, race, lifecycle, and other
WebUI guards **and then builds**. The [WebUI workflow][ui-workflow] checks that
the committed `ui/dist` matches the result. When you intentionally change UI
source, review and commit the resulting distribution files with it; an expected
local dist diff still must be committed before CI can pass.

For focused development, the individual template check and build commands are:

```bash
npm run check:templates
npm run build
```

These are WebUI commands, not commands for building this documentation site.

## Lint, types, coverage, and configuration apply gates

```bash
pip install ruff
python scripts/ci/lint_gate.py
python scripts/ci/type_gate.py
python scripts/ci/coverage_gate.py
python scripts/ci/apply_registry_gate.py
```

These are the [Python workflow's gate commands][gates], not substitutes invented
for this page:

| Gate | What it protects |
| --- | --- |
| [Lint][lint] | No new Ruff findings compared with the merge base; normalized source-line keys avoid treating line movement as new debt. |
| [Types][types] | No new mypy finding multiplicities compared with the merge base, using the same checker and HEAD's type configuration for both trees. |
| [Coverage][coverage] | Per-file missed-line ceilings and percentage non-regression against `coverage-baseline.json`, plus thresholds for new gated files. Total coverage alone is not the gate. This command runs coverage collection unless given an existing report. |
| [Apply registry][apply] | Configuration sections and leaves have valid apply-mode classifications; stale entries and credential declassification are rejected. |

Lint/type comparison requires enough Git history to compute the merge base and
a fetched base ref. Their default is `origin/$GITHUB_BASE_REF` in CI or
`origin/master` otherwise. Both accept `--base-ref` or an explicit `--base` SHA.
Missing tools, shallow history, and malformed reports are setup failures, not
evidence that a gate passed. Baseline changes need deliberate review; do not
regenerate a baseline merely to erase a regression.

## Generated references

The public inventories are generated from the checked-out registry and route
registration code, without loading an installation's configuration or extensions:

```bash
python scripts/docs/generate_tool_reference.py
python scripts/docs/generate_api_reference.py
python scripts/docs/generate_tool_reference.py --check
python scripts/docs/generate_api_reference.py --check
pytest -q tests/test_generated_tool_reference.py tests/test_generated_api_reference.py
```

Commit each generated page with its source change. The byte-for-byte drift tests
are part of the ordinary suite, so stale references fail CI without a separate
workflow. `SOURCE_COMMIT` in `scripts/docs/_reference.py` records the reviewed
source baseline for citations. Advance it when documenting a new source baseline;
do not derive it from each documentation commit's HEAD (that would make output
change on every commit and fail in shallow checkouts). Review the written pages'
source citations when advancing the baseline too.

## Pull-request expectations

Keep the patch focused, describe the behavior changed, and include the commands
actually run with their outcomes. Identify checks not run and environmental
limitations. Route the PR through **Odin review** and resolve findings before
merge; a successful command or a plausible screenshot is not a substitute for
reviewing behavior.

Preserve the characterization contracts unless the behavior change is deliberate:

- [`tests/characterization/test_tool_parity.py`][tool-pins] pins exact tool order,
  schema/description hashes, name-map behavior, and definition-cache behavior.
  Tool order is prompt behavior, not cosmetic sorting.
- [`tests/characterization/test_api_route_parity.py`][api-pins] pins the ordered
  route table and public import/patch seams. Route order matters when paths
  overlap. Check the current expected table, not historical counts in comments.
- The [characterization directory][characterization] also covers composition,
  intake, dispatch, pipeline persistence, and delivery. Update the affected pins
  with an explanation of the intended contract change, not simply to make a
  failing assertion disappear.

Review generated artifacts with their sources: build output, reference pages,
and baseline updates should have an explainable diff. Keep documentation and
configuration examples aligned with the implementation, and report CI status
separately from any authorized runtime validation.

Need the map before choosing a file? Read [Architecture](./architecture.md),
then the [tool](./reference/tools.md) or [API](./reference/api.md) reference.

[contributing]: https://github.com/Calmingstorm/Odin/blob/master/CONTRIBUTING.md
[baseline]: https://github.com/Calmingstorm/Odin/commit/9411b73ae63ce959295fa9968f63d92c129b8578
[current-tests]: https://github.com/Calmingstorm/Odin/blob/master/.github/workflows/test.yml
[current-ui]: https://github.com/Calmingstorm/Odin/blob/master/.github/workflows/ui.yml
[current-package]: https://github.com/Calmingstorm/Odin/blob/master/package.json
[suite]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/.github/workflows/test.yml#L20-L34
[browser-job]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/.github/workflows/test.yml#L36-L66
[package]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/package.json#L7-L34
[ui-workflow]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/.github/workflows/ui.yml#L38-L55
[gates]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/.github/workflows/test.yml#L68-L143
[lint]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/scripts/ci/lint_gate.py#L1-L21
[types]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/scripts/ci/type_gate.py#L1-L31
[coverage]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/scripts/ci/coverage_gate.py#L1-L28
[apply]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/scripts/ci/apply_registry_gate.py#L1-L20
[tool-pins]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/tests/characterization/test_tool_parity.py#L1-L55
[api-pins]: https://github.com/Calmingstorm/Odin/blob/9411b73ae63ce959295fa9968f63d92c129b8578/tests/characterization/test_api_route_parity.py#L1-L19
[characterization]: https://github.com/Calmingstorm/Odin/tree/9411b73ae63ce959295fa9968f63d92c129b8578/tests/characterization
