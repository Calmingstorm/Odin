"""Independent review probes; command strings never reach a real transport."""
import pytest

from src.tools.risk_classifier import CommandGovernor, RiskLevel, classify_command


@pytest.mark.parametrize("options", [
    "--now", "--no-reload", "--show-transaction", "-T", "--legend=false",
    "--no-warn", "--failed", "--reverse", "--with-dependencies",
    "-P ActiveState", "-s TERM", "--check-inhibitors=no", "-i",
    "--image-policy=trusted", "--boot-loader-menu=10", "--boot-loader-entry=fixture",
    "--what=cache", "--kill-value=1", "--drop-in=fixture", "--when=now",
    "--read-only", "--mkdir", "--firmware-setup",
])
def test_standard_systemctl_options_preserve_lifecycle_risk(options):
    governor = CommandGovernor(host_overrides={"lab": "strict"})
    command = f"systemctl {options} restart example.service"
    assert classify_command(command).level == RiskLevel.HIGH
    assert not governor.check(command, host="lab").allowed
    assert classify_command(f"systemctl {options} reload example.service").level == RiskLevel.MEDIUM
    # Existing broad mkdir risk remains deliberately conservative.
    expected_status = RiskLevel.MEDIUM if options == "--mkdir" else RiskLevel.LOW
    assert classify_command(f"systemctl {options} status example.service").level == expected_status
