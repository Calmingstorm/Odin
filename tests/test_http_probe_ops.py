"""Tests for the http_probe tool — command builder, registry, and executor handler."""

from __future__ import annotations

import pytest

from src.tools.http_probe_ops import (
    ALLOWED_METHODS,
    MAX_TIMEOUT,
    DEFAULT_TIMEOUT,
    MAX_RETRIES,
    DEFAULT_RETRIES,
    MAX_RETRY_DELAY,
    DEFAULT_RETRY_DELAY,
    MAX_BODY_SIZE,
    build_http_probe_command,
    validate_url,
    _clamp_int,
)


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

class TestHttpProbeRegistration:
    def test_tool_in_registry(self):
        from src.tools.registry import TOOLS
        names = [t["name"] for t in TOOLS]
        assert "http_probe" in names

    def test_required_fields(self):
        from src.tools.registry import TOOLS
        tool = next(t for t in TOOLS if t["name"] == "http_probe")
        assert "description" in tool
        assert "input_schema" in tool
        assert tool["input_schema"]["required"] == ["url"]

    def test_has_all_properties(self):
        from src.tools.registry import TOOLS
        tool = next(t for t in TOOLS if t["name"] == "http_probe")
        props = tool["input_schema"]["properties"]
        expected = {"url", "host", "method", "headers", "body", "timeout",
                    "follow_redirects", "verify_ssl", "retries", "retry_delay"}
        assert set(props.keys()) == expected

    def test_method_enum_matches_allowed(self):
        from src.tools.registry import TOOLS
        tool = next(t for t in TOOLS if t["name"] == "http_probe")
        enum_vals = set(tool["input_schema"]["properties"]["method"]["enum"])
        assert enum_vals == ALLOWED_METHODS


# ---------------------------------------------------------------------------
# Allowed methods
# ---------------------------------------------------------------------------

class TestAllowedMethods:
    def test_all_expected(self):
        expected = {"GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"}
        assert ALLOWED_METHODS == expected

    def test_frozenset_immutable(self):
        assert isinstance(ALLOWED_METHODS, frozenset)

    def test_unknown_method_raises(self):
        with pytest.raises(ValueError, match="Invalid HTTP method"):
            build_http_probe_command({"url": "https://example.com", "method": "TRACE"})


# ---------------------------------------------------------------------------
# URL validation
# ---------------------------------------------------------------------------

class TestValidateUrl:
    def test_valid_https(self):
        assert validate_url("https://example.com") == "https://example.com"

    def test_valid_http(self):
        assert validate_url("http://example.com") == "http://example.com"

    def test_valid_with_path(self):
        assert validate_url("https://api.example.com/v1/users") == "https://api.example.com/v1/users"

    def test_valid_with_port(self):
        assert validate_url("http://localhost:8080/health") == "http://localhost:8080/health"

    def test_valid_with_query(self):
        url = "https://api.example.com/search?q=test&page=1"
        assert validate_url(url) == url

    def test_empty_raises(self):
        with pytest.raises(ValueError, match="URL is required"):
            validate_url("")

    def test_none_raises(self):
        with pytest.raises(ValueError, match="URL is required"):
            validate_url("")

    def test_whitespace_only_raises(self):
        with pytest.raises(ValueError, match="URL is required"):
            validate_url("   ")

    def test_ftp_scheme_raises(self):
        with pytest.raises(ValueError, match="Invalid URL scheme"):
            validate_url("ftp://files.example.com/file.txt")

    def test_no_scheme_raises(self):
        with pytest.raises(ValueError, match="Invalid URL scheme"):
            validate_url("example.com/api")

    def test_no_host_raises(self):
        with pytest.raises(ValueError, match="must include a host"):
            validate_url("http://")

    def test_strips_whitespace(self):
        assert validate_url("  https://example.com  ") == "https://example.com"


# ---------------------------------------------------------------------------
# _clamp_int
# ---------------------------------------------------------------------------

class TestClampInt:
    def test_normal_value(self):
        assert _clamp_int(5, 10, 1, 20) == 5

    def test_below_minimum(self):
        assert _clamp_int(-1, 10, 0, 20) == 0

    def test_above_maximum(self):
        assert _clamp_int(100, 10, 0, 20) == 20

    def test_none_returns_default(self):
        assert _clamp_int(None, 10, 0, 20) == 10

    def test_invalid_string_returns_default(self):
        assert _clamp_int("abc", 10, 0, 20) == 10

    def test_valid_string_number(self):
        assert _clamp_int("5", 10, 0, 20) == 5

    def test_float_truncated(self):
        assert _clamp_int(5.9, 10, 0, 20) == 5


