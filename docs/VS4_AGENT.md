# VS-4 · 可选 Agent 与 MCP（高级用户）

**状态**：文档 + 最小胶水（0.3.1）· **非默认路径**  
**战略**：见 [`STRATEGY.md`](./STRATEGY.md) §3 — 渗透（VS-2/VS-3）与 Agent 槽正交。

---

## 默认 vs 高级

| 路径 | `skip_agent` | 适用 |
|------|--------------|------|
| **默认** `distro.oclive.toml` | `true` | 聊天 + 宿主导编排渗透（日记、`.oclive/`） |
| **高级** `vscode-agent.oclive.toml` | `false` | 愿意承担 MCP / 多步工具风险的用户 |

解冻 Agent **不替代** VS-2「记入日记」按钮；两者可并存。

---

## Profile 切换

1. 复制主仓示例  
   `oclivenewnew/examples/distro-profiles/vscode-agent.oclive.toml`
2. 设为扩展根目录 `distro.oclive.toml`，或 spawn 时设  
   `OCLIVE_DISTRO_PROFILE=<绝对路径>`
3. **重启内核**（spawn 或 `OCLive: Reconnect Kernel` force）

`vscode-agent.oclive.toml` 要点：

- `skip_agent = false`
- `plugin_backends.agent` 按需设为 `builtin` / `remote` / `directory`
- 仍建议 `allow_mode_switch = false`（VS Code 不承载 immersive）

---

## MCP 配置

与桌面同源：`%LOCALAPPDATA%/OCLive/data/mcp-servers/*.json`（`OCLIVE_APP_DATA`）。

扩展命令：

- **`OCLive: List MCP Servers (Advanced)`** — 列出配置 + 经 HTTP `/high_risk/grant` 授权  
  - `transport=http` → `network:*`  
  - `transport=stdio` → `process:spawn`

完整 `call_mcp_tool` 环仍依赖内核 Agent 槽；VS Code 侧在 **agent profile** 下提供 QuickPick + Output（`GET/POST /mcp/*`，见主仓 [`VSCODE_MCP_HTTP_GATE.md`](../../oclivenewnew/handoff/VSCODE_MCP_HTTP_GATE.md)）。

---

## 风险与审计

- 未授权不得调用 stdio/http MCP（对齐主仓 `HIGH_RISK_CAPABILITY_NOT_GRANTED`）
- 渗透写盘与 Agent 改文件分离：默认渗透仅 `.oclive/**` 白名单
- 不建议在含敏感凭据的 monorepo 默认开启 `skip_agent=false`

---

## 相关

- 主仓 [`AGENT_REMOTE_PROTOCOL.md`](../../oclivenewnew/creator-docs/plugin-and-architecture/AGENT_REMOTE_PROTOCOL.md)
- [`GATE_DECISIONS.md`](./GATE_DECISIONS.md) · [`ROADMAP.md`](../ROADMAP.md) VS-4
