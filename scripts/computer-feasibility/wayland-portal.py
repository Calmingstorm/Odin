#!/usr/bin/python3
"""Real portal requests; no auto-consent, permission-store edits or Notify input."""
import json
import os
import sys
import subprocess
import time
import uuid
from pathlib import Path

DEST = "org.freedesktop.portal.Desktop"
PATH = "/org/freedesktop/portal/desktop"
RD = "org.freedesktop.portal.RemoteDesktop"
SC = "org.freedesktop.portal.ScreenCast"
REQUEST = "org.freedesktop.portal.Request"


def report(event, **fields):
    print(json.dumps({"event": event, "monotonic": time.monotonic(), **fields}), flush=True)


def take_fd(fd_list, index):
    """Transfer ownership, not get()'s duplicate while the list retains a socket."""
    if not 0 <= index < fd_list.get_length():
        raise ValueError('portal FD index outside returned list')
    fds = fd_list.steal_fds()
    chosen = fds[index]
    for i, fd in enumerate(fds):
        if i != index:
            os.close(fd)
    return chosen


def main():
    import gi
    gi.require_version("Gio", "2.0")
    from gi.repository import Gio, GLib
    if not (os.path.exists("/run/.containerenv") or os.path.exists("/.dockerenv")) or os.environ.get("HOME") != "/tmp/home":
        raise RuntimeError("private gated container required")
    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    session = None
    retained_fds = []

    def call(interface, method, args):
        return bus.call_sync(DEST, PATH, interface, method, args, None,
                             Gio.DBusCallFlags.NONE, 5000, None)

    def request(interface, method, make_args):
        token = "odin_" + uuid.uuid4().hex
        sender = bus.get_unique_name()[1:].replace(".", "_")
        path = f"/org/freedesktop/portal/desktop/request/{sender}/{token}"
        loop = GLib.MainLoop()
        response = []

        def received(_bus, _sender, _path, _iface, _signal, params):
            response.append(params.unpack())
            loop.quit()

        sub = bus.signal_subscribe(DEST, REQUEST, "Response", path, None,
                                   Gio.DBusSignalFlags.NONE, received)

        def expired():
            loop.quit()
            return False

        deadline = 90 if method == "Start" and os.environ.get("WAYLAND_OPERATOR_LAB") == "1" else 35
        timer = GLib.timeout_add_seconds(deadline, expired)
        try:
            actual = call(interface, method, make_args(token)).unpack()[0]
            if actual != path:
                raise RuntimeError("unexpected request path; fail closed")
            report("request_created", method=method)
            if not response:
                loop.run()
            if not response:
                report("request_timeout", method=method, seconds=deadline)
                try:
                    bus.call_sync(DEST, path, REQUEST, "Close", None, None,
                                  Gio.DBusCallFlags.NONE, 3000, None)
                    report("owned_request_closed", method=method)
                except GLib.Error as exc:
                    report("request_cleanup_error", method=method, reason=str(exc))
                raise RuntimeError(f"{method}: genuine consent/response timed out; not granted")
            code, data = response[0]
            report("request_response", method=method, code=code,
                   result_keys=sorted(data))
            if code != 0:
                raise RuntimeError(f"{method}: portal response {code}, not granted")
            return data
        finally:
            bus.signal_unsubscribe(sub)
            if GLib.MainContext.default().find_source_by_id(timer):
                GLib.source_remove(timer)

    try:
        for interface in (RD, SC):
            props = call("org.freedesktop.DBus.Properties", "GetAll",
                         GLib.Variant("(s)", (interface,))).unpack()[0]
            report("interface_properties", interface=interface, values=props)
        data = request(RD, "CreateSession", lambda t: GLib.Variant("(a{sv})", ({
            "handle_token": GLib.Variant("s", t),
            "session_handle_token": GLib.Variant("s", "session_" + uuid.uuid4().hex),
        },)))
        session = data["session_handle"]
        request(RD, "SelectDevices", lambda t: GLib.Variant("(oa{sv})", (session, {
            "handle_token": GLib.Variant("s", t), "types": GLib.Variant("u", 3),
            "persist_mode": GLib.Variant("u", 0),
        })))
        request(SC, "SelectSources", lambda t: GLib.Variant("(oa{sv})", (session, {
            "handle_token": GLib.Variant("s", t), "types": GLib.Variant("u", 1),
            "multiple": GLib.Variant("b", False), "cursor_mode": GLib.Variant("u", 2),
        })))
        start = request(RD, "Start", lambda t: GLib.Variant("(osa{sv})", (session, "", {
            "handle_token": GLib.Variant("s", t),
        })))
        report("granted", devices=start.get("devices"), streams=start.get("streams"))
        for interface, method in ((SC, "OpenPipeWireRemote"), (RD, "ConnectToEIS")):
            value, fd_list = bus.call_with_unix_fd_list_sync(
                DEST, PATH, interface, method, GLib.Variant("(oa{sv})", (session, {})),
                GLib.VariantType.new("(h)"), Gio.DBusCallFlags.NONE, 5000, None, None)
            fd = take_fd(fd_list, value.unpack()[0])
            retained_fds.append(fd)
            report("mediated_fd_received", method=method,
                   fd_list_remaining=fd_list.get_length(), ownership='stolen_not_duplicated')
            if os.environ.get("WAYLAND_OPERATOR_LAB") == "1":
                if method == "ConnectToEIS":
                    mode = os.environ.get("WAYLAND_LIFECYCLE_MODE")
                    if mode:
                        Path('/tmp/lifecycle-ready').touch()
                        deadline = time.monotonic() + 20
                        while not Path('/tmp/lifecycle-go').exists():
                            if time.monotonic() > deadline:
                                raise RuntimeError('isolated operator readiness timeout')
                            time.sleep(.05)
                    args = ["/usr/local/bin/wayland-ei", str(fd)] + ([mode] if mode else [])
                    child = subprocess.Popen(args, pass_fds=(fd,), stdout=subprocess.PIPE,
                                             stderr=subprocess.PIPE, text=True)
                    # A parent-held duplicate would invalidate the EOF experiment.
                    os.close(fd)
                    retained_fds.remove(fd)
                    report('sender_fd_transferred', sender_pid=child.pid,
                           parent_returned_fd_closed=True, fd_list_remaining=fd_list.get_length())
                    try:
                        stdout, stderr = child.communicate(timeout=12)
                    finally:
                        if child.poll() is None:
                            child.terminate()
                            try: child.wait(timeout=2)
                            except subprocess.TimeoutExpired:
                                child.kill()
                                child.wait()
                    result = subprocess.CompletedProcess(args, child.returncode, stdout, stderr)
                    report("libei_probe_output", stdout=result.stdout, stderr=result.stderr)
                    report("libei_probe_exit", code=result.returncode)
                    if result.returncode or (mode and 'HELD mode=' not in result.stdout):
                        raise RuntimeError('libei sender did not complete negotiated held-input trial')
                    if mode:
                        report('lifecycle_sender_exited', mode=mode)
                        Path('/tmp/lifecycle-exited').touch()
                        time.sleep(2)
                else:
                    gi.require_version("Gst", "1.0")
                    gi.require_version("GstApp", "1.0")
                    from gi.repository import Gst, GstApp
                    Gst.init(None)
                    stream = start["streams"][0][0]
                    pipeline = Gst.parse_launch(f"pipewiresrc fd={fd} path={stream} num-buffers=1 ! videoconvert ! video/x-raw,format=RGB ! appsink name=sink sync=false")
                    pipeline.set_state(Gst.State.PLAYING)
                    sample = pipeline.get_by_name("sink").emit("try-pull-sample", 10 * Gst.SECOND)
                    if sample:
                        buf = sample.get_buffer()
                        report("pipewire_frame", caps=sample.get_caps().to_string(), bytes=buf.get_size(), pts=buf.pts)
                    else:
                        report("pipewire_no_frame")
                    pipeline.set_state(Gst.State.NULL)
                    if not sample:
                        raise RuntimeError('no real PipeWire frame')
        if os.environ.get('WAYLAND_LIFECYCLE_MODE'):
            report('focused_lifecycle_probe_complete', product_backend=False)
            return 0
        report("incomplete", reason="Independent pointer/focus coexistence and cancellation matrix remain untested; no assisted-input eligibility")
        return 24
    except Exception as exc:
        report("not_proven", reason=str(exc))
        return 25
    finally:
        for fd in retained_fds:
            os.close(fd)
        if session:
            try:
                bus.call_sync(DEST, session, "org.freedesktop.portal.Session", "Close", None,
                              None, Gio.DBusCallFlags.NONE, 3000, None)
                report("owned_session_closed")
            except GLib.Error as exc:
                report("session_cleanup_error", reason=str(exc))


if __name__ == "__main__":
    sys.exit(main())
