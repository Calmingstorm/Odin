"""B3 contracts/config/outcomes, and governor CLASSIFICATION ONLY.

No command in the governor section is dispatched to any execution backend.
"""
from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError

from src.config.schema import Config, ToolsConfig
from src.discord.background_task import _check_condition, _is_error_output
from src.discord.tool_catalog import ToolCatalog
from src.tools.command_shell import (
    CommandOutput,
    apply_shell_contracts,
    format_command_result,
    resolve_local_shell,
    signal_name,
)
from src.tools.execution_outcome import ToolFailure
from src.tools.registry import get_tool_definitions
from src.tools.risk_classifier import CommandGovernor, RiskLevel, classify_command


def test_config_modes_and_apply_classification():
    from src.config.apply_registry import spec_for

    assert ToolsConfig().command_shell == "auto"
    for mode in ("auto", "bash", "sh"):
        assert ToolsConfig(command_shell=mode).command_shell == mode
    with pytest.raises(ValidationError):
        ToolsConfig(command_shell="zsh")
    assert spec_for("tools.command_shell").apply_mode == "live_for_new_work"


def test_discovery_fresh_and_local_only(monkeypatch):
    import src.tools.command_shell as module

    monkeypatch.setattr(module.shutil, "which", lambda _: "/bin/bash")
    assert resolve_local_shell().name == "bash"
    monkeypatch.setattr(module.shutil, "which", lambda _: None)
    assert resolve_local_shell().name == "sh"
    assert resolve_local_shell("sh").executable == "/bin/sh"
    with pytest.raises(FileNotFoundError, match="command not executed"):
        resolve_local_shell("bash")
    with pytest.raises(ValueError):
        resolve_local_shell("invalid")


def test_cached_catalog_shell_refresh_is_not_stale(monkeypatch):
    import src.tools.command_shell as module

    config = Config(discord={"token": "test"})
    skills = MagicMock()
    skills.get_tool_definitions.return_value = []
    catalog = ToolCatalog(get_config=lambda: config, skill_manager=skills)
    monkeypatch.setattr(module.shutil, "which", lambda _: "/bin/bash")
    first = {t["name"]: t for t in catalog.merged_definitions()}
    assert "Local commands run under bash;" in first["run_command"]["description"]
    config.tools.command_shell = "sh"
    second = {t["name"]: t for t in catalog.merged_definitions()}
    assert "Local commands run under sh;" in second["run_command"]["description"]
    assert "remote account's login shell" in second["run_command"]["description"]
    assert second["run_script"]["description"] == first["run_script"]["description"]
    assert "Local command checks run under sh;" in second["validate_action"]["description"]
    assert "remote jobs run under /bin/sh." in second["manage_process"]["description"]
    assert first["run_command"]["description"].count("Local commands run under") == 1
    assert second["run_command"]["description"].count("Local commands run under") == 1
    config.tools.command_shell = "auto"
    monkeypatch.setattr(module.shutil, "which", lambda _: None)
    third = {t["name"]: t for t in catalog.merged_definitions()}
    assert "Local commands run under sh;" in third["run_command"]["description"]
    config.tools.command_shell = "bash"
    fourth = {t["name"]: t for t in catalog.merged_definitions()}
    assert (
        "are refused because bash is required but not installed;"
        in fourth["run_command"]["description"]
    )
    # Never contaminate static documentation/parity contracts with host state.
    assert "Local commands run under" not in get_tool_definitions()[0]["description"]
    dynamic = apply_shell_contracts(get_tool_definitions(), "sh")
    assert "Local commands run under" in dynamic[0]["description"]


