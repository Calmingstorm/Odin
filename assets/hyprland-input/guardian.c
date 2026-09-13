/* Native Hyprland VP/VK owner. argv: WAYLAND_PATH COMPOSITOR_PID UID OUTPUT SCOPE_PATH.
 * Followed by LOGICAL_WIDTH LOGICAL_HEIGHT. No environment discovery or plugin loading. Explicit release on realistic
 * exits; guardian SIGKILL and mixed-source same-button overlap are accepted
 * residuals. Compositor cleanup acknowledgement is NOT receiver proof.
 * Wire: F token; B ms monotonic_us; O monotonic_us; N; C/R; S output;
 * MPDKTJQWVLYZE action grammar shared with the libei guardian, G pixel permit.
 */
#define _GNU_SOURCE
#include <wayland-client.h>
#include <xkbcommon/xkbcommon.h>
#include <xkbcommon/xkbcommon-keysyms.h>
#include <errno.h>
#include <fcntl.h>
#include <math.h>
#include <poll.h>
#include <signal.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/random.h>
#include <sys/prctl.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/un.h>
#include <time.h>
#include <unistd.h>
#include "wlr-virtual-pointer-client.h"
#include "virtual-keyboard-client.h"
#define MAX_OUTPUTS 32
#define MAX_STEPS 4096
#define MAX_LINE 32001
static volatile sig_atomic_t cancelled;
static void on_signal(int sig) { (void)sig; cancelled = 1; }
static uint64_t now_us(void) {
    struct timespec t;
    if (clock_gettime(CLOCK_MONOTONIC, &t)) return UINT64_MAX;
    return (uint64_t)t.tv_sec * 1000000 + (uint64_t)t.tv_nsec / 1000;
}
struct guardian;
struct output {
    struct guardian *g;
    struct wl_output *object;
    uint32_t id;
    int width, height, transform;
    bool done;
    char name[129];
};
struct point { double x, y; };
struct chord { unsigned keys[16], n; };
enum event_kind { MOVE, BUTTON, KEY, SCROLL, GATE };
struct event { enum event_kind kind; unsigned code; bool down; double x, y; uint64_t at; };
struct guardian {
    struct wl_display *display;
    struct wl_registry *registry;
    struct wl_seat *seat;
    struct zwlr_virtual_pointer_manager_v1 *pm;
    struct zwp_virtual_keyboard_manager_v1 *km;
    struct zwlr_virtual_pointer_v1 *pointer;
    struct zwp_virtual_keyboard_v1 *keyboard;
    struct output outputs[MAX_OUTPUTS], *output;
    unsigned noutputs, seats;
    struct xkb_context *xctx;
    struct xkb_keymap *keymap;
    struct xkb_state *state;
    bool keys[248], buttons[8], modifiers;
    bool ready, begun, action, input_sent, release_sent, release_acknowledged, release_status_v1;
    bool arm_definitively_refused;
    bool disconnected, changed, gate_waiting, gate_allowed;
    /* Bounded transport evidence, never receiver or application proof. */
    const char *terminal_cause, *scope_outcome, *release_submission, *release_ack, *resource_closure;
    unsigned input_queued, input_submitted;
    int scope_fd, parent_fd, status;
    pid_t parent_pid, compositor_pid;
    uid_t uid;
    unsigned width, height, planned, completed, index, gate_serial;
    uint64_t lease, scope_deadline, idle, start, rejected;
    char mapping[129], scope_path[108], compositor_start_ticks[32], scope_token[129], arm_token[129];
    dev_t scope_dev;
    ino_t scope_ino;
    const char *reason;
    const char *scope_operation, *scope_error, *command_name;
    struct event events[MAX_STEPS];
};
static const char *cause_for_reason(const char *reason) {
    if (!strcmp(reason, "controller-eof")) return "controller_eof";
    if (!strcmp(reason, "controller-timeout")) return "controller_timeout";
    if (!strcmp(reason, "signal-cancel")) return "signal_cancel";
    if (!strcmp(reason, "scope-evidence-expired") || !strcmp(reason, "lease-expired")) return "scope_timeout";
    if (!strcmp(reason, "scope-rejected-input")) return "scope_refused";
    if (!strcmp(reason, "scope-refused")) return "scope_refused";
    if (!strcmp(reason, "mapping-changed")) return "mapping_changed";
    if (!strcmp(reason, "invalid-command")) return "invalid_command";
    if (!strcmp(reason, "input-path-lost")) return "wayland_dispatch_failed";
    return "other";
}
static void fail(struct guardian *g, const char *reason) {
    if (!g->reason) {
        g->reason = reason;
        /* scope_bind records a more specific terminal cause before the legacy
         * command parser labels the command invalid. Preserve that evidence. */
        if (!g->terminal_cause) g->terminal_cause = cause_for_reason(reason);
    }
}
/* stdout is nonblocking: a stalled controller must never stall owned release. */
static bool emit(const char *line) {
    size_t n = strlen(line); ssize_t result = write(STDOUT_FILENO, line, n);
    return result >= 0 && (size_t)result == n;
}
static void receipt(struct guardian *g, const char *event, const char *reason) {
    char line[256];
    snprintf(line, sizeof line, "{\"event\":\"%s\",\"reason\":\"%s\",\"receiver_proven\":false}\n", event, reason);
    if (!emit(line)) fail(g, "transport-error");
}
static bool alive_scope(struct guardian *g) {
    uint64_t now = now_us();
    if (cancelled) { fail(g, "signal-cancel"); return false; }
    if (getppid() != g->parent_pid) { fail(g, "controller-eof"); return false; }
    if (g->begun && now >= g->lease) { fail(g, "lease-expired"); return false; }
    if (g->begun && now >= g->scope_deadline) { fail(g, "scope-evidence-expired"); return false; }
    return !g->reason && !g->disconnected && !g->changed;
}
/* Never wl_display_roundtrip(): it blocks indefinitely on a stalled compositor. */
static int pump(struct guardian *g, int wait_ms) {
    if (wl_display_dispatch_pending(g->display) < 0) goto lost;
    while (wl_display_prepare_read(g->display) != 0)
        if (wl_display_dispatch_pending(g->display) < 0) goto lost;
    int flushed = wl_display_flush(g->display);
    if (flushed < 0 && errno != EAGAIN) { wl_display_cancel_read(g->display); goto lost; }
    struct pollfd fd = {wl_display_get_fd(g->display), POLLIN | (flushed < 0 ? POLLOUT : 0), 0};
    int result = poll(&fd, 1, wait_ms);
    if (result > 0 && (fd.revents & POLLIN)) {
        if (wl_display_read_events(g->display) < 0) goto lost;
        if (wl_display_dispatch_pending(g->display) < 0) goto lost;
    } else wl_display_cancel_read(g->display);
    if (result < 0 && errno != EINTR) goto lost;
    if (fd.revents & (POLLERR | POLLHUP | POLLNVAL)) goto lost;
    return 0;
lost:
    g->disconnected = true;
    if (!g->terminal_cause) g->terminal_cause = "wayland_dispatch_failed";
    return -1;
}
static void synced(void *data, struct wl_callback *callback, uint32_t serial) {
    (void)callback; (void)serial; *(bool *)data = true;
}
static const struct wl_callback_listener sync_listener = {synced};
static bool synchronize(struct guardian *g, unsigned timeout_ms) {
    if (g->disconnected) return false;
    bool done = false;
    struct wl_callback *callback = wl_display_sync(g->display);
    if (!callback) return false;
    wl_callback_add_listener(callback, &sync_listener, &done);
    uint64_t deadline = now_us() + (uint64_t)timeout_ms * 1000;
    while (!done && now_us() < deadline) if (pump(g, 2) < 0) break;
    wl_callback_destroy(callback);
    return done && !g->disconnected;
}
/* Bounded flat JSON reply parser: no duplicate fields, nesting, escapes,
 * overflows, non-boolean ok/armed, or unframed bytes. */
