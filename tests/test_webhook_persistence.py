"""Focused coverage for leaf-scoped outbound webhook persistence."""

from __future__ import annotations

import asyncio

import pytest
import yaml

from src.config.persistence import (
    DELETE_CONFIG_PATH,
    ConfigPersistError,
    _assert_not_shared,
    _dump_atomic,
    _field_lookup,
    _patch_config_paths,
    _placeholder_still_accurate,
    patch_webhook_targets,
    persist_webhook_targets_locked,
    submitted_leaves,
)


def _path(tmp_path, text="discord: {}\n"):
    path = tmp_path / "config.yml"
    path.write_text(text)
    return path


def test_create_section_and_targets_from_empty_document(tmp_path):
    path = _path(tmp_path)
    patch_webhook_targets(
        [{"id": "one", "name": "One", "url": "https://one.invalid"}],
        changed_fields={"one": {"name", "url"}},
        path=path,
    )
    assert yaml.safe_load(path.read_text())["outbound_webhooks"]["targets"][0]["id"] == "one"


def test_update_refuses_missing_requested_target_without_writing(tmp_path):
    path = _path(
        tmp_path,
        "outbound_webhooks:\n  targets:\n    - id: one\n      url: https://one.invalid\n",
    )
    original = path.read_bytes()
    with pytest.raises(ConfigPersistError, match="update lacks target"):
        patch_webhook_targets([], changed_fields={"one": {"name"}}, path=path)
    assert path.read_bytes() == original


