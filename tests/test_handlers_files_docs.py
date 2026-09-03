"""Coverage for src/tools/handlers/files_docs.py (RFC-006 P6).

read_file / apply_patch run shell over _run_on_host (AsyncMock — no host touched);
_parse_page_range is pure logic; analyze_pdf's fitz (PyMuPDF, not installed here)
is injected as a fake module and aiohttp is faked, so no PDF library, network, or
SSH is required.
"""
from __future__ import annotations

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
    # analyze_pdf reads host binaries directly (not via the text pipeline), so
    # it needs the ssh paths config exposes.
    t._deps = SimpleNamespace(
        config=lambda: SimpleNamespace(
            ssh_key_path="/dev/null", ssh_known_hosts_path="/dev/null"
        )
    )
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
        assert "absolute path" in await _tools()._handle_read_file(
            {"path": "relative.txt", "host": "h"}
        )

    async def test_invalid_ranges_fail_clearly_without_executing(self):
        for inp, fragment in (
            ({"lines": "notanint"}, "'lines' must be a positive integer"),
            ({"lines": 0}, "'lines' must be a positive integer"),
            ({"lines": -2}, "'lines' must be a positive integer"),
            ({"lines": 1001}, "'lines' must not exceed 1000"),
            ({"lines": True}, "'lines' must be a positive integer"),
            ({"start_line": "2"}, "'start_line' must be a positive"),
            ({"start_line": 0}, "'start_line' must be a positive"),
            ({"start_line": False}, "'start_line' must be a positive"),
            ({"start_line": 2**53}, "'start_line' must not exceed"),
            ({"raw": 1}, "'raw' must be a boolean"),
            ({"raw": "true"}, "'raw' must be a boolean"),
        ):
            t = _tools()
            out = await t._handle_read_file({"path": "/etc/x", "host": "h", **inp})
            assert fragment in out
            t._run_on_host.assert_not_awaited()

    async def test_defaults_and_requested_range_reach_source_bounded_command(self):
        t = _tools()
        assert await t._handle_read_file({"path": "/etc/x", "host": "h"}) == "file contents"
        command = t._run_on_host.call_args.args[1]
        assert "-v start=1" in command
        assert "-v start_label=n1" in command
        assert "-v count=200" in command
        assert "-v budget=10500" in command
        assert "returned %.0f-%.0f, continue at start_line=%.0f" in command
        assert "ODIN_READ_FILE_RAW_CONTENT_V1" not in command

        await t._handle_read_file(
            {"path": "/tmp/name with spaces", "host": "h", "start_line": 41, "lines": 17}
        )
        command = t._run_on_host.call_args.args[1]
        assert "-v start=41" in command
        assert "-v start_label=n41" in command
        assert "-v count=17" in command
        assert "< '/tmp/name with spaces'" in command

        await t._handle_read_file(
            {"path": "/tmp/name with spaces", "host": "h", "raw": True}
        )
        command = t._run_on_host.call_args.args[1]
        assert "LC_ALL=C awk" in command
        assert "ODIN_READ_FILE_RAW_META_V1" in command
        assert "base64 <" in command
        assert "tr -d" in command
        assert command.count("$(mktemp)") == 3
        assert 'chmod 600 -- "$metadata" "$body" "$encoded"' in command
        assert "$metadata.body" not in command
        assert "$metadata.encoded" not in command
        assert "-v count=200" in command
        assert "< '/tmp/name with spaces'" in command


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
        # analyze_pdf now downloads via the hardened safe_fetch transport; the
        # block surfaces as BlockedAddressError which the handler maps to its
        # "blocked URL" message. fitz is imported before the fetch, so fake it.
        from src.tools.safe_fetch import BlockedAddressError

        assert _failed(
            await _tools()._handle_analyze_pdf({"url": "ftp://x"}), "http://"
        )

        async def _blocked(url, **kw):
            raise BlockedAddressError("blocked")

        # Pass the pre-flight (public URL) so the block is raised by safe_fetch
        # itself (e.g. a redirect hop to a private address).
        with patch.dict(sys.modules, {"fitz": _fake_fitz()}), \
             patch("src.tools.url_safety.is_url_blocked", return_value=False), \
             patch("src.tools.safe_fetch.safe_fetch", _blocked):
            assert _failed(
                await _tools()._handle_analyze_pdf({"url": "http://example.com/x"}),
                "blocked URL",
            )

    async def test_url_preflight_block_before_fitz(self):
        # The pre-flight is_url_blocked check returns the block message even on
        # a host without PyMuPDF (it runs before the fitz import).
        with patch("src.tools.url_safety.is_url_blocked", return_value=True):
            assert _failed(
                await _tools()._handle_analyze_pdf(
                    {"url": "http://169.254.169.254/latest/meta-data"}
                ),
                "blocked URL",
            )

    async def test_url_success_and_http_error(self):
        from src.tools.safe_fetch import SafeFetchResponse

        def _ff(status=200, body=b"%PDF fake"):
            async def _f(url, **kw):
                return SafeFetchResponse(status, {}, body, "application/pdf", url, "")
            return _f

        async def _raise(url, **kw):
            raise RuntimeError("neterr")

        with patch.dict(sys.modules, {"fitz": _fake_fitz(pages=["hello pdf"])}):
            with patch("src.tools.safe_fetch.safe_fetch", _ff(200)):
                out = await _tools()._handle_analyze_pdf({"url": "http://ok/doc.pdf"})
                assert "Page 1" in out and "hello pdf" in out
            with patch("src.tools.safe_fetch.safe_fetch", _ff(404)):
                assert _failed(await _tools()._handle_analyze_pdf(
                    {"url": "http://ok/doc.pdf"}), "HTTP 404")
            with patch("src.tools.safe_fetch.safe_fetch", _raise):
                assert _failed(await _tools()._handle_analyze_pdf(
                    {"url": "http://ok/doc.pdf"}), "Failed to fetch PDF")

            from src.tools.safe_fetch import ResponseTooLargeError

            async def _too_big(url, **kw):
                raise ResponseTooLargeError("big")

            with patch("src.tools.safe_fetch.safe_fetch", _too_big):
                assert _failed(
                    await _tools()._handle_analyze_pdf({"url": "http://ok/doc.pdf"}),
                    "too large",
                )

    async def test_host_path(self):
        with patch.dict(sys.modules, {"fitz": _fake_fitz(pages=["from host"])}), _binary():
            out = await _tools()._handle_analyze_pdf({"host": "srv", "path": "/doc.pdf"})
            assert "from host" in out

    async def test_host_path_large_file(self):
        """The actual defect: a payload larger than the old 16,000-char text
        transport could carry. base64 crossed that at ~12,000 source bytes, so
        an ordinary 20KB PDF returned "Incorrect padding"."""
        big = b"%PDF" + b"x" * 20_000
        with patch.dict(sys.modules, {"fitz": _fake_fitz(pages=["big doc"])}), _binary(big):
            out = await _tools()._handle_analyze_pdf({"host": "srv", "path": "/big.pdf"})
            assert "big doc" in out

    async def test_host_read_error_is_reported(self):
        with patch.dict(sys.modules, {"fitz": _fake_fitz()}), _binary(error="denied"):
            assert _failed(
                await _tools()._handle_analyze_pdf({"host": "s", "path": "/p"}),
                "Failed to read PDF from host",
            )

    async def test_host_path_errors(self):
        with patch.dict(sys.modules, {"fitz": _fake_fitz()}):
            assert _failed(
                await _tools(resolve=None)._handle_analyze_pdf(
                    {"host": "h", "path": "/p"}
                ),
                "Unknown or disallowed host",
            )
            with _binary(error="denied"):
                assert _failed(
                    await _tools()._handle_analyze_pdf({"host": "s", "path": "/p"}),
                    "Failed to read PDF from host",
                )

    async def test_neither_source(self):
        with patch.dict(sys.modules, {"fitz": _fake_fitz()}):
            assert _failed(await _tools()._handle_analyze_pdf({}), "Provide either")

    async def test_open_failure(self):
        with patch.dict(
            sys.modules, {"fitz": _fake_fitz(error=RuntimeError("bad pdf"))}
        ), _binary(b"garbage"):
            assert _failed(
                await _tools()._handle_analyze_pdf({"host": "s", "path": "/p"}),
                "Failed to open PDF",
            )

    async def test_page_selection_and_empty(self):
        with patch.dict(
            sys.modules, {"fitz": _fake_fitz(pages=["one", "two", "three"])}
        ), _binary():
            out = await _tools()._handle_analyze_pdf(
                {"host": "s", "path": "/p", "pages": "2"})
            assert "Page 2" in out and "two" in out and "Page 1" not in out
        # a 0-page doc yields no parts → empty result → the no-text fallback
        with patch.dict(sys.modules, {"fitz": _fake_fitz(pages=[])}), _binary():
            out = await _tools()._handle_analyze_pdf(
                {"host": "s", "path": "/p"})
            assert "no extractable text" in out

    async def test_truncation(self):
        with patch.dict(sys.modules, {"fitz": _fake_fitz(pages=["x" * 13000])}), _binary():
            out = await _tools()._handle_analyze_pdf(
                {"host": "s", "path": "/p"})
            assert "truncated" in out


