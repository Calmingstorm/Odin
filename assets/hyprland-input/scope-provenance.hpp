#pragma once
#include <cstdint>
#include <set>
#include <vector>
#include <array>
#include <cmath>
#include <string>
namespace odin_scope {
struct ApplicationIdentity {
    uintptr_t client = 0;
    int64_t pid = 0, uid = -1;
    std::string startTicks, executable, incarnation, output;
    uint64_t device = 0, inode = 0;
    bool operator==(const ApplicationIdentity&) const = default;
};
inline bool same_application(const ApplicationIdentity& a, const ApplicationIdentity& b) {
    return a.client && a.pid > 1 && a.uid >= 0 && !a.startTicks.empty() &&
        !a.executable.empty() && !a.incarnation.empty() && !a.output.empty() &&
        a.device && a.inode && a == b;
}
inline bool group_refresh_allowed(bool armed, bool failed, bool keys, bool buttons,
                                  bool modifiers, bool unknown, bool continuity) {
    return !armed && !failed && !keys && !buttons && !modifiers && !unknown && continuity;
}
inline bool group_target_binding(uint64_t capturedEpoch, uint64_t liveEpoch, int64_t requestedEpoch,
                                 const std::string& capturedToken, const std::string& liveToken) {
    return requestedEpoch > 0 && capturedEpoch == liveEpoch &&
        uint64_t(requestedEpoch) == liveEpoch && !capturedToken.empty() && capturedToken == liveToken;
}
inline bool bounded_group_members(const std::vector<std::string>& members, const std::string& selected) {
    if (members.empty() || members.size() > 32 || selected.empty()) return false;
    std::set<std::string> seen;
    for (const auto& member : members) if (member.empty() || !seen.insert(member).second) return false;
    return seen.contains(selected);
}
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
