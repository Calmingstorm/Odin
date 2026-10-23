"""post_file's retained-file source (``attachment``), against the real output store.

The contract (agreed with Odin, /home/odin/reviews/post-mcp-attachments/02*):

* Host/path posting is unchanged. Without a nonblank ``attachment`` it never
  opens the output store, never asks retrieval authorization and needs no MCP.
* A nonblank ``attachment`` posts a retained file (an MCP result's file or a
  retained Discord upload) under the fences ``get_tool_output`` uses, plus
  ``post_file`` itself. Mixed sources, wrong types, manifests, text snapshots,
  page offsets and damaged files are refused before anything is sent.
* Web chats get the file only while it can reach the reply; a names-only later
  post never counts as a delivery. Background tasks still refuse post_file.
"""

from __future__ import annotations

import base64
import hashlib
import json
import sqlite3
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import discord
from src.config.schema import ToolHost, ToolsConfig
from src.discord.background_task import (
    BLOCKED_TOOLS,
    BackgroundTask,
    create_task_id,
    run_background_task,
)
from src.discord.native_tools.media import MediaTools
from src.discord.native_tools.registry import NativeToolDispatcher
from src.discord.tool_loop import ToolLoopRunner, _LoopMessageProxy
from src.llm.openai_codex import CodexChatClient
from src.llm.strict_tool_adapter import compile_catalog
from src.tools import retained_files
from src.tools.execution_outcome import ToolFailure
from src.tools.executor import ToolExecutor
from src.tools.hosts import HostRegistry
from src.tools.mcp.client import _image_media_type
from src.tools.media_result import BinaryAttachment
from src.tools.nested_payload import validate_nested_payload
from src.tools.output_authorization import (
    host_binding,
    request_delivery_channel,
    request_scope_id,
)
from src.tools.output_delivery import render_page
from src.tools.output_retention import OutputStore
from src.tools.recovery import UNSAFE_TO_RETRY
from src.tools.registry import TOOL_MAP, TOOLS
from src.tools.result_validator import ToolResult
from src.tools.runtime_delivery import deliver_runtime_result, execution_delivery_scope
from src.tools.skill_context import SKILL_SAFE_TOOLS
from src.web.chat import _WebChannel
from tests.fakes.discord_objects import FakeChannel

OWNER, CHANNEL = "reader", "777"
ORIGIN = "mcp_Phone_camera_result"
LIMIT = 25 * 1024 * 1024

PNG = b"\x89PNG\r\n\x1a\n" + b"png-body"
JPEG = b"\xff\xd8\xff\xe0" + b"jpeg-body" + b"\xff\xd9"
GIF87 = b"GIF87a" + b"gif-body"
GIF89 = b"GIF89a" + b"gif-body"
WEBP = b"RIFF" + b"\x10\x00\x00\x00" + b"WEBP" + b"webp-body"


# --------------------------------------------------------------------------- fixtures


def executor_at(tmp_path, store: OutputStore | None = None) -> ToolExecutor:
    executor = ToolExecutor(
        ToolsConfig(
            local_working_dir=str(tmp_path / "workspace"),
            audit_log_path=str(tmp_path / "data" / "audit.jsonl"),
            hosts={"bound": ToolHost(address="127.0.0.1")},
        )
    )
    executor._protected_roots = lambda: [str(tmp_path / "protected")]
    if store is not None:
        executor._output_store = store
    return executor


def retain(executor, *files, tool=ORIGIN, owner=OWNER, channel=CHANNEL, status="succeeded"):
    """Retain (kind, media_type, data) files through the production path."""
    attachments = [
        BinaryAttachment(index + 1, kind, media_type, data)
        for index, (kind, media_type, data) in enumerate(files)
    ]
    with execution_delivery_scope(owner, channel):
        reference = executor.retain_attachments(
            attachments, tool_name=tool, user_id=owner, channel_id=channel, status=status
        )
    # /api/execute retains under its stable delivery channel, as production does.
    effective = request_delivery_channel.get() or channel
    manifest, _ = executor._ensure_output_store().read(
        reference["retrieval"]["arguments"]["cursor"],
        owner=owner,
        channel=effective,
        authorize=lambda *_: True,
    )
    return reference, json.loads(manifest.text)["attachments"]


def jpeg_entry(executor, data=JPEG, **kwargs):
    _, entries = retain(executor, ("image", "image/jpeg", data), **kwargs)
    return entries[0]


def tools_for(executor) -> MediaTools:
    return MediaTools(
        get_config=lambda: SimpleNamespace(
            tools=SimpleNamespace(ssh_key_path="/k", ssh_known_hosts_path="/kh")
        ),
        browser_manager=None,
        tool_executor=executor,
        image_selector=None,
    )


def message_for(channel=None, author: object = OWNER):
    return SimpleNamespace(
        channel=channel or FakeChannel(id=int(CHANNEL)), author=SimpleNamespace(id=author)
    )


async def post(
    executor, inp, *, channel=None, owner=OWNER, scope_channel=CHANNEL, allowed_tools=None
):
    message = message_for(channel)
    with execution_delivery_scope(owner, scope_channel, allowed_tools=allowed_tools):
        result = await tools_for(executor)._handle_post_file(message, inp)
    return result, message.channel


def sent_file(channel: FakeChannel):
    entry = channel.sent[-1]
    file = entry["files"][0]
    return file.filename, file.fp.getvalue(), entry["content"]


def dispatcher_for(executor) -> NativeToolDispatcher:
    dispatcher = NativeToolDispatcher(
        owners={"media": tools_for(executor)},
        skill_manager=MagicMock(),
        tool_catalog=MagicMock(),
        prompt_builder=MagicMock(),
        channel_state=MagicMock(),
    )
    dispatcher.register("post_file", "media", "_handle_post_file", "msg_input")
    return dispatcher


