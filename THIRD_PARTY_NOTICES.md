# 许可范围

MIT 许可适用于本仓库中的原创工程代码、文档、提示词与本项目生成的插画文件，范围以贡献者有权授权的部分为限。插画由图像模型生成，不构成对 AI 产出的独占权利主张。

本工程派生自 MIT 许可的 [world-execute-me-lyric-mv](https://github.com/Nyankomintsu/world-execute-me-lyric-mv)（原作者 Nyankomint），上游许可声明保留在 `LICENSE` 中。

## 不随 MIT 重新授权的内容

曲目 **25時、ナイトコードで。**、其录音、歌词、译本、曲名与艺人名属于各自权利方，不在 MIT 授权范围内。本仓库**不含**以下内容：

- 歌曲音频 `assets/audio/song.m4a`；
- 歌词与译文 `data/lyrics.json`、`data/lyrics_user_supplied.tsv`；
- 取自受版权保护源视频的字幕抽帧 `docs/evidence/`；
- 含音乐的成片与逐版运行报告 `export/`。

请自行提供你有权使用的音频与歌词，并按你计划的分发方式取得所需许可。

## 第三方组件

- 字体 **Noto Serif JP / Noto Sans JP / Noto Sans SC** 以 SIL OFL 1.1 授权，见 `assets/fonts/NotoSansJP-LICENSE.txt`、`assets/fonts/NotoSerifJP-LICENSE.txt` 与 `assets/fonts/OFL-NotoSansSC.txt`。
- npm 依赖（`@napi-rs/canvas`、`playwright` 等）保留各自的许可与使用条款，本项目的 MIT 许可不替代它们。
- Python 依赖见 `tools/requirements.txt`、`tools/character-requirements.txt`。
- 外部时间来源与音频比对证据记录在 `data/lyric_timing_source.json`，其中只保存来源地址、哈希与行级时间，**不保存歌词文本**。

## 发布前自检

`tools/privacy_scan.mjs` 扫描绝对用户路径、邮箱、令牌、密钥与身份证／手机号等模式，用于发布前确认仓库不含凭据或个人信息：

```bash
node tools/privacy_scan.mjs
```
