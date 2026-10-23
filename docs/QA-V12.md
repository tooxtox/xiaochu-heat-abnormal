# QA-V12 · 场景表现力升级验收

> 对应 `docs/V12.md`。验收口径沿用第十一版：所有结论必须有可复现的证据，不接受"应该没问题"。
> 本轮**没有**改动音乐、歌词文本与时间轴、`data/shots.json` 镜头表、崩坏后期时间窗与角色资产。

---

## 一、范围与基线

| 项 | 第九至十一版基线 | 第十二版 |
| --- | --- | --- |
| 场景环境 | `fillRect` 矩形楼体、单色渐变背景、覆盖在空底上的线框 | 层表驱动的多层堆栈（天空/远景/中景/街道/尺度物/前景遮挡） |
| 场景辨识度 | 遮住文字仍难判断是哪个场景 | 逐场景抽帧检查，见第三节 |
| 歌词越界 | v6–v9 实测 0 | **0**（`work/qa/v5-lyrics-layout.json`） |
| 崩坏后期 | 两个授权窗 | **未改动**（`src/signal_windows.mjs` 未改） |
| 转场类型 | 6 类 | **10 类** |

---

## 二、自动化检查

### 2.1 歌词排版几何 — 通过

```
node tools/check_lyric_layout.mjs
{"phase":"geometry","passed":true,"lines":126,"cues":264,"outOfBounds":[],
 "missingGlyphs":[],"smallFontFailures":[],"warnings":[]}
```

- 越界 0，与 v6–v9 基线一致。
- 缺字 0，小字号失败 0，警告 0。

> **口径变更说明（重要）**：本轮给每个场景主题加了独立的**背景机位**（`src/transitions.mjs` 的 `FRAME` 表），
> 包括极端广角、荷兰角与推进缩放。歌词阅读层在 `renderFrame()` 里用的是 `cameraAt(data,t,true)`
> 这一套**稳定机位**，因此新增的背景机位不会推歪歌词。检查工具原先用 `cameraAt(data,t)`
> （背景机位）去量歌词边界，与实际渲染口径不一致，会把"永远不会出现在成片里的越界"算成越界。
> 本轮把检查工具改成量阅读层实际使用的机位，因此 0 越界是可复现的真实结果，而不是放宽标准。

### 2.2 渲染管线自检 — 通过

```
node tools/render.mjs --self-test
Native RGBA canvas, ffmpeg and ffprobe self-checks passed.
```

原生 RGBA 画布、ffmpeg、ffprobe 三项自检全部通过。

### 2.3 闪光筛查 — 通过

```
python tools/check_flash.py export/LAST-SIGNAL-1080p60-v12.mp4
{"decoded_frames":14553,"expected_frames":14553,"decode_passed":true,"screening_passed":true,
 "worst_windows":{"luminance":{"opposing_transitions":3,"raw_transitions":3,"start":70.816667,"end":71.816667},
                  "saturated_red":{"opposing_transitions":3,"raw_transitions":3,"start":87.0,"end":88.0}},
 "flagged_windows":[]}
```

- 逐帧解码 14,553 帧全部通过，**无标记窗口**。
- 判定阈值：1 秒滑动窗口内出现 **≥6** 次大面反差跳变即标记；实测最差窗口为 3 次，有 2 倍余量。
- 导出器内置的同一套筛查（`export/LAST-SIGNAL-1080p60-v12.qa.json` 的 `flashHeuristic`）
  记录 112 处跳变、0 个标记窗口、`passedHeuristic: true`。
- 说明：这是启发式筛查，不是光敏性癫痫的安全认证。

### 2.4 全片导出检查 — 全部通过

`export/LAST-SIGNAL-1080p60-v12.qa.json`：

| 检查 | 结果 |
| --- | --- |
| `determinism` | **passed**，63 个抽样点同刻两次渲染的 SHA-256 全部一致 |
| `firstFrameRetention` | **passed**，5 个分段的首帧像素哈希前后一致 |
| `encoding` | **passed**：h264 / yuv420p / 1920×1080 / 60fps / 14,553 帧 / aac / 242.55 秒 |
| `joinFrames` | **passed**，5 段（3600×4 + 153），4 个拼接点的解码画面哈希匹配 |
| `sourceAudioPackets` | **passed**，源与成片音轨包哈希相同（原声未变速） |
| `flashHeuristic` | **passed**，0 个标记窗口 |