async def loop_dispatch(
    executor, inp, *, channel, user_id=OWNER, allowed_tools=None, mcp_manager=None
):
    """The real outer dispatch: RBAC gate, native table, delivery scope."""
    runner = SimpleNamespace(
        _tool_executor=executor, _native_tools=dispatcher_for(executor), _mcp_manager=mcp_manager
    )
    proxy = _LoopMessageProxy(channel, user_id)
    if allowed_tools is not None:
        proxy.allowed_tools = allowed_tools
    return await ToolLoopRunner.dispatch_loop_tool_inner(runner, "post_file", inp, proxy, user_id)


def text_of(result) -> str:
    return result.output if isinstance(result, ToolResult) else str(result)


class _SpyLease:
    """A real host lease that counts its releases (HostLease has fixed slots)."""

    def __init__(self, lease):
        self._lease = lease
        self.released = 0

    def __getattr__(self, name):
        return getattr(self._lease, name)

    def release(self):
        self.released += 1
        return self._lease.release()


def legacy_executor(resolve=("127.0.0.1", "root", "linux")):
    """A host/path executor whose retention seams must never be touched."""
    executor = MagicMock()
    leases = []

    def acquire(alias, _user_id=None):
        lease = _SpyLease(HostRegistry.unmanaged_lease(alias, resolve))
        leases.append(lease)
        return lease

    executor.acquire_host_for_user = MagicMock(side_effect=acquire)
    executor.leases = leases
    return executor


# --------------------------------------------------------------------------- legacy equivalence


class TestLegacyHostPathPostingIsUnchanged:
    @pytest.mark.parametrize("placeholder", ["absent", None, "", "   ", "\t\n"])
    async def test_local_post_never_opens_retention(self, tmp_path, placeholder):
        file = tmp_path / " spaced naïve ✓.bin "
        file.write_bytes(b"local-bytes")
        executor = legacy_executor()
        inp = {"host": "localhost", "path": str(file), "caption": "cap"}
        if placeholder != "absent":
            inp["attachment"] = placeholder
        channel = FakeChannel(id=1)
        with patch("src.tools.ssh.is_local_address", return_value=True):
            result = await tools_for(executor)._handle_post_file(message_for(channel), inp)
        assert result == f"Posted `{file.name}` (0.0 KB) to channel."
        assert sent_file(channel) == (file.name, b"local-bytes", "cap")
        executor._ensure_output_store.assert_not_called()
        executor._authorize_output.assert_not_called()
        executor.acquire_host_for_user.assert_called_once_with("localhost", OWNER)
        assert executor.leases[0].released == 1

    @pytest.mark.parametrize("placeholder", ["absent", None, ""])
    async def test_remote_post_never_opens_retention(self, placeholder):
        executor = legacy_executor(resolve=("10.0.0.9", "root", "linux"))
        process = MagicMock()
        process.communicate = AsyncMock(return_value=(b"remote", b""))  # head -c: raw bytes
        process.returncode = 0
        inp = {"host": "srv", "path": "/srv/data/ report final.pdf "}
        if placeholder != "absent":
            inp["attachment"] = placeholder
        channel = FakeChannel(id=1)
        with (
            patch("src.tools.ssh.is_local_address", return_value=False),
            patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=process)),
        ):
            result = await tools_for(executor)._handle_post_file(message_for(channel), inp)
        assert result.startswith("Posted ` report final.pdf `")
        assert sent_file(channel)[:2] == (" report final.pdf ", b"remote")
        executor._ensure_output_store.assert_not_called()
        executor._authorize_output.assert_not_called()

    @pytest.mark.parametrize(
        "inp",
        [
            {"host": "h"},
            {"path": "/p"},
            {},
            {"host": "", "path": "", "attachment": ""},
            {"host": "h", "attachment": None},
            {"path": "/p", "attachment": "  "},
        ],
    )
    async def test_missing_source_keeps_the_legacy_error(self, inp):
        executor = legacy_executor()
        result = await tools_for(executor)._handle_post_file(message_for(), inp)
        assert result == "Both 'host' and 'path' are required."
        assert isinstance(result, ToolFailure)
        executor.acquire_host_for_user.assert_not_called()
        executor._ensure_output_store.assert_not_called()

    async def test_legacy_posting_works_with_retention_unavailable(self, tmp_path):
        file = tmp_path / "f.txt"
        file.write_bytes(b"x")
        executor = legacy_executor()
        executor._ensure_output_store.side_effect = AssertionError("retention touched")
        executor._authorize_output.side_effect = AssertionError("retrieval touched")
        with patch("src.tools.ssh.is_local_address", return_value=True):
            result = await tools_for(executor)._handle_post_file(
                message_for(), {"host": "localhost", "path": str(file), "attachment": None}
            )
        assert result.startswith("Posted `f.txt`")

    def test_media_module_does_not_import_retention_code(self):
        root = Path(__file__).resolve().parents[1]
        probe = subprocess.run(
            [
                sys.executable,
                "-c",
                "import sys, src.discord.native_tools.media; "
                "print('src.tools.retained_files' in sys.modules)",
            ],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=120,
            check=True,
        )
        assert probe.stdout.strip() == "False"


# --------------------------------------------------------------------------- input boundaries


