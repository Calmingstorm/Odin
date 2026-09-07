"""Pure verification and harness contracts. No display, model or auth access."""
import importlib.util
import io
from pathlib import Path
from types import SimpleNamespace

import pytest
from PIL import Image, ImageDraw

PATH = Path(__file__).resolve().parents[1] / "scripts/computer-feasibility"
spec = importlib.util.spec_from_file_location("model_application_r6",
                                            PATH / "model-application-r6.py")
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)
verify = driver.sibling("verify_r6", "model_application_r6_verify.py")

SVG = b'''<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
<rect x="25" y="45" width="50" height="40" fill="blue"/>
<path d="M 20,45 L 50,15 L 80,45 Z" fill="orange"/>
<rect x="45" y="65" width="10" height="20" fill="white"/></svg>'''


def test_real_shapes_and_path_required():
    report = verify.inspect_svg(SVG)
    assert report["shapes"] == {"rect": 2, "path": 1}
    with pytest.raises(ValueError, match="insufficient"):
        verify.inspect_svg(SVG.replace(b"path", b"g"))


@pytest.mark.parametrize("bad", [b'<script/>', b'<image href="file:///etc/passwd"/>',
                                  b'<use href="#foo"/>', b'<g fill="url(http://bad)"/>'])
def test_svg_rejects_active_external_or_embedded_content(bad):
    with pytest.raises(ValueError):
        verify.inspect_svg(SVG.replace(b"</svg>", bad + b"</svg>"))


def test_rejects_entity_document():
    with pytest.raises(ValueError, match="entities"):
        verify.inspect_svg(b'<!DOCTYPE svg []>' + SVG)


def test_render_requires_nonempty_colored_extent():
    image = Image.new("RGBA", (100, 100))
    output = io.BytesIO()
    image.save(output, format="PNG")
    with pytest.raises(ValueError, match="empty"):
        verify.inspect_png(output.getvalue())
    ImageDraw.Draw(image).rectangle((20, 20, 80, 80), fill="blue")
    output = io.BytesIO()
    image.save(output, format="PNG")
    assert verify.inspect_png(output.getvalue())["colored_pixels"] > 100


def test_target_rejects_main_session_and_requires_confirmation(tmp_path):
    args = SimpleNamespace(display=":0", confirm_disposable=True, fixture_home=str(tmp_path),
                           monitor="screen")
    with pytest.raises(ValueError, match="disposable"):
        driver.validate_target(args)
    args.display = ":178"
    assert driver.validate_target(args) == tmp_path
    args.confirm_disposable = False
    with pytest.raises(ValueError, match="disposable"):
        driver.validate_target(args)


def test_render_colors_do_not_prove_correct_house_arrangement():
    image = Image.new("RGBA", (100, 100))
    draw = ImageDraw.Draw(image)
    draw.rectangle((20, 20, 80, 50), fill="blue")
    draw.polygon([(20, 90), (50, 60), (80, 90)], fill="orange")
    draw.rectangle((45, 30, 55, 50), fill="white")
    output = io.BytesIO()
    image.save(output, format="PNG")
    with pytest.raises(ValueError, match="arrangement"):
        verify.inspect_home_icon(output.getvalue())


def test_historical_harness_uses_current_production_tool_contract():
    tools = driver.r5.computer_definitions()
    assert {t["name"] for t in tools} == driver.r5.COMPUTER_TOOLS
    assert all(t["strict"] is False for t in tools)
    session = next(tool for tool in tools if tool["name"] == "computer_session")
    schema = session["input_schema"]
    assert schema["properties"]["app"]["enum"] == ["drawing", "xed"]
    assert "app" not in schema["required"]


def test_fixture_refuses_live_evidence_and_unowned_launch(monkeypatch):
    fixture = driver.sibling("fixture_r6", "model-application-fixture-r6.py")
    monkeypatch.setattr(fixture.os, "geteuid", lambda: 0)
    args = SimpleNamespace(display=178, evidence="/opt/odin/model-evidence")
    with pytest.raises(RuntimeError, match="evidence"):
        fixture.validate_fixture_args(args)
    args.evidence = "/home/odin/model-evidence-pure-test-not-created"
    monkeypatch.setattr(fixture.Path, "read_bytes", lambda _: b"python\0unowned.py\0")
    with pytest.raises(RuntimeError, match="supervisor"):
        fixture.validate_fixture_args(args)
    args.display = 0
    with pytest.raises(RuntimeError, match="disposable"):
        fixture.validate_fixture_args(args)


def test_independent_svg_render_and_no_source_mutation(tmp_path):
    source = tmp_path / "source.svg"
    source.write_bytes(SVG)
    evidence = tmp_path / "evidence"
    evidence.mkdir()
    report = verify.verify_saved_svg(source, evidence)
    assert source.read_bytes() == SVG
    assert (evidence / "saved.svg").read_bytes() == SVG
    assert report["render"]["colored_pixels"] > 100
