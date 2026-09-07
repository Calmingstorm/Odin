// Disposable image ONLY. No D-Bus export, no input, no gate modification.
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class Diagnostic extends Extension {
    enable() {
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            try {
                const focus = global.display.focus_window;
                const stage = global.stage.get_key_focus();
                const window = w => ({pid: w.get_pid(), title: w.get_title(),
                    normal: w.get_window_type() === Meta.WindowType.NORMAL,
                    native: w.get_client_type() === Meta.WindowClientType.WAYLAND,
                    transient: w.get_transient_for() !== null, focused: w.appears_focused,
                    minimized: w.minimized, showing: w.showing_on_its_workspace(),
                    activeWorkspace: w.get_workspace() === global.workspace_manager.get_active_workspace(),
                    rect: w.get_frame_rect(), visible: w.get_compositor_private()?.visible});
                console.log('R8_COMPOSED_DIAGNOSTIC ' + JSON.stringify({
                    mode: Main.sessionMode.currentMode, locked: Main.sessionMode.isLocked,
                    greeter: Main.sessionMode.isGreeter, shield: Main.screenShield?.locked,
                    overview: Main.overview.visible, animation: Main.overview.animationInProgress,
                    modal: Main.modalCount, stage: stage ? String(stage) : null,
                    bannerBinVisible: Main.messageTray?._bannerBin?.visible,
                    banner: Main.messageTray?._banner !== null,
                    monitors: Main.layoutManager.monitors,
                    focus: focus ? window(focus) : null,
                    windows: global.display.sort_windows_by_stacking(
                        global.get_window_actors().map(a => a.meta_window)).map(window)}));
            } catch (error) {
                console.log('R8_COMPOSED_DIAGNOSTIC_ERROR ' + String(error));
            }
            return GLib.SOURCE_CONTINUE;
        });
    }
    disable() {
        if (this._timer) GLib.source_remove(this._timer);
        this._timer = 0;
    }
}
