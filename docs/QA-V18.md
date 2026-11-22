# QA-V18 · 整片重排成片验收

> 对应 `docs/V18.md`。验收口径沿用前几版：所有结论必须有可复现证据。
> 本轮**没有**改动音乐、歌词文本与行时间、JIZURA 阅读层机位、崩坏时间窗与角色资产。

---

## 一、验收线与结论

| 验收项 | 判定线 | 结果 |
| --- | --- | --- |
| 母版帧数与时长 | 14,553 帧 / 60fps / 242.55 秒 | ✅ |
| 分段拼接画面 | 10 个拼接点解码画面哈希全部匹配 | ✅ |
| 源音轨完整性 | 音轨包哈希与源一致、时间戳未变 | ✅ |
| 光敏筛查 | 1 秒窗口内 ≥6 次大面反差才标记 | ✅ 0 个标记窗口 |
| 音画同步 | 偏差 ≤ 16.67 ms 且相关 ≥ 0.8 | ✅ 三段均为 0 ms / 1.0 |
| 逐帧亮度 | 无黑帧、无过曝帧、无异常冻结 | ✅ |
| 画面抽样 | 关键节拍与重建场景在成片中成立 | ✅ 29 帧 / 3 张接触印相 |

---

## 二、自动化检查

### 2.1 母版规格 — 通过

```
ffprobe -v error -show_entries format=duration,size,bit_rate -show_entries
  stream=index,codec_name,codec_type,width,height,avg_frame_rate,nb_frames,pix_fmt,sample_rate,channels
  -of json export/LAST-SIGNAL-1080p60-v18.mp4
```

| 项 | 值 |
| --- | --- |
| 视频 | h264 / yuv420p / 1920×1080 / `60/1` fps / `nb_frames` 14,553 |
| 音频 | aac / 48,000 Hz / 2ch / 242.538333 秒 |
| 容器 | 242.55 秒 / 824,477,379 字节 / 27.19 Mbps |

逐帧 PTS 校验：全部 14,553 帧 `pts == index * 256`、`duration == 256`（time_base 1/15360），无错位或丢帧。

### 2.2 分段拼接 — 通过

`export/LAST-SIGNAL-1080p60-v18.qa.json`：

| 检查 | 结果 |
| --- | --- |
| `frameCount` | **14553**，`fps` 60，`encoder` `h264_nvenc` |
| `joins.passed` | **passed**，10 个拼接点全部通过 |
| `sourceAudioPackets.passed` | **passed**，`SHA256=ce2423c7…f3276`，`timestampsUnchanged: true` |

母版由 11 段拼成（1440 × 10 + 153 帧）。拼接判定方法为**解码后 yuv420p 画面的精确 MD5 相等**：每个分段末帧/首帧与成片对应帧号逐一比对。10 个拼接点的前后帧哈希全部 `expected == actual`，说明复制拼接没有引入接缝跳变。

### 2.3 光敏筛查 — 通过

```
python tools/check_flash.py export/LAST-SIGNAL-1080p60-v18.mp4 --output export/flash-check-v18.json
```

```json
{"decoded_frames":14553,"expected_frames":14553,"decode_passed":true,"screening_passed":true,
 "worst_windows":{"luminance":{"opposing_transitions":5,"raw_transitions":5,"start":213.083333,"end":214.083333},
                  "saturated_red":{"opposing_transitions":2,"raw_transitions":3,"start":214.55,"end":215.55}},
 "flagged_windows":[]}
```

- 逐帧解码 14,553 帧全部通过，**0 个标记窗口**。
- 最差窗口出现在 213.08–214.08 秒（`CORE / HEAT ABNORMAL` 段），1 秒内 5 次方向相反的大面跳变，判定阈值为 6 次，仍有 1 次余量。
- 全片共 128 帧属于大面跳变帧，集中在熔毁与现实崩解段的刻意剪切上。

> 说明：这是启发式筛查，不是光敏性癫痫的安全认证。

### 2.4 音画同步 — 通过

