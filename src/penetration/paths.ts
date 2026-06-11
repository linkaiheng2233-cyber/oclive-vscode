import * as path from 'path';

const ROLE_ID_PLACEHOLDER = '{roleId}';

/** Resolve diary path template relative to workspace root. Rejects `..` segments. */
export function resolveDiaryPath(
  workspaceRoot: string,
  roleId: string,
  template: string,
): string {
  const rel = template
    .replaceAll(ROLE_ID_PLACEHOLDER, sanitizeRoleId(roleId))
    .replace(/\\/g, '/');
  if (rel.includes('..') || path.isAbsolute(rel)) {
    throw new Error(`非法渗透路径模板：${template}`);
  }
  return path.join(workspaceRoot, rel);
}

export function resolvePenetrationDir(workspaceRoot: string, roleId: string): string {
  return path.join(workspaceRoot, '.oclive', sanitizeRoleId(roleId));
}

export function sanitizeRoleId(roleId: string): string {
  const trimmed = roleId.trim();
  if (!trimmed || trimmed.includes('..') || /[<>:"|?*]/.test(trimmed)) {
    throw new Error(`非法角色 id：${roleId}`);
  }
  return trimmed;
}

/** Simple glob check: patterns like `.oclive/**` against a workspace-relative posix path. */
export function pathMatchesAllowedGlobs(relativePosix: string, globs: string[]): boolean {
  const norm = relativePosix.replace(/\\/g, '/');
  for (const g of globs) {
    const pattern = g.replace(/\\/g, '/').trim();
    if (!pattern) {
      continue;
    }
    if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -3);
      if (norm === prefix || norm.startsWith(`${prefix}/`)) {
        return true;
      }
    } else if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2);
      if (norm.startsWith(`${prefix}/`) && !norm.slice(prefix.length + 1).includes('/')) {
        return true;
      }
    } else if (norm === pattern) {
      return true;
    }
  }
  return false;
}

export function relativePosixFromWorkspace(workspaceRoot: string, absolutePath: string): string {
  return path.relative(workspaceRoot, absolutePath).replace(/\\/g, '/');
}
