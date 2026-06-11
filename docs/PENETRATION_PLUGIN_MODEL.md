# VS Code 渗透 · 插件化模型

**状态**：2026-06-11 战略调整 · 取代「扩展内置渗透」为长期默认  
**上级文档**：[`STRATEGY.md`](./STRATEGY.md) · 决策门 [`GATE_DECISIONS.md`](./GATE_DECISIONS.md)

---

## 1. 为什么要改

0.3.x 把 **写日记、写信、idle 提醒、终端一行、`.oclive/` 写盘** 做进了 `oclive-vscode` 本体。能跑通，但和产品定位冲突：

| 旧假设 | 新定位 |
|--------|--------|
| 官方扩展 = 聊天 + 渗透一体 | **官方扩展 = 角色聊天平台**；渗透 = **可选插件** |
| 我们要把 IDE 渗透做「最好用」 | 我们要把 **创作空间** 留给开发者；效率工具 **不必做到最好** |
| 用户装扩展即获得日记/信 | 用户 **主动安装** 渗透插件，并意识到 **IDE 适配可自定义** |

**一句话**：OCLive 提供 **角色在场 + 可扩展宿主**；「怎么渗透进工程」交给 **插件作者**（含官方参考实现）。

---

## 2. 能力分包

### 2.1 核心扩展（`oclive-vscode` · 长期 SSOT）

**只做平台，不做渗透产品：**

| 能力 | 说明 |
|------|------|
| 内核 attach/spawn · 8420 | 与桌面共享策略 |
| 侧栏聊天 · 流式 · 历史 · 身份 · 模型 | 对齐基础聊天发行版 |
| 编辑器上下文 | `oclive.includeEditorContext` |
| 角色包发现 · `scene_id=vscode` | 不变 |
| **宿主钩子（新增/稳定）** | 见 §3 |

**明确不做（移出核心）：** 日记追加、写信、idle/终端展示、`.oclive/` 写盘 UI、渗透设置大分区。

### 2.2 渗透插件包（官方参考 · 独立分发）

**一个插件集合**以下能力（自 0.3.x 内置迁移至姊妹仓）：

| 能力 | 实现位置（0.4+） |
|------|------------------|
| 记入日记 · `appendDiary` | `oclive-vscode-penetration/src/penetration/penetrationService.ts` |
| 写信 · `letters/` | `oclive-vscode-penetration/src/penetration/letterWriter.ts` |
| 路径白名单 · 首次写授权 | 核心 `hostApi/workspaceWrite.ts`（插件经 `requestWorkspaceWrite`） |
| idle / 终端一行 | `oclive-vscode-penetration` · `idleMonitor.ts` · `terminalDisplay.ts` |
| 角色包 `penetration_templates` | `rolePackPenetration.ts`（插件读） |
| 可选 C2 记忆同步 | `host.getKernelClient().bridgeDispatch(...)` |

**三仓 + npm（D1=B · D3=A）：**

| 仓库 | 产物 |
|------|------|
| **`oclive-vscode-host`** | npm `@oclive/vscode-host` — 类型、`resolveOcliveHost()` |
| **`oclive-vscode`** | 核心 vsix — `OcliveHostApi` 实现 + Chat 工具栏插槽 |
| **`oclive-vscode-penetration`** | 渗透 vsix — `oclive-penetration.*` 命令 |

**Deferred**：工作区 bundled 目录插件 + RPC（与桌面 directory 范式对齐）。

官方插件 = **参考实现 + 默认体验**，不是唯一实现。开发者可 fork、删减、换成「只写心声 md」「只读不写」等。

---

## 3. 核心扩展应暴露的宿主 API（0.4+ · npm SSOT）

契约定义在 npm **`@oclive/vscode-host`**；核心 `activate()` **return** 实现体，第三方经 **`resolveOcliveHost()`** 获取。

```text
┌─────────────────────────────────────────────────────────┐
│  @oclive/vscode-host（npm 契约）                          │
│  · OcliveHostApi 类型 · HOST_API_VERSION · resolveHost    │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│  oclive-vscode（平台实现）                                  │
│  · onChatTurnCompleted · onKernelReady                    │
│  · getEditorContext · getRolePackPath · getRecentTurn     │
│  · requestWorkspaceWrite · getKernelClient                │
│  · registerChatToolbarAction（D2 动态插槽）                 │
└───────────────────────────┬─────────────────────────────┘
                            │ resolveOcliveHost()
┌───────────────────────────▼─────────────────────────────┐
│  oclive-vscode-penetration / 第三方插件                     │
│  · oclive-penetration.* 命令 · toolbar 注册 · 写盘逻辑       │
└─────────────────────────────────────────────────────────┘
```

