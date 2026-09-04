"""RFC-004 P0 — tool-parity contract for src/tools/registry.py.

Pins the EXACT ordered tool list, per-tool schema content, TOOL_MAP
semantics, and the get_tool_definitions() cache behavior BEFORE the
registry carve (docs/plans/tools-decomposition-plan.md §4).

ORDER IS BEHAVIOR: get_tool_definitions() feeds the tool catalog, which
feeds prompt assembly — reordering TOOLS changes prompts. The carve must
reproduce this list exactly, so sections are positional slices and their
concatenation is asserted here.

Registry mutability semantics are pinned AS THEY ARE (R1 advisory #3):
TOOL_MAP builds once at import and is NOT rebuilt by cache invalidation;
the defs cache re-reads the live TOOLS list after invalidate. Do not
"fix" either behavior during the carve.
"""

from __future__ import annotations

import hashlib
import json

from src.tools import registry
from src.tools.registry import (
    TOOL_MAP,
    TOOLS,
    get_tool_definitions,
    invalidate_tool_defs_cache,
)

# The exact TOOLS order on the deliberate editor/tool cleanup (73 tools). A failure here means
# a tool was added, removed, renamed, or REORDERED — all of which are
# out of scope for RFC-004 and must be deliberate, reviewed changes.
EXPECTED_TOOL_ORDER = [
    "run_command", "run_script", "run_command_multi", "read_file", "apply_patch",
    "purge_messages", "post_file", "generate_file", "schedule_task", "list_schedules",
    "update_schedule", "delete_schedule", "parse_time", "search_history", "memory_manage",
    "search_audit", "create_skill", "edit_skill", "delete_skill", "list_skills",
    "enable_skill", "disable_skill", "install_skill", "export_skill", "skill_status",
    "invoke_skill", "delegate_task", "list_tasks", "cancel_task", "search_knowledge",
    "ingest_document", "bulk_ingest_knowledge", "list_knowledge", "delete_knowledge",
    "browser_screenshot", "browser_read_page", "browser_read_table", "browser_click",
    "browser_fill", "browser_evaluate",
    "web_search", "fetch_url", "set_permission", "analyze_pdf",
    "read_channel", "add_reaction", "create_poll", "manage_process", "manage_list",
    "analyze_image", "start_loop", "stop_loop", "list_loops", "spawn_agent",
    "send_to_agent", "list_agents", "kill_agent", "get_agent_results", "wait_for_agents",
    "spawn_loop_agents", "collect_loop_agents", "git_ops", "kubectl", "docker_ops",
    "terraform_ops", "http_probe", "issue_tracker", "generate_image", "validate_action",
    "email_send", "email_search", "email_read", "email_list_recent",
]

