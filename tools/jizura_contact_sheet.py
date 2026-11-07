#!/usr/bin/env python3
"""把 tools/jizura_stills.mjs 产出的静帧拼成一张联系表，便于一次性肉眼复核。

    python tools/jizura_contact_sheet.py export/v15-stills export/v15-contact.png export/v15-stills.json
"""
import glob
import io
import json
import os
import sys

from PIL import Image, ImageDraw

stills, out = sys.argv[1], sys.argv[2]
report = None
if len(sys.argv) > 3 and os.path.exists(sys.argv[3]):
    with io.open(sys.argv[3], encoding="utf-8") as h:
        report = json.load(h)
info = {round(x["time"], 2): x for x in (report or {}).get("times", [])}


def key_of(path):
    stem = os.path.basename(path).split("-t")[1][:-4]
    return float(stem.replace("p", "."))


files = sorted(glob.glob(os.path.join(stills, "*.png")), key=key_of)
if not files:
    raise SystemExit("no stills found in %s" % stills)
tw, th, cols = 640, 360, 3
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * tw, rows * (th + 30)), (10, 10, 12))
dr = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    stem = os.path.basename(f).split("-t")[1][:-4]
    t = float(stem.replace("p", "."))
    im = Image.open(f).convert("RGB").resize((tw, th))
    x, y = (i % cols) * tw, (i // cols) * (th + 30)
    sheet.paste(im, (x, y))
    it = info.get(round(t, 2), {})
    scene = (it.get("scene") or {}).get("label", "")
    line = (it.get("line") or {}).get("text", "")
    direction = it.get("direction") or {}
    plan = "%s/%s" % (direction.get("plan", ""), direction.get("layout", ""))
    dr.text((x + 6, y + th + 4), "%7.2fs  %s  %s" % (t, scene, plan), fill=(235, 235, 240))
    dr.text((x + 6, y + th + 17), line, fill=(150, 205, 180))
sheet.save(out)
print("sheet", out, sheet.size, len(files), "frames")
