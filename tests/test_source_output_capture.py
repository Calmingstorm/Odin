"""First-loss boundaries preserve evidence only inside retained delivery scopes."""

from __future__ import annotations

import asyncio
import json
import sys
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.tools import browser, ssh, web
from src.tools.handlers.files_docs import FilesDocsTools
from src.tools.result_capture import capture_active, result_capture
from src.tools.safe_fetch import SafeFetchResponse
from src.tools.tool_text import _truncate_lines


def _evidence() -> str:
    return "\n".join(f"line-{i:04}: " + "é漢" * 40 for i in range(500))


def test_capture_scope_is_nested_and_exception_safe():
    assert not capture_active()
    with result_capture():
        assert capture_active()
        with pytest.raises(RuntimeError), result_capture():
            raise RuntimeError("scope exited")
        assert capture_active()
    assert not capture_active()


async def test_capture_is_task_local():
    ready = asyncio.Event()
    done = asyncio.Event()

    async def scoped():
        with result_capture():
            ready.set()
            await done.wait()
            assert capture_active()

    task = asyncio.create_task(scoped())
    await ready.wait()
    assert not capture_active()
    done.set()
    await task


def test_legacy_character_and_line_limits_unchanged_outside_capture():
    full = _evidence()
    assert len(full) > 16000 and full.count("\n") > 200
    assert "output truncated" in ssh._truncate_output(full)
    assert "lines omitted" in _truncate_lines(full)
    with result_capture():
        assert ssh._truncate_output(full) == full
        assert _truncate_lines(full) == full
    assert ssh._truncate_output("short") == "short"
    assert _truncate_lines("short") == "short"


@pytest.mark.parametrize("remote", [False, True])
@pytest.mark.parametrize("streaming", [False, True])
async def test_command_source_preserves_middle_before_both_cuts(monkeypatch, remote, streaming):
    full = _evidence()
    reader = asyncio.StreamReader()
    reader.feed_data(full.encode())
    reader.feed_eof()
    proc = SimpleNamespace(
        stdout=reader,
        returncode=0,
        pid=12345,
        communicate=AsyncMock(return_value=(full.encode(), None)),
        wait=AsyncMock(return_value=0),
    )
    spawn = AsyncMock(return_value=proc)
    target = "create_subprocess_exec" if remote else "create_subprocess_shell"
    monkeypatch.setattr(asyncio, target, spawn)
    callback = AsyncMock() if streaming else None
    with result_capture():
        if remote:
            status, output = await ssh.run_ssh_command(
                "example.com", "fixture-command", "key", "known-hosts", on_output=callback
            )
        else:
            status, output = await ssh.run_local_command("fixture-command", on_output=callback)
        formatted = _truncate_lines(output)
    assert status == 0
    assert formatted == full
    assert "line-0250" in formatted
    assert spawn.await_count == 1
    if streaming:
        assert callback.await_count == 500


@pytest.mark.parametrize("content_type", ["text/plain", "text/html", "application/json"])
async def test_fetch_captures_full_transformed_source(monkeypatch, content_type):
    full = _evidence()
    body = f"<p>{full}</p>" if content_type == "text/html" else full
    fetch = AsyncMock(return_value=SafeFetchResponse(
        200, {}, body.encode(), content_type, "https://example.com", "OK"
    ))
    monkeypatch.setattr("src.tools.safe_fetch.safe_fetch", fetch)
    with result_capture():
        output = await web.fetch_url("https://example.com", max_chars=100)
    assert output == full
    assert fetch.await_count == 1
    legacy = await web.fetch_url("https://example.com", max_chars=100)
    assert legacy == full[:100] + "\n\n... (content truncated)"


def _browser_manager(full, mode):
    page = SimpleNamespace(
        goto=AsyncMock(), title=AsyncMock(return_value="Fixture"),
        inner_text=AsyncMock(return_value=full), url="https://example.com",
        evaluate=AsyncMock(side_effect=([["heading"], [full]], 1) if mode == "table" else None),
    )
    if mode == "evaluate":
        page.evaluate = AsyncMock(return_value={"evidence": full})

    @asynccontextmanager
    async def new_page():
        yield page

    return SimpleNamespace(new_page=new_page, allowed_urls=[]), page


@pytest.mark.parametrize("mode", ["page", "table", "evaluate"])
async def test_browser_sources_preserve_middle(monkeypatch, mode):
    full = _evidence()
    manager, page = _browser_manager(full, mode)
    handler = getattr(browser, f"handle_browser_{'read_' if mode != 'evaluate' else ''}{mode}")
    with result_capture():
        output = await handler(manager, {"url": "https://example.com", "expression": "fixture"})
    if mode == "evaluate":
        assert json.loads(output) == {"evidence": full}
    else:
        assert full in output
    assert "truncated" not in output
    assert page.goto.await_count == 1


async def test_pdf_preserves_all_extracted_pages_and_closes_document(monkeypatch):
    full = _evidence()
    close = SimpleNamespace(calls=0)

    class Document:
        page_count = 1

        def __getitem__(self, index):
            return SimpleNamespace(get_text=lambda: full)

        def close(self):
            close.calls += 1

    monkeypatch.setitem(sys.modules, "fitz", SimpleNamespace(open=lambda **kw: Document()))
    fetch = AsyncMock(return_value=SafeFetchResponse(
        200, {}, b"fixture pdf", "application/pdf", "https://example.com/doc.pdf", "OK"
    ))
    monkeypatch.setattr("src.tools.safe_fetch.safe_fetch", fetch)
    tools = FilesDocsTools.__new__(FilesDocsTools)
    with result_capture():
        output = await tools._handle_analyze_pdf({"url": "https://example.com/doc.pdf"})
    assert output == "## Page 1\n" + full
    assert fetch.await_count == 1
    assert close.calls == 1