# sha256[:16] of each tool's canonical JSON (sort_keys, compact separators).
# Deep-equality pin: ANY edit to a tool's schema/description flips its hash.
EXPECTED_TOOL_HASHES = {
    "run_command": "2b146575d0ff5c16",
    "run_script": "61132f018a660518",
    "run_command_multi": "f4666ed522cdd0b4",
    "read_file": "627d738ddf708a6d",
    "apply_patch": "f1fe944c3bc09b9f",
    "purge_messages": "db35efc321c205b1",
    "post_file": "6860faab30251338",
    "generate_file": "2f4687a63e985fdd",
    # Updated 2026-08-21: generic paginated scheduled-report format added.
    "schedule_task": "17746160fd0b2d3f",
    "list_schedules": "6f72cb95cee9eb6c",
    # Updated with schedule_task: report_format may be changed or cleared.
    "update_schedule": "4635df8029e5e548",
    "delete_schedule": "01e54d37b70471a8",
    "parse_time": "6ae3f4c04138a2cd",
    "search_history": "d3d173bfe5262866",
    "memory_manage": "f7aa460db948c1d5",
    "search_audit": "6fcb11f91a34bcb6",
    "create_skill": "9eaddf122cc9c67d",
    "edit_skill": "f4553310fb4d0d81",
    "delete_skill": "b9cfb78dd6a38d2a",
    "list_skills": "7be07140d1e6be5e",
    "enable_skill": "3cd7bc0e5785ba0f",
    "disable_skill": "f6183e060f3be137",
    "install_skill": "98be50df8fb83d61",
    "export_skill": "d223c6528f2c88bd",
    "skill_status": "5177be67a7a1ae1e",
    "invoke_skill": "f80a1610b5a49289",
    "delegate_task": "05c99b6f11821d1c",
    "list_tasks": "a81136a21dc48a2b",
    "cancel_task": "aaffe5a4cdfa32e0",
    "search_knowledge": "3e5555a61c0509da",
    "ingest_document": "14ece56caaf4fcd2",
    "bulk_ingest_knowledge": "db9fc05af1e13cdf",
    "list_knowledge": "4ea7f4f545878fdc",
    "delete_knowledge": "73268085bef06627",
    "browser_screenshot": "89e8d695b035d5f2",
    "browser_read_page": "114732e75e12d257",
    "browser_read_table": "dab744148b75846c",
    "browser_click": "836c03f7acbc9f6d",
    "browser_fill": "6c3832a67ec9f31e",
    "browser_evaluate": "10ab6fb73e39e4b0",
    "web_search": "387c3cf486568b5d",
    "fetch_url": "15aa90cb901577fa",
    "set_permission": "c12a0a66bb423d59",
    "analyze_pdf": "7006855cb4bf0b85",
    "read_channel": "22d87d43b1ac97e2",
    "add_reaction": "f466eef6573b0166",
    "create_poll": "6fb64482c930284b",
    # Updated 2026-07-31: wait_seconds param + monitoring guidance added to
    # manage_process (deliberate schema change, PR fix/wait-polling).
    "manage_process": "ecb65fc2b99e0d10",
    "manage_list": "1fe50a2ac7a59952",
    "analyze_image": "8680a337769f8d09",
    "start_loop": "67faa086c9b0987f",
    "stop_loop": "d098afff69b3da0a",
    "list_loops": "c811f88df56a3005",
    "spawn_agent": "e191abb54b671847",
    "send_to_agent": "90eb251b4ab2f940",
    "list_agents": "89bed3253e8298d8",
    "kill_agent": "2543a3eeb5720fdf",
    "get_agent_results": "82b266fc0e61b299",
    "wait_for_agents": "b9ad3d97dacf1d46",
    "spawn_loop_agents": "061cadff45a0d987",
    "collect_loop_agents": "b4eddcf0e4e2edca",
    "git_ops": "e87a7ab5d999cef3",
    "kubectl": "aac8c396875dbaab",
    "docker_ops": "7e7b5293a299aa8d",
    "terraform_ops": "054cd8877208bc7d",
    "http_probe": "dfc3b04b36c5e7f9",
    "issue_tracker": "4f0a793414052b40",
    "generate_image": "ad893100a9b9c478",
    "validate_action": "199baeb4723517d7",
    "email_send": "1282279440e34e6f",
    "email_search": "3a7584b725d1c134",
    "email_read": "c88d947b915f9cf0",
    "email_list_recent": "f673907aa8906746",
}


