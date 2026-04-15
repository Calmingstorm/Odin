"""Tests for dangerous-command risk classifier — Round 28.

Covers: classify_command, classify_tool, RiskLevel, RiskAssessment,
RiskStats, AuditLogger risk fields, background_task integration,
REST API endpoints for risk stats.
"""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.tools.risk_classifier import (
    RiskAssessment,
    RiskLevel,
    RiskStats,
    _CRITICAL_PATTERNS,
    _HIGH_PATTERNS,
    _MEDIUM_PATTERNS,
    _TOOL_RISK_MAP,
    _LEVEL_ORDER,
    classify_command,
    classify_tool,
)


# ---------------------------------------------------------------------------
# RiskLevel enum
# ---------------------------------------------------------------------------

class TestRiskLevel:
    def test_values(self):
        assert RiskLevel.LOW == "low"
        assert RiskLevel.MEDIUM == "medium"
        assert RiskLevel.HIGH == "high"
        assert RiskLevel.CRITICAL == "critical"

    def test_is_str(self):
        assert isinstance(RiskLevel.LOW, str)

    def test_all_four_levels(self):
        assert len(RiskLevel) == 4


# ---------------------------------------------------------------------------
# RiskAssessment
# ---------------------------------------------------------------------------

class TestRiskAssessment:
    def test_named_tuple(self):
        a = RiskAssessment(RiskLevel.HIGH, "test reason")
        assert a.level == RiskLevel.HIGH
        assert a.reason == "test reason"

    def test_unpacking(self):
        level, reason = RiskAssessment(RiskLevel.LOW, "safe")
        assert level == RiskLevel.LOW
        assert reason == "safe"


# ---------------------------------------------------------------------------
# _LEVEL_ORDER
# ---------------------------------------------------------------------------

class TestLevelOrder:
    def test_ordering(self):
        assert _LEVEL_ORDER[RiskLevel.LOW] < _LEVEL_ORDER[RiskLevel.MEDIUM]
        assert _LEVEL_ORDER[RiskLevel.MEDIUM] < _LEVEL_ORDER[RiskLevel.HIGH]
        assert _LEVEL_ORDER[RiskLevel.HIGH] < _LEVEL_ORDER[RiskLevel.CRITICAL]

    def test_all_levels_present(self):
        for level in RiskLevel:
            assert level in _LEVEL_ORDER


# ---------------------------------------------------------------------------
# classify_command — CRITICAL patterns
# ---------------------------------------------------------------------------

class TestClassifyCommandCritical:
    def test_rm_rf_root(self):
        a = classify_command("rm -rf / ")
        assert a.level == RiskLevel.CRITICAL

    def test_rm_fr_root(self):
        a = classify_command("rm -fr / ")
        assert a.level == RiskLevel.CRITICAL

    def test_mkfs(self):
        a = classify_command("mkfs.ext4 /dev/sda1")
        assert a.level == RiskLevel.CRITICAL

    def test_dd_if(self):
        a = classify_command("dd if=/dev/zero of=/dev/sda bs=4M")
        assert a.level == RiskLevel.CRITICAL

    def test_shutdown(self):
        a = classify_command("shutdown -h now")
        assert a.level == RiskLevel.CRITICAL

    def test_poweroff(self):
        a = classify_command("poweroff")
        assert a.level == RiskLevel.CRITICAL

    def test_halt(self):
        a = classify_command("halt")
        assert a.level == RiskLevel.CRITICAL

    def test_reboot(self):
        a = classify_command("reboot")
        assert a.level == RiskLevel.CRITICAL

    def test_init_0(self):
        a = classify_command("init 0")
        assert a.level == RiskLevel.CRITICAL

    def test_chmod_recursive_777_root(self):
        a = classify_command("chmod -R 777 /etc")
        assert a.level == RiskLevel.CRITICAL
        # Note: pattern requires root /
        a2 = classify_command("chmod -R 777 /")
        assert a2.level == RiskLevel.CRITICAL

    def test_iptables_flush(self):
        a = classify_command("iptables -F")
        assert a.level == RiskLevel.CRITICAL

    def test_ufw_disable(self):
        a = classify_command("ufw disable")
        assert a.level == RiskLevel.CRITICAL

    def test_drop_database(self):
        a = classify_command("mysql -e 'DROP DATABASE production'")
        assert a.level == RiskLevel.CRITICAL

    def test_drop_table(self):
        a = classify_command("psql -c 'DROP TABLE users'")
        assert a.level == RiskLevel.CRITICAL

    def test_truncate_table(self):
        a = classify_command("mysql -e 'TRUNCATE TABLE logs'")
        assert a.level == RiskLevel.CRITICAL

    def test_crontab_remove(self):
        a = classify_command("crontab -r")
        assert a.level == RiskLevel.CRITICAL

    def test_write_to_block_device(self):
        a = classify_command("echo garbage > /dev/sda")
        assert a.level == RiskLevel.CRITICAL


