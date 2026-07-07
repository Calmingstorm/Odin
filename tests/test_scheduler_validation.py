"""Coverage for src/scheduler/scheduler.py validation helpers (RFC-006 P12, safe).

Pure validation / normalization / trigger-matching logic — no loop is started,
no webhook HTTP is fired (_execute_webhook is deliberately left to the future
sandboxed round). The Scheduler is built against a tmp data file.
"""
from __future__ import annotations

import pytest

from src.scheduler.scheduler import (
    WEBHOOK_MAX_BODY_LEN,
    WEBHOOK_MAX_TIMEOUT,
    WEBHOOK_MAX_URL_LEN,
    Scheduler,
)


@pytest.fixture
def sched(tmp_path):
    return Scheduler(data_path=str(tmp_path / "schedules.json"))


class TestValidateTimezone:
    def test_valid_and_invalid(self, sched):
        sched._validate_timezone("UTC")  # no raise
        with pytest.raises(ValueError):
            sched._validate_timezone("")
        with pytest.raises(ValueError):
            sched._validate_timezone("Not/A_Zone")


class TestValidateTrigger:
    def test_shape_and_keys(self, sched):
        with pytest.raises(ValueError, match="must be a dict"):
            sched._validate_trigger("nope")
        with pytest.raises(ValueError, match="Unknown trigger keys"):
            sched._validate_trigger({"bogus_key": 1})
        with pytest.raises(ValueError, match="Invalid trigger source"):
            sched._validate_trigger({"source": "myspace"})
        with pytest.raises(ValueError, match="Trigger must have at least one"):
            sched._validate_trigger({})

    def test_regex_validation(self, sched):
        with pytest.raises(ValueError, match="under 200 characters"):
            sched._validate_trigger({"content_regex": "x" * 201})
        with pytest.raises(ValueError, match="Invalid content_regex"):
            sched._validate_trigger({"content_regex": "([unclosed"})
        sched._validate_trigger({"source": "gitea", "content_regex": "deploy.*"})  # valid


class TestValidateWebhookConfig:
    def test_all_branches(self, sched):
        v = sched._validate_webhook_config
        with pytest.raises(ValueError, match="must be a dict"):
            v("nope")
        with pytest.raises(ValueError, match="url is required"):
            v({})
        with pytest.raises(ValueError, match="exceeds maximum length"):
            v({"url": "http://" + "x" * (WEBHOOK_MAX_URL_LEN + 1)})
        with pytest.raises(ValueError, match="must start with http"):
            v({"url": "ftp://x"})
        with pytest.raises(ValueError, match="Invalid webhook method"):
            v({"url": "http://x", "method": "TELEPORT"})
        with pytest.raises(ValueError, match="headers must be a dict"):
            v({"url": "http://x", "headers": "no"})
        with pytest.raises(ValueError, match="keys and values must be strings"):
            v({"url": "http://x", "headers": {"k": 1}})
        with pytest.raises(ValueError, match="body exceeds"):
            v({"url": "http://x", "body": "b" * (WEBHOOK_MAX_BODY_LEN + 1)})
        with pytest.raises(ValueError, match="timeout must be a positive"):
            v({"url": "http://x", "timeout": 0})
        with pytest.raises(ValueError, match="timeout exceeds"):
            v({"url": "http://x", "timeout": WEBHOOK_MAX_TIMEOUT + 1})
        with pytest.raises(ValueError, match="must be a list"):
            v({"url": "http://x", "expected_status_codes": 200})
        with pytest.raises(ValueError, match="valid HTTP status"):
            v({"url": "http://x", "expected_status_codes": [999]})
        # a fully valid config raises nothing
        v({"url": "https://ok.test/hook", "method": "post", "headers": {"a": "b"},
           "body": "hi", "timeout": 10, "expected_status_codes": [200, 201]})

    def test_normalize_fills_defaults(self, sched):
        norm = sched._normalize_webhook_config({"url": "https://x"})
        assert norm["method"] == "POST" and norm["headers"] == {} and norm["timeout"] > 0


class TestTriggerMatches:
    def test_field_matching(self, sched):
        m = sched._trigger_matches
        # source mismatch → False
        assert m({"source": "gitea"}, "grafana", {}) is False
        # exact-match fields
        assert m({"event": "push"}, "gitea", {"event": "push"}) is True
        assert m({"event": "push"}, "gitea", {"event": "pull"}) is False
        # substring (case-insensitive) fields
        assert m({"repo": "Odin"}, "gitea", {"repo": "calmingstorm/odin"}) is True
        assert m({"alert_name": "cpu"}, "grafana", {"alert_name": "High CPU"}) is True
        # exact discord fields
        assert m({"emoji": "👍"}, "discord_reaction", {"emoji": "👍"}) is True
        assert m({"user_id": "u"}, "discord_reaction", {"user_id": "u"}) is True
        assert m({"channel_id": "c"}, "discord_message", {"channel_id": "c"}) is True
        assert m({"author_id": "a"}, "discord_message", {"author_id": "a"}) is True

    def test_content_matching(self, sched):
        m = sched._trigger_matches
        assert m({"content_contains": "deploy"}, "discord_message",
                 {"content": "please deploy now"}) is True
        assert m({"content_regex": r"deploy\s+prod"}, "discord_message",
                 {"content": "deploy prod"}) is True
        assert m({"starts_with": "!cmd"}, "discord_message",
                 {"content": "!cmd run"}) is True
        assert m({"equals": "exact"}, "discord_message", {"content": "exact"}) is True
        assert m({"equals": "exact"}, "discord_message", {"content": "not exact"}) is False
        # empty trigger with any source → matches (no conditions)
        assert m({}, "generic", {}) is True
