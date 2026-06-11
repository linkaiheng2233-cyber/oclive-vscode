# OCLive VS Code 渗透插件 · 作者指南

**npm 契约**：[`@oclive/vscode-host`](../../oclive-vscode-host/README.md) · **宿主 API**：[`HOST_API_V1.md`](./HOST_API_V1.md)

---

## 快速开始

1. 新建 VS Code 扩展，`package.json` 声明：
   - `"extensionDependencies": ["oclive.oclive-vscode"]`
   - `"dependencies": { "@oclive/vscode-host": "^0.1.0" }`
2. `activate` 中 `resolveOcliveHost()`，校验 `apiVersion === HOST_API_VERSION`
3. 订阅 `onChatTurnCompleted` 或注册 `registerChatToolbarAction`

本地联调：`"@oclive/vscode-host": "file:../oclive-vscode-host"` + multi-root workspace。

**npm 安装**（host 已发布至 [npmjs.org](https://www.npmjs.com/package/@oclive/vscode-host)）：

```bash
npm install @oclive/vscode-host@^0.1.0
```

| npm `@oclive/vscode-host` | 核心扩展 | 官方渗透 |
|---------------------------|----------|----------|
| `^0.1.0` | `oclive-vscode` ^0.4.0 | `oclive-vscode-penetration` ^0.1.0 |

GitHub 源码：[oclive-vscode-host](https://github.com/linkaiheng2233-cyber/oclive-vscode-host) · [oclive-vscode](https://github.com/linkaiheng2233-cyber/oclive-vscode) · [oclive-vscode-penetration](https://github.com/linkaiheng2233-cyber/oclive-vscode-penetration)

**不要**直接 `fs.writeFile` 到工作区。使用：

```typescript
await host.requestWorkspaceWrite({
  absolutePath: path.join(workspaceRoot, '.oclive/notes/whisper.md'),
  content: '# whisper\n',
  mode: 'append',
  relativePosix: '.oclive/notes/whisper.md',
  allowedGlobs: ['.oclive/**'],
});
```

首次写入会弹 modal 授权；核心统一处理 `.gitignore` 提示。

---

## Chat 工具栏

```typescript
host.registerChatToolbarAction({
  id: 'my-action',
  label: '记一笔',
  command: 'my-ext.whisper',
  icon: '✎',
});
```

命令须在扩展 `contributes.commands` 中注册；点击由核心 `executeCommand` 转发。

---

## 角色包 `penetration_templates`

- Schema 仍由主仓 `oclive_validation` 校验
- 插件通过 `host.getRolePackPath()` 读 `config.json` → `penetration_templates`
- 官方渗透插件参考：`oclive-vscode-penetration/src/penetration/rolePackPenetration.ts`

---

## 记忆 C2（可选）

```typescript
await host.getKernelClient().bridgeDispatch('update_memory', {
  role_id: roleId,
  content: summary,
  importance: 0.6,
});
```

须用户显式触发；**不**自动把日记写入 `long_term_memory`（见 GATE C1）。

---

## 版本对齐

| npm `@oclive/vscode-host` | `HOST_API_VERSION` | 核心扩展 |
|---------------------------|-------------------|----------|
| 0.1.x | 1 | ^0.4.0 |

Breaking → npm major + 文档 + 核心/官方插件同步 bump。

---

## 从样例 fork

1. 复制 [`oclive-vscode-host/examples/minimal-penetration/`](../../oclive-vscode-host/examples/minimal-penetration/) 到新目录
2. 修改 `package.json` 的 `name` / `publisher` / 命令前缀（**勿**使用 `oclive-penetration.*`，该前缀保留给官方插件）
3. `npm install @oclive/vscode-host@^0.2.0`
4. 打开 [`oclive-vscode.code-workspace`](../oclive-vscode.code-workspace) 三仓工作区，F5 本扩展 + 核心
5. 聊一轮 → 确认 `notes/whisper.md`（或你自定义路径）已追加

本地联调可将依赖改为 `"file:../oclive-vscode-host"`；发版前改回 registry。

## 样例

最小第三方扩展见 [`oclive-vscode-host/examples/minimal-penetration/README.md`](../../oclive-vscode-host/examples/minimal-penetration/README.md)。
