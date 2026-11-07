#!/usr/bin/env python3
"""合并可见性与对比度两份审计，给每行歌词一个最终判定。

两份审计量的是不同的东西：
  · 可见性审计：日文歌词层相对"抽掉歌词层"的帧多贡献了多少像素 —— 回答"字有没有画出来"。
  · 对比度审计：字墨和它底下的画面差多少 WCAG 对比度 —— 回答"字看不看得清"。
只看其中一个都会误判：
  · 一行巨字画得很重（像素很多）但压在一片亮红上，依然读不出来；
  · 一行小字只有几万像素（看着"弱"），但墨色对底色 8:1，完全可读。

所以最终判定按两条一起看：
  missing    —— 几乎没有贡献，字根本没画出来
  unreadable —— 画出来了，但和背景的对比度低于 2.0:1
  marginal   —— 对比度低于 3.2:1，或者贡献像素偏少，需要人眼看
  ok         —— 两者都过

用法：
  python tools/jizura_final_verdict.py export/v15l-visibility.json export/v15l-contrast.json
"""
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")

VIS_STRONG_OK = 40000
VIS_STRONG_MIN = 8000
CONTRAST_OK = 3.2
CONTRAST_MIN = 2.0


def load(p):
    with io.open(os.path.join(ROOT, p) if not os.path.isabs(p) else p, encoding="utf-8") as h:
        return json.load(h)


def main():
    vis_path = sys.argv[1] if len(sys.argv) > 1 else "export/v15l-visibility.json"
    con_path = sys.argv[2] if len(sys.argv) > 2 else "export/v15l-contrast.json"
    out_path = sys.argv[3] if len(sys.argv) > 3 else "data/jizura_verdict.json"

    vis = {l["id"]: l for l in load(vis_path)["lines"]}
    con = {l["id"]: l for l in load(con_path)["lines"]}

    rows = []
    for lid in sorted(vis):
        v = vis[lid]
        c = con.get(lid, {})
        contrast = c.get("contrast", 0)
        invisible = c.get("invisible", 100)
        strong = v.get("strongMin", 0)
        if strong < VIS_STRONG_MIN:
            verdict = "missing"
        elif contrast < CONTRAST_MIN:
            verdict = "unreadable"
        elif contrast < CONTRAST_OK or strong < VIS_STRONG_OK or invisible > 25:
            verdict = "marginal"
        else:
            verdict = "ok"
        rows.append({
            "id": lid, "text": v.get("text", ""), "verdict": verdict,
            "strongMin": strong, "strongMax": v.get("strongMax", 0),
            "holeFrames": v.get("holeFrames", 0),
            "contrast": contrast, "invisible": invisible,
            "plan": v.get("plan"), "layout": v.get("layout"), "layer": v.get("layer"),
            "time": v.get("time"), "dur": v.get("dur"),
        })

    counts = {}
    for r in rows:
        counts[r["verdict"]] = counts.get(r["verdict"], 0) + 1
    doc = {
        "generatedBy": "tools/jizura_final_verdict.py",
        "visibility": vis_path, "contrast": con_path,
        "thresholds": {"strongOk": VIS_STRONG_OK, "strongMin": VIS_STRONG_MIN,
                       "contrastOk": CONTRAST_OK, "contrastMin": CONTRAST_MIN},
        "counts": counts, "lines": rows,
    }
    path = os.path.join(ROOT, out_path)
    with io.open(path, "w", encoding="utf-8", newline="\n") as h:
        json.dump(doc, h, ensure_ascii=False, indent=1)

    print("%-6s %-11s %8s %7s %6s  %-9s %-13s %-6s %s" % (
        "id", "verdict", "strong", "contrast", "invis", "plan", "layout", "layer", "text"))
    for r in rows:
        if r["verdict"] == "ok":
            continue
        print("%-6s %-11s %8d %7.2f %6.1f  %-9s %-13s %-6s %s" % (
            r["id"], r["verdict"], r["strongMin"], r["contrast"], r["invisible"],
            r["plan"], r["layout"], r["layer"], r["text"]))
    print("counts: %s" % counts)
    print("wrote %s" % path)


if __name__ == "__main__":
    main()
