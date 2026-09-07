/* SPDX-License-Identifier: GPL-2.0-or-later
 * Explicit operator-installed GNOME Shell provider. Private IPC only.
 * Meta.Window.get_pid on native Wayland derives from wl_client_get_credentials
 * (Mutter meta-window-wayland.c get_client_pid), never app-controlled WM_PID.
 */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';

const NAME = 'org.gnome.Shell.Extensions.OdinScope';
const PATH = '/org/gnome/Shell/Extensions/OdinScope';
const XML = `<node><interface name="${NAME}"><method name="Snapshot">
<arg type="s" name="request" direction="in"/>
<arg type="s" name="evidence" direction="out"/>
</method><method name="Identity">
<arg type="s" name="challenge" direction="in"/>
<arg type="s" name="evidence" direction="out"/>
</method></interface></node>`;

function refuse() {
    throw new Error('wayland_scope_unavailable');
}

function intersects(a, b) {
    return a.x < b.x + b.width && b.x < a.x + a.width &&
        a.y < b.y + b.height && b.y < a.y + a.height;
}

export default class OdinScope extends Extension {
    enable() {
        this._serial = 1;
        this._focusSignal = global.display.connect('notify::focus-window', () => this._serial++);
        this._monitorSignal = Main.layoutManager.connect('monitors-changed', () => this._serial++);
        this._exported = Gio.DBusExportedObject.wrapJSObject(XML, this);
        this._exported.export(Gio.DBus.session, PATH);
        // Must share org.gnome.Shell's actual session connection/unique owner.
        this._owner = Gio.bus_own_name_on_connection(Gio.DBus.session, NAME,
            Gio.BusNameOwnerFlags.NONE, null, null);
    }

    disable() {
        if (this._focusSignal)
            global.display.disconnect(this._focusSignal);
        if (this._monitorSignal)
            Main.layoutManager.disconnect(this._monitorSignal);
        if (this._owner)
            Gio.bus_unown_name(this._owner);
        this._exported?.unexport();
        this._focusSignal = this._monitorSignal = this._owner = 0;
        this._exported = null;
    }

    IdentityAsync(params, invocation) {
        try {
            if (params.length !== 1 || typeof params[0] !== 'string' ||
                !/^[a-f0-9]{48}$/.test(params[0]) || !Meta.is_wayland_compositor())
                refuse();
            const backendClass = GObject.type_name_from_instance(global.backend);
            if (!['MetaBackendNative', 'MetaBackendX11', 'MetaBackendX11Nested'].includes(backendClass))
                refuse();
            const result = {challenge: params[0], native_wayland: true,
                compositor_name: 'gnome-shell', compositor_version: Config.PACKAGE_VERSION,
                backend_class: backendClass};
            invocation.return_value(new GLib.Variant('(s)', [JSON.stringify(result)]));
        } catch (_) {
            invocation.return_dbus_error(`${NAME}.Unavailable`, 'wayland_scope_unavailable');
        }
    }

    SnapshotAsync(params, invocation) {
        // Session bus peers are same-user. Do not use request-provided PID/UID.
        // Backend authenticates our bus owner/process before and after queries.
        try {
            if (params.length !== 1 || typeof params[0] !== 'string' || params[0].length > 4096)
                refuse();
            const result = this._snapshot(JSON.parse(params[0]));
            invocation.return_value(new GLib.Variant('(s)', [JSON.stringify(result)]));
        } catch (_) {
            invocation.return_dbus_error(`${NAME}.Unavailable`, 'wayland_scope_unavailable');
        }
    }

