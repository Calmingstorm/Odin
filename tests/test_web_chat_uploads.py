"""WebUI Chat attachments (#747): the upload store, its route, and a web turn
that processes a question's files as Discord intake processes a message's."""
from __future__ import annotations

import asyncio
import json
import os
import stat
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from aiohttp import BodyPartReader, FormData, web
from aiohttp.http_exceptions import InvalidHeader
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import Config
from src.health.server import _make_redaction_mask_middleware
from src.web import chat as web_chat
from src.web.api.sessions_chat import MalformedMultipartError, _FilePart, _parsed, register_chat
from src.web.uploads import WEB_UPLOADS, UploadError, UploadStore

OWNER = "page-owner"
MALFORMED = {"error": "malformed multipart body"}
NO_FILENAME = {"error": "send exactly one part named 'file', with a filename"}
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


class FakePart:
    """A multipart file part: the read_chunk/filename/headers aiohttp gives."""

    def __init__(self, data: bytes, filename="notes.txt", content_type="text/plain",
                 chunk=7, stall: asyncio.Event | None = None):
        self._data, self._chunk, self._stall = data, chunk, stall
        self.filename = filename
        self.headers = {"Content-Type": content_type}

    async def read_chunk(self, size):
        if self._stall is not None and len(self._data) < 4:
            await self._stall.wait()
        piece, self._data = self._data[:self._chunk], self._data[self._chunk:]
        return piece


def _store(tmp_path, **limits):
    return UploadStore(tmp_path / "uploads", **limits)


