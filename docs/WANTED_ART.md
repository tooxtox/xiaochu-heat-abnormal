# 角色素材清单

用户确定的流程是“图像模型先生成角色，再在本地描边和重新上色”。当前已有 1024×1536 站姿、1536×1024 坐姿，以及 1254×1254 的四表情图集；图集拆成 627×627 的 calm、fear、sad、peace 四张近景。

| 用途 | 当前素材 | 使用方式 |
|---|---|---|
| 全身 | xiaochu-original.png → xiaochu-recolored.png / xiaochu-traced.svg | 在线、观测、异常与失控章节中的固定全身姿态 |
| 坐姿 | seated-original.png → seated-recolored.png / seated-traced.svg | 系统启动及最后信息章节的终端操作构图 |
| 平静 | expression-calm.png / .svg | 变量章节近景 |
| 恐惧 | expression-fear.png / .svg | 温度、黑星与城市崩塌近景 |
| 悲伤 | expression-sad.png / .svg | 记忆章节近景 |
| 释然 | expression-peace.png / .svg | 记忆与最后信息近景 |
| 检查 | lineart.png / compare.png / expressions-preview.png | 观察原图、墨线、重上色和表情一致性 |

本地流程使用薄荷、象牙白、肤色、粉色与深青墨线的语义色板。暗线保留源图墨线结构，再为颜色区域提取轮廓。低透明辉光会被清除，较小的孤立区域或轮廓会被忽略；具体阈值和源图 SHA256 见 `assets/character/trace-pipeline.json`。

第二轮已完成：左右耳、尾、抬手/袖口、左右后发、胸前前发共7个局部PNG，以及全身/calm/fear/sad的局部眼睑层。清单、枢轴、最大转角和补底方法见rig/manifest.json。局部眼睑没有替换整张脸；头颈尚未拆开。

要进一步扩展表演，还需新增或拆出：头颈、躯干、上臂、独立前臂/手指、裙摆和双腿，并补齐遮挡后的区域。SVG仍是颜色轮廓；实际可动局部由rig/目录中的透明PNG承载。

优先补画：具有连续关节变化的发送手势、侧脸与回望、完整失重姿态。第二轮已补掌心特写及专用双眼特写原稿。后续新增姿势仍需通过同一本地分色与轮廓流程，检查薄荷耳发、粉眼、尾巴和服装辨识度。

当前renderer使用实际局部图层的小幅枢轴旋转，并保持身体与头颈底图；不再用整张人物条带形变充当局部动画。不能把这7个局部称为全身关节骨骼绑定。观测站、城市、黑星、轨道、终端和花仍由代码绘制。
