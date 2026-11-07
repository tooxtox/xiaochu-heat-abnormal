#!/usr/bin/env python3
"""V15 JIZURA 歌词导演表。

把 126 行日中歌词逐行翻译成"语义动作"：每行指定一个 JIZURA 计划族（配色与素材池）、
版式（layout）、入场/停留/出场（enter/hold/exit）、装饰（decor）、处理（treat）、
镜头（cam）、转场（trans），以及 LRC 标记（断句 `/`、强调 `*词*`、キメ `!`）。

理由：JIZURA 的自动规划只会随机挑版式，词义不落到效果上。这里把每一句歌词
"在问什么"写成可复查的规则，再由 src/jizura_layer.mjs 在 plan 期注入
project.overrides，使每个 cut 都由语义决定，而不是由随机数决定。

    python tools/build_jizura_direction.py

输出 data/jizura_direction.json。歌词文本本身不入库，只写入方向与标记。
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


# ---------------------------------------------------------------------------
# 可见窗口：JIZURA 的进出场时长
#
# 引擎把 inDur + outDur 压到行长的 92% 以内（durs()，jizura_engine.js:3071），
# 而多数入场动画还会把字本身淡入——也就是说，入场没走完之前，字是半透明的，
# 读不出来。下面是引擎里我们用到的入场/出场时长的真实公式（逐条抄自引擎）。
# ---------------------------------------------------------------------------
ENTER_INDUR = {
    "assemble":   lambda dur, n: _clamp(dur * 0.45, 0.22, 0.75),
    "brushReveal": lambda dur, n: _clamp(dur * 0.45, 0.2, 0.85),
    "fadeStagger": lambda dur, n: _clamp(dur * 0.45, 0.15, 0.85),
    "heatHaze":   lambda dur, n: _clamp(dur * 0.45, 0.2, 0.8),
    "inkBleed":   lambda dur, n: _clamp(dur * 0.45, 0.15, 0.8),
    "inkDrop":    lambda dur, n: _clamp(dur * 0.45, 0.2, 0.85),
    "overexpose": lambda dur, n: _clamp(dur * 0.42, 0.18, 0.75),
    "resolve":    lambda dur, n: _clamp(0.2 + n * 0.045, 0.3, max(0.3, min(0.95, dur * 0.55))),
    "stamp":      lambda dur, n: _clamp(dur * 0.4, 0.14, 0.7),
    "strokeDraw": lambda dur, n: _clamp(dur * 0.5, 0.2, 0.95),
    "tornJoin":   lambda dur, n: _clamp(dur * 0.42, 0.18, 0.75),
    "type":       lambda dur, n: _clamp(n * 0.055 + 0.1, 0.15, dur * 0.65),
    "waveIn":     lambda dur, n: _clamp(dur * 0.45, 0.15, 0.85),
}
# 没有自声明时长的入场走引擎默认：clamp(dur * 0.36, 0.12, 0.6)
DEFAULT_INDUR = lambda dur, n: _clamp(dur * 0.36, 0.12, 0.6)


def _out_dur(dur, exit_):
    """出场时长。cut 为 0，其余走引擎默认 clamp(dur * 0.3, 0.14, 0.55)。"""
    if exit_ == "cut":
        return 0.0
    return _clamp(dur * 0.3, 0.14, 0.55)


def legible_window(dur, enter, exit_, n):
    """这一行里，字真正清晰可见的秒数。"""
    in_dur = 0.12 if enter == "cut" else ENTER_INDUR.get(enter, DEFAULT_INDUR)(dur, n)
    out_dur = _out_dur(dur, exit_)
    if in_dur + out_dur > dur * 0.92:
        f = dur * 0.92 / (in_dur + out_dur)
        in_dur *= f
        out_dur *= f
    return dur - in_dur - out_dur


# ---------------------------------------------------------------------------
# 语义动作库：move -> (plan, layout, enter, exit, hold, decor, treat, cam, trans)
# plan 决定配色世界与素材池，move 决定这一句"怎么出现"。
# ---------------------------------------------------------------------------
MOVES = {
    # —— 记录 / 变量 / 数据：终端解码，条码与括号像档案 ——
    "record":        ("data", "vcols",    "type",     "backspace",  "still",     ["brackets", "barcode"],            "none",        "push",      "none", None),
    "record-lost":   ("data", "vcols",    "type",     "slideOutL",  "still",     ["brackets", "indexNum"],           "none",        "panL",      "none", None),
    "record-hand":   ("data", "vcols",    "strokeDraw", "dissolve", "still",     ["scribbleUnder", "barcode"],        "marker",      "push",      "none", None),
    "record-repeat": ("data", "columnsBig", "assemble", "dissolve", "breathe",  ["dataColumns", "watermarkKanji"],   "outline",     "pullOut",   "none", None),
    "recursion":     ("data", "spiral",   "type",     "dissolve",  "drift",     ["ruledLines"],                     "monoGrid",    "spiralIn",  "none", None),
    # —— 恐惧 / 血管 / 电击：色散、波形、锐角 ——
    "shock":         ("dark", "diag",     "zoom",     "slashOut",   "glitchtick", ["waveLine"],                      "neonOutline", "beatPunch", "none", None),
    "vessel":        ("dark", "zigzag",   "slice",    "dissolve",   "jitter",    ["waveform", "waveLine"],           "none",        "handheld",  "none", None),
    "smoke":         ("dark", "vcols",    "riseMask", "hazeOut",    "float",     ["smoke", "risingParticles"],       "none",        "floatNoise", "none", None),
    "chain":         ("dark", "vcols",    "trackIn",  "zipOut",     "sway",      ["speedCorner", "brackets"],        "outline",     "dollyIn",   "none", None),
    # —— 消去：橡皮擦掉字，逐次删不干净 ——
    "erase-1":       ("dark", "center",   "cut",      "eraserOut",  "still",     ["brackets"],                       "none",        "push",      "none", None),
    "erase-2":       ("dark", "center",   "cut",      "eraserOut",  "still",     ["brackets", "indexNum"],          "none",        "push",      "none", None),
    "erase-3":       ("dark", "center",   "cut",      "backspace",  "jitter",    ["brackets", "indexNum", "grid"],  "none",        "push",      "none", None),
    "erase-4":       ("dark", "columnsBig", "cut",    "backspace",  "glitchtick", ["brackets", "indexNum", "grid"],  "glitchSplit", "dollyIn",   "none", None),
    "erase-5":       ("dark", "columnsBig", "cut",    "backspace",  "glitchtick", ["grid", "crosshair"],             "glitchSplit", "dollyIn",   "none", None),
    "erase-6":       ("dark", "columnsBig", "cut",    "shatterLite", "glitchJump", ["grid", "crosshair", "shapes"],  "glitchSplit", "stepZoom",  "none", None),
    "erase-7":       ("dark", "scatter",  "cut",      "shatterLite", "glitchJump", ["shapes", "crosshair"],           "glitchSplit", "crashZoom", "none", None),
    "erase-8":       ("dark", "scatter",  "cut",      "shatterLite",    "glitchJump", ["shapes", "crosshair", "dots"],   "glitchSplit", "crashZoom", "none", None),
    "persist":       ("dark", "condensed", "assemble", "shatterLite",    "glitchJump", ["crosshair", "shapes", "dots"],    "emphasisDots", "crashZoom", "none", None),
    # —— 坏掉的嗓子 / 三日月 ——
    "broken-voice":  ("dark", "vcols",    "scramble", "shatterLite",    "jitter",    ["waveform"],                      "glitchSplit", "handheld",  "none", None),
    "no-columns":    ("dark", "scatter",  "assemble", "scatter",    "glitchtick", ["shapes"],                        "glitchSplit", "earthquake", "none", None),
    "chair":         ("dark", "lowerThird", "type",   "dissolve",  "dangle",    ["ruledLines"],                     "none",        "pendulumSway", "none", None),
    "crescent":      ("dark", "arcTop",   "resolve",  "dissolve",   "rotateSlow", ["orbitDots"],                     "outline",     "orbitDrift", "none", None),
    "short-stamp":   ("dark", "huge",     "stamp",    "cut",        "still",     ["brackets"],                       "none",        "push",      "none", None),
    # —— 逼近：一句逼近八次，字越来越近、越来越碎 ——
    "near-1":        ("mono", "perspective",     "cut",      "cut",        "still",     ["brackets"],                       "none",        "push",      "none", None),
    "near-2":        ("mono", "perspective",     "cut",      "cut",        "still",     ["brackets", "indexNum"],          "none",        "push",      "none", None),
    "near-3":        ("mono", "perspective",     "cut",      "cut",        "jitter",    ["brackets", "indexNum", "grid"],  "outline",     "dollyIn",   "none", None),
    "near-4":        ("mono", "perspective",     "cut",      "slice",      "jitter",    ["grid", "crosshair"],              "outline",     "stepZoom",  "none", None),
    "near-5":        ("mono", "perspective",     "cut",      "slice",      "glitchtick", ["grid", "crosshair"],             "glitchSplit", "crashZoom", "none", None),
    "near-6":        ("mono", "perspective",     "cut",      "shatterLite", "glitchJump", ["crosshair", "shapes"],           "glitchSplit", "crashZoom", "none", None),
    "near-7":        ("mono", "perspective",     "cut",      "shatterLite", "glitchJump", ["crosshair", "shapes", "dots"],  "glitchSplit", "crashZoom", "none", None),
    "near-8":        ("mono", "perspective",     "cut",      "shatterLite",    "glitchJump", ["shapes", "dots", "brackets"],    "glitchSplit", "crashZoom", "none", None),
    "arrival":       ("mono", "perspective",     "assemble", "shatterLite",    "glitchJump", ["radar", "speedCorner"],           "neonOutline", "crashZoom", "none", None),
    # —— 燃烧 / 棺桶 / 骸骨 ——
    "weep":          ("red",  "vcols",    "waveIn",   "dissolve",  "breathe",   ["rainStreaks"],                    "none",        "push",      "none", None),
    "flag":          ("red",  "vcols",    "riseMask", "burn",       "windGust",  ["sparks", "risingParticles"],      "gradientV",   "tiltUp",    "none", None),
    "kiss":          ("red",  "center",   "inkDrop",  "dissolve",  "still",     ["rings"],                          "circled",     "push",      "none", None),
    "coffin":        ("red",  "staircase", "dropMask", "sinkMask",  "drift",     ["ruledLines", "risingParticles"],             "none",        "tiltDown",  "none", None),
    # —— 低语 ——
    "whisper-1":     ("dark", "vcols",    "blur",     "blurOutStagger", "jitter", ["brackets"],                    "none",        "handheld",  "none", None),
    "whisper-2":     ("dark", "vcols",    "blur",     "blurOutStagger", "scanBand", ["brackets"],                   "none",        "handheld",  "none", None),
    "whisper-3":     ("dark", "vcols",    "blur",     "dissolve",  "glitchtick", ["brackets"],                   "none",        "handheld",  "none", None),
    "whisper-4":     ("dark", "vcols",    "blur",     "dissolve",  "glitchtick", ["brackets", "dots"],            "none",        "handheld",  "none", None),
    "whisper-5":     ("dark", "vcols",    "blur",     "dissolve",  "glitchJump", ["brackets", "dots"],            "glitchSplit", "handheld",  "none", None),
    "whisper-6":     ("dark", "vcols",    "blur",     "dissolve",   "glitchJump", ["dots"],                        "glitchSplit", "handheld",  "none", None),
    "whisper-7":     ("dark", "vcols",    "blur",     "dissolve",   "glitchJump", ["dots", "crosshair"],            "glitchSplit", "handheld",  "none", None),
    "whisper-8":     ("dark", "vcols",    "blur",     "hazeOut",    "glitchJump", ["dots", "crosshair", "shapes"],   "glitchSplit", "handheld",  "none", None),
    "whisper-last":  ("dark", "vcols",    "blur",     "hazeOut",    "glitchtick", ["crosshair", "shapes"],          "monoGrid",    "handheld",  "none", None),
    # —— 理想乡 / 沉船 ——
    "future":        ("red",  "vcols",    "riseMask", "dissolve",  "float",     ["sunRays"],                       "gradientV",   "pullOut",   "none", None),
    "ideal":         ("red",  "arcTop",   "assemble", "dissolve",  "float",     ["lightLeak"],                     "none",        "floatNoise", "none", None),
    "unison":        ("red",  "columnsBig", "assemble", "dissolve", "beatHop",  ["ruledLines"],                    "none",        "push",      "none", None),
    "wreck":         ("red",  "condensed",     "tornJoin", "shatterLite",    "glitchtick", ["smoke", "shapes"],              "glitchSplit", "earthquake", "none", None),
    # —— 黑星：字绕着星走 ——
    "star-1":        ("mono", "orbit",    "resolve",  "dissolve",  "orbitSmall", ["orbitDots"],                    "outline",     "orbitDrift", "none", None),
    "star-2":        ("mono", "orbit",    "resolve",  "dissolve",  "orbitSmall", ["orbitDots", "dots"],            "outline",     "orbitDrift", "none", None),
    "star-3":        ("mono", "orbit",    "resolve",  "dissolve",  "rotateSlow", ["orbitDots", "constellation"],   "outline",     "orbitDrift", "none", None),
    "star-4":        ("mono", "orbit",    "resolve",  "glitch",      "rotateSlow", ["orbitDots", "constellation"],   "glitchSplit", "spiralIn",  "none", None),
    "star-5":        ("mono", "orbit",    "resolve",  "glitch",      "glitchJump", ["orbitDots", "constellation", "shapes"], "glitchSplit", "spiralIn", "none", None),
    "star-6":        ("mono", "orbit",    "resolve",  "glitch",      "glitchJump", ["orbitDots", "constellation", "shapes", "dots"], "glitchSplit", "spiralIn", "none", None),
    "star-7":        ("mono", "orbit",    "resolve",  "glitch",      "glitchJump", ["orbitDots", "constellation", "shapes", "dots"], "glitchSplit", "spiralIn", "none", None),
    "star-8":        ("mono", "orbit",    "resolve",  "glitch",      "glitchJump", ["constellation", "shapes", "dots", "crosshair"], "glitchSplit", "spiralIn", "none", None),
    "gaze-them":     ("mono", "center",   "resolve",  "dissolve",  "focusRack", ["reticle", "orbitDots"],           "emphasisDots", "focusIn",  "none", None),
    "gaze-self":     ("mono", "center",   "resolve",  "dissolve",  "glitchJump", ["reticle", "orbitDots", "crosshair"], "emphasisDots", "focusIn", "none", None),
    # —— 闪光 / 告别钟 ——
    "flash":         ("red",  "diag",     "overexpose", "overexposeOut", "flashBox", ["lightLeak"],                  "glow",        "beatPunch", "none", None),
    "bell":          ("dark", "center",   "shutter", "clockOut",   "still",     ["rings"],                         "outline",     "pullOut",   "none", None),
    # —— 历史成砂 ——
    "history":       ("dark", "columnsBig", "brushReveal", "dissolve", "drift", ["watermarkKanji", "ruledLines"], "none",     "pullOut",   "none", None),
    "sand":          ("dark", "vcols",    "brushReveal", "sandOut", "drift",     ["risingParticles"],              "none",        "tiltUp",    "none", None),
    # —— 澄瞳 / 星 ——
    "clear-eye":     ("light", "vcols", "fadeStagger",    "dissolve",  "focusRack", ["reticle"],                     "outline",     "focusIn",   "none", None),
    "ask-star":      ("light", "arcTop",   "resolve",   "dissolve",  "orbitSmall", ["constellation"],               "none",        "orbitDrift", "none", None),
    # —— 悲伤成盐 ——
    "grief":         ("dark", "vcols",    "type",      "dissolve",   "breathe",   ["rainRipples"],                  "none",        "pullOut",   "none", None),
    "salt":          ("light", "dotMatrix", "assemble", "sandOut", "glintSweep", ["cropMarks", "dimension"],     "none",        "focusIn",   "none", None),
    # —— 祈祷与价值 ——
    "pray":          ("light", "columnsBig", "riseMask", "dissolve", "breathe", ["seal", "ruledLines"],           "none",        "push",      "none", None),
    "value":         ("light", "priceTag", "stamp",    "tearOut",    "still",     ["indexNum", "timecodeBar"],     "boxed",       "push",      "none", None),
    # —— 背向 / 悲鸣 ——
    "turn-1":        ("dark", "mirror",   "flipX",     "dissolve",  "still",     ["brackets"],                      "none",        "push",      "none", None),
    "turn-2":        ("dark", "mirror",   "flipX",     "dissolve",  "jitter",    ["brackets"],                      "none",        "push",      "none", None),
    "turn-3":        ("dark", "mirror",   "flipX",     "blurOutStagger", "jitter", ["brackets", "dots"],             "none",        "push",      "none", None),
    "turn-4":        ("dark", "mirror",   "flipX",     "blurOutStagger", "scanBand", ["brackets", "dots", "crosshair"], "glitchSplit", "handheld", "none", None),
    "turn-5":        ("dark", "mirror",   "flipX",     "dissolve",   "glitchtick", ["dots", "crosshair"],           "glitchSplit", "handheld",  "none", None),
    "turn-6":        ("dark", "mirror",   "flipX",     "dissolve",   "glitchJump", ["dots", "crosshair", "shapes"],  "glitchSplit", "handheld",  "none", None),
    "turn-7":        ("dark", "mirror",   "flipX",     "sandOut",    "glitchJump", ["crosshair", "shapes"],         "glitchSplit", "handheld",  "none", None),
    "scream":        ("dark", "condensed",     "tornJoin",  "shatterLite",    "glitchJump", ["crosshair", "shapes"],          "glitchSplit", "shakeHard", "none", None),
    # —— 自我意识之海 / 细胞回海 ——
    "release":       ("sea",  "vcols",    "riseMask",  "dissolve",  "float",     ["waveLine"],                     "reflection",  "pullOut",   "none", None),
    "fish":          ("sea",  "depthStack", "assemble", "dissolve", "float",     ["risingParticles", "waveLine"],  "none",        "floatNoise", "none", None),
    "swim":          ("sea",  "spiral",   "resolve",   "dissolve",  "float",     ["waveLine", "seigaiha"],          "none",        "spiralIn",  "none", None),
    "blood":         ("sea",  "vcols",    "inkBleed",  "sandOut",      "jitter",    ["scribbleUnder"],                 "glitchSplit", "handheld",  "none", None),
    "cells":         ("sea",  "depthStack", "riseMask", "dissolve", "float",     ["risingParticles", "waveLine"],  "none",        "floatNoise", "none", None),
    "sticky":        ("sea",  "vcols",    "blur",      "dissolve",  "jitter",    ["scribbleUnder", "dots"],        "glitchSplit", "handheld",  "none", None),
    # —— 燕 / 灰云 / 记忆 ——
    "swallow":       ("light", "arcTop",  "strokeDraw", "dissolve", "orbitSmall", ["scribbleUnder"],              "marker",      "orbitDrift", "none", None),
    "trace-cloud":   ("light", "vcols",   "brushReveal", "dissolve", "drift",   ["smoke", "lightLeak"],            "none",        "floatNoise", "none", None),
    # —— 名誉 / 希望 ——
    "weave":         ("light", "columnsBig", "assemble", "dissolve", "breathe", ["ruledLines"],                  "none",        "push",      "none", None),
    "stain":         ("light", "vcols",   "inkDrop",   "dissolve",  "still",     ["scribbleCircle"],               "marker",      "focusIn",   "none", None),
    # —— 手与梦 ——
    "hands":         ("light", "arcTop",  "strokeDraw", "dissolve", "float",     ["scribbleUnder"],                "none",        "pullOut",   "none", None),
    "kill-dream":    ("light", "vcols",   "cut",       "shatterLite",    "glitchtick", ["shapes"],                       "glitchSplit", "handheld",  "none", None),
    # —— 核心：热异常 ——
    "thought-end":   ("red",  "vcols",    "type",      "dissolve",  "breathe",   ["ruledLines"],                   "none",        "push",      "none", None),
    "heat":          ("red",  "vcols",    "heatHaze",  "melt",       "glitchJump", ["sparks", "risingParticles"],    "none",        "push",      "none", None),
    # —— 现实崩坏 ——
    "refuse-1":      ("red",  "condensed",     "glitchIn",  "shatterLite", "glitchJump", ["crosshair"],                   "glitchSplit", "shakeHard", "none", None),
    "refuse-2":      ("red",  "condensed",     "glitchIn",  "shatterLite", "glitchJump", ["crosshair", "shapes"],          "glitchSplit", "shakeHard", "none", None),
    "refuse-3":      ("red",  "condensed",     "glitchIn",  "shatterLite",    "glitchJump", ["crosshair", "shapes", "dots"],   "glitchSplit", "shakeHard", "none", None),
    "refuse-4":      ("red",  "condensed",     "glitchIn",  "shatterLite",    "glitchJump", ["crosshair", "shapes", "dots", "brackets"], "glitchSplit", "earthquake", "none", None),
    "endure":        ("red",  "condensed",     "tornJoin",  "shatterLite",    "glitchJump", ["shapes", "dots", "crosshair"],  "glitchSplit", "shakeHard", "none", None),
}

# 计划族：配色世界 + 素材池 + 效果参数。style/schemes 决定字色与底色是否贴合背景。
# 配色世界必须和影片自己的调色板是一家人（src/palette.mjs）：
#   mint #9DE4C2 / orange #ED8B50 / red #D93B4A / pink #E9ACC8 / paper #E9EDE5 / black #090C13
# 之前用的糖果粉与薄荷绿是 JIZURA 自带的默认色，铺成大色块时会和影片的暖调完全打架。
# colors.enabled 让每个配色世界的主方案改用影片的底色/字色，
# accent 再由引擎按底色重新提亮，保证对比度够但不再跑色。
#
# 每个家族有两种"极性"（polarity），同一句话用哪一种由实测决定：
#   A 族名本身   —— 深底板 + 浅字（黑底纸白字），压在暗画面上稳
#   B 族名 + Alt —— 纸白底板 + 深墨字（纸白底黑字），压在亮画面上稳
# 两者的 accent 都取自影片调色板，字与底板之间的对比度由家族保证。
#
# 「light」家族是反过来的：它本来就属于亮场景（白色记忆房间），
# 默认就是墨色的纸底深字，翻转极性才用暗底浅字。
#
# 引擎里 sc.ink（版式元素：底板、框、色带用的颜色）不随 colors 变化，
# 所以每种极性要配一个 sc.ink 方向一致的风格：暗底配浅墨的风格，
# 纸底配深墨的风格。style 也决定字体与纸纹，所以这不只是换个颜色。
PLANS = {
    "data":  {"style": "hud",     "schemes": [0],
              "colors": {"enabled": True, "bg": "#090C13", "fg": "#E9EDE5", "sub": "#C8CCD1",
                         "accentOn": True, "accent": "#9DE4C2", "ghostA": "#9DE4C2", "ghostB": "#ED8B50"},
              "fx": {"motion": 0.55, "glitch": 0.25, "chroma": 0.28, "decor": 0.40, "density": 0.45, "texture": 0.45, "flash": False, "koma": 12, "hud": "off"}},
    "dark":  {"style": "noir",    "schemes": [0],
              "colors": {"enabled": True, "bg": "#090C13", "fg": "#E9EDE5", "sub": "#C8CCD1",
                         "accentOn": True, "accent": "#ED8B50", "ghostA": "#9DE4C2", "ghostB": "#D93B4A"},
              "fx": {"motion": 0.60, "glitch": 0.38, "chroma": 0.34, "decor": 0.40, "density": 0.45, "texture": 0.45, "flash": False, "koma": 12, "hud": "off"}},
    "red":   {"style": "crimson", "schemes": [0],
              "colors": {"enabled": True, "bg": "#2A0A12", "fg": "#F2EDE8", "sub": "#E9ACC8",
                         "accentOn": True, "accent": "#ED8B50", "ghostA": "#D93B4A", "ghostB": "#E9ACC8"},
              "fx": {"motion": 0.68, "glitch": 0.42, "chroma": 0.38, "decor": 0.45, "density": 0.50, "texture": 0.45, "flash": False, "koma": 12, "hud": "off"}},
    "mono":  {"style": "mono",    "schemes": [0],
              "colors": {"enabled": True, "bg": "#090C13", "fg": "#E9EDE5", "sub": "#C8CCD1",
                         "accentOn": True, "accent": "#D93B4A", "ghostA": "#C8CCD1", "ghostB": "#9DE4C2"},
              "fx": {"motion": 0.72, "glitch": 0.50, "chroma": 0.55, "decor": 0.45, "density": 0.55, "texture": 0.40, "flash": False, "koma": 12, "hud": "off"}},
    "sea":   {"style": "ocean",   "schemes": [0],
              "colors": {"enabled": True, "bg": "#04121C", "fg": "#E9EDE5", "sub": "#C8CCD1",
                         "accentOn": True, "accent": "#1FD2E6", "ghostA": "#7FF6FF", "ghostB": "#294F4C"},
              "fx": {"motion": 0.58, "glitch": 0.22, "chroma": 0.30, "decor": 0.40, "density": 0.45, "texture": 0.45, "flash": False, "koma": 12, "hud": "off"}},
    # 亮场景（白色记忆房间）：默认就是纸底深墨，朱红做强调。
    "light": {"style": "sumi",    "schemes": [0],
              "colors": {"enabled": True, "bg": "#E9EDE5", "fg": "#16130F", "sub": "#5E574C",
                         "accentOn": True, "accent": "#B83A22", "ghostA": "#9A9284", "ghostB": "#CC4A2E"},
              "fx": {"motion": 0.45, "glitch": 0.12, "chroma": 0.16, "decor": 0.30, "density": 0.35, "texture": 0.30, "flash": False, "koma": 12, "hud": "off"}},
}

# ---------------------------------------------------------------------------
# 极性 B：纸白底板 + 深墨字。
#
# 影片有些地方是亮背景——燃烧段整片红天空、白色记忆房间。近白的字压在亮红上
# 只有 1.5:1 的对比度，等于没唱出来；反过来，深墨字压在暗画面上同样会消失。
# 所以每个家族都备一个翻过来的极性，用哪一种由 tools/jizura_variant_probe.mjs
# 实测两种极性在真实画面上的对比度后决定，不靠手写名单。
# 颜色仍取自影片调色板：纸白 #E9EDE5 / 墨 #16130F，强调色按家族压深。
# ---------------------------------------------------------------------------
ALT_ACCENT = {"data": "#2F6F63", "dark": "#8E3A1E", "red": "#8E2A16",
              "mono": "#7A1F14", "light": "#B83A22", "sea": "#0E5A66"}
# 纸底极性（Alt）沿用家族自己的风格，只把底板与字色翻过来——换风格会连字体和
# 纸纹一起换掉，测出来的差异就分不清是颜色还是字形造成的。
# 「light」家族反过来：它默认就是纸底深墨，翻转极性才换成暗底浅字，
# 这里用 noir（sc.ink 是浅色，与暗底一致）。
for _name, _plan in list(PLANS.items()):
    if _name == "light":
        PLANS["lightAlt"] = {
            "style": "noir", "schemes": [0],
            "colors": {"enabled": True, "bg": "#090C13", "fg": "#E9EDE5", "sub": "#C8CCD1",
                       "accentOn": True, "accent": "#B83A22", "ghostA": "#9A9284", "ghostB": "#CC4A2E"},
            "fx": dict(_plan["fx"]),
        }
        continue
    PLANS[_name + "Alt"] = {
        "style": _plan["style"], "schemes": _plan["schemes"],
        "colors": {"enabled": True, "bg": "#E9EDE5", "fg": "#16130F", "sub": "#5E574C",
                   "accentOn": True, "accent": ALT_ACCENT.get(_name, "#8E3A1E"),
                   "ghostA": "#9A9284", "ghostB": "#CC4A2E"},
        "fx": dict(_plan["fx"]),
    }

# 每个家族的两极性：探针在两者之间实测择优，导演表只记家族与选中的计划名。
POLARITIES = {name: [name, name + "Alt"] for name in ("data", "dark", "red", "mono", "light", "sea")}

# ---------------------------------------------------------------------------
# 逐行分配：行号(1-based) -> move，另有 emphasis / 断句 / キメ 覆盖。
# emphasis 会以 *词* 写进 LRC（引擎用它加权选题与加强事件）。
# cut_breaks 把一句切成多个 cut（按 "/" 分句），配合 cutTech 单独处理某个分句。
# ---------------------------------------------------------------------------
ASSIGN = {}
for i in range(1, 5):
    ASSIGN[i] = "record"
ASSIGN[2] = "record"
ASSIGN[3] = "record-lost"
ASSIGN[4] = "record-hand"
ASSIGN[5], ASSIGN[6], ASSIGN[7], ASSIGN[8] = "shock", "vessel", "smoke", "chain"
for i, move in enumerate(["erase-1", "erase-2", "erase-3", "erase-4", "erase-5", "erase-6", "erase-7", "erase-8"]):
    ASSIGN[9 + i] = move
ASSIGN[17] = "persist"
ASSIGN[18], ASSIGN[19], ASSIGN[20], ASSIGN[21], ASSIGN[22] = "broken-voice", "no-columns", "chair", "crescent", "short-stamp"
for i, move in enumerate(["near-1", "near-2", "near-3", "near-4", "near-5", "near-6", "near-7", "near-8"]):
    ASSIGN[23 + i] = move
ASSIGN[31] = "arrival"
ASSIGN[32], ASSIGN[33], ASSIGN[34], ASSIGN[35], ASSIGN[36] = "weep", "flag", "kiss", "coffin", "short-stamp"
for i, move in enumerate(["whisper-1", "whisper-2", "whisper-3", "whisper-4", "whisper-5", "whisper-6", "whisper-7", "whisper-8"]):
    ASSIGN[37 + i] = move
ASSIGN[45] = "whisper-last"
ASSIGN[46], ASSIGN[47], ASSIGN[48], ASSIGN[49] = "future", "ideal", "unison", "wreck"
for i, move in enumerate(["star-1", "star-2", "star-3", "star-4", "star-5", "star-6", "star-7", "star-8"]):
    ASSIGN[50 + i] = move
ASSIGN[58] = "gaze-them"
ASSIGN[59], ASSIGN[60] = "flash", "bell"
ASSIGN[61], ASSIGN[62] = "history", "sand"
ASSIGN[63], ASSIGN[64] = "record-repeat", "record-repeat"
ASSIGN[65], ASSIGN[66] = "clear-eye", "ask-star"
ASSIGN[67], ASSIGN[68] = "grief", "salt"
ASSIGN[69], ASSIGN[70] = "pray", "value"
for i, move in enumerate(["turn-1", "turn-2", "turn-3", "turn-4", "turn-5", "turn-6", "turn-7"]):
    ASSIGN[71 + i] = move
ASSIGN[78] = "scream"
ASSIGN[79], ASSIGN[80], ASSIGN[81], ASSIGN[82] = "release", "fish", "swim", "blood"
for i, move in enumerate(["star-1", "star-2", "star-3", "star-4", "star-5", "star-6", "star-7", "star-8"]):
    ASSIGN[83 + i] = move
ASSIGN[91] = "gaze-self"
for i, move in enumerate(["recursion", "recursion", "recursion", "recursion"]):
    ASSIGN[92 + i] = move
ASSIGN[96], ASSIGN[97] = "cells", "sticky"
ASSIGN[98], ASSIGN[99] = "swallow", "trace-cloud"
ASSIGN[100], ASSIGN[101] = "weave", "stain"
ASSIGN[102], ASSIGN[103] = "clear-eye", "ask-star"
ASSIGN[104], ASSIGN[105] = "hands", "kill-dream"
ASSIGN[106], ASSIGN[107] = "thought-end", "heat"
ASSIGN[108], ASSIGN[109], ASSIGN[110], ASSIGN[111] = "refuse-1", "refuse-2", "refuse-3", "refuse-4"
ASSIGN[112] = "endure"
for i in range(5):
    ASSIGN[113 + i] = ["broken-voice", "no-columns", "chair", "crescent", "short-stamp"][i]
for i, move in enumerate(["near-3", "near-4", "near-5", "near-6", "near-7", "near-8", "near-8", "near-8"]):
    ASSIGN[118 + i] = move
ASSIGN[126] = "arrival"

# 强调词（词义落点）与断句（一行拆成多个 cut）里带歌词原文，属权利方内容：
# 放在本地 data/jizura_lyric_marks.json（不入库）。
# 缺少该文件时导演表仍能生成，只是不带强调与分句——版式与配色不受影响。
def load_lyric_marks():
    path = os.path.join(ROOT, "data", "jizura_lyric_marks.json")
    if not os.path.exists(path):
        return {}, {}
    with open(path, encoding="utf-8") as handle:
        doc = json.load(handle)
    emphasis = {int(k): v for k, v in (doc.get("emphasis") or {}).items()}
    breaks = {int(k): v for k, v in (doc.get("breaks") or {}).items()}
    return emphasis, breaks


EMPHASIS, BREAKS = load_lyric_marks()

# キメ行：JIZURA 会给它加强事件（配合 fx 开关）。
KIME = {107, 108, 109, 110, 111, 112, 126}

# 计划覆盖：同一句语义动作在不同背景上要用不同配色世界。
# 浅色（sumi 纸白）只在真正的明亮场景里用——白色记忆房间。
# 其余暗场一律用浅字方案，否则墨字会消失在夜景里。
PLAN_OVERRIDE = {
    65: "mono", 66: "mono",        # 澄瞳／远星：黑星夜空，浅字
    67: "dark", 68: "dark",        # 悲伤成盐：橙红观测站，浅字
    69: "dark", 70: "dark",        # 祈祷与价值：青绿数据空间，浅字
    100: "dark", 101: "dark",      # 编造名誉：橙红场景，浅字
}

# 「字在人后」不再靠手写清单，而是按镜头覆盖算：
#   · 这一行主要落在眼部／手部插入镜头上（画面主体就是那只眼睛或那只手）→ 必须放前层
#   · 主要镜头是 wide / abstract / world（人物不在画面中心）→ 可以退到人物之后
# 算出来的 behind 行，正好落在黑星Ⅰ／Ⅱ、白房间、逼近与核心这几组抽象构图里。
BACKGROUND_OK_MODES = ("wide", "abstract", "world")
INSERT_LIMIT = 0.35      # 插入镜头占比超过这个比例，字就必须让开中心
INSERT_HEAVY_LIMIT = 0.5  # 插入镜头过半，才算"整行都在特写里"

# 会压住主体、或把字裁出画面的版式：特写行里不用。
BLEED_LAYOUTS = {"huge", "sideways", "typeSpecimen", "stack"}

# 两个分句叠在同一处的版式：交接时必须瞬间切，否则两句同时压在画面中央。
# 其余版式把分句放在不同位置（竖排、分栏、斜带、弧顶、点阵、镜像、螺旋…），
# 让前一句溶解退场不会叠字。
OVERLAPPING_LAYOUTS = {"center", "huge", "condensed", "perspective"}

# 递进强度：重复段越往后越碎、越偏。这些值在渲染时逐行覆盖计划的 fx。
FX_OVERRIDE = {
    "erase-2": {"chroma": 0.42}, "erase-3": {"chroma": 0.5}, "erase-4": {"chroma": 0.58, "glitch": 0.52},
    "erase-5": {"chroma": 0.64, "glitch": 0.6}, "erase-6": {"chroma": 0.7, "glitch": 0.68},
    "erase-7": {"chroma": 0.78, "glitch": 0.76}, "erase-8": {"chroma": 0.86, "glitch": 0.84},
    "near-2": {"chroma": 0.5}, "near-3": {"chroma": 0.58, "glitch": 0.42},
    "near-4": {"chroma": 0.66, "glitch": 0.5}, "near-5": {"chroma": 0.74, "glitch": 0.58},
    "near-6": {"chroma": 0.82, "glitch": 0.66}, "near-7": {"chroma": 0.9, "glitch": 0.74},
    "near-8": {"chroma": 0.98, "glitch": 0.82},
    "whisper-2": {"glitch": 0.3}, "whisper-3": {"glitch": 0.38}, "whisper-4": {"glitch": 0.46},
    "whisper-5": {"glitch": 0.54, "chroma": 0.42}, "whisper-6": {"glitch": 0.62, "chroma": 0.5},
    "whisper-7": {"glitch": 0.7, "chroma": 0.58}, "whisper-8": {"glitch": 0.8, "chroma": 0.66},
    "turn-2": {"glitch": 0.34}, "turn-3": {"glitch": 0.42}, "turn-4": {"glitch": 0.5, "chroma": 0.44},
    "turn-5": {"glitch": 0.58, "chroma": 0.52}, "turn-6": {"glitch": 0.66, "chroma": 0.6},
    "turn-7": {"glitch": 0.74, "chroma": 0.68},
    "refuse-1": {"glitch": 0.72, "chroma": 0.7}, "refuse-2": {"glitch": 0.8, "chroma": 0.78},
    "refuse-3": {"glitch": 0.88, "chroma": 0.86}, "refuse-4": {"glitch": 0.95, "chroma": 0.94},
    "endure": {"glitch": 0.98, "chroma": 1.0},
    "arrival": {"glitch": 0.66, "chroma": 0.8},
    "star-5": {"chroma": 0.7}, "star-6": {"chroma": 0.78}, "star-7": {"chroma": 0.86}, "star-8": {"chroma": 0.94},
    "persist": {"glitch": 0.8, "chroma": 0.85},
    "scream": {"glitch": 0.85, "chroma": 0.9},
}

# 间奏：没有歌词的两段长空白，各给一套安静或仪表化的装饰。
INTERLUDES = [
    {"decor": ["lightLeak", "risingParticles", "kasumi"], "plane": "back", "note": "小记忆：窗光与浮尘，字层退到人物之后"},
    {"decor": ["waveform", "dataColumns", "timecodeBar"], "plane": "front", "note": "信号研究：仪表波形与数据列，像设备在自检"},
]

# 每个分句的单独处理：行号 -> {分句序号: {layout/enter/treat/...}}
CUT_TECH = {
    # 熱異常：中间那一句才是核心，前后两句只做陪衬，而且立刻清场，
    # 免得三段叠在一起变成一团看不懂的线框。
    107: {0: {"layout": "vcols", "exit": "cut", "treat": "none"},
          1: {"layout": "condensed", "enter": "heatHaze", "treat": "glow", "hold": "glitchJump", "cam": "crashZoom"},
          2: {"layout": "vcols", "exit": "cut", "treat": "none"}},
    109: {1: {"layout": "condensed", "enter": "glitchIn", "treat": "glitchSplit", "exit": "shatterLite", "cam": "shakeHard"}},
    110: {1: {"layout": "condensed", "enter": "glitchIn", "treat": "glitchSplit", "exit": "shatterLite", "cam": "shakeHard"}},
    111: {1: {"layout": "condensed", "enter": "glitchIn", "treat": "glitchSplit", "exit": "shatterLite", "cam": "shakeHard"}},
    112: {1: {"layout": "condensed", "enter": "tornJoin", "treat": "glitchSplit", "exit": "shatterLite", "cam": "shakeHard"}},
    31:  {1: {"layout": "perspective", "enter": "assemble", "treat": "neonOutline", "cam": "crashZoom"}},
    66:  {1: {"layout": "center", "enter": "resolve", "treat": "emphasisDots", "cam": "focusIn"}},
}

# 每一行的设计说明（写进 JSON，便于复查"为什么这一行是这个效果"）。
NOTES = {
    1: "死变量：字像终端逐字解码，条码与括号把它标成一条记录",
    3: "无处可投：字滑出画面左缘，像找不到收件地址",
    4: "记录独白：手写描边，笔迹比机器更私人",
    5: "如雷击：推近 + 霓虹描边，一击即亮",
    6: "血管：锯齿折线 + 波形装饰，字在体内乱走",
    7: "浓烟：从下往上浮起，烟尘装饰遮住远处",
    8: "锁链：横向切入，退出时拉链抽走",
    9: "消去·1：干净居中，橡皮擦掉——第一次删除",
    13: "消去·5：换成多栏，删除开始留下栅格残迹",
    16: "消去·8：字散成碎片，删除反而撕碎句子",
    17: "不会消失：整字砸下并震碎，是这一段的反转",
    18: "哑嗓：字符乱码化，声音已经不成句子",
    19: "不成列：散排 + 地震机位，队列崩了",
    20: "安乐椅：下三分之一，吊摆式晃动",
    21: "三日月：顶部弧线，绕着一轮残月",
    23: "逼近·1：巨字静止，镜头缓慢推进",
    30: "逼近·8：字压满画面并碎裂，最接近的一次",
    31: "有东西来了：雷达扫描 + 霓虹巨字",
    33: "救赎之旗：火粒子上升，字被烤得发红",
    34: "献吻：墨滴落下，圈出被吻过的地方",
    35: "棺椁：阶梯下沉，像一段一段掉进箱底",
    37: "低语·1：小字、模糊，几乎读不出",
    44: "低语·8：字彻底化成雾",
    46: "未来永劫：上升的光，理想乡还没塌",
    49: "船爆了：斜切排版 + 撕裂入场 + 碎裂",
    50: "黑星·1：字绕着星走，轨道点标出轨迹",
    58: "他们在看：准星锁住，视线钉在观者身上",
    59: "闪光：过曝白闪，是这一段的爆点",
    60: "钟：钟表扫入，钟形收场",
    61: "历史：笔刷刷出，像拓印一段被写下的历史",
    62: "答案像砂：字散成沙粒飘走",
    65: "澄澈的眼：文字退到两侧，中央留给人眼",
    66: "问星：弧线排列，视线跟着弧走",
    68: "盐：点阵结晶 + 裁切标注，像标本",
    70: "终有价值：贴上编号与价签，框起来",
    71: "背向：镜像翻转，字转过身去",
    78: "悲鸣：撕裂入场 + 碎裂 + 硬机位",
    81: "在自我意识的海里游泳：螺旋轨迹",
    82: "血腥味：墨渗出并流干",
    96: "细胞回海：纵深排列，向下沉回海面",
    98: "燕的轨迹：手写描边，弧线划过",
    100: "编织名誉：栏与栏交错，像编在一起",
    104: "牵手：两道弧线在中间相遇",
    105: "杀梦：字被直接切断并打碎",
    107: "热异常：核心句，切成三段，中间那段熔化",
    108: "不是现实：故障切入，第一层崩解",
    112: "受不了：撕裂 + 硬震 + 全碎",
    126: "最后一句：与 31 呼应，但这次字绕着黑星落下",
}


def main():
    lyrics = json.load(open(os.path.join(ROOT, "data", "lyrics.json"), encoding="utf-8"))
    lines = lyrics["lines"]
    shots = json.load(open(os.path.join(ROOT, "data", "shots.json"), encoding="utf-8"))["shots"]
    # 转场吞字：后层的歌词画在场景画布里，会被画面转场整个盖掉。
    # tools/jizura_plane_audit.mjs 量出每一行落在转场里的时间比例，
    # 超过阈值的行升到前层——前层在转场之后合成，永远看得见。
    planes = {}
    plane_limit = 0.35
    planes_path = os.path.join(ROOT, "data", "jizura_planes.json")
    if os.path.exists(planes_path):
        with open(planes_path, encoding="utf-8") as handle:
            doc = json.load(handle)
        planes = {row["id"]: row for row in doc.get("lines", [])}
        plane_limit = float(doc.get("limit", plane_limit))
    # 配色极性的实测结果：tools/jizura_variant_probe.mjs 把每句话的两种极性都渲染一遍，
    # 按真实画面对比度择优。没有这个文件时全部走家族默认极性。
    variants = {}
    variants_path = os.path.join(ROOT, "data", "jizura_variants.json")
    if os.path.exists(variants_path):
        with open(variants_path, encoding="utf-8") as handle:
            doc = json.load(handle)
        variants = {row["id"]: row for row in doc.get("lines", [])}
    out_lines = []
    for index, line in enumerate(lines, start=1):
        move = ASSIGN.get(index)
        if move is None:
            raise SystemExit("line %d has no move" % index)
        plan, layout, enter, exit_, hold, decor, treat, cam, trans, _ = MOVES[move]
        n_chars = len(line["text"].replace(" ", ""))
        # 短行的出场动画会吃掉整行：JIZURA 的出场最短 0.36 秒，
        # 0.5 秒的行减去入场只剩 0.03 秒可见。短行改用最快的出场。
        line_dur = max(1e-6, line["end"] - line["time"])
        if line_dur < 1.0 and exit_ != "cut":
            exit_ = "cut" if line_dur < 0.6 else "dissolve"
        # 一行里字真正清晰可见的时间不够四成，这一行就等于没唱出来。
        # 先只砍入场（出场往往带着语义：碎裂、烧尽、雾散），砍完还是不够，
        # 才连出场一起瞬间切掉——短行宁可硬切，也不能让字只剩零点几秒。
        if legible_window(line_dur, enter, exit_, n_chars) < line_dur * 0.40:
            if legible_window(line_dur, "cut", exit_, n_chars) >= line_dur * 0.55:
                enter = "cut"
            else:
                enter, exit_ = "cut", "cut"
        # 这一行分别落在哪些镜头上、各占多久
        coverage = {}
        for s in shots:
            a, b = max(line["time"], s["start"]), min(line["end"], s["end"])
            if b - a > 1e-6:
                coverage[s["mode"]] = coverage.get(s["mode"], 0.0) + (b - a)
        duration = max(1e-6, line["end"] - line["time"])
        insert_pct = sum(v for k, v in coverage.items() if k in ("eye", "hand")) / duration
        dominant = max(coverage, key=lambda k: (coverage[k], k in BACKGROUND_OK_MODES)) if coverage else ""
        behind = insert_pct < INSERT_LIMIT and dominant in BACKGROUND_OK_MODES
        # 后层的字会被画面转场吞掉：这一行有多少时间落在转场里。
        plane = planes.get(line["id"])
        swallowed = bool(plane) and plane.get("hiddenRatio", 0.0) >= plane_limit
        if behind and swallowed:
            behind = False
        # 整行都在特写里：不用会出血或压住主体的版式，竖排靠边最稳。
        if insert_pct >= INSERT_HEAVY_LIMIT and layout in BLEED_LAYOUTS and n_chars > 4:
            layout = "vcols" if n_chars <= 18 else "condensed"
        # 配色世界：家族来自语义动作，极性（深底浅字 / 浅底深墨）来自实测。
        # tools/jizura_variant_probe.mjs 把同一句话的两种极性都渲染一遍，
        # 按真实画面对比度择优，结果写进 data/jizura_variants.json。
        family = PLAN_OVERRIDE.get(index, plan)
        variant = variants.get(line["id"])
        plan_name = family
        if variant and variant.get("plan") in PLANS:
            plan_name = variant["plan"]
        pair = POLARITIES.get(family, [family, family])
        polarity = "b" if plan_name == pair[1] else "a"
        entry = {
            "id": line["id"], "index": index - 1, "time": line["time"], "end": line["end"],
            "move": move, "family": family, "plan": plan_name, "polarity": polarity,
            "layout": layout, "enter": enter, "exit": exit_, "hold": hold,
            "decor": decor, "treat": treat, "cam": cam, "trans": trans,
            "cuts": 1,
        }
        if insert_pct >= INSERT_HEAVY_LIMIT:
            entry["insertShot"] = True
        if index in EMPHASIS:
            entry["emphasis"] = EMPHASIS[index]
        if index in BREAKS:
            parts = [p.strip() for p in BREAKS[index].split("/") if p.strip()]
            # A manual break replaces the rendered text, so the parts must spell the same line.
            if "".join(parts) != "".join(line["text"].split()):
                raise SystemExit("line %d break does not spell the lyric: %r vs %r"
                                 % (index, BREAKS[index], line["text"]))
            entry["break"] = BREAKS[index]
            entry["cuts"] = len(parts)
        if index in KIME:
            entry["kime"] = True
        # 分句交接：前一句必须清场，但「瞬间切走 + 后一句慢慢淡入」会在
        # 屏幕上留一段没有字的空档（实测 L102 在 206.02s 只剩 929 个像素）。
        # 版式把两个分句放在不同位置时（竖排、分栏、斜带、弧顶），
        # 让前一句溶解退场更稳：交接点两侧总有字，不会黑屏也不会叠成一团。
        # 版式把两个分句叠在同一处（居中、巨字、紧缩、透视）时仍然瞬间切，
        # 否则两句会同时压在画面中央。
        tech={}
        if index in CUT_TECH:
            for k, spec in CUT_TECH[index].items():
                tech.setdefault(k, {}).update(spec)
        if entry["cuts"] > 1:
            for k in range(entry["cuts"] - 1):
                spec = tech.setdefault(k, {})
                cut_layout = spec.get("layout", layout)
                if "exit" not in spec:
                    spec["exit"] = "cut" if cut_layout in OVERLAPPING_LAYOUTS else "dissolve"
        if insert_pct >= INSERT_HEAVY_LIMIT:
            for spec in tech.values():
                if spec.get("layout") in BLEED_LAYOUTS:
                    spec["layout"] = "vcols" if n_chars <= 18 else "condensed"
        # 分句各自也要够长才看得清：一个分句的时长是整行除以分句数。
        cut_dur = line_dur / max(1, entry["cuts"])
        for k, spec in tech.items():
            cut_enter = spec.get("enter", enter)
            cut_exit = spec.get("exit", exit_)
            if legible_window(cut_dur, cut_enter, cut_exit, n_chars) < cut_dur * 0.40:
                if legible_window(cut_dur, "cut", cut_exit, n_chars) >= cut_dur * 0.55:
                    spec["enter"] = "cut"
                else:
                    spec["enter"], spec["exit"] = "cut", "cut"
        if tech:
            entry["cutTech"]={str(k): spec for k, spec in tech.items()}
        if behind:
            entry["layer"] = "behind"
        elif swallowed:
            # 这一行本来该退到人物之后，但转场会把后层的字整个盖掉，
            # 所以提到前层。落在抽象/全景镜头上的行提层不会压到人脸。
            entry["layer"] = "front"
            entry["promotedFromBehind"] = round(plane.get("hiddenRatio", 0.0), 3)
        if move in FX_OVERRIDE:
            entry["fx"] = FX_OVERRIDE[move]
        if index in NOTES:
            entry["note"] = NOTES[index]
        out_lines.append(entry)

    doc = {
        "version": "v15",
        "generatedBy": "tools/build_jizura_direction.py",
        "note": "126 行日中歌词逐行的 JIZURA 语义导演表。plan 决定配色世界与素材池，"
                "move 决定版式与运动，emphasis/break/kime 写进 LRC 交给 JIZURA 的解析器。",
        "plans": PLANS,
        "polarities": POLARITIES,
        "interludes": INTERLUDES,
        "moves": {k: {"plan": v[0], "layout": v[1], "enter": v[2], "exit": v[3], "hold": v[4],
                     "decor": v[5], "treat": v[6], "cam": v[7], "trans": v[8]}
                  for k, v in MOVES.items()},
        "lines": out_lines,
    }
    path = os.path.join(ROOT, "data", "jizura_direction.json")
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(doc, handle, ensure_ascii=False, indent=1)
    counts = {}
    for entry in out_lines:
        counts[entry["plan"]] = counts.get(entry["plan"], 0) + 1
    print("wrote %s: %d lines, %d moves, %d plans %s" % (
        path, len(out_lines), len(MOVES), len(PLANS), sorted(counts.items())))


if __name__ == "__main__":
    main()
