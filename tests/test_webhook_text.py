"""Source-span contract: edit only selected row syntax, never its neighbours."""

from __future__ import annotations

import pytest
import yaml

from src.config.persistence import ConfigPersistError, patch_webhook_targets
from src.config.webhook_text import WebhookTextPatch


def _save(tmp_path, text, *, rows=(), fields=None, deletes=()):
    path = tmp_path / "config.yml"
    path.write_bytes(text.encode())
    patch_webhook_targets(rows, changed_fields=fields or {}, delete_ids=deletes, path=path)
    return path.read_bytes().decode()


@pytest.mark.parametrize("newline", ["\n", "\r\n"])
@pytest.mark.parametrize("style", ["block", "flow"])
def test_update_changes_only_value_tokens_and_preserves_every_other_byte(tmp_path, newline, style):
    if style == "block":
        row = (
            "    - id: one  # id\n"
            "      name: 'Old' # name\n"
            '      url: "https://old.invalid/h" # url\n'
            "      events: [health, alert] # events\n"
            "      secret: ${SECRET}\n"
        )
    else:
        row = (
            "    - {id: one, name: 'Old', url: \"https://old.invalid/h\", "
            "events: [health, alert], secret: '${SECRET}'} # inline\n"
        )
    text = (
        "# header\nother: { x: 1, y: 'two' } # untouched\n"
        "outbound_webhooks:\n  targets:\n" + row
        + "\n# tail\nsecond: [a,b]\n"
    ).replace("\n", newline)
    result = _save(tmp_path, text, rows=[{
        "id": "one", "name": "New", "url": "https://new.invalid/h",
        "secret": "must-not-write", "events": ["alert"],
    }], fields={"one": {"name", "url", "events"}})
    assert result == text.replace("'Old'", "'New'").replace(
        '"https://old.invalid/h"', '"https://new.invalid/h"'
    ).replace("[health, alert]", "[alert]")


@pytest.mark.parametrize("layout", [
    "outbound_webhooks: {}\n",
    "outbound_webhooks:\n",
    "outbound_webhooks: null\n",
    "outbound_webhooks: {targets: []}\n",
    "outbound_webhooks:\n  targets: # inline\n",
    "outbound_webhooks:\n  targets: null # inline\n",
    "outbound_webhooks:\n  targets: [] # inline\n",
    "outbound_webhooks:\n  targets: [{id: old, url: https://old.invalid}]\n",
    "outbound_webhooks:\n  targets:\n  - id: old\n    url: https://old.invalid\n",
    "outbound_webhooks:\n  targets:\n    - id: old\n      events:\n",
    "outbound_webhooks:\n  targets:\n    - id: old\n      name: |-\n        long name\n",
])
def test_append_boundaries_with_null_flow_indentless_and_block_scalar(tmp_path, layout):
    tail = "\n# trailer\n# another\nother: yes\n"
    text = layout + tail
    result = _save(tmp_path, text, rows=[{"id": "new", "name": "New"}], fields={"new": {"name"}})
    assert result.endswith(tail)
    assert result.index("id: new") < result.index("# trailer")
    assert yaml.safe_load(result)["outbound_webhooks"]["targets"][-1] == {
        "id": "new", "name": "New",
    }
    if "# inline" in text:
        assert "# inline\n" in result


def test_append_to_no_final_newline(tmp_path):
    result = _save(tmp_path, "discord: {}", rows=[{"id": "new"}], fields={"new": {"id"}})
    assert result.startswith("discord: {}\noutbound_webhooks:\n")


def test_legacy_url_edit_adds_id_without_rewriting_neighbour(tmp_path):
    from src.config.persistence import _webhook_identity

    row = {"url": "https://old.invalid", "name": "Old"}
    ident = _webhook_identity(row, 0)
    text = (
        "outbound_webhooks:\n  targets:\n"
        "    - url: https://old.invalid # inline\n      name: 'Old'\n"
        "    # between\n    - {url: 'https://keep.invalid', name: Keep}\n\n# tail\n"
    )
    result = _save(tmp_path, text, rows=[{"id": ident, "url": "https://new.invalid"}],
                   fields={ident: {"url"}})
    assert "      name: 'Old'\n" in result
    assert result.endswith(text[text.index("    # between"):])
    assert yaml.safe_load(result)["outbound_webhooks"]["targets"][0] == {
        "id": ident, "url": "https://new.invalid", "name": "Old",
    }


