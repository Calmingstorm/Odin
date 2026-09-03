"""RFC-004 P0 — executor dispatch-parity + middleware pins.

Pins the three-way dispatch partition (native / skill / executor), the
execution-time handler resolution (THE patch seam — R1 blocker #2), and
the execute() middleware behaviors the carve must not disturb:
unknown-tool short-circuit, RBAC denial shape + metrics, timeout shape
(no retry), exception shape, tuple exit-code propagation, error-prefix
classification, contextvar isolation across concurrent calls, and the
special call shape for memory_manage/manage_list.

The handler table introduced in P2 must resolve handlers via getattr at
CALL time — every pin here must stay green when the f-string dispatch is
replaced and when handlers move to domain owners (P4–P6).
"""

from __future__ import annotations

import asyncio

from src.config.schema import ToolsConfig
from src.tools.executor import ToolExecutor, _user_id_ctx

from .test_tool_parity import EXPECTED_TOOL_ORDER

# --- The dispatch partition on master @ 7263c03 -----------------------------
# 36 tools registered in the native table (src/discord/native_tools/registry.py,
# register_native_handlers), dispatched Discord-side:
NATIVE_REGISTERED = frozenset({
    "add_reaction", "analyze_image", "browser_screenshot", "bulk_ingest_knowledge",
    "cancel_task", "collect_loop_agents", "create_poll", "delegate_task",
    "delete_knowledge", "delete_schedule", "generate_file", "generate_image",
    "get_agent_results", "ingest_document", "kill_agent", "list_agents",
    "list_knowledge", "list_loops", "list_schedules", "list_tasks",
    "parse_time", "post_file", "purge_messages", "read_channel",
    "schedule_task", "search_audit", "search_history", "search_knowledge",
    "send_to_agent", "set_permission", "spawn_agent", "spawn_loop_agents",
    "start_loop", "stop_loop", "update_schedule", "wait_for_agents",
})

# 10 skill tools special-cased by NativeToolDispatcher (CRUD + meta):
SKILL_TOOLS = frozenset({
    "create_skill", "edit_skill", "delete_skill", "enable_skill",
    "disable_skill", "install_skill", "export_skill", "skill_status",
    "list_skills", "invoke_skill",
})

# 27 tools that reach ToolExecutor.execute() — the set whose handlers the
# P4–P6 waves move to domain modules:
EXECUTOR_ROUTED = frozenset({
    "run_command", "run_script", "run_command_multi", "read_file", "apply_patch",
    "memory_manage", "manage_list", "manage_process",
    "browser_read_page", "browser_read_table", "browser_click", "browser_fill",
    "browser_evaluate", "web_search", "fetch_url", "http_probe",
    "analyze_pdf",
    "git_ops", "kubectl", "docker_ops", "terraform_ops",
    "issue_tracker", "validate_action",
    "email_send", "email_search", "email_read", "email_list_recent",
})

# Stateful attributes ToolExecutor owns today. The P4–P6 HandlerDeps must
# carry THESE OBJECTS by reference (identity), never construct fresh ones
# (R1 blocker #3). This inventory is the baseline the identity contract
# extends as waves land.
STATEFUL_ATTRS = [
    "config", "_email_config", "_memory_path", "_browser_manager",
    "_permission_manager", "output_streamer", "_host_access", "_metrics",
    "_memory_lock", "_lists_lock", "risk_stats", "recovery_stats",
    "validation_stats", "command_governor", "_recovery_enabled",
    "freshness_stats", "_branch_freshness_enabled",
    "bulkheads", "ssh_pool",
]


def _executor(**kwargs) -> ToolExecutor:
    return ToolExecutor(config=kwargs.pop("config", ToolsConfig()), **kwargs)


