# 波次 5 · 姊妹仓资产评估（2026-06-11）

并行项：**pack-editor 情绪图 Phase A** · **`exportProfile: vscode-lite`**

---

## 1. pack-editor 情绪图 Phase A

**现状**（`oclive-pack-editor`）：

- 已有 `EmotionAssetsControl.vue`：多选上传 / 追加 / 清空 + 摘要行
- 导出：`src/lib/exportPack.ts` 的 `emotionImages` → zip `assets/images/`
- 路线图：`docs/ROADMAP_EMOTION_ASSETS.md` M1 待补 **7 标签列表 + 缺图警告 UX**

**Phase A 建议（下一迭代）**：

| 项 | 工作量 | 说明 |
|----|--------|------|
| 7 标签网格 + 缺图 badge | 1–2d | 对齐运行时 `happy/sad/angry/neutral/excited/confused/shy` |
| 单张替换（已有 pick 可复用） | 含上 | 绑定 tag 文件名 |
| 校验文件名 | 0.5d | 与 `emotionAssets.test.ts` 对齐 |

**阻塞**：无；VS Code 扩展已读 `assets/images/{tag}.png`（`rolePack.ts`）。

**本波交付**：pack-editor M1 网格 UI **已合并**（`EmotionAssetsControl.vue`）；vscode-lite 契约见 `oclive-pack-editor/docs/VSCODE_LITE_EXPORT.md`。

---

## 2. `exportProfile: vscode-lite`

**现状**：仅在 `ROADMAP_EMOTION_ASSETS.md` M2 提及；**代码库无 `vscode-lite` 枚举实现**。

**评估**：

| 维度 | 结论 |
|------|------|
| 需求 | VS Code 侧栏立绘区高度有限，打包 3–4 张常用情绪即可减小 zip |
| 依赖 | 需 pack-editor 导出 profile 契约 + validation 可选警告 |
| 风险 | 与桌面/full 导出分叉，需 SSOT 文档 |
| 建议版本 | **0.5.x**（晚于 VS Code 0.4 渗透/聊天闭环） |

**推荐 profile 字段（草案）**：

```json
{
  "export_profile": "vscode-lite",
  "emotion_tags": ["neutral", "happy", "sad", "shy"]
}
```

**本波交付**：不实现导出分叉；上表作为 0.5 立项输入。

---

## 3. 跨宿主 e2e（可选）

主仓 `e2e-cross-host-memory` 增 VS Code `.oclive/diary.md` 路径 smoke — **非阻塞**，待扩展 CI 稳定后追加。
