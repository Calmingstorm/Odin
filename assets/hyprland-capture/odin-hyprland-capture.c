/* Native capture foundation, NOT an authorization authority.
 * argv: FD PID UID OUTPUT WIDTH HEIGHT TRANSFORM TIMEOUT_MS
 * stdout: 32-byte LE header: "ODINSC01", width, height, width*4, 1, 0,
 * payload_bytes (six uint32_t), then tightly packed top-down B,G,R,255.
 * Raw/native dimensions; transform is checked, not applied. No bytes are
 * published until ready and display disconnect. Nonzero exit: discard ALL
 * output. Caller must enforce consent, lock-state and compositor scope.
 */
#define _GNU_SOURCE
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
#include <sys/mman.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <time.h>
#include <unistd.h>
#include <wayland-client.h>
#include "screencopy-client.h"

#define MAX_OUTPUTS 64U
#define MAX_BYTES (128ULL * 1024ULL * 1024ULL)
#define MAX_PIXELS 32000000ULL
#define MAX_SIDE 16384U
struct state;
struct output {
    struct state *s;
    struct wl_output *proxy;
    uint32_t id;
    char name[256];
    int32_t width, height, transform;
    bool named, mode, geometry, done;
};
struct state {
    struct wl_display *display;
    struct wl_registry *registry;
    struct wl_callback *callback;
    struct wl_shm *shm;
    struct zwlr_screencopy_manager_v1 *manager;
    struct zwlr_screencopy_frame_v1 *frame;
    struct wl_buffer *buffer;
    struct output outputs[MAX_OUTPUTS], *selected;
    size_t output_count;
    uint32_t shm_id, manager_id, width, height, transform;
    uint32_t format, stride, flags;
    const char *name, *error;
    bool synced, offered, buffer_done, copied, flags_seen, ready, released;
    void *mapping;
    size_t map_size;
    int64_t deadline;
};
static void fail(struct state *s, const char *message) {
    if (!s->error) s->error = message;
}
static int64_t now_ms(void) {
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) return -1;
    return (int64_t)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}
static int remaining(struct state *s) {
    int64_t now = now_ms();
    if (now < 0 || now >= s->deadline) {
        fail(s, "absolute deadline exceeded"); return 0;
    }
    return (int)(s->deadline - now);
}
/* Independent monotonic timer also bounds malicious event floods, blocking
 * library paths, and stdout writes. OS cleanup closes every FD/map on expiry. */