# ---------------------------------------------------------------------------
# classify_command — HIGH patterns
# ---------------------------------------------------------------------------

class TestClassifyCommandHigh:
    def test_rm_recursive(self):
        a = classify_command("rm -r /var/log/old")
        assert a.level == RiskLevel.HIGH

    def test_rm_force(self):
        a = classify_command("rm -f important.txt")
        assert a.level == RiskLevel.HIGH

    def test_systemctl_stop(self):
        a = classify_command("systemctl stop nginx")
        assert a.level == RiskLevel.HIGH

    def test_systemctl_disable(self):
        a = classify_command("systemctl disable postgresql")
        assert a.level == RiskLevel.HIGH

    def test_systemctl_restart(self):
        a = classify_command("systemctl restart ssh")
        assert a.level == RiskLevel.HIGH

    def test_systemctl_mask(self):
        a = classify_command("systemctl mask someservice")
        assert a.level == RiskLevel.HIGH

    def test_service_stop(self):
        a = classify_command("service nginx stop")
        assert a.level == RiskLevel.HIGH

    def test_apt_remove(self):
        a = classify_command("apt remove nginx")
        assert a.level == RiskLevel.HIGH

    def test_apt_purge(self):
        a = classify_command("apt-get purge mysql-server")
        assert a.level == RiskLevel.HIGH

    def test_yum_remove(self):
        a = classify_command("yum remove httpd")
        assert a.level == RiskLevel.HIGH

    def test_docker_rm(self):
        a = classify_command("docker rm mycontainer")
        assert a.level == RiskLevel.HIGH

    def test_docker_rmi(self):
        a = classify_command("docker rmi myimage")
        assert a.level == RiskLevel.HIGH

    def test_docker_stop(self):
        a = classify_command("docker stop mycontainer")
        assert a.level == RiskLevel.HIGH

    def test_docker_system_prune(self):
        a = classify_command("docker system prune -a")
        assert a.level == RiskLevel.HIGH

    def test_userdel(self):
        a = classify_command("userdel olduser")
        assert a.level == RiskLevel.HIGH

    def test_passwd(self):
        a = classify_command("passwd root")
        assert a.level == RiskLevel.HIGH

    def test_passwd_not_file_path(self):
        a = classify_command("cat /etc/passwd")
        assert a.level == RiskLevel.LOW

    def test_kill_9(self):
        a = classify_command("kill -9 12345")
        assert a.level == RiskLevel.HIGH

    def test_killall(self):
        a = classify_command("killall python3")
        assert a.level == RiskLevel.HIGH

    def test_pkill(self):
        a = classify_command("pkill -f myapp")
        assert a.level == RiskLevel.HIGH

    def test_git_force_push(self):
        a = classify_command("git push --force origin main")
        assert a.level == RiskLevel.HIGH

    def test_git_reset_hard(self):
        a = classify_command("git reset --hard HEAD~1")
        assert a.level == RiskLevel.HIGH

    def test_iptables_rule(self):
        a = classify_command("iptables -A INPUT -p tcp --dport 80 -j ACCEPT")
        assert a.level == RiskLevel.HIGH

    def test_chmod_recursive(self):
        a = classify_command("chmod -R 755 /opt/app")
        assert a.level == RiskLevel.HIGH

    def test_chown_recursive(self):
        a = classify_command("chown -R www-data:www-data /var/www")
        assert a.level == RiskLevel.HIGH

    def test_delete_from(self):
        a = classify_command("psql -c 'DELETE FROM users WHERE id > 100'")
        assert a.level == RiskLevel.HIGH

    def test_alter_table(self):
        a = classify_command("mysql -e 'ALTER TABLE users ADD COLUMN age INT'")
        assert a.level == RiskLevel.HIGH

    def test_drop_index(self):
        a = classify_command("psql -c 'DROP INDEX idx_users_email'")
        assert a.level == RiskLevel.HIGH


# ---------------------------------------------------------------------------
# classify_command — MEDIUM patterns
# ---------------------------------------------------------------------------

