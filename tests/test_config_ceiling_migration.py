"""Legacy soft-compaction-ceiling migration (campaign phase 1, review round 2).

Pins the R2 primary-branch contract: a genuine ONE-TIME ``750000 → null``
file rewrite through the surgical persistence writer, completion-marker
gated, with the three review-round-1 reproductions closed: a fresh-null
install's later hand-written 750000 is honored (vacuous completion), a
``${VAR}`` placeholder resolving to 750000 is deliberate configuration and
never migrated, and no save of an unrelated compression field can resurrect
the legacy value (nothing ambiguous remains on disk to resurrect).
"""

from __future__ import annotations

import json
import logging
import os

import yaml

from src.config.migrations import (
    apply_legacy_ceiling_migration,
    ceiling_marker_path,
)
from src.config.persistence import patch_config_paths
from src.config.schema import LEGACY_MAX_CONTEXT_CHARS, load_config

_LEGACY_YAML = (
    "discord:\n"
    '  token: "t"\n'
    "openai_codex:\n"
    "  # operator comment that must survive the rewrite\n"
    "  model: gpt-5.6-sol\n"
    "  context_compression:\n"
    "    enabled: true\n"
    f"    max_context_chars: {LEGACY_MAX_CONTEXT_CHARS}\n"
    "    keep_recent_iterations: 30\n"
)


def _migrate(config_path, caplog_level=logging.INFO, caplog=None):
    original = config_path.read_text()
    data = yaml.safe_load(original)
    apply_legacy_ceiling_migration(data, config_path, original)
    return data


class TestOneTimeRewrite:
    def test_literal_legacy_rewritten_once_with_one_warning(self, tmp_path, caplog):
        config_path = tmp_path / "config.yml"
        config_path.write_text(_LEGACY_YAML)
        with caplog.at_level(logging.INFO, logger="odin.config"):
            data = _migrate(config_path)
        # In-memory value is auto for this boot.
        assert data["openai_codex"]["context_compression"]["max_context_chars"] is None
        # THE FILE ITSELF now records null — nothing ambiguous remains.
        on_disk = yaml.safe_load(config_path.read_text())
        assert on_disk["openai_codex"]["context_compression"]["max_context_chars"] is None
        # Surgical write: comments and unrelated keys survive.
        assert "operator comment that must survive" in config_path.read_text()
        assert on_disk["openai_codex"]["model"] == "gpt-5.6-sol"
        marker = ceiling_marker_path(config_path)
        assert json.loads(marker.read_text())["reason"] == "migrated"
        assert len([r for r in caplog.records if r.levelno == logging.WARNING]) == 1

        # One-time: a second pass is gated by the marker and changes nothing.
        caplog.clear()
        with caplog.at_level(logging.INFO, logger="odin.config"):
            _migrate(config_path)
        assert not caplog.records

    def test_marker_gates_even_a_literal_750k(self, tmp_path):
        """Post-migration, a deliberately written 750000 is honored verbatim."""
        config_path = tmp_path / "config.yml"
        config_path.write_text(_LEGACY_YAML)
        marker = ceiling_marker_path(config_path)
        marker.parent.mkdir(parents=True)
        marker.write_text("{}")
        data = _migrate(config_path)
        assert (
            data["openai_codex"]["context_compression"]["max_context_chars"]
            == LEGACY_MAX_CONTEXT_CHARS
        )
        # File untouched.
        assert f"max_context_chars: {LEGACY_MAX_CONTEXT_CHARS}" in config_path.read_text()


