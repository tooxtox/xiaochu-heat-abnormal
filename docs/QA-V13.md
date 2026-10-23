# QA-V13 · 城市地面、城市多样性与转场强化验收

> 对应 `docs/V13.md`。验收口径沿用前几版：所有结论必须有可复现证据。
> 本轮**没有**改动音乐、歌词文本与时间轴、`data/shots.json` 镜头表、崩坏后期时间窗与角色资产。

---

## 一、本轮要解决的问题与验收线

| 用户反馈 | 验收线 | 结果 |
| --- | --- | --- |
| 城市高楼场景**没有地面** | 楼体必须站在可见的地平面上；地面要有材质、透视与尺度物 | ✅ 见第三节 |
| 城市**太单调** | 一排楼不能是同一矩形复制；必须有业态差异与中景结构 | ✅ 见第三节 |
| **不要旋转转场** | `orbit-spin` 必须从代码中消失 | ✅ 见第四节 |
| 前后对比强处要有**更炫的转场** | 反差强的切点升级为多重特效爆发转场，且优先于疾走快切 | ✅ 见第四节 |

---

## 二、自动化检查

### 2.1 歌词排版几何 — 通过

```
node tools/check_lyric_layout.mjs
{"phase":"geometry","passed":true,"lines":126,"cues":264,"outOfBounds":[],
 "missingGlyphs":[],"smallFontFailures":[],"warnings":[]}
```

越界 0，与 v6–v9 基线一致。本轮只改了背景机位与转场合成，**没有**触碰阅读层机位
（`cameraAt(data,t,true)`），歌词排版不受影响。

### 2.2 渲染管线自检 — 通过

```
node tools/render.mjs --self-test
Native RGBA canvas, ffmpeg and ffprobe self-checks passed.
```

### 2.3 全片导出检查 — 全部通过

`export/LAST-SIGNAL-1080p60-v13.qa.json`：

| 检查 | 结果 |
| --- | --- |
| `determinism` | **passed**，同刻两次渲染的 SHA-256 全部一致 |
| `firstFrameRetention` | **passed**，5 个分段的首帧像素哈希前后一致 |
| `encoding` | **passed**：h264 / yuv420p / 1920×1080 / 60fps / 14,553 帧 / aac / 242.55 秒 |
| `joinFrames` | **passed**，5 段（3600×4 + 153），4 个拼接点的解码画面哈希匹配 |
| `sourceAudioPackets` | **passed**，源与成片音轨包哈希相同（原声未变速） |
| `flashHeuristic` | **passed**，93 处跳变、**0 个标记窗口** |

成片：`export/LAST-SIGNAL-1080p60-v13.mp4`，**308,416,319 字节**。

### 2.4 闪光筛查 — 通过

```
python tools/check_flash.py export/LAST-SIGNAL-1080p60-v13.mp4
{"decoded_frames":14553,"expected_frames":14553,"decode_passed":true,"screening_passed":true,
 "worst_windows":{"luminance":{"opposing_transitions":3,"raw_transitions":3,"start":70.816667,"end":71.816667},
                  "saturated_red":{"opposing_transitions":3,"raw_transitions":3,"start":87.0,"end":88.0}},
 "flagged_windows":[]}
```

- 逐帧解码 14,553 帧全部通过，**无标记窗口**。
- 判定阈值：1 秒滑动窗口内出现 **≥6** 次大面反差跳变即标记；实测最差窗口为 3 次，仍有 2 倍余量。
- 新增的 `climax-burst` 扩散光环**刻意不用全屏白场**，而是一道扫过的亮环，
  所以 16 次爆发转场没有制造出新的亮度反转。
- 说明：这是启发式筛查，不是光敏性癫痫的安全认证。

### 2.5 性能 — 通过

```
node tools/bench_film.mjs 24
mean 85.1 ms   worst 226.3 ms @ 54.42 s
projected full film (14552 frames, single job): 20.6 min
```