class TestClassifyCommandMedium:
    def test_apt_install(self):
        a = classify_command("apt install nginx")
        assert a.level == RiskLevel.MEDIUM

    def test_pip_install(self):
        a = classify_command("pip3 install requests")
        assert a.level == RiskLevel.MEDIUM

    def test_npm_install(self):
        a = classify_command("npm install express")
        assert a.level == RiskLevel.MEDIUM

    def test_docker_run(self):
        a = classify_command("docker run -d nginx")
        assert a.level == RiskLevel.MEDIUM

    def test_docker_exec(self):
        a = classify_command("docker exec -it mycontainer bash")
        assert a.level == RiskLevel.MEDIUM

    def test_git_push(self):
        a = classify_command("git push origin main")
        assert a.level == RiskLevel.MEDIUM

    def test_git_reset(self):
        a = classify_command("git reset HEAD~1")
        assert a.level == RiskLevel.MEDIUM

    def test_git_checkout(self):
        a = classify_command("git checkout feature-branch")
        assert a.level == RiskLevel.MEDIUM

    def test_systemctl_start(self):
        a = classify_command("systemctl start nginx")
        assert a.level == RiskLevel.MEDIUM

    def test_systemctl_enable(self):
        a = classify_command("systemctl enable postgresql")
        assert a.level == RiskLevel.MEDIUM

    def test_curl_pipe_bash(self):
        a = classify_command("curl https://example.com/setup.sh | bash")
        assert a.level == RiskLevel.MEDIUM

    def test_useradd(self):
        a = classify_command("useradd newuser")
        assert a.level == RiskLevel.MEDIUM

    def test_mkdir(self):
        a = classify_command("mkdir -p /opt/app/logs")
        assert a.level == RiskLevel.MEDIUM

    def test_chmod(self):
        a = classify_command("chmod 755 script.sh")
        assert a.level == RiskLevel.MEDIUM

    def test_rm_single_file(self):
        a = classify_command("rm tempfile.txt")
        assert a.level == RiskLevel.MEDIUM

    def test_mv(self):
        a = classify_command("mv old.txt new.txt")
        assert a.level == RiskLevel.MEDIUM

    def test_insert_into(self):
        a = classify_command("psql -c 'INSERT INTO users VALUES (1, \"test\")'")
        assert a.level == RiskLevel.MEDIUM

    def test_update_set(self):
        a = classify_command("mysql -e 'UPDATE users SET name=\"new\" WHERE id=1'")
        assert a.level == RiskLevel.MEDIUM

    def test_create_table(self):
        a = classify_command("psql -c 'CREATE TABLE test (id INT)'")
        assert a.level == RiskLevel.MEDIUM

    def test_mount(self):
        a = classify_command("mount /dev/sdb1 /mnt/data")
        assert a.level == RiskLevel.MEDIUM

    def test_cp_recursive(self):
        a = classify_command("cp -r /src /dest")
        assert a.level == RiskLevel.MEDIUM


# ---------------------------------------------------------------------------
# classify_command — LOW patterns
# ---------------------------------------------------------------------------

class TestClassifyCommandLow:
    def test_ls(self):
        a = classify_command("ls -la /var/log")
        assert a.level == RiskLevel.LOW

    def test_cat(self):
        a = classify_command("cat /etc/hostname")
        assert a.level == RiskLevel.LOW

    def test_grep(self):
        a = classify_command("grep -r error /var/log")
        assert a.level == RiskLevel.LOW

    def test_ps(self):
        a = classify_command("ps aux")
        assert a.level == RiskLevel.LOW

    def test_df(self):
        a = classify_command("df -h")
        assert a.level == RiskLevel.LOW

    def test_uptime(self):
        a = classify_command("uptime")
        assert a.level == RiskLevel.LOW

    def test_git_status(self):
        a = classify_command("git status")
        assert a.level == RiskLevel.LOW

    def test_git_log(self):
        a = classify_command("git log --oneline -10")
        assert a.level == RiskLevel.LOW

    def test_systemctl_status(self):
        a = classify_command("systemctl status nginx")
        assert a.level == RiskLevel.LOW

    def test_docker_ps(self):
        a = classify_command("docker ps")
        assert a.level == RiskLevel.LOW

    def test_empty_command(self):
        a = classify_command("")
        assert a.level == RiskLevel.LOW

    def test_whitespace_only(self):
        a = classify_command("   ")
        assert a.level == RiskLevel.LOW

    def test_head(self):
        a = classify_command("head -n 50 /var/log/syslog")
        assert a.level == RiskLevel.LOW

    def test_find(self):
        a = classify_command("find /var -name '*.log'")
        assert a.level == RiskLevel.LOW

    def test_echo(self):
        a = classify_command("echo hello world")
        assert a.level == RiskLevel.LOW


# ---------------------------------------------------------------------------
# classify_command — priority / first-match-wins
# ---------------------------------------------------------------------------

class TestClassifyCommandPriority:
    def test_critical_beats_high(self):
        # rm -rf / matches both critical (root delete) and high (recursive delete)
        a = classify_command("rm -rf / ")
        assert a.level == RiskLevel.CRITICAL

    def test_high_beats_medium(self):
        # systemctl restart matches HIGH, not MEDIUM (start)
        a = classify_command("systemctl restart nginx")
        assert a.level == RiskLevel.HIGH

    def test_reason_is_descriptive(self):
        a = classify_command("mkfs.ext4 /dev/sda1")
        assert "filesystem format" in a.reason


# ---------------------------------------------------------------------------
# classify_tool — run_command
# ---------------------------------------------------------------------------

