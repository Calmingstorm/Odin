# Image-default installation verification, 2026-09-09

Scope: template, setup wizard absence and Debian config delivery/preservation.
Run from the isolated `work/image-default-install` worktree based on
`997dc1c976117a8c01322d46b4f3edbc694d4cfe`, not from the live install.

Commands used (artifact directory is outside the worktree):

```sh
docker run --rm --network none -v "$PWD:/source" odin-computer-package-builder:r21
mkdir -p /home/odin/reviews/image-default-install-artifacts
VERSION=3.97.0 /home/odin/reviews/r21-packaging/tools/nfpm package \
  --config packaging/nfpm.yml --packager deb \
  --target /home/odin/reviews/image-default-install-artifacts/odin-image-defaults.deb
ODIN_IMAGE_DEFAULT_DEB=/home/odin/reviews/image-default-install-artifacts/odin-image-defaults.deb \
  /home/odin/odin-dev/.venv/bin/python -m pytest -q \
  tests/test_image_default_installation.py tests/test_setup_helpers.py
/home/odin/odin-dev/.venv/bin/ruff check tests/test_image_default_installation.py
dpkg-deb --field /home/odin/reviews/image-default-install-artifacts/odin-image-defaults.deb \
  Package Version Architecture
sha256sum /home/odin/reviews/image-default-install-artifacts/odin-image-defaults.deb
git diff --exit-code 997dc1c976117a8c01322d46b4f3edbc694d4cfe -- \
  src/setup_wizard.py src/web/api/self_update.py src/tools/image/openai_backend.py
```

Observed results:

* Native helper compiled inside the existing Debian builder, without network or
  desktop access; its no-FD invocation returned the required usage exit 64.
* nFPM produced a real `odin`, version `3.97.0`, `amd64` Debian archive.
* SHA-256: `b7ebb262227c9d671395f1b6dd1410f13bb745dbd0075eab4281b7799cd54c66`.
* Tests: **14 passed**, including the actual artifact test (not skipped).
* Ruff: all checks passed for the new test module.
* The three no-op source files have no diff against the base commit.

The artifact test uses `dpkg-deb --extract` and `--control`, verifies packaged
template bytes equal source bytes, verifies no operator config is shipped, and
executes the actual config-install block from the archive's `postinst` with
temporary APP_DIR/CONFIG_DIR variables. It exercises fresh install, an unrelated
custom config, old exact model values, and repeated installs; existing configs
remain byte-identical. The setup helper tests exercise the wizard builder.

This is deliberately **not a full dpkg service/dependency installation**. Account,
pip, SSH and systemd postinstall operations are excluded. No live `/opt/odin`
writes, deployment, service restart, or active desktop effects occurred. This
artifact contains baseline core/API code and is not a releasable integrated
artifact: rebuild after integrating all agents' changes.

Common startup source trace: `src/__main__.py` imports `src.config.load_config`
and calls it on the chosen config path; `src/web/api/config_admin.py` calls the
existing `build_config` for setup. End-to-end common-loader migration/intent tests
belong to the integrated core gate, not this packaging-only result. The live
image generation and actual Discord delivery gate is also still separate.
