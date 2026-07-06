"""Files & documents handler domain — read_file, write_file, analyze_pdf
(RFC-004 P4, wave 1).

Bodies moved VERBATIM from executor.py; the only mechanical adjustment is
lazy relative imports re-anchored one level (``.url_safety`` →
``..url_safety``). ``_parse_page_range`` moves with its sole consumer
(plan advisory #7 — helpers stay local to their domain).
"""

from __future__ import annotations

import base64
import shlex

from .deps import HandlerBase


class FilesDocsTools(HandlerBase):
    async def _handle_read_file(self, inp: dict) -> str:
        path = inp.get("path")
        host = inp.get("host")
        if not path:
            return "Error: 'path' is required for read_file."
        if not host:
            return "Error: 'host' is required for read_file."
        try:
            lines = min(int(inp.get("lines", 200)), 1000)
        except (TypeError, ValueError):
            lines = 200
        safe_path = shlex.quote(path)
        return await self._run_on_host(
            host,
            f"head -n {lines} {safe_path}",
        )

    async def _handle_write_file(self, inp: dict) -> str:
        path = inp.get("path")
        content = inp.get("content")
        host = inp.get("host")
        if not path:
            return "Error: 'path' is required for write_file."
        if content is None:
            return "Error: 'content' is required for write_file."
        if not host:
            return "Error: 'host' is required for write_file."
        safe_path = shlex.quote(path)
        # Govern the write before executing — write_file reaches the filesystem
        # via _run_on_host, which does NOT itself govern. Check a representative
        # redirect-to-path command so policy (e.g. writes to sensitive targets)
        # applies here as it does for run_command.
        allowed, denial, _ = self._govern_command(f"write_file > {safe_path}", host)
        if not allowed:
            return denial
        # Base64-encode content to avoid shell injection via heredoc delimiter
        encoded = base64.b64encode(content.encode()).decode()
        cmd = f"mkdir -p $(dirname {safe_path}) && echo '{encoded}' | base64 -d > {safe_path}"
        return await self._run_on_host(host, cmd)

    @staticmethod
    def _parse_page_range(pages: str, total: int) -> list[int]:
        """Parse a page range string like '1-5' or '3' into 0-indexed page indices."""
        pages = pages.strip()
        if "-" in pages:
            parts = pages.split("-", 1)
            try:
                start = max(int(parts[0]) - 1, 0)
                end = min(int(parts[1]), total)
                return list(range(start, end))
            except ValueError:
                return list(range(total))
        else:
            try:
                idx = int(pages) - 1
                if 0 <= idx < total:
                    return [idx]
                return list(range(total))
            except ValueError:
                return list(range(total))

    async def _handle_analyze_pdf(self, inp: dict) -> str:
        url = inp.get("url")
        host = inp.get("host")
        path = inp.get("path")
        pages_str = inp.get("pages")

        # Validate URL scheme early (before heavy imports) to prevent SSRF
        if url and not url.startswith(("http://", "https://")):
            return "Only http:// and https:// URLs are supported."
        # Block private/loopback/link-local/metadata targets (DNS-rebinding aware) —
        # the same guard fetch_url/browser/skill HTTP use. The scheme check alone is
        # NOT SSRF-safe (e.g. http://169.254.169.254/... passes it).
        if url:
            from ..url_safety import is_url_blocked

            if is_url_blocked(url):
                return "Error: blocked URL (localhost / private IP / cloud-metadata address)."

        import fitz

        pdf_bytes: bytes | None = None

        if url:
            # Download PDF from URL
            import aiohttp

            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                        if resp.status != 200:
                            return f"Failed to fetch PDF from URL (HTTP {resp.status})"
                        pdf_bytes = await resp.read()
            except Exception as e:
                return f"Failed to fetch PDF from URL: {e}"
        elif host and path:
            # Fetch from host via base64
            resolved = self._resolve_host(host)
            if not resolved:
                return f"Unknown or disallowed host: {host}"
            address, ssh_user, _os = resolved
            safe_path = shlex.quote(path)
            code, output = await self._exec_command(
                address,
                f"base64 -w0 {safe_path}",
                ssh_user,
            )
            if code != 0:
                return f"Failed to read PDF from host: {output}"
            try:
                pdf_bytes = base64.b64decode(output.strip())
            except Exception as e:
                return f"Failed to decode PDF data: {e}"
        else:
            return "Provide either 'url' or both 'host' and 'path'."

        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        except Exception as e:
            return f"Failed to open PDF: {e}"

        try:
            total = doc.page_count
            if pages_str:
                indices = self._parse_page_range(pages_str, total)
            else:
                indices = list(range(total))

            parts = []
            for i in indices:
                page = doc[i]
                text = page.get_text()
                parts.append(f"## Page {i + 1}\n{text}")

            result = "\n\n".join(parts)
            # Truncate to TOOL_OUTPUT_MAX_CHARS (handled by caller, but be safe)
            if len(result) > 12000:
                result = (
                    result[:12000]
                    + "\n\n[... truncated — use pages parameter for specific pages ...]"
                )
            return (
                result
                if result.strip()
                else (
                    "PDF contains no extractable text. Try browser_screenshot for image-heavy PDFs."
                )
            )
        finally:
            doc.close()