@pytest.mark.parametrize("mode, expected", [
    ("sh", "sh"), ("bash", "bash"), ("auto", "bash"),
])
def test_registry_explicit_shell_decorates_fresh_copy_not_static_cache(monkeypatch, mode, expected):
    from src.tools import registry

    monkeypatch.setattr("src.tools.command_shell.shutil.which", lambda _: "/bin/bash")
    # Isolate cache rebuilding from catalogs retained by other tests/callers.
    monkeypatch.setattr(registry, "_tool_defs_cache", None)
    static = get_tool_definitions()
    decorated = get_tool_definitions(command_shell=mode)
    assert decorated is not static
    assert [t["name"] for t in decorated] == [t["name"] for t in static]
    tools = {t["name"]: t for t in decorated}
    assert f"Local commands run under {expected};" in tools["run_command"]["description"]
    assert "remote account's login shell" in tools["run_command"]["description"]
    assert f"New local jobs run under {expected};" in tools["manage_process"]["description"]
    assert tools["run_script"]["description"] == next(
        t for t in static if t["name"] == "run_script"
    )["description"]
    assert "Local commands run under" not in static[0]["description"]
    assert get_tool_definitions() is static
    decorated[0]["description"] = "caller-local edit"
    assert get_tool_definitions(command_shell=mode)[0]["description"] != "caller-local edit"
    registry.invalidate_tool_defs_cache()
    rebuilt = get_tool_definitions()
    assert rebuilt == static and rebuilt is not static


def test_registry_refresh_discloses_bash_unavailable_without_polluting_cache(monkeypatch):
    from src.tools import registry

    monkeypatch.setattr(registry, "_tool_defs_cache", None)
    monkeypatch.setattr("src.tools.command_shell.shutil.which", lambda _: None)
    unavailable = get_tool_definitions(command_shell="bash")
    assert (
        "New local commands are refused because bash is required but not installed;"
        in unavailable[0]["description"]
    )
    fallback = get_tool_definitions(command_shell="auto")
    assert "Local commands run under sh;" in fallback[0]["description"]
    assert "are refused because" in unavailable[0]["description"]
    assert "Local commands run under" not in get_tool_definitions()[0]["description"]


@pytest.mark.parametrize("mode,installed,shell", [
    ("bash", True, "bash"), ("sh", True, "sh"), ("bash", False, None),
    ("auto", False, "sh"),
])
def test_exact_master_description_bodies_with_only_approved_shell_sentence(
    monkeypatch, mode, installed, shell,
):
    import hashlib

    # Body hashes pinned to master a93348f0, independently of the served catalog.
    master_hashes = {
        "run_command": "2430522d4b2019ffb3f0f1229223f541d3e4f8be926a3f3e80428e2f544ea0cd",
        "run_command_multi": "7e0f40e823564650a0b1bc8a5ea2f7ea29152a77cf05577f9b40f3e60a92bd17",
        "run_script": "9790b082a6185a76c4de0fa7f0abff5c0642f6eb402d139faf8e04ab8179f770",
        "manage_process": "15b65b216c434ec2233d41fd16a406a96f41d299043d6f9dba645461bdaf68cb",
        "validate_action": "0488822d62d69c407a1d5166866c3f523a55e99fecddce09f80047159ebf95fc",
    }
    monkeypatch.setattr(
        "src.tools.command_shell.shutil.which", lambda _: "/bin/bash" if installed else None,
    )
    static = get_tool_definitions()
    if shell:
        commands = (f"Local commands run under {shell}; "
                    "remote commands use the remote account's login shell.")
        jobs = f"New local jobs run under {shell}; remote jobs run under /bin/sh."
        checks = (f"Local command checks run under {shell}; "
                  "remote command checks use the remote account's login shell.")
    else:
        commands = ("New local commands are refused because bash is required but not installed; "
                    "remote commands use the remote account's login shell.")
        jobs = ("New local jobs are refused because bash is required but not installed; "
                "remote jobs run under /bin/sh.")
        checks = ("New local command checks are refused because bash is required "
                  "but not installed; "
                  "remote command checks use the remote account's login shell.")
    clauses = {"run_command": commands, "run_command_multi": commands,
               "manage_process": jobs, "validate_action": checks, "run_script": ""}
    base = {t["name"]: t for t in static}
    served = get_tool_definitions(command_shell=mode)
    for tool in served:
        name = tool["name"]
        if name not in master_hashes:
            assert tool == base[name]
            continue
        body, separator, footer = base[name]["description"].partition("\n\n[affordances:")
        assert hashlib.sha256(body.encode()).hexdigest() == master_hashes[name]
        expected = body + (" " + clauses[name] if clauses[name] else "") + separator + footer
        assert tool == {**base[name], "description": expected}
    assert apply_shell_contracts(served, mode) == served
    # Refresh even an unavailable cached catalog without dropping its footer.
    assert apply_shell_contracts(served, "sh") == get_tool_definitions(command_shell="sh")


