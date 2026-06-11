# Extension-bundled kernel (distro default spawn)

Place **`oclive-kernel-server.exe`** here as the **VS Code distro bundled kernel** — the **preferred** spawn candidate when nothing listens on `:8420`.

Generate from repo root:

```powershell
cd D:\oclive-vscode
.\scripts\bundle-kernel.ps1
```

**Spawn order (product SSOT):** bundled (`bin/`) → shared `%LOCALAPPDATA%\OCLive\runtime\` (same app_data / profile / plugins) → dev auto-discovery. See main repo `KERNEL_SCHEDULER_RESCOPE.md`.

On dev machines, **`promoteSharedKernel`** may copy a local build into shared runtime — maintenance only, not the end-user default.
