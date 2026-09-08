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
#include <hyprland/src/event/EventBus.hpp>
#include <json-c/json.h>
#include <wayland-server-core.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/stat.h>
#include <sys/random.h>
#include <unistd.h>
#include <chrono>
#include <cerrno>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <map>
#include <memory>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

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
std::string nonce() {
    unsigned char bytes[24];
    if (getrandom(bytes, sizeof(bytes), 0) != sizeof(bytes)) throw std::runtime_error("getrandom failed");
    constexpr char hex[] = "0123456789abcdef";
    std::string s;
    for (auto c : bytes) { s += hex[c >> 4]; s += hex[c & 15]; }
    return s;
}
struct Snapshot {
    WP<CWLSurfaceResource> surface;
    PHLWINDOWREF window;
    PHLMONITORREF monitor;
    Vector2D pos, size, outputPos, outputSize, pixelSize;
    float scale = 0;
    int transform = -1;
    std::string token, title, app;
    pid_t pid = 0;
    int64_t measured = 0;
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
struct Peer { int fd = -1; pid_t pid = 0; wl_event_source* source = nullptr; std::string input; };
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

struct State {
    CFunctionHook *keyHook = nullptr, *modHook = nullptr, *buttonHook = nullptr, *axisHook = nullptr;
    CFunctionHook *motionHook = nullptr, *warpHook = nullptr, *focusHook = nullptr, *pointerFocusHook = nullptr;
    CFunctionHook* newPointerHook = nullptr;
    CHyprSignalListener newKeyboard, newPointer, newLock;
    std::vector<CHyprSignalListener> epochListeners;
    std::vector<CHyprSignalListener> targetListeners;
    PHLWINDOWREF watchedWindow;
    PHLMONITORREF watchedMonitor;
    std::vector<std::unique_ptr<Keyboard>> keyboards;
    std::vector<std::unique_ptr<Pointer>> pointers;
    std::map<int, std::unique_ptr<Peer>> peers;
    std::map<std::string, Snapshot> snapshots;
    Keyboard* keyboard = nullptr;
    Pointer* pointer = nullptr;
    int guardianFD = -1;
    Snapshot bound;
    std::set<uint32_t> keys, buttons;
    bool armed = false, draining = false, ownedModifiers = false, failed = false;
    bool lockTransition = false;
    int64_t deadline = 0;
    uint64_t accepted = 0, rejected = 0, revision = 1;
    int listener = -1;
    wl_event_source *listenerSource = nullptr, *timer = nullptr;
    std::string socketPath, reason = "idle";

