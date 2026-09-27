"""Synthetic torn-file and reconciliation edge cases for channel indexing."""

import json

from src.discord.channel_logger import ChannelLogger
from src.search.fts import FullTextIndex


def _record(identity, content):
    return json.dumps({"log_identity": identity, "message_id": "", "content": content})


def test_initial_index_does_not_consume_torn_final_record(tmp_path):
    logger = ChannelLogger(tmp_path)
    path = tmp_path / "42.jsonl"
    path.write_text(_record("complete", "first") + "\n" + _record("torn", "unfinished"),
                    encoding="utf-8")
    fts = FullTextIndex(":memory:")

    assert logger.index_to_fts(fts) == 1
    assert logger.index_to_fts(fts) == 0
    with path.open("a", encoding="utf-8") as stream:
        stream.write("\n")
    assert logger.index_to_fts(fts) == 1


def test_legacy_record_gets_deterministic_identity_and_message_id(tmp_path):
    logger = ChannelLogger(tmp_path)
    path = tmp_path / "legacy.jsonl"
    line = json.dumps({"content": "legacy body", "message_id": ""})
    path.write_text(line + "\n", encoding="utf-8")
    first = logger._index_record(path, 0, line)
    again = logger._index_record(path, 0, line)

    assert first == again
    assert first["log_identity"].startswith("legacy:")
    assert first["message_id"] == first["log_identity"]
    assert logger._index_record(path, 0, "[]") is None
    assert logger._index_record(path, 0, "{") is None
