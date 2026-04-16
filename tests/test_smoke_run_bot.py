"""Smoke tests for Odin bot startup and module imports.

Round 50 final validation: verifies that the bot entry point can import,
OdinConfig can be constructed, OdinBot can be instantiated, and every major
subsystem added across rounds 1-49 is importable and constructable.
"""
from __future__ import annotations

import importlib

import pytest


# ---------------------------------------------------------------------------
# Entry point import
# ---------------------------------------------------------------------------


class TestEntryPoint:
    """Verify the bot entry point module loads cleanly."""

    def test_main_module_imports(self):
        mod = importlib.import_module("src.__main__")
        assert hasattr(mod, "main")

    def test_client_module_imports(self):
        mod = importlib.import_module("src.discord.client")
        assert hasattr(mod, "run_bot")
        assert hasattr(mod, "OdinBot")

    def test_run_bot_is_callable(self):
        from src.discord.client import run_bot
        assert callable(run_bot)


# ---------------------------------------------------------------------------
# OdinConfig
# ---------------------------------------------------------------------------


class TestOdinConfig:
    def test_construct_default(self):
        from src.config import OdinConfig
        cfg = OdinConfig()
        assert cfg.token == ""
        assert cfg.prefix == "!"

    def test_validate_missing_token(self):
        from src.config import OdinConfig
        cfg = OdinConfig()
        errors = cfg.validate()
        assert any("ODIN_TOKEN" in e for e in errors)

    def test_construct_with_token(self):
        from src.config import OdinConfig
        cfg = OdinConfig(token="test-token-123")
        errors = cfg.validate()
        assert not any("ODIN_TOKEN" in e for e in errors)


# ---------------------------------------------------------------------------
# OdinBot instantiation
# ---------------------------------------------------------------------------


class TestOdinBotInit:
    def test_instantiate_bot(self):
        from src.config import OdinConfig
        from src.discord.client import OdinBot
        cfg = OdinConfig(token="fake-token")
        bot = OdinBot(cfg)
        assert bot.config is cfg
        assert bot.config.token == "fake-token"

    def test_bot_has_cog_list(self):
        from src.discord.client import INITIAL_EXTENSIONS
        assert len(INITIAL_EXTENSIONS) >= 5
        assert all(ext.startswith("src.discord.cogs.") for ext in INITIAL_EXTENSIONS)


# ---------------------------------------------------------------------------
# Pydantic config (config.yml model)
# ---------------------------------------------------------------------------


class TestPydanticConfig:
    def test_config_defaults(self):
        from src.config.schema import Config
        cfg = Config(discord={"token": "t"})
        assert cfg.tools is not None
        assert cfg.sessions is not None

    def test_config_has_all_round_fields(self):
        """Every phase added config fields; verify they're all present."""
        from src.config.schema import Config
        cfg = Config(discord={"token": "t"})
        # Phase 1-2
        assert hasattr(cfg, "sessions")
        assert hasattr(cfg.sessions, "token_budget")
        # Phase 2
        assert hasattr(cfg, "tools")
        assert hasattr(cfg.tools, "tool_timeouts")
        # Phase 4
        assert hasattr(cfg, "mcp")
        assert hasattr(cfg, "slack")
        assert hasattr(cfg, "issue_tracker")
        # Phase 6
        assert hasattr(cfg, "audit")
        assert hasattr(cfg, "permissions")
        # Phase 7
        assert hasattr(cfg, "agents")
        # Phase 8
        assert hasattr(cfg, "web")
        # Phase 9
        assert hasattr(cfg, "grafana_alerts")
        # Phase 10
        assert hasattr(cfg, "outbound_webhooks")
        assert hasattr(cfg, "graceful_degradation")


# ---------------------------------------------------------------------------
# Phase 1 — Observability & cost
# ---------------------------------------------------------------------------


class TestPhase1Imports:
    def test_cost_tracker(self):
        from src.llm.cost_tracker import CostTracker
        ct = CostTracker()
        assert hasattr(ct, "record")

    def test_trajectory_saver(self):
        from src.agents.trajectory import AgentTrajectorySaver, AgentTrajectoryTurn
        assert AgentTrajectorySaver is not None
        assert AgentTrajectoryTurn is not None