    ~State() noexcept {
        revoke("plugin-unload");
        if (timer) wl_event_source_remove(timer);
        if (listenerSource) wl_event_source_remove(listenerSource);
        for (auto& [fd, peer] : peers) { if (peer->source) wl_event_source_remove(peer->source); close(fd); }
        peers.clear();
        if (listener >= 0) close(listener);
        if (!socketPath.empty()) unlink(socketPath.c_str());
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
        for (auto& [fd, p] : peers) if (p->pid == pid) return true;
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
    bool same(const Snapshot& b) const {
        if (!environment() || b.revision != revision || b.surface.expired() || b.window.expired() || b.monitor.expired()) return false;
        auto w = b.window.lock(); auto m = b.monitor.lock();
        return w->m_isMapped && w->visible() && !w->m_isX11 && w->wlSurface() &&
            w->resource() == b.surface.lock() &&
            Desktop::focusState()->window() == w && Desktop::focusState()->monitor() == m &&
            g_pSeatManager->m_state.keyboardFocus == b.surface && g_pSeatManager->m_state.pointerFocus == b.surface &&
            w->m_monitor == b.monitor && w->m_realPosition->value() == b.pos && w->m_realSize->value() == b.size &&
            w->m_class == b.app && w->getPID() == b.pid &&
            m->m_position == b.outputPos && m->m_size == b.outputSize && m->m_pixelSize == b.pixelSize &&
            m->m_scale == b.scale && int(m->m_transform) == b.transform && m->m_dpmsStatus &&
            !m->m_isUnsafeFallback && !m->m_isBeingLeased && m->m_mirrorOf.expired() && m->m_enabled &&
            (!armed || (pointer && pointer->device->m_boundOutput == m->m_name));
    }
    bool scope() const {
        return armed && !failed && ns() < deadline && guardianFD >= 0 && peers.contains(guardianFD) &&
            keyboard && pointer && !keyboard->dead && !pointer->dead && same(bound);
    }
    bool point(const Vector2D& v) const {
        return std::isfinite(v.x) && std::isfinite(v.y) && v.x >= bound.pos.x && v.y >= bound.pos.y &&
            v.x < bound.pos.x + bound.size.x && v.y < bound.pos.y + bound.size.y &&
            g_pCompositor->vectorToWindowUnified(v, Desktop::View::ALLOW_FLOATING) == bound.window.lock();
    }
    bool allow() {
        if (scope()) { ++accepted; return true; }
        ++rejected; revoke("scope-expired-or-changed"); return false;
    }
    void revoke(const char* why) noexcept {
        armed = false; deadline = 0; reason = why;
        if (draining) return;
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
        draining = false;
        if (failed) std::fprintf(stderr, "[odin-scope] CRITICAL release failure; admission fenced\n");
    }
    J status(bool ok = true, const std::string& error = {}) {
        auto j = obj(); put(j.get(), "ok", ok); put(j.get(), "version", int64_t(1));
        put(j.get(), "armed", armed); put(j.get(), "keys", int64_t(keys.size())); put(j.get(), "buttons", int64_t(buttons.size()));
        put(j.get(), "accepted", int64_t(accepted)); put(j.get(), "rejected", int64_t(rejected));
        put(j.get(), "failed", failed); put(j.get(), "reason", reason); put(j.get(), "revision", int64_t(revision));
        put(j.get(), "release_submitted", !armed); put(j.get(), "release_acknowledged", !armed && !failed && keys.empty() && buttons.empty() && !ownedModifiers);
        put(j.get(), "receiver_proven", false);
        if (!error.empty()) put(j.get(), "error", error);
        return j;
    }
    J snapshot(const std::string& output) {
        if (!environment()) return status(false, "lock-or-unknown-state");
        Snapshot b; auto w = Desktop::focusState()->window(); auto m = Desktop::focusState()->monitor();
        if (!w || !m || output.empty() || m->m_name != output || w->m_isX11 || !w->m_isMapped || !w->visible() || !w->wlSurface())
            return status(false, "unknown-or-nonnative-focus");
        if (w->m_xdgSurface.expired() || w->m_xdgSurface->m_toplevel.expired() || !w->m_xdgSurface->m_toplevel->m_parent.expired())
            return status(false, "modal-or-unknown-toplevel");
        if (watchedWindow != w || watchedMonitor != m) {
            targetListeners.clear(); watchedWindow = w; watchedMonitor = m;
            std::function<void()> invalidate = [this] { ++revision; revoke("target-geometry-or-lifecycle"); };
            targetListeners.emplace_back(w->m_events.resize.listen(invalidate));
            targetListeners.emplace_back(w->m_events.unmap.listen(invalidate));
            targetListeners.emplace_back(w->m_events.hide.listen(invalidate));
            targetListeners.emplace_back(w->m_events.monitorChanged.listen(invalidate));
            targetListeners.emplace_back(m->m_events.dpmsChanged.listen(invalidate));
        }
        b.surface = w->resource(); b.window = w; b.monitor = m;
        b.pos = w->m_realPosition->value(); b.size = w->m_realSize->value();
        b.outputPos = m->m_position; b.outputSize = m->m_size; b.pixelSize = m->m_pixelSize;
        b.scale = m->m_scale; b.transform = int(m->m_transform); b.title = w->m_title; b.app = w->m_class; b.pid = w->getPID(); b.revision = revision;
        for (double v : {b.pos.x, b.pos.y, b.size.x, b.size.y, b.outputPos.x, b.outputPos.y, b.outputSize.x, b.outputSize.y, b.pixelSize.x, b.pixelSize.y})
            if (!std::isfinite(v) || std::floor(v) != v || std::abs(v) > 1000000) return status(false, "fractional-or-unknown-geometry");
        if (!same(b) || b.pid <= 1 || b.app.empty() || b.size.x <= 0 || b.size.y <= 0 ||
            b.pos.x < b.outputPos.x || b.pos.y < b.outputPos.y ||
            b.pos.x + b.size.x > b.outputPos.x + b.outputSize.x || b.pos.y + b.size.y > b.outputPos.y + b.outputSize.y)
            return status(false, "focus-not-contained-or-ambiguous");
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
        auto f = obj(); put(f.get(), "token", std::to_string(reinterpret_cast<uintptr_t>(w.get())));
        put(f.get(), "serial", int64_t(revision)); put(f.get(), "pid", int64_t(b.pid)); put(f.get(), "wm_class", b.app); put(f.get(), "title", b.title);
        put(f.get(), "x", int64_t(b.pos.x)); put(f.get(), "y", int64_t(b.pos.y)); put(f.get(), "width", int64_t(b.size.x)); put(f.get(), "height", int64_t(b.size.y)); put(f.get(), "modal", false);
        json_object_object_add(j.get(), "focus", f.release()); return j;
    }
    J request(Peer& peer, json_object* j) {
        if (armed && !scope()) revoke("request-scope-fence");
        const auto op = text(j, "op");
        if (op == "snapshot") return snapshot(text(j, "output_name"));
        if (op == "status") return status();
        if (op == "release_all" || op == "stop") { revoke("operator-recovery"); return status(!failed); }
        if (op != "arm" && op != "renew") return status(false, "unknown-operation");
        const int lease = integer(j, "lease_ms"); const auto token = text(j, "token");
        if (lease < 1 || failed) return status(false, "invalid-lease-or-cleanup-failed");
        if (op == "renew") {
            if (guardianFD != peer.fd || token != bound.token || !scope()) return status(false, "renew-binding-refused");
            deadline = ns() + int64_t(lease) * 1000000; return status();
        }
        if (armed) return status(false, "already-armed");
        auto it = snapshots.find(token);
        if (it == snapshots.end() || ns() - it->second.measured >= 250000000 || !same(it->second)) return status(false, "stale-snapshot");
        Keyboard* k = nullptr; Pointer* p = nullptr;
        for (auto& x : keyboards) if (!x->dead && x->pid == peer.pid) { if (k) return status(false, "ambiguous-keyboard"); k = x.get(); }
        if (!k) return status(false, "missing-guardian-keyboard");
        for (auto& x : pointers) if (!x->dead && x->client == k->client) { if (p) return status(false, "ambiguous-pointer"); p = x.get(); }
        if (!p || p->resource->m_boundOutput != it->second.monitor || p->device->m_boundOutput != it->second.monitor->m_name) return status(false, "missing-or-wrong-output-pointer");
        if (!g_pInputManager->getKeysFromAllKBs().empty() || g_pInputManager->hasHeldButtons()) return status(false, "human-input-held");
        keyboard = k; pointer = p; guardianFD = peer.fd; bound = it->second; snapshots.erase(it);
        deadline = ns() + int64_t(lease) * 1000000; armed = true; reason = "armed";
        return status();
    }
    void drop(int fd) {
        if (guardianFD == fd) { revoke("guardian-socket-eof"); guardianFD = -1; }
        auto it = peers.find(fd); if (it == peers.end()) return;
        if (it->second->source) wl_event_source_remove(it->second->source);
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
        } catch (...) { revoke("request-exception"); drop(fd); }
        return 0;
    }
    void startSocket() {
        const char* runtime = getenv("XDG_RUNTIME_DIR"); struct stat st{};
        if (!runtime || lstat(runtime, &st) || !S_ISDIR(st.st_mode) || st.st_uid != getuid() || (st.st_mode & 077))
            throw std::runtime_error("private owner runtime directory required");
        const std::string path = std::string(runtime) + "/odin-hyprland-scope.sock";
        sockaddr_un address{}; address.sun_family = AF_UNIX;
        if (path.size() >= sizeof(address.sun_path)) throw std::runtime_error("scope socket path too long");
        std::memcpy(address.sun_path, path.c_str(), path.size() + 1);
        listener = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC | SOCK_NONBLOCK, 0);
        if (listener < 0) throw std::runtime_error("socket failed");
        // Never unlink an occupied pathname, including stale/symlink entries.
        if (bind(listener, reinterpret_cast<sockaddr*>(&address), sizeof(address))) throw std::runtime_error("socket pathname occupied or bind failed");
        socketPath = path;
        if (chmod(path.c_str(), 0600) || listen(listener, 8)) throw std::runtime_error("socket mode/listen failed");
        auto* loop = wl_display_get_event_loop(g_pCompositor->m_wlDisplay);
        listenerSource = wl_event_loop_add_fd(loop, listener, WL_EVENT_READABLE, [](int fd, uint32_t, void* raw) {
            auto& s = *static_cast<State*>(raw);
            const int c = accept4(fd, nullptr, nullptr, SOCK_CLOEXEC | SOCK_NONBLOCK);
            if (c < 0) return 0;
            ucred credentials{}; socklen_t n = sizeof(credentials);
            if (getsockopt(c, SOL_SOCKET, SO_PEERCRED, &credentials, &n) || n != sizeof(credentials) || (credentials.uid != getuid() && credentials.uid != 0) || credentials.pid <= 1 || s.peers.size() >= 16) { close(c); return 0; }
            auto peer = std::make_unique<Peer>(); peer->fd = c; peer->pid = credentials.pid;
            peer->source = wl_event_loop_add_fd(wl_display_get_event_loop(g_pCompositor->m_wlDisplay), c, WL_EVENT_READABLE, [](int fd, uint32_t mask, void* state) {
                return static_cast<State*>(state)->readPeer(fd, mask);
            }, &s);
            if (!peer->source) { close(c); return 0; }
            s.peers.emplace(c, std::move(peer)); return 0;
        }, this);
        timer = wl_event_loop_add_timer(loop, [](void* raw) {
            auto& s = *static_cast<State*>(raw);
            // newLock emits before m_locked is assigned: clear on a later tick.
            s.lockTransition = false;
            if (s.armed && !s.scope()) s.revoke("lease-or-focus-watchdog");
            wl_event_source_timer_update(s.timer, 10); return 0;
        }, this);
        if (!listenerSource || !timer || wl_event_source_timer_update(timer, 10)) throw std::runtime_error("event-loop source failed");
    }
};

