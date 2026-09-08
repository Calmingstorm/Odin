/* Sole EI owner, one bounded gesture. Not a consent bypass.
 * argv: granted EI fd, expected portal mapping id (trusted adapter only).
 * H key button x y lease_ms\n; R\n orderly; C\n cancel; EOF fences and releases.
 * No renewal, second hold, global release or replacement-device fallback.
 * release_sent is not toolkit proof. Guardian/EIS/portal loss on Mutter46.2
 * is unsupported. See FEASIBILITY-WAYLAND-R5.md before production reuse.
 */
#include <libei.h>
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
#include <unistd.h>

static volatile sig_atomic_t cancelled;
static void on_signal(int sig) { (void)sig; cancelled = 1; }
static void receipt(const char *event, const char *reason, uint64_t now) {
  char line[256];
  int n = snprintf(line, sizeof line,
    "{\"event\":\"%s\",\"reason\":\"%s\",\"monotonic_us\":%llu}\n",
    event, reason, (unsigned long long)now);
  /* A blocked or lost observer cannot block the independent lease. */
  if (n > 0 && n < (int)sizeof line) (void)write(STDOUT_FILENO, line, (size_t)n);
}

int main(int argc, char **argv) {
  if (argc != 3 || !argv[2][0]) return 64;
  char *end = NULL;
  long supplied_fd = strtol(argv[1], &end, 10);
  if (!end || *end || supplied_fd < 3 || supplied_fd > 1048576) return 64;
  signal(SIGPIPE, SIG_IGN);
  signal(SIGTERM, on_signal);
  signal(SIGINT, on_signal);
  if (fcntl(STDIN_FILENO, F_SETFL, O_NONBLOCK) < 0 ||
      fcntl(STDOUT_FILENO, F_SETFL, O_NONBLOCK) < 0) return 1;
  struct ei *ctx = ei_new_sender(NULL);
  if (!ctx) return 1;
  ei_configure_name(ctx, "odin-bounded-owned-input");
  if (ei_setup_backend_fd(ctx, (int)supplied_fd)) { ei_unref(ctx); return 1; }
  struct ei_device *pointer = NULL, *keyboard = NULL;
  bool ready = false, held = false, fenced = false, disconnected = false;
  unsigned key = 0, button = 0;
  uint64_t deadline = ei_now(ctx) + 10000000, lease_deadline = 0, finish_at = 0;
  const char *reason = NULL;
  int status = 0;
  char input[256]; size_t used = 0;
  for (;;) {
    uint64_t now = ei_now(ctx);
    if (!fenced) {
      if (cancelled) reason = "signal-cancel";
      else if (lease_deadline && now >= lease_deadline) reason = "lease-expired";
      else if (now >= deadline) { reason = "lifetime-expired"; status = 2; }
    }
    if (!fenced && reason) {
      fenced = true;
      receipt("release_begin", reason, now);
      if (held && !disconnected) {
        ei_device_keyboard_key(keyboard, key, false);
        ei_device_frame(keyboard, ei_now(ctx));
        ei_device_button_button(pointer, button, false);
        ei_device_frame(pointer, ei_now(ctx));
        held = false;
        receipt("release_sent", reason, ei_now(ctx));
      }
      /* Release before stop_emulating/device destruction. Dispatch, don't sleep
       * through server revocation. No commands after this fence. */
      finish_at = now + 100000;
    }
    if (fenced && now >= finish_at) break;
    struct pollfd fds[] = {{ei_get_fd(ctx), POLLIN, 0},
                           {fenced ? -1 : STDIN_FILENO, POLLIN, 0}};
    int rc = poll(fds, 2, 5);
    if (rc < 0 && errno != EINTR) { reason = "poll-error"; status = 2; }
    ei_dispatch(ctx);
    struct ei_event *event;
    while ((event = ei_get_event(ctx))) {
      enum ei_event_type type = ei_event_get_type(event);
      struct ei_device *dev = ei_event_get_device(event);
      if (type == EI_EVENT_SEAT_ADDED)
        ei_seat_bind_capabilities(ei_event_get_seat(event),
          EI_DEVICE_CAP_POINTER_ABSOLUTE, EI_DEVICE_CAP_BUTTON,
          EI_DEVICE_CAP_KEYBOARD, NULL);
      if (type == EI_EVENT_DEVICE_RESUMED && !ready && !fenced) {
        if (ei_device_has_capability(dev, EI_DEVICE_CAP_POINTER_ABSOLUTE) &&
            ei_device_has_capability(dev, EI_DEVICE_CAP_BUTTON) && !pointer)
          pointer = ei_device_ref(dev);
        if (ei_device_has_capability(dev, EI_DEVICE_CAP_KEYBOARD) && !keyboard)
          keyboard = ei_device_ref(dev);
      }
      if (type == EI_EVENT_DISCONNECT ||
          ((type == EI_EVENT_DEVICE_REMOVED || type == EI_EVENT_DEVICE_PAUSED) &&
           (dev == pointer || dev == keyboard))) {
        disconnected = true; reason = "input-path-lost"; status = 3;
        receipt("unsupported_release", reason, ei_now(ctx));
      }
      ei_event_unref(event);
    }
    if (!ready && pointer && keyboard && !reason) {
      ready = true;
      receipt("ready", "single-ei-owner", ei_now(ctx));
    }
    if (!fenced && !reason && fds[1].revents) {
      char c;
      /* Bound transport work per tick so a partial-command flood cannot starve
       * a lease or cancellation. Oversize frames still fail closed. */
      for (unsigned budget = 0; budget < sizeof input; budget++) {
        ssize_t n = read(STDIN_FILENO, &c, 1);
        if (n == 0) { reason = "controller-eof"; break; }
        if (n < 0) {
          if (errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR) {
            reason = "transport-error"; status = 2;
          }
          break;
        }
        if (c != '\n') {
          if (used == sizeof input - 1 || c == '\0') {
            reason = "invalid-command"; status = 2; break;
          }
          input[used++] = c; continue;
        }
        input[used] = '\0'; used = 0;
#ifdef WAYLAND_FIXTURE_FAULTS
        /* Separate lab binary only. A nonfatal exact-process loss, not a
         * production command and not synthetic release or destruction of apps. */
        if (!strcmp(input, "F")) {
          receipt("guardian_loss", "last-ei-fd-eof-no-release", ei_now(ctx));
          _exit(0);
        }
#endif
        if (!strcmp(input, "R")) { reason = "orderly"; break; }
        if (!strcmp(input, "C")) { reason = "cancelled"; break; }
        double x, y; unsigned ms, next_key, next_button; int count = 0;
        if (!ready || held ||
            sscanf(input, "H %u %u %lf %lf %u%n", &next_key, &next_button, &x, &y, &ms, &count) != 5 ||
            input[count] || next_key < 1 || next_key > 247 || next_button < 272 || next_button > 279 ||
            ms < 1 || ms > 2000 || !isfinite(x) || !isfinite(y)) {
          reason = "invalid-command"; status = 2; break;
        }
        struct ei_region *region = ei_device_get_region(pointer, 0);
        if (!region || ei_device_get_region(pointer, 1) ||
            !ei_region_get_mapping_id(region) ||
            strcmp(ei_region_get_mapping_id(region), argv[2]) ||
            x < ei_region_get_x(region) || y < ei_region_get_y(region) ||
            x >= ei_region_get_x(region) + ei_region_get_width(region) ||
            y >= ei_region_get_y(region) + ei_region_get_height(region)) {
          reason = "unmapped-coordinate"; status = 2; break;
        }
        /* Conservative owned ledger BEFORE dispatch, never the human's state. */
        key = next_key; button = next_button;
        held = true; lease_deadline = ei_now(ctx) + (uint64_t)ms * 1000;
        ei_device_start_emulating(pointer, 1);
        ei_device_start_emulating(keyboard, 2);
        ei_device_pointer_motion_absolute(pointer, x, y);
        ei_device_frame(pointer, ei_now(ctx));
        ei_device_button_button(pointer, button, true);
        ei_device_frame(pointer, ei_now(ctx));
        ei_device_keyboard_key(keyboard, key, true);
        ei_device_frame(keyboard, ei_now(ctx));
        receipt("held", "owned-ledger-before-dispatch", ei_now(ctx));
      }
    }
  }
  if (pointer && !disconnected) ei_device_stop_emulating(pointer);
  if (keyboard && !disconnected) ei_device_stop_emulating(keyboard);
  if (pointer) ei_device_unref(pointer);
  if (keyboard) ei_device_unref(keyboard);
  receipt("closed", reason ? reason : "unknown", ei_now(ctx));
  ei_unref(ctx);
  return status;
}
