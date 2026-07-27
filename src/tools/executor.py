from __future__ import annotations

import asyncio
import contextvars
import json
import os
import shutil
import time
from pathlib import Path
from typing import Any

from ..config.schema import ToolsConfig
from ..odin_log import get_logger
from ..permissions.host_access import HostAccessManager
from ..permissions.manager import PermissionManager
from .branch_freshness import (
    FreshnessEvent,
    FreshnessStats,
    check_branch_freshness,
    format_staleness_warning,
)
from .bulkhead import BulkheadFullError, BulkheadRegistry
from .output_streamer import ToolOutputStreamer
from .post_validation import annotate_if_mutation
from .recovery import (
    UNSAFE_TO_RETRY,
    RecoveryCategory,
    RecoveryStats,
)
from .recovery import (
    classify_error as _classify_error,
)
from .recovery import (
    classify_exception as _classify_exception,
)
from .recovery import (
    decide_recovery_action as _decide_recovery_action,
)
from .result_validator import ResultValidationStats, ToolResult, validate_tool_result
from .risk_classifier import RiskStats, classify_tool
from .ssh import (
    OutputCallback,
    is_local_address,
    run_local_command,
    run_ssh_command,
)
from .ssh_pool import SSHConnectionPool
from .workspace import DEFAULT_MEMORY_PATH, command_protected_roots, resolve_workspace

log = get_logger("tools")

# Output-text helpers moved to tool_text.py (RFC-004 P4) — re-exported here
# because background_task, tool_loop_helpers, and tests import them from
# executor. tool_text.py carries the semantics documentation.
from .tool_text import (  # noqa: E402, F401 — public re-export seam
    _ERROR_RESULT_PREFIXES,
    _RUN_COMMAND_MAX_LINES,
    _truncate_lines,
)

# Request-scoped caller identity, backed by contextvars. asyncio gives each
# message-handling task (and each gather()-wrapped tool call) its own context
# copy, so these are isolated across concurrent channels/requests. This replaces
# the old instance attributes, which were shared mutable state on the single
# ToolExecutor and could leak one channel's identity into another channel's
# host-access check across await points.
_user_id_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "odin_tool_user_id", default=None
)
_user_tier_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "odin_tool_user_tier", default=None
)
# Request-scoped per-tool timeout, backed by a contextvar for the same reason:
# it was previously a shared instance attribute that concurrent tool calls
# overwrote across await points, so a 30s-timeout tool could shrink a concurrent
# 900s command's inner wall (or a 3660s tool could stretch it). _try_tool sets
# it per call and resets the token in finally; _exec_command reads it when the
# caller passes no explicit timeout. Nested calls restore the outer value on
# reset.
_current_tool_timeout_ctx: contextvars.ContextVar[int | None] = contextvars.ContextVar(
    "odin_current_tool_timeout", default=None
)


def _validate_memory_shape(data: dict) -> None:
    """Nested-shape check for memory.json, run inside json_store's backup
    boundary. The legacy flat format (no ``global`` key) is migrated by the
    caller and not scoped-validated here; each scoped section must be an object
    (a list/str section is corruption, not an empty section)."""
    from ..json_store import StoreCorruptError

    if "global" not in data:
        return
    for section, value in data.items():
        if not isinstance(value, dict):
            raise StoreCorruptError(
                f"memory.json section {section!r} is {type(value).__name__}, expected an object"
            )


def _build_bulkhead_registry(config: ToolsConfig) -> BulkheadRegistry:
    """Build a BulkheadRegistry from tools config."""
    registry = BulkheadRegistry()
    bh = config.bulkhead
    registry.register("ssh", bh.ssh_max_concurrent, bh.ssh_max_queued)
    registry.register("subprocess", bh.subprocess_max_concurrent, bh.subprocess_max_queued)
    registry.register("browser", bh.browser_max_concurrent, bh.browser_max_queued)
    return registry


