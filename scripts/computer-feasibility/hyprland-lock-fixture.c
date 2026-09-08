/* ISOLATED COMPOSITOR ONLY. No lock surfaces are created. Destroy the owned
 * compositor after the test: disconnecting an unfinished lock can leave it locked.
 * Usage: lock-fixture INHERITED_CONNECTED_WAYLAND_FD [LIFETIME_MS<=30000]
 */
#define _POSIX_C_SOURCE 200809L
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <poll.h>
#include <signal.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <wayland-client.h>
#include "ext-session-lock-v1-client-protocol.h"
struct app {
    struct wl_display *display;
    struct ext_session_lock_manager_v1 *manager;
    struct ext_session_lock_v1 *lock;
    bool done, locked, failed;
};
static volatile sig_atomic_t interrupted;
static void stop_signal(int sig) { (void)sig; interrupted = 1; }
static uint64_t now_ns(void) {
    struct timespec t;
    if (clock_gettime(CLOCK_MONOTONIC, &t)) abort();
    return (uint64_t)t.tv_sec * UINT64_C(1000000000) + (uint64_t)t.tv_nsec;
}
static void event(const char *name) {
    printf("{\"monotonic_ns\":%llu,\"event\":\"%s\"}\n", (unsigned long long)now_ns(), name);
}
static void locked(void *data, struct ext_session_lock_v1 *lock) {
    (void)lock; ((struct app *)data)->locked = true; event("locked");
}
static void finished(void *data, struct ext_session_lock_v1 *lock) {
    (void)lock; ((struct app *)data)->done = true; event("finished");
}
static const struct ext_session_lock_v1_listener lock_listener = { .locked = locked, .finished = finished };
static void global(void *data, struct wl_registry *r, uint32_t name, const char *interface, uint32_t version) {
    struct app *a = data; (void)version;
    if (!strcmp(interface, "ext_session_lock_manager_v1") && !a->manager) {
        a->manager = wl_registry_bind(r, name, &ext_session_lock_manager_v1_interface, 1);
        a->lock = ext_session_lock_manager_v1_lock(a->manager);
        ext_session_lock_v1_add_listener(a->lock, &lock_listener, a);
        event("lock_requested");
    }
}
static void global_remove(void *data, struct wl_registry *r, uint32_t name) { (void)data; (void)r; (void)name; }
static const struct wl_registry_listener registry_listener = { .global = global, .global_remove = global_remove };
static long number(const char *s, long min, long max) {
    char *end; errno = 0; long n = strtol(s, &end, 10);
    return errno || !*s || *end || n < min || n > max ? -1 : n;
}
int main(int argc, char **argv) {
    if (argc < 2 || argc > 3) { fprintf(stderr, "usage: %s INHERITED_CONNECTED_FD [LIFETIME_MS<=30000] (ISOLATED ONLY)\n", argv[0]); return 2; }
    long fd = number(argv[1], 0, INT_MAX), lifetime = argc == 3 ? number(argv[2], 1, 30000) : 3000;
    if (fd < 0 || lifetime < 0 || fcntl((int)fd, F_GETFD) < 0) return 2;
    setvbuf(stdout, NULL, _IOLBF, 0);
    signal(SIGTERM, stop_signal); signal(SIGINT, stop_signal); signal(SIGALRM, stop_signal); alarm(30);
    uint64_t deadline = now_ns() + (uint64_t)lifetime * 1000000;
    struct app a = {0}; a.display = wl_display_connect_to_fd((int)fd);
    if (!a.display) return 1;
    struct wl_registry *r = wl_display_get_registry(a.display); wl_registry_add_listener(r, &registry_listener, &a);
    while (!a.done && !interrupted && now_ns() < deadline) {
        if (wl_display_dispatch_pending(a.display) < 0) { a.failed = true; break; }
        if (wl_display_prepare_read(a.display) != 0) continue;
        int flushed = wl_display_flush(a.display);
        if (flushed < 0 && errno != EAGAIN) { wl_display_cancel_read(a.display); a.failed = true; break; }
        struct pollfd p = { .fd = wl_display_get_fd(a.display), .events = POLLIN | (flushed < 0 ? POLLOUT : 0) };
        int rc = poll(&p, 1, 25);
        if (rc > 0 && (p.revents & POLLIN)) {
            if (wl_display_read_events(a.display) < 0) { a.failed = true; break; }
        } else wl_display_cancel_read(a.display);
        if ((rc < 0 && errno != EINTR) || (rc > 0 && (p.revents & (POLLERR | POLLHUP | POLLNVAL)))) { a.failed = true; break; }
    }
    /* Deliberately no unlock: test lock persistence/refusal, then terminate ONLY
     * the isolated compositor owned by the supervising harness. */
    event(a.failed ? "lock_fixture_error" : "lock_fixture_exit");
    wl_display_disconnect(a.display);
    return a.failed || !a.lock ? 1 : 0;
}