class TestStore:
    async def test_a_file_is_staged_privately_under_a_server_name(self, tmp_path):
        store = _store(tmp_path)
        upload = await store.receive(OWNER, FakePart(b"hello world", "../../etc/passwd"))
        assert upload.filename == "passwd" and upload.size == 11
        assert upload.path.read_bytes() == b"hello world"
        assert upload.path.name == f"{upload.upload_id}.bin" and len(upload.upload_id) == 32
        record = json.loads((tmp_path / "uploads" / f"{upload.upload_id}.json").read_text())
        assert record["state"] == "staged" and record["owner"] == OWNER
        assert stat.S_IMODE(os.stat(tmp_path / "uploads").st_mode) == 0o700
        for path in (upload.path, tmp_path / "uploads" / f"{upload.upload_id}.json"):
            assert stat.S_IMODE(os.stat(path).st_mode) == 0o600
        assert await upload.read() == b"hello world"

    async def test_a_file_over_the_size_limit_leaves_nothing(self, tmp_path):
        store = _store(tmp_path, max_file_bytes=10)
        with pytest.raises(UploadError) as refused:
            await store.receive(OWNER, FakePart(b"x" * 11))
        assert refused.value.status == 413
        assert list((tmp_path / "uploads").iterdir()) == []

    async def test_the_owners_bytes_and_entries_are_bounded(self, tmp_path):
        store = _store(tmp_path, owner_bytes=20, owner_entries=3)
        await store.receive(OWNER, FakePart(b"a" * 15))
        with pytest.raises(UploadError) as refused:
            await store.receive(OWNER, FakePart(b"b" * 6))
        assert refused.value.status == 507
        for _ in range(2):
            await store.receive(OWNER, FakePart(b""))
        with pytest.raises(UploadError):
            await store.receive(OWNER, FakePart(b""))  # empty files count as entries
        # Another identity has its own allowance.
        await store.receive("someone-else", FakePart(b"c" * 15))

    async def test_uploads_still_streaming_count(self, tmp_path):
        store = _store(tmp_path, total_entries=1)
        stall = asyncio.Event()
        first = asyncio.create_task(store.receive(OWNER, FakePart(b"slow file", stall=stall)))
        await asyncio.sleep(0.01)
        with pytest.raises(UploadError):
            await store.receive("other", FakePart(b"x"))
        stall.set()
        await first

    async def test_a_cancelled_upload_frees_its_room_and_leaves_nothing(self, tmp_path):
        store = _store(tmp_path, total_entries=1)
        task = asyncio.create_task(store.receive(OWNER, FakePart(b"slow", stall=asyncio.Event())))
        await asyncio.sleep(0.01)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert list((tmp_path / "uploads").iterdir()) == []
        await store.receive(OWNER, FakePart(b"next"))

    async def test_a_claim_is_all_or_nothing(self, tmp_path):
        store = _store(tmp_path)
        a = await store.receive(OWNER, FakePart(b"a"))
        b = await store.receive(OWNER, FakePart(b"b"))
        theirs = await store.receive("someone-else", FakePart(b"c"))
        for ids in ([a.upload_id, "f" * 32], [a.upload_id, theirs.upload_id],
                    [a.upload_id, a.upload_id], [a.upload_id] * 11, ["not-an-id"]):
            with pytest.raises(UploadError):
                store.claim(OWNER, ids)
            assert a.state == "staged" and b.state == "staged"
        claimed = store.claim(OWNER, [a.upload_id, b.upload_id])
        assert [u.state for u in claimed] == ["claimed", "claimed"]
        with pytest.raises(UploadError):
            store.claim(OWNER, [a.upload_id])  # already sent

    async def test_release_returns_and_consume_deletes(self, tmp_path):
        store = _store(tmp_path)
        upload = await store.receive(OWNER, FakePart(b"a"))
        store.release(store.claim(OWNER, [upload.upload_id]))
        assert upload.state == "staged"
        store.consume(store.claim(OWNER, [upload.upload_id]))
        assert not upload.path.exists()
        with pytest.raises(UploadError):
            store.claim(OWNER, [upload.upload_id])

    @staticmethod
    def _failing_writes(store, fails):
        real = store._write_record
        calls = {"n": 0}

        def write(upload):
            calls["n"] += 1
            if fails(calls["n"]):
                raise OSError("disk full")
            real(upload)

        store._write_record = write
        return real

    @pytest.mark.parametrize("failing_write", [1, 2])
    async def test_a_claim_that_cannot_be_recorded_is_refused_and_not_reused(
        self, tmp_path, failing_write,
    ):
        store = _store(tmp_path)
        a = await store.receive(OWNER, FakePart(b"a"))
        b = await store.receive(OWNER, FakePart(b"b"))
        self._failing_writes(store, lambda n: n == failing_write)
        with pytest.raises(UploadError) as refused:
            store.claim(OWNER, [a.upload_id, b.upload_id])
        assert refused.value.status == 507 and a.state == b.state == "staged"
        # Nothing ran, so after a restart both are still the owner's to send.
        again = _store(tmp_path)
        assert len(again.claim(OWNER, [a.upload_id, b.upload_id])) == 2

    async def test_an_upload_whose_claim_cannot_be_undone_is_discarded(self, tmp_path):
        store = _store(tmp_path)
        a = await store.receive(OWNER, FakePart(b"a"))
        b = await store.receive(OWNER, FakePart(b"b"))
        self._failing_writes(store, lambda n: n >= 2)
        with pytest.raises(UploadError):
            store.claim(OWNER, [a.upload_id, b.upload_id])
        assert not a.path.exists() and b.state == "staged" and b.path.exists()
        again = _store(tmp_path)
        with pytest.raises(UploadError):
            again.claim(OWNER, [a.upload_id])
        assert len(again.claim(OWNER, [b.upload_id])) == 1

    async def test_unused_uploads_expire_but_claimed_ones_are_kept(self, tmp_path):
        store = _store(tmp_path, unused_seconds=60)
        old = await store.receive(OWNER, FakePart(b"old"))
        busy = await store.receive(OWNER, FakePart(b"busy"))
        store.claim(OWNER, [busy.upload_id])
        old.created = busy.created = time.time() - 120
        assert store.purge_expired() == 1
        assert not old.path.exists() and busy.path.exists()

    async def test_a_restart_keeps_staged_files_and_never_reuses_a_claim(self, tmp_path):
        store = _store(tmp_path)
        staged = await store.receive(OWNER, FakePart(b"keep me"))
        claimed = await store.receive(OWNER, FakePart(b"was being sent"))
        store.claim(OWNER, [claimed.upload_id])
        folder = tmp_path / "uploads"
        (folder / ("a" * 32 + ".part")).write_bytes(b"interrupted")
        (folder / ("b" * 32 + ".bin")).write_bytes(b"no record")
        (folder / ("c" * 32 + ".json")).write_text("{not json")
        again = _store(tmp_path)
        assert [u.upload_id for u in again.claim(OWNER, [staged.upload_id])] == [staged.upload_id]
        with pytest.raises(UploadError):
            again.claim(OWNER, [claimed.upload_id])
        assert sorted(p.name for p in folder.iterdir()) == sorted(
            [f"{staged.upload_id}.bin", f"{staged.upload_id}.json"])