# ---------------------------------------------------------------------------
# Phase 2 — Reliability hardening
# ---------------------------------------------------------------------------


class TestPhase2Imports:
    def test_backoff(self):
        from src.llm.backoff import compute_backoff
        delay = compute_backoff(attempt=0, base_delay=1.0, max_delay=30.0)
        assert 0.0 <= delay <= 1.0

    def test_bulkhead(self):
        from src.tools.bulkhead import Bulkhead
        bh = Bulkhead(name="test", max_concurrent=5)
        assert bh is not None

    def test_ssh_pool(self):
        from src.tools.ssh_pool import SSHConnectionPool
        assert SSHConnectionPool is not None

    def test_circuit_breaker(self):
        from src.llm.circuit_breaker import CircuitBreaker, CircuitOpenError
        cb = CircuitBreaker(name="test")
        assert cb is not None
        assert issubclass(CircuitOpenError, Exception)


# ---------------------------------------------------------------------------
# Phase 3 — New tools
# ---------------------------------------------------------------------------


class TestPhase3Imports:
    def test_git_ops(self):
        from src.tools.git_ops import build_git_command
        cmd = build_git_command("status", {"path": "/tmp/repo"})
        assert "git" in str(cmd)

    def test_kubectl_ops(self):
        from src.tools.kubectl_ops import build_kubectl_command
        cmd = build_kubectl_command("get", {"resource": "pods"})
        assert "kubectl" in cmd

    def test_docker_ops(self):
        from src.tools.docker_ops import build_docker_command
        cmd = build_docker_command("ps", {})
        assert "docker" in cmd

    def test_terraform_ops(self):
        from src.tools.terraform_ops import build_terraform_command
        cmd = build_terraform_command("init", {})
        assert "terraform" in cmd

    def test_http_probe_ops(self):
        from src.tools.http_probe_ops import build_http_probe_command
        cmd = build_http_probe_command({"method": "GET", "url": "http://example.com"})
        assert "curl" in cmd


# ---------------------------------------------------------------------------
# Phase 4 — Integrations
# ---------------------------------------------------------------------------


class TestPhase4Imports:
    def test_mcp_client(self):
        from src.tools.mcp_client import MCPServerConnection
        assert MCPServerConnection is not None

    def test_slack_notifier(self):
        from src.notifications.slack import SlackNotifier
        sn = SlackNotifier(default_webhook_url="https://hooks.slack.com/test")
        assert sn is not None

    def test_issue_tracker(self):
        from src.notifications.issue_tracker import IssueTrackerClient
        assert IssueTrackerClient is not None

    def test_grafana_alerts(self):
        from src.health.grafana_alerts import GrafanaAlertHandler
        assert GrafanaAlertHandler is not None


# ---------------------------------------------------------------------------
# Phase 5 — Memory & knowledge
# ---------------------------------------------------------------------------


class TestPhase5Imports:
    def test_knowledge_store(self):
        from src.knowledge.store import KnowledgeStore
        assert KnowledgeStore is not None

    def test_bulk_importer(self):
        from src.knowledge.importer import BulkImporter
        assert BulkImporter is not None

    def test_fts_index(self):
        from src.search.fts import FullTextIndex
        assert FullTextIndex is not None

    def test_hybrid_search(self):
        from src.search.hybrid import reciprocal_rank_fusion
        result = reciprocal_rank_fusion([])
        assert result == []

    def test_sqlite_vec(self):
        from src.search.sqlite_vec import serialize_vector, deserialize_vector
        import struct
        data = serialize_vector([1.0, 2.0, 3.0])
        assert len(data) == 3 * struct.calcsize("f")


# ---------------------------------------------------------------------------
# Phase 6 — Policy, audit, safety
# ---------------------------------------------------------------------------


class TestPhase6Imports:
    def test_diff_tracker(self):
        from src.audit.diff_tracker import DiffTracker
        dt = DiffTracker()
        assert hasattr(dt, "compute_diff")

    def test_audit_signer(self):
        from src.audit.signer import AuditSigner
        signer = AuditSigner(key="test-key")
        assert signer is not None

    def test_risk_classifier(self):
        from src.tools.risk_classifier import classify_command, RiskLevel
        level, reason = classify_command("ls")
        assert isinstance(level, RiskLevel)

    def test_permission_manager(self):
        from src.permissions.manager import PermissionManager
        assert PermissionManager is not None


