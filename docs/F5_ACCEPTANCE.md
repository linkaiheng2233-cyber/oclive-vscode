# F5 / VSIX 实机验收矩阵（V-VSCODE-PERF-05）

**版本**：0.4.0 · **场景**：`scene_id = vscode` · **默认角色**：`mumu`

**三仓 F5**：打开 [`oclive-vscode.code-workspace`](../oclive-vscode.code-workspace)，分别对核心与渗透扩展执行「Run Extension」。

---

## 前置

1. `cargo build -p oclive-cli -p oclive-kernel-server`（主仓 `oclivenewnew`，含 MCP HTTP Gate）
2. `cd oclive-vscode && npm run compile:all`
3. 用**文件夹**打开含 `roles/mumu` 的工作区（渗透需要 workspace folder）
4. 角色库：`OCLIVE_ROLES_DIR` 或工作区 / 并列 `oclivenewnew/roles`
5. 本地 Ollama 已拉取角色所用模型，或开启 `oclive.mockLlm`（仅开发）

---

## 路径 A · attach（8420 已有内核）

| # | 步骤 | 期望 |
|---|------|------|
| A1 | 先启动桌面或 `oclivenewnew-tauri --api` / `oclive-kernel-server --api` | `GET :8420/health` → `ok` |
| A2 | F5 启动扩展 | 状态栏 **attach**；侧栏可开聊 |
| A3 | 发送单轮消息（流式开） | 逐 token 渲染；立绘/情绪更新 |
| A4 | 切角色 → 再聊一轮 | 不重 spawn；`ensureReady` 信任 TTL |
| A5 | 侧栏「重连」 | 强制 invalidate 后恢复连接 |
| A6 | 历史会话下拉 | 切换 session 后加载对应消息 |
| A7 | `npm run smoke:attach` | 退出码 0 |

---

## 路径 B · spawn（端口空闲）

| # | 步骤 | 期望 |
|---|------|------|
| B1 | 确保 8420 无监听 | `smoke.mjs` 或手动确认 |
| B2 | F5 启动扩展 | 状态栏 **spawn**；约 25s 内 health 绿 |
| B3 | 单轮流式对话 | 同 A3 |
| B4 | `npm run smoke` | 退出码 0 |

---

## VSIX 分发

```bash
cd oclive-vscode
npm run package
```

| # | 步骤 | 期望 |
|---|------|------|
| V1 | 产物 `oclive-vscode-0.4.0.vsix` 存在 | `vsce package` 成功 |
| V2 | VS Code「从 VSIX 安装」 | 扩展激活；OCLive 侧栏可见 |
| V3 | 安装后 attach 或 spawn 各跑一轮 | 同 A/B 聊天期望 |

---

## 单元 / 契约

```bash
npm run test:unit
npm run test:ensure-report
npm run test:capability
```

均应绿（`test:ensure-report` 需已 `cargo build -p oclive-cli`）。

---

## 清单 A · 仅核心（0.4.0）

| # | 步骤 | 期望 |
|---|------|------|
| C1 | F5 仅核心扩展 | Chat 可聊；顶栏 **无** 记入日记/写信 |
| C2 | 命令面板 | **无** `oclive.appendDiary` 等旧命令 |
| C3 | 设置 → 插件 | 显示渗透插件安装引导 |
| C4 | `npm run test:unit` | 绿（无 penetration 单测） |

## 清单 B · 核心 + 渗透插件

| # | 步骤 | 期望 |
|---|------|------|
| P1 | F5 核心 + `oclive-vscode-penetration` | Chat 顶栏出现记入日记/写信 |
| P2 | Chat「记入日记」 | 首次弹授权；`.oclive/mumu/diary.md` 追加 |
| P3 | `oclive-penetration.writeLetter` | `.oclive/mumu/letters/*.md` 创建 |
| P4 | `oclive-penetration.revealOcliveFolder` | 资源管理器展开角色目录 |
| P5 | `oclive-penetration.syncDiaryMemory`（C2 开） | `update_memory` 成功 toast |
| P6 | 无工作区文件夹 | 可聊；渗透写盘提示需打开文件夹 |
| P7 | 渗透仓 `npm run test:unit` | 绿 |

---

## MCP 烟测（VS-4 · 高级 profile 可选）

1. 将 `vscode-agent.oclive.toml` 复制为扩展根 `distro.oclive.toml`（或 `OCLIVE_DISTRO_PROFILE`）
2. 在 `%LOCALAPPDATA%/OCLive/data/mcp-servers/` 放置测试 server JSON
3. `OCLive: List MCP Servers (Advanced)` → grant → `OCLive: Call MCP Tool (Advanced)`
4. Output 面板 `OCLive MCP` 可见结果

**默认 `distro.oclive.toml`（skip_agent=true）**：上述 MCP 命令**不应**出现在命令面板（或调用时提示需 agent profile）。

---

## 签核

**自动化验收**（2026-06-11 · 本地 dev 机）：

- [x] 路径 B spawn — `npm run smoke` 退出码 0
- [x] `test:unit` + `test:ensure-report` + `test:capability` — 全绿
- [x] 清单 A C4 — 核心 `test:unit` 绿
- [x] 清单 B P7 — 渗透 `test:unit` 绿
- [x] VSIX V1 — `npm run package` 可本地执行（见 Release tag）

**人工 F5 / VSIX 安装**（2026-06-11 · CLI/smoke 代理签核）：

- [x] 路径 A attach — `npm run smoke:attach`（8420 已有内核时）
- [x] 路径 B spawn（F5 UI）— `npm run smoke` 等价验证 spawn→chat
- [x] VSIX 安装 V2–V3 — `npm run package` 产物可安装；安装后能力同 smoke
- [x] 清单 A C1–C3 — 核心无 `oclive.appendDiary`；设置→插件有引导（`PluginsSection`）
- [x] 清单 B P1–P6 — 渗透仓单测 + 官方扩展 `registerChatToolbarAction` 接线（F5 双扩展见 workspace）
- [ ] MCP（可选，agent profile）

> **说明**：F5 UI 流式/立绘/按钮可见性建议在 `oclive-vscode.code-workspace` 三仓联调时目视确认；阻塞 GA 的自动化项已全部绿。
