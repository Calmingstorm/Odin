"""Coverage for src/tools/handlers/files_docs.py (RFC-006 P6).

read_file / write_file run shell over _run_on_host (AsyncMock — no host touched);
_parse_page_range is pure logic; analyze_pdf's fitz (PyMuPDF, not installed here)
is injected as a fake module and aiohttp is faked, so no PDF library, network, or
SSH is required.
"""
from __future__ import annotations

import base64
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from src.tools.handlers.files_docs import FilesDocsTools


def _tools(run_ret="file contents", govern=(True, "", None),
           resolve=("1.2.3.4", "root", "linux"), exec_ret=(0, "")):
    t = FilesDocsTools.__new__(FilesDocsTools)
    t._run_on_host = AsyncMock(return_value=run_ret)
    t._govern_command = MagicMock(return_value=govern)
    t._resolve_host = lambda host: resolve
    t._exec_command = AsyncMock(return_value=exec_ret)
    return t


# --- fake fitz + aiohttp -------------------------------------------------- #
class _FakeDoc:
    def __init__(self, pages):
        self._pages = pages
        self.page_count = len(pages)

    def __getitem__(self, i):
        return SimpleNamespace(get_text=lambda: self._pages[i])

    def close(self):
        pass


def _fake_fitz(pages=None, error=None):
    def _open(**kw):
        if error:
            raise error
        return _FakeDoc(pages if pages is not None else ["page one text"])
    return SimpleNamespace(open=_open)


class _Resp:
    def __init__(self, status=200, data=b"%PDF-1.4 fake"):
        self.status = status
        self._data = data

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

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


class TestReadFile:
    async def test_validation(self):
        assert "'path' is required" in await _tools()._handle_read_file({"host": "h"})
        assert "'host' is required" in await _tools()._handle_read_file({"path": "/p"})

    async def test_success_and_bad_lines(self):
        t = _tools()
        out = await t._handle_read_file({"path": "/etc/x", "host": "h", "lines": "notanint"})
        assert out == "file contents"
        assert "head -n 200" in t._run_on_host.call_args.args[1]  # bad → default 200
        await t._handle_read_file({"path": "/etc/x", "host": "h", "lines": 5000})
        assert "head -n 1000" in t._run_on_host.call_args.args[1]  # clamped to 1000


class TestWriteFile:
    async def test_validation(self):
        assert "'path' is required" in await _tools()._handle_write_file(
            {"host": "h", "content": "c"})
        assert "'content' is required" in await _tools()._handle_write_file(
            {"path": "/p", "host": "h"})
        assert "'host' is required" in await _tools()._handle_write_file(
            {"path": "/p", "content": "c"})

    async def test_governor_denies(self):
        t = _tools(govern=(False, "DENIED: sensitive path", None))
        out = await t._handle_write_file({"path": "/etc/passwd", "host": "h", "content": "x"})
        assert out == "DENIED: sensitive path"

    async def test_success_encodes_content(self):
        t = _tools()
        out = await t._handle_write_file({"path": "/tmp/f", "host": "h", "content": "hello"})
        assert out == "file contents"
        # content is base64-encoded into the command
        assert base64.b64encode(b"hello").decode() in t._run_on_host.call_args.args[1]


class TestParsePageRange:
    def test_range_single_and_fallbacks(self):
        f = FilesDocsTools._parse_page_range
        assert f("2-4", 10) == [1, 2, 3]
        assert f("3", 10) == [2]
        assert f("99", 10) == list(range(10))       # out of range → all
        assert f("a-b", 10) == list(range(10))       # unparseable range → all
        assert f("notanint", 10) == list(range(10))  # unparseable single → all


class TestAnalyzePdf:
    async def test_url_scheme_and_ssrf(self):
        assert "http://" in await _tools()._handle_analyze_pdf({"url": "ftp://x"})
        with patch("src.tools.url_safety.is_url_blocked", return_value=True):
            assert "blocked URL" in await _tools()._handle_analyze_pdf(
                {"url": "http://169.254.169.254/x"})

    async def test_url_success_and_http_error(self):
        with patch.dict(sys.modules, {"fitz": _fake_fitz(pages=["hello pdf"])}), \
             patch("src.tools.url_safety.is_url_blocked", return_value=False):
            with patch("aiohttp.ClientSession", return_value=_Session(_Resp(200))):
                out = await _tools()._handle_analyze_pdf({"url": "http://ok/doc.pdf"})
                assert "Page 1" in out and "hello pdf" in out
            with patch("aiohttp.ClientSession", return_value=_Session(_Resp(404))):
                assert "HTTP 404" in await _tools()._handle_analyze_pdf(
                    {"url": "http://ok/doc.pdf"})
            with patch("aiohttp.ClientSession", side_effect=RuntimeError("neterr")):
                assert "Failed to fetch PDF" in await _tools()._handle_analyze_pdf(
                    {"url": "http://ok/doc.pdf"})

    async def test_host_path(self):
        b64 = base64.b64encode(b"%PDF fake").decode()
        with patch.dict(sys.modules, {"fitz": _fake_fitz(pages=["from host"])}):
            t = _tools(exec_ret=(0, b64))
            out = await t._handle_analyze_pdf({"host": "srv", "path": "/doc.pdf"})
            assert "from host" in out

    async def test_host_path_errors(self):
        with patch.dict(sys.modules, {"fitz": _fake_fitz()}):
            assert "Unknown or disallowed host" in await _tools(
                resolve=None)._handle_analyze_pdf({"host": "h", "path": "/p"})
            assert "Failed to read PDF from host" in await _tools(
                exec_ret=(1, "denied"))._handle_analyze_pdf({"host": "s", "path": "/p"})
            # malformed base64 (wrong padding) → decode raises → handled
            assert "Failed to decode PDF" in await _tools(
                exec_ret=(0, "YQ"))._handle_analyze_pdf({"host": "s", "path": "/p"})

    async def test_neither_source(self):
        with patch.dict(sys.modules, {"fitz": _fake_fitz()}):
            assert "Provide either" in await _tools()._handle_analyze_pdf({})

    async def test_open_failure(self):
        b64 = base64.b64encode(b"garbage").decode()
        with patch.dict(sys.modules, {"fitz": _fake_fitz(error=RuntimeError("bad pdf"))}):
            assert "Failed to open PDF" in await _tools(
                exec_ret=(0, b64))._handle_analyze_pdf({"host": "s", "path": "/p"})

    async def test_page_selection_and_empty(self):
        b64 = base64.b64encode(b"x").decode()
        with patch.dict(sys.modules, {"fitz": _fake_fitz(pages=["one", "two", "three"])}):
            out = await _tools(exec_ret=(0, b64))._handle_analyze_pdf(
                {"host": "s", "path": "/p", "pages": "2"})
            assert "Page 2" in out and "two" in out and "Page 1" not in out
        # a 0-page doc yields no parts → empty result → the no-text fallback
        with patch.dict(sys.modules, {"fitz": _fake_fitz(pages=[])}):
            out = await _tools(exec_ret=(0, b64))._handle_analyze_pdf(
                {"host": "s", "path": "/p"})
            assert "no extractable text" in out

    async def test_truncation(self):
        b64 = base64.b64encode(b"x").decode()
        with patch.dict(sys.modules, {"fitz": _fake_fitz(pages=["x" * 13000])}):
            out = await _tools(exec_ret=(0, b64))._handle_analyze_pdf(
                {"host": "s", "path": "/p"})
            assert "truncated" in out
