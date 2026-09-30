from types import SimpleNamespace

from src.monitoring.resource_usage import collect_session_stats
from src.sessions.manager import SessionManager


def test_real_session_manager_custom_persist_directory(tmp_path):
    directory = tmp_path / "custom" / "sessions"
    manager = SessionManager(max_history=50, max_age_hours=24, persist_dir=str(directory))
    payload = '{"session": "stored"}'
    (directory / "session.json").write_text(payload)
    stats = collect_session_stats(SimpleNamespace(sessions=manager))
    assert stats.persist_dir.path == str(directory)
    assert stats.persist_dir.file_count == 1
    assert stats.persist_dir.total_bytes == len(payload.encode())
