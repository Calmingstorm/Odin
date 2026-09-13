/* Odin compositor-loop scope companion. Exact Hyprland 0.55.2 ABI only.
 * Transport, leases, event gates and cleanup all run on wl_event_loop.
 * Compile with matching Hyprland headers and json-c; no compositor-core patch.
 */
#include <hyprland/src/plugins/PluginAPI.hpp>
#include <hyprland/src/Compositor.hpp>
#include <hyprland/src/managers/input/InputManager.hpp>
#include <hyprland/src/managers/SeatManager.hpp>
#include <hyprland/src/managers/PointerManager.hpp>
#include <hyprland/src/desktop/state/FocusState.hpp>
#include <hyprland/src/desktop/view/Window.hpp>
#include <hyprland/src/protocols/VirtualKeyboard.hpp>
#include <hyprland/src/protocols/VirtualPointer.hpp>
#include <hyprland/src/protocols/SessionLock.hpp>
#include <hyprland/src/protocols/XDGShell.hpp>
#include <hyprland/src/protocols/core/Compositor.hpp>
#include <hyprland/src/event/EventBus.hpp>
#include <json-c/json.h>
#include <wayland-server-core.h>
#include <linux/input-event-codes.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/stat.h>
#include <sys/random.h>
#include <sys/syscall.h>
#include <fcntl.h>
#include <poll.h>
#include <unistd.h>
#include <chrono>
#include <cctype>
#include <climits>
#include <cstdint>
#include <cerrno>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <map>
#include <memory>
#include <set>
#include <stdexcept>
#include <string>
#include <sstream>
#include <vector>
#include <array>
#include <algorithm>
#include "scope-deadline.hpp"
#include "scope-provenance.hpp"

#ifndef ODIN_SCOPE_BUILD_ID
#error "Build with scripts/build-hyprland-input.sh to supply source identity"
#endif

namespace {
constexpr auto PIN = "39d7e209c79d451efab1b21151d5938289da838d";
constexpr auto DISPATCHER = "odin-scope-recovery";
using Clock = std::chrono::steady_clock;
using J = std::unique_ptr<json_object, decltype(&json_object_put)>;
J obj() { return J(json_object_new_object(), json_object_put); }
void put(json_object* j, const char* k, const std::string& v) { json_object_object_add(j, k, json_object_new_string_len(v.data(), v.size())); }
void put(json_object* j, const char* k, double v) { json_object_object_add(j, k, json_object_new_double(v)); }
void put(json_object* j, const char* k, int64_t v) { json_object_object_add(j, k, json_object_new_int64(v)); }
void put(json_object* j, const char* k, bool v) { json_object_object_add(j, k, json_object_new_boolean(v)); }
std::string text(json_object* j, const char* k) {
    json_object* v = nullptr;
    if (!json_object_object_get_ex(j, k, &v) || json_object_get_type(v) != json_type_string) return {};
    return std::string(json_object_get_string(v), json_object_get_string_len(v));
}
int integer(json_object* j, const char* k) {
    json_object* v = nullptr;
    if (!json_object_object_get_ex(j, k, &v) || json_object_get_type(v) != json_type_int) return -1;
    const auto n = json_object_get_int64(v);
    return n >= 0 && n <= 250 ? int(n) : -1;
}
int64_t ns() { return std::chrono::duration_cast<std::chrono::nanoseconds>(Clock::now().time_since_epoch()).count(); }
uint32_t ms() { return uint32_t(ns() / 1000000); }
std::string procStartTicks() {
    std::ifstream input("/proc/self/stat");
    std::string line;
    if (!std::getline(input, line)) throw std::runtime_error("compositor start ticks unavailable");
    // comm may contain spaces and parentheses.  The remainder begins at field 3;
    // starttime is field 22, therefore item 19 in this bounded remainder.
    const auto close = line.rfind(')');
    if (close == std::string::npos || close + 2 >= line.size()) throw std::runtime_error("compositor start ticks malformed");
    std::istringstream fields(line.substr(close + 2));
    std::string value;
    for (int i = 0; i <= 19; ++i) if (!(fields >> value)) throw std::runtime_error("compositor start ticks malformed");
    if (value.empty() || value.size() > 32 || std::any_of(value.begin(), value.end(), [](unsigned char c) { return !std::isdigit(c); }))
        throw std::runtime_error("compositor start ticks malformed");
    return value;
}
std::string processStartTicks(pid_t pid) {
    std::ifstream input("/proc/" + std::to_string(pid) + "/stat");
    std::string line;
    if (!std::getline(input, line)) return {};
    const auto close = line.rfind(')');
    if (close == std::string::npos || close + 2 >= line.size()) return {};
    std::istringstream fields(line.substr(close + 2));
    std::string value;
    for (int i = 0; i <= 19; ++i) if (!(fields >> value)) return {};
    return !value.empty() && value.size() <= 32 && std::all_of(value.begin(), value.end(), [](unsigned char c) { return std::isdigit(c); }) ? value : std::string{};
}
std::string processExe(pid_t pid) {
    std::array<char, 4096> path{};
    const auto n = readlink(("/proc/" + std::to_string(pid) + "/exe").c_str(), path.data(), path.size() - 1);
    if (n <= 0 || size_t(n) >= path.size() - 1) return {};
    return std::string(path.data(), size_t(n));
}
struct ProcessImage {
    std::string executable;
    uint64_t device = 0, inode = 0;
    bool valid() const { return !executable.empty() && device != 0 && inode != 0; }
    bool operator==(const ProcessImage&) const = default;
};
ProcessImage processImage(pid_t pid) {
    ProcessImage image; image.executable = processExe(pid);
    struct stat st {};
    // A pidfd proves lifetime only. This binds the executable object too, so
    // execve on the same PID invalidates the proof.
    if (image.executable.empty() || stat(("/proc/" + std::to_string(pid) + "/exe").c_str(), &st) != 0 ||
        st.st_dev == 0 || st.st_ino == 0) return {};
    image.device = uint64_t(st.st_dev); image.inode = uint64_t(st.st_ino);
    return image;
}
std::string bootID() {
    std::ifstream input("/proc/sys/kernel/random/boot_id");
    std::string value;
    if (!std::getline(input, value) || value.empty() || value.size() > 64 ||
        std::any_of(value.begin(), value.end(), [](unsigned char c) { return !(std::isxdigit(c) || c == '-'); }))
        throw std::runtime_error("boot identity unavailable");
    return value;
}
uint32_t rotateRight(uint32_t value, unsigned count) { return (value >> count) | (value << (32 - count)); }
std::array<uint8_t, 32> sha256(const std::string& input) {
    static constexpr std::array<uint32_t, 64> K = {0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2};
    std::vector<uint8_t> bytes(input.begin(), input.end()); const uint64_t bits = uint64_t(bytes.size()) * 8;
    bytes.push_back(0x80); while (bytes.size() % 64 != 56) bytes.push_back(0);
    for (int shift = 56; shift >= 0; shift -= 8) bytes.push_back(uint8_t(bits >> shift));
    std::array<uint32_t, 8> h = {0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19};
    for (size_t offset = 0; offset < bytes.size(); offset += 64) {
        std::array<uint32_t, 64> w{};
        for (size_t i = 0; i < 16; ++i) w[i] = (uint32_t(bytes[offset + i * 4]) << 24) | (uint32_t(bytes[offset + i * 4 + 1]) << 16) | (uint32_t(bytes[offset + i * 4 + 2]) << 8) | bytes[offset + i * 4 + 3];
        for (size_t i = 16; i < 64; ++i) { const uint32_t s0 = rotateRight(w[i - 15], 7) ^ rotateRight(w[i - 15], 18) ^ (w[i - 15] >> 3); const uint32_t s1 = rotateRight(w[i - 2], 17) ^ rotateRight(w[i - 2], 19) ^ (w[i - 2] >> 10); w[i] = w[i - 16] + s0 + w[i - 7] + s1; }
        uint32_t a=h[0],b=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],v=h[7];
        for (size_t i = 0; i < 64; ++i) { const uint32_t s1=rotateRight(e,6)^rotateRight(e,11)^rotateRight(e,25), choice=(e&f)^((~e)&g), temp1=v+s1+choice+K[i]+w[i], s0=rotateRight(a,2)^rotateRight(a,13)^rotateRight(a,22), majority=(a&b)^(a&c)^(b&c), temp2=s0+majority; v=g; g=f; f=e; e=d+temp1; d=c; c=b; b=a; a=temp1+temp2; }
        h[0]+=a; h[1]+=b; h[2]+=c; h[3]+=d; h[4]+=e; h[5]+=f; h[6]+=g; h[7]+=v;
    }
    std::array<uint8_t, 32> result{};
    for (size_t i = 0; i < h.size(); ++i) for (size_t byte = 0; byte < 4; ++byte) result[i * 4 + byte] = uint8_t(h[i] >> (24 - byte * 8));
    return result;
}
std::string sha256Hex(const std::string& input) {
    const auto digest = sha256(input); constexpr char hex[] = "0123456789abcdef";
    std::string value; value.reserve(64);
    for (const auto byte : digest) { value += hex[byte >> 4]; value += hex[byte & 15]; }
    return value;
}
std::string instanceToken(const std::string& boot, const std::string& start) {
    // Delimiters make the canonical preimage unambiguous. A digest prefix keeps
    // the socket name short and does not disclose PID/start-tick values.
    std::string material = "odin-hyprland-instance-v1";
    material.push_back('\0');
    material += boot;
    material.push_back('\0');
    material += std::to_string(getpid());
    material.push_back('\0');
    material += start;
    const auto digest = sha256(material);
    constexpr char hex[] = "0123456789abcdef"; std::string token; token.reserve(32);
    for (size_t i = 0; i < 16; ++i) { token += hex[digest[i] >> 4]; token += hex[digest[i] & 15]; }
    return token;
}
std::string nonce() {
    unsigned char bytes[24];
    if (getrandom(bytes, sizeof(bytes), 0) != sizeof(bytes)) throw std::runtime_error("getrandom failed");
    constexpr char hex[] = "0123456789abcdef";
    std::string s;
    for (auto c : bytes) { s += hex[c >> 4]; s += hex[c & 15]; }
    return s;
}
bool releaseCommandID(const std::string& value) {
    return value.size() == 48 && std::all_of(value.begin(), value.end(), [](unsigned char c) { return std::isxdigit(c); });
}
struct PopupWatch {
    bool valid = true;
    std::vector<CHyprSignalListener> listeners;
};
struct Snapshot {
    WP<CWLSurfaceResource> surface;
    WP<CWLSurfaceResource> pointerSurface;
    PHLWINDOWREF window;
    PHLMONITORREF monitor;
    Vector2D pos, size, outputPos, outputSize, pixelSize;
    float scale = 0;
    int transform = -1;
    std::string token, title, app, startTicks;
    pid_t pid = 0;
    int64_t measured = 0;
    uid_t uid = 0;
    std::shared_ptr<int> processFD;
    ProcessImage image;
    std::vector<odin_scope::NativeAncestor> ancestry;
    std::vector<std::vector<odin_scope::PopupAncestor>> popups;
    std::shared_ptr<PopupWatch> popupWatch;
    bool modal = false;
    uint64_t revision = 0;
};
struct Keyboard {
    SP<CVirtualKeyboardV1Resource> resource;
    SP<IKeyboard> device;
    wl_client* client = nullptr;
    pid_t pid = 0;
    CHyprSignalListener destroy;
    bool dead = false;
};
struct Pointer {
    SP<CVirtualPointerV1Resource> resource;
    SP<IPointer> device;
    wl_client* client = nullptr;
    pid_t pid = 0;
    CHyprSignalListener destroy;
    bool dead = false;
};
struct FocusCandidate {
    std::string id, outputID, outputName, topologyDigest, app, title, startTicks, windowID;
    PHLWINDOWREF window;
    PHLMONITORREF monitor;
    PHLWORKSPACEREF workspace;
    WP<CWLSurfaceResource> surface;
    std::shared_ptr<int> processFD;
    ProcessImage image;
    std::vector<odin_scope::NativeAncestor> ancestry;
    Vector2D outputPos, outputSize, pixelSize, pos, size;
    float scale = 0;
    int transform = -1;
    pid_t pid = 0;
    uid_t uid = 0;
    uint64_t epoch = 0;
    int64_t created = 0;
};
struct Peer { int fd = -1; int pidfd = -1; pid_t pid = 0; uid_t uid = 0; wl_event_source* source = nullptr; std::string input, startTicks; };
struct State;
State* live = nullptr;
HANDLE handle = nullptr;
using KeyFn = void (*)(CInputManager*, const IKeyboard::SKeyEvent&, SP<IKeyboard>);
using ModFn = void (*)(CInputManager*, SP<IKeyboard>);
using ButtonFn = void (*)(CInputManager*, IPointer::SButtonEvent, SP<IPointer>);
using AxisFn = void (*)(CInputManager*, IPointer::SAxisEvent, SP<IPointer>);
using MotionFn = void (*)(CInputManager*, IPointer::SMotionEvent);
using WarpFn = void (*)(CInputManager*, IPointer::SMotionAbsoluteEvent);
using FocusFn = void (*)(CSeatManager*, SP<CWLSurfaceResource>);
using PointerFocusFn = void (*)(CSeatManager*, SP<CWLSurfaceResource>, const Vector2D&);
using NewPointerFn = void (*)(CInputManager*, SP<CVirtualPointerV1Resource>);
using GeometryFn = void (*)(Desktop::View::CWindow*);