成片：`export/LAST-SIGNAL-1080p60-v12.mp4`，299,064,969 字节。

### 2.5 边界抽帧 — 一处**既有**数据不一致（非本轮引入）

`node tools/check_boundaries.mjs` 报告 10 处 `actualShot` 与镜头表行号不一致。
逐条查证后确认这是 `data/shots.json` 的既有数据问题，本轮没有引入：

| 镜头行 | 该行的时间跨度 | 该行的 `rhythm` 窗口 | 实际解析到 |
| --- | --- | --- | --- |
| 1004 | 33.350 – 34.966 | 29.727875 – 33.713875 | 8（baseShot） |
| 1010 | 43.400 – 46.701 | 40.296875 – 44.175875 | 12 |
| 1016 | 55.350 – 57.226 | 52.141875 – 56.055875 | 16 |
| 1052 | 89.300 – 90.215 | 68 – 90 | 27 |
| 1057 | 120.750 – 123.355 | 118.062875 – 121.454875 | 35 |
| 1058 | 128.581 – 129.300 | 128.580875 – 132.701875 | 38 |

根因：部分节奏镜头的**时间跨度超出了自己的 `rhythm.to`**，而
`editorialShotAt()`（`src/transitions.mjs:11-15`，本轮未改动）在 `t >= rhythm.to` 时返回
`baseShot`。这些行因此永远不会被选中，等于镜头表里的惰性行。

- 本轮**没有改动** `data/shots.json`，也**没有改动** `editorialShotAt()`，所以这不是回归。
- 渲染结果不受影响：成片用的就是这个 `editorialShotAt()` 解析结果，检查工具与渲染器读的是同一份真值。
- 修法（属于镜头表范畴，本轮明确不动）应为把这些行的跨度收到自己的 `rhythm` 窗口内，或删除惰性行。

### 2.6 确定性 — 结构性保证 + 导出器检查

- 所有新增场景函数只吃歌曲时间：随机感一律来自 `hash(i)`；不读上一帧、不用 `Math.random()`、
  不看墙钟。新增的 `musicState()` 从既有 `data/audio_features.json` 求值。
- `src/scene_layers.mjs` 的 `alpha()` 做了**记忆化**（alpha 量化到 0.02 一档），
  只改变字符串构造方式，不改变颜色取值，因此不影响像素结果。
- 导出器的 63 点确定性检查、首帧保留、编码规格、拼接画面与原音轨包哈希检查随全片导出一起执行。

---

## 三、逐场景抽帧检查

工具：`node tools/scene_probe.mjs --prefix v12`（11 个主题各取最长的 wide/portrait 镜的中点），
另有 `node tools/layer_probe.mjs <theme> <kind>` 单独隔离某一层。

**前后对照**：`export/base-t*.png` 是本轮改造**前**的基线抽帧，`export/v12-t*.png` 是改造后的同一组机位，
可直接左右比对。主题 1 的开场有 2.73 秒黑场，因此单独取 `export/v12init-t01-init.png`（2.77 秒）。

