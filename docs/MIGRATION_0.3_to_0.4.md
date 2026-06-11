# 从 0.3.x 迁移到 0.4.0（Breaking）

**适用**：`oclive.oclive-vscode` 核心扩展 0.4.0+

## Release 下载

| 产物 | 版本 | 链接 |
|------|------|------|
| 核心 VSIX | 0.4.1+ | [oclive-vscode Releases](https://github.com/linkaiheng2233-cyber/oclive-vscode/releases) |
| 官方渗透 VSIX | 0.1.1+ | [oclive-vscode-penetration Releases](https://github.com/linkaiheng2233-cyber/oclive-vscode-penetration/releases) |
| 宿主 API npm | 0.2.0+ | [@oclive/vscode-host](https://www.npmjs.com/package/@oclive/vscode-host) |

---

## 概要

0.4.0 将 **日记、写信、idle/终端、`.oclive/` 写盘** 移出核心，改为可选渗透插件 **`oclive.oclive-vscode-penetration`**。

| 变化 | 0.3.x | 0.4.0+ |
|------|-------|--------|
| 日记/信按钮 | 核心 Chat 顶栏硬编码 | 渗透插件 `registerChatToolbarAction` |
| 命令 ID | `oclive.appendDiary` 等 | `oclive-penetration.*`（**无 shim**） |
| 设置键 | `oclive.penetration.*` | `oclive-penetration.*`（渗透插件内） |
| 核心设置页 | 「渗透」分区 | 「插件」分区 + 安装引导 |

---

## 升级步骤

1. 升级核心扩展到 **0.4.0**（`oclive.oclive-vscode`）
2. 安装官方渗透插件 **`oclive.oclive-vscode-penetration`**（Open VSX 或 `.vsix`）
3. 若曾自定义 keybinding / tasks，将命令前缀改为 `oclive-penetration.*`

---

## 命令迁移表（无 shim）

| 0.3.x（已删除） | 0.4+（渗透插件） |
|-----------------|------------------|
| `oclive.appendDiary` | `oclive-penetration.appendDiary` |
| `oclive.writeLetter` | `oclive-penetration.writeLetter` |
| `oclive.revealOcliveFolder` | `oclive-penetration.revealOcliveFolder` |
| `oclive.syncDiaryMemory` | `oclive-penetration.syncDiaryMemory` |

---

## 仅装核心时的行为

- 聊天、流式、历史、身份、模型：**正常**
- Chat 顶栏：**无** 日记/写信按钮
- 命令面板：**无** 渗透相关命令
- 设置：**无** `oclive.penetration.*` 项；见「插件」分区说明

---

## 第三方渗透插件

见 [`PENETRATION_PLUGIN_AUTHOR.md`](./PENETRATION_PLUGIN_AUTHOR.md) 与 npm 包 **`@oclive/vscode-host`**。

---

## 相关文档

- [`PENETRATION_PLUGIN_MODEL.md`](./PENETRATION_PLUGIN_MODEL.md)
- [`GATE_DECISIONS.md`](./GATE_DECISIONS.md)（D1–D4）
- [`HOST_API_V1.md`](./HOST_API_V1.md)