void onKey(CInputManager* manager, const IKeyboard::SKeyEvent& event, SP<IKeyboard> device) {
    auto& s = *live; auto original = reinterpret_cast<KeyFn>(s.keyHook->m_original);
    if (s.draining) { original(manager, event, device); return; }
    auto* k = s.find(device);
    if (!k) { original(manager, event, device); return; }
    if (k == s.keyboard && event.state == WL_KEYBOARD_KEY_STATE_RELEASED && s.keys.erase(event.keycode)) { original(manager, event, device); return; }
    if (k != s.keyboard || !s.allow()) {
        if (k != s.keyboard) ++s.rejected;
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
    const auto& m = device->m_modifiersState;
    const bool zero = !(m.depressed || m.latched || m.locked || m.group);
    if (k == s.keyboard && zero && s.ownedModifiers) { s.ownedModifiers = false; original(manager, device); return; }
    if (k != s.keyboard || !s.allow()) { if (k != s.keyboard) ++s.rejected; device->updateModifiers(0, 0, 0, 0); return; }
    s.ownedModifiers = !zero; original(manager, device);
}
void onButton(CInputManager* manager, IPointer::SButtonEvent event, SP<IPointer> device) {
    auto& s = *live; auto original = reinterpret_cast<ButtonFn>(s.buttonHook->m_original);
    if (s.draining) { original(manager, event, device); return; }
    auto* p = s.find(device); if (!p) { original(manager, event, device); return; }
    if (p == s.pointer && event.state == WL_POINTER_BUTTON_STATE_RELEASED && s.buttons.erase(event.button)) { original(manager, event, device); return; }
    if (p != s.pointer || !s.allow()) { if (p != s.pointer) ++s.rejected; return; }
    if (event.state != WL_POINTER_BUTTON_STATE_PRESSED || !s.point(g_pPointerManager->position())) { ++s.rejected; s.revoke("button-destination-refused"); return; }
    s.buttons.insert(event.button); original(manager, event, device);
}
void onAxis(CInputManager* manager, IPointer::SAxisEvent event, SP<IPointer> device) {
    auto& s = *live; auto original = reinterpret_cast<AxisFn>(s.axisHook->m_original);
    auto* p = s.find(device); if (!p) { original(manager, event, device); return; }
    if (p != s.pointer) { ++s.rejected; return; }
    if (!s.allow()) return;
    if (!s.point(g_pPointerManager->position())) { ++s.rejected; s.revoke("axis-destination-refused"); return; }
    original(manager, event, device);
}
void onMotion(CInputManager* manager, IPointer::SMotionEvent event) {
    auto& s = *live; auto original = reinterpret_cast<MotionFn>(s.motionHook->m_original);
    auto* p = s.find(event.device); if (!p) { original(manager, event); return; }
    if (p != s.pointer) { ++s.rejected; return; }
    if (!s.allow()) return;
    const auto pos = g_pPointerManager->position();
    if (!s.point(pos + event.delta) || !s.point(pos + event.unaccel)) { ++s.rejected; s.revoke("motion-destination-refused"); return; }
    original(manager, event);
}
void onWarp(CInputManager* manager, IPointer::SMotionAbsoluteEvent event) {
    auto& s = *live; auto original = reinterpret_cast<WarpFn>(s.warpHook->m_original);
    Pointer* p = nullptr;
    for (auto& item : s.pointers) if (item->device.get() == event.device.get()) { p = item.get(); break; }
    if (!p) { original(manager, event); return; }
    if (p != s.pointer) { ++s.rejected; return; }
    if (!s.allow()) return;
    const Vector2D pos = s.bound.outputPos + event.absolute * s.bound.outputSize;
    if (!s.point(pos)) { ++s.rejected; s.revoke("warp-destination-refused"); return; }
    original(manager, event);
}
void onFocus(CSeatManager* manager, SP<CWLSurfaceResource> surface) {
    auto& s = *live; auto original = reinterpret_cast<FocusFn>(s.focusHook->m_original);
    if (surface != g_pSeatManager->m_state.keyboardFocus.lock()) { ++s.revision; if (!s.draining) s.revoke("pre-keyboard-focus-transfer"); }
    original(manager, surface);
}
void onPointerFocus(CSeatManager* manager, SP<CWLSurfaceResource> surface, const Vector2D& local) {
    auto& s = *live; auto original = reinterpret_cast<PointerFocusFn>(s.pointerFocusHook->m_original);
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
    s->keyHook = hook("onKeyboardKey", "CInputManager::onKeyboardKey(", reinterpret_cast<void*>(onKey));
    s->modHook = hook("onKeyboardMod", "CInputManager::onKeyboardMod(", reinterpret_cast<void*>(onMod));
    s->buttonHook = hook("onMouseButton", "CInputManager::onMouseButton(", reinterpret_cast<void*>(onButton));
    s->axisHook = hook("onMouseWheel", "CInputManager::onMouseWheel(", reinterpret_cast<void*>(onAxis));
    s->motionHook = hook("onMouseMoved", "CInputManager::onMouseMoved(", reinterpret_cast<void*>(onMotion));
    s->warpHook = hook("onMouseWarp", "CInputManager::onMouseWarp(", reinterpret_cast<void*>(onWarp));
    s->focusHook = hook("setKeyboardFocus", "CSeatManager::setKeyboardFocus(", reinterpret_cast<void*>(onFocus));
    s->pointerFocusHook = hook("setPointerFocus", "CSeatManager::setPointerFocus(", reinterpret_cast<void*>(onPointerFocus));
    s->newPointerHook = hook("newVirtualMouse", "CInputManager::newVirtualMouse(", reinterpret_cast<void*>(onNewPointer));
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
    std::function<void()> epoch = [s] { ++s->revision; s->revoke("compositor-epoch-change"); };
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
