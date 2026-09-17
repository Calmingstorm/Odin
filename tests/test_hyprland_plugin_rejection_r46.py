"""R46 rejection diagnostics contracts using a synthesized C++ State only.

These compile the diagnostic fragment extracted from the plugin source.  They
exercise bounded accounting, not a compositor, hook ABI, or live input proof.
"""

import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "assets/hyprland-input/scope-plugin.cpp"


def _source() -> str:
    return PLUGIN.read_text(encoding="utf-8")


def _state_diagnostic_fragment(source: str) -> tuple[str, str]:
    reject = re.search(
        r"    void reject\(const char\* guard\) noexcept \{\n"
        r"(?:        .*\n)+?    \}\n",
        source,
    )
    assert reject, "State::reject diagnostic helper disappeared"
    reset = re.search(
        r"        rejectionGuards\.fill\(nullptr\); rejectionBase = rejected;",
        source,
    )
    assert reset, "arm no longer starts a fresh rejection diagnostic window"
    return reject.group(0), reset.group(0).strip()


@pytest.fixture(scope="module")
def diagnostic_binary(tmp_path_factory):
    compiler = shutil.which("c++") or shutil.which("g++") or shutil.which("clang++")
    assert compiler, "a C++ compiler is required for extracted plugin contracts"
    reject, reset = _state_diagnostic_fragment(_source())
    build = tmp_path_factory.mktemp("hyprland-plugin-rejection-r46")
    source = build / "rejection.cpp"
    binary = build / "rejection"
    source.write_text(
        """#include <array>
#include <cassert>
#include <cstdint>
#include <cstring>
#include <string_view>

struct State {
    std::array<const char*, 8> rejectionGuards{};
    uint64_t rejectionBase = 0;
    uint64_t rejected = 0;
"""
        + reject
        + """    void armDiagnostics() {
        """
        + reset
        + """
    }
};

int main(int argc, char** argv) {
    assert(argc == 2);
    State state;
    const std::string_view scenario(argv[1]);
    if (scenario == "bounded") {
        for (unsigned i = 0; i < 10; ++i) {
            state.reject(i == 0 ? "one" : i == 7 ? "eight" : "other");
        }
        assert(state.rejected == 10);
        assert(state.rejectionBase == 0);
        assert(std::strcmp(state.rejectionGuards[0], "one") == 0);
        assert(std::strcmp(state.rejectionGuards[7], "eight") == 0);
        assert(state.rejected - state.rejectionBase > state.rejectionGuards.size());
        return 0;
    }
    if (scenario == "preserved") {
        state.reject("first");
        state.reject("second");
        // Synthetic teardown/revoke state changes must not rewrite evidence.
        const bool armed = false;
        (void)armed;
        assert(state.rejected == 2);
        assert(std::strcmp(state.rejectionGuards[0], "first") == 0);
        assert(std::strcmp(state.rejectionGuards[1], "second") == 0);
        return 0;
    }
    if (scenario == "arm-reset") {
        state.reject("old");
        state.reject("older");
        state.armDiagnostics();
        assert(state.rejectionBase == 2);
        for (const char* guard : state.rejectionGuards) assert(guard == nullptr);
        state.reject("new");
        assert(state.rejected == 3);
        assert(std::strcmp(state.rejectionGuards[0], "new") == 0);
        assert(state.rejectionGuards[1] == nullptr);
        assert(!(state.rejected - state.rejectionBase > state.rejectionGuards.size()));
        return 0;
    }
    return 2;
}
""",
        encoding="utf-8",
    )
    subprocess.run(
        [compiler, "-std=c++20", "-Wall", "-Wextra", "-Werror", str(source), "-o", str(binary)],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    return binary


@pytest.mark.parametrize("scenario", ["bounded", "preserved", "arm-reset"])
def test_extracted_rejection_diagnostics_are_bounded_and_reset_on_arm(diagnostic_binary, scenario):
    """The compiled fragment is real source text, in a synthesized State context."""
    result = subprocess.run(
        [str(diagnostic_binary), scenario],
        check=True,
        capture_output=True,
        text=True,
        timeout=5,
        env={
            key: value
            for key, value in os.environ.items()
            if key not in {"DISPLAY", "WAYLAND_DISPLAY"}
        },
    )
    assert result.stdout == ""
    assert result.stderr == ""


def test_all_rejection_counter_increments_are_routed_through_reject():
    source = _source()
    bare_increments = re.findall(r"(?<![.\w])\+\+rejected\b|\brejected\+\+", source)
    member_increments = re.findall(r"(?:\+\+s\.rejected|s\.rejected\+\+)", source)
    assert bare_increments == ["++rejected"]
    assert member_increments == []
    reject, _ = _state_diagnostic_fragment(source)
    assert "++rejected;" in reject


def test_actual_hook_refusal_ordering_and_guard_names_are_source_pinned():
    source = _source()
    expected_guards = {
        "onKey": ["key-device-mismatch"],
        "onMod": ["modifier-device-mismatch"],
        "onButton": ["button-device-mismatch", "button-destination-refused"],
        "onAxis": ["axis-device-mismatch", "axis-destination-refused"],
        "onMotion": ["motion-device-mismatch", "motion-destination-refused"],
        "onWarp": [
            "warp-device-mismatch",
            "warp-destination-unknown",
            "warp-positioning-input-held",
            "warp-post-scope-changed",
            "warp-post-pointer-focus-mismatch",
            "warp-post-destination-changed",
        ],
    }
    for hook, guards in expected_guards.items():
        start = source.index(f"void {hook}(")
        following = source.find("\nvoid ", start + 1)
        body = source[start:following if following != -1 else None]
        positions = [body.index(f'"{guard}"') for guard in guards]
        assert positions == sorted(positions), hook
        assert "++s.rejected" not in body

    key_start = source.index("void onKey(")
    key_end = source.index("\nvoid onMod(", key_start)
    key = source[key_start:key_end]
    assert (
        "if (k != s.keyboard || !s.allow()) {\n"
        "        if (k != s.keyboard) s.reject(\"key-device-mismatch\");"
    ) in key

    button_start = source.index("void onButton(")
    button_end = source.index("\nvoid onAxis(", button_start)
    button = source[button_start:button_end]
    mismatch = button.index('s.reject("button-device-mismatch")')
    destination = button.index('s.reject("button-destination-refused")')
    assert mismatch < destination
    assert "if (p != s.pointer || !s.allow())" in button
    assert "if (event.state != WL_POINTER_BUTTON_STATE_PRESSED" in button


def test_teardown_preserves_the_first_eight_diagnostic_slots_without_new_semantics():
    source = _source()
    revoke_start = source.index("    void revoke(")
    revoke_end = source.index("    J status(", revoke_start)
    revoke = source[revoke_start:revoke_end]
    assert "rejectionGuards" not in revoke
    assert "rejectionBase" not in revoke
    assert "rejected" not in revoke

    status_start = source.index("    J status(")
    status_end = source.index("    J snapshot(", status_start)
    status = source[status_start:status_end]
    assert 'put(j.get(), "rejection_base", int64_t(rejectionBase));' in status
    assert (
        'put(j.get(), "rejection_overflow", rejected - rejectionBase > rejectionGuards.size());'
        in status
    )
    assert '("rejection_guard_" + std::to_string(i + 1)).c_str()' in status