struct State {
    CFunctionHook *keyHook = nullptr, *modHook = nullptr, *buttonHook = nullptr, *axisHook = nullptr;
    CFunctionHook *motionHook = nullptr, *warpHook = nullptr, *focusHook = nullptr, *pointerFocusHook = nullptr;
    CFunctionHook* newPointerHook = nullptr;
    CFunctionHook* geometryHook = nullptr;
    CHyprSignalListener newKeyboard, newPointer, newLock;
    std::vector<CHyprSignalListener> epochListeners;
    std::vector<CHyprSignalListener> targetListeners;
    PHLWINDOWREF watchedWindow;
    PHLMONITORREF watchedMonitor;
    Vector2D watchedPos, watchedSize;
    std::vector<std::vector<odin_scope::PopupAncestor>> watchedPopups;
    std::vector<std::unique_ptr<Keyboard>> keyboards;
    std::vector<std::unique_ptr<Pointer>> pointers;
    std::map<int, std::unique_ptr<Peer>> peers;
    std::map<std::string, Snapshot> snapshots;
    std::map<std::string, FocusCandidate> focusCandidates;
    Keyboard* keyboard = nullptr;
    Pointer* pointer = nullptr;
    int guardianFD = -1;
    Snapshot bound;
    std::set<uint32_t> keys, buttons;
    bool armed = false, draining = false, ownedModifiers = false, failed = false;
    bool lockTransition = false;
    int64_t deadline = 0;
    uint64_t accepted = 0, rejected = 0, revision = 1;
    // Bounded diagnostic evidence only. Never used to grant scope or input.
    // Preserve the first eight guards across revoke and teardown.
    std::array<const char*, 8> rejectionGuards{};
    uint64_t rejectionBase = 0;
    void reject(const char* guard) noexcept {
        const auto index = rejected - rejectionBase;
        if (index < rejectionGuards.size()) rejectionGuards[index] = guard;
        ++rejected;
    }
    int legacyListener = -1, instanceListener = -1;
    wl_event_source *legacyListenerSource = nullptr, *instanceListenerSource = nullptr, *timer = nullptr;
    std::string legacySocketPath, instanceSocketPath, instanceID, compositorStartTicks, compositorBootID,
        legacyEndpointStatus = "not-attempted", reason = "idle";
    struct ReleaseReceipt {
        pid_t pid = 0;
        std::string startTicks, commandID;
        int64_t completed = 0;
        bool acknowledged = false;
        bool valid() const { return pid > 1 && !startTicks.empty() && !commandID.empty() && completed > 0; }
    } releaseReceipt;
    // Never evict plugin-lifetime tombstones. Missing after reload is unknown.
    struct OwnerLedger {
        std::string id, guardianStart, recoveryStart, reconcileCommand, retireCommand;
        pid_t guardianPID = 0, recoveryPID = 0;
        uid_t guardianUID = 0, recoveryUID = 0;
        Keyboard* keyboard = nullptr;
        Pointer* pointer = nullptr;
        bool revoked = false, retired = false, unknown = false, empty = true, ack = true;
        bool resourcesRetired = false, reconciled = false;
    };
    std::string pluginEpoch = nonce();
    std::map<std::string, PHLWINDOWREF> windowLifetimes;
    std::map<std::string, WP<CWLSurfaceResource>> windowSurfaces;
    std::string windowID(const PHLWINDOW& window) {
        for (auto it = windowLifetimes.begin(); it != windowLifetimes.end();) {
            if (it->second.expired() || windowSurfaces.at(it->first).expired()) {
                windowSurfaces.erase(it->first); it = windowLifetimes.erase(it); continue;
            }
            if (it->second.lock() == window && windowSurfaces.at(it->first).lock() == window->resource()) return it->first;
            ++it;
        }
        if (!window || windowLifetimes.size() >= 4096) throw std::runtime_error("window identity unavailable");
        // Random birth identity, never an address. The live weak reference is
        // compared before reuse, so allocator ABA and plugin reload cannot match.
        const auto id = "w1-" + pluginEpoch + "-" + nonce();
        windowLifetimes.emplace(id, window); windowSurfaces.emplace(id, window->resource()); return id;
    }
    std::map<std::string, OwnerLedger> owners;
    OwnerLedger* activeOwner = nullptr;
    OwnerLedger* guardianOwner(pid_t pid, const std::string& ticks) {
        for (auto& [id, owner] : owners)
            if (owner.guardianPID == pid && owner.guardianStart == ticks) return &owner;
        return nullptr;
    }
    J ownerStatus(const OwnerLedger& owner) {
        auto row = status();
        put(row.get(), "ledger_id", owner.id);
        put(row.get(), "guardian_pid", int64_t(owner.guardianPID)); put(row.get(), "guardian_uid", int64_t(owner.guardianUID));
        put(row.get(), "guardian_start_ticks", owner.guardianStart);
        put(row.get(), "recovery_pid", int64_t(owner.recoveryPID)); put(row.get(), "recovery_uid", int64_t(owner.recoveryUID));
        put(row.get(), "recovery_start_ticks", owner.recoveryStart);
        put(row.get(), "owner_matched", true); put(row.get(), "revoked", owner.revoked);
        put(row.get(), "retired", owner.retired); put(row.get(), "native_resources_retired", owner.resourcesRetired);
        put(row.get(), "unknown_release", owner.unknown);
        const bool empty = owner.empty && (activeOwner != &owner || (!armed && keys.empty() && buttons.empty() && !ownedModifiers));
        put(row.get(), "ledger_empty", empty); put(row.get(), "release_ack", empty && owner.ack && !owner.unknown);
        put(row.get(), "receiver_release_verified", false);
        return row;
    }
    J ownerRequest(Peer& peer, json_object* request, const std::string& op) {
        pollfd lifetime{peer.pidfd, POLLIN, 0};
        if (peer.pidfd < 0 || poll(&lifetime, 1, 0) != 0 || peer.startTicks.empty() || processStartTicks(peer.pid) != peer.startTicks ||
            text(request, "instance_id") != instanceID || text(request, "plugin_epoch") != pluginEpoch)
            return status(false, "owner-incarnation-refused");
        OwnerLedger* owner = nullptr;
        if (op == "owner_capture") {
            json_object *pidValue = nullptr, *uidValue = nullptr;
            if (!json_object_object_get_ex(request, "guardian_pid", &pidValue) || json_object_get_type(pidValue) != json_type_int ||
                !json_object_object_get_ex(request, "guardian_uid", &uidValue) || json_object_get_type(uidValue) != json_type_int)
                return status(false, "owner-identity-refused");
            const auto pid = json_object_get_int64(pidValue), uid = json_object_get_int64(uidValue);
            const auto ticks = text(request, "guardian_start_ticks");
            struct stat st {};
            if (pid <= 1 || pid > INT_MAX || uid != getuid() || ticks.empty() || processStartTicks(pid) != ticks ||
                stat(("/proc/" + std::to_string(pid)).c_str(), &st) || st.st_uid != uid)
                return status(false, "owner-identity-refused");
            owner = guardianOwner(pid, ticks);
            if (!owner) {
                if (owners.size() >= 4096 || failed || (guardianFD >= 0 && peers.contains(guardianFD) && peers.at(guardianFD)->pid == pid))
                    return status(false, "owner-ledger-cap-or-late-capture");
                const auto id = nonce();
                OwnerLedger entry; entry.id = id; entry.guardianPID = pid; entry.guardianUID = uid; entry.guardianStart = ticks;
                entry.recoveryPID = peer.pid; entry.recoveryUID = peer.uid; entry.recoveryStart = peer.startTicks;
                owner = &owners.emplace(id, std::move(entry)).first->second;
            }
        } else {
            const auto it = owners.find(text(request, "ledger_id"));
            if (it == owners.end()) return status(false, "owner-ledger-missing");
            owner = &it->second;
        }
        if (owner->recoveryPID != peer.pid || owner->recoveryUID != peer.uid || owner->recoveryStart != peer.startTicks)
            return status(false, "owner-recovery-peer-refused");
        if (op == "owner_status") {
            const auto command = text(request, "command_id");
            if (command.empty() || (command != owner->reconcileCommand && command != owner->retireCommand))
                return status(false, "owner-command-unknown");
        }
        if (op == "owner_reconcile" || op == "owner_retire") {
            const auto command = text(request, "command_id");
            if (command.empty() || command.size() > 128 || std::any_of(command.begin(), command.end(), [](unsigned char c) { return !(std::isalnum(c) || c == '-'); }))
                return status(false, "owner-command-refused");
            auto& recorded = op == "owner_retire" ? owner->retireCommand : owner->reconcileCommand;
            if (!recorded.empty() && recorded != command) return status(false, "owner-command-conflict");
            recorded = command; // persist in native ledger BEFORE mutation
            // Fence BEFORE release. Lost replies retrieve this tombstone.
            if (!owner->revoked) {
                owner->revoked = true;
                if (activeOwner == owner) revoke("owner-reconciliation");
                owner->reconciled = true;
            }
            if (op == "owner_retire" && !owner->retired) {
                owner->retired = true;
                // Exact captured client only. Destruction is NOT release proof.
                auto* k = owner->keyboard; auto* p = owner->pointer;
                if (k && p && k->client == p->client) {
                    if (!k->dead || !p->dead) wl_client_destroy(k->client);
                    owner->resourcesRetired = k->dead && p->dead;
                }
            }
        }
        auto row = ownerStatus(*owner); put(row.get(), "command_id", text(request, "command_id")); return row;
    }
    struct WireEvent {
        uint32_t opcode = 0, time = 0, button = 0, state = 0, resource = 0;
        int64_t monotonic = 0, dispatch = 0;
        double x = 0, y = 0;
        bool warp = false;
    };
    wl_protocol_logger* protocolLogger = nullptr;
    std::array<WireEvent, 256> wire{};
    size_t wireCount = 0;
    bool wireOverflow = false, ownedDispatch = false, warpDispatch = false;
    bool positioningBoundSurface = false;
    int64_t dispatchNumber = 0;
    std::string diagnosticToken;

