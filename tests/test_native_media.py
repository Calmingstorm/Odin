"""Coverage for src/discord/native_tools/media.py (RFC-006 P5).

Drives the media/file handlers on MediaTools with every external boundary faked
hard: no browser, no SSH subprocess, no aiohttp fetch, no ComfyUI. discord.File
is real (BytesIO), channel.send is an AsyncMock; the handlers return strings (or
the __image_block__ marker dict for analyze_image).
"""
from __future__ import annotations

import base64
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import discord
from src.discord.native_tools.media import MediaTools

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def _http_exc(status=500):
    return discord.HTTPException(
        SimpleNamespace(status=status, reason="err"), "msg")  # type: ignore[arg-type]


def _config(comfy_enabled=True):
    return SimpleNamespace(
        comfyui=SimpleNamespace(enabled=comfy_enabled, url="http://localhost:8188",
                                default_checkpoint="sd.safetensors"),
        tools=SimpleNamespace(ssh_key_path="/k", ssh_known_hosts_path="/kh"),
    )


def _executor(resolve=("1.2.3.4", "root", "linux"), exec_ret=(0, "")):
    ex = MagicMock()
    ex._resolve_host = MagicMock(return_value=resolve)
    ex._exec_command = AsyncMock(return_value=exec_ret)
    return ex


def _tools(config=None, browser_manager=None, tool_executor=None, image_selector=None):
    return MediaTools(
        get_config=lambda: config or _config(),
        browser_manager=browser_manager,
        tool_executor=tool_executor or _executor(),
        image_selector=image_selector,
    )


def _message():
    m = MagicMock()
    m.channel.send = AsyncMock()
    return m


class _Resp:
    def __init__(self, status=200, ct="image/png", data=PNG):
        self.status = status
        self.headers = {"Content-Type": ct}
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


class TestDetectImageType:
    def test_all_formats(self):
        assert MediaTools._detect_image_type(PNG) == "image/png"
        assert MediaTools._detect_image_type(b"\xff\xd8abc") == "image/jpeg"
        assert MediaTools._detect_image_type(b"GIF89a") == "image/gif"
        assert MediaTools._detect_image_type(b"RIFF" + b"\x00" * 4 + b"WEBP") == "image/webp"
        assert MediaTools._detect_image_type(b"nope1234") is None


class TestBrowserScreenshot:
    async def test_disabled(self):
        assert "not enabled" in await _tools()._handle_browser_screenshot(_message(), {})

    async def test_success_and_error(self):
        t = _tools(browser_manager=MagicMock())
        msg = _message()
        with patch("src.tools.browser.handle_browser_screenshot",
                   new=AsyncMock(return_value=("shot taken", PNG))):
            assert await t._handle_browser_screenshot(msg, {}) == "shot taken"
            msg.channel.send.assert_awaited_once()
        with patch("src.tools.browser.handle_browser_screenshot",
                   new=AsyncMock(side_effect=RuntimeError("x"))):
            assert "failed" in await t._handle_browser_screenshot(msg, {})


class TestGenerateFile:
    async def test_success(self):
        msg = _message()
        out = await _tools()._handle_generate_file(
            msg, {"filename": "a.txt", "content": "hello", "caption": "cap"})
        assert "`a.txt`" in out and "5 bytes" in out
        msg.channel.send.assert_awaited_once()

    async def test_send_failure(self):
        msg = _message()
        msg.channel.send = AsyncMock(side_effect=RuntimeError("nope"))
        assert "Failed to post file" in await _tools()._handle_generate_file(
            msg, {"content": "x"})