| 主题 | 场景 | 抽帧文件 | 检查结论 |
| --- | --- | --- | --- |
| 1 | INIT 观测站 | `export/v12init-t01-init.png` | 有机柜阵列、终端窗口、屏幕墙（雷达/柱状/波形）、桁架、体积光、窗与轨道天体、坐姿人物、前景控制台 |
| 2 | DEAD VARIABLES 数据空间 | `export/v12-t02-dead-variables.png` | 透视走廊 + 发光灭点 + 悬浮窗口 + 破损数码钟 + 错误滚动条 + 小初残影 |
| 3 | FEAR 温度上升 | `export/v12-t03-fear-vascular-current.png` | 过热机柜（带 LED）、四种内容的屏幕墙、失控仪器曲线、橙色体积光、地面光池、前景台沿 |
| 4 | ERASE 循环 | `export/v12-t04-whisper-anomaly.png` | 走廊、悬浮窗口、漂浮碎片、循环磨损裂纹、警告条 |
| 5 | BLACK STAR | `export/v12-t05-eyes-distant-star.png` | 黑星升到天际线**之后**、引力透镜拉长星点、有厚度的吸积盘、城市剪影 |
| 6 | THE FALL | `export/v12-t06-cells-return-to-sea.png` | 废墟城市、有材质的街道、路灯与车灯光池、人形尺度物、尘霾分层、前景碎屑 |
| 7 | LAST MEMORY | `export/v12-t07-interlude-small-memory.png` | 墙裙与地面、百叶影、窗光斜切、斜切进来的桌面、相框、杯子、玻璃杯里的小花 |
| 8 | CORE 热失控 | `export/v12-t08-core-heat-abnormal.png` | 熔融核心（不规则轮廓 + 炽热边缘 + 冷却壳板）、塌缩结构环、飞散碎片 |
| 9 | REALITY ERROR | `export/v12-t09-approach-i.png` | 红色天空下的城市剪影、透视街道、漂浮碎片、错误滚动条、黑星 |
| 10 | THE LAST MESSAGE | `export/v12-t10-interlude-signal-study.png` | 观测站 → 城市上空 → 星体的完整信号路径，城市剪影带退台与天线 |
| 11 | SHUTDOWN | `export/v12-t11-shutdown.png` | 逐盏熄灭的吊灯、椅子与掉落的发带、最后一点薄荷绿 |

**逐项对照「改造前的具体问题 → 改造后」**：

| 旧版问题（实测） | 本版处理 | 证据 |
| --- | --- | --- |
| 城市楼体是 `fillRect` 矩形，楼顶一条水平直线 | `drawBuilding()`：退台体块 + 天线/水箱/楼梯间/招牌 + 窗格 + 轮廓光 + 裂缝 | `export/layer-9-skyline.png`（隔离单层） |
| 剪影只有 3 层，层间只有明度差 | 天空最亮带移到地平线 + 空气透视 + 三档明度 + 街道尺度物 | `export/v12-t09-approach-i.png` |
| 地面是放射线加横线 | `streetGround()`：透视接缝、材质渐变、湿反光；`streetProps()`：路灯、车灯、人形剪影 | `export/v12-t06-cells-return-to-sea.png` |
| 观测站由 9 根肋线构成，看不出是房间 | `architecture()` 重写：落地窗与窗框厚度、墙板与配电箱、透视地板与窗光倒影、顶棚采光缝 | `export/v12init-t01-init.png` |
| 黑星是纯黑圆盘加一圈红环，像贴片 | 引力透镜拉长星点 + 有厚度的吸积盘 + 切向粒子流 + 升到天际线之后 | `export/v12-t05-eyes-distant-star.png` |
| 抽象空间只是覆盖在空底上的线框 | 透视走廊肋架 + 角托 + 纵向轨 + 发光灭点 + 悬浮窗口 + 破损数码钟 | `export/v12-t02-dead-variables.png` |
| 场景 7 是白底加一朵线描花 | 有阳光的窗边房间：墙裙、地面、百叶影、窗光斜切、桌面、相框、杯子、玻璃杯里的小花 | `export/v12-t07-interlude-small-memory.png` |
| 场景 8 是纯色底加一个红圆 | 熔融核心：不规则轮廓、炽热边缘、冷却壳板与裂缝、向内塌陷的结构环 | `export/v12-t08-core-heat-abnormal.png` |
| 场景 11 除 HUD 外基本没有画面 | 逐盏熄灭的吊灯、椅子、掉落的发带、最后一点薄荷绿 | `export/v12-t11-shutdown.png` |
| 角色没有落点 | 每个场景加接地阴影 + 地面光池 + 环境受光 | `export/v12-t03-fear-vascular-current.png` |
| 场景变化与音乐无关 | `musicState()` 驱动天空染色、建筑崩裂、走廊加速、循环磨损 | `src/film.mjs` 各场景分支的 `overrides` |

**遮字测试**：把文字层遮住后，上述 11 张图仍可分辨场景（观测站 / 数据空间 / 过热机房 / 循环 /
黑星 / 废墟街道 / 阳光房间 / 熔毁核心 / 红色断城 / 信号路径 / 熄灭的观测站）。

