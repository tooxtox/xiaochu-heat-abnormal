"""Locally separate colours, trace actual contours, and recolour Xiaochu art.

Run: python tools/trace_character.py
New seated pose only: python tools/trace_character.py --seated-only
Requires Pillow, numpy, opencv-python-headless. No generative image edits occur here.
"""
from pathlib import Path
import json
import sys
import hashlib

ROOT = Path(__file__).resolve().parents[1]
LOCAL_DEPS = ROOT.parents[1] / "work" / "deps" / "character"
if LOCAL_DEPS.is_dir():
    sys.path.insert(0, str(LOCAL_DEPS))
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

DEST = ROOT / "assets" / "character"
PALETTE = {
    "outline": "#294F4C", "ink": "#193330",
    "mint_deep": "#4D8475", "mint_shadow": "#70B39B",
    "mint": "#9DE4C2", "mint_light": "#B9F0D5", "mint_glint": "#DCF8E9",
    "ivory_deep": "#BFC9C4", "ivory_shadow": "#DDE2DC", "ivory": "#F3F2E9", "ivory_light": "#FFFDF4",
    "skin_shadow": "#D9A798", "skin": "#F6CEBC", "skin_light": "#FFE5D5",
    "pink_deep": "#9C4D72", "pink": "#E9ACC8", "pink_light": "#FAD3E4",
}
NAMES = list(PALETTE)
COLORS = np.array([[int(PALETTE[n][i:i+2], 16) for i in (1, 3, 5)] for n in NAMES], dtype=np.uint8)
INDEX = {n: i for i, n in enumerate(NAMES)}


def clean_alpha(alpha):
    # Generated glow lives in low alpha; remap the opaque drawing, preserving a narrow AA fringe.
    alpha = np.clip((alpha.astype(np.float32) - 224) * (255 / 27), 0, 255).astype(np.uint8)
    count, components, stats, _ = cv2.connectedComponentsWithStats((alpha > 16).astype(np.uint8), 8)
    keep = np.zeros(count, np.uint8)
    if count > 1:
        keep[1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])] = 1
    alpha *= keep[components]
    return alpha


def separate(source):
    rgba = np.array(source.convert("RGBA"))
    rgb = cv2.bilateralFilter(rgba[:, :, :3], 5, 15, 3).astype(np.float32)
    r, g, b = rgb.transpose(2, 0, 1)
    light = .2126*r + .7152*g + .0722*b
    alpha = clean_alpha(rgba[:, :, 3])
    labels = np.full(alpha.shape, INDEX["ivory"], np.uint8)
    mint = (g > r + 7) & (g > b + 3)
    pink = (b > g + 5) & (r > g + 16)
    skin = (r > g + 10) & (r > b + 23) & ~pink
    for family, mask, cuts in [
        (["ivory_deep", "ivory_shadow", "ivory", "ivory_light"], ~mint & ~pink & ~skin, [178, 218, 242]),
        (["mint_deep", "mint_shadow", "mint", "mint_light", "mint_glint"], mint, [126, 167, 208, 235]),
        (["skin_shadow", "skin", "skin_light"], skin, [168, 218]),
        (["pink_deep", "pink", "pink_light"], pink, [135, 200]),
    ]:
        bins = np.digitize(light, cuts)
        for q, name in enumerate(family):
            labels[mask & (bins == q)] = INDEX[name]
    # Preserve source ink instead of introducing edge-detector dots across lace and blush.
    labels[light < 111] = INDEX["outline"]
    labels[light < 58] = INDEX["ink"]
    out = np.dstack([COLORS[labels], alpha])
    out[alpha == 0, :3] = 0
    line_mask = (labels <= INDEX["ink"]) & (alpha > 0)
    lineart = np.dstack([np.broadcast_to(COLORS[INDEX["outline"]], out[:, :, :3].shape), alpha * line_mask])
    return Image.fromarray(out), Image.fromarray(lineart), labels, alpha


def path_for(mask):
    contours, _ = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    paths = []
    for contour in contours:
        if abs(cv2.contourArea(contour)) < 1.7:
            continue
        contour = cv2.approxPolyDP(contour, .45, True)[:, 0]
        if len(contour) < 3:
            continue
        paths.append("M" + "L".join(f"{x},{y}" for x, y in contour) + "Z")
    return "".join(paths)


def write_svg(path, labels, alpha):
    h, w = labels.shape
    paths = []
    # A silhouette undercoat closes subpixel contour gaps. Even-odd fill preserves real holes.
    outline = path_for((alpha > 127).astype(np.uint8) * 255)
    paths.append(f'<path fill="{PALETTE["outline"]}" d="{outline}"/>')
    for i, name in enumerate(NAMES):
        data = path_for(((labels == i) & (alpha > 127)).astype(np.uint8) * 255)
        if data:
            paths.append(f'<path id="{name}" fill="{PALETTE[name]}" d="{data}"/>')
    path.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><title>Xiaochu — automatic local colour contour trace</title><g fill-rule="evenodd" stroke-linejoin="round">' + "".join(paths) + '</g></svg>', encoding="utf-8")


