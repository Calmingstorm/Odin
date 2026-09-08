#pragma once
#include <cstdint>
#include <set>
#include <vector>
namespace odin_scope {
struct NativeAncestor {
    uintptr_t token;
    int64_t pid, uid;
    bool operator==(const NativeAncestor&) const = default;
};
// Credentials must come from wl_client, never app_id/title/properties.
inline bool valid_ancestry(const std::vector<NativeAncestor>& chain) {
    if (chain.empty() || chain.size() > 33 || chain.front().pid <= 1 || chain.front().uid < 0) return false;
    std::set<uintptr_t> seen;
    for (const auto& node : chain)
        if (!node.token || node.pid != chain.front().pid || node.uid != chain.front().uid || !seen.insert(node.token).second) return false;
    return true;
}
}
