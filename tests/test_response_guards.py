"""Tests for src/discord/response_guards.py."""
from __future__ import annotations

from src.discord.response_guards import (
    combine_bot_messages,
    detect_code_hedging,
    detect_fabrication,
    detect_hedging,
    detect_premature_failure,
    detect_promise_without_action,
    detect_tool_unavailable,
    scrub_response_secrets,
    truncate_tool_output,
)
from src.llm.secret_scrubber import scrub_output_secrets

# ---------------------------------------------------------------------------
# Secret scrubbing
# ---------------------------------------------------------------------------

class TestScrubResponseSecrets:
    def test_scrub_api_key(self):
        text = "Here is the key: api_key=sk-abcdefghij1234567890ABCDEFGHIJ"
        result = scrub_response_secrets(text)
        assert "sk-abcdefghij" not in result
        assert "[REDACTED]" in result

    def test_scrub_slack_token(self):
        text = "The Slack token is xoxb-123456789012-123456789012-abcdefghijklmnopqrstuvwx"
        result = scrub_response_secrets(text)
        assert "xoxb-" not in result
        assert "[REDACTED]" in result

    def test_scrub_openai_key(self):
        text = "Use this key: sk-abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJ"
        result = scrub_response_secrets(text)
        assert "sk-abcdef" not in result
        assert "[REDACTED]" in result

    def test_no_false_positive_plain_text(self):
        text = "Everything looks good, no secrets here."
        result = scrub_response_secrets(text)
        assert result == text


# ---------------------------------------------------------------------------
# Fabrication detection
# ---------------------------------------------------------------------------

class TestDetectFabrication:
    def test_returns_false_when_tools_used(self):
        text = "I ran the command and here is the output."
        assert detect_fabrication(text, tools_used=["run_command"]) is False

    def test_returns_true_for_fabricated_command_claim(self):
        text = "I ran the command and everything looks fine."
        assert detect_fabrication(text, tools_used=[]) is True

    def test_returns_false_for_short_text(self):
        # Text shorter than 20 chars should not fire
        assert detect_fabrication("I ran it.", tools_used=[]) is False

    def test_returns_false_for_innocent_text(self):
        text = "The weather today is sunny and warm outside."
        assert detect_fabrication(text, tools_used=[]) is False

    def test_returns_true_for_here_is_the_output(self):
        text = "here is the output from the check you requested earlier."
        assert detect_fabrication(text, tools_used=[]) is True

    def test_returns_false_for_empty_text(self):
        assert detect_fabrication("", tools_used=[]) is False


# ---------------------------------------------------------------------------
# Promise without action detection
# ---------------------------------------------------------------------------

class TestDetectPromiseWithoutAction:
    def test_returns_false_when_tools_used(self):
        text = "I'll do that now for you."
        assert detect_promise_without_action(text, tools_used=["some_tool"]) is False

    def test_returns_true_for_i_will_with_no_tools(self):
        text = "I'll do that now for you right away."
        assert detect_promise_without_action(text, tools_used=[]) is True

    def test_returns_true_for_i_will_verb(self):
        text = "I will execute that command immediately."
        assert detect_promise_without_action(text, tools_used=[]) is True

    def test_exemption_i_am_not_sure(self):
        # "I'm not sure" is in the chat exemptions — should NOT fire
        text = "I'm not sure what you want me to do here."
        assert detect_promise_without_action(text, tools_used=[]) is False

    def test_exemption_i_cannot(self):
        text = "I can't do that because it's outside my scope."
        assert detect_promise_without_action(text, tools_used=[]) is False

    def test_returns_false_for_short_text(self):
        assert detect_promise_without_action("I'll go.", tools_used=[]) is False

    def test_returns_false_for_empty_text(self):
        assert detect_promise_without_action("", tools_used=[]) is False


# ---------------------------------------------------------------------------
# Hedging detection
# ---------------------------------------------------------------------------

