"""Contract tests for the shared config writer (src/config/persistence.py).

These pin the properties the three old writers lacked: comment/order fidelity,
env-placeholder survival, atomicity, mode preservation, and loud failure.
"""

from __future__ import annotations

import os

import pytest

from src.config.persistence import (
    ConfigPersistError,
    patch_config_paths,
    persist_config_paths,
    submitted_leaves,
)

SAMPLE = """\
# Odin configuration
discord:
  # the bot token comes from the environment
  token: ${DISCORD_TOKEN}
  require_mention: true
  channels: []

logging:
  level: INFO   # trailing comment
"""


@pytest.fixture
def config_file(tmp_path):
    path = tmp_path / "config.yml"
    path.write_text(SAMPLE)
    os.chmod(path, 0o640)
    return path


class TestSubmittedLeaves:
    def test_submitted_leaf_carries_the_validated_value(self):
        updates = {"discord": {"require_mention": False}}
        validated = {"discord": {"require_mention": False, "channels": []}}
        assert submitted_leaves(updates, validated) == [(("discord", "require_mention"), False)]

    def test_unsubmitted_siblings_are_never_visited(self):
        """The placeholder guarantee: a field nobody edited is never written,
        so `token: ${DISCORD_TOKEN}` cannot be replaced by the resolved value."""
        updates = {"discord": {"require_mention": False}}
        validated = {"discord": {"require_mention": False, "token": "resolved-secret"}}
        paths = [p for p, _ in submitted_leaves(updates, validated)]
        assert ("discord", "token") not in paths

    def test_paths_validation_dropped_are_skipped(self):
        """A removed schema block (model_routing) named in the request is
        ignored by runtime, so it must not reach disk either."""
        updates = {"openai_codex": {"model_routing": {"enabled": True}, "model": "x"}}
        validated = {"openai_codex": {"model": "x"}}
        assert submitted_leaves(updates, validated) == [(("openai_codex", "model"), "x")]

    def test_normalized_value_wins_over_the_raw_request(self):
        """Blank workspace normalizes to the default — disk must show what
        runtime uses, not the blank string the operator typed."""
        updates = {"tools": {"local_working_dir": "   "}}
        validated = {"tools": {"local_working_dir": "/var/lib/odin-workspace"}}
        assert submitted_leaves(updates, validated) == [
            (("tools", "local_working_dir"), "/var/lib/odin-workspace")
        ]

    def test_nested_sections_recurse(self):
        updates = {"a": {"b": {"c": 2}}}
        validated = {"a": {"b": {"c": 2, "d": 9}}}
        assert submitted_leaves(updates, validated) == [(("a", "b", "c"), 2)]

    def test_lists_are_leaves_replaced_wholesale(self):
        updates = {"discord": {"channels": ["1", "2"]}}
        validated = {"discord": {"channels": ["1", "2"]}}
        assert submitted_leaves(updates, validated) == [(("discord", "channels"), ["1", "2"])]

    def test_unknown_top_level_section_is_skipped(self):
        assert submitted_leaves({"nope": {"k": 1}}, {"discord": {}}) == []