    _snapshot(request) {
        if (!Meta.is_wayland_compositor() || request.protocol !== 1 ||
            !/^[a-f0-9]{48}$/.test(request.challenge) ||
            !/^[a-f0-9]{64}$/.test(request.source_digest))
            refuse();
        if (Main.sessionMode.currentMode !== 'user' || Main.sessionMode.isLocked ||
            Main.sessionMode.isGreeter || Main.screenShield?.locked ||
            Main.overview.visible || Main.overview.animationInProgress ||
            Main.modalCount !== 0 || global.stage.get_key_focus() !== null ||
            (Main.messageTray?._banner?.visible && Main.messageTray?._bannerBin?.visible))
            refuse();
        const source = request.source;
        if (!source || source.source_type !== 1 || !Number.isInteger(source.node_id) ||
            source.node_id <= 0 || source.node_id >= 2 ** 32 ||
            typeof source.session_handle !== 'string' ||
            !/^\/(?:[A-Za-z0-9_]+\/)*[A-Za-z0-9_]+$/.test(source.session_handle) ||
            !Array.isArray(source.position) || source.position.length !== 2 ||
            !Array.isArray(source.size) || source.size.length !== 2 ||
            ![...source.position, ...source.size].every(Number.isInteger) ||
            !source.size.every(v => v > 0 && v <= 32768))
            refuse();
        const [sx, sy] = source.position;
        const [sw, sh] = source.size;
        // Compare against the selected portal stream, never nearest/primary.
        // Mirrored/duplicate geometry is deliberately ambiguous and refused.
        const matches = Main.layoutManager.monitors.filter(m =>
            m.x === sx && m.y === sy && m.width === sw && m.height === sh);
        if (matches.length !== 1)
            refuse();
        const focus = global.display.focus_window;
        if (!focus || !focus.appears_focused || focus.minimized ||
            focus.get_client_type() !== Meta.WindowClientType.WAYLAND ||
            ![Meta.WindowType.NORMAL, Meta.WindowType.DIALOG,
                Meta.WindowType.MODAL_DIALOG, Meta.WindowType.UTILITY,
                Meta.WindowType.MENU, Meta.WindowType.DROPDOWN_MENU,
                Meta.WindowType.POPUP_MENU].includes(focus.get_window_type()) ||
            !focus.showing_on_its_workspace() ||
            focus.get_workspace() !== global.workspace_manager.get_active_workspace())
            refuse();
        const pid = focus.get_pid();
        if (!Number.isInteger(pid) || pid <= 1)
            refuse();
        // The Python policy applies the shared denied-class boundary to this
        // compositor-authenticated metadata. No per-application allowlist.
        const title = focus.get_title() ?? '';
        const appClass = focus.get_wm_class() ?? '';
        if (typeof title !== 'string' || typeof appClass !== 'string' ||
            title.length > 4096 || appClass.length > 4096)
            refuse();
        const rect = focus.get_frame_rect();
        // Exclude reserved Shell panel/dock regions even for maximized apps.
        const work = focus.get_workspace().get_work_area_for_monitor(matches[0].index);
        const x = Math.max(rect.x, sx, work.x);
        const y = Math.max(rect.y, sy, work.y);
        const right = Math.min(rect.x + rect.width, sx + sw, work.x + work.width);
        const bottom = Math.min(rect.y + rect.height, sy + sh, work.y + work.height);
        if (right <= x || bottom <= y)
            refuse();
        const clipped = {x, y, width: right - x, height: bottom - y};
        // Refuse overlapping higher application surfaces/popups, not just focus.
        const ordered = global.display.sort_windows_by_stacking(
            global.get_window_actors().map(a => a.meta_window));
        const actors = ordered.map(w => w.get_compositor_private());
        const actor = focus.get_compositor_private();
        const index = actors.indexOf(actor);
        if (index < 0 || !actor.visible)
            refuse();
        for (const other of actors.slice(index + 1)) {
            const candidate = other.meta_window;
            if (candidate && other.visible && !candidate.minimized &&
                candidate.showing_on_its_workspace() &&
                intersects(clipped, candidate.get_frame_rect()))
                refuse();
        }
        if (global.display.focus_window !== focus)
            refuse();
        return {protocol: 1, challenge: request.challenge,
            source_digest: request.source_digest, title, wm_class: appClass,
            native_wayland: true, safe_focus: true, pid,
            focus_serial: this._serial, focus_token: String(focus.get_stable_sequence()),
            bounds: {x: x - sx, y: y - sy, width: right - x, height: bottom - y}};
    }
}