class TestPostFile:
    async def test_validation_and_unknown_host(self):
        assert "required" in await _tools()._handle_post_file(_message(), {"host": "h"})
        t = _tools(tool_executor=_executor(resolve=None))
        assert "Unknown or disallowed host" in await t._handle_post_file(
            _message(), {"host": "h", "path": "/p"})

    async def test_local_read(self, tmp_path):
        f = tmp_path / "f.bin"
        f.write_bytes(b"data")
        msg = _message()
        with patch("src.tools.ssh.is_local_address", return_value=True):
            out = await _tools()._handle_post_file(msg, {"host": "localhost", "path": str(f)})
        assert "Posted `f.bin`" in out

    async def test_local_missing_and_errors(self, tmp_path):
        with patch("src.tools.ssh.is_local_address", return_value=True):
            assert "File not found" in await _tools()._handle_post_file(
                _message(), {"host": "localhost", "path": str(tmp_path / "nope")})
            with patch("builtins.open", side_effect=PermissionError):
                assert "Permission denied" in await _tools()._handle_post_file(
                    _message(), {"host": "localhost", "path": "/p"})
            with patch("builtins.open", side_effect=OSError("io")):
                assert "Failed to read file" in await _tools()._handle_post_file(
                    _message(), {"host": "localhost", "path": "/p"})

    async def test_remote_ssh(self, tmp_path):
        b64 = base64.b64encode(b"remote-bytes")
        proc = MagicMock()
        proc.communicate = AsyncMock(return_value=(b64, b""))
        proc.returncode = 0
        with patch("src.tools.ssh.is_local_address", return_value=False), \
             patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=proc)):
            out = await _tools()._handle_post_file(
                _message(), {"host": "srv", "path": "/etc/x"})
        assert "Posted `x`" in out

    async def test_remote_ssh_failure(self):
        proc = MagicMock()
        proc.communicate = AsyncMock(return_value=(b"", b"denied"))
        proc.returncode = 1
        with patch("src.tools.ssh.is_local_address", return_value=False), \
             patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=proc)):
            assert "Failed to fetch file" in await _tools()._handle_post_file(
                _message(), {"host": "srv", "path": "/p"})

    async def test_remote_timeout_and_generic_error(self):
        proc = MagicMock()
        proc.communicate = AsyncMock(side_effect=TimeoutError())
        with patch("src.tools.ssh.is_local_address", return_value=False), \
             patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=proc)):
            assert "timed out" in await _tools()._handle_post_file(
                _message(), {"host": "srv", "path": "/p"})
        proc.communicate = AsyncMock(side_effect=RuntimeError("boom"))
        with patch("src.tools.ssh.is_local_address", return_value=False), \
             patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=proc)):
            assert "Failed to fetch file" in await _tools()._handle_post_file(
                _message(), {"host": "srv", "path": "/p"})

    async def test_empty_file(self, tmp_path):
        empty = tmp_path / "empty.bin"
        empty.write_bytes(b"")
        with patch("src.tools.ssh.is_local_address", return_value=True):
            assert "not found or empty" in await _tools()._handle_post_file(
                _message(), {"host": "localhost", "path": str(empty)})

    async def test_too_large(self, tmp_path):
        big = tmp_path / "big.bin"
        big.write_bytes(b"\x00" * (25 * 1024 * 1024 + 1))
        with patch("src.tools.ssh.is_local_address", return_value=True):
            out = await _tools()._handle_post_file(
                _message(), {"host": "localhost", "path": str(big)})
        assert "too large" in out

    async def test_discord_http_error(self, tmp_path):
        f = tmp_path / "f.bin"
        f.write_bytes(b"data")
        msg = _message()
        msg.channel.send = AsyncMock(side_effect=_http_exc())
        with patch("src.tools.ssh.is_local_address", return_value=True):
            assert "Failed to upload to Discord" in await _tools()._handle_post_file(
                msg, {"host": "localhost", "path": str(f)})


class TestAnalyzeImage:
    async def test_url_scheme_and_ssrf(self):
        assert "http://" in await _tools()._handle_analyze_image(_message(), {"url": "ftp://x"})
        with patch("src.tools.url_safety.is_url_blocked", return_value=True):
            assert "URL blocked" in await _tools()._handle_analyze_image(
                _message(), {"url": "http://169.254.169.254"})

    async def test_url_fetch_variants(self):
        with patch("src.tools.url_safety.is_url_blocked", return_value=False):
            with patch("aiohttp.ClientSession", return_value=_Session(_Resp(status=404))):
                assert "HTTP 404" in await _tools()._handle_analyze_image(
                    _message(), {"url": "http://ok/img"})
            with patch("aiohttp.ClientSession",
                       return_value=_Session(_Resp(ct="text/html"))):
                assert "does not point to an image" in await _tools()._handle_analyze_image(
                    _message(), {"url": "http://ok/x"})
            with patch("aiohttp.ClientSession", return_value=_Session(_Resp())):
                out = await _tools()._handle_analyze_image(
                    _message(), {"url": "http://ok/img", "prompt": "what?"})
                assert isinstance(out, dict) and "__image_block__" in out
                assert out["__prompt__"] == "what?"
            with patch("aiohttp.ClientSession", side_effect=RuntimeError("neterr")):
                assert "Failed to fetch image" in await _tools()._handle_analyze_image(
                    _message(), {"url": "http://ok/x"})

    async def test_host_path(self):
        ex = _executor(exec_ret=(0, base64.b64encode(PNG).decode()))
        out = await _tools(tool_executor=ex)._handle_analyze_image(
            _message(), {"host": "srv", "path": "/img.png"})
        assert isinstance(out, dict) and "__image_block__" in out

    async def test_host_path_errors(self):
        assert "Unknown or disallowed host" in await _tools(
            tool_executor=_executor(resolve=None))._handle_analyze_image(
                _message(), {"host": "h", "path": "/p"})
        assert "Failed to read image" in await _tools(
            tool_executor=_executor(exec_ret=(1, "err")))._handle_analyze_image(
                _message(), {"host": "srv", "path": "/p"})

    async def test_host_path_decode_error_and_empty(self):
        # malformed base64 (wrong padding) from the host → decode raises → handled
        assert "Failed to decode" in await _tools(
            tool_executor=_executor(exec_ret=(0, "YQ")))._handle_analyze_image(
                _message(), {"host": "s", "path": "/p"})
        # empty output decodes to no bytes
        assert "No image data" in await _tools(
            tool_executor=_executor(exec_ret=(0, "")))._handle_analyze_image(
                _message(), {"host": "s", "path": "/p"})

    async def test_neither_source(self):
        assert "Provide either" in await _tools()._handle_analyze_image(_message(), {})

    async def test_size_and_format_limits(self):
        big = b"\x89PNG\r\n\x1a\n" + b"\x00" * (5 * 1024 * 1024)
        ex = _executor(exec_ret=(0, base64.b64encode(big).decode()))
        assert "exceeds 5MB" in await _tools(tool_executor=ex)._handle_analyze_image(
            _message(), {"host": "s", "path": "/p"})
        ex2 = _executor(exec_ret=(0, base64.b64encode(b"notanimage!!").decode()))
        assert "Unsupported image format" in await _tools(tool_executor=ex2)._handle_analyze_image(
            _message(), {"host": "s", "path": "/p"})


