"""Read-only RandR event epochs and DPMS status for an explicit X connection.

The owner must keep this connection alive for the attachment lifetime. A fresh
connection cannot certify that no transient topology changes happened earlier.
No wake, mode-setting, input or display discovery is performed here.
"""
from __future__ import annotations


class TopologyUnavailable(ValueError):  # noqa: N818
    pass


class RandRRevision:
    def __init__(self, display, root):
        from Xlib.ext import randr

        self.display = display
        self.revision = 1
        extension = display.query_extension("RANDR")
        if not extension or not extension.present:
            raise TopologyUnavailable("randr_events_unavailable")
        self.event_types = {extension.first_event, extension.first_event + 1}
        root.xrandr_select_input(
            randr.RRScreenChangeNotifyMask | randr.RRCrtcChangeNotifyMask
            | randr.RROutputChangeNotifyMask | randr.RROutputPropertyNotifyMask)
        display.sync()
        self.drain()

    def drain(self):
        # A round trip puts all preceding server events in the local queue before
        # checking it. Count events, not snapshot differences: A -> B -> A is stale.
        self.display.sync()
        while self.display.pending_events():
            event = self.display.next_event()
            if (event.type & 0x7f) in self.event_types:
                self.revision += 1
        return self.revision


def display_power(display):
    """DPMS-disabled/unsupported displays are capturable; query failures are not.

    python-xlib uses the same DPMSInfo Xext wire request without a second native
    connection. Never automatically wake a user's screen.
    """
    try:
        if not display.has_extension("DPMS"):
            return "unsupported"
        if not display.dpms_capable().capable:
            return "unsupported"
        info = display.dpms_info()
        if not info.state:
            return "disabled"
        if info.power_level not in (0, 1, 2, 3):
            raise ValueError("unknown DPMS level")
        return "on" if info.power_level == 0 else "display_asleep"
    except Exception:
        raise TopologyUnavailable("display_power_unavailable") from None