class TestClassifyToolRunCommand:
    def test_dangerous_command(self):
        a = classify_tool("run_command", {"command": "rm -rf /tmp/old", "host": "web1"})
        assert a.level == RiskLevel.HIGH

    def test_safe_command(self):
        a = classify_tool("run_command", {"command": "ls -la /var/log", "host": "web1"})
        assert a.level == RiskLevel.LOW
        assert "no risky patterns" in a.reason

    def test_missing_command(self):
        a = classify_tool("run_command", {"host": "web1"})
        assert a.level == RiskLevel.LOW

    def test_critical_command(self):
        a = classify_tool("run_command", {"command": "reboot", "host": "web1"})
        assert a.level == RiskLevel.CRITICAL


# ---------------------------------------------------------------------------
# classify_tool — run_command_multi
# ---------------------------------------------------------------------------

class TestClassifyToolRunCommandMulti:
    def test_safe_multi(self):
        a = classify_tool("run_command_multi", {"command": "uptime", "hosts": ["web1", "web2"]})
        assert a.level == RiskLevel.MEDIUM
        assert "multi-host" in a.reason

    def test_dangerous_multi(self):
        a = classify_tool("run_command_multi", {"command": "rm -rf /tmp/old", "hosts": ["all"]})
        assert a.level == RiskLevel.HIGH

    def test_critical_multi(self):
        a = classify_tool("run_command_multi", {"command": "reboot", "hosts": ["all"]})
        assert a.level == RiskLevel.CRITICAL


# ---------------------------------------------------------------------------
# classify_tool — run_script
# ---------------------------------------------------------------------------

class TestClassifyToolRunScript:
    def test_baseline_high(self):
        a = classify_tool("run_script", {"script": "echo hello", "host": "web1"})
        assert a.level == RiskLevel.HIGH

    def test_critical_script(self):
        a = classify_tool("run_script", {"script": "mkfs.ext4 /dev/sda", "host": "web1"})
        assert a.level == RiskLevel.CRITICAL

    def test_empty_script(self):
        a = classify_tool("run_script", {"script": "", "host": "web1"})
        assert a.level == RiskLevel.HIGH


# ---------------------------------------------------------------------------
# classify_tool — static map
# ---------------------------------------------------------------------------

class TestClassifyToolStatic:
    def test_read_file_low(self):
        a = classify_tool("read_file", {"host": "web1", "path": "/etc/config"})
        assert a.level == RiskLevel.LOW

    def test_write_file_medium(self):
        a = classify_tool("write_file", {"host": "web1", "path": "/tmp/f", "content": "x"})
        assert a.level == RiskLevel.MEDIUM

    def test_claude_code_high(self):
        a = classify_tool("claude_code", {"prompt": "fix bug", "working_directory": "/app"})
        assert a.level == RiskLevel.HIGH

    def test_search_knowledge_low(self):
        a = classify_tool("search_knowledge", {"query": "nginx config"})
        assert a.level == RiskLevel.LOW

    def test_unknown_tool_low(self):
        a = classify_tool("unknown_tool_xyz", {})
        assert a.level == RiskLevel.LOW

    def test_none_input(self):
        a = classify_tool("read_file")
        assert a.level == RiskLevel.LOW

    def test_manage_process_medium(self):
        a = classify_tool("manage_process", {"action": "start", "command": "sleep 10"})
        assert a.level == RiskLevel.MEDIUM

    def test_browser_read_page_low(self):
        a = classify_tool("browser_read_page", {"url": "https://example.com"})
        assert a.level == RiskLevel.LOW

    def test_browser_click_medium(self):
        a = classify_tool("browser_click", {"selector": "#btn"})
        assert a.level == RiskLevel.MEDIUM

    def test_generate_image_medium(self):
        a = classify_tool("generate_image", {"prompt": "a cat"})
        assert a.level == RiskLevel.MEDIUM

    def test_reason_includes_tool_name(self):
        a = classify_tool("web_search", {"query": "test"})
        assert "web_search" in a.reason


# ---------------------------------------------------------------------------
# _TOOL_RISK_MAP
# ---------------------------------------------------------------------------

class TestToolRiskMap:
    def test_all_entries_are_risk_levels(self):
        for tool, level in _TOOL_RISK_MAP.items():
            assert isinstance(level, RiskLevel), f"{tool} has non-RiskLevel value"

    def test_read_tools_are_low(self):
        read_tools = ["read_file", "search_knowledge", "web_search", "fetch_url"]
        for tool in read_tools:
            assert _TOOL_RISK_MAP[tool] == RiskLevel.LOW

    def test_execution_tools_are_high(self):
        exec_tools = ["run_script", "claude_code"]
        for tool in exec_tools:
            assert _TOOL_RISK_MAP[tool] == RiskLevel.HIGH


# ---------------------------------------------------------------------------
# Pattern lists
# ---------------------------------------------------------------------------

