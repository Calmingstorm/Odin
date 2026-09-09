/*
 * NON-SHIPPING, ISOLATED Phase 3 feasibility experiment. NOT a backend or GO.
 * Pin: upstream Hyprland 0.55.2, 39d7e209c79d451efab1b21151d5938289da838d.
 * Build on the matching host, outside its live install:
 *   c++ -std=c++23 -shared -fPIC -O0 -g $(pkg-config --cflags hyprland) \
 *       hyprland-ledger-plugin.cpp -o hyprland-ledger-plugin.so
 * Use ONLY an isolated compositor/socket with idle physical devices, no IME,
 * no other input-filtering plugins or bound test keys. Load BEFORE the sender
 * creates its virtual keyboard and pointer. Position/focus the receiver first.
 *   hyprctl dispatch odin-phase3-ledger arm <sender/guardian-pid> <1..250-ms>
 *   hyprctl dispatch odin-phase3-ledger status
 *   hyprctl dispatch odin-phase3-ledger stop
 * ARM requires exactly one observed VK and VP, on the SAME wl_client whose
 * credentials match the PID and compositor UID. pidfd prevents PID-reuse races;
 * client EOF, resource destroy, deadline, focus transfer and lock revoke.
 * No refresh: a new arm requires a new guardian client (revoked clients stay
 * fenced while loaded). Set ODIN_PHASE3_INIT_THROW=1 in the isolated compositor
 * environment for actual error-driven init-unload, necessarily PRE-ARM.
 * A SEPARATE helper plugin may call unloadPlugin(victim, true) while holding:
 * label this SIMULATED EJECT, not an observed exceptional runtime crash path.
 *
 * Ownership proof: the inert/control dispatcher closure is the sole owner of
 * std::shared_ptr<State>. Every hook/listener/timer captures only raw State.
 * Core unloadPlugin removes function hooks BEFORE removing dispatchers and
 * dlclose AFTER them. State::~State thus runs while code is mapped, with core
 * entry points restored, and never reads a removed hook/trampoline. Native
 * resource key signals update IKeyboard's actual held state before going through
 * core aggregate bookkeeping; seat-only synthetic releases would be inadequate.
 * Normal exit intentionally shares the same destructor path as eject.
 *
 * LIMITATIONS: no private initial button-held census; refuse nonempty public
 * aggregate keyboard state, but idle isolated devices remain a prerequisite.
 * Pointer resource mapping relies on pinned listener order/newVirtualMouse's
 * append-before-newPointer-observer behavior. No pointer motion/axis gate,
 * capture, authenticated production consent transport, or full surface policy.
 * Modifiers and physical-key preemption need receiver-side qualification.
 * Teardown drains first, then destroys the exact guardian wl_client, closing
 * that connection durably. It cannot stop the same UID reconnecting as a NEW
 * client after unload; production protocol admission needs an enduring fence.
 * Compositor crash/SIGKILL cannot run cleanup.
 * Native core calls can allocate/throw; destructor catches and logs failures,
 * not a universal release guarantee. A critical log means NO-GO, not success.
 */

#include <hyprland/src/plugins/PluginAPI.hpp>
#include <hyprland/src/Compositor.hpp>
#include <hyprland/src/managers/input/InputManager.hpp>
#include <hyprland/src/managers/SeatManager.hpp>
#include <hyprland/src/desktop/state/FocusState.hpp>
#include <hyprland/src/protocols/VirtualKeyboard.hpp>
#include <hyprland/src/protocols/VirtualPointer.hpp>
#include <hyprland/src/protocols/SessionLock.hpp>
#include <wayland-server-core.h>
#include <sys/syscall.h>
#include <poll.h>
#include <unistd.h>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <set>
#include <sstream>
#include <stdexcept>
#include <vector>

