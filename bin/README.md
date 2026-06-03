# Extension-bundled kernel (fallback)

Place **`oclive-kernel-server.exe`** here for offline / degraded spawn when:

- nothing is listening on `:8420`, and
- `%LOCALAPPDATA%\OCLive\runtime\` has no shared kernel, and
- no dev build was auto-discovered.

Generate from repo root:

```powershell
cd D:\oclive-vscode
.\scripts\bundle-kernel.ps1
```

Primary runtime on a dev machine is usually the **shared** copy promoted from the fullest local build (`oclivenewnew-tauri --api` or `oclive-kernel-server`).