def test_atomic_dumper_explicit_sequence_indent_remains_supported(tmp_path):
    from src.config.persistence import _dump_atomic

    path = tmp_path / "config.yml"
    path.write_text("before: true\n")
    _dump_atomic({"rows": [{"id": "one"}]}, path, 0o600, sequence_indent=4)
    assert path.read_text() == "rows:\n  - id: one\n"


@pytest.mark.parametrize("ids", [["one"], ["two"], ["three"], ["one", "two", "three"]])
def test_delete_flow_sequence_preserves_other_row_bytes(tmp_path, ids):
    row_text = {
        "one": "{id: one, name: 'One'}",
        "two": '{id: two, name: "Two"}',
        "three": "{id: three, name: Three}",
    }
    text = (
        "outbound_webhooks:\n  targets: [" + ", ".join(row_text.values()) + "] # inline\n\n# tail\n"
    )
    result = _save(tmp_path, text, deletes=ids)
    assert result.endswith("] # inline\n\n# tail\n")
    assert [row["id"] for row in yaml.safe_load(result)["outbound_webhooks"]["targets"]] == [
        ident for ident in row_text if ident not in ids
    ]
    for ident, original in row_text.items():
        if ident not in ids:
            assert original in result


@pytest.mark.parametrize("ident", ["one", "two"])
def test_flow_delete_uses_separator_token_not_comma_inside_comment(tmp_path, ident):
    text = (
        "outbound_webhooks:\n  targets: [\n"
        "    {id: one} # note, not a separator\n"
        "    , {id: two}\n  ]\n\n# tail\n"
    )
    result = _save(tmp_path, text, deletes=[ident])
    assert "# note, not a separator\n" in result
    assert result.endswith("\n# tail\n")
    assert yaml.safe_load(result)["outbound_webhooks"]["targets"] == [
        {"id": "two" if ident == "one" else "one"}
    ]


@pytest.mark.parametrize("row", ["    - {id: one}\n", "    - id: one\n"])
def test_add_missing_field_only_within_selected_row(tmp_path, row):
    text = "outbound_webhooks:\n  targets:\n" + row + "\n# tail\n"
    result = _save(tmp_path, text, rows=[{"id": "one", "name": "New"}], fields={"one": {"name"}})
    assert result.endswith("\n# tail\n")
    assert yaml.safe_load(result)["outbound_webhooks"]["targets"] == [{"id": "one", "name": "New"}]


@pytest.mark.parametrize("value", ["", "null", "|-\n        Old\n", ">-\n        Old\n"])
def test_replace_null_and_block_scalar_does_not_consume_trailer(tmp_path, value):
    text = "outbound_webhooks:\n  targets:\n    - id: one\n      name: " + value + "\n# tail\n"
    result = _save(
        tmp_path, text, rows=[{"id": "one", "name": "Line 1\nLine 2"}],
        fields={"one": {"name"}},
    )
    assert result.endswith("\n# tail\n")
    assert yaml.safe_load(result)["outbound_webhooks"]["targets"][0]["name"] == "Line 1\nLine 2"


@pytest.mark.parametrize("text", [
    "outbound_webhooks: &section\n  targets: []\ncopy: *section\n",
    "outbound_webhooks:\n  targets: &rows []\ncopy: *rows\n",
    "outbound_webhooks:\n  targets:\n    - &row {id: one}\n    - *row\n",
    "defaults: &defaults {targets: []}\noutbound_webhooks: *defaults\n",
    "defaults: &defaults {targets: []}\noutbound_webhooks:\n  <<: *defaults\n",
])
def test_shared_source_marks_fail_closed_without_writing(tmp_path, text):
    path = tmp_path / "config.yml"
    path.write_text(text)
    with pytest.raises(ConfigPersistError, match="anchored"):
        patch_webhook_targets([{"id": "new"}], changed_fields={"new": {"id"}}, path=path)
    assert path.read_text() == text


@pytest.mark.parametrize("corrupt", ["outbound_webhooks: [", "outbound_webhooks: {targets: []}\n"])
def test_reparse_mismatch_or_failure_prevents_commit(tmp_path, monkeypatch, corrupt):
    text = "outbound_webhooks:\n  targets: []\n# tail\n"
    path = tmp_path / "config.yml"
    path.write_text(text)

    def corrupt_edit(self, _row):
        self.text = corrupt

    monkeypatch.setattr(WebhookTextPatch, "append", corrupt_edit)
    with pytest.raises(ConfigPersistError, match="source edit"):
        patch_webhook_targets([{"id": "new"}], changed_fields={"new": {"id"}}, path=path)
    assert path.read_text() == text
