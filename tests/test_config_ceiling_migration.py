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
from datetime import UTC, datetime

import pytest
import yaml

from src.config.migrations import (
    MigrationCompletionError,
    _atomic_write_marker,
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
        record = json.loads(marker.read_text())
        assert record["version"] == 3
        assert record["state"] == "completed"
        assert record["reason"] == "migrated"
        assert len([r for r in caplog.records if r.levelno == logging.WARNING]) == 1

        # One-time: a second pass is gated by the marker and changes nothing.
        caplog.clear()
        with caplog.at_level(logging.INFO, logger="odin.config"):
            _migrate(config_path)
        assert not caplog.records

    def test_valid_versioned_marker_gates_even_a_literal_750k(self, tmp_path):
        """Post-migration, a deliberately written 750000 is honored verbatim."""
        config_path = tmp_path / "config.yml"
        config_path.write_text(_LEGACY_YAML)
        marker = ceiling_marker_path(config_path)
        _atomic_write_marker(
            marker,
            {
                "version": 3,
                "migration": "legacy_max_context_chars_to_auto",
                "config_id": marker.name.rsplit(".", 2)[-2],
                "state": "completed",
                "reason": "not_applicable",
                "completed_at": datetime.now(UTC).isoformat(),
            },
        )
        data = _migrate(config_path)
        assert (
            data["openai_codex"]["context_compression"]["max_context_chars"]
            == LEGACY_MAX_CONTEXT_CHARS
        )
        assert f"max_context_chars: {LEGACY_MAX_CONTEXT_CHARS}" in config_path.read_text()


class TestVacuousCompletion:
    def test_fresh_null_then_hand_written_750k_is_honored(self, tmp_path):
        """Review-round-1 reproduction #1: the fresh-install hole."""
        config_path = tmp_path / "config.yml"
        config_path.write_text(
            'discord:\n  token: "t"\n'
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
        for value in (
            "750001",
            "1",
            "null",
            "750000.0",
            "0xB71B0",
            "750_000",
            "+750000",
            "!!int 750000",
            "'750000'",
            '"750000"',
        ):
            safe_name = str(abs(hash(value)))
            config_path = tmp_path / f"config-{safe_name}.yml"
            config_path.write_text(
                f"openai_codex:\n  context_compression:\n    max_context_chars: {value}\n"
            )
            before = config_path.read_text()
            _migrate(config_path)
            assert config_path.read_text() == before
            record = json.loads(ceiling_marker_path(config_path).read_text())
            assert record["version"] == 3
            assert record["reason"] == "not_applicable"

    def test_absent_sections_complete_vacuously(self, tmp_path):
        config_path = tmp_path / "config.yml"
        config_path.write_text('discord:\n  token: "t"\n')
        _migrate(config_path)  # must not raise
        assert ceiling_marker_path(config_path).exists()


class TestPlaceholderIsDeliberate:
    def test_env_placeholder_resolving_to_750k_never_migrated(self, tmp_path, monkeypatch):
        """Review-round-1 reproduction #2: substitution happens before the
        migration, but the UNSUBSTITUTED text is the authority — a ${VAR}
        is operator configuration, not the legacy shipped default."""
        monkeypatch.setenv("MAX_CTX_TEST", str(LEGACY_MAX_CONTEXT_CHARS))
        config_path = tmp_path / "config.yml"
        config_path.write_text(
            'discord:\n  token: "t"\n'
            "openai_codex:\n  context_compression:\n"
            "    max_context_chars: ${MAX_CTX_TEST}\n"
        )
        cfg = load_config(config_path)
        assert cfg.openai_codex.context_compression.max_context_chars == LEGACY_MAX_CONTEXT_CHARS
        # File untouched — the placeholder survives.
        assert "${MAX_CTX_TEST}" in config_path.read_text()
        assert (
            json.loads(ceiling_marker_path(config_path).read_text())["reason"] == "not_applicable"
        )


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
    def test_rewrite_failure_is_this_boot_only_and_retries(self, tmp_path, caplog, monkeypatch):
        config_path = tmp_path / "config.yml"
        config_path.write_text(_LEGACY_YAML)
        import src.config.persistence as persistence

        real_patch = persistence.patch_config_paths

        def fail_patch(*args, **kwargs):
            raise OSError("config rewrite blocked")

        monkeypatch.setattr(persistence, "patch_config_paths", fail_patch)
        with caplog.at_level(logging.WARNING, logger="odin.config"):
            data = _migrate(config_path)
        # In-memory auto so behavior is consistent this boot…
        assert data["openai_codex"]["context_compression"]["max_context_chars"] is None
        assert any("retries next boot" in r.getMessage() for r in caplog.records)
        # …but no completion is durable and the file is untouched: the gate refires.
        assert not ceiling_marker_path(config_path).exists()
        assert f"max_context_chars: {LEGACY_MAX_CONTEXT_CHARS}" in config_path.read_text()

        monkeypatch.setattr(persistence, "patch_config_paths", real_patch)
        data2 = _migrate(config_path)
        assert data2["openai_codex"]["context_compression"]["max_context_chars"] is None
        assert (
            yaml.safe_load(config_path.read_text())["openai_codex"]["context_compression"][
                "max_context_chars"
            ]
            is None
        )
        assert json.loads(ceiling_marker_path(config_path).read_text())["state"] == "completed"


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
        assert (
            json.loads(ceiling_marker_path(config_path).read_text())["reason"] == "not_applicable"
        )

    @pytest.mark.parametrize(
        "original_raw",
        [
            "",  # empty document
            "openai_codex: scalar\n",  # non-mapping hierarchy
            (
                "openai_codex:\n  context_compression:\n"
                "    max_context_chars:\n      nested: value\n"
            ),  # mapping rather than scalar leaf
        ],
    )
    def test_non_scalar_or_missing_lexical_shapes_complete_vacuously(self, tmp_path, original_raw):
        path = tmp_path / str(abs(hash(original_raw))) / "config.yml"
        path.parent.mkdir()
        path.write_text("discord:\n  token: t\n")
        data = {}
        apply_legacy_ceiling_migration(data, path, original_raw)
        assert json.loads(ceiling_marker_path(path).read_text())["reason"] == "not_applicable"

    def test_marker_write_failure_after_rewrite_self_heals(self, tmp_path, caplog, monkeypatch):
        """The rewrite removes ambiguity; vacuous completion heals next boot."""
        config_path = tmp_path / "config.yml"
        config_path.write_text(_LEGACY_YAML)
        import src.config.migrations as migrations

        real_write = migrations._atomic_write_marker

        def fail_write(marker, record):
            raise OSError("completion blocked")

        monkeypatch.setattr(migrations, "_atomic_write_marker", fail_write)
        with caplog.at_level(logging.WARNING, logger="odin.config"):
            data = _migrate(config_path)
        assert data["openai_codex"]["context_compression"]["max_context_chars"] is None
        assert (
            yaml.safe_load(config_path.read_text())["openai_codex"]["context_compression"][
                "max_context_chars"
            ]
            is None
        )
        assert not ceiling_marker_path(config_path).exists()
        assert any("completion retries next boot" in r.getMessage() for r in caplog.records)

        monkeypatch.setattr(migrations, "_atomic_write_marker", real_write)
        _migrate(config_path)
        record = json.loads(ceiling_marker_path(config_path).read_text())
        assert record["state"] == "completed"
        assert record["reason"] == "not_applicable"


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
        assert (
            yaml.safe_load(real.read_text())["openai_codex"]["context_compression"][
                "max_context_chars"
            ]
            is None
        )
        marker = ceiling_marker_path(link)
        assert marker.parent == opt / "data" / "config_migrations"
        assert marker.is_file()
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
        assert (
            yaml.safe_load(config_path.read_text())["openai_codex"]["context_compression"][
                "max_context_chars"
            ]
            is None
        )

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
        assert cfg2.openai_codex.context_compression.max_context_chars == LEGACY_MAX_CONTEXT_CHARS


class TestLexicalLiteralGate:
    def test_only_shipped_plain_decimal_scalar_is_rewritten(self, tmp_path):
        forms = {
            "750000": True,
            "750000.0": False,
            "0xB71B0": False,
            "750_000": False,
            "+750000": False,
            "!!int 750000": False,
            "'750000'": False,
            '"750000"': False,
        }
        for index, (value, migrates) in enumerate(forms.items()):
            path = tmp_path / str(index) / "config.yml"
            path.parent.mkdir()
            path.write_text(
                f"openai_codex:\n  context_compression:\n    max_context_chars: {value}\n"
            )
            before = path.read_text()
            data = _migrate(path)
            if migrates:
                assert data["openai_codex"]["context_compression"]["max_context_chars"] is None
                assert (
                    yaml.safe_load(path.read_text())["openai_codex"]["context_compression"][
                        "max_context_chars"
                    ]
                    is None
                )
            else:
                assert path.read_text() == before


class TestCompletionRecordProvenance:
    @pytest.mark.parametrize("kind", ["empty", "corrupt", "directory"])
    def test_invalid_marker_never_counts_as_completion_or_gets_overwritten(self, tmp_path, kind):
        path = tmp_path / "config.yml"
        path.write_text(_LEGACY_YAML)
        marker = ceiling_marker_path(path)
        marker.parent.mkdir(parents=True)
        if kind == "empty":
            marker.write_text("")
        elif kind == "corrupt":
            marker.write_text("{broken")
        else:
            marker.mkdir()
        with pytest.raises(MigrationCompletionError):
            _migrate(path)
        assert f"max_context_chars: {LEGACY_MAX_CONTEXT_CHARS}" in path.read_text()
        if kind == "empty":
            assert marker.read_text() == ""
        elif kind == "corrupt":
            assert marker.read_text() == "{broken"
        else:
            assert marker.is_dir()

    def test_unknown_record_fails_closed_without_overwrite(self, tmp_path):
        path = tmp_path / "config.yml"
        path.write_text(_LEGACY_YAML)
        marker = ceiling_marker_path(path)
        marker.parent.mkdir(parents=True)
        raw = '{"version": 99, "migration": "future"}\n'
        marker.write_text(raw)
        with pytest.raises(MigrationCompletionError):
            _migrate(path)
        assert marker.read_text() == raw
        assert f"max_context_chars: {LEGACY_MAX_CONTEXT_CHARS}" in path.read_text()

    def test_round1_legacy_marker_does_not_suppress_rewrite(self, tmp_path):
        path = tmp_path / "config.yml"
        path.write_text(_LEGACY_YAML)
        marker = ceiling_marker_path(path)
        marker.parent.mkdir(parents=True)
        marker.write_text(
            json.dumps(
                {
                    "migration": "legacy_max_context_chars_to_auto",
                    "legacy_value": LEGACY_MAX_CONTEXT_CHARS,
                    "migrated_at": datetime.now(UTC).isoformat(),
                }
            )
        )
        _migrate(path)
        assert (
            yaml.safe_load(path.read_text())["openai_codex"]["context_compression"][
                "max_context_chars"
            ]
            is None
        )
        assert json.loads(marker.read_text())["version"] == 3

    def test_round1_operator_marker_preserves_and_upgrades(self, tmp_path):
        path = tmp_path / "config.yml"
        path.write_text(_LEGACY_YAML)
        marker = ceiling_marker_path(path)
        marker.parent.mkdir(parents=True)
        marker.write_text(
            json.dumps(
                {
                    "migration": "legacy_max_context_chars_to_auto",
                    "operator_saved": True,
                    "saved_at": datetime.now(UTC).isoformat(),
                }
            )
        )
        data = _migrate(path)
        assert (
            data["openai_codex"]["context_compression"]["max_context_chars"]
            == LEGACY_MAX_CONTEXT_CHARS
        )
        record = json.loads(marker.read_text())
        assert record["version"] == 3
        assert record["reason"] == "prior_operator_saved"

    def test_preversioned_round2_completion_is_validated_then_upgraded(self, tmp_path):
        path = tmp_path / "config.yml"
        path.write_text(_LEGACY_YAML)
        marker = ceiling_marker_path(path)
        marker.parent.mkdir(parents=True)
        marker.write_text(
            json.dumps(
                {
                    "migration": "legacy_max_context_chars_to_auto",
                    "reason": "not_applicable",
                    "completed_at": datetime.now(UTC).isoformat(),
                }
            )
        )
        data = _migrate(path)
        assert (
            data["openai_codex"]["context_compression"]["max_context_chars"]
            == LEGACY_MAX_CONTEXT_CHARS
        )
        assert json.loads(marker.read_text())["version"] == 3

    @pytest.mark.parametrize(
        "record",
        [
            [],
            {
                "version": 2,
                "migration": "legacy_max_context_chars_to_auto",
                "state": "completed",
                "reason": "not_applicable",
                "completed_at": 123,
            },
            {
                "version": 2,
                "migration": "legacy_max_context_chars_to_auto",
                "state": "completed",
                "reason": "not_applicable",
                "completed_at": "not-a-date",
            },
            {
                "version": 2,
                "migration": "legacy_max_context_chars_to_auto",
                "state": "completed",
                "reason": [],
                "completed_at": datetime.now(UTC).isoformat(),
            },
            {
                "migration": "legacy_max_context_chars_to_auto",
                "reason": {},
                "completed_at": datetime.now(UTC).isoformat(),
            },
        ],
    )
    def test_malformed_record_fields_are_unknown(self, tmp_path, record):
        path = tmp_path / "config.yml"
        path.write_text(_LEGACY_YAML)
        marker = ceiling_marker_path(path)
        marker.parent.mkdir(parents=True)
        marker.write_text(json.dumps(record))
        with pytest.raises(MigrationCompletionError):
            _migrate(path)

    def test_unreadable_marker_is_not_completion(self, tmp_path, monkeypatch):
        path = tmp_path / "config.yml"
        path.write_text(_LEGACY_YAML)
        marker = ceiling_marker_path(path)
        marker.parent.mkdir(parents=True)
        marker.write_text("placeholder")
        real_read_text = type(marker).read_text

        def unreadable(self, *args, **kwargs):
            if self == marker:
                raise OSError("unreadable")
            return real_read_text(self, *args, **kwargs)

        monkeypatch.setattr(type(marker), "read_text", unreadable)
        with pytest.raises(MigrationCompletionError):
            _migrate(path)


class TestVacuousFailureSequence:
    def test_blocked_vacuous_record_prevents_later_750k_erasure(self, tmp_path):
        """Exact round-2 blocker: failure must stop this boot truthfully."""
        path = tmp_path / "config.yml"
        path.write_text("openai_codex:\n  context_compression:\n    max_context_chars: null\n")
        (tmp_path / "data").write_text("blocks marker directory")
        with pytest.raises(MigrationCompletionError):
            _migrate(path)
        assert "max_context_chars: null" in path.read_text()

        # No boot may have continued and handed control to an operator.  Once
        # persistence is repaired, the original null completes vacuously; only
        # then is a later literal 750000 unambiguously intentional.
        (tmp_path / "data").unlink()
        _migrate(path)
        path.write_text(_LEGACY_YAML)
        data = _migrate(path)
        assert (
            data["openai_codex"]["context_compression"]["max_context_chars"]
            == LEGACY_MAX_CONTEXT_CHARS
        )
        assert f"max_context_chars: {LEGACY_MAX_CONTEXT_CHARS}" in path.read_text()

    def test_load_config_reports_truthful_vacuous_completion_failure(self, tmp_path):
        path = tmp_path / "config.yml"
        path.write_text(
            'discord:\n  token: "t"\n'
            "openai_codex:\n  context_compression:\n"
            "    max_context_chars: null\n"
        )
        (tmp_path / "data").write_text("blocks marker directory")
        with pytest.raises(SystemExit, match="Configuration migration failed"):
            load_config(path)


class TestAtomicMarkerPersistence:
    def test_marker_replace_is_fsynced_and_mode_0600(self, tmp_path, monkeypatch):
        marker = tmp_path / "data" / "marker.json"
        import src.config.migrations as migrations

        calls = []
        real_fsync = os.fsync
        real_replace = os.replace

        def spy_fsync(fd):
            calls.append("fsync")
            return real_fsync(fd)

        def spy_replace(source, destination):
            calls.append("replace")
            return real_replace(source, destination)

        monkeypatch.setattr(migrations.os, "fsync", spy_fsync)
        monkeypatch.setattr(migrations.os, "replace", spy_replace)
        _atomic_write_marker(marker, {"ok": True})
        assert calls[0] == "fsync"
        assert "replace" in calls
        assert marker.stat().st_mode & 0o777 == 0o600
        assert not list(marker.parent.glob("*.tmp"))


class TestAtomicMarkerFailures:
    def test_replace_failure_cleans_temporary_file(self, tmp_path, monkeypatch):
        marker = tmp_path / "data" / "marker.json"
        import src.config.migrations as migrations

        def fail_replace(*args, **kwargs):
            raise OSError("replace failed")

        monkeypatch.setattr(migrations.os, "replace", fail_replace)
        with pytest.raises(OSError, match="replace failed"):
            _atomic_write_marker(marker, {"ok": True})
        assert not marker.exists()
        assert not list(marker.parent.glob("*.tmp"))


class TestRemainingMigrationBranches:
    def test_required_marker_write_error_is_truthful(self, tmp_path, monkeypatch):
        path = tmp_path / "config.yml"
        path.write_text("discord:\n  token: t\n")
        import src.config.migrations as migrations

        def fail_write(*args, **kwargs):
            raise OSError("marker blocked")

        monkeypatch.setattr(migrations, "_atomic_write_marker", fail_write)
        with pytest.raises(MigrationCompletionError, match="configuration was left unchanged"):
            _migrate(path)

    def test_runtime_auto_tolerates_missing_or_non_mapping_sections(self):
        import src.config.migrations as migrations

        missing = {}
        migrations._set_runtime_auto(missing)
        assert missing == {}

        non_mapping = {"openai_codex": {"context_compression": "disabled"}}
        migrations._set_runtime_auto(non_mapping)
        assert non_mapping["openai_codex"]["context_compression"] == "disabled"

    def test_open_temp_stream_is_closed_and_removed_on_write_failure(self, tmp_path, monkeypatch):
        marker = tmp_path / "marker.json"
        import src.config.migrations as migrations

        class BrokenStream:
            closed = False

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return None

            def write(self, value):
                raise OSError("write failed")

            def close(self):
                self.closed = True

        broken = BrokenStream()
        monkeypatch.setattr(migrations.os, "fdopen", lambda *args, **kwargs: broken)
        with pytest.raises(OSError, match="write failed"):
            _atomic_write_marker(marker, {"ok": True})
        assert broken.closed is True
        assert not list(tmp_path.glob("*.tmp"))

    def test_fd_is_closed_and_temp_removed_when_fdopen_fails(self, tmp_path, monkeypatch):
        marker = tmp_path / "marker.json"
        import src.config.migrations as migrations

        closed = []
        real_close = os.close

        def fail_fdopen(*args, **kwargs):
            raise OSError("fdopen failed")

        def spy_close(fd):
            closed.append(fd)
            return real_close(fd)

        monkeypatch.setattr(migrations.os, "fdopen", fail_fdopen)
        monkeypatch.setattr(migrations.os, "close", spy_close)
        with pytest.raises(OSError, match="fdopen failed"):
            _atomic_write_marker(marker, {"ok": True})
        assert closed
        assert not list(tmp_path.glob("*.tmp"))

class TestConfigIdentityBinding:
    def test_symlink_aliases_in_different_directories_share_completion(self, tmp_path):
        real_dir = tmp_path / "real"
        alias_a_dir = tmp_path / "alias-a"
        alias_b_dir = tmp_path / "alias-b"
        for directory in (real_dir, alias_a_dir, alias_b_dir):
            directory.mkdir()
        target = real_dir / "odin.yml"
        target.write_text(_LEGACY_YAML)
        alias_a = alias_a_dir / "config.yml"
        alias_b = alias_b_dir / "other.yml"
        alias_a.symlink_to(target)
        alias_b.symlink_to(target)

        _migrate(alias_a)
        assert yaml.safe_load(target.read_text())["openai_codex"][
            "context_compression"
        ]["max_context_chars"] is None

        # A deliberate post-migration value must survive loading through a
        # different launch alias whose local marker did not exist yet.
        patch_config_paths(
            [(("openai_codex", "context_compression", "max_context_chars"), 750_000)],
            path=target,
        )
        data = _migrate(alias_b)
        assert data["openai_codex"]["context_compression"]["max_context_chars"] == 750_000
        assert yaml.safe_load(target.read_text())["openai_codex"][
            "context_compression"
        ]["max_context_chars"] == 750_000
        assert ceiling_marker_path(alias_a).is_file()
        assert ceiling_marker_path(alias_b).is_file()
        assert json.loads(ceiling_marker_path(alias_a).read_text())["config_id"] == json.loads(
            ceiling_marker_path(alias_b).read_text()
        )["config_id"]

    def test_distinct_configs_in_one_directory_do_not_share_completion(self, tmp_path):
        first = tmp_path / "first.yml"
        second = tmp_path / "second.yml"
        first.write_text(_LEGACY_YAML)
        second.write_text(_LEGACY_YAML)

        _migrate(first)
        _migrate(second)

        assert yaml.safe_load(first.read_text())["openai_codex"]["context_compression"][
            "max_context_chars"
        ] is None
        assert yaml.safe_load(second.read_text())["openai_codex"]["context_compression"][
            "max_context_chars"
        ] is None
        assert ceiling_marker_path(first) != ceiling_marker_path(second)
        first_record = json.loads(ceiling_marker_path(first).read_text())
        second_record = json.loads(ceiling_marker_path(second).read_text())
        assert first_record["config_id"] != second_record["config_id"]

    def test_preidentity_directory_marker_is_bound_not_shared(self, tmp_path):
        first = tmp_path / "first.yml"
        second = tmp_path / "second.yml"
        first.write_text(_LEGACY_YAML)
        second.write_text(_LEGACY_YAML)
        legacy = tmp_path / "data" / "context_ceiling_migration.json"
        legacy.parent.mkdir()
        legacy.write_text(
            json.dumps(
                {
                    "version": 2,
                    "migration": "legacy_max_context_chars_to_auto",
                    "state": "completed",
                    "reason": "not_applicable",
                    "completed_at": datetime.now(UTC).isoformat(),
                }
            )
        )

        # The first config adopts the old provenance and therefore preserves a
        # value the old migration had already classified as operator-authored.
        first_data = _migrate(first)
        assert first_data["openai_codex"]["context_compression"][
            "max_context_chars"
        ] == 750_000

        # The legacy marker is now identity-bound. A distinct sibling no longer
        # inherits it and performs its own one-time rewrite.
        second_data = _migrate(second)
        assert second_data["openai_codex"]["context_compression"][
            "max_context_chars"
        ] is None
        assert json.loads(ceiling_marker_path(first).read_text())["config_id"] != json.loads(
            ceiling_marker_path(second).read_text()
        )["config_id"]

class TestIdentityMarkerAdversarialBranches:
    def test_identity_marker_reread_failure_is_fail_closed(self, tmp_path, monkeypatch):
        import src.config.migrations as migrations

        path = tmp_path / "config.yml"
        path.write_text(_LEGACY_YAML)
        marker = ceiling_marker_path(path)
        marker.parent.mkdir(parents=True)
        config_id = marker.name.rsplit(".", 2)[-2]
        migrations._atomic_write_marker(
            marker,
            {
                "version": 3,
                "migration": "legacy_max_context_chars_to_auto",
                "config_id": config_id,
                "state": "completed",
                "reason": "not_applicable",
                "completed_at": datetime.now(UTC).isoformat(),
            },
        )
        real_read = type(marker).read_text
        reads = 0

        def fail_second_read(self, *args, **kwargs):
            nonlocal reads
            if self == marker:
                reads += 1
                if reads == 2:
                    raise OSError("reread failed")
            return real_read(self, *args, **kwargs)

        monkeypatch.setattr(type(marker), "read_text", fail_second_read)
        with pytest.raises(MigrationCompletionError):
            _migrate(path)

    def test_identity_directory_inspection_failure_is_fail_closed(self, tmp_path, monkeypatch):
        path = tmp_path / "config.yml"
        path.write_text(_LEGACY_YAML)
        marker = ceiling_marker_path(path)
        marker.parent.mkdir(parents=True)
        real_iterdir = type(marker).iterdir

        def fail_iterdir(self):
            if self == marker.parent:
                raise OSError("cannot inspect")
            return real_iterdir(self)

        monkeypatch.setattr(type(marker), "iterdir", fail_iterdir)
        with pytest.raises(MigrationCompletionError, match="inspect identity-bound"):
            _migrate(path)

    def test_corrupt_bound_legacy_marker_is_fail_closed(self, tmp_path):
        path = tmp_path / "config.yml"
        path.write_text(_LEGACY_YAML)
        legacy = tmp_path / "data" / "context_ceiling_migration.json"
        legacy.parent.mkdir()
        legacy.write_text("{broken")
        with pytest.raises(MigrationCompletionError, match="legacy ceiling-migration"):
            _migrate(path)

    def test_bound_legacy_marker_for_other_identity_is_ignored(self, tmp_path):
        import src.config.migrations as migrations

        path = tmp_path / "config.yml"
        path.write_text(_LEGACY_YAML)
        legacy = tmp_path / "data" / "context_ceiling_migration.json"
        legacy.parent.mkdir()
        migrations._atomic_write_marker(
            legacy,
            {
                "version": 3,
                "migration": "legacy_max_context_chars_to_auto",
                "config_id": "f" * 64,
                "state": "completed",
                "reason": "not_applicable",
                "completed_at": datetime.now(UTC).isoformat(),
            },
        )
        data = _migrate(path)
        assert data["openai_codex"]["context_compression"]["max_context_chars"] is None

    def test_round1_legacy_at_old_path_rewrites_and_binds(self, tmp_path):
        path = tmp_path / "config.yml"
        path.write_text(_LEGACY_YAML)
        legacy = tmp_path / "data" / "context_ceiling_migration.json"
        legacy.parent.mkdir()
        legacy.write_text(
            json.dumps(
                {
                    "migration": "legacy_max_context_chars_to_auto",
                    "legacy_value": 750_000,
                    "migrated_at": datetime.now(UTC).isoformat(),
                }
            )
        )
        data = _migrate(path)
        assert data["openai_codex"]["context_compression"]["max_context_chars"] is None

    def test_bound_legacy_marker_reread_failure_is_fail_closed(self, tmp_path, monkeypatch):
        import src.config.migrations as migrations

        path = tmp_path / "config.yml"
        path.write_text(_LEGACY_YAML)
        legacy = tmp_path / "data" / "context_ceiling_migration.json"
        legacy.parent.mkdir()
        migrations._atomic_write_marker(
            legacy,
            {
                "version": 3,
                "migration": "legacy_max_context_chars_to_auto",
                "config_id": migrations._config_identity(path),
                "state": "completed",
                "reason": "not_applicable",
                "completed_at": datetime.now(UTC).isoformat(),
            },
        )
        real_read = type(legacy).read_text
        reads = 0

        def fail_second_read(self, *args, **kwargs):
            nonlocal reads
            if self == legacy:
                reads += 1
                if reads == 2:
                    raise OSError("reread failed")
            return real_read(self, *args, **kwargs)

        monkeypatch.setattr(type(legacy), "read_text", fail_second_read)
        with pytest.raises(MigrationCompletionError, match="legacy ceiling-migration"):
            _migrate(path)
