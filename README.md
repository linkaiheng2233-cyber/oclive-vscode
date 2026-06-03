# oclive-vscode

VS Code extension for [OCLive](https://github.com/linkaiheng2233-cyber/oclivenewnew): chat with role packs via **`kernel_server --api`**.

Phase 1 contract: [`../oclivenewnew/creator-docs/role-pack/CROSS_HOST_MEMORY.md`](../oclivenewnew/creator-docs/role-pack/CROSS_HOST_MEMORY.md).

## Zero-config (default)

With **`oclive.autoDiscover`** (default `true`), the extension finds paths without manual pickers:

| Resource | Discovery order |
|----------|-----------------|
| **roles** | `OCLIVE_ROLES_DIR` → workspace `roles/` → sibling `oclivenewnew/roles` |
| **kernel spawn** | `OCLIVE_KERNEL_BINARY` → settings → **`%LOCALAPPDATA%\OCLive\runtime\`** (shared) → dev `oclivenewnew-tauri` / `oclive-kernel-server` → extension **`bin/`** (fallback) |

**Single writer on `:8420`**: if desktop or another host already serves `/health`, the extension **attaches** and does not spawn.

When a **full** dev/desktop binary is found and `oclive.promoteSharedKernel` is on, it is copied to the shared runtime so launcher / VS Code / desktop share one “fullest” kernel. If shared spawn fails, the extension retries the **bundled** copy under `bin/` (run `scripts/bundle-kernel.ps1` once to populate).

## Behaviour

- **`GET /health` on port 8420** → attach (no second process).
- Health fails → spawn best binary with `--api --port 8420` (primary, then bundled fallback).
- Chat uses **`scene_id=vscode`**, own **`session_id`**, demo role **`mumu`**.
- Sidebar: portrait from `roles/{id}/assets/images/` + chat; welcome from `scenes/vscode/scene.json`.

## Commands

| Command | Action |
|---------|--------|
| **OCLive: Open Chat** | Focus sidebar |
| **OCLive: Setup** | Re-run auto-discovery (or manual pick if nothing found) |
| **OCLive: Select Role** | Pick role folder under `rolesDir` |
| **OCLive: Reconnect Kernel** | Refresh attach/spawn |

Roadmap: [ROADMAP.md](./ROADMAP.md).

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
| `oclive.promoteSharedKernel` | `true` | Promote best dev build to shared runtime |
| `oclive.apiPort` | `8420` | API port |
| `oclive.rolesDir` | (empty) | Override roles root |
| `oclive.roleId` | `mumu` | Role folder name |
| `oclive.kernelBinary` | (empty) | Override spawn binary |
| `oclive.includeEditorContext` | `true` | File/selection prefix |
| `oclive.mockLlm` | `false` | Mock LLM when spawning |

Status bar: **attach / spawn / offline**.
