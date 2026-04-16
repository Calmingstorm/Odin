"""Regression test suite for detect_hedging pattern corpus (Round 41).

Tests are organised by hedging category (matching _HEDGING_PATTERNS groups)
plus a false-positive section that must NOT trigger. Every test calls the
public detect_hedging() function with tools_used=[] so that the full
pipeline (length check, exemptions, pattern matching) is exercised.
"""
from __future__ import annotations

import pytest

from src.discord.response_guards import (
    _HEDGING_EXEMPTIONS,
    _HEDGING_PATTERNS,
    detect_hedging,
)

NO_TOOLS: list[str] = []


# -------------------------------------------------------------------------
# Structural / meta tests
# -------------------------------------------------------------------------

class TestHedgingStructure:
    """Verify the pattern corpus itself is well-formed."""

    def test_patterns_list_not_empty(self):
        assert len(_HEDGING_PATTERNS) >= 10

    def test_exemptions_list_not_empty(self):
        assert len(_HEDGING_EXEMPTIONS) >= 4

    def test_all_patterns_are_compiled_regex(self):
        import re
        for p in _HEDGING_PATTERNS:
            assert isinstance(p, re.Pattern)

    def test_all_exemptions_are_compiled_regex(self):
        import re
        for p in _HEDGING_EXEMPTIONS:
            assert isinstance(p, re.Pattern)

    def test_returns_false_when_tools_used(self):
        assert detect_hedging("Shall I restart the service?", ["run_command"]) is False

    def test_returns_false_for_empty_text(self):
        assert detect_hedging("", NO_TOOLS) is False

    def test_returns_false_for_none_text(self):
        assert detect_hedging(None, NO_TOOLS) is False  # type: ignore[arg-type]

    def test_returns_false_for_short_text(self):
        assert detect_hedging("Shall I?", NO_TOOLS) is False


# -------------------------------------------------------------------------
# Group 1: Permission-asking / deference
# -------------------------------------------------------------------------

class TestGroup1PermissionAsking:
    """Patterns like 'shall I', 'if you like', 'would you like me to'."""

    @pytest.mark.parametrize("text", [
        "Shall I proceed with the deployment now?",
        "Should I restart the containers?",
        "Would you like me to check the logs?",
        "Would you like a summary of the results?",
        "If you'd like, I can run a full scan.",
        "If you want, I can check the disk usage.",
        "If you prefer, I'll use a different approach.",
        "I can do that for you if needed.",
        "I can run that for you if you want.",
        "I can execute this for you — just say the word.",
        "I can help with that if you want.",
        "I can set up it for you right now.",
        "Just say the word and I'll restart.",
        "Just tell me when and I'll get started.",
        "Just tell me if you want the verbose output.",
        "Ready when you are.",
        "Ready on you — just give the signal.",
        "Let me know if you want me to continue.",
        "Let me know when you're ready.",
        "Want me to run the migration?",
        "Want me to check that again?",
    ])
    def test_permission_asking_detected(self, text: str):
        assert detect_hedging(text, NO_TOOLS) is True


# -------------------------------------------------------------------------
# Group 2: Waiting for approval / consensus
# -------------------------------------------------------------------------

class TestGroup2WaitingForApproval:
    """Patterns like 'here is the plan', 'awaiting your confirmation'."""

    @pytest.mark.parametrize("text", [
        "Here's a plan: first we'll update the config, then restart.",
        "Here is the plan for the migration.",
        "I'd suggest running the tests first before deploying.",
        "I would recommend a canary deploy.",
        "Before I proceed, let me outline the steps.",
        "Before we go ahead, are there any concerns?",
        "Before we start, I need to know the target.",
        "I'll wait for your go-ahead before restarting.",
        "I'll wait for the confirmation before pushing.",
        "I'll wait for your approval to continue.",
        "Awaiting your confirmation on the rollback.",
        "Awaiting the go-ahead from you.",
        "Once you confirm, I'll execute the migration.",
        "Once you approve, I'll start the rollback.",
        "Once you give the go-ahead, I'll proceed.",
        "It's your call on how to handle this.",
        "Up to you whether we rollback or not.",
        "Your decision — either way works for me.",
    ])
    def test_waiting_for_approval_detected(self, text: str):
        assert detect_hedging(text, NO_TOOLS) is True


# -------------------------------------------------------------------------
# Group 3: Announcing intent without acting
# -------------------------------------------------------------------------