class TestInputBoundaries:
    def adapter(self):
        return compile_catalog([TOOL_MAP["post_file"]])

    def test_canonical_general_call_survives_the_strict_wire_unchanged(self):
        accepted = self.adapter().accept(
            "post_file",
            {"host": "localhost", "path": "/tmp/fixture", "caption": "", "attachment": None},
        )
        assert accepted == {"host": "localhost", "path": "/tmp/fixture", "caption": ""}

    def test_attachment_call_normalizes_to_the_attachment_alone(self):
        accepted = self.adapter().accept(
            "post_file",
            {"host": None, "path": None, "caption": None, "attachment": "a" * 32 + ":0"},
        )
        assert accepted == {"attachment": "a" * 32 + ":0"}

    def test_blank_strings_are_not_stripped_by_the_adapter(self):
        accepted = self.adapter().accept(
            "post_file", {"host": "", "path": "  ", "caption": "", "attachment": ""}
        )
        assert accepted == {"host": "", "path": "  ", "caption": "", "attachment": ""}

    def test_an_old_raw_wire_payload_is_not_valid_new_wire(self):
        # Canonical calls stay compatible; old raw wire bytes are a different
        # boundary, which is why history replay never revalidates (below).
        with pytest.raises(ValueError):
            self.adapter().accept(
                "post_file", {"host": "localhost", "path": "/tmp/fixture", "caption": None}
            )

    def test_history_replay_keeps_an_old_call_without_revalidation(self):
        client = CodexChatClient(auth=MagicMock(), model="fixture")
        old = {"host": "localhost", "path": "/tmp/old.png", "caption": ""}
        history = [
            {
                "role": "assistant",
                "content": [
                    {"type": "tool_use", "id": "call-old", "name": "post_file", "input": old}
                ],
            },
            {
                "role": "user",
                "content": [
                    {"type": "tool_result", "tool_use_id": "call-old", "content": "Posted"}
                ],
            },
        ]
        converted = client._convert_messages_with_tools(history)
        call = next(item for item in converted if item.get("type") == "function_call")
        assert call["name"] == "post_file" and json.loads(call["arguments"]) == old

    def test_nested_payloads_must_omit_unused_fields(self):
        def nested(tool_input):
            return validate_nested_payload(
                "schedule_task",
                {
                    "description": "x",
                    "action": "check",
                    "tool_name": "post_file",
                    "tool_input": tool_input,
                },
                TOOLS,
            )

        assert nested({"attachment": "a" * 32 + ":0"})["tool_input"] == {
            "attachment": "a" * 32 + ":0"
        }
        assert nested({"host": "localhost", "path": "/x"})["tool_input"]["path"] == "/x"
        with pytest.raises(ValueError, match="host"):
            nested({"host": None, "attachment": "a" * 32 + ":0"})

    @pytest.mark.parametrize(
        "inp, message",
        [
            ({"attachment": 0}, "'attachment' must be a retained-file cursor string."),
            ({"attachment": ["x:0"]}, "'attachment' must be a retained-file cursor string."),
            (
                {"attachment": {"cursor": "x:0"}},
                "'attachment' must be a retained-file cursor string.",
            ),
            (
                {"attachment": True, "host": "h", "path": "/p"},
                "'attachment' must be a retained-file cursor string.",
            ),
            ({"attachment": "x:0", "host": "localhost", "path": "/p"}, "not both"),
            ({"attachment": "x:0", "host": "localhost"}, "not both"),
            ({"attachment": "x:0", "path": "/p"}, "not both"),
            ({"attachment": "x:0", "host": 0}, "not both"),
            ({"attachment": "x:0", "path": " /p "}, "not both"),
        ],
    )
    async def test_invalid_source_combinations_touch_nothing(self, inp, message):
        executor = legacy_executor()
        channel = FakeChannel(id=1)
        result = await tools_for(executor)._handle_post_file(message_for(channel), inp)
        assert isinstance(result, ToolFailure) and message in result
        assert channel.sent == []
        executor.acquire_host_for_user.assert_not_called()
        executor._ensure_output_store.assert_not_called()
        executor._authorize_output.assert_not_called()

    async def test_blank_host_and_path_beside_an_attachment_are_not_a_second_source(self, tmp_path):
        executor = executor_at(tmp_path)
        entry = jpeg_entry(executor)
        cursor = entry["post"]["arguments"]["attachment"]
        result, channel = await post(
            executor, {"attachment": cursor, "host": "", "path": "   ", "caption": None}
        )
        assert result.startswith("Posted `retained-")
        assert sent_file(channel)[1] == JPEG


# --------------------------------------------------------------------------- bytes and names


