/* Disposable genuine libei sender handshake; never a permission bypass. */
#include <libei.h>
#include <poll.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
int main(int argc, char **argv) {
  if (argc != 2) return 64;
  setbuf(stdout, NULL);
  struct ei *ctx = ei_new_sender(NULL);
  ei_configure_name(ctx, "isolated-feasibility");
  if (ei_setup_backend_fd(ctx, atoi(argv[1]))) return 1;
  time_t end = time(NULL) + 8;
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
      ei_event_unref(event);
    }
  }
  ei_unref(ctx);
  return 0;
}
