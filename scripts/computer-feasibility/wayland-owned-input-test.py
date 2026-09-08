#!/usr/bin/env python3
"""Source-only guardian regression tests, not Wayland/toolkit release evidence.

Compile the sibling C source against a tiny fake libei in a TemporaryDirectory.
Only anonymous pipes are used: no desktop, real EI socket, services or Docker.
The fake records queued input only when ei_dispatch flushes it. Its clock advances
5ms per dispatch, independently of stdout delivery; wall deadlines detect stalls.
Run directly with Python 3. Tests never modify the C source or live installation.
"""

from __future__ import annotations

import json
import os
import select
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

HEADER = r"""
#ifndef FAKE_LIBEI_H
#define FAKE_LIBEI_H
#include <stdbool.h>
#include <stdint.h>
struct ei; struct ei_device; struct ei_event; struct ei_seat; struct ei_region;
enum ei_event_type { EI_EVENT_SEAT_ADDED=1, EI_EVENT_DEVICE_RESUMED,
 EI_EVENT_DISCONNECT, EI_EVENT_DEVICE_REMOVED, EI_EVENT_DEVICE_PAUSED };
enum { EI_DEVICE_CAP_POINTER_ABSOLUTE=1, EI_DEVICE_CAP_BUTTON=2,
 EI_DEVICE_CAP_KEYBOARD=3 };
struct ei *ei_new_sender(void *);
void ei_configure_name(struct ei *, const char *);
int ei_setup_backend_fd(struct ei *, int);
void ei_unref(struct ei *);
uint64_t ei_now(struct ei *);
int ei_get_fd(struct ei *);
void ei_dispatch(struct ei *);
struct ei_event *ei_get_event(struct ei *);
enum ei_event_type ei_event_get_type(struct ei_event *);
struct ei_device *ei_event_get_device(struct ei_event *);
struct ei_seat *ei_event_get_seat(struct ei_event *);
void ei_seat_bind_capabilities(struct ei_seat *, ...);
void ei_event_unref(struct ei_event *);
bool ei_device_has_capability(struct ei_device *, int);
struct ei_device *ei_device_ref(struct ei_device *);
void ei_device_unref(struct ei_device *);
struct ei_region *ei_device_get_region(struct ei_device *, unsigned);
const char *ei_region_get_mapping_id(struct ei_region *);
double ei_region_get_x(struct ei_region *);
double ei_region_get_y(struct ei_region *);
double ei_region_get_width(struct ei_region *);
double ei_region_get_height(struct ei_region *);
void ei_device_start_emulating(struct ei_device *, unsigned);
void ei_device_stop_emulating(struct ei_device *);
void ei_device_pointer_motion_absolute(struct ei_device *, double, double);
void ei_device_button_button(struct ei_device *, unsigned, bool);
void ei_device_keyboard_key(struct ei_device *, unsigned, bool);
void ei_device_frame(struct ei_device *, uint64_t);
#endif
"""