# ---------------------------------------------------------------------------
# Basic command building
# ---------------------------------------------------------------------------

class TestBuildBasic:
    def test_minimal_get(self):
        cmd = build_http_probe_command({"url": "https://example.com"})
        assert cmd.startswith("curl -sS")
        assert "https://example.com" in cmd
        assert "-i" in cmd

    def test_starts_with_curl(self):
        cmd = build_http_probe_command({"url": "https://example.com"})
        assert cmd.startswith("curl")

    def test_includes_timing_format(self):
        cmd = build_http_probe_command({"url": "https://example.com"})
        assert "PROBE-RESULTS" in cmd
        assert "status_code" in cmd
        assert "time_total" in cmd

    def test_includes_response_headers(self):
        cmd = build_http_probe_command({"url": "https://example.com"})
        assert "-i" in cmd

    def test_default_follow_redirects(self):
        cmd = build_http_probe_command({"url": "https://example.com"})
        assert "-L" in cmd
        assert "--max-redirs 10" in cmd

    def test_default_timeout(self):
        cmd = build_http_probe_command({"url": "https://example.com"})
        assert f"--max-time {DEFAULT_TIMEOUT}" in cmd

    def test_default_connect_timeout(self):
        cmd = build_http_probe_command({"url": "https://example.com"})
        assert "--connect-timeout 10" in cmd

    def test_url_always_last(self):
        cmd = build_http_probe_command({"url": "https://example.com"})
        assert cmd.rstrip().endswith("https://example.com")

    def test_no_method_flag_for_get(self):
        cmd = build_http_probe_command({"url": "https://example.com"})
        assert "-X" not in cmd

    def test_url_required(self):
        with pytest.raises(ValueError, match="URL is required"):
            build_http_probe_command({})

    def test_empty_url_raises(self):
        with pytest.raises(ValueError, match="URL is required"):
            build_http_probe_command({"url": ""})


# ---------------------------------------------------------------------------
# HTTP methods
# ---------------------------------------------------------------------------

class TestBuildMethods:
    def test_get_no_flag(self):
        cmd = build_http_probe_command({"url": "https://example.com", "method": "GET"})
        assert "-X" not in cmd

    def test_post(self):
        cmd = build_http_probe_command({"url": "https://example.com", "method": "POST"})
        assert "-X POST" in cmd

    def test_put(self):
        cmd = build_http_probe_command({"url": "https://example.com", "method": "PUT"})
        assert "-X PUT" in cmd

    def test_delete(self):
        cmd = build_http_probe_command({"url": "https://example.com", "method": "DELETE"})
        assert "-X DELETE" in cmd

    def test_patch(self):
        cmd = build_http_probe_command({"url": "https://example.com", "method": "PATCH"})
        assert "-X PATCH" in cmd

    def test_head(self):
        cmd = build_http_probe_command({"url": "https://example.com", "method": "HEAD"})
        assert "-X HEAD" in cmd

    def test_options(self):
        cmd = build_http_probe_command({"url": "https://example.com", "method": "OPTIONS"})
        assert "-X OPTIONS" in cmd

    def test_lowercase_normalized(self):
        cmd = build_http_probe_command({"url": "https://example.com", "method": "post"})
        assert "-X POST" in cmd

    def test_invalid_method_raises(self):
        with pytest.raises(ValueError, match="Invalid HTTP method"):
            build_http_probe_command({"url": "https://example.com", "method": "CONNECT"})


# ---------------------------------------------------------------------------
# Headers
# ---------------------------------------------------------------------------

class TestBuildHeaders:
    def test_single_header(self):
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "headers": {"Content-Type": "application/json"},
        })
        assert "-H 'Content-Type: application/json'" in cmd

    def test_multiple_headers(self):
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "headers": {
                "Authorization": "Bearer tok123",
                "Accept": "application/json",
            },
        })
        assert "-H 'Authorization: Bearer tok123'" in cmd
        assert "-H 'Accept: application/json'" in cmd

    def test_no_headers(self):
        cmd = build_http_probe_command({"url": "https://example.com"})
        assert "-H" not in cmd

    def test_non_dict_headers_ignored(self):
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "headers": "Content-Type: text/plain",
        })
        assert "-H" not in cmd

    def test_empty_headers_dict(self):
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "headers": {},
        })
        assert "-H" not in cmd


