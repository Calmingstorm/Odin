"""Checkpoint coverage for opaque MCP media evidence.

These tests deliberately use the real private SQLite store and delivery
renderers.  A cursor is evidence, not authority, and base64 pages are not a
file transport that may quietly change byte offsets because somebody thought
string concatenation was close enough.
"""

from __future__ import annotations

import base64
import hashlib
import json
import sqlite3
from contextlib import contextmanager
from types import SimpleNamespace

import pytest

from src.config.schema import ToolHost, ToolsConfig
from src.tools.executor import ToolExecutor
from src.tools.mcp.client import _render_tool_result
from src.tools.media_result import BinaryAttachment
from src.tools.output_delivery import render_page
from src.tools.output_retention import OutputStore, RetentionError
from src.tools.result_validator import ToolResult
from src.tools.runtime_delivery import deliver_runtime_result, execution_delivery_scope


def store_at(tmp_path, **kwargs):
    return OutputStore(tmp_path / "mcp-media.sqlite3", **kwargs)


def attachment(index, data, *, kind="resource", media_type="application/octet-stream"):
    return BinaryAttachment(index, kind, media_type, data)


def read(store, cursor, *, owner="reader", channel="channel", authorize=lambda *_: True):
    return store.read(cursor, owner=owner, channel=channel, authorize=authorize)


def manifest_and_blobs(store, attachments, *, status="succeeded", hosts=()):
    manifest = store.retain_binary_bundle(
        attachments, owner="reader", channel="channel", tool="mcp_fixture_blob",
        hosts=hosts, status=status,
    )
    snapshot, offset = read(store, f"{manifest.result_id}:0")
    assert offset == 0
    rendered = json.loads(render_page(snapshot, offset=offset, initial=True))
    assert rendered["kind"] == "tool_output"
    listed = json.loads(snapshot.text)["attachments"]
    return manifest, listed


def reconstruct_binary(store, cursor):
    """Read every attachment page twice and prove cursors are non-consuming."""
    pages = []
    for _ in range(2):
        current = cursor
        expected_start = 0
        rebuilt = b""
        while current:
            snapshot, offset = read(store, current)
            raw = render_page(snapshot, offset=offset, budget=12000, limit=31)
            page = json.loads(raw)
            assert page["kind"] == "tool_attachment_page"
            assert page["offset_unit"] == "bytes"
            assert page["start"] == expected_start
            assert page["end"] >= page["start"]
            assert len(page["data_base64"]) <= 31
            assert page["total_bytes"] == len(snapshot.data)
            assert page["sha256"] == hashlib.sha256(snapshot.data).hexdigest()
            assert page["media_type"] == snapshot.media_type
            decoded = base64.b64decode(page["data_base64"], validate=True)
            assert len(decoded) == page["end"] - page["start"]
            rebuilt += decoded
            expected_start = page["end"]
            current = page["cursor"]
        pages.append(rebuilt)
    assert pages[0] == pages[1]
    return pages[0]


def executor_at(tmp_path):
    executor = ToolExecutor(ToolsConfig(
        local_working_dir=str(tmp_path / "workspace"),
        audit_log_path=str(tmp_path / "data" / "audit.jsonl"),
        hosts={"bound": ToolHost(address="127.0.0.1")},
    ))
    executor._protected_roots = lambda: [str(tmp_path / "protected")]
    return executor


def test_mcp_media_parser_preserves_opaque_binary_content_in_order():
    png = b"\x89PNG\r\n\x1a\nfixture"
    audio = b"\x00\xff\x10audio\x00"
    resource = b"\x00resource\xff"
    images, attachments = [], []
    text, is_error = _render_tool_result({"content": [
        {"type": "text", "text": "before"},
        {"type": "image", "mimeType": "image/png",
         "data": base64.b64encode(png).decode()},
        {"type": "audio", "mimeType": "audio/ogg",
         "data": base64.b64encode(audio).decode()},
        {"type": "resource", "resource": {"uri": "urn:fixture",
         "mimeType": "application/octet-stream", "blob": base64.b64encode(resource).decode()}},
        {"type": "text", "text": "after"},
    ]}, images=images, attachments=attachments)

    assert not is_error
    assert [item.content_index for item in attachments] == [2, 3, 4]
    assert [item.kind for item in attachments] == ["image", "audio", "resource"]
    assert [item.data for item in attachments] == [png, audio, resource]
    assert len(images) == 1 and images[0]["source"]["media_type"] == "image/png"
    assert base64.b64encode(audio).decode() not in text
    assert "before" in text and "after" in text