def checker(size):
    h, w = size[1], size[0]
    yy, xx = np.indices((h, w))
    a = np.where(((xx // 24 + yy // 24) % 2)[..., None], [31, 49, 48], [37, 58, 55]).astype(np.uint8)
    return Image.fromarray(a).convert("RGBA")


def compare(original, lineart, recolored, filename="compare.png", height=760):
    width = 480
    board = Image.new("RGB", (width * 3, height + 60), "#101C1D")
    draw = ImageDraw.Draw(board)
    for i, (label, im) in enumerate([("GENERATED SOURCE", original), ("LOCAL INK SEPARATION", lineart), ("LOCAL PALETTE / CONTOURS", recolored)]):
        thumb = im.copy(); thumb.thumbnail((width - 24, height - 12), Image.Resampling.LANCZOS)
        bg = Image.new("RGBA", (width, height), "#F3F2E9") if i == 1 else checker((width, height))
        bg.alpha_composite(thumb, ((width-thumb.width)//2, (height-thumb.height)//2))
        board.paste(bg.convert("RGB"), (width*i, 60))
        draw.text((width*i+20, 22), label, fill="#B9F0D5", font=ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 19))
    board.save(DEST / filename)


def seated():
    source = DEST / "seated-original.png"
    original = Image.open(source).convert("RGBA")
    recolored, lineart, labels, alpha = separate(original)
    recolored.save(DEST / "seated-recolored.png")
    lineart.save(DEST / "seated-lineart.png")
    write_svg(DEST / "seated-traced.svg", labels, alpha)
    compare(original, lineart, recolored, "seated-compare.png", height=400)
    info_path = DEST / "trace-pipeline.json"
    info = json.loads(info_path.read_text(encoding="utf-8")) if info_path.exists() else {"palette": PALETTE}
    info["seated"] = {
        "size": list(original.size), "alpha_bbox": recolored.getbbox(),
        "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "source_prompt_summary": "Same Xiaochu identity, seated side view facing left, hands posed for typing, mint long hair, pink eyes, mint/ivory lolita outfit, ears and tail; isolated transparent source",
        "local_processing": "Same fixed palette, alpha cleanup and real automatic colour-region contour trace as the standing pose",
    }
    info_path.write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding="utf-8")
    assert (alpha == 0).any() and (alpha == 255).any()
    assert np.count_nonzero((labels == INDEX["pink"]) & (alpha > 127)) > 30
    print(json.dumps({"generated": "seated-recolored.png, seated-traced.svg, seated-lineart.png, seated-compare.png", "size": original.size, "alpha_bbox": recolored.getbbox()}))


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    if "--seated-only" in sys.argv:
        seated()
        return
    original = Image.open(DEST / "xiaochu-original.png").convert("RGBA")
    recolored, lineart, labels, alpha = separate(original)
    recolored.save(DEST / "xiaochu-recolored.png")
    lineart.save(DEST / "lineart.png")
    write_svg(DEST / "xiaochu-traced.svg", labels, alpha)
    compare(original, lineart, recolored)
    atlas = Image.open(DEST / "expressions-original.png").convert("RGBA")
    half_w, half_h = atlas.width // 2, atlas.height // 2
    face_stats = {}
    preview = Image.new("RGBA", (half_w*2, (half_h+40)*2), "#101C1D")
    for name, x, y in [("calm", 0, 0), ("fear", half_w, 0), ("sad", 0, half_h), ("peace", half_w, half_h)]:
        crop = atlas.crop((x, y, x+half_w, y+half_h))
        face, lines, regions, a = separate(crop)
        face.save(DEST / f"expression-{name}.png")
        write_svg(DEST / f"expression-{name}.svg", regions, a)
        face_stats[name] = {"source_box": [x, y, x+half_w, y+half_h], "size": list(face.size)}
        row_y = (y // half_h) * (half_h+40)
        tile = checker(face.size); tile.alpha_composite(face)
        preview.alpha_composite(tile, (x, row_y+40))
        ImageDraw.Draw(preview).text((x+20, row_y+10), name.upper(), fill="#B9F0D5", font=ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 22))
    preview.convert("RGB").save(DEST / "expressions-preview.png")
    info = {
        "method": "Automatic local semantic colour separation and contour tracing, not hand tracing",
        "palette": PALETTE, "main_size": list(original.size), "atlas_size": list(atlas.size), "expressions": face_stats,
        "alpha": "Remove generated low-opacity glow; remap alpha 224..251 to 0..255 and keep the largest connected foreground component (also rejects neighbouring atlas-cell fragments)",
        "contours": "OpenCV connected colour-region contours with holes; approxPolyDP epsilon 0.45 source pixels; minimum region area 1.7 px2",
        "shading": "Fixed semantic mint, ivory, skin, pink and dark teal inks; no dithering, no Canny edge overlay",
        "limitations": "Automatic colour/alpha segmentation can simplify fine lace and transparent wisps. SVG traces the current pose; it is not a new independent pose or a hidden-part rig.",
        "source_sha256": hashlib.sha256((DEST / "xiaochu-original.png").read_bytes()).hexdigest(),
    }
    (DEST / "trace-pipeline.json").write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding="utf-8")
    # One real output check: full body retains alpha, pink eyes, mint/ivory and all four source expressions.
    assert (alpha == 0).any() and (alpha == 255).any()
    for name in ["mint", "ivory_light", "pink", "outline"]:
        assert np.count_nonzero((labels == INDEX[name]) & (alpha > 127)) > 30, name
    assert all((DEST / f"expression-{name}.png").is_file() for name in face_stats)
    print(json.dumps({"generated": "xiaochu-recolored.png, xiaochu-traced.svg, lineart.png, compare.png, expression-{calm,fear,sad,peace}.{png,svg}", "palette_size": len(PALETTE), "alpha_bbox": recolored.getbbox()}, ensure_ascii=False))
    if (DEST / "seated-original.png").exists():
        seated()


if __name__ == "__main__":
    main()
