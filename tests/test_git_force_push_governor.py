"""Focused policy tests for literal unconditional Git force pushes."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

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
    ("command", "form"),
    [
        ("git push -f origin main\\", None),
        ('git push "--force\\q" origin main', None),
        ('git push "--force origin main', None),
        ("sudo -- git push -f origin main", "-f"),
        ("sudo -n git push -f origin main", "-f"),
        ("command -p git push -f origin main", "-f"),
        ("git -- push -f origin main", None),
        ("git --no-pager push -f origin main", "-f"),
        ("git push --push-option marker origin main", None),
        ("git push --repo origin +main:main", "force-prefixed refspec"),
        ("git push -o marker origin main", None),
    ],
)
def test_parser_boundary_cases(command: str, form: str | None) -> None:
    assert detect_unconditional_git_force_push(command) == form


def test_wrapper_without_an_executable_is_low_risk() -> None:
    for command in ("env", "sudo -n", "git --no-pager"):
        assessment = classify_command(command)
        assert assessment.level == RiskLevel.LOW
        assert "force push" not in assessment.reason


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


# Shared corpus: review reproductions checked as pure policy decisions and
# through every shell dispatch handler. Execution is always mocked.
_REVIEW_CASES = [
    ("echo ready # prepare\ngit push --force origin main", "--force"),
    ("git push \\\n --force origin main", "--force"),
    ("git push origin feature#123 --force", "--force"),
    ("if false; then echo no; else git push -f origin main; fi", "-f"),
    ("env -u GIT_DIR git push --force origin main", "--force"),
    ("env --unset GIT_DIR git push -f origin main", "-f"),
    ("env -C /repo git push origin +HEAD:main", "force-prefixed refspec"),
    ("printf '%s\\n' ';' 'git' 'push' '--force'", None),
    ("printf '%s\\n' '&&' 'git' 'push' '--force'", None),
    ("printf '%s\\n' '\n' 'git' 'push' '--force'", None),
    (r"printf '%s\n' \; git push --force", None),
    ("printf '%s\\n' ';' ; git push --force origin main", "--force"),
    ("echo ''#literal\ngit push -f origin main", "-f"),
    ("echo '#not a comment'; git push -f origin main", "-f"),
    ("# comment with a trailing \\\ngit push -f origin main", "-f"),
    ("git push origin main # --force", None),
    ("git push origin main # comment \\\n --force", None),
    ("gi\\\nt pu\\\nsh --fo\\\nrce origin main", "--force"),
    ('git push "--fo\\\nrce" origin main', "--force"),
    ("git push '--fo\\\nrce' origin main", None),
    ("'git' pu'sh' '--force' origin main", "--force"),
    ("git push origin feature\\#123 --force", "--force"),
    ("'else' git push --force origin main", None),
    (r"\else git push --force origin main", None),
    ("'' git push --force origin main", None),
    ("env --chdir /repo --unset GIT_DIR git push -f origin main", "-f"),
    ("env --unset=GIT_DIR --chdir=/repo git push -f origin main", "-f"),
    ("env -uGIT_DIR -C/repo git push -f origin main", "-f"),
    ("env -u git git push -f origin main", "-f"),
    ("env -u git echo push --force origin main", None),
    ("env -C git echo push --force origin main", None),
    ("env -- GIT_DIR=/repo git push -f origin main", "-f"),
    ("sudo -u deploy env -C /repo -u GIT_DIR git push -f origin main", "-f"),
    ("git push \\\n --force-with-lease=main:abc origin main", None),
    ("echo ready # prepare\ngit push --force-with-lease origin main", None),
    ("if false; then echo no; else git push --force-with-lease origin main; fi", None),
    ("env -u GIT_DIR git push --force-with-lease origin main", None),
    ("env --unset GIT_DIR git push --force-with-lease origin main", None),
    ("env -C /repo git push --force-with-lease=main:abc origin main", None),
    ("git push origin feature#123 --force-with-lease", None),
    ("env -u GIT_DIR git push --force-with-lease -f origin main", "-f"),
]


@pytest.mark.parametrize(("command", "form"), _REVIEW_CASES)
def test_review_regressions_pure_policy(command: str, form: str | None) -> None:
    assert detect_unconditional_git_force_push(command) == form
    governor = CommandGovernor(admin_can_override=True)
    for tier in ("user", "admin"):
        result = governor.check(command, user_tier=tier)
        assert result.allowed is (form is None)
        if form is not None:
            assert classify_command(command).reason == f"unconditional git force push ({form})"


@pytest.mark.parametrize(("command", "form"), _REVIEW_CASES)
@pytest.mark.parametrize(
    "route",
    ["run_command", "run_script", "run_command_multi", "manage_process"],
)
async def test_review_regressions_mocked_handlers(
    command: str, form: str | None, route: str, tmp_path,
) -> None:
    from src.config.schema import ToolHost, ToolsConfig
    from src.tools.executor import ToolExecutor

    config = ToolsConfig(hosts={"dev": ToolHost(address="127.0.0.1", ssh_user="root")})
    executor = ToolExecutor(config=config, memory_path=str(tmp_path / "memory.json"))
    executor._exec_command = AsyncMock(return_value=(0, "mock execution"))
    executor._run_on_host = AsyncMock(return_value="mock execution")
    registry = MagicMock()
    registry.start = AsyncMock(return_value="mock execution")
    registry.start_remote = AsyncMock(return_value="mock execution")
    executor._process_registry = registry

    payload = {"host": "dev", "command": command}
    if route == "run_script":
        payload = {"host": "dev", "script": command, "interpreter": "bash"}
    elif route == "run_command_multi":
        payload = {"hosts": ["dev"], "command": command}
    elif route == "manage_process":
        payload["action"] = "start"
    handler = getattr(executor.system_tools, f"_handle_{route}")
    result = await handler(payload)
    text = result[0] if isinstance(result, tuple) else result
    mocks = [executor._exec_command, executor._run_on_host, registry.start, registry.start_remote]
    if form is not None:
        assert "unconditional git force push" in text
        for dispatch in mocks:
            dispatch.assert_not_awaited()
    else:
        assert "mock execution" in text
        assert sum(dispatch.await_count for dispatch in mocks) == 1