    // This callback sees all protocol traffic, but must inspect arguments ONLY
    // after direction/interface/client/owned-invocation admission. No requests,
    // keyboard data, titles, global coordinates, or other clients are retained.
    static void protocolEvent(void* raw, wl_protocol_logger_type direction,
                              const wl_protocol_logger_message* message) noexcept {
        auto& s = *static_cast<State*>(raw);
        if (direction != WL_PROTOCOL_LOGGER_EVENT || !s.ownedDispatch || !s.armed ||
            s.diagnosticToken.empty() || s.diagnosticToken != s.bound.token ||
            !message || !message->resource || s.bound.surface.expired()) return;
        if (std::strcmp(wl_resource_get_class(message->resource), "wl_pointer") != 0 ||
            wl_resource_get_client(message->resource) != s.bound.surface->client() ||
            !s.destination(s.bound, g_pSeatManager->m_state.pointerFocus.lock())) return;
        const auto opcode = message->message_opcode;
        if (!((opcode == 2 && message->arguments_count == 3) ||
              (opcode == 3 && message->arguments_count == 4) ||
              (opcode == 5 && message->arguments_count == 0))) return;
        if (s.wireCount == s.wire.size()) { s.wireOverflow = true; return; }
        WireEvent e;
        e.opcode = opcode; e.monotonic = ns(); e.dispatch = s.dispatchNumber;
        e.warp = s.warpDispatch; e.resource = wl_resource_get_id(message->resource);
        if (opcode == 2) {
            e.time = message->arguments[0].u;
            e.x = wl_fixed_to_double(message->arguments[1].f);
            e.y = wl_fixed_to_double(message->arguments[2].f);
        } else if (opcode == 3) {
            e.time = message->arguments[1].u;
            e.button = message->arguments[2].u; e.state = message->arguments[3].u;
        }
        s.wire[s.wireCount++] = e;
    }
    struct OwnedDispatch {
        State& s;
        OwnedDispatch(State& state, bool warp) : s(state) {
            s.ownedDispatch = s.scope() && s.diagnosticToken == s.bound.token;
            s.warpDispatch = warp;
            if (s.ownedDispatch) ++s.dispatchNumber;
        }
        ~OwnedDispatch() { s.ownedDispatch = false; s.warpDispatch = false; }
    };
    J diagnostics(const std::string& token) {
        if (token.empty() || token != diagnosticToken) return status(false, "diagnostic-token-refused");
        auto j = obj(); put(j.get(), "ok", true);
        put(j.get(), "receiver_proven", false);
        put(j.get(), "coordinates", std::string("surface-local"));
        put(j.get(), "overflow", wireOverflow);
        put(j.get(), "dispatches", dispatchNumber);
        auto* events = json_object_new_array();
        for (size_t i = 0; i < wireCount; ++i) {
            const auto& e = wire[i]; auto item = obj();
            put(item.get(), "event", std::string(e.opcode == 2 ? "motion" : e.opcode == 3 ? "button" : "frame"));
            put(item.get(), "source", std::string(e.warp ? "owned-warp" : "owned-button"));
            put(item.get(), "dispatch", e.dispatch); put(item.get(), "monotonic_ns", e.monotonic);
            put(item.get(), "resource", int64_t(e.resource));
            if (e.opcode != 5) put(item.get(), "time_ms", int64_t(e.time));
            if (e.opcode == 2) { put(item.get(), "x", e.x); put(item.get(), "y", e.y); }
            if (e.opcode == 3) { put(item.get(), "button", int64_t(e.button)); put(item.get(), "state", int64_t(e.state)); }
            json_object_array_add(events, item.release());
        }
        json_object_object_add(j.get(), "events", events); return j;
    }

