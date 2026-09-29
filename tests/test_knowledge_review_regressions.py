"""Knowledge regressions through real ingest/import publication."""
import sys
from types import SimpleNamespace

import pytest

from src.knowledge.importer import BulkImporter
from src.knowledge.store import KnowledgeStore


@pytest.fixture
def store(tmp_path):
    store = KnowledgeStore(str(tmp_path / "knowledge.db"))
    yield store
    store.close()


@pytest.mark.asyncio
async def test_update_diff_uses_full_snapshot_not_overlapping_chunk_preview(store):
    original = "\n".join(f"Line {n}: unique paragraph " + "word " * 25 for n in range(100))
    changed = original.replace("Line 50:", "Changed 50:")
    await store.ingest(original, "long", dedup=False)
    assert store.get_source_content("long") != original
    await store.ingest(changed, "long", dedup=False)
    versions = store.get_versions("long")
    assert versions[0]["action"] == "update"
    assert versions[0]["diff_summary"] == "+1 lines, -1 lines"
    diff = store.get_version_diff("long", 1, 2)
    assert diff is not None
    assert store.get_source_snapshot("long") == changed


@pytest.mark.asyncio
async def test_legacy_update_discloses_missing_snapshot(store):
    await store.ingest("legacy content", "legacy", dedup=False)
    store._conn.execute("DELETE FROM knowledge_versions WHERE source='legacy'")
    store._conn.commit()
    await store.ingest("replacement", "legacy", dedup=False)
    version = store.get_versions("legacy")[0]
    assert version["action"] == "update"
    assert "snapshot unavailable" in version["diff_summary"]


@pytest.mark.asyncio
async def test_duplicate_sources_remain_lossless(store):
    names = ["first,source 雪", "second,é", "third"]
    for source in names:
        await store.ingest("identical body " * 150, source, dedup=False)
    groups = store.find_duplicates()
    assert len(groups) == 1
    assert set(groups[0]["sources"]) == set(names)
    assert groups[0]["source_count"] == 3


@pytest.mark.asyncio
async def test_pdf_basename_collisions_and_explicit_legacy_name(store, monkeypatch):
    async def fetch(url, **kwargs):
        return SimpleNamespace(status=200, body=url.encode())

    class Pdf:
        page_count = 1

        def __init__(self, content):
            self.content = content

        def __getitem__(self, index):
            return SimpleNamespace(get_text=lambda: self.content)

        def close(self):
            pass

    monkeypatch.setattr("src.tools.safe_fetch.safe_fetch", fetch)
    monkeypatch.setitem(sys.modules, "fitz", SimpleNamespace(
        open=lambda stream, filetype: Pdf(stream.decode())))
    importer = BulkImporter(store)
    urls = ["https://first.example/manual.pdf", "https://second.example/manual.pdf"]
    for url in urls:
        result = await importer.import_pdf_url(url)
        assert result.status == "ok"
        assert result.source == url
    assert all(url in store.get_source_snapshot(url) for url in urls)
    await store.ingest("legacy snapshot", "manual.pdf")
    replacement_url = "https://legacy.example/manual.pdf"
    result = await importer.import_pdf_url(replacement_url, source="manual.pdf")
    assert result.source == "manual.pdf"
    assert result.status == "ok"
    assert replacement_url in store.get_source_snapshot("manual.pdf")
    assert all(store.get_source_snapshot(url) for url in urls)