LIBRARY = r"""
#define _POSIX_C_SOURCE 200809L
#include "libei.h"
#include <fcntl.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
struct ei { int fd; };
struct ei_device { int kind; };
struct ei_seat { int unused; };
struct ei_region { int unused; };
struct ei_event { enum ei_event_type type; struct ei_device *dev; };
static struct ei context;
static struct ei_device pointer={1}, keyboard={2};
static struct ei_seat seat;
static struct ei_region region;
static struct ei_event events[16];
static unsigned event_read, event_write;
static uint64_t clock_us=1000000;
static int trace_fd, initialized;
static char pending[8192];
static size_t pending_len;
static void emit(const char *fmt, ...) {
 char line[256]; va_list args; va_start(args, fmt);
 int n=vsnprintf(line, sizeof line, fmt, args); va_end(args);
 if (n>0 && n<(int)sizeof line && write(trace_fd, line, (size_t)n)!=n) _exit(90);
}
static void queue(const char *kind, unsigned code, bool down) {
 int n=snprintf(pending+pending_len, sizeof pending-pending_len,
   "%s %u %u %llu\n", kind, code, down, (unsigned long long)clock_us);
 if (n<0 || (size_t)n>=sizeof pending-pending_len) _exit(91);
 pending_len+=(size_t)n;
}
static void add(enum ei_event_type type, struct ei_device *dev) {
 if(event_write>=16) _exit(92);
 events[event_write++]=(struct ei_event){type,dev};
}
struct ei *ei_new_sender(void *p) {
 (void)p; trace_fd=atoi(getenv("FAKE_TRACE_FD")); return &context;
}
void ei_configure_name(struct ei *c,const char *n) {(void)c;(void)n;}
int ei_setup_backend_fd(struct ei *c,int fd) {
 c->fd=fd; return fcntl(fd,F_SETFL,O_NONBLOCK)<0;
}
void ei_unref(struct ei *c) {(void)c;emit("DESTROY %llu\n",(unsigned long long)clock_us);}
uint64_t ei_now(struct ei *c) {(void)c;return clock_us;}
int ei_get_fd(struct ei *c) {return c->fd;}
void ei_dispatch(struct ei *c) {
 clock_us+=5000;
 if(pending_len) {
   if(write(trace_fd,pending,pending_len)!=(ssize_t)pending_len) _exit(93);
   pending_len=0;
 }
 if(!initialized) {
   initialized=1; add(EI_EVENT_SEAT_ADDED,NULL);
   add(EI_EVENT_DEVICE_RESUMED,&pointer); add(EI_EVENT_DEVICE_RESUMED,&keyboard);
   emit("HANDSHAKE %llu\n",(unsigned long long)clock_us);
 }
 char signal;
 if(read(c->fd,&signal,1)==1) {
   if(signal=='X') add(EI_EVENT_DISCONNECT,NULL);
   if(signal=='P') add(EI_EVENT_DEVICE_PAUSED,&pointer);
   if(signal=='D') add(EI_EVENT_DEVICE_REMOVED,&keyboard);
 }
}
struct ei_event *ei_get_event(struct ei *c) {
 (void)c; if(event_read<event_write) return &events[event_read++];
 event_read=event_write=0; return NULL;
}
enum ei_event_type ei_event_get_type(struct ei_event *e) {return e->type;}
struct ei_device *ei_event_get_device(struct ei_event *e) {return e->dev;}
struct ei_seat *ei_event_get_seat(struct ei_event *e) {(void)e;return &seat;}
void ei_seat_bind_capabilities(struct ei_seat *s,...) {(void)s;}
void ei_event_unref(struct ei_event *e) {(void)e;}
bool ei_device_has_capability(struct ei_device *d,int cap) {
 return d && ((d->kind==1 && (cap==1 || cap==2)) || (d->kind==2 && cap==3));
}
struct ei_device *ei_device_ref(struct ei_device *d) {return d;}
void ei_device_unref(struct ei_device *d) {(void)d;}
struct ei_region *ei_device_get_region(struct ei_device *d,unsigned n) {
 (void)d; return n==0 ? &region : NULL;
}
const char *ei_region_get_mapping_id(struct ei_region *r) {
 (void)r; const char *mode=getenv("FAKE_MAPPING");
 return mode && !strcmp(mode,"missing") ? NULL : mode ? mode : "source-1";
}
double ei_region_get_x(struct ei_region *r) {(void)r;return 100;}
double ei_region_get_y(struct ei_region *r) {(void)r;return 200;}
double ei_region_get_width(struct ei_region *r) {(void)r;return 800;}
double ei_region_get_height(struct ei_region *r) {(void)r;return 600;}
void ei_device_start_emulating(struct ei_device *d,unsigned seq) {
 (void)seq; emit("START %d %llu\n",d->kind,(unsigned long long)clock_us);
}
void ei_device_stop_emulating(struct ei_device *d) {
 emit("STOP %d %llu\n",d->kind,(unsigned long long)clock_us);
}
void ei_device_pointer_motion_absolute(struct ei_device *d,double x,double y) {
 (void)d;(void)x;(void)y;
}
void ei_device_button_button(struct ei_device *d,unsigned b,bool down) {
 if(d!=&pointer) _exit(94);
 queue("BUTTON",b,down);
}
void ei_device_keyboard_key(struct ei_device *d,unsigned k,bool down) {
 if(d!=&keyboard) _exit(95);
 queue("KEY",k,down);
}
void ei_device_frame(struct ei_device *d,uint64_t now) {(void)d;(void)now;}
"""