class TestGenerateImage:
    """The handler dispatches to the image selector and owns Discord posting;
    backend selection/wire behavior is covered in test_image_backends.py."""

    @staticmethod
    def _selector(result=None, error=None):
        sel = MagicMock()
        sel.generate = AsyncMock(return_value=result, side_effect=error)
        return sel

    @staticmethod
    def _result(backend="openai"):
        from src.tools.image import ImageResult

        return ImageResult(PNG, "image/png", 1024, 1024, backend, "gpt-image-2")

    async def test_no_selector_and_no_prompt(self):
        # No backend wired at all -> not available.
        no_sel = _tools()
        assert "not available" in await no_sel._handle_generate_image(_message(), {"prompt": "x"})
        # Selector present but missing prompt -> required.
        t = _tools(image_selector=self._selector(result=self._result()))
        assert "required" in await t._handle_generate_image(_message(), {})

    async def test_success_posts_attachment(self):
        sel = self._selector(result=self._result(backend="openai"))
        msg = _message()
        out = await _tools(image_selector=sel)._handle_generate_image(msg, {"prompt": "a cat"})
        # Generic user-facing string — the backend name is NOT surfaced there...
        assert "Image generated (1024x1024" in str(out)
        assert "openai" not in str(out).lower()
        msg.channel.send.assert_awaited_once()
        # ...but IS recorded in the (non-model-facing) audit metadata.
        assert out.audit_metadata["backend"] == "openai"
        assert out.audit_metadata["delivery_status"] == "posted"

    async def test_backend_failure_and_http_error(self):
        from src.tools.image import ImageGenError

        sel = self._selector(error=ImageGenError("no backend"))
        assert "failed" in await _tools(image_selector=sel)._handle_generate_image(
            _message(), {"prompt": "x"}
        )
        # Upload failure: generation ran, so the metadata still records the
        # backend with delivery_status=upload_failed.
        sel = self._selector(result=self._result(backend="comfyui"))
        msg = _message()
        msg.channel.send = AsyncMock(side_effect=_http_exc())
        out = await _tools(image_selector=sel)._handle_generate_image(msg, {"prompt": "x"})
        assert "Failed to upload generated" in str(out)
        assert out.audit_metadata["backend"] == "comfyui"
        assert out.audit_metadata["delivery_status"] == "upload_failed"

    async def test_unexpected_error_is_contained(self):
        # A non-ImageGenError must not leak a payload — generic catch-all.
        sel = self._selector(error=RuntimeError("raw provider blob"))
        out = await _tools(image_selector=sel)._handle_generate_image(
            _message(), {"prompt": "x"}
        )
        assert "unexpectedly" in out and "raw provider blob" not in out


def test_unwrap_native_result():
    # generate_image returns a ToolResult (audit_metadata); other native tools
    # return a plain string/dict. The tool_loop unwrapper handles both.
    from src.discord.tool_loop import _unwrap_native_result
    from src.tools.result_validator import ToolResult

    tr = ToolResult(output="hi", audit_metadata={"backend": "openai"})
    tool_result, out = _unwrap_native_result(tr)
    assert tool_result is tr and out == "hi"
    assert _unwrap_native_result("plain") == (None, "plain")
    block = {"__image_block__": 1}
    assert _unwrap_native_result(block) == (None, block)