    ~State() noexcept {
        // First teardown action, before revoke can dispatch or destroy clients.
        // Also covers failed init and dispatcher-owned automatic ejection.
        if (protocolLogger) { wl_protocol_logger_destroy(protocolLogger); protocolLogger = nullptr; }
        ownedDispatch = false;
        revoke("plugin-unload");
        if (timer) wl_event_source_remove(timer);
        if (legacyListenerSource) wl_event_source_remove(legacyListenerSource);
        if (instanceListenerSource) wl_event_source_remove(instanceListenerSource);
        for (auto& [fd, peer] : peers) { if (peer->source) wl_event_source_remove(peer->source); close(fd); if (peer->pidfd >= 0) close(peer->pidfd); }
        peers.clear();
        if (legacyListener >= 0) close(legacyListener);
        if (instanceListener >= 0) close(instanceListener);
        if (!legacySocketPath.empty()) unlink(legacySocketPath.c_str());
        if (!instanceSocketPath.empty()) unlink(instanceSocketPath.c_str());
        // Only authenticated Odin clients; fence senders before code is unmapped.
        std::set<wl_client*> clients;
        for (auto& k : keyboards) if (!k->dead) clients.insert(k->client);
        for (auto& p : pointers) if (!p->dead) clients.insert(p->client);
        for (auto* c : clients) wl_client_destroy(c);
        newKeyboard.reset(); newPointer.reset(); newLock.reset();
        for (auto& k : keyboards) k->destroy.reset();
        for (auto& p : pointers) p->destroy.reset();
        live = nullptr;
    }
    bool isPeer(pid_t pid) const {
        for (auto& [fd, p] : peers) if (p->pid == pid) {
            pollfd identity{p->pidfd, POLLIN, 0};
            if (p->pidfd >= 0 && poll(&identity, 1, 0) == 0) return true;
        }
        return false;
    }
    bool authenticated(wl_client* c, pid_t& pid) const {
        uid_t uid; gid_t gid;
        wl_client_get_credentials(c, &pid, &uid, &gid);
        return pid > 1 && uid == getuid() && isPeer(pid);
    }
    Keyboard* find(const SP<IKeyboard>& device) {
        for (auto& k : keyboards) if (k->device == device) return k.get();
        return nullptr;
    }
    Pointer* find(const SP<IPointer>& device) {
        for (auto& p : pointers) if (p->device == device) return p.get();
        return nullptr;
    }
    bool environment() const {
        return !lockTransition && PROTO::sessionLock && !PROTO::sessionLock->isLocked() &&
            g_pSeatManager && g_pInputManager && g_pPointerManager && Desktop::focusState() &&
            !g_pInputManager->isConstrained() && g_pInputManager->m_exclusiveLSes.empty();
    }
    bool inputHeld() const {
        // getKeysFromAllKBs() is the seat-OUTPUT ledger, not device input state.
        // A compositor-consumed release can leave it stale (R38: KEY_LEFTMETA
        // there, all live device ledgers empty). Conversely, a consumed press
        // need not appear there at all. Never clear it or release foreign keys.
        if (!g_pInputManager || g_pInputManager->m_keyboards.empty() ||
            g_pInputManager->hasHeldButtons()) return true;
        // Preserve refusal for out-of-evdev protocol values seen by the seat;
        // they are outside the supported keyboard input domain, not stale
        // normal-key entries we can reconcile through the public device API.
        for (const auto code : g_pInputManager->getKeysFromAllKBs())
            if (code > KEY_MAX) return true;
        for (const auto& device : g_pInputManager->m_keyboards) {
            if (!device) return true;
            // IKeyboard::updatePressed runs before the input-manager hook and
            // keybind filtering. Include disabled, physical AND virtual devices.
            for (uint32_t code = 0; code <= KEY_MAX; ++code)
                if (device->getPressed(code)) return true;
        }
        return false;
    }
    bool provenance(PHLWINDOW w, std::vector<odin_scope::NativeAncestor>& chain) const {
        chain.clear();
        if (!w || w->m_isX11 || w->m_xdgSurface.expired() || w->m_xdgSurface->m_toplevel.expired()) return false;
        auto top = w->m_xdgSurface->m_toplevel.lock();
        while (top) {
            if (top->m_owner.expired() || top->m_owner->m_surface.expired() || top->m_window.expired()) return false;
            auto surface = top->m_owner->m_surface.lock();
            auto ancestor = top->m_window.lock();
            if (ancestor->m_isX11 || ancestor->resource() != surface || ancestor->m_xdgSurface != top->m_owner) return false;
            pid_t pid = 0; uid_t uid = 0; gid_t gid = 0;
            wl_client_get_credentials(surface->client(), &pid, &uid, &gid);
            chain.push_back({reinterpret_cast<uintptr_t>(top->m_window.lock().get()), pid, uid});
            if (!odin_scope::valid_ancestry(chain)) return false;
            top = top->m_parent.lock();
        }
        return !chain.empty();
    }
    bool popupChain(const Snapshot& b, SP<CWLSurfaceResource> surface,
                    std::vector<odin_scope::PopupAncestor>& chain) const {
        chain.clear();
        if (b.surface.expired() || b.window.expired()) return false;
        std::set<uintptr_t> seen;
        while (surface) {
            if (chain.size() >= 33 || !seen.insert(reinterpret_cast<uintptr_t>(surface.get())).second ||
                !surface->good() || !surface->m_mapped || !surface->m_role ||
                surface->client() != b.surface->client() || surface->m_role->role() != SURFACE_ROLE_XDG_SHELL) return false;
            const auto* role = dynamic_cast<CXDGSurfaceRole*>(surface->m_role.get());
            if (!role) return false;
            auto xdg = role->m_xdgSurface.lock();
            if (!xdg || !xdg->good() || !xdg->m_mapped || xdg->m_surface.lock() != surface ||
                xdg->m_owner.expired() || !xdg->m_owner->good() || xdg->m_owner->client() != surface->client()) return false;
            auto popup = xdg->m_popup.lock();
            const auto& g = xdg->m_current.geometry;
            odin_scope::PopupAncestor n{reinterpret_cast<uintptr_t>(surface.get()), reinterpret_cast<uintptr_t>(xdg.get()),
                0, reinterpret_cast<uintptr_t>(surface->client()), 0, true, bool(popup), {g.x, g.y, g.w, g.h, 0, 0, 0, 0}};
            if (surface == b.surface.lock()) {
                auto top = xdg->m_toplevel.lock();
                if (popup || !top || !top->good() || top->m_owner.lock() != xdg ||
                    top->m_window != b.window || b.window->m_xdgSurface.lock() != xdg) return false;
                n.role = reinterpret_cast<uintptr_t>(top.get()); chain.push_back(n);
                return odin_scope::valid_popup_ancestry(chain, reinterpret_cast<uintptr_t>(b.surface.lock().get()), n.client);
            }
            if (!popup || !popup->good() || !xdg->m_toplevel.expired() || popup->m_surface.lock() != xdg || popup->m_parent.expired()) return false;
            n.role = reinterpret_cast<uintptr_t>(popup.get());
            n.parent = reinterpret_cast<uintptr_t>(popup->m_parent.lock().get());
            const auto& p = popup->m_geometry;
            n.geometry[4] = p.x; n.geometry[5] = p.y; n.geometry[6] = p.w; n.geometry[7] = p.h;
            chain.push_back(n); surface = popup->m_parent->m_surface.lock();
        }
        return false;
    }
    std::vector<std::vector<odin_scope::PopupAncestor>> popupInventory(const Snapshot& b) const {
        // Other wm_base bindings remain unsupported, never admitted by client ID.
        std::vector<std::vector<odin_scope::PopupAncestor>> result;
        if (b.window.expired() || b.window->m_xdgSurface.expired() || b.window->m_xdgSurface->m_owner.expired()) return result;
        if (b.window->m_xdgSurface->m_owner->m_surfaces.size() > 256) return {{{}}};
        for (const auto& candidate : b.window->m_xdgSurface->m_owner->m_surfaces) {
            if (candidate.expired() || candidate->m_popup.expired()) continue;
            std::vector<odin_scope::PopupAncestor> chain;
            if (popupChain(b, candidate->m_surface.lock(), chain)) result.push_back(std::move(chain));
        }
        return result;
    }
    bool destination(const Snapshot& b, SP<CWLSurfaceResource> surface) const {
        std::vector<odin_scope::PopupAncestor> chain;
        if (!popupChain(b, surface, chain)) return false;
        return chain.size() == 1 || std::find(b.popups.begin(), b.popups.end(), chain) != b.popups.end();
    }
    void watchPopups(Snapshot& b) {
        b.popupWatch = std::make_shared<PopupWatch>();
        if (b.window.expired() || b.window->m_xdgSurface.expired() || b.window->m_xdgSurface->m_owner.expired() ||
            b.window->m_xdgSurface->m_owner->m_surfaces.size() > 256) { b.popupWatch->valid = false; return; }
        const std::weak_ptr<PopupWatch> weak = b.popupWatch;
        const auto invalidate = [this, weak] { if (auto watch = weak.lock(); watch && watch->valid) { watch->valid = false; ++revision; } };
        b.popupWatch->listeners.emplace_back(b.window->m_xdgSurface->m_events.newPopup.listen([invalidate](SP<CXDGPopupResource>) { invalidate(); }));
        for (const auto& candidate : b.window->m_xdgSurface->m_owner->m_surfaces) {
            if (candidate.expired() || candidate->m_popup.expired()) continue;
            // Observe lifecycle, not admission, for every existing popup in this
            // bounded wm_base. An already-created UNMAPPED popup can map/unmap
            // between checks without another newPopup event. Conservatively
            // invalidate even unrelated popup changes; destination() still
            // requires the exact mapped, observed root ancestry.
            auto popup = candidate->m_popup.lock();
            b.popupWatch->listeners.emplace_back(popup->m_events.reposition.listen(invalidate));
            b.popupWatch->listeners.emplace_back(popup->m_events.dismissed.listen(invalidate));
            b.popupWatch->listeners.emplace_back(popup->m_events.destroy.listen(invalidate));
            b.popupWatch->listeners.emplace_back(candidate->m_events.map.listen(invalidate));
            b.popupWatch->listeners.emplace_back(candidate->m_events.unmap.listen(invalidate));
            b.popupWatch->listeners.emplace_back(candidate->m_events.destroy.listen(invalidate));
            b.popupWatch->listeners.emplace_back(candidate->m_events.newPopup.listen([invalidate](SP<CXDGPopupResource>) { invalidate(); }));
            const auto geometry = candidate->m_current.geometry;
            const auto placement = popup->m_geometry;
            b.popupWatch->listeners.emplace_back(candidate->m_events.commit.listen([candidate, geometry, placement, invalidate] {
                if (candidate.expired() || candidate->m_popup.expired() || candidate->m_current.geometry != geometry ||
                    candidate->m_popup->m_geometry != placement) invalidate();
            }));
        }
    }
    SP<CWLSurfaceResource> destinationAt(const Vector2D& pos) const {
        if (!point(pos)) return nullptr;
        Vector2D local;
        auto surface = g_pCompositor->vectorWindowToSurface(pos, bound.window.lock(), local);
        return destination(bound, surface) ? surface : nullptr;
    }
    bool same(const Snapshot& b) const {
        if (!environment() || b.revision != revision || b.surface.expired() || b.window.expired() || b.monitor.expired()) return false;
        auto w = b.window.lock(); auto m = b.monitor.lock();
        std::vector<odin_scope::NativeAncestor> chain;
        if (!b.processFD || !b.image.valid() || !b.popupWatch || !b.popupWatch->valid || !provenance(w, chain) || chain != b.ancestry || popupInventory(b) != b.popups) return false;
        pollfd identity{*b.processFD, POLLIN, 0};
        if (poll(&identity, 1, 0) != 0) return false;
        return w->m_isMapped && w->visible() && !w->m_isX11 && w->wlSurface() &&
            w->resource() == b.surface.lock() &&
            Desktop::focusState()->window() == w && Desktop::focusState()->monitor() == m &&
            g_pSeatManager->m_state.keyboardFocus == b.surface && g_pSeatManager->m_state.pointerFocus == b.pointerSurface &&
            w->m_monitor == b.monitor && w->m_realPosition->value() == b.pos && w->m_realSize->value() == b.size &&
            w->m_class == b.app && chain.front().pid == b.pid && chain.front().uid == b.uid &&
            processStartTicks(b.pid) == b.startTicks && processImage(b.pid) == b.image &&
            (chain.size() > 1 || w->m_isFloating) == b.modal &&
            m->m_position == b.outputPos && m->m_size == b.outputSize && m->m_pixelSize == b.pixelSize &&
            m->m_scale == b.scale && int(m->m_transform) == b.transform && m->m_dpmsStatus &&
            !m->m_isUnsafeFallback && !m->m_isBeingLeased && m->m_mirrorOf.expired() && m->m_enabled &&
            (!armed || (pointer && pointer->device->m_boundOutput == m->m_name));
    }
    bool scope() const {
        return armed && !failed && ns() < deadline && guardianFD >= 0 && peers.contains(guardianFD) &&
            isPeer(peers.at(guardianFD)->pid) &&
            keyboard && pointer && !keyboard->dead && !pointer->dead && same(bound);
    }
    bool point(const Vector2D& v) const {
        return std::isfinite(v.x) && std::isfinite(v.y) && v.x >= bound.pos.x && v.y >= bound.pos.y &&
            v.x < bound.pos.x + bound.size.x && v.y < bound.pos.y + bound.size.y &&
            g_pCompositor->vectorToWindowUnified(v, Desktop::View::ALLOW_FLOATING) == bound.window.lock();
    }
    bool allow() {
        if (scope()) { ++accepted; return true; }
        reject(!armed ? "scope-not-armed" : failed ? "scope-release-failed" :
               ns() >= deadline ? "scope-deadline-expired" : "scope-identity-or-state-changed");
        revoke("scope-expired-or-changed"); return false;
    }
    void revoke(const char* why) noexcept {
        armed = false; deadline = 0; reason = why;
        if (draining) return;
        if (activeOwner && activeOwner->unknown) { failed = true; return; }
        if (activeOwner && activeOwner->reconciled) return;
        // EOF/lease expiry can precede the explicit reconnect request. They
        // must not release an overlapping physical hold either. Hyprland does
        // not expose per-device button ownership, so held buttons fail closed.
        if (activeOwner && (!keys.empty() || !buttons.empty() || ownedModifiers)) {
            bool overlap = !g_pInputManager || (!buttons.empty() && g_pInputManager->hasHeldButtons());
            if (g_pInputManager) for (const auto& device : g_pInputManager->m_keyboards) {
                if (!device) { overlap = true; break; }
                if (keyboard && device == keyboard->device) continue;
                for (const auto key : keys) if (device->getPressed(key)) overlap = true;
                if (ownedModifiers)
                    for (uint32_t key = 0; key <= KEY_MAX; ++key)
                        if (device->getPressed(key)) overlap = true;
            }
            if (overlap) { activeOwner->unknown = true; activeOwner->ack = false; activeOwner->empty = false; failed = true; return; }
        }
        draining = true;
        // Core removes hooks before dispatcher destruction. Never use a freed
        // trampoline here: enter restored methods or current hooks via signals.
        bool releaseFailed = false;
        const auto pendingKeys = keys;
        for (const auto key : pendingKeys) {
            try {
                if (!keyboard) throw std::runtime_error("missing keyboard");
                keyboard->resource->m_events.key.emit(IKeyboard::SKeyEvent{.timeMs = ms(), .keycode = key, .state = WL_KEYBOARD_KEY_STATE_RELEASED});
                if (keyboard->device->getPressed(key)) releaseFailed = true;
                else keys.erase(key);
            } catch (...) { releaseFailed = true; }
        }
        if (ownedModifiers && keyboard) {
            try { keyboard->resource->m_events.modifiers.emit(IKeyboard::SModifiersEvent{}); ownedModifiers = false; }
            catch (...) { releaseFailed = true; }
        }
        const auto pendingButtons = buttons;
        for (const auto button : pendingButtons) {
            try {
                if (!pointer) throw std::runtime_error("missing pointer");
                g_pInputManager->onMouseButton(IPointer::SButtonEvent{.timeMs = ms(), .button = button, .state = WL_POINTER_BUTTON_STATE_RELEASED}, pointer->device);
                buttons.erase(button);
            } catch (...) { releaseFailed = true; }
        }
        failed = releaseFailed || !keys.empty() || !buttons.empty() || ownedModifiers;
        if (activeOwner) {
            activeOwner->empty = keys.empty() && buttons.empty() && !ownedModifiers;
            activeOwner->ack = !failed; activeOwner->unknown = failed;
        }
        draining = false;
        if (failed) std::fprintf(stderr, "[odin-scope] CRITICAL release failure; admission fenced\n");
    }
    J status(bool ok = true, const std::string& error = {}) {
        auto j = obj(); put(j.get(), "ok", ok); put(j.get(), "version", int64_t(1));
        put(j.get(), "companion_build_id", std::string(ODIN_SCOPE_BUILD_ID));
        // This is a locally observed compositor-instance binding.  It is not an
        // ELF measurement: companion_build_id identifies the build inputs only.
        put(j.get(), "scope_protocol_version", int64_t(1));
        put(j.get(), "release_status_v1", true);
        put(j.get(), "owner_protocol_version", int64_t(1));
        put(j.get(), "plugin_epoch", pluginEpoch);
        put(j.get(), "instance_id", instanceID);
        put(j.get(), "compositor_pid", int64_t(getpid()));
        put(j.get(), "compositor_uid", int64_t(getuid()));
        put(j.get(), "compositor_start_ticks", compositorStartTicks);
        put(j.get(), "boot_id", compositorBootID);
        // The instance path is the authoritative endpoint. The old fixed path
        // is opportunistic only: a foreign occupant must not prevent a second
        // compositor instance from publishing its own endpoint.
        put(j.get(), "legacy_endpoint_available", legacyListener >= 0);
        put(j.get(), "legacy_endpoint_status", legacyEndpointStatus);
        put(j.get(), "armed", armed); put(j.get(), "keys", int64_t(keys.size())); put(j.get(), "buttons", int64_t(buttons.size()));
        put(j.get(), "accepted", int64_t(accepted)); put(j.get(), "rejected", int64_t(rejected));
        put(j.get(), "rejection_base", int64_t(rejectionBase));
        put(j.get(), "rejection_overflow", rejected - rejectionBase > rejectionGuards.size());
        for (size_t i = 0; i < rejectionGuards.size(); ++i)
            put(j.get(), ("rejection_guard_" + std::to_string(i + 1)).c_str(),
                std::string(rejectionGuards[i] ? rejectionGuards[i] : "none"));
        put(j.get(), "failed", failed); put(j.get(), "reason", reason); put(j.get(), "revision", int64_t(revision));
        put(j.get(), "release_submitted", !armed); put(j.get(), "release_acknowledged", !armed && !failed && keys.empty() && buttons.empty() && !ownedModifiers);
        put(j.get(), "receiver_proven", false);
        if (!error.empty()) put(j.get(), "error", error);
        Snapshot target;
        if (Desktop::focusState()) target.window = Desktop::focusState()->window();
        if (!target.window.expired()) target.surface = target.window->resource();
        std::vector<odin_scope::PopupAncestor> pointerChain;
        const bool pointerKnown = g_pSeatManager && popupChain(target, g_pSeatManager->m_state.pointerFocus.lock(), pointerChain);
        put(j.get(), "current_pointer_role", std::string(pointerKnown ? (pointerChain.size() == 1 ? "root" : "owned-popup") : "other"));
        put(j.get(), "pointer_popup_depth", int64_t(pointerKnown ? pointerChain.size() - 1 : 0));
        return j;
    }
    J snapshot(const std::string& output) {
        if (!environment()) return status(false, "lock-or-unknown-state");
        Snapshot b; auto w = Desktop::focusState()->window(); auto m = Desktop::focusState()->monitor();
        if (!w || !m || output.empty() || m->m_name != output || w->m_isX11 || !w->m_isMapped || !w->visible() || !w->wlSurface())
            return status(false, "unknown-or-nonnative-focus");
        if (!provenance(w, b.ancestry)) return status(false, "foreign-or-unknown-toplevel-provenance");
        b.pid = b.ancestry.front().pid; b.uid = b.ancestry.front().uid;
        const int processFD = syscall(SYS_pidfd_open, b.pid, 0);
        if (processFD < 0) return status(false, "native-process-lifetime-unavailable");
        b.processFD = std::shared_ptr<int>(new int(processFD), [](int* fd) { close(*fd); delete fd; });
        b.startTicks = processStartTicks(b.pid); b.image = processImage(b.pid);
        if (b.startTicks.empty() || !b.image.valid()) return status(false, "native-process-image-unavailable");
        b.modal = b.ancestry.size() > 1 || w->m_isFloating;
        // Cursor need not enter a newly focused dialog for observation/keyboard.
        // Its independently measured focus stays immutable for the whole lease.
        b.pointerSurface = g_pSeatManager->m_state.pointerFocus;
        if (watchedWindow != w || watchedMonitor != m) {
            targetListeners.clear(); watchedWindow = w; watchedMonitor = m;
            watchedPos = w->m_realPosition->value(); watchedSize = w->m_realSize->value();
            std::function<void()> invalidate = [this] { ++revision; revoke("target-geometry-or-lifecycle"); };
            targetListeners.emplace_back(w->m_events.resize.listen(invalidate));
            targetListeners.emplace_back(w->m_events.unmap.listen(invalidate));
            targetListeners.emplace_back(w->m_events.hide.listen(invalidate));
            targetListeners.emplace_back(w->m_events.monitorChanged.listen(invalidate));
            targetListeners.emplace_back(m->m_events.dpmsChanged.listen(invalidate));
        }
        b.surface = w->resource(); b.window = w; b.monitor = m;
        b.popups = popupInventory(b);
        if (b.popups != watchedPopups) { watchedPopups = b.popups; ++revision; }
        watchPopups(b);
        b.pos = w->m_realPosition->value(); b.size = w->m_realSize->value();
        b.outputPos = m->m_position; b.outputSize = m->m_size; b.pixelSize = m->m_pixelSize;
        b.scale = m->m_scale; b.transform = int(m->m_transform); b.title = w->m_title; b.app = w->m_class; b.revision = revision;
        for (double v : {b.outputPos.x, b.outputPos.y, b.outputSize.x, b.outputSize.y, b.pixelSize.x, b.pixelSize.y})
            if (!std::isfinite(v) || std::floor(v) != v || std::abs(v) > 1000000) return status(false, "fractional-or-unknown-geometry");
        bool unsettled = false;
        for (double v : {b.pos.x, b.pos.y, b.size.x, b.size.y}) {
            if (!std::isfinite(v) || std::abs(v) > 1000000) return status(false, "fractional-or-unknown-geometry");
            unsettled |= std::floor(v) != v;
        }
        if (b.outputSize.x <= 0 || b.outputSize.y <= 0 || b.pixelSize.x <= 0 || b.pixelSize.y <= 0 ||
            !std::isfinite(b.scale) || b.scale <= 0 || b.scale > 16 || b.transform < 0 || b.transform > 7)
            return status(false, "fractional-or-unknown-geometry");
        if (!same(b) || b.pid <= 1 || b.app.empty() || b.size.x <= 0 || b.size.y <= 0 ||
            b.pos.x < b.outputPos.x || b.pos.y < b.outputPos.y ||
            b.pos.x + b.size.x > b.outputPos.x + b.outputSize.x || b.pos.y + b.size.y > b.outputPos.y + b.outputSize.y)
            return status(false, "focus-not-contained-or-ambiguous");
        if (unsettled) {
            if (b.uid != getuid()) return status(false, "foreign-or-unknown-toplevel-provenance");
            // Authenticated observation-only negative: never create a scope token.
            auto j = status(false, "window-geometry-unsettled");
            put(j.get(), "measured_monotonic_ns", ns()); put(j.get(), "locked", false);
            put(j.get(), "native_wayland", true);
            auto o = obj(); put(o.get(), "name", m->m_name);
            put(o.get(), "x", int64_t(b.outputPos.x)); put(o.get(), "y", int64_t(b.outputPos.y));
            put(o.get(), "width", int64_t(b.outputSize.x)); put(o.get(), "height", int64_t(b.outputSize.y));
            put(o.get(), "pixel_width", int64_t(b.pixelSize.x)); put(o.get(), "pixel_height", int64_t(b.pixelSize.y));
            put(o.get(), "scale", double(b.scale)); put(o.get(), "transform", int64_t(b.transform));
            json_object_object_add(j.get(), "output", o.release());
            auto f = obj(); put(f.get(), "pid", int64_t(b.pid)); put(f.get(), "uid", int64_t(b.uid));
            put(f.get(), "wm_class", b.app); put(f.get(), "parent_chain_verified", true);
            json_object_object_add(j.get(), "focus", f.release());
            return j;
        }
        b.token = nonce(); b.measured = ns();
        std::erase_if(snapshots, [](const auto& entry) { return ns() - entry.second.measured >= 250000000; });
        if (snapshots.size() >= 64) return status(false, "snapshot-capacity");
        snapshots.emplace(b.token, b);
        auto j = status(); put(j.get(), "token", b.token); put(j.get(), "measured_monotonic_ns", b.measured); put(j.get(), "locked", false);
        put(j.get(), "safe_focus", true); put(j.get(), "native_wayland", true);
        auto o = obj(); put(o.get(), "name", m->m_name); put(o.get(), "x", int64_t(b.outputPos.x)); put(o.get(), "y", int64_t(b.outputPos.y));
        put(o.get(), "width", int64_t(b.outputSize.x)); put(o.get(), "height", int64_t(b.outputSize.y));
        put(o.get(), "pixel_width", int64_t(b.pixelSize.x)); put(o.get(), "pixel_height", int64_t(b.pixelSize.y));
        put(o.get(), "scale", double(b.scale)); put(o.get(), "transform", int64_t(b.transform));
        json_object_object_add(j.get(), "output", o.release());
        auto f = obj(); put(f.get(), "token", windowID(w));
        put(j.get(), "window_id", windowID(w)); put(j.get(), "plugin_epoch", pluginEpoch);
        put(f.get(), "serial", int64_t(revision)); put(f.get(), "pid", int64_t(b.pid)); put(f.get(), "wm_class", b.app); put(f.get(), "title", b.title);
        put(f.get(), "uid", int64_t(b.uid)); put(f.get(), "parent_chain_verified", true);
        auto* parents = json_object_new_array();
        auto parent = w->m_xdgSurface->m_toplevel->m_parent.lock();
        while (parent) {
            if (parent->m_window.expired()) return status(false, "parent-lifetime-unavailable");
            json_object_array_add(parents, json_object_new_string(windowID(parent->m_window.lock()).c_str()));
            parent = parent->m_parent.lock();
        }
        json_object_object_add(f.get(), "parent_tokens", parents);
        put(f.get(), "x", int64_t(b.pos.x)); put(f.get(), "y", int64_t(b.pos.y)); put(f.get(), "width", int64_t(b.size.x)); put(f.get(), "height", int64_t(b.size.y)); put(f.get(), "modal", b.modal);
        json_object_object_add(j.get(), "focus", f.release()); return j;
    }
    static std::string lowercaseASCII(std::string value) {
        for (auto& ch : value) ch = char(std::tolower(static_cast<unsigned char>(ch)));
        return value;
    }
    static bool safeFocusApplication(const std::string& app, const std::string& exe) {
        const auto className = lowercaseASCII(app), executable = lowercaseASCII(exe);
        static constexpr std::array<const char*, 18> forbidden = {
            "terminal", "xterm", "kitty", "alacritty", "wezterm", "foot", "konsole",
            "tilix", "terminator", "guake", "yakuake", "rxvt", "urxvt", "shell",
            "polkit", "keyring", "password", "credential"};
        for (const auto* marker : forbidden)
            if (className.find(marker) != std::string::npos || executable.find(marker) != std::string::npos)
                return false;
        return true;
    }
    static std::string focusCandidateLabel(const FocusCandidate& c) {
        std::string label = c.app + " - " + c.title;
        for (auto& ch : label) if (static_cast<unsigned char>(ch) < 0x20 || static_cast<unsigned char>(ch) > 0x7e) ch = ' ';
        if (label.empty()) return {};
        if (label.size() > 256) label.resize(256);
        return label;
    }
    static int64_t positiveInt64(const std::string& value) {
        if (value.empty() || value.size() > 19) return -1;
        int64_t result = 0;
        for (const auto ch : value) {
            if (!std::isdigit(static_cast<unsigned char>(ch)) || result > (INT64_MAX - (ch - '0')) / 10) return -1;
            result = result * 10 + (ch - '0');
        }
        return result > 0 ? result : -1;
    }
    static bool requestedStartTicks(json_object* requested, const std::string& expected) {
        // The provider returns the integer emitted in the inventory response.
        // Keep that JSON type in the native proof; accepting a string would
        // make this identity field depend on an ambiguous wire coercion.
        json_object* value = nullptr;
        if (!json_object_object_get_ex(requested, "start_ticks", &value) ||
            json_object_get_type(value) != json_type_int) return false;
        const auto ticks = json_object_get_int64(value);
        return ticks > 0 && std::to_string(ticks) == expected;
    }
    bool makeFocusCandidate(PHLWINDOW w, FocusCandidate& c) const {
        if (!environment() || !w || w->m_isX11 || !w->m_isMapped || !w->visible() || !w->wlSurface() || !w->resource() || w->m_monitor.expired() || !w->m_workspace) return false;
        auto m = w->m_monitor.lock(); std::vector<odin_scope::NativeAncestor> ancestry;
        if (!m || !m->m_enabled || !m->m_dpmsStatus || m->m_isUnsafeFallback || m->m_isBeingLeased || !m->m_mirrorOf.expired() || !provenance(w, ancestry) || ancestry.front().uid != getuid() || ancestry.front().pid <= 1) return false;
        const auto start = processStartTicks(ancestry.front().pid);
        const auto image = processImage(ancestry.front().pid);
        const int fd = syscall(SYS_pidfd_open, ancestry.front().pid, 0);
        if (start.empty() || positiveInt64(start) < 1 || !image.valid() || fd < 0 || w->m_class.empty() || !safeFocusApplication(w->m_class, image.executable)) { if (fd >= 0) close(fd); return false; }
        for (double v : {m->m_position.x, m->m_position.y, m->m_size.x, m->m_size.y, m->m_pixelSize.x, m->m_pixelSize.y}) if (!std::isfinite(v) || std::floor(v) != v || std::abs(v) > 1000000) { close(fd); return false; }
        if (m->m_size.x <= 0 || m->m_size.y <= 0 || m->m_pixelSize.x <= 0 || m->m_pixelSize.y <= 0 || !std::isfinite(m->m_scale) || m->m_scale <= 0 || m->m_scale > 16 || int(m->m_transform) < 0 || int(m->m_transform) > 7) { close(fd); return false; }
        const auto pos = w->m_realPosition->value(), size = w->m_realSize->value();
        for (double v : {pos.x, pos.y, size.x, size.y}) if (!std::isfinite(v) || std::abs(v) > 1000000) { close(fd); return false; }
        if (size.x <= 0 || size.y <= 0) { close(fd); return false; }
        c.window = w; c.monitor = m; c.workspace = w->m_workspace; c.pos = pos; c.size = size; c.surface = w->resource(); c.processFD = std::shared_ptr<int>(new int(fd), [](int* p) { close(*p); delete p; }); c.ancestry = std::move(ancestry); c.pid = c.ancestry.front().pid; c.uid = c.ancestry.front().uid; c.startTicks = start; c.image = image; c.app = w->m_class; c.title = w->m_title; c.outputName = m->m_name; c.outputPos = m->m_position; c.outputSize = m->m_size; c.pixelSize = m->m_pixelSize; c.scale = m->m_scale; c.transform = int(m->m_transform); return true;
    }
    bool sameFocusCandidateState(const FocusCandidate& c) const {
        if (!environment() || c.window.expired() || c.monitor.expired() || c.workspace.expired() || c.surface.expired() || !c.processFD || !c.image.valid() || ns() - c.created >= 30000000000LL) return false;
        pollfd p{*c.processFD, POLLIN, 0}; auto w = c.window.lock(); auto m = c.monitor.lock(); std::vector<odin_scope::NativeAncestor> ancestry;
        return poll(&p, 1, 0) == 0 && w && m && w->m_isMapped && w->visible() && !w->m_isX11 && w->wlSurface() && w->resource() == c.surface.lock() && w->m_monitor.lock() == m && w->m_workspace == c.workspace.lock() && w->m_realPosition->value() == c.pos && w->m_realSize->value() == c.size && w->m_class == c.app && safeFocusApplication(w->m_class, c.image.executable) && provenance(w, ancestry) && ancestry == c.ancestry && processStartTicks(c.pid) == c.startTicks && processImage(c.pid) == c.image && m->m_enabled && m->m_dpmsStatus && !m->m_isUnsafeFallback && !m->m_isBeingLeased && m->m_mirrorOf.expired() && m->m_name == c.outputName && m->m_position == c.outputPos && m->m_size == c.outputSize && m->m_pixelSize == c.pixelSize && m->m_scale == c.scale && int(m->m_transform) == c.transform;
    }
    bool sameFocusCandidate(const FocusCandidate& c) const {
        return c.epoch == revision && sameFocusCandidateState(c);
    }
    J inventoryTargets() {
        if (!environment() || armed || inputHeld()) return status(false, "lock-or-input-held");
        focusCandidates.clear(); auto j = obj(); put(j.get(), "ok", true); put(j.get(), "version", int64_t(1)); put(j.get(), "instance_id", instanceID); put(j.get(), "topology_epoch", int64_t(revision)); auto* result = json_object_new_array(); std::map<std::string, std::string> outputIDs;
        std::set<const void*> outputs;
        for (const auto& w : g_pCompositor->m_windows) {
            if (focusCandidates.size() >= 32) break;
            FocusCandidate c;
            if (!makeFocusCandidate(w, c)) continue;
            c.windowID = windowID(w);
            const auto monitor = c.monitor.lock();
            if (!monitor || (outputs.find(monitor.get()) == outputs.end() && outputs.size() >= 16)) continue;
            const auto label = focusCandidateLabel(c);
            if (label.empty()) continue;
            outputs.insert(monitor.get()); c.id = "c1-" + nonce(); auto [outputIt, inserted] = outputIDs.emplace(c.outputName, "c1-" + nonce()); c.outputID = outputIt->second; c.epoch = revision; c.created = ns();
            c.topologyDigest = sha256Hex("odin-hyprland-topology-v1\\0" + c.outputName + "\\0" + std::to_string(int64_t(c.outputPos.x)) + "\\0" + std::to_string(int64_t(c.outputPos.y)) + "\\0" + std::to_string(int64_t(c.outputSize.x)) + "\\0" + std::to_string(int64_t(c.outputSize.y)) + "\\0" + std::to_string(int64_t(c.pixelSize.x)) + "\\0" + std::to_string(int64_t(c.pixelSize.y)) + "\\0" + std::to_string(c.scale) + "\\0" + std::to_string(c.transform));
            auto item = obj(); put(item.get(), "id", c.id); put(item.get(), "label", label); put(item.get(), "output_id", c.outputID); put(item.get(), "output_name", c.outputName); put(item.get(), "topology_digest", c.topologyDigest);
            put(item.get(), "window_id", c.windowID); put(item.get(), "plugin_epoch", pluginEpoch);
            auto output = obj(); put(output.get(), "x", int64_t(c.outputPos.x)); put(output.get(), "y", int64_t(c.outputPos.y)); put(output.get(), "width", int64_t(c.outputSize.x)); put(output.get(), "height", int64_t(c.outputSize.y)); put(output.get(), "pixel_width", int64_t(c.pixelSize.x)); put(output.get(), "pixel_height", int64_t(c.pixelSize.y)); put(output.get(), "scale", double(c.scale)); put(output.get(), "transform", int64_t(c.transform)); json_object_object_add(item.get(), "output", output.release());
            auto identity = obj(); put(identity.get(), "pid", int64_t(c.pid)); put(identity.get(), "uid", int64_t(c.uid)); put(identity.get(), "start_ticks", positiveInt64(c.startTicks)); put(identity.get(), "executable", c.image.executable); put(identity.get(), "exe_device", int64_t(c.image.device)); put(identity.get(), "exe_inode", int64_t(c.image.inode));
            json_object_object_add(item.get(), "identity", identity.release()); json_object_array_add(result, item.release()); focusCandidates.emplace(c.id, std::move(c));
        }
        put(j.get(), "topology_digest", sha256Hex("odin-hyprland-inventory-v1\\0" + std::to_string(revision) + "\\0" + std::to_string(focusCandidates.size()))); json_object_object_add(j.get(), "candidates", result); return j;
    }
    J focusCandidate(json_object* j) {
        json_object* epoch = nullptr;
        if (!environment() || armed || inputHeld()) return status(false, "lock-or-input-held");
        if (!json_object_object_get_ex(j, "topology_epoch", &epoch) || json_object_get_type(epoch) != json_type_int || uint64_t(json_object_get_int64(epoch)) != revision) return status(false, "stale-topology-epoch");
        const auto id = text(j, "candidate_id"), output = text(j, "output_id"); auto it = focusCandidates.find(id); json_object* requested = nullptr;
        if (!json_object_object_get_ex(j, "requested_identity", &requested) || json_object_get_type(requested) != json_type_object) return status(false, "requested-identity-required");
        if (it == focusCandidates.end() || output.empty() || it->second.outputID != output || text(requested, "executable") != it->second.image.executable || !requestedStartTicks(requested, it->second.startTicks) || !sameFocusCandidate(it->second)) { focusCandidates.clear(); return status(false, "stale-or-ineligible-candidate"); }
        const auto candidate = it->second; auto w = candidate.window.lock(); focusCandidates.clear();
        Desktop::focusState()->fullWindowFocus(w, Desktop::FOCUS_REASON_OTHER);
        // The synchronous focus notification may advance revision. Only the
        // already measured, consumed candidate crosses that transition: repeat
        // every lifetime, provenance and geometry check without reminting it.
        // New requests must still match the current revision before any focus.
        if (armed || inputHeld() || !sameFocusCandidateState(candidate) || Desktop::focusState()->window() != w || Desktop::focusState()->monitor() != candidate.monitor.lock()) return status(false, "native-focus-not-confirmed");
        auto response = obj(); put(response.get(), "ok", true); put(response.get(), "version", int64_t(1)); put(response.get(), "instance_id", instanceID);
        put(response.get(), "candidate_id", id); put(response.get(), "output_id", output); put(response.get(), "output_name", candidate.outputName); put(response.get(), "topology_epoch", int64_t(candidate.epoch)); put(response.get(), "topology_digest", candidate.topologyDigest);
        put(response.get(), "window_id", candidate.windowID); put(response.get(), "plugin_epoch", pluginEpoch);
        auto outputGeometry = obj(); put(outputGeometry.get(), "x", int64_t(candidate.outputPos.x)); put(outputGeometry.get(), "y", int64_t(candidate.outputPos.y)); put(outputGeometry.get(), "width", int64_t(candidate.outputSize.x)); put(outputGeometry.get(), "height", int64_t(candidate.outputSize.y)); put(outputGeometry.get(), "pixel_width", int64_t(candidate.pixelSize.x)); put(outputGeometry.get(), "pixel_height", int64_t(candidate.pixelSize.y)); put(outputGeometry.get(), "scale", double(candidate.scale)); put(outputGeometry.get(), "transform", int64_t(candidate.transform)); json_object_object_add(response.get(), "output", outputGeometry.release());
        auto identity = obj(); put(identity.get(), "pid", int64_t(candidate.pid)); put(identity.get(), "uid", int64_t(candidate.uid)); put(identity.get(), "start_ticks", positiveInt64(candidate.startTicks)); put(identity.get(), "executable", candidate.image.executable); put(identity.get(), "exe_device", int64_t(candidate.image.device)); put(identity.get(), "exe_inode", int64_t(candidate.image.inode));
        json_object_object_add(response.get(), "identity", identity.release()); return response;
    }
    J request(Peer& peer, json_object* j) {
        const auto op = text(j, "op");
        if (op == "owner_capture" || op == "owner_status" || op == "owner_reconcile" || op == "owner_retire")
            return ownerRequest(peer, j, op);
        if (op == "status") return status();
        if (armed && !scope() && op != "release_status") revoke("request-scope-fence");
        if (op == "snapshot") return snapshot(text(j, "output_name"));
        if (op == "inventory_targets") return inventoryTargets();
        if (op == "focus_candidate") return focusCandidate(j);
        if (op == "status") return status();
        if (op == "diagnostics_begin") {
            const auto token = text(j, "token");
            auto it = snapshots.find(token);
            if (armed || it == snapshots.end() || !same(it->second) || ns() - it->second.measured >= 250000000)
                return status(false, "diagnostic-snapshot-refused");
            diagnosticToken = token; wireCount = 0; wireOverflow = false; dispatchNumber = 0;
            return status();
        }
        if (op == "diagnostics_read") return diagnostics(text(j, "token"));
        if (op == "diagnostics_clear") {
            if (text(j, "token").empty() || text(j, "token") != diagnosticToken) return status(false, "diagnostic-token-refused");
            diagnosticToken.clear(); wire = {}; wireCount = 0; wireOverflow = false; dispatchNumber = 0;
            return status();
        }
        if (op == "release_status") {
            const auto id = text(j, "command_id"), ticks = text(j, "guardian_start_ticks");
            const bool fresh = releaseReceipt.valid() && ns() - releaseReceipt.completed >= 0 && ns() - releaseReceipt.completed <= 500000000;
            if (!fresh || !releaseCommandID(id) || id != releaseReceipt.commandID || ticks != releaseReceipt.startTicks ||
                peer.pid != releaseReceipt.pid || processStartTicks(peer.pid) != ticks)
                return status(false, "release-status-unknown");
            auto response = status(true); put(response.get(), "release_acknowledged", releaseReceipt.acknowledged); return response;
        }
        if (op == "release_all") {
            const auto id = text(j, "command_id"), ticks = text(j, "guardian_start_ticks");
            const bool tagged = !id.empty() || !ticks.empty();
            if (tagged) {
                if (peer.fd != guardianFD || !releaseCommandID(id) || ticks.empty() || processStartTicks(peer.pid) != ticks)
                    return status(false, "release-command-refused");
                releaseReceipt = {.pid = peer.pid, .startTicks = ticks, .commandID = id};
                revoke("operator-recovery");
                releaseReceipt.completed = ns(); releaseReceipt.acknowledged = !failed && keys.empty() && buttons.empty() && !ownedModifiers;
                return status(!failed);
            }
            revoke("operator-recovery"); return status(!failed);
        }
        if (op == "stop") { revoke("operator-recovery"); return status(!failed); }
        if (op != "arm" && op != "renew") return status(false, "unknown-operation");
        const int lease = integer(j, "lease_ms"); const auto token = text(j, "token");
        json_object* absolute = nullptr;
        if (!json_object_object_get_ex(j, "deadline_monotonic_ns", &absolute) ||
            json_object_get_type(absolute) != json_type_int)
            return status(false, "absolute-scope-deadline-required");
        const auto expiry = odin_scope::bounded_deadline(ns(), json_object_get_int64(absolute), lease);
        if (!expiry || failed) return status(false, "invalid-lease-or-cleanup-failed");
        if (op == "renew") {
            if (guardianFD != peer.fd || token != bound.token || !scope()) return status(false, "renew-binding-refused");
            deadline = expiry; return status();
        }
        if (armed) return status(false, "already-armed");
        auto* owner = guardianOwner(peer.pid, peer.startTicks);
        if (owner && (owner->revoked || owner->retired || owner->unknown)) return status(false, "owner-admission-retired");
        auto it = snapshots.find(token);
        if (it == snapshots.end() || ns() - it->second.measured >= 250000000 || !same(it->second)) return status(false, "stale-snapshot");
        Keyboard* k = nullptr; Pointer* p = nullptr;
        for (auto& x : keyboards) if (!x->dead && x->pid == peer.pid) { if (k) return status(false, "ambiguous-keyboard"); k = x.get(); }
        if (!k) return status(false, "missing-guardian-keyboard");
        for (auto& x : pointers) if (!x->dead && x->client == k->client) { if (p) return status(false, "ambiguous-pointer"); p = x.get(); }
        if (!p || p->resource->m_boundOutput != it->second.monitor || p->device->m_boundOutput != it->second.monitor->m_name) return status(false, "missing-or-wrong-output-pointer");
        if (inputHeld()) return status(false, "human-input-held");
        if (owner && ((owner->keyboard && owner->keyboard != k) || (owner->pointer && owner->pointer != p)))
            return status(false, "owner-device-incarnation-changed");
        if (!owner) {
            // Legacy arms also own a tombstone, but cannot later manufacture
            // recovery authority. The backend must register BEFORE first arm.
            if (owners.size() >= 4096) return status(false, "owner-ledger-cap");
            const auto id = nonce(); OwnerLedger entry; entry.id = id;
            entry.guardianPID = peer.pid; entry.guardianUID = peer.uid; entry.guardianStart = peer.startTicks;
            owner = &owners.emplace(id, std::move(entry)).first->second;
        }
        activeOwner = owner;
        if (owner) { owner->keyboard = k; owner->pointer = p; owner->empty = false; owner->ack = false; }
        keyboard = k; pointer = p; guardianFD = peer.fd; bound = it->second; snapshots.erase(it);
        if (diagnosticToken != bound.token) { diagnosticToken.clear(); wire = {}; wireCount = 0; wireOverflow = false; dispatchNumber = 0; }
        rejectionGuards.fill(nullptr); rejectionBase = rejected;
        deadline = expiry; armed = true; reason = "armed";
        return status();
    }
    void drop(int fd) {
        if (guardianFD == fd) { revoke("guardian-socket-eof"); guardianFD = -1; }
        auto it = peers.find(fd); if (it == peers.end()) return;
        if (it->second->source) wl_event_source_remove(it->second->source);
        if (it->second->pidfd >= 0) close(it->second->pidfd);
        close(fd); peers.erase(it);
    }
    int readPeer(int fd, uint32_t mask) {
        if (mask & (WL_EVENT_HANGUP | WL_EVENT_ERROR)) { drop(fd); return 0; }
        auto it = peers.find(fd); if (it == peers.end()) return 0;
        auto& p = *it->second;
        char buffer[4096]; const auto count = recv(fd, buffer, sizeof(buffer), MSG_DONTWAIT);
        if (count <= 0) { if (count == 0 || (errno != EAGAIN && errno != EINTR)) drop(fd); return 0; }
        p.input.append(buffer, count);
        if (p.input.size() > 8192) { drop(fd); return 0; }
        const auto end = p.input.find('\n');
        if (end == std::string::npos) return 0;
        // One bounded request/response at a time, never monopolize compositor.
        if (end + 1 != p.input.size()) { drop(fd); return 0; }
        auto line = p.input.substr(0, end); p.input.clear();
        try {
            json_tokener* tok = json_tokener_new(); json_tokener_set_flags(tok, JSON_TOKENER_STRICT);
            J req(json_tokener_parse_ex(tok, line.c_str(), line.size()), json_object_put);
            const bool valid = json_tokener_get_error(tok) == json_tokener_success && req && json_object_get_type(req.get()) == json_type_object;
            json_tokener_free(tok);
            auto reply = valid ? request(p, req.get()) : status(false, "invalid-json");
            std::string out = json_object_to_json_string_ext(reply.get(), JSON_C_TO_STRING_PLAIN); out += '\n';
            if (send(fd, out.data(), out.size(), MSG_DONTWAIT | MSG_NOSIGNAL) != ssize_t(out.size())) drop(fd);
        } catch (...) {
            // Dropping the actual guardian invokes its owned revoke. An error
            // on a read/recovery socket must never release a different owner.
            drop(fd);
        }
        return 0;
    }
    int acceptListener(int fd) {
        const int c = accept4(fd, nullptr, nullptr, SOCK_CLOEXEC | SOCK_NONBLOCK);
        if (c < 0) return 0;
        ucred credentials{}; socklen_t n = sizeof(credentials);
        // This method is State-owned.  The historical listener spelled the cap
        // as s.peers.size() >= 16; retain the same single shared peer budget.
        if (getsockopt(c, SOL_SOCKET, SO_PEERCRED, &credentials, &n) || n != sizeof(credentials) || (credentials.uid != getuid() && credentials.uid != 0) || credentials.pid <= 1 || peers.size() >= 16) { close(c); return 0; }
        auto peer = std::make_unique<Peer>(); peer->fd = c; peer->pid = credentials.pid; peer->uid = credentials.uid;
        peer->startTicks = processStartTicks(credentials.pid);
        if (peer->startTicks.empty()) { close(c); return 0; }
        peer->pidfd = syscall(SYS_pidfd_open, credentials.pid, 0);
        if (peer->pidfd < 0) { close(c); return 0; }
        peer->source = wl_event_loop_add_fd(wl_display_get_event_loop(g_pCompositor->m_wlDisplay), c, WL_EVENT_READABLE, [](int peerFD, uint32_t mask, void* state) {
            return static_cast<State*>(state)->readPeer(peerFD, mask);
        }, this);
        if (!peer->source) { close(peer->pidfd); close(c); return 0; }
        peers.emplace(c, std::move(peer)); return 0;
    }
    int bindListener(const std::string& path, wl_event_source*& source, bool optionalLegacy = false) {
        sockaddr_un address{}; address.sun_family = AF_UNIX;
        if (path.size() >= sizeof(address.sun_path)) throw std::runtime_error("scope socket path too long");
        std::memcpy(address.sun_path, path.c_str(), path.size() + 1);
        const int fd = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC | SOCK_NONBLOCK, 0);
        if (fd < 0) throw std::runtime_error("socket failed");
        // Never unlink an occupied pathname, including stale/symlink entries.
        if (bind(fd, reinterpret_cast<sockaddr*>(&address), sizeof(address))) {
            const int failure = errno;
            close(fd);
            if (optionalLegacy) {
                legacyEndpointStatus = failure == EADDRINUSE ? "occupied" : "unavailable";
                return -1;
            }
            throw std::runtime_error("socket pathname occupied or bind failed");
        }
        if (chmod(path.c_str(), 0600) || listen(fd, 8)) {
            close(fd); unlink(path.c_str());
            if (optionalLegacy) { legacyEndpointStatus = "unavailable"; return -1; }
            throw std::runtime_error("socket mode/listen failed");
        }
        source = wl_event_loop_add_fd(wl_display_get_event_loop(g_pCompositor->m_wlDisplay), fd, WL_EVENT_READABLE, [](int listenerFD, uint32_t, void* raw) {
            return static_cast<State*>(raw)->acceptListener(listenerFD);
        }, this);
        if (!source) {
            close(fd); unlink(path.c_str());
            if (optionalLegacy) { legacyEndpointStatus = "unavailable"; return -1; }
            throw std::runtime_error("event-loop source failed");
        }
        return fd;
    }
    void startSocket() {
        const char* runtime = getenv("XDG_RUNTIME_DIR"); struct stat st{};
        if (!runtime || lstat(runtime, &st) || !S_ISDIR(st.st_mode) || st.st_uid != getuid() || (st.st_mode & 077))
            throw std::runtime_error("private owner runtime directory required");
        compositorStartTicks = procStartTicks(); compositorBootID = bootID();
        // Derived solely from this process and boot identity.  Start ticks fence
        // PID reuse; boot_id is returned for the caller's existing identity pin.
        instanceID = "i1-" + instanceToken(compositorBootID, compositorStartTicks);
        const std::string instancePath = std::string(runtime) + "/odin-hyprland-scope-" + instanceID + ".sock";
        const std::string legacyPath = std::string(runtime) + "/odin-hyprland-scope.sock";
        instanceListener = bindListener(instancePath, instanceListenerSource);
        instanceSocketPath = instancePath;
        // Do not record a path until bind succeeds: destructor cleanup must never
        // unlink a legacy pathname we did not create. The instance endpoint is
        // already live, so a legacy collision is a compatibility report rather
        // than a startup failure. Existing consumers keep the old endpoint when
        // it is available; new consumers must use the instance endpoint.
        legacyListener = bindListener(legacyPath, legacyListenerSource, true);
        if (legacyListener >= 0) {
            legacySocketPath = legacyPath;
            legacyEndpointStatus = "available";
        }
        auto* loop = wl_display_get_event_loop(g_pCompositor->m_wlDisplay);
        timer = wl_event_loop_add_timer(loop, [](void* raw) {
            auto& s = *static_cast<State*>(raw);
            // newLock emits before m_locked is assigned: clear on a later tick.
            s.lockTransition = false;
            if (s.armed && !s.scope()) s.revoke("lease-or-focus-watchdog");
            wl_event_source_timer_update(s.timer, 10); return 0;
        }, this);
        if (!instanceListenerSource || !timer || wl_event_source_timer_update(timer, 10)) throw std::runtime_error("event-loop source failed");
    }
};

