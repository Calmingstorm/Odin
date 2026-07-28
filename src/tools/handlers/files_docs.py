"""Files & documents handler domain — read_file, write_file, analyze_pdf
(RFC-004 P4, wave 1).

Bodies moved VERBATIM from executor.py; the only mechanical adjustment is
lazy relative imports re-anchored one level (``.url_safety`` →
``..url_safety``). ``_parse_page_range`` moves with its sole consumer
(plan advisory #7 — helpers stay local to their domain).
"""

from __future__ import annotations

import base64
import posixpath
import shlex

from .deps import HandlerBase

# Hard cap on a URL-fetched PDF so a huge or hostile body can't exhaust memory.
_ANALYZE_PDF_MAX_BYTES = 50 * 1024 * 1024  # 50 MiB


class FilesDocsTools(HandlerBase):
    async def _handle_read_file(self, inp: dict) -> str:
        path = inp.get("path")
        host = inp.get("host")
        if not path:
            return "Error: 'path' is required for read_file."
        if not host:
            return "Error: 'host' is required for read_file."
        try:
            # Clamped to 1..1000, not just an upper bound. GNU head reads a
            # NEGATIVE -n as "all but the last N", so lines=-2 silently
            # returned the whole file minus two lines, and lines=0 returned
            # nothing at all — neither is what a caller asking for N lines
            # means (adversarial review).
            lines = max(1, min(int(inp.get("lines", 200)), 1000))
        except (TypeError, ValueError):
            lines = 200
        safe_path = shlex.quote(path)
        return await self._run_on_host(
            host,
            f"head -n {lines} {safe_path}",
        )

    async def _handle_write_file(self, inp: dict) -> str | tuple[str, int]:
        path = inp.get("path")
        content = inp.get("content")
        host = inp.get("host")
        if not path:
            return "Error: 'path' is required for write_file."
        if content is None:
            return "Error: 'content' is required for write_file."
        if not host:
            return "Error: 'host' is required for write_file."
        # The schema documents this path as absolute, but nothing enforced it,
        # so a relative path silently resolved against Odin's install directory
        # and wrote there (PR #239 round-10 review, reproduced). Rejecting is
        # better than quietly redirecting into the workspace: a write whose
        # destination the caller did not choose is its own hazard, and no
        # documented capability is lost.
        if not str(path).startswith("/"):
            return (
                f"Error: write_file requires an absolute path, got {path!r}. "
                "A relative path would resolve against Odin's working directory "
                "rather than where you intend.",
                1,
            )
        path = str(path)
        safe_path = shlex.quote(path)
        # Compute and quote the parent as its own shell argument. Embedding a
        # quoted path in ``$(dirname ...)`` and then leaving the substitution
        # unquoted word-splits a parent containing spaces; ``mkdir`` can create
        # those extra relative words in Odin's inherited install cwd even though
        # the requested file path itself is absolute (PR #239 final review,
        # reproduced). Remote managed hosts are POSIX, matching the absolute-path
        # contract above.
        safe_parent = shlex.quote(posixpath.dirname(path) or "/")
        # Govern the write before executing — write_file reaches the filesystem
        # via _run_on_host, which does NOT itself govern. Check a representative
        # redirect-to-path command so policy (e.g. writes to sensitive targets)
        # applies here as it does for run_command.
        allowed, denial, _ = self._govern_command(f"write_file > {safe_path}", host)
        if not allowed:
            return denial
        # Base64-encode content to avoid shell injection via heredoc delimiter
        encoded = shlex.quote(base64.b64encode(content.encode()).decode())
        cmd = (
            f"mkdir -p -- {safe_parent} && "
            f"printf %s {encoded} | base64 -d > {safe_path}"
        )
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

    async def _handle_analyze_pdf(self, inp: dict) -> str | tuple[str, int]:
        url = inp.get("url")
        host = inp.get("host")
        path = inp.get("path")
        pages_str = inp.get("pages")

        # Validate URL scheme early (before heavy imports) to prevent SSRF
        if url and not url.startswith(("http://", "https://")):
            return "Only http:// and https:// URLs are supported."
        # Pre-flight block check before the heavy import so a blocked URL returns
        # the block message even on a host without PyMuPDF (safe_fetch below
        # re-validates every hop; this only preserves the original error order).
        if url:
            from ..url_safety import is_url_blocked

            if is_url_blocked(url):
                return "Error: blocked URL (localhost / private IP / cloud-metadata address)."

        # Structural gating hides this tool when PyMuPDF is missing, but the
        # handler must still degrade cleanly: find_spec proves the module is
        # importable, not that its native library loads, and a direct call can
        # reach here on an install whose catalog was built elsewhere.
        try:
            import fitz
        except Exception as exc:
            return (
                "PDF support unavailable: PyMuPDF could not be loaded "
                f"({type(exc).__name__}: {exc}). Install the 'pdf' extra "
                "(pip install '.[pdf]') and restart Odin.",
                1,
            )

        pdf_bytes: bytes | None = None

        if url:
            # Download the PDF through the hardened transport: every redirect
            # hop is SSRF-validated (the scheme check alone is not SSRF-safe —
            # http://169.254.169.254/... passes it), the connect IP is pinned,
            # TLS is verified, and a hard byte cap bounds memory use.
            from ..safe_fetch import BlockedAddressError, ResponseTooLargeError, safe_fetch

            try:
                resp = await safe_fetch(url, max_bytes=_ANALYZE_PDF_MAX_BYTES, timeout=30.0)
            except BlockedAddressError:
                return "Error: blocked URL (localhost / private IP / cloud-metadata address)."
            except ResponseTooLargeError:
                return f"PDF too large (max {_ANALYZE_PDF_MAX_BYTES} bytes)."
            except Exception as e:
                return f"Failed to fetch PDF from URL: {e}", 1
            if resp.status != 200:
                return f"Failed to fetch PDF from URL (HTTP {resp.status})", 1
            pdf_bytes = resp.body
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
                return f"Failed to read PDF from host: {output}", 1
            try:
                pdf_bytes = base64.b64decode(output.strip())
            except Exception as e:
                return f"Failed to decode PDF data: {e}", 1
        else:
            return "Provide either 'url' or both 'host' and 'path'."

        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        except Exception as e:
            return f"Failed to open PDF: {e}", 1

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