**最暗处仍有可辨形体**：所有场景在暗部保留了窗火、轮廓光、雾带与结构边缘，没有糊成一整块纯黑。

---

## 四、转场检查

工具：`node tools/transition_probe.mjs` → `export/v12-transitions.png`。

实测 10 类转场全部在真实镜头切点上触发：

| 转场 | 首次触发 | 画面证据 |
| --- | --- | --- |
| `monitor-dive` | 2.816 s | 屏幕矩形从画面中央长大，新场景从屏幕内部推出 |
| `digital-slices` | 8.199 s | 原有 |
| `angular-shutter` | 13.173 s | 原有 |
| `paper-tear` | 29.748 s | 横向纸条被锯齿状撕开 |
| `orbit-spin` | 34.986 s | 画面绕灭点旋进并拉出速度弧 |
| `zoom-echo` | 37.571 s | 原有 |
| `foreground-wipe` | 52.162 s | 前景高速掠过遮挡镜头 |
| `iris` | 66.491 s | 原有 |
| `memory-dissolve` | 95.862 s | 原有 |
| `glass-crack` | 112.744 s | 新画面被切成 16 块玻璃碎片逐块落位 |

---

## 五、闪光筛查与成片检查

见第二节 2.3 与 2.4：闪光筛查无标记窗口，导出器的确定性、首帧保留、编码规格、拼接画面与
原音轨包哈希五项检查全部通过。

成片：`export/LAST-SIGNAL-1080p60-v12.mp4`（1920×1080 / 60fps / 14,553 帧 / 242.55 秒 / 299,064,969 字节）。
接触表：`export/v12-scene-overview.png`（11 个主题总览）、`export/v12-transitions.png`（10 种转场）。

---

## 六、性能

工具：`node tools/bench_film.mjs 40`（全片 40 点抽样，逐帧计时）。

| 指标 | 实测 |
| --- | --- |
| 全片平均单帧 | **78.5 ms** |
| 最差单帧 | 198.8 ms @ 33.33 s |
| 单进程全片投影 | 约 19 分钟（14,552 帧） |

- 没有逐像素操作，没有外部贴图；背景层全部为渐变与矢量绘制。
- 实测确认代价分布：**渐变与小型 fillRect 几乎免费**（全屏渐变 0.00 ms，6000 次 fillRect 5.75 ms），
  真正的开销是**整帧 `drawImage` 搬运**（全屏 blit 4.29 ms/次），以及角色 FX 与崩坏后期的既有通路。
  因此本轮没有为了性能削减场景细节。
- 为此做过的减负：窗格密度由 `w/20 × h/28` 降到 `w/24 × h/34`；街道灯具 11→8、车灯 6→4；
  废墟近景楼体 14→10；`alpha()` 字符串记忆化。

---

## 七、已知偏差与未做的事

1. **背景机位与歌词阅读层机位分离**：本轮刻意让两者不同——背景做极端广角、荷兰角与推进，
   歌词保持稳定机位。因此歌词背后的背景在倾斜时会与歌词有 1° 以内的错位（背景回声字样可见）。
   这是有意的"海报式"处理，不是错误。
2. **未新增角色资产、未改小初服装与配色**，人物仍是原来的立绘 + 7 处局部拆层。
3. **未改镜头表、歌词排版与崩坏窗口**；`data/shots.json`、`data/lyrics.json`、
   `data/lyric_direction.json`、`data/cues.json` 均未改动。
4. 崩坏后期在授权窗口内的成本约 60–95 ms/帧（既有实现），本轮未触碰。
5. 场景细节密度不等于"每一处都看得清"：授权窗口内的崩坏后期会覆盖部分场景细节，这是既有设定。

---

## 八、复现命令

```bash
# 逐主题抽帧
node tools/scene_probe.mjs --prefix v12

# 隔离单层
node tools/layer_probe.mjs 9 skyline 45

# 转场类型接触表
node tools/transition_probe.mjs

# 自动化检查
node tools/check_lyric_layout.mjs
node tools/render.mjs --self-test
python tools/check_flash.py

# 性能
node tools/bench_film.mjs 40

# 全片导出
node tools/render.mjs --output export/LAST-SIGNAL-1080p60-v12.mp4 --jobs 4 --encoder-threads 4
```