| 指标 | 第十二版 | 第十三版 |
| --- | --- | --- |
| 全片平均单帧 | 78.5 ms | **85.1 ms** |
| 最差单帧 | 198.8 ms | 226.3 ms |
| 单进程全片投影 | 约 19 分钟 | 约 20.6 分钟 |

增加的是地平面、业态化楼体、高架桥与 5 种新转场，代价是每帧约 6.6 ms。
**没有为了性能砍掉场景细节**，理由是实测显示渐变与小型 fillRect 几乎免费
（全屏渐变 0.00 ms，6000 次 fillRect 5.75 ms），真正的开销是整帧 `drawImage` 搬运。

---

## 三、城市：地面与多样性

### 3.1 地面（问题一）

**改造前**（`export/base-t09-approach-i.png`）：楼体悬在一片深色空白上，下方只有一条看不见的深色楔形。

**改造后**（`export/v13-t09-approach-i.png`、`export/v13-t05-eyes-distant-star.png`、
`export/v13-t06-cells-return-to-sea.png`）：可见地平面，包含

- 地平线高光带（楼脚不再是断口）
- 稀疏透视砖缝 + 断续横缝（纵向 15 条稀疏，横缝改断续，避免"坐标纸"）
- 路缘线
- 积水倒影（9 处，反天空色）
- 废弃车辆（5 辆，车体 / 车顶 / 轮子 / 车灯光晕）——尺度参照物
- 瓦砾 40 片 + 地面雾带

**层级顺序也已修正**：远景楼群 → 地平面 → 高架桥 → 近景楼群 → 街道道具。
近景楼体的基线落在地平面之内，因此楼真正站在地上，而不是浮着。

### 3.2 多样性（问题二）

`cityDistrict()` 让一排楼混排四种业态：

| 业态 | 表面语言 |
| --- | --- |
| `tower` 玻璃幕墙塔 | 竖向分格 + 横向楼层带 + 竖排亮窗 |
| `block` 住宅楼 | 密集小窗 + 每三层一道阳台线 |
| `shed` 厂房 | 波纹板 + 宽门 + 烟囱 |
| `spire` 地标尖塔 | 收分塔身 + 桅杆 + 航空障碍灯 |

外加三项：楼体**竖排招牌**（远看可读）、更亮的**楼顶灯箱**、横穿画面的**高架桥**
（桥面 + 桁架 + 桥墩 + 车灯）。

观测站窗内景与废墟远景也换成同一套业态天际线 + 地面，
所以从室内看出去与外面看到的城市是同一个世界（`export/v13-t03-fear-vascular-current.png`）。

### 3.3 逐场景抽帧

`node tools/scene_probe.mjs --prefix v13` → 11 个主题的全分辨率抽帧，
总览见 `export/v13-scene-overview.png`。

---

## 四、转场

### 4.1 旋转转场已删除

`src/transitions.mjs` 中不再存在 `orbit-spin`：规则表与合成函数两处都已移除，
由 `whip-pan` 高速甩镜接替。

### 4.2 12 类转场全部实测触发

`node tools/transition_probe.mjs` → `export/v13-transitions.png`
（每格取转场进度 34% 处的画面，因此运动可见）。

| 转场 | 次数 | 首次触发 | 画面证据 |
| --- | --- | --- | --- |
| `climax-burst` 高潮爆发 | 16 | 40.392 s | 放射速度线 + 中心推出 + 扩散光环 + 碎片 + 色散 |
| `angular-shutter` | 11 | 13.302 s | 三块斜面板依次推入 |
| `foreground-wipe` | 8 | 52.165 s | 前景碎屑高速掠过遮挡镜头 |
| `memory-dissolve` | 7 | 96.053 s | 记忆空间溶解 |
| `monitor-dive` | 6 | 2.979 s | 屏幕矩形从中央长大，新场景从屏幕内推出 |
| `whip-pan` | 4 | 35.122 s | 旧画面横向甩出、新画面从另一侧甩入 + 速度拖影 |
| `zoom-echo` | 3 | 8.315 s | 放大回声 |
| `shatter` | 3 | 18.791 s | 旧画面裂成 20 块碎片向外飞开 |
| `light-slash` | 2 | 37.687 s | 斜切的光把画面切开 |
| `iris` | 2 | 66.627 s | 光圈 |
| `paper-tear` | 1 | 29.843 s | 横向纸条被锯齿状撕开 |
| `glass-crack` | 1 | 112.907 s | 玻璃裂痕 + 速度线 + 光环 |

