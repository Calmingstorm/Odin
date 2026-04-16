"""Tests for src.tools.result_validator — tool result schema enforcement."""

from __future__ import annotations

import json
import pytest

from src.tools.result_validator import (
    DEFAULT_SCHEMA,
    RESULT_MAX_CHARS,
    TOOL_SCHEMAS,
    ToolResultSchema,
    ValidationOutcome,
    ResultValidationStats,
    _EMPTY_OK_TOOLS,
    _EMPTY_RESULT_PLACEHOLDER,
    _ERROR_PREFIXES,
    _JSON_TOOLS,
    _is_error_result,
    _truncate_smart,
    validate_tool_result,
)


# -----------------------------------------------------------------------
# ToolResultSchema defaults
# -----------------------------------------------------------------------
class TestToolResultSchemaDefaults:
    def test_default_max_chars(self):
        assert DEFAULT_SCHEMA.max_chars == RESULT_MAX_CHARS

    def test_default_not_allow_empty(self):
        assert DEFAULT_SCHEMA.allow_empty is False

    def test_default_not_expect_json(self):
        assert DEFAULT_SCHEMA.expect_json is False

    def test_custom_schema(self):
        s = ToolResultSchema(max_chars=500, allow_empty=True, expect_json=True)
        assert s.max_chars == 500
        assert s.allow_empty is True
        assert s.expect_json is True


# -----------------------------------------------------------------------
# TOOL_SCHEMAS registry
# -----------------------------------------------------------------------
class TestToolSchemasRegistry:
    def test_empty_ok_tools_have_allow_empty(self):
        for t in _EMPTY_OK_TOOLS:
            assert t in TOOL_SCHEMAS, f"{t} missing from TOOL_SCHEMAS"
            assert TOOL_SCHEMAS[t].allow_empty is True, f"{t} should allow empty"

    def test_json_tools_have_expect_json(self):
        for t in _JSON_TOOLS:
            assert t in TOOL_SCHEMAS, f"{t} missing from TOOL_SCHEMAS"
            assert TOOL_SCHEMAS[t].expect_json is True, f"{t} should expect json"

    def test_unknown_tool_gets_default(self):
        assert "nonexistent_tool_xyz" not in TOOL_SCHEMAS

    def test_write_file_is_empty_ok(self):
        assert TOOL_SCHEMAS["write_file"].allow_empty is True

    def test_manage_process_expects_json(self):
        assert TOOL_SCHEMAS["manage_process"].expect_json is True


# -----------------------------------------------------------------------
# _is_error_result
# -----------------------------------------------------------------------
class TestIsErrorResult:
    @pytest.mark.parametrize("prefix", _ERROR_PREFIXES)
    def test_error_prefixes(self, prefix):
        assert _is_error_result(prefix + "some detail") is True

    def test_normal_output(self):
        assert _is_error_result("ls output here") is False

    def test_empty_string(self):
        assert _is_error_result("") is False

    def test_error_not_at_start(self):
        assert _is_error_result("some text Error: foo") is False


# -----------------------------------------------------------------------
# _truncate_smart
# -----------------------------------------------------------------------
class TestTruncateSmart:
    def test_no_truncation_under_limit(self):
        text = "hello"
        assert _truncate_smart(text, 100) == text

    def test_no_truncation_at_limit(self):
        text = "x" * 100
        assert _truncate_smart(text, 100) == text

    def test_truncation_over_limit(self):
        text = "A" * 50 + "B" * 50
        result = _truncate_smart(text, 60)
        assert "characters omitted" in result
        assert result.startswith("A" * 30)
        assert result.endswith("B" * 30)

    def test_truncation_preserves_length(self):
        text = "x" * 200
        result = _truncate_smart(text, 100)
        # Result should be around max_chars + the omission notice
        assert len(result) < 200

    def test_omission_count_accurate(self):
        text = "x" * 300
        result = _truncate_smart(text, 100)
        assert "200 characters omitted" in result


