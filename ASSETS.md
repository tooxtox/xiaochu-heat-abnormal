# 素材索引

人物小初的图像全部由内置图像模型生成，**生成后再在本地自动描线、分色与重新上色**，没有用图像模型代替本地处理。生成提示词全文在 `docs/PROMPTS.md` 与 `docs/PROMPTS-V2.md`，场景增强提示词在 `docs/PROMPT-SCENE.md`。

## 图像模型原稿与本地处理产物

| 提示词 | 原稿（图像模型输出） | 轮廓 / 线稿 | 重新上色 | 提示词位置 |
| --- | --- | --- | --- | --- |
| 1 · 站姿原稿 | `assets/character/xiaochu-original.png` | `xiaochu-traced.svg`、`lineart.png` | `xiaochu-recolored.png` | `docs/PROMPTS.md` §1 |
| 2 · 四表情原稿 | `assets/character/expressions-original.png` | `expressions-preview.png` | `expression-calm/fear/peace/sad.png`（+ `.svg`） | `docs/PROMPTS.md` §2 |
| 3 · 坐姿原稿 | `assets/character/seated-original.png` | `seated-traced.svg`、`seated-lineart.png` | `seated-recolored.png` | `docs/PROMPTS.md` §3 |
| 4 · 双眼特写 | `assets/character/eyes-original.png` | `eyes-traced.svg`、`eyes-lineart.png` | `eyes-recolored.png` | `docs/PROMPTS.md` §4 |
| 5 · 手部特写 | `assets/character/hand-original.png` | `hand-traced.svg`、`hand-lineart.png` | `hand-recolored.png` | `docs/PROMPTS.md` §5 |

## 本地拆层与人物特效

- `assets/character/rig/`：耳朵、发束、尾巴与抬手共 7 处局部拆层（28 个文件）。
- `assets/character/fx/`：17 色上色图与人物效果的线稿 / 黑白 / 负片 / 柔化等非破坏性变体（81 个文件）。
- `assets/character/trace-details.json`、`assets/character/trace-pipeline.json`：描线与拆层的细节记录。
- `assets/character/compare.png`、`seated-compare.png`、`eyes-compare.png`、`hand-compare.png`：原稿与处理结果的对照图。

## 字体

`assets/fonts/` 下的 **Noto Serif JP / Noto Sans JP / Noto Sans SC** 以 SIL OFL 1.1 授权，许可全文见 `assets/fonts/NotoSansJP-LICENSE.txt`、`assets/fonts/NotoSerifJP-LICENSE.txt` 与 `assets/fonts/OFL-NotoSansSC.txt`。中文译文使用 Noto Sans SC。

## 不在仓库内

歌曲音频 `assets/audio/song.m4a` 与歌词文件见 `assets/audio/README.md` 与仓库根目录 `README.md` 的「仓库内容与缺失素材」一节。
