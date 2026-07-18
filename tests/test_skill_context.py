"""Coverage for src/tools/skill_context.py (RFC-006 P9).

SkillContext is the API surface handed to user skills — thin delegations to the
tool executor, callbacks, memory, config, HTTP, knowledge, and scheduler. Built
with a MagicMock executor + faked deps; memory is a real tmp file, HTTP uses a
fake aiohttp session (no network), and is_url_blocked is patched for
determinism (no DNS).
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from src.tools.skill_context import (
    MAX_SKILL_HTTP_REQUESTS,
    MAX_SKILL_MESSAGES,
    MAX_SKILL_TOOL_CALLS,
    ResourceTracker,
    SkillContext,
    is_path_denied,
    set_skill_allowed_urls,
)


def _ctx(tmp_path=None, **kw):
    ex = MagicMock()
    ex.execute = AsyncMock(return_value="tool output")
    ex._run_on_host = AsyncMock(return_value=("cmd output", 0))
    ex.config = SimpleNamespace(hosts={"srv": {}})
    mem = str(tmp_path / "mem.json") if tmp_path else None
    kw.setdefault("tool_executor", ex)
    return SkillContext(skill_name="testskill", memory_path=mem, **kw)


class _Resp:
    def __init__(self, content_type="application/json", json_data=None, text="", data=b""):
        self.content_type = content_type
        self._json = json_data if json_data is not None else {}
        self._text = text
        self._data = data

    async def json(self):
        return self._json

    async def text(self):
        return self._text

    async def read(self):
        return self._data

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


class _Session:
    def __init__(self, resp):
        self._resp = resp

    def get(self, *a, **k):
        return self._resp

    def post(self, *a, **k):
        return self._resp

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


# --------------------------------------------------------------------------- #
# module helpers
# --------------------------------------------------------------------------- #
class TestHelpers:
    def test_is_path_denied(self):
        assert is_path_denied("/opt/odin/.env")
        assert is_path_denied("/home/x/config.yml")
        assert is_path_denied("/root/.ssh/id_ed25519")
        assert is_path_denied("/etc/shadow")
        assert not is_path_denied("/tmp/notes.txt")

    def test_resource_tracker(self):
        t = ResourceTracker()
        t.http_requests = 3
        d = t.to_dict()
        assert d["http_requests"] == 3

    def test_set_skill_allowed_urls(self):
        set_skill_allowed_urls(["https://api.example.com"])
        try:
            from src.tools import skill_context
            assert "https://api.example.com" in skill_context._SKILL_ALLOWED_URLS
        finally:
            set_skill_allowed_urls([])

    def test_is_url_blocked_real(self):
        from src.tools.skill_context import is_url_blocked
        assert is_url_blocked("http://localhost:8080/x") is True  # loopback → blocked

    def test_save_memory_no_path_is_noop(self):
        _ctx()._save_memory({"k": "v"})  # no memory_path → early return, no raise


# --------------------------------------------------------------------------- #
# host / prometheus / file
# --------------------------------------------------------------------------- #
class TestHostAndFile:
    async def test_run_on_host_tuple_and_str(self, tmp_path):
        c = _ctx(tmp_path)
        assert await c.run_on_host("srv", "uname") == "cmd output"  # tuple → [0]
        c._executor._run_on_host = AsyncMock(return_value="denied: unknown host")
        assert await c.run_on_host("bad", "x") == "denied: unknown host"

    async def test_query_prometheus(self, tmp_path):
        c = _ctx(tmp_path)
        assert "curl" not in await c.query_prometheus("up")  # returns execute result
        c._executor.config = SimpleNamespace(hosts={})
        assert "No hosts" in await c.query_prometheus("up")

    async def test_read_file(self, tmp_path):
        c = _ctx(tmp_path)
        assert await c.read_file("srv", "/tmp/x.txt") == "tool output"
        assert "Access denied" in await c.read_file("srv", "/opt/odin/.env")  # denied path


# --------------------------------------------------------------------------- #
# messaging with tracker limits
# --------------------------------------------------------------------------- #
class TestMessaging:
    async def test_post_message(self):
        sent = []
        c = _ctx(message_callback=AsyncMock(side_effect=lambda t: sent.append(t)))
        await c.post_message("hi")
        assert sent == ["hi"] and c._tracker.messages_sent == 1
        # over the limit → silently dropped
        c._tracker.messages_sent = MAX_SKILL_MESSAGES
        await c.post_message("dropped")
        assert "dropped" not in sent

    async def test_post_message_no_callback(self):
        c = _ctx()  # no message_callback → warns, no-op
        await c.post_message("x")

    async def test_post_file(self):
        got = []
        c = _ctx(file_callback=AsyncMock(side_effect=lambda d, f, cap: got.append(f)))
        await c.post_file(b"data", "out.txt", "cap")
        assert got == ["out.txt"]
        c._tracker.files_sent = 999
        await c.post_file(b"x", "nope.txt")
        assert "nope.txt" not in got

    async def test_post_file_no_callback(self):
        await _ctx().post_file(b"x", "f.txt")  # no file_callback → warns, no-op


# --------------------------------------------------------------------------- #
# memory + config
# --------------------------------------------------------------------------- #
class TestMemoryConfig:
    def test_remember_recall(self, tmp_path):
        c = _ctx(tmp_path)
        c.remember("k", "v")
        assert c.recall("k") == "v" and c.recall("missing") is None

    def test_remember_no_path(self):
        c = _ctx()  # no memory_path → no-op
        c.remember("k", "v")
        assert c.recall("k") is None

    def test_load_memory_bad_json(self, tmp_path):
        c = _ctx(tmp_path)
        (tmp_path / "mem.json").write_text("not json")
        assert c._load_memory() == {}

    def test_config_and_hosts(self, tmp_path):
        c = _ctx(tmp_path, skill_config={"a": 1})
        assert c.get_config("a") == 1 and c.get_config("z", "def") == "def"
        assert c.get_all_config() == {"a": 1}
        assert c.get_hosts() == ["srv"] and c.get_services() == []

    def test_log(self, tmp_path):
        _ctx(tmp_path).log("a message")  # must not raise


# --------------------------------------------------------------------------- #
# HTTP (fake session, is_url_blocked patched)
# --------------------------------------------------------------------------- #
class TestHttp:
    async def test_get_blocked_and_limit(self):
        c = _ctx()
        with patch("src.tools.skill_context.is_url_blocked", return_value=True):
            assert "Access denied" in await c.http_get("http://localhost")
        with patch("src.tools.skill_context.is_url_blocked", return_value=False):
            c._tracker.http_requests = MAX_SKILL_HTTP_REQUESTS
            assert "limit" in await c.http_get("http://ok")

    async def test_get_and_post_redirect_blocked(self):
        # A redirect hop that targets a blocked address surfaces as
        # BlockedAddressError from safe_fetch; both http_get and http_post map
        # it to the "Access denied" refusal (pre-flight is_url_blocked passes).
        from src.tools.safe_fetch import BlockedAddressError

        async def _blocked(url, **kw):
            raise BlockedAddressError("redirect to private")

        c = _ctx()
        with patch("src.tools.skill_context.is_url_blocked", return_value=False):
            with patch("src.tools.safe_fetch.safe_fetch", _blocked):
                assert "Access denied" in await c.http_get("http://ok")
            with patch("src.tools.safe_fetch.safe_fetch", _blocked):
                assert "Access denied" in await c.http_post("http://ok", json={"a": 1})

    async def test_get_json_bytes_text(self):
        # http_get now routes through safe_fetch (its pre-flight is_url_blocked
        # check is unchanged and still patched here).
        from src.tools.safe_fetch import SafeFetchResponse

        def _ff(ct, body):
            if isinstance(body, str):
                body = body.encode()

            async def _f(url, **kw):
                return SafeFetchResponse(200, {}, body, ct, url, "")

            return _f

        c = _ctx()
        with patch("src.tools.skill_context.is_url_blocked", return_value=False):
            with patch("src.tools.safe_fetch.safe_fetch", _ff("application/json", '{"ok": 1}')):
                assert (await c.http_get("http://ok"))["ok"] == 1
            with patch("src.tools.safe_fetch.safe_fetch", _ff("image/png", b"\x89PNG")):
                assert await c.http_get("http://ok") == b"\x89PNG"
            with patch("src.tools.safe_fetch.safe_fetch", _ff("text/plain", "plain text")):
                assert await c.http_get("http://ok") == "plain text"
            with patch("src.tools.safe_fetch.safe_fetch", _ff("text/plain", '{"j": 2}')):
                # text that parses as json; also passes custom headers (merged)
                assert (await c.http_get("http://ok", headers={"X-K": "v"}))["j"] == 2

    async def test_post(self):
        from src.tools.safe_fetch import SafeFetchResponse

        def _ff(ct, body):
            if isinstance(body, str):
                body = body.encode()

            async def _f(url, **kw):
                return SafeFetchResponse(200, {}, body, ct, url, "")

            return _f

        c = _ctx()
        with patch("src.tools.skill_context.is_url_blocked", return_value=True):
            assert "Access denied" in await c.http_post("http://localhost")
        with patch("src.tools.skill_context.is_url_blocked", return_value=False):
            with patch("src.tools.safe_fetch.safe_fetch", _ff("application/json", '{"r": 1}')):
                assert (await c.http_post("http://ok", json={"a": 1},
                                          headers={"X-K": "v"}))["r"] == 1  # custom headers merged
            with patch("src.tools.safe_fetch.safe_fetch", _ff("text/plain", "posted")):
                assert await c.http_post("http://ok", data="x") == "posted"
            c._tracker.http_requests = MAX_SKILL_HTTP_REQUESTS
            assert "limit" in await c.http_post("http://ok")


# --------------------------------------------------------------------------- #
# knowledge / history / scheduler / execute_tool
# --------------------------------------------------------------------------- #
class TestDelegations:
    async def test_knowledge_and_history_disabled(self):
        c = _ctx()  # no store/embedder/session_manager
        assert await c.search_knowledge("q") == []
        assert await c.ingest_document("txt", "src") == 0
        assert await c.search_history("q") == []

    async def test_knowledge_enabled(self):
        store = MagicMock()
        store.search_hybrid = AsyncMock(return_value=[{"content": "x"}])
        store.ingest = AsyncMock(return_value=3)
        sm = MagicMock()
        sm.search_history = AsyncMock(return_value=[{"type": "user"}])
        c = _ctx(knowledge_store=store, embedder=object(), session_manager=sm)
        assert (await c.search_knowledge("q"))[0]["content"] == "x"
        assert await c.ingest_document("t", "s") == 3
        assert (await c.search_history("q"))[0]["type"] == "user"

    async def test_scheduler_disabled(self):
        c = _ctx()
        assert await c.schedule_task("d", "reminder", "1") is None
        assert c.list_schedules() == []
        assert await c.update_schedule("S1") is None
        assert await c.delete_schedule("S1") is False

    async def test_scheduler_enabled(self):
        sch = MagicMock()
        sch.add = AsyncMock(return_value={"id": "S1"})
        sch.list_all.return_value = [{"id": "S1"}]
        sch.update = AsyncMock(return_value={"id": "S1"})
        sch.delete = AsyncMock(return_value=True)
        c = _ctx(scheduler=sch)
        assert (await c.schedule_task("d", "reminder", "1"))["id"] == "S1"
        assert c.list_schedules()[0]["id"] == "S1"
        assert (await c.update_schedule("S1", cron="* * * * *"))["id"] == "S1"
        assert await c.delete_schedule("S1") is True

    async def test_execute_tool(self):
        c = _ctx()
        # blocked (not in SKILL_SAFE_TOOLS)
        assert "not allowed" in await c.execute_tool("run_command", {"command": "rm"})
        # allowed
        assert await c.execute_tool("web_search", {"q": "x"}) == "tool output"
        # read_file with denied path
        assert "Access denied" in await c.execute_tool("read_file", {"path": "/opt/odin/.env"})
        # over the call limit
        c._tracker.tool_calls = MAX_SKILL_TOOL_CALLS
        assert "limit" in await c.execute_tool("web_search", {})