# -----------------------------------------------------------------------
# validate_tool_result — type coercion
# -----------------------------------------------------------------------
class TestValidateTypeCoercion:
    def test_none_coerced(self):
        outcome = validate_tool_result("run_command", None)
        assert "result_was_none" in outcome.violations
        assert outcome.normalized == _EMPTY_RESULT_PLACEHOLDER

    def test_string_passthrough(self):
        outcome = validate_tool_result("run_command", "hello")
        assert outcome.valid is True
        assert outcome.normalized == "hello"

    def test_int_coerced(self):
        outcome = validate_tool_result("run_command", 42)
        assert "coerced_int_to_str" in outcome.violations
        assert outcome.normalized == "42"

    def test_list_coerced(self):
        outcome = validate_tool_result("run_command", [1, 2, 3])
        assert any("coerced" in v for v in outcome.violations)
        assert "1, 2, 3" in outcome.normalized

    def test_dict_coerced(self):
        outcome = validate_tool_result("run_command", {"key": "val"})
        assert any("coerced" in v for v in outcome.violations)

    def test_bool_coerced(self):
        outcome = validate_tool_result("run_command", True)
        assert any("coerced" in v for v in outcome.violations)
        assert outcome.normalized == "True"


# -----------------------------------------------------------------------
# validate_tool_result — empty handling
# -----------------------------------------------------------------------
class TestValidateEmptyHandling:
    def test_empty_string_replaced(self):
        outcome = validate_tool_result("run_command", "")
        assert "empty_result_replaced" in outcome.violations
        assert outcome.normalized == _EMPTY_RESULT_PLACEHOLDER

    def test_whitespace_only_replaced(self):
        outcome = validate_tool_result("run_command", "   \n  ")
        assert "empty_result_replaced" in outcome.violations
        assert outcome.normalized == _EMPTY_RESULT_PLACEHOLDER

    def test_empty_allowed_for_write_file(self):
        outcome = validate_tool_result("write_file", "")
        assert outcome.valid is True
        assert outcome.normalized == ""

    def test_empty_allowed_for_browser_click(self):
        outcome = validate_tool_result("browser_click", "")
        assert outcome.valid is True
        assert outcome.normalized == ""

    @pytest.mark.parametrize("tool", list(_EMPTY_OK_TOOLS))
    def test_all_empty_ok_tools(self, tool):
        outcome = validate_tool_result(tool, "")
        assert "empty_result_replaced" not in outcome.violations

    def test_empty_not_replaced_when_schema_allows(self):
        schema = ToolResultSchema(allow_empty=True)
        outcome = validate_tool_result("run_command", "", schema=schema)
        assert "empty_result_replaced" not in outcome.violations


# -----------------------------------------------------------------------
# validate_tool_result — truncation
# -----------------------------------------------------------------------
class TestValidateTruncation:
    def test_long_result_truncated(self):
        text = "x" * (RESULT_MAX_CHARS + 1000)
        outcome = validate_tool_result("run_command", text)
        assert "truncated" in outcome.violations
        assert len(outcome.normalized) < len(text)
        assert "characters omitted" in outcome.normalized

    def test_under_limit_not_truncated(self):
        text = "x" * 100
        outcome = validate_tool_result("run_command", text)
        assert "truncated" not in outcome.violations
        assert outcome.normalized == text

    def test_custom_max_chars(self):
        text = "x" * 200
        schema = ToolResultSchema(max_chars=100)
        outcome = validate_tool_result("run_command", text, schema=schema)
        assert "truncated" in outcome.violations

    def test_exactly_at_limit_not_truncated(self):
        text = "x" * RESULT_MAX_CHARS
        outcome = validate_tool_result("run_command", text)
        assert "truncated" not in outcome.violations