class TestRetainedBytes:
    @pytest.mark.parametrize(
        "kind, media_type, data, extension",
        [
            ("image", "image/png", PNG, ".png"),
            ("image", "application/octet-stream", JPEG, ".jpg"),
            ("image", "image/png", JPEG, ".jpg"),
            ("image", "image/gif", GIF87, ".gif"),
            ("image", "image/gif", GIF89, ".gif"),
            ("image", "image/webp", WEBP, ".webp"),
            ("audio", "audio/mpeg", b"ID3\x04audio-frames", ".mp3"),
            ("resource", "application/pdf", b"%PDF-1.7\nbody", ".pdf"),
            ("resource", "text/plain; charset=utf-8", b"hello\n", ".txt"),
            ("resource", "application/x-unknown", b"\x00\x01\x02", ".bin"),
            ("resource", "", b"\x00", ".bin"),
            ("resource", "application/octet-stream", b"", ".bin"),
        ],
    )
    async def test_posts_the_exact_bytes_under_a_derived_name(
        self, tmp_path, kind, media_type, data, extension
    ):
        executor = executor_at(tmp_path)
        _, entries = retain(executor, (kind, media_type, data))
        cursor = entries[0]["post"]["arguments"]["attachment"]
        result, channel = await post(executor, {"attachment": cursor, "caption": "here"})
        name = f"retained-{cursor[:8]}-1{extension}"
        assert result == f"Posted `{name}` ({len(data) / 1024:.1f} KB) to channel."
        assert sent_file(channel) == (name, data, "here")

    @pytest.mark.parametrize("data", [PNG, JPEG, GIF87, GIF89, WEBP, b"GIF8xa", b"\x00"])
    def test_raster_signatures_mirror_mcp_media(self, data):
        expected = {
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/gif": ".gif",
            "image/webp": ".webp",
            None: None,
        }[_image_media_type(data)]
        assert retained_files._raster_extension(data) == expected

    async def test_the_upload_limit_is_25_mib_exactly(self, tmp_path):
        store = OutputStore(
            tmp_path / "data" / "tool-output.sqlite3",
            per_result_bytes=LIMIT + 2048,
            global_bytes=4 * LIMIT,
        )
        executor = executor_at(tmp_path, store)
        at_limit = jpeg_entry(executor, data=b"\xff\xd8" + b"\x00" * (LIMIT - 2))
        over = jpeg_entry(executor, data=b"\xff\xd8" + b"\x00" * (LIMIT - 1))
        ok, channel = await post(
            executor, {"attachment": at_limit["post"]["arguments"]["attachment"]}
        )
        assert ok.startswith("Posted `") and len(sent_file(channel)[1]) == LIMIT
        refused, quiet = await post(
            executor, {"attachment": over["post"]["arguments"]["attachment"]}
        )
        assert isinstance(refused, ToolFailure) and "too large" in refused
        assert quiet.sent == []

    async def test_a_retained_discord_upload_is_postable(self, tmp_path):
        executor = executor_at(tmp_path)
        # Upload intake retains under get_tool_output as the originating tool.
        _, entries = retain(
            executor, ("resource", "application/pdf", b"%PDF-1.4 upload"), tool="get_tool_output"
        )
        result, channel = await post(
            executor, {"attachment": entries[0]["post"]["arguments"]["attachment"]}
        )
        assert result.startswith("Posted `") and sent_file(channel)[1] == b"%PDF-1.4 upload"

    async def test_a_failed_origins_file_posts_without_rerun_or_reclassification(self, tmp_path):
        executor = executor_at(tmp_path)
        reference, entries = retain(executor, ("image", "image/jpeg", JPEG), status="failed")
        assert entries[0]["status"] == "failed"
        mcp = MagicMock()
        result = await loop_dispatch(
            executor,
            {"attachment": entries[0]["post"]["arguments"]["attachment"]},
            channel=FakeChannel(id=int(CHANNEL)),
            mcp_manager=mcp,
        )
        assert text_of(result).startswith("Posted `")
        assert "succeed" not in text_of(result)
        assert mcp.method_calls == []  # nothing reconnects or reruns the origin
        # The retained evidence still records the failed origin.
        manifest, _ = executor._ensure_output_store().read(
            reference["retrieval"]["arguments"]["cursor"],
            owner=OWNER,
            channel=CHANNEL,
            authorize=lambda *_: True,
        )
        assert json.loads(manifest.text)["attachments"][0]["status"] == "failed"
        blob, _ = executor._ensure_output_store().read(
            f"{entries[0]['result_id']}:0", owner=OWNER, channel=CHANNEL, authorize=lambda *_: True
        )
        assert blob.status == "failed"


# --------------------------------------------------------------------------- refusals


class TestCursorAndIntegrityRefusals:
    async def test_a_manifest_or_text_snapshot_is_not_a_file(self, tmp_path):
        executor = executor_at(tmp_path)
        reference, _ = retain(executor, ("image", "image/jpeg", JPEG))
        manifest_cursor = reference["retrieval"]["arguments"]["cursor"]
        result, channel = await post(executor, {"attachment": manifest_cursor})
        assert isinstance(result, ToolFailure) and "Not a retained file" in result
        text = executor._ensure_output_store().retain(
            "plain text output", owner=OWNER, channel=CHANNEL, tool="run_command"
        )
        result, _ = await post(executor, {"attachment": f"{text.result_id}:0"})
        assert isinstance(result, ToolFailure) and "Not a retained file" in result
        assert channel.sent == []

    async def test_only_the_whole_file_cursor_posts(self, tmp_path):
        executor = executor_at(tmp_path)
        entry = jpeg_entry(executor)
        result, channel = await post(executor, {"attachment": f"{entry['result_id']}:3"})
        assert isinstance(result, ToolFailure) and "':0'" in result
        assert channel.sent == []

    @pytest.mark.parametrize("cursor", ["nope", "abc:0", "g" * 32 + ":0", "a" * 32 + ":x"])
    async def test_invalid_cursors_are_refused(self, tmp_path, cursor):
        result, channel = await post(executor_at(tmp_path), {"attachment": cursor})
        assert result == "Retained file unavailable: Invalid output cursor."
        assert channel.sent == []

    async def test_a_damaged_file_fails_its_integrity_check(self, tmp_path):
        executor = executor_at(tmp_path)
        entry = jpeg_entry(executor)
        with sqlite3.connect(executor._ensure_output_store().path) as db:
            db.execute(
                "UPDATE output_blobs SET sha256=? WHERE id=?", ("0" * 64, entry["result_id"])
            )
        result, channel = await post(executor, {"attachment": f"{entry['result_id']}:0"})
        assert isinstance(result, ToolFailure) and "integrity" in result
        assert channel.sent == [] and base64.b64encode(JPEG).decode() not in result

    async def test_an_expired_file_is_refused(self, tmp_path):
        now = [1_800_000_000.0]
        store = OutputStore(tmp_path / "data" / "tool-output.sqlite3", clock=lambda: now[0])
        executor = executor_at(tmp_path, store)
        entry = jpeg_entry(executor)
        now[0] += 25 * 3600
        result, channel = await post(executor, {"attachment": f"{entry['result_id']}:0"})
        assert result == (
            "Retained file unavailable: Retention expired or unavailable; no continuation exists."
        )
        assert channel.sent == []

    async def test_an_early_evicted_file_is_refused(self, tmp_path):
        store = OutputStore(tmp_path / "data" / "tool-output.sqlite3", global_bytes=4000)
        executor = executor_at(tmp_path, store)
        first = jpeg_entry(executor, data=b"\xff\xd8" + b"1" * 1000)
        jpeg_entry(executor, data=b"\xff\xd8" + b"2" * 1500)
        result, _ = await post(executor, {"attachment": f"{first['result_id']}:0"})
        assert isinstance(result, ToolFailure) and "expired or unavailable" in result

    @pytest.mark.parametrize(
        "error",
        [
            sqlite3.DatabaseError("file is not a database: /secret/path"),
            OSError("disk gone: /secret/path"),
            json.JSONDecodeError("bad hosts metadata at /secret/path", "{", 0),
        ],
    )
    async def test_an_unavailable_store_fails_bounded_and_sanitized(self, tmp_path, error):
        executor = executor_at(tmp_path)
        broken = MagicMock()
        broken.read.side_effect = error
        executor._output_store = broken
        result, channel = await post(executor, {"attachment": "a" * 32 + ":0"})
        assert result == "Retained file storage is unavailable. Nothing was posted."
        assert "/secret/path" not in result and channel.sent == []


