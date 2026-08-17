"""Legacy soft-compaction-ceiling migration (campaign phase 1).

Pins the provenance-gated contract: only the EXACT legacy default is ever
reinterpreted, one WARNING at migration time, marker-stable INFO thereafter,
deliberate persistence clears provenance, and failures degrade to this-boot
interpretation without crashing the loader.
"""

from __future__ import annotations

import json
import logging

import yaml

from src.config.migrations import (
    apply_legacy_ceiling_migration,
    ceiling_marker_path,
    record_ceiling_operator_provenance,
)
from src.config.persistence import patch_config_paths
from src.config.schema import LEGACY_MAX_CONTEXT_CHARS, load_config


def _legacy_data() -> dict:
    return {
        "openai_codex": {
            "context_compression": {
                "enabled": True,
                "max_context_chars": LEGACY_MAX_CONTEXT_CHARS,
                "keep_recent_iterations": 30,
            }
        }
    }


class TestApplyMigration:
    def test_legacy_default_becomes_auto_and_marker_recorded(self, tmp_path, caplog):
        config_path = tmp_path / "config.yml"
        config_path.write_text("x: 1")
        data = _legacy_data()
        with caplog.at_level(logging.INFO, logger="odin.config"):
            apply_legacy_ceiling_migration(data, config_path)
        assert data["openai_codex"]["context_compression"]["max_context_chars"] is None
        marker = ceiling_marker_path(config_path)
        assert marker.is_file()
        recorded = json.loads(marker.read_text())
        assert recorded["legacy_value"] == LEGACY_MAX_CONTEXT_CHARS
        warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
        assert len(warnings) == 1

    def test_marker_present_keeps_auto_at_info_level(self, tmp_path, caplog):
        config_path = tmp_path / "config.yml"
        config_path.write_text("x: 1")
        marker = ceiling_marker_path(config_path)
        marker.parent.mkdir(parents=True)
        marker.write_text("{}")
        before = marker.read_text()
        data = _legacy_data()
        with caplog.at_level(logging.INFO, logger="odin.config"):
            apply_legacy_ceiling_migration(data, config_path)
        assert data["openai_codex"]["context_compression"]["max_context_chars"] is None
        # Subsequent boots reinterpret at INFO — never silent, never a second
        # WARNING, marker untouched.
        assert not [r for r in caplog.records if r.levelno == logging.WARNING]
        assert [r for r in caplog.records if r.levelno == logging.INFO]
        assert marker.read_text() == before

    def test_non_legacy_values_untouched_and_no_marker(self, tmp_path):
        config_path = tmp_path / "config.yml"
        config_path.write_text("x: 1")
        for value in (LEGACY_MAX_CONTEXT_CHARS + 1, 1, None):
            data = _legacy_data()
            data["openai_codex"]["context_compression"]["max_context_chars"] = value
            apply_legacy_ceiling_migration(data, config_path)
            assert (
                data["openai_codex"]["context_compression"]["max_context_chars"]
                == value
            )
        assert not ceiling_marker_path(config_path).exists()

    def test_absent_sections_are_noops(self, tmp_path):
        config_path = tmp_path / "config.yml"
        config_path.write_text("x: 1")
        for data in ({}, {"openai_codex": None}, {"openai_codex": {}},
                     {"openai_codex": {"context_compression": None}}):
            apply_legacy_ceiling_migration(data, config_path)  # must not raise
        assert not ceiling_marker_path(config_path).exists()

    def test_marker_write_failure_still_interprets_auto(self, tmp_path, caplog):
        config_path = tmp_path / "config.yml"
        config_path.write_text("x: 1")
        # Occupy the data-dir path with a FILE so mkdir(parents=True) fails.
        (tmp_path / "data").write_text("not a directory")
        data = _legacy_data()
        with caplog.at_level(logging.WARNING, logger="odin.config"):
            apply_legacy_ceiling_migration(data, config_path)
        assert data["openai_codex"]["context_compression"]["max_context_chars"] is None
        assert any("retries next boot" in r.getMessage() for r in caplog.records)


class TestOperatorProvenance:
    def test_operator_stamp_makes_legacy_value_verbatim(self, tmp_path):
        config_path = tmp_path / "config.yml"
        config_path.write_text("x: 1")
        record_ceiling_operator_provenance(config_path)
        marker = ceiling_marker_path(config_path)
        assert json.loads(marker.read_text())["operator_saved"] is True
        data = _legacy_data()
        apply_legacy_ceiling_migration(data, config_path)
        # Operator provenance: the literal legacy value is honored verbatim.
        assert (
            data["openai_codex"]["context_compression"]["max_context_chars"]
            == LEGACY_MAX_CONTEXT_CHARS
        )

    def test_corrupt_marker_fails_toward_auto(self, tmp_path):
        config_path = tmp_path / "config.yml"
        config_path.write_text("x: 1")
        marker = ceiling_marker_path(config_path)
        marker.parent.mkdir(parents=True)
        marker.write_text("not json {")
        data = _legacy_data()
        apply_legacy_ceiling_migration(data, config_path)
        assert data["openai_codex"]["context_compression"]["max_context_chars"] is None

    def test_persisting_compression_section_stamps_provenance(self, tmp_path):
        config_path = tmp_path / "config.yml"
        config_path.write_text(
            "openai_codex:\n  context_compression:\n    max_context_chars: 750000\n"
        )
        marker = ceiling_marker_path(config_path)
        marker.parent.mkdir(parents=True)
        marker.write_text("{}")  # legacy provenance until a deliberate save
        patch_config_paths(
            [
                (
                    ("openai_codex", "context_compression", "max_context_chars"),
                    LEGACY_MAX_CONTEXT_CHARS,
                )
            ],
            path=config_path,
        )
        assert json.loads(marker.read_text())["operator_saved"] is True
        persisted = yaml.safe_load(config_path.read_text())
        assert (
            persisted["openai_codex"]["context_compression"]["max_context_chars"]
            == LEGACY_MAX_CONTEXT_CHARS
        )

    def test_unrelated_persistence_does_not_stamp(self, tmp_path):
        config_path = tmp_path / "config.yml"
        config_path.write_text("openai_codex:\n  model: gpt-5.5\n")
        marker = ceiling_marker_path(config_path)
        marker.parent.mkdir(parents=True)
        marker.write_text("{}")
        patch_config_paths(
            [(("openai_codex", "model"), "gpt-5.6-sol")], path=config_path
        )
        assert json.loads(marker.read_text()) == {}


class TestLoadConfigIntegration:
    def test_load_config_migrates_then_honors_operator_750k(self, tmp_path, caplog):
        config_path = tmp_path / "config.yml"
        config_path.write_text(
            "discord:\n"
            '  token: "t"\n'
            "openai_codex:\n"
            "  context_compression:\n"
            "    enabled: true\n"
            f"    max_context_chars: {LEGACY_MAX_CONTEXT_CHARS}\n"
            "    keep_recent_iterations: 30\n"
        )
        with caplog.at_level(logging.INFO, logger="odin.config"):
            cfg = load_config(config_path)
        cc = cfg.openai_codex.context_compression
        assert cc.max_context_chars is None
        assert cc.resolved_max_context_chars == LEGACY_MAX_CONTEXT_CHARS
        assert ceiling_marker_path(config_path).is_file()

        # An operator save of the section clears provenance; the SAME literal
        # value now loads verbatim — the one-time gate, not eternal coercion.
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
