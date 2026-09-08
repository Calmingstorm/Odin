"""Portable source-contract tests, NOT compositor/receiver qualification."""
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "assets/hyprland-input/scope-plugin.cpp"


def source() -> str:
    return SOURCE.read_text()


def test_actual_input_manager_gates_cover_native_event_routes():
    text = source()
    for name in (
        "onKeyboardKey", "onKeyboardMod", "onMouseButton", "onMouseWheel",
        "onMouseMoved", "onMouseWarp",
    ):
        assert f'hook("{name}", "CInputManager::{name}("' in text
    assert 'hook("setKeyboardFocus", "CSeatManager::setKeyboardFocus("' in text
    assert 'hook("setPointerFocus", "CSeatManager::setPointerFocus("' in text


def test_credentials_and_output_binding_are_not_caller_assertions():
    text = source()
    for guard in (
        "SO_PEERCRED", "wl_client_get_credentials", "x->client == k->client",
        "x->pid == peer.pid", "p->resource->m_boundOutput != it->second.monitor",
    ):
        assert guard in text
    assert 'chmod(path.c_str(), 0600)' in text
    assert "credentials.uid != getuid() && credentials.uid != 0" in text
    assert 'hook("newVirtualMouse", "CInputManager::newVirtualMouse("' in text
    assert "manager->m_pointers.size() != before.size() + 1" in text
    assert "SYS_pidfd_open" in text
    assert "poll(&identity, 1, 0) == 0" in text


def test_scope_deadline_and_snapshot_deadline_are_bounded():
    text = source()
    assert "n >= 0 && n <= 250" in text
    assert "ns() < deadline" in text
    assert "ns() - it->second.measured >= 250000000" in text
    assert "token != bound.token || !scope()" in text
    assert '"deadline_monotonic_ns"' in text
    assert "odin_scope::bounded_deadline" in text
    assert "deadline = ns() +" not in text


def test_snapshot_integer_geometry_without_rounding():
    text = source()
    assert "std::floor(v) != v" in text
    assert 'put(o.get(), "pixel_width", int64_t(b.pixelSize.x))' in text
    assert 'put(f.get(), "width", int64_t(b.size.x))' in text
    for flag in ("safe_focus", "native_wayland"):
        assert f'put(j.get(), "{flag}", true)' in text


def test_fail_closed_scope_and_epoch_invalidation():
    text = source()
    for guard in (
        "!PROTO::sessionLock->isLocked()", "b.revision != revision", "w->m_isX11",
        "fractional-or-unknown-geometry", "modal-or-unknown-toplevel",
    ):
        assert guard in text
    for event in (
        "e.monitor.layoutChanged", "e.monitor.focused", "e.window.active",
        "e.config.preReload", "w->m_events.resize", "m->m_events.dpmsChanged",
    ):
        assert event in text
    assert "w->m_title == b.title" not in text
    assert 'hook("updateWindowDecos", "Desktop::View::CWindow::updateWindowDecos("' in text
    assert "pos != s.watchedPos || size != s.watchedSize" in text


def test_recovery_retains_failed_ledger_and_distinguishes_receiver_proof():
    text = source()
    assert "const auto pendingKeys = keys" in text
    assert "const auto pendingButtons = buttons" in text
    assert "else keys.erase(key)" in text
    assert 'put(j.get(), "receiver_proven", false)' in text
    assert 'put(j.get(), "release_acknowledged", !armed && !failed' in text


def test_transport_is_compositor_loop_and_bounded():
    text = source()
    for item in (
        "wl_event_loop_add_fd", "wl_event_loop_add_timer", "MSG_DONTWAIT | MSG_NOSIGNAL",
        "p.input.size() > 8192", "s.peers.size() >= 16",
    ):
        assert item in text
    assert "std::thread" not in text


def test_exact_api_pin_and_no_configuration_write():
    text = source()
    assert "39d7e209c79d451efab1b21151d5938289da838d" in text
    assert "__hyprland_api_get_hash()" in text
    assert "hyprland.conf" not in text
    assert "system(" not in text