# --------------------------------------------------------------------------- authority


class TestAuthority:
    async def test_requester_and_channel_must_match_the_retained_file(self, tmp_path):
        executor = executor_at(tmp_path)
        entry = jpeg_entry(executor)
        cursor = entry["post"]["arguments"]["attachment"]
        stranger, quiet = await post(executor, {"attachment": cursor}, owner="intruder")
        assert isinstance(stranger, ToolFailure) and "Permission denied" in stranger
        elsewhere, quiet2 = await post(executor, {"attachment": cursor}, scope_channel="888")
        assert isinstance(elsewhere, ToolFailure) and "Permission denied" in elsewhere
        assert quiet.sent == quiet2.sent == []

    @pytest.mark.parametrize(
        "allowed, ok",
        [
            ({"post_file", "get_tool_output", ORIGIN}, True),
            ({"post_file", ORIGIN}, False),  # retrieval revoked
            ({"post_file", "get_tool_output"}, False),  # origin revoked
        ],
    )
    async def test_retrieval_and_origin_scope_are_each_required(self, tmp_path, allowed, ok):
        executor = executor_at(tmp_path)
        entry = jpeg_entry(executor)
        result = await loop_dispatch(
            executor,
            {"attachment": entry["post"]["arguments"]["attachment"]},
            channel=FakeChannel(id=int(CHANNEL)),
            allowed_tools=allowed,
        )
        assert text_of(result).startswith("Posted `") is ok
        if not ok:
            assert "Permission denied" in text_of(result)

    async def test_outer_dispatch_refuses_a_requester_without_post_file(self, tmp_path):
        executor = executor_at(tmp_path)
        entry = jpeg_entry(executor)
        executor._permission_manager = SimpleNamespace(
            allowed_tool_names=lambda _uid: {"get_tool_output", ORIGIN},
            get_tier=lambda _uid: "user",
        )
        channel = FakeChannel(id=int(CHANNEL))
        with patch.object(
            retained_files,
            "read_retained_file",
            side_effect=AssertionError("store read before RBAC"),
        ):
            result = await loop_dispatch(
                executor, {"attachment": entry["post"]["arguments"]["attachment"]}, channel=channel
            )
        assert "Permission denied: tool 'post_file'" in text_of(result)
        assert channel.sent == []
        # The hint is not authority: the same requester can still read it.
        with execution_delivery_scope(OWNER, CHANNEL):
            read = await executor.execute(
                "get_tool_output",
                {"cursor": entry["retrieval"]["arguments"]["cursor"]},
                user_id=OWNER,
            )
        assert read.ok and '"tool_attachment_page"' in read.output

    async def test_revoked_host_binding_denies_posting(self, tmp_path):
        executor = executor_at(tmp_path)
        target = executor.host_registry.get("bound")
        manifest = executor._ensure_output_store().retain_binary_bundle(
            [BinaryAttachment(1, "resource", "application/octet-stream", b"host-bound")],
            owner=OWNER,
            channel=CHANNEL,
            tool="run_command",
            hosts=(host_binding(target),),
        )
        entry = json.loads(
            executor._ensure_output_store()
            .read(
                f"{manifest.result_id}:0", owner=OWNER, channel=CHANNEL, authorize=lambda *_: True
            )[0]
            .text
        )["attachments"][0]
        cursor = entry["post"]["arguments"]["attachment"]
        ok, _ = await post(executor, {"attachment": cursor})
        assert ok.startswith("Posted `")
        original = executor.host_registry.get
        executor.host_registry.get = lambda *a, **k: SimpleNamespace(
            alias="bound", runtime_key="revoked-generation"
        )
        try:
            denied, channel = await post(executor, {"attachment": cursor})
        finally:
            executor.host_registry.get = original
        assert isinstance(denied, ToolFailure) and "Permission denied" in denied
        assert channel.sent == []

    @pytest.mark.parametrize(
        "state",
        [
            "allowed",
            "retrieval-revoked",
            "origin-revoked",
            "other-owner",
            "other-channel",
            "mcp-disabled-after-capture",
        ],
    )
    async def test_posting_and_retrieval_agree(self, tmp_path, state):
        executor = executor_at(tmp_path)
        entry = jpeg_entry(executor)
        owner, channel = OWNER, CHANNEL
        allowed = {"post_file", "get_tool_output", ORIGIN}
        if state == "retrieval-revoked":
            allowed = {"post_file", ORIGIN}
        elif state == "origin-revoked":
            allowed = {"post_file", "get_tool_output"}
        elif state == "other-owner":
            owner = "intruder"
        elif state == "other-channel":
            channel = "888"
        # An MCP server disabled or disconnected after capture is not consulted
        # by either path: neither reconnects nor reruns anything.
        with execution_delivery_scope(owner, channel, allowed_tools=allowed):
            read = await executor.execute(
                "get_tool_output",
                {"cursor": entry["retrieval"]["arguments"]["cursor"]},
                user_id=owner,
            )
        posted, _ = await post(
            executor,
            {"attachment": entry["post"]["arguments"]["attachment"]},
            owner=owner,
            scope_channel=channel,
            allowed_tools=allowed,
        )
        assert read.ok is posted.startswith("Posted `")
        assert read.ok is (state in {"allowed", "mcp-disabled-after-capture"})


