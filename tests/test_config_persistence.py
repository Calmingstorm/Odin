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
        from src.config.persistence import config_transaction

        assert not config_transaction().locked()
        await persist_config_paths([(("logging", "level"), "DEBUG")], path=config_file)
        assert not config_transaction().locked()
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


class TestCancellationSettlement:
    """A cancelled caller must not release the lock with a write still running.

    `asyncio.to_thread` creates a Task: cancelling the await returns at once
    while the worker thread keeps going, so the abandoned write can land after
    — and overwrite — a later one. The executor-future form settles first.
    """

    def _slow_writer(self, monkeypatch, delay=0.3):
        import time as _time

        import src.config.persistence as persistence

        real = persistence.patch_config_paths

        def slow(changes, *, path=None):
            _time.sleep(delay)
            real(changes, path=path)

        monkeypatch.setattr(persistence, "patch_config_paths", slow)
        return persistence

    async def test_cancelled_write_settles_before_returning(self, config_file, monkeypatch):
        import asyncio

        persistence = self._slow_writer(monkeypatch)
        task = asyncio.create_task(
            persistence.persist_config_paths(
                [(("logging", "level"), "DEBUG")], path=config_file
            )
        )
        await asyncio.sleep(0.05)  # let the executor pick the job up
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

        # The write COMPLETED before the cancellation propagated: no worker is
        # still holding a stale document to flush after a later writer commits.
        assert "level: DEBUG" in config_file.read_text()
        assert not persistence.config_transaction().locked()

    async def test_later_writer_is_not_overwritten_by_a_cancelled_one(
        self, config_file, monkeypatch
    ):
        import asyncio

        persistence = self._slow_writer(monkeypatch)
        task = asyncio.create_task(
            persistence.persist_config_paths(
                [(("logging", "level"), "DEBUG")], path=config_file
            )
        )
        await asyncio.sleep(0.05)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

        await persistence.persist_config_paths(
            [(("logging", "level"), "ERROR")], path=config_file
        )
        # The last writer wins — a cancelled one cannot come back and stomp it.
        assert "level: ERROR" in config_file.read_text()


class TestAliasAwareness:
    """Pydantic accepts legacy spellings via validation_alias
    (search.chromadb_path → search_db_path). A submitted alias is absent from
    the validated dump, so without resolution it is silently dropped — and
    writing the canonical name beside a surviving legacy key means the alias
    wins on reload, reverting the change."""

    def test_submitted_alias_resolves_to_the_canonical_field(self):
        from src.config.schema import Config

        leaves = submitted_leaves(
            {"search": {"chromadb_path": "/new/path"}},
            {"search": {"search_db_path": "/new/path", "enabled": True}},
            Config,
        )
        assert leaves == [(("search", "search_db_path"), "/new/path", ("chromadb_path",))]

    def test_without_the_schema_an_alias_is_still_dropped(self):
        """Documents why the call site must pass the model: no schema, no
        alias resolution."""
        assert submitted_leaves(
            {"search": {"chromadb_path": "/new/path"}},
            {"search": {"search_db_path": "/old", "enabled": True}},
        ) == []

    def test_canonical_key_still_resolves_normally(self):
        from src.config.schema import Config

        leaves = submitted_leaves(
            {"search": {"search_db_path": "/p"}},
            {"search": {"search_db_path": "/p"}},
            Config,
        )
        assert leaves == [(("search", "search_db_path"), "/p", ("chromadb_path",))]

    def test_writer_updates_the_legacy_key_the_file_uses(self, tmp_path):
        path = tmp_path / "config.yml"
        path.write_text("search:\n  chromadb_path: /old/path\n")
        patch_config_paths(
            [(("search", "search_db_path"), "/new/path", ("chromadb_path",))], path=path
        )
        text = path.read_text()
        assert "chromadb_path: /new/path" in text
        assert "search_db_path" not in text, "a canonical sibling would lose to the alias"

    def test_writer_uses_the_canonical_key_when_the_file_has_it(self, tmp_path):
        path = tmp_path / "config.yml"
        path.write_text("search:\n  search_db_path: /old/path\n")
        patch_config_paths(
            [(("search", "search_db_path"), "/new/path", ("chromadb_path",))], path=path
        )
        assert "search_db_path: /new/path" in path.read_text()

    def test_writer_creates_the_canonical_key_when_neither_exists(self, tmp_path):
        path = tmp_path / "config.yml"
        path.write_text("discord:\n  token: x\n")
        patch_config_paths(
            [(("search", "search_db_path"), "/p", ("chromadb_path",))], path=path
        )
        assert "search_db_path: /p" in path.read_text()

    def test_legacy_config_round_trips_to_the_same_effective_value(self, tmp_path):
        """End to end: a legacy-spelled file edited through this path reloads
        with the operator's new value, not the old one."""
        from ruamel.yaml import YAML

        from src.config.schema import Config

        path = tmp_path / "config.yml"
        path.write_text("discord:\n  token: x\nsearch:\n  chromadb_path: /old\n")
        patch_config_paths(
            [(("search", "search_db_path"), "/new", ("chromadb_path",))], path=path
        )
        reloaded = Config(**YAML().load(path.read_text()))
        assert reloaded.search.search_db_path == "/new"