# RFC-004: THE explicit late-bound dispatch table — tool name -> (owner_key, attr).
# Handlers are resolved via getattr(owner, attr) at CALL time, never pre-bound,
# so instance-attribute patches (``executor._handle_x = fake``) keep governing
# execution (the patch-seam contract in test_executor_dispatch_parity). Every
# handler body lives on a domain owner in src/tools/handlers/; the "core" owner
# key remains available for future middleware-adjacent handlers. The
# characterization contract pins table keys == executor-routed set, and
# __init__ asserts every entry resolves on its owner at construction.
EXECUTOR_HANDLERS: dict[str, tuple[str, str]] = {
    "run_command": ("system", "_handle_run_command"),
    "run_script": ("system", "_handle_run_script"),
    "run_command_multi": ("system", "_handle_run_command_multi"),
    "read_file": ("files_docs", "_handle_read_file"),
    "write_file": ("files_docs", "_handle_write_file"),
    "memory_manage": ("state", "_handle_memory_manage"),
    "manage_list": ("state", "_handle_manage_list"),
    "manage_process": ("system", "_handle_manage_process"),
    "browser_read_page": ("browser_web", "_handle_browser_read_page"),
    "browser_read_table": ("browser_web", "_handle_browser_read_table"),
    "browser_click": ("browser_web", "_handle_browser_click"),
    "browser_fill": ("browser_web", "_handle_browser_fill"),
    "browser_evaluate": ("browser_web", "_handle_browser_evaluate"),
    "web_search": ("browser_web", "_handle_web_search"),
    "fetch_url": ("browser_web", "_handle_fetch_url"),
    "http_probe": ("browser_web", "_handle_http_probe"),
    "analyze_pdf": ("files_docs", "_handle_analyze_pdf"),
    "claude_code": ("coding", "_handle_claude_code"),
    "git_ops": ("devops", "_handle_git_ops"),
    "kubectl": ("devops", "_handle_kubectl"),
    "docker_ops": ("devops", "_handle_docker_ops"),
    "terraform_ops": ("devops", "_handle_terraform_ops"),
    "issue_tracker": ("comms", "_handle_issue_tracker"),
    "validate_action": ("validation", "_handle_validate_action"),
    "email_send": ("comms", "_handle_email_send"),
    "email_search": ("comms", "_handle_email_search"),
    "email_read": ("comms", "_handle_email_read"),
    "email_list_recent": ("comms", "_handle_email_list_recent"),
}


