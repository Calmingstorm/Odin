#pragma once
#define ODIN_DURABLE_JOURNAL_SNAPSHOT_VERSION 2
#include <cerrno>
#include <cstring>
#include <fcntl.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <unistd.h>
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

// Conservative read-only evdev gate for attributed recovery. This is an
// observation, NOT an exclusion lock: a human may press after the last ioctl.
// Call immediately before recovery and retain the independent ownership fence.
// In particular, do not exclude uinput devices by name or release/grab anything.
#include <algorithm>
#include <array>
#include <cerrno>
#include <cstddef>
#include <cstring>
#include <dirent.h>
#include <fcntl.h>
#include <linux/input.h>
#include <string>
#include <string_view>
#include <sys/ioctl.h>
#include <sys/stat.h>
#include <unistd.h>
#include <vector>

namespace odin_scope {
namespace physical_detail {

inline constexpr std::size_t keyBytes = (KEY_MAX + 8U) / 8U;
using KeyBits = std::array<unsigned char, keyBytes>;

inline bool eventNodeName(std::string_view name) noexcept {
    if (name.size() <= 5 || name.substr(0, 5) != "event")
        return false;
    return std::all_of(name.begin() + 5, name.end(), [](unsigned char c) {
        return c >= '0' && c <= '9';
    });
}

// Inspect every defined key/button bit, not just advertised capabilities.
inline bool anyKey(const KeyBits& bits) noexcept {
    for (unsigned code = 0; code <= KEY_MAX; ++code)
        if ((bits[code / 8] & (1U << (code % 8))) != 0)
            return true;
    return false;
}

inline bool sameNode(const struct stat& a, const struct stat& b) noexcept {
    return a.st_dev == b.st_dev && a.st_ino == b.st_ino &&
        a.st_rdev == b.st_rdev && a.st_mode == b.st_mode &&
        a.st_uid == b.st_uid && a.st_gid == b.st_gid &&
        a.st_ctim.tv_sec == b.st_ctim.tv_sec &&
        a.st_ctim.tv_nsec == b.st_ctim.tv_nsec;
}

inline bool sameDirectory(const struct stat& a, const struct stat& b) noexcept {
    return S_ISDIR(a.st_mode) && S_ISDIR(b.st_mode) && sameNode(a, b) &&
        a.st_mtim.tv_sec == b.st_mtim.tv_sec &&
        a.st_mtim.tv_nsec == b.st_mtim.tv_nsec && a.st_nlink == b.st_nlink;
}

// The entire OS boundary is injectable. Tests use an in-memory fake and never
// enumerate, open, ioctl, grab, or write any live input device.
struct NativeSyscalls {
    int openAt(int dir, const char* path, int flags) noexcept {
        return ::openat(dir, path, flags);
    }
    int closeFd(int fd) noexcept { return ::close(fd); }
    int statFd(int fd, struct stat* info) noexcept { return ::fstat(fd, info); }
    int statAt(int dir, const char* path, struct stat* info, int flags) noexcept {
        return ::fstatat(dir, path, info, flags);
    }
    int ioctlFd(int fd, unsigned long request, void* data) noexcept {
        return ::ioctl(fd, request, data);
    }
    bool entries(int fd, std::vector<std::string>& names) {
        // A new file description avoids sharing/changing the directory offset.
        const int scan = ::openat(fd, ".", O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
        if (scan < 0)
            return false;
        DIR* dir = ::fdopendir(scan);
        if (!dir) {
            ::close(scan);
            return false;
        }
        bool ok = true;
        try {
            for (;;) {
                errno = 0;
                const auto* entry = ::readdir(dir);
                if (!entry) {
                    ok = errno == 0;
                    break;
                }
                // Do not trust d_type; fstatat(AT_SYMLINK_NOFOLLOW) is definitive.
                if (eventNodeName(entry->d_name)) {
                    if (names.size() >= 4096) {
                        ok = false;
                        break;
                    }
                    names.emplace_back(entry->d_name);
                }
            }
        } catch (...) {
            ::closedir(dir);
            throw;
        }
        return ::closedir(dir) == 0 && ok;
    }
};

template <typename Syscalls> class OwnedFd {
    Syscalls& sys;
    int value;
public:
    OwnedFd(Syscalls& calls, int fd) noexcept : sys(calls), value(fd) {}
    OwnedFd(const OwnedFd&) = delete;
    OwnedFd& operator=(const OwnedFd&) = delete;
    ~OwnedFd() noexcept {
        if (value >= 0) {
            try { sys.closeFd(value); } catch (...) {}
        }
    }
    int get() const noexcept { return value; }
    bool close() {
        const int fd = value;
        value = -1; // Never retry close: the descriptor may already be reused.
        return fd < 0 || sys.closeFd(fd) == 0;
    }
};

struct Node {
    std::string name;
    struct stat identity {};
};

template <typename Syscalls>
bool snapshot(Syscalls& sys, int dir, std::vector<Node>& nodes) {
    std::vector<std::string> names;
    if (!sys.entries(dir, names))
        return false;
    names.erase(std::remove_if(names.begin(), names.end(), [](const auto& n) {
        return !eventNodeName(n);
    }), names.end());
    if (names.empty() || names.size() > 4096)
        return false;
    std::sort(names.begin(), names.end());
    if (std::adjacent_find(names.begin(), names.end()) != names.end())
        return false;
    for (const auto& name : names) {
        Node node{name, {}};
        if (sys.statAt(dir, name.c_str(), &node.identity, AT_SYMLINK_NOFOLLOW) != 0 ||
            !S_ISCHR(node.identity.st_mode))
            return false;
        nodes.push_back(node);
    }
    return true;
}

template <typename Syscalls>
bool inspect(Syscalls& sys) {
    constexpr int directoryFlags = O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW;
    OwnedFd<Syscalls> dir(sys, sys.openAt(AT_FDCWD, "/dev/input", directoryFlags));
    if (dir.get() < 0)
        return false;
    struct stat before {};
    if (sys.statFd(dir.get(), &before) != 0 || !S_ISDIR(before.st_mode))
        return false;
    std::vector<Node> initial;
    if (!snapshot(sys, dir.get(), initial))
        return false;
    bool keyCapable = false;
    for (const auto& node : initial) {
        OwnedFd<Syscalls> device(sys, sys.openAt(dir.get(), node.name.c_str(),
            O_RDONLY | O_NONBLOCK | O_CLOEXEC | O_NOFOLLOW));
        if (device.get() < 0)
            return false;
        struct stat opened {};
        if (sys.statFd(device.get(), &opened) != 0 ||
            !S_ISCHR(opened.st_mode) || !sameNode(node.identity, opened))
            return false;
        KeyBits capabilities {};
        KeyBits held {};
        // A truncated/unknown bitmap is not evidence that all keys are up.
        if (sys.ioctlFd(device.get(), EVIOCGBIT(EV_KEY, keyBytes), capabilities.data()) !=
                static_cast<int>(keyBytes) ||
            sys.ioctlFd(device.get(), EVIOCGKEY(keyBytes), held.data()) !=
                static_cast<int>(keyBytes) || anyKey(held))
            return false;
        keyCapable = keyCapable || anyKey(capabilities);
        struct stat after {};
        if (sys.statFd(device.get(), &after) != 0 || !sameNode(opened, after) ||
            !device.close())
            return false;
    }
    if (!keyCapable)
        return false;
    std::vector<Node> final;
    if (!snapshot(sys, dir.get(), final) || initial.size() != final.size())
        return false;
    for (std::size_t i = 0; i < initial.size(); ++i)
        if (initial[i].name != final[i].name ||
            !sameNode(initial[i].identity, final[i].identity))
            return false;
    struct stat after {};
    if (sys.statFd(dir.get(), &after) != 0 || !sameDirectory(before, after))
        return false;
    // Also detect replacing /dev/input itself while the original fd stayed open.
    OwnedFd<Syscalls> current(sys, sys.openAt(AT_FDCWD, "/dev/input", directoryFlags));
    struct stat pathNow {};
    if (current.get() < 0 || sys.statFd(current.get(), &pathNow) != 0 ||
        !sameDirectory(before, pathNow))
        return false;
    return current.close() && dir.close();
}
} // namespace physical_detail

template <typename Syscalls>
bool physicalInputsReleasedWith(Syscalls& sys) noexcept {
    try {
        return physical_detail::inspect(sys);
    } catch (...) {
        return false;
    }
}

inline bool physicalInputsReleased() noexcept {
    physical_detail::NativeSyscalls sys;
    return physicalInputsReleasedWith(sys);
}
} // namespace odin_scope

namespace odin_scope {
// Exact durable intent, NOT receiver proof. Persist before down; retire only
// after verified up. Atomic bounded snapshots retain all pending evidence.
// Single-thread owner, never share across fork. Private compositor-lifetime
// runtime path must remain intact. Same-UID malicious rollback is out of scope.
// Persisted pre-down intent can be a conservative ghost. If storage refuses
// even poison-marker creation, the caller must fence observer continuity.
// Permanent poison has deliberately no clear API: overlap loses ownership.
// Legacy append WALs are rejected unchanged, never silently migrated or erased.
class RecoveryJournal {
  public:
    enum class PressResult { Failed, AlreadyPending, Fresh };
    static constexpr uint32_t MaxInputCode = 0x2ff; // Linux KEY_MAX includes BTN_*
    static constexpr std::size_t MaxEntries = 2 * (MaxInputCode + 1) + 4, HeaderSize = 256;
    static constexpr std::size_t MaxBytes = HeaderSize + MaxEntries * 8 + 4;
    RecoveryJournal() = default;
    RecoveryJournal(const RecoveryJournal&) = delete;
    RecoveryJournal& operator=(const RecoveryJournal&) = delete;
    ~RecoveryJournal() {
        if (fd_ >= 0) ::close(fd_);
        if (lock_ >= 0) ::close(lock_);
        if (directory_ >= 0) ::close(directory_);
    }
    bool ready() const { return ready_; }
    bool poisoned() const { return poisoned_; }
    const std::string& error() const { return error_; }
    int64_t sourcePID() const { return sourcePID_; }
    const std::string& sourceStartTicks() const { return sourceStartTicks_; }
    std::set<uint32_t> heldKeys() const { return keys_; }
    std::set<uint32_t> heldButtons() const { return buttons_; }
    std::set<uint32_t> heldModifiers() const { return modifiers_; }
    bool modifiersPending() const { return !ready_ || !modifiers_.empty(); }
    bool hasPending() const { return !ready_ || poisoned_ || !keys_.empty() || !buttons_.empty() || !modifiers_.empty(); }
    bool open(const std::string& directory, const std::string& instanceID) {
        if (attempted_) return fail("open may only be called once");
        attempted_ = true;
        if (instanceID.size() < 4 || instanceID.size() > 131 || instanceID.compare(0, 3, "i1-") ||
            instanceID.find_first_not_of("0123456789abcdef", 3) != std::string::npos)
            return fail("invalid compositor instance ID");
        directory_ = openDirectory(directory);
        struct stat st{};
        if (directory_ < 0 || ::fstat(directory_, &st) || !privateDirectory(st))
            return fail("runtime directory must be private, owned, and without symlinks");
        directoryDevice_ = st.st_dev; directoryInode_ = st.st_ino;
        instance_ = instanceID;
        filename_ = "odin-scope-recovery-" + instanceID + ".wal";
        lockname_ = filename_ + ".lock"; nextname_ = filename_ + ".next";
        lock_ = ::openat(directory_, lockname_.c_str(), O_RDWR | O_CREAT | O_CLOEXEC | O_NOFOLLOW | O_NONBLOCK, 0600);
        if (lock_ < 0 || ::fstat(lock_, &st) || !privateFile(st) || st.st_size ||
            ::flock(lock_, LOCK_EX | LOCK_NB)) return fail("unsafe or locked journal lock");
        lockDevice_ = st.st_dev; lockInode_ = st.st_ino;
        fd_ = ::openat(directory_, filename_.c_str(), O_RDONLY | O_CLOEXEC | O_NOFOLLOW | O_NONBLOCK);
        if (fd_ < 0 && errno != ENOENT) return fail("cannot safely open snapshot");
        if (fd_ >= 0) {
            if (::fstat(fd_, &st) || !privateFile(st) || st.st_size < off_t(HeaderSize + 4) || st.st_size > off_t(MaxBytes))
                return fail("invalid snapshot object or size; evidence preserved");
            device_ = st.st_dev; inode_ = st.st_ino; size_ = st.st_size;
            std::vector<unsigned char> bytes(static_cast<std::size_t>(size_));
            if (!readBytes(fd_, bytes.data(), bytes.size()) || !decode(bytes))
                return fail("snapshot corrupt or wrong instance; evidence preserved");
        }
        if (!identityIntact()) return false;
        struct stat poison{};
        if (::fstatat(directory_, (filename_ + ".poison").c_str(), &poison, AT_SYMLINK_NOFOLLOW) == 0) {
            if (!privateFile(poison) || poison.st_size) return fail("unsafe poison marker");
            poisoned_ = true;
        } else if (errno != ENOENT) return fail("cannot inspect poison marker");
        if (fd_ < 0) { if (!persist()) return false; }
        else if (!sync(fd_) || !sync(directory_)) return fail("snapshot open fsync failed");
        if (!identityIntact()) return false;
        ready_ = true;
        return true;
    }
    bool bindSource(int64_t pid, const std::string& startTicks) {
        if (!ready_ || poisoned_ || !identityIntact()) return false;
        if (pid <= 1 || startTicks.empty() || startTicks.size() > 32 ||
            startTicks.find_first_not_of("0123456789") != std::string::npos)
            return fail("invalid source process identity");
        if (sourcePID_ == pid && sourceStartTicks_ == startTicks) return true;
        if (hasPending()) return false;
        sourcePID_ = pid; sourceStartTicks_ = startTicks;
        return persist();
    }
    PressResult preparePress(char kind, uint32_t code) {
        if (!ready_ || poisoned_) return PressResult::Failed;
        auto* held = select(kind);
        if (!held || !validCode(kind, code)) { fail("invalid journal kind or code"); return PressResult::Failed; }
        if (!identityIntact()) return PressResult::Failed;
        if (held->count(code)) return PressResult::AlreadyPending;
        if (keys_.size() + buttons_.size() + modifiers_.size() >= MaxEntries) {
            fail("pending intent bound exceeded"); return PressResult::Failed;
        }
        held->insert(code);
        return persist() ? PressResult::Fresh : PressResult::Failed;
    }
    bool press(char kind, uint32_t code) { return preparePress(kind, code) == PressResult::Fresh; }
    bool release(char kind, uint32_t code) {
        if (!ready_ || poisoned_) return false;
        auto* held = select(kind);
        if (!held) return fail("invalid journal kind");
        if (!identityIntact()) return false;
        if (!held->count(code)) return true;
        if (!persist(kind, code)) return false;
        held->erase(code);
        return true;
    }
    bool invalidate() {
        if (!ready_ || !identityIntact()) return false;
        if (poisoned_) return true;
        poisoned_ = true;
        // Independent monotonic marker precedes snapshot replacement. A failed
        // snapshot must never let orphan cleanup discard known foreign conflict.
        const int marker = ::openat(directory_, (filename_ + ".poison").c_str(),
            O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC | O_NOFOLLOW, 0600);
        if (marker < 0) return fail("poison marker creation failed; continuity fence required");
        const bool durable = sync(marker) && sync(directory_);
        ::close(marker);
        if (!durable) return fail("poison marker fsync failed; continuity fence required");
        return persist();
    }
  private:
    int directory_ = -1, lock_ = -1, fd_ = -1;
    bool attempted_ = false, ready_ = false, poisoned_ = false;
    dev_t directoryDevice_{}, lockDevice_{}, device_{};
    ino_t directoryInode_{}, lockInode_{}, inode_{};
    off_t size_ = 0;
    int64_t sourcePID_ = 0;
    std::string filename_, lockname_, nextname_, instance_, error_, sourceStartTicks_;
    std::set<uint32_t> keys_, buttons_, modifiers_;
    bool fail(const char* reason) { ready_ = false; if (error_.empty()) error_ = reason; return false; }
    static int openDirectory(const std::string& path) {
        if (path.empty() || path[0] != '/' || path.find('\0') != std::string::npos) return -1;
        int fd = ::open("/", O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
        if (fd < 0) return -1;
        std::size_t start = 1;
        while (start < path.size()) {
            const auto end = path.find('/', start);
            const auto part = path.substr(start, end == std::string::npos ? end : end - start);
            if (!part.empty()) {
                if (part == "." || part == "..") { ::close(fd); return -1; }
                const int next = ::openat(fd, part.c_str(), O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
                ::close(fd);
                if (next < 0) return -1;
                fd = next;
            }
            if (end == std::string::npos) break;
            start = end + 1;
        }
        return fd;
    }
    static bool privateDirectory(const struct stat& st) {
        return S_ISDIR(st.st_mode) && st.st_uid == ::geteuid() && !(st.st_mode & 0077) && st.st_nlink > 0;
    }
    static bool privateFile(const struct stat& st) {
        return S_ISREG(st.st_mode) && st.st_uid == ::geteuid() && st.st_nlink == 1 && !(st.st_mode & 07077);
    }
    bool identityIntact() {
        struct stat ds{}, fs{}, entry{};
        if (::fstat(directory_, &ds) || !privateDirectory(ds) || ds.st_dev != directoryDevice_ || ds.st_ino != directoryInode_ ||
            ::fstat(lock_, &fs) || !privateFile(fs) || fs.st_size || fs.st_dev != lockDevice_ || fs.st_ino != lockInode_ ||
            ::fstatat(directory_, lockname_.c_str(), &entry, AT_SYMLINK_NOFOLLOW) ||
            !privateFile(entry) || entry.st_dev != lockDevice_ || entry.st_ino != lockInode_)
            return fail("journal directory or lock identity changed");
        if (fd_ < 0) {
            if (::fstatat(directory_, filename_.c_str(), &entry, AT_SYMLINK_NOFOLLOW) == 0 || errno != ENOENT)
                return fail("snapshot unexpectedly appeared");
        } else if (::fstat(fd_, &fs) || !privateFile(fs) || fs.st_size != size_ || fs.st_dev != device_ || fs.st_ino != inode_ ||
                   ::fstatat(directory_, filename_.c_str(), &entry, AT_SYMLINK_NOFOLLOW) ||
                   !privateFile(entry) || entry.st_dev != device_ || entry.st_ino != inode_)
            return fail("snapshot identity, ownership, permissions or size changed");
        return true;
    }
    std::set<uint32_t>* select(char kind) {
        if (kind == 'k') return &keys_;
        if (kind == 'b') return &buttons_;
        if (kind == 'm') return &modifiers_;
        return nullptr;
    }
    static bool validCode(char kind, uint32_t code) {
        return kind == 'm' ? code < 4 : (kind == 'k' || kind == 'b') && code <= MaxInputCode;
    }
    static bool sync(int fd) {
        int result; do { result = ::fsync(fd); } while (result < 0 && errno == EINTR);
        return result == 0;
    }
    static bool readBytes(int fd, unsigned char* data, std::size_t length) {
        off_t pos = 0;
        while (length) {
            const ssize_t count = ::pread(fd, data, length, pos);
            if (count < 0 && errno == EINTR) continue;
            if (count <= 0) return false;
            data += count; pos += count; length -= static_cast<std::size_t>(count);
        }
        return true;
    }
    static uint32_t checksum(const unsigned char* bytes, std::size_t size) {
        uint32_t crc = 0xffffffffU;
        for (std::size_t i = 0; i < size; ++i) {
            crc ^= bytes[i];
            for (int bit = 0; bit < 8; ++bit) crc = (crc >> 1) ^ (0xedb88320U & (0U - (crc & 1U)));
        }
        return ~crc;
    }
    static void put32(unsigned char* p, uint32_t n) {
        for (int i = 0; i < 4; ++i) p[i] = static_cast<unsigned char>(n >> (8 * i));
    }
    static uint32_t get32(const unsigned char* p) {
        uint32_t n = 0;
        for (int i = 0; i < 4; ++i) n |= static_cast<uint32_t>(p[i]) << (8 * i);
        return n;
    }
    std::vector<unsigned char> encode(char excludeKind = 0, uint32_t excludeCode = 0) const {
        std::vector<unsigned char> bytes(HeaderSize, 0);
        std::memcpy(bytes.data(), "ODSJNL02", 8); put32(bytes.data() + 8, 2);
        put32(bytes.data() + 12, static_cast<uint32_t>(instance_.size()));
        std::memcpy(bytes.data() + 16, instance_.data(), instance_.size());
        put32(bytes.data() + 156, poisoned_ ? 1 : 0);
        put32(bytes.data() + 160, static_cast<uint32_t>(sourcePID_));
        put32(bytes.data() + 164, static_cast<uint32_t>(uint64_t(sourcePID_) >> 32));
        put32(bytes.data() + 168, static_cast<uint32_t>(sourceStartTicks_.size()));
        std::memcpy(bytes.data() + 172, sourceStartTicks_.data(), sourceStartTicks_.size());
        const auto add = [&](char kind, const std::set<uint32_t>& held) {
            for (auto code : held) {
                if (kind == excludeKind && code == excludeCode) continue;
                const auto pos = bytes.size(); bytes.resize(pos + 8, 0);
                bytes[pos] = static_cast<unsigned char>(kind); put32(bytes.data() + pos + 4, code);
            }
        };
        add('k', keys_); add('b', buttons_); add('m', modifiers_);
        put32(bytes.data() + 152, static_cast<uint32_t>((bytes.size() - HeaderSize) / 8));
        put32(bytes.data() + HeaderSize - 4, checksum(bytes.data(), HeaderSize - 4));
        const auto digest = checksum(bytes.data(), bytes.size());
        const auto pos = bytes.size(); bytes.resize(pos + 4); put32(bytes.data() + pos, digest);
        return bytes;
    }
    bool decode(const std::vector<unsigned char>& bytes) {
        if (std::memcmp(bytes.data(), "ODSJNL02", 8) || get32(bytes.data() + 8) != 2 ||
            get32(bytes.data() + 12) != instance_.size() ||
            std::memcmp(bytes.data() + 16, instance_.data(), instance_.size()) ||
            get32(bytes.data() + 152) > MaxEntries || get32(bytes.data() + 156) > 1 || get32(bytes.data() + 168) > 32 ||
            bytes.size() != HeaderSize + 4 + std::size_t(get32(bytes.data() + 152)) * 8 ||
            checksum(bytes.data(), HeaderSize - 4) != get32(bytes.data() + HeaderSize - 4) ||
            checksum(bytes.data(), bytes.size() - 4) != get32(bytes.data() + bytes.size() - 4)) return false;
        poisoned_ = get32(bytes.data() + 156) != 0;
        sourcePID_ = int64_t(uint64_t(get32(bytes.data() + 160)) | (uint64_t(get32(bytes.data() + 164)) << 32));
        sourceStartTicks_.assign(reinterpret_cast<const char*>(bytes.data() + 172), get32(bytes.data() + 168));
        if ((sourcePID_ == 0) != sourceStartTicks_.empty() || sourcePID_ < 0 || sourcePID_ == 1 ||
            sourceStartTicks_.find_first_not_of("0123456789") != std::string::npos) return false;
        for (std::size_t pos = HeaderSize; pos + 4 < bytes.size(); pos += 8) {
            auto* held = select(static_cast<char>(bytes[pos]));
            if (!held || bytes[pos + 1] || bytes[pos + 2] || bytes[pos + 3] ||
                !validCode(static_cast<char>(bytes[pos]), get32(bytes.data() + pos + 4)) ||
                !held->insert(get32(bytes.data() + pos + 4)).second) return false;
        }
        return encode() == bytes;
    }
    bool persist(char excludeKind = 0, uint32_t excludeCode = 0) {
        if (!identityIntact()) return false;
        const auto bytes = encode(excludeKind, excludeCode);
        struct stat orphan{};
        if (::fstatat(directory_, nextname_.c_str(), &orphan, AT_SYMLINK_NOFOLLOW) == 0) {
            if (!privateFile(orphan) || ::unlinkat(directory_, nextname_.c_str(), 0))
                return fail("unsafe orphan snapshot; preserved");
        } else if (errno != ENOENT) return fail("cannot inspect orphan snapshot");
        const int next = ::openat(directory_, nextname_.c_str(), O_RDWR | O_CREAT | O_EXCL | O_CLOEXEC | O_NOFOLLOW, 0600);
        if (next < 0) return fail("cannot create next snapshot");
        std::size_t pos = 0;
        while (pos < bytes.size()) {
            const auto count = ::write(next, bytes.data() + pos, bytes.size() - pos);
            if (count < 0 && errno == EINTR) continue;
            if (count <= 0) { ::close(next); return fail("snapshot write failed; old evidence preserved"); }
            pos += static_cast<std::size_t>(count);
        }
        struct stat st{}, entry{};
        if (!sync(next) || ::fstat(next, &st) || !privateFile(st) || st.st_size != off_t(bytes.size()) ||
            ::fstatat(directory_, nextname_.c_str(), &entry, AT_SYMLINK_NOFOLLOW) ||
            entry.st_dev != st.st_dev || entry.st_ino != st.st_ino || !identityIntact()) {
            ::close(next); return fail("snapshot fsync or identity failed; old evidence preserved");
        }
        if (::renameat(directory_, nextname_.c_str(), directory_, filename_.c_str())) {
            ::close(next); return fail("snapshot rename failed; old evidence preserved");
        }
        if (fd_ >= 0) ::close(fd_);
        fd_ = next; device_ = st.st_dev; inode_ = st.st_ino; size_ = st.st_size;
        if (!sync(directory_)) return fail("snapshot directory fsync failed; dispatch forbidden");
        return identityIntact();
    }
};
} // namespace odin_scope