def test_shell_contracts_without_affordance_footer(monkeypatch):
    monkeypatch.setattr("src.tools.command_shell.shutil.which", lambda _: None)
    source = [{"name": "run_command", "description": "Body."}]
    output = apply_shell_contracts(source, "sh")
    assert output[0]["description"] == (
        "Body. Local commands run under sh; remote commands use the remote account's login shell."
    )
    assert apply_shell_contracts(output, "sh") == output
    assert source[0]["description"] == "Body."


def test_truthful_wording_workflow_consumers_and_untrusted_stdout():
    ordinary = format_command_result(7, CommandOutput("bad", shell="bash", returncode=7))
    assert ordinary.startswith("Command failed (exit 7):")
    assert _check_condition("Command failed", ordinary)
    assert _is_error_output(ordinary)
    timeout = format_command_result(0, CommandOutput(
        "handler exited cleanly", shell="bash", reason="timeout", returncode=0,
    ))
    assert isinstance(timeout, ToolFailure)
    assert timeout.startswith("Command timed out (exit 0):")
    assert not _check_condition("Command failed", timeout)
    assert _check_condition("timed out", timeout)
    assert _is_error_output(timeout)
    signalled = format_command_result(-15, CommandOutput("", shell="sh", returncode=-15))
    assert "exit -15" in signalled and "signal=SIGTERM" in signalled
    assert signal_name(-999) == "signal 999"
    assert signal_name(0) is None
    spoof = format_command_result(0, CommandOutput("Command timed out", shell="sh", returncode=0))
    assert not isinstance(spoof, ToolFailure)
    from src.tools.post_validation import Check, _evaluate

    assert _evaluate(Check(type="command", target="printf harmless"), 0,
                     CommandOutput("", shell="bash", reason="timeout", returncode=0))[0] == "fail"


# Group 7. Classification only, NO subprocess calls or execution fixtures.
@pytest.mark.parametrize("text, equivalent", [
    (r"$'\x72m' -rf /", "rm -rf /"),
    (r"$'\162m' -rf /", "rm -rf /"),
    (r"$'\u0072m' -rf /", "rm -rf /"),
    (r"$'\U00000072m' -rf /", "rm -rf /"),
    (r"r$'\x6d' -rf /", "rm -rf /"),
    (r"eval $'rm\x20-rf\x20/'", "rm -rf /"),
    (r"eval $'rm\t-rf\t/'", "rm -rf /"),
    (r"eval $'rm\cI-rf\cI/'", "rm -rf /"),
    (r"$'rm\0ignored' -rf /", "rm -rf /"),
    ("rm -rf /", "rm -rf /"),
])
def test_ansi_c_risk_classification_only(text, equivalent):
    assert classify_command(text).level == classify_command(equivalent).level


@pytest.mark.parametrize("shell", ["bash", "sh", "source", "."])
@pytest.mark.parametrize("download", ["curl -s URL", "wget -qO- URL"])
def test_remote_process_substitution_classification_only(shell, download):
    result = classify_command(f"{shell} <({download})")
    equivalent = classify_command(f"{download} | bash")
    assert result.level == equivalent.level == RiskLevel.MEDIUM
    assert result.reason == equivalent.reason == "piped script execution"


