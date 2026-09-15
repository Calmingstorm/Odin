"""The native evdev gate is compiled against fake syscalls, never live input."""
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
HEADER = ROOT / "assets/hyprland-input/scope-provenance.hpp"


@pytest.fixture(scope="module")
def gate(tmp_path_factory):
    compiler = shutil.which("c++")
    assert compiler, "C++ compiler required"
    directory = tmp_path_factory.mktemp("physical-gate")
    source = directory / "gate.cpp"
    source.write_text(CPP)
    binary = directory / "gate"
    subprocess.run([compiler, "-std=c++23", "-Wall", "-Wextra", "-Werror", "-I",
                    str(HEADER.parent), str(source), "-o", str(binary)], check=True)
    return binary


@pytest.mark.parametrize("case", ["clean", "held", "keyless", "empty", "inaccessible",
    "symlink", "regular", "changed", "added", "removed", "replaced", "directory-changed",
    "short", "ioctl-error", "close-error", "exception", "duplicate", "parse",
    "key-short", "key-zero", "key-oversize", "key-error", "caps-zero", "caps-oversize",
    "ioctl-throw", "open-error", "reopen-error", "directory-stat", "directory-not-dir",
    "node-stat", "device-stat", "snapshot-group", "snapshot-ctime", "directory-nlink",
    "later-inaccessible", "later-held", "keyless-held", "multi-clean"])
def test_physical_gate(gate, case):
    subprocess.run([str(gate), case], check=True, timeout=10)


def test_read_only():
    source = HEADER.read_text().split("namespace physical_detail {", 1)[1]
    source = source.split("} // namespace physical_detail", 1)[0]
    for forbidden in ("EVIOCGRAB", "EVIOCGNAME", "::write(", "::read("):
        assert forbidden not in source


