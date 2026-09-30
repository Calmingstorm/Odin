import json

from src.discord.channel_logger import ChannelLogger


def test_cross_channel_fallback_returns_newest_independent_of_file_order(tmp_path):
    logger = ChannelLogger(str(tmp_path))
    for channel, timestamp, author in [("old", 1, "alice"), ("new", 200, "alice"),
                                       ("private", 300, "bob")]:
        (tmp_path / f"{channel}.jsonl").write_text(json.dumps({
            "content": "needle", "channel_id": channel, "ts": timestamp,
            "author_id": author, "author": author,
        }) + "\n")
    assert logger.search("needle", 1)[0]["channel_id"] == "private"
    assert logger.search("needle", 1, author_id="alice")[0]["channel_id"] == "new"
    assert logger.search("needle", 1, accept=lambda r: r["ts"] < 300)[0]["channel_id"] == "new"
    assert logger.search("needle", 1, channel_id="old")[0]["channel_id"] == "old"
    assert logger.search("needle", 0) == []