namespace {
constexpr auto PIN = "39d7e209c79d451efab1b21151d5938289da838d";
constexpr auto COMMAND = "odin-phase3-ledger";
using Clock = std::chrono::steady_clock;
struct State;
State* live = nullptr; // NON-owning; dispatcher owns State, never a callback.
HANDLE handle = nullptr;
using KeyFn = void (*)(CInputManager*, const IKeyboard::SKeyEvent&, SP<IKeyboard>);
using ModFn = void (*)(CInputManager*, SP<IKeyboard>);
using ButtonFn = void (*)(CInputManager*, IPointer::SButtonEvent, SP<IPointer>);
using FocusFn = void (*)(CSeatManager*, SP<CWLSurfaceResource>);
using PointerFocusFn = void (*)(CSeatManager*, SP<CWLSurfaceResource>, const Vector2D&);

uint32_t nowMs() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(Clock::now().time_since_epoch()).count();
}
void note(const char* message) noexcept {
    std::fprintf(stderr, "[odin-phase3-ledger] %s\n", message);
}

struct Keyboard {
    SP<CVirtualKeyboardV1Resource> resource;
    SP<IKeyboard> device;
    wl_client* client = nullptr;
    CHyprSignalListener destroy;
    bool dead = false;
};
struct Pointer {
    SP<CVirtualPointerV1Resource> resource;
    SP<IPointer> device;
    wl_client* client = nullptr;
    CHyprSignalListener destroy;
    bool dead = false;
};

struct State {
    struct ClientWatch {
        wl_listener listener{}; // first member, recover without offsetof(State)
        State* state = nullptr;
    } clientWatch;
    CFunctionHook *keyHook = nullptr, *modHook = nullptr, *buttonHook = nullptr;
    CFunctionHook *focusHook = nullptr, *pointerFocusHook = nullptr;
    CHyprSignalListener newKeyboard, newPointer, newLock;
    std::vector<std::unique_ptr<Keyboard>> keyboards;
    std::vector<std::unique_ptr<Pointer>> pointers;
    Keyboard* keyboard = nullptr;
    Pointer* pointer = nullptr;
    std::set<uint32_t> keys, buttons;
    bool armed = false, draining = false, locked = false, failed = false;
    bool clientLinked = false, ownedModifiers = false;
    wl_client* guardian = nullptr;
    pid_t guardianPID = 0;
    int pidfd = -1;
    wl_event_source *deathSource = nullptr, *timerSource = nullptr;
    WP<CWLSurfaceResource> keyboardSurface, pointerSurface;
    PHLMONITORREF monitor;
    Clock::time_point deadline{};
    const char* reason = "never-armed";

    ~State() noexcept {
        revoke("dispatcher-owner-destruction"); // FIRST drain; hooks may be gone.
        detachWatches();
        // The listener was unlinked above. Close only the resource-authenticated
        // exact client, never PID-wide resources or another same-UID client.
        // Resource callbacks still have valid raw state until reset below.
        if (guardian) {
            auto* client = guardian;
            guardian = nullptr;
            wl_client_destroy(client);
            note("exact guardian wl_client destroyed after ledger drain");
        }
        newKeyboard.reset();
        newPointer.reset();
        newLock.reset();
        for (auto& k : keyboards) k->destroy.reset();
        for (auto& p : pointers) p->destroy.reset();
        live = nullptr;
        note(failed ? "CRITICAL destructor cleanup failed" : "destructor completed; native ledger empty");
    }

    void detachWatches() noexcept {
        if (deathSource) wl_event_source_remove(deathSource);
        if (timerSource) wl_event_source_remove(timerSource);
        deathSource = timerSource = nullptr;
        if (pidfd >= 0) close(pidfd);
        pidfd = -1;
        if (clientLinked) wl_list_remove(&clientWatch.listener.link);
        clientLinked = false;
    }

    bool scope() const {
        if (!armed || locked || !PROTO::sessionLock || PROTO::sessionLock->isLocked() || Clock::now() >= deadline)
            return false;
        if (!keyboard || !pointer || keyboard->dead || pointer->dead || pidfd < 0)
            return false;
        pollfd fd{pidfd, POLLIN, 0};
        if (poll(&fd, 1, 0) != 0) return false; // error/unknown also fences
        return !keyboardSurface.expired() && !pointerSurface.expired() && !monitor.expired() &&
            g_pSeatManager->m_state.keyboardFocus == keyboardSurface &&
            g_pSeatManager->m_state.pointerFocus == pointerSurface &&
            Desktop::focusState()->monitor() == monitor.lock();
    }