class TestGroup3AnnouncingIntent:
    """Patterns like 'Plan:', 'I'm going to', 'I need to ... first'."""

    @pytest.mark.parametrize("text", [
        "Plan: first check logs, then restart the service.",
        "I need to check the config first before making changes.",
        "I have to verify the credentials before connecting.",
        "I'm going to run a diagnostic now.",
        "I'm about to restart the service.",
        "I'm proceeding to check the status.",
    ])
    def test_announcing_intent_detected(self, text: str):
        assert detect_hedging(text, NO_TOOLS) is True

    @pytest.mark.parametrize("text", [
        "I can't directly access that database from here.",
        "I cannot directly modify that file remotely.",
    ])
    def test_inability_exempted_over_group3(self, text: str):
        assert detect_hedging(text, NO_TOOLS) is False


# -------------------------------------------------------------------------
# Group 4: Offering numbered options
# -------------------------------------------------------------------------

class TestGroup4OfferingOptions:
    """Patterns like 'pick one', 'option 1', 'which would you prefer'."""

    @pytest.mark.parametrize("text", [
        "Pick one of these approaches and I'll run it.",
        "Pick an option and let me know.",
        "Choose one from the list below.",
        "Choose from these restart strategies:",
        "Option 1: restart gracefully. Option 2: force kill.",
        "Choice 1 is safer but slower.",
        "Tell me what you want and I'll handle it.",
        "Tell me which approach to take.",
        "Which would you prefer for this deployment?",
        "Which do you want — rolling or blue-green?",
        "Which one should I use for the backup?",
    ])
    def test_offering_options_detected(self, text: str):
        assert detect_hedging(text, NO_TOOLS) is True


# -------------------------------------------------------------------------
# Group 5: Conditional hedges
# -------------------------------------------------------------------------

class TestGroup5ConditionalHedges:
    """Patterns like 'if that's okay', 'if that sounds good'."""

    @pytest.mark.parametrize("text", [
        "I'll restart the service now if that's okay.",
        "I'll use the staging config if that is okay with you.",
        "I can check the logs if that's alright.",
        "If that sounds good, I'll go ahead.",
        "If that works for you, I'll start the migration.",
        "If that looks good, I'll push it.",
        "If you're okay with that, I'll proceed.",
        "If you are comfortable with this, I'll deploy.",
        "If you're happy with it, I'll merge.",
        "If you agree, I'll run the rollback.",
        "If you don't mind, I'll check the backups.",
        "If you give me the go-ahead, I'll start.",
        "If you give the green light, I'll deploy.",
    ])
    def test_conditional_hedges_detected(self, text: str):
        assert detect_hedging(text, NO_TOOLS) is True


# -------------------------------------------------------------------------
# Group 6: Deferring / false politeness
# -------------------------------------------------------------------------

class TestGroup6Deferring:
    """Patterns like 'whenever you're ready', 'at your convenience'."""

    @pytest.mark.parametrize("text", [
        "Whenever you're ready, I can start the rollback.",
        "Whenever you are ready, just let me know.",
        "At your convenience, I'll check the status.",
        "At your discretion — I can run either approach.",
        "At your leisure, we can review the config.",
        "Feel free to let me know if you want changes.",
        "Feel free to tell me what to do next.",
        "Feel free to decide and I'll execute.",
        "I'd be happy to help with the migration.",
        "I would be happy to run that for you.",
        "I'd be happy to take care of that.",
        "No rush — take your time deciding.",
        "No pressure, just let me know.",
        "Take your time, I'm here when you need me.",
        "Just let me know what you need.",
    ])
    def test_deferring_detected(self, text: str):
        assert detect_hedging(text, NO_TOOLS) is True


# -------------------------------------------------------------------------
# Group 7: Soft suggestions
# -------------------------------------------------------------------------

class TestGroup7SoftSuggestions:
    """Patterns like 'perhaps I could', 'maybe we should'."""

    @pytest.mark.parametrize("text", [
        "Perhaps I could run a diagnostic first.",
        "Perhaps we should check the logs before restarting.",
        "Perhaps we might want to back up first.",
        "Maybe I could try a different approach.",
        "Maybe I should check the config first.",
        "Maybe we should wait for the build to finish.",
        "It might be worth checking the disk space first.",
        "It might be better to use a rolling restart.",
        "It might be best to wait for off-peak hours.",
        "It may be worth running a backup first.",
        "It could be better to try a different node.",
        "You might want to consider a different strategy.",
        "You may want to review the changes first.",
        "You could consider using a staged rollout.",
    ])
    def test_soft_suggestions_detected(self, text: str):
        assert detect_hedging(text, NO_TOOLS) is True


# -------------------------------------------------------------------------
# Group 8: Consensus / confirmation-seeking questions
# -------------------------------------------------------------------------