void onKey(CInputManager* manager, const IKeyboard::SKeyEvent& event, SP<IKeyboard> device) {
    auto& s = *live; auto original = reinterpret_cast<KeyFn>(s.keyHook->m_original);
    if (s.draining) { original(manager, event, device); return; }
    auto* k = s.find(device);
    if (!k) { original(manager, event, device); return; }
    if (k == s.keyboard && s.activeOwner && s.activeOwner->unknown) { s.reject("owner-release-unknown"); return; }
    if (k == s.keyboard && event.state == WL_KEYBOARD_KEY_STATE_RELEASED && s.keys.erase(event.keycode)) { original(manager, event, device); return; }
    if (k != s.keyboard || !s.allow()) {
        if (k != s.keyboard) s.reject("key-device-mismatch");
        // IKeyboard::updatePressed precedes this handler. Undo refused device
        // state, suppressing the unowned synthetic release at this same hook.
        if (event.state == WL_KEYBOARD_KEY_STATE_PRESSED)
            k->resource->m_events.key.emit(IKeyboard::SKeyEvent{.timeMs = ms(), .keycode = event.keycode, .state = WL_KEYBOARD_KEY_STATE_RELEASED});
        return;
    }
    if (event.state == WL_KEYBOARD_KEY_STATE_PRESSED) s.keys.insert(event.keycode);
    else return;
    original(manager, event, device);
}
void onMod(CInputManager* manager, SP<IKeyboard> device) {
    auto& s = *live; auto original = reinterpret_cast<ModFn>(s.modHook->m_original);
    if (s.draining) { original(manager, device); return; }
    auto* k = s.find(device); if (!k) { original(manager, device); return; }
    if (k == s.keyboard && s.activeOwner && s.activeOwner->unknown) { s.reject("owner-release-unknown"); return; }
    const auto& m = device->m_modifiersState;
    const bool zero = !(m.depressed || m.latched || m.locked || m.group);
    if (k == s.keyboard && zero && s.ownedModifiers) { s.ownedModifiers = false; original(manager, device); return; }
    if (k != s.keyboard || !s.allow()) { if (k != s.keyboard) s.reject("modifier-device-mismatch"); device->updateModifiers(0, 0, 0, 0); return; }
    s.ownedModifiers = !zero; original(manager, device);
}
void onButton(CInputManager* manager, IPointer::SButtonEvent event, SP<IPointer> device) {
    auto& s = *live; auto original = reinterpret_cast<ButtonFn>(s.buttonHook->m_original);
    if (s.draining) { original(manager, event, device); return; }
    auto* p = s.find(device); if (!p) { original(manager, event, device); return; }
    if (p == s.pointer && s.activeOwner && s.activeOwner->unknown) { s.reject("owner-release-unknown"); return; }
    if (p == s.pointer && event.state == WL_POINTER_BUTTON_STATE_RELEASED && s.buttons.erase(event.button)) {
        State::OwnedDispatch trace(s, false); original(manager, event, device); return;
    }
    if (p != s.pointer || !s.allow()) { if (p != s.pointer) s.reject("button-device-mismatch"); return; }
    if (event.state != WL_POINTER_BUTTON_STATE_PRESSED || !s.destinationAt(g_pPointerManager->position()) ||
        s.destinationAt(g_pPointerManager->position()) != g_pSeatManager->m_state.pointerFocus.lock()) { s.reject("button-destination-refused"); s.revoke("button-destination-refused"); return; }
    s.buttons.insert(event.button);
    State::OwnedDispatch trace(s, false); original(manager, event, device);
}
void onAxis(CInputManager* manager, IPointer::SAxisEvent event, SP<IPointer> device) {
    auto& s = *live; auto original = reinterpret_cast<AxisFn>(s.axisHook->m_original);
    auto* p = s.find(device); if (!p) { original(manager, event, device); return; }
    if (p != s.pointer) { s.reject("axis-device-mismatch"); return; }
    if (!s.allow()) return;
    if (!s.destinationAt(g_pPointerManager->position()) || s.destinationAt(g_pPointerManager->position()) != g_pSeatManager->m_state.pointerFocus.lock()) { s.reject("axis-destination-refused"); s.revoke("axis-destination-refused"); return; }
    original(manager, event, device);
}
void onMotion(CInputManager* manager, IPointer::SMotionEvent event) {
    auto& s = *live; auto original = reinterpret_cast<MotionFn>(s.motionHook->m_original);
    auto* p = s.find(event.device); if (!p) { original(manager, event); return; }
    if (p != s.pointer) { s.reject("motion-device-mismatch"); return; }
    if (!s.allow()) return;
    const auto pos = g_pPointerManager->position();
    if (!s.destination(s.bound, g_pSeatManager->m_state.pointerFocus.lock()) ||
        s.destinationAt(pos + event.delta) != g_pSeatManager->m_state.pointerFocus.lock() ||
        s.destinationAt(pos + event.unaccel) != g_pSeatManager->m_state.pointerFocus.lock()) { s.reject("motion-destination-refused"); s.revoke("motion-destination-refused"); return; }
    original(manager, event);
}
void onWarp(CInputManager* manager, IPointer::SMotionAbsoluteEvent event) {
    auto& s = *live; auto original = reinterpret_cast<WarpFn>(s.warpHook->m_original);
    Pointer* p = nullptr;
    for (auto& item : s.pointers) if (item->device.get() == event.device.get()) { p = item.get(); break; }
    if (!p) { original(manager, event); return; }
    if (p != s.pointer) { s.reject("warp-device-mismatch"); return; }
    if (!s.allow()) return;
    const Vector2D pos = s.bound.outputPos + event.absolute * s.bound.outputSize;
    const auto destination = s.destinationAt(pos);
    const bool positioning = g_pSeatManager->m_state.pointerFocus.lock() != destination;
    if (!destination || (positioning && (!s.keys.empty() || !s.buttons.empty() || s.ownedModifiers ||
        s.inputHeld()))) {
        s.reject(!destination ? "warp-destination-unknown" : "warp-positioning-input-held");
        s.revoke("warp-destination-refused"); return;
    }
    State::OwnedDispatch trace(s, true);
    // Only this synchronous owned, no-held-input absolute positioning dispatch
    // can enter the ALREADY observed root or mapped popup. Never a new window lease.
    struct Positioning {
        State& state;
        Positioning(State& value, bool active) : state(value) { state.positioningBoundSurface = active; }
        ~Positioning() { state.positioningBoundSurface = false; }
    } positioningGuard(s, positioning);
    const Vector2D prewarp = manager->getMouseCoordsInternal();
    original(manager, event);
    // 0.55.2 skips absolute-warp processing when its floored target equals the
    // cached cursor position. Reprocess only that stationary initial position
    // through the normal non-refocusing path. This does not replay input, and
    // requires the original one-shot surface gate and every other guard.
    if (positioning && s.positioningBoundSurface && prewarp.floor() == pos.floor() && manager->getMouseCoordsInternal().floor() == pos.floor() &&
        s.scope() && s.keys.empty() && s.buttons.empty() && !s.ownedModifiers && !s.inputHeld() &&
        s.destinationAt(pos) == destination && g_pSeatManager->m_state.pointerFocus.lock() != destination)
        manager->simulateMouseMovement();
    if (!s.scope() || g_pSeatManager->m_state.pointerFocus.lock() != destination || s.destinationAt(pos) != destination) {
        s.reject(!s.scope() ? "warp-post-scope-changed" :
                 g_pSeatManager->m_state.pointerFocus.lock() != destination ? "warp-post-pointer-focus-mismatch" :
                 "warp-post-destination-changed");
        s.revoke("warp-focus-postcondition-refused"); return;
    }
    // Pinned Hyprland 0.55.2 onMouseWarp sends motion but no seat frame.
    // Its onPointerFrame ignores virtual-pointer frames unless an axis is
    // pending. This is source evidence only, NOT proof of GTK batching or
    // the endpoint-only cause: explicit framing did not resolve that symptom.
    // Retain the owned completion while measuring downstream protocol events.
    g_pSeatManager->sendPointerFrame();
}
void onFocus(CSeatManager* manager, SP<CWLSurfaceResource> surface) {
    auto& s = *live; auto original = reinterpret_cast<FocusFn>(s.focusHook->m_original);
    if (surface != g_pSeatManager->m_state.keyboardFocus.lock()) { ++s.revision; if (!s.draining) s.revoke("pre-keyboard-focus-transfer"); }
    original(manager, surface);
}
void onPointerFocus(CSeatManager* manager, SP<CWLSurfaceResource> surface, const Vector2D& local) {
    auto& s = *live; auto original = reinterpret_cast<PointerFocusFn>(s.pointerFocusHook->m_original);
    if (surface != g_pSeatManager->m_state.pointerFocus.lock() && s.positioningBoundSurface &&
        s.scope() && surface && s.destinationAt(g_pPointerManager->position()) == surface && s.keys.empty() && s.buttons.empty() && !s.ownedModifiers &&
        !s.inputHeld() &&
        s.point(g_pPointerManager->position())) {
        // Consume before dispatch: at most one exact target transfer, no reentry.
        s.positioningBoundSurface = false;
        original(manager, surface, local);
        s.bound.pointerSurface = surface;
        if (!s.scope()) s.revoke("positioning-scope-postcondition-refused");
        return;
    }
    if (surface != g_pSeatManager->m_state.pointerFocus.lock()) { ++s.revision; if (!s.draining) s.revoke("pre-pointer-focus-transfer"); }
    original(manager, surface, local);
}
void onNewPointer(CInputManager* manager, SP<CVirtualPointerV1Resource> resource) {
    auto& s = *live; auto original = reinterpret_cast<NewPointerFn>(s.newPointerHook->m_original);
    const auto before = manager->m_pointers;
    original(manager, resource);
    pid_t pid; if (!s.authenticated(resource->client(), pid)) return;
    // Pinned newVirtualMouse -> newMouse appends its device synchronously.
    // Capture around that call, not the ordering of newPointer observers.
    if (manager->m_pointers.size() != before.size() + 1 ||
        !std::equal(before.begin(), before.end(), manager->m_pointers.begin())) {
        s.revoke("ambiguous-virtual-pointer-creation"); s.failed = true;
        wl_client_destroy(resource->client()); return;
    }
    auto p = std::make_unique<Pointer>(); p->resource = resource; p->client = resource->client(); p->pid = pid;
    p->device = manager->m_pointers.back();
    if (!p->device->isVirtual()) { s.failed = true; wl_client_destroy(resource->client()); return; }
    auto* item = p.get();
    p->destroy = resource->m_events.destroy.listen([&s, item] { if (s.pointer == item) s.revoke("pointer-destroy"); item->dead = true; });
    s.pointers.emplace_back(std::move(p));
}
void onGeometry(Desktop::View::CWindow* window) {
    auto& s = *live; auto original = reinterpret_cast<GeometryFn>(s.geometryHook->m_original);
    if (s.watchedWindow.get() == window) {
        const auto pos = window->m_realPosition->value(), size = window->m_realSize->value();
        if (pos != s.watchedPos || size != s.watchedSize) {
            s.watchedPos = pos; s.watchedSize = size; ++s.revision; s.revoke("window-position-or-size-change");
        }
    }
    original(window);
}
CFunctionHook* hook(const char* name, const char* qualified, void* callback) {
    void* address = nullptr;
    for (auto& match : HyprlandAPI::findFunctionsByName(handle, name)) {
        if (match.demangled.find(qualified) == std::string::npos) continue;
        if (address) throw std::runtime_error("ambiguous pinned hook");
        address = match.address;
    }
    if (!address) throw std::runtime_error(std::string("missing pinned hook: ") + name);
    auto* result = HyprlandAPI::createFunctionHook(handle, address, callback);
    if (!result || !result->hook()) throw std::runtime_error(std::string("hook failed: ") + name);
    return result;
}
} // namespace

