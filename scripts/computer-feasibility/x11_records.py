"""Read only complete newline-committed receiver records, never a partial write."""

import json
from pathlib import Path


def complete_records(text):
    return [json.loads(line) for line in text.splitlines(keepends=True)
            if line.endswith("\n") and line.startswith("{")]


def process_identity(pid, proc=Path("/proc")):
    """A disappearance race is absent only if the process directory is gone."""
    directory = proc / str(pid)
    try:
        text = (directory / "stat").read_text()
    except (FileNotFoundError, ProcessLookupError):
        if not directory.exists():
            return None
        raise
    tail = text[text.rindex(")") + 2:].split()
    return {"pid": int(pid), "start_ticks": int(tail[19]), "state": tail[0],
            "comm": text[text.index("(") + 1:text.rindex(")")]}