| API | 用途 |
|-----|------|
| `onChatTurnCompleted` | 回合结束 → 插件决定是否落盘 |
| `getRecentTurn()` | 最近一轮 user/assistant 文本 |
| `requestWorkspaceWrite` | 白名单 + 首次授权 + gitignore 提示 |
| `getRolePackPath()` | 定位角色包目录（读 `penetration_templates`） |
| `registerChatToolbarAction` | Chat 顶栏按钮 → `executeCommand` |
| `getKernelClient().bridgeDispatch` | C2 `update_memory` 等 |

详见 [`HOST_API_V1.md`](./HOST_API_V1.md) 与 `oclive-vscode-host/README.md`。

**原则：** 内核 `process_message` **仍不** 为渗透改编排；插件纯宿主侧，与 Agent 槽正交。

---

## 4. 与「效率 / 生产力」的边界

| OCLive 负责 | 不追求 / 交给生态 |
|-------------|-------------------|
| 角色对话质量、跨宿主记忆、六槽可替换 | 「最好用的编程 Agent」 |
| 渗透 **契约**（路径约定、授权、模板字段） | 渗透 **具体 UX**（必须官方一种） |
| 官方 **示例插件** | 官方 **唯一** 渗透方案 |
| 编辑器上下文进 prompt | 自动改代码、全仓 refactor |

**给开发者的信号：** 装核心扩展 = 角色能聊；装渗透插件 = **你选** 她/他怎么留在 repo 里；自己写插件 = **IDE 适配是你作品的一部分**。

---

## 5. 迁移路线

| 版本 | 核心扩展 | 渗透插件 |
|------|----------|----------|
| **0.3.2** | 内置渗透（过渡） | 无 |
| **0.4.0**（Breaking） | 宿主 API + 工具栏插槽；**删除** 内置渗透与 `oclive.appendDiary` 等 | `oclive-vscode-penetration@0.1.0` parity |
| **0.4.x** | 设置「插件」分区引导安装 | Open VSX / vsix 与核心分列 |
| **0.5.x** | 生态增量（minimal 样例、作者文档完善） | 可选功能迭代 |

0.3.x 用户：见 [`MIGRATION_0.3_to_0.4.md`](./MIGRATION_0.3_to_0.4.md)。未装渗透插件 = 纯聊天。

---

## 6. 角色包与主仓契约（不变）

- `config.json` → `penetration_templates`：**仍由主仓 `oclive_validation` 校验**（插件读，核心不删 schema）
- 工作区 `.oclive/` 目录语义：**文档 SSOT** 仍见 [`CREATOR_VSCODE_PACK.md`](./CREATOR_VSCODE_PACK.md)
- `distro.oclive.toml` `[penetration]`：**迁移为插件 profile 默认值**，不再绑死在核心 spawn profile（0.4+）

---

## 7. 验收（插件模型 Done）

- [ ] 核心扩展 README / 设置页说明「渗透 = 可选插件」
- [ ] `oclive-vscode-penetration` 独立 vsix，F5 与核心并列安装可完成日记+信
- [ ] 第三方空插件样例：仅订阅 `onChatTurnCompleted` 写自定义 md
- [ ] 核心 0.5 移除内置渗透后，0.3 渗透单测迁移到插件仓

---

## 相关文档

| 文档 | 说明 |
|------|------|
| [`STRATEGY.md`](./STRATEGY.md) | 产品北极星 |
| [`ROADMAP.md`](../ROADMAP.md) | 里程碑 |
| [`CREATOR_VSCODE_PACK.md`](./CREATOR_VSCODE_PACK.md) | 创作者 · `.oclive/` 与模板字段 |
| 主仓 [`VSCODE_DISTRIBUTION.md`](../../oclivenewnew/creator-docs/role-pack/VSCODE_DISTRIBUTION.md) | 跨仓契约镜像 |
