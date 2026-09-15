"""Inventory never repairs unattributed compositor input as a side effect."""

import subprocess
from pathlib import Path

import pytest

from src.computer.error_guidance import guidance
from src.computer.runtime.hyprland_scope import HyprlandScopeFailure
from tests.test_computer_hyprland_scope_r32 import server


@pytest.mark.parametrize("reason", [
    "inventory-environment-unavailable", "inventory-scope-armed",
    "inventory-seat-button-held", "inventory-device-input-held-or-unavailable",
    "lock-or-input-held",
])
async def test_native_inventory_refusal_reaches_caller(tmp_path, reason):
    def reply(request):
        assert request == {"op": "inventory_targets"}
        return {"ok": False, "error": reason}

    listener, provider = await server(tmp_path, reply)
    async with listener:
        try:
            expected = "^hyprland_" + reason.replace("-", "_") + "$"
            with pytest.raises(HyprlandScopeFailure, match=expected):
                await provider.inventory_targets()
        finally:
            await provider.close()


def test_seat_button_guidance_does_not_prescribe_reload_or_unowned_release():
    result = guidance("hyprland_inventory_seat_button_held")
    assert result["terminal"] and not result["replay_permitted"]
    assert "owner can deliberately press and release" in result["instruction"]
    assert "Plugin reload alone does not clear it" in result["instruction"]
    assert "outstanding release" in result["instruction"]
    assert "RELEASE-ALL" not in result["instruction"]


def test_compiled_inventory_guards_preserve_all_refusals_without_mutation(tmp_path):
    # Compile the actual production guard body with read-only manager doubles.
    # Replacing a guard with a mutation cannot compile against these doubles.
    root = Path(__file__).resolve().parents[1]
    source = (root / "assets/hyprland-input/scope-plugin.cpp").read_text()
    body = source.split("    J inventoryTargets() {", 1)[1]
    guards = body.split("        focusCandidates.clear();", 1)[0]
    code = r'''
#include <cassert>
#include <string>
struct Manager {
    const bool held;
    bool hasHeldButtons() const { return held; }
};
struct Inventory {
    const bool ready, armed, held;
    const Manager* const g_pInputManager;
    bool environment() const { return ready; }
    bool inputHeld() const { return held; }
    std::string status(bool, const char* error) const { return error; }
    std::string inventoryTargets() const {
''' + guards + r'''
        return "ok";
    }
};
int main() {
    for (bool ready : {false, true}) for (bool armed : {false, true})
    for (bool button : {false, true}) for (bool other : {false, true}) {
        const Manager manager{button};
        const Inventory inventory{ready, armed, button || other, &manager};
        const auto expected = !ready ? "inventory-environment-unavailable" :
            armed ? "inventory-scope-armed" : button ? "inventory-seat-button-held" :
            other ? "inventory-device-input-held-or-unavailable" : "ok";
        assert(inventory.inventoryTargets() == expected);
        assert((inventory.inventoryTargets() == "ok") == (ready && !armed && !button && !other));
    }
}
'''
    path = tmp_path / "inventory.cpp"
    path.write_text(code)
    binary = tmp_path / "inventory"
    subprocess.run(
        ["c++", "-std=c++23", "-Wall", "-Wextra", "-Werror", str(path), "-o", str(binary)],
        check=True,
    )
    subprocess.run([str(binary)], check=True)