class TestDispatchPartition:
    def test_partition_is_exact(self):
        all_names = set(EXPECTED_TOOL_ORDER)
        assert NATIVE_REGISTERED | SKILL_TOOLS | EXECUTOR_ROUTED == all_names
        assert not (NATIVE_REGISTERED & SKILL_TOOLS)
        assert not (NATIVE_REGISTERED & EXECUTOR_ROUTED)
        assert not (SKILL_TOOLS & EXECUTOR_ROUTED)
        assert (len(NATIVE_REGISTERED), len(SKILL_TOOLS), len(EXECUTOR_ROUTED)) == (36, 10, 27)

    def test_every_executor_tool_resolves_a_handler(self):
        ex = _executor()
        for name in sorted(EXECUTOR_ROUTED):
            handler = ex._resolve_handler(name)
            assert callable(handler), f"no handler for executor-routed tool {name}"

    def test_no_orphan_handlers_and_no_leftover_delegates(self):
        """Owner-aware (P4+): the class defines exactly the CORE-owned
        handlers; moved handlers must be GONE from ToolExecutor — no
        delegate methods left behind (the RFC-002 facade lesson)."""
        from src.tools.executor import EXECUTOR_HANDLERS

        core_owned = {n for n, (o, _a) in EXECUTOR_HANDLERS.items() if o == "core"}
        moved = set(EXECUTOR_ROUTED) - core_owned
        defined = {
            attr.removeprefix("_handle_")
            for attr in vars(ToolExecutor)
            if attr.startswith("_handle_")
        }
        assert defined == core_owned, (
            f"class handler set drifted: extra={sorted(defined - core_owned)} "
            f"missing={sorted(core_owned - defined)}"
        )
        for name in sorted(moved):
            assert not hasattr(ToolExecutor, f"_handle_{name}"), (
                f"{name} moved to a domain but a class-level delegate remains"
            )

    def test_stateful_attr_inventory(self):
        ex = _executor()
        for attr in STATEFUL_ATTRS:
            assert hasattr(ex, attr), f"stateful attr {attr} vanished from ToolExecutor"


