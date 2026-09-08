"""GNOME retains an empty visible banner container; it is not an active overlay."""
from pathlib import Path


def test_scope_refuses_visible_banner_not_empty_container():
    source = (Path(__file__).parents[1] / "assets/wayland-scope/extension.js").read_text()
    assert "(Main.messageTray?._banner?.visible && Main.messageTray?._bannerBin?.visible)" in source
    assert "Main.modalCount !== 0" in source
    assert "global.stage.get_key_focus() !== null" in source
    assert "Main.screenShield?.locked" in source