    void revoke(const char* why) noexcept {
        armed = false; // Fence BEFORE release/reentrant callbacks.
        reason = why;
        if (draining) return;
        draining = true;
        // A readable pidfd stays readable forever. Remove it during revocation
        // rather than spinning the compositor loop after guardian death.
        if (deathSource) wl_event_source_remove(deathSource);
        if (timerSource) wl_event_source_remove(timerSource);
        deathSource = timerSource = nullptr;
        if (pidfd >= 0) close(pidfd);
        pidfd = -1;
        // Do not call m_original here. During eject those objects are freed.
        // Resource signals enter restored core methods or current live hooks.
        while (!keys.empty()) {
            auto key = *keys.begin();
            keys.erase(keys.begin());
            try {
                if (!keyboard) throw std::runtime_error("missing owned keyboard");
                keyboard->resource->m_events.key.emit(IKeyboard::SKeyEvent{
                    .timeMs = nowMs(), .keycode = key, .state = WL_KEYBOARD_KEY_STATE_RELEASED});
                if (keyboard->device->getPressed(key)) throw std::runtime_error("native key still held");
            } catch (...) { failed = true; note("CRITICAL native key release failed"); }
        }
        if (ownedModifiers && keyboard) {
            try {
                keyboard->resource->m_events.modifiers.emit(IKeyboard::SModifiersEvent{});
            } catch (...) { failed = true; note("CRITICAL native modifier release failed"); }
        }
        ownedModifiers = false;
        while (!buttons.empty()) {
            auto button = *buttons.begin();
            buttons.erase(buttons.begin());
            try {
                if (!pointer) throw std::runtime_error("missing owned pointer");
                g_pInputManager->onMouseButton(IPointer::SButtonEvent{
                    .timeMs = nowMs(), .button = button, .state = WL_POINTER_BUTTON_STATE_RELEASED}, pointer->device);
            } catch (...) { failed = true; note("CRITICAL native button release failed"); }
        }
        draining = false;
        note(why);
    }

    Keyboard* findKeyboard(const SP<IKeyboard>& device) {
        for (auto& k : keyboards) if (k->device == device) return k.get();
        return nullptr;
    }
    Pointer* findPointer(const SP<IPointer>& device) {
        for (auto& p : pointers) if (p->device == device) return p.get();
        return nullptr;
    }

