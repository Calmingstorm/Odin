"""#480/F6: real PDF importer/store compatibility with URL-less legacy sources.

Only network transport and PyMuPDF are faked; DB, FTS, snapshots, dedup and
publication use the real code. Historical imports never retained the URL.
"""
import sys
from types import SimpleNamespace

import pytest

from src.knowledge.importer import BulkImporter
from src.knowledge.store import KnowledgeStore
from src.search.fts import FullTextIndex
from src.tools.safe_fetch import SafeFetchResponse


@pytest.fixture
def stores(tmp_path):
    fts = FullTextIndex(str(tmp_path / "fts.db"))
    store = KnowledgeStore(str(tmp_path / "knowledge.db"), fts_index=fts)
    yield store, fts
    store.close()
    fts._conn.close()


@pytest.fixture
def pdfs(monkeypatch):
    bodies = {}
    documents = []

    async def fetch(url, **kwargs):
        return SafeFetchResponse(200, {}, bodies[url].encode(), "application/pdf", url, "")

    class Pdf:
        page_count = 1

        def __init__(self, stream):
            self.text = stream.decode()
            self.closed = False

        def __getitem__(self, index):
            assert index == 0
            return SimpleNamespace(get_text=lambda: self.text)

        def close(self):
            self.closed = True

    def open_pdf(*, stream, filetype):
        assert filetype == "pdf"
        doc = Pdf(stream)
        documents.append(doc)
        return doc

    monkeypatch.setattr("src.tools.safe_fetch.safe_fetch", fetch)
    monkeypatch.setitem(sys.modules, "fitz", SimpleNamespace(open=open_pdf))
    yield bodies
    assert all(doc.closed for doc in documents)


async def seed_legacy(store, url, text):
    # This is exactly the historical default naming and extracted-content shape.
    source = url.rsplit("/", 1)[-1] or url
    content = f"## Page 1\n{text}"
    assert (await store.ingest(content, source, uploader="bulk-import")).status == "stored"
    return source, content


@pytest.mark.asyncio
@pytest.mark.parametrize("suffix", ["manual.pdf", "manual.pdf?revision=1", "manual.pdf#page=2"])
async def test_same_url_unchanged_reuses_legacy_without_duplicate_or_version(stores, pdfs, suffix):
    store, fts = stores
    url = f"https://legacy.example/docs/{suffix}"
    pdfs[url] = "Original legacy manual text"
    legacy, content = await seed_legacy(store, url, pdfs[url])
    before_versions = store.get_versions(legacy)
    before_rows = fts.get_knowledge_source_rows(legacy)

    result = await BulkImporter(store).import_pdf_url(url)

    assert result.source == legacy
    assert result.status == "ok"
    assert result.outcome == "unchanged"
    assert result.chunks > 0
    assert "without assuming its original URL" in result.note
    assert [entry["source"] for entry in store.list_sources()] == [legacy]
    assert store.get_source_snapshot(legacy) == content
    assert store.get_versions(legacy) == before_versions
    assert fts.get_knowledge_source_rows(legacy) == before_rows


@pytest.mark.asyncio
@pytest.mark.parametrize("host", ["legacy.example", "unrelated.example"])
async def test_changed_or_unrelated_basename_never_overwrites_or_duplicates(stores, pdfs, host):
    store, fts = stores
    legacy, content = await seed_legacy(
        store, "https://legacy.example/manual.pdf", "Old manual body",
    )
    url = f"https://{host}/manual.pdf"
    pdfs[url] = "New independently fetched body"
    versions = store.get_versions(legacy)
    rows = fts.get_knowledge_source_rows(legacy)

    result = await BulkImporter(store).import_pdf_url(url)

    assert result.status == "error"
    assert result.outcome == "conflict"
    assert result.source == url
    assert "original URL was not recorded" in result.error
    assert "source='manual.pdf'" in result.error
    assert f"source='{url}'" in result.error
    assert store.get_source_snapshot(legacy) == content
    assert store.get_source_snapshot(url) is None
    assert store.get_versions(legacy) == versions
    assert fts.get_knowledge_source_rows(legacy) == rows


