#pragma once

#include <algorithm>
#include <cstdint>
#include <limits>

namespace odin_scope {
// Do not restart the sender's freshness lease when a delayed request arrives.
// Zero is a refusal, never an indefinite lease. Shared by plugin and pure tests.
constexpr int64_t bounded_deadline(int64_t now, int64_t absolute, int lease_ms) {
    constexpr int64_t maximum = 250000000;
    if (now < 0 || now > std::numeric_limits<int64_t>::max() - maximum ||
        lease_ms < 1 || lease_ms > 250 || absolute <= now || absolute - now > maximum)
        return 0;
    return std::min(absolute, now + int64_t(lease_ms) * 1000000);
}
} // namespace odin_scope