# --------------------------------------------------------------------------- surfaces


class TestSurfaces:
    async def test_discord_foreground_and_loop_dispatch_post_to_the_invoking_channel(
        self, tmp_path
    ):
        executor = executor_at(tmp_path)
        entry = jpeg_entry(executor)
        channel = FakeChannel(id=int(CHANNEL))
        result = await loop_dispatch(
            executor,
            {"attachment": entry["post"]["arguments"]["attachment"], "caption": "c"},
            channel=channel,
        )
        assert text_of(result).startswith("Posted `")
        assert sent_file(channel)[1:] == (JPEG, "c")

    async def test_a_web_reply_carries_the_file(self, tmp_path):
        executor = executor_at(tmp_path)
        entry = jpeg_entry(executor)
        web = _WebChannel(CHANNEL, owner_id=OWNER)
        result, _ = await post(
            executor, {"attachment": entry["post"]["arguments"]["attachment"]}, channel=web
        )
        assert result.startswith("Posted `")
        assert [base64.b64decode(f["data"]) for f in web.captured_files] == [JPEG]
        assert web.captured_files[0]["content_type"] == "image/jpeg"

    async def test_a_later_posts_view_delivers_with_its_running_turn(self, tmp_path):
        executor = executor_at(tmp_path)
        entry = jpeg_entry(executor)
        posts: list[str] = []
        turn = _WebChannel(CHANNEL, owner_id=OWNER)
        turn.bind_later_posts(posts.append)
        view = turn.later_posts()
        result, _ = await post(
            executor,
            {"attachment": entry["post"]["arguments"]["attachment"], "caption": "from a loop"},
            channel=view,
        )
        assert result.startswith("Posted `")
        assert [base64.b64decode(f["data"]) for f in turn.captured_files] == [JPEG]
        assert posts == ["from a loop"]

    @pytest.mark.parametrize("shape", ["detached", "view-after-answer"])
    async def test_a_chat_that_already_answered_is_refused_before_any_post(self, tmp_path, shape):
        executor = executor_at(tmp_path)
        entry = jpeg_entry(executor)
        posts: list[str] = []
        turn = _WebChannel(CHANNEL, owner_id=OWNER)
        turn.bind_later_posts(posts.append)
        channel = turn
        if shape == "view-after-answer":
            channel = turn.later_posts()
        turn.detach(posts.append)
        reads = []
        real_read = retained_files.read_retained_file
        with patch.object(
            retained_files,
            "read_retained_file",
            side_effect=lambda *a: reads.append(a) or real_read(*a),
        ):
            result, _ = await post(
                executor,
                {"attachment": entry["post"]["arguments"]["attachment"], "caption": "late"},
                channel=channel,
            )
        assert isinstance(result, ToolFailure) and "can no longer receive files" in result
        assert posts == [] and turn.captured_files == [] and reads == []

    async def test_detachment_between_admission_and_capture_posts_nothing(self, tmp_path):
        executor = executor_at(tmp_path)
        entry = jpeg_entry(executor)
        posts: list[str] = []
        turn = _WebChannel(CHANNEL, owner_id=OWNER)
        turn.bind_later_posts(posts.append)
        view = turn.later_posts()
        real_read = retained_files.read_retained_file

        def read_then_answer(*args):
            snapshot = real_read(*args)
            turn.detach(posts.append)  # the starting turn answers mid-call
            return snapshot

        with patch.object(retained_files, "read_retained_file", side_effect=read_then_answer):
            result, _ = await post(
                executor,
                {"attachment": entry["post"]["arguments"]["attachment"], "caption": "late"},
                channel=view,
            )
        assert isinstance(result, ToolFailure) and "can no longer receive files" in result
        assert posts == [] and turn.captured_files == []

    def test_web_send_does_not_suspend(self):
        # send_retained_file relies on it: its check and send()'s capture run
        # with nothing else in between.
        coroutine = _WebChannel(CHANNEL).send(content="x")
        with pytest.raises(StopIteration):
            coroutine.send(None)

    async def test_api_execute_binds_retained_files_to_their_credential(self, tmp_path):
        executor = executor_at(tmp_path)
        channel_token = request_delivery_channel.set("api-execute")
        scope_token = request_scope_id.set("credential-a")
        try:
            entry = jpeg_entry(executor)
            same, _ = await post(
                executor,
                {"attachment": entry["post"]["arguments"]["attachment"]},
                channel=_WebChannel("api-execute", ephemeral=True),
            )
            assert same.startswith("Posted `")
            request_scope_id.set("credential-b")  # same user, another credential
            other, _ = await post(
                executor,
                {"attachment": entry["post"]["arguments"]["attachment"]},
                channel=_WebChannel("api-execute", ephemeral=True),
            )
            assert isinstance(other, ToolFailure) and "Permission denied" in other
        finally:
            request_scope_id.reset(scope_token)
            request_delivery_channel.reset(channel_token)

    async def test_background_tasks_still_refuse_post_file(self):
        assert "post_file" in BLOCKED_TOOLS
        executor = SimpleNamespace(calls=[], check_permission=lambda *_: None)

        async def execute(*args, **kwargs):
            executor.calls.append(args)

        executor.execute = execute
        task = BackgroundTask(
            task_id=create_task_id(),
            description="post",
            channel=FakeChannel(id=5),
            steps=[
                {
                    "tool_name": "post_file",
                    "description": "post",
                    "tool_input": {"attachment": "a" * 32 + ":0"},
                }
            ],
            requester="tester",
            requester_id="4242",
        )
        await run_background_task(task, executor, SimpleNamespace(has_skill=lambda _n: False))
        assert task.results[0].status == "error"
        assert task.results[0].output == "Tool 'post_file' cannot run in background tasks."
        assert executor.calls == []

    def test_skills_gain_no_retention_access_and_post_file_is_never_auto_retried(self):
        assert "get_tool_output" not in SKILL_SAFE_TOOLS
        assert "post_file" not in SKILL_SAFE_TOOLS
        assert "post_file" in UNSAFE_TO_RETRY

    async def test_an_upload_failure_is_reported_once_and_not_retried(self, tmp_path):
        executor = executor_at(tmp_path)
        entry = jpeg_entry(executor)
        channel = FakeChannel(id=int(CHANNEL))
        attempts = []
        original_send = channel.send

        async def failing_send(*args, **kwargs):
            attempts.append(1)
            channel.send_error = discord.HTTPException(
                SimpleNamespace(status=500, reason="err"), "msg"
            )
            return await original_send(*args, **kwargs)

        channel.send = failing_send
        result, _ = await post(
            executor, {"attachment": entry["post"]["arguments"]["attachment"]}, channel=channel
        )
        assert isinstance(result, ToolFailure) and "Failed to upload to Discord" in result
        assert attempts == [1] and channel.sent == []