class ToolExecutor:
    def __init__(
        self,
        config: ToolsConfig | None = None,
        memory_path: str | None = None,
        browser_manager: object | None = None,
        permission_manager: PermissionManager | None = None,
        output_streamer: ToolOutputStreamer | None = None,
        host_access_manager: HostAccessManager | None = None,
        email_config: object | None = None,
        app_config: object | None = None,
    ) -> None:
        self.config = config or ToolsConfig()
        # The FULL live config, supplied by wiring. Live state is not confined
        # to the data directory — sessions, context, logs, usage, the search
        # index, permissions and Codex credentials are each independently
        # relocatable, and a workspace overlapping any of them is as dangerous
        # as one inside ./data (PR #239 round-8 review, reproduced). Optional
        # so tests and the __new__ patch seam still construct.
        self._app_config = app_config
        self._email_config = email_config
        # The configured workspace VALUE is restart-required, but it is
        # re-validated on every local command rather than cached: existence,
        # type, ownership and mode are mutable filesystem state (see
        # _ensure_local_workspace).
        #
        # Resolution is LAZY (first local command) rather than at construction:
        # constructing an executor must not depend on deployment having created
        # the directory, or every test and fresh checkout breaks. The safety
        # property is unchanged, because it binds where it matters — a local
        # command never runs with an unvalidated cwd, and an unusable workspace
        # raises instead of silently falling back to the inherited cwd, which
        # is what would restore the 2026-07-27 hazard.
        self._local_workspace: str | None = None
        self._local_workspace_resolved = False
        self._memory_path = Path(memory_path) if memory_path else None
        self._browser_manager = browser_manager
        self._permission_manager = permission_manager
        self.output_streamer = output_streamer
        self._host_access = host_access_manager
        self._metrics: dict[str, dict[str, int]] = {}
        self._memory_lock = asyncio.Lock()
        self._memory_corrupt_logged_at = 0.0
        self._lists_lock = asyncio.Lock()
        self.risk_stats = RiskStats()
        self.recovery_stats = RecoveryStats()
        self.validation_stats = ResultValidationStats()
        from .risk_classifier import CommandGovernor

        gov_cfg = getattr(self.config, "governor", None)
        if gov_cfg:
            self.command_governor = CommandGovernor(
                block_critical=gov_cfg.block_critical,
                block_exfil=gov_cfg.block_exfil,
                admin_can_override=gov_cfg.admin_can_override,
                host_overrides=dict(gov_cfg.host_overrides) if gov_cfg.host_overrides else None,
            )
        else:
            self.command_governor = CommandGovernor()
        self._recovery_enabled = self.config.recovery.enabled
        self.freshness_stats = FreshnessStats()
        self._branch_freshness_enabled = self.config.branch_freshness.enabled
        self.bulkheads = _build_bulkhead_registry(self.config)
        pool_cfg = self.config.ssh_pool
        self.ssh_pool: SSHConnectionPool | None = (
            SSHConnectionPool(
                control_persist=pool_cfg.control_persist,
                socket_dir=pool_cfg.socket_dir,
            )
            if pool_cfg.enabled
            else None
        )
        # RFC-004 P4: the narrow seam handler domains use. Every field is a
        # LATE-RESOLVING callable closing over ``self`` (the executor
        # variable) — attribute lookup happens per call, so instance/class
        # monkeypatches on the executor keep governing domain behavior, and
        # stateful objects are reached by identity (R1 blocker #3).
        from .handlers.browser_web import BrowserWebTools
        from .handlers.coding import CodingTools
        from .handlers.comms import CommsTools
        from .handlers.deps import HandlerDeps
        from .handlers.devops import DevOpsTools
        from .handlers.files_docs import FilesDocsTools
        from .handlers.state import StateTools
        from .handlers.system import SystemTools
        from .handlers.validation import ValidationTools

        self._handler_deps = HandlerDeps(
            config=lambda: self.config,
            output_streamer=lambda: self.output_streamer,
            host_access=lambda: self._host_access,
            branch_freshness_enabled=lambda: self._branch_freshness_enabled,
            current_user_id=lambda: self._current_user_id,
            process_registry=lambda: self._ensure_process_registry(),
            browser_manager=lambda: self._browser_manager,
            bulkheads=lambda: self.bulkheads,
            memory_path=lambda: self._memory_path,
            memory_lock=lambda: self._memory_lock,
            lists_lock=lambda: self._lists_lock,
            email_config=lambda: self._email_config,
            issue_tracker_client=lambda: getattr(self, "_issue_tracker_client", None),
            command_governor=lambda: getattr(self, "command_governor", None),
            resolve_host=lambda alias: self._resolve_host(alias),
            resolve_default_host=lambda user_id: self._resolve_default_host(user_id),
            govern_command=lambda command, host=None: self._govern_command(command, host),
            exec_command=lambda *a, **k: self._exec_command(*a, **k),
            run_on_host=lambda *a, **k: self._run_on_host(*a, **k),
            annotate_with_freshness=lambda *a, **k: self._annotate_with_freshness(*a, **k),
            load_all_memory=lambda *a, **k: self._load_all_memory(*a, **k),
            save_all_memory=lambda *a, **k: self._save_all_memory(*a, **k),
        )
        # RFC-004 P2/P4: domain owners are PUBLIC attributes (the RFC-002
        # ``bot.media_tools`` convention) — tests call and patch handlers at
        # the domain level, e.g. ``executor.system_tools._handle_run_command``.
        self.system_tools = SystemTools(self._handler_deps)
        self.files_docs_tools = FilesDocsTools(self._handler_deps)
        self.browser_web_tools = BrowserWebTools(self._handler_deps)
        self.coding_tools = CodingTools(self._handler_deps)
        self.devops_tools = DevOpsTools(self._handler_deps)
        self.state_tools = StateTools(self._handler_deps)
        self.comms_tools = CommsTools(self._handler_deps)
        self.validation_tools = ValidationTools(self._handler_deps)
        # Owners for EXECUTOR_HANDLERS resolution. "core" is the executor
        # itself for not-yet-moved handlers; domain owners are added as the
        # P4–P6 waves land.
        self._handler_owners: dict[str, object] = {
            "core": self,
            "system": self.system_tools,
            "files_docs": self.files_docs_tools,
            "browser_web": self.browser_web_tools,
            "coding": self.coding_tools,
            "devops": self.devops_tools,
            "state": self.state_tools,
            "comms": self.comms_tools,
            "validation": self.validation_tools,
        }
        # RFC-004 P7 startup assertion (plan advisory #5): every dispatch-table
        # entry must resolve to a callable on its bound owner — a rebind typo
        # or missing domain method fails HERE, at construction, not on the
        # first live tool call.
        for _name, (_owner_key, _attr) in EXECUTOR_HANDLERS.items():
            _owner = self._handler_owners.get(_owner_key)
            assert _owner is not None, f"EXECUTOR_HANDLERS[{_name!r}]: unbound owner {_owner_key!r}"
            assert callable(getattr(_owner, _attr, None)), (
                f"EXECUTOR_HANDLERS[{_name!r}]: {_owner_key}.{_attr} does not resolve"
            )

    @property
    def _current_user_id(self) -> str | None:
        """Caller id for the in-flight tool call (contextvar-backed, task-isolated)."""
        return _user_id_ctx.get()

    @property
    def _current_user_tier(self) -> str | None:
        """Caller tier for the in-flight tool call (contextvar-backed, task-isolated)."""
        return _user_tier_ctx.get()

    def _resolve_host(self, alias: str) -> tuple[str, str, str] | None:
        """Resolve host alias to (address, ssh_user, os). Returns None if not allowed."""
        host = self.config.hosts.get(alias)
        if not host:
            return None
        if self._host_access and self._current_user_id:
            if not self._host_access.is_host_allowed(self._current_user_id, alias):
                return None
        return host.address, host.ssh_user, host.os

    def _resolve_default_host(self, user_id: str | None) -> str:
        """Get the default host for a user, or first configured host."""
        if self._host_access and user_id:
            default = self._host_access.get_default_host(user_id)
            if default:
                return default
        hosts = list(self.config.hosts.keys())
        return hosts[0] if hosts else ""

    def _protected_roots(self) -> list[str]:
        """Roots the local workspace must not overlap, derived from the RUNNING
        application rather than assumed (PR #239 review).

        A hardcoded ``/opt/odin`` is wrong under Docker (install root ``/app``)
        and for source checkouts, and packaged ``/opt/odin/data`` is a symlink
        to ``/var/lib/odin`` — so the live-data root is taken from the actual
        configured data paths and canonicalized, not string-joined.

        Derivation itself lives in workspace.command_protected_roots so the
        startup migration and the self-update preflight protect exactly the
        same directories. When each caller derived its own, the preflight
        accepted (and created) a workspace beside live memory.json that the
        executor then rejected (PR #239 round-6 review).
        """
        return command_protected_roots(
            # Install root: the package's own location (…/src/tools/executor.py).
            Path(__file__).resolve().parents[2],
            # getattr-guarded throughout: the sanctioned __new__ patch seam
            # builds executors without __init__, so these may not exist.
            getattr(self, "_app_config", None),
            tools=getattr(self, "config", None),
            # The live memory.json is supplied by wiring, not ToolsConfig;
            # falling back to the shared default rather than no protection.
            memory_path=getattr(self, "_memory_path", None) or DEFAULT_MEMORY_PATH,
        )

    def get_workspace_metrics(self) -> dict[str, float]:
        """Usage of the local command workspace, for Prometheus.

        The accepted design deliberately does NOT auto-prune — age-based
        deletion would destroy the cross-command continuity the stable
        workspace exists to provide — so growth must be observable instead,
        with cleanup an explicit operator action (PR #239 round-2 review).

        Never raises: metrics collection must not be able to break a command
        path, and an unresolvable workspace simply reports nothing.
        """
        try:
            root = Path(self._ensure_local_workspace())
        except Exception:
            return {}
        total_bytes = 0.0
        files = 0.0
        try:
            for dirpath, _dirnames, filenames in os.walk(root, followlinks=False):
                for name in filenames:
                    files += 1
                    try:
                        total_bytes += os.lstat(os.path.join(dirpath, name)).st_size
                    except OSError:
                        pass
        except OSError:
            return {}
        metrics = {"bytes": total_bytes, "files": files}
        try:
            usage = shutil.disk_usage(root)
            metrics["free_bytes"] = float(usage.free)
        except OSError:
            pass
        try:
            stats = os.statvfs(root)
            metrics["free_inodes"] = float(stats.f_favail)
        except (OSError, AttributeError):
            pass
        return metrics

    def _ensure_local_workspace(self) -> str:
        """Resolve and re-validate the cwd for local user commands.

        Raises :class:`WorkspaceError` if the configured directory is unusable.
        Deliberately no fallback: inheriting the process cwd is exactly the
        behaviour that let a bare `rm -rf data` delete the live install.
        """
        # Validated on EVERY call, not cached (PR #239 round-3 review): the
        # configured VALUE is restart-required, but existence, type, ownership
        # and mode are mutable filesystem state. Caching them meant fail-closed
        # only applied to the first command — replacing the directory with a
        # symlink into the install afterwards was accepted, and a post-
        # validation chmod was ignored. The check is a handful of stat calls.
        workspace = str(
            resolve_workspace(
                self.config.local_working_dir,
                protected_roots=self._protected_roots(),
            )
        )
        self._local_workspace = workspace
        self._local_workspace_resolved = True
        return workspace

    def _ensure_process_registry(self):
        """Lazy-init the ProcessRegistry ON THE EXECUTOR (RFC-004 P4).

        The attribute stays here — not on the system domain — because the
        web API (agents_loops, config_admin) and graceful shutdown read
        ``tool_executor._process_registry`` directly.
        """
        if not hasattr(self, "_process_registry"):
            from .process_manager import ProcessRegistry

            # Pass the RESOLVER, not a resolved string: each background spawn
            # must re-verify the workspace's mutable filesystem invariants.
            self._process_registry = ProcessRegistry(workspace=self._ensure_local_workspace)
        return self._process_registry

    def check_permission(self, tool_name: str, user_id: str | None) -> str | None:
        """Check if user has permission to use the tool.

        Returns None if allowed, or an error message string if denied.
        """
        if not self._permission_manager or not user_id:
            return None
        allowed = self._permission_manager.allowed_tool_names(user_id)
        if allowed is None:
            return None
        if tool_name not in allowed:
            tier = self._permission_manager.get_tier(user_id)
            return (
                f"Permission denied: tool '{tool_name}' is not available "
                f"for tier '{tier}'. Contact an admin to upgrade your permissions."
            )
        return None

    def _resolve_handler(self, tool_name: str):
        """Resolve a tool handler at CALL time (RFC-004 P2, fallback retired P7).

        Instance-attribute overrides win FIRST — the historical patch seam
        (``executor._handle_x = fake``, 13+ test sites) keeps governing even
        for handlers whose real bodies live on domain owners; checked via
        ``__dict__`` so class-level methods can't short-circuit the table.
        Otherwise EXECUTOR_HANDLERS maps name -> (owner_key, attr) and the
        handler is fetched with getattr(owner, attr) NOW — never pre-bound.
        This method is the ONLY sanctioned dynamic ``_handle_`` spelling in
        src/ (the characterization contract's AST scan enforces that).
        """
        override = self.__dict__.get(f"_handle_{tool_name}")
        if override is not None:
            return override
        entry = EXECUTOR_HANDLERS.get(tool_name)
        # getattr: tolerate __init__-bypassing construction (ToolExecutor.__new__
        # in older fixtures) — such instances resolve nothing table-side.
        owners = getattr(self, "_handler_owners", None)
        if entry is None or owners is None:
            return None
        owner = owners.get(entry[0])
        if owner is None:
            return None
        return getattr(owner, entry[1], None)

    async def execute(
        self, tool_name: str, tool_input: dict, *, user_id: str | None = None
    ) -> ToolResult:
        handler = self._resolve_handler(tool_name)
        if handler is None:
            return ToolResult(
                output=f"Unknown tool: {tool_name}",
                ok=False,
                error="unknown_tool",
                tool_name=tool_name,
            )

        _user_id_ctx.set(user_id)
        _user_tier_ctx.set(
            self._permission_manager.get_tier(user_id)
            if self._permission_manager and user_id
            else None
        )

        denial = self.check_permission(tool_name, user_id)
        if denial:
            # A truthy denial implies _permission_manager and user_id were
            # both set (check_permission returns None otherwise).
            log.warning(
                "RBAC denied %s for user %s on tool %s",
                self._permission_manager.get_tier(user_id),  # type: ignore[union-attr, arg-type]
                user_id,
                tool_name,
            )
            self._metrics.setdefault(tool_name, {"calls": 0, "errors": 0, "timeouts": 0})
            self._metrics[tool_name]["errors"] += 1
            return ToolResult(
                output=denial, ok=False, error="permission_denied", tool_name=tool_name
            )

        assessment = classify_tool(tool_name, tool_input)
        self.risk_stats.record(tool_name, assessment)
        self._last_risk_assessment = assessment
        if assessment.level.value in ("high", "critical"):
            log.warning(
                "Risk %s for %s: %s",
                assessment.level.value,
                tool_name,
                assessment.reason,
            )

        timeout = self.config.get_tool_timeout(tool_name)
        t0 = asyncio.get_event_loop().time()
        raw = await self._try_tool(tool_name, handler, tool_input, timeout, user_id)
        duration_ms = int((asyncio.get_event_loop().time() - t0) * 1000)

        # Unpack structured (output, exit_code) returns from handlers
        if isinstance(raw, tuple):
            raw_result, exit_code = raw[0], raw[1]
            is_error = exit_code != 0
        else:
            raw_result = raw
            exit_code = None
            is_error = isinstance(raw_result, str) and raw_result.startswith(_ERROR_RESULT_PREFIXES)

        if self._recovery_enabled:
            category = self._check_recoverable(raw_result)
            if category is not None:
                snippet = raw_result[:120] if isinstance(raw_result, str) else ""
                decision = _decide_recovery_action(tool_name=tool_name, category=category)
                if decision.action == "hint":
                    self.recovery_stats.record_failure(tool_name, category, snippet)
                    log.info(
                        "Recovery hint for %s (%s): not retrying, annotating result",
                        tool_name,
                        category.value,
                    )
                    hint = decision.hint_text
                    if hint and isinstance(raw_result, str) and hint not in raw_result:
                        raw_result = f"{raw_result}\n\n{hint}"
                elif decision.action == "skip":
                    if tool_name in UNSAFE_TO_RETRY:
                        log.warning(
                            "Recovery skipped for %s (%s): tool is not safe to retry "
                            "(may have already executed)",
                            tool_name,
                            category.value,
                        )
                    self.recovery_stats.record_failure(tool_name, category, snippet)
                else:
                    delay = decision.delay_seconds
                    self.recovery_stats.record_attempt(tool_name, category, snippet)
                    log.info(
                        "Recovery for %s (%s): retrying after %.1fs",
                        tool_name,
                        category.value,
                        delay,
                    )
                    if delay > 0:
                        await asyncio.sleep(delay)
                    retry_raw = await self._try_tool(
                        tool_name, handler, tool_input, timeout, user_id
                    )
                    if isinstance(retry_raw, tuple):
                        raw_result, exit_code = retry_raw[0], retry_raw[1]
                        is_error = exit_code != 0
                    else:
                        raw_result = retry_raw
                    retry_cat = self._check_recoverable(raw_result)
                    if retry_cat is not None:
                        self.recovery_stats.record_failure(tool_name, category, snippet)
                    else:
                        self.recovery_stats.record_success(tool_name, category, snippet)
                        is_error = isinstance(raw_result, str) and raw_result.startswith(
                            _ERROR_RESULT_PREFIXES
                        )

        mutation_detected = False
        mutation_reason = ""
        if not is_error and isinstance(raw_result, str):
            raw_result, _mutation = annotate_if_mutation(tool_name, tool_input, raw_result)
            mutation_detected = _mutation.detected
            mutation_reason = _mutation.reason

        outcome = validate_tool_result(tool_name, raw_result, stats=self.validation_stats)

        # Extract exit code from string if handler didn't return one
        if exit_code is None and isinstance(raw_result, str):
            import re as _re

            m = _re.search(r"\(exit (\d+)\)", raw_result)
            if m:
                exit_code = int(m.group(1))

        return ToolResult(
            output=outcome.normalized,
            ok=not is_error,
            error=raw_result[:200] if is_error else None,
            exit_code=exit_code,
            truncated="truncated" in outcome.violations,
            duration_ms=duration_ms,
            tool_name=tool_name,
            risk_level=assessment.level.value,
            risk_reason=assessment.reason,
            requires_validation=mutation_detected,
            validation_reason=mutation_reason,
        )

    async def _try_tool(
        self,
        tool_name: str,
        handler,
        tool_input: dict,
        timeout: int,
        user_id: str | None,
    ) -> str | tuple[str, int]:
        """Single attempt at executing a tool handler.

        Handlers may return either a plain string or a (output, exit_code)
        tuple.  Tuples propagate exit codes into ToolResult without
        string-prefix parsing.
        """
        token = _current_tool_timeout_ctx.set(timeout)
        try:
            if tool_name in ("memory_manage", "manage_list"):
                coro = handler(tool_input, user_id=user_id)
            else:
                coro = handler(tool_input)
            result = await asyncio.wait_for(coro, timeout=timeout)
            self._metrics.setdefault(tool_name, {"calls": 0, "errors": 0, "timeouts": 0})
            self._metrics[tool_name]["calls"] += 1
            return result
        except TimeoutError:
            self._metrics.setdefault(tool_name, {"calls": 0, "errors": 0, "timeouts": 0})
            self._metrics[tool_name]["errors"] += 1
            self._metrics[tool_name]["timeouts"] += 1
            log.error("Tool %s timed out after %ds", tool_name, timeout)
            return f"Error: tool '{tool_name}' timed out after {timeout}s", -1
        except Exception as e:
            self._metrics.setdefault(tool_name, {"calls": 0, "errors": 0, "timeouts": 0})
            self._metrics[tool_name]["errors"] += 1
            log.error("Tool %s failed: %s", tool_name, e)
            return f"Error executing {tool_name}: {e}", -1
        finally:
            # Always restore the outer value (nested calls) / clear it, even on
            # timeout or cancellation — no stale timeout leaks to the next tool.
            _current_tool_timeout_ctx.reset(token)

    # Categories excluded from tool-level recovery (they have their own
    # retry logic or the cost of retrying exceeds the benefit).
    _SKIP_RECOVERY = frozenset({RecoveryCategory.TIMEOUT})

    # Tools that must NEVER be retried regardless of risk classification,
    @staticmethod
    def _check_recoverable(result: str) -> RecoveryCategory | None:
        """Check if a tool result indicates a recoverable failure."""
        if not isinstance(result, str):
            return None
        cat = _classify_error(result)
        if cat is not None and cat not in ToolExecutor._SKIP_RECOVERY:
            return cat
        if result.startswith("Error"):
            cat = _classify_exception(result)
            if cat is not None and cat not in ToolExecutor._SKIP_RECOVERY:
                return cat
        return None

    async def _annotate_with_freshness(
        self,
        result: str,
        host_alias: str,
        tool_name: str,
        command: str,
    ) -> str:
        """Check branch freshness and annotate test failure result if stale."""
        resolved = self._resolve_host(host_alias)
        if not resolved:
            return result
        address, ssh_user, _ = resolved
        try:
            status = await check_branch_freshness(
                self._exec_command,
                address,
                ssh_user,
            )
        except Exception as e:
            log.warning("Branch freshness check failed: %s", e)
            return result

        if status.fetch_failed:
            self.freshness_stats.record_fetch_failure()

        event = FreshnessEvent(
            tool_name=tool_name,
            command=command[:120],
            is_stale=status.is_stale,
            commits_behind=status.commits_behind,
            branch=status.local_branch,
        )
        self.freshness_stats.record(event)

        warning = format_staleness_warning(status)
        if warning:
            log.info(
                "Branch %s is %d commit(s) behind %s — test failure may be stale",
                status.local_branch,
                status.commits_behind,
                status.remote_ref,
            )
            return result + warning
        return result

    def get_metrics(self) -> dict[str, dict[str, int]]:
        """Return per-tool call and error counts."""
        return dict(self._metrics)

    def _host_os(self, alias: str) -> str:
        host = self.config.hosts.get(alias)
        return host.os if host else "linux"

    async def _exec_command(
        self,
        address: str,
        command: str,
        ssh_user: str = "root",
        timeout: int | None = None,
        on_output: OutputCallback | None = None,
        use_workspace: bool = False,
    ) -> tuple[int, str]:
        """Execute a command locally or via SSH depending on host address.

        Local hosts (127.0.0.1, localhost, ::1) use direct subprocess —
        no SSH key needed, no network overhead.

        Both paths are wrapped in bulkhead semaphores so that a flood of
        SSH commands cannot exhaust subprocess/FD resources needed by
        local commands (and vice versa).

        When *on_output* is provided, stdout lines are streamed to the
        callback as they arrive (in addition to being collected).
        """
        if timeout is None:
            timeout = _current_tool_timeout_ctx.get() or self.config.command_timeout_seconds
        if is_local_address(address):
            # The workspace applies ONLY to raw user commands, and only because
            # the caller asked for it. This primitive also backs git_ops,
            # docker, terraform, kubectl, claude_code, PDF host reads and
            # validation probes, whose documented defaults resolve against the
            # process cwd — git_ops with `repo` omitted means ".", i.e. the
            # install repo, and silently repointing that at a scratch directory
            # broke `git_ops status` with "fatal: not a git repository"
            # (PR #239 round-8 review, reproduced). Default False keeps every
            # such tool byte-identical to pre-PR behaviour.
            cwd = self._ensure_local_workspace() if use_workspace else None
            bh = self.bulkheads.get("subprocess")
            if bh:
                try:
                    async with bh.acquire():
                        return await run_local_command(
                            command,
                            timeout=timeout,
                            on_output=on_output,
                            cwd=cwd,
                        )
                except BulkheadFullError:
                    return 1, "Error: subprocess bulkhead full — too many concurrent local commands"
            return await run_local_command(
                command, timeout=timeout, on_output=on_output, cwd=cwd
            )
        ssh_retry = self.config.ssh_retry
        ssh_kwargs: dict[str, Any] = dict(
            host=address,
            command=command,
            ssh_key_path=self.config.ssh_key_path,
            known_hosts_path=self.config.ssh_known_hosts_path,
            timeout=timeout,
            ssh_user=ssh_user,
            max_retries=ssh_retry.max_retries,
            retry_base_delay=ssh_retry.base_delay,
            retry_max_delay=ssh_retry.max_delay,
            pool=self.ssh_pool,
            on_output=on_output,
        )
        bh = self.bulkheads.get("ssh")
        if bh:
            try:
                async with bh.acquire():
                    return await run_ssh_command(**ssh_kwargs)
            except BulkheadFullError:
                return 1, "Error: SSH bulkhead full — too many concurrent SSH commands"
        return await run_ssh_command(**ssh_kwargs)

    async def _run_on_host(
        self, alias: str, command: str, use_workspace: bool = False
    ) -> str | tuple[str, int]:
        """Run a command on an aliased host.

        ``use_workspace`` is opt-in for the same reason as _exec_command: this
        also backs read_file/write_file host reads, skill_context.run_on_host,
        and the audit diff tracker, whose paths are absolute and whose cwd
        semantics must not change.
        """
        resolved = self._resolve_host(alias)
        if not resolved:
            return f"Unknown or disallowed host: {alias}"
        address, ssh_user, _os = resolved
        code, output = await self._exec_command(
            address, command, ssh_user, use_workspace=use_workspace
        )
        if code != 0:
            return f"Command failed (exit {code}):\n{output}", code
        return output, 0

    def _govern_command(self, command: str, host: str | None = None) -> tuple[bool, str, str]:
        """Shared governor check. Returns (allowed, denial_message, governor_note)."""
        if not getattr(self, "command_governor", None):
            return True, "", ""
        check = self.command_governor.check(
            command,
            user_tier=getattr(self, "_current_user_tier", None),
            host=host,
        )
        if not check.allowed:
            return False, check.denial_message(), ""
        note = ""
        if check.risk.value in ("high", "critical"):
            note = f"[governor: allowed — {check.risk.value} risk, {check.reason}]\n"
        return True, "", note

    # --- Multi-host tools ---

    # --- Browser tools (text-returning, screenshot handled in client.py) ---

    # --- Web tools ---

    # --- PDF analysis ---

    # --- Process management ---

    # --- Claude Code ---

    def set_user_context(self, user_id: str | None) -> None:
        """Deprecated: user_id is now passed directly to execute().

        Kept for backward compatibility with tests. Prefer passing user_id
        as a keyword argument to execute() instead.
        """
        _user_id_ctx.set(user_id)

    def _load_all_memory(self) -> dict[str, dict[str, str]]:
        """Load the full scoped memory structure.

        Returns {"global": {...}, "user_<id>": {...}, ...}. STRICT — for
        mutation paths: a missing file is an empty store, but an unreadable /
        malformed / wrong-shape file raises StoreCorruptError (a corrupt copy
        is preserved) so the caller REFUSES to overwrite rather than silently
        wiping the corpus. Read paths that must not crash chat use
        _load_all_memory_safe. Auto-migrates the old flat format to scoped.
        """
        from ..json_store import load_json_store

        # The section-shape check runs via the validate hook so nested
        # corruption gets the same sidecar backup as top-level corruption.
        data = load_json_store(
            self._memory_path, container=dict, validate=_validate_memory_shape
        )
        if not data:
            return {"global": {}}
        # Migrate old flat format: if no "global" key, treat entire dict as global
        if "global" not in data:
            migrated = {"global": data}
            self._save_all_memory(migrated)
            return migrated
        return data

    def _save_all_memory(self, data: dict[str, dict[str, str]]) -> None:
        if not self._memory_path:
            return
        self._memory_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._memory_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2))
        tmp.replace(self._memory_path)

    def _load_all_memory_safe(self) -> dict[str, dict[str, str]]:
        """Read-path variant of _load_all_memory: corruption degrades to an
        empty store (inject no working memory) with a rate-limited warning,
        never raising into the prompt build so a damaged file can't take chat
        down."""
        from ..json_store import StoreCorruptError

        try:
            return self._load_all_memory()
        except StoreCorruptError as exc:
            now = time.monotonic()
            if now - self._memory_corrupt_logged_at > 300:
                log.error("memory.json unavailable — injecting no working memory: %s", exc)
                self._memory_corrupt_logged_at = now
            return {"global": {}}

    def _load_memory(self) -> dict[str, str]:
        """Load merged global memory (READ path — degrades on corruption)."""
        return self._load_all_memory_safe().get("global", {})

    def _load_memory_for_user(self, user_id: str | None) -> dict[str, str]:
        """Load merged global + user memory for system prompt injection (READ
        path — degrades to empty on corruption so a damaged store never crashes
        chat)."""
        all_mem = self._load_all_memory_safe()
        merged = dict(all_mem.get("global", {}))
        if user_id:
            user_key = f"user_{user_id}"
            merged.update(all_mem.get(user_key, {}))
        return merged

    # ------------------------------------------------------------------
    # Universal list management
    # ------------------------------------------------------------------

    # --- Email tools (SMTP/IMAP) ---