def test_binary_pages_reconstruct_byte_faithfully_repeatably_including_empty_file(tmp_path):
    payload = bytes(range(256)) * 17 + b"\x00\xfftail"
    _, listed = manifest_and_blobs(store_at(tmp_path), [
        attachment(1, payload, kind="audio", media_type="audio/ogg"),
        attachment(2, b"", kind="resource", media_type="application/x-empty"),
    ])
    store = store_at(tmp_path)

    assert len(listed) == 2
    for expected, metadata in zip((payload, b""), listed, strict=True):
        retrieval = metadata["retrieval"]["arguments"]
        rebuilt = reconstruct_binary(store, retrieval["cursor"])
        assert rebuilt == expected
        assert metadata["total_bytes"] == len(expected)
        assert metadata["sha256"] == hashlib.sha256(expected).hexdigest()


def test_binary_retention_scope_denials_recheck_requester_channel_and_permission(tmp_path):
    store = store_at(tmp_path)
    _, listed = manifest_and_blobs(store, [attachment(1, b"private")])
    cursor = listed[0]["retrieval"]["arguments"]["cursor"]

    for kwargs in (
        {"owner": "other"},
        {"channel": "elsewhere"},
        {"authorize": lambda *_: False},
    ):
        with pytest.raises(RetentionError, match="Permission denied"):
            read(store, cursor, **kwargs)


def test_denied_read_never_selects_blob_body_and_database_is_private(tmp_path, monkeypatch):
    store = store_at(tmp_path)
    manifest, listed = manifest_and_blobs(store, [attachment(1, b"private")])
    assert store.path.stat().st_mode & 0o777 == 0o600
    queries = []
    original = store._db

    @contextmanager
    def traced_db():
        with original() as db:
            db.set_trace_callback(queries.append)
            yield db

    monkeypatch.setattr(store, "_db", traced_db)
    for cursor in (f"{manifest.result_id}:0", listed[0]["retrieval"]["arguments"]["cursor"]):
        for denied in ({"owner": "stranger"}, {"channel": "stranger"},
                       {"authorize": lambda *_: False}):
            with pytest.raises(RetentionError, match="Permission denied"):
                read(store, cursor, **denied)
    assert not any("SELECT *" in query.upper() for query in queries)


def test_sql_failure_mid_bundle_rolls_back_every_blob_and_manifest(tmp_path):
    store = store_at(tmp_path)
    with store._db() as db:
        db.execute("""CREATE TRIGGER reject_second BEFORE INSERT ON output_blobs
                      WHEN NEW.content_index = 2
                      BEGIN SELECT RAISE(ABORT, 'fixture write failure'); END""")
    with pytest.raises(sqlite3.IntegrityError, match="fixture write failure"):
        manifest_and_blobs(store, [attachment(1, b"first"), attachment(2, b"second")])
    with sqlite3.connect(store.path) as db:
        assert db.execute("SELECT count(*) FROM output_blobs").fetchone()[0] == 0
        assert db.execute("SELECT count(*) FROM outputs").fetchone()[0] == 0


@pytest.mark.parametrize("count,size", [(0, 0), (65, 0), (2, 33)])
def test_binary_admission_rejects_count_and_decoded_bundle_limits(tmp_path, count, size):
    store = store_at(tmp_path, per_result_bytes=64)
    with pytest.raises(RetentionError):
        manifest_and_blobs(store, [attachment(i, b"x" * size) for i in range(count)])
    with store._db() as db:
        assert db.execute("SELECT count(*) FROM output_blobs").fetchone()[0] == 0
        assert db.execute("SELECT count(*) FROM outputs").fetchone()[0] == 0


async def test_binary_cursor_rechecks_credential_and_host_binding_revocation(tmp_path):
    executor = executor_at(tmp_path)
    target = executor.host_registry.get("bound")
    from src.tools.output_authorization import host_binding, request_tool_scope

    # Store a captured runtime binding directly, then retrieve through the real
    # executor authorization gate.  It proves revocation happens before blob
    # body loading, rather than merely at capture time.
    manifest = executor._ensure_output_store().retain_binary_bundle(
        [attachment(1, b"host-bound")], owner="reader", channel="channel",
        tool="run_command", hosts=(host_binding(target),),
    )
    manifest_snapshot, _ = read(executor._ensure_output_store(), f"{manifest.result_id}:0")
    reference = json.loads(manifest_snapshot.text)["attachments"][0]
    cursor = reference["retrieval"]["arguments"]["cursor"]

    async def retrieve():
        return await executor.execute("get_tool_output", {"cursor": cursor}, user_id="reader")

    with execution_delivery_scope(
        "reader", "channel", allowed_tools={"run_command", "get_tool_output"},
    ):
        assert (await retrieve()).ok
        # Revoking either originating tool or the retrieval tool must deny.
        for allowed in ({"run_command"}, {"get_tool_output"}):
            credential = request_tool_scope.set(allowed)
            try:
                denied = await retrieve()
                assert not denied.ok and "Permission denied" in denied.output
            finally:
                request_tool_scope.reset(credential)

        original_get = executor.host_registry.get
        executor.host_registry.get = lambda *args, **kwargs: SimpleNamespace(
            alias="bound", runtime_key="revoked-generation")
        try:
            denied = await retrieve()
            assert not denied.ok and "Permission denied" in denied.output
        finally:
            executor.host_registry.get = original_get


