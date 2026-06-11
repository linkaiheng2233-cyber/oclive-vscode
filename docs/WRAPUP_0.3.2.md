# VS Code 0.3.2 收尾清单（提交后 · 用户测试前）

**版本**：0.3.2 · **战略**：[`STRATEGY.md`](./STRATEGY.md)

---

## 已完成（本轮提交）

- VS-1~4 代码与文档（渗透、MCP Gate、CI/Release 工作流）
- 主仓：`penetration_templates` validation、MCP HTTP、`vscode.oclive.toml` `[penetration]`
- 单元测试：`npm run test:unit` 绿
- 路线图：[`ROADMAP.md`](../ROADMAP.md) 与 CHANGELOG 对齐

---

## 请你本机测试（按顺序）

1. **主仓**：`cargo build -p oclive-cli -p oclive-kernel-server`
2. **扩展**：`cd oclive-vscode && npm run compile:all`
3. **契约**：`npm run test:unit` · `npm run test:ensure-report` · `npm run test:capability`
4. **F5 矩阵**：[`F5_ACCEPTANCE.md`](./F5_ACCEPTANCE.md) 路径 A + B + 渗透 P1–P6
5. **打包**：`npm run package` → 从 VSIX 安装再 smoke 一轮

---

## 仍 Deferred（不阻塞 0.3.2）

| 项 | 计划 |
|----|------|
| 聊天存储搜索/导出 | 0.5.x |
| Open VSX / Marketplace 上架 | tag 推送 Release 工作流验证后 |
| pack-editor 情绪图 · vscode-lite | [`WAVE5_ASSETS_ASSESSMENT.md`](./WAVE5_ASSETS_ASSESSMENT.md) |

---

## 测试反馈入口

- 连接/模型问题：记录 `kernel code` + 状态栏 attach/spawn
- 渗透问题：是否授权、路径是否在 `.oclive/**` 白名单内
- MCP：是否使用 `vscode-agent` profile + grant 是否授予
