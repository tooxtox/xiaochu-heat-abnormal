# 图像模型原稿提示词

使用内置 `image_gen.imagegen`，三次生成均设置 `transparent_background: true`。站姿为新生成；表情与坐姿以站姿原稿为身份参考。生成后仅在本地进行描线、清理透明度、分色及重新上色；没有用图像模型代替本地处理。

## 1. 站姿原稿

Use case: illustration-story. Asset type: production character model and animation cutout for an original Japanese experimental anime MV titled LAST SIGNAL. Generate ONE full-body standing character, large portrait composition, genuinely transparent background, no ground shadow, no props, no text. Original character Xiaochu: youthful gentle cute female anime cat-girl, very long flowing MINT GREEN hair (#9DE4C2) reaching below waist, exactly two mint cat ears on top of head and one matching fluffy cat tail, large clear PINK eyes (#E9ACC8), soft refined face. Mint and ivory white elegant modest maid/lolita dress with white lace trim, neat bows, layered knee-length skirt, white stockings and mint Mary Jane shoes. Crisp dark teal ink outlines, restrained flat cel shading only, excellent fine but readable anime drawing, no gradients or painterly texture so it can be locally traced and recolored. Body in a gentle 3/4 view facing slightly left, head towards viewer with quiet attentive mildly worried expression, both eyes open. Arms slightly separated from torso, one open hand slightly raised to operate a terminal; clear natural fingers. Hair separated into large clean locks, skirt readable, one tail curves away from body. Full character visible with generous transparent margin all around, centered, large and high resolution. Consistent design, clean silhouette, delicate modest clothing. Avoid mechanical elements, red eyes, silver/black hair, additional characters, additional tails, extra ears, crop, logos, shadows outside character. This is an original mascot, not any existing vocal synth or game character.

## 2. 四表情原稿

Use case: identity-preserve production anime expression atlas. Reference image is Xiaochu character identity and clothing design. Create a precisely regular 2 columns by 2 rows sprite atlas, genuinely transparent background. FOUR equally sized bust portraits of the SAME character from reference, from top of BOTH CAT EARS to waist, all centered in their own quadrant with ample transparent margin and no overlap. Match mint long hair, braids and ivory hair bows and tiny flowers, pink eyes, white and mint high-neck maid/lolita bodice. No hats. Same 3/4 head angle and same framing in all four cells; face and ears never cropped. Top-left: calm and focused, mouth closed and gentle pink eyes. Top-right: frightened and tense, eyes slightly wider, tiny parted mouth, eyebrows raised inward. Bottom-left: tired and heartbroken, eyes shining with small tear at lower eyelid, eyebrows sad, subtle lips. Bottom-right: peaceful eyes fully closed, tiny gentle smile, exhausted release. Clean detailed dark teal linework and restrained flat cel shades, neutral light, no glow, no gradients, suitable for local tracing and recoloring. Keep clear character consistency; exactly two cat ears per portrait and no additional human ears prominent. NO text or labels or borders, NO background, NO props, no distortion. 2x2 evenly spaced isolated portraits, large square canvas.

## 3. 坐姿原稿

Use case: identity-preserve. Production anime animation cutout of Xiaochu, exact same original character, mint long hair with side braid and ivory bows and small flower, two mint cat ears, pink eyes, one mint cat tail, modest mint and ivory lolita maid dress. ONE character only, genuinely transparent background, no shadow. Show a full-body seated pose from left-side 3/4 profile: she faces LEFT, sits on an invisible chair with bent knees and visible white stockings/mint Mary Jane shoes; torso leans slightly forward, both forearms extend forward toward an unseen computer keyboard at waist level, hands delicately typing. Quiet tired tender expression, both eyes open, face visible in profile and recognizable. Hair flowing gently behind to the right, one tail curves behind, all character fully in frame with generous margin. No chair, desk, keyboard, objects, background or text; isolated character for later compositing in a code-built observatory. Crisp dark teal anime outlines, clean flat cel shading, detailed ivory lace and bows, same original design faithfully. Do not add any hats or mechanical parts, no red eyes, no change of outfit. Large landscape canvas, no cropping.

## 本地输出

`xiaochu-original.png` → `lineart.png` / `xiaochu-traced.svg` / `xiaochu-recolored.png`

`expressions-original.png` → `expression-{calm,fear,sad,peace}.{png,svg}`

`seated-original.png` → `seated-lineart.png` / `seated-traced.svg` / `seated-recolored.png`

## 4. 双眼特写补充原稿

以下第 4、5 项为新增内置图像生成任务的规范化提示摘要，不是逐字原始提示词转录。继续以已有小初原稿作为角色身份参考，生成后在本地复用相同分色、描摹和重上色函数。

Same Xiaochu identity. Extreme macro crop across BOTH pink eyes with mint fringe, a gently worried expression, clean flat anime cel shading and dark teal linework. Preserve the same pink irises and mint hair. No objects, no objects reflected in eyes, no text, no extra face or character. Horizontal composition focused on both eyes. The returned original is a full-frame opaque 1672×941 image; retain that full opacity during local processing.

`eyes-original.png` → `eyes-lineart.png` / `eyes-traced.svg` / `eyes-recolored.png` / `eyes-compare.png`

## 5. 手部特写补充原稿

Same Xiaochu identity and outfit. ONE isolated upturned palm with exactly five natural visible fingers; forearm enters from the lower right toward the upper left. Ivory lace cuff and mint bow, clean flat anime cel shading and dark teal outlines. No object held, no prop, no other body parts or characters, no text. Transparent isolated cutout suitable for a terminal / transmission closeup. The returned original is a 1536×1024 RGBA image with low-alpha glow; remove that glow through the existing local alpha cleanup.

`hand-original.png` → `hand-lineart.png` / `hand-traced.svg` / `hand-recolored.png` / `hand-compare.png`

两项处理方法、原图哈希、透明度统计与检查记录单独保存在 `assets/character/trace-details.json`；不会覆盖原角色的 `trace-pipeline.json`。本地复现：`python tools/trace_details.py`。
