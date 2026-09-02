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

# Keep read_file below both the SSH text transport's 16K head+tail cap and
# the tool-result validator's 12K cap. The handler, not a downstream
# truncator, decides the last complete source line returned.
_READ_FILE_BODY_MAX_CHARS = 10_500
_READ_FILE_RESULT_MAX_CHARS = 11_500


class FilesDocsTools(HandlerBase):
    async def _handle_read_file(self, inp: dict) -> str | tuple[str, int]:
        path = inp.get("path")
        host = inp.get("host")
        if not path:
            return "Error: 'path' is required for read_file."
        if not isinstance(path, str) or not path.startswith("/"):
            return f"Error: read_file requires an absolute path, got {path!r}."
        if not host:
            return "Error: 'host' is required for read_file."

        raw_lines = inp.get("lines", 200)
        # Validate here as well as in the JSON schema: skills and internal
        # callers can invoke handlers without schema validation.
        if type(raw_lines) is not int or raw_lines <= 0:  # bool is not a count
            return "Error: 'lines' must be a positive integer count (maximum 1000)."
        if raw_lines > 1000:
            return "Error: 'lines' must not exceed 1000."
        lines = raw_lines

        raw_start = inp.get("start_line", 1)
        if type(raw_start) is not int or raw_start <= 0:  # bool is not a line number
            return "Error: 'start_line' must be a positive one-based integer."
        if raw_start > 2**53 - 1:
            return "Error: 'start_line' must not exceed 9007199254740991."
        start_line = raw_start
        start_label = f"n{start_line}"

        # Bound output at the SOURCE. _run_on_host eventually passes through
        # ssh._truncate_output(), whose 16K head+tail splice would destroy the
        # contiguity and interval guarantees of a selected range. This awk
        # program emits only a contiguous prefix of the requested range, with
        # true one-based source numbers and an explicit continuation cursor.
        # It also probes one following record so a full-count result can say
        # whether more source lines exist.
        awk_program = r"""BEGIN {
    used = 0
    selected = 0
    returned = 0
    last_returned = 0
    continuation = 0
    oversize_line = 0
}
NR < start { next }
selected >= count { continuation = NR; exit }
{
    selected++
    prefix = sprintf("%.0f: ", NR)
    line = prefix $0
    separator = (returned > 0 ? "\n" : "")
    needed = length(separator) + length(line)
    if (used + needed > budget) {
        if (returned == 0) {
            oversize_line = NR
            exit
        }
        continuation = NR
        exit
    }
    if (returned > 0) printf "\n"
    printf "%s", line
    used += needed
    returned++
    last_returned = NR
}
END {
    if (returned > 0) printf "\n\n"
    if (oversize_line > 0) {
        printf "Error: source line %.0f exceeds the read_file output budget; " \
            "no lines returned.", oversize_line
    } else if (returned == 0) {
        printf "[returned empty range starting at start_line=%s]", substr(start_label, 2)
    } else if (continuation > 0) {
        printf "[returned %.0f-%.0f, continue at start_line=%.0f]", \
            start, last_returned, continuation
    } else {
        printf "[returned %.0f-%.0f]", start, last_returned
    }
}"""
        safe_path = shlex.quote(str(path))
        command = (
            f"awk -v start={start_line} -v start_label={shlex.quote(start_label)} "
            f"-v count={lines} -v budget={_READ_FILE_BODY_MAX_CHARS} "
            f"{shlex.quote(awk_program)} < {safe_path}"
        )
        raw = await self._run_on_host(host, command)
        is_tuple = isinstance(raw, tuple)
        if is_tuple:
            text, code = str(raw[0]), int(raw[1])
        else:
            text, code = str(raw), None
        # The generic transport's defensive 16K truncator keeps head+tail.
        # Never infer transport truncation from payload content: a source file
        # may legitimately contain the transport marker literal. The source
        # program is already bounded below this threshold, so only the actual
        # returned length is a trustworthy overrun signal here.
        if len(text) > _READ_FILE_RESULT_MAX_CHARS:
            text = (
                text[:_READ_FILE_RESULT_MAX_CHARS]
                + "\n[read_file error truncated by handler output budget]"
            )
            return text, 1
        # The source-budget guard is a handler failure even though awk itself
        # completed normally. Preserve a typed nonzero result through the
        # executor rather than letting an "Error:" string ride exit code 0.
        if code == 0 and text.startswith("Error: source line "):
            return text, 1
        if is_tuple:
            assert code is not None
            return text, code
        return text

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
            return "Only http:// and https:// URLs are supported.", 1
        # Pre-flight block check before the heavy import so a blocked URL returns
        # the block message even on a host without PyMuPDF (safe_fetch below
        # re-validates every hop; this only preserves the original error order).
        if url:
            from ..url_safety import is_url_blocked

            if is_url_blocked(url):
                return "Error: blocked URL (localhost / private IP / cloud-metadata address).", 1

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
                return "Error: blocked URL (localhost / private IP / cloud-metadata address).", 1
            except ResponseTooLargeError:
                return f"PDF too large (max {_ANALYZE_PDF_MAX_BYTES} bytes).", 1
            except Exception as e:
                return f"Failed to fetch PDF from URL: {e}", 1
            if resp.status != 200:
                return f"Failed to fetch PDF from URL (HTTP {resp.status})", 1
            pdf_bytes = resp.body
        elif host and path:
            # Fetch from host as bounded raw bytes
            resolved = self._resolve_host(host)
            if not resolved:
                return f"Unknown or disallowed host: {host}", 1
            address, ssh_user, _os = resolved
            # Binary payloads do NOT travel the text pipeline: base64 over
            # stdout was truncated at MAX_OUTPUT_CHARS, so any PDF over roughly
            # 12KB arrived corrupt and failed to decode (adversarial review).
            from ..ssh import read_binary_file

            pdf_bytes, read_error = await read_binary_file(
                address,
                path,
                max_bytes=_ANALYZE_PDF_MAX_BYTES,
                ssh_key_path=self.config.ssh_key_path,
                known_hosts_path=self.config.ssh_known_hosts_path,
                ssh_user=ssh_user,
            )
            if read_error:
                return f"Failed to read PDF from host: {read_error}", 1
        else:
            return "Provide either 'url' or both 'host' and 'path'.", 1

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
