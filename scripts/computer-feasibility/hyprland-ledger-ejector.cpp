/* NON-SHIPPING isolated Phase3 helper, same exact Hyprland pin as ledger.
 * Build with the same C++23/shared/PIC/pkg-config flags as the ledger plugin.
 * Load alongside victim, then: hyprctl dispatch odin-phase3-simulated-eject
 * This invokes the core eject=true branch but SIMULATES its trigger. It does
 * NOT demonstrate a spontaneous runtime failure or fatal compositor recovery.
 * The real init exception proof is ODIN_PHASE3_INIT_THROW=1, always pre-arm.
 */
#include <hyprland/src/plugins/PluginAPI.hpp>
#include <hyprland/src/plugins/PluginSystem.hpp>
#include <hyprland/src/managers/KeybindManager.hpp>
#include <cstdio>
#include <stdexcept>

APICALL EXPORT std::string PLUGIN_API_VERSION() { return HYPRLAND_API_VERSION; }
APICALL EXPORT PLUGIN_DESCRIPTION_INFO PLUGIN_INIT(HANDLE handle) {
    constexpr auto PIN = "39d7e209c79d451efab1b21151d5938289da838d";
    constexpr auto COMMAND = "odin-phase3-simulated-eject";
    if (HyprlandAPI::getHyprlandVersion(handle).hash != PIN || std::string(GIT_COMMIT_HASH) != PIN ||
        std::string(__hyprland_api_get_hash()) != __hyprland_api_get_client_hash())
        throw std::runtime_error("Phase3 ejector exact pin mismatch");
    if (g_pKeybindManager->m_dispatchers.contains(COMMAND)) throw std::runtime_error("ejector dispatcher collision");
    if (!HyprlandAPI::addDispatcherV2(handle, COMMAND, [](std::string input) -> SDispatchResult {
        if (!input.empty()) return {.success = false, .error = "no arguments permitted"};
        CPlugin* victim = nullptr;
        for (auto* plugin : g_pPluginSystem->getAllPlugins()) {
            if (plugin->m_name != "odin-phase3-ledger") continue;
            if (victim) return {.success = false, .error = "ambiguous victim"};
            victim = plugin;
        }
        if (!victim) return {.success = false, .error = "victim not loaded"};
        std::fprintf(stderr, "[odin-phase3-ejector] SIMULATED EJECT invoking unloadPlugin(victim,true)\n");
        g_pPluginSystem->unloadPlugin(victim, true);
        // Never dereference victim again: core has erased its object and DSO.
        std::fprintf(stderr, "[odin-phase3-ejector] SIMULATED EJECT returned\n");
        return {.success = true, .error = "simulated-eject returned; inspect receiver and core health"};
    })) throw std::runtime_error("ejector dispatcher registration failed");
    return {"odin-phase3-ejector", "NON-shipping simulated-eject test helper", "Odin", "0.0.1-proof"};
}
APICALL EXPORT void PLUGIN_EXIT() {}