class Guardian:
    """One subprocess with owned pipes and bounded cleanup on all failures."""

    def __init__(self, binary: Path, *, output="normal", mapping="source-1"):
        self.lines: list[str] = []
        self.partial = b""
        self.backend_r, self.backend_w = os.pipe()
        self.trace_r, trace_w = os.pipe()
        output_fds = []
        stdout = subprocess.PIPE
        if output != "normal":
            out_r, out_w = os.pipe()
            output_fds = [out_r, out_w]
            if output == "blocked":
                os.set_blocking(out_w, False)
                try:
                    while True:
                        os.write(out_w, b"x" * 4096)
                except BlockingIOError:
                    pass
            elif output == "lost":
                os.close(out_r)
                output_fds.remove(out_r)
            else:
                raise ValueError(output)
            stdout = out_w
        env = dict(os.environ, FAKE_TRACE_FD=str(trace_w), FAKE_MAPPING=mapping)
        try:
            self.proc = subprocess.Popen(
                [str(binary), str(self.backend_r), "source-1"],
                stdin=subprocess.PIPE,
                stdout=stdout,
                stderr=subprocess.PIPE,
                pass_fds=(self.backend_r, trace_w),
                env=env,
            )
        finally:
            os.close(trace_w)
            for fd in output_fds:
                # Blocked output retains a reader but it never drains.
                if output == "blocked" and fd == out_r:
                    continue
                os.close(fd)
        self.blocked_reader = out_r if output == "blocked" else None
        os.set_blocking(self.trace_r, False)
        try:
            self.read_until(lambda: any(s.startswith("HANDSHAKE ") for s in self.lines))
        except BaseException:
            self.close()
            raise

    def drain(self):
        while True:
            try:
                chunk = os.read(self.trace_r, 8192)
            except BlockingIOError:
                return
            if not chunk:
                return
            self.partial += chunk
            while b"\n" in self.partial:
                line, self.partial = self.partial.split(b"\n", 1)
                self.lines.append(line.decode("ascii"))

    def read_until(self, predicate, timeout=3):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            self.drain()
            if predicate():
                return
            if self.proc.poll() is not None:
                self.drain()
                if predicate():
                    return
                raise AssertionError(f"guardian exited early: {self.proc.returncode}: {self.lines}")
            select.select([self.trace_r], [], [], 0.01)
        raise AssertionError(f"guardian watchdog expired: {self.lines}")

    def send(self, command: bytes):
        self.proc.stdin.write(command)
        self.proc.stdin.flush()

    def hold(self, lease=500):
        self.send(f"H 30 272 150 250 {lease}\n".encode())
        self.read_until(lambda: any(s.startswith("KEY 30 1 ") for s in self.lines))

    def finish(self):
        # Intentionally do not close controller or backend: lease must stand alone.
        self.read_until(lambda: self.proc.poll() is not None)
        self.drain()
        output = self.proc.stdout.read() if self.proc.stdout else b""
        error = self.proc.stderr.read()
        if error:
            raise AssertionError(f"unexpected stderr: {error!r}")
        receipts = [json.loads(line) for line in output.splitlines()]
        return self.proc.returncode, receipts

    def close(self):
        if self.proc.poll() is None:
            self.proc.kill()
            self.proc.wait(timeout=2)
        for stream in (self.proc.stdin, self.proc.stdout, self.proc.stderr):
            if stream and not stream.closed:
                stream.close()
        for fd in (self.backend_r, self.backend_w, self.trace_r, self.blocked_reader):
            if fd is not None:
                os.close(fd)

    def inputs(self):
        return [s.split()[:3] for s in self.lines if s.startswith(("KEY ", "BUTTON "))]


class OwnedInputTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix="odin-owned-input-source-test-")
        cls.addClassCleanup(cls.tmp.cleanup)
        root = Path(cls.tmp.name)
        (root / "libei.h").write_text(HEADER)
        (root / "fake-ei.c").write_text(LIBRARY)
        cls.binary = root / "guardian"
        source = Path(__file__).with_name("wayland-owned-input.c")
        flags = ["gcc", "-std=c11", "-Wall", "-Wextra", "-Werror"]
        subprocess.run(
            flags
            + [
                "-fPIC",
                "-shared",
                "-I",
                str(root),
                str(root / "fake-ei.c"),
                "-o",
                str(root / "libei.so"),
            ],
            check=True,
            text=True,
            timeout=30,
        )
        subprocess.run(
            flags
            + [
                "-I",
                str(root),
                str(source),
                "-L",
                str(root),
                f"-Wl,-rpath,{root}",
                "-lei",
                "-o",
                str(cls.binary),
            ],
            check=True,
            text=True,
            timeout=30,
        )

    def guardian(self, **kwargs):
        guardian = Guardian(self.binary, **kwargs)
        self.addCleanup(guardian.close)
        return guardian

    def assert_release(self, guardian, reason=None, status=0):
        actual_status, receipts = guardian.finish()
        self.assertEqual(actual_status, status, receipts)
        self.assertEqual(
            guardian.inputs(),
            [
                ["BUTTON", "272", "1"],
                ["KEY", "30", "1"],
                ["KEY", "30", "0"],
                ["BUTTON", "272", "0"],
            ],
        )
        release_index = next(
            i for i, s in enumerate(guardian.lines) if s.startswith("BUTTON 272 0 ")
        )
        stops = [i for i, s in enumerate(guardian.lines) if s.startswith("STOP ")]
        self.assertEqual(len(stops), 2)
        self.assertTrue(all(i > release_index for i in stops), guardian.lines)
        self.assertTrue(guardian.lines[-1].startswith("DESTROY "))
        if reason is not None:
            self.assertEqual(
                [r["event"] for r in receipts],
                ["ready", "held", "release_begin", "release_sent", "closed"],
            )
            self.assertEqual(receipts[-1]["reason"], reason)
        return receipts

    def test_orderly_exact_owned_release(self):
        guardian = self.guardian()
        guardian.hold()
        guardian.send(b"R\n")
        self.assert_release(guardian, "orderly")

    def test_orderly_fences_queued_late_hold(self):
        guardian = self.guardian()
        guardian.hold()
        guardian.send(b"R\nH 31 273 160 260 2000\n")
        self.assert_release(guardian, "orderly")

    def test_cancel_fences_queued_late_hold(self):
        guardian = self.guardian()
        guardian.hold()
        guardian.send(b"C\nH 31 273 160 260 2000\n")
        self.assert_release(guardian, "cancelled")

    def test_controller_eof(self):
        guardian = self.guardian()
        guardian.hold()
        guardian.proc.stdin.close()
        self.assert_release(guardian, "controller-eof")

    def test_hold_and_eof_in_same_read_batch(self):
        guardian = self.guardian()
        guardian.send(b"H 30 272 150 250 500\n")
        guardian.proc.stdin.close()
        self.assert_release(guardian, "controller-eof")

    def test_partial_command_then_eof_releases_original_ledger(self):
        guardian = self.guardian()
        guardian.hold()
        guardian.send(b"H 99 279 ")
        guardian.proc.stdin.close()
        self.assert_release(guardian, "controller-eof")

    def test_finite_lease_controller_and_backend_stay_open(self):
        guardian = self.guardian()
        guardian.hold(60)
        receipts = self.assert_release(guardian, "lease-expired")
        elapsed = receipts[2]["monotonic_us"] - receipts[1]["monotonic_us"]
        self.assertGreaterEqual(elapsed, 60000)
        self.assertLessEqual(elapsed, 80000)

    def test_partial_input_does_not_renew_lease(self):
        guardian = self.guardian()
        guardian.hold(60)
        guardian.send(b"H 31 273 160 260 ")
        receipts = self.assert_release(guardian, "lease-expired")
        self.assertLessEqual(receipts[2]["monotonic_us"] - receipts[1]["monotonic_us"], 80000)

    def test_second_holds_cannot_overwrite_original_ledger(self):
        for command in (b"H 31 273 160 260 2000\n", b"H 99 279 broken\n", b"H 247 279 150 250 0\n"):
            with self.subTest(command=command):
                guardian = self.guardian()
                guardian.hold()
                guardian.send(command)
                self.assert_release(guardian, "invalid-command", status=2)

    def test_malformed_commands_release_owned_ledger(self):
        for command in (b"nonsense\n", b"\x00", b"x" * 256, b"\n", b"R trailing\n"):
            with self.subTest(command=command[:24]):
                guardian = self.guardian()
                guardian.hold()
                guardian.send(command)
                self.assert_release(guardian, "invalid-command", status=2)

    def test_invalid_first_holds_never_inject(self):
        commands = [
            b"H 0 272 150 250 100\n",
            b"H 248 272 150 250 100\n",
            b"H 30 271 150 250 100\n",
            b"H 30 280 150 250 100\n",
            b"H 30 272 nan 250 100\n",
            b"H 30 272 150 inf 100\n",
            b"H 30 272 150 250 0\n",
            b"H 30 272 150 250 2001\n",
            b"H 30 272 150 250 100 trailing\n",
            b"H 30\x00272\n",
            b"H " + b"9" * 260,
        ]
        for command in commands:
            with self.subTest(command=command[:40]):
                guardian = self.guardian()
                guardian.send(command)
                status, receipts = guardian.finish()
                self.assertEqual(status, 2)
                self.assertEqual(guardian.inputs(), [])
                self.assertEqual(receipts[-1]["reason"], "invalid-command")

    def test_wrong_or_missing_mapping_never_injects(self):
        for mapping in ("wrong-source", "missing"):
            with self.subTest(mapping=mapping):
                guardian = self.guardian(mapping=mapping)
                guardian.send(b"H 30 272 150 250 100\n")
                status, receipts = guardian.finish()
                self.assertEqual(status, 2)
                self.assertEqual(guardian.inputs(), [])
                self.assertEqual(receipts[-1]["reason"], "unmapped-coordinate")

    def test_outside_mapping_never_injects(self):
        for point in ("99 250", "150 199", "900 250", "150 800"):
            with self.subTest(point=point):
                guardian = self.guardian()
                guardian.send(f"H 30 272 {point} 100\n".encode())
                status, receipts = guardian.finish()
                self.assertEqual(status, 2)
                self.assertEqual(guardian.inputs(), [])
                self.assertEqual(receipts[-1]["reason"], "unmapped-coordinate")

    def test_blocked_output_does_not_stall_lease(self):
        guardian = self.guardian(output="blocked")
        guardian.hold(60)
        self.assert_release(guardian)
        events = [s.split() for s in guardian.lines if s.startswith("KEY ")]
        self.assertGreaterEqual(int(events[1][3]) - int(events[0][3]), 60000)
        self.assertLessEqual(int(events[1][3]) - int(events[0][3]), 80000)

    def test_lost_output_does_not_stall_lease(self):
        guardian = self.guardian(output="lost")
        guardian.hold(60)
        self.assert_release(guardian)
        events = [s.split() for s in guardian.lines if s.startswith("KEY ")]
        self.assertGreaterEqual(int(events[1][3]) - int(events[0][3]), 60000)
        self.assertLessEqual(int(events[1][3]) - int(events[0][3]), 80000)

    def test_input_path_lost_explicitly_unsupported(self):
        for event in (b"X", b"P", b"D"):
            with self.subTest(event=event):
                guardian = self.guardian()
                guardian.hold()
                os.write(guardian.backend_w, event)
                status, receipts = guardian.finish()
                self.assertEqual(status, 3, receipts)
                self.assertEqual(guardian.inputs(), [["BUTTON", "272", "1"], ["KEY", "30", "1"]])
                self.assertIn("unsupported_release", [r["event"] for r in receipts])
                self.assertNotIn("release_sent", [r["event"] for r in receipts])
                self.assertEqual(receipts[-1]["reason"], "input-path-lost")
                self.assertFalse(any(s.startswith("STOP ") for s in guardian.lines))


if __name__ == "__main__":
    print("SOURCE-ONLY fake-libei subprocess checks. No real Wayland/toolkit evidence.", flush=True)
    unittest.main(verbosity=2)
