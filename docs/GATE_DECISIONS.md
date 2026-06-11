# VS Code 发行版 — 决策门锁定记录

**锁定日期**：2026-06-11  
**依据**：[`vs_code_发行版路线图`](../.cursor/plans/) 计划默认（用户未另行指定）

---

## 决策门 A：渗透触发机制 → **C（混合）**

| 阶段 | 路径 |
|------|------|
| **VS-2** | **A · 宿主编排**：`PenetrationService`、Chat 工具栏「记入日记」、`oclive.appendDiary`、可选 `autoDiaryEveryNTurns` |
| **VS-3** | 扩展侧可选读取角色包 `config.json` → `penetration_templates`（不触及主仓 validation，护栏在扩展白名单） |

**不改编排**：渗透写盘纯宿主实现，符合 `PRODUCT_FREEZE_THEATER_V0`。

---

## 决策门 B：互动模式 → **A（永久 pure_chat）**

| 项 | 约定 |
|----|------|
| `distro.oclive.toml` | `allow_mode_switch = false` |
| VS Code UI | **无** `InteractionModeBar`；不调用 `/role/interaction_mode` |
| 文档 | 本发行版不承载 `immersive`；灵魂跨宿主记忆仍经 `OCLIVE_APP_DATA` |

---

## 决策门 C：`.oclive/` 与内核记忆 → **C1 + VS-3 可选 C2**

| 默认 (C1) | 日记/信仅工作区 Markdown；**不**自动写入 `long_term_memory` |
| VS-3 (C2) | 设置项「将今日日记摘要提交记忆」→ `POST /bridge/dispatch` · `update_memory`（手动、可选） |

---

## 执行起点

锁定后从 **VS-1a**（F5 / vsix / CHANGELOG）起交付；渗透 **VS-2** 与聊天底座可并行文档，实现顺序 VS-1 → VS-2 → VS-3 → VS-4。