class TestPatternLists:
    def test_critical_patterns_not_empty(self):
        assert len(_CRITICAL_PATTERNS) > 0

    def test_high_patterns_not_empty(self):
        assert len(_HIGH_PATTERNS) > 0

    def test_medium_patterns_not_empty(self):
        assert len(_MEDIUM_PATTERNS) > 0

    def test_all_patterns_are_tuples(self):
        for p in _CRITICAL_PATTERNS + _HIGH_PATTERNS + _MEDIUM_PATTERNS:
            assert len(p) == 2
            assert hasattr(p[0], "search")
            assert isinstance(p[1], str)


# ---------------------------------------------------------------------------
# RiskStats
# ---------------------------------------------------------------------------

class TestRiskStats:
    def test_empty_summary(self):
        stats = RiskStats()
        s = stats.get_summary()
        assert s["totals"] == {}
        assert s["by_tool"] == {}

    def test_record_updates_totals(self):
        stats = RiskStats()
        stats.record("run_command", RiskAssessment(RiskLevel.HIGH, "rm -rf"))
        s = stats.get_summary()
        assert s["totals"]["high"] == 1

    def test_record_updates_by_tool(self):
        stats = RiskStats()
        stats.record("run_command", RiskAssessment(RiskLevel.LOW, "ls"))
        stats.record("run_command", RiskAssessment(RiskLevel.HIGH, "rm"))
        s = stats.get_summary()
        assert s["by_tool"]["run_command"]["low"] == 1
        assert s["by_tool"]["run_command"]["high"] == 1

    def test_get_recent(self):
        stats = RiskStats()
        stats.record("tool_a", RiskAssessment(RiskLevel.LOW, "safe"))
        stats.record("tool_b", RiskAssessment(RiskLevel.HIGH, "risky"))
        recent = stats.get_recent(10)
        assert len(recent) == 2
        assert recent[0]["tool_name"] == "tool_a"
        assert recent[1]["risk_level"] == "high"

    def test_recent_limit(self):
        stats = RiskStats()
        for i in range(10):
            stats.record(f"tool_{i}", RiskAssessment(RiskLevel.LOW, "test"))
        recent = stats.get_recent(3)
        assert len(recent) == 3

    def test_recent_max_cap(self):
        stats = RiskStats()
        stats._max_recent = 5
        for i in range(10):
            stats.record(f"tool_{i}", RiskAssessment(RiskLevel.LOW, "test"))
        assert len(stats._recent) == 5

    def test_reset(self):
        stats = RiskStats()
        stats.record("t", RiskAssessment(RiskLevel.LOW, "test"))
        stats.reset()
        assert stats.get_summary()["totals"] == {}
        assert stats.get_recent() == []

    def test_multiple_tools(self):
        stats = RiskStats()
        stats.record("tool_a", RiskAssessment(RiskLevel.LOW, "safe"))
        stats.record("tool_b", RiskAssessment(RiskLevel.HIGH, "risky"))
        stats.record("tool_a", RiskAssessment(RiskLevel.MEDIUM, "mod"))
        s = stats.get_summary()
        assert "tool_a" in s["by_tool"]
        assert "tool_b" in s["by_tool"]
        assert s["totals"]["low"] == 1
        assert s["totals"]["medium"] == 1
        assert s["totals"]["high"] == 1


# ---------------------------------------------------------------------------
# ToolExecutor integration
# ---------------------------------------------------------------------------

class TestToolExecutorIntegration:
    def test_executor_has_risk_stats(self):
        from src.tools.executor import ToolExecutor
        ex = ToolExecutor()
        assert isinstance(ex.risk_stats, RiskStats)

    @pytest.mark.asyncio
    async def test_execute_records_risk(self):
        from src.tools.executor import ToolExecutor
        ex = ToolExecutor()
        ex._handle_test_tool = AsyncMock(return_value="ok")
        # Monkey-patch a handler
        import types
        ex._handle_test_tool = types.MethodType(
            lambda self, inp: asyncio.coroutine(lambda: "ok")(),  # noqa
            ex,
        )
        # Use a real handler — read_file requires a host
        with patch("src.tools.executor.run_local_command", new_callable=AsyncMock) as mock_cmd:
            mock_cmd.return_value = (0, "file content")
            from src.config.schema import ToolsConfig, ToolHost
            config = ToolsConfig(hosts={"local": ToolHost(address="127.0.0.1")})
            ex2 = ToolExecutor(config=config)
            result = await ex2.execute("read_file", {"host": "local", "path": "/tmp/test"})
            assert ex2._last_risk_assessment is not None
            assert ex2._last_risk_assessment.level == RiskLevel.LOW

    @pytest.mark.asyncio
    async def test_execute_classifies_dangerous_command(self):
        from src.tools.executor import ToolExecutor
        from src.config.schema import ToolsConfig, ToolHost
        config = ToolsConfig(hosts={"local": ToolHost(address="127.0.0.1")})
        ex = ToolExecutor(config=config)
        with patch("src.tools.executor.run_local_command", new_callable=AsyncMock) as mock_cmd:
            mock_cmd.return_value = (0, "deleted")
            await ex.execute("run_command", {"host": "local", "command": "rm -rf /tmp/old"})
            assert ex._last_risk_assessment.level == RiskLevel.HIGH
            summary = ex.risk_stats.get_summary()
            assert summary["totals"].get("high", 0) >= 1

    def test_classify_tool_import(self):
        from src.tools.executor import classify_tool as ct
        assert ct is classify_tool