class TestDetectHedging:
    def test_returns_true_for_shall_i(self):
        text = "Shall I proceed with the deployment now?"
        assert detect_hedging(text, tools_used=[]) is True

    def test_returns_false_when_tools_used(self):
        text = "Shall I proceed with the deployment now?"
        assert detect_hedging(text, tools_used=["deploy_tool"]) is False

    def test_returns_true_for_would_you_like(self):
        text = "Would you like me to restart the service?"
        assert detect_hedging(text, tools_used=[]) is True

    def test_returns_true_for_let_me_know(self):
        text = "Let me know if you want me to continue with this."
        assert detect_hedging(text, tools_used=[]) is True

    def test_returns_false_for_innocent_text(self):
        text = "The server is now running on port 8080."
        assert detect_hedging(text, tools_used=[]) is False

    def test_returns_false_for_empty_text(self):
        assert detect_hedging("", tools_used=[]) is False


# ---------------------------------------------------------------------------
# Code-block hedging detection
# ---------------------------------------------------------------------------

class TestDetectCodeHedging:
    def test_returns_true_for_bash_block_no_tools(self):
        text = "You can run this:\n```bash\nls -la\n```"
        assert detect_code_hedging(text, tools_used=[]) is True

    def test_returns_true_for_sh_block_no_tools(self):
        text = "Try:\n```sh\necho hello\n```"
        assert detect_code_hedging(text, tools_used=[]) is True

    def test_returns_false_when_tools_used(self):
        text = "```bash\nls\n```"
        assert detect_code_hedging(text, tools_used=["run_command"]) is False

    def test_returns_false_for_python_block(self):
        # Non-shell code blocks should not trigger
        text = "Here is some Python:\n```python\nprint('hello')\n```"
        assert detect_code_hedging(text, tools_used=[]) is False

    def test_returns_false_for_empty_text(self):
        assert detect_code_hedging("", tools_used=[]) is False


# ---------------------------------------------------------------------------
# Tool unavailability detection
# ---------------------------------------------------------------------------

class TestDetectToolUnavailable:
    def test_returns_true_for_not_available(self):
        text = "That tool is not available in this environment."
        assert detect_tool_unavailable(text, tools_used=[]) is True

    def test_returns_true_for_not_enabled(self):
        text = "Image generation is not enabled on this system."
        assert detect_tool_unavailable(text, tools_used=[]) is True

    def test_returns_false_when_tools_used(self):
        text = "That tool is not available."
        assert detect_tool_unavailable(text, tools_used=["some_tool"]) is False

    def test_returns_false_for_innocent_text(self):
        text = "The file was successfully uploaded to the server."
        assert detect_tool_unavailable(text, tools_used=[]) is False

    def test_returns_false_for_empty_text(self):
        assert detect_tool_unavailable("", tools_used=[]) is False

    def test_returns_true_for_do_not_have_access(self):
        text = "I don't have access to that resource directly."
        assert detect_tool_unavailable(text, tools_used=[]) is True


# ---------------------------------------------------------------------------
# Tool output truncation
# ---------------------------------------------------------------------------

class TestTruncateToolOutput:
    def test_short_text_unchanged(self):
        text = "short output"
        assert truncate_tool_output(text, max_chars=100) == text

    def test_exactly_at_limit_unchanged(self):
        text = "x" * 100
        assert truncate_tool_output(text, max_chars=100) == text

    def test_truncation_preserves_start(self):
        text = "START" + "x" * 1000 + "END"
        result = truncate_tool_output(text, max_chars=50)
        assert result.startswith("START")

    def test_truncation_preserves_end(self):
        text = "START" + "x" * 1000 + "END"
        result = truncate_tool_output(text, max_chars=50)
        assert result.endswith("END")

    def test_truncation_contains_omitted_marker(self):
        text = "a" * 200
        result = truncate_tool_output(text, max_chars=100)
        assert "omitted" in result

    def test_truncation_result_shorter_than_input(self):
        text = "a" * 200
        result = truncate_tool_output(text, max_chars=100)
        # The result is start + marker + end, which is max_chars + marker overhead
        assert len(result) < len(text)