# ---------------------------------------------------------------------------
# Phase 7 — Agents, loops, lifecycle
# ---------------------------------------------------------------------------


class TestPhase7Imports:
    def test_agent_state_machine(self):
        from src.agents.manager import AgentState, AgentStateMachine
        sm = AgentStateMachine()
        assert sm.state == AgentState.SPAWNING

    def test_recovery(self):
        from src.tools.recovery import classify_error, RecoveryStats
        stats = RecoveryStats()
        summary = stats.get_summary()
        assert summary["totals"]["attempts"] == 0

    def test_branch_freshness(self):
        from src.tools.branch_freshness import is_test_command, FreshnessStats
        assert is_test_command("pytest tests/") is True
        assert is_test_command("echo hello") is False

    def test_agent_trajectory(self):
        from src.agents.trajectory import AgentTrajectorySaver, AgentTrajectoryTurn
        assert AgentTrajectorySaver is not None
        assert AgentTrajectoryTurn is not None


# ---------------------------------------------------------------------------
# Phase 8 — UX & workflows
# ---------------------------------------------------------------------------


class TestPhase8Imports:
    def test_health_checker(self):
        from src.health.checker import ComponentStatus
        assert ComponentStatus is not None

    def test_resource_usage(self):
        from src.monitoring.resource_usage import collect_all, DirStats, scan_directory
        assert callable(collect_all)
        assert callable(scan_directory)
        ds = DirStats(path="/tmp", file_count=0, total_bytes=0)
        assert ds.file_count == 0

    def test_output_streamer(self):
        from src.tools.output_streamer import ToolOutputStreamer, StreamChunk
        streamer = ToolOutputStreamer()
        assert streamer is not None

    def test_auxiliary_llm(self):
        from src.llm.auxiliary import AuxiliaryLLMClient
        assert AuxiliaryLLMClient is not None


# ---------------------------------------------------------------------------
# Phase 9 — Anti-hedging + detection hardening
# ---------------------------------------------------------------------------


class TestPhase9Imports:
    def test_response_guards(self):
        from src.discord.response_guards import (
            detect_fabrication,
            detect_hedging,
            detect_premature_failure,
            detect_stuck_loop,
            StuckLoopTracker,
        )
        assert callable(detect_fabrication)
        assert callable(detect_hedging)
        assert callable(detect_premature_failure)
        assert callable(detect_stuck_loop)
        tracker = StuckLoopTracker()
        assert tracker is not None

    def test_result_validator(self):
        from src.tools.result_validator import validate_tool_result, ResultValidationStats
        stats = ResultValidationStats()
        assert stats.total_validated == 0

    def test_context_compressor(self):
        from src.llm.context_compressor import compress_tool_context, PrefixTracker, CompressionStats
        assert callable(compress_tool_context)
        tracker = PrefixTracker()
        assert tracker is not None
        stats = CompressionStats()
        assert stats.compressions == 0

    def test_model_router(self):
        from src.llm.model_router import ModelRouter, MessageIntent, RoutingStats
        assert MessageIntent.CHAT is not None
        assert MessageIntent.QUERY is not None
        assert MessageIntent.TASK is not None
        assert MessageIntent.COMPLEX is not None
        stats = RoutingStats()
        assert stats.total_routed == 0


# ---------------------------------------------------------------------------
# Phase 10 — Polish & final
# ---------------------------------------------------------------------------


class TestPhase10Imports:
    def test_startup_diagnostics(self):
        from src.health.startup import DiagnosticResult, StartupReport, run_startup_diagnostics
        assert callable(run_startup_diagnostics)
        dr = DiagnosticResult(name="test", passed=True, detail="ok")
        assert dr.passed is True

    def test_subsystem_guard(self):
        from src.health.subsystem_guard import SubsystemGuard, SubsystemState
        guard = SubsystemGuard()
        guard.register("test_subsystem")
        assert guard.is_available("test_subsystem") is True
        assert SubsystemState.AVAILABLE is not None
        assert SubsystemState.DEGRADED is not None
        assert SubsystemState.UNAVAILABLE is not None

    def test_outbound_webhooks(self):
        from src.notifications.outbound_webhooks import (
            OutboundWebhookDispatcher,
            EventType,
            sign_payload,
            build_event_payload,
        )
        disp = OutboundWebhookDispatcher()
        assert len(disp.list_webhooks()) == 0
        assert EventType.TOOL_EXECUTION is not None
        sig = sign_payload(b"test", "secret")
        assert isinstance(sig, str)
        payload = build_event_payload("test", {"key": "value"})
        assert "event_type" in payload
        assert payload["data"] == {"key": "value"}


