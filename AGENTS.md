# Agent / AI 协作说明（oclive-vscode）

OCLive VS Code 扩展。**以角色为基点**（不是 Cursor）；产品战略见 [`docs/STRATEGY.md`](docs/STRATEGY.md)。

**2026-06 方向**：**渗透（日记/信/idle 等）迁移为可选插件**，核心只做聊天平台 + 宿主 API。详见 [`docs/PENETRATION_PLUGIN_MODEL.md`](docs/PENETRATION_PLUGIN_MODEL.md) · 决策门 D [`docs/GATE_DECISIONS.md`](docs/GATE_DECISIONS.md)。

契约：

- [`docs/STRATEGY.md`](docs/STRATEGY.md) — 北极星、平台 vs 插件、阶段 VS-1 / VS-2P / VS-4
- [`docs/PENETRATION_PLUGIN_MODEL.md`](docs/PENETRATION_PLUGIN_MODEL.md) — 渗透插件化 SSOT
- [`docs/VSCODE_DISTRIBUTION.md`](docs/VSCODE_DISTRIBUTION.md) — 技术契约
- [`ROADMAP.md`](ROADMAP.md) — 里程碑
- [`../oclivenewnew/creator-docs/role-pack/CROSS_HOST_MEMORY.md`](../oclivenewnew/creator-docs/role-pack/CROSS_HOST_MEMORY.md)
- 主仓 [`../oclivenewnew/AGENTS.md`](../oclivenewnew/AGENTS.md)
- 内核 spawn / attach SSOT：主仓 [`KERNEL_SCHEDULER_RESCOPE.md`](../oclivenewnew/handoff/KERNEL_SCHEDULER_RESCOPE.md) · [`DISTRO_KERNEL_LIFECYCLE.md`](../oclivenewnew/creator-docs/kernel/DISTRO_KERNEL_LIFECYCLE.md)

**实现纪律**：

- **0.4+（当前）**：核心 **无** `src/penetration/*`；渗透在姊妹仓 `oclive-vscode-penetration` 或第三方插件（npm `@oclive/vscode-host`）。
- **勿在核心新增渗透功能**；Chat 按钮仅经 `registerChatToolbarAction`。
- 内核编排 SSOT 仍在主仓 `process_message`；渗透 **不进** 六槽 / 编排链。
- 三仓联调：[`oclive-vscode.code-workspace`](oclive-vscode.code-workspace)

**EnsureReport 契约**：变更 `kernel_ensure_plan_v1.json` 或 VS Code 侧 ensure 解析逻辑时，在本地（需已 `cargo build -p oclive-cli`）运行：

```bash
npm run test:ensure-report
```

主仓 CI 的 `kernel_ensure_plan_snapshot` 为强制门禁；本仓 CI **不**构建 `oclive-cli`，请开发者手动跑上述脚本。
