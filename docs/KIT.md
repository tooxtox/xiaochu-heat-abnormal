# 工程与复现

第二轮补充：`character.mjs`使用实际局部图层与眼睑覆盖；`cinema.mjs`处理有透视的室内/城市以及手、眼插入镜头；`palette.mjs`统一读取config.palette的语义色。`data/shots.json`集中保存48镜和强起音候选。预览与离线导出共用这些模块，旧版保留为film-v1.mjs。

原生导出每帧重置主画布及采样画布，避免已定位的原生绘图状态内存积累；默认每60秒开启新的编码子进程，复制拼接视频，再一次合并源音轨。`check_joins.mjs`对每个拼接边界前后图片的解码YUV哈希与源片段进行逐帧比对。源音轨字节另外进行包哈希核对。

工程使用 Canvas 2D 的纯时间渲染。`src/film.mjs` 导出 `renderFrame(ctx, t, resources, data, width, height)`；`t` 始终是原音轨秒数，运动不依赖墙钟或上一帧。粒子位置来自确定性哈希；细条撕裂只在 cue 事件附近出现。修改构图后可直接重渲任意时间点。

| 位置 | 内容 |
|---|---|
| src/film.mjs | 11 章画面、角色变形、图形、HUD 与可选歌词绘制 |
| assets/audio/song.m4a | 用户选定的真实音轨，242.538333 秒 |
| assets/audio/provenance.json | B 站来源、编码规格与哈希 |
| assets/character | 生成原图、本地描摹与重上色输出、四表情和方法记录 |
| data/audio_features.json | 本地音频 20 Hz 包络、低频、高频、起音及未验证节拍候选 |
| data/lyrics.json | 歌词数据接口；当前 lines 为空 |
| tools/analyze_audio.py | FFmpeg 解码和 NumPy 音频特征提取 |
| tools/trace_character.py | Pillow / NumPy / OpenCV 本地分色、描摹、重上色 |
| tools/import_lyrics.py | 导入本地标准 / 增强 LRC，区分显式与估算时间 |
| tools/serve.mjs | 本机静态预览服务 |
| tools/render.mjs | 原生 Canvas 或浏览器逐帧导出到 FFmpeg，生成 QA 边车记录 |

在工程目录执行；Node、Python、FFmpeg、FFprobe 需可用。原生导出需要 `@napi-rs/canvas`，浏览器后备路径需要 Playwright 与可用浏览器；导出器会尝试使用当前 Codex 的捆绑依赖目录。描摹依赖见 `tools/character-requirements.txt`。这些命令是复现入口，不代表已经全部执行或通过。

```powershell
python tools/trace_character.py
python tools/analyze_audio.py assets/audio/song.m4a
node tools/serve.mjs --port 4173
```

导入用户提供的本地歌词时：

```powershell
python tools/import_lyrics.py path/to/local-song.lrc --duration 242.538333
```

标准 LRC 的行时间来自文件，词时间通过插值估算；增强 LRC 的词起点来自显式标签。最后一个词、最后一行及缺失结束点仍可能估算，不能据此声称已经完成嘴型或人声逐词校准。没有歌词时渲染器直接略过歌词层。

片段和全曲导出入口：

```powershell
node tools/render.mjs --renderer src/film.mjs --start 145.5 --duration 6 --output export/memory-check.mp4
node tools/render.mjs --renderer src/film.mjs --width 1920 --height 1080 --fps 60 --output export/xiaochu-heat-abnormal.mp4
```

帧时间采用 `start + index / fps`，帧数为 `ceil(duration × fps)`；242.538333 秒在 60 FPS 下对应 14553 帧，编码视频时长约 242.55 秒。音频保留源零点，片段导出同时从相同秒数截取音轨。默认导出 H.264 / yuv420p 与 AAC；原生路径把 RGBA 直接写入 FFmpeg 管道，浏览器路径用同一时钟输出 PNG 帧。

导出器会记录重复时间点的像素一致性，以及成片宽高、FPS、帧数和是否有音轨。低分辨率亮度 / 红色变化筛查仅为启发式记录。最终仍需查看角色近景、章节首末帧、切点与字幕，解码最终文件并核对音画开头及末尾；当前文档不预先宣布这些验收通过。

调时规则：章节编辑点集中维护；不要把参考项目的 BPM 或拍网复制进来。6.2 秒的章内变体是粗剪参数，后续应以真实乐句和人声重新编辑。真实波形 / 起音数据与叙事遥测需区分；画面中的温度、坐标、错误码只服务故事。