# ---------------------------------------------------------------------------
# AuditLogger risk fields
# ---------------------------------------------------------------------------

class TestAuditLoggerRiskFields:
    @pytest.mark.asyncio
    async def test_log_execution_with_risk(self, tmp_path):
        from src.audit.logger import AuditLogger
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            user_id="u1", user_name="TestUser", channel_id="c1",
            tool_name="run_command", tool_input={"command": "rm -rf /tmp"},
            approved=True, result_summary="ok", execution_time_ms=100,
            risk_level="high", risk_reason="recursive delete",
        )
        content = (tmp_path / "audit.jsonl").read_text()
        entry = json.loads(content.strip())
        assert entry["risk_level"] == "high"
        assert entry["risk_reason"] == "recursive delete"

    @pytest.mark.asyncio
    async def test_log_execution_without_risk(self, tmp_path):
        from src.audit.logger import AuditLogger
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            user_id="u1", user_name="TestUser", channel_id="c1",
            tool_name="read_file", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=50,
        )
        content = (tmp_path / "audit.jsonl").read_text()
        entry = json.loads(content.strip())
        assert "risk_level" not in entry
        assert "risk_reason" not in entry

    @pytest.mark.asyncio
    async def test_log_execution_none_risk_omitted(self, tmp_path):
        from src.audit.logger import AuditLogger
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            user_id="u1", user_name="TestUser", channel_id="c1",
            tool_name="read_file", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=50,
            risk_level=None, risk_reason=None,
        )
        content = (tmp_path / "audit.jsonl").read_text()
        entry = json.loads(content.strip())
        assert "risk_level" not in entry

    @pytest.mark.asyncio
    async def test_log_execution_empty_risk_omitted(self, tmp_path):
        from src.audit.logger import AuditLogger
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            user_id="u1", user_name="TestUser", channel_id="c1",
            tool_name="read_file", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=50,
            risk_level="", risk_reason="",
        )
        content = (tmp_path / "audit.jsonl").read_text()
        entry = json.loads(content.strip())
        assert "risk_level" not in entry


# ---------------------------------------------------------------------------
# AuditLogger search_by_risk
# ---------------------------------------------------------------------------

class TestSearchByRisk:
    @pytest.mark.asyncio
    async def test_search_returns_risk_entries(self, tmp_path):
        from src.audit.logger import AuditLogger
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            user_id="u1", user_name="User1", channel_id="c1",
            tool_name="read_file", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=50,
        )
        await logger.log_execution(
            user_id="u1", user_name="User1", channel_id="c1",
            tool_name="run_command", tool_input={"command": "rm -rf"},
            approved=True, result_summary="ok", execution_time_ms=100,
            risk_level="high", risk_reason="recursive delete",
        )
        results = await logger.search_by_risk()
        assert len(results) == 1
        assert results[0]["risk_level"] == "high"

    @pytest.mark.asyncio
    async def test_filter_by_level(self, tmp_path):
        from src.audit.logger import AuditLogger
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            user_id="u1", user_name="User1", channel_id="c1",
            tool_name="t1", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=50,
            risk_level="low", risk_reason="safe",
        )
        await logger.log_execution(
            user_id="u1", user_name="User1", channel_id="c1",
            tool_name="t2", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=50,
            risk_level="high", risk_reason="dangerous",
        )
        results = await logger.search_by_risk(risk_level="high")
        assert len(results) == 1
        assert results[0]["tool_name"] == "t2"

    @pytest.mark.asyncio
    async def test_filter_by_tool(self, tmp_path):
        from src.audit.logger import AuditLogger
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            user_id="u1", user_name="User1", channel_id="c1",
            tool_name="run_command", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=50,
            risk_level="high", risk_reason="rm",
        )
        await logger.log_execution(
            user_id="u1", user_name="User1", channel_id="c1",
            tool_name="run_script", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=50,
            risk_level="high", risk_reason="script",
        )
        results = await logger.search_by_risk(tool_name="run_command")
        assert len(results) == 1
        assert results[0]["tool_name"] == "run_command"

    @pytest.mark.asyncio
    async def test_limit(self, tmp_path):
        from src.audit.logger import AuditLogger
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        for i in range(5):
            await logger.log_execution(
                user_id="u1", user_name="User1", channel_id="c1",
                tool_name=f"t{i}", tool_input={},
                approved=True, result_summary="ok", execution_time_ms=50,
                risk_level="medium", risk_reason="test",
            )
        results = await logger.search_by_risk(limit=2)
        assert len(results) == 2

    @pytest.mark.asyncio
    async def test_empty_log(self, tmp_path):
        from src.audit.logger import AuditLogger
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        results = await logger.search_by_risk()
        assert results == []

    @pytest.mark.asyncio
    async def test_nonexistent_file(self, tmp_path):
        from src.audit.logger import AuditLogger
        logger = AuditLogger(path=str(tmp_path / "nonexistent.jsonl"))
        results = await logger.search_by_risk()
        assert results == []

    @pytest.mark.asyncio
    async def test_most_recent_first(self, tmp_path):
        from src.audit.logger import AuditLogger
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            user_id="u1", user_name="User1", channel_id="c1",
            tool_name="first", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=50,
            risk_level="low", risk_reason="a",
        )
        await logger.log_execution(
            user_id="u1", user_name="User1", channel_id="c1",
            tool_name="second", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=50,
            risk_level="high", risk_reason="b",
        )
        results = await logger.search_by_risk()
        assert results[0]["tool_name"] == "second"