# ---------------------------------------------------------------------------
# Message combination
# ---------------------------------------------------------------------------

class TestCombineBotMessages:
    def test_single_part_returned_as_is(self):
        assert combine_bot_messages(["hello"]) == "hello"

    def test_empty_list_returns_empty_string(self):
        assert combine_bot_messages([]) == ""

    def test_two_plain_parts_joined_with_double_newline(self):
        result = combine_bot_messages(["hello", "world"])
        assert result == "hello\n\nworld"

    def test_three_plain_parts_joined(self):
        result = combine_bot_messages(["a", "b", "c"])
        assert result == "a\n\nb\n\nc"

    def test_split_code_block_joined_with_single_newline(self):
        # First part opens a code block, second part closes it — single \n
        part1 = "```python\nprint('hello')"
        part2 = "```"
        result = combine_bot_messages([part1, part2])
        assert "\n\n" not in result
        assert "print('hello')" in result

    def test_adjacent_code_blocks_merged(self):
        # Two adjacent code blocks get the redundant fence pair removed
        part1 = "```bash\nls\n```"
        part2 = "```bash\npwd\n```"
        result = combine_bot_messages([part1, part2])
        assert result.count("```bash") < 3  # at least one fence pair collapsed


# ---------------------------------------------------------------------------
# Premature failure detection
# ---------------------------------------------------------------------------

class TestDetectPrematureFailure:
    def test_returns_false_when_no_tools_used(self):
        text = "I couldn't get the data from the server."
        assert detect_premature_failure(text, tools_used=[]) is False

    def test_returns_true_for_failure_after_tool_use(self):
        text = "I couldn't get the data from the server, it appears to be down."
        assert detect_premature_failure(text, tools_used=["run_command"]) is True

    def test_returns_true_for_timeout(self):
        text = "The connection timed out when trying to reach the service."
        assert detect_premature_failure(text, tools_used=["run_command"]) is True

    def test_returns_true_for_workaround_suggestion(self):
        text = "The service is down. Here is a workaround you can try instead."
        assert detect_premature_failure(text, tools_used=["run_command"]) is True

    def test_returns_false_for_short_text(self):
        assert detect_premature_failure("Error: fail", tools_used=["run_command"]) is False

    def test_returns_false_for_success_message(self):
        text = "The deployment completed successfully and all services are running."
        assert detect_premature_failure(text, tools_used=["run_command"]) is False

    def test_returns_false_for_empty_text(self):
        assert detect_premature_failure("", tools_used=["run_command"]) is False


# ---------------------------------------------------------------------------
# Direct secret scrubber tests
# ---------------------------------------------------------------------------

class TestScrubOutputSecrets:
    def test_scrub_password_assignment(self):
        text = "password=hunter2 in the config"
        result = scrub_output_secrets(text)
        assert "hunter2" not in result
        assert "[REDACTED]" in result

    def test_scrub_github_token(self):
        text = "Token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij"
        result = scrub_output_secrets(text)
        assert "ghp_" not in result

    def test_scrub_aws_key(self):
        text = "AWS key: AKIAIOSFODNN7EXAMPLE"
        result = scrub_output_secrets(text)
        assert "AKIA" not in result

    def test_scrub_stripe_key(self):
        text = "Stripe key: sk_live_abcdefghijklmnopqrstuvwxyz"
        result = scrub_output_secrets(text)
        assert "sk_live_" not in result

    def test_scrub_private_key(self):
        text = "-----BEGIN RSA PRIVATE KEY-----\nMIIEow..."
        result = scrub_output_secrets(text)
        assert "PRIVATE KEY" not in result

    def test_scrub_database_uri(self):
        text = "postgres://user:password@host:5432/db"
        result = scrub_output_secrets(text)
        assert "password@" not in result

    def test_no_false_positive(self):
        text = "Everything looks normal, disk usage at 42%."
        assert scrub_output_secrets(text) == text