class TestVacuousCompletion:
    def test_fresh_null_then_hand_written_750k_is_honored(self, tmp_path):
        """Review-round-1 reproduction #1: the fresh-install hole."""
        config_path = tmp_path / "config.yml"
        config_path.write_text(
            "discord:\n  token: \"t\"\n"
            "openai_codex:\n  context_compression:\n    max_context_chars: null\n"
        )
        data = _migrate(config_path)
        assert data["openai_codex"]["context_compression"]["max_context_chars"] is None
        marker = ceiling_marker_path(config_path)
        assert json.loads(marker.read_text())["reason"] == "not_applicable"

        # An operator later hand-writes the literal legacy number: past the
        # gate, it is an intentional value and loads verbatim.
        config_path.write_text(_LEGACY_YAML)
        data2 = _migrate(config_path)
        assert (
            data2["openai_codex"]["context_compression"]["max_context_chars"]
            == LEGACY_MAX_CONTEXT_CHARS
        )

    def test_non_legacy_values_marked_and_untouched(self, tmp_path):
        for value in ("750001", "1", "null"):
            config_path = tmp_path / f"config-{value}.yml"
            config_path.write_text(
                "openai_codex:\n  context_compression:\n"
                f"    max_context_chars: {value}\n"
            )
            before = config_path.read_text()
            _migrate(config_path)
            assert config_path.read_text() == before
            assert ceiling_marker_path(config_path).exists()

    def test_absent_sections_complete_vacuously(self, tmp_path):
        config_path = tmp_path / "config.yml"
        config_path.write_text("discord:\n  token: \"t\"\n")
        _migrate(config_path)  # must not raise
        assert ceiling_marker_path(config_path).exists()


class TestPlaceholderIsDeliberate:
    def test_env_placeholder_resolving_to_750k_never_migrated(
        self, tmp_path, monkeypatch
    ):
        """Review-round-1 reproduction #2: substitution happens before the
        migration, but the UNSUBSTITUTED text is the authority — a ${VAR}
        is operator configuration, not the legacy shipped default."""
        monkeypatch.setenv("MAX_CTX_TEST", str(LEGACY_MAX_CONTEXT_CHARS))
        config_path = tmp_path / "config.yml"
        config_path.write_text(
            "discord:\n  token: \"t\"\n"
            "openai_codex:\n  context_compression:\n"
            "    max_context_chars: ${MAX_CTX_TEST}\n"
        )
        cfg = load_config(config_path)
        assert (
            cfg.openai_codex.context_compression.max_context_chars
            == LEGACY_MAX_CONTEXT_CHARS
        )
        # File untouched — the placeholder survives.
        assert "${MAX_CTX_TEST}" in config_path.read_text()
        assert json.loads(ceiling_marker_path(config_path).read_text())[
            "reason"
        ] == "not_applicable"


class TestNoResurrection:
    def test_unrelated_compression_save_cannot_resurrect_750k(self, tmp_path):
        """Review-round-1 reproduction #3: after the rewrite nothing ambiguous
        remains on disk, so saving a sibling leaf changes nothing about the
        ceiling."""
        config_path = tmp_path / "config.yml"
        config_path.write_text(_LEGACY_YAML)
        _migrate(config_path)
        patch_config_paths(
            [(("openai_codex", "context_compression", "enabled"), False)],
            path=config_path,
        )
        on_disk = yaml.safe_load(config_path.read_text())
        assert on_disk["openai_codex"]["context_compression"]["enabled"] is False
        assert on_disk["openai_codex"]["context_compression"]["max_context_chars"] is None
        data = _migrate(config_path)
        assert data["openai_codex"]["context_compression"]["max_context_chars"] is None


class TestFailureHonesty:
    def test_rewrite_failure_is_this_boot_only_and_retries(self, tmp_path, caplog):
        config_path = tmp_path / "config.yml"
        config_path.write_text(_LEGACY_YAML)
        os.chmod(tmp_path, 0o555)  # atomic writer cannot create its tempfile
        try:
            with caplog.at_level(logging.WARNING, logger="odin.config"):
                data = _migrate(config_path)
        finally:
            os.chmod(tmp_path, 0o755)
        # In-memory auto so behavior is consistent this boot…
        assert data["openai_codex"]["context_compression"]["max_context_chars"] is None
        assert any("retries next boot" in r.getMessage() for r in caplog.records)
        # …but NO completion recorded and the file untouched: the gate refires.
        assert not ceiling_marker_path(config_path).exists()
        assert f"max_context_chars: {LEGACY_MAX_CONTEXT_CHARS}" in config_path.read_text()

        data2 = _migrate(config_path)
        assert data2["openai_codex"]["context_compression"]["max_context_chars"] is None
        assert yaml.safe_load(config_path.read_text())["openai_codex"][
            "context_compression"
        ]["max_context_chars"] is None
        assert ceiling_marker_path(config_path).exists()