# ---------------------------------------------------------------------------
# Background task integration
# ---------------------------------------------------------------------------

class TestBackgroundTaskIntegration:
    def test_classify_tool_importable_from_background_task(self):
        from src.discord.background_task import classify_tool as bt_ct
        assert bt_ct is classify_tool

    def test_risk_assessment_has_level_and_reason(self):
        a = classify_tool("run_command", {"command": "ls"})
        assert hasattr(a, "level")
        assert hasattr(a, "reason")
        assert a.level.value in ("low", "medium", "high", "critical")


# ---------------------------------------------------------------------------
# Module imports
# ---------------------------------------------------------------------------

class TestModuleImports:
    def test_risk_classifier_module(self):
        import src.tools.risk_classifier
        assert hasattr(src.tools.risk_classifier, "classify_command")
        assert hasattr(src.tools.risk_classifier, "classify_tool")
        assert hasattr(src.tools.risk_classifier, "RiskLevel")
        assert hasattr(src.tools.risk_classifier, "RiskAssessment")
        assert hasattr(src.tools.risk_classifier, "RiskStats")

    def test_executor_imports_risk(self):
        from src.tools.executor import classify_tool
        assert callable(classify_tool)

    def test_background_task_imports_risk(self):
        from src.discord.background_task import classify_tool
        assert callable(classify_tool)


# ---------------------------------------------------------------------------
# REST API endpoints
# ---------------------------------------------------------------------------

