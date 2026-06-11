import * as fs from 'fs';
import * as path from 'path';

export interface RolePenetrationTemplates {
  enabled?: boolean;
  diaryHeader?: string;
  diaryPath?: string;
  letterTemplate?: string;
  letterPathTemplate?: string;
  idleMessage?: string;
}

/** VS-3 optional role-pack segment (validated in oclive_validation). */
export function readPenetrationTemplates(rolePackDir: string): RolePenetrationTemplates {
  const p = path.join(rolePackDir, 'config.json');
  if (!fs.existsSync(p)) {
    return {};
  }
  try {
    const root = JSON.parse(fs.readFileSync(p, 'utf8')) as {
      penetration_templates?: Record<string, unknown>;
    };
    const section = root.penetration_templates;
    if (!section || typeof section !== 'object') {
      return {};
    }
    return {
      enabled: typeof section.enabled === 'boolean' ? section.enabled : undefined,
      diaryHeader:
        typeof section.diary_header === 'string' ? section.diary_header : undefined,
      diaryPath: typeof section.diary_path === 'string' ? section.diary_path : undefined,
      letterTemplate:
        typeof section.letter_template === 'string' ? section.letter_template : undefined,
      letterPathTemplate:
        typeof section.letter_path === 'string'
          ? section.letter_path
          : '.oclive/{roleId}/letters/{slug}.md',
      idleMessage:
        typeof section.idle_message === 'string' ? section.idle_message : undefined,
    };
  } catch {
    return {};
  }
}

/** Map role-pack templates to config merge inputs. */
export function rolePackPenetrationOverrides(
  templates: RolePenetrationTemplates,
): {
  enabled?: boolean;
  diaryPath?: string;
  idleMessage?: string;
} {
  return {
    enabled: templates.enabled,
    diaryPath: templates.diaryPath,
    idleMessage: templates.idleMessage,
  };
}
