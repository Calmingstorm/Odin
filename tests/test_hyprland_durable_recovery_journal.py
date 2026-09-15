"""Compile actual journal, real private temp files, fault injection; no input."""
import os
import shutil
import struct
import subprocess
import zlib
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
INSTANCE = "i1-0123456789abcdef"
FILENAME = f"odin-scope-recovery-{INSTANCE}.wal"
DRIVER = r'''
#include "scope-provenance.hpp"
#include <cassert>
#include <iostream>
#include <signal.h>
using J = odin_scope::RecoveryJournal;
static std::string fault;
static int writes = 0, syncs = 0;
extern "C" int __real_fsync(int);
extern "C" ssize_t __real_write(int, const void*, size_t);
extern "C" int __real_renameat(int,const char*,int,const char*);
extern "C" int __wrap_fsync(int fd) {
    ++syncs;
    struct stat st{}; assert(!::fstat(fd, &st));
    const bool directory = S_ISDIR(st.st_mode);
    if ((fault == "file-sync" && !directory) || (fault == "dir-sync" && directory)) {
        errno = EIO; return -1;
    }
    int rc = __real_fsync(fd);
    if ((fault == "kill-file-sync" && !directory) || (fault == "kill-dir-sync" && directory))
        ::kill(::getpid(), SIGKILL);
    return rc;
}
extern "C" ssize_t __wrap_write(int fd, const void* p, size_t n) {
    ++writes;
    if (fault == "write") { errno = ENOSPC; return -1; }
    if (fault == "partial" || fault == "kill-partial") {
        const bool die = fault == "kill-partial";
        auto rc = __real_write(fd,p,7); fault = "write";
        if (die) ::kill(::getpid(), SIGKILL);
        return rc;
    }
    return __real_write(fd,p,n);
}
extern "C" int __wrap_renameat(int a,const char* b,int c,const char* d) {
    if (fault == "rename") { errno = EIO; return -1; }
    if (fault == "kill-before-rename") ::kill(::getpid(), SIGKILL);
    auto rc = __real_renameat(a,b,c,d);
    if (fault == "kill-after-rename") ::kill(::getpid(), SIGKILL);
    return rc;
}
int main(int argc, char** argv) {
    assert(argc >= 3);
    const std::string mode = argv[1], dir = argv[2];
    const std::string id = argc > 3 ? argv[3] : "i1-0123456789abcdef";
    const std::string path = dir + "/odin-scope-recovery-" + id + ".wal";
    J j;
    const bool opened = j.open(dir,id);
    if (mode == "reject") {
        assert(!opened && !j.ready() && j.hasPending() && !j.error().empty()); return 0;
    }
    if (!opened) { std::cerr << j.error(); return 2; }
    if (mode == "empty") assert(!j.hasPending());
    else if (mode == "populate" || mode == "crash") {
        assert(j.bindSource(1234,"5678"));
        assert(j.press('k',30) && j.press('k',42) && j.press('b',272));
        for (uint32_t bit = 0; bit < 4; ++bit) assert(j.press('m',bit));
        if (mode == "crash") ::kill(::getpid(),SIGKILL);
    } else if (mode == "inspect") {
        assert(j.heldKeys() == std::set<uint32_t>({30,42}));
        assert(j.heldButtons() == std::set<uint32_t>({272}));
        assert(j.heldModifiers() == std::set<uint32_t>({0,1,2,3}));
        assert(j.sourcePID() == 1234 && j.sourceStartTicks() == "5678");
        assert(j.bindSource(1234,"5678") && !j.bindSource(1234,"9999") && j.ready());
        assert(j.preparePress('k',30) == J::PressResult::AlreadyPending && !j.press('k',30));
    } else if (mode == "release") {
        for (auto code : j.heldKeys()) assert(j.release('k',code));
        for (auto code : j.heldButtons()) assert(j.release('b',code));
        for (auto code : j.heldModifiers()) assert(j.release('m',code));
        assert(!j.hasPending() && j.bindSource(9876,"123456"));
    } else if (mode == "exact") {
        assert(j.press('k',30) && j.press('b',30) && j.press('m',3));
        const auto oldWrites = writes, oldSyncs = syncs;
        assert(j.preparePress('k',30) == J::PressResult::AlreadyPending && !j.press('k',30));
        assert(j.release('k',999) && writes == oldWrites && syncs == oldSyncs);
        assert(j.release('k',30) && j.heldKeys().empty());
        assert(j.heldButtons().count(30) && j.heldModifiers().count(3));
    } else if (mode == "poison") {
        assert(j.press('k',44) && j.invalidate() && j.invalidate());
        assert(j.poisoned() && j.ready() && !j.release('k',44) && !j.press('b',1));
    } else if (mode == "poison-inspect") {
        assert(j.poisoned() && j.ready() && j.hasPending() && j.heldKeys().count(44));
        assert(!j.release('k',44) && !j.bindSource(22,"33"));
    } else if (mode == "key44") assert(j.heldKeys() == std::set<uint32_t>({44}));
    else if (mode == "locking") {
        assert(j.press('k',9));
        J other; assert(!other.open(dir,id));
        J independent; assert(independent.open(dir,"i1-abcdef"));
    } else if (mode.starts_with("cycles:")) {
        assert(mode.size() == 8 && mode[7] >= '0' && mode[7] <= '9');
        const int batch = mode[7] - '0';
        if (batch == 0) {
            assert(!j.hasPending() && j.press('k',44));
        }
        assert(j.ready() && !j.poisoned() && j.hasPending());
        assert(j.heldKeys() == std::set<uint32_t>({44}));
        assert(j.heldButtons().empty() && j.heldModifiers().empty());
        for (int i = 0; i < 300; ++i) {
            assert(j.press('b',272) && j.release('b',272));
            struct stat st{}; assert(!::stat(path.c_str(),&st) && st.st_size == 268);
            assert(j.heldKeys() == std::set<uint32_t>({44}));
            assert(j.heldButtons().empty() && j.heldModifiers().empty());
        }
        if (batch == 9) assert(j.release('k',44));
    } else if (mode == "unlink" || mode == "replace" || mode == "chmod" ||
               mode == "dir-chmod" || mode == "truncate" || mode == "lock-unlink") {
        assert(j.press('k',44));
        if (mode == "unlink" || mode == "replace") {
            assert(!::unlink(path.c_str()));
            if (mode == "replace") {
                int fd=::open(path.c_str(),O_CREAT|O_WRONLY|O_EXCL,0600);
                assert(fd>=0); ::close(fd);
            }
        } else if (mode == "lock-unlink") assert(!::unlink((path+".lock").c_str()));
        else if (mode == "chmod") assert(!::chmod(path.c_str(),0644));
        else if (mode == "dir-chmod") assert(!::chmod(dir.c_str(),0755));
        else assert(!::truncate(path.c_str(),256));
        assert(!j.release('k',44) && !j.ready() && j.heldKeys().count(44));
    } else if (mode == "repeat-open") assert(!j.open(dir,id) && !j.ready());
    else if (mode == "invalid-kind") assert(!j.press('x',44) && !j.ready());
    else if (mode == "invalid-key") assert(!j.press('k',768) && !j.ready());
    else if (mode == "invalid-button") assert(!j.press('b',UINT32_MAX) && !j.ready());
    else if (mode == "invalid-modifier") assert(!j.press('m',4) && !j.ready());
    else if (mode == "full-domain") {
        for (uint32_t c = 0; c <= J::MaxInputCode; ++c) assert(j.press('k',c) && j.press('b',c));
        for (uint32_t c = 0; c < 4; ++c) assert(j.press('m',c));
        assert(j.preparePress('k',0) == J::PressResult::AlreadyPending);
        assert(j.release('k',0) && j.press('k',0));
        struct stat st{}; assert(!::stat(path.c_str(),&st) && st.st_size == off_t(J::MaxBytes));
    }
    else if (mode.starts_with("press:") || mode.starts_with("release:") ||
             mode.starts_with("poison:")) {
        const auto colon = mode.find(':');
        const auto operation = mode.substr(0,colon);
        if (operation != "press") assert(j.press('k',44));
        fault = mode.substr(colon+1);
        bool result = operation == "press" ? j.press('k',44) :
                      operation == "release" ? j.release('k',44) : j.invalidate();
        assert(!result && !j.ready() && j.hasPending() && j.heldKeys().count(44));
        fault.clear(); assert(!j.press('b',1) && !j.release('k',44));
    } else assert(false);
}
'''


