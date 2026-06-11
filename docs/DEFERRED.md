# OCLive VS Code · 长期 Deferred（Wave 5）

**基线**：0.4.x GA 之后不纳入 semver 承诺；立项前见 [`ROADMAP.md`](../ROADMAP.md)。

---

## 分发渠道

| 项 | 说明 | 状态 |
|----|------|------|
| **VS Marketplace 正式上架** | 审核与 Open VSX 流程分离；需 publisher 与品牌材料 | Deferred |
| **Open VSX 核心 + 渗透分列** | GA 阶段以 GitHub Release `.vsix` 为主；Open VSX 账号就绪后可补 | Deferred |

## 架构与生态

| 项 | 说明 | 状态 |
|----|------|------|
| **目录插件 RPC 渗透** | 与桌面 `directory-plugin-minimal` 对齐；可替代或补充 VS Code 扩展插件 | Deferred |
| **插件市场站索引渗透扩展** | `oclive-plugin-market` 产品化阶段再接入 | Deferred |
| **核心 0.5 删过渡文档** | 内置渗透已在 0.4 移除；ROADMAP「删 penetration/」改为 **Cancelled** | Deferred |

## 产品

| 项 | 说明 | 状态 |
|----|------|------|
| **Agent 默认 profile MCP 入口** | 仍仅 `vscode-agent.oclive.toml`；默认 `skip_agent=true` | Deferred |
| **跨宿主 e2e VS Code diary smoke** | 主仓 `e2e-cross-host-memory` 增 `.oclive/diary.md` 路径；待 CI 稳定 | Deferred |

---

**决策门**：Open VSX / Marketplace 上架需单独立项与负责人；见 [`GATE_DECISIONS.md`](./GATE_DECISIONS.md)。