```
python tools/check_sync.py export/LAST-SIGNAL-1080p60-v18.mp4 --source assets/audio/song.m4a --output export/sync-check-v18.json
```

| 窗口 | 源区间 | 偏差 | 相关 | 结果 |
| --- | --- | --- | --- | --- |
| start | 4–16 s | 0.0 ms | 1.0 | passed |
| middle | 116–128 s | 0.0 ms | 1.0 | passed |
| end | 224–236 s | 0.0 ms | 1.0 | passed |

首尾偏差差值 0 ms，成片音轨与源时间轴完全对齐。

### 2.5 逐帧亮度扫描 — 通过

对母版全部 14,553 帧取 `signalstats` 的 YAVG：

| 指标 | 值 |
| --- | --- |
| 采样帧数 | 14,553 / 14,553 |
| YAVG 最小 / 最大 / 均值 | 26.000 / 217.320 / 100.131 |
| 近黑帧（YAVG < 4） | **0** |
| 近白帧（YAVG > 250） | **0** |
| 最长亮度静止段 | 115 帧（1.92 s），起点 0.00 s |
| 其余静止段 | ≤ 17 帧 |

唯一超过 1 秒的静止段是 0–1.92 秒，对应 `INIT` 段刻意保留的开场持镜，属演出意图而非渲染卡死。全片无黑帧、无过曝帧、无异常冻结。

---

## 三、画面抽样复核

从**成片文件本身**（不是预览引擎）抽取 29 个关键帧，组成 3 张接触印相，逐张目视复核：

| 印相 | 覆盖 | 观察 |
| --- | --- | --- |
| `work/v18/master-check/sheet1.png` | 8.5–96.0 s | 开场持镜、破碎声、燃烧、水淹、黑星、巨眼特写、`STILL HERE.` 白房间。人物与日中歌词层同时在位，3D 城市有前后景分层 |
| `work/v18/master-check/sheet2.png` | 124.9–213.7 s | 黑星 II、观测走廊（含 HUD 与终端）、俯视走廊、升降井、涉水街区、暖色室内、反应堆红光。管线、柜体、检修结构在成片中可见 |
| `work/v18/master-check/sheet3.png` | 214.1–234.3 s | 热异常碎裂排版、现实崩解的高强度 glitch、结尾 `TRANSMISSION / TO UNKNOWN` 冷色远景收束 |

接触印相为抽样目视，不代表逐帧审看。

---

## 四、剪辑证据

`data/v18_shots.json` 的 `summary`（由 `tools/build_v18_edit.mjs` 生成）：

| 项 | 值 |
| --- | --- |
| 镜数 | 230 → **177** |
| 实测切点 | **176**（全部来自实测节拍/半拍/瞬态） |
| 跟踪节拍切点 | 161 |
| 半拍切点 | 13 |
| 同时命中低频强击 | 154 |
| 实测停顿保持 | 6 处（由连续镜头承接） |
| 帧量化误差上限 | 6.667 ms |
| 源音轨 SHA-256 | `cea7277d…ed122`（与 V17 同一音源） |

构建脚本内置断言：镜号唯一、无空隙无重叠、每个实测切点与声学事件偏差 ≤ 0.5 帧、任何切点都不落在实测停顿内。本轮重新运行 `node tools/build_v18_edit.mjs`，退出码 0、全部断言通过，且重新生成的 `data/v18_shots.json` 与成片所用版本**字节级一致**（SHA-256 `AEEA9D23…F36F6D`），即镜头表可确定性重建。

---

## 五、限制与未覆盖项

- 光敏筛查是启发式，不是安全认证；下采样到 160×90 可能漏掉局部小面积高频图案。
- 音画同步只采样源/成片音轨的首、中、尾三段，**不验证**人声、歌词、节拍与动画事件的逐句对齐。
- 画面复核为 29 帧抽样，未逐帧观看。
- 歌词行时间与 JIZURA 导演表沿用 V15/V16 基线，本轮未重新标定；行级时间与实际演唱的偏差未重新测量。