class TestRiskAPI:
    @pytest.fixture
    def mock_bot(self):
        bot = MagicMock()
        bot.tool_executor = MagicMock()
        bot.tool_executor.risk_stats = RiskStats()
        bot.audit = MagicMock()
        return bot

    @pytest.mark.asyncio
    async def test_risk_stats_endpoint(self, mock_bot):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        mock_bot.audit.search_by_risk = AsyncMock(return_value=[])
        mock_bot.tool_executor.risk_stats.record(
            "run_command", RiskAssessment(RiskLevel.HIGH, "rm -rf"),
        )

        app = web.Application()
        routes = create_api_routes(mock_bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/risk/stats")
            assert resp.status == 200
            data = await resp.json()
            assert "totals" in data
            assert data["totals"]["high"] == 1

    @pytest.mark.asyncio
    async def test_risk_recent_endpoint(self, mock_bot):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        mock_bot.audit.search_by_risk = AsyncMock(return_value=[])
        mock_bot.tool_executor.risk_stats.record(
            "run_command", RiskAssessment(RiskLevel.LOW, "ls"),
        )

        app = web.Application()
        routes = create_api_routes(mock_bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/risk/recent?limit=5")
            assert resp.status == 200
            data = await resp.json()
            assert "entries" in data
            assert len(data["entries"]) == 1

    @pytest.mark.asyncio
    async def test_risk_recent_invalid_limit(self, mock_bot):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        mock_bot.audit.search_by_risk = AsyncMock(return_value=[])

        app = web.Application()
        routes = create_api_routes(mock_bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/risk/recent?limit=abc")
            assert resp.status == 400

    @pytest.mark.asyncio
    async def test_audit_by_risk_endpoint(self, mock_bot):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        mock_bot.audit.search_by_risk = AsyncMock(return_value=[
            {"tool_name": "run_command", "risk_level": "high", "risk_reason": "rm"},
        ])

        app = web.Application()
        routes = create_api_routes(mock_bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/audit/risk?level=high")
            assert resp.status == 200
            data = await resp.json()
            assert data["count"] == 1

    @pytest.mark.asyncio
    async def test_audit_by_risk_invalid_limit(self, mock_bot):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        mock_bot.audit.search_by_risk = AsyncMock(return_value=[])

        app = web.Application()
        routes = create_api_routes(mock_bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/audit/risk?limit=bad")
            assert resp.status == 400

    @pytest.mark.asyncio
    async def test_risk_stats_no_executor(self):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        bot = MagicMock(spec=[])
        bot.audit = MagicMock()
        bot.audit.search_by_risk = AsyncMock(return_value=[])

        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/risk/stats")
            assert resp.status == 503


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_command_with_pipes(self):
        a = classify_command("cat /etc/hosts | grep localhost | head -1")
        assert a.level == RiskLevel.LOW

    def test_command_with_semicolons(self):
        a = classify_command("echo hello; rm -rf /tmp/old")
        assert a.level == RiskLevel.HIGH

    def test_command_with_ampersand(self):
        a = classify_command("rm -rf /tmp/old &")
        assert a.level == RiskLevel.HIGH

    def test_sudo_prefix(self):
        a = classify_command("sudo systemctl stop nginx")
        assert a.level == RiskLevel.HIGH

    def test_multiline_command(self):
        a = classify_command("ls -la\nrm -rf /tmp/old")
        assert a.level == RiskLevel.HIGH

    def test_case_insensitive_sql(self):
        a = classify_command("drop database test")
        assert a.level == RiskLevel.CRITICAL

    def test_case_insensitive_sql_mixed(self):
        a = classify_command("Drop Table users")
        assert a.level == RiskLevel.CRITICAL

    def test_very_long_command(self):
        cmd = "echo " + "x" * 10000
        a = classify_command(cmd)
        assert a.level == RiskLevel.LOW

    def test_unicode_command(self):
        a = classify_command("echo '日本語テスト'")
        assert a.level == RiskLevel.LOW

    def test_nested_quotes(self):
        a = classify_command("bash -c 'rm -rf /tmp/old'")
        assert a.level == RiskLevel.HIGH

    def test_risk_assessment_is_immutable(self):
        a = classify_command("ls")
        assert isinstance(a, tuple)

    def test_multiple_dangerous_patterns(self):
        # Contains both systemctl stop and rm -rf — should return highest match
        a = classify_command("systemctl stop nginx && rm -rf /tmp/old")
        assert a.level == RiskLevel.HIGH

    def test_dnf_remove(self):
        a = classify_command("dnf remove httpd")
        assert a.level == RiskLevel.HIGH

    def test_docker_kill(self):
        a = classify_command("docker kill mycontainer")
        assert a.level == RiskLevel.HIGH

    def test_groupdel(self):
        a = classify_command("groupdel oldgroup")
        assert a.level == RiskLevel.HIGH

    def test_docker_compose_up(self):
        a = classify_command("docker-compose up -d")
        assert a.level == RiskLevel.MEDIUM

    def test_wget_pipe_sh(self):
        a = classify_command("wget -O- https://example.com/setup.sh | sh")
        assert a.level == RiskLevel.MEDIUM

    def test_git_merge(self):
        a = classify_command("git merge feature")
        assert a.level == RiskLevel.MEDIUM

    def test_git_rebase(self):
        a = classify_command("git rebase main")
        assert a.level == RiskLevel.MEDIUM


# ---------------------------------------------------------------------------
# Signing compatibility — risk fields included in HMAC
# ---------------------------------------------------------------------------

class TestSigningCompatibility:
    @pytest.mark.asyncio
    async def test_risk_fields_in_signed_entry(self, tmp_path):
        from src.audit.logger import AuditLogger
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"), hmac_key="testkey")
        await logger.log_execution(
            user_id="u1", user_name="User1", channel_id="c1",
            tool_name="run_command", tool_input={"command": "rm -rf"},
            approved=True, result_summary="ok", execution_time_ms=100,
            risk_level="high", risk_reason="recursive delete",
        )
        content = (tmp_path / "audit.jsonl").read_text()
        entry = json.loads(content.strip())
        assert entry["risk_level"] == "high"
        assert entry["risk_reason"] == "recursive delete"
        assert "_hmac" in entry
        assert "_prev_hmac" in entry

    @pytest.mark.asyncio
    async def test_signed_risk_log_verifiable(self, tmp_path):
        from src.audit.logger import AuditLogger
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"), hmac_key="testkey")
        await logger.log_execution(
            user_id="u1", user_name="User1", channel_id="c1",
            tool_name="run_command", tool_input={"command": "rm"},
            approved=True, result_summary="ok", execution_time_ms=100,
            risk_level="high", risk_reason="rm",
        )
        await logger.log_execution(
            user_id="u1", user_name="User1", channel_id="c1",
            tool_name="read_file", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=50,
        )
        result = await logger.verify_integrity()
        assert result["valid"] is True
        assert result["verified"] == 2


import asyncio
