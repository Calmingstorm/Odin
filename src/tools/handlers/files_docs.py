"""Files & documents handler domain — read_file, apply_patch, analyze_pdf
(RFC-004 P4, wave 1).

Bodies moved VERBATIM from executor.py; the only mechanical adjustment is
lazy relative imports re-anchored one level (``.url_safety`` →
``..url_safety``). ``_parse_page_range`` moves with its sole consumer
(plan advisory #7 — helpers stay local to their domain).
"""

from __future__ import annotations

import base64
import binascii
import json
import shlex
from pathlib import Path

from ...llm.secret_scrubber import scrub_output_secrets
from .deps import HandlerBase

# Hard cap on a URL-fetched PDF so a huge or hostile body can't exhaust memory.
_ANALYZE_PDF_MAX_BYTES = 50 * 1024 * 1024  # 50 MiB

# Keep read_file below both the SSH text transport's 16K head+tail cap and
# the tool-result validator's 12K cap. The handler, not a downstream
# truncator, decides the last complete source line returned.
_READ_FILE_BODY_MAX_CHARS = 10_500
# Raw source is base64-wrapped only for the internal text transport, then
# restored to visible UTF-8 source inside the public metadata envelope returned
# to the model. An 8K source prefix expands to at most 10,668 internal base64
# chars, safely below the SSH transport's 16K head+tail threshold; the public
# frame remains below 11.5K.
_READ_FILE_RAW_BODY_MAX_BYTES = 8_000
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

        raw_mode = inp.get("raw", False)
        if type(raw_mode) is not bool:
            return "Error: 'raw' must be a boolean."

        # Bound output at the SOURCE. _run_on_host eventually passes through
        # ssh._truncate_output(), whose 16K head+tail splice would destroy the
        # contiguity and interval guarantees of a selected range. This awk
        # program emits only a contiguous prefix of the requested range. It
        # also probes one following record so a full-count result can say
        # whether more source lines exist. Numbered mode renders source numbers
        # and a trailing cursor; raw mode puts the interval/cursor in a framed
        # envelope without altering the framed source content.
        numbered_awk_program = r"""BEGIN {
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
        # Raw mode base64-encodes selected bytes only across the host command's
        # text transport, then the handler restores visible UTF-8 source inside
        # a length-framed public envelope. Direct source bytes would otherwise
        # be damaged by the host transport's UTF-8 replacement decode. The
        # public frame keeps numbering and cursor metadata outside the content;
        # its byte count makes boundaries unambiguous even when source text
        # contains the marker literals.
        raw_awk_program = r"""BEGIN {
    used = 0
    selected = 0
    returned = 0
    last_returned = 0
    continuation = 0
    oversize_line = 0
    pending = 0
}
NR < start { next }
pending {
    if (returned == 0) oversize_line = pending_nr
    else continuation = pending_nr
    pending = 0
    exit
}
selected >= count { continuation = NR; exit }
{
    selected++
    line_bytes = length($0)
    needed = line_bytes + 1
    if (used + needed > budget) {
        # The sole undecidable case is a final, unterminated line for which
        # the synthetic newline would be the only byte over budget.
        if (used + line_bytes <= budget) {
            pending = 1
            pending_nr = NR
            pending_line = $0
            next
        }
        if (returned == 0) oversize_line = NR
        else continuation = NR
        exit
    }
    returned++
    body[returned] = $0
    used += needed
    last_returned = NR
}
END {
    if (pending) {
        if (final_newline == 0) {
            returned++
            body[returned] = pending_line
            used += length(pending_line)
            last_returned = pending_nr
        } else if (returned == 0) {
            oversize_line = pending_nr
        } else {
            continuation = pending_nr
        }
    } else if (returned > 0 && continuation == 0 && final_newline == 0) {
        # Every accepted record was budgeted with a newline.  At EOF, the last
        # record has none when the source's final byte was not LF.
        used--
    }

    if (oversize_line > 0) {
        printf "ERROR\t%.0f\n", oversize_line > metadata
        exit
    }

    printf "ODIN_READ_FILE_RAW_META_V1\t%s\t%.0f\t", \
        substr(start_label, 2), count > metadata
    if (returned > 0) printf "%.0f\t%.0f\t", start, last_returned >> metadata
    else printf "-\t-\t" >> metadata
    if (continuation > 0) {
        printf "%.0f\t%.0f\n", continuation, used >> metadata
    } else {
        printf "-\t%.0f\n", used >> metadata
    }

    for (i = 1; i <= returned; i++) {
        printf "%s", body[i]
        if (i < returned || continuation > 0 || final_newline != 0) printf "\n"
    }
}"""
        safe_path = shlex.quote(str(path))
        if raw_mode:
            # The command's stdout is internal ASCII base64 plus one terminal metadata
            # line. The source bytes live only in a private temporary file, so
            # the text-only host transport never decodes or rewrites them.
            command = (
                # Every artifact is independently and atomically allocated.
                # Predictable suffixes both inherited the service umask and
                # allowed a local attacker to pre-create a sidecar between
                # mktemp and the first redirect.
                "metadata=$(mktemp) || exit 1; "
                'body=$(mktemp) || { rm -f -- "$metadata"; exit 1; }; '
                'encoded=$(mktemp) || { rm -f -- "$metadata" "$body"; exit 1; }; '
                'trap \'rm -f -- "$metadata" "$body" "$encoded"\' EXIT; '
                'chmod 600 -- "$metadata" "$body" "$encoded" || exit 1; '
                f"final_newline=$(tail -c 1 < {safe_path} 2>/dev/null | wc -l); "
                f"LC_ALL=C awk -v start={start_line} "
                f"-v start_label={shlex.quote(start_label)} "
                f"-v count={lines} -v budget={_READ_FILE_RAW_BODY_MAX_BYTES} "
                f'-v final_newline="$final_newline" '
                '-v metadata="$metadata" '
                f'{shlex.quote(raw_awk_program)} < {safe_path} > "$body"; '
                "status=$?; "
                'if [ $status -ne 0 ]; then cat -- "$metadata"; '
                'rm -f -- "$body"; exit $status; fi; '
                'base64 < "$body" > "$encoded"; status=$?; '
                "if [ $status -ne 0 ]; then exit $status; fi; "
                "tr -d '\\r\\n' < \"$encoded\"; status=$?; "
                "printf '\\n'; cat -- \"$metadata\"; exit $status"
            )
        else:
            command = (
                f"awk -v start={start_line} -v start_label={shlex.quote(start_label)} "
                f"-v count={lines} -v budget={_READ_FILE_BODY_MAX_CHARS} "
                f"{shlex.quote(numbered_awk_program)} < {safe_path}"
            )
        raw = await self._run_on_host(host, command)
        is_tuple = isinstance(raw, tuple)
        if is_tuple:
            text, code = str(raw[0]), int(raw[1])
        else:
            text, code = str(raw), None

        if raw_mode and (code == 0 or code is None):
            raw_transport = text.strip("\n")
            if raw_transport.startswith("ERROR\t"):
                try:
                    oversize_line = int(raw_transport.split("\t", 1)[1])
                except ValueError:
                    return "Error: read_file raw transport returned an invalid envelope.", 1
                return (
                    f"Error: source line {oversize_line} exceeds the read_file "
                    "output budget; no lines returned.",
                    1,
                )
            try:
                metadata_prefix = "ODIN_READ_FILE_RAW_META_V1\t"
                marker = "\n" + metadata_prefix
                if marker in text:
                    encoded, metadata_line = text.rstrip("\n").rsplit("\n", 1)
                elif text.startswith(metadata_prefix):
                    encoded, metadata_line = "", text.rstrip("\n")
                else:
                    raise ValueError("missing raw metadata")
                fields = metadata_line.split("\t")
                if len(fields) != 7 or fields[0] != "ODIN_READ_FILE_RAW_META_V1":
                    raise ValueError("missing raw metadata")
                requested_start = int(fields[1])
                requested_lines = int(fields[2])
                returned_start = None if fields[3] == "-" else int(fields[3])
                returned_end = None if fields[4] == "-" else int(fields[4])
                continuation = None if fields[5] == "-" else int(fields[5])
                content_bytes = int(fields[6])
                content = base64.b64decode(encoded, validate=True)
                if len(content) != content_bytes:
                    raise ValueError("raw content length mismatch")
                # Raw transport must not bypass the standard secret-output
                # boundary merely because its internal bytes are base64 encoded.
                # Raw mode is a UTF-8 text contract; reject other encodings and
                # redact recognized textual secrets before framing the public
                # model-facing content.
                source_text = content.decode("utf-8", errors="strict")
                scrubbed_text = scrub_output_secrets(source_text)
                scrubbed_content = scrubbed_text.encode("utf-8")
                content_bytes = len(scrubbed_content)
            except UnicodeDecodeError:
                return "Error: read_file raw mode requires UTF-8 text content.", 1
            except (ValueError, TypeError, binascii.Error):
                return "Error: read_file raw transport returned an invalid envelope.", 1
            metadata = {
                "requested_start_line": requested_start,
                "requested_lines": requested_lines,
                "returned_start_line": returned_start,
                "returned_end_line": returned_end,
                "truncated": continuation is not None,
                "continue_at_start_line": continuation,
                "content_encoding": "utf-8",
                "content_bytes": content_bytes,
                "content_redacted": scrubbed_text != source_text,
            }
            header = json.dumps(metadata, ensure_ascii=True, separators=(",", ":"))
            text = (
                f"<<<ODIN_READ_FILE_RAW_V1 {header}>>>\n"
                "<<<ODIN_READ_FILE_RAW_CONTENT_V1>>>\n"
                f"{scrubbed_text}"
                "<<<ODIN_READ_FILE_RAW_END_V1>>>"
            )

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

    async def _handle_apply_patch(self, inp: dict) -> str | tuple[str, int]:
        host = inp.get("host")
        root = inp.get("root")
        patch_text = inp.get("patch_text")
        if not host:
            return "Error: 'host' is required for apply_patch.", 1
        if not isinstance(root, str) or not root.startswith("/"):
            return "Error: 'root' must be an absolute path for apply_patch.", 1
        if not isinstance(patch_text, str):
            return "Error: 'patch_text' is required for apply_patch.", 1

        from ..apply_patch import PatchError, parse_patch

        try:
            plan = parse_patch(patch_text)
        except PatchError as exc:
            return f"Error: invalid apply_patch envelope: {exc}", 1

        resolved = self._resolve_host(host)
        if not resolved:
            return f"Unknown or disallowed host: {host}", 1

        # The governor sees a representative write command before any staged
        # payload reaches the host. The patch itself is transported as base64,
        # never interpolated as shell syntax.
        allowed, denial, _ = self._govern_command(f"apply_patch --root {shlex.quote(root)}", host)
        if not allowed:
            return denial, 1

        runner = Path(__file__).resolve().parents[1] / "apply_patch.py"
        plan_json = json.dumps(plan, ensure_ascii=True, separators=(",", ":"))
        wrapper = (
            runner.read_text(encoding="utf-8")
            + "\nimport json\nimport sys as _sys\n"
            + "try:\n"
            + "    _plan = json.loads(_sys.stdin.read())\n"
            + "    _changed = apply_plan(_sys.argv[1], _plan)\n"
            + "    _result = {'ok': True, 'changed': _changed}\n"
            + "except PatchRollbackError as _exc:\n"
            + "    _result = {'ok': False, 'error': str(_exc), 'rollback_failed': True, "
            + "'rollback_failures': _exc.failures}\n"
            + "except BaseException as _exc:\n"
            + "    _result = {'ok': False, 'error': f'{type(_exc).__name__}: {_exc}', "
            + "'rollback_failed': False}\n"
            + "print(json.dumps(_result, ensure_ascii=True, separators=(',', ':')))\n"
        )
        runner_b64 = base64.b64encode(wrapper.encode("utf-8")).decode("ascii")
        plan_b64 = base64.b64encode(plan_json.encode("utf-8")).decode("ascii")
        safe_root = shlex.quote(root)
        command = (
            "runner=$(mktemp) || exit 1; "
            'plan=$(mktemp) || { rm -f -- "$runner"; exit 1; }; '
            'trap \'rm -f -- "$runner" "$plan"\' EXIT; '
            'chmod 600 -- "$runner" "$plan" || exit 1; '
            f'printf %s {shlex.quote(runner_b64)} | base64 -d > "$runner" || exit 1; '
            f'printf %s {shlex.quote(plan_b64)} | base64 -d > "$plan" || exit 1; '
            f'python3 "$runner" {safe_root} < "$plan"'
        )
        raw = await self._run_on_host(host, command)
        if isinstance(raw, tuple):
            text, code = str(raw[0]), int(raw[1])
        else:
            text, code = str(raw), 1
        if code != 0:
            return text, code
        try:
            result = json.loads(text)
        except (json.JSONDecodeError, TypeError):
            return "Error: apply_patch host returned an invalid result envelope.", 1
        if not isinstance(result, dict) or result.get("ok") is not True:
            error = (
                result.get("error", "unknown host-side failure")
                if isinstance(result, dict)
                else "invalid result"
            )
            if isinstance(result, dict) and result.get("rollback_failed") is True:
                return f"Error: apply_patch rollback failed; manual recovery required: {error}", 1
            return f"Error: apply_patch failed without changing the final file set: {error}", 1
        changed = result.get("changed")
        if not isinstance(changed, list) or not all(isinstance(item, str) for item in changed):
            return "Error: apply_patch host returned an invalid result envelope.", 1
        return "Applied patch successfully:\n" + "\n".join(f"- {item}" for item in changed), 0

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