@pytest.mark.parametrize("text", [
    r"printf '%s' $'a\n\t\x41é'", r"printf '%s' $'\z\x\u\U'",
    r"printf '%s' $'\a\b\e\E\f\r\v\\\'\"\?'",
    r"printf '%s' $'\Uffffffff'", r"printf '%s' $'\c?'", r"printf '%s' $'\cß'",
    r'''printf '%s' "$'letter'"''', r"printf '%s' '$\x41'",
    r"printf '%s' \$'letter'", r"printf '%s' $'unterminated",
    r'''printf '%s' "$(printf '%s' $'\x41')"''',
])
def test_harmless_ansi_c_classification_only(text):
    assert classify_command(text).level == RiskLevel.LOW


@pytest.mark.parametrize(("text", "risk"), [
    ("printf '%s' {one,two}", RiskLevel.LOW),
    ("cat <(printf harmless)", RiskLevel.LOW),
    ("rm -rf /{,tmp}", RiskLevel.CRITICAL),
    ("{rm,printf} -rf /", RiskLevel.CRITICAL),
    ("r{m,sync} -rf /", RiskLevel.CRITICAL),
    ("echo <(mkfs /dev/sda)", RiskLevel.CRITICAL),
    ("cat <(rm -rf /)", RiskLevel.CRITICAL),
    ("cat >(dd if=/dev/zero of=/dev/sda)", RiskLevel.CRITICAL),
    ("printf '%s' \"$(mkfs /dev/sda)\"", RiskLevel.CRITICAL),
    ("{poweroff,printf} now", RiskLevel.CRITICAL),
    ("cat <(poweroff)", RiskLevel.CRITICAL),
    ("cat <(reboot)", RiskLevel.CRITICAL),
    ("cat <(shutdown now)", RiskLevel.CRITICAL),
    ("cat >(poweroff)", RiskLevel.CRITICAL),
    ("cat <({poweroff,printf} now)", RiskLevel.CRITICAL),
    ("cat <(chmod 777 -R /)", RiskLevel.CRITICAL),
    ("r{m..m} -rf /", RiskLevel.CRITICAL),
    ("{poweroff,printf} now " + "{a,b}" * 6, RiskLevel.CRITICAL),
])
def test_new_bash_syntax_classification_only(text, risk):
    assert classify_command(text).level == risk
    governor = CommandGovernor(admin_can_override=False)
    result = governor.check(text, user_tier="admin", host="localhost")
    assert result.allowed is (risk != RiskLevel.CRITICAL)


def test_brace_budget_classification_only():
    text = "printf '" + "{a,b}" * 6 + "'"
    assert classify_command(text).level == RiskLevel.LOW
    assert CommandGovernor(admin_can_override=False).check(text).allowed


# These strings are classifier inputs only. Never dispatch them to a shell.
@pytest.mark.parametrize("text", [
    "r{m..m..1} -rf /",
    "r{m..m..2} -rf /",
    "r{m..m..+2} -rf /",
    "r{m..m..-2} -rf /",
    "r{m..m..0} -rf /",
    "r{l..n} -rf /",
    "r{n..l..-1} -rf /",
    "r{l..n..+1} -rf /",
    "r{m..o..2} -rf /",
    "chmod {777..777..2} /",
    "chmod {778..776..-1} /",
    "init {0..0..-2}",
    "r{m..{m,n}..2} -rf /",
    "r{{m..m..2},sync} -rf /",
    "r{m,{n..l..-1}} -rf /",
    "r{m..m..9999999999999999999999999} -rf /",
])
def test_brace_range_destructive_classification_only(text):
    assert classify_command(text).level == RiskLevel.CRITICAL
    assert not CommandGovernor(admin_can_override=False).check(text).allowed


