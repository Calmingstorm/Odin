"""Compile production owner dispatch against fake compositor edges, no display.

This executes the native protocol decisions, NOT the Hyprland ABI or receiver.
"""

import shutil
import subprocess
from pathlib import Path

import pytest


def test_native_owner_protocol_component(tmp_path):
    if not shutil.which("c++") or not shutil.which("pkg-config"):
        pytest.skip("C++/pkg-config unavailable")
    flags = subprocess.run(["pkg-config", "--cflags", "--libs", "json-c"],
                           capture_output=True, text=True, check=True).stdout.split()
    plugin = Path("assets/hyprland-input/scope-plugin.cpp").read_text()
    # Extract actual production method bodies, not a hand-written protocol twin.
    ledger = plugin[plugin.index("    struct OwnerLedger {"):plugin.index("    struct WireEvent {")]
    start = ledger.index("    std::map<std::string, PHLWINDOWREF> windowLifetimes;")
    end = ledger.index("    std::map<std::string, OwnerLedger> owners;")
    ledger = ledger[:start] + ledger[end:]
    helpers = plugin[plugin.index("using J = "):plugin.index("int integer(")]
    source = r'''
#include <json-c/json.h>
#include <sys/stat.h>
#include <sys/socket.h>
#include <sys/syscall.h>
#include <sys/wait.h>
#include <signal.h>
#include <poll.h>
#include <fcntl.h>
#include <unistd.h>
#include <climits>
#include <cstdint>
#include <cctype>
#include <algorithm>
#include <map>
#include <string>
#include <memory>
#include <cassert>
''' + helpers + r'''
std::string nonce() { static int n = 0; return std::string(40, 'a') + std::to_string(++n); }
std::string processStartTicks(pid_t) { return "123"; }
struct Keyboard { void* client = nullptr; bool dead = false; };
using Pointer = Keyboard;
Keyboard *destroyK = nullptr, *destroyP = nullptr;
int destroyed = 0;
void wl_client_destroy(void* client) {
    assert(client == destroyK->client && client == destroyP->client);
    ++destroyed; destroyK->dead = true; destroyP->dead = true;
}
struct Peer { int pidfd = -1; pid_t pid = 0; uid_t uid = 0; std::string startTicks; };
struct State {
    bool armed = false, failed = false, ownedModifiers = false;
    std::string instanceID = "original-compositor";
    std::map<int, std::unique_ptr<Peer>> peers;
    int guardianFD = -1, releases = 0;
    std::string keys, buttons;
    J status(bool ok = true, const std::string& error = {}) {
        auto row = obj(); put(row.get(), "ok", ok); put(row.get(), "error", error); return row;
    }
    void revoke(const char*) {
        armed = false;
        if (activeOwner->unknown || activeOwner->reconciled) return;
        ++releases; activeOwner->empty = true; activeOwner->ack = true;
    }
''' + ledger + r'''
};
bool boolean(const J& row, const char* key) {
    json_object* value = nullptr; assert(json_object_object_get_ex(row.get(), key, &value));
    return json_object_get_boolean(value);
}
int main() {
    int pipes[2]; assert(pipe(pipes) == 0);
    Peer peer{pipes[0], getpid(), getuid(), "123"}; State state;
    auto req = obj(); put(req.get(), "instance_id", state.instanceID);
    put(req.get(), "plugin_epoch", state.pluginEpoch);
    put(req.get(), "guardian_pid", int64_t(getpid()));
    put(req.get(), "guardian_uid", int64_t(getuid()));
    put(req.get(), "guardian_start_ticks", std::string("123"));
    auto captured = state.ownerRequest(peer, req.get(), "owner_capture");
    assert(boolean(captured, "ok")); const auto id = text(captured.get(), "ledger_id");
    assert(!id.empty() && state.owners.size() == 1);
    assert(text(state.ownerRequest(peer, req.get(), "owner_capture").get(), "ledger_id") == id);
    put(req.get(), "ledger_id", id); put(req.get(), "command_id", std::string("txn-1"));
    auto& owner = state.owners.at(id); state.activeOwner = &owner; state.armed = true;
    assert(!boolean(state.ownerRequest(peer, req.get(), "owner_status"), "ok"));
    assert(state.releases == 0); // read-before-submit has no release side effect
    auto wrong = obj(); put(wrong.get(), "instance_id", state.instanceID);
    put(wrong.get(), "plugin_epoch", std::string("replacement-plugin"));
    put(wrong.get(), "ledger_id", id); put(wrong.get(), "command_id", std::string("txn-1"));
    assert(!boolean(state.ownerRequest(peer, wrong.get(), "owner_reconcile"), "ok"));
    Peer foreign = peer; foreign.pid = 2;
    assert(!boolean(state.ownerRequest(foreign, req.get(), "owner_reconcile"), "ok"));
    assert(state.releases == 0);
    auto reconciled = state.ownerRequest(peer, req.get(), "owner_reconcile");
    assert(boolean(reconciled, "revoked") && boolean(reconciled, "release_ack"));
    assert(state.releases == 1);
    // Simulate lost ACK then query and duplicate mutation. No second release.
    assert(boolean(state.ownerRequest(peer, req.get(), "owner_status"), "ok"));
    assert(boolean(state.ownerRequest(peer, req.get(), "owner_reconcile"), "ok"));
    assert(state.releases == 1);
    put(req.get(), "command_id", std::string("wrong-transaction"));
    assert(!boolean(state.ownerRequest(peer, req.get(), "owner_reconcile"), "ok"));
    assert(!boolean(state.ownerRequest(peer, req.get(), "owner_status"), "ok"));
    put(req.get(), "command_id", std::string("txn-1"));
    Keyboard k; Pointer p; k.client = &state; p.client = &state;
    destroyK = &k; destroyP = &p; owner.keyboard = &k; owner.pointer = &p;
    owner.unknown = true; owner.ack = false; owner.empty = false;
    auto retired = state.ownerRequest(peer, req.get(), "owner_retire");
    assert(boolean(retired, "retired") && boolean(retired, "unknown_release"));
    assert(boolean(retired, "native_resources_retired") && !boolean(retired, "release_ack"));
    assert(!boolean(retired, "receiver_release_verified"));
    assert(destroyed == 1 && state.releases == 1);
    state.ownerRequest(peer, req.get(), "owner_retire"); assert(destroyed == 1);
    put(req.get(), "ledger_id", std::string("missing"));
    assert(!boolean(state.ownerRequest(peer, req.get(), "owner_reconcile"), "ok"));
    assert(state.owners.size() == 1 && state.owners.at(id).unknown);
    // Reconciling a historical owner cannot release a DIFFERENT active ledger.
    State::OwnerLedger second; second.id = "second"; second.recoveryPID = peer.pid;
    second.recoveryUID = peer.uid; second.recoveryStart = peer.startTicks;
    state.owners.emplace(second.id, second);
    state.activeOwner = &state.owners.at("second"); state.armed = true;
    put(req.get(), "ledger_id", id);
    state.ownerRequest(peer, req.get(), "owner_reconcile");
    assert(state.releases == 1 && state.armed && !state.activeOwner->revoked);
    // A full tombstone table refuses allocation, never evicts unknown evidence.
    State full;
    for (int i = 0; i < 4096; ++i) full.owners.emplace(std::to_string(i), second);
    put(req.get(), "instance_id", full.instanceID);
    put(req.get(), "plugin_epoch", full.pluginEpoch);
    assert(!boolean(full.ownerRequest(peer, req.get(), "owner_capture"), "ok"));
    assert(full.owners.size() == 4096);
    // Real kernel pidfd lifetime, fake compositor edges only. Controller death
    // permits exact capability adoption, never proves release or destroys input.
    const pid_t child = fork(); assert(child >= 0);
    if (child == 0) { for (;;) pause(); }
    const int childFD = syscall(SYS_pidfd_open, child, 0); assert(childFD >= 0);
    Peer predecessor{childFD, child, getuid(), "123"}; State durable;
    auto adoption = obj(); put(adoption.get(), "instance_id", durable.instanceID);
    put(adoption.get(), "plugin_epoch", durable.pluginEpoch);
    put(adoption.get(), "guardian_pid", int64_t(getpid()));
    put(adoption.get(), "guardian_uid", int64_t(getuid()));
    put(adoption.get(), "guardian_start_ticks", std::string("123"));
    auto saved = durable.ownerRequest(predecessor, adoption.get(), "owner_capture");
    assert(boolean(saved, "ok")); const auto durableID = text(saved.get(), "ledger_id");
    auto& durableOwner = durable.owners.at(durableID);
    assert(fcntl(durableOwner.recoveryPidfd, F_GETFD) & FD_CLOEXEC);
    durableOwner.unknown = true; durableOwner.ack = false; durableOwner.empty = false;
    durable.activeOwner = &durableOwner; durable.armed = true;
    put(adoption.get(), "ledger_id", durableID);
    put(adoption.get(), "recovery_capability", text(saved.get(), "recovery_capability"));
    put(adoption.get(), "recovery_pid", int64_t(child));
    put(adoption.get(), "recovery_uid", int64_t(getuid()));
    put(adoption.get(), "recovery_start_ticks", std::string("123"));
    put(adoption.get(), "command_id", std::string("adoption-1"));
    assert(!boolean(durable.ownerRequest(peer, adoption.get(), "owner_reconnect"), "ok"));
    assert(durableOwner.recoveryPID == child && durable.releases == 0);
    kill(child, SIGKILL); int childStatus = 0; assert(waitpid(child, &childStatus, 0) == child);
    put(adoption.get(), "recovery_capability", std::string("wrong"));
    assert(!boolean(durable.ownerRequest(peer, adoption.get(), "owner_reconnect"), "ok"));
    put(adoption.get(), "recovery_capability", text(saved.get(), "recovery_capability"));
    Peer wrongPrincipal = peer; wrongPrincipal.uid = getuid() + 1;
    assert(!boolean(durable.ownerRequest(wrongPrincipal, adoption.get(), "owner_reconnect"), "ok"));
    put(adoption.get(), "guardian_pid", int64_t(getpid() + 1));
    assert(!boolean(durable.ownerRequest(peer, adoption.get(), "owner_reconnect"), "ok"));
    put(adoption.get(), "guardian_pid", int64_t(getpid()));
    auto adopted = durable.ownerRequest(peer, adoption.get(), "owner_reconnect");
    assert(boolean(adopted, "adoption_confirmed") && boolean(adopted, "unknown_release"));
    assert(!boolean(adopted, "release_ack") && !boolean(adopted, "receiver_release_verified"));
    assert(durableOwner.recoveryPID == peer.pid && durable.releases == 0 && !durable.armed);
    assert(durableOwner.inputFenced);
    // Lost ACK: mutation cannot replay; only exact successor may query tombstone.
    assert(!boolean(durable.ownerRequest(peer, adoption.get(), "owner_reconnect"), "ok"));
    assert(boolean(durable.ownerRequest(peer, adoption.get(), "owner_reconnect_status"), "ok"));
    assert(!boolean(durable.ownerRequest(foreign, adoption.get(), "owner_reconnect_status"), "ok"));
    put(adoption.get(), "command_id", std::string("unknown"));
    assert(!boolean(durable.ownerRequest(peer, adoption.get(), "owner_reconnect_status"), "ok"));
    assert(durable.releases == 0 && durableOwner.unknown && !durableOwner.revoked);
    close(childFD); close(durableOwner.recoveryPidfd);
    close(pipes[0]); close(pipes[1]);
}
'''
    cpp, binary = tmp_path / "owner.cpp", tmp_path / "owner-test"
    cpp.write_text(source)
    subprocess.run(["c++", "-std=c++23", "-Wall", "-Wextra", "-Werror", str(cpp),
                    "-o", str(binary), *flags], check=True, capture_output=True, text=True)
    subprocess.run([str(binary)], check=True, capture_output=True, text=True, timeout=5)