# ---------------------------------------------------------------------------
# Body
# ---------------------------------------------------------------------------

class TestBuildBody:
    def test_post_with_body(self):
        cmd = build_http_probe_command({
            "url": "https://example.com/api",
            "method": "POST",
            "body": '{"key": "value"}',
        })
        assert "-d" in cmd
        assert "key" in cmd

    def test_put_with_body(self):
        cmd = build_http_probe_command({
            "url": "https://example.com/api",
            "method": "PUT",
            "body": "data",
        })
        assert "-d" in cmd

    def test_patch_with_body(self):
        cmd = build_http_probe_command({
            "url": "https://example.com/api",
            "method": "PATCH",
            "body": "update",
        })
        assert "-d" in cmd

    def test_get_body_ignored(self):
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "method": "GET",
            "body": "should not appear",
        })
        assert "-d" not in cmd

    def test_delete_body_ignored(self):
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "method": "DELETE",
            "body": "should not appear",
        })
        assert "-d" not in cmd

    def test_head_body_ignored(self):
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "method": "HEAD",
            "body": "should not appear",
        })
        assert "-d" not in cmd

    def test_empty_body_not_added(self):
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "method": "POST",
            "body": "",
        })
        assert "-d" not in cmd

    def test_none_body_not_added(self):
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "method": "POST",
        })
        assert "-d" not in cmd

    def test_oversized_body_ignored(self):
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "method": "POST",
            "body": "x" * (MAX_BODY_SIZE + 1),
        })
        assert "-d" not in cmd

    def test_body_at_limit_included(self):
        body = "x" * MAX_BODY_SIZE
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "method": "POST",
            "body": body,
        })
        assert "-d" in cmd


# ---------------------------------------------------------------------------
# Timeout
# ---------------------------------------------------------------------------

class TestBuildTimeout:
    def test_default_timeout(self):
        cmd = build_http_probe_command({"url": "https://example.com"})
        assert f"--max-time {DEFAULT_TIMEOUT}" in cmd

    def test_custom_timeout(self):
        cmd = build_http_probe_command({"url": "https://example.com", "timeout": 60})
        assert "--max-time 60" in cmd

    def test_timeout_capped_at_max(self):
        cmd = build_http_probe_command({"url": "https://example.com", "timeout": 999})
        assert f"--max-time {MAX_TIMEOUT}" in cmd

    def test_timeout_minimum_one(self):
        cmd = build_http_probe_command({"url": "https://example.com", "timeout": 0})
        assert "--max-time 1" in cmd

    def test_invalid_timeout_uses_default(self):
        cmd = build_http_probe_command({"url": "https://example.com", "timeout": "abc"})
        assert f"--max-time {DEFAULT_TIMEOUT}" in cmd

    def test_connect_timeout_max_10(self):
        cmd = build_http_probe_command({"url": "https://example.com", "timeout": 60})
        assert "--connect-timeout 10" in cmd

    def test_connect_timeout_follows_main_when_small(self):
        cmd = build_http_probe_command({"url": "https://example.com", "timeout": 5})
        assert "--connect-timeout 5" in cmd


# ---------------------------------------------------------------------------
# Redirects
# ---------------------------------------------------------------------------

class TestBuildRedirects:
    def test_follow_redirects_default_true(self):
        cmd = build_http_probe_command({"url": "https://example.com"})
        assert "-L" in cmd

    def test_follow_redirects_true(self):
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "follow_redirects": True,
        })
        assert "-L" in cmd
        assert "--max-redirs 10" in cmd

    def test_follow_redirects_false(self):
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "follow_redirects": False,
        })
        assert "-L" not in cmd
        assert "--max-redirs" not in cmd


# ---------------------------------------------------------------------------
# SSL
# ---------------------------------------------------------------------------

class TestBuildSSL:
    def test_verify_ssl_default_true(self):
        cmd = build_http_probe_command({"url": "https://example.com"})
        assert "-k" not in cmd

    def test_verify_ssl_true(self):
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "verify_ssl": True,
        })
        assert "-k" not in cmd

    def test_verify_ssl_false(self):
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "verify_ssl": False,
        })
        assert "-k" in cmd


# ---------------------------------------------------------------------------
# Retries
# ---------------------------------------------------------------------------

