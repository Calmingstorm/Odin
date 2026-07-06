from __future__ import annotations

import asyncio
import contextvars
import json
import shlex
from pathlib import Path

from ..config.schema import ToolsConfig
from ..odin_log import get_logger
from ..permissions.host_access import HostAccessManager
from ..permissions.manager import PermissionManager
from .branch_freshness import (
    BranchStatus,
    FreshnessEvent,
    FreshnessStats,
    check_branch_freshness,
    format_staleness_warning,
)
from .bulkhead import BulkheadFullError, BulkheadRegistry
from .recovery import (
    RecoveryCategory,
    RecoveryStats,
    RecoveryStrategy,
    UNSAFE_TO_RETRY,
    classify_error as _classify_error,
    classify_exception as _classify_exception,
    decide_recovery_action as _decide_recovery_action,
    get_policy as _get_recovery_policy,
    get_retry_delay as _get_retry_delay,
)
from .post_validation import annotate_if_mutation
from .result_validator import ResultValidationStats, ToolResult, validate_tool_result
from .risk_classifier import RiskLevel, RiskStats, classify_tool
from .output_streamer import ToolOutputStreamer
from .ssh import is_local_address, run_local_command, run_ssh_command
from .ssh_pool import SSHConnectionPool

log = get_logger("tools")

# Max working-memory notes retained per section (global / per-user). The full
# merged map is injected into every system prompt, so this bounds prompt bloat;
# oldest-by-write notes are evicted past the cap.
MEMORY_MAX_KEYS_PER_SECTION = 200

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


def _build_bulkhead_registry(config: ToolsConfig) -> BulkheadRegistry:
    """Build a BulkheadRegistry from tools config."""
    registry = BulkheadRegistry()
    bh = config.bulkhead
    registry.register("ssh", bh.ssh_max_concurrent, bh.ssh_max_queued)
    registry.register("subprocess", bh.subprocess_max_concurrent, bh.subprocess_max_queued)
    registry.register("browser", bh.browser_max_concurrent, bh.browser_max_queued)
    return registry