# -----------------------------------------------------------------------
# validate_tool_result — JSON validation
# -----------------------------------------------------------------------
class TestValidateJSON:
    def test_valid_json_passes(self):
        schema = ToolResultSchema(expect_json=True)
        result = json.dumps({"status": "ok", "items": [1, 2, 3]})
        outcome = validate_tool_result("manage_process", result, schema=schema)
        assert "invalid_json" not in outcome.violations

    def test_invalid_json_flagged(self):
        schema = ToolResultSchema(expect_json=True)
        outcome = validate_tool_result("manage_process", "not json at all", schema=schema)
        assert "invalid_json" in outcome.violations

    def test_error_result_skips_json_check(self):
        schema = ToolResultSchema(expect_json=True)
        outcome = validate_tool_result("manage_process", "Error: process not found", schema=schema)
        assert "invalid_json" not in outcome.violations

    def test_empty_result_skips_json_check(self):
        schema = ToolResultSchema(expect_json=True, allow_empty=True)
        outcome = validate_tool_result("manage_process", "", schema=schema)
        assert "invalid_json" not in outcome.violations

    def test_json_array_valid(self):
        schema = ToolResultSchema(expect_json=True)
        outcome = validate_tool_result("test_tool", '[1, 2, 3]', schema=schema)
        assert "invalid_json" not in outcome.violations

    def test_json_string_valid(self):
        schema = ToolResultSchema(expect_json=True)
        outcome = validate_tool_result("test_tool", '"hello"', schema=schema)
        assert "invalid_json" not in outcome.violations

    def test_manage_process_schema_expects_json(self):
        outcome = validate_tool_result("manage_process", "not json")
        assert "invalid_json" in outcome.violations


# -----------------------------------------------------------------------
# validate_tool_result — whitespace normalisation
# -----------------------------------------------------------------------
class TestValidateWhitespace:
    def test_leading_whitespace_stripped(self):
        outcome = validate_tool_result("run_command", "  hello  ")
        assert outcome.normalized == "hello"

    def test_trailing_newlines_stripped(self):
        outcome = validate_tool_result("run_command", "output\n\n\n")
        assert outcome.normalized == "output"

    def test_internal_whitespace_preserved(self):
        outcome = validate_tool_result("run_command", "line 1\nline 2")
        assert outcome.normalized == "line 1\nline 2"


# -----------------------------------------------------------------------
# validate_tool_result — ValidationOutcome
# -----------------------------------------------------------------------
class TestValidationOutcome:
    def test_valid_outcome(self):
        outcome = validate_tool_result("run_command", "output")
        assert outcome.valid is True
        assert outcome.violations == []
        assert outcome.original == "output"
        assert outcome.normalized == "output"

    def test_invalid_outcome_has_violations(self):
        outcome = validate_tool_result("run_command", None)
        assert outcome.valid is False
        assert len(outcome.violations) > 0

    def test_original_preserved(self):
        outcome = validate_tool_result("run_command", "  text  ")
        assert outcome.original == "  text  "
        assert outcome.normalized == "text"

    def test_none_original_is_empty_string(self):
        outcome = validate_tool_result("run_command", None)
        assert outcome.original == ""


# -----------------------------------------------------------------------
# ResultValidationStats
# -----------------------------------------------------------------------
class TestResultValidationStats:
    def test_initial_stats_zero(self):
        stats = ResultValidationStats()
        d = stats.as_dict()
        assert all(v == 0 for v in d.values())

    def test_coerced_type_counted(self):
        stats = ResultValidationStats()
        validate_tool_result("run_command", None, stats=stats)
        assert stats.coerced_type == 1
        assert stats.total_validated == 1

    def test_replaced_empty_counted(self):
        stats = ResultValidationStats()
        validate_tool_result("run_command", "", stats=stats)
        assert stats.replaced_empty == 1

    def test_truncated_counted(self):
        stats = ResultValidationStats()
        schema = ToolResultSchema(max_chars=10)
        validate_tool_result("run_command", "x" * 100, stats=stats, schema=schema)
        assert stats.truncated == 1

    def test_invalid_json_counted(self):
        stats = ResultValidationStats()
        schema = ToolResultSchema(expect_json=True)
        validate_tool_result("test_tool", "not json", stats=stats, schema=schema)
        assert stats.invalid_json == 1

    def test_cumulative_counting(self):
        stats = ResultValidationStats()
        validate_tool_result("run_command", None, stats=stats)
        validate_tool_result("run_command", None, stats=stats)
        validate_tool_result("run_command", "ok", stats=stats)
        assert stats.total_validated == 3
        assert stats.coerced_type == 2

    def test_as_dict_keys(self):
        stats = ResultValidationStats()
        d = stats.as_dict()
        expected_keys = {"coerced_type", "replaced_empty", "truncated", "invalid_json", "total_validated"}
        assert set(d.keys()) == expected_keys

    def test_no_stats_object_works(self):
        outcome = validate_tool_result("run_command", None, stats=None)
        assert outcome.valid is False