    std::string arm(pid_t pid, int lease) {
        if (guardianPID || armed || failed) return "refused: single guardian per plugin load";
        if (pid <= 1 || lease < 1 || lease > 250) return "refused: PID>1 and lease 1..250ms required";
        if (locked || !PROTO::sessionLock || PROTO::sessionLock->isLocked()) return "refused: lock/unknown";
        if (!g_pInputManager->getKeysFromAllKBs().empty()) return "refused: aggregate key held";
        Keyboard* k = nullptr;
        Pointer* p = nullptr;
        for (auto& item : keyboards) {
            if (item->dead) continue;
            pid_t actual; uid_t uid; gid_t gid;
            wl_client_get_credentials(item->client, &actual, &uid, &gid);
            if (actual != pid || uid != getuid()) continue;
            if (k) return "refused: ambiguous guardian keyboards";
            k = item.get();
        }
        if (!k) return "refused: no observed guardian keyboard";
        for (auto& item : pointers) {
            if (item->dead || item->client != k->client) continue;
            if (p) return "refused: ambiguous guardian pointers";
            p = item.get();
        }
        if (!p) return "refused: no observed same-client guardian pointer";
        keyboardSurface = g_pSeatManager->m_state.keyboardFocus;
        pointerSurface = g_pSeatManager->m_state.pointerFocus;
        monitor = Desktop::focusState()->monitor();
        if (keyboardSurface.expired() || pointerSurface.expired() || monitor.expired() || keyboardSurface != pointerSurface)
            return "refused: receiver must have keyboard AND pointer focus on one surface/monitor";
        pidfd = syscall(SYS_pidfd_open, pid, 0);
        if (pidfd < 0) return "refused: pidfd_open failed";
        pollfd fd{pidfd, POLLIN, 0};
        if (poll(&fd, 1, 0) != 0) { detachWatches(); return "refused: guardian not live"; }
        auto* loop = wl_display_get_event_loop(g_pCompositor->m_wlDisplay);
        deathSource = wl_event_loop_add_fd(loop, pidfd, WL_EVENT_READABLE, [](int, uint32_t, void* raw) {
            static_cast<State*>(raw)->revoke("guardian-pidfd-death"); return 0;
        }, this);
        timerSource = wl_event_loop_add_timer(loop, [](void* raw) {
            static_cast<State*>(raw)->revoke("lease-deadline"); return 0;
        }, this);
        if (!deathSource || !timerSource || wl_event_source_timer_update(timerSource, lease) < 0) {
            detachWatches(); return "refused: raw event source creation failed";
        }
        keyboard = k; pointer = p; guardian = k->client; guardianPID = pid;
        clientWatch.state = this;
        clientWatch.listener.notify = [](wl_listener* listener, void*) {
            auto* watch = reinterpret_cast<ClientWatch*>(listener);
            watch->state->revoke("guardian-client-EOF");
            wl_list_remove(&watch->listener.link);
            watch->state->clientLinked = false;
            watch->state->guardian = nullptr;
        };
        wl_client_add_destroy_listener(guardian, &clientWatch.listener);
        clientLinked = true;
        deadline = Clock::now() + std::chrono::milliseconds(lease);
        reason = "armed";
        armed = true; // LAST: all cleanup owners and watches registered.
        note("ARM admitted (isolated hold-release experiment only)");
        return "armed";
    }

    SDispatchResult dispatch(const std::string& input) {
        std::istringstream stream(input);
        std::string operation, extra;
        stream >> operation;
        std::string result;
        if (operation == "arm") {
            int pid = 0, lease = 0;
            if (!(stream >> pid >> lease) || stream >> extra) result = "refused: arm PID milliseconds";
            else result = arm(pid, lease);
        } else if (operation == "stop") { revoke("operator-stop"); result = "stopped"; }
        else if (operation == "status") {
            if (armed && !scope()) revoke("status-scope-fence");
            result = std::string("armed=") + (armed ? "1" : "0") + " keys=" + std::to_string(keys.size()) +
                " buttons=" + std::to_string(buttons.size()) + " failed=" + (failed ? "1" : "0") + " reason=" + reason;
        } else result = "refused: use arm PID milliseconds | status | stop";
        note(result.c_str());
        // success flag isn't proof of receiver state; text is also logged.
        return {.success = result.rfind("refused:", 0) != 0, .error = result};
    }
};

void onKey(CInputManager* manager, const IKeyboard::SKeyEvent& event, SP<IKeyboard> device) {
    auto& s = *live;
    auto original = reinterpret_cast<KeyFn>(s.keyHook->m_original);
    if (s.draining) { original(manager, event, device); return; }
    const auto k = s.findKeyboard(device);
    const bool ours = k && k == s.keyboard;
    if (!ours) {
        if (event.state == WL_KEYBOARD_KEY_STATE_PRESSED && s.armed) {
            // updatePressed already ran on the incoming device. Exclude it only
            // during release, then restore BEFORE forwarding its physical key.
            const bool enabled = device->m_enabled;
            device->m_enabled = false;
            s.revoke("non-owned-key-preemption");
            device->m_enabled = enabled;
        }
        original(manager, event, device); return;
    }
    if (!s.scope()) {
        s.revoke("own-key-scope-fence");
        if (event.state == WL_KEYBOARD_KEY_STATE_PRESSED) {
            s.draining = true;
            k->resource->m_events.key.emit(IKeyboard::SKeyEvent{.timeMs = nowMs(), .keycode = event.keycode, .state = WL_KEYBOARD_KEY_STATE_RELEASED});
            s.draining = false;
        }
        return;
    }
    if (event.state == WL_KEYBOARD_KEY_STATE_PRESSED) s.keys.insert(event.keycode);
    else s.keys.erase(event.keycode);
    original(manager, event, device);
}