# RFC-004 P2: explicit late-bound dispatch table — tool name -> (owner_key, attr).
# Handlers are resolved via getattr(owner, attr) at CALL time, never pre-bound,
# so instance-attribute patches (``executor._handle_x = fake``) keep governing
# execution (the patch-seam contract in test_executor_dispatch_parity). All
# entries point at the "core" owner until the P4–P6 waves rebind them to domain
# owners. The characterization contract pins table keys == executor-routed set.
EXECUTOR_HANDLERS: dict[str, tuple[str, str]] = {
    "run_command": ("system", "_handle_run_command"),
    "run_script": ("system", "_handle_run_script"),
    "run_command_multi": ("system", "_handle_run_command_multi"),
    "read_file": ("files_docs", "_handle_read_file"),
    "write_file": ("files_docs", "_handle_write_file"),
    "memory_manage": ("core", "_handle_memory_manage"),
    "manage_list": ("core", "_handle_manage_list"),
    "manage_process": ("system", "_handle_manage_process"),
    "browser_read_page": ("core", "_handle_browser_read_page"),
    "browser_read_table": ("core", "_handle_browser_read_table"),
    "browser_click": ("core", "_handle_browser_click"),
    "browser_fill": ("core", "_handle_browser_fill"),
    "browser_evaluate": ("core", "_handle_browser_evaluate"),
    "web_search": ("core", "_handle_web_search"),
    "fetch_url": ("core", "_handle_fetch_url"),
    "http_probe": ("core", "_handle_http_probe"),
    "analyze_pdf": ("files_docs", "_handle_analyze_pdf"),
    "claude_code": ("core", "_handle_claude_code"),
    "git_ops": ("core", "_handle_git_ops"),
    "kubectl": ("core", "_handle_kubectl"),
    "docker_ops": ("core", "_handle_docker_ops"),
    "terraform_ops": ("core", "_handle_terraform_ops"),
    "issue_tracker": ("core", "_handle_issue_tracker"),
    "validate_action": ("core", "_handle_validate_action"),
    "email_send": ("core", "_handle_email_send"),
    "email_search": ("core", "_handle_email_search"),
    "email_read": ("core", "_handle_email_read"),
    "email_list_recent": ("core", "_handle_email_list_recent"),
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
    ) -> None:
        self.config = config or ToolsConfig()
        self._email_config = email_config
        self._memory_path = Path(memory_path) if memory_path else None
        self._browser_manager = browser_manager
        self._permission_manager = permission_manager
        self.output_streamer = output_streamer
        self._host_access = host_access_manager
        self._metrics: dict[str, dict[str, int]] = {}
        self._memory_lock = asyncio.Lock()
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
        self._current_tool_timeout: int | None = None
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
        from .handlers.deps import HandlerDeps
        from .handlers.files_docs import FilesDocsTools
        from .handlers.system import SystemTools

        self._handler_deps = HandlerDeps(
            config=lambda: self.config,
            output_streamer=lambda: self.output_streamer,
            host_access=lambda: self._host_access,
            branch_freshness_enabled=lambda: self._branch_freshness_enabled,
            current_user_id=lambda: self._current_user_id,
            process_registry=lambda: self._ensure_process_registry(),
            resolve_host=lambda alias: self._resolve_host(alias),
            resolve_default_host=lambda user_id: self._resolve_default_host(user_id),
            govern_command=lambda command, host=None: self._govern_command(command, host),
            exec_command=lambda *a, **k: self._exec_command(*a, **k),
            run_on_host=lambda *a, **k: self._run_on_host(*a, **k),
            annotate_with_freshness=lambda *a, **k: self._annotate_with_freshness(*a, **k),
        )
        # RFC-004 P2/P4: domain owners are PUBLIC attributes (the RFC-002
        # ``bot.media_tools`` convention) — tests call and patch handlers at
        # the domain level, e.g. ``executor.system_tools._handle_run_command``.
        self.system_tools = SystemTools(self._handler_deps)
        self.files_docs_tools = FilesDocsTools(self._handler_deps)
        # Owners for EXECUTOR_HANDLERS resolution. "core" is the executor
        # itself for not-yet-moved handlers; domain owners are added as the
        # P4–P6 waves land.
        self._handler_owners: dict[str, object] = {
            "core": self,
            "system": self.system_tools,
            "files_docs": self.files_docs_tools,
        }

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

    def _ensure_process_registry(self):
        """Lazy-init the ProcessRegistry ON THE EXECUTOR (RFC-004 P4).

        The attribute stays here — not on the system domain — because the
        web API (agents_loops, config_admin) and graceful shutdown read
        ``tool_executor._process_registry`` directly.
        """
        if not hasattr(self, "_process_registry"):
            from .process_manager import ProcessRegistry

            self._process_registry = ProcessRegistry()
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
        """Resolve a tool handler at CALL time (RFC-004 P2).

        Table-first: EXECUTOR_HANDLERS maps name -> (owner_key, attr) and the
        handler is fetched with getattr(owner, attr) NOW — never pre-bound —
        so instance-attribute patches keep governing execution. The legacy
        f-string lookup remains as a logged fallback until P7 retires it.
        """
        # Instance-attribute overrides win FIRST — this is the historical
        # patch seam (13+ test sites do ``executor._handle_x = fake``) and it
        # must keep governing even for handlers whose real bodies now live on
        # domain owners. Checked via __dict__ so class-level methods don't
        # short-circuit table resolution.
        override = self.__dict__.get(f"_handle_{tool_name}")
        if override is not None:
            return override
        entry = EXECUTOR_HANDLERS.get(tool_name)
        # getattr: tolerate __init__-bypassing construction (ToolExecutor.__new__
        # in older fixtures) — resolution then falls through to the legacy path.
        owners = getattr(self, "_handler_owners", None)
        if entry is not None and owners is not None:
            owner_key, attr = entry
            owner = owners.get(owner_key)
            if owner is not None:
                handler = getattr(owner, attr, None)
                if handler is not None:
                    return handler
        legacy = getattr(self, f"_handle_{tool_name}", None)
        if legacy is not None:
            log.warning(
                "Tool %s resolved via legacy getattr fallback — missing EXECUTOR_HANDLERS entry",
                tool_name,
            )
        return legacy

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
            log.warning(
                "RBAC denied %s for user %s on tool %s",
                self._permission_manager.get_tier(user_id),
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
                            "Recovery skipped for %s (%s): tool is not safe to retry (may have already executed)",
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
        try:
            self._current_tool_timeout = timeout
            if tool_name in ("memory_manage", "manage_list"):
                coro = handler(tool_input, user_id=user_id)
            else:
                coro = handler(tool_input)
            result = await asyncio.wait_for(coro, timeout=timeout)
            self._metrics.setdefault(tool_name, {"calls": 0, "errors": 0, "timeouts": 0})
            self._metrics[tool_name]["calls"] += 1
            return result
        except asyncio.TimeoutError:
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
        on_output: object | None = None,
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
            timeout = self._current_tool_timeout or self.config.command_timeout_seconds
        if is_local_address(address):
            bh = self.bulkheads.get("subprocess")
            if bh:
                try:
                    async with bh.acquire():
                        return await run_local_command(
                            command, timeout=timeout, on_output=on_output
                        )
                except BulkheadFullError:
                    return 1, "Error: subprocess bulkhead full — too many concurrent local commands"
            return await run_local_command(command, timeout=timeout, on_output=on_output)
        ssh_retry = self.config.ssh_retry
        ssh_kwargs = dict(
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

    async def _run_on_host(self, alias: str, command: str) -> str | tuple[str, int]:
        resolved = self._resolve_host(alias)
        if not resolved:
            return f"Unknown or disallowed host: {alias}"
        address, ssh_user, _os = resolved
        code, output = await self._exec_command(address, command, ssh_user)
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

    async def _handle_browser_read_page(self, inp: dict) -> str:
        if not self._browser_manager:
            return "Browser automation is not enabled. Set browser.enabled=true in config."
        from .browser import handle_browser_read_page

        return await self._browser_with_bulkhead(
            handle_browser_read_page(self._browser_manager, inp)
        )

    async def _handle_browser_read_table(self, inp: dict) -> str:
        if not self._browser_manager:
            return "Browser automation is not enabled. Set browser.enabled=true in config."
        from .browser import handle_browser_read_table

        return await self._browser_with_bulkhead(
            handle_browser_read_table(self._browser_manager, inp)
        )

    async def _handle_browser_click(self, inp: dict) -> str:
        if not self._browser_manager:
            return "Browser automation is not enabled. Set browser.enabled=true in config."
        from .browser import handle_browser_click

        return await self._browser_with_bulkhead(handle_browser_click(self._browser_manager, inp))

    async def _handle_browser_fill(self, inp: dict) -> str:
        if not self._browser_manager:
            return "Browser automation is not enabled. Set browser.enabled=true in config."
        from .browser import handle_browser_fill

        return await self._browser_with_bulkhead(handle_browser_fill(self._browser_manager, inp))

    async def _handle_browser_evaluate(self, inp: dict) -> str:
        if not self._browser_manager:
            return "Browser automation is not enabled. Set browser.enabled=true in config."
        from .browser import handle_browser_evaluate

        return await self._browser_with_bulkhead(
            handle_browser_evaluate(self._browser_manager, inp)
        )

    # --- Web tools ---

    async def _handle_web_search(self, inp: dict) -> str:
        from .web import web_search

        max_results = min(inp.get("max_results", 5), 10)
        return await web_search(inp["query"], max_results=max_results)

    async def _handle_fetch_url(self, inp: dict) -> str:
        from .web import fetch_url

        return await fetch_url(inp["url"])

    # --- PDF analysis ---

    # --- Process management ---

    # --- Claude Code ---

    async def _handle_claude_code(self, inp: dict) -> str:
        host = inp.get("host") or self.config.claude_code_host
        if not host:
            return "claude_code_host not configured in tools config"
        working_dir = inp["working_directory"]
        prompt = inp["prompt"]
        allowed_tools = inp.get("allowed_tools")
        allow_edits = inp.get("allow_edits", False)

        resolved = self._resolve_host(host)
        if not resolved:
            return f"Unknown or disallowed host: {host}"
        address, ssh_user, _os = resolved

        claude_user = self.config.claude_code_user
        import os

        _already_claude_user = (os.getenv("USER", "") == claude_user) if claude_user else False
        if allow_edits and not claude_user:
            return "claude_code_user not configured — required for allow_edits=true"

        import base64 as b64mod

        encoded_prompt = b64mod.b64encode(prompt.encode()).decode()

        claude_args = [
            "claude",
            "--print",
            "--output-format stream-json",
            "--verbose",
            "--no-session-persistence",
        ]
        if allow_edits:
            claude_args.append("--dangerously-skip-permissions")
        if allowed_tools:
            claude_args.append(f"--allowedTools {shlex.quote(allowed_tools)}")

        claude_cmd = " ".join(claude_args)
        safe_wd = shlex.quote(working_dir)

        if allow_edits:
            safe_user = shlex.quote(claude_user)
            inner = (
                f"cd {safe_wd} && echo '{encoded_prompt}' | base64 -d | timeout 3600 {claude_cmd}"
            )
            if _already_claude_user:
                cmd = inner
            else:
                cmd = f"su - {safe_user} -c {shlex.quote(inner)}"
        else:
            cmd = f"cd {safe_wd} && echo '{encoded_prompt}' | base64 -d | timeout 3600 {claude_cmd}"

        on_output = None
        finish_cb = None
        if self.output_streamer and self.output_streamer.is_enabled("claude_code"):
            _, on_output, finish_cb = self.output_streamer.create_callback(
                "claude_code",
                channel_id=host,
            )

        code, output = await self._exec_command(
            address,
            cmd,
            ssh_user,
            timeout=3660,
            on_output=on_output,
        )
        if finish_cb:
            try:
                await finish_cb()
            except Exception:
                pass

        if code != 0:
            return f"Claude Code failed (exit {code}):\n{output[-2000:]}"

        response_text, activity = self._parse_claude_stream_json(output)

        max_output = inp.get("max_output_chars", 6000)
        if len(response_text) > max_output:
            half = max_output // 2
            response_text = response_text[:half] + "[... truncated ...]" + response_text[-half:]
        return response_text + activity

    @staticmethod
    def _parse_claude_stream_json(raw_output: str) -> tuple[str, str]:
        """Parse stream-json output into (response_text, activity_summary)."""
        response_text = ""
        tool_calls: list[dict] = []
        cost = 0.0
        num_turns = 0
        duration_ms = 0

        for line in raw_output.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue

            msg_type = d.get("type", "")

            if msg_type == "assistant":
                for block in (d.get("message") or {}).get("content", []):
                    bt = block.get("type", "")
                    if bt == "tool_use":
                        inp = block.get("input", {})
                        entry = {"tool": block.get("name", "?"), "input": inp}
                        tool_calls.append(entry)

            elif msg_type == "result":
                response_text = d.get("result", "") or ""
                cost = d.get("total_cost_usd", 0)
                num_turns = d.get("num_turns", 0)
                duration_ms = d.get("duration_ms", 0)

        if not tool_calls and not cost:
            return raw_output, ""

        lines = ["\n\n--- claude_code activity ---"]
        lines.append(
            f"Turns: {num_turns} | Cost: ${cost:.4f} | Duration: {duration_ms / 1000:.1f}s"
        )

        reads = []
        edits = []
        writes = []
        commands = []
        other = []

        for tc in tool_calls:
            tool = tc["tool"]
            inp = tc["input"]
            if tool == "Read":
                path = inp.get("file_path", "?")
                if path not in reads:
                    reads.append(path)
            elif tool == "Edit":
                path = inp.get("file_path", "?")
                old = inp.get("old_string", "")
                new = inp.get("new_string", "")
                edits.append(f"{path}: '{old[:40]}' → '{new[:40]}'")
            elif tool == "Write":
                path = inp.get("file_path", "?")
                size = len(inp.get("content", ""))
                writes.append(f"{path} ({size} chars)")
            elif tool in ("Bash", "bash"):
                cmd = inp.get("command", "?")
                commands.append(cmd[:100])
            else:
                desc = inp.get("description", "") or inp.get("query", "") or inp.get("pattern", "")
                other.append(f"{tool}: {desc[:60]}" if desc else tool)

        if reads:
            shown = reads[:10]
            extra = f" (+{len(reads) - 10} more)" if len(reads) > 10 else ""
            lines.append(f"Files read: {', '.join(shown)}{extra}")
        if edits:
            lines.append("Files edited:")
            for e in edits[:8]:
                lines.append(f"  {e}")
            if len(edits) > 8:
                lines.append(f"  (+{len(edits) - 8} more)")
        if writes:
            lines.append(f"Files written: {', '.join(writes[:8])}")
        if commands:
            lines.append("Commands run:")
            for c in commands[:8]:
                lines.append(f"  $ {c}")
            if len(commands) > 8:
                lines.append(f"  (+{len(commands) - 8} more)")
        if other:
            lines.append(f"Other tools: {', '.join(other[:8])}")

        activity = "\n".join(lines)
        if len(activity) > 2000:
            activity = activity[:1997] + "..."

        return response_text, activity

    def set_user_context(self, user_id: str | None) -> None:
        """Deprecated: user_id is now passed directly to execute().

        Kept for backward compatibility with tests. Prefer passing user_id
        as a keyword argument to execute() instead.
        """
        _user_id_ctx.set(user_id)

    def _load_all_memory(self) -> dict[str, dict[str, str]]:
        """Load the full scoped memory structure.

        Returns {"global": {...}, "user_<id>": {...}, ...}.
        Auto-migrates old flat format to scoped format.
        """
        if not self._memory_path or not self._memory_path.exists():
            return {"global": {}}
        try:
            data = json.loads(self._memory_path.read_text())
        except Exception:
            return {"global": {}}
        if not isinstance(data, dict):
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

    def _load_memory(self) -> dict[str, str]:
        """Load merged global memory (backward-compatible for system prompt)."""
        return self._load_all_memory().get("global", {})

    def _load_memory_for_user(self, user_id: str | None) -> dict[str, str]:
        """Load merged global + user-specific memory for system prompt injection."""
        all_mem = self._load_all_memory()
        merged = dict(all_mem.get("global", {}))
        if user_id:
            user_key = f"user_{user_id}"
            merged.update(all_mem.get(user_key, {}))
        return merged

    async def _handle_memory_manage(self, inp: dict, *, user_id: str | None = None) -> str:
        action = inp.get("action")
        if not action:
            return (
                "memory_manage requires an 'action' field. "
                "Valid actions: list, save, get, delete. "
                "Example: {'action': 'get', 'key': 'foo'}."
            )
        scope = inp.get("scope", "personal")

        async with self._memory_lock:
            if action in ("get", "recall", "read"):
                key = inp.get("key")
                if not key:
                    return "'key' is required for get."
                all_mem = await asyncio.to_thread(self._load_all_memory)
                user_key = f"user_{user_id}" if user_id else None
                if user_key and key in all_mem.get(user_key, {}):
                    return f"**{key}** (personal): {all_mem[user_key][key]}"
                if key in all_mem.get("global", {}):
                    return f"**{key}** (global): {all_mem['global'][key]}"
                return f"No note found with key '{key}'."

            if action == "list":
                all_mem = await asyncio.to_thread(self._load_all_memory)
                global_mem = all_mem.get("global", {})
                user_mem = all_mem.get(f"user_{user_id}", {}) if user_id else {}
                lines = []
                if global_mem:
                    lines.append("**Global notes:**")
                    lines.extend(f"- **{k}**: {v}" for k, v in global_mem.items())
                if user_mem:
                    lines.append("**Your personal notes:**")
                    lines.extend(f"- **{k}**: {v}" for k, v in user_mem.items())
                return "\n".join(lines) if lines else "No notes saved yet."

            elif action == "save":
                key = inp.get("key")
                value = inp.get("value")
                if not key or not value:
                    return "Both 'key' and 'value' are required for save."
                all_mem = await asyncio.to_thread(self._load_all_memory)
                if scope == "global":
                    section = "global"
                elif user_id:
                    section = f"user_{user_id}"
                else:
                    section = "global"
                section_map = all_mem.setdefault(section, {})
                # Move-to-end + cap: working memory is injected into every
                # system prompt, so it must not grow without bound. Re-inserting
                # gives LRU-by-write order; evict the oldest keys beyond the cap
                # (never the one just written).
                section_map.pop(key, None)
                section_map[key] = value
                evicted = 0
                while len(section_map) > MEMORY_MAX_KEYS_PER_SECTION:
                    oldest = next(iter(section_map))
                    if oldest == key:
                        break
                    del section_map[oldest]
                    evicted += 1
                await asyncio.to_thread(self._save_all_memory, all_mem)
                scope_label = "global" if section == "global" else "personal"
                suffix = (
                    f" (evicted {evicted} oldest note(s) at cap {MEMORY_MAX_KEYS_PER_SECTION})"
                    if evicted
                    else ""
                )
                return f"Saved {scope_label} note '{key}'.{suffix}"

            elif action == "delete":
                key = inp.get("key")
                if not key:
                    return "'key' is required for delete."
                all_mem = await asyncio.to_thread(self._load_all_memory)
                user_key = f"user_{user_id}" if user_id else None
                if user_key and key in all_mem.get(user_key, {}):
                    del all_mem[user_key][key]
                    await asyncio.to_thread(self._save_all_memory, all_mem)
                    return f"Deleted personal note '{key}'."
                elif key in all_mem.get("global", {}):
                    del all_mem["global"][key]
                    await asyncio.to_thread(self._save_all_memory, all_mem)
                    return f"Deleted global note '{key}'."
                return f"No note found with key '{key}'."

        return f"Unknown memory action: {action}"

    # ------------------------------------------------------------------
    # Universal list management
    # ------------------------------------------------------------------

    def _lists_path(self) -> Path | None:
        """Return path to data/lists.json (sibling of memory.json)."""
        if not self._memory_path:
            return None
        return self._memory_path.parent / "lists.json"

    def _load_lists(self) -> dict:
        """Load all lists. Migrates old grocery_list.json on first access.

        Structure: {
            "grocery": {
                "owner": "shared",
                "items": [{"name": "...", "added_by": "...", "added_at": "...", "done": false}, ...]
            },
            ...
        }
        """
        path = self._lists_path()
        if not path:
            return {}
        if path.exists():
            try:
                data = json.loads(path.read_text())
                if isinstance(data, dict):
                    return data
            except Exception:
                pass
        # Auto-migrate old grocery_list.json if it exists
        old_grocery = path.parent / "grocery_list.json"
        if old_grocery.exists():
            try:
                old_data = json.loads(old_grocery.read_text())
                old_items = old_data.get("items", [])
                migrated_items = []
                for item in old_items:
                    migrated_items.append(
                        {
                            "name": item.get("name", ""),
                            "added_by": item.get("added_by", ""),
                            "added_at": item.get("added_at", ""),
                            "done": False,
                        }
                    )
                lists = {"grocery": {"owner": "shared", "items": migrated_items}}
                self._save_lists(lists)
                return lists
            except Exception:
                pass
        return {}

    def _save_lists(self, data: dict) -> None:
        path = self._lists_path()
        if path:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".tmp")
            tmp.write_text(json.dumps(data, indent=2))
            tmp.replace(path)

    async def _handle_manage_list(self, inp: dict, *, user_id: str | None = None) -> str:
        from datetime import datetime

        action = inp["action"]
        list_name = inp.get("list_name", "").strip().lower()
        raw_items = inp.get("items", [])
        owner_pref = inp.get("owner", "shared")

        return await self._manage_list_locked(action, list_name, raw_items, owner_pref, user_id)

    async def _manage_list_locked(self, action, list_name, raw_items, owner_pref, user_id):
        from datetime import datetime

        async with self._lists_lock:
            lists = await asyncio.to_thread(self._load_lists)

            if action == "list_all":
                if not lists:
                    return "No lists exist yet. Add items to create one."
                lines = ["**Your Lists**\n"]
                for name, lst in sorted(lists.items()):
                    lst_owner = lst.get("owner", "shared")
                    if lst_owner != "shared" and lst_owner != user_id:
                        continue
                    count = len(lst.get("items", []))
                    done = sum(1 for i in lst.get("items", []) if i.get("done"))
                    owner_label = "shared" if lst_owner == "shared" else "personal"
                    if done:
                        lines.append(f"- **{name}** ({count} items, {done} done) [{owner_label}]")
                    else:
                        lines.append(f"- **{name}** ({count} items) [{owner_label}]")
                if len(lines) == 1:
                    return "No lists visible to you."
                return "\n".join(lines)

            if not list_name:
                return "list_name is required for this action."

            # Resolve the list — check for personal or shared
            lst = lists.get(list_name)
            if lst and lst.get("owner") not in ("shared", user_id, None):
                return f"You don't have access to the '{list_name}' list."

            if action == "show":
                if not lst or not lst.get("items"):
                    return f"The '{list_name}' list is empty."
                return self._format_list(list_name, lst)

            if action == "clear":
                if not lst or not lst.get("items"):
                    return f"The '{list_name}' list is already empty."
                count = len(lst["items"])
                lst["items"] = []
                await asyncio.to_thread(self._save_lists, lists)
                return f"Cleared {count} item(s) from the '{list_name}' list."

            if action == "add":
                if not raw_items:
                    return "No items specified to add."
                # Create list on the fly if it doesn't exist
                if not lst:
                    owner = user_id if owner_pref == "personal" and user_id else "shared"
                    lst = {"owner": owner, "items": []}
                    lists[list_name] = lst
                added, already = [], []
                for name in raw_items:
                    name = name.strip()
                    if not name:
                        continue
                    if any(i["name"].lower() == name.lower() for i in lst["items"]):
                        already.append(name)
                        continue
                    lst["items"].append(
                        {
                            "name": name,
                            "added_by": user_id or "",
                            "added_at": datetime.now().isoformat(),
                            "done": False,
                        }
                    )
                    added.append(name)
                await asyncio.to_thread(self._save_lists, lists)
                parts = []
                if added:
                    parts.append(f"Added to '{list_name}': {', '.join(added)}")
                if already:
                    parts.append(f"Already on the list: {', '.join(already)}")
                parts.append(f"\n{self._format_list(list_name, lst)}")
                return "\n".join(parts)

            if action == "remove":
                if not lst:
                    return f"The '{list_name}' list doesn't exist."
                if not raw_items:
                    return "No items specified to remove."
                removed, not_found = [], []
                for name in raw_items:
                    name = name.strip()
                    if not name:
                        continue
                    q = name.lower()
                    matches = [
                        i for i, item in enumerate(lst["items"]) if q in item["name"].lower()
                    ]
                    if matches:
                        for idx in sorted(matches, reverse=True):
                            removed.append(lst["items"].pop(idx)["name"])
                    else:
                        not_found.append(name)
                await asyncio.to_thread(self._save_lists, lists)
                parts = []
                if removed:
                    parts.append(f"Removed from '{list_name}': {', '.join(removed)}")
                if not_found:
                    parts.append(f"Not found: {', '.join(not_found)}")
                if lst["items"]:
                    parts.append(f"\n{self._format_list(list_name, lst)}")
                else:
                    parts.append(f"\nThe '{list_name}' list is now empty.")
                return "\n".join(parts)

            if action == "mark_done":
                if not lst:
                    return f"The '{list_name}' list doesn't exist."
                if not raw_items:
                    return "No items specified to mark as done."
                marked, not_found = [], []
                for name in raw_items:
                    q = name.strip().lower()
                    if not q:
                        continue
                    found = False
                    for item in lst["items"]:
                        if q in item["name"].lower() and not item.get("done"):
                            item["done"] = True
                            marked.append(item["name"])
                            found = True
                            break
                    if not found:
                        not_found.append(name.strip())
                await asyncio.to_thread(self._save_lists, lists)
                parts = []
                if marked:
                    parts.append(f"Marked done: {', '.join(marked)}")
                if not_found:
                    parts.append(f"Not found or already done: {', '.join(not_found)}")
                parts.append(f"\n{self._format_list(list_name, lst)}")
                return "\n".join(parts)

            if action == "mark_undone":
                if not lst:
                    return f"The '{list_name}' list doesn't exist."
                if not raw_items:
                    return "No items specified to mark as undone."
                marked, not_found = [], []
                for name in raw_items:
                    q = name.strip().lower()
                    if not q:
                        continue
                    found = False
                    for item in lst["items"]:
                        if q in item["name"].lower() and item.get("done"):
                            item["done"] = False
                            marked.append(item["name"])
                            found = True
                            break
                    if not found:
                        not_found.append(name.strip())
                await asyncio.to_thread(self._save_lists, lists)
                parts = []
                if marked:
                    parts.append(f"Marked undone: {', '.join(marked)}")
                if not_found:
                    parts.append(f"Not found or not done: {', '.join(not_found)}")
                parts.append(f"\n{self._format_list(list_name, lst)}")
                return "\n".join(parts)

            return f"Unknown action: {action}"

    @staticmethod
    def _format_list(list_name: str, lst: dict) -> str:
        items = lst.get("items", [])
        if not items:
            return f"The '{list_name}' list is empty."
        lines = [f"**{list_name.title()} List** ({len(items)} items)\n"]
        for i, item in enumerate(items, 1):
            done_mark = "\u2705 " if item.get("done") else ""
            strike = f"~~{item['name']}~~" if item.get("done") else item["name"]
            added = item.get("added_by", "")
            ts = item.get("added_at", "")
            suffix = ""
            if added or ts:
                parts = []
                if added:
                    parts.append(added)
                if ts:
                    try:
                        from datetime import datetime

                        dt = datetime.fromisoformat(ts)
                        parts.append(dt.strftime("%b %d"))
                    except ValueError:
                        pass
                suffix = f"  _({', '.join(parts)})_"
            lines.append(f"{i}. {done_mark}{strike}{suffix}")
        return "\n".join(lines)

    async def _handle_git_ops(self, inp: dict) -> str:
        from .git_ops import ALLOWED_ACTIONS, build_git_command

        action = inp.get("action", "")
        if action not in ALLOWED_ACTIONS:
            return f"Unknown git action: {action}. Allowed: {', '.join(sorted(ALLOWED_ACTIONS))}"

        host = inp.get("host", "")
        resolved = self._resolve_host(host)
        if not resolved:
            return f"Unknown or disallowed host: {host}"
        address, ssh_user, _os = resolved

        params = inp.get("params") or {}

        try:
            cmds = build_git_command(action, params)
        except ValueError as e:
            return f"git_ops error: {e}"

        if action == "push":
            freshness_cmd, push_cmd = cmds
            allowed, denial, _ = self._govern_command(push_cmd, host)
            if not allowed:
                return denial
            code, output = await self._exec_command(
                address,
                freshness_cmd,
                ssh_user,
            )
            if code != 0:
                return f"Branch freshness check failed (exit {code}):\n{output}", code
            if output.strip().startswith("STALE:"):
                return f"Push blocked — {output.strip().split(':', 1)[1].strip()}", 1
            code, output = await self._exec_command(
                address,
                push_cmd,
                ssh_user,
            )
            if code != 0:
                return f"Push failed (exit {code}):\n{_truncate_lines(output)}", code
            return (
                _truncate_lines(output) if output.strip() else "Push completed successfully."
            ), 0
        else:
            cmd = cmds
            allowed, denial, _ = self._govern_command(cmd, host)
            if not allowed:
                return denial
            code, output = await self._exec_command(address, cmd, ssh_user)
            if code != 0:
                return f"git {action} failed (exit {code}):\n{_truncate_lines(output)}", code
            return (
                _truncate_lines(output)
                if output.strip()
                else f"git {action} completed successfully."
            ), 0

    async def _handle_kubectl(self, inp: dict) -> str:
        from .kubectl_ops import ALLOWED_ACTIONS as KUBECTL_ACTIONS, build_kubectl_command

        action = inp.get("action", "")
        if action not in KUBECTL_ACTIONS:
            return (
                f"Unknown kubectl action: {action}. Allowed: {', '.join(sorted(KUBECTL_ACTIONS))}"
            )

        host = inp.get("host", "")
        resolved = self._resolve_host(host)
        if not resolved:
            return f"Unknown or disallowed host: {host}"
        address, ssh_user, _os = resolved

        params = inp.get("params") or {}

        try:
            cmd = build_kubectl_command(action, params)
        except ValueError as e:
            return f"kubectl error: {e}"

        allowed, denial, _ = self._govern_command(cmd, host)
        if not allowed:
            return denial

        code, output = await self._exec_command(address, cmd, ssh_user)
        if code != 0:
            return f"kubectl {action} failed (exit {code}):\n{_truncate_lines(output)}", code
        return (
            _truncate_lines(output)
            if output.strip()
            else f"kubectl {action} completed successfully."
        ), 0

    async def _handle_docker_ops(self, inp: dict) -> str:
        from .docker_ops import ALLOWED_ACTIONS as DOCKER_ACTIONS, build_docker_command

        action = inp.get("action", "")
        if action not in DOCKER_ACTIONS:
            return f"Unknown docker action: {action}. Allowed: {', '.join(sorted(DOCKER_ACTIONS))}"

        host = inp.get("host", "")
        resolved = self._resolve_host(host)
        if not resolved:
            return f"Unknown or disallowed host: {host}"
        address, ssh_user, _os = resolved

        params = inp.get("params") or {}

        try:
            cmd = build_docker_command(action, params)
        except ValueError as e:
            return f"docker_ops error: {e}"

        allowed, denial, _ = self._govern_command(cmd, host)
        if not allowed:
            return denial

        code, output = await self._exec_command(address, cmd, ssh_user)
        if code != 0:
            return f"docker {action} failed (exit {code}):\n{_truncate_lines(output)}", code
        return (
            _truncate_lines(output)
            if output.strip()
            else f"docker {action} completed successfully."
        ), 0

    async def _handle_terraform_ops(self, inp: dict) -> str:
        from .terraform_ops import ALLOWED_ACTIONS as TF_ACTIONS, build_terraform_command

        action = inp.get("action", "")
        if action not in TF_ACTIONS:
            return f"Unknown terraform action: {action}. Allowed: {', '.join(sorted(TF_ACTIONS))}"

        host = inp.get("host", "")
        resolved = self._resolve_host(host)
        if not resolved:
            return f"Unknown or disallowed host: {host}"
        address, ssh_user, _os = resolved

        params = inp.get("params") or {}

        try:
            cmd = build_terraform_command(action, params)
        except ValueError as e:
            return f"terraform_ops error: {e}"

        allowed, denial, _ = self._govern_command(cmd, host)
        if not allowed:
            return denial

        code, output = await self._exec_command(address, cmd, ssh_user)
        if code != 0:
            return f"terraform {action} failed (exit {code}):\n{_truncate_lines(output)}", code
        return (
            _truncate_lines(output)
            if output.strip()
            else f"terraform {action} completed successfully."
        ), 0

    async def _handle_issue_tracker(self, inp: dict) -> str:
        action = inp.get("action", "")
        if not action:
            return "Error: 'action' is required"

        if not hasattr(self, "_issue_tracker_client") or self._issue_tracker_client is None:
            return "Error: issue tracker not configured (set issue_tracker.enabled=true in config)"

        try:
            from ..notifications.issue_tracker import validate_action, IssueTrackerError

            validate_action(action)
        except ValueError as e:
            return f"Error: {e}"

        try:
            result = await self._issue_tracker_client.execute(action, dict(inp))
            import json

            return json.dumps(result, indent=2)
        except IssueTrackerError as e:
            from ..llm.secret_scrubber import scrub_output_secrets

            return f"issue_tracker error: {scrub_output_secrets(str(e))}"

    async def _handle_http_probe(self, inp: dict) -> str:
        from .http_probe_ops import build_http_probe_command

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
        if code != 0 and not output.strip():
            return f"http_probe failed (exit {code}): curl returned no output"
        return _truncate_lines(output) if output.strip() else "http_probe: no response received"

    async def _handle_validate_action(self, inp: dict) -> str:
        from .post_validation import (
            format_report_summary,
            report_as_json,
            run_bundle,
        )

        raw_checks = inp.get("checks")
        if not isinstance(raw_checks, list) or not raw_checks:
            return (
                "Error: 'checks' must be a non-empty list. See tool description for check schema."
            )

        bundle_name = str(inp.get("bundle_name") or "unnamed").strip()[:120]
        default_host = inp.get("default_host")
        default_host = str(default_host).strip() if default_host else None
        grace_seconds = int(inp.get("grace_seconds") or 0)
        grace_seconds = max(0, min(grace_seconds, 60))
        max_parallel = int(inp.get("max_parallel") or 12)
        fmt = str(inp.get("format") or "summary").strip().lower()

        governor = getattr(self, "command_governor", None)

        async def _exec(
            address: str, command: str, ssh_user: str, *, timeout: int
        ) -> tuple[int, str]:
            # Never mutate shared state here — concurrent checks would race.
            # _exec_command accepts a per-call timeout, which is honored
            # directly by the SSH/local primitives without touching self.
            if governor is not None:
                try:
                    decision = governor.check(command)
                except Exception as ge:
                    # Fail-closed on governor exceptions: we advertise
                    # command-type checks as going through the governor;
                    # silently bypassing it if the governor blows up would
                    # be exactly the "safe unless error path" foot-gun
                    # Odin flagged. Emit the error into the result so the
                    # operator sees it, and treat the check as errored.
                    log.exception("governor check raised for validation command")
                    return 1, f"validate_action: governor check raised {type(ge).__name__}: {ge}"
                if not decision.allowed:
                    return 1, f"governor-blocked: {decision.denial_message()}"
            return await self._exec_command(address, command, ssh_user, timeout=timeout)

        report = await run_bundle(
            raw_checks,
            bundle_name=bundle_name,
            default_host=default_host,
            resolve_host=self._resolve_host,
            exec_command=_exec,
            grace_seconds=grace_seconds,
            max_parallel=max_parallel,
        )

        if fmt == "json":
            return report_as_json(report)
        return format_report_summary(report)

    # --- Email tools (SMTP/IMAP) ---

    def _email_cfg(self):
        cfg = self._email_config
        if cfg is None or not cfg.enabled:
            return None
        return cfg

    async def _handle_email_send(self, inp: dict) -> str:
        from .email_client import send_email

        cfg = self._email_cfg()
        if cfg is None:
            return "Error: email tools are not configured (email.enabled is false)"
        to = inp.get("to")
        if not to or not isinstance(to, list):
            return "Error: 'to' must be a non-empty list of email addresses"
        subject = str(inp.get("subject", ""))
        body = str(inp.get("body", ""))
        try:
            # smtplib blocks; run it off the event loop so a slow mail server
            # can't stall every other channel/task.
            result = await asyncio.to_thread(
                send_email,
                smtp_host=cfg.smtp.host,
                smtp_port=cfg.smtp.port,
                username=cfg.smtp.username,
                password=cfg.smtp.password,
                from_address=cfg.smtp.from_address,
                to=to,
                subject=subject,
                body=body,
                cc=inp.get("cc"),
                bcc=inp.get("bcc"),
                reply_to=inp.get("reply_to"),
                attachments=inp.get("attachments"),
                allowed_dirs=cfg.allowed_attachment_dirs,
                max_attachment_bytes=cfg.max_attachment_bytes,
                timeout=cfg.connect_timeout_seconds,
            )
            parts = [
                "Email sent successfully.",
                f"Message-ID: {result['message_id']}",
                f"To: {', '.join(result['to'])}",
                f"Subject: {result['subject']}",
            ]
            if result.get("cc"):
                parts.append(f"CC: {', '.join(result['cc'])}")
            if result.get("attachments"):
                parts.append(f"Attachments: {', '.join(result['attachments'])}")
            return "\n".join(parts)
        except (ValueError, RuntimeError) as e:
            return f"Error: {e}"

    async def _handle_email_search(self, inp: dict) -> str:
        from .email_client import search_email

        cfg = self._email_cfg()
        if cfg is None:
            return "Error: email tools are not configured (email.enabled is false)"
        query = inp.get("query", "")
        if not query:
            return "Error: 'query' is required"
        limit = max(1, min(int(inp.get("limit", 20)), cfg.max_results))
        try:
            results = await asyncio.to_thread(
                search_email,
                imap_host=cfg.imap.host,
                imap_port=cfg.imap.port,
                username=cfg.imap.username,
                password=cfg.imap.password,
                query=query,
                folder=inp.get("folder", "INBOX"),
                limit=limit,
                timeout=cfg.connect_timeout_seconds,
            )
            if not results:
                return "No messages found matching the query."
            lines = [f"Found {len(results)} message(s):\n"]
            for r in results:
                att = " [has attachments]" if r.get("has_attachments") else ""
                lines.append(f"UID {r['uid']} | {r['date']} | {r['from']} | {r['subject']}{att}")
            return "\n".join(lines)
        except (ValueError, RuntimeError) as e:
            return f"Error: {e}"

    async def _handle_email_read(self, inp: dict) -> str:
        from .email_client import read_email

        cfg = self._email_cfg()
        if cfg is None:
            return "Error: email tools are not configured (email.enabled is false)"
        uid = str(inp.get("uid", ""))
        if not uid:
            return "Error: 'uid' is required"
        try:
            result = await asyncio.to_thread(
                read_email,
                imap_host=cfg.imap.host,
                imap_port=cfg.imap.port,
                username=cfg.imap.username,
                password=cfg.imap.password,
                uid=uid,
                folder=inp.get("folder", "INBOX"),
                max_body_chars=cfg.max_body_chars,
                timeout=cfg.connect_timeout_seconds,
            )
            lines = [
                f"From: {result['from']}",
                f"To: {result['to']}",
                f"Subject: {result['subject']}",
                f"Date: {result['date']}",
                f"Message-ID: {result['message_id']}",
            ]
            if result.get("attachments"):
                att_list = ", ".join(
                    f"{a['filename']} ({a['size_bytes']} bytes)" for a in result["attachments"]
                )
                lines.append(f"Attachments: {att_list}")
            lines.append(f"\n{result['body']}")
            return "\n".join(lines)
        except (ValueError, RuntimeError) as e:
            return f"Error: {e}"

    async def _handle_email_list_recent(self, inp: dict) -> str:
        from .email_client import list_recent

        cfg = self._email_cfg()
        if cfg is None:
            return "Error: email tools are not configured (email.enabled is false)"
        limit = max(1, min(int(inp.get("limit", 10)), cfg.max_results))
        try:
            results = await asyncio.to_thread(
                list_recent,
                imap_host=cfg.imap.host,
                imap_port=cfg.imap.port,
                username=cfg.imap.username,
                password=cfg.imap.password,
                folder=inp.get("folder", "INBOX"),
                limit=limit,
                timeout=cfg.connect_timeout_seconds,
            )
            if not results:
                return "No messages found."
            lines = [f"Recent {len(results)} message(s):\n"]
            for r in results:
                att = " [has attachments]" if r.get("has_attachments") else ""
                size = f" ({r['size_bytes']} bytes)" if r.get("size_bytes") else ""
                flags = f" [{' '.join(r['flags'])}]" if r.get("flags") else ""
                lines.append(
                    f"UID {r['uid']} | {r['date']} | {r['from']} | {r['subject']}{att}{size}{flags}"
                )
            return "\n".join(lines)
        except (ValueError, RuntimeError) as e:
            return f"Error: {e}"
