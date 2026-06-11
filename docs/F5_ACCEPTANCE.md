# F5 / VSIX 实机验收矩阵（V-VSCODE-PERF-05）

**版本**：0.3.2 · **场景**：`scene_id = vscode` · **默认角色**：`mumu`

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
| V1 | 产物 `oclive-vscode-0.3.2.vsix` 存在 | `vsce package` 成功 |
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

## 渗透烟测（VS-2 / 0.3.2）

| # | 步骤 | 期望 |
|---|------|------|
| P1 | Chat「记入日记」 | 首次弹授权；`.oclive/mumu/diary.md` 追加 |
| P2 | 拒绝授权 | 不写盘 |
| P3 | `OCLive: Write Letter` 或 Chat「写一封信」 | `.oclive/mumu/letters/*.md` 创建 |
| P4 | `OCLive: Reveal .oclive Folder` | 资源管理器展开角色目录 |
| P5 | 设置 → 渗透 → 提交记忆（C2 开） | `update_memory` 成功 toast |
| P6 | 无工作区文件夹时开 Chat | 可聊；渗透按钮提示需打开文件夹 |

---

## MCP 烟测（VS-4 · 高级 profile 可选）

1. 将 `vscode-agent.oclive.toml` 复制为扩展根 `distro.oclive.toml`（或 `OCLIVE_DISTRO_PROFILE`）
2. 在 `%LOCALAPPDATA%/OCLive/data/mcp-servers/` 放置测试 server JSON
3. `OCLive: List MCP Servers (Advanced)` → grant → `OCLive: Call MCP Tool (Advanced)`
4. Output 面板 `OCLive MCP` 可见结果

**默认 `distro.oclive.toml`（skip_agent=true）**：上述 MCP 命令**不应**出现在命令面板（或调用时提示需 agent profile）。

---

## 签核

- [ ] 路径 A attach
- [ ] 路径 B spawn
- [ ] VSIX 安装
- [ ] `test:unit` + `test:ensure-report` + `test:capability`
- [ ] 渗透 P1–P6
- [ ] MCP（可选，agent profile）