APICALL EXPORT std::string PLUGIN_API_VERSION() { return HYPRLAND_API_VERSION; }
APICALL EXPORT PLUGIN_DESCRIPTION_INFO PLUGIN_INIT(HANDLE pluginHandle) {
    handle = pluginHandle;
    if (HyprlandAPI::getHyprlandVersion(handle).hash != PIN || std::string(GIT_COMMIT_HASH) != PIN ||
        std::string(__hyprland_api_get_hash()) != __hyprland_api_get_client_hash()) throw std::runtime_error("Odin exact Hyprland commit/API pin mismatch");
    if (live || !g_pCompositor || !g_pInputManager || !g_pSeatManager || !g_pPointerManager || !PROTO::virtualKeyboard || !PROTO::virtualPointer || !PROTO::sessionLock)
        throw std::runtime_error("Odin scope dependencies unavailable");
    if (g_pKeybindManager->m_dispatchers.contains(DISPATCHER)) throw std::runtime_error("Odin recovery dispatcher already registered");
    auto state = std::make_shared<State>(); live = state.get();
    // Sole state owner: hooks removed BEFORE dispatchers, dlclose AFTER them,
    // including error/eject unload. Every other callback is a non-owning pointer.
    if (!HyprlandAPI::addDispatcherV2(handle, DISPATCHER, [owner = std::move(state)](std::string) {
        owner->revoke("operator-dispatcher-recovery");
        return SDispatchResult{.success = !owner->failed, .error = owner->failed ? "owned release failed" : "owned input released"};
    })) throw std::runtime_error("Odin state owner registration failed");
    auto* s = live;
    s->protocolLogger = wl_display_add_protocol_logger(g_pCompositor->m_wlDisplay, State::protocolEvent, s);
    if (!s->protocolLogger) throw std::runtime_error("Odin private protocol logger registration failed");
    s->keyHook = hook("onKeyboardKey", "CInputManager::onKeyboardKey(", reinterpret_cast<void*>(onKey));
    s->modHook = hook("onKeyboardMod", "CInputManager::onKeyboardMod(", reinterpret_cast<void*>(onMod));
    s->buttonHook = hook("onMouseButton", "CInputManager::onMouseButton(", reinterpret_cast<void*>(onButton));
    s->axisHook = hook("onMouseWheel", "CInputManager::onMouseWheel(", reinterpret_cast<void*>(onAxis));
    s->motionHook = hook("onMouseMoved", "CInputManager::onMouseMoved(", reinterpret_cast<void*>(onMotion));
    s->warpHook = hook("onMouseWarp", "CInputManager::onMouseWarp(", reinterpret_cast<void*>(onWarp));
    s->focusHook = hook("setKeyboardFocus", "CSeatManager::setKeyboardFocus(", reinterpret_cast<void*>(onFocus));
    s->pointerFocusHook = hook("setPointerFocus", "CSeatManager::setPointerFocus(", reinterpret_cast<void*>(onPointerFocus));
    s->newPointerHook = hook("newVirtualMouse", "CInputManager::newVirtualMouse(", reinterpret_cast<void*>(onNewPointer));
    s->geometryHook = hook("updateWindowDecos", "Desktop::View::CWindow::updateWindowDecos(", reinterpret_cast<void*>(onGeometry));
    s->newKeyboard = PROTO::virtualKeyboard->m_events.newKeyboard.listen([s](const SP<CVirtualKeyboardV1Resource>& resource) {
        pid_t pid; if (!s->authenticated(resource->client(), pid)) return;
        auto k = std::make_unique<Keyboard>(); k->resource = resource; k->client = resource->client(); k->pid = pid;
        if (g_pInputManager->m_keyboards.empty()) return;
        k->device = g_pInputManager->m_keyboards.back();
        if (!k->device->isVirtual() || k->device->getClient() != k->client) return;
        auto* item = k.get();
        k->destroy = resource->m_events.destroy.listen([s, item] { if (s->keyboard == item) s->revoke("keyboard-destroy"); item->dead = true; });
        s->keyboards.emplace_back(std::move(k));
    });
    s->newLock = PROTO::sessionLock->m_events.newLock.listen([s](const auto&) { ++s->revision; s->lockTransition = true; s->revoke("session-lock"); });
    std::function<void()> epoch = [s] { ++s->revision; s->focusCandidates.clear(); s->revoke("compositor-epoch-change"); };
    auto& e = Event::bus()->m_events;
    s->epochListeners.emplace_back(e.monitor.layoutChanged.listen(epoch));
    s->epochListeners.emplace_back(e.monitor.focused.listen(epoch));
    s->epochListeners.emplace_back(e.monitor.added.listen(epoch));
    s->epochListeners.emplace_back(e.monitor.preRemoved.listen(epoch));
    s->epochListeners.emplace_back(e.window.active.listen(epoch));
    s->epochListeners.emplace_back(e.window.class_.listen(epoch));
    s->epochListeners.emplace_back(e.window.open.listen(epoch));
    s->epochListeners.emplace_back(e.window.close.listen(epoch));
    s->epochListeners.emplace_back(e.window.fullscreen.listen(epoch));
    s->epochListeners.emplace_back(e.window.moveToWorkspace.listen(epoch));
    s->epochListeners.emplace_back(e.layer.opened.listen(epoch));
    s->epochListeners.emplace_back(e.layer.closed.listen(epoch));
    s->epochListeners.emplace_back(e.workspace.active.listen(epoch));
    s->epochListeners.emplace_back(e.config.preReload.listen(epoch));
    s->startSocket();
    return {"odin-hyprland-scope", "Authenticated compositor-loop scope; best-effort owned release", "Odin", "1.0.0"};
}
APICALL EXPORT void PLUGIN_EXIT() { /* dispatcher owner handles both teardown paths */ }