class TestPatchConfigPaths:
    def test_untouched_placeholder_survives(self, config_file):
        """THE regression: a generic save used to resolve ${DISCORD_TOKEN} into
        the real token on disk. Untouched leaves are never visited now."""
        patch_config_paths([(("logging", "level"), "DEBUG")], path=config_file)
        text = config_file.read_text()
        assert "token: ${DISCORD_TOKEN}" in text
        assert "level: DEBUG" in text

    def test_comments_and_order_survive(self, config_file):
        patch_config_paths([(("discord", "require_mention"), False)], path=config_file)
        text = config_file.read_text()
        assert "# Odin configuration" in text
        assert "# the bot token comes from the environment" in text
        assert "# trailing comment" in text
        assert text.index("discord:") < text.index("logging:")

    def test_edited_placeholder_field_becomes_literal(self, config_file):
        """Changing a placeholder-backed field IS intent — write the literal."""
        patch_config_paths([(("discord", "token"), "literal-value")], path=config_file)
        assert "token: literal-value" in config_file.read_text()

    def test_creates_missing_intermediate_sections(self, config_file):
        patch_config_paths([(("image", "backend"), "openai")], path=config_file)
        text = config_file.read_text()
        assert "image:" in text
        assert "backend: openai" in text

    def test_file_mode_preserved(self, config_file):
        patch_config_paths([(("logging", "level"), "WARNING")], path=config_file)
        assert os.stat(config_file).st_mode & 0o777 == 0o640

    def test_no_temp_files_left_behind(self, config_file):
        patch_config_paths([(("logging", "level"), "ERROR")], path=config_file)
        assert [p.name for p in config_file.parent.iterdir()] == ["config.yml"]

    def test_empty_change_set_is_a_noop(self, config_file):
        before = config_file.read_text()
        patch_config_paths([], path=config_file)
        assert config_file.read_text() == before

    def test_missing_file_raises(self, tmp_path):
        with pytest.raises(ConfigPersistError, match="does not exist"):
            patch_config_paths([(("a",), 1)], path=tmp_path / "absent.yml")

    def test_empty_file_raises(self, tmp_path):
        path = tmp_path / "config.yml"
        path.write_text("")
        with pytest.raises(ConfigPersistError, match="empty"):
            patch_config_paths([(("a",), 1)], path=path)

    def test_malformed_file_raises_without_echoing_content(self, tmp_path):
        path = tmp_path / "config.yml"
        path.write_text("discord:\n  token: secret-aaa\n  token: secret-bbb\n")
        with pytest.raises(ConfigPersistError) as exc:
            patch_config_paths([(("a",), 1)], path=path)
        # Duplicate-key errors echo the conflicting VALUES — never surface them.
        assert "secret-aaa" not in str(exc.value)
        assert "secret-bbb" not in str(exc.value)

    def test_original_survives_a_failed_write(self, config_file, monkeypatch):
        import src.config.persistence as persistence

        def boom(*_a, **_k):
            raise OSError("disk full")

        monkeypatch.setattr(persistence.os, "replace", boom)
        with pytest.raises(OSError):
            patch_config_paths([(("logging", "level"), "DEBUG")], path=config_file)
        assert config_file.read_text() == SAMPLE
        assert [p.name for p in config_file.parent.iterdir()] == ["config.yml"]


class TestPersistConfigPaths:
    async def test_async_wrapper_writes_under_the_shared_lock(self, config_file):
        from src.config.persistence import config_write_lock

        assert not config_write_lock.locked()
        await persist_config_paths([(("logging", "level"), "DEBUG")], path=config_file)
        assert not config_write_lock.locked()
        assert "level: DEBUG" in config_file.read_text()

    async def test_async_wrapper_propagates_failure(self, tmp_path):
        with pytest.raises(ConfigPersistError):
            await persist_config_paths([(("a",), 1)], path=tmp_path / "absent.yml")


class TestPlaceholderGuard:
    """A client that GETs the whole document and PUTs it back submits every
    path, including placeholder-backed ones, carrying the value the placeholder
    already resolved to. Writing that literal would move a secret onto disk
    while changing nothing — so the writer leaves the placeholder alone."""

    def test_resolved_value_round_tripped_keeps_the_placeholder(self, config_file, monkeypatch):
        monkeypatch.setenv("DISCORD_TOKEN", "real-secret-value")
        patch_config_paths([(("discord", "token"), "real-secret-value")], path=config_file)
        text = config_file.read_text()
        assert "token: ${DISCORD_TOKEN}" in text
        assert "real-secret-value" not in text

    def test_a_genuinely_different_value_still_writes(self, config_file, monkeypatch):
        monkeypatch.setenv("DISCORD_TOKEN", "real-secret-value")
        patch_config_paths([(("discord", "token"), "operator-typed-this")], path=config_file)
        assert "token: operator-typed-this" in config_file.read_text()

    def test_type_coerced_scalar_matches(self, tmp_path, monkeypatch):
        path = tmp_path / "config.yml"
        path.write_text("web:\n  port: ${ODIN_PORT}\n")
        monkeypatch.setenv("ODIN_PORT", "3002")
        # The validated model carries an int; the file's placeholder resolves
        # to the string "3002" — same value, so the placeholder stays.
        patch_config_paths([(("web", "port"), 3002)], path=path)
        assert "port: ${ODIN_PORT}" in path.read_text()

    def test_unresolvable_placeholder_does_not_block_a_real_edit(self, tmp_path, monkeypatch):
        path = tmp_path / "config.yml"
        path.write_text("web:\n  host: ${MISSING_VAR}\n")
        monkeypatch.delenv("MISSING_VAR", raising=False)
        patch_config_paths([(("web", "host"), "127.0.0.1")], path=path)
        assert "host: 127.0.0.1" in path.read_text()

    def test_default_syntax_placeholder_is_respected(self, tmp_path, monkeypatch):
        path = tmp_path / "config.yml"
        path.write_text("web:\n  host: ${ODIN_HOST:-0.0.0.0}\n")
        monkeypatch.delenv("ODIN_HOST", raising=False)
        patch_config_paths([(("web", "host"), "0.0.0.0")], path=path)
        assert "host: ${ODIN_HOST:-0.0.0.0}" in path.read_text()
