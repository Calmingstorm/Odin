"""Independent saved-SVG checks, never an application-driving model tool."""

from __future__ import annotations

import hashlib
import io
import subprocess
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

from PIL import Image


def inspect_svg(blob: bytes) -> dict:
    if not 100 <= len(blob) <= 2_000_000:
        raise ValueError("svg_size_out_of_bounds")
    if b"<!DOCTYPE" in blob.upper() or b"<!ENTITY" in blob.upper():
        raise ValueError("svg_entities_forbidden")
    root = ET.fromstring(blob)
    if root.tag != "{http://www.w3.org/2000/svg}svg":
        raise ValueError("not_svg")
    counts = Counter()
    for node in root.iter():
        tag = node.tag.rsplit("}", 1)[-1]
        if tag in {"script", "image", "foreignObject", "use"}:
            raise ValueError("non_shape_content")
        for key, value in node.attrib.items():
            if key.rsplit("}", 1)[-1] == "href" or "url(" in value.lower():
                raise ValueError("external_or_referenced_content")
        if tag in {"rect", "path", "circle", "ellipse", "polygon", "polyline"}:
            counts[tag] += 1
    if sum(counts.values()) < 3 or counts["path"] < 1 or counts["rect"] < 1:
        raise ValueError("insufficient_real_shapes_and_path")
    return {"bytes": len(blob), "sha256": hashlib.sha256(blob).hexdigest(), "shapes": dict(counts)}


def inspect_png(blob: bytes) -> dict:
    image = Image.open(io.BytesIO(blob)).convert("RGBA")
    pixels = list(image.getdata())
    ink = [p for p in pixels if p[3] > 20 and min(p[:3]) < 235]
    colored = [p for p in ink if max(p[:3]) - min(p[:3]) > 50]
    coverage = len(ink) / len(pixels)
    if not 0.001 < coverage < 0.9 or len(colored) < 100:
        raise ValueError("render_empty_or_unusable")
    bbox = image.getchannel("A").getbbox()
    if not bbox or bbox[2] - bbox[0] < 20 or bbox[3] - bbox[1] < 20:
        raise ValueError("render_too_small")
    return {
        "width": image.width,
        "height": image.height,
        "ink_pixels": len(ink),
        "colored_pixels": len(colored),
        "coverage": round(coverage, 6),
        "alpha_bbox": bbox,
        "png_sha256": hashlib.sha256(blob).hexdigest(),
    }


def inspect_home_icon(blob: bytes) -> dict:
    """Check visible color-region geometry independently of XML transforms."""
    image = Image.open(io.BytesIO(blob)).convert("RGBA")
    regions = {"body": [], "roof": [], "door": []}
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = image.getpixel((x, y))
            if a < 220:
                continue
            if b > 60 and b > r * 1.4 and b > g * 1.15:
                regions["body"].append((x, y))
            elif r > 160 and 45 < g < 210 and b < 100:
                regions["roof"].append((x, y))
            elif min(r, g, b) > 245:
                regions["door"].append((x, y))
    boxes = {}
    for name, points in regions.items():
        if len(points) < 100:
            raise ValueError("icon_missing_visible_" + name)
        xs, ys = zip(*points, strict=True)
        boxes[name] = [min(xs), min(ys), max(xs), max(ys)]
    body, roof, door = (boxes[name] for name in ("body", "roof", "door"))
    tolerance = image.height * 0.04
    if not (
        roof[1] < body[1]
        and abs(roof[3] - body[1]) <= tolerance
        and roof[0] < (body[0] + body[2]) / 2 < roof[2]
        and body[0] < door[0] < door[2] < body[2]
        and body[1] < door[1] < door[3] <= body[3] + tolerance
        and abs(door[3] - body[3]) <= tolerance
    ):
        raise ValueError("icon_shape_arrangement_incorrect")
    return {"color_region_boxes": boxes, "home_layout_verified": True}


def verify_saved_svg(source: Path, evidence: Path) -> dict:
    if source.is_symlink() or not source.is_file():
        raise ValueError("saved_file_unavailable")
    blob = source.read_bytes()
    report = inspect_svg(blob)
    (evidence / "saved.svg").write_bytes(blob)
    result = subprocess.run(
        ["rsvg-convert", "--width", "512", "--height", "512"],
        input=blob,
        capture_output=True,
        timeout=15,
        check=True,
    )
    (evidence / "independent-render.png").write_bytes(result.stdout)
    report["render"] = inspect_png(result.stdout)
    report["icon"] = inspect_home_icon(result.stdout)
    return report
