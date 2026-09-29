import sqlite3
from types import SimpleNamespace

from src.health.startup import check_knowledge_db


def test_knowledge_diagnostic_rejects_corrupt_existing_database(tmp_path):
    path = tmp_path / "knowledge.db"
    path.write_bytes(b"not a SQLite database")
    cfg = SimpleNamespace(enabled=True, search_db_path=str(tmp_path))
    result = check_knowledge_db(cfg)
    assert not result.passed
    assert "SQLite cannot open knowledge DB" in result.detail
    assert path.read_bytes() == b"not a SQLite database"


def test_knowledge_diagnostic_accepts_first_run_and_valid_schema(tmp_path):
    cfg = SimpleNamespace(enabled=True, search_db_path=str(tmp_path))
    assert check_knowledge_db(cfg).passed
    conn = sqlite3.connect(tmp_path / "knowledge.db")
    try:
        conn.execute("CREATE TABLE chunks (id INTEGER PRIMARY KEY, content TEXT)")
        conn.commit()
    finally:
        conn.close()
    assert check_knowledge_db(cfg).passed