def _identity(user_id=OWNER, tier="user"):
    return SimpleNamespace(user_id=user_id, username=user_id, tier=tier, allowed_tools=None,
                           allowed_hosts=None, default_host="")


def _app(store, identity=None):
    @web.middleware
    async def authenticate(request, handler):
        request._api_identity = identity or _identity()
        return await handler(request)

    bot = SimpleNamespace(config=Config(discord={"token": "x"}, web={"api_token": "set"}),
                          api_token_manager=None, channel_state=MagicMock())
    routes = web.RouteTableDef()
    register_chat(routes, bot)
    # The production fence and request size limit, as the server builds them.
    app = web.Application(middlewares=[authenticate, _make_redaction_mask_middleware()],
                          client_max_size=10 * 1024 * 1024)
    app.router.add_routes(routes)
    if store is not None:
        app[WEB_UPLOADS] = store
    return app


def _form(data=b"file text", filename="notes.txt", content_type="text/plain", name="file"):
    form = FormData()
    form.add_field(name, data, filename=filename, content_type=content_type)
    return form


class TestUploadRoute:
    async def test_a_file_is_staged_for_its_uploader(self, tmp_path):
        store = _store(tmp_path)
        async with TestClient(TestServer(_app(store))) as client:
            response = await client.post("/api/chat/uploads", data=_form())
            body = await response.json()
        assert response.status == 201
        assert body == {"upload_id": body["upload_id"], "name": "notes.txt", "size": 9,
                        "content_type": "text/plain"}
        assert store.claim(OWNER, [body["upload_id"]])[0].owner == OWNER

    async def test_a_file_larger_than_the_json_limit_streams_through(self, tmp_path):
        store = _store(tmp_path)
        big = os.urandom(12 * 1024 * 1024)
        async with TestClient(TestServer(_app(store))) as client:
            response = await client.post("/api/chat/uploads", data=_form(big, "big.bin"))
            body = await response.json()
        assert response.status == 201 and body["size"] == len(big)
        assert store.claim(OWNER, [body["upload_id"]])[0].path.read_bytes() == big

    async def test_a_file_over_the_upload_limit_is_refused(self, tmp_path):
        store = _store(tmp_path, max_file_bytes=1024)
        async with TestClient(TestServer(_app(store))) as client:
            response = await client.post("/api/chat/uploads", data=_form(b"x" * 2048))
        assert response.status == 413
        assert list((tmp_path / "uploads").iterdir()) == []

    async def test_malformed_uploads_are_refused(self, tmp_path):
        store = _store(tmp_path)
        two = FormData()
        two.add_field("file", b"one", filename="one.txt")
        two.add_field("file", b"two", filename="two.txt")
        async with TestClient(TestServer(_app(store))) as client:
            assert (await client.post("/api/chat/uploads", json={"x": 1})).status == 400
            assert (await client.post("/api/chat/uploads", data=_form(name="other"))).status == 400
            assert (await client.post("/api/chat/uploads", data=two)).status == 400
        assert list((tmp_path / "uploads").iterdir()) == []

    async def test_a_request_that_ends_after_its_file_keeps_nothing(self, tmp_path, monkeypatch):
        monkeypatch.setattr("src.web.api.sessions_chat.UPLOAD_SECONDS", 0.5)
        store = _store(tmp_path)
        received = []
        real_receive = store.receive

        async def receive(owner, part):
            upload = await real_receive(owner, part)
            received.append(upload)
            return upload

        store.receive = receive
        boundary = "b0undary"
        # The file is longer than one read, so the part reader finds its end in
        # what has arrived; the request then stalls in the next part's headers.
        body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; "
                "filename=\"a.bin\"\r\nContent-Type: application/octet-stream\r\n\r\n").encode()
        body += b"x" * 70_000 + f"\r\n--{boundary}\r\nContent-Disposition: form-da".encode()

        async def stalled_body():
            yield body
            await asyncio.sleep(5)

        async with TestClient(TestServer(_app(store))) as client:
            response = await client.post(
                "/api/chat/uploads", data=stalled_body(),
                headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
            assert response.status == 408
        assert [u.size for u in received] == [70_000], "the file was staged first"
        assert list((tmp_path / "uploads").iterdir()) == []
        assert store._usage(None) == (0, 0)

    @staticmethod
    def _part(boundary, disposition, payload=b"x"):
        return (f"--{boundary}\r\nContent-Disposition: {disposition}\r\n"
                "Content-Type: text/plain\r\n\r\n").encode() + payload + b"\r\n"

    # aiohttp 3.14.1 raises decoding these two filenames (LookupError, then
    # UnicodeDecodeError), which the route maps; 3.14.3 drops the filename
    # itself, and the route refuses a part without one. Either way a 400.
    _FILENAME_CASES = {"a filename in an unknown charset", "an undecodable filename"}

    @pytest.mark.parametrize("case", [
        "no framing", "a bad header after the file", "a _charset_ part, long boundary",
        "a filename in an unknown charset", "an undecodable filename",
    ])
    async def test_a_body_the_parser_refuses_is_the_clients_error(self, tmp_path, case):
        store = _store(tmp_path)
        boundary = "b0undary"
        file = 'form-data; name="file"; filename="a.bin"'
        body = {
            "no framing": lambda: b"no multipart framing at all",
            # aiohttp raises InvalidHeader reading the next part, after the file was staged.
            "a bad header after the file": lambda: (
                self._part(boundary, file, b"x" * 70_000)
                + f"--{boundary}\r\nnot a header line\r\n\r\nx\r\n--{boundary}--\r\n".encode()),
            # aiohttp reads a _charset_ part with read_chunk(32): an AssertionError.
            "a _charset_ part, long boundary": lambda: (
                self._part("B" * 40, 'form-data; name="_charset_"', b"utf-8")
                + f"--{'B' * 40}--\r\n".encode()),
            # part.filename decodes these: LookupError, then UnicodeDecodeError.
            "a filename in an unknown charset": lambda: (
                self._part(boundary, "form-data; name=\"file\"; filename*0=bogus-cs''%E2%9C%93.txt")
                + f"--{boundary}--\r\n".encode()),
            "an undecodable filename": lambda: (
                self._part(boundary, "form-data; name=\"file\"; filename*0=utf-8''%FF.txt")
                + f"--{boundary}--\r\n".encode()),
        }[case]()
        if case == "a _charset_ part, long boundary":
            boundary = "B" * 40
        async with TestClient(TestServer(_app(store))) as client:
            response = await client.post(
                "/api/chat/uploads", data=body,
                headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
            assert response.status == 400
            answers = [MALFORMED] + ([NO_FILENAME] if case in self._FILENAME_CASES else [])
            assert await response.json() in answers
            form = FormData()
            form.add_field("file", b"fine", filename="ok.txt")
            assert (await client.post("/api/chat/uploads", data=form)).status == 201
        assert store._usage(None) == (1, 4)
        assert sorted(p.suffix for p in (tmp_path / "uploads").iterdir()) == [".bin", ".json"]

    async def test_the_handlers_own_errors_stay_server_errors(self, tmp_path, monkeypatch):
        store = _store(tmp_path)

        async def broken(owner, part):
            raise ValueError("a bug of ours, not the client's")

        monkeypatch.setattr(store, "receive", broken)
        async with TestClient(TestServer(_app(store))) as client:
            form = FormData()
            form.add_field("file", b"x", filename="a.txt")
            assert (await client.post("/api/chat/uploads", data=form)).status == 500

    async def test_a_refused_upload_that_cannot_be_deleted_keeps_its_answer(
        self, tmp_path, monkeypatch,
    ):
        store = _store(tmp_path)

        def stuck(_upload):
            raise OSError("read-only file system")

        monkeypatch.setattr(store, "_delete", stuck)
        async with TestClient(TestServer(_app(store))) as client:
            form = FormData()
            form.add_field("file", b"one", filename="a.txt")
            form.add_field("file", b"two", filename="b.txt")
            response = await client.post("/api/chat/uploads", data=form)
            assert response.status == 400
            assert (await response.json())["error"] == "send one file per upload"

    async def test_without_a_store_uploads_are_unavailable(self):
        async with TestClient(TestServer(_app(None))) as client:
            assert (await client.post("/api/chat/uploads", data=_form())).status == 503

    async def test_a_masked_json_body_elsewhere_is_still_refused(self, tmp_path):
        async with TestClient(TestServer(_app(_store(tmp_path)))) as client:
            response = await client.post("/api/chat", json={"content": "•" * 8})
            body = await response.json()
        assert response.status == 400 and "redacted placeholder" in body["error"]


class TestChatRoutes:
    async def test_chat_passes_a_questions_attachments_and_the_store(self, tmp_path):
        store = _store(tmp_path)
        seen = {}

        async def fake_process(*args, **kwargs):
            seen.update(kwargs)
            return {"response": "ok", "tools_used": [], "is_error": False}

        with patch("src.web.api.process_web_chat", fake_process):
            async with TestClient(TestServer(_app(store))) as client:
                response = await client.post("/api/chat", json={"attachments": ["a" * 32]})
        assert response.status == 200
        assert seen["attachments"] == ["a" * 32] and seen["upload_store"] is store

    async def test_a_question_without_attachments_is_called_as_before(self, tmp_path):
        seen = {}

        async def fake_process(*args, **kwargs):
            seen.update(kwargs)
            return {"response": "ok", "tools_used": [], "is_error": False}

        with patch("src.web.api.process_web_chat", fake_process):
            async with TestClient(TestServer(_app(_store(tmp_path)))) as client:
                await client.post("/api/chat", json={"content": "hello"})
        assert "attachments" not in seen and "upload_store" not in seen

    @pytest.mark.parametrize("attachments", ["a" * 32, ["../x"], [1], ["a" * 32] * 11])
    async def test_bad_attachments_are_refused(self, tmp_path, attachments):
        async with TestClient(TestServer(_app(_store(tmp_path)))) as client:
            response = await client.post("/api/chat",
                                         json={"content": "hi", "attachments": attachments})
        assert response.status == 400

    async def test_a_refused_claim_answers_with_its_status(self, tmp_path):
        async def refuse(*args, **kwargs):
            raise UploadError("An attached file is unknown, expired or already sent.", 409)

        with patch("src.web.api.process_web_chat", refuse):
            async with TestClient(TestServer(_app(_store(tmp_path)))) as client:
                response = await client.post("/api/chat", json={"attachments": ["a" * 32]})
        assert response.status == 409

    async def test_execute_takes_no_attachments(self, tmp_path):
        async with TestClient(TestServer(_app(_store(tmp_path)))) as client:
            response = await client.post("/api/execute",
                                         json={"prompt": "hi", "attachments": ["a" * 32]})
        assert response.status == 400


def _chat_bot(tmp_path, run):
    bot = MagicMock()
    bot.config = Config(discord={"token": "x"},
                        attachments={"temp_directory": str(tmp_path / "workspaces")})
    bot.tool_executor = None
    bot.sessions.get = MagicMock(return_value=None)
    bot.sessions.has_message_id = MagicMock(return_value=False)
    bot.sessions.get_task_history = AsyncMock(
        return_value=[{"role": "user", "content": "[page-owner]: stored question"}])
    bot.llm_gateway.active_client = MagicMock()
    bot.prompt_builder.build_full_prompt = MagicMock(return_value="system prompt")
    bot.delivery.set_status = AsyncMock()
    bot.turn_recorder._new_context_trace = MagicMock(return_value=None)
    bot.tool_loop.run = AsyncMock(side_effect=run)
    return bot


class TestWebTurn:
    async def test_files_reach_the_turn_as_discord_attachments_do(self, tmp_path):
        store = _store(tmp_path)
        note = await store.receive(OWNER, FakePart(b"disk is 85% full", "status.txt"))
        photo = await store.receive(OWNER, FakePart(PNG, "screen.png", "image/png"))
        seen = {}

        async def run(message, history, **kwargs):
            seen["history"] = history
            return ("Looked at both.", False, False, [], False)

        bot = _chat_bot(tmp_path, run)
        result = await web_chat.process_web_chat(
            bot, "what do these show?", OWNER, user_id=OWNER, username=OWNER,
            attachments=[note.upload_id, photo.upload_id], upload_store=store)
        assert result["response"] == "Looked at both."
        stored = bot.sessions.add_unique_message.call_args_list[0].args[2]
        assert stored.startswith(f"[{OWNER}]: what do these show?\n\n")
        assert "disk is 85% full" in stored and "[User shared image: screen.png]" in stored
        last = seen["history"][-1]
        assert last["content"][0]["type"] == "image"
        assert last["content"][-1] == {"type": "text", "text": "[page-owner]: stored question"}
        assert not note.path.exists() and not photo.path.exists()

    async def test_a_question_that_cannot_run_claims_nothing(self, tmp_path):
        store = _store(tmp_path)
        upload = await store.receive(OWNER, FakePart(b"a"))
        bot = _chat_bot(tmp_path, AsyncMock())
        bot.sessions.has_message_id = MagicMock(return_value=True)
        with pytest.raises(web_chat.ChatMessageIdError):
            await web_chat.process_web_chat(bot, "", OWNER, user_id=OWNER, message_id="used",
                                            attachments=[upload.upload_id], upload_store=store)
        bot.sessions.has_message_id = MagicMock(return_value=False)
        bot.llm_gateway.active_client = None
        result = await web_chat.process_web_chat(bot, "hi", OWNER, user_id=OWNER,
                                                 attachments=[upload.upload_id],
                                                 upload_store=store)
        assert result["is_error"] and upload.state == "staged" and upload.path.exists()

    async def test_another_identitys_file_is_refused_before_the_question_is_stored(
        self, tmp_path,
    ):
        store = _store(tmp_path)
        theirs = await store.receive("someone-else", FakePart(b"private"))
        bot = _chat_bot(tmp_path, AsyncMock())
        with pytest.raises(UploadError):
            await web_chat.process_web_chat(bot, "", OWNER, user_id=OWNER,
                                            attachments=[theirs.upload_id], upload_store=store)
        bot.sessions.add_unique_message.assert_not_called()
        assert theirs.state == "staged"

    async def test_a_processing_failure_returns_the_files_unused(self, tmp_path):
        store = _store(tmp_path)
        upload = await store.receive(OWNER, FakePart(b"a"))
        bot = _chat_bot(tmp_path, AsyncMock())
        with patch("src.discord.intake_pipeline.process_message_attachments",
                   AsyncMock(side_effect=RuntimeError("disk error"))):
            with pytest.raises(RuntimeError):
                await web_chat.process_web_chat(bot, "x", OWNER, user_id=OWNER,
                                                attachments=[upload.upload_id],
                                                upload_store=store)
        assert upload.state == "staged" and upload.path.exists()

    async def test_a_stateless_request_takes_no_attachments(self, tmp_path):
        store = _store(tmp_path)
        upload = await store.receive(OWNER, FakePart(b"a"))
        with pytest.raises(UploadError):
            await web_chat.process_web_chat(
                _chat_bot(tmp_path, AsyncMock()), "x", "exec-1", user_id=OWNER,
                ephemeral=True, persist_channel_lock=False,
                attachments=[upload.upload_id], upload_store=store)
        assert upload.state == "staged"


class TestWebSocketChat:
    def _manager(self, store):
        from src.web.websocket import WebSocketManager

        manager = WebSocketManager(SimpleNamespace(name="odin"))
        manager.upload_store = store
        manager._policy_authorized = lambda ws: True
        return manager

    def _socket(self):
        return SimpleNamespace(closed=False, send_json=AsyncMock(), _odin_identity=_identity())

    async def test_a_socket_question_carries_its_attachments(self, tmp_path):
        store = _store(tmp_path)
        manager, ws, seen = self._manager(store), self._socket(), {}

        async def fake_process(*args, **kwargs):
            seen.update(kwargs)
            return {"response": "ok", "tools_used": [], "is_error": False}

        with patch("src.web.websocket.process_web_chat", fake_process):
            await manager._handle_chat_scoped(ws, {"type": "chat", "attachments": ["a" * 32]})
        assert seen["attachments"] == ["a" * 32] and seen["upload_store"] is store
        assert ws.send_json.await_args.args[0]["type"] == "chat_response"

    async def test_bad_attachments_and_refused_claims_are_chat_errors(self, tmp_path):
        manager, ws = self._manager(_store(tmp_path)), self._socket()
        await manager._handle_chat_scoped(ws, {"type": "chat", "attachments": "a" * 32})
        assert "upload ids" in ws.send_json.await_args.args[0]["error"]

        async def refuse(*args, **kwargs):
            raise UploadError("An attached file is unknown, expired or already sent.", 409)

        with patch("src.web.websocket.process_web_chat", refuse):
            await manager._handle_chat_scoped(ws, {"type": "chat", "attachments": ["a" * 32]})
        error = ws.send_json.await_args.args[0]
        assert error == {"type": "chat_error",
                         "error": "An attached file is unknown, expired or already sent."}


# What aiohttp's reader raises for a body it can't parse, by category, and what
# it never does: whatever an installed aiohttp handles itself (review R13).
_PARSE_ERRORS = [
    ValueError("Could not find starting boundary"),
    UnicodeDecodeError("utf-8", b"\xff", 0, 1, "invalid start byte"),
    LookupError("unknown encoding: bogus-cs"),
    AssertionError("Chunk size must be greater or equal than boundary length + 2"),
    InvalidHeader("not a header line"),
]
_NOT_PARSE_ERRORS = [
    RuntimeError("ours"), OSError("disk"), TimeoutError(), asyncio.CancelledError(),
]


def _name(error):
    return type(error).__name__


class _HeaderPart:
    """A part whose name or filename the reader fails to decode."""

    headers: dict = {"Content-Type": "text/plain"}

    def __init__(self, field, error):
        self._field, self._error = field, error

    @property
    def name(self):
        if self._field == "name":
            raise self._error
        return "file"

    @property
    def filename(self):
        if self._field == "filename":
            raise self._error
        return "a.txt"


class TestParserBoundary:
    @pytest.mark.parametrize("error", _PARSE_ERRORS, ids=_name)
    async def test_a_reader_step_that_refuses_the_body_is_malformed(self, error):
        async def step():
            raise error

        with pytest.raises(MalformedMultipartError) as raised:
            await _parsed(step())
        assert raised.value.__cause__ is error

    @pytest.mark.parametrize("error", _NOT_PARSE_ERRORS, ids=_name)
    async def test_anything_else_passes_through_unchanged(self, error):
        async def step():
            raise error

        with pytest.raises(type(error)) as raised:
            await _parsed(step())
        assert raised.value is error

    @pytest.mark.parametrize("field", ["name", "filename"])
    @pytest.mark.parametrize("error", _PARSE_ERRORS, ids=_name)
    def test_a_header_field_the_reader_cant_decode_is_malformed(self, field, error):
        with pytest.raises(MalformedMultipartError) as raised:
            _FilePart(_HeaderPart(field, error))  # type: ignore[arg-type]
        assert raised.value.__cause__ is error

    @pytest.mark.parametrize("error", _PARSE_ERRORS, ids=_name)
    async def test_a_read_the_reader_refuses_is_malformed_and_nothing_is_kept(
        self, tmp_path, error,
    ):
        store = _store(tmp_path)
        part = FakePart(b"x" * 20)
        reads = part.read_chunk

        async def read_chunk(size):
            if len(part._data) < 10:
                raise error
            return await reads(size)

        part.read_chunk = read_chunk
        part.name = "file"
        with pytest.raises(MalformedMultipartError):
            await store.receive(OWNER, _FilePart(part))  # type: ignore[arg-type]
        assert list((tmp_path / "uploads").iterdir()) == []
        assert store._usage(None) == (0, 0)

    async def test_a_read_that_fails_mid_file_through_the_route_keeps_nothing(
        self, tmp_path, monkeypatch,
    ):
        store = _store(tmp_path)
        real = BodyPartReader.read_chunk
        reads = {"n": 0}

        async def failing_second_read(self, size=BodyPartReader.chunk_size):
            reads["n"] += 1
            if reads["n"] == 2:
                raise InvalidHeader("the body broke mid-file")
            return await real(self, size)

        monkeypatch.setattr(BodyPartReader, "read_chunk", failing_second_read)
        async with TestClient(TestServer(_app(store))) as client:
            form = FormData()
            form.add_field("file", b"x" * 200_000, filename="big.bin")
            response = await client.post("/api/chat/uploads", data=form)
            assert (response.status, await response.json()) == (400, MALFORMED)
            assert reads["n"] == 2
            assert list((tmp_path / "uploads").iterdir()) == []
            assert store._usage(None) == (0, 0)
            form = FormData()
            form.add_field("file", b"fine", filename="ok.txt")
            assert (await client.post("/api/chat/uploads", data=form)).status == 201
