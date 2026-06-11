# VS Code 发行版（扩展契约）

**状态**：0.4.0（VS-2P Done · 渗透姊妹仓 + npm `@oclive/vscode-host`）  
**战略**：[`STRATEGY.md`](./STRATEGY.md) · **渗透插件模型** [`PENETRATION_PLUGIN_MODEL.md`](./PENETRATION_PLUGIN_MODEL.md) · 决策门 [`GATE_DECISIONS.md`](./GATE_DECISIONS.md)  
**跨宿主记忆**：主仓 [`CROSS_HOST_MEMORY.md`](../../oclivenewnew/creator-docs/role-pack/CROSS_HOST_MEMORY.md)

---

## 产品定位

### 以角色为基点（不是 Cursor）

| 项 | 约定 |
|----|------|
| **北极星** | **角色住在开发者的工程里** — 顺滑聊天 + **可插拔 IDE 渗透** |
| **核心扩展** | 聊天平台 · 内核 · 角色 · 身份 · 编辑器上下文 · **宿主 API（0.4+）** |
| **渗透** | **可选插件**（日记/信/idle 等合并一包）；见 [`PENETRATION_PLUGIN_MODEL.md`](./PENETRATION_PLUGIN_MODEL.md) |
| **明确不做** | Cursor 式默认编程 Agent；**官方包办全套效率渗透** |
| **场景** | `scene_id=vscode` |
| **默认 profile** | `vscode.oclive.toml`：`pure_chat`、`skip_agent` |
| **互动模式** | 永久 `pure_chat`（决策门 B） |

**效率边界**：OCLive **不必**做最好用的 IDE 效率工具；提供 **契约 + 参考插件 + 创作空间**。

---

## UI（核心 · VS-1）

```text
┌ 顶栏：新对话 · 角色选择 · 设置 ─────────┐
├ 立绘 / emoji                            │
├ 对话区 + 输入                            │
├ 状态条：身份 / 模型 / 连接               │
└ 状态栏：attach / spawn / offline       │
```

- **0.4+**：Chat 工具栏「记入日记/写信」等 **移至渗透插件**；核心侧栏不含渗透按钮（未装插件时）。

---

## 内核与角色路径（自动发现）

（不变 — 见 0.3.x 文档）

---

## 设置（核心）

| 键 | 默认 | 说明 |
|----|------|------|
| `oclive.autoDiscover` | `true` | 自动发现 roles + kernel |
| `oclive.roleId` | `mumu` | 角色目录名 |
| `oclive.includeEditorContext` | `true` | 当前文件/选区进 message |
| `oclive.chat.streaming` | `true` | `POST /chat/stream` |

### 渗透（0.4+ 插件 · 非核心）

| 产物 | 说明 |
|------|------|
| `oclive.oclive-vscode-penetration` | 官方渗透 vsix；`oclive-penetration.*` 设置与命令 |
| `@oclive/vscode-host` | 第三方插件 npm 契约 |

核心 **已删除** `oclive.penetration.*` 与 `oclive.appendDiary` 等命令。见 [`MIGRATION_0.3_to_0.4.md`](./MIGRATION_0.3_to_0.4.md)。

契约字段（`penetration_templates`、`.oclive/` 路径）仍有效 — **由插件消费**，主仓 validation 不变。

---

## VS-4 Agent（高级 · 可选）

见 [`VS4_AGENT.md`](./VS4_AGENT.md)。与 **渗透插件** 正交。

---

## 相关文档

| 文档 | 路径 |
|------|------|
| 产品战略 | [`STRATEGY.md`](./STRATEGY.md) |
| 渗透插件模型 | [`PENETRATION_PLUGIN_MODEL.md`](./PENETRATION_PLUGIN_MODEL.md) |
| 路线图 | [`ROADMAP.md`](../ROADMAP.md) |
| 主仓契约镜像 | [`VSCODE_DISTRIBUTION.md`](../../oclivenewnew/creator-docs/role-pack/VSCODE_DISTRIBUTION.md) |