void onMod(CInputManager* manager, SP<IKeyboard> device) {
    auto& s = *live;
    auto original = reinterpret_cast<ModFn>(s.modHook->m_original);
    if (s.draining) { original(manager, device); return; }
    const auto k = s.findKeyboard(device);
    if (k && k == s.keyboard) {
        s.ownedModifiers = true; // device state already changed upstream
        if (!s.scope()) { s.revoke("own-modifier-scope-fence"); return; }
    } else if (s.armed) {
        const bool enabled = device->m_enabled;
        device->m_enabled = false;
        s.revoke("non-owned-modifier-preemption");
        device->m_enabled = enabled;
    }
    original(manager, device);
}

void onButton(CInputManager* manager, IPointer::SButtonEvent event, SP<IPointer> device) {
    auto& s = *live;
    auto original = reinterpret_cast<ButtonFn>(s.buttonHook->m_original);
    if (s.draining) { original(manager, event, device); return; }
    const auto p = s.findPointer(device);
    const bool ours = p && p == s.pointer;
    if (!ours) {
        if (event.state == WL_POINTER_BUTTON_STATE_PRESSED && s.armed) s.revoke("non-owned-button-preemption");
        original(manager, event, device); return;
    }
    if (!s.scope()) { s.revoke("own-button-scope-fence"); return; }
    if (event.state == WL_POINTER_BUTTON_STATE_PRESSED) s.buttons.insert(event.button);
    else s.buttons.erase(event.button);
    original(manager, event, device);
}

void onFocus(CSeatManager* manager, SP<CWLSurfaceResource> surface) {
    auto& s = *live;
    auto original = reinterpret_cast<FocusFn>(s.focusHook->m_original);
    // BEFORE core gets aggregate keys or sends enter to the new receiver.
    if (!s.draining && s.armed && surface != s.keyboardSurface.lock()) s.revoke("pre-keyboard-focus-fence");
    original(manager, surface);
}
void onPointerFocus(CSeatManager* manager, SP<CWLSurfaceResource> surface, const Vector2D& local) {
    auto& s = *live;
    auto original = reinterpret_cast<PointerFocusFn>(s.pointerFocusHook->m_original);
    if (!s.draining && s.armed && surface != s.pointerSurface.lock()) s.revoke("pre-pointer-focus-fence");
    original(manager, surface, local);
}

CFunctionHook* hook(const char* name, const char* qualified, void* callback) {
    auto matches = HyprlandAPI::findFunctionsByName(handle, name);
    void* address = nullptr;
    for (auto& match : matches) {
        if (match.demangled.find(qualified) == std::string::npos) continue;
        if (address) throw std::runtime_error("ambiguous pinned hook symbol");
        address = match.address;
    }
    if (!address) throw std::runtime_error(std::string("missing pinned hook: ") + name);
    auto result = HyprlandAPI::createFunctionHook(handle, address, callback);
    if (!result || !result->hook()) throw std::runtime_error(std::string("failed hook: ") + name);
    return result;
}
} // namespace

APICALL EXPORT std::string PLUGIN_API_VERSION() { return HYPRLAND_API_VERSION; }

