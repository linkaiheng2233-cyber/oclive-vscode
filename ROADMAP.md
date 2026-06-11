# oclive-vscode 路线图

**战略（以角色为基点 · 渗透插件化）**：[`docs/STRATEGY.md`](docs/STRATEGY.md) · [`docs/PENETRATION_PLUGIN_MODEL.md`](docs/PENETRATION_PLUGIN_MODEL.md)  
**决策门**：[`docs/GATE_DECISIONS.md`](docs/GATE_DECISIONS.md)

---

## 阶段总览

| 阶段 | 北极星 | 状态 |
|------|--------|------|
| **VS-1** 聊天底座 | 与基础聊天发行版同级的流畅易用 | **Done**（0.3.2） |
| **VS-2P** 渗透插件化 | 日记+信+idle 等 **独立插件**；核心宿主 API | **Next**（0.4.0） |
| **VS-3P** 渗透生态 | 第三方样例 · 核心默认无内置渗透 | **Planned**（0.4–0.5） |
| **VS-4** 可选 Agent | MCP HTTP + QuickPick（高级 profile） | **Done**（0.3.2 · 默认无入口） |
| **0.4 波次 5** | pack-editor 情绪图 · vscode-lite 导出 | **Deferred** |

**0.3.x 内置渗透（原 VS-2/VS-3）**：**Done 但 deprecated** — 迁移目标见 [`PENETRATION_PLUGIN_MODEL.md`](docs/PENETRATION_PLUGIN_MODEL.md) §5。

---

## VS-1 · 聊天底座（0.3.x）

- [x] 内核 attach / spawn（8420）
- [x] 侧栏：立绘 + 对话（Svelte webview）
- [x] `scenes/vscode` 欢迎语 · 历史 · 身份 · 模型 · 流式 · 元操作
- [x] 设置 Webview（Kernel / Role / Identity / Model / Layout / Advanced）
- [x] F5 / `.vsix` · 性能 mark · 重连 · 会话下拉
- [x] **永久 pure_chat**（`allow_mode_switch=false`）

---

## VS-2P · 渗透插件化（0.4.0 · 当前方向）

| 项 | 说明 | 状态 |
|----|------|------|
| 战略文档 | `PENETRATION_PLUGIN_MODEL.md` · 决策门 D | **Done** |
| 宿主 API | `onChatTurnCompleted` · `requestWorkspaceWrite` · 历史/角色包读取 | **Planned** |
| 官方插件仓 | `oclive-vscode-penetration`（extensionDependencies） | **Planned** |
| 功能 parity | 从 `src/penetration/*` 迁出：日记 · 信 · idle · 终端 · C2 | **Planned** |
| 核心 deprecated | 内置渗透标记过渡；设置页引导安装插件 | **Planned** |
| 核心默认 | `oclive.penetration.enabled` → **false**（0.4.x） | **Planned** |
| 核心移除 | 删除内置 `penetration/`（0.5.0） | **Planned** |

**原则**：日记与写信 **同一插件包**；核心 **不** 再扩展新的内置渗透功能。

---

## VS-2/VS-3 · 内置渗透（0.3.x · deprecated）

| 能力 | 0.3.2 状态 | 0.4+ |
|------|------------|------|
| `.oclive/{roleId}/` · 日记 | 核心内置 | → 渗透插件 |
| 写信 · idle · 终端 | 核心内置 | → 渗透插件 |
| `oclive.penetration.*` | 核心设置 | → 插件设置 + 宿主 API |
| `penetration_templates` validation | 主仓 | **保留**（插件读取） |

---

## VS-3P · 渗透生态（0.4–0.5）

- [ ] 第三方「最小渗透插件」样例（仅写自定义 md）
- [ ] 插件市场 / Open VSX 分列「核心」与「官方渗透」
- [ ] 创作者文档：自写渗透 vs 用官方插件
- [ ] `distro.oclive.toml` `[penetration]` 迁至插件 profile

---

## VS-4 · 可选 Agent（高级用户）

- [x] [`docs/VS4_AGENT.md`](docs/VS4_AGENT.md) · 内核 `/mcp/*` · QuickPick
- **与渗透插件正交**；不替代 VS-2P

---

## 依赖主仓 / 编写器

- 契约：[VSCODE_DISTRIBUTION.md](docs/VSCODE_DISTRIBUTION.md)
- 跨宿主记忆：[CROSS_HOST_MEMORY.md](../oclivenewnew/creator-docs/role-pack/CROSS_HOST_MEMORY.md)
- Profile 示例：`oclivenewnew/examples/distro-profiles/vscode.oclive.toml`