def test_binary_bundle_quota_is_atomic_shared_and_charges_empty_metadata(tmp_path):
    store = store_at(tmp_path, global_bytes=2500)
    _, listed = manifest_and_blobs(store, [attachment(1, b"")])
    assert listed[0]["total_bytes"] == 0
    with sqlite3.connect(store.path) as db:
        manifest_size = db.execute("SELECT size FROM outputs").fetchone()[0]
        blob_charge = db.execute("SELECT size FROM output_blobs").fetchone()[0]
        assert blob_charge == 512
        used = manifest_size + blob_charge
    # Text and opaque blobs share one quota. Fill its remaining space exactly.
    store.retain("x" * (store.global_bytes - used), owner="reader", channel="channel",
                 tool="ordinary_text")
    with pytest.raises(RetentionError, match="Global retention quota"):
        store.retain_binary_bundle(
            [attachment(2, b""), attachment(3, b"")], owner="reader", channel="channel",
            tool="mcp_fixture_blob")
    with sqlite3.connect(store.path) as db:
        # No partial blobs or dangling manifest from the rejected two-file bundle.
        assert db.execute("SELECT count(*) FROM output_blobs").fetchone()[0] == 1
        assert db.execute("SELECT count(*) FROM outputs").fetchone()[0] == 2


def test_binary_manifest_pointer_is_retained_even_when_text_quota_is_exhausted(tmp_path):
    executor = executor_at(tmp_path)
    # The attachment admission reserves a separate manifest.  Make later text
    # retention impossible without erasing that pointer.
    executor._output_store = OutputStore(tmp_path / "data" / "evidence.sqlite", global_bytes=1600)
    result = ToolResult("x" * 13000, ok=True, attachments=(attachment(1, b"blob"),))
    with execution_delivery_scope(
        "reader", "channel", allowed_tools={"get_tool_output", "mcp_fixture_blob"},
    ):
        delivered = deliver_runtime_result(executor, result, tool_name="mcp_fixture_blob",
                                           tool_input={}, user_id="reader", channel_id="channel")
    rendered = str(delivered.output)
    assert "[output retention]" in rendered
    pointer = json.loads(rendered.split("[output retention] ", 1)[1])
    assert pointer["retention"] == "retained"
    manifest, _ = read(executor._ensure_output_store(), pointer["retrieval"]["arguments"]["cursor"])
    assert json.loads(manifest.text)["attachments"][0]["total_bytes"] == 4


def test_binary_ttl_survives_restart_then_prunes_without_read_extension(tmp_path):
    now = [10_000.0]
    store = store_at(tmp_path, clock=lambda: now[0])
    _, listed = manifest_and_blobs(store, [attachment(1, b"durable-bytes")])
    cursor = listed[0]["retrieval"]["arguments"]["cursor"]
    restarted = store_at(tmp_path, clock=lambda: now[0])
    now[0] += 86_399
    snapshot, _ = read(restarted, cursor)
    assert snapshot.data == b"durable-bytes"
    assert snapshot.expires_at == 10_000.0 + 86_400
    now[0] += 1
    with pytest.raises(RetentionError, match="expired or unavailable"):
        read(restarted, cursor)
    with sqlite3.connect(restarted.path) as db:
        assert db.execute("SELECT count(*) FROM output_blobs").fetchone()[0] == 0
        assert db.execute("SELECT count(*) FROM outputs").fetchone()[0] == 0


@pytest.mark.parametrize("mode", ["unavailable", "denied"])
@pytest.mark.parametrize("ok,uncertain", [(True, False), (False, False), (False, True)])
def test_media_retention_failure_preserves_mcp_outcome_and_images(mode, ok, uncertain):
    class Unavailable:
        pass

    class Denied:
        def retain_attachments(self, *args, **kwargs):
            raise RetentionError("Retrieval is not authorized.")

    settled = ToolResult(
        "server response", ok=ok, error=None if ok else "server rejection",
        uncertain_outcome=uncertain,
        image_blocks=({"type": "image", "source": {"data": "safe"}},),
        attachments=(attachment(1, b"not-replayed"),),
    )
    delivered = deliver_runtime_result(
        Unavailable() if mode == "unavailable" else Denied(), settled,
        tool_name="mcp_fixture_blob", tool_input={}, user_id="reader", channel_id="channel",
    )
    assert delivered.ok is ok
    assert delivered.error == settled.error
    assert delivered.uncertain_outcome is uncertain
    assert delivered.attachments == ()
    assert delivered.image_blocks == settled.image_blocks
    pointer = json.loads(str(delivered.output).split("[output retention] ", 1)[1])
    assert pointer["retention"] == "failed" and pointer["cursor"] is None
    assert "Do not replay the tool." in pointer["error"]