class TestDispatchTable:
    """RFC-004 P2 — the explicit late-bound table must mirror the legacy
    f-string resolution exactly (the migration bridge assertion), stay
    call-time-resolved, and cover precisely the executor-routed set."""

    def test_table_keys_match_executor_routed(self):
        from src.tools.executor import EXECUTOR_HANDLERS

        assert set(EXECUTOR_HANDLERS) == set(EXECUTOR_ROUTED)

    def test_every_owner_key_bound(self):
        from src.tools.executor import EXECUTOR_HANDLERS

        ex = _executor()
        for name, (owner_key, _attr) in EXECUTOR_HANDLERS.items():
            assert owner_key in ex._handler_owners, f"{name}: unbound owner {owner_key!r}"

    def test_table_resolution_identical_to_legacy_getattr(self):
        """Bridge assertion (plan §3.2), owner-aware since P4: CORE-owned
        entries resolve the same function the legacy f-string getattr
        would; DOMAIN-owned entries resolve a callable on their owner and
        the executor has no legacy attr left."""
        from src.tools.executor import EXECUTOR_HANDLERS

        ex = _executor()
        for name, (owner_key, attr) in EXECUTOR_HANDLERS.items():
            table_handler = getattr(ex._handler_owners[owner_key], attr)
            assert callable(table_handler), f"{name}: table resolves nothing"
            if owner_key == "core":
                legacy_handler = getattr(ex, f"_handle_{name}")
                assert table_handler == legacy_handler, f"{name} diverged from legacy"
            else:
                assert not hasattr(ToolExecutor, f"_handle_{name}"), (
                    f"{name} is domain-owned but ToolExecutor still defines it"
                )

    def test_dynamic_handle_spelling_banned_outside_resolver(self):
        """P7 (AST/token-aware, per the plan-review advisory): the f-string
        ``_handle_`` spelling — dynamic handler-name construction — is
        allowed in exactly ONE place in src/: ToolExecutor._resolve_handler
        (the patch-seam __dict__ probe). Raw grep would flag comments,
        fixture names, and literal attr strings; this scan walks the AST
        and only flags JoinedStr (f-string) nodes that build a
        ``_handle_...`` name."""
        import ast as _ast
        from pathlib import Path as _Path

        src_root = _Path(__file__).resolve().parents[2] / "src"
        offenders: list[str] = []
        for py in sorted(src_root.rglob("*.py")):
            tree = _ast.parse(py.read_text(), filename=str(py))
            for node in _ast.walk(tree):
                if isinstance(node, _ast.JoinedStr):
                    for part in node.values:
                        if (
                            isinstance(part, _ast.Constant)
                            and isinstance(part.value, str)
                            and "_handle_" in part.value
                        ):
                            offenders.append(f"{py.relative_to(src_root)}:{node.lineno}")
        allowed = {"tools/executor.py"}
        bad = [o for o in offenders if o.split(":")[0] not in allowed]
        assert not bad, f"dynamic _handle_ f-string spelling outside the resolver: {bad}"
        # exactly one sanctioned site remains (the __dict__ patch-seam probe)
        sanctioned = [o for o in offenders if o.split(":")[0] in allowed]
        assert len(sanctioned) == 1, (
            f"expected exactly 1 sanctioned dynamic spelling in executor.py, found: {sanctioned}"
        )

    async def test_retired_fallback_unknown_entry_returns_none(self):
        """P7: with the legacy fallback retired, a name absent from the
        table resolves to None (→ unknown_tool) even if a same-named
        class-level method existed — the table is the only class path."""
        ex = _executor()
        assert ex._resolve_handler("definitely_not_a_tool") is None

    async def test_instance_override_beats_domain_owner(self):
        """The historical executor-instance patch seam keeps governing even
        for handlers whose real bodies moved to domain owners (13+ existing
        test sites patch ``executor._handle_x = fake``)."""
        ex = _executor()

        async def fake(tool_input):
            return "override-beats-domain"

        ex._handle_run_command = fake  # run_command is system-owned since P4
        assert ex._resolve_handler("run_command") is fake
        res = await ex.execute("run_command", {"command": "x"})
        assert res.output.strip() == "override-beats-domain"

    def test_domain_state_identity(self):
        """HandlerDeps identity contract (R1 blocker #3): domain-visible
        state IS the executor's own objects, live on every access."""
        ex = _executor()
        system = ex._handler_owners["system"]
        files = ex._handler_owners["files_docs"]
        assert system.config is ex.config
        assert files.config is ex.config
        assert system.output_streamer is ex.output_streamer
        assert system._host_access is ex._host_access
        # live, not copied: swapping the executor's attr is seen by domains
        sentinel = object()
        ex.config = sentinel
        assert system.config is sentinel

    async def test_table_resolves_instance_patch(self):
        """The seam holds THROUGH the table: an instance-attribute patch on
        the owner is what resolution returns."""
        ex = _executor()

        async def fake(tool_input):
            return "table-seam-ok"

        ex._handle_run_command = fake
        assert ex._resolve_handler("run_command") is fake


class TestUnknownTool:
    async def test_unknown_tool_result_shape(self):
        ex = _executor()
        res = await ex.execute("no_such_tool", {})
        assert res.ok is False
        assert res.error == "unknown_tool"
        assert res.output == "Unknown tool: no_such_tool"

    async def test_unknown_tool_bypasses_middleware(self):
        """Handler lookup happens BEFORE RBAC/risk/timeout — pinned."""
        ex = _executor()

        def _boom(*a, **k):  # pragma: no cover — must never run
            raise AssertionError("middleware ran for unknown tool")

        ex.check_permission = _boom
        res = await ex.execute("no_such_tool", {})
        assert res.ok is False and res.error == "unknown_tool"


