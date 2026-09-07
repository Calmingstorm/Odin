/* Disposable genuine libei sender handshake; never a permission bypass. */
#include <libei.h>
#include <poll.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <string.h>
#include <unistd.h>
static void frame(struct ei *ctx, struct ei_device *dev) {
  ei_device_frame(dev, ei_now(ctx));
}
int main(int argc, char **argv) {
  if (argc != 2 && argc != 3) return 64;
  const char *mode = argc == 3 ? argv[2] : "legacy";
  const int lifecycle = strcmp(mode, "legacy") != 0;
  if (lifecycle && strcmp(mode, "orderly") && strcmp(mode, "eof")) return 64;
  setbuf(stdout, NULL);
  struct ei *ctx = ei_new_sender(NULL);
  ei_configure_name(ctx, "isolated-feasibility");
  if (ei_setup_backend_fd(ctx, atoi(argv[1]))) return 1;
  time_t end = time(NULL) + 8;
  struct ei_device *pointer = NULL, *keyboard = NULL;
  while (time(NULL) < end) {
    struct pollfd fd = {ei_get_fd(ctx), POLLIN, 0};
    poll(&fd, 1, 100);
    ei_dispatch(ctx);
    struct ei_event *event;
    while ((event = ei_get_event(ctx))) {
      enum ei_event_type type = ei_event_get_type(event);
      printf("event=%s\n", ei_event_type_to_string(type));
      if (type == EI_EVENT_SEAT_ADDED) {
        struct ei_seat *seat = ei_event_get_seat(event);
        printf("seat=%s\n", ei_seat_get_name(seat));
        ei_seat_bind_capabilities(seat, EI_DEVICE_CAP_POINTER,
          EI_DEVICE_CAP_POINTER_ABSOLUTE, EI_DEVICE_CAP_BUTTON,
          EI_DEVICE_CAP_SCROLL, EI_DEVICE_CAP_KEYBOARD, NULL);
      }
      if (type == EI_EVENT_DEVICE_ADDED) {
        struct ei_device *dev = ei_event_get_device(event);
        printf("device=%s\n", ei_device_get_name(dev));
        for (size_t i=0;;i++) {
          struct ei_region *r = ei_device_get_region(dev,i);
          if (!r) break;
          printf("region=%d,%d %ux%u scale=%f mapping=%s\n",
            ei_region_get_x(r),ei_region_get_y(r),ei_region_get_width(r),
            ei_region_get_height(r),ei_region_get_physical_scale(r),
            ei_region_get_mapping_id(r));
        }
      }
      if (type == EI_EVENT_DEVICE_RESUMED) {
        struct ei_device *dev = ei_event_get_device(event);
        if (lifecycle) {
          if (ei_device_has_capability(dev, EI_DEVICE_CAP_POINTER_ABSOLUTE) &&
              ei_device_has_capability(dev, EI_DEVICE_CAP_BUTTON)) pointer = dev;
          if (ei_device_has_capability(dev, EI_DEVICE_CAP_KEYBOARD)) keyboard = dev;
        } else {
        if (ei_device_has_capability(dev, EI_DEVICE_CAP_POINTER_ABSOLUTE)) {
          ei_device_start_emulating(dev, 1);
          ei_device_pointer_motion_absolute(dev, 250, 250);
          ei_device_frame(dev, ei_now(ctx));
          if (ei_device_has_capability(dev, EI_DEVICE_CAP_BUTTON)) {
            ei_device_button_button(dev, 0x110, true);
            ei_device_frame(dev, ei_now(ctx));
            ei_device_button_button(dev, 0x110, false);
            ei_device_frame(dev, ei_now(ctx));
          }
          ei_device_stop_emulating(dev);
          printf("sent bounded absolute motion/click at 250,250; NOT independence proof\n");
        }
        }
      }
      ei_event_unref(event);
    }
    if (lifecycle && pointer && keyboard) {
      ei_device_start_emulating(pointer, 1);
      ei_device_start_emulating(keyboard, 2);
      ei_device_pointer_motion_absolute(pointer, 250, 250);
      frame(ctx, pointer);
      ei_device_button_button(pointer, 0x110, true);
      frame(ctx, pointer);
      ei_device_keyboard_key(keyboard, 42, true);
      frame(ctx, keyboard);
      printf("HELD mode=%s monotonic_us=%lu key=42 button=272\n", mode, (unsigned long)ei_now(ctx));
      FILE *held = fopen("/tmp/lifecycle-held", "w");
      if (!held) return 3;
      fprintf(held, "%lu\n", (unsigned long)ei_now(ctx));
      fclose(held);
      /* No detach trial before independent application delivery is observed. */
      int verified = 0;
      for (int i = 0; i < 100; i++) {
        if (access("/tmp/lifecycle-release-go", F_OK) == 0) { verified = 1; break; }
        usleep(50000);
      }
      if (!verified) {
        /* Safety cleanup on failed telemetry is not an EOF trial or a pass. */
        ei_device_keyboard_key(keyboard, 42, false);
        frame(ctx, keyboard);
        ei_device_button_button(pointer, 0x110, false);
        frame(ctx, pointer);
        usleep(100000);
        fprintf(stderr, "DELIVERY_NOT_VERIFIED; cleanup only\n");
        ei_unref(ctx);
        return 3;
      }
      if (!strcmp(mode, "orderly")) {
        printf("ORDERLY_RELEASE_BEGIN monotonic_us=%lu\n", (unsigned long)ei_now(ctx));
        ei_device_keyboard_key(keyboard, 42, false);
        frame(ctx, keyboard);
        ei_device_button_button(pointer, 0x110, false);
        frame(ctx, pointer);
        ei_device_stop_emulating(keyboard);
        ei_device_stop_emulating(pointer);
        usleep(100000);
        printf("ORDERLY_RELEASE_SENT monotonic_us=%lu\n", (unsigned long)ei_now(ctx));
        ei_unref(ctx);
        return 0;
      }
      printf("CLIENT_EOF_WITH_HELD_INPUT monotonic_us=%lu\n", (unsigned long)ei_now(ctx));
      /* Nonfatal sender process exit only; kernel closes its last EIS FD. */
      _exit(0);
    }
  }
  ei_unref(ctx);
  return lifecycle ? 2 : 0;
}
