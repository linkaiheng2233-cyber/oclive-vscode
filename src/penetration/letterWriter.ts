import * as path from 'path';
import { sanitizeRoleId, pathMatchesAllowedGlobs, relativePosixFromWorkspace } from './paths';

const ROLE_ID_PLACEHOLDER = '{roleId}';

export interface LetterDraft {
  slug: string;
  body: string;
  roleName?: string;
  template?: string;
}

export function resolveLetterPath(
  workspaceRoot: string,
  roleId: string,
  slug: string,
  template = '.oclive/{roleId}/letters/{slug}.md',
): string {
  const safeSlug = slug
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  if (!safeSlug) {
    throw new Error('信件 slug 无效');
  }
  const isoDate = new Date().toISOString().slice(0, 10);
  const rel = template
    .replaceAll(ROLE_ID_PLACEHOLDER, sanitizeRoleId(roleId))
    .replaceAll('{slug}', `${isoDate}-${safeSlug}`)
    .replace(/\\/g, '/');
  if (rel.includes('..') || path.isAbsolute(rel)) {
    throw new Error(`非法信件路径模板：${template}`);
  }
  return path.join(workspaceRoot, rel);
}

export function formatLetterMarkdown(draft: LetterDraft): string {
  const role = draft.roleName?.trim() || '角色';
  const header = draft.template?.trim();
  const lines = [
    `# 信 · ${role}`,
    '',
    header ? `> ${header}` : undefined,
    header ? '' : undefined,
    draft.body.trim(),
    '',
  ].filter((l): l is string => l !== undefined);
  return lines.join('\n');
}

export function assertLetterPathAllowed(
  workspaceRoot: string,
  absolutePath: string,
  allowedGlobs: string[],
): string {
  const rel = relativePosixFromWorkspace(workspaceRoot, absolutePath);
  if (!pathMatchesAllowedGlobs(rel, allowedGlobs)) {
    throw new Error(`路径不在白名单内：${rel}`);
  }
  return rel;
}
