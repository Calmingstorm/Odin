"""Config-declared paths protected by the local command-workspace fence.

This inventory is shared by the fence and Config Center metadata. A path added
only to one side is dangerous in two different ways: the executor can accept a
workspace that overlaps live state, or the UI can claim a live save while the
running executor still protects its boot-time path.

The boolean records the path's declared shape: ``True`` means a file (protect
its parent directory), while ``False`` means a directory (protect it directly).
"""

from __future__ import annotations

WORKSPACE_PROTECTED_CONFIG_PATHS: tuple[tuple[str, bool], ...] = (
    ("tools.audit_log_path", True),
    ("tools.trajectory_path", False),
    ("tools.ssh_key_path", True),
    ("tools.ssh_known_hosts_path", True),
    ("tools.ssh_pool.socket_dir", False),
    ("context.directory", False),
    ("sessions.persist_directory", False),
    ("logging.directory", False),
    ("usage.directory", False),
    # Treated as a file: wiring derives its sibling fts.db via `.parent`.
    ("search.search_db_path", True),
    ("permissions.overrides_path", True),
    ("openai_codex.credentials_path", True),
    ("attachments.temp_directory", False),
)

WORKSPACE_PROTECTED_CONFIG_PATH_NAMES: frozenset[str] = frozenset(
    path for path, _is_file in WORKSPACE_PROTECTED_CONFIG_PATHS
)
