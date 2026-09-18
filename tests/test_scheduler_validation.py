"""Coverage for src/scheduler/scheduler.py validation helpers (RFC-006 P12, safe).

Pure validation / normalization / trigger-matching logic — no loop is started,
no webhook HTTP is fired (_execute_webhook is deliberately left to the future
sandboxed round). The Scheduler is built against a tmp data file.
"""
from __future__ import annotations

import hashlib
import inspect

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

    @pytest.mark.parametrize("source", ["discord_reaction", "discord_message"])
    def test_removed_discord_sources_are_rejected(self, sched, source):
        with pytest.raises(ValueError, match="Invalid trigger source"):
            sched._validate_trigger({"source": source})


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
        # empty trigger with any source → matches (no conditions)
        assert m({}, "generic", {}) is True


class TestRemovedTriggerStoreCompatibility:
    @pytest.mark.parametrize("source", ["discord_reaction", "discord_message"])
    async def test_load_keeps_removed_source_visible_but_inert(self, tmp_path, source):
        path = tmp_path / "schedules.json"
        original = (
            '[{"id":"legacy","description":"old trigger","action":"reminder",'
            '"channel_id":"1","trigger":{"source":"' + source + '"},'
            '"one_time":false}]'
        )
        path.write_text(original)

        scheduler = Scheduler(data_path=str(path))

        loaded = scheduler.list_all()
        assert len(loaded) == 1
        assert loaded[0]["paused"] is True
        assert source in loaded[0]["inert_reason"]
        assert path.read_text() == original
        assert await scheduler.fire_triggers(source, {}) == 0

    async def test_inert_schedule_must_get_new_timing_before_resume(self, tmp_path):
        path = tmp_path / "schedules.json"
        path.write_text(
            '[{"id":"legacy","description":"old trigger","action":"reminder",'
            '"channel_id":"1","trigger":{"source":"discord_message"},'
            '"one_time":false}]'
        )
        scheduler = Scheduler(data_path=str(path))

        with pytest.raises(ValueError, match="was removed"):
            await scheduler.update("legacy", paused=False)
        with pytest.raises(ValueError, match="was removed"):
            await scheduler.run_now("legacy")

        updated = await scheduler.update("legacy", cron="0 * * * *", paused=False)
        assert updated is not None
        assert updated["paused"] is False
        assert "inert_reason" not in updated


class TestReportFormatPersistence:
    @staticmethod
    def _install_formats(scheduler: Scheduler) -> None:
        scheduler.set_known_report_formats_provider(lambda: ("paginated_embed_v1",))

    async def test_update_format_and_clear_survive_real_reload_round_trips(self, tmp_path):
        path = tmp_path / "schedules.json"
        scheduler = Scheduler(data_path=str(path))
        created = await scheduler.add(
            description="structured check", action="check", channel_id="1",
            cron="0 * * * *", tool_name="run_command",
            tool_input={"command": "status"})

        self._install_formats(scheduler)
        updated = await scheduler.update(
            created["id"], report_format="paginated_embed_v1")
        assert updated is not None
        assert updated["report_format"] == "paginated_embed_v1"

        reloaded = Scheduler(data_path=str(path))
        assert reloaded.list_all()[0]["report_format"] == "paginated_embed_v1"
        self._install_formats(reloaded)
        cleared = await reloaded.update(created["id"], report_format="")
        assert cleared is not None and "report_format" not in cleared

        cleared_reload = Scheduler(data_path=str(path))
        assert "report_format" not in cleared_reload.list_all()[0]

    async def test_unknown_format_and_absent_provider_fail_closed(self, tmp_path):
        scheduler = Scheduler(data_path=str(tmp_path / "schedules.json"))
        check = {
            "description": "check", "action": "check", "channel_id": "1",
            "cron": "0 * * * *", "tool_name": "run_command",
        }
        with pytest.raises(ValueError, match="No scheduled report formats are registered"):
            await scheduler.add(**check, report_format="paginated_embed_v1")

        self._install_formats(scheduler)
        with pytest.raises(ValueError, match="Unsupported scheduled report format"):
            await scheduler.add(**check, report_format="paginated_embed_v2")

    async def test_format_is_only_valid_for_checks_and_strings(self, tmp_path):
        scheduler = Scheduler(data_path=str(tmp_path / "schedules.json"))
        self._install_formats(scheduler)
        with pytest.raises(ValueError, match="only valid for 'check'"):
            await scheduler.add(
                description="reminder", action="reminder", channel_id="1",
                cron="0 * * * *", report_format="paginated_embed_v1")
        with pytest.raises(ValueError, match="must be a string"):
            await scheduler.add(
                description="check", action="check", channel_id="1",
                cron="0 * * * *", tool_name="run_command",
                report_format=123)  # type: ignore[arg-type]


class TestOldCodeRollbackTolerance:
    def test_v376_loader_and_saver_preserve_unknown_report_field(self, tmp_path):
        expected = {
            "_load": "3a68719075a2c6dfea5451b7f68cbb52c41455ecbf942260103fad385146871c",
            "_save": "b6286b474494df9d27d24ba0f66c7e36707faaa4f49c61d877f15446d73842dc",
        }
        for method, digest in expected.items():
            source = inspect.getsource(getattr(Scheduler, method)).encode()
            assert hashlib.sha256(source).hexdigest() == digest
        import json
        path = tmp_path / "schedules.json"
        original = {
            "id": "rollback", "description": "structured check", "action": "check",
            "channel_id": "1", "cron": "0 * * * *", "one_time": False,
            "next_run": "2999-01-01T00:00:00+00:00", "tool_name": "run_command",
            "tool_input": {"command": "status"},
            "report_format": "paginated_embed_v1",
        }
        path.write_text(json.dumps([original]))
        old_code_compatible = Scheduler(data_path=str(path))
        assert old_code_compatible.list_all()[0] == original
        old_code_compatible._save()
        assert json.loads(path.read_text())[0] == original