def _binary(data: bytes = b"%PDF fake", error: str = ""):
    """Patch the BINARY host-read path.

    analyze_pdf used to pull host files as base64 through the text exec
    pipeline, which truncates at 16,000 chars — so anything over ~12KB arrived
    corrupt. It now reads raw bytes, and these tests fake that path instead.
    """
    async def _read(address, path, **kwargs):
        return (None, error) if error else (data, "")

    return patch("src.tools.ssh.read_binary_file", _read)


def _failed(result, needle: str) -> bool:
    """A structured failure return: (message, nonzero_exit).

    analyze_pdf's failures used to be bare strings whose text matched none of
    the executor's error prefixes, so real failures were classified ok=True and
    audited as approved (adversarial review). Asserting the STATUS as well as
    the text is what pins that.
    """
    assert isinstance(result, tuple), f"expected a structured failure, got {result!r}"
    message, code = result
    assert code != 0, f"failure must carry a nonzero exit, got {code}"
    return needle in message


async def test_analyze_pdf_degrades_cleanly_without_pymupdf(monkeypatch):
    """find_spec proves the module is importable, not that its native library
    loads — and a direct call can reach the handler on an install whose catalog
    was built elsewhere. Either way the caller gets a clean, actionable result
    rather than a raw ImportError (v3.65.0 smoke test: "No module named 'fitz'").
    """
    import builtins

    real_import = builtins.__import__

    def _no_fitz(name, *args, **kwargs):
        if name == "fitz":
            raise ImportError("No module named 'fitz'")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", _no_fitz)

    tools = _tools()
    result = await tools._handle_analyze_pdf({"host": "localhost", "path": "/tmp/x.pdf"})
    assert _failed(result, "PDF support unavailable")
    message = result[0]
    assert "pdf" in message and "install" in message.lower(), "must name the remedy"