def _canonical_hash(tool_def: dict) -> str:
    return hashlib.sha256(
        json.dumps(tool_def, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()[:16]


class TestToolParity:
    def test_exact_names_and_order(self):
        actual = [t["name"] for t in TOOLS]
        assert len(actual) == len(EXPECTED_TOOL_ORDER) == 73
        missing = set(EXPECTED_TOOL_ORDER) - set(actual)
        added = set(actual) - set(EXPECTED_TOOL_ORDER)
        assert not missing and not added, (
            f"tool set drifted:\nmissing={sorted(missing)}\nadded={sorted(added)}"
        )
        assert actual == EXPECTED_TOOL_ORDER, "TOOLS ORDER drifted — order is prompt behavior"

    def test_no_duplicate_names(self):
        names = [t["name"] for t in TOOLS]
        assert len(names) == len(set(names))

    def test_schema_deep_equality(self):
        changed = [
            t["name"] for t in TOOLS
            if _canonical_hash(t) != EXPECTED_TOOL_HASHES[t["name"]]
        ]
        assert not changed, (
            f"tool definitions changed content: {changed} — "
            "schema/description edits are out of scope for the carve"
        )

    def test_tool_map_completeness_and_identity(self):
        assert set(TOOL_MAP) == set(EXPECTED_TOOL_ORDER)
        for t in TOOLS:
            assert TOOL_MAP[t["name"]] is t, "TOOL_MAP values must BE the TOOLS entries"


class TestBackendGatedVisibility:
    """Backend-gated tools must be INVISIBLE to the model when their
    backend isn't configured (tool_catalog.merged_definitions) — otherwise
    the LLM keeps calling tools that can only fail. Previously untested;
    pinned during RFC-004 soak at Aaron's request (2026-07-06).

    Gated groups: the four email tools (need email.enabled), issue_tracker (needs
    issue_tracker.enabled), generate_image (needs a native-OpenAI or ComfyUI
    backend — hidden when neither is available).
    """

    GATED = {"email_send", "email_search", "email_read",
             "email_list_recent", "issue_tracker", "generate_image"}

    @staticmethod
    def _dependency_gated() -> set[str]:
        """Tools gated by an installed DEPENDENCY rather than by config.

        analyze_pdf needs PyMuPDF, which lives in the optional `pdf` extra, so
        whether it is visible depends on the environment rather than the Config
        under test. Computing this instead of hardcoding keeps the arithmetic
        below true on a machine with the extra AND on one without — a fixed
        constant would pass locally and fail in CI, or vice versa.
        """
        import importlib.util

        return set() if importlib.util.find_spec("fitz") else {"analyze_pdf"}

    def _catalog_names(self, **config_kwargs) -> set[str]:
        from src.config.schema import Config
        from src.discord.client import OdinBot

        bot = OdinBot(
            Config(discord={"token": "pin"}, permissions={"default_tier": "admin"},
                   **config_kwargs)
        )
        return {t["name"] for t in bot.tool_catalog.merged_definitions()}

    def test_unconfigured_backends_are_invisible(self):
        names = self._catalog_names()
        leaked = self.GATED & names
        assert not leaked, f"backend-gated tools visible without config: {sorted(leaked)}"
        dependency_gated = self._dependency_gated()
        assert not (dependency_gated & names), (
            f"tools with a missing dependency are advertised: {sorted(dependency_gated & names)}"
        )
        # exact arithmetic: full registry minus config-gated minus
        # dependency-gated tools
        assert len(names) == len(EXPECTED_TOOL_ORDER) - len(self.GATED) - len(dependency_gated)

    def test_analyze_pdf_follows_its_dependency(self):
        """analyze_pdf must be advertised exactly when PyMuPDF can be imported.

        It was previously advertised unconditionally while no install path
        installed the `pdf` extra, so every call failed with
        "No module named 'fitz'" (found in the v3.65.0 smoke test).
        """
        import importlib.util

        visible = "analyze_pdf" in self._catalog_names()
        assert visible is (importlib.util.find_spec("fitz") is not None)



class TestRegistryMutabilitySemantics:
    """Current semantics, pinned as-is (R1 advisory #3): TOOL_MAP builds once;
    the defs cache rebuilds from the live TOOLS list on invalidation."""

    def test_tool_map_static_but_defs_cache_rebuilds(self):
        fake = {"name": "zz_parity_probe", "description": "probe", "input_schema": {}}
        invalidate_tool_defs_cache()
        baseline = get_tool_definitions()
        assert all(d["name"] != "zz_parity_probe" for d in baseline)
        TOOLS.append(fake)
        try:
            # TOOL_MAP was built at import — mutation does NOT appear there.
            assert "zz_parity_probe" not in TOOL_MAP
            # Cached defs also unchanged until invalidated…
            assert get_tool_definitions() is baseline
            # …but invalidation re-reads the live TOOLS list.
            invalidate_tool_defs_cache()
            rebuilt = get_tool_definitions()
            assert any(d["name"] == "zz_parity_probe" for d in rebuilt)
        finally:
            TOOLS.remove(fake)
            invalidate_tool_defs_cache()

    def test_defs_cache_identity(self):
        invalidate_tool_defs_cache()
        first = get_tool_definitions()
        assert get_tool_definitions() is first, "cache must return the same object"
        invalidate_tool_defs_cache()
        assert registry._tool_defs_cache is None

    def test_defs_shape_and_schema_identity(self):
        invalidate_tool_defs_cache()
        defs = get_tool_definitions()
        assert [d["name"] for d in defs] == EXPECTED_TOOL_ORDER
        by_name = {t["name"]: t for t in TOOLS}
        for d in defs:
            src = by_name[d["name"]]
            # input_schema passes through by REFERENCE (same object)…
            assert d["input_schema"] is src["input_schema"]
            # …while the description is affordance-decorated from the raw one.
            assert src["description"] in d["description"]
