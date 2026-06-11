# VS Code 发行版 — 决策门锁定记录

**锁定日期**：2026-06-11（D 门 2026-06-11 增补）  
**依据**：[`STRATEGY.md`](./STRATEGY.md) · [`PENETRATION_PLUGIN_MODEL.md`](./PENETRATION_PLUGIN_MODEL.md)

---

## 决策门 A：渗透触发机制 → **C（混合）** · **0.4 起迁移至插件**

| 阶段 | 路径 |
|------|------|
| **0.3.x（过渡）** | 核心内置 `PenetrationService`、Chat 工具栏、`oclive.appendDiary` |
| **0.4+（SSOT）** | **渗透插件包** 订阅宿主钩子；核心仅提供 API + 授权 |

**不改编排**：写盘仍纯宿主侧，符合 `PRODUCT_FREEZE_THEATER_V0`。

---

## 决策门 B：互动模式 → **A（永久 pure_chat）**

| 项 | 约定 |
|----|------|
| `distro.oclive.toml` | `allow_mode_switch = false` |
| VS Code UI | **无** `InteractionModeBar` |
| 文档 | 不承载 `immersive` |

---

## 决策门 C：`.oclive/` 与内核记忆 → **C1 + 可选 C2**

| 默认 (C1) | 日记/信仅工作区 Markdown；**不**自动写入 `long_term_memory` |
| C2 | 插件/用户手动「日记摘要 → 记忆」→ `bridge/dispatch` · `update_memory` |

---

## 决策门 D：渗透交付形态 → **插件集合（2026-06-11 锁定）**

| 项 | 决定 |
|----|------|
| **日记 + 写信 + idle/终端 + `.oclive/`** | **合并为一个可选渗透插件**，不长期留在核心扩展 |
| **核心扩展** | VS-1 聊天平台 + 宿主 API；**不**追求 IDE 效率工具做到最好 |
| **官方参考** | 独立扩展 `oclive-vscode-penetration`（0.4.0） |
| **开发者信号** | 安装插件 = 显式选择渗透方案；自写插件 = IDE 适配可自定义 |

### D1 · 宿主契约 npm 包 → **B**

| 项 | 约定 |
|----|------|
| 包名 | **`@oclive/vscode-host`**（运行时 + 类型，非纯 d.ts） |
| 核心 `activate()` | **return** `OcliveHostApi` 实现体；类型与 npm 对齐 |
| 第三方 | 只依赖 npm，调用 `resolveOcliveHost()` |

### D2 · Chat 工具栏 → **A**

| 项 | 约定 |
|----|------|
| 机制 | 核心 **`registerChatToolbarAction`** 动态插槽 |
| 未装渗透插件 | Chat 顶栏 **无** 日记/写信按钮 |
| 点击 | `vscode.commands.executeCommand(action.command)` |

### D3 · 官方渗透扩展 → **A**

| 项 | 约定 |
|----|------|
| 仓库 | 姊妹仓 **`oclive-vscode-penetration`** |
| 扩展 ID | `oclive.oclive-vscode-penetration` |
| 依赖 | `extensionDependencies: ["oclive.oclive-vscode"]` |

### D4 · 命令命名 → **仅新名（无 shim）**

| 0.3.x（0.4 删除） | 0.4+（渗透插件） |
|-------------------|------------------|
| `oclive.appendDiary` | `oclive-penetration.appendDiary` |
| `oclive.writeLetter` | `oclive-penetration.writeLetter` |
| `oclive.revealOcliveFolder` | `oclive-penetration.revealOcliveFolder` |
| `oclive.syncDiaryMemory` | `oclive-penetration.syncDiaryMemory` |

**0.4.0 即完成删除**；不设核心 shim。迁移见 [`MIGRATION_0.3_to_0.4.md`](./MIGRATION_0.3_to_0.4.md)。

---

## 执行顺序（修订 · 2026-06-11）

1. **VS-1** — Done  
2. **VS-2P** — `@oclive/vscode-host` + 核心宿主 API + `oclive-vscode-penetration`（**0.4.0 同批**）  
3. **VS-3P** — 第三方 minimal 样例 + 作者文档（0.4.x）  
4. **VS-4 Agent** — 高级可选，与渗透插件正交 · 胶水 Done  
