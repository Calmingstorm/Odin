from __future__ import annotations

import re
from pathlib import Path

from ..odin_log import get_logger

log = get_logger("context")

# Per-file and total size caps. A context file is injected into EVERY LLM
# request, so an oversized/binary file would silently bloat every prompt (or,
# with the old unguarded read_text, crash boot on one undecodable byte).
MAX_CONTEXT_FILE_BYTES = 256 * 1024      # 256 KB per file
MAX_CONTEXT_TOTAL_BYTES = 1024 * 1024    # 1 MB total across all files

SECRET_PATTERNS = [
    re.compile(r"(?i)(password|passwd|pwd)\s*[:=]\s*\S+"),
    re.compile(r"(?i)(api[_-]?key|apikey)\s*[:=]\s*\S+"),
    re.compile(r"(?i)(secret|token)\s*[:=]\s*['\"]?\S{16,}"),
    re.compile(r"(?i)(access_token|auth_token)\s*[:=]\s*\S+"),
    re.compile(r"sk-[a-zA-Z0-9]{20,}"),
    re.compile(r"(?i)BEGIN\s+(RSA|EC|OPENSSH)\s+PRIVATE\s+KEY"),
]


class ContextLoader:
    def __init__(self, directory: str) -> None:
        self.directory = Path(directory)
        self._context: str = ""

    def load(self) -> str:
        if not self.directory.is_dir():
            log.warning("Context directory %s does not exist", self.directory)
            self._context = ""
            return self._context

        parts: list[str] = []
        total = 0
        for md_file in sorted(self.directory.glob("*.md")):
            try:
                size = md_file.stat().st_size
            except OSError as e:
                log.warning("Skipping context file %s (stat failed: %s)", md_file.name, e)
                continue
            if size > MAX_CONTEXT_FILE_BYTES:
                log.warning(
                    "Skipping context file %s: %d bytes exceeds per-file cap (%d)",
                    md_file.name, size, MAX_CONTEXT_FILE_BYTES,
                )
                continue
            if total + size > MAX_CONTEXT_TOTAL_BYTES:
                log.warning(
                    "Context total cap (%d bytes) reached; skipping remaining files from %s",
                    MAX_CONTEXT_TOTAL_BYTES, md_file.name,
                )
                break
            try:
                # errors="replace": one undecodable byte must not crash boot.
                content = md_file.read_text(encoding="utf-8", errors="replace")
            except OSError as e:
                log.warning("Skipping context file %s (read failed: %s)", md_file.name, e)
                continue
            total += size
            self._scan_secrets(md_file.name, content)
            parts.append(f"# {md_file.stem}\n\n{content}")

        self._context = "\n\n---\n\n".join(parts)
        log.info(
            "Loaded %d context files (%d chars)",
            len(parts),
            len(self._context),
        )
        return self._context

    def reload(self) -> str:
        log.info("Reloading context files")
        return self.load()

    @property
    def context(self) -> str:
        return self._context

    def _scan_secrets(self, filename: str, content: str) -> None:
        for pattern in SECRET_PATTERNS:
            matches = pattern.findall(content)
            if matches:
                log.warning(
                    "SECURITY: Potential secret detected in %s "
                    "(pattern: %s, %d match(es)). "
                    "Remove credentials from context files!",
                    filename,
                    pattern.pattern[:40],
                    len(matches),
                )
