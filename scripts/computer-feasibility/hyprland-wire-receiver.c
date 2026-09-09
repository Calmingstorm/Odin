/* Isolated wire-evidence fixture, not a production input/capture client.
 * Usage: receiver INHERITED_CONNECTED_WAYLAND_FD TITLE_AND_APP_ID [LIFETIME_MS]
 * No display discovery, environment socket lookup, or input injection.
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
#include <time.h>
#include <unistd.h>
#include <wayland-client.h>
#include "xdg-shell-client-protocol.h"

struct app {
    struct wl_display *display;
    struct wl_compositor *compositor;
    struct wl_shm *shm;
    struct xdg_wm_base *wm;
    struct wl_seat *seat;
    struct wl_keyboard *keyboard;
    struct wl_pointer *pointer;
    struct wl_surface *surface;
    struct xdg_surface *xdg_surface;
    struct xdg_toplevel *toplevel;
    int width, height;
    bool done, failed;
};
static volatile sig_atomic_t interrupted;
static void stop_signal(int sig) { (void)sig; interrupted = 1; }
static uint64_t now_ns(void) {
    struct timespec t;
    if (clock_gettime(CLOCK_MONOTONIC, &t) != 0) abort();
    return (uint64_t)t.tv_sec * UINT64_C(1000000000) + (uint64_t)t.tv_nsec;
}
static void event_start(const char *name) {
    printf("{\"monotonic_ns\":%llu,\"event\":\"%s\"",
           (unsigned long long)now_ns(), name);
}
static void event_end(void) { puts("}"); }
static void json_string(const char *s) {
    putchar('"');
    for (const unsigned char *p = (const unsigned char *)s; *p; ++p) {
        if (*p == '"' || *p == '\\') printf("\\%c", *p);
        else if (*p < 0x20 || *p >= 0x7f) printf("\\u%04x", *p);
        else putchar(*p);
    }
    putchar('"');
}
static void buffer_release(void *data, struct wl_buffer *buffer) {
    (void)data; wl_buffer_destroy(buffer);
}
static const struct wl_buffer_listener buffer_listener = { .release = buffer_release };
static bool paint(struct app *a) {
    /* Hard bounds also guard stride/pool arithmetic against hostile configure sizes. */
    if (a->width < 1 || a->height < 1 || a->width > 4096 || a->height > 4096) return false;
    int stride = a->width * 4;
    int size = stride * a->height;
    int fd = memfd_create("odin-isolated-receiver", MFD_CLOEXEC);
    if (fd < 0) return false;
    if (ftruncate(fd, size) < 0) { close(fd); return false; }
    uint32_t *pixels = mmap(NULL, (size_t)size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    if (pixels == MAP_FAILED) { close(fd); return false; }
    for (int i = 0; i < size / 4; ++i) pixels[i] = 0xff285b79;
    struct wl_shm_pool *pool = wl_shm_create_pool(a->shm, fd, size);
    struct wl_buffer *buffer = pool ? wl_shm_pool_create_buffer(pool, 0, a->width, a->height,
                                                               stride, WL_SHM_FORMAT_XRGB8888) : NULL;
    if (pool) wl_shm_pool_destroy(pool);
    munmap(pixels, (size_t)size); close(fd);
    if (!buffer) return false;
    wl_buffer_add_listener(buffer, &buffer_listener, NULL);
    wl_surface_attach(a->surface, buffer, 0, 0);
    wl_surface_damage(a->surface, 0, 0, a->width, a->height);
    wl_surface_commit(a->surface);
    event_start("surface_commit"); printf(",\"width\":%d,\"height\":%d", a->width, a->height); event_end();
    return true;
}
static void keymap(void *data, struct wl_keyboard *k, uint32_t format, int fd, uint32_t size) {
    (void)data; (void)k; close(fd);
    event_start("keyboard_keymap"); printf(",\"format\":%u,\"size\":%u", format, size); event_end();
}
static void keyboard_enter(void *data, struct wl_keyboard *k, uint32_t serial,
                           struct wl_surface *surface, struct wl_array *keys) {
    struct app *a = data; (void)k;
    event_start("keyboard_enter");
    printf(",\"serial\":%u,\"own_surface\":%s,\"keys\":[", serial, surface == a->surface ? "true" : "false");
    /* Exact raw evdev key array supplied by wl_keyboard.enter, NOT tracked/inferred state. */
    size_t count = keys->size / sizeof(uint32_t);
    for (size_t i = 0; i < count; ++i) {
        uint32_t key;
        memcpy(&key, (const unsigned char *)keys->data + i * sizeof(key), sizeof(key));
        printf("%s%u", i ? "," : "", key);
    }
    printf("],\"keys_bytes\":%zu", keys->size); event_end();
}
static void keyboard_leave(void *data, struct wl_keyboard *k, uint32_t serial, struct wl_surface *surface) {
    struct app *a = data; (void)k;
    event_start("keyboard_leave"); printf(",\"serial\":%u,\"own_surface\":%s", serial, surface == a->surface ? "true" : "false"); event_end();
}
static void keyboard_key(void *data, struct wl_keyboard *k, uint32_t serial, uint32_t time,
                         uint32_t key, uint32_t state) {
    (void)data; (void)k; event_start("keyboard_key");
    printf(",\"serial\":%u,\"time_ms\":%u,\"key\":%u,\"state\":%u", serial, time, key, state); event_end();
}
static void modifiers(void *data, struct wl_keyboard *k, uint32_t serial,
                      uint32_t depressed, uint32_t latched, uint32_t locked, uint32_t group) {
    (void)data; (void)k; event_start("keyboard_modifiers");
    printf(",\"serial\":%u,\"depressed\":%u,\"latched\":%u,\"locked\":%u,\"group\":%u",
           serial, depressed, latched, locked, group); event_end();
}
static void repeat_info(void *data, struct wl_keyboard *k, int32_t rate, int32_t delay) {
    (void)data; (void)k; event_start("keyboard_repeat_info"); printf(",\"rate\":%d,\"delay\":%d", rate, delay); event_end();
}
static const struct wl_keyboard_listener keyboard_listener = {
    .keymap = keymap, .enter = keyboard_enter, .leave = keyboard_leave, .key = keyboard_key,
    .modifiers = modifiers, .repeat_info = repeat_info
};
static void pointer_enter(void *data, struct wl_pointer *p, uint32_t serial, struct wl_surface *surface,
                          wl_fixed_t x, wl_fixed_t y) {
    struct app *a = data; (void)p; event_start("pointer_enter");
    printf(",\"serial\":%u,\"own_surface\":%s,\"x\":%.4f,\"y\":%.4f", serial,
           surface == a->surface ? "true" : "false", wl_fixed_to_double(x), wl_fixed_to_double(y)); event_end();
}
static void pointer_leave(void *data, struct wl_pointer *p, uint32_t serial, struct wl_surface *surface) {
    struct app *a = data; (void)p; event_start("pointer_leave");
    printf(",\"serial\":%u,\"own_surface\":%s", serial, surface == a->surface ? "true" : "false"); event_end();
}
static void motion(void *data, struct wl_pointer *p, uint32_t time, wl_fixed_t x, wl_fixed_t y) {
    (void)data; (void)p; event_start("pointer_motion");
    printf(",\"time_ms\":%u,\"x\":%.4f,\"y\":%.4f", time, wl_fixed_to_double(x), wl_fixed_to_double(y)); event_end();
}
static void button(void *data, struct wl_pointer *p, uint32_t serial, uint32_t time, uint32_t b, uint32_t state) {
    (void)data; (void)p; event_start("pointer_button");
    printf(",\"serial\":%u,\"time_ms\":%u,\"button\":%u,\"state\":%u", serial, time, b, state); event_end();
}
static void axis(void *data, struct wl_pointer *p, uint32_t time, uint32_t a, wl_fixed_t value) {
    (void)data; (void)p; event_start("pointer_axis");
    printf(",\"time_ms\":%u,\"axis\":%u,\"value\":%.4f", time, a, wl_fixed_to_double(value)); event_end();
}
static void frame(void *data, struct wl_pointer *p) { (void)data; (void)p; event_start("pointer_frame"); event_end(); }
static void axis_source(void *data, struct wl_pointer *p, uint32_t source) {
    (void)data; (void)p; event_start("pointer_axis_source"); printf(",\"source\":%u", source); event_end();
}
static void axis_stop(void *data, struct wl_pointer *p, uint32_t time, uint32_t a) {
    (void)data; (void)p; event_start("pointer_axis_stop"); printf(",\"time_ms\":%u,\"axis\":%u", time, a); event_end();
}
static void axis_discrete(void *data, struct wl_pointer *p, uint32_t a, int32_t discrete) {
    (void)data; (void)p; event_start("pointer_axis_discrete"); printf(",\"axis\":%u,\"discrete\":%d", a, discrete); event_end();
}
static const struct wl_pointer_listener pointer_listener = {
    .enter = pointer_enter, .leave = pointer_leave, .motion = motion, .button = button, .axis = axis,
    .frame = frame, .axis_source = axis_source, .axis_stop = axis_stop, .axis_discrete = axis_discrete
};
static void capabilities(void *data, struct wl_seat *seat, uint32_t caps) {
    struct app *a = data; event_start("seat_capabilities"); printf(",\"capabilities\":%u", caps); event_end();
    if ((caps & WL_SEAT_CAPABILITY_KEYBOARD) && !a->keyboard) {
        a->keyboard = wl_seat_get_keyboard(seat); wl_keyboard_add_listener(a->keyboard, &keyboard_listener, a);
    } else if (!(caps & WL_SEAT_CAPABILITY_KEYBOARD) && a->keyboard) {
        wl_keyboard_release(a->keyboard); a->keyboard = NULL;
    }
    if ((caps & WL_SEAT_CAPABILITY_POINTER) && !a->pointer) {
        a->pointer = wl_seat_get_pointer(seat); wl_pointer_add_listener(a->pointer, &pointer_listener, a);
    } else if (!(caps & WL_SEAT_CAPABILITY_POINTER) && a->pointer) {
        wl_pointer_release(a->pointer); a->pointer = NULL;
    }
}
static void seat_name(void *data, struct wl_seat *seat, const char *name) {
    (void)data; (void)seat; event_start("seat_name"); printf(",\"name\":"); json_string(name); event_end();
}
static const struct wl_seat_listener seat_listener = { .capabilities = capabilities, .name = seat_name };
static void ping(void *data, struct xdg_wm_base *wm, uint32_t serial) { (void)data; xdg_wm_base_pong(wm, serial); }
static const struct xdg_wm_base_listener wm_listener = { .ping = ping };
static void global(void *data, struct wl_registry *r, uint32_t name, const char *interface, uint32_t version) {
    struct app *a = data;
    if (!strcmp(interface, "wl_compositor") && !a->compositor)
        a->compositor = wl_registry_bind(r, name, &wl_compositor_interface, version < 4 ? version : 4);
    else if (!strcmp(interface, "wl_shm") && !a->shm)
        a->shm = wl_registry_bind(r, name, &wl_shm_interface, 1);
    else if (!strcmp(interface, "xdg_wm_base") && !a->wm) {
        a->wm = wl_registry_bind(r, name, &xdg_wm_base_interface, 1); xdg_wm_base_add_listener(a->wm, &wm_listener, a);
    } else if (!strcmp(interface, "wl_seat") && !a->seat && version >= 5) {
        a->seat = wl_registry_bind(r, name, &wl_seat_interface, 5); wl_seat_add_listener(a->seat, &seat_listener, a);
    }
}
static void global_remove(void *data, struct wl_registry *r, uint32_t name) {
    (void)data; (void)r; event_start("global_remove"); printf(",\"name\":%u", name); event_end();
}
static const struct wl_registry_listener registry_listener = { .global = global, .global_remove = global_remove };
static void surface_configure(void *data, struct xdg_surface *s, uint32_t serial) {
    struct app *a = data; xdg_surface_ack_configure(s, serial);
    event_start("configure_ack"); printf(",\"serial\":%u", serial); event_end();
    if (!paint(a)) { a->done = true; a->failed = true; }
}
static const struct xdg_surface_listener surface_listener = { .configure = surface_configure };
static void toplevel_configure(void *data, struct xdg_toplevel *t, int32_t width, int32_t height, struct wl_array *states) {
    struct app *a = data; (void)t; (void)states;
    if (width > 0) a->width = width;
    if (height > 0) a->height = height;
    event_start("toplevel_configure"); printf(",\"width\":%d,\"height\":%d", width, height); event_end();
}
static void toplevel_close(void *data, struct xdg_toplevel *t) {
    (void)t; ((struct app *)data)->done = true; event_start("toplevel_close"); event_end();
}
static const struct xdg_toplevel_listener toplevel_listener = { .configure = toplevel_configure, .close = toplevel_close };
static long number(const char *s, long min, long max) {
    char *end; errno = 0; long n = strtol(s, &end, 10);
    if (errno || !*s || *end || n < min || n > max) return -1;
    return n;
}
int main(int argc, char **argv) {
    if (argc < 3 || argc > 4) { fprintf(stderr, "usage: %s INHERITED_CONNECTED_FD TITLE_APPID [LIFETIME_MS<=30000]\n", argv[0]); return 2; }
    long fd = number(argv[1], 0, INT_MAX), lifetime = argc == 4 ? number(argv[3], 1, 30000) : 30000;
    if (fd < 0 || lifetime < 0 || fcntl((int)fd, F_GETFD) < 0) return 2;
    setvbuf(stdout, NULL, _IOLBF, 0);
    signal(SIGTERM, stop_signal); signal(SIGINT, stop_signal); signal(SIGALRM, stop_signal);
    /* Alarm also bounds startup roundtrips when the compositor stalls. */
    alarm(30);
    uint64_t deadline = now_ns() + (uint64_t)lifetime * 1000000;
    struct app a = { .width = 800, .height = 600 };
    a.display = wl_display_connect_to_fd((int)fd);
    if (!a.display) return 1;
    struct wl_registry *registry = wl_display_get_registry(a.display);
    wl_registry_add_listener(registry, &registry_listener, &a);
    /* Nonblocking discovery: no unbounded wl_display_roundtrip. */
    bool initialized = false;
    while (!a.done && !interrupted && now_ns() < deadline) {
        if (wl_display_dispatch_pending(a.display) < 0) { a.failed = true; break; }
        if (!initialized && a.compositor && a.shm && a.wm && a.seat) {
            a.surface = wl_compositor_create_surface(a.compositor);
            a.xdg_surface = xdg_wm_base_get_xdg_surface(a.wm, a.surface);
            xdg_surface_add_listener(a.xdg_surface, &surface_listener, &a);
            a.toplevel = xdg_surface_get_toplevel(a.xdg_surface);
            xdg_toplevel_add_listener(a.toplevel, &toplevel_listener, &a);
            xdg_toplevel_set_title(a.toplevel, argv[2]); xdg_toplevel_set_app_id(a.toplevel, argv[2]);
            wl_surface_commit(a.surface); initialized = true;
            event_start("receiver_created"); printf(",\"title\":"); json_string(argv[2]); printf(",\"app_id\":"); json_string(argv[2]); event_end();
        }
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
    event_start("receiver_exit"); printf(",\"initialized\":%s,\"failed\":%s", initialized ? "true" : "false", a.failed ? "true" : "false"); event_end();
    wl_display_disconnect(a.display);
    return a.failed || !initialized ? 1 : 0;
}
