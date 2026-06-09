# Agent / AI 协作说明（oclive-vscode）

OCLive VS Code 扩展。契约与 Phase 1 决策：

- [`../oclivenewnew/creator-docs/role-pack/CROSS_HOST_MEMORY.md`](../oclivenewnew/creator-docs/role-pack/CROSS_HOST_MEMORY.md)
- 主仓 [`../oclivenewnew/AGENTS.md`](../oclivenewnew/AGENTS.md)

**Phase 1**：attach `8420` 优先；仅 VS Code 时 spawn `kernel_server --api`；`scene_id=vscode`；共 `app.db` + `OCLIVE_ROLES_DIR`。

**EnsureReport 契约**：变更 `kernel_ensure_plan_v1.json` 或 VS Code 侧 ensure 解析逻辑时，在本地（需已 `cargo build -p oclive-cli`）运行：

```bash
npm run test:ensure-report
```

主仓 CI 的 `kernel_ensure_plan_snapshot` 为强制门禁；本仓 CI **不**构建 `oclive-cli`，请开发者手动跑上述脚本。
