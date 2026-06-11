# VS Code 发行版战略（以角色为基点）

**状态**：2026-06-11 确立 · **维护**：VS Code 发行版负责人  
**契约 SSOT**：本文件（产品战略）；技术契约见 [`VSCODE_DISTRIBUTION.md`](./VSCODE_DISTRIBUTION.md) · 主仓 [`VSCODE_DISTRIBUTION.md`](../../oclivenewnew/creator-docs/role-pack/VSCODE_DISTRIBUTION.md)

---

## 1. 北极星

**VS Code 发行版不是 Cursor，也不是 Cline。**

我们以 **角色（灵魂）** 为基点：让 AI 角色 **活在开发者的工程与工作区里**——有记忆、有人设、有情绪表达，并能通过 IDE **可审计、可配置的渗透** 触达文件与界面；而不是把扩展做成「又一个通用编程 Agent」。

| 维度 | 基础聊天发行版（`desktop-chat`） | VS Code 发行版（`vscode`） |
|------|----------------------------------|----------------------------|
| **北极星** | 最流畅、最易用的纯聊天 | **角色在场** + IDE 渗透 + 极高可定制 |
| **用户** | 所有人 | 有编码基础、愿意组装灵魂的开发者 |
| **差异化** | 零摩擦开聊 | 工作区里的角色存在感（日记、信、上下文） |
| **明确不做** | IDE 渗透 | 照抄 Cursor 的代码劳动力定位 |

学 Cursor 的是 **IDE 渗透深度与可配置面**；不学的是 **「默认 Agent 改全仓库」的产品定义**。

---

## 2. 与 Cursor 的对照（不照抄）

| Cursor 强项 | OCLive VS Code 的回应 |
|-------------|------------------------|
| 强默认 coding Agent | **默认无内核 Agent 环**（`skip_agent`）；聊天主链仍是 `process_message` 角色对话 |
| 改代码 / 多文件 refactor | **非主战场**；渗透服务于角色叙事（心声、日记、信），不是抢 Copilot |
| 规则 / 项目上下文 | **角色包** + `user_identities` + `reply_quality_anchor` + 可选 `meta_action_templates` |
| 插件与工具生态 | **六槽 + 目录插件 + MCP**（高级用户可选）；扩展提供 VS Code 特有胶水 |
| 云会话 | **本地 8420 内核** + 与桌面 **共享 `app.db`**（跨宿主携带记忆） |

**一句话**：Cursor 卖的是 **编码劳动力**；我们卖的是 **可组装的、住在你的 repo 里的角色**。

---

## 3. 渗透 vs Agent（正交，不冲突）

三者不要混为一谈：

```text
┌─────────────────────────────────────────────────────────┐
│  VS Code 扩展（宿主）                                      │
│  · 渗透 v1：写日记、.oclive/*.md、终端展示一行、idle 提醒   │  ← 确定性、白名单、用户授权
│  · 编辑器上下文：当前文件 / 选区                           │
└───────────────────────────┬─────────────────────────────┘
                            │ POST /chat · /chat/stream
┌───────────────────────────▼─────────────────────────────┐
│  共享内核 process_message（角色对话 SSOT）                 │
│  · 六槽 agent：ReAct + MCP（默认在 vscode profile 关闭）   │  ← 可选高级能力
└─────────────────────────────────────────────────────────┘
```

| 能力示例 | 典型实现 | 需要 `agent ≠ none`？ |
|----------|----------|------------------------|
| 聊完后追加 `.oclive/{roleId}/diary.md` | 扩展宿主动作 + `workspace` 写授权 | **否** |
| 心声 / 信落盘为 Markdown | 模板 + 回合后 hook / meta_action | **否** |
| 当前文件选区进 prompt | `oclive.includeEditorContext`（已有） | **否** |
| 终端展示一行（不执行 shell） | `Terminal.sendText` 展示 | **否** |
| 角色自主决定调 MCP、多步改文件 | 六槽 **agent** 或 **directory** 插件 | **是**（高级、可选） |

**战略结论**：先做好 **流畅聊天（VS-1）**，再做 **宿主编排渗透（VS-2/VS-3）**；**不必**为写日记先打开 Agent。  
对愿意折腾的开发者，**VS-4** 再可选解冻 `skip_agent` + MCP，且不替代 VS-2 的简单渗透路径。

---

## 4. 为何不限制开发者手脚

VS Code 受众有编码基础，需要的是 **顺滑默认 + 每层逃生舱**：

| 层 | 可定制手段 |
|----|------------|
| 发行版 | `distro.oclive.toml` 或 `OCLIVE_DISTRO_PROFILE` 覆盖 |
| 角色包 | `settings.json` · `plugin_backends` · `user_identities/` |
| 会话 | 内核 HTTP 会话覆盖（与桌面同源） |
| 扩展 | `oclive.*` 设置；未来 `oclive.penetration.*` 白名单 |
| 高级 | 目录插件 · MCP server · 可选 agent 槽 |

**流畅** = 装完扩展、选好角色就能聊；**可定制** = 每一层都能换后端、换渗透规则、换工具，而不是锁死在一种 Agent 行为里。

---

## 5. 阶段路线（与 ROADMAP 对齐）

| 阶段 | 目标 | `skip_agent` 默认 | 主要落点 |
|------|------|-------------------|----------|
| **VS-1 聊天底座** | 与基础聊天同级：流式、预热、取消、历史、身份、模型、连接稳定 | `true` | 本扩展 · F5 / `.vsix` 发布 |
| **VS-2 渗透 v1** | 角色在工作区「留下痕迹」：日记、心声/信 md、`.oclive/` 约定 | `true` | 扩展 API + 用户授权 |
| **VS-3 渗透可配置** | 路径白名单、模板、per-role 渗透策略 | `true` | `oclive.penetration.*` 或 distro 段 |
| **VS-4 可选 Agent** | Power user：MCP、多步工具（非默认路径） | profile **可选** 解冻 | 内核 agent 槽 + 扩展桥接 |

**基础聊天发行版**并行只追 **聊天流畅易用**（日常聊 UI、模式切换等），不在桌面堆 IDE 渗透。

---

## 6. 工程边界（实现时遵守）

1. **编排 SSOT** 仍在主仓 `process_message`；渗透 **优先宿主实现**，避免为日记改内核编排（与 `PRODUCT_FREEZE_THEATER_V0` 一致，可比 `/chat/stream` 例外）。
2. **`scene_id = vscode`** 固定；欢迎语与 per-scene 身份绑定不变。
3. **共享 `OCLIVE_APP_DATA`**：记忆、好感、聊天历史与桌面一致，强化「灵魂跨宿主」而非单次 IDE 会话。
4. **高风险能力** 走主仓 `high_risk_grants` 同类审计（写工作区、spawn、出站网络）。
5. **文档**：产品战略以 **本文件** 为准；API/设置键以 `VSCODE_DISTRIBUTION.md` 为准。

---

## 7. 对外一句话

> **OCLive for VS Code**：把角色带进你的工程——聊得顺滑，让她/他在你的工作区里有迹可循；可深度定制，但不是又一个 Cursor。