CPP = r'''
#include "scope-provenance.hpp"
#include <cassert>
#include <map>
#include <stdexcept>
using namespace odin_scope;
using physical_detail::KeyBits;
using physical_detail::keyBytes;
struct Fake {
    std::string fault;
    std::map<int, std::string> fds;
    int next = 100, scans = 0, opens = 0, ioctls = 0;
    unsigned held = KEY_MAX + 1;
    int openAt(int dir, const char* path, int flags) {
        assert((flags & O_ACCMODE) == O_RDONLY);
        assert(flags & O_NOFOLLOW); assert(flags & O_CLOEXEC);
        if (std::string(path) == "/dev/input") {
            assert(dir == AT_FDCWD); assert(flags & O_DIRECTORY); ++opens;
            if (fault == "open-error" || (fault == "reopen-error" && opens > 1)) return -1;
        } else {
            assert(fds.at(dir) == "/dev/input"); assert(flags & O_NONBLOCK);
            if (fault == "inaccessible") return -1;
            if (fault == "later-inaccessible" && std::string(path) == "event1") return -1;
        }
        fds[++next] = path; return next;
    }
    int closeFd(int fd) { assert(fds.erase(fd) == 1); return fault == "close-error" ? -1 : 0; }
    void identity(struct stat* s, bool dir) {
        *s = {}; s->st_mode = dir ? S_IFDIR | 0755 : S_IFCHR | 0600;
        s->st_dev = 1; s->st_ino = dir ? 2 : 3; s->st_rdev = dir ? 0 : 4; s->st_nlink = 1;
    }
    int statFd(int fd, struct stat* s) {
        const bool dir = fds.at(fd) == "/dev/input";
        identity(s, dir);
        if ((dir && fault == "directory-stat") || (!dir && fault == "device-stat")) return -1;
        if (dir && fault == "directory-not-dir") s->st_mode = S_IFREG | 0600;
        if (!dir && fault == "changed") ++s->st_ino;
        if (dir && fault == "replaced" && opens > 1) ++s->st_ino;
        if (dir && fault == "directory-changed" && scans > 1) ++s->st_mtim.tv_nsec;
        if (dir && fault == "directory-nlink" && scans > 1) ++s->st_nlink;
        return 0;
    }
    int statAt(int dir, const char*, struct stat* s, int flags) {
        assert(fds.at(dir) == "/dev/input"); assert(flags == AT_SYMLINK_NOFOLLOW);
        if (fault == "node-stat") return -1;
        identity(s, false);
        if (fault == "snapshot-group" && scans > 1) ++s->st_gid;
        if (fault == "snapshot-ctime" && scans > 1) ++s->st_ctim.tv_nsec;
        if (fault == "symlink") s->st_mode = S_IFLNK | 0777;
        if (fault == "regular") s->st_mode = S_IFREG | 0600;
        return 0;
    }
    bool entries(int dir, std::vector<std::string>& names) {
        assert(fds.at(dir) == "/dev/input"); ++scans;
        if (fault == "exception") throw std::runtime_error("fake failure");
        if (fault != "empty" && !(fault == "removed" && scans > 1)) names.push_back("event0");
        if (fault == "later-inaccessible" || fault == "later-held" ||
            fault == "keyless-held" || fault == "multi-clean") names.push_back("event1");
        if (fault == "added" && scans > 1) names.push_back("event1");
        if (fault == "duplicate") names.push_back("event0");
        names.push_back("mouse0"); names.push_back("event"); names.push_back("event1bad");
        return true;
    }
    int ioctlFd(int fd, unsigned long request, void* out) {
        const auto& name = fds.at(fd);
        assert(name == "event0" || name == "event1"); ++ioctls;
        assert(request == EVIOCGBIT(EV_KEY, keyBytes) || request == EVIOCGKEY(keyBytes));
        if (fault == "ioctl-throw") throw std::runtime_error("ioctl failure");
        if (fault == "short") return keyBytes - 1;
        if (fault == "ioctl-error") return -1;
        if (request == EVIOCGKEY(keyBytes)) {
            if (fault == "key-short") return keyBytes - 1;
            if (fault == "key-zero") return 0;
            if (fault == "key-oversize") return keyBytes + 1;
            if (fault == "key-error") return -1;
        } else {
            if (fault == "caps-zero") return 0;
            if (fault == "caps-oversize") return keyBytes + 1;
        }
        KeyBits bits{};
        if (request == EVIOCGBIT(EV_KEY, keyBytes) && fault != "keyless")
            bits[KEY_A / 8] |= 1U << (KEY_A % 8);
        if (request == EVIOCGBIT(EV_KEY, keyBytes) && fault == "keyless-held" && name == "event1")
            bits.fill(0);
        if (request == EVIOCGKEY(keyBytes) && held <= KEY_MAX) bits[held / 8] |= 1U << (held % 8);
        if (request == EVIOCGKEY(keyBytes) && name == "event1" &&
            (fault == "later-held" || fault == "keyless-held"))
            bits[BTN_RIGHT / 8] |= 1U << (BTN_RIGHT % 8);
        std::memcpy(out, bits.data(), keyBytes); return keyBytes;
    }
};
int main(int argc, char** argv) {
    assert(argc == 2); std::string test = argv[1];
    static_assert(noexcept(physicalInputsReleased()));
    if (test == "parse") {
        assert(physical_detail::eventNodeName("event0"));
        assert(!physical_detail::eventNodeName("event-1"));
        assert(!physical_detail::eventNodeName(std::string_view("event1\0bad", 10)));
    } else if (test == "held") {
        for (unsigned key = 0; key <= KEY_MAX; ++key) {
            Fake f; f.held = key;
            assert(!physicalInputsReleasedWith(f)); assert(f.fds.empty());
        }
    } else {
        Fake f; f.fault = test;
        assert(physicalInputsReleasedWith(f) == (test == "clean" || test == "multi-clean"));
        assert(f.fds.empty());
        if (test == "clean") { assert(f.ioctls == 2); assert(f.scans == 2); assert(f.opens == 2); }
    }
}
'''
