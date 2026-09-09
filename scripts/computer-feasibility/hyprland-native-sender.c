/* Isolated Phase 3 fixture, NOT a backend. Inherited Wayland fd only.
 * H key button presses; R releases; P x y moves; M mask sets modifiers.
 * SIGKILL this sole client while held, ONLY in a separate compositor. */
#define _GNU_SOURCE
#include <wayland-client.h>
#include <xkbcommon/xkbcommon.h>
#include <sys/mman.h>
#include <sys/socket.h>
#include <unistd.h>
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "wlr-virtual-pointer-client.h"
#include "virtual-keyboard-client.h"
static struct wl_seat *seat;
static struct wl_output *output;
static struct zwlr_virtual_pointer_manager_v1 *pm;
static struct zwp_virtual_keyboard_manager_v1 *km;
static uint32_t now_ms(void) {
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    return (uint32_t)(t.tv_sec * 1000 + t.tv_nsec / 1000000);
}
static void global(void *data, struct wl_registry *reg, uint32_t id,
                   const char *iface, uint32_t version) {
    (void)data;
    if (!strcmp(iface, wl_seat_interface.name) && !seat)
        seat = wl_registry_bind(reg, id, &wl_seat_interface, version < 5 ? version : 5);
    else if (!strcmp(iface, wl_output_interface.name) && !output)
        output = wl_registry_bind(reg, id, &wl_output_interface, 1);
    else if (!strcmp(iface, zwlr_virtual_pointer_manager_v1_interface.name))
        pm = wl_registry_bind(reg, id, &zwlr_virtual_pointer_manager_v1_interface, version < 2 ? version : 2);
    else if (!strcmp(iface, zwp_virtual_keyboard_manager_v1_interface.name))
        km = wl_registry_bind(reg, id, &zwp_virtual_keyboard_manager_v1_interface, 1);
}
static void removed(void *data, struct wl_registry *reg, uint32_t id) {
    (void)data; (void)reg; (void)id;
}
static const struct wl_registry_listener registry_listener = {global, removed};
int main(int argc, char **argv) {
    if (argc != 2) return 64;
    char *end = NULL;
    long fd = strtol(argv[1], &end, 10);
    if (!end || *end || fd < 3 || fd > 1048576) return 64;
    struct ucred peer;
    socklen_t size = sizeof peer;
    if (getsockopt((int)fd, SOL_SOCKET, SO_PEERCRED, &peer, &size) ||
        peer.uid != getuid() || peer.pid <= 0) return 65;
    struct wl_display *display = wl_display_connect_to_fd((int)fd);
    if (!display) return 66;
    struct wl_registry *registry = wl_display_get_registry(display);
    wl_registry_add_listener(registry, &registry_listener, NULL);
    if (wl_display_roundtrip(display) < 0 || !seat || !pm || !km || !output) return 67;
    struct zwlr_virtual_pointer_v1 *pointer = zwlr_virtual_pointer_manager_v1_get_version(pm) >= 2 ?
        zwlr_virtual_pointer_manager_v1_create_virtual_pointer_with_output(pm, seat, output) :
        zwlr_virtual_pointer_manager_v1_create_virtual_pointer(pm, seat);
    struct zwp_virtual_keyboard_v1 *keyboard = zwp_virtual_keyboard_manager_v1_create_virtual_keyboard(km, seat);
    struct xkb_context *ctx = xkb_context_new(XKB_CONTEXT_NO_FLAGS);
    struct xkb_rule_names names = {.layout = "us"};
    struct xkb_keymap *map = xkb_keymap_new_from_names(ctx, &names, XKB_KEYMAP_COMPILE_NO_FLAGS);
    if (!map) return 68;
    char *text = xkb_keymap_get_as_string(map, XKB_KEYMAP_FORMAT_TEXT_V1);
    size_t len = strlen(text) + 1;
    int keyfd = memfd_create("isolated-phase3-keymap", MFD_CLOEXEC);
    if (keyfd < 0 || write(keyfd, text, len) != (ssize_t)len) return 69;
    zwp_virtual_keyboard_v1_keymap(keyboard, WL_KEYBOARD_KEYMAP_FORMAT_XKB_V1, keyfd, (uint32_t)len);
    close(keyfd); free(text); xkb_keymap_unref(map); xkb_context_unref(ctx);
    if (wl_display_roundtrip(display) < 0) return 70;
    setvbuf(stdout, NULL, _IOLBF, 0);
    printf("{\"event\":\"ready\",\"pid\":%d,\"peer_pid\":%d}\n", getpid(), peer.pid);
    unsigned key = 0, button = 0;
    char line[128];
    while (fgets(line, sizeof line, stdin)) {
        unsigned a, b; int n = 0;
        if (sscanf(line, "H %u %u%n", &a, &b, &n) == 2 && line[n] == '\n' &&
            a >= 1 && a <= 247 && b >= 272 && b <= 279 && !key && !button) {
            key = a; button = b;
            zwlr_virtual_pointer_v1_button(pointer, now_ms(), button, WL_POINTER_BUTTON_STATE_PRESSED);
            zwlr_virtual_pointer_v1_frame(pointer);
            zwp_virtual_keyboard_v1_key(keyboard, now_ms(), key, WL_KEYBOARD_KEY_STATE_PRESSED);
            if (wl_display_roundtrip(display) < 0) return 71;
            printf("{\"event\":\"held\",\"key\":%u,\"button\":%u}\n", key, button);
        } else if (sscanf(line, "P %u %u%n", &a, &b, &n) == 2 && line[n] == '\n' && a < 800 && b < 600) {
            zwlr_virtual_pointer_v1_motion_absolute(pointer, now_ms(), a, b, 800, 600);
            zwlr_virtual_pointer_v1_frame(pointer);
            if (wl_display_roundtrip(display) < 0) return 72;
            puts("{\"event\":\"positioned\"}");
        } else if (sscanf(line, "M %u%n", &a, &n) == 1 && line[n] == '\n' && a <= 255) {
            zwp_virtual_keyboard_v1_modifiers(keyboard, a, 0, 0, 0);
            if (wl_display_roundtrip(display) < 0) return 73;
            printf("{\"event\":\"modifiers\",\"depressed\":%u}\n", a);
        } else if (!strcmp(line, "R\n")) {
            if (key) zwp_virtual_keyboard_v1_key(keyboard, now_ms(), key, WL_KEYBOARD_KEY_STATE_RELEASED);
            if (button) zwlr_virtual_pointer_v1_button(pointer, now_ms(), button, WL_POINTER_BUTTON_STATE_RELEASED);
            zwlr_virtual_pointer_v1_frame(pointer);
            zwp_virtual_keyboard_v1_modifiers(keyboard, 0, 0, 0, 0);
            key = button = 0;
            if (wl_display_roundtrip(display) < 0) return 74;
            puts("{\"event\":\"released\"}");
        } else if (!strcmp(line, "Q\n")) break;
        else return 75;
    }
    zwlr_virtual_pointer_v1_destroy(pointer);
    zwp_virtual_keyboard_v1_destroy(keyboard);
    wl_display_flush(display);
    wl_display_disconnect(display);
    return 0;
}
