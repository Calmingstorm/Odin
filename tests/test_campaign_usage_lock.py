import sqlite3
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

import pytest

from src.usage.rollup import UsageRollup


@pytest.mark.parametrize("failure", ["open", "pragma"])
def test_failed_ingestion_releases_lock_for_other_worker(tmp_path, monkeypatch, failure):
    rollup = UsageRollup(str(tmp_path / "usage"), trajectory_directory=str(tmp_path / "turns"),
                         agent_trajectory_directory=str(tmp_path / "agents"), audit=None)
    real_connect = sqlite3.connect
    closed = []

    class BrokenPragmaConnection:
        def execute(self, sql):
            raise sqlite3.OperationalError("injected pragma failure")

        def close(self):
            closed.append(True)

    def failing_connect(*args, **kwargs):
        if failure == "open":
            raise sqlite3.OperationalError("injected open failure")
        return BrokenPragmaConnection()

    record = {"message_id": "m1", "channel_id": "c1", "source": "discord",
              "timestamp": datetime.now(UTC).isoformat(), "iterations": []}
    monkeypatch.setattr("src.usage.rollup.sqlite3.connect", failing_connect)
    with ThreadPoolExecutor(max_workers=1) as executor:
        with pytest.raises(sqlite3.OperationalError):
            executor.submit(rollup._ingest_trajectory, record, "turn").result(timeout=5)
        # Deliberately a different thread from the original owner: RLock's
        # reentrancy would otherwise conceal the leak.
        assert rollup._lock.acquire(timeout=1)
        rollup._lock.release()
        monkeypatch.setattr("src.usage.rollup.sqlite3.connect", real_connect)
        assert executor.submit(rollup._ingest_trajectory, record, "turn").result(timeout=5)
    assert bool(closed) == (failure == "pragma")
