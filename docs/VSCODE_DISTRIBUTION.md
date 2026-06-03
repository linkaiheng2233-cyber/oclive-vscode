# VS Code 发行版（扩展）

**状态**：Phase 1 开发中。契约见主仓 [`CROSS_HOST_MEMORY.md`](../../oclivenewnew/creator-docs/role-pack/CROSS_HOST_MEMORY.md)。

## 产品定位

- 对标桌面 **`pure_chat`** 对话能力 + **可选** IDE 渗透（信、心声、idle 提醒等，默认关闭）。
- 不是 Cline/Continue 类编程 Agent；终端不执行 shell，仅可选展示 LLM 在 `reply` 中的颜文字。

## UI（当前）

```text
┌ 立绘 / emoji（assets/images 或回退）─┐
│ 角色名 · emotion 标签                │
├ 对话区（含 scenes/vscode 欢迎语）    │
├ 输入 + 发送                          │
└ 状态栏：attach / spawn / offline     │
```

- 情绪图：`portrait_emotion` → `roles/{id}/assets/images/`（与桌面 `emotion-assets.ts` 同名约定）。
- 无图时用 emoji；`mumu` 演示包可后续在编写器补图。

## 内核与角色路径（自动发现）

- **8420 已有 `/health`** → 只 attach，不二次 spawn（与桌面共用单写者）。
- **无服务** → 按分数选 spawn 二进制：共享运行时 `%LOCALAPPDATA%\OCLive\runtime\` > 本机 dev 全量构建（`oclivenewnew-tauri --api` / `oclive-kernel-server`）> 扩展自带 `bin/`（降级）。
- **roles**：`OCLIVE_ROLES_DIR` / 工作区 `roles/` / 并列 `oclivenewnew/roles`。
- 详见扩展 README「Zero-config」表；`oclive.autoDiscover` 默认开。

## 设置（渗透默认关）

| 键 | 默认 | 说明 |
|----|------|------|
| `oclive.autoDiscover` | `true` | 自动发现 roles + kernel |
| `oclive.promoteSharedKernel` | `true` | 将最全 dev 内核复制到共享 runtime |
| `oclive.rolesDir` | — | 可留空，自动发现 |
| `oclive.roleId` | `mumu` | 角色目录名 |
| `oclive.includeEditorContext` | `true` | 当前文件/选区进 message |
| `oclive.mockLlm` | `false` | 开发可开 |

后续：`oclive.penetration.*`（信、心声、idle 聚焦）见产品讨论，未实现。

## 编写器日程（未做）

- **情绪图片编辑**：在 pack-editor 内管理 `assets/images/`（预览、替换、缺图提示）。
- **情绪族扩展**：内核现收敛 7 标签 + 前端 disgust 变体；多族立绘为后续 RFC。

## 分级导出（未做）

- `exportProfile: vscode-lite` 裁剪蓝图/场景/知识库，见主仓路线图。
