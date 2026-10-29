# OCLive for VS Code

**在 VS Code 中运行角色聊天，把日记、来信等伴随功能交给可选插件。**

A role-chat Host for [A.I.Live / OCLive](https://github.com/linkaiheng2233-cyber/oclivenewnew), with a separate Host API for companion plugins.

## 安装与版本

1. 从[公开发布 v0.4.0](https://github.com/linkaiheng2233-cyber/oclive-vscode/releases/tag/v0.4.0)获取核心扩展 `.vsix`，在 VS Code 的扩展菜单中选择“从 VSIX 安装”。
2. 按[发行版说明](docs/VSCODE_DISTRIBUTION.md)准备可用的角色包、兼容运行时和模型后端。
3. 打开 **OCLive: Open Chat**；需要时使用 Setup、Select Role 和 Select User Identity。

默认分支源码版本为 **0.4.1**，现有公开 VSIX 为 **0.4.0**。源码版本与已经上传的安装包分别核对，不能按 README 中的源码号推断存在同名 Release。

## 核心与可选插件

核心扩展 `oclive.oclive-vscode` 负责聊天、历史、身份选择与 Host API。日记／来信等工作区伴随功能在独立的 [oclive-vscode-penetration](https://github.com/linkaiheng2233-cyber/oclive-vscode-penetration) 中维护，按需要安装；迁移说明见 [0.3 → 0.4](docs/MIGRATION_0.3_to_0.4.md)。

扩展通过兼容的本地参考运行时工作。发现路径、attach / spawn 与共享运行时回退的具体规则见[发行版文档](docs/VSCODE_DISTRIBUTION.md)及 [bin/README.md](bin/README.md)。配置成功不等于本机已经具备可用模型或运行时二进制。

## 从源码开发

本仓依赖 [oclive-vscode-host](https://github.com/linkaiheng2233-cyber/oclive-vscode-host) 的同级源码目录。先按该仓说明构建契约包，再在本仓执行：

```bash
npm ci
npm run compile:all
npm run test:unit
npm run package
```

`package` 会构建并生成 VSIX。运行时二进制的准备方式在 [bin/README.md](bin/README.md)，不由纯 TypeScript 编译代替。

## 给插件作者

- [Host API 文档](docs/HOST_API_V1.md)
- [源码契约包](https://github.com/linkaiheng2233-cyber/oclive-vscode-host)：当前按 `file:` 依赖使用，npm 发布另行安排。
- [官方伴随插件](https://github.com/linkaiheng2233-cyber/oclive-vscode-penetration)：日记、来信和闲时表达的消费示例。

可选插件扩展 Host 的能力，不改变 OCLive 六槽或参考运行时编排。

## 文档与反馈

[路线图](ROADMAP.md) · [发行版说明](docs/VSCODE_DISTRIBUTION.md) · [Issue](https://github.com/linkaiheng2233-cyber/oclive-vscode/issues)

跨宿主连续性以主仓[现行说明](https://github.com/linkaiheng2233-cyber/oclivenewnew/blob/main/creator-docs/role-pack/CROSS_HOST_MEMORY.md)为准。源码包的许可声明见 [package.json](package.json)。


<!-- Preserve previously published section bookmarks. -->
<a id="oclive-vscode"></a>
<a id="install两步--04"></a>
<a id="zero-config-default"></a>
<a id="behaviour"></a>
<a id="commands-core"></a>
<a id="offline--bundled-kernel"></a>
<a id="develop"></a>
<a id="bundle-fallback-kernel-optional-for-vsix"></a>
<a id="local-smoke-cli"></a>
<a id="settings"></a>

旧版章节书签保留在此。[整理前的首页](https://github.com/linkaiheng2233-cyber/oclive-vscode/blob/0eed3e4250f484e47831ac050d249c011f9b4818/README.md)可用于查阅历史说明；现行入口以本页与所链文档为准。