struct scope_reply { bool ok, armed, have_ok, have_armed, have_keys, have_buttons, have_rejected, release_acknowledged, release_status_v1; uint64_t keys, buttons, rejected; const char *error; };
/* Shared with scope_exchange, including its terminating NUL. Even an empty
 * name with the shortest scalar takes four bytes ("":0), plus a comma per
 * additional field and two braces: n fields need at least 5*n + 1 bytes.
 * Thus every reply that fits the wire buffer also fits this duplicate index.
 * Store offsets, not 64-byte name copies: 818 uint16_t entries = 1636 bytes,
 * only 100 bytes more than the former, accidentally limiting 24-name table. */
enum { SCOPE_RESPONSE_CAP = 4096, SCOPE_REPLY_MAX_FIELDS = (SCOPE_RESPONSE_CAP - 2) / 5 };
_Static_assert(SCOPE_RESPONSE_CAP - 1 <= UINT16_MAX, "scope name offsets must fit");
/* Fixed vocabulary only: never copy tokens, peer prose or application data. */
static const char *scope_error_code(const char *value) {
    static const char *const codes[] = {
        "absolute-scope-deadline-required", "invalid-lease-or-cleanup-failed",
        "renew-binding-refused", "already-armed", "stale-snapshot",
        "ambiguous-keyboard", "missing-guardian-keyboard", "ambiguous-pointer",
        "missing-or-wrong-output-pointer", "human-input-held",
        "unknown-operation", "invalid-json"
    };
    for (size_t i = 0; i < sizeof codes / sizeof *codes; ++i)
        if (!strcmp(value, codes[i])) return codes[i];
    return "unrecognized-scope-error";
}
static void whitespace(const char **p) { while (**p == ' ' || **p == '\t' || **p == '\r' || **p == '\n') ++*p; }
static bool json_string(const char **p, char *out, size_t cap) {
    if (*(*p)++ != '"') return false;
    size_t n = 0;
    while (**p && **p != '"') {
        unsigned char ch = (unsigned char)*(*p)++;
        if (ch < 32 || ch > 126 || ch == '\\' || n + 1 >= cap) return false;
        out[n++] = (char)ch;
    }
    if (**p != '"') return false;
    ++*p; out[n] = 0; return true;
}
static bool parse_reply(const char *p, struct scope_reply *r) {
    memset(r, 0, sizeof *r);
    const char *response = p;
    size_t length = 0;
    while (length < SCOPE_RESPONSE_CAP && response[length]) ++length;
    if (length == SCOPE_RESPONSE_CAP) return false;
    uint16_t seen[SCOPE_REPLY_MAX_FIELDS]; unsigned count = 0;
    whitespace(&p); if (*p++ != '{') return false;
    whitespace(&p);
    while (*p != '}') {
        char name[64], value[512];
        const char *field = p;
        if (count == SCOPE_REPLY_MAX_FIELDS || !json_string(&p, name, sizeof name)) return false;
        size_t name_length = strlen(name);
        /* Prior names are validated, unescaped slices of this immutable reply.
         * Include their closing quote in the equality check so prefixes do not
         * collide. Each prior start precedes this complete name, keeping every
         * comparison within the bounded reply, even for shorter prior names. */
        for (unsigned i = 0; i < count; ++i)
            if (!memcmp(response + seen[i], name, name_length) && response[seen[i] + name_length] == '"') return false;
        seen[count++] = (uint16_t)(field + 1 - response);
        whitespace(&p); if (*p++ != ':') return false; whitespace(&p);
        bool boolean = false, truth = false, numeric = false, string = false; uint64_t number = 0;
        if (!strncmp(p, "true", 4)) { boolean = truth = true; p += 4; }
        else if (!strncmp(p, "false", 5)) { boolean = true; p += 5; }
        else if (*p >= '0' && *p <= '9') {
            numeric = true; const char *first = p;
            do { unsigned d = (unsigned)(*p++ - '0'); if (number > (UINT64_MAX - d) / 10) return false; number = number * 10 + d; } while (*p >= '0' && *p <= '9');
            if (*first == '0' && p - first > 1) return false;
        } else if (*p == '"') { if (!json_string(&p, value, sizeof value)) return false; string = true; }
        else return false;
        if (!strcmp(name, "ok")) { if (!boolean) return false; r->have_ok = true; r->ok = truth; }
        else if (!strcmp(name, "armed")) { if (!boolean) return false; r->have_armed = true; r->armed = truth; }
        else if (!strcmp(name, "release_acknowledged")) { if (!boolean) return false; r->release_acknowledged = truth; }
        else if (!strcmp(name, "release_status_v1")) { if (!boolean) return false; r->release_status_v1 = truth; }
        else if (!strcmp(name, "keys")) { if (!numeric || number > 248) return false; r->have_keys = true; r->keys = number; }
        else if (!strcmp(name, "buttons")) { if (!numeric || number > 8) return false; r->have_buttons = true; r->buttons = number; }
        else if (!strcmp(name, "rejected")) { if (!numeric) return false; r->have_rejected = true; r->rejected = number; }
        else if (!strcmp(name, "error")) { if (!string) return false; r->error = scope_error_code(value); }
        whitespace(&p);
        if (*p == '}') break;
        if (*p++ != ',') return false;
        whitespace(&p); if (*p == '}') return false;
    }
    if (*p++ != '}') return false;
    whitespace(&p); return !*p && r->have_ok;
}
static bool scope_exchange(struct guardian *g, const char *request, struct scope_reply *reply) {
    if (g->scope_fd < 0) return false;
    size_t length = strlen(request), sent = 0, used = 0; char response[SCOPE_RESPONSE_CAP];
    /* Only cleanup gets a longer reply budget, after owned ups were submitted.
     * This never grants input or renews the 250 ms compositor scope lease. */
    uint64_t deadline = now_us() + (strstr(request, "\"release_all\"") ? 500000 : 50000);
    /* Renewal cannot stall the existing independent owned-release deadline.
     * Cleanup retains its own bounded budget regardless of expired scope. */
    if (strstr(request, "\"renew\"") && g->begun) {
        if (g->scope_deadline < deadline) deadline = g->scope_deadline;
        if (g->lease < deadline) deadline = g->lease;
    }
    while (now_us() < deadline) {
        struct pollfd fd = {g->scope_fd, sent < length ? POLLOUT : POLLIN, 0};
        int rc = poll(&fd, 1, 2);
        if (now_us() >= deadline) return false;
        if (rc < 0 && errno == EINTR) continue;
        if (rc < 0 || (fd.revents & (POLLERR | POLLHUP | POLLNVAL))) return false;
        if (sent < length && (fd.revents & POLLOUT)) {
            ssize_t n = send(g->scope_fd, request + sent, length - sent, MSG_NOSIGNAL);
            if (n > 0) sent += (size_t)n;
            else if (n == 0 || (errno != EINTR && errno != EAGAIN)) return false;
        } else if (fd.revents & POLLIN) {
            ssize_t n = recv(g->scope_fd, response + used, sizeof response - 1 - used, 0);
            if (n <= 0) { if (n < 0 && (errno == EINTR || errno == EAGAIN)) continue; return false; }
            if (memchr(response + used, 0, (size_t)n)) return false;
            used += (size_t)n; response[used] = 0;
            char *nl = strchr(response, '\n');
            if (nl) return nl == response + used - 1 && parse_reply(response, reply) && now_us() < deadline;
            if (used == sizeof response - 1) return false;
        }
    }
    return false;
}
static bool scope_call(struct guardian *g, const char *request, struct scope_reply *reply) {
    /* A complete negative reply is a refused operation, not a lost stream.
     * In particular, a focus-revoked renewal must leave this connection alive
     * for explicit release acknowledgement. Callers still stop on refusal. */
    if (scope_exchange(g, request, reply)) {
        g->scope_outcome = reply->ok ? "accepted" : "refused";
        return reply->ok;
    }
    /* Poison after ambiguous send: a late reply cannot acknowledge later work. */
    if (g->scope_fd >= 0) close(g->scope_fd);
    g->scope_fd = -1;
    g->scope_outcome = "transport_lost";
    return false;
}
static bool scope_bind(struct guardian *g, bool renew, uint64_t deadline) {
    g->scope_operation = renew ? "renew" : "arm";
    if (!renew) g->arm_definitively_refused = false;
    if (!g->scope_token[0]) { g->scope_error = "missing-scope-token"; return false; }
    uint64_t now = now_us();
    if (deadline <= now || deadline - now > 250000) { g->scope_error = "local-deadline-invalid"; return false; }
    unsigned lease_ms = (unsigned)((deadline - now) / 1000);
    if (!lease_ms) { g->scope_error = "local-deadline-invalid"; return false; }
    char request[256];
    if (!renew) strcpy(g->arm_token, g->scope_token);
    snprintf(request, sizeof request, "{\"op\":\"%s\",\"token\":\"%s\",\"lease_ms\":%u,\"deadline_monotonic_ns\":%llu}\n", renew ? "renew" : "arm", g->arm_token, lease_ms, (unsigned long long)(deadline * 1000));
    g->scope_token[0] = 0;
    struct scope_reply r = {0};
    if (!scope_call(g, request, &r)) {
        if (g->scope_outcome && !strcmp(g->scope_outcome, "refused")) {
            g->terminal_cause = "scope_refused";
            if (!renew) g->arm_definitively_refused = true;
            /* A complete native refusal is not malformed controller syntax.
             * Preserve it as the outer terminal reason before command() returns
             * false and the parser attempts to add invalid-command. */
            fail(g, "scope-refused");
        }
        else if (g->scope_outcome && !strcmp(g->scope_outcome, "transport_lost")) g->terminal_cause = "scope_transport_failed";
        g->scope_error = g->scope_fd < 0 ? "scope-exchange-failed" :
            (r.error ? r.error : "scope-operation-refused");
        return false;
    }
    if (!r.have_armed || !r.armed || !r.have_rejected) { g->scope_error = "scope-ack-invalid"; return false; }
    if (renew && r.rejected != g->rejected) { g->scope_error = "scope-rejected-input"; return false; }
    g->rejected = r.rejected;
    if (now_us() >= deadline) { g->scope_error = "scope-ack-expired"; return false; }
    g->scope_error = "none";
    return true;
}
static bool path_socket(const char *path, uid_t uid, bool private) {
    struct stat st;
    if (!path || path[0] != '/' || strlen(path) >= sizeof(((struct sockaddr_un *)0)->sun_path)) return false;
    if (lstat(path, &st) || !S_ISSOCK(st.st_mode) || st.st_uid != uid || (private && (st.st_mode & 0077))) return false;
    char parent[108]; strcpy(parent, path); char *slash = strrchr(parent, '/');
    if (!slash || slash == parent) return false;
    *slash = 0;
    return !lstat(parent, &st) && S_ISDIR(st.st_mode) && st.st_uid == uid && !(st.st_mode & 0022);
}
static int connect_peer(const char *path, pid_t pid, uid_t uid, bool private) {
    if (!path_socket(path, uid, private)) return -1;
    int fd = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC | SOCK_NONBLOCK, 0);
    if (fd < 0) return -1;
    struct sockaddr_un address = {.sun_family = AF_UNIX}; strcpy(address.sun_path, path);
    if (connect(fd, (struct sockaddr *)&address, sizeof address)) {
        if (errno != EINPROGRESS) goto bad;
        struct pollfd pollfd = {fd, POLLOUT, 0}; int error = 0; socklen_t size = sizeof error;
        if (poll(&pollfd, 1, 100) != 1 || getsockopt(fd, SOL_SOCKET, SO_ERROR, &error, &size) || error) goto bad;
    }
    struct ucred peer; socklen_t size = sizeof peer;
    if (getsockopt(fd, SOL_SOCKET, SO_PEERCRED, &peer, &size) || size != sizeof peer || peer.pid != pid || peer.uid != uid) goto bad;
    return fd;
