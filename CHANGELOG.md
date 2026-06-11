# Changelog

All notable changes to the OCLive VS Code extension are documented here.

## [Unreleased]

## [0.4.1] — 2026-06-11

### Added

- **设置 → 存储**：会话列表、搜索、Markdown 导出（薄 UI；内核 `/chat/storage`）
- **宿主 API v1.1**（`@oclive/vscode-host` 0.2.0）：`getChatHistory` · `onKernelDisconnected`

### Changed

- 依赖 `@oclive/vscode-host` ^0.2.0（registry；本地 dev 可用 `file:`）
- 设置 → 插件分区附 Release 下载链接

## [0.4.0] — 2026-06-11 · **Breaking**

### Added

- **宿主 API v1**：`activate()` 导出 `OcliveHostApi`；npm 契约 [`@oclive/vscode-host`](../oclive-vscode-host/README.md)
- **Chat 动态工具栏**：`registerChatToolbarAction` 插槽（未装渗透插件时顶栏无日记/信按钮）
- **设置 → 插件**：安装官方渗透插件引导；[`MIGRATION_0.3_to_0.4.md`](docs/MIGRATION_0.3_to_0.4.md)

### Removed · Breaking

- **内置渗透**：删除 `src/penetration/*`、`oclive.appendDiary` / `writeLetter` / `revealOcliveFolder` / `syncDiaryMemory`
- **设置键**：`oclive.penetration.*`（迁移至姊妹扩展 `oclive-penetration.*`）
- **无 shim**：旧命令 ID 不转发

### Migration

- 须安装 **`oclive.oclive-vscode-penetration`** 恢复日记/信能力
- 命令改为 `oclive-penetration.*`；见 [`docs/MIGRATION_0.3_to_0.4.md`](docs/MIGRATION_0.3_to_0.4.md)

## [0.3.2] — 2026-06-11

### Added

- **CI**：`test:ensure-report` · `test:capability`；tag 推送 Release 工作流附 `.vsix`
- **主仓镜像**：`examples/distro-profiles/vscode.oclive.toml` 补 `[penetration]`
- **渗透单测**：`formatDiaryEntry` · `summarizeDiaryForMemory` · glob 拒绝 / `..` 路径
- **聊天**：性能 `performance.mark`（bootstrap / 首 token）；侧栏「重连」；`listChatSessions` 历史下拉；无工作区非阻塞提示
- **渗透 v2**：`letters/` 写信 · `revealOcliveFolder` · 每 N 轮记入日记**提示** · idle/终端角色化文案
- **创作者**：主仓 `penetration_templates` validation · `.oclive/config.json` 合并链 · [`CREATOR_VSCODE_PACK.md`](docs/CREATOR_VSCODE_PACK.md)
- **VS-4**：内核 `/mcp/servers|tools|call` · 扩展 MCP QuickPick（**默认 profile 无入口**）
- **文档**：[`WAVE5_ASSETS_ASSESSMENT.md`](docs/WAVE5_ASSETS_ASSESSMENT.md)

### Changed

- **版本**：0.3.1 → 0.3.2
- **MCP grant**：HTTP body 对齐 `kind: mcp:http|mcp:stdio`（修复旧 `capability` 字段）

## [0.3.1] — 2026-06-11

### Added

- **渗透 v1 (VS-2)**：工作区 `.oclive/{roleId}/` 契约；记入日记（Chat 工具栏 + `OCLive: Append to Diary`）；首次写盘授权；`.gitignore` 提示；可选终端一行展示与 idle 聚焦提醒。
- **渗透可配置 (VS-3)**：设置 → 渗透分区（`oclive.penetration.*`）；角色包 `penetration_templates` 扩展侧合并；可选「日记摘要提交长期记忆」。
- **VS-4 文档**：可选 Agent profile（`vscode-agent.oclive.toml`）与 MCP 桥接说明（`docs/VS4_AGENT.md`）。
- **内核错误文案**：`kernel code` → 用户可操作中文提示（连不上内核 / 换模型等）。
- **决策门文档**：[`docs/GATE_DECISIONS.md`](docs/GATE_DECISIONS.md)（渗透 C · 模式 A · 记忆 C1+C2）。

### Changed

- **发行版 profile**：`distro.oclive.toml` 设 `allow_mode_switch = false`（VS Code 永久 `pure_chat`）。
- **连接稳定性**：健康连接 TTL 内信任缓存；health 失败与发送失败强制 `invalidateEnsureReady`；侧栏隐藏时轮询 60s（对齐 K-PERF-11）。

### Release

- F5 实机验收清单：[`docs/F5_ACCEPTANCE.md`](docs/F5_ACCEPTANCE.md)
- 打包：`npm run package` → `oclive-vscode-0.3.1.vsix`

### Dependencies

- 本地 **Ollama**（`plugin_backends.llm = ollama` 时）或云端 LLM 配置
- **oclive-kernel-server** / 桌面内核 attach 于 `:8420`
- 角色包目录：`OCLIVE_ROLES_DIR` 或自动发现 `oclivenewnew/roles`

## [0.3.0] — 2026-06-07

- VS-1 聊天底座：attach/spawn、流式、预热、历史、身份、模型、元操作、设置 Webview。
