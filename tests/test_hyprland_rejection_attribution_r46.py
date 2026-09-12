"""Compile the shipping cleanup-attribution branch without a compositor.

The fixture replaces only Wayland and AF_UNIX effects. It exercises the real
``release_all``, ``fail``, and terminal-cause mapper from guardian.c.
"""

import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/hyprland-input/guardian.c"


def function(source, signature):
    start = source.index(signature)
    opening = source.index("{", start)
    depth = 1
    end = opening + 1
    while depth:
        depth += (source[end] == "{") - (source[end] == "}")
        end += 1
    return source[start:end]


@pytest.fixture(scope="module")
def attribution_binary(tmp_path_factory):
    source = SOURCE.read_text()
    harness = r'''
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

struct guardian {
    void *display, *pointer, *keyboard, *state;
    bool keys[248], buttons[8], modifiers;
    bool disconnected, release_sent, release_acknowledged, release_status_v1;
    const char *terminal_cause, *scope_outcome, *release_submission, *release_ack;
    const char *reason, *scope_error;
    uint64_t rejected;
};
struct scope_reply {
    bool release_acknowledged, have_armed, armed, have_keys, have_buttons, have_rejected;
    uint64_t keys, buttons, rejected;
};
static int counter_mode;
static void button(struct guardian *g, unsigned b, bool down) { g->buttons[b - 272] = down; }
static void key(struct guardian *g, unsigned k, bool down) { g->keys[k] = down; }
static void xkb_state_update_mask(void *state, int a, int b, int c, int d, int e, int f) {
    (void)state; (void)a; (void)b; (void)c; (void)d; (void)e; (void)f;
}
static bool synchronize(struct guardian *g, unsigned timeout) {
    (void)g; assert(timeout == 100); return true;
}
static int wl_display_flush(void *display) { (void)display; return 0; }
static void receipt(struct guardian *g, const char *event, const char *reason) {
    (void)g; (void)event; (void)reason;
}
static void zwp_virtual_keyboard_v1_modifiers(void *keyboard, int a, int b, int c, int d) {
    (void)keyboard; (void)a; (void)b; (void)c; (void)d;
}
static bool own_start_ticks(char out[32]) { (void)out; return false; }
static bool command_id(char out[49]) { (void)out; return false; }
static bool connect_scope_peer(struct guardian *g, bool initial) {
    (void)g; (void)initial; return false;
}
static bool scope_call(struct guardian *g, const char *request, struct scope_reply *r) {
    (void)g; assert(!strcmp(request, "{\"op\":\"release_all\"}\n"));
    *r = (struct scope_reply){
        .release_acknowledged = true, .have_armed = true, .have_keys = true,
        .have_buttons = true, .have_rejected = counter_mode != 1 && counter_mode != 4,
        .rejected = counter_mode == 2 ? 8 : 7,
    };
    return true;
}
'''
    harness += function(source, "static const char *cause_for_reason(")
    harness += function(source, "static void fail(")
    harness += function(source, "static bool release_all(")
    harness += r'''
int main(int argc, char **argv) {
    assert(argc == 2); counter_mode = atoi(argv[1]);
    struct guardian g = {
        .display = (void *)1, .pointer = (void *)1, .keyboard = (void *)1,
        .rejected = 7,
    };
    if (counter_mode == 3) fail(&g, "scope-evidence-expired");
    if (counter_mode == 4) fail(&g, "controller-eof");
    bool released = release_all(&g);
    printf("%d %s %s %s\n", released, g.reason ? g.reason : "none",
           g.terminal_cause ? g.terminal_cause : "none",
           g.scope_error ? g.scope_error : "none");
    return 0;
}
'''
    path = tmp_path_factory.mktemp("r46-rejection-attribution")
    c_file, binary = path / "attribution.c", path / "attribution"
    c_file.write_text(harness)
    subprocess.run(
        ["cc", "-std=c11", "-Wall", "-Wextra", "-Werror", str(c_file), "-o", str(binary)],
        check=True, capture_output=True, text=True, timeout=30,
    )
    return binary


@pytest.mark.parametrize("mode,expected", [
    # Matching count retains valid cleanup acknowledgement and no failure.
    (0, "1 none none none"),
    # Missing evidence is an invalid ACK, not a scope deadline.
    (1, "1 scope-ack-invalid other scope-ack-invalid"),
    # Changed evidence identifies a rejected guard and maps to scope refusal.
    (2, "1 scope-rejected-input scope_refused scope-rejected-input"),
    # A true pre-existing deadline remains a timeout after matching cleanup.
    (3, "1 scope-evidence-expired scope_timeout none"),
    # Cleanup attribution cannot replace an earlier terminal cause.
    (4, "1 controller-eof controller_eof scope-ack-invalid"),
])
def test_extracted_release_counter_attribution(attribution_binary, mode, expected):
    result = subprocess.run(
        [str(attribution_binary), str(mode)], check=True, capture_output=True,
        text=True, timeout=5, env={k: v for k, v in os.environ.items()
                                    if k not in {"DISPLAY", "WAYLAND_DISPLAY"}},
    )
    assert result.stdout.strip() == expected
