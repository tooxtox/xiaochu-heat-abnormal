# 第二版新增图像模型素材

均使用内置 image_gen。下列为本轮实际使用的完整提示词。参考图由第一轮生成并已本地描线、重新上色。新图生成后同样调用本地 `trace_details.py`，另存原稿、线稿、轮廓 SVG 和重上色 PNG。

## 眼部特写

参考：`assets/character/expression-fear.png`。`transparent_background: false`。

Use case: identity-preserve. Production macro anime frame for Xiaochu experimental MV. Reference is exact original character design. Create an EXTREME CLOSEUP across BOTH PINK EYES of the same mint-haired anime cat-girl. Wide 16:9 landscape cinematic composition, cropped from brow level to the bridge of nose, both eyes large and clearly open with fragile worried emotion, her mint hair fringe sweeps across forehead and frames outer edge, exact gentle soft face and long lashes from reference. Whole frame filled with face, no body or ears needed in this very tight crop. Keep pink irises with fine concentric detail and small dark pupils; tiny white reflected light only, NO reflected objects, no text. Crisp dark teal hand-drawn ink, refined clean flat cel shade in mint #9DE4C2, ivory, soft peach skin and pink #E9ACC8. No painterly texture, no gradient lighting, no bloom, no grain, no background visible. This will be locally contour traced, recolored then animated; large detailed native image, natural anatomy, no horror, no red eyes, no extra eyes, no black bars or text.

输出：`eyes-original.png` → `eyes-lineart.png`、`eyes-traced.svg`、`eyes-recolored.png`。

## 手部特写

参考：`assets/character/xiaochu-original.png`。`transparent_background: true`。

Use case: identity-preserve. Production anime animation detail cutout from the original Xiaochu reference. Draw ONLY ONE delicate feminine hand and its forearm in the exact same character costume; no face, no body, no other hand. Large wide composition. The arm enters from the lower RIGHT and reaches diagonally toward upper LEFT; wrist at center-right, palm gently turned UP to hold a tiny unseen light, five natural relaxed fingers slightly curled, clean anatomy, palm readable. Include her ivory puff sleeve edge, elaborate ivory lace cuff and a MINT bow around the wrist, faithful to the referenced modest mint/ivory lolita maid dress. Wrist and cuff fully visible; forearm may crop at right border. Genuinely transparent background. Clean dark teal anime outlines, restrained flat cel shading in soft peach, ivory white, mint #9DE4C2. No objects in palm, no flower, no light/glow (those are composited later), no text, no border, no extra hands, no jewelry. Beautiful fine crisp linework suitable for local contour tracing and recoloring, large source image.

输出：`hand-original.png` → `hand-lineart.png`、`hand-traced.svg`、`hand-recolored.png`。

## 本地拆层与补底

`tools/build_rig.py` 从已有站姿上色图分离双耳、尾、抬手和三组发束。手腕和胸前发束的微小遮挡区域使用本地 inpaint，并重新量化到同一色板。没有把自动补底声称为手工新绘动作。眼睑来自已有闭眼表情的睫毛与局部肤色覆盖。
