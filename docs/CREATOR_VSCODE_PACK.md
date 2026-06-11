# OCLive VS Code 扩展 · 创作者包指南

**受众**：角色包作者、高级用户  
**战略**：[`STRATEGY.md`](./STRATEGY.md) · 决策门 [`GATE_DECISIONS.md`](./GATE_DECISIONS.md)

---

## 场景与内核

| 项 | 约定 |
|----|------|
| `scene_id` | 固定 `vscode` |
| 发行版 profile | `distro.oclive.toml`（bundled）· 镜像 `oclivenewnew/examples/distro-profiles/vscode.oclive.toml` |
| Agent | 默认 `skip_agent=true`；高级见 [`VS4_AGENT.md`](./VS4_AGENT.md) |

---

## 工作区目录 `.oclive/`

```
.oclive/
  config.json          # 可选 · 工作区级渗透覆盖（最低优先级）
  {roleId}/
    diary.md           # 日记（默认路径，可模板覆盖）
    letters/
      2026-06-11-slug.md
```

### `.oclive/config.json` 示例

```json
{
  "penetration": {
    "allowed_globs": [".oclive/**"],
    "auto_diary_every_n_turns": 5
  }
}
```

合并优先级（低 → 高）：**工作区 config < 角色包 `penetration_templates` < 用户设置 `oclive.penetration.*` < distro profile 默认值**。

---

## 角色包 `config.json` → `penetration_templates`

已通过主仓 `oclive_validation` 校验（additive，旧包无此段仍合法）。

| 字段 | 说明 |
|------|------|
| `enabled` | `false` 禁用该包渗透 |
| `diary_header` | 日记段落引用行 |
| `diary_path` | 路径模板，含 `{roleId}` |
| `letter_template` | 信件正文前缀/引语 |
| `letter_path` | 可选，默认 `.oclive/{roleId}/letters/{slug}.md` |
| `idle_message` | idle 提醒 InformationMessage 文案 |

示例（见 `roles/mumu/config.json`）：

```json
"penetration_templates": {
  "enabled": true,
  "diary_header": "VS Code 工作区片段",
  "letter_template": "这是一封留在仓库里的信。",
  "idle_message": "回来聊聊？"
}
```

---

## VS Code 命令对照

| 命令 | 行为 |
|------|------|
| `oclive.appendDiary` | 最近一轮 → 日记 |
| `oclive.writeLetter` | 写信到 `letters/`（写前预览） |
| `oclive.revealOcliveFolder` | 资源管理器定位 `.oclive/{roleId}` |
| `oclive.syncDiaryMemory` | C2 · 日记摘要 → 长期记忆（需设置开启） |

Chat 侧栏工具栏提供「记入日记」「写信」「历史会话」「重连」。

---

## 白名单与 git

- 默认 `allowedGlobs`: `.oclive/**`
- 首次写盘需用户授权；扩展会提示 `.gitignore` 加入 `.oclive/`

---

## 相关

- [`F5_ACCEPTANCE.md`](./F5_ACCEPTANCE.md) · [`VS4_AGENT.md`](./VS4_AGENT.md)
- 主仓 [`ROLE_PACK_SPEC.md`](../../oclivenewnew/creator-docs/role-pack/ROLE_PACK_SPEC.md)
