# oclive-vscode 路线图

## 当前（0.3.x）

- [x] 内核 attach / spawn（8420）
- [x] 侧栏：顶栏立绘（包内图或 emoji）+ 对话（统一 Svelte webview）
- [x] `scenes/vscode` 欢迎语
- [x] Setup、状态栏、编辑器上下文
- [x] 聊天历史持久化（`GET /chat/sessions` + `/chat/messages`，共享 `OCLIVE_APP_DATA`）
- [x] 状态栏 tooltip（数据目录 / attach vs spawn）
- [x] 用户身份（设置页 Identity 分区；Chat meta 状态条深链）
- [x] **OCLive: Select Role**（QuickPick 或设置页 Role 分区）
- [x] **设置 Webview**（Svelte + Vite）：Kernel / Editor / Role / Identity / Model / Layout / Advanced
- [x] 主仓 HTTP LLM 路由（`/llm/user_settings`、`/llm/ollama_models`、`/llm/session_model`）
- [x] `kernelClient` 扩展（Health JSON、完整 RoleInfo、LLM API、`ensureReady` 短 TTL 缓存）
- [x] Chat ↔ Settings 应用内路由（无整页 `webview.html` 重置）
- [x] **聊天体验**：停止生成（AbortSignal）、加载计时/冷启动提示、Ollama 预热、`POST /chat/stream` 逐 token（`oclive.chat.streaming`）
- [x] **破壁元操作**：撤回/重生成/编辑重发/删单条（`meta_action_templates` + `/chat/storage`）
- [ ] F5 实机验收（attach + spawn 两路径；2026-06-10 待开发者本机确认）
- [ ] 首次 `.vsix` 发布（`npm run package` 产物待签名上架）

## 渗透（未实现 · 默认关闭）

以下为产品讨论项，**当前扩展无 `oclive.penetration.*` 配置键**；路线图与实现状态以本段为准（设置面板不再展示无功能占位项）。

| 功能 | 说明 |
|------|------|
| 心声 / 信 | 工作区 `.oclive/{roleId}/*.md` |
| idle 聚焦 | N 秒无输入可切侧栏；每日上限可配 |
| 终端一行 | `Terminal.sendText` 仅展示（颜文字由 LLM 在 reply 中生成） |

## 依赖主仓 / 编写器

- 契约：[VSCODE_DISTRIBUTION.md](../oclivenewnew/creator-docs/role-pack/VSCODE_DISTRIBUTION.md)
- 编写器情绪编辑：[PACK_EDITOR_ROADMAP.md](../oclivenewnew/handoff/PACK_EDITOR_ROADMAP.md)