# --------------------------------------------------------------------------- hints and manifests


class TestHintsAndManifests:
    def test_manifest_entries_and_pointer_name_the_posting_route(self, tmp_path):
        executor = executor_at(tmp_path)
        reference, entries = retain(
            executor, ("image", "image/jpeg", JPEG), ("resource", "text/plain", b"note")
        )
        assert "post_file" in reference["posting"] and "get_tool_output" in reference["posting"]
        assert "post" not in reference  # the manifest itself is not postable
        for entry in entries:
            cursor = f"{entry['result_id']}:0"
            assert entry["retrieval"]["arguments"]["cursor"] == cursor
            assert entry["post"] == {"tool": "post_file", "arguments": {"attachment": cursor}}

    def test_every_page_keeps_the_whole_file_post_cursor(self, tmp_path):
        executor = executor_at(tmp_path)
        data = bytes(range(256)) * 4
        entry = jpeg_entry(executor, data=b"\xff\xd8" + data)
        store = executor._ensure_output_store()
        cursor, pages, rebuilt = entry["retrieval"]["arguments"]["cursor"], 0, b""
        while cursor:
            blob, offset = store.read(
                cursor, owner=OWNER, channel=CHANNEL, authorize=lambda *_: True
            )
            page = json.loads(render_page(blob, offset=offset, limit=400))
            assert page["post"] == {
                "tool": "post_file",
                "arguments": {"attachment": f"{entry['result_id']}:0"},
            }
            rebuilt += base64.b64decode(page["data_base64"])
            cursor, pages = page["cursor"], pages + 1
        assert pages > 1 and page["retrieval"] is None
        assert rebuilt == b"\xff\xd8" + data

    def test_pages_fit_the_minimum_configurable_budget(self, tmp_path):
        # tools.tool_output_max_chars cannot go below 1024. With the hint, a page
        # of the largest file a bundle may hold (late offsets have the most
        # digits) must still render as a page, at the smallest and the default
        # page limits.
        bounds = ToolsConfig.model_fields["tool_output_max_chars"].metadata
        assert any(getattr(bound, "ge", None) == 1024 for bound in bounds)
        executor = executor_at(tmp_path)
        data = b"\xff\xd8" + bytes(range(256)) * ((4 * 1024 * 1024 - 4096) // 256)
        entry = jpeg_entry(executor, data=data)
        blob, _ = executor._ensure_output_store().read(
            f"{entry['result_id']}:0", owner=OWNER, channel=CHANNEL, authorize=lambda *_: True
        )
        for offset in (0, len(data) // 2, len(data) - 3):
            for limit in (4, 8, 4000):
                page = json.loads(render_page(blob, offset=offset, budget=1024, limit=limit))
                assert page["kind"] == "tool_attachment_page", (offset, limit)
                assert page["post"]["arguments"]["attachment"] == f"{entry['result_id']}:0"
                assert base64.b64decode(page["data_base64"]) == data[offset : page["end"]]

    def test_a_whole_file_reconstructs_at_the_minimum_budget(self, tmp_path):
        executor = executor_at(tmp_path)
        data = b"\xff\xd8" + b"m" * 300
        entry = jpeg_entry(executor, data=data)
        blob, _ = executor._ensure_output_store().read(
            f"{entry['result_id']}:0", owner=OWNER, channel=CHANNEL, authorize=lambda *_: True
        )
        offset, rebuilt = 0, b""
        while offset is not None:
            page = json.loads(render_page(blob, offset=offset, budget=1024, limit=4000))
            assert page["kind"] == "tool_attachment_page" and "post" in page
            rebuilt += base64.b64decode(page["data_base64"])
            offset = int(page["cursor"].split(":")[1]) if page["cursor"] else None
        assert rebuilt == data

    def test_the_hint_bytes_are_charged_to_the_quota(self, tmp_path):
        executor = executor_at(tmp_path)
        reference, entries = retain(executor, ("image", "image/jpeg", JPEG))
        store = executor._ensure_output_store()
        manifest_id = reference["result_id"]
        with sqlite3.connect(store.path) as db:
            text, size = db.execute(
                "SELECT text, size FROM outputs WHERE id=?", (manifest_id,)
            ).fetchone()
            blob_size = db.execute(
                "SELECT size FROM output_blobs WHERE id=?", (entries[0]["result_id"],)
            ).fetchone()[0]
        assert '"post"' in text and size == len(text.encode("utf-8"))
        assert blob_size == len(JPEG) + 512

    async def test_an_old_manifest_without_hints_still_posts_by_its_cursor(self, tmp_path):
        executor = executor_at(tmp_path)
        reference, entries = retain(executor, ("image", "image/jpeg", JPEG))
        store = executor._ensure_output_store()
        old = {
            "attachments": [{k: v for k, v in entry.items() if k != "post"} for entry in entries]
        }
        with sqlite3.connect(store.path) as db:
            db.execute(
                "UPDATE outputs SET text=? WHERE id=?", (json.dumps(old), reference["result_id"])
            )
        manifest, _ = store.read(
            reference["retrieval"]["arguments"]["cursor"],
            owner=OWNER,
            channel=CHANNEL,
            authorize=lambda *_: True,
        )
        listed = json.loads(manifest.text)["attachments"][0]
        assert "post" not in listed
        result, channel = await post(
            executor, {"attachment": listed["retrieval"]["arguments"]["cursor"]}
        )
        assert result.startswith("Posted `") and sent_file(channel)[1] == JPEG

    def test_compression_keeps_a_route_back_to_the_post_hint(self, tmp_path):
        from src.llm.retained_output import compact_retained_output

        executor = executor_at(tmp_path)
        reference, entries = retain(executor, ("image", "image/jpeg", b"\xff\xd8" + b"c" * 900))
        store = executor._ensure_output_store()
        # A removed page rewinds to its own start; re-reading it shows the hint.
        blob, _ = store.read(
            f"{entries[0]['result_id']}:0", owner=OWNER, channel=CHANNEL, authorize=lambda *_: True
        )
        page = render_page(blob, offset=0, limit=400)
        compact = json.loads(compact_retained_output(page))
        cursor = compact["retrieval"]["arguments"]["cursor"]
        blob, offset = store.read(cursor, owner=OWNER, channel=CHANNEL, authorize=lambda *_: True)
        again = json.loads(render_page(blob, offset=offset, limit=400))
        assert again["post"]["arguments"]["attachment"] == f"{entries[0]['result_id']}:0"
        # A removed manifest pointer rewinds to the manifest, whose entries carry it.
        pointer = "photo\n[output retention] " + json.dumps(reference)
        compact = json.loads(compact_retained_output(pointer))
        manifest, _ = store.read(
            compact["retrieval"]["arguments"]["cursor"],
            owner=OWNER,
            channel=CHANNEL,
            authorize=lambda *_: True,
        )
        assert "post" in json.loads(manifest.text)["attachments"][0]

    def test_the_runtime_pointer_line_carries_the_instruction(self, tmp_path):
        executor = executor_at(tmp_path)
        result = ToolResult(
            output="photo taken",
            ok=True,
            tool_name=ORIGIN,
            attachments=(BinaryAttachment(1, "image", "image/jpeg", JPEG),),
        )
        with execution_delivery_scope(OWNER, CHANNEL):
            delivered = deliver_runtime_result(
                executor, result, tool_name=ORIGIN, tool_input={}, user_id=OWNER, channel_id=CHANNEL
            )
        pointer = json.loads(str(delivered.output).split("[output retention] ", 1)[1])
        assert "post_file" in pointer["posting"]


# --------------------------------------------------------------------------- no leakage


class TestNoPayloadLeakage:
    async def test_results_and_errors_never_carry_the_bytes(self, tmp_path):
        executor = executor_at(tmp_path)
        secret = b"\xff\xd8" + b"SECRET-PAYLOAD" * 8
        entry = jpeg_entry(executor, data=secret)
        encoded = base64.b64encode(secret).decode()
        ok, _ = await post(executor, {"attachment": entry["post"]["arguments"]["attachment"]})
        for text in (
            ok,
            *(
                (await post(executor, {"attachment": f"{entry['result_id']}:1"}))[0],
                (
                    await post(
                        executor,
                        {"attachment": entry["post"]["arguments"]["attachment"]},
                        owner="intruder",
                    )
                )[0],
            ),
        ):
            assert "SECRET-PAYLOAD" not in text and encoded[:24] not in text
        digest = hashlib.sha256(secret).hexdigest()
        assert digest not in ok
