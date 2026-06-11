# oclive-vscode 路线图

**战略（以角色为基点 · 非 Cursor）**：[`docs/STRATEGY.md`](docs/STRATEGY.md)  
**决策门锁定**：[`docs/GATE_DECISIONS.md`](docs/GATE_DECISIONS.md)

---

## 阶段总览

| 阶段 | 北极星 | 状态 |
|------|--------|------|
| **VS-1** 聊天底座 | 与基础聊天发行版同级的流畅易用 | **Done**（0.3.2） |
| **VS-2** 渗透 v1/v2 | 角色在工作区留痕（日记、信、`.oclive/`） | **Done**（0.3.2） |
| **VS-3** 渗透可配置 | 白名单 / 模板 / validation / 记忆 C2 | **Done**（0.3.2） |
| **VS-4** 可选 Agent | MCP HTTP + QuickPick（高级 profile） | **Done**（0.3.2 · 默认 profile 无入口） |
| **0.4 波次 5** | pack-editor 情绪图 · vscode-lite 导出 | **Deferred** — [`WAVE5_ASSETS_ASSESSMENT.md`](docs/WAVE5_ASSETS_ASSESSMENT.md) |

渗透与内核 **Agent 槽正交**：VS-2/VS-3 **不需要** `skip_agent = false`。详见战略文档 §3。

---

## VS-1 · 聊天底座（0.3.x → 0.3.1）

- [x] 内核 attach / spawn（8420）
- [x] 侧栏：顶栏立绘（包内图或 emoji）+ 对话（统一 Svelte webview）
- [x] `scenes/vscode` 欢迎语
- [x] Setup、状态栏、编辑器上下文
- [x] 聊天历史持久化（`GET /chat/sessions` + `/chat/messages`，共享 `OCLIVE_APP_DATA`）
- [x] 状态栏 tooltip（数据目录 / attach vs spawn）
- [x] 用户身份（设置页 Identity 分区；Chat meta 状态条深链）
- [x] **OCLive: Select Role**（QuickPick 或 Chat 顶栏）
- [x] **设置 Webview**（Svelte + Vite）：Kernel / Editor / Role / Identity / Model / Layout / Penetration / Advanced
- [x] 主仓 HTTP LLM 路由（`/llm/user_settings`、`/llm/ollama_models`、`/llm/session_model`）
- [x] `kernelClient` 扩展（Health JSON、完整 RoleInfo、LLM API、`ensureReady` 短 TTL 缓存）
- [x] Chat ↔ Settings 应用内路由（无整页 `webview.html` 重置）
- [x] **聊天体验**：停止生成（AbortSignal）、加载计时/冷启动提示、Ollama 预热、`POST /chat/stream` 逐 token（`oclive.chat.streaming`）
- [x] **破壁元操作**：撤回/重生成/编辑重发/删单条（`meta_action_templates` + `/chat/storage`）
- [x] **V-VSCODE-PERF-05** F5 实机验收（attach + spawn 两路径）— 清单 [`docs/F5_ACCEPTANCE.md`](docs/F5_ACCEPTANCE.md)
- [x] **V-VSCODE-PERF-05** 首次 `.vsix` 发布（`npm run package` → `oclive-vscode-0.3.x.vsix`）
- [x] **0.3.2** 聊天第二轮：性能 mark · 重连 · 历史会话下拉 · 无工作区提示

### VS-1 与基础聊天 parity

- [x] 互动模式：**永久 pure_chat**（`allow_mode_switch=false`；见 [`GATE_DECISIONS.md`](docs/GATE_DECISIONS.md)）
- [x] 身份流程：设置直选（文档固定；无桌面惊喜解锁）
- [ ] 聊天存储管理（搜索/导出）— 优先级低于渗透

---

## VS-2 · 渗透 v1（角色在工作区留痕）

| 能力 | 说明 | 状态 |
|------|------|------|
| 工作区约定 | `.oclive/{roleId}/` 目录语义 | **Done** |
| 写日记 | Chat「记入日记」+ `oclive.appendDiary` | **Done** |
| 授权 / `.gitignore` | 首次写盘确认；可选加入 `.gitignore` | **Done** |
| 终端一行 | `oclive.penetration.terminal.enabled` | **Done** |
| idle 提醒 | `oclive.penetration.idle.*` | **Done** |
| 信 | `letters/` + `oclive.writeLetter` · `revealOcliveFolder` | **Done**（0.3.2） |
| N 轮日记提示 | `autoDiaryEveryNTurns` + InformationMessage | **Done**（0.3.2） |

---

## VS-3 · 渗透可配置

- [x] `oclive.penetration.*` 设置 + 设置页 **渗透** 分区
- [x] 角色包 `penetration_templates`（扩展 + 主仓 `oclive_validation`）
- [x] 工作区 `.oclive/config.json` 合并链（优先级低于用户设置）
- [x] 记忆 C2：手动「日记摘要提交记忆」→ `bridge/dispatch` · `update_memory`
- [x] `distro.oclive.toml` `[penetration]` 段声明（扩展 spawn 默认）

---

## VS-4 · 可选 Agent（高级用户）

- [x] 文档：[`docs/VS4_AGENT.md`](docs/VS4_AGENT.md) + `vscode-agent.oclive.toml` 示例
- [x] `OCLive: List MCP Servers` + `/high_risk/grant` 授权胶水
- [x] 内核 `/mcp/servers|tools|call`（主仓 Gate — [`VSCODE_MCP_HTTP_GATE.md`](../oclivenewnew/handoff/VSCODE_MCP_HTTP_GATE.md)）
- [x] 扩展 MCP QuickPick + Output（`vscode-agent` profile / `OCLive: Call MCP Tool (Advanced)`）
- [ ] 聊天存储管理（搜索/导出）— 0.5.x
- **非默认路径**；不替代 VS-2 确定性渗透

---

## 依赖主仓 / 编写器

- 技术契约：[VSCODE_DISTRIBUTION.md](docs/VSCODE_DISTRIBUTION.md) · 主仓 [VSCODE_DISTRIBUTION.md](../oclivenewnew/creator-docs/role-pack/VSCODE_DISTRIBUTION.md)
- 跨宿主记忆：[CROSS_HOST_MEMORY.md](../oclivenewnew/creator-docs/role-pack/CROSS_HOST_MEMORY.md)
- 发行版 profile 示例：`oclivenewnew/examples/distro-profiles/vscode.oclive.toml`