def test_patch_existing_fields_preserves_unmentioned_and_resolved_placeholder(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("HOOK_SECRET", "secret-value")
    path = _path(
        tmp_path,
        "outbound_webhooks:\n  targets:\n"
        "    - id: one\n      name: Old\n      url: https://one.invalid\n"
        "      secret: ${HOOK_SECRET}\n      enabled: true\n",
    )
    patch_webhook_targets(
        [
            {
                "id": "one",
                "name": "New",
                "url": "https://one.invalid",
                "secret": "secret-value",
                "enabled": False,
            }
        ],
        changed_fields={"one": {"name", "secret", "enabled"}},
        path=path,
    )
    text = path.read_text()
    assert "name: New" in text and "enabled: false" in text
    assert "${HOOK_SECRET}" in text and "secret-value" not in text


def test_force_field_overwrites_placeholder(tmp_path, monkeypatch):
    monkeypatch.setenv("HOOK_SECRET", "same-secret")
    path = _path(
        tmp_path, "outbound_webhooks:\n  targets:\n    - id: one\n      secret: ${HOOK_SECRET}\n"
    )
    patch_webhook_targets(
        [{"id": "one", "secret": "same-secret"}],
        changed_fields={"one": ({"secret"}, {"secret"})},
        path=path,
    )
    assert "secret: same-secret" in path.read_text()


def test_delete_legacy_row_does_not_edit_shifted_legacy_row(tmp_path):
    path = _path(
        tmp_path,
        "outbound_webhooks:\n  targets:\n"
        "    - id: remove\n      url: https://remove.invalid\n"
        "    - name: Keep\n      url: https://keep.invalid\n",
    )
    patch_webhook_targets(
        [{"id": "new", "name": "New", "url": "https://new.invalid"}],
        changed_fields={"new": {"name", "url"}},
        delete_ids=["remove"],
        path=path,
    )
    rows = yaml.safe_load(path.read_text())["outbound_webhooks"]["targets"]
    assert rows == [
        {"name": "Keep", "url": "https://keep.invalid"},
        {"id": "new", "name": "New", "url": "https://new.invalid"},
    ]


def test_delete_last_row_emits_empty_targets_and_noop_does_not_rewrite(tmp_path):
    path = _path(
        tmp_path, "outbound_webhooks:\n  targets:\n    - id: one\n      url: https://one.invalid\n"
    )
    patch_webhook_targets([], changed_fields={}, delete_ids=["one"], path=path)
    assert yaml.safe_load(path.read_text())["outbound_webhooks"]["targets"] == []
    before = path.stat().st_mtime_ns
    patch_webhook_targets([], changed_fields={}, path=path)
    assert path.stat().st_mtime_ns == before


def test_delete_preserves_trailing_row_comments(tmp_path):
    path = _path(
        tmp_path,
        "outbound_webhooks:\n  targets:\n"
        "    - id: one\n      url: https://one.invalid\n      name: One\n"
        "      enabled: true\n      # section-tail\n",
    )
    patch_webhook_targets([], changed_fields={}, delete_ids=["one"], path=path)
    text = path.read_text()
    assert "# section-tail" in text
    assert yaml.safe_load(text)["outbound_webhooks"]["targets"] == []


@pytest.mark.parametrize(
    ("text", "message"),
    [
        ("outbound_webhooks: nope\n", "must be a mapping"),
        ("outbound_webhooks:\n  targets: nope\n", "must be a list"),
        ("outbound_webhooks:\n  targets:\n    - id: [broken\n", "unreadable or malformed"),
    ],
)
def test_invalid_disk_state_fails_clearly(tmp_path, text, message):
    path = _path(tmp_path, text)
    target = {"id": "one", "name": "One", "url": "https://x.invalid"}
    with pytest.raises(ConfigPersistError, match=message):
        patch_webhook_targets([target], changed_fields={"one": {"name"}}, path=path)


def test_missing_config_path_fails(tmp_path):
    with pytest.raises(ConfigPersistError, match="does not exist"):
        patch_webhook_targets([], changed_fields={}, path=tmp_path / "missing.yml")


def test_legacy_identity_resolves_environment_url_without_writing_it(tmp_path, monkeypatch):
    monkeypatch.setenv("HOOK_URL", "https://resolved.invalid")
    path = _path(
        tmp_path, "outbound_webhooks:\n  targets:\n    - url: ${HOOK_URL}\n      name: Before\n"
    )
    import uuid

    ident = uuid.uuid5(uuid.NAMESPACE_URL, "outbound-webhook:0:https://resolved.invalid").hex[:12]
    patch_webhook_targets(
        [{"id": ident, "name": "After", "url": "https://resolved.invalid"}],
        changed_fields={ident: {"name"}},
        path=path,
    )
    assert "name: After" in path.read_text()
    assert "${HOOK_URL}" in path.read_text()


@pytest.mark.parametrize("row", ["- scalar\n", "    - name: no-url\n"])
def test_rows_without_mapping_identity_can_remain_while_new_target_is_added(tmp_path, row):
    path = _path(tmp_path, "outbound_webhooks:\n  targets:\n    " + row)
    patch_webhook_targets(
        [{"id": "fresh", "name": "Fresh", "url": "https://fresh.invalid"}],
        changed_fields={"fresh": {"name", "url"}},
        path=path,
    )
    assert yaml.safe_load(path.read_text())["outbound_webhooks"]["targets"][-1]["id"] == "fresh"


def test_unresolvable_environment_url_uses_raw_value_for_legacy_identity(tmp_path, monkeypatch):
    monkeypatch.delenv("MISSING_HOOK_URL", raising=False)
    path = _path(
        tmp_path,
        "outbound_webhooks:\n  targets:\n    - url: ${MISSING_HOOK_URL}\n      name: Before\n",
    )
    import uuid

    ident = uuid.uuid5(uuid.NAMESPACE_URL, "outbound-webhook:0:${MISSING_HOOK_URL}").hex[:12]
    patch_webhook_targets(
        [{"id": ident, "name": "After"}],
        changed_fields={ident: {"name"}},
        path=path,
    )
    assert "name: After" in path.read_text()


def test_changed_field_missing_from_target_is_ignored(tmp_path):
    path = _path(tmp_path, "outbound_webhooks:\n  targets:\n    - id: one\n      name: Existing\n")
    patch_webhook_targets(
        [{"id": "one", "name": "Existing"}],
        changed_fields={"one": {"secret"}},
        path=path,
    )
    assert "secret:" not in path.read_text()


def test_delete_comment_detachment_variants(tmp_path):
    path = _path(
        tmp_path,
        "outbound_webhooks:\n  targets:\n"
        "    - id: first\n      name: First\n      url: https://first.invalid\n"
        "      enabled: true # inline\n"
        "    - id: last\n      name: Last\n      url: https://last.invalid\n"
        "      enabled: true # last-inline\n      # section-tail\n",
    )
    patch_webhook_targets([], changed_fields={}, delete_ids=["first", "last"], path=path)
    text = path.read_text()
    assert "# section-tail" in text
    assert yaml.safe_load(text)["outbound_webhooks"]["targets"] == []


def test_delete_non_mapping_rows_with_resolved_ids_rejects_malformed_entry(tmp_path, monkeypatch):
    import src.config.persistence as persistence

    path = _path(tmp_path, "outbound_webhooks:\n  targets:\n    - scalar\n")
    monkeypatch.setattr(persistence, "_webhook_identity", lambda _row, _index: "bad-row")
    with pytest.raises(ConfigPersistError, match="entry must be a mapping"):
        patch_webhook_targets(
            [{"id": "bad-row", "name": "Bad"}],
            changed_fields={"bad-row": {"name"}},
            path=path,
        )


def test_delete_malformed_row_takes_comment_preservation_guard(tmp_path, monkeypatch):
    import src.config.persistence as persistence

    path = _path(tmp_path, "outbound_webhooks:\n  targets:\n    - scalar\n    - id: valid\n")
    original = persistence._webhook_identity

    def identify(row, index):
        if index == 0:
            return "remove"
        return original(row, index)

    monkeypatch.setattr(persistence, "_webhook_identity", identify)
    patch_webhook_targets([], changed_fields={}, delete_ids=["remove"], path=path)
    assert yaml.safe_load(path.read_text())["outbound_webhooks"]["targets"] == [{"id": "valid"}]


def test_deleted_last_row_transfers_comment_block_before_section(tmp_path):
    path = _path(
        tmp_path,
        "outbound_webhooks:\n  targets:\n"
        "    - id: first\n      name: First\n"
        "    - id: last\n      name: Last\n      # trailing section comment\n",
    )
    patch_webhook_targets([], changed_fields={}, delete_ids=["first", "last"], path=path)
    assert "# trailing section comment" in path.read_text()
    assert yaml.safe_load(path.read_text())["outbound_webhooks"]["targets"] == []


def test_deleting_earlier_row_transfers_trailing_section_comment(tmp_path):
    path = _path(
        tmp_path,
        "outbound_webhooks:\n  targets:\n"
        "    - id: remove\n      name: Remove\n"
        "    - id: keep\n      name: Keep\n      # section comment\n",
    )
    patch_webhook_targets(
        [{"id": "keep", "name": "Keep"}],
        changed_fields={},
        delete_ids=["remove"],
        path=path,
    )
    result = yaml.safe_load(path.read_text())["outbound_webhooks"]["targets"]
    assert result == [{"id": "keep", "name": "Keep"}]
    assert "# section comment" in path.read_text()


def test_create_after_template_empty_targets_keeps_trailing_comment_block(tmp_path):
    trailer = "".join(f"# # template line {i}\n" for i in range(31))
    path = _path(tmp_path, "outbound_webhooks:\n  targets: []\n" + trailer + "mcp: {}\n")
    for ident in ("first", "second"):
        patch_webhook_targets(
            [{"id": ident, "url": f"https://{ident}.invalid"}],
            changed_fields={ident: {"url"}}, path=path,
        )
    text = path.read_text()
    assert text.index("id: second") < text.index("# # template line 0")
    assert text.count("# # template line") == 31
    assert yaml.safe_load(text)["mcp"] == {}


def test_create_between_rows_and_trailer_preserves_all_comments(tmp_path):
    path = _path(tmp_path,
        "outbound_webhooks:\n  targets:\n"
        "    - id: first\n      # between\n"
        "    - id: second\n      # section-tail\n# # MCP\nmcp: {}\n",
    )
    patch_webhook_targets([{"id": "third", "url": "https://third.invalid"}],
                          changed_fields={"third": {"url"}}, path=path)
    text = path.read_text()
    assert text.index("# between") < text.index("id: second")
    assert text.index("id: third") < text.index("# section-tail")
    assert "# # MCP" in text and yaml.safe_load(text)["mcp"] == {}


def test_delete_first_row_keeps_between_and_last_row_trailer(tmp_path):
    path = _path(tmp_path,
        "outbound_webhooks:\n  targets:\n"
        "    - id: first\n      # between\n"
        "    - id: second\n      # section-tail\n# # MCP\nmcp: {}\n",
    )
    patch_webhook_targets([], changed_fields={}, delete_ids=["first"], path=path)
    text = path.read_text()
    assert text.index("# between") < text.index("id: second")
    assert "# section-tail" in text and "# # MCP" in text
    assert yaml.safe_load(text)["mcp"] == {}


def test_delete_last_row_keeps_both_between_and_trailing_blocks(tmp_path):
    path = _path(tmp_path,
        "outbound_webhooks:\n  targets:\n"
        "    - id: first\n      # between\n"
        "    - id: last\n      # section-tail\n# # MCP\nmcp: {}\n",
    )
    patch_webhook_targets([], changed_fields={}, delete_ids=["last"], path=path)
    text = path.read_text()
    assert "# between" in text and "# section-tail" in text and "# # MCP" in text
    assert yaml.safe_load(text)["mcp"] == {}


def test_delete_last_row_then_create_keeps_trailer_after_new_row(tmp_path):
    path = _path(tmp_path,
        "outbound_webhooks:\n  targets:\n"
        "    - id: old\n      # section-tail\n# # MCP\nmcp: {}\n",
    )
    patch_webhook_targets([], changed_fields={}, delete_ids=["old"], path=path)
    patch_webhook_targets([{"id": "new", "url": "https://new.invalid"}],
                          changed_fields={"new": {"url"}}, path=path)
    text = path.read_text()
    assert text.index("id: new") < text.index("# section-tail")
    assert yaml.safe_load(text)["mcp"] == {}


def test_delete_last_row_preserves_leading_and_trailing_comments(tmp_path):
    path = _path(tmp_path,
        "outbound_webhooks:\n  targets:\n"
        "    # before-first\n    - id: old\n      # after-last\n"
        "# # MCP\nmcp: {}\n",
    )
    patch_webhook_targets([], changed_fields={}, delete_ids=["old"], path=path)
    text = path.read_text()
    assert "# before-first" in text and "# after-last" in text
    assert "# # MCP" in text and yaml.safe_load(text)["mcp"] == {}


def test_hand_edited_rows_are_not_reintroduced_or_overwritten(tmp_path):
    path = _path(tmp_path,
        "outbound_webhooks:\n  targets:\n"
        "    - id: edited\n      url: https://operator.invalid\n"
        "    - id: unrelated\n      url: https://operator2.invalid\n",
    )
    patch_webhook_targets([
        {"id": "edited", "url": "https://stale.invalid"},
        {"id": "unrelated", "url": "https://stale2.invalid"},
        {"id": "new", "url": "https://new.invalid"},
    ], changed_fields={"new": {"url"}}, path=path)
    assert [r["url"] for r in yaml.safe_load(path.read_text())["outbound_webhooks"]["targets"]] == [
        "https://operator.invalid", "https://operator2.invalid", "https://new.invalid"]


@pytest.mark.parametrize("mutation", ["update", "delete"])
def test_missing_requested_row_conflicts_without_writing(tmp_path, mutation):
    path = _path(tmp_path, "outbound_webhooks:\n  targets: []\n")
    original = path.read_bytes()
    with pytest.raises(ConfigPersistError, match="changed on disk"):
        patch_webhook_targets(
            [{"id": "missing", "name": "new"}] if mutation == "update" else [],
            changed_fields={"missing": ({"name"}, {"name"})} if mutation == "update" else {},
            delete_ids=["missing"] if mutation == "delete" else (), path=path,
        )
    assert path.read_bytes() == original


def test_create_conflicts_with_operator_added_same_id(tmp_path):
    path = _path(tmp_path, "outbound_webhooks:\n  targets:\n"
                 "    - id: new\n      url: https://operator.invalid\n")
    original = path.read_bytes()
    with pytest.raises(ConfigPersistError, match="changed on disk"):
        patch_webhook_targets([{"id": "new", "url": "https://stale.invalid"}],
                              changed_fields={"new": {"url"}}, create_ids=["new"], path=path)
    assert path.read_bytes() == original


def test_delete_last_row_comment_transfer_ignores_non_comment_trailer(tmp_path):
    from types import SimpleNamespace

    from src.config.persistence import _load_document

    path = _path(tmp_path, "outbound_webhooks:\n  targets:\n    - id: one\n      name: One\n")
    document, _ = _load_document(path)
    document["outbound_webhooks"]["targets"][0].ca.items["name"] = [
        None,
        None,
        SimpleNamespace(value="\nplain trailer"),
    ]
    patch_webhook_targets([], changed_fields={}, delete_ids=["one"], path=path)
    assert yaml.safe_load(path.read_text())["outbound_webhooks"]["targets"] == []


def test_delete_mapping_with_short_comment_slot_and_non_mapping_tail(tmp_path):
    from src.config.persistence import _load_document

    path = _path(
        tmp_path,
        "outbound_webhooks:\n  targets:\n    - id: remove\n      name: Remove\n    - scalar\n",
    )
    document, _ = _load_document(path)
    document["outbound_webhooks"]["targets"][0].ca.items["name"] = [None, None]
    patch_webhook_targets([], changed_fields={}, delete_ids=["remove"], path=path)
    assert yaml.safe_load(path.read_text())["outbound_webhooks"]["targets"] == ["scalar"]


def test_delete_preserves_list_valued_row_comment_token(tmp_path):
    from types import SimpleNamespace

    from src.config.persistence import _load_document

    path = _path(
        tmp_path,
        "outbound_webhooks:\n  targets:\n"
        "    - id: remove\n      name: Remove\n"
        "    - id: keep\n      name: Keep\n",
    )
    document, _ = _load_document(path)
    document["outbound_webhooks"]["targets"][1].ca.items["name"] = [
        None,
        None,
        [SimpleNamespace(value="\n# list-token-trailer\n")],
    ]
    patch_webhook_targets(
        [{"id": "keep", "name": "Keep"}],
        changed_fields={},
        delete_ids=["remove"],
        path=path,
    )
    assert yaml.safe_load(path.read_text())["outbound_webhooks"]["targets"] == [
        {"id": "keep", "name": "Keep"}
    ]


def test_delete_preserves_non_comment_trailing_row_token(tmp_path):
    from types import SimpleNamespace

    from src.config.persistence import _load_document

    path = _path(
        tmp_path,
        "outbound_webhooks:\n  targets:\n"
        "    - id: remove\n      name: Remove\n"
        "    - id: keep\n      name: Keep\n",
    )
    document, _ = _load_document(path)
    document["outbound_webhooks"]["targets"][1].ca.items["name"] = [
        None,
        None,
        SimpleNamespace(value="\nplain attachment\n"),
    ]
    patch_webhook_targets(
        [{"id": "keep", "name": "Keep"}],
        changed_fields={},
        delete_ids=["remove"],
        path=path,
    )
    assert yaml.safe_load(path.read_text())["outbound_webhooks"]["targets"] == [
        {"id": "keep", "name": "Keep"}
    ]


def test_placeholder_guard_bad_numeric_and_boolean_spellings(monkeypatch):
    monkeypatch.setenv("VALUE", "not-a-number")
    assert not _placeholder_still_accurate("${VALUE}", 2)
    monkeypatch.setenv("VALUE", "perhaps")
    assert not _placeholder_still_accurate("${VALUE}", True)
    assert not _placeholder_still_accurate(123, "123")


def test_schema_alias_submission_tracks_validated_canonical_leaf():
    from src.config.schema import SearchConfig

    assert _field_lookup(SearchConfig)
    leaves = submitted_leaves(
        {"chromadb_path": "/new/db"},
        {"search_db_path": "/new/db"},
        SearchConfig,
    )
    assert leaves == [(("search_db_path",), "/new/db", ("chromadb_path",))]


def test_schema_owned_mapping_is_single_validated_leaf_and_unknown_is_dropped():
    from src.config.schema import Config

    leaves = submitted_leaves(
        {"context_budget": {"short": 120}, "removed": 1},
        {"context_budget": {"short": 120}},
        Config,
    )
    assert leaves == [(("context_budget", "short"), 120)]


def test_patch_config_paths_deletes_leaf_and_creates_nested_mappings(tmp_path):
    path = _path(tmp_path, "server:\n  host: old\n")
    _patch_config_paths(
        [(("server", "host"), DELETE_CONFIG_PATH), (("server", "port", "http"), 8000)],
        path=path,
    )
    doc = yaml.safe_load(path.read_text())
    assert doc["server"] == {"port": {"http": 8000}}


def test_atomic_dump_preserves_requested_mode(tmp_path):
    import os
    import stat

    path = _path(tmp_path, "value: old\n")
    os.chmod(path, 0o640)
    _dump_atomic({"value": "new"}, path, 0o640)
    assert stat.S_IMODE(path.stat().st_mode) == 0o640
    assert yaml.safe_load(path.read_text())["value"] == "new"


def test_anchor_shared_mapping_is_refused():
    from ruamel.yaml import YAML

    doc = YAML().load("defaults: &shared\n  key: value\nalias: *shared\n")
    with pytest.raises(ConfigPersistError, match="anchor shared"):
        _assert_not_shared(doc["defaults"], ("defaults",))


def test_roundtrip_writer_does_not_create_cwd_fallback(tmp_path, monkeypatch):
    from src.config.schema import set_active_config_path

    monkeypatch.chdir(tmp_path)
    set_active_config_path(None)
    with pytest.raises(ConfigPersistError, match="not loaded from disk"):
        _patch_config_paths([(("value",), 1)])


def test_file_lock_rejects_unsafe_existing_lock_path(tmp_path, monkeypatch):
    import os
    import tempfile

    import src.config.persistence as persistence

    lockdir = tmp_path / f"odin-config-locks-{os.geteuid()}"
    lockdir.mkdir(mode=0o700)
    lockfile = lockdir / "lockid"
    lockfile.write_text("unsafe")
    monkeypatch.setattr(tempfile, "gettempdir", lambda: str(tmp_path))
    monkeypatch.setattr(persistence, "_config_file_lock", persistence._config_file_lock)
    # Path identity is a SHA-like filename; create a symlink with the actual key
    # after asking the same migration identity function used by the lock.
    from src.config.migrations import _config_identity

    key = _config_identity(tmp_path / "target.yml")
    (lockdir / key).unlink(missing_ok=True)
    (lockdir / key).symlink_to(lockfile)
    with pytest.raises((OSError, ConfigPersistError)):
        persistence.patch_config_paths([(("x",), 1)], path=tmp_path / "target.yml")


def test_invalid_image_model_intent_is_rejected(tmp_path):
    path = _path(tmp_path)
    with pytest.raises(ConfigPersistError, match="invalid image model intent"):
        _patch_config_paths([], path=path, image_model_intent={"not-real": "follow"})


def test_image_model_pin_requires_explicit_value(tmp_path):
    path = _path(tmp_path)
    with pytest.raises(ConfigPersistError, match="pin requires"):
        _patch_config_paths([], path=path, image_model_intent={"image_model": "pin"})


def test_image_model_default_noop_and_explicit_follow(tmp_path):
    from src.config.image_defaults import IMAGE_MODEL_DEFAULTS, IMAGE_MODEL_PREFIX

    leaf, default = next(iter(IMAGE_MODEL_DEFAULTS.items()))
    path = _path(tmp_path, "image:\n  openai:\n    image_model: gpt-image-2.5-flare\n")
    _patch_config_paths(
        [(tuple((*IMAGE_MODEL_PREFIX, leaf)), default)],
        path=path,
        image_model_intent={leaf: "follow"},
    )
    assert yaml.safe_load(path.read_text()) == {"image": {"openai": {}}}


def test_image_model_pin_writes_explicit_value(tmp_path):
    from src.config.image_defaults import IMAGE_MODEL_DEFAULTS, IMAGE_MODEL_PREFIX

    leaf, _default = next(iter(IMAGE_MODEL_DEFAULTS.items()))
    path = _path(tmp_path, "image:\n  openai: {}\n")
    value = "explicit-test-model"
    _patch_config_paths(
        [(tuple((*IMAGE_MODEL_PREFIX, leaf)), value)],
        path=path,
        image_model_intent={leaf: "pin"},
    )
    assert yaml.safe_load(path.read_text())["image"]["openai"][leaf] == value


def test_persist_locked_empty_and_failed_write_outcomes(tmp_path, monkeypatch):
    from src.config.persistence import persist_config_paths_locked

    assert asyncio.run(persist_config_paths_locked([], path=tmp_path / "unused")) == (None, False)
    monkeypatch.setattr(
        "src.config.persistence.patch_config_paths",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(OSError("disk failure")),
    )
    error, cancelled = asyncio.run(
        persist_config_paths_locked([(("value",), 1)], path=tmp_path / "config.yml")
    )
    assert isinstance(error, OSError) and not cancelled


def test_persist_locked_forwards_image_intents_and_captures_error(tmp_path, monkeypatch):
    from src.config.persistence import persist_config_paths_locked

    seen = {}

    def fail(changes, **kwargs):
        seen["changes"] = list(changes)
        seen.update(kwargs)
        raise OSError("disk failure")

    monkeypatch.setattr("src.config.persistence.patch_config_paths", fail)
    error, cancelled = asyncio.run(
        persist_config_paths_locked(
            [(("image", "openai", "image_model"), "test")],
            path=tmp_path / "config.yml",
            image_model_intent={"image_model": "pin"},
        )
    )
    assert isinstance(error, OSError) and not cancelled
    assert seen["image_model_intent"] == {"image_model": "pin"}


def test_patch_paths_skips_same_value_and_deletes_absent_path(tmp_path):
    path = _path(tmp_path, "server:\n  host: localhost\n")
    before = path.stat().st_mtime_ns
    _patch_config_paths(
        [(("server", "host"), "localhost"), (("server", "missing"), DELETE_CONFIG_PATH)],
        path=path,
    )
    assert path.stat().st_mtime_ns == before


def test_image_model_follow_creates_missing_branch_and_removes_default(tmp_path):
    from src.config.image_defaults import IMAGE_MODEL_DEFAULTS, IMAGE_MODEL_PREFIX

    leaf, default = next(iter(IMAGE_MODEL_DEFAULTS.items()))
    path = _path(tmp_path)
    _patch_config_paths(
        [(tuple((*IMAGE_MODEL_PREFIX, leaf)), default)],
        path=path,
        image_model_intent={leaf: "follow"},
    )
    assert yaml.safe_load(path.read_text()) == {"discord": {}}


def test_webhook_whole_list_roundtrip_reconciles_and_preserves_unknown_secret(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("HOOK_SECRET", "resolved-secret")
    path = _path(
        tmp_path,
        "outbound_webhooks:\n  targets:\n"
        "    - id: one\n      url: https://one.invalid\n      secret: ${HOOK_SECRET}\n",
    )
    _patch_config_paths(
        [
            (
                ("outbound_webhooks", "targets"),
                [
                    {"id": "one", "url": "https://one.invalid", "secret": "resolved-secret"},
                    {"id": "two", "url": "https://two.invalid"},
                ],
            )
        ],
        path=path,
    )
    text = path.read_text()
    assert "${HOOK_SECRET}" in text and "resolved-secret" not in text
    assert yaml.safe_load(text)["outbound_webhooks"]["targets"][-1]["id"] == "two"


def test_field_lookup_empty_model_and_raw_dump_path(tmp_path):
    class Empty:
        model_fields = {}

    assert _field_lookup(Empty) == {}
    path = _path(tmp_path, "before\n")
    _dump_atomic({}, path, 0o644, raw_text="raw: preserved\n")
    assert path.read_text() == "raw: preserved\n"


def test_file_lock_rejects_unsafe_directory_mode(tmp_path, monkeypatch):
    import os
    import tempfile

    import src.config.persistence as persistence

    unsafe_dir = tmp_path / f"odin-config-locks-{os.geteuid()}"
    unsafe_dir.mkdir(mode=0o755)
    os.chmod(unsafe_dir, 0o755)
    monkeypatch.setattr(tempfile, "gettempdir", lambda: str(tmp_path))
    with pytest.raises(ConfigPersistError, match="unsafe config lock directory"):
        persistence.patch_config_paths([(("x",), 1)], path=tmp_path / "target.yml")


def test_file_lock_rejects_wrong_lock_file_permissions(tmp_path, monkeypatch):
    import os
    import tempfile

    import src.config.persistence as persistence
    from src.config.migrations import _config_identity

    lockdir = tmp_path / f"odin-config-locks-{os.geteuid()}"
    lockdir.mkdir(mode=0o700)
    os.chmod(lockdir, 0o700)
    (lockdir / _config_identity(tmp_path / "target.yml")).write_text("unsafe")
    monkeypatch.setattr(tempfile, "gettempdir", lambda: str(tmp_path))
    with pytest.raises(ConfigPersistError, match="unsafe config lock file"):
        persistence.patch_config_paths([(("x",), 1)], path=tmp_path / "target.yml")


def test_delete_first_row_preserves_last_row_section_comment(tmp_path):
    from types import SimpleNamespace

    from src.config.persistence import _load_document

    path = _path(
        tmp_path,
        "outbound_webhooks:\n  targets:\n"
        "    - id: remove\n      name: Remove\n"
        "    - id: keep\n      name: Keep\n",
    )
    doc, _ = _load_document(path)
    doc["outbound_webhooks"]["targets"][1].ca.items["name"] = [
        None,
        None,
        SimpleNamespace(value="\n# trailing section comment\n"),
    ]
    patch_webhook_targets(
        [{"id": "keep", "name": "Keep"}],
        changed_fields={},
        delete_ids=["remove"],
        path=path,
    )
    assert yaml.safe_load(path.read_text())["outbound_webhooks"]["targets"] == [
        {"id": "keep", "name": "Keep"}
    ]


def test_webhook_comment_helpers_skip_empty_slots_and_transfer_comment_list(tmp_path):
    path = _path(
        tmp_path,
        "outbound_webhooks:\n  targets:\n"
        "    - id: remove\n      name: Remove # inline\n"
        "    - id: keep\n      name: Keep # inline\n      # trailing section comment\n",
    )
    patch_webhook_targets(
        [{"id": "keep", "name": "Keep"}],
        changed_fields={},
        delete_ids=["remove"],
        path=path,
    )
    assert yaml.safe_load(path.read_text())["outbound_webhooks"]["targets"] == [
        {"id": "keep", "name": "Keep"}
    ]


def test_patch_paths_empty_change_list_is_noop(tmp_path):
    _patch_config_paths([], path=tmp_path / "does-not-exist.yml")


def test_persist_config_paths_empty_change_list_is_noop():
    from src.config.persistence import persist_config_paths

    asyncio.run(persist_config_paths([]))


def test_webhook_list_merge_handles_scalar_legacy_entry(tmp_path):
    path = _path(tmp_path, "outbound_webhooks:\n  targets:\n    - scalar\n")
    _patch_config_paths(
        [(("outbound_webhooks", "targets"), [{"id": "new", "url": "https://new.invalid"}])],
        path=path,
    )
    assert yaml.safe_load(path.read_text())["outbound_webhooks"]["targets"] == [
        {"id": "new", "url": "https://new.invalid"}
    ]


def test_webhook_list_merge_recovers_legacy_row_by_url(tmp_path):
    path = _path(
        tmp_path,
        "outbound_webhooks:\n  targets:\n    - url: https://legacy.invalid\n      name: Old\n",
    )
    _patch_config_paths(
        [
            (
                ("outbound_webhooks", "targets"),
                [{"id": "assigned", "url": "https://legacy.invalid", "name": "New"}],
            )
        ],
        path=path,
    )
    row = yaml.safe_load(path.read_text())["outbound_webhooks"]["targets"][0]
    assert row == {"url": "https://legacy.invalid", "name": "New", "id": "assigned"}


def test_locked_async_wrapper_normalizes_model_dump_and_settles(tmp_path):
    class Row:
        def model_dump(self):
            return {"id": "one", "name": "One", "url": "https://one.invalid"}

    path = _path(tmp_path)
    outcome = asyncio.run(
        persist_webhook_targets_locked(
            [Row()], changed_fields={"one": (frozenset({"name"}), set())}, path=path
        )
    )
    assert outcome == (None, False)
    assert yaml.safe_load(path.read_text())["outbound_webhooks"]["targets"][0]["name"] == "One"


def test_locked_async_wrapper_normalizes_plain_changed_field_iterable(tmp_path):
    path = _path(tmp_path, "outbound_webhooks:\n  targets:\n    - id: one\n      name: Old\n")
    outcome = asyncio.run(
        persist_webhook_targets_locked(
            [{"id": "one", "name": "New"}], changed_fields={"one": ["name"]}, path=path
        )
    )
    assert outcome == (None, False)
    assert "name: New" in path.read_text()


def test_locked_async_wrapper_empty_is_noop(tmp_path):
    path = _path(tmp_path)
    assert asyncio.run(persist_webhook_targets_locked([], changed_fields={}, path=path)) == (
        None,
        False,
    )