class TestGroup8ConsensusSeeking:
    """Patterns like 'does that sound right', 'what do you think'."""

    @pytest.mark.parametrize("text", [
        "Does that sound right to you?",
        "Does that look good for the deploy config?",
        "Does that seem reasonable as a timeout?",
        "What do you think about this approach?",
        "What would you prefer — restart or rollback?",
        "What do you suggest for the retry count?",
        "How would you like me to proceed?",
        "How should we handle the stale connections?",
        "How shall I approach the migration?",
        "How would we proceed from here?",
        "Do you agree with this approach?",
        "Do you prefer the fast or safe option?",
        "Would you prefer a full restart?",
        "Would you mind if I checked the backups first?",
        "Is that okay for the production deploy?",
        "Is that what you mean by 'reset'?",
        "Is that acceptable as a timeout value?",
    ])
    def test_consensus_seeking_detected(self, text: str):
        assert detect_hedging(text, NO_TOOLS) is True


# -------------------------------------------------------------------------
# Group 9: Listing steps/approaches without execution
# -------------------------------------------------------------------------

class TestGroup9ListingSteps:
    """Patterns like 'the steps would be', 'we could either'."""

    @pytest.mark.parametrize("text", [
        "The steps would be: 1) stop service, 2) backup, 3) migrate.",
        "The approach would be to drain, then restart.",
        "My plan would be to check health first.",
        "My strategy would be incremental rollout.",
        "Here's what I'd do: first check the config.",
        "Here is how I would approach the migration.",
        "One option would be to restart the pod.",
        "Another approach would be to scale horizontally.",
        "One alternative is to use a canary deploy.",
        "Another way would be to patch in place.",
        "We could either restart or rollback.",
        "We could also try a different endpoint.",
        "We could try increasing the timeout first.",
        "There are a few options for handling this.",
        "There are several approaches we could take.",
        "There are multiple ways to fix this issue.",
    ])
    def test_listing_steps_detected(self, text: str):
        assert detect_hedging(text, NO_TOOLS) is True


# -------------------------------------------------------------------------
# Group 10: Disclaimers / excessive caution
# -------------------------------------------------------------------------

class TestGroup10Disclaimers:
    """Patterns like 'just to be safe', 'could you confirm'."""

    @pytest.mark.parametrize("text", [
        "Just to be safe, I want to check first.",
        "Just to confirm — you want a full restart?",
        "Just to clarify, are you talking about production?",
        "Just to double-check, is that the right namespace?",
        "Just to make sure, you want the verbose output?",
        "Could you confirm the target environment?",
        "Can you clarify which service you mean?",
        "Can you verify the deployment target?",
        "Could you double-check the config path?",
        "I want to confirm the target before proceeding.",
        "I need to clarify which database you mean.",
        "I want to make sure I have the right host.",
        "I need to verify the credentials are correct.",
        "Before doing anything, let me ask about scope.",
        "Before making any changes, I need to understand the impact.",
        "Before I do anything, which environment is this?",
        "I don't want to restart without your approval.",
    ])
    def test_disclaimers_detected(self, text: str):
        assert detect_hedging(text, NO_TOOLS) is True


# =========================================================================
# EXEMPTIONS — these MUST NOT trigger hedging detection
# =========================================================================

class TestExemptionCompletedActions:
    """Phrases indicating completed work should be exempt."""

    @pytest.mark.parametrize("text", [
        "I've done the migration and all tables are updated.",
        "I've completed the rollback successfully.",
        "I've finished the deployment and services are healthy.",
        "I've executed the restart command on all nodes.",
        "I've run the diagnostics and everything looks good.",
        "done. The service is back up.",
        "Task complete. All pods are running.",
        "The migration completed successfully.",
    ])
    def test_completed_action_not_detected(self, text: str):
        assert detect_hedging(text, NO_TOOLS) is False


class TestExemptionReportingResults:
    """Phrases reporting tool results should be exempt."""

    @pytest.mark.parametrize("text", [
        "The result is 42 — the query completed in 3ms.",
        "The output shows no errors in the last hour.",
        "The response was a 200 OK with valid JSON.",
        "Here is the output from the health check.",
        "Here are the results of the diagnostic scan.",
    ])
    def test_reporting_results_not_detected(self, text: str):
        assert detect_hedging(text, NO_TOOLS) is False


class TestExemptionInability:
    """Refusals handled by other detectors should be exempt."""

    @pytest.mark.parametrize("text", [
        "I can't access that host — the SSH key is rejected.",
        "I cannot modify that file because of permissions.",
        "I won't delete production data without explicit config.",
        "I will not run destructive commands on the live database.",
        "I am unable to reach the monitoring endpoint.",
    ])
    def test_inability_not_detected(self, text: str):
        assert detect_hedging(text, NO_TOOLS) is False


