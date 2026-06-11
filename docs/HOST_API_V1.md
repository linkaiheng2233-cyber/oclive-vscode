# OCLive VS Code 宿主 API v1

**npm SSOT**：[`@oclive/vscode-host`](../../oclive-vscode-host/README.md) · `HOST_API_VERSION = 1`

---

## 获取 API

```typescript
import { HOST_API_VERSION, resolveOcliveHost } from '@oclive/vscode-host';

const host = resolveOcliveHost();
if (!host || host.apiVersion !== HOST_API_VERSION) {
  // 提示用户安装/升级核心扩展
}
```

核心扩展 `activate()` **return** `OcliveHostApi` 实现体（`OcliveHostApiImpl`）。

---

## 事件

| 事件 | 载荷 | 时机 |
|------|------|------|
| `onChatTurnCompleted` | `{ roleId, sessionId, userText, reply, roleName }` | 成功聊天回合（流式/非流式）后 |
| `onKernelReady` | `{ mode, apiPort }` | 内核 attach/spawn 就绪后 |

---

## 快照

| 方法 | 返回 |
|------|------|
| `getEditorContext()` | `{ relativePath?, languageId?, hasSelection, chipLabel }` |
| `getRolePackPath()` | 有效角色包绝对路径或 `undefined` |
| `getRecentTurn()` | `{ userText, assistantText }` 或 `undefined` |

---

## 写盘

`requestWorkspaceWrite({ absolutePath, content, mode, relativePosix, allowedGlobs })`

- 首次写入弹 modal 授权
- 路径须在工作区内且匹配 `allowedGlobs`
- 可选 `.gitignore` 提示（`.oclive/`）

---

## 内核

`getKernelClient().bridgeDispatch(command, params)` — 薄封装 `POST /bridge/dispatch`（如 C2 `update_memory`）。

---

## Chat 工具栏插槽

```typescript
host.registerChatToolbarAction({
  id: 'diary',
  label: '记入日记',
  command: 'oclive-penetration.appendDiary',
  icon: '📓',
  title: '将最近一轮对话记入工作区日记',
});
```

Webview 渲染 `{#each toolbarActions}`；点击执行 `vscode.commands.executeCommand(action.command)`。

---

## 相关

- [`PENETRATION_PLUGIN_AUTHOR.md`](./PENETRATION_PLUGIN_AUTHOR.md)
- [`MIGRATION_0.3_to_0.4.md`](./MIGRATION_0.3_to_0.4.md)