class TestTypedPlaceholders:
    """A placeholder holding a non-string scalar must survive a round-trip too.

    The validated model has already coerced it (`true` → True, `3002` → 3002),
    so a plain str() comparison sees "true" vs "True" and flattens the
    placeholder into a literal.
    """

    def test_boolean_placeholder_survives(self, tmp_path, monkeypatch):
        path = tmp_path / "config.yml"
        path.write_text("search:\n  enabled: ${SEARCH_ON}\n")
        monkeypatch.setenv("SEARCH_ON", "true")
        patch_config_paths([(("search", "enabled"), True)], path=path)
        assert "enabled: ${SEARCH_ON}" in path.read_text()

    def test_boolean_placeholder_yields_to_a_real_change(self, tmp_path, monkeypatch):
        path = tmp_path / "config.yml"
        path.write_text("search:\n  enabled: ${SEARCH_ON}\n")
        monkeypatch.setenv("SEARCH_ON", "true")
        patch_config_paths([(("search", "enabled"), False)], path=path)
        assert "enabled: false" in path.read_text().lower()

    def test_yes_no_spelling_is_understood(self, tmp_path, monkeypatch):
        path = tmp_path / "config.yml"
        path.write_text("search:\n  enabled: ${SEARCH_ON}\n")
        monkeypatch.setenv("SEARCH_ON", "yes")
        patch_config_paths([(("search", "enabled"), True)], path=path)
        assert "enabled: ${SEARCH_ON}" in path.read_text()

    def test_float_placeholder_survives(self, tmp_path, monkeypatch):
        path = tmp_path / "config.yml"
        path.write_text("tools:\n  ratio: ${RATIO}\n")
        monkeypatch.setenv("RATIO", "1.50")
        patch_config_paths([(("tools", "ratio"), 1.5)], path=path)
        assert "ratio: ${RATIO}" in path.read_text()


class TestDualSpellings:
    """A file carrying BOTH the canonical key and its legacy alias reverts if
    only one is updated — pydantic's validation_alias wins on reload."""

    def test_both_present_keys_are_updated(self, tmp_path):
        path = tmp_path / "config.yml"
        path.write_text("search:\n  search_db_path: /old\n  chromadb_path: /old\n")
        patch_config_paths(
            [(("search", "search_db_path"), "/new", ("chromadb_path",))], path=path
        )
        text = path.read_text()
        assert "search_db_path: /new" in text
        assert "chromadb_path: /new" in text

    def test_dual_spelling_file_reloads_with_the_new_value(self, tmp_path):
        from ruamel.yaml import YAML

        from src.config.schema import Config

        path = tmp_path / "config.yml"
        path.write_text(
            "discord:\n  token: x\nsearch:\n  search_db_path: /old\n  chromadb_path: /old\n"
        )
        patch_config_paths(
            [(("search", "search_db_path"), "/new", ("chromadb_path",))], path=path
        )
        reloaded = Config(**YAML().load(path.read_text()))
        assert reloaded.search.search_db_path == "/new"


class TestAnchorSafety:
    """ruamel keeps ONE object behind an anchor and all its aliases, so setting
    a key through a shared mapping silently rewrites every section sharing it —
    a leaf-only write that isn't. Fail loudly instead of corrupting."""

    ANCHORED = (
        "defaults: &defaults\n"
        "  enabled: true\n"
        "search:\n"
        "  <<: *defaults\n"
        "  search_db_path: /p\n"
    )

    def test_merge_key_section_is_refused(self, tmp_path):
        path = tmp_path / "config.yml"
        path.write_text(self.ANCHORED)
        with pytest.raises(ConfigPersistError, match="merge key"):
            patch_config_paths([(("search", "enabled"), False)], path=path)
        assert path.read_text() == self.ANCHORED, "the file must be left untouched"

    def test_anchored_section_is_refused(self, tmp_path):
        path = tmp_path / "config.yml"
        source = "defaults: &defaults\n  enabled: true\n"
        path.write_text(source)
        with pytest.raises(ConfigPersistError, match="anchor"):
            patch_config_paths([(("defaults", "enabled"), False)], path=path)
        assert path.read_text() == source

    def test_ordinary_sections_are_unaffected(self, tmp_path):
        path = tmp_path / "config.yml"
        path.write_text(self.ANCHORED)
        patch_config_paths([(("logging", "level"), "DEBUG")], path=path)
        assert "level: DEBUG" in path.read_text()
