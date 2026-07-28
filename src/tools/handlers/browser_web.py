"""Browser & web handler domain — browser_read_page/read_table/click/fill/
evaluate, web_search, fetch_url, http_probe (RFC-004 P5, wave 2).

Bodies moved VERBATIM from executor.py; the only mechanical adjustment is
lazy relative imports re-anchored one level (``.browser`` → ``..browser``
etc.). Browser-session and static-HTTP tools deliberately share one module
(plan advisory #8 — don't split unless size forces it).
"""

from __future__ import annotations

from ..bulkhead import BulkheadFullError
from ..tool_text import _truncate_lines
from .deps import HandlerBase

_BROWSER_DISABLED = (
    "Browser automation is not enabled. Set browser.enabled=true in config."
)


class BrowserWebTools(HandlerBase):
    async def _browser_with_bulkhead(self, coro):
        """Wrap a browser coroutine with the browser bulkhead."""
        bh = self.bulkheads.get("browser")
        if bh:
            try:
                async with bh.acquire():
                    return await coro
            except BulkheadFullError:
                return "Error: browser bulkhead full — too many concurrent browser operations"
        return await coro

    async def _handle_browser_read_page(self, inp: dict) -> str | tuple[str, int]:
        if not self._browser_manager:
            return _BROWSER_DISABLED, 1
        from ..browser import handle_browser_read_page

        return await self._browser_with_bulkhead(
            handle_browser_read_page(self._browser_manager, inp)
        )

    async def _handle_browser_read_table(self, inp: dict) -> str | tuple[str, int]:
        if not self._browser_manager:
            return _BROWSER_DISABLED, 1
        from ..browser import handle_browser_read_table

        return await self._browser_with_bulkhead(
            handle_browser_read_table(self._browser_manager, inp)
        )

    async def _handle_browser_click(self, inp: dict) -> str | tuple[str, int]:
        if not self._browser_manager:
            return _BROWSER_DISABLED, 1
        from ..browser import handle_browser_click

        return await self._browser_with_bulkhead(handle_browser_click(self._browser_manager, inp))

    async def _handle_browser_fill(self, inp: dict) -> str | tuple[str, int]:
        if not self._browser_manager:
            return _BROWSER_DISABLED, 1
        from ..browser import handle_browser_fill

        return await self._browser_with_bulkhead(handle_browser_fill(self._browser_manager, inp))

    async def _handle_browser_evaluate(self, inp: dict) -> str | tuple[str, int]:
        if not self._browser_manager:
            return _BROWSER_DISABLED, 1
        from ..browser import handle_browser_evaluate

        return await self._browser_with_bulkhead(
            handle_browser_evaluate(self._browser_manager, inp)
        )

    # --- Web tools ---

    async def _handle_web_search(self, inp: dict) -> str:
        from ..web import web_search

        max_results = min(inp.get("max_results", 5), 10)
        return await web_search(inp["query"], max_results=max_results)

    async def _handle_fetch_url(self, inp: dict) -> str:
        from ..web import fetch_url

        return await fetch_url(inp["url"])

    async def _handle_http_probe(self, inp: dict) -> str | tuple[str, int]:
        from ..http_probe_ops import build_http_probe_command

        host = inp.get("host", "")
        if host:
            resolved = self._resolve_host(host)
            if not resolved:
                return f"Unknown or disallowed host: {host}"
            address, ssh_user, _os = resolved
        else:
            address = "127.0.0.1"
            ssh_user = "root"

        try:
            cmd = build_http_probe_command(inp)
        except ValueError as e:
            return f"http_probe error: {e}"

        code, output = await self._exec_command(address, cmd, ssh_user)
        # curl's exit code is the ground truth and was being discarded: a
        # connection failure (exit 7, status_code 000) returned prose that
        # matched no error prefix, so the executor classified the probe as a
        # SUCCESS and the audit log recorded it approved with no error
        # (adversarial review, reproduced). Structured returns make the status
        # a fact rather than an inference.
        if code != 0 and not output.strip():
            return f"http_probe failed (exit {code}): curl returned no output", code
        if not output.strip():
            return "http_probe: no response received", 1
        return _truncate_lines(output), code