class TestBuildRetries:
    def test_no_retries_default(self):
        cmd = build_http_probe_command({"url": "https://example.com"})
        assert "--retry" not in cmd

    def test_zero_retries(self):
        cmd = build_http_probe_command({"url": "https://example.com", "retries": 0})
        assert "--retry" not in cmd

    def test_retries_with_count(self):
        cmd = build_http_probe_command({"url": "https://example.com", "retries": 3})
        assert "--retry 3" in cmd

    def test_retries_capped_at_max(self):
        cmd = build_http_probe_command({"url": "https://example.com", "retries": 20})
        assert f"--retry {MAX_RETRIES}" in cmd

    def test_retry_delay_default(self):
        cmd = build_http_probe_command({"url": "https://example.com", "retries": 2})
        assert f"--retry-delay {DEFAULT_RETRY_DELAY}" in cmd

    def test_retry_delay_custom(self):
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "retries": 2,
            "retry_delay": 5,
        })
        assert "--retry-delay 5" in cmd

    def test_retry_delay_capped(self):
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "retries": 2,
            "retry_delay": 99,
        })
        assert f"--retry-delay {MAX_RETRY_DELAY}" in cmd

    def test_retry_delay_minimum_zero(self):
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "retries": 2,
            "retry_delay": -5,
        })
        assert "--retry-delay 0" in cmd

    def test_retry_delay_invalid_uses_default(self):
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "retries": 2,
            "retry_delay": "abc",
        })
        assert f"--retry-delay {DEFAULT_RETRY_DELAY}" in cmd

    def test_retry_delay_without_retries_not_added(self):
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "retry_delay": 5,
        })
        assert "--retry-delay" not in cmd


# ---------------------------------------------------------------------------
# Shell injection safety
# ---------------------------------------------------------------------------

class TestShellInjectionSafety:
    def test_url_with_semicolon(self):
        cmd = build_http_probe_command({"url": "https://example.com/;rm -rf /"})
        assert "rm -rf" not in cmd or "'" in cmd

    def test_url_with_command_substitution(self):
        cmd = build_http_probe_command({"url": "https://example.com/$(whoami)"})
        assert cmd.count("'") >= 2

    def test_header_value_injection(self):
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "headers": {"X-Evil": "value'; rm -rf /; echo '"},
        })
        assert "rm -rf" in cmd  # present in quoted string
        parts = cmd.split("'")
        # URL and header values are quoted
        assert any("rm -rf" in p for p in parts)

    def test_body_injection(self):
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "method": "POST",
            "body": "'; rm -rf /; echo '",
        })
        assert "-d" in cmd
        # body is shell-quoted
        assert "rm -rf" in cmd

    def test_url_with_backticks(self):
        cmd = build_http_probe_command({"url": "https://example.com/`whoami`"})
        assert cmd.count("'") >= 2

    def test_header_name_injection(self):
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "headers": {"X-Evil\nHost": "evil.com"},
        })
        # Header is quoted, preventing newline injection
        assert "-H" in cmd


# ---------------------------------------------------------------------------
# Full options combined
# ---------------------------------------------------------------------------

class TestBuildFullOptions:
    def test_all_options_combined(self):
        cmd = build_http_probe_command({
            "url": "https://api.example.com/v1/users",
            "method": "POST",
            "headers": {
                "Authorization": "Bearer token",
                "Content-Type": "application/json",
            },
            "body": '{"name": "test"}',
            "timeout": 60,
            "follow_redirects": False,
            "verify_ssl": False,
            "retries": 3,
            "retry_delay": 5,
        })
        assert cmd.startswith("curl -sS")
        assert "-X POST" in cmd
        assert "-H 'Authorization: Bearer token'" in cmd
        assert "-H 'Content-Type: application/json'" in cmd
        assert "-d" in cmd
        assert "--max-time 60" in cmd
        assert "-L" not in cmd
        assert "-k" in cmd
        assert "--retry 3" in cmd
        assert "--retry-delay 5" in cmd
        assert cmd.rstrip().endswith("https://api.example.com/v1/users")

    def test_get_with_custom_headers_and_ssl_off(self):
        cmd = build_http_probe_command({
            "url": "https://internal.example.com:8443/health",
            "headers": {"Accept": "text/plain"},
            "verify_ssl": False,
            "timeout": 10,
        })
        assert "-X" not in cmd  # GET doesn't need -X
        assert "-H 'Accept: text/plain'" in cmd
        assert "-k" in cmd
        assert "--max-time 10" in cmd