### 4.3 反差强的地方自动升级（用户明确要求）

`sceneContrast()` 的口径：

```
反差 = |前后场景色板明度差| + (场景族不同 ? 42 : 0) + (进入英雄主题 ? 18 : 0)
```

阈值 56，命中即升级为 `climax-burst`，**且优先于疾走快切**——
这一点是本轮最关键的修正：高潮段落的第一刀原本被"节奏快切"接管，
现在它成了全片最重的一击。

实测触发点：

| 时刻 | 场景变化 | 反差值 | 转场 |
| --- | --- | --- | --- |
| 40.317 s | 9 → 6 | 62 | climax-burst |
| 115.50 s | 2 → 3（数字空间 → 实景） | 96 | climax-burst |
| 188.99 s | **进入高潮段** | 104 | climax-burst |
| 199.45 s | 7 → 6 | 73 | climax-burst |
| 212.57 s | 7 → 8（记忆坠入核心） | 153 | climax-burst |
| 215.24 s | 8 → 9（核心 → 断城） | 60 | climax-burst |
| 229.77 s | 9 → 5（断城 → 黑星） | 170 | climax-burst |

**强度分级**：爆发转场的速度线数量（22→48 条）、光环强度、碎片数量都按反差值缩放
（`k = clamp((contrast-50)/90, 0.34, 1)`）。反差小的只是一记闷响，反差大的才是整个世界炸开，
避免 16 次爆发看起来一模一样。

---

## 五、成片与闪光

- 成片：`export/LAST-SIGNAL-1080p60-v13.mp4`（1920×1080 / 60fps / 14,553 帧 / 242.55 秒 / 308,416,319 字节）。
- 导出器五项检查与闪光筛查全部通过，详见第二节 2.3 与 2.4。
- 接触表：`export/v13-scene-overview.png`（11 个场景主题总览）、`export/v13-transitions.png`（12 种转场）。
- 从成片直接抽帧的证据：`export/v13-film-45s.png`（城市地面 + 高架桥 + 业态天际线）、
  `export/v13-film-212s.png`（高潮段熔毁核心）。

---

## 六、已知偏差与未做的事

1. `check_boundaries` 报的 10 处镜头号不符仍是 `data/shots.json` 的**既有**数据问题
   （部分节奏镜头的跨度超出自己的 `rhythm.to`），本轮同样没有动镜头表。详见 `docs/QA-V12.md` 第二节。
2. 背景机位与歌词阅读层机位分离仍然是有意设计（背景做极端广角与倾斜，歌词保持稳定机位）。
3. 未新增角色资产、未改小初服装与配色。
4. 高架桥与业态化楼体在**极远景**（观测站窗内）只保留剪影层次，不做细节——那是刻意的空气透视。

---

## 七、复现命令

```bash
# 逐主题抽帧
node tools/scene_probe.mjs --prefix v13

# 场景总览接触表
node tools/scene_overview.mjs v13-scene-overview.png

# 转场类型接触表（取转场进度 34% 处的画面）
node tools/transition_probe.mjs v13-transitions.png

# 自动化检查
node tools/check_lyric_layout.mjs
node tools/render.mjs --self-test
python tools/check_flash.py export/LAST-SIGNAL-1080p60-v13.mp4

# 性能
node tools/bench_film.mjs 24

# 全片导出
node tools/render.mjs --output export/LAST-SIGNAL-1080p60-v13.mp4 --jobs 4 --encoder-threads 4
```