# -----------------------------------------------------------------------
# validate_tool_result — multiple violations
# -----------------------------------------------------------------------
class TestMultipleViolations:
    def test_none_and_empty(self):
        outcome = validate_tool_result("run_command", None)
        assert "result_was_none" in outcome.violations
        assert "empty_result_replaced" in outcome.violations

    def test_coerced_and_truncated(self):
        schema = ToolResultSchema(max_chars=5)
        outcome = validate_tool_result("run_command", 12345678)
        # Coerced int to str, but may not be truncated with default max_chars
        assert "coerced_int_to_str" in outcome.violations

    def test_none_coerced_empty_replaced_counted(self):
        stats = ResultValidationStats()
        validate_tool_result("run_command", None, stats=stats)
        assert stats.coerced_type == 1
        assert stats.replaced_empty == 1
        assert stats.total_validated == 1


# -----------------------------------------------------------------------
# validate_tool_result — error results
# -----------------------------------------------------------------------
class TestErrorResults:
    def test_error_string_passes_through(self):
        msg = "Error executing run_command: connection refused"
        outcome = validate_tool_result("run_command", msg)
        assert outcome.valid is True
        assert outcome.normalized == msg

    def test_command_failed_passes_through(self):
        msg = "Command failed (exit 1):\nNo such file"
        outcome = validate_tool_result("run_command", msg)
        assert outcome.valid is True
        assert outcome.normalized == msg

    def test_unknown_tool_passes_through(self):
        msg = "Unknown tool: foo_bar"
        outcome = validate_tool_result("foo_bar", msg)
        assert outcome.valid is True

    def test_permission_denied_passes_through(self):
        msg = "Permission denied: tool 'run_command' is not available for tier 'guest'."
        outcome = validate_tool_result("run_command", msg)
        assert outcome.valid is True

    def test_timeout_error_passes_through(self):
        msg = "Error: tool 'run_command' timed out after 300s"
        outcome = validate_tool_result("run_command", msg)
        assert outcome.valid is True


# -----------------------------------------------------------------------
# validate_tool_result — schema override
# -----------------------------------------------------------------------
class TestSchemaOverride:
    def test_override_max_chars(self):
        schema = ToolResultSchema(max_chars=50)
        text = "x" * 100
        outcome = validate_tool_result("run_command", text, schema=schema)
        assert "truncated" in outcome.violations

    def test_override_allow_empty(self):
        schema = ToolResultSchema(allow_empty=True)
        outcome = validate_tool_result("run_command", "", schema=schema)
        assert outcome.valid is True
        assert outcome.normalized == ""

    def test_override_expect_json(self):
        schema = ToolResultSchema(expect_json=True)
        outcome = validate_tool_result("run_command", "not json", schema=schema)
        assert "invalid_json" in outcome.violations

    def test_explicit_schema_overrides_registry(self):
        schema = ToolResultSchema(allow_empty=False)
        outcome = validate_tool_result("write_file", "", schema=schema)
        assert "empty_result_replaced" in outcome.violations


