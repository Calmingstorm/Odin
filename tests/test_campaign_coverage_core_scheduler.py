"""Scheduler HTTP transport and restart persistence using shaped inert clients."""
import json
from datetime import UTC, datetime, timedelta

import pytest

from src.scheduler import scheduler as module


class Response:
    def __init__(self, status, body):
        self.status = status
        self.body = body
        self.headers = {"Content-Type": "text/plain"}
        self.entered = False
        self.exited = False

    async def __aenter__(self):
        self.entered = True
        return self

    async def __aexit__(self, *exc):
        self.exited = True

    async def text(self):
        return self.body


class Session:
    def __init__(self, response):
        self.response = response
        self.closed = False
        self.requests = []

    def request(self, method, url, **kwargs):
        self.requests.append((method, url, kwargs))
        return self.response

    async def close(self):
        self.closed = True


@pytest.mark.parametrize("body,wire_key", [(None, None), ({"fixture": 1}, "json"),
                                         ([1, 2], "json"), (123, "data")])
async def test_webhook_serialization_bounded_response_and_session_cleanup(
    tmp_path, monkeypatch, body, wire_key
):
    response = Response(202, "x" * 5000)
    session = Session(response)
    monkeypatch.setattr(module.aiohttp, "ClientSession", lambda: session)
    scheduler = module.Scheduler(str(tmp_path / "schedules.json"))
    cfg = module.Scheduler._normalize_webhook_config({
        "url": "https://fixture.invalid/hook", "method": "put", "body": body,
        "headers": {"X-Fixture": "yes"}, "timeout": 7, "expected_status_codes": [202],
    })
    result = await scheduler._execute_webhook(cfg)
    assert result == {"status_code": 202, "body": "x" * 4096, "headers": response.headers}
    method, url, kwargs = session.requests[0]
    assert (method, url) == ("PUT", "https://fixture.invalid/hook")
    assert kwargs["timeout"].total == 7
    assert kwargs["headers"] == {"X-Fixture": "yes"}
    if wire_key:
        assert kwargs[wire_key] == (str(body) if wire_key == "data" else body)
    else:
        assert "json" not in kwargs and "data" not in kwargs
    assert response.entered and response.exited
    await scheduler.stop()
    assert session.closed


async def test_webhook_unexpected_status_releases_response_and_reuses_session(
    tmp_path, monkeypatch
):
    response = Response(503, "fixture unavailable")
    session = Session(response)
    scheduler = module.Scheduler(str(tmp_path / "schedules.json"))
    scheduler._http_session = session

    def no_new_session():
        raise AssertionError("existing HTTP session should be reused")

    monkeypatch.setattr(module.aiohttp, "ClientSession", no_new_session)
    with pytest.raises(RuntimeError, match="status 503, expected one of \\[200\\]"):
        await scheduler._execute_webhook({
            "url": "https://fixture.invalid", "expected_status_codes": [200],
        })
    assert response.exited
    assert not session.closed
    await scheduler.stop()


def test_restart_advances_stale_cron_but_preserves_config_until_publication(tmp_path):
    path = tmp_path / "schedules.json"
    past = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    raw = json.dumps([{"id": "fixture", "cron": "0 * * * *", "next_run": past}])
    path.write_text(raw)
    scheduler = module.Scheduler(str(path))
    next_run = datetime.fromisoformat(scheduler.list_all()[0]["next_run"])
    assert next_run > datetime.now(UTC)
    assert next_run.minute == next_run.second == 0
    assert path.read_text() == raw


def test_corrupt_restart_preserves_evidence_and_loads_empty_runtime(tmp_path):
    path = tmp_path / "schedules.json"
    path.write_text("{broken fixture")
    scheduler = module.Scheduler(str(path))
    assert scheduler.list_all() == []
    assert not path.exists()
    assert path.with_suffix(".json.corrupt").read_text() == "{broken fixture"


async def test_run_start_marker_survives_restart_and_quarantines_nonreplayable_check(tmp_path):
    path = tmp_path / "schedules.json"
    scheduler = module.Scheduler(str(path))
    schedule = await scheduler.add(
        description="fixture one-shot", run_at=(datetime.now(UTC) + timedelta(hours=1)).isoformat(),
        action="check", channel_id="fixture", tool_name="run_command",
        tool_input={"command": "printf fixture"},
    )
    await scheduler._mark_run_started(schedule)
    started = schedule["run_started_at"]
    assert json.loads(path.read_text())[0]["run_started_at"] == started
    restarted = module.Scheduler(str(path))
    restored = restarted.list_all()[0]
    assert restored["paused"]
    assert "completion was never recorded" in restored["inert_reason"]
    assert "run_started_at" not in restored


@pytest.mark.parametrize("available,reason,epoch", [(1, module.ConnectionReason.AVAILABLE, 0),
                                                   (True, "available", 0),
                                                   (True, module.ConnectionReason.AVAILABLE, True)])
def test_invalid_connection_snapshot_is_rejected(available, reason, epoch):
    with pytest.raises(TypeError, match="ConnectionAvailability requires"):
        module.ConnectionAvailability(available, reason, epoch)


def test_unknown_persisted_timezone_uses_future_utc_cron(caplog):
    next_run = datetime.fromisoformat(module._cron_next_run("0 * * * *", "Unknown/Fixture"))
    assert next_run.utcoffset() == timedelta(0)
    assert next_run > datetime.now(UTC)
    assert "evaluating cron in UTC" in caplog.text
    assert module._utc_iso(datetime(2026, 1, 1)) == "2026-01-01T00:00:00+00:00"