@pytest.mark.asyncio
async def test_identical_unrelated_url_does_not_claim_legacy_ownership(stores, pdfs):
    store, _ = stores
    legacy, content = await seed_legacy(
        store, "https://legacy.example/manual.pdf", "Shared public manual text",
    )
    url = "https://unrelated.example/manual.pdf"
    pdfs[url] = "Shared public manual text"
    result = await BulkImporter(store).import_pdf_url(url)
    assert result.outcome == "unchanged"
    assert result.source == legacy
    assert "without assuming its original URL" in result.note
    assert store.get_source_snapshot(legacy) == content
    # Identical text is not proof that this URL may replace future legacy text.
    pdfs[url] = "Unrelated update that must not own the old document"
    changed = await BulkImporter(store).import_pdf_url(url)
    assert changed.outcome == "conflict"
    assert store.get_source_snapshot(legacy) == content


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "damage", ["missing_snapshot", "stale_snapshot", "missing_fts", "case_only"],
)
async def test_hash_or_preview_alone_is_not_safe_legacy_compatibility(stores, pdfs, damage):
    store, fts = stores
    url = "https://legacy.example/manual.pdf"
    pdfs[url] = "Legacy manual text"
    legacy, _ = await seed_legacy(store, url, pdfs[url])
    if damage == "missing_snapshot":
        store._conn.execute("DELETE FROM knowledge_versions WHERE source=?", (legacy,))
        store._conn.commit()
    elif damage == "stale_snapshot":
        store._conn.execute(
            "UPDATE knowledge_versions SET content='unrelated stale text' WHERE source=?",
            (legacy,),
        )
        store._conn.commit()
    elif damage == "missing_fts":
        assert fts.replace_knowledge_source(legacy, [])
    else:
        pdfs[url] = "LEGACY MANUAL TEXT"
    rows = store.get_source_chunks(legacy)
    fts_rows = fts.get_knowledge_source_rows(legacy)
    versions = store.get_versions(legacy)

    result = await BulkImporter(store).import_pdf_url(url)

    assert result.status == "error"
    assert result.outcome == "conflict"
    assert store.get_source_chunks(legacy) == rows
    assert fts.get_knowledge_source_rows(legacy) == fts_rows
    assert store.get_versions(legacy) == versions
    assert store.get_source_snapshot(url) is None


@pytest.mark.asyncio
async def test_explicit_legacy_source_updates_with_history(stores, pdfs):
    store, fts = stores
    url = "https://legacy.example/manual.pdf"
    legacy, old_content = await seed_legacy(store, url, "Original old manual")
    pdfs[url] = "Replacement manual with new content"
    result = await BulkImporter(store).import_pdf_url(url, source=legacy)
    assert result.status == "ok"
    assert result.source == legacy
    assert result.outcome == "stored"
    assert store.get_source_snapshot(legacy) != old_content
    assert store.get_versions(legacy)[0]["action"] == "update"
    assert store.get_versions(legacy)[0]["version"] == 2
    assert fts.get_knowledge_source_rows(legacy)
    assert store.get_source_snapshot(url) is None


@pytest.mark.asyncio
async def test_explicit_full_url_imports_separately_and_then_defaults_update_it(stores, pdfs):
    store, _ = stores
    legacy, old_content = await seed_legacy(
        store, "https://legacy.example/manual.pdf", "Original old manual",
    )
    url = "https://unrelated.example/manual.pdf"
    pdfs[url] = "New separate document"
    importer = BulkImporter(store)
    separate = await importer.import_pdf_url(url, source=url)
    assert separate.status == "ok"
    assert separate.source == url
    pdfs[url] = "Later changed independent document"
    updated = await importer.import_pdf_url(url)
    assert updated.status == "ok"
    assert updated.source == url
    assert store.get_source_snapshot(url) == f"## Page 1\n{pdfs[url]}"
    assert store.get_versions(url)[0]["action"] == "update"
    assert store.get_source_snapshot(legacy) == old_content


@pytest.mark.asyncio
async def test_fresh_default_full_url_identity_preserves_hosts_paths_and_queries(stores, pdfs):
    store, _ = stores
    urls = [
        "https://first.example/a/manual.pdf?revision=1",
        "https://first.example/b/manual.pdf?revision=1",
        "https://second.example/a/manual.pdf?revision=1",
        "https://first.example/a/manual.pdf?revision=2#page=3",
    ]
    for index, url in enumerate(urls):
        pdfs[url] = f"Independent document {index}"
        result = await BulkImporter(store).import_pdf_url(url)
        assert result.status == "ok"
        assert result.source == url.split("#", 1)[0]
    assert {entry["source"] for entry in store.list_sources()} == {
        url.split("#", 1)[0] for url in urls
    }