# -----------------------------------------------------------------------
# Integration: executor.execute uses validation
# -----------------------------------------------------------------------
class TestExecutorIntegration:
    @pytest.fixture
    def executor(self):
        from src.tools.executor import ToolExecutor
        exe = ToolExecutor.__new__(ToolExecutor)
        from src.config.schema import ToolsConfig
        from src.tools.recovery import RecoveryStats
        from src.tools.risk_classifier import RiskStats
        exe.config = ToolsConfig()
        exe._memory_path = None
        exe._browser_manager = None
        exe._permission_manager = None
        exe.output_streamer = None
        exe._metrics = {}
        exe.risk_stats = RiskStats()
        exe.recovery_stats = RecoveryStats()
        exe.validation_stats = ResultValidationStats()
        exe._recovery_enabled = False
        exe._branch_freshness_enabled = False
        exe._last_risk_assessment = None
        from src.tools.bulkhead import BulkheadRegistry
        exe.bulkheads = BulkheadRegistry()
        exe.freshness_stats = None
        exe.ssh_pool = None
        return exe

    @pytest.mark.asyncio
    async def test_unknown_tool_not_validated_as_empty(self, executor):
        result = await executor.execute("nonexistent_tool", {})
        assert result == "Unknown tool: nonexistent_tool"

    @pytest.mark.asyncio
    async def test_validation_stats_increment(self, executor):
        assert executor.validation_stats.total_validated == 0
        # Execute a real handler that returns a string
        # Use run_command which requires host — will fail but still validates
        from unittest.mock import AsyncMock, patch
        async def mock_handler(inp):
            return "test output"
        executor._handle_test_tool = mock_handler
        with patch("src.tools.executor.classify_tool") as mock_classify:
            from src.tools.risk_classifier import RiskAssessment, RiskLevel
            mock_classify.return_value = RiskAssessment(level=RiskLevel.LOW, reason="test")
            result = await executor.execute("test_tool", {})
        assert executor.validation_stats.total_validated == 1
        assert result == "test output"

    @pytest.mark.asyncio
    async def test_none_result_normalised(self, executor):
        async def mock_handler(inp):
            return None
        executor._handle_test_tool = mock_handler
        with patch("src.tools.executor.classify_tool") as mock_classify:
            from src.tools.risk_classifier import RiskAssessment, RiskLevel
            mock_classify.return_value = RiskAssessment(level=RiskLevel.LOW, reason="test")
            result = await executor.execute("test_tool", {})
        assert result == _EMPTY_RESULT_PLACEHOLDER
        assert executor.validation_stats.coerced_type == 1

    @pytest.mark.asyncio
    async def test_empty_result_normalised(self, executor):
        async def mock_handler(inp):
            return ""
        executor._handle_test_tool = mock_handler
        with patch("src.tools.executor.classify_tool") as mock_classify:
            from src.tools.risk_classifier import RiskAssessment, RiskLevel
            mock_classify.return_value = RiskAssessment(level=RiskLevel.LOW, reason="test")
            result = await executor.execute("test_tool", {})
        assert result == _EMPTY_RESULT_PLACEHOLDER
        assert executor.validation_stats.replaced_empty == 1


from unittest.mock import patch


# -----------------------------------------------------------------------
# Edge cases
# -----------------------------------------------------------------------
class TestEdgeCases:
    def test_very_long_error_still_passes(self):
        msg = "Error: " + "x" * 20000
        outcome = validate_tool_result("run_command", msg)
        assert "truncated" in outcome.violations
        assert outcome.normalized.startswith("Error: ")

    def test_unicode_result(self):
        outcome = validate_tool_result("run_command", "héllo wörld 🌍")
        assert outcome.valid is True
        assert outcome.normalized == "héllo wörld 🌍"

    def test_multiline_result(self):
        text = "line1\nline2\nline3"
        outcome = validate_tool_result("run_command", text)
        assert outcome.normalized == text

    def test_result_with_only_newlines(self):
        outcome = validate_tool_result("run_command", "\n\n\n")
        assert "empty_result_replaced" in outcome.violations

    def test_bytes_coerced(self):
        outcome = validate_tool_result("run_command", b"hello bytes")
        assert any("coerced" in v for v in outcome.violations)
        assert "hello bytes" in outcome.normalized

    def test_exception_object_coerced(self):
        try:
            raise ValueError("test error")
        except ValueError as e:
            outcome = validate_tool_result("run_command", e)
        assert any("coerced" in v for v in outcome.violations)
        assert "test error" in outcome.normalized

    def test_empty_placeholder_value(self):
        assert _EMPTY_RESULT_PLACEHOLDER == "(no output)"

    def test_schema_slots(self):
        s = ToolResultSchema()
        assert hasattr(s, "__slots__")

    def test_outcome_slots(self):
        o = ValidationOutcome(valid=True, original="x", normalized="x")
        assert hasattr(o, "__slots__")
