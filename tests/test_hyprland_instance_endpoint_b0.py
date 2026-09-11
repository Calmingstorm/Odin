"""Source-only B0 contract for instance-scoped Hyprland scope endpoints.

No display, plugin or active compositor is opened by these checks.
"""

from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "assets/hyprland-input/scope-plugin.cpp"


def test_instance_endpoint_is_plugin_derived_and_legacy_is_optional_compatible():
    text = SOURCE.read_text()
    assert 'std::ifstream input("/proc/self/stat")' in text
    assert 'std::ifstream input("/proc/sys/kernel/random/boot_id")' in text
    assert 'instanceID = "i1-" + instanceToken(compositorBootID, compositorStartTicks)' in text
    assert 'std::string material = "odin-hyprland-instance-v1";' in text
    assert text.count("material.push_back('\\0');") == 3
    assert 'material += boot;' in text
    assert 'material += std::to_string(getpid());' in text
    assert 'material += start;' in text
    assert 'sha256(material)' in text
    assert '"/odin-hyprland-scope-" + instanceID + ".sock"' in text
    assert 'legacyPath = std::string(runtime) + "/odin-hyprland-scope.sock"' in text
    assert 'legacyListener = bindListener(legacyPath, legacyListenerSource, true);' in text
    assert 'legacyEndpointStatus = "available";' in text
    assert 'a legacy collision is a compatibility report rather' in text


def test_instance_endpoint_and_legacy_path_never_unlink_an_occupied_socket():
    text = SOURCE.read_text()
    assert "Do not record a path until bind succeeds" in text
    assert "legacySocketPath = legacyPath;" in text
    assert 'unlink(legacySocketPath.c_str())' in text
    assert 'unlink(instanceSocketPath.c_str())' in text
    assert 'const int failure = errno;' in text
    assert 'failure == EADDRINUSE ? "occupied" : "unavailable"' in text


def test_primary_endpoint_does_not_require_legacy_listener_and_reports_compatibility():
    text = SOURCE.read_text()
    assert (
        'if (!instanceListenerSource || !timer || '
        'wl_event_source_timer_update(timer, 10))'
        in text
    )
    assert '"legacy_endpoint_available"' in text
    assert '"legacy_endpoint_status"' in text


def test_status_attests_instance_not_unproven_plugin_elf():
    text = SOURCE.read_text()
    for field in (
        '"scope_protocol_version"', '"instance_id"', '"compositor_pid"',
        '"compositor_uid"', '"compositor_start_ticks"', '"boot_id"',
        '"companion_build_id"',
    ):
        assert field in text
    assert '"plugin_sha256"' not in text
    assert "not an\n        // ELF measurement" in text