class TestExemptionFailureExplanation:
    """Failure explanations handled by premature_failure should be exempt."""

    @pytest.mark.parametrize("text", [
        "The error is a connection timeout on port 5432.",
        "The issue was a misconfigured DNS entry.",
        "The problem is that the certificate expired yesterday.",
        "Failed because the target directory is read-only.",
        "Error because the container image was not found.",
    ])
    def test_failure_explanation_not_detected(self, text: str):
        assert detect_hedging(text, NO_TOOLS) is False


# =========================================================================
# FALSE POSITIVES — legitimate text that must NOT trigger
# =========================================================================

class TestFalsePositives:
    """Legitimate non-hedging text that must not trigger false positives."""

    @pytest.mark.parametrize("text", [
        # Simple factual statements
        "The server is running on port 8080.",
        "Disk usage is at 72% on /dev/sda1.",
        "The container was restarted 3 minutes ago.",
        "All 12 pods are healthy and accepting traffic.",
        "CPU usage peaked at 94% during the deploy.",
        # Reporting actions taken (with tools — but also testing text-only)
        "Restarted nginx on web-01. Service is healthy.",
        "The config was updated and the service reloaded.",
        "Backup completed. 3.2 GB written to S3.",
        # Greeting / acknowledgment
        "Hello! I'm here to help with infrastructure.",
        "Got it — checking that now.",
        "Understood, looking into the logs.",
        # Questions about facts (not hedging, just asking)
        "What is the current memory usage on db-01?",
        "Where is the configuration file located?",
        "How many replicas are currently running?",
        # Error messages (handled by premature_failure, not hedging)
        "Connection refused on port 443.",
        "Timeout reached after 30 seconds.",
    ])
    def test_innocent_text_not_detected(self, text: str):
        assert detect_hedging(text, NO_TOOLS) is False


class TestFalsePositiveToolsUsed:
    """When tools were used, hedging detection must always return False."""

    @pytest.mark.parametrize("text", [
        "Shall I also check the other nodes?",
        "Would you like me to run it again?",
        "If you want, I can try a different approach.",
        "Here's the plan for the next step.",
        "Perhaps I should check the backup too.",
        "Does that sound right?",
    ])
    def test_hedging_text_ignored_when_tools_used(self, text: str):
        assert detect_hedging(text, ["run_command"]) is False


# =========================================================================
# EDGE CASES
# =========================================================================

class TestEdgeCases:
    """Boundary conditions and tricky inputs."""

    def test_mixed_hedging_and_exemption_favors_exemption(self):
        text = "I've completed the deploy. Shall I also check the logs?"
        assert detect_hedging(text, NO_TOOLS) is False

    def test_case_insensitive(self):
        assert detect_hedging("SHALL I RESTART THE SERVICE?", NO_TOOLS) is True
        assert detect_hedging("WOULD YOU LIKE ME TO CHECK?", NO_TOOLS) is True
        assert detect_hedging("perhaps i could try again.", NO_TOOLS) is True

    def test_hedging_embedded_in_long_text(self):
        text = (
            "I've analyzed the system metrics and everything looks normal. "
            "CPU is at 23%, memory at 61%, disk at 45%. No anomalies detected "
            "in the last 24 hours. Shall I set up a recurring check for you?"
        )
        assert detect_hedging(text, NO_TOOLS) is True

    def test_multiple_hedging_patterns_still_returns_true(self):
        text = "Shall I proceed? If you'd like, I can run Option 1 or Option 2."
        assert detect_hedging(text, NO_TOOLS) is True

    def test_plan_colon_at_line_start(self):
        text = "Here's what I found:\nPlan: restart nginx, then check health."
        assert detect_hedging(text, NO_TOOLS) is True

    def test_multiline_text_with_hedging_on_later_line(self):
        text = "System status looks good.\nAll services running.\nWant me to check anything else?"
        assert detect_hedging(text, NO_TOOLS) is True

    def test_hedging_with_exactly_15_chars(self):
        # "Shall I do it?" is 14 chars — below threshold
        assert detect_hedging("Shall I do it?", NO_TOOLS) is False

    def test_hedging_with_16_chars(self):
        # "Shall I do it?!" is 15 chars — at threshold
        assert detect_hedging("Shall I do it?!", NO_TOOLS) is True

    def test_empty_tools_list(self):
        assert detect_hedging("Shall I restart the service?", []) is True

    def test_tools_used_not_mutated(self):
        tools = ["run_command"]
        detect_hedging("Shall I restart?", tools)
        assert tools == ["run_command"]