APICALL EXPORT PLUGIN_DESCRIPTION_INFO PLUGIN_INIT(HANDLE pluginHandle) {
    handle = pluginHandle;
    const auto version = HyprlandAPI::getHyprlandVersion(handle);
    if (version.hash != PIN || std::string(GIT_COMMIT_HASH) != PIN ||
        std::string(__hyprland_api_get_hash()) != __hyprland_api_get_client_hash())
        throw std::runtime_error("Phase3 exact commit/API pin mismatch");
    if (live || !g_pInputManager || !g_pSeatManager || !PROTO::virtualKeyboard || !PROTO::virtualPointer || !PROTO::sessionLock)
        throw std::runtime_error("Phase3 dependencies unavailable or duplicate load");
    if (g_pKeybindManager->m_dispatchers.contains(COMMAND)) throw std::runtime_error("Phase3 dispatcher name occupied");
    auto state = std::make_shared<State>();
    live = state.get();
    if (!HyprlandAPI::addDispatcherV2(handle, COMMAND, [owner = std::move(state)](std::string input) {
        return owner->dispatch(input);
    })) throw std::runtime_error("Phase3 owner registration failed");
    auto* s = live;
    s->locked = PROTO::sessionLock->isLocked();
    s->keyHook = hook("onKeyboardKey", "CInputManager::onKeyboardKey(", reinterpret_cast<void*>(onKey));
    s->modHook = hook("onKeyboardMod", "CInputManager::onKeyboardMod(", reinterpret_cast<void*>(onMod));
    s->buttonHook = hook("onMouseButton", "CInputManager::onMouseButton(", reinterpret_cast<void*>(onButton));
    s->focusHook = hook("setKeyboardFocus", "CSeatManager::setKeyboardFocus(", reinterpret_cast<void*>(onFocus));
    s->pointerFocusHook = hook("setPointerFocus", "CSeatManager::setPointerFocus(", reinterpret_cast<void*>(onPointerFocus));
    s->newKeyboard = PROTO::virtualKeyboard->m_events.newKeyboard.listen([s](const SP<CVirtualKeyboardV1Resource>& resource) {
        auto item = std::make_unique<Keyboard>();
        item->resource = resource;
        item->client = resource->client();
        // InputManager's listener was registered at compositor startup.
        if (g_pInputManager->m_keyboards.empty()) return;
        item->device = g_pInputManager->m_keyboards.back();
        if (!item->device->isVirtual() || item->device->getClient() != item->client) return;
        auto* k = item.get();
        item->destroy = resource->m_events.destroy.listen([s, k] {
            if (s->keyboard == k) s->revoke("guardian-keyboard-resource-destroy");
            k->dead = true;
        });
        s->keyboards.emplace_back(std::move(item));
    });
    s->newPointer = PROTO::virtualPointer->m_events.newPointer.listen([s](const SP<CVirtualPointerV1Resource>& resource) {
        auto item = std::make_unique<Pointer>();
        item->resource = resource;
        item->client = resource->client();
        if (g_pInputManager->m_pointers.empty()) return;
        item->device = g_pInputManager->m_pointers.back();
        if (!item->device->isVirtual()) return;
        for (auto& existing : s->pointers) if (existing->device == item->device) return;
        auto* p = item.get();
        item->destroy = resource->m_events.destroy.listen([s, p] {
            if (s->pointer == p) s->revoke("guardian-pointer-resource-destroy");
            p->dead = true;
        });
        s->pointers.emplace_back(std::move(item));
    });
    s->newLock = PROTO::sessionLock->m_events.newLock.listen([s](const auto&) {
        s->locked = true; // m_locked is assigned AFTER emit. Never clear latch.
        s->revoke("new-lock-latched-fence");
    });
    if (const auto* fail = std::getenv("ODIN_PHASE3_INIT_THROW"); fail && std::string(fail) == "1") {
        note("intentional init throw PRE-ARM; testing actual exceptional unload");
        throw std::runtime_error("Phase3 intentional pre-arm init throw");
    }
    note("loaded inert; NON-shipping proof, exact pin accepted");
    return {COMMAND, "NON-shipping compositor-owned release ledger feasibility", "Odin", "0.0.1-proof"};
}

APICALL EXPORT void PLUGIN_EXIT() {
    // Do NOT clean here: demonstrate the same core-owned dispatcher destructor
    // path for ordinary unload and eject=true (which skips PLUGIN_EXIT).
    note("normal PLUGIN_EXIT; cleanup deferred to dispatcher owner destruction");
}