class TestDegenerateInputs:
    def test_unparseable_original_text_completes_vacuously(self, tmp_path):
        """If the pre-substitution text cannot be parsed, literality cannot be
        proven — the safe direction is no mutation, gate closed."""
        config_path = tmp_path / "config.yml"
        config_path.write_text(_LEGACY_YAML)
        data = yaml.safe_load(config_path.read_text())
        apply_legacy_ceiling_migration(data, config_path, ":: ]]] not yaml [[[")
        assert (
            data["openai_codex"]["context_compression"]["max_context_chars"]
            == LEGACY_MAX_CONTEXT_CHARS
        )
        assert f"max_context_chars: {LEGACY_MAX_CONTEXT_CHARS}" in config_path.read_text()
        assert json.loads(ceiling_marker_path(config_path).read_text())[
            "reason"
        ] == "not_applicable"

    def test_marker_write_failure_after_rewrite_self_heals(self, tmp_path, caplog):
        """Rewrite lands but the completion record cannot be written: the next
        boot takes the vacuous branch (the file no longer says 750000) and
        heals the marker."""
        config_path = tmp_path / "config.yml"
        config_path.write_text(_LEGACY_YAML)
        (tmp_path / "data").write_text("not a directory")  # blocks mkdir
        with caplog.at_level(logging.WARNING, logger="odin.config"):
            data = _migrate(config_path)
        assert data["openai_codex"]["context_compression"]["max_context_chars"] is None
        assert yaml.safe_load(config_path.read_text())["openai_codex"][
            "context_compression"
        ]["max_context_chars"] is None
        assert any(
            "Could not record ceiling-migration completion" in r.getMessage()
            for r in caplog.records
        )
        (tmp_path / "data").unlink()
        _migrate(config_path)
        assert json.loads(ceiling_marker_path(config_path).read_text())[
            "reason"
        ] == "not_applicable"


class TestPackagedSymlink:
    def test_rewrite_lands_on_target_marker_beside_link(self, tmp_path):
        """Review blocker #4: the packaged /opt→/etc config symlink. The
        rewrite must write THROUGH the link (never sever it); the marker
        anchors beside the link, where the durable data dir lives."""
        etc = tmp_path / "etc"
        opt = tmp_path / "opt"
        etc.mkdir()
        opt.mkdir()
        real = etc / "config.yml"
        real.write_text(_LEGACY_YAML)
        link = opt / "config.yml"
        link.symlink_to(real)

        original = link.read_text()
        data = yaml.safe_load(original)
        apply_legacy_ceiling_migration(data, link, original)

        assert link.is_symlink()  # the link survives
        assert yaml.safe_load(real.read_text())["openai_codex"][
            "context_compression"
        ]["max_context_chars"] is None
        assert ceiling_marker_path(link) == opt / "data" / "context_ceiling_migration.json"
        assert (opt / "data" / "context_ceiling_migration.json").is_file()
        assert not (etc / "data").exists()


class TestLoadConfigIntegration:
    def test_load_migrates_then_honors_explicit_750k(self, tmp_path, caplog):
        config_path = tmp_path / "config.yml"
        config_path.write_text(_LEGACY_YAML)
        with caplog.at_level(logging.INFO, logger="odin.config"):
            cfg = load_config(config_path)
        cc = cfg.openai_codex.context_compression
        assert cc.max_context_chars is None
        assert cc.resolved_max_context_chars == LEGACY_MAX_CONTEXT_CHARS
        assert yaml.safe_load(config_path.read_text())["openai_codex"][
            "context_compression"
        ]["max_context_chars"] is None

        # A deliberate explicit set of the SAME literal value now persists:
        # the one-time gate, not eternal coercion.
        patch_config_paths(
            [
                (
                    ("openai_codex", "context_compression", "max_context_chars"),
                    LEGACY_MAX_CONTEXT_CHARS,
                )
            ],
            path=config_path,
        )
        cfg2 = load_config(config_path)
        assert (
            cfg2.openai_codex.context_compression.max_context_chars
            == LEGACY_MAX_CONTEXT_CHARS
        )
