# Packaging campaign results

## Implemented

- **#487** Fixed the malformed template-copy expansion in `scripts/incus-deploy.sh`; added syntax validation coverage.
- **#488** Incus deployment now transfers the UI directory needed by the web server.
- **#489** Declared `src.tools/model_hints_seed.json` as setuptools package data.
- **#490** Kept `odin` bound to the server behavior for compatibility; added `odin-client` and `odin-server` explicit aliases in Python installs and Debian packaging. No automatic rewrite of existing entrypoint semantics.
- **#491** JSON and plain output now both return failure for `is_error` responses.
- **#492** Added the browser extra to Docker, Debian and Incus install dependency sets, and asserted the browser package in Debian's import smoke check.
- **#493** Fresh Debian config defaults to the package's `/opt/odin/.ssh/id_ed25519`; existing operator config is not rewritten. Existing key material remains untouched.
- **#494** Compose now mounts the config directory, rather than a replace-incompatible individual file mount, and starts with that config path when present.
- **#497** No `voice-service` path remains in the current Compose tree; nothing to remove in this checkout.
- **#498** Aggregate WebUI check now invokes setup, computer-browser, and schedule-availability focused checks.
- **#587** Reworked stale-bucket regression to use two trusted synthetic forwarded IPs and assert stale removal versus active retention; corrected active-bucket timing.

Regression coverage: `tests/test_packaging_campaign.py`, `tests/test_rate_limiter.py`, plus existing `tests/test_execute_api.py` coverage.

## Validation

- `bash -n scripts/incus-deploy.sh packaging/postinstall.sh scripts/odin-server`: passed.
- `/home/odin/odin-dev/.venv/bin/python -m pytest tests/test_packaging_campaign.py tests/test_execute_api.py tests/test_rate_limiter.py -q`: **27 passed**, one upstream `audioop` deprecation warning.
- `python -m json.tool package.json`: passed.
- No deployment, install, restart, destructive command, UI build, or full campaign gate was run.

## Question / caveat

- **#494 existing Compose upgrades:** the new directory mount expects operator config at `./config/config.yml`; prior Compose mounts used `./config.yml`. The shipped compose entrypoint has a fallback to the image config, but an existing operator config at the old path will not be selected automatically. Please decide whether to add an explicit documented migration or provide a compatibility-safe mount layout before integrating. No config is overwritten by this change.

## Commit

Pending parent integration; this worktree is not pushed or merged.