def test_native_window_lifetime_component(tmp_path):
    if not shutil.which("c++"):
        pytest.skip("C++ unavailable")
    plugin = Path("assets/hyprland-input/scope-plugin.cpp").read_text()
    lifetime = plugin[plugin.index("    std::string pluginEpoch = nonce();"):
                      plugin.index("    std::map<std::string, OwnerLedger> owners;")]
    source = r'''
#include <map>
#include <string>
#include <memory>
#include <stdexcept>
#include <cassert>
std::string nonce() { static int n = 0; return std::to_string(++n); }
template<class T> using WP = std::weak_ptr<T>;
struct CWLSurfaceResource {};
struct Window {
    std::shared_ptr<CWLSurfaceResource> surface = std::make_shared<CWLSurfaceResource>();
    auto resource() const { return surface; }
};
using PHLWINDOW = std::shared_ptr<Window>;
using PHLWINDOWREF = WP<Window>;
struct State {
''' + lifetime + r'''
};
int main() {
    State state; auto window = std::make_shared<Window>();
    const auto first = state.windowID(window);
    assert(state.windowID(window) == first);
    // The same window object with a replacement surface is a new lifetime.
    window->surface = std::make_shared<CWLSurfaceResource>();
    const auto second = state.windowID(window); assert(second != first);
    window.reset(); auto replacement = std::make_shared<Window>();
    assert(state.windowID(replacement) != second);
    State reloaded; assert(reloaded.windowID(replacement) != state.windowID(replacement));
}
'''
    cpp, binary = tmp_path / "lifetime.cpp", tmp_path / "lifetime-test"
    cpp.write_text(source)
    subprocess.run(["c++", "-std=c++23", "-Wall", "-Wextra", "-Werror", str(cpp),
                    "-o", str(binary)], check=True, capture_output=True, text=True)
    subprocess.run([str(binary)], check=True, capture_output=True, text=True, timeout=5)