@pytest.mark.parametrize("text", [
    "printf {0..999999999999999999999999999999}",
    "printf {1..1..-9223372036854775808}",
    "printf {a..Z}",  # Active cross-case character range is unsupported.
    "printf {+1..+1}",
    "printf " + "{0..0}" * 33,  # Singleton work also has a finite budget.
    "printf " + "{x," * 33 + "{m..m..2}" + "}" * 33,
])
def test_brace_range_bounds_fail_closed_classification_only(text):
    result = classify_command(text)
    assert result.level == RiskLevel.CRITICAL
    assert "brace expansion" in result.reason


@pytest.mark.parametrize("text", [
    "r'{m..m..2}' -rf /",
    'r"{m..m..-2}" -rf /',
    r"r\{m..m..2\} -rf /",
    r"r{m\.\.m..2} -rf /",
    "r{m..'m'..2} -rf /",
    "printf '" + "{0..999999999999999999999999999999}" * 40 + "'",
    'printf "$HOME' + "{0..999999999999999999999999999999}" * 40 + '"',
    'printf "$(printf harmless) {0..999999999999999999999999999999}"',
    'printf "`printf harmless` {a..z}{a..z}"',
    'printf "$(printf \'{0..999999999999999999999999999999}\')"',
    'printf "quoted \\"' + "{a..z}" * 40 + '"',
    "printf {1..a}",  # Invalid mixed range stays literal.
    "printf {a..b..nope}",
    "r{l..n..2} -rf /",  # Stride skips m, do not synthesize rm.
])
def test_brace_range_inactive_or_harmless_classification_only(text):
    assert classify_command(text).level == RiskLevel.LOW


@pytest.mark.parametrize(("source", "expected"), [
    ("{m..m..2}", ["m"]),
    ("{a..e..-2}", ["a", "c", "e"]),
    ("{e..a..+2}", ["e", "c", "a"]),
    ("{1..5..-2}", ["1", "3", "5"]),
    ("{5..1..+2}", ["5", "3", "1"]),
    ("{-2..2..2}", ["-2", "0", "2"]),
    ("{01..05..2}", ["01", "03", "05"]),
    ("{0777..0777}", ["0777"]),
    ("{-02..02..2}", ["-02", "000", "002"]),
    ("{1..3..0}", ["1", "2", "3"]),
    ("{0..31}", [str(i) for i in range(32)]),
    ("{m..{m,n}..2}", ["m"]),
    ("{a,{b,c}}", ["a", "b", "c"]),
    ("{0..0}" * 32, ["0" * 32]),
])
def test_brace_range_literal_semantics_without_shell(source, expected):
    from src.tools.risk_classifier import _brace_candidates

    assert _brace_candidates(source) == expected


@pytest.mark.parametrize("text", [
    'printf "$(r{m..m..2} -rf /)"',
    'printf "`r{m..m..-2} -rf /`"',
    'printf "$(printf \'quoted )\'; $(r{m..m..2} -rf /))"',
    'printf "$(printf \'quoted )\')"; r{m..m..2} -rf /',
])
def test_brace_range_inside_quoted_substitution_classification_only(text):
    assert classify_command(text).level == RiskLevel.CRITICAL


@pytest.mark.parametrize("text", [
    "echo {1..100}", "for i in {1..40}; do echo $i; done",
    "touch /tmp/x/f{1..50}.txt", "echo {a..z}{a..z}",
    "echo {01..100}", "echo {100..1..-2}", "echo {a..z..2}",
    "printf {0..32}", "printf {1..9223372036854775807}",
])
def test_large_harmless_ranges_classification_only(text):
    assert classify_command(text).level == RiskLevel.LOW


@pytest.mark.parametrize("text", [
    "reboot {1..100}", "{a..z}{a..z} -rf /",
    "chmod {1..1000} /", "init {-100..100}",
])
def test_large_dangerous_ranges_classification_only(text):
    assert classify_command(text).level == RiskLevel.CRITICAL