bad:
    close(fd); return -1;
}
static bool process_start_ticks(pid_t pid, char out[32]) {
    char stat_path[64];
    if (snprintf(stat_path, sizeof stat_path, "/proc/%ld/stat", (long)pid) < 0) return false;
    FILE *f = fopen(stat_path, "re"); char line[4096], *close, *p;
    if (!f || !fgets(line, sizeof line, f)) { if (f) fclose(f); return false; }
    fclose(f); close = strrchr(line, ')'); if (!close || close[1] != ' ') return false;
    p = close + 2;
    for (unsigned i = 0; i <= 19; ++i) {
        while (*p == ' ') ++p;
        char *start = p; while (*p && *p != ' ') ++p;
        if (!*start || (i == 19 && (p - start >= 32 || strspn(start, "0123456789") != (size_t)(p - start)))) return false;
        if (i == 19) { memcpy(out, start, (size_t)(p - start)); out[p - start] = 0; return true; }
    }
    return false;
}
static bool own_start_ticks(char out[32]) { return process_start_ticks(getpid(), out); }
static bool connect_scope_peer(struct guardian *g, bool initial) {
    struct stat st;
    if (!path_socket(g->scope_path, g->uid, true) || stat(g->scope_path, &st)) return false;
    if (!initial && (st.st_dev != g->scope_dev || st.st_ino != g->scope_ino)) return false;
    char ticks[32];
    if (!process_start_ticks(g->compositor_pid, ticks) ||
        (!initial && strcmp(ticks, g->compositor_start_ticks))) return false;
    int fd = connect_peer(g->scope_path, g->compositor_pid, g->uid, true);
    if (fd < 0) return false;
    if (stat(g->scope_path, &st) || (!initial && (st.st_dev != g->scope_dev || st.st_ino != g->scope_ino))) {
        close(fd); return false;
    }
    if (initial) {
        g->scope_dev = st.st_dev; g->scope_ino = st.st_ino;
        strcpy(g->compositor_start_ticks, ticks);
    }
    g->scope_fd = fd;
    return true;
}
static bool command_id(char out[49]) {
    unsigned char bytes[24]; static const char hex[] = "0123456789abcdef";
    if (getrandom(bytes, sizeof bytes, 0) != (ssize_t)sizeof bytes) return false;
    for (size_t i = 0; i < sizeof bytes; ++i) { out[i * 2] = hex[bytes[i] >> 4]; out[i * 2 + 1] = hex[bytes[i] & 15]; }
    out[48] = 0; return true;
}
static void output_geometry(void *data, struct wl_output *o, int32_t x, int32_t y, int32_t pw, int32_t ph, int32_t sub, const char *make, const char *model, int32_t transform) {
    (void)o; (void)x; (void)y; (void)pw; (void)ph; (void)sub; (void)make; (void)model;
    struct output *out = data; if (out->g->ready) out->g->changed = true; out->transform = transform;
}
static void output_mode(void *data, struct wl_output *o, uint32_t flags, int32_t w, int32_t h, int32_t refresh) {
    (void)o; (void)refresh; struct output *out = data;
    if (!(flags & WL_OUTPUT_MODE_CURRENT)) return;
    if (out->g->ready) out->g->changed = true;
    out->width = w; out->height = h;
}
static void output_done(void *data, struct wl_output *o) { (void)o; ((struct output *)data)->done = true; }
static void output_scale(void *data, struct wl_output *o, int32_t scale) { (void)o; (void)scale; struct output *out = data; if (out->g->ready) out->g->changed = true; }
static void output_name(void *data, struct wl_output *o, const char *name) {
    (void)o; struct output *out = data;
    if (out->g->ready || strlen(name) > 128) { out->g->changed = true; return; } strcpy(out->name, name);
}
static void output_description(void *data, struct wl_output *o, const char *description) { (void)data; (void)o; (void)description; }
static const struct wl_output_listener output_listener = {output_geometry, output_mode, output_done, output_scale, output_name, output_description};
static void global(void *data, struct wl_registry *registry, uint32_t id, const char *name, uint32_t version) {
    struct guardian *g = data;
    if (g->ready) { g->changed = true; return; }
    if (!strcmp(name, wl_seat_interface.name)) {
        ++g->seats; if (!g->seat) g->seat = wl_registry_bind(registry, id, &wl_seat_interface, 1);
    } else if (!strcmp(name, wl_output_interface.name)) {
        if (g->noutputs == MAX_OUTPUTS || version < 4) { g->changed = true; return; }
        struct output *out = &g->outputs[g->noutputs++]; out->g = g; out->id = id;
        out->object = wl_registry_bind(registry, id, &wl_output_interface, 4);
        wl_output_add_listener(out->object, &output_listener, out);
    } else if (!strcmp(name, zwlr_virtual_pointer_manager_v1_interface.name)) {
        if (g->pm || version < 2) { g->changed = true; return; }
        g->pm = wl_registry_bind(registry, id, &zwlr_virtual_pointer_manager_v1_interface, 2);
    } else if (!strcmp(name, zwp_virtual_keyboard_manager_v1_interface.name)) {
        if (g->km) { g->changed = true; return; }
        g->km = wl_registry_bind(registry, id, &zwp_virtual_keyboard_manager_v1_interface, 1);
    }
}
static void removed(void *data, struct wl_registry *registry, uint32_t id) { (void)registry; (void)id; ((struct guardian *)data)->changed = true; }
static const struct wl_registry_listener registry_listener = {global, removed};
static bool setup_keymap(struct guardian *g) {
    g->xctx = xkb_context_new(XKB_CONTEXT_NO_ENVIRONMENT_NAMES);
    if (!g->xctx) return false;
    const struct xkb_rule_names names = {.rules = "evdev", .model = "pc105", .layout = "us", .variant = "", .options = ""};
    g->keymap = xkb_keymap_new_from_names(g->xctx, &names, XKB_KEYMAP_COMPILE_NO_FLAGS);
    if (!g->keymap) return false;
    g->state = xkb_state_new(g->keymap);
    char *text = xkb_keymap_get_as_string(g->keymap, XKB_KEYMAP_FORMAT_TEXT_V1);
    if (!text || !g->state) { free(text); return false; }
    size_t n = strlen(text) + 1;
    int fd = memfd_create("odin-hyprland-virtual-keymap", MFD_CLOEXEC | MFD_ALLOW_SEALING);
    bool ok = fd >= 0 && write(fd, text, n) == (ssize_t)n;
    if (ok) ok = !fcntl(fd, F_ADD_SEALS, F_SEAL_WRITE | F_SEAL_GROW | F_SEAL_SHRINK | F_SEAL_SEAL);
    if (ok) zwp_virtual_keyboard_v1_keymap(g->keyboard, WL_KEYBOARD_KEYMAP_FORMAT_XKB_V1, fd, (uint32_t)n);
    if (fd >= 0) close(fd);
    free(text); return ok;
}
static void ready_receipt(struct guardian *g, const char *event) {
    char line[768];
    snprintf(line, sizeof line, "{\"event\":\"%s\",\"protocol\":1,\"width\":%u,\"height\":%u,\"pointer\":true,\"keyboard\":true,\"text\":true,\"bounded_clicks\":true,\"timed_polyline\":true,\"pointer_modifiers_v1\":true,\"pixel_fields_v1\":true,\"scope_lease_v1\":true,\"keymap_format\":\"xkb_v1\",\"keymap_layout\":\"us-virtual-owned\",\"keymap_layouts\":1,\"pid\":%d,\"peer_pid\":%d,\"receiver_proven\":false,\"hyprland_best_effort\":true}\n", event, g->width, g->height, getpid(), g->compositor_pid);
    if (!emit(line)) fail(g, "transport-error");
}
static char *token(char **rest) {
    if (!*rest || !**rest) return NULL;
    char *word = *rest, *space = strchr(word, ' ');
    if (space) { *space = 0; *rest = space + 1; } else *rest = NULL;
    return *word ? word : NULL;
}
static bool integer(char **rest, uint64_t *out, uint64_t low, uint64_t high) {
    char *word = token(rest); uint64_t value = 0;
    if (!word) return false;
    for (char *p = word; *p; ++p) {
        if (*p < '0' || *p > '9') return false;
        unsigned d = (unsigned)(*p - '0');
        if (value > (UINT64_MAX - d) / 10) return false;
        value = value * 10 + d;
    }
    if (value < low || value > high) return false;
    *out = value; return true;
}
static bool point(struct guardian *g, char **rest, struct point *p) {
    double *v[] = {&p->x, &p->y};
    for (unsigned i = 0; i < 2; ++i) {
        char *word = token(rest), *end;
        if (!word) return false;
        errno = 0; *v[i] = strtod(word, &end);
        if (errno || end == word || *end || !isfinite(*v[i])) return false;
    }
    return p->x >= 0 && p->y >= 0 && p->x < g->width && p->y < g->height;
}
static bool add(struct guardian *g, enum event_kind kind, unsigned code, bool down, double x, double y, uint64_t at) {
    if (g->planned == MAX_STEPS) return false;
    g->events[g->planned++] = (struct event){kind, code, down, x, y, at}; return true;
}
static unsigned symbol_key(struct guardian *g, xkb_keysym_t sym) {
    for (unsigned k = 9; k <= 255; ++k) {
        const xkb_keysym_t *syms;
        int n = xkb_keymap_key_get_syms_by_level(g->keymap, k, 0, 0, &syms);
        if (n == 1 && syms[0] == sym) return k - 8;
    }
    return 0;
}
static unsigned modifier(struct guardian *g, const char *name) {
    if (!strcmp(name, "ctrl")) return symbol_key(g, XKB_KEY_Control_L);
    if (!strcmp(name, "shift")) return symbol_key(g, XKB_KEY_Shift_L);
    if (!strcmp(name, "alt")) return symbol_key(g, XKB_KEY_Alt_L);
    if (!strcmp(name, "super")) return symbol_key(g, XKB_KEY_Super_L);
    return 0;
}
static bool chord_add(struct chord *c, unsigned key) {
    if (!key || key > 247) return false;
    for (unsigned i = 0; i < c->n; ++i) if (c->keys[i] == key) return true;
    if (c->n == 16) return false;
    c->keys[c->n++] = key; return true;
}
static bool character(struct guardian *g, uint32_t cp, xkb_keysym_t sym, struct chord *c) {
    unsigned shift = symbol_key(g, XKB_KEY_Shift_L);
    for (unsigned shifted = 0; shifted < 2; ++shifted) {
        struct xkb_state *state = xkb_state_new(g->keymap); if (!state) return false;
        if (shifted) xkb_state_update_key(state, shift + 8, XKB_KEY_DOWN);
        for (unsigned k = 9; k <= 255; ++k) {
            if (sym ? xkb_state_key_get_one_sym(state, k) == sym : xkb_state_key_get_utf32(state, k) == cp) {
                if (shifted && !chord_add(c, shift)) { xkb_state_unref(state); return false; }
                bool ok = chord_add(c, k - 8); xkb_state_unref(state); return ok;
            }
        }
        xkb_state_unref(state);
    }
    return false;
}
static bool named_chord(struct guardian *g, char *name, struct chord *c) {
    char *plus; unsigned seen[4], count = 0;
    while ((plus = strchr(name, '+'))) {
        *plus = 0; unsigned key = modifier(g, name);
        if (!key || count == 4) return false;
        for (unsigned i = 0; i < count; ++i) if (seen[i] == key) return false;
        seen[count++] = key;
        if (!chord_add(c, key)) return false;
        name = plus + 1;
    }
    if (strlen(name) == 1 && (unsigned char)*name >= 32 && (unsigned char)*name <= 126)
        return character(g, (unsigned char)*name, 0, c);
    xkb_keysym_t sym = xkb_keysym_from_name(name, XKB_KEYSYM_NO_FLAGS);
    return sym && character(g, 0, sym, c);
}
static bool chord_plan(struct guardian *g, const struct chord *c, uint64_t at) {
    for (unsigned i = 0; i < c->n; ++i) if (!add(g, KEY, c->keys[i], true, 0, 0, at)) return false;
    for (unsigned i = c->n; i; --i) if (!add(g, KEY, c->keys[i-1], false, 0, 0, at)) return false;
    return true;
}
static int hex(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}
static bool text_plan(struct guardian *g, const char *hextext, bool gates, uint64_t at) {
    size_t length = strlen(hextext); unsigned char bytes[2048];
    if (!length || length % 2 || length > sizeof bytes * 2) return false;
    for (size_t i = 0; i < length / 2; ++i) {
        int a = hex(hextext[2*i]), b = hex(hextext[2*i+1]); if (a < 0 || b < 0) return false;
        bytes[i] = (unsigned char)(a * 16 + b);
    }
    size_t pos = 0; unsigned count = 0;
    while (pos < length / 2) {
        unsigned first = bytes[pos++], cp, extra, min;
        if (first < 128) { cp = first; extra = 0; min = 0; }
        else if (first >= 0xc2 && first <= 0xdf) { cp = first & 31; extra = 1; min = 128; }
        else if (first >= 0xe0 && first <= 0xef) { cp = first & 15; extra = 2; min = 2048; }
        else if (first >= 0xf0 && first <= 0xf4) { cp = first & 7; extra = 3; min = 65536; }
        else return false;
        if (++count > 512 || pos + extra > length / 2) return false;
        for (unsigned j = 0; j < extra; ++j) { unsigned b = bytes[pos++]; if ((b & 0xc0) != 0x80) return false; cp = (cp << 6) | (b & 63); }
        if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) || cp < 32 || (cp >= 127 && cp < 160)) return false;
        struct chord c = {0};
        if (!character(g, cp, 0, &c)) return false;
        if (gates && !add(g, GATE, 0, false, 0, 0, at)) return false;
        if (!chord_plan(g, &c, at)) return false;
    }
    return true;
}
static bool modifier_plan(struct guardian *g, const unsigned *keys, unsigned n, bool down, uint64_t at) {
    for (unsigned i = 0; i < n; ++i) if (!add(g, KEY, keys[down ? i : n-1-i], down, 0, 0, at)) return false;
    return true;
}
static bool parse_modifiers(struct guardian *g, char **rest, unsigned *mods, unsigned *count) {
    uint64_t n; if (!integer(rest, &n, 0, 4)) return false;
    *count = (unsigned)n;
    for (unsigned i = 0; i < *count; ++i) {
        char *name = token(rest); if (!name || !(mods[i] = modifier(g, name))) return false;
        for (unsigned j = 0; j < i; ++j) if (mods[i] == mods[j]) return false;
    }
    return true;
}
static bool plan(struct guardian *g, char *line) {
    char *rest=line,*verb=token(&rest);
    if (!verb || strlen(verb)!=1) return false;
    char kind=*verb; uint64_t b=0,count=1,ms=0,at=0;
    unsigned mods[4],nm=0; struct point p={0};
    g->planned=g->completed=g->index=0;
    if (kind=='Y' || kind=='Z') {
        if (!parse_modifiers(g,&rest,mods,&nm)) return false;
        kind=kind=='Y'?'W':'L';
    }
    if (strchr("MPQDLV",kind)) {
        if (kind!='M' && !integer(&rest,&b,272,279)) return false;
        if ((kind=='D'||kind=='L') && !integer(&rest,&count,2,256)) return false;
        if (kind=='L' && !integer(&rest,&ms,0,1000)) return false;
        if (kind=='V' && (!integer(&rest,&count,1,3)||!parse_modifiers(g,&rest,mods,&nm))) return false;
        if (!point(g,&rest,&p)||!add(g,MOVE,0,false,p.x,p.y,0)) return false;
        if (kind!='M') {
            if (!modifier_plan(g,mods,nm,true,0)||!add(g,BUTTON,(unsigned)b,true,0,0,0)) return false;
            if (kind=='L'||kind=='D') {
                for (uint64_t i=1;i<count;++i) {
                    at=ms*1000*i/(count-1);
                    if (!point(g,&rest,&p)||!add(g,MOVE,0,false,p.x,p.y,at)) return false;
                }
            } else if (kind=='Q'||kind=='V') {
                if (kind=='Q') count=2;
                for (uint64_t i=1;i<count;++i) {
                    if (!add(g,BUTTON,(unsigned)b,false,0,0,at)) return false;
                    at+=80000;
                    if (!add(g,BUTTON,(unsigned)b,true,0,0,at)) return false;
                }
            }
            if (!add(g,BUTTON,(unsigned)b,false,0,0,at)||!modifier_plan(g,mods,nm,false,at)) return false;
        }
    } else if (kind=='W') {
        char *direction=token(&rest); unsigned axis; int sign;
        if (!direction||!integer(&rest,&count,1,20)||!point(g,&rest,&p)) return false;
        if (!strcmp(direction,"up")) { axis=0;sign=-1; }
        else if (!strcmp(direction,"down")) { axis=0;sign=1; }
        else if (!strcmp(direction,"left")) { axis=1;sign=-1; }
        else if (!strcmp(direction,"right")) { axis=1;sign=1; }
        else return false;
        if (!add(g,MOVE,0,false,p.x,p.y,0)||!modifier_plan(g,mods,nm,true,0)) return false;
        for (uint64_t i=0;i<count;++i) { at=i*30000; if (!add(g,SCROLL,axis,false,sign,0,at)) return false; }
        if (!modifier_plan(g,mods,nm,false,at)) return false;
    } else if (kind=='K'||kind=='J') {
        struct chord c={0};
        if (kind=='K') {
            if (!integer(&rest,&count,1,16)) return false;
            for (uint64_t i=0;i<count;++i) {
                uint64_t k; unsigned before=c.n;
                if (!integer(&rest,&k,1,247)||!chord_add(&c,(unsigned)k)||c.n==before) return false;
            }
        } else { char *name=token(&rest); if (!name||strlen(name)>128||!named_chord(g,name,&c)) return false; }
        if (!chord_plan(g,&c,0)) return false;
    } else if (kind=='T') {
        char *text=token(&rest); if (!text||!text_plan(g,text,false,0)) return false;
    } else if (kind=='E') {
        if (!point(g,&rest,&p)) return false;
        char *text=token(&rest); if (!text) return false;
        struct chord select={0}; char name[]="ctrl+a";
        if (!named_chord(g,name,&select)) return false;
        if (!add(g,GATE,0,false,0,0,0)||!add(g,MOVE,0,false,p.x,p.y,0)||!add(g,GATE,0,false,0,0,0)||
            !add(g,BUTTON,272,true,0,0,0)||!add(g,BUTTON,272,false,0,0,0)||!add(g,GATE,0,false,0,0,50000)||!chord_plan(g,&select,50000)) return false;
        if (!strcmp(text,"-")) {
            struct chord back={0};
            if (!character(g,0,XKB_KEY_BackSpace,&back)||!add(g,GATE,0,false,0,0,50000)||!chord_plan(g,&back,50000)) return false;
        } else if (!text_plan(g,text,true,50000)) return false;
        at=50000;
    } else return false;
    return !rest && g->planned && now_us()+at+(uint64_t)g->planned*2000+100000<g->lease;
}
static void key(struct guardian *g,unsigned k,bool down) {
    g->keys[k]=down;
    zwp_virtual_keyboard_v1_key(g->keyboard,(uint32_t)(now_us()/1000),k,down?WL_KEYBOARD_KEY_STATE_PRESSED:WL_KEYBOARD_KEY_STATE_RELEASED);
    xkb_state_update_key(g->state,k+8,down?XKB_KEY_DOWN:XKB_KEY_UP);
    uint32_t depressed=xkb_state_serialize_mods(g->state,XKB_STATE_MODS_DEPRESSED);
    if (depressed || g->modifiers) zwp_virtual_keyboard_v1_modifiers(g->keyboard,depressed,0,0,0);
    g->modifiers=depressed!=0;
}
static void button(struct guardian *g,unsigned b,bool down) {
    g->buttons[b-272]=down;
    zwlr_virtual_pointer_v1_button(g->pointer,(uint32_t)(now_us()/1000),b,down?WL_POINTER_BUTTON_STATE_PRESSED:WL_POINTER_BUTTON_STATE_RELEASED);
    zwlr_virtual_pointer_v1_frame(g->pointer);
}
/* Cleanup never requires live focus/scope authority. */
static bool release_all(struct guardian *g) {
    bool queued=!g->disconnected && g->pointer && g->keyboard;
    if (queued) {
        for (unsigned b=272;b<=279;++b) if (g->buttons[b-272]) button(g,b,false);
        for (unsigned k=247;k;--k) if (g->keys[k]) key(g,k,false);
        if (g->modifiers) zwp_virtual_keyboard_v1_modifiers(g->keyboard,0,0,0,0);
        g->modifiers=false;
        xkb_state_update_mask(g->state,0,0,0,0,0,0);
    }
    bool sync=queued && synchronize(g,100);
    /* Buffered requests alone do not establish transport submission. */
    g->release_sent=queued && !g->disconnected && wl_display_flush(g->display)>=0;
    g->release_submission = !queued ? "not_attempted" : g->release_sent ? "submitted" : "queued_not_submitted";
    if (g->release_sent) receipt(g,"release_sent","explicit-owned-release");
    /* Only a complete refused arm proves this guardian never acquired scope.
     * Ambiguous/malformed/lost arm replies still take the normal bounded
     * cleanup path because native ownership may have been established. */
    if (g->arm_definitively_refused) {
        g->release_acknowledged = false;
        g->release_ack = "not_attempted";
        return false;
    }
    struct scope_reply r = {0}; char id[49], ticks[32], request[192];
    bool tagged = g->release_status_v1 && own_start_ticks(ticks) && command_id(id);
    if (tagged) snprintf(request, sizeof request, "{\"op\":\"release_all\",\"command_id\":\"%s\",\"guardian_start_ticks\":\"%s\"}\n", id, ticks);
    else strcpy(request, "{\"op\":\"release_all\"}\n");
    bool ack=scope_call(g,request,&r);
    /* A complete release write with a lost ACK gets exactly one readonly lookup.
     * It never retries release or creates an input-capable replacement lease. */
    const char *initial_scope_outcome = g->scope_outcome;
    if (!ack && tagged && initial_scope_outcome && !strcmp(initial_scope_outcome, "transport_lost")) {
        if (connect_scope_peer(g, false)) {
            snprintf(request, sizeof request, "{\"op\":\"release_status\",\"command_id\":\"%s\",\"guardian_start_ticks\":\"%s\"}\n", id, ticks);
            ack = scope_call(g, request, &r);
        }
        g->scope_outcome = initial_scope_outcome;
    }
    g->release_acknowledged=sync && ack && r.release_acknowledged && r.have_armed && !r.armed && r.have_keys && !r.keys && r.have_buttons && !r.buttons;
    /* A cleanup ACK must carry the same rejection counter observed while the
     * action was armed. Missing evidence is an invalid ACK; a changed count
     * identifies a rejected input guard. Neither weakens cleanup proof. */
    if (ack && !r.have_rejected) {
        g->release_acknowledged = false;
        g->scope_operation = "release_all";
        g->scope_error = "scope-ack-invalid";
        fail(g,"scope-ack-invalid");
    } else if (ack && r.rejected != g->rejected) {
        /* The cleanup fields above may still prove no owned input remains.
         * This operation label attributes only where the changed action
         * rejection count was detected; it does not erase that cleanup ACK. */
        g->scope_operation = "release_all";
        g->scope_error = "scope-rejected-input";
        fail(g,"scope-rejected-input");
    }
    g->release_ack = g->release_acknowledged ? "acknowledged" :
        (!ack && g->scope_outcome && !strcmp(g->scope_outcome, "refused")) ? "negative" :
        (!ack && g->scope_outcome && !strcmp(g->scope_outcome, "transport_lost")) ? "transport_lost" : "invalid_or_unconfirmed";
    return g->release_acknowledged;
}
static void action_receipt(struct guardian *g,const char *event,const char *reason) {
    char line[1024];
    snprintf(line,sizeof line,"{\"event\":\"%s\",\"reason\":\"%s\",\"input_was_sent\":%s,\"release_sent\":%s,\"release_acknowledged\":%s,\"receiver_proven\":false,\"diagnostics\":{\"phase\":\"%s\",\"steps_planned\":%u,\"steps_completed\":%u,\"release\":\"%s\",\"reason\":\"%s\"},\"native_failure\":{\"command\":\"%s\",\"scope_operation\":\"%s\",\"scope_error\":\"%s\",\"input_loss_v1\":{\"terminal_cause\":\"%s\",\"scope_outcome\":\"%s\",\"events_queued\":%u,\"events_submitted\":%u,\"release_submission\":\"%s\",\"release_ack\":\"%s\",\"resource_closure\":\"%s\"}}}\n",event,reason,g->input_sent?"true":"false",g->release_sent?"true":"false",g->release_acknowledged?"true":"false",!strcmp(event,"action_done")?"complete":"release",g->planned,g->completed,g->release_acknowledged?"confirmed":"unknown",reason,g->command_name?g->command_name:"none",g->scope_operation?g->scope_operation:"none",g->scope_error?g->scope_error:"none",g->terminal_cause?g->terminal_cause:"orderly",g->scope_outcome?g->scope_outcome:"not_attempted",g->input_queued,g->input_submitted,g->release_submission?g->release_submission:"not_attempted",g->release_ack?g->release_ack:"not_attempted",g->resource_closure?g->resource_closure:"not_started");
    if (!emit(line)) fail(g,"transport-error");
}
static void step(struct guardian *g) {
    /* Queue one already-due group without an artificial poll/flush between
     * MOVE, DOWN and UP. Each event retains its own compositor scope check and
     * pointer frame. Future stroke timestamps and pixel permits still yield. */
    uint64_t due = now_us(); unsigned queued = 0;
    while (g->action) {
    if (g->index==g->planned) {
        if (!release_all(g)) { fail(g,"input-path-lost"); return; }
        if (g->reason) return;
        action_receipt(g,"action_done","completed");
        g->action=g->begun=false; g->lease=g->scope_deadline=0; g->idle=now_us()+2000000; return;
    }
    if (!alive_scope(g) || queued == 32) return;
    struct event *e=&g->events[g->index];
    if (due<g->start+e->at) return;
    if (e->kind==GATE) {
        if (!g->gate_waiting && !g->gate_allowed) {
            if (++g->gate_serial>1000000) { fail(g,"invalid-command"); return; }
            char line[128]; snprintf(line,sizeof line,"{\"event\":\"pixel_gate\",\"step\":%u}\n",g->gate_serial);
            if (!emit(line)) { fail(g,"transport-error"); return; } g->gate_waiting=true;
        }
        if (!g->gate_allowed) return;
        g->gate_allowed=false; ++g->index; ++g->completed; return;
    }
    g->input_sent=true;
    if (e->kind==KEY) key(g,e->code,e->down);
    else if (e->kind==BUTTON) button(g,e->code,e->down);
    else if (e->kind==MOVE) {
        zwlr_virtual_pointer_v1_motion_absolute(g->pointer,(uint32_t)(now_us()/1000),(uint32_t)e->x,(uint32_t)e->y,g->width,g->height);
        zwlr_virtual_pointer_v1_frame(g->pointer);
    } else if (e->kind==SCROLL) {
        zwlr_virtual_pointer_v1_axis_source(g->pointer,WL_POINTER_AXIS_SOURCE_WHEEL);
        zwlr_virtual_pointer_v1_axis_discrete(g->pointer,(uint32_t)(now_us()/1000),e->code,wl_fixed_from_double(e->x*15),(int32_t)e->x);
        zwlr_virtual_pointer_v1_frame(g->pointer);
    }
    ++g->index; ++g->completed; ++queued;
    ++g->input_queued;
    /* Submission means accepted by the Wayland transport, not delivery. */
    if (wl_display_flush(g->display) >= 0) ++g->input_submitted;
    }
}
static bool command(struct guardian *g,char *line) {
    if (!strcmp(line,"C")||!strcmp(line,"R")) { fail(g,"cancelled");return true; }
    if (!alive_scope(g)) return false;
    if (!strcmp(line,"N")) { if (!g->begun) g->idle=now_us()+2000000;receipt(g,"idle","heartbeat");return true; }
    g->command_name = line[0] == 'B' ? "begin" : line[0] == 'O' ? "renew" :
        line[0] == 'F' ? "bind" : line[0] == 'S' ? "select" :
        line[0] == 'G' ? "pixel-permit" : "action";
    if (!strncmp(line,"F ",2)) {
        const char *value=line+2;size_t n=strlen(value);
        if (n<32||n>128) return false;
        for (size_t i=0;i<n;++i) if (hex(value[i])<0) return false;
        strcpy(g->scope_token,value);return true;
    }
    if (!strncmp(line,"O ",2)) {
        char *rest=line+2;uint64_t deadline;
        if (!integer(&rest,&deadline,1,UINT64_MAX)||rest) return false;
        if (!g->begun) { g->scope_token[0]=0;return true; }
        if (deadline<=g->scope_deadline||!scope_bind(g,true,deadline)) return false;
        g->scope_deadline=deadline;return true;
    }
    if (!strncmp(line,"B ",2)) {
        char *rest=line+2;uint64_t ms,deadline;
        if (g->begun||!integer(&rest,&ms,1,2000)||!integer(&rest,&deadline,1,UINT64_MAX)||rest) return false;
        /* Failed new begins cannot inherit a prior action's cleanup truth. */
        g->input_sent=g->release_sent=g->release_acknowledged=false;
        g->release_submission=g->release_ack="not_attempted";
        g->planned=g->completed=g->input_queued=g->input_submitted=0;
        uint64_t start=now_us();
        if (!scope_bind(g,false,deadline)) return false;
        g->lease=start+ms*1000;g->scope_deadline=deadline;g->begun=true;
        receipt(g,"begun","nonrenewable-lease");return true;
    }
    if (!strncmp(line,"S ",2)) {
        if (g->begun||strcmp(g->mapping,line+2)) return false;
        ready_receipt(g,"selected");return true;
    }
    if (g->action) {
        if (strncmp(line,"G ",2)) return false;
        char *rest=line+2;uint64_t serial;
        if (!g->gate_waiting||g->gate_allowed||!integer(&rest,&serial,1,1000000)||rest||serial!=g->gate_serial) return false;
        g->gate_waiting=false;g->gate_allowed=true;return true;
    }
    if (!g->begun) return false;
    if (!plan(g,line)) {
        if (!release_all(g)) { fail(g,"input-path-lost");return false; }
        g->begun=false;g->idle=now_us()+2000000;
        action_receipt(g,"action_rejected","invalid-command");return true;
    }
    g->action=true;g->gate_waiting=g->gate_allowed=false;g->start=now_us();return true;
}
static bool mapping_valid(const char *p) {
    size_t n=strlen(p);if (!n||n>128) return false;
    for (size_t i=0;i<n;++i) if ((unsigned char)p[i]<33||(unsigned char)p[i]>126) return false;
    return true;
}
static bool decimal(const char *s,uint64_t *out,uint64_t lo,uint64_t hi) {
    if (!s||strlen(s)>20) return false;
    char text[21];strcpy(text,s);char *rest=text;
    return integer(&rest,out,lo,hi)&&!rest;
}
int main(int argc,char **argv) {
    uint64_t pid,uid,width,height;
    if (argc!=8||!decimal(argv[2],&pid,1,INT32_MAX)||!decimal(argv[3],&uid,0,UINT32_MAX)||uid!=getuid()||geteuid()!=getuid()||!mapping_valid(argv[4])||strlen(argv[5]) >= sizeof(((struct guardian *)0)->scope_path)||!decimal(argv[6],&width,1,32768)||!decimal(argv[7],&height,1,32768)) return 64;
    struct guardian *g=calloc(1,sizeof *g);if (!g) return 70;
    g->scope_fd=g->parent_fd=-1;g->parent_pid=getppid();g->compositor_pid=(pid_t)pid;g->uid=(uid_t)uid;
    g->width=(unsigned)width;g->height=(unsigned)height;strcpy(g->mapping,argv[4]);strcpy(g->scope_path,argv[5]);
    struct sigaction sa={.sa_handler=on_signal};sigemptyset(&sa.sa_mask);
    sigaction(SIGTERM,&sa,NULL);sigaction(SIGINT,&sa,NULL);sigaction(SIGHUP,&sa,NULL);signal(SIGPIPE,SIG_IGN);
    if (prctl(PR_SET_PDEATHSIG,SIGTERM)||getppid()!=g->parent_pid) { free(g);return 65; }
    g->parent_fd=(int)syscall(SYS_pidfd_open,g->parent_pid,0);
    if (g->parent_fd<0) { free(g);return 65; }
    for (int f=0;f<=1;++f) { int flags=fcntl(f,F_GETFL);if (flags<0||fcntl(f,F_SETFL,flags|O_NONBLOCK)) { close(g->parent_fd);free(g);return 65; } }
    if (!connect_scope_peer(g, true)) { fail(g,"input-path-lost");goto cleanup; }
    struct scope_reply registration;
    if (!scope_call(g,"{\"op\":\"status\"}\n",&registration)) { fail(g,"input-path-lost");goto cleanup; }
    g->rejected=registration.rejected; g->release_status_v1=registration.release_status_v1;
    int fd=connect_peer(argv[1],(pid_t)pid,(uid_t)uid,false);
    if (fd<0) { fail(g,"input-path-lost");goto cleanup; }
    g->display=wl_display_connect_to_fd(fd);
    if (!g->display) { close(fd);fail(g,"input-path-lost");goto cleanup; }
    g->registry=wl_display_get_registry(g->display);wl_registry_add_listener(g->registry,&registry_listener,g);
    if (!synchronize(g,1000)||!synchronize(g,1000)||g->seats!=1||!g->pm||!g->km||g->changed) { fail(g,"mapping-changed");goto cleanup; }
    for (unsigned i=0;i<g->noutputs;++i) if (!strcmp(g->outputs[i].name,g->mapping)) {
        if (g->output) { fail(g,"mapping-changed");goto cleanup; }g->output=&g->outputs[i];
    }
    if (!g->output||!g->output->done||g->output->width<=0||g->output->height<=0) { fail(g,"mapping-changed");goto cleanup; }
    g->pointer=zwlr_virtual_pointer_manager_v1_create_virtual_pointer_with_output(g->pm,g->seat,g->output->object);
    g->keyboard=zwp_virtual_keyboard_manager_v1_create_virtual_keyboard(g->km,g->seat);
    if (!g->pointer||!g->keyboard||!setup_keymap(g)||!synchronize(g,1000)) { fail(g,"input-path-lost");goto cleanup; }
    g->ready=true;g->idle=now_us()+2000000;ready_receipt(g,"ready");
    char line[MAX_LINE];size_t used=0;
    while (!g->reason) {
        if (pump(g,0)<0) { fail(g,"input-path-lost");break; }
        if (g->changed) { fail(g,"mapping-changed");break; }
        if (!alive_scope(g)) break;
        if (!g->begun&&now_us()>=g->idle) { fail(g,"controller-timeout");break; }
        struct pollfd fds[3]={{0,POLLIN,0},{g->parent_fd,POLLIN,0},{g->scope_fd,POLLIN,0}};
        int result=poll(fds,3,1);
        if (result<0&&errno!=EINTR) { fail(g,"poll-error");break; }
        if (fds[1].revents) { fail(g,"controller-eof");break; }
        if (fds[2].revents) { fail(g,"input-path-lost");break; }
        if (fds[0].revents&(POLLHUP|POLLERR|POLLNVAL)) { fail(g,"controller-eof");break; }
        if (fds[0].revents&POLLIN) {
            char bytes[1024];ssize_t n=read(0,bytes,sizeof bytes);
            if (!n) { fail(g,"controller-eof");break; }
            if (n<0&&errno!=EAGAIN&&errno!=EINTR) { fail(g,"transport-error");break; }
            for (ssize_t i=0;i<n&&!g->reason;++i) {
                unsigned char c=(unsigned char)bytes[i];
                if (c=='\n') { line[used]=0;if (!command(g,line)) fail(g,"invalid-command");used=0; }
                else if (c<32||c>126||used==sizeof line-1) fail(g,"invalid-command");
                else line[used++]=(char)c;
            }
        }
        step(g);
    }
cleanup:
    if (g->ready) (void)release_all(g);
    int status=g->ready&&g->release_acknowledged?0:1;
    if (g->pointer) zwlr_virtual_pointer_v1_destroy(g->pointer);
    if (g->keyboard) zwp_virtual_keyboard_v1_destroy(g->keyboard);
    if (g->display) { (void)synchronize(g,50);wl_display_disconnect(g->display); g->resource_closure="display_disconnected"; }
    if (g->scope_fd>=0) close(g->scope_fd);
    if (g->parent_fd>=0) close(g->parent_fd);
    if (g->state) xkb_state_unref(g->state);
    if (g->keymap) xkb_keymap_unref(g->keymap);
    if (g->xctx) xkb_context_unref(g->xctx);
    g->resource_closure="complete";
    /* The terminal receipt is intentionally emitted only after locally-owned
     * Wayland and scope resources have been closed. This proves local closure,
     * not compositor receipt of a previous release request. */
    action_receipt(g,"closed",g->reason?g->reason:"orderly");
    free(g);return status;
}
