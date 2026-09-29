"""Requester-first explicit resume lookup through the real persisted store."""
import time
from types import SimpleNamespace

from src.turn_state import TurnKey, TurnStatus
from tests.fakes import text_response
from tests.test_resume_admission import Harness, heal_capacity, resume_msg, suspend_turn


async def test_explicit_resume_selects_callers_older_work_not_other_newest(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    harness = Harness([], tmp_path)
    keys = []
    for message_id, user in [("1", "alice"), ("2", "bob"), ("3", "alice")]:
        key = TurnKey(source="discord", channel_id="42", message_id=message_id)
        lease, disposition = harness.store.admit_turn_sync(
            key, guild_id=None, user_id=user, content_digest=None, code_version=None,
            prompt_policy_hash=None, tool_catalog_hash=None, session_snapshot=None,
        )
        assert disposition == "admitted"
        harness.store.suspend_sync(lease, {})
        keys.append(key)
    # Bob is newest overall; Alice's most recent owned work must win.
    harness.store._conn.execute(
        "UPDATE turns SET suspended_at=? WHERE message_id='2'", [time.time() + 10])
    harness.store._conn.commit()
    captured = []

    async def resume(message, summary):
        captured.append(summary)
        return "resumed", False, False, [], False

    harness.manager._explicit_resume_recognized = resume
    message = SimpleNamespace(content="resume", channel=SimpleNamespace(id="42"),
                              author=SimpleNamespace(id="alice"))
    result = await harness.manager.try_explicit_resume(message)
    assert result[0] == "resumed"
    assert captured[0]["message_id"] == "3"
    assert captured[0]["user_id"] == "alice"
    harness.store.close()


async def test_owned_older_payload_actually_resumes_through_runner(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    harness, original = await suspend_turn(tmp_path)
    other_key = TurnKey("discord", str(original.channel.id), "other-message")
    lease, disposition = harness.store.admit_turn_sync(
        other_key, guild_id=None, user_id="999999", content_digest=None, code_version=None,
        prompt_policy_hash=None, tool_catalog_hash=None, session_snapshot=None,
    )
    assert disposition == "admitted"
    harness.store.suspend_sync(lease, {})
    heal_capacity(harness, text_response("Finished preserved work."))
    result = await harness.manager.try_explicit_resume(resume_msg(original))
    assert result is not None
    assert result[0] == "Finished preserved work."
    assert result[2] is False
    assert result[3] == ["parse_time"]
    assert harness.store.turn_status_sync(other_key) == TurnStatus.SUSPENDED
    assert harness.store._conn.execute("SELECT COUNT(*) FROM operations").fetchone()[0] == 1
    harness.store.close()
