import json
from unittest.mock import AsyncMock

import pytest

from src.scheduler.scheduler import Scheduler


@pytest.mark.parametrize("trigger", [{"source": "grafana", "event": "alert"},
                                     {"alert_name": "cpu"},
                                     {"source": "github", "alert_name": ""}])
async def test_removed_triggers_load_inert_without_losing_other_schedules(tmp_path, trigger):
    path = tmp_path / "schedules.json"
    seed = Scheduler(str(path))
    legacy = await seed.add("legacy", "reminder", "1", trigger={"source": "github"})
    active = await seed.add("active", "reminder", "1", trigger={"source": "github"})
    seed._schedules[0]["trigger"] = trigger
    seed._save()
    original = path.read_bytes()
    scheduler = Scheduler(str(path))
    scheduler._callback = AsyncMock()
    records = scheduler.list_all()
    assert len(records) == 2
    assert records[0]["id"] == legacy["id"]
    assert records[0]["paused"]
    assert "removed" in records[0]["inert_reason"]
    assert records[0]["trigger"] == trigger
    assert path.read_bytes() == original
    assert await scheduler.fire_triggers("grafana", {"event": "alert"}) == 0
    assert await scheduler.fire_triggers("github", {}) == 1
    assert scheduler._callback.await_args.args[0]["id"] == active["id"]
    with pytest.raises(ValueError, match="removed"):
        await scheduler.run_now(legacy["id"])
    with pytest.raises(ValueError, match="removed"):
        await scheduler.update(legacy["id"], paused=False)
    repaired = await scheduler.update(legacy["id"], trigger={"source": "github"})
    assert not repaired.get("paused")
    assert not repaired.get("inert_reason")
    assert len(json.loads(path.read_text())) == 2
