import * as fs from 'fs';
import * as path from 'path';
import { emotionImageCandidates } from './emotionAssets';

export function readRoleDisplayName(rolePackDir: string): string {
  const bp = path.join(rolePackDir, 'pipeline.ocblueprint');
  const manifest = path.join(rolePackDir, 'manifest.json');
  try {
    if (fs.existsSync(bp)) {
      const j = JSON.parse(fs.readFileSync(bp, 'utf8')) as { meta?: { name?: string; id?: string } };
      const name = j.meta?.name?.trim();
      if (name) {
        return name;
      }
      const id = j.meta?.id?.trim();
      if (id) {
        return id;
      }
    }
    if (fs.existsSync(manifest)) {
      const j = JSON.parse(fs.readFileSync(manifest, 'utf8')) as { name?: string; id?: string };
      if (j.name?.trim()) {
        return j.name.trim();
      }
      if (j.id?.trim()) {
        return j.id.trim();
      }
    }
  } catch {
    /* ignore */
  }
  return path.basename(rolePackDir);
}

export function readSceneWelcome(rolePackDir: string, sceneId: string): string | undefined {
  const p = path.join(rolePackDir, 'scenes', sceneId, 'scene.json');
  if (!fs.existsSync(p)) {
    return undefined;
  }
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8')) as { welcome_message?: string };
    const w = j.welcome_message?.trim();
    return w || undefined;
  } catch {
    return undefined;
  }
}

export interface RoleOption {
  id: string;
  name: string;
}

export interface MetaActionTemplateEntry {
  enabled: boolean;
  attitudeText: string;
}

export interface MetaActionTemplates {
  undo: MetaActionTemplateEntry;
  regenerate: MetaActionTemplateEntry;
  edit: MetaActionTemplateEntry;
  delete: MetaActionTemplateEntry;
}

const DEFAULT_META_TEMPLATES: MetaActionTemplates = {
  undo: { enabled: true, attitudeText: '（用户撤回了上一轮对话。）' },
  regenerate: { enabled: true, attitudeText: '（用户希望重新生成上一轮回复。）' },
  edit: { enabled: true, attitudeText: '（用户修改了先前发送的内容。）' },
  delete: { enabled: true, attitudeText: '（用户删除了一条聊天记录。）' },
};

function parseMetaEntry(raw: unknown): MetaActionTemplateEntry {
  if (!raw || typeof raw !== 'object') {
    return { enabled: false, attitudeText: '' };
  }
  const o = raw as { enabled?: boolean; attitude_text?: string };
  return {
    enabled: o.enabled !== false,
    attitudeText: typeof o.attitude_text === 'string' ? o.attitude_text : '',
  };
}

/** Read `config.json` → `meta_action_templates` with built-in defaults. */
export function readMetaActionTemplates(rolePackDir: string): MetaActionTemplates {
  const p = path.join(rolePackDir, 'config.json');
  if (!fs.existsSync(p)) {
    return { ...DEFAULT_META_TEMPLATES };
  }
  try {
    const root = JSON.parse(fs.readFileSync(p, 'utf8')) as {
      meta_action_templates?: Record<string, unknown>;
    };
    const section = root.meta_action_templates;
    if (!section || typeof section !== 'object') {
      return { ...DEFAULT_META_TEMPLATES };
    }
    return {
      undo: section.undo
        ? parseMetaEntry(section.undo)
        : { ...DEFAULT_META_TEMPLATES.undo },
      regenerate: section.regenerate
        ? parseMetaEntry(section.regenerate)
        : { ...DEFAULT_META_TEMPLATES.regenerate },
      edit: section.edit ? parseMetaEntry(section.edit) : { ...DEFAULT_META_TEMPLATES.edit },
      delete: section.delete
        ? parseMetaEntry(section.delete)
        : { ...DEFAULT_META_TEMPLATES.delete },
    };
  } catch {
    return { ...DEFAULT_META_TEMPLATES };
  }
}

/** Role folders with display names (allowlist-filtered). */
export function listRoleOptions(rolesDir: string, allowlist?: string[]): RoleOption[] {
  return listRoleIds(rolesDir, allowlist).map((id) => ({
    id,
    name: readRoleDisplayName(path.join(rolesDir, id)),
  }));
}

/** Role pack folders under roles root that contain v2 blueprint or legacy manifest. */
export function listRoleIds(rolesDir: string, allowlist?: string[]): string[] {
  if (!fs.existsSync(rolesDir)) {
    return [];
  }
  const allowed =
    allowlist?.map((s) => s.trim()).filter((s) => s.length > 0) ?? [];
  const out: string[] = [];
  for (const name of fs.readdirSync(rolesDir)) {
    const dir = path.join(rolesDir, name);
    if (!fs.statSync(dir).isDirectory()) {
      continue;
    }
    if (
      fs.existsSync(path.join(dir, 'pipeline.ocblueprint')) ||
      fs.existsSync(path.join(dir, 'manifest.json'))
    ) {
      if (allowed.length > 0 && !allowed.includes(name)) {
        continue;
      }
      out.push(name);
    }
  }
  return out.sort();
}

/** First existing file under `assets/images/`, or undefined. */
export function resolveEmotionImagePath(rolePackDir: string, emotion: string): string | undefined {
  const dir = path.join(rolePackDir, 'assets', 'images');
  if (!fs.existsSync(dir)) {
    return undefined;
  }
  for (const file of emotionImageCandidates(emotion)) {
    const full = path.join(dir, file);
    if (fs.existsSync(full)) {
      return full;
    }
  }
  return undefined;
}
