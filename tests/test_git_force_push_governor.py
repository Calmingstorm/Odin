"""Focused policy tests for literal unconditional Git force pushes."""

from __future__ import annotations

import pytest

from src.tools.risk_classifier import (
    CommandGovernor,
    RiskLevel,
    classify_command,
    detect_unconditional_git_force_push,
)


@pytest.mark.parametrize(
    ("command", "form"),
    [
        ("git push --force origin main", "--force"),
        ("git push origin --force main", "--force"),
        ("git push --force=true origin main", "--force"),
        ("git push -f origin main", "-f"),
        ("git push -uf origin main", "-f"),
        ("git -C /srv/repo push -fu origin main", "-f"),
        ("/usr/bin/git push origin +HEAD:main", "force-prefixed refspec"),
        ("git push -- origin +refs/heads/main:refs/heads/main", "force-prefixed refspec"),
        ("cd /srv/repo && git push --force origin main", "--force"),
        ("printf done;\ngit push -f origin main", "-f"),
        ("sudo -u deploy git push --force origin main", "--force"),
        ("env GIT_SSH_COMMAND=ssh git push origin +main:main", "force-prefixed refspec"),
        ("git push --force-with-lease=main:abc --force origin main", "--force"),
        ("git push --force-with-lease origin +main:main", "force-prefixed refspec"),
    ],
)
def test_detects_unconditional_force_variants(command: str, form: str) -> None:
    assert detect_unconditional_git_force_push(command) == form


@pytest.mark.parametrize(
    "command",
    [
        "git push origin main",
        "git push --force-with-lease origin main",
        "git push --force-with-lease=refs/heads/main:abc origin HEAD:main",
        "git push --force-if-includes origin main",
        "git config push.default current --force",
        "echo git push --force origin main",
        "printf '%s' 'git push -f origin main'",
        "git push -- --force",
        "git push origin refs/heads/feature+one:refs/heads/feature+one",
        "git push origin main # --force",
        "git push -of origin main",
        "git push +origin main",
    ],
)
def test_does_not_confuse_lease_text_or_non_commands(command: str) -> None:
    assert detect_unconditional_git_force_push(command) is None


@pytest.mark.parametrize(
    "command",
    [
        "git push --force origin main",
        "git push -f origin main",
        "git push origin +main:main",
        "git push --force-with-lease=main:abc --force origin main",
    ],
)
def test_governor_blocks_for_every_tier_and_host_policy(command: str) -> None:
    governor = CommandGovernor(
        admin_can_override=True,
        host_overrides={"prod": "strict"},
    )

    for tier, host in ((None, None), ("user", "dev"), ("admin", "prod")):
        result = governor.check(command, user_tier=tier, host=host)
        assert result.allowed is False
        assert result.risk == RiskLevel.HIGH
        assert "unconditional git force push" in result.reason
        assert "--force-with-lease=<destination>:<observed-sha>" in result.suggestion


def test_explicit_lease_remains_allowed_and_is_not_misclassified_as_force() -> None:
    command = (
        "git -C /repo push "
        "--force-with-lease=refs/heads/main:0123456789abcdef "
        "origin 89abcdef:refs/heads/main"
    )
    governor = CommandGovernor(host_overrides={"prod": "strict"})

    result = governor.check(command, user_tier="user", host="prod")

    assert result.allowed is True
    assert result.risk == RiskLevel.MEDIUM
    assert classify_command(command).reason == "git push"


def test_mixed_lease_and_force_is_still_blocked() -> None:
    result = CommandGovernor().check(
        "git push --force-with-lease=main:abc -f origin main"
    )

    assert result.allowed is False
    assert "(-f)" in result.reason


def test_force_push_rule_survives_admin_override_of_other_critical_content() -> None:
    result = CommandGovernor(admin_can_override=True).check(
        "rm -rf / && git push -f origin main",
        user_tier="admin",
    )

    assert result.allowed is False