# ---------------------------------------------------------------------------
# Cross-cutting: secret scrubber
# ---------------------------------------------------------------------------


class TestSecretScrubber:
    def test_scrub_secrets(self):
        from src.llm.secret_scrubber import scrub_output_secrets
        clean = scrub_output_secrets("password=hunter2")
        assert "hunter2" not in clean

    def test_scrub_api_key(self):
        from src.llm.secret_scrubber import scrub_output_secrets
        clean = scrub_output_secrets("api_key=sk-abc123xyz")
        assert "sk-abc123xyz" not in clean


# ---------------------------------------------------------------------------
# Cross-cutting: system prompt size constraint
# ---------------------------------------------------------------------------


class TestSystemPromptConstraint:
    def test_prompt_under_5000_chars(self):
        from src.llm.system_prompt import build_system_prompt
        prompt = build_system_prompt(
            context="run_command: run shell commands",
            hosts={"localhost": "linux"},
        )
        assert len(prompt) < 5000, f"System prompt is {len(prompt)} chars (limit 5000)"


# ---------------------------------------------------------------------------
# Cross-cutting: tool registry
# ---------------------------------------------------------------------------


class TestToolRegistry:
    def test_tools_defined(self):
        from src.tools.registry import TOOLS
        assert len(TOOLS) >= 60
        names = {t["name"] for t in TOOLS}
        # Spot-check key tools from various rounds
        assert "run_command" in names
        assert "read_file" in names
        assert "search_knowledge" in names


# ---------------------------------------------------------------------------
# Full import sweep: every src/ module should import without error
# ---------------------------------------------------------------------------


class TestImportSweep:
    """Import every key module to catch broken imports / missing deps."""

    @pytest.mark.parametrize("module_path", [
        "src.config",
        "src.config.schema",
        "src.discord.client",
        "src.discord.response_guards",
        "src.llm.cost_tracker",
        "src.llm.backoff",
        "src.llm.circuit_breaker",
        "src.llm.secret_scrubber",
        "src.llm.system_prompt",
        "src.llm.auxiliary",
        "src.llm.context_compressor",
        "src.llm.model_router",
        "src.tools.registry",
        "src.tools.git_ops",
        "src.tools.kubectl_ops",
        "src.tools.docker_ops",
        "src.tools.terraform_ops",
        "src.tools.http_probe_ops",
        "src.tools.bulkhead",
        "src.tools.ssh_pool",
        "src.tools.tool_memory",
        "src.tools.process_manager",
        "src.tools.risk_classifier",
        "src.tools.recovery",
        "src.tools.branch_freshness",
        "src.tools.output_streamer",
        "src.tools.result_validator",
        "src.tools.comfyui",
        "src.tools.browser",
        "src.tools.mcp_client",
        "src.search.fts",
        "src.search.hybrid",
        "src.search.sqlite_vec",
        "src.knowledge.store",
        "src.knowledge.importer",
        "src.sessions.manager",
        "src.learning.reflector",
        "src.agents.manager",
        "src.agents.trajectory",
        "src.agents.loop_bridge",
        "src.audit.diff_tracker",
        "src.audit.signer",
        "src.audit.logger",
        "src.scheduler.scheduler",
        "src.health.startup",
        "src.health.subsystem_guard",
        "src.health.grafana_alerts",
        "src.notifications.slack",
        "src.notifications.issue_tracker",
        "src.notifications.outbound_webhooks",
        "src.permissions.manager",
        "src.monitoring.resource_usage",
        "src.web.chat",
        "src.web.websocket",
    ])
    def test_import(self, module_path):
        importlib.import_module(module_path)
