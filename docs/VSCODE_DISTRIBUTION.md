# VS Code 发行版（扩展契约）

**状态**：0.3.1（VS-1~3 Done · VS-4 文档+胶水）· 战略见 [`STRATEGY.md`](./STRATEGY.md) · 决策门 [`GATE_DECISIONS.md`](./GATE_DECISIONS.md)  
**跨宿主记忆**：主仓 [`CROSS_HOST_MEMORY.md`](../../oclivenewnew/creator-docs/role-pack/CROSS_HOST_MEMORY.md)

---

## 产品定位

### 以角色为基点（不是 Cursor）

| 项 | 约定 |
|----|------|
| **北极星** | **角色住在开发者的工程里** — 顺滑聊天 + IDE 渗透 + 可深度定制 |
| **明确不做** | 照抄 Cursor / Cline 的「默认编程 Agent 改全仓库」 |
| **聊天底座** | 体验对齐基础聊天发行版的 **流畅与易用**（共享 8420、`OCLIVE_APP_DATA`、角色包 v2） |
| **差异化** | 工作区渗透（日记、信、心声、`.oclive/`）与六槽/MCP **可选** 高级组装 |
| **场景** | `scene_id=vscode`（须在包 `meta.scenes` 中声明） |
| **默认内核 profile** | `distro.oclive.toml` / `examples/distro-profiles/vscode.oclive.toml`：`pure_chat`、`allow_mode_switch=false`、`skip_agent` |
| **互动模式** | VS Code **永久 pure_chat**；不调用 `/role/interaction_mode`（决策门 B=A） |

渗透 **不要求** 打开内核 Agent 槽；宿主编排动作与 `process_message` 内 ReAct 环正交。见 [`STRATEGY.md` §3](./STRATEGY.md#3-渗透-vs-agent正交不冲突)。

---

## UI（当前 · VS-1）

```text
┌ 顶栏：新对话 · 角色选择 · 设置 ─────────┐
├ 立绘 / emoji（assets/images 或回退）     │
├ 可拖拽分界条                           │
├ 状态条：身份 / 模型 / 连接（点进设置）   │
├ 对话区（增量渲染；含 scenes/vscode 欢迎）│
├ 输入 + 发送                            │
└ 状态栏：attach / spawn / offline       │
```

- 单一 Svelte 应用：`ChatView` + 设置七分区，侧栏内 `view` 路由切换（无整页 HTML 重置）。
- 情绪图：`portrait_emotion` → `roles/{id}/assets/images/`（与桌面 `emotion-assets.ts` 同名约定）。
- 无图时用 emoji。

桌面 **沉浸模式**（`immersive`）**不在** VS Code 发行版实现；共享记忆仍经 `OCLIVE_APP_DATA`。

---

## 内核与角色路径（自动发现）

- **策略 SSOT**：`kernel_strategy.rs` + `kernel_distro_profile.rs`（`resolve_kernel_action`）。扩展通过 **`oclive-cli kernel ensure --plan-only --distro vscode --distro-profile …`** 传入 VS Code 的 `DistroProfileRequirements`，本地执行 spawn/replace（见 `src/kernelStrategy.ts`）。
- **`ensureReady` 缓存**：成功 attach/spawn 后 5s TTL + in-flight 去重；`reconnectKernel` / 发送失败 / TTL 内 health 失败时强制重探。
- **Profile + 能力**：`/health` 的 `active_profile_summary` 与调用方 `distro.oclive.toml` 一并参与决策。
- **8420 无服务** → spawn 最全候选（共享 runtime → dev → 扩展 `bin/`）。
- **roles**：`OCLIVE_ROLES_DIR` / 工作区 `roles/` / 并列 `oclivenewnew/roles`。
- 详见主仓 [`DISTRO_KERNEL_LIFECYCLE.md`](../../oclivenewnew/creator-docs/kernel/DISTRO_KERNEL_LIFECYCLE.md)；`oclive.autoDiscover` 默认开。

---

## 设置

| 键 | 默认 | 说明 |
|----|------|------|
| `oclive.autoDiscover` | `true` | 自动发现 roles + kernel |
| `oclive.promoteSharedKernel` | `true` | 将最全 dev 内核复制到共享 runtime |
| `oclive.rolesDir` | — | 可留空，自动发现 |
| `oclive.roleId` | `mumu` | 角色目录名 |
| `oclive.includeEditorContext` | `true` | 当前文件/选区进 message（角色理解「你在写什么」） |
| `oclive.mockLlm` | `false` | 开发可开 |
| `oclive.chat.portraitPaneHeight` | `180` | 立绘区高度（Chat 可拖拽） |
| `oclive.chat.streaming` | `true` | `POST /chat/stream` 逐 token |
| `oclive.chat.warmupModel` | `true` | 本地 Ollama 预热 |
| `oclive.settings.placement` | `sidebar` | 设置内嵌侧栏或编辑器旁 |

### 渗透（VS-2 / VS-3 · 0.3.1）

| 键 | 默认 | 说明 |
|----|------|------|
| `oclive.penetration.enabled` | `true` | 总开关 |
| `oclive.penetration.diaryPath` | `.oclive/{roleId}/diary.md` | 日记模板 |
| `oclive.penetration.autoDiaryEveryNTurns` | `0` | 每 N 轮自动记入（0=关） |
| `oclive.penetration.allowedGlobs` | `[".oclive/**"]` | 写路径白名单 |
| `oclive.penetration.memorySync.enabled` | `false` | 手动 C2：日记摘要 → `update_memory` |

命令：`OCLive: Append to Diary` · `OCLive: Sync Diary Summary to Memory`  
契约：工作区 `.oclive/{roleId}/`；日记 **默认 ≠** 长期记忆（C1）；C2 见设置 → 渗透。

角色包可选段（扩展侧）：`config.json` → `penetration_templates`（`diary_header`、`diary_path`）。

---

## VS-4 Agent（高级 · 可选）

见 [`VS4_AGENT.md`](./VS4_AGENT.md) · `vscode-agent.oclive.toml` · `OCLive: List MCP Servers (Advanced)`。

---

## 编写器与导出（姊妹仓）

- **情绪图片编辑**：pack-editor Phase A — 见主仓 `PACK_EDITOR_ROADMAP.md`
- **分级导出 `vscode-lite`**：未做

---

## 相关文档

| 文档 | 路径 |
|------|------|
| 产品战略 | [`STRATEGY.md`](./STRATEGY.md) |
| 路线图 | [`ROADMAP.md`](../ROADMAP.md) |
| 主仓契约镜像 | [`VSCODE_DISTRIBUTION.md`](../../oclivenewnew/creator-docs/role-pack/VSCODE_DISTRIBUTION.md) |