static void deadline_signal(int signal_number) {
    (void)signal_number; _exit(124);
}
static bool arm_deadline(int64_t deadline, timer_t *timer) {
    struct sigaction action = {0};
    action.sa_handler = deadline_signal;
    sigemptyset(&action.sa_mask);
    if (sigaction(SIGALRM, &action, NULL) != 0) return false;
    sigset_t signals;
    sigemptyset(&signals);
    sigaddset(&signals, SIGALRM);
    if (sigprocmask(SIG_UNBLOCK, &signals, NULL) != 0) return false;
    struct sigevent event = {.sigev_notify = SIGEV_SIGNAL, .sigev_signo = SIGALRM};
    if (timer_create(CLOCK_MONOTONIC, &event, timer) != 0) return false;
    struct itimerspec spec = {0};
    spec.it_value.tv_sec = (time_t)(deadline / 1000);
    spec.it_value.tv_nsec = (long)(deadline % 1000) * 1000000L;
    if (timer_settime(*timer, TIMER_ABSTIME, &spec, NULL) == 0) return true;
    timer_delete(*timer); return false;
}
static bool number(const char *text, uint32_t maximum, uint32_t *out) {
    if (!text[0]) return false;
    uint64_t value = 0;
    for (const unsigned char *p = (const unsigned char *)text; *p; p++) {
        if (*p < '0' || *p > '9') return false;
        value = value * 10 + (uint64_t)(*p - '0');
        if (value > maximum) return false;
    }
    *out = (uint32_t)value; return true;
}
static bool selected_changed(struct output *o) {
    if (o->s->selected == o) {
        fail(o->s, "selected output changed during capture"); return true;
    }
    return false;
}
static void output_geometry(void *data, struct wl_output *proxy, int32_t x,
        int32_t y, int32_t pw, int32_t ph, int32_t subpixel,
        const char *make, const char *model, int32_t transform) {
    (void)proxy; (void)x; (void)y; (void)pw; (void)ph;
    (void)subpixel; (void)make; (void)model;
    struct output *o = data;
    if (selected_changed(o)) return;
    o->transform = transform; o->geometry = true; o->done = false;
}
static void output_mode(void *data, struct wl_output *proxy, uint32_t flags,
        int32_t width, int32_t height, int32_t refresh) {
    (void)proxy; (void)refresh;
    struct output *o = data;
    if (!(flags & WL_OUTPUT_MODE_CURRENT)) return;
    if (selected_changed(o)) return;
    o->width = width; o->height = height; o->mode = true; o->done = false;
}
static void output_done(void *data, struct wl_output *proxy) {
    (void)proxy; ((struct output *)data)->done = true;
}
static void output_scale(void *data, struct wl_output *proxy, int32_t factor) {
    (void)proxy; (void)factor;
    struct output *o = data;
    if (!selected_changed(o)) o->done = false;
}
static void output_name(void *data, struct wl_output *proxy, const char *name) {
    (void)proxy;
    struct output *o = data;
    if (o->s->selected) { fail(o->s, "output names changed during capture"); return; }
    if (o->named || !name[0] || strlen(name) >= sizeof(o->name)) {
        fail(o->s, "invalid or repeated output name"); return;
    }
    strcpy(o->name, name); o->named = true; o->done = false;
}
static void output_description(void *data, struct wl_output *proxy, const char *text) {
    (void)data; (void)proxy; (void)text;
}
static const struct wl_output_listener output_listener = {
    .geometry = output_geometry, .mode = output_mode, .done = output_done,
    .scale = output_scale, .name = output_name, .description = output_description
};
static void shm_format(void *data, struct wl_shm *proxy, uint32_t format) {
    (void)data; (void)proxy; (void)format;
}
static const struct wl_shm_listener shm_listener = {.format = shm_format};
static void global(void *data, struct wl_registry *registry, uint32_t id,
        const char *interface, uint32_t version) {
    struct state *s = data;
    if (!strcmp(interface, "wl_output")) {
        if (s->selected) { fail(s, "output topology changed during capture"); return; }
        /* Unnamed legacy outputs prevent proving unique output identity. */
        if (version < 4 || s->output_count == MAX_OUTPUTS) {
            fail(s, "output v4 required, or inventory exceeds bound"); return;
        }
        struct output *o = &s->outputs[s->output_count++];
        o->s = s; o->id = id;
        o->proxy = wl_registry_bind(registry, id, &wl_output_interface, 4);
        if (!o->proxy || wl_output_add_listener(o->proxy, &output_listener, o) < 0)
            fail(s, "cannot bind output");
    } else if (!strcmp(interface, "wl_shm")) {
        if (s->shm) { fail(s, "ambiguous shm global"); return; }
        s->shm_id = id;
        s->shm = wl_registry_bind(registry, id, &wl_shm_interface, 1);
        if (!s->shm || wl_shm_add_listener(s->shm, &shm_listener, s) < 0)
            fail(s, "cannot bind shm");
    } else if (!strcmp(interface, "zwlr_screencopy_manager_v1")) {
        if (version < 3 || s->manager) { fail(s, "unique screencopy v3 required"); return; }
        s->manager_id = id;
        s->manager = wl_registry_bind(registry, id, &zwlr_screencopy_manager_v1_interface, 3);
        if (!s->manager) fail(s, "cannot bind screencopy manager");
    }
}
static void global_remove(void *data, struct wl_registry *registry, uint32_t id) {
    (void)registry;
    struct state *s = data;
    if (id == s->shm_id || id == s->manager_id) fail(s, "required global removed");
    for (size_t i = 0; i < s->output_count; i++)
        if (s->outputs[i].id == id) fail(s, "output inventory changed");
}
static const struct wl_registry_listener registry_listener = {
    .global = global, .global_remove = global_remove
};
static void sync_done(void *data, struct wl_callback *callback, uint32_t serial) {
    (void)serial;
    struct state *s = data;
    s->synced = true; s->callback = NULL; wl_callback_destroy(callback);
}
static const struct wl_callback_listener sync_listener = {.done = sync_done};
/* Never wl_display_roundtrip: it has no deadline. */
static bool pump(struct state *s) {
    if (!remaining(s) || s->error) return false;
    while (wl_display_prepare_read(s->display) != 0) {
        if (wl_display_dispatch_pending(s->display) < 0) {
            fail(s, "display dispatch failed"); return false;
        }
        if (!remaining(s) || s->error) return false;
    }
    int flush = wl_display_flush(s->display);
    if (flush < 0 && errno != EAGAIN) {
        wl_display_cancel_read(s->display); fail(s, "display flush failed"); return false;
    }
    struct pollfd fd = {.fd = wl_display_get_fd(s->display),
        .events = (short)(POLLIN | (flush < 0 ? POLLOUT : 0))};
    int timeout = remaining(s);
    int result = timeout ? poll(&fd, 1, timeout) : 0;
    if (result < 0 && errno == EINTR) { wl_display_cancel_read(s->display); return !s->error; }
    if (result <= 0 || (fd.revents & (POLLERR | POLLHUP | POLLNVAL))) {
        wl_display_cancel_read(s->display); fail(s, "display closed or deadline exceeded"); return false;
    }
    if (fd.revents & POLLIN) {
        if (wl_display_read_events(s->display) < 0) { fail(s, "display read failed"); return false; }
    } else wl_display_cancel_read(s->display);
    if (wl_display_dispatch_pending(s->display) < 0) fail(s, "display dispatch failed");
    return !s->error;
}
static bool sync_display(struct state *s) {
    s->synced = false;
    s->callback = wl_display_sync(s->display);
    if (!s->callback || wl_callback_add_listener(s->callback, &sync_listener, s) < 0) {
        fail(s, "cannot request sync"); return false;
    }
    while (!s->synced && !s->error) if (!pump(s)) return false;
    return !s->error;
}
static void frame_buffer(void *data, struct zwlr_screencopy_frame_v1 *frame,
        uint32_t format, uint32_t width, uint32_t height, uint32_t stride) {
    (void)frame;
    struct state *s = data;
    uint64_t bytes = (uint64_t)stride * height;
    if (s->offered || s->buffer_done ||
        (format != WL_SHM_FORMAT_XRGB8888 && format != WL_SHM_FORMAT_ARGB8888) ||
        width != s->width || height != s->height || stride < width * 4U ||
        stride % 4U || stride > INT32_MAX || bytes + width * 4ULL > MAX_BYTES) {
        fail(s, "unsupported or mismatched shm buffer"); return;
    }
    s->offered = true; s->format = format; s->stride = stride; s->map_size = (size_t)bytes;
}
static void frame_flags(void *data, struct zwlr_screencopy_frame_v1 *frame, uint32_t flags) {
    (void)frame;
    struct state *s = data;
    if (!s->copied || s->flags_seen || (flags & ~1U)) { fail(s, "invalid frame flags"); return; }
    s->flags_seen = true; s->flags = flags;
}
static void frame_ready(void *data, struct zwlr_screencopy_frame_v1 *frame,
        uint32_t high, uint32_t low, uint32_t ns) {
    (void)frame; (void)high; (void)low;
    struct state *s = data;
    if (!s->copied || !s->flags_seen || s->ready || ns >= 1000000000U) {
        fail(s, "invalid frame ready ordering"); return;
    }
    s->ready = true;
}
static void frame_failed(void *data, struct zwlr_screencopy_frame_v1 *frame) {
    (void)frame; fail(data, "compositor rejected capture");
}
static void frame_damage(void *data, struct zwlr_screencopy_frame_v1 *frame,
        uint32_t x, uint32_t y, uint32_t width, uint32_t height) {
    (void)frame; (void)x; (void)y; (void)width; (void)height;
    fail(data, "unexpected damage event");
}
static void frame_dmabuf(void *data, struct zwlr_screencopy_frame_v1 *frame,
        uint32_t format, uint32_t width, uint32_t height) {
    (void)frame; (void)format; (void)width; (void)height;
    struct state *s = data;
    if (s->buffer_done) fail(s, "late dmabuf offer");
    /* dmabuf-only capture is deliberately unsupported. */
}
static void frame_buffer_done(void *data, struct zwlr_screencopy_frame_v1 *frame) {
    (void)frame;
    struct state *s = data;
    if (s->buffer_done || !s->offered) { fail(s, "shm offer missing or repeated buffer_done"); return; }
    s->buffer_done = true;
}
static const struct zwlr_screencopy_frame_v1_listener frame_listener = {
    .buffer = frame_buffer, .flags = frame_flags, .ready = frame_ready,
    .failed = frame_failed, .damage = frame_damage, .linux_dmabuf = frame_dmabuf,
    .buffer_done = frame_buffer_done
};
static void buffer_release(void *data, struct wl_buffer *buffer) {
    (void)buffer; ((struct state *)data)->released = true;
}
static const struct wl_buffer_listener buffer_listener = {.release = buffer_release};
static bool create_buffer(struct state *s) {
    int fd = memfd_create("odin-capture", MFD_CLOEXEC | MFD_ALLOW_SEALING);
    if (fd < 0) { fail(s, "memfd creation failed"); return false; }
    if (ftruncate(fd, (off_t)s->map_size) < 0 ||
        fcntl(fd, F_ADD_SEALS, F_SEAL_SHRINK | F_SEAL_GROW | F_SEAL_SEAL) < 0) {
        close(fd); fail(s, "memfd sizing/sealing failed"); return false;
    }
    s->mapping = mmap(NULL, s->map_size, PROT_READ, MAP_SHARED, fd, 0);
    if (s->mapping == MAP_FAILED) { close(fd); fail(s, "shm mapping failed"); return false; }
    struct wl_shm_pool *pool = wl_shm_create_pool(s->shm, fd, (int32_t)s->map_size);
    close(fd);
    if (!pool) { fail(s, "shm pool creation failed"); return false; }
    s->buffer = wl_shm_pool_create_buffer(pool, 0, (int32_t)s->width,
        (int32_t)s->height, (int32_t)s->stride, s->format);
    wl_shm_pool_destroy(pool);
    if (!s->buffer || wl_buffer_add_listener(s->buffer, &buffer_listener, s) < 0) {
        fail(s, "buffer creation failed"); return false;
    }
    return true;
}
static void put32(unsigned char *p, uint32_t value) {
    for (unsigned int i = 0; i < 4; i++) p[i] = (unsigned char)(value >> (i * 8U));
}
static void disconnect_display(struct state *s) {
    if (!s->display) return;
    /* Local proxies require explicit destruction even before disconnect.
     * Send no requests to a failed peer; this is not a server cleanup ack. */
    if (s->callback) wl_proxy_destroy((struct wl_proxy *)s->callback);
    if (s->frame) wl_proxy_destroy((struct wl_proxy *)s->frame);
    if (s->buffer) wl_proxy_destroy((struct wl_proxy *)s->buffer);
    if (s->manager) wl_proxy_destroy((struct wl_proxy *)s->manager);
    if (s->shm) wl_proxy_destroy((struct wl_proxy *)s->shm);
    for (size_t i = 0; i < s->output_count; i++)
        if (s->outputs[i].proxy) wl_proxy_destroy((struct wl_proxy *)s->outputs[i].proxy);
    if (s->registry) wl_proxy_destroy((struct wl_proxy *)s->registry);
    wl_display_disconnect(s->display); s->display = NULL;
}
static bool write_all(struct state *s, const unsigned char *p, size_t length) {
    while (length && !s->error) {
        int timeout = remaining(s);
        if (!timeout) return false;
        struct pollfd fd = {.fd = STDOUT_FILENO, .events = POLLOUT};
        int result = poll(&fd, 1, timeout);
        if (result < 0 && errno == EINTR) continue;
        if (result <= 0 || !(fd.revents & POLLOUT)) { fail(s, "stdout blocked or closed"); return false; }
        /* Do not mutate inherited stdout open-file-description flags. The
         * independent timer bounds a blocking write after poll readiness. */
        ssize_t written = write(STDOUT_FILENO, p, length > 4096 ? 4096 : length);
        if (written < 0 && (errno == EINTR || errno == EAGAIN)) continue;
        if (written <= 0) { fail(s, "stdout write failed"); return false; }
        p += (size_t)written; length -= (size_t)written;
    }
    return !s->error;
}
static bool publish(struct state *s) {
    unsigned char header[32] = {'O','D','I','N','S','C','0','1'};
    put32(header + 8, s->width); put32(header + 12, s->height);
    put32(header + 16, s->width * 4U); put32(header + 20, 1);
    put32(header + 24, 0); put32(header + 28, s->width * s->height * 4U);
    unsigned char *row = malloc((size_t)s->width * 4U);
    if (!row) { fail(s, "row allocation failed"); return false; }
    bool ok = write_all(s, header, sizeof(header));
    for (uint32_t y = 0; ok && y < s->height; y++) {
        uint32_t source_y = (s->flags & 1U) ? s->height - 1U - y : y;
        const unsigned char *source = (const unsigned char *)s->mapping + (size_t)source_y * s->stride;
        for (uint32_t x = 0; x < s->width; x++) {
            uint32_t pixel;
            memcpy(&pixel, source + x * 4U, sizeof(pixel));
            row[x * 4U] = (unsigned char)pixel;
            row[x * 4U + 1U] = (unsigned char)(pixel >> 8);
            row[x * 4U + 2U] = (unsigned char)(pixel >> 16);
            row[x * 4U + 3U] = 255;
        }
        ok = write_all(s, row, (size_t)s->width * 4U);
    }
    free(row); return ok;
}
int main(int argc, char **argv) {
    struct state s = {.mapping = MAP_FAILED};
    uint32_t fd_value, pid, uid, timeout;
    if (argc != 9 || !number(argv[1], INT_MAX, &fd_value) || fd_value < 3 ||
        !number(argv[2], INT_MAX, &pid) || !pid || !number(argv[3], UINT32_MAX, &uid) ||
        !argv[4][0] || strlen(argv[4]) > 255 || !number(argv[5], MAX_SIDE, &s.width) ||
        !number(argv[6], MAX_SIDE, &s.height) || !s.width || !s.height ||
        (uint64_t)s.width * s.height > MAX_PIXELS ||
        !number(argv[7], 7, &s.transform) || !number(argv[8], 30000, &timeout) || !timeout) {
        fprintf(stderr, "usage: odin-hyprland-capture FD PID UID OUTPUT WIDTH HEIGHT TRANSFORM TIMEOUT_MS\n");
        return 2;
    }
    s.name = argv[4];
    int64_t started = now_ms();
    if (started < 0) { fprintf(stderr, "monotonic clock unavailable\n"); return 1; }
    s.deadline = started + timeout;
    timer_t timer;
    if (!arm_deadline(s.deadline, &timer)) { fprintf(stderr, "cannot arm monotonic deadline\n"); return 1; }
    signal(SIGPIPE, SIG_IGN);
    int fd = (int)fd_value, type = 0;
    socklen_t length = sizeof(type);
    struct sockaddr_un address;
    socklen_t address_length = sizeof(address);
    struct ucred credentials;
    socklen_t credentials_length = sizeof(credentials);
    if (getsockopt(fd, SOL_SOCKET, SO_TYPE, &type, &length) < 0 || type != SOCK_STREAM ||
        getpeername(fd, (struct sockaddr *)&address, &address_length) < 0 || address.sun_family != AF_UNIX ||
        getsockopt(fd, SOL_SOCKET, SO_PEERCRED, &credentials, &credentials_length) < 0 ||
        credentials_length != sizeof(credentials) || credentials.pid != (pid_t)pid || credentials.uid != (uid_t)uid) {
        fail(&s, "inherited Wayland socket peer identity mismatch"); close(fd); goto cleanup;
    }
    if (fcntl(fd, F_SETFD, FD_CLOEXEC) < 0) { fail(&s, "socket close-on-exec failed"); close(fd); goto cleanup; }
    s.display = wl_display_connect_to_fd(fd); /* takes ownership even on failure */
    if (!s.display) { fail(&s, "cannot adopt connected Wayland socket"); goto cleanup; }
    s.registry = wl_display_get_registry(s.display);
    if (!s.registry || wl_registry_add_listener(s.registry, &registry_listener, &s) < 0) {
        fail(&s, "cannot bind registry"); goto cleanup;
    }
    if (!sync_display(&s) || !sync_display(&s)) goto cleanup;
    if (!s.shm || !s.manager) { fail(&s, "required globals unavailable"); goto cleanup; }
    for (size_t i = 0; i < s.output_count; i++) {
        struct output *o = &s.outputs[i];
        if (!o->named || !o->done || !o->mode || !o->geometry) {
            fail(&s, "incomplete output inventory"); goto cleanup;
        }
        if (!strcmp(o->name, s.name)) {
            if (s.selected) { fail(&s, "ambiguous output name"); goto cleanup; }
            s.selected = o;
        }
    }
    if (!s.selected || s.selected->width != (int32_t)s.width ||
        s.selected->height != (int32_t)s.height || s.selected->transform != (int32_t)s.transform) {
        fail(&s, "consented output geometry or name mismatch"); goto cleanup;
    }
    s.frame = zwlr_screencopy_manager_v1_capture_output(s.manager, 0, s.selected->proxy);
    if (!s.frame || zwlr_screencopy_frame_v1_add_listener(s.frame, &frame_listener, &s) < 0) {
        fail(&s, "cannot request frame"); goto cleanup;
    }
    while (!s.buffer_done && !s.error) if (!pump(&s)) goto cleanup;
    if (s.error || !create_buffer(&s)) goto cleanup;
    s.copied = true;
    zwlr_screencopy_frame_v1_copy(s.frame, s.buffer);
    while (!s.ready && !s.error) if (!pump(&s)) goto cleanup;
    if (s.error) goto cleanup;
    zwlr_screencopy_frame_v1_destroy(s.frame); s.frame = NULL;
    /* Sync queued changes after ready, then disconnect before exposing memory,
     * regardless of whether wl_buffer.release was sent. */
    if (!sync_display(&s)) goto cleanup;
    /* The parent may retain a duplicate inherited FD. shutdown fences the
     * connection itself, not just this process's descriptor reference. */
    if (shutdown(wl_display_get_fd(s.display), SHUT_RDWR) != 0) {
        fail(&s, "cannot shut down capture connection"); goto cleanup;
    }
    disconnect_display(&s);
    if (!publish(&s)) goto cleanup;
cleanup:
    disconnect_display(&s);
    if (s.mapping != MAP_FAILED) munmap(s.mapping, s.map_size);
    timer_delete(timer);
    if (s.error) { fprintf(stderr, "capture refused: %s\n", s.error); return 1; }
    return 0;
}
