#pragma once
#include <cstdint>
#include <set>
#include <vector>
#include <array>
#include <cmath>
namespace odin_scope {
struct NativeAncestor {
    uintptr_t token;
    int64_t pid, uid;
    bool operator==(const NativeAncestor&) const = default;
};
// Credentials must come from wl_client, never app_id/title/properties.
struct PopupAncestor {
    uintptr_t surface, xdg, role, client, parent;
    bool live, popup;
    std::array<double, 8> geometry;
    bool operator==(const PopupAncestor&) const = default;
};
inline bool valid_popup_ancestry(const std::vector<PopupAncestor>& chain, uintptr_t root, uintptr_t client) {
    if (!root || !client || chain.empty() || chain.size() > 33) return false;
    std::set<uintptr_t> seen;
    for (size_t i = 0; i < chain.size(); ++i) {
        const auto& n = chain[i];
        if (!n.surface || !n.xdg || !n.role || !n.live || n.client != client || !seen.insert(n.surface).second) return false;
        for (double v : n.geometry) if (!std::isfinite(v)) return false;
        if (i + 1 == chain.size()) {
            if (n.surface != root || n.popup || n.parent) return false;
        } else if (!n.popup || n.surface == root || n.parent != chain[i + 1].xdg ||
                   n.geometry[2] <= 0 || n.geometry[3] <= 0 || n.geometry[6] <= 0 || n.geometry[7] <= 0) return false;
    }
    return true;
}
inline bool valid_ancestry(const std::vector<NativeAncestor>& chain) {
    if (chain.empty() || chain.size() > 33 || chain.front().pid <= 1 || chain.front().uid < 0) return false;
    std::set<uintptr_t> seen;
    for (const auto& node : chain)
        if (!node.token || node.pid != chain.front().pid || node.uid != chain.front().uid || !seen.insert(node.token).second) return false;
    return true;
}
}
