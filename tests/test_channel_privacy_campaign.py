from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

import discord
from src.credential_redaction import REDACTED_CREDENTIAL
from src.discord.channel_logger import ChannelLogger
from src.discord.intake_pipeline import MessageIntake
from src.search.fts import FullTextIndex


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["user", "own", "bot", "dm"])
@pytest.mark.parametrize("failure", [False, True])
@pytest.mark.parametrize("secret", ["sk-" + "S" * 25, "password=syntheticvalue",
                                    "xoxb-synthetic-example", "my password is syntheticvalue"])
async def test_ingress_redacts_before_jsonl_and_real_fts(tmp_path, kind, failure, secret):
    logger = ChannelLogger(tmp_path)
    index = FullTextIndex(":memory:")
    me = SimpleNamespace(id=1, bot=True, mention="@self")
    msg = SimpleNamespace(
        id=7, content=secret, author=me if kind == "own" else SimpleNamespace(
            id=2, bot=kind == "bot", mention="@author"),
        channel=SimpleNamespace(id=42, guild=None if kind == "dm" else SimpleNamespace(id=9),
                                send=AsyncMock()),
        created_at=datetime.now(UTC), attachments=[], delete=AsyncMock(),
    )
    if failure:
        msg.delete.side_effect = discord.Forbidden(
            SimpleNamespace(status=403, reason="denied"), "x",
        )
    intake = MessageIntake(SimpleNamespace(
        get_config=MagicMock(), get_user=lambda: me, process_commands=AsyncMock(),
        channel_logger=logger, channel_config=MagicMock(), channel_state=MagicMock(),
        sessions=MagicMock(), pipeline=MagicMock(),
    ))
    await intake.handle(msg)
    logger.index_to_fts(index)
    if kind == "dm":
        assert not list(tmp_path.glob("*.jsonl"))
    else:
        text = (tmp_path / "42.jsonl").read_text()
        assert secret not in text
        assert REDACTED_CREDENTIAL in text
        rows = index._conn.execute("SELECT content FROM channel_log_fts").fetchall()
        assert rows == [(REDACTED_CREDENTIAL,)]
    index._conn.close()


def test_writer_defense_and_new_identity_only_removal(tmp_path):
    logger = ChannelLogger(tmp_path)
    msg = SimpleNamespace(id=8, content="password=syntheticvalue", author=None,
                          channel=SimpleNamespace(id=42, guild=SimpleNamespace(id=9)))
    logger.log_message(msg)
    assert "syntheticvalue" not in (tmp_path / "42.jsonl").read_text()
    index = FullTextIndex(":memory:")
    index.index_channel_messages([
        {"content": "legacy preserved", "channel_id": "42"},
        {"content": "new derived", "channel_id": "42", "message_id": "8"},
    ])
    assert index.remove_channel_message("42", "8")
    assert index._conn.execute("SELECT content FROM channel_log_fts").fetchall() == [
        ("legacy preserved",),
    ]
    index._conn.close()


def test_author_metadata_uses_same_ingress_redaction(tmp_path):
    secret = "sk-" + "Z" * 25
    logger = ChannelLogger(tmp_path)
    msg = SimpleNamespace(id=99, content="body", author=SimpleNamespace(
        id=7, display_name=secret, bot=True),
        channel=SimpleNamespace(id=42, guild=SimpleNamespace(id=9)))
    logger.log_message(msg)
    assert secret not in (tmp_path / "42.jsonl").read_text()
    index = FullTextIndex(":memory:")
    assert logger.index_to_fts(index) == 1
    index.index_channel_messages([{"content": "direct", "author": secret}])
    assert index._conn.execute("SELECT author FROM channel_log_fts").fetchall() == [
        (REDACTED_CREDENTIAL,), (REDACTED_CREDENTIAL,),
    ]
    index._conn.close()


def test_exact_identity_delete_preserves_legacy_and_other_channel_and_rolls_back():
    index = FullTextIndex(":memory:")
    index.index_channel_messages([
        {"content": "same content", "channel_id": "42"},
        {"content": "same content", "channel_id": "42", "message_id": "8"},
        {"content": "same content", "channel_id": "43", "message_id": "8"},
        {"content": "same content", "channel_id": "42", "message_id": "9"},
    ])
    before = index._conn.execute("SELECT rowid, * FROM channel_log_fts").fetchall()
    index._conn.execute("CREATE TRIGGER fail_delete BEFORE DELETE ON channel_log_identity "
                        "BEGIN SELECT RAISE(ABORT, 'injected failure'); END")
    assert not index.remove_channel_message("42", "8")
    assert index._conn.execute("SELECT rowid, * FROM channel_log_fts").fetchall() == before
    index._conn.execute("DROP TRIGGER fail_delete")
    assert index.remove_channel_message("42", "missing")
    assert index._conn.execute("SELECT rowid, * FROM channel_log_fts").fetchall() == before
    assert index.remove_channel_message("42", "8")
    assert index._conn.execute("SELECT rowid, * FROM channel_log_fts").fetchall() == [
        before[0], before[2], before[3],
    ]
    index._conn.close()