@pytest.fixture(scope="module")
def driver(tmp_path_factory):
    compiler = shutil.which("g++-14") or shutil.which("g++")
    assert compiler
    directory = tmp_path_factory.mktemp("compiled-recovery")
    source, binary = directory / "driver.cpp", directory / "driver"
    source.write_text(DRIVER)
    result = subprocess.run([compiler, "-std=c++23", "-Wall", "-Wextra", "-Werror", "-pedantic",
                            "-I", str(ROOT / "assets/hyprland-input"), str(source),
                            "-Wl,--wrap=fsync", "-Wl,--wrap=write", "-Wl,--wrap=renameat",
                            "-o", str(binary)],
                           capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    return binary


@pytest.fixture
def runtime(tmp_path):
    directory = tmp_path / "runtime"
    directory.mkdir(mode=0o700)
    return directory


def run(driver, mode, directory, instance=INSTANCE, killed=False):
    result = subprocess.run(
        [str(driver), mode, str(directory), instance],
        capture_output=True, text=True, timeout=60,
    )
    assert result.returncode == (-9 if killed else 0), result.stderr


def test_exact_roundtrip_source_binding_and_clean_compaction(driver, runtime):
    run(driver, "populate", runtime)
    run(driver, "inspect", runtime)
    assert (runtime / FILENAME).stat().st_size == 260 + 7 * 8
    run(driver, "release", runtime)
    run(driver, "empty", runtime)
    assert (runtime / FILENAME).stat().st_size == 260


def test_crash_pending_reopens_with_duplicate_down_suppression(driver, runtime):
    run(driver, "crash", runtime, killed=True)
    run(driver, "inspect", runtime)


@pytest.mark.parametrize("mode", [
    "exact", "locking", "cycles", "full-domain", "unlink", "replace", "chmod", "dir-chmod",
    "truncate", "lock-unlink", "repeat-open", "invalid-kind", "invalid-key", "invalid-button",
    "invalid-modifier",
])
def test_contract_and_identity_fences(driver, runtime, mode):
    if mode == "cycles":
        # Preserve all 3,000 real-fsync cycles and the pending key across ten
        # process lifetimes. This is a bounded-size/recovery contract, not a
        # 12,000-fsync storage benchmark with a single 60-second deadline.
        # Each batch keeps the normal timeout; none is retried on failure.
        for batch in range(10):
            run(driver, f"cycles:{batch}", runtime)
        assert (runtime / FILENAME).stat().st_size == 260
        assert len(list(runtime.iterdir())) == 2
        run(driver, "empty", runtime)
    else:
        run(driver, mode, runtime)


def test_poison_persists_and_never_erases_intent(driver, runtime):
    run(driver, "poison", runtime)
    before = (runtime / FILENAME).read_bytes()
    run(driver, "poison-inspect", runtime)
    assert (runtime / FILENAME).read_bytes() == before


@pytest.mark.parametrize("operation", ["press", "release", "poison"])
@pytest.mark.parametrize("fault", ["write", "partial", "file-sync", "rename", "dir-sync"])
def test_io_failure_fences_dispatch_and_old_or_new_complete_generation(
    driver, runtime, operation, fault,
):
    run(driver, f"{operation}:{fault}", runtime)
    new = fault == "dir-sync"
    expected = "key44" if operation != "press" else "empty"
    if new:
        expected = {"press": "key44", "release": "empty", "poison": "poison-inspect"}[operation]
    if operation == "poison":
        expected = "poison-inspect"
    run(driver, expected, runtime)
    if not new and operation == "press":
        run(driver, "populate", runtime)


@pytest.mark.parametrize("operation", ["press", "release", "poison"])
@pytest.mark.parametrize("fault", [
    "kill-partial", "kill-file-sync", "kill-before-rename", "kill-after-rename", "kill-dir-sync",
])
def test_sigkill_at_commit_boundaries_preserves_exact_complete_evidence(
    driver, runtime, operation, fault,
):
    run(driver, f"{operation}:{fault}", runtime, killed=True)
    new = fault in ("kill-after-rename", "kill-dir-sync")
    expected = "key44" if operation != "press" else "empty"
    if new:
        expected = {"press": "key44", "release": "empty", "poison": "poison-inspect"}[operation]
    if operation == "poison":
        expected = "poison-inspect"
    run(driver, expected, runtime)


@pytest.mark.parametrize("instance", [
    "", "i1-", "../i1-aa", "i1-../escape", "i1-AA", "i1-gg", "i1-" + "a" * 129,
])
def test_invalid_instance_creates_nothing(driver, runtime, instance):
    run(driver, "reject", runtime, instance)
    assert not list(runtime.iterdir())


@pytest.mark.parametrize("kind", [
    "empty", "torn", "checksum", "header", "wrong-instance", "reordered", "duplicate",
    "reserved", "legacy", "out-of-range",
])
def test_corruption_is_preserved_not_repaired(driver, runtime, kind):
    run(driver, "populate", runtime)
    path = runtime / FILENAME
    data = bytearray(path.read_bytes())
    if kind == "empty":
        data = bytearray()
    elif kind == "torn":
        data = data[:-1]
    elif kind == "checksum":
        data[-1] ^= 1
    elif kind == "header":
        data[0] ^= 1
    elif kind == "wrong-instance":
        data[20] ^= 1
    elif kind == "legacy":
        data[:8] = b"ODSJNL01"
    else:
        if kind == "reordered":
            data[256:264], data[264:272] = data[264:272], data[256:264]
        elif kind == "duplicate":
            data[264:272] = data[256:264]
        elif kind == "out-of-range":
            data[260:264] = struct.pack("<I",768)
        else:
            data[257] = 1
        data[-4:] = struct.pack("<I", zlib.crc32(data[:-4]))
    path.write_bytes(data)
    run(driver, "reject", runtime)
    assert path.read_bytes() == data


@pytest.mark.parametrize("kind", [
    "symlink", "hardlink", "fifo", "directory", "permissions", "special-mode",
])
def test_unsafe_snapshot_objects_rejected(driver, runtime, kind):
    path, target = runtime / FILENAME, runtime / "target"
    if kind in ("symlink", "hardlink"):
        target.write_bytes(b"untouched")
        target.chmod(0o600)
        if kind == "symlink":
            path.symlink_to(target)
        else:
            os.link(target, path)
    elif kind == "fifo":
        os.mkfifo(path, 0o600)
    elif kind == "directory":
        path.mkdir(mode=0o700)
    else:
        run(driver, "empty", runtime)
        path.chmod(0o644 if kind == "permissions" else 0o4600)
    run(driver, "reject", runtime)
    if target.exists():
        assert target.read_bytes() == b"untouched"


def test_directory_symlink_and_uid_validation(driver, runtime):
    link = runtime.parent / "link"
    link.symlink_to(runtime, target_is_directory=True)
    run(driver, "reject", link)
    run(driver, "populate", runtime)
    if os.geteuid() == 0:
        os.chown(runtime / FILENAME, 65534, -1)
        run(driver, "reject", runtime)
        os.chown(runtime / FILENAME, 0, -1)
        os.chown(runtime, 65534, -1)
        run(driver, "reject", runtime)