# ---------------------------------------------------------------------------
# Handler integration tests
# ---------------------------------------------------------------------------

class TestHandleHttpProbe:
    @pytest.fixture
    def executor(self):
        from unittest.mock import AsyncMock, MagicMock
        from src.tools.executor import ToolExecutor

        config = MagicMock()
        config.hosts = {
            "web": MagicMock(address="10.0.0.1", ssh_user="deploy", os="linux"),
        }
        config.tools = MagicMock()
        config.tools.tool_timeouts = {}
        config.tools.tool_timeout_seconds = 300

        exec_inst = ToolExecutor.__new__(ToolExecutor)
        exec_inst.config = config
        exec_inst._metrics = {}
        from src.tools.risk_classifier import RiskStats
        exec_inst.risk_stats = RiskStats()
        exec_inst._exec_command = AsyncMock(return_value=(0, "HTTP/1.1 200 OK\n\nOK"))
        return exec_inst

    @pytest.mark.asyncio
    async def test_local_probe_no_host(self, executor):
        result = await executor._handle_http_probe({
            "url": "https://example.com",
        })
        executor._exec_command.assert_called_once()
        addr = executor._exec_command.call_args[0][0]
        assert addr == "127.0.0.1"

    @pytest.mark.asyncio
    async def test_remote_probe_with_host(self, executor):
        result = await executor._handle_http_probe({
            "url": "https://example.com",
            "host": "web",
        })
        executor._exec_command.assert_called_once()
        addr = executor._exec_command.call_args[0][0]
        assert addr == "10.0.0.1"

    @pytest.mark.asyncio
    async def test_unknown_host(self, executor):
        result = await executor._handle_http_probe({
            "url": "https://example.com",
            "host": "nohost",
        })
        assert "Unknown or disallowed host" in result

    @pytest.mark.asyncio
    async def test_correct_ssh_user(self, executor):
        await executor._handle_http_probe({
            "url": "https://example.com",
            "host": "web",
        })
        ssh_user = executor._exec_command.call_args[0][2]
        assert ssh_user == "deploy"

    @pytest.mark.asyncio
    async def test_local_uses_default_ssh_user(self, executor):
        await executor._handle_http_probe({
            "url": "https://example.com",
        })
        ssh_user = executor._exec_command.call_args[0][2]
        assert ssh_user == "root"

    @pytest.mark.asyncio
    async def test_curl_command_built(self, executor):
        await executor._handle_http_probe({
            "url": "https://example.com",
            "method": "POST",
        })
        cmd = executor._exec_command.call_args[0][1]
        assert cmd.startswith("curl")
        assert "-X POST" in cmd

    @pytest.mark.asyncio
    async def test_validation_error_returned(self, executor):
        result = await executor._handle_http_probe({
            "url": "ftp://example.com",
        })
        assert "http_probe error" in result

    @pytest.mark.asyncio
    async def test_missing_url_error(self, executor):
        result = await executor._handle_http_probe({})
        assert "http_probe error" in result

    @pytest.mark.asyncio
    async def test_command_failure_with_output(self, executor):
        executor._exec_command.return_value = (7, "curl: (7) Failed to connect")
        result = await executor._handle_http_probe({
            "url": "https://example.com",
        })
        assert "Failed to connect" in result

    @pytest.mark.asyncio
    async def test_command_failure_no_output(self, executor):
        executor._exec_command.return_value = (1, "")
        result = await executor._handle_http_probe({
            "url": "https://example.com",
        })
        assert "http_probe failed" in result
        assert "exit 1" in result

    @pytest.mark.asyncio
    async def test_empty_success(self, executor):
        executor._exec_command.return_value = (0, "")
        result = await executor._handle_http_probe({
            "url": "https://example.com",
        })
        assert "no response received" in result

    @pytest.mark.asyncio
    async def test_success_returns_output(self, executor):
        executor._exec_command.return_value = (
            0,
            "HTTP/1.1 200 OK\nContent-Type: text/plain\n\nHello"
        )
        result = await executor._handle_http_probe({
            "url": "https://example.com",
        })
        assert "HTTP/1.1 200 OK" in result
        assert "Hello" in result

    @pytest.mark.asyncio
    async def test_get_dispatch(self, executor):
        await executor._handle_http_probe({
            "url": "https://example.com",
        })
        cmd = executor._exec_command.call_args[0][1]
        assert "curl" in cmd
        assert "-X" not in cmd

    @pytest.mark.asyncio
    async def test_post_with_body_dispatch(self, executor):
        await executor._handle_http_probe({
            "url": "https://api.example.com/data",
            "method": "POST",
            "body": '{"key": "val"}',
            "headers": {"Content-Type": "application/json"},
        })
        cmd = executor._exec_command.call_args[0][1]
        assert "-X POST" in cmd
        assert "-d" in cmd
        assert "-H" in cmd

    @pytest.mark.asyncio
    async def test_retries_dispatch(self, executor):
        await executor._handle_http_probe({
            "url": "https://example.com",
            "retries": 3,
            "retry_delay": 2,
        })
        cmd = executor._exec_command.call_args[0][1]
        assert "--retry 3" in cmd
        assert "--retry-delay 2" in cmd

    @pytest.mark.asyncio
    async def test_ssl_off_dispatch(self, executor):
        await executor._handle_http_probe({
            "url": "https://self-signed.example.com",
            "verify_ssl": False,
        })
        cmd = executor._exec_command.call_args[0][1]
        assert "-k" in cmd

    @pytest.mark.asyncio
    async def test_no_redirects_dispatch(self, executor):
        await executor._handle_http_probe({
            "url": "https://example.com",
            "follow_redirects": False,
        })
        cmd = executor._exec_command.call_args[0][1]
        assert "-L" not in cmd

    @pytest.mark.asyncio
    async def test_metrics_tracked(self, executor):
        from unittest.mock import MagicMock
        executor.config.get_tool_timeout = MagicMock(return_value=300)
        await executor.execute("http_probe", {"url": "https://example.com"})
        assert "http_probe" in executor._metrics
        assert executor._metrics["http_probe"]["calls"] == 1


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_url_with_fragment(self):
        cmd = build_http_probe_command({"url": "https://example.com/page#section"})
        assert "'https://example.com/page#section'" in cmd

    def test_url_with_auth(self):
        cmd = build_http_probe_command({"url": "https://user:pass@example.com"})
        assert "https://user:pass@example.com" in cmd

    def test_url_ipv4(self):
        cmd = build_http_probe_command({"url": "http://192.168.1.1:8080/api"})
        assert "http://192.168.1.1:8080/api" in cmd

    def test_url_localhost(self):
        cmd = build_http_probe_command({"url": "http://localhost:3000/health"})
        assert "http://localhost:3000/health" in cmd

    def test_body_non_string_ignored(self):
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "method": "POST",
            "body": 12345,
        })
        assert "-d" not in cmd

    def test_method_default_is_get(self):
        cmd = build_http_probe_command({"url": "https://example.com"})
        assert "-X" not in cmd

    def test_all_timing_fields_present(self):
        cmd = build_http_probe_command({"url": "https://example.com"})
        for field in ["time_dns", "time_connect", "time_tls", "time_ttfb",
                       "time_total", "size_download", "speed_download",
                       "status_code", "redirects", "remote_ip", "remote_port"]:
            assert field in cmd

    def test_connect_timeout_equals_main_when_under_10(self):
        cmd = build_http_probe_command({"url": "https://example.com", "timeout": 3})
        assert "--connect-timeout 3" in cmd
        assert "--max-time 3" in cmd

    def test_negative_timeout_becomes_minimum(self):
        cmd = build_http_probe_command({"url": "https://example.com", "timeout": -5})
        assert "--max-time 1" in cmd

    def test_silent_and_show_errors(self):
        cmd = build_http_probe_command({"url": "https://example.com"})
        assert "-sS" in cmd

    def test_options_method(self):
        cmd = build_http_probe_command({
            "url": "https://api.example.com",
            "method": "OPTIONS",
        })
        assert "-X OPTIONS" in cmd

    def test_headers_with_special_chars(self):
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "headers": {"X-Request-ID": "abc-123-def"},
        })
        assert "-H 'X-Request-ID: abc-123-def'" in cmd

    def test_body_with_newlines(self):
        body = "line1\nline2\nline3"
        cmd = build_http_probe_command({
            "url": "https://example.com",
            "method": "POST",
            "body": body,
        })
        assert "-d" in cmd

    def test_url_with_encoded_chars(self):
        cmd = build_http_probe_command({
            "url": "https://example.com/path%20with%20spaces",
        })
        assert "path%20with%20spaces" in cmd
