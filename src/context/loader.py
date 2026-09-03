from __future__ import annotations

import re
from dataclasses import dataclass
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

_REASON_LIMIT = 120


@dataclass(frozen=True)
class ContextReloadReport:
    """Immutable account of one (re)load, built before the context is published.

    ``loaded`` is every file effective in context after the load; ``removed``
    is every file that was effective before but is absent or rejected now;
    ``skipped`` pairs each rejected file with a bounded reason.  A file that
    still exists but became unreadable or oversized appears in BOTH
    ``removed`` and ``skipped``.  Names are context-directory-relative.
    """

    loaded: tuple[str, ...]
    removed: tuple[str, ...]
    skipped: tuple[tuple[str, str], ...]
    file_count: int
    total_bytes: int
    context_chars: int
    directory_exists: bool = True

    def to_dict(self) -> dict:
        return {
            "loaded": list(self.loaded),
            "removed": list(self.removed),
            "skipped": [{"file": name, "reason": reason} for name, reason in self.skipped],
            "file_count": self.file_count,
            "total_bytes": self.total_bytes,
            "context_chars": self.context_chars,
            "directory_exists": self.directory_exists,
        }


class ContextLoader:
    def __init__(self, directory: str) -> None:
        self.directory = Path(directory)
        self._context: str = ""
        self._loaded_names: tuple[str, ...] = ()

    def load(self) -> str:
        """Load the context directory; returns the rendered context text."""
        self.load_report()
        return self._context

    def load_report(self) -> ContextReloadReport:
        """Load the context directory and return the structured report.

        The report is computed in full — names, bytes, and the rendered
        text — before ``.context`` is atomically replaced, so a caller never
        observes a half-loaded context beside a report describing another.
        """
        previous = self._loaded_names
        if not self.directory.is_dir():
            log.warning("Context directory %s does not exist", self.directory)
            report = ContextReloadReport(
                loaded=(),
                removed=previous,
                skipped=(),
                file_count=0,
                total_bytes=0,
                context_chars=0,
                directory_exists=False,
            )
            self._context = ""
            self._loaded_names = ()
            return report

        parts: list[str] = []
        loaded: list[str] = []
        skipped: list[tuple[str, str]] = []
        total = 0
        files = sorted(self.directory.glob("*.md"))
        for position, md_file in enumerate(files):
            name = md_file.name
            try:
                size = md_file.stat().st_size
            except OSError as e:
                log.warning("Skipping context file %s (stat failed: %s)", name, e)
                skipped.append((name, _bounded(f"stat failed: {type(e).__name__}")))
                continue
            if size > MAX_CONTEXT_FILE_BYTES:
                log.warning(
                    "Skipping context file %s: %d bytes exceeds per-file cap (%d)",
                    name, size, MAX_CONTEXT_FILE_BYTES,
                )
                skipped.append(
                    (name, _bounded(f"{size} bytes exceeds per-file cap {MAX_CONTEXT_FILE_BYTES}"))
                )
                continue
            if total + size > MAX_CONTEXT_TOTAL_BYTES:
                log.warning(
                    "Context total cap (%d bytes) reached; skipping remaining files from %s",
                    MAX_CONTEXT_TOTAL_BYTES, name,
                )
                for remaining in files[position:]:
                    skipped.append(
                        (
                            remaining.name,
                            _bounded(f"total cap {MAX_CONTEXT_TOTAL_BYTES} bytes reached"),
                        )
                    )
                break
            try:
                # errors="replace": one undecodable byte must not crash boot.
                content = md_file.read_text(encoding="utf-8", errors="replace")
            except OSError as e:
                log.warning("Skipping context file %s (read failed: %s)", name, e)
                skipped.append((name, _bounded(f"read failed: {type(e).__name__}")))
                continue
            total += size
            self._scan_secrets(name, content)
            parts.append(f"# {md_file.stem}\n\n{content}")
            loaded.append(name)

        rendered = "\n\n---\n\n".join(parts)
        loaded_names = tuple(loaded)
        effective = set(loaded_names)
        removed = tuple(name for name in previous if name not in effective)
        report = ContextReloadReport(
            loaded=loaded_names,
            removed=removed,
            skipped=tuple(skipped),
            file_count=len(loaded_names),
            total_bytes=total,
            context_chars=len(rendered),
        )
        self._context = rendered
        self._loaded_names = loaded_names
        log.info(
            "Loaded %d context files (%d chars)",
            len(parts),
            len(rendered),
        )
        return report

    def reload(self) -> ContextReloadReport:
        log.info("Reloading context files")
        return self.load_report()

    @property
    def context(self) -> str:
        return self._context

    @property
    def loaded_files(self) -> tuple[str, ...]:
        """Names of the files currently effective in context."""
        return self._loaded_names

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


def _bounded(reason: str) -> str:
    return reason if len(reason) <= _REASON_LIMIT else reason[: _REASON_LIMIT - 1] + "…"

