# 熱異常 / LAST SIGNAL

原创角色小初的代码动画 MV，第十五版。使用用户指定的 [25時、ナイトコードで。× KAITO / B 站 2DMV](https://www.bilibili.com/video/BV1eGZLBkE5X/)，保留源音频零点与全长 242.538333 秒。人物由图像模型生成，再在本地自动描线、分色和重新上色。

## 仓库内容与缺失素材

本仓库发布**代码、提示词与文档**：渲染源码 `src/`、工具链 `tools/`、设计与提示词文档 `docs/`、场景与音频特征数据 `data/`、角色立绘 `assets/character/`、Noto 字体 `assets/fonts/`。

以下内容**不在仓库内**，需要时按下表自行补齐：

| 缺失内容 | 原因 | 怎么补 |
| --- | --- | --- |
| `assets/audio/song.m4a` | 曲目与录音版权属于权利方 | 放入你自己有权使用的音频；预览页的「替换本地音源」也可直接载入 |
| `data/lyrics.json`、`data/lyrics_user_supplied.tsv` | 歌词与译文版权属于权利方 | `python tools/import_lyrics.py 你的歌词.lrc --duration 242.538333 -o data/lyrics.json` |
| `data/jizura_direction.json` | 语义导演表里带歌词片段（强调词与断句），同属权利方内容 | 导入歌词后跑 `python tools/build_jizura_direction.py` 重新生成 |
| `data/jizura_lyric_marks.json` | 强调词与断句的原始标注（带歌词原文），同属权利方内容 | 随 `data/jizura_direction.json` 一起本地保存；缺失时导演表仍能生成，只是不带强调与分句 |
| `export/`（成片与逐版 QA 报告） | 约 3.8 GB 渲染产物 | 用下面的渲染命令在本地生成 |
| `work/`（中间件与探针） | 本地调试缓存 | 无需补充 |
| `docs/evidence/`（字幕抽帧） | 取自受版权保护的源视频画面 | 保留在本地工作副本 |

没有歌词文件时，预览页仍可打开并渲染画面，只是没有歌词排版层；导入歌词后自动生效。

仓库中**不含任何密钥、令牌、账号或个人身份信息**。`tools/privacy_scan.mjs` 是发布前的自检脚本（扫描绝对用户路径、邮箱、令牌、密钥、手机号与身份证号等模式）：

```bash
node tools/privacy_scan.mjs
```

**当前全曲成片（发布用）：`export/LAST-SIGNAL-720p30-v15.mp4`。** 1280×720、30fps、7,277 帧、242.57 秒、104,796,181 字节（3,456 kbps），H.264 + 原 AAC 立体声音轨（音轨直接复制，未重新编码）。**母版：`export/LAST-SIGNAL-1080p60-v15.mp4`** —— 1920×1080、60fps、14,553 帧、242.55 秒、312,929,948 字节。

第十四版按文字 PV 手法重做 126 组日中歌词，并给人物补齐鞋底落点、接触阴影、场景受光及前景遮挡；保留原有 156 镜剪辑。第十五版把这层歌词整个换成 JIZURA 字面引擎的语义导演版（见下）。设计与成片验收见 `docs/V14.md`；`export/v14-comparison.png` 为两版编码视频的同帧对照。

**第十五版用 JIZURA 字面引擎重做歌词层（2026-10-27）：** 歌词不再是"引擎自动挑版式"，而是
**126 行逐行的语义导演表**——每一行唱什么、怎么出现、什么颜色、用什么底板都写死在
`data/jizura_direction.json` 里，由 `tools/build_jizura_direction.py` 生成、可复查、可重跑
（96 个语义动作、12 个计划）。

本版修掉的实际问题（全部有实测证据，不是目测）：

- **整行不可见**：后层歌词画在场景画布里，却继承了调用点的 4.5% 不透明度，
  117.0 秒那一行几乎看不见。`src/film.mjs` 现在把歌词层的变换与 alpha 重置后再画。
- **转场吞字**：后层的歌词会被画面转场整个盖掉（29.73 秒那行 68% 的时间在转场里）。
  `tools/jizura_plane_audit.mjs` 逐行量出这个比例，11 行升到前层——前层在转场之后合成。
- **短行只剩零点几秒**：按引擎真实的进出场时长逐行（逐分句）算"字真正清晰可见的秒数"，
  不足四成就先砍入场、还不足就连出场一起瞬间切。**短行宁可硬切，也不能让字读不出来。**
- **分句交接黑屏**："瞬间切走 + 后一句慢慢淡入"会在两句之间留一段没有字的空档。
  现在版式把两句放在不同位置时让前一句溶解退场，实测空档从 0.6 秒缩到 6 帧（0.1 秒的换气）。
- **配色跑色**：JIZURA 自带的糖果粉与薄荷绿铺成大色块时和影片暖调打架，
  全部换成影片自己的调色板（薄荷/橙/红/粉/纸白/黑）。
- **墨色选错**：亮背景要用深墨、暗背景要用浅字，手写名单必然过时。
  `tools/jizura_variant_probe.mjs` 把每句话的两种极性都渲染一遍，
  按真实画面对比度择优（本次 17 行切换），结果写进 `data/jizura_variants.json`。

逐行可见性审计（`tools/jizura_visibility_audit.mjs`，在每个分句边界前后各取帧）
从第十五版初稿的 94 strong / 26 weak / 6 missing 提升到 **116 strong / 8 weak / 2 missing**，
两个 missing 都已用逐帧扫描证明是采样点落在换句空档里的伪阳性。

设计与验收见 `docs/V15-JIZURA.md`。

**第十三版补齐城市地面与转场冲击（2026-10-23）：** 第十二版的城市"楼浮在半空"、剪影单调，
本版新增 `cityGround()`（路缘、透视砖缝、积水倒影、废弃车辆、瓦砾、地面雾带）与 `cityDistrict()`
（玻璃塔 / 住宅楼 / 厂房 / 地标尖塔四种业态混排，外加竖排招牌、楼顶招牌与横穿画面的高架桥），
并把远景楼群 → 地平面 → 高架桥 → 近景楼群的层级重排，楼因此真正站在地上。
转场方面**删除了旋转转场**（`orbit-spin`），改为高速甩镜，并新增世界碎裂、数字块位移、斜光切开与
**高潮爆发**（放射速度线 + 中心推出 + 扩散光环 + 旧画面碎片 + 色散）。
新增 `sceneContrast()`：按前后场景色板明度差与场景族差异打分，反差强的地方（包括进入高潮的那一刀）
自动升级为多重特效爆发转场，且优先于疾走快切。转场总数 12 类，全部实测触发。
设计与验收见 `docs/V13.md`、`docs/QA-V13.md`。

**第十二版做了场景表现力升级（2026-10-23）：** 场景不再只是「立绘 + 简单背景 + 动态文字 + 故障」。
新增 `src/scene_layers.mjs`（建筑剪影、透视街道与尺度物、空气透视、体积光、机柜与屏幕墙、数据走廊、
破损数码巨钟、红日与撕裂云带、排版化信息层、前景碎屑）与 `data/scene_layers.json` 层表，
把 11 个场景主题的环境拆成有视差的天空／远景／中景／主体／前景五层；黑星升到天际线之后成为真正的天体，
记忆场景变成有阳光的窗边房间，核心场景变成正在熔毁的核心，结尾变成逐盏熄灭的观测站。
另新增 6 种空间型转场（冲入显示器、沿建筑高速旋转、玻璃裂痕、撕纸、前景掠过、记忆溶解）与每主题独立机位。
设计与验收见 `docs/V12.md`、`docs/QA-V12.md`。

**源码补丁（2026-10-23）：** 修复人物基础调色在镜头最后1–2秒回退到原色的问题，并修正尾部交叉混合权重。实时预览与后续导出使用此修复；说明、前后对照与检查结果见`docs/FX-TAIL-FIX.md`。

**循环歌词更新（2026-10-23）：** 7 处、共 55 行循环歌词加入中量崩坏，鼓点触发撕裂、残影、噪点与少量色块，力度低于高潮；歌词损坏同步减量。预览跳转菜单已增加 7 个循环段入口。源码、实时预览及 V10/V11 全曲 MP4 均已包含此更新；新增检查片和回归结果见 `docs/LOOP-GLITCH.md`。

第九版修掉了一个观感 bug：**每个镜头最后几帧画面特效会消失、恢复彩色**。原因是场景包络在切点前归零，现改为包络只降到 62%、切点附近与相邻场景交叉淡化、切点处反而增强 18%。用同一套阈值做可复现的 A/B：授权窗口内 `glitchAt()` 返回空的帧从 **29 帧降到 4 帧**（只剩窗口起止边界），13 个镜头切点的崩坏强度最小值从 **0.001（等于没有特效）升到 0.175**，该结果只覆盖崩坏强度；人物调色尾段的后续修复见上方源码补丁。

第九版同时**把城市重做了一遍**：全片城市统一到同一套新风格——染色天空（地平线最亮、越往上越黑）+ 三层剪影楼体（远景雾化 / 中景 / 近景近黑，只留朝向画面中心一侧的轮廓光与窗火）+ 崩塌时楼体歪斜下沉并透出红光。观测所窗口、场景 3/5/6/9 全部换用这一套。**黑星改为红与黑**：纯黑吸积内核、红色外环、红黑双色碎片拖尾、灼热红光晕；黑星与城市的天空都**染成红色**，场景 5/6/9 的城市**被摧毁**（楼体歪斜、裂缝透红、上升火星）。城市对比度靠"亮天空 / 暗楼体"的剪影关系建立，而不是提高楼体亮度。

第八版让**颜色退到鼓点上**：崩坏后期只在 1:08–1:30 与 3:09 之后（到 3:51.69 收尾）两段出现，RGB 分离不再常驻，全片加起来只分离 1.70 秒，而且**以红色为主**；黑白也只在打击的瞬间落下，其余时间画面保留原本颜色。授权窗口内人物还会短暂换成**线稿 / 黑白 / 灰度**（全片 4.47 秒、17 次）。同时把导出提速约 2.5 倍。

第七版把崩坏后期**严格收进两个授权时间窗**：1:08–1:30 与 3:09 之后（到 3:51.69 收尾）。两窗之外全片完全干净——窗口表 `src/signal_windows.mjs` 是唯一闸门，崩坏后期与歌词排版共用它，任何损坏类效果都跑不出去。

第七版同时重写了歌词排版语言：从"平滑优雅的字幕"改成**终端解码式的信号排版**。入场/出场全部阶梯化（不再连续淡入淡出），文字逐字解码进场，块外挂四角括号与解码缓冲读数，字形改为硬边套印偏移；色散边、掉字、错位同样只在授权窗口内出现。崩坏特效清单、鼓点驱动与 4 级打击规则保持第六版不变。

第六版在第五版的画面之上加入一层贯穿全片的**崩坏后期**：重复段像坏掉的循环磁带，高潮段像系统被烧穿。RGB 分离、颤抖、黑白、黑白色块、描线闪白之外，还有行位移撕裂、同步滚动条、数据块、局部负片、像素化、噪点与重影。崩坏强度由真实鼓点驱动，分 4 级打击，段落首尾各带进出包络，因此崩坏落在节奏上而不是连续噪声。全过程纯时间求值，不读前一帧、不用随机数，同一时刻反复渲染得到同一张图。

第五版把用户提供的 126 组日文歌词与中文译文融入场景，按语义重剪为 63 镜、34 个场景段。7 类文字编排分别为纵向列、黑星轨道、道路透视、斜向海报、分栏、贝塞尔轨迹和遮罩显字；10 类意象动画连接递归、电流、燃旗、碎船、钟与落砂、盐晶、鱼群、燕迹、热浪和黑星。12 处淡色关键词在人物背后形成回声，完整阅读层随当前镜头运动，在画面转场时保持清晰。

**行级时间已经同版音频校准。** 外部 LRC 与用户日文文本逐行匹配，6 段实际音频比对确认 `MV 时间 = 专辑时间 + 2.186875 秒`；另用所选 MV 的 8 处嵌字抽帧核对。入字为图形编排，未声明逐字演唱对齐。三处间奏尾行参考实际源视频的字幕清除画面结束，详情见 `docs/V5-TIMING.md`。

## 查看

设计与验收文档（均已发布在 `docs/`）：

- `docs/V15-JIZURA.md`：JIZURA 字面歌词导演层（语义导演表、配色极性、转场吞字、分句交接、确定性）。
- `docs/V14.md`：文字 PV、人物落地与成片验收。
- `docs/V13.md`、`docs/QA-V13.md`：第十三版设计与验收（城市地面／城市多样性／转场强化）。
- `docs/V12.md`、`docs/QA-V12.md`：第十二版设计与验收（场景表现力升级版）。
- `docs/V11.md`、`docs/QA-V11.md`：第十一版设计与验收（疾走快切与高潮空间崩坏）。
- `docs/QA-V10.md`：第十版验收记录（7 处中量循环崩坏与镜头尾部调色修复）。
- `docs/QA-V9.md`、`docs/V9.md`：第九版验收、切点修复、城市重做与红黑黑星。
- `docs/V8.md`：颜色让位、人物降级与导出提速；`docs/V7.md`：时间窗与信号式歌词排版；`docs/V6.md`：崩坏后期的设计；`docs/V5.md`：歌词场景化设计。
- `docs/V5-SOURCE-CAPTION-CHECK.json`、`docs/V5-TIMING.md`：行级时间的音频比对与抽帧核对证据。
- `docs/PROMPT-SCENE.md`：场景增强提示词（优先级、范围边界、验收口径与交付清单）；`docs/PROMPTS.md`、`docs/PROMPTS-V2.md`：图像模型原稿提示词。
- `docs/BRIEF.md`：原始创作要求；`docs/PROGRESS.md`：历轮记录；`docs/KIT.md`、`docs/PLAN.md`、`docs/STORYBOARD.md`、`docs/SHOTS.md`、`docs/REFERENCE.md`、`docs/CHARACTER_FX.md`、`docs/LOOP-GLITCH.md`、`docs/FX-TAIL-FIX.md`：各模块的具体设计与记录。
- `ASSETS.md`：素材索引（原稿、描线、上色、拆层与提示词对照）。

历史版本的成片 MP4、检查片与逐版运行报告（`export/`）体积约 3.8 GB，保留在本地工作副本、未提交到仓库；用下面的渲染命令可以重新生成。

## 预览与导出

需要 Node.js、Python、FFmpeg/FFprobe。当前环境已有依赖；换电脑后执行 `npm install`、`python -m pip install -r tools/requirements.txt`。原生导出无需 Chrome；浏览器模式需 Playwright 与 Chrome。

```powershell
node tools/serve.mjs --port 4173
# 打开 http://127.0.0.1:4173/?v=9，或运行 预览.cmd
# 预览页有"人物特效"与"崩坏后期"两个开关，可对照同一帧

# 从已保留的用户文本和时间数据重建排版与镜头
# 会重建歌词导演表；若手动改过排版，请先保留自己的版本
python tools/build_lyric_direction.py --offset 2.186875

# 检查实际字形覆盖、边界与可重复寻址；生成126行检查图
node tools/check_lyric_layout.mjs --film --prefix v9

# —— 第十五版：JIZURA 字面歌词导演层 ——
# 顺序有依赖：先量转场吞字，再量墨色极性，最后重建导演表
node tools/jizura_plane_audit.mjs --out data/jizura_planes.json
node tools/jizura_variant_probe.mjs --samples 3 --margin 0.6
python tools/build_jizura_direction.py
node tools/validate_jizura_direction.mjs
# 逐行客观审计：可见性（含每个分句边界）与对比度
node tools/jizura_visibility_audit.mjs --samples 3 --prefix v15
node tools/jizura_contrast_audit.mjs --samples 3 --prefix v15
# 指定时间点静帧 + 联系表（肉眼复核）
node tools/jizura_stills.mjs --times 30.04,44.05,68.01,117.49,206.33,225.05 --prefix v15
python tools/jizura_contact_sheet.py export/v15-stills export/v15-contact.png export/v15-stills.json
# 逐帧扫描某一行：区分"真的丢字"和"采样点正好落在换句空档"
node tools/jizura_line_scan.mjs --id L100 --from 199.45 --to 202.35
# 跨进程 / 分块边界的像素一致性
node tools/jizura_chunk_determinism.mjs --boundary 24 --span 2
# 预览带歌词层的画面
node tools/serve.mjs --port 4173
# 打开 http://127.0.0.1:4173/?jizura=1

# 全曲1080p60。--jobs 上限 8，按本机核心数给（16 逻辑核用 5 较稳）
node tools/render.mjs --jobs 5 --chunk-duration 24 --output export/LAST-SIGNAL-1080p60-v9.mp4
# 第十五版（带 JIZURA 歌词层）用 --jizura 走浏览器渲染
node tools/render.mjs --jizura --jobs 5 --chunk-duration 24 --output export/LAST-SIGNAL-1080p60-v15.mp4

# 发布版：降到 720p30（隔帧 + Lanczos 缩放，音轨原样复制）
ffmpeg -v error -y -i export/LAST-SIGNAL-1080p60-v15.mp4 -vf "scale=1280:720:flags=lanczos,fps=30" -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -c:a copy -movflags +faststart export/LAST-SIGNAL-720p30-v15.mp4

# 成片音轨、逐帧变化与分段首帧对照
python tools/check_sync.py export/LAST-SIGNAL-1080p60-v9.mp4 --output export/sync-check-v9.json
python tools/check_flash.py export/LAST-SIGNAL-1080p60-v9.mp4 --output export/flash-check-v9.json
node tools/check_chunk_starts.mjs export/LAST-SIGNAL-1080p60-v9.mp4 export/v9-chunk-picture-qa.json

# 崩坏后期检查片（两处授权窗口；从最终成片切取，保证与成片一致）
ffmpeg -v error -y -ss 68.5 -to 90.0 -i export/LAST-SIGNAL-1080p60-v9.mp4 -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 320k -movflags +faststart export/v9-glitch-repeat.mp4
ffmpeg -v error -y -ss 212.0 -to 231.5 -i export/LAST-SIGNAL-1080p60-v9.mp4 -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 320k -movflags +faststart export/v9-glitch-climax.mp4

# 本地增强LRC保留显式词级起点；普通LRC词级推算明确标注为estimated
python tools/import_lyrics.py "你的歌词.lrc" --duration 242.538333 -o data/lyrics.json

# 可为某次渲染指定另一套歌词与导演数据
node tools/render.mjs --lyrics data/lyrics.json --lyric-direction data/lyric_direction.json --start 209 --duration 7 --output export/hand-review.mp4
```

渲染函数按歌曲时间直接求值，不依赖前一帧、随机运行状态或系统时钟。崩坏后期同样如此：强度、打击点与每一种错位都由歌曲时间和鼓点表推出，并额外受 `src/signal_windows.mjs` 的授权窗约束。歌词排版的阶梯时序与逐字解码也只依赖歌曲时间。导出器以 24 秒分段、复制像素保留首帧、检查编码接缝，最后合入一次原 AAC 音轨。原声不变速。全长按 60fps 量化后为 242.55 秒。

## 内容与素材记录

歌词内容来自用户于 2026-10-23 直接粘贴的文本，保留其日文用字和中文译法；**原始文本与派生的 `data/lyrics.json` 因版权未随仓库发布**，请用 `tools/import_lyrics.py` 从你自己的 LRC 重新生成。外部时间来源及音频比对证据保存在 `data/lyric_timing_source.json`，其中只记录来源地址、哈希与行级时间，不含歌词文本。歌词、译文和导演数据从本地文件读取，渲染源码不内嵌整首歌词。

Noto Serif JP、Noto Sans JP、Noto Sans SC 字体及 OFL 许可已随工程保留；中文译文使用 Noto Sans SC。角色原稿、轮廓 SVG、线稿、17 色上色图和非破坏性人物效果图均保留。耳朵、发束、尾巴与抬手共有 7 处局部拆层；头颈、手指与完整身体新动作尚未独立绑定。

`docs/BRIEF.md` 保存原始创作要求，`docs/PROGRESS.md` 保留历轮记录。系统温度、传感器和城市遥测属于剧情虚构。