class TestPatchSeam:
    """R1 blocker #2 — THE campaign-critical contract. Handlers must be
    resolved at execution time so `executor._handle_x = fake` governs the
    call. Re-point at the new owner attribute as each handler migrates."""

    async def test_instance_patch_governs_execution(self):
        ex = _executor()
        calls = []

        async def fake(tool_input):
            calls.append(tool_input)
            return "patched-ok"

        ex._handle_run_command = fake
        res = await ex.execute("run_command", {"command": "whoami"})
        assert calls == [{"command": "whoami"}]
        assert res.ok is True
        assert res.output.strip() == "patched-ok"

    async def test_memory_manage_receives_user_id_kwarg(self):
        """memory_manage/manage_list get handler(input, user_id=…) — the
        only special call shape in _try_tool. Pinned so the P2 table and
        the P6 state.py move preserve it."""
        ex = _executor()
        seen = {}

        async def fake(tool_input, *, user_id=None):
            seen["user_id"] = user_id
            return "ok"

        ex._handle_memory_manage = fake
        await ex.execute("memory_manage", {"action": "list"}, user_id="u-42")
        assert seen["user_id"] == "u-42"


class TestMiddlewarePins:
    async def test_rbac_denial_shape_and_metrics(self):
        class _Denier:
            def allowed_tool_names(self, user_id):
                return {"read_file"}

            def get_tier(self, user_id):
                return "guest"

        ex = _executor(permission_manager=_Denier())
        called = []

        async def fake(tool_input):  # pragma: no cover — must never run
            called.append(1)
            return "nope"

        ex._handle_run_command = fake
        res = await ex.execute("run_command", {"command": "x"}, user_id="u1")
        assert not called, "denied tool must not execute its handler"
        assert res.ok is False
        assert res.error == "permission_denied"
        assert "Permission denied: tool 'run_command'" in res.output
        assert "tier 'guest'" in res.output
        assert ex._metrics["run_command"]["errors"] == 1

    async def test_timeout_shape_no_retry(self):
        ex = _executor(config=ToolsConfig(tool_timeouts={"run_command": 1}))
        attempts = []

        async def slow(tool_input):
            attempts.append(1)
            await asyncio.sleep(5)
            return "never"

        ex._handle_run_command = slow
        res = await ex.execute("run_command", {"command": "x"})
        assert len(attempts) == 1, "TIMEOUT is in _SKIP_RECOVERY — never retried"
        assert res.ok is False
        assert res.exit_code == -1
        assert "timed out after 1s" in res.output
        assert res.error and "timed out" in res.error
        assert ex._metrics["run_command"]["timeouts"] == 1

    async def test_exception_shape(self):
        ex = _executor()

        async def broken(tool_input):
            raise ValueError("boom")

        ex._handle_run_command = broken
        res = await ex.execute("run_command", {"command": "x"})
        assert res.ok is False
        assert res.exit_code == -1
        assert "Error executing run_command: boom" in res.output
        assert ex._metrics["run_command"]["errors"] >= 1

    async def test_tuple_exit_code_propagation(self):
        ex = _executor()

        async def with_code(tool_input):
            return ("done (exit 3)", 3)

        ex._handle_run_command = with_code
        res = await ex.execute("run_command", {"command": "x"})
        assert res.exit_code == 3
        assert res.ok is False, "nonzero exit code marks the result as error"

        async def clean(tool_input):
            return ("fine", 0)

        ex._handle_run_command = clean
        res2 = await ex.execute("run_command", {"command": "x"})
        assert res2.exit_code == 0 and res2.ok is True

    async def test_error_prefix_classification(self):
        ex = _executor()

        async def stringly(tool_input):
            return "Error: custom-unrecoverable-xyz"

        ex._handle_run_command = stringly
        res = await ex.execute("run_command", {"command": "x"})
        assert res.ok is False
        assert res.error.startswith("Error: custom-unrecoverable-xyz")

    async def test_contextvar_isolation_concurrent(self):
        """User identity is contextvar-backed and task-isolated: two
        overlapping execute() calls must each observe their own caller."""
        ex = _executor()

        async def report_identity(tool_input):
            await asyncio.sleep(0.05)  # force overlap
            return f"uid={_user_id_ctx.get()}"

        ex._handle_run_command = report_identity
        ex._handle_run_script = report_identity
        res_a, res_b = await asyncio.gather(
            ex.execute("run_command", {"command": "x"}, user_id="alice"),
            ex.execute("run_script", {"script": "y"}, user_id="bob"),
        )
        assert "uid=alice" in res_a.output
        assert "uid=bob" in res_b.output
