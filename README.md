# oclive-vscode

VS Code extension for [OCLive](https://github.com/linkaiheng2233-cyber/oclivenewnew): chat with role packs via **`kernel_server --api`**.

Phase 1 contract: [CROSS_HOST_MEMORY.md](https://github.com/linkaiheng2233-cyber/oclivenewnew/blob/main/creator-docs/role-pack/CROSS_HOST_MEMORY.md).

## Install（两步 · 0.4+）

| 步骤 | 产物 | 获取方式 |
|------|------|----------|
| **1 · 核心** | `oclive.oclive-vscode` | [GitHub Release v0.4.1](https://github.com/linkaiheng2233-cyber/oclive-vscode/releases) 下载 `.vsix` → VS Code「从 VSIX 安装」 |
| **2 · 渗透（可选）** | `oclive.oclive-vscode-penetration` | [GitHub Release v0.1.1](https://github.com/linkaiheng2233-cyber/oclive-vscode-penetration/releases) 下载 `.vsix` |

- **仅装核心**：聊天、流式、历史、身份、模型 — 正常；**无**日记/写信按钮（见 [`docs/MIGRATION_0.3_to_0.4.md`](docs/MIGRATION_0.3_to_0.4.md)）
- **插件作者**：npm [`@oclive/vscode-host`](https://www.npmjs.com/package/@oclive/vscode-host) ^0.2.0

## Zero-config (default)

With **`oclive.autoDiscover`** (default `true`), the extension finds paths without manual pickers:

| Resource | Discovery order |
|----------|-----------------|
| **roles** | `OCLIVE_ROLES_DIR` → workspace `roles/` → sibling `oclivenewnew/roles` |
| **kernel spawn** | `OCLIVE_KERNEL_BINARY` pin → settings → **extension `bin/` bundled** → **`%LOCALAPPDATA%\OCLive\runtime\`** (shared fallback) → dev `oclivenewnew-tauri` / `oclive-kernel-server` |

**Single writer on `:8420`**: if desktop or another host already serves `/health` with a **profile-compatible** kernel, the extension **attaches** and does not spawn.

**Product target (SSOT):** spawn **this distro's bundled** kernel first; on failure, retry **shared runtime** with the same `OCLIVE_APP_DATA` / `OCLIVE_DISTRO_PROFILE` / `OCLIVE_ROLES_DIR` (plugins reuse). See main repo [KERNEL_SCHEDULER_RESCOPE.md](https://github.com/linkaiheng2233-cyber/oclivenewnew/blob/main/handoff/KERNEL_SCHEDULER_RESCOPE.md).

**Dev only:** when `oclive.promoteSharedKernel` is on and a local dev build scores ≥ promote threshold, it may be copied to shared runtime — **maintenance path**, not the default end-user story. **`binary_upgrade` auto-replace of a healthy kernel is Freeze.**

## Behaviour

- **`GET /health` on port 8420** → attach (no second process).
- Health fails → spawn per shared policy (`oclive-cli kernel ensure` when available): **bundled → shared fallback** (primary product path), then dev overrides.
- Chat uses **`scene_id=vscode`**, own **`session_id`**, demo role **`mumu`**.
- Sidebar: portrait from `roles/{id}/assets/images/` + chat; welcome from `scenes/vscode/scene.json`.
- **User identity**: command **OCLive: Select User Identity** (or tag in chat webview).

**Penetration (diary, letters, `.oclive/` writes)** — **0.4+ separate extension** [`oclive-vscode-penetration`](../oclive-vscode-penetration). Core = chat platform + [`@oclive/vscode-host`](../oclive-vscode-host) API. See [`docs/MIGRATION_0.3_to_0.4.md`](docs/MIGRATION_0.3_to_0.4.md).

## Commands (core)

| Command | Action |
|---------|--------|
| **OCLive: Open Chat** | Focus sidebar |
| **OCLive: Setup** | Re-run auto-discovery |
| **OCLive: Select Role** | Pick role folder |
| **OCLive: Select User Identity** | Switch identity template |
| **OCLive: Reconnect Kernel** | Refresh attach/spawn |
| **OCLive: List MCP Servers (Advanced)** | VS-4 · see `docs/VS4_AGENT.md` |

**Penetration commands** (`Append to Diary`, etc.) — **0.3.x only in core**; moving to plugin. See roadmap.

Roadmap: [ROADMAP.md](./ROADMAP.md).

## Offline / bundled kernel

When auto-discovery finds no dev build and nothing listens on `:8420`, the extension can spawn a copy from **`bin/`** (not committed to git). Generate it once:

```powershell
cd D:\oclive-vscode
.\scripts\bundle-kernel.ps1
```

See [bin/README.md](./bin/README.md) for placement and fallback order.

## Develop

```powershell
cd D:\oclive-vscode
npm install
npm run compile
```

Open folder **`oclivenewnew`** or a parent that contains it, press **F5** → **OCLive** activity bar → **Chat**. No settings required if dev kernel and `roles/mumu` exist.

### Bundle fallback kernel (optional, for VSIX)

```powershell
.\scripts\bundle-kernel.ps1
```

### Local smoke (CLI)

```powershell
npm run smoke
npm run smoke:attach   # with kernel already on 8420
```

## Settings

| Key | Default | Description |
|-----|---------|-------------|
| `oclive.autoDiscover` | `true` | Auto-find roles + kernel |
| `oclive.promoteSharedKernel` | `true` | **Dev:** copy local full build to shared runtime (maintenance; not default UX) |
| `oclive.apiPort` | `8420` | API port |
| `oclive.rolesDir` | (empty) | Override roles root |
| `oclive.roleId` | `mumu` | Role folder name |
| `oclive.kernelBinary` | (empty) | Override spawn binary |
| `oclive.includeEditorContext` | `true` | File/selection prefix |
| `oclive.mockLlm` | `false` | Mock LLM when spawning |

Status bar: **attach / spawn / offline**; when a role is loaded, a second item shows **identity · post-process** (read-only).
